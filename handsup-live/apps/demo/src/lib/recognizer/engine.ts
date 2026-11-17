/**
 * The recognizer behind the demo page: camera, uploaded clip or demo clip -> MediaPipe Holistic (on device)
 * -> fc10 streaming model (on device) -> German glosses + rough English words, grouped into caption lines.
 *
 * The wiring follows apps/web/src/live/main.ts (the live.handsupai.com page). The one new input is an
 * uploaded video: the file plays in a hidden <video>, and its captureStream() is handed to the same
 * MediaPipe source that normally gets the camera stream (via the source's getUserMedia injection point).
 *
 * Privacy: video never leaves the device. Only same-origin requests are allowed (network guard + CSP).
 * The seam for a future hosted recognition API is the `Recognizer` surface of this class (see recognizer.ts).
 */
import { sha256Hex, type EngineError, type LandmarkFrame } from "@handsup/sign-engine";
import { createHolisticWebSource, type HolisticWebSource } from "@handsup/sign-engine/sources/mediapipe-holistic-web";
import { Fc10Stream, FC10, makeLabeler, rawFromHuFrame, type GlossLabel } from "@handsup/fc10-runtime";
import { createOrtRunner, type OrtRunner } from "@handsup/fc10-runtime/ort";
// Emitted once by Vite as a hashed same-origin asset; its SHA-256 is checked at build time (assets:sync).
import ortWasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
import mpAssets from "../../../../web/mediapipe-assets.json";
import liveAssets from "../../../../web/live-assets.json";
import { cameraErrorHelp, cameraProblem } from "../shared/camera-support";
import { huFrameFromRaw, parseDemoClips, type DemoClip, type DemoClipFile } from "../shared/demo";
import { bindCameraLifecycle } from "../shared/lifecycle";
import { drawSkeleton } from "../shared/overlay";
import { installNetworkGuard } from "../shared/privacy";

export type Mode = "idle" | "camera" | "demo" | "upload";
export type Phase = "loading" | "ready" | "error";
export type StatusKind = "info" | "ok" | "warn" | "error";

export interface CaptionLine {
  id: number;
  de: string;
  en: string;
  final: boolean;
}

/** Immutable view of the engine, for React's useSyncExternalStore. */
export interface Snapshot {
  readonly phase: Phase;
  readonly statusText: string;
  readonly statusKind: StatusKind;
  readonly progress: number;
  readonly mode: Mode;
  readonly lines: CaptionLine[];
  readonly showSkeleton: boolean;
}

interface Line {
  id: number;
  glosses: GlossLabel[];
  final: boolean;
}

const BIG_BYTES = 13_683_609 + 23_594_959; // holistic_landmarker.task + fc10_step.onnx
const PAUSE_MS = 1500; // a pause without hands ends the caption line and resets the model
const MAX_LINES = 6;
const FILES = liveAssets.fc10.files;
const DEMO_W = 420;
const DEMO_H = 520; // PHOENIX frames are 210 x 260

type CapturableVideo = HTMLVideoElement & { captureStream?: () => MediaStream };

/** Where the signer is in an uploaded video. A crop is drawn to a canvas before the tracker so the signer is large. */
export type Crop = "whole" | "left" | "right" | "bottom-left" | "bottom-right";
// [x, y, width, height] as fractions of the frame.
const CROPS: Record<Crop, [number, number, number, number]> = {
  whole: [0, 0, 1, 1],
  left: [0, 0, 0.5, 1],
  right: [0.5, 0, 0.5, 1],
  "bottom-left": [0, 0.4, 0.45, 0.6],
  "bottom-right": [0.55, 0.4, 0.45, 0.6],
};
const CROP_HEIGHT = 480; // the cropped region is scaled to this height

function cropStream(video: HTMLVideoElement, crop: Crop): { stream: MediaStream; stop: () => void } {
  const [fx, fy, fw, fh] = CROPS[crop];
  const sx = fx * video.videoWidth;
  const sy = fy * video.videoHeight;
  const sw = fw * video.videoWidth;
  const sh = fh * video.videoHeight;
  const canvas = document.createElement("canvas");
  canvas.height = CROP_HEIGHT;
  canvas.width = Math.max(2, Math.round((CROP_HEIGHT * sw) / sh));
  const ctx = canvas.getContext("2d")!;
  const draw = () => ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  draw();
  const timer = window.setInterval(draw, 40); // not requestAnimationFrame: it stops in background tabs
  const stream = canvas.captureStream(25);
  return { stream, stop: () => { clearInterval(timer); stream.getTracks().forEach((t) => t.stop()); } };
}

export function canUploadClips(): boolean {
  return typeof (HTMLVideoElement.prototype as CapturableVideo).captureStream === "function";
}

function hasWasmSimd(): boolean {
  try {
    return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
  } catch {
    return false;
  }
}

export class RecognizerEngine {
  private snap: Snapshot = {
    phase: "loading",
    statusText: "Loading the models…",
    statusKind: "info",
    progress: 0,
    mode: "idle",
    lines: [],
    showSkeleton: true,
  };
  private readonly listeners = new Set<() => void>();
  private readonly finalListeners = new Set<(line: CaptionLine) => void>();
  /** Raw landmark frames (camera/upload), for other recognisers such as the pharmacy guided mode. */
  private readonly landmarkListeners = new Set<(frame: LandmarkFrame) => void>();
  /** When false, fc10 (weather vocabulary) gets no frames and produces no lines (pharmacy mode). */
  private fc10Enabled = true;

  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly guard = installNetworkGuard(window);
  private unbindLifecycle: (() => void) | null = null;

  private source: HolisticWebSource;
  private delegatePref: "GPU" | "CPU" = new URLSearchParams(location.search).get("delegate") === "CPU" ? "CPU" : "GPU";
  private mediaProvider: (c: MediaStreamConstraints) => Promise<MediaStream> = (c) => navigator.mediaDevices.getUserMedia(c);
  private facing: "user" | "environment" = "user";

  private runner: OrtRunner | null = null;
  private stream: Fc10Stream | null = null;
  private label: (id: number) => GlossLabel = (id) => ({ id, gloss: String(id), english: null, hidden: false });
  private loadedBytes = 0;
  private modelReady!: Promise<void>;
  private mpReady!: Promise<void>;

  private lines: Line[] = [{ id: 1, glosses: [], final: false }];
  private lineSeq = 1;
  private runGlosses = 0; // words recognised since the current run started

  private handsAbsentSince: number | null = null;
  private segmented = false;
  private demoClips: DemoClip[] | null = null;
  private demoIndex = 0;
  private demoTimer: number | null = null;
  private demoRun = 0;
  private fileVideo: HTMLVideoElement | null = null;
  private cropStop: (() => void) | null = null;
  private fileUrl: string | null = null;
  private disposed = false;

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly canvas: HTMLCanvasElement,
  ) {
    this.ctx = canvas.getContext("2d");
    for (const el of [video, canvas]) {
      el.style.objectFit = "contain";
      el.style.width = "100%";
      el.style.height = "100%";
    }
    this.guard.onBlocked((r) => console.warn(`Hands Up blocked an outbound ${r.api} request to ${r.url}`));
    this.source = this.makeSource(this.delegatePref);
    this.unbindLifecycle = bindCameraLifecycle({ document, window }, () => {
      if (this.snap.mode !== "idle") {
        this.stop();
        this.setStatus("Stopped because the page was hidden. Press a button to go on.", "warn");
      }
    });
    if (!hasWasmSimd()) {
      this.fail("This browser is too old for the sign model (it needs WebAssembly SIMD: iPhone with iOS 16.4 or newer, or a current Chrome, Firefox or Edge). Please update the browser.");
      this.modelReady = Promise.reject(new Error("no wasm simd"));
      this.mpReady = this.modelReady;
      this.modelReady.catch(() => {});
      return;
    }
    // Load both independently: the demo needs only the sign model, the camera and uploads need both.
    this.modelReady = this.loadModel();
    this.mpReady = this.source.load();
    void Promise.allSettled([this.modelReady, this.mpReady]).then(([model, mp]) => {
      if (this.disposed) return;
      if (model.status === "fulfilled" && mp.status === "fulfilled") {
        this.update({ phase: "ready", progress: 1 });
        if (this.snap.mode === "idle") this.setStatus("Ready. Start the camera, upload a clip, or play an example.", "ok");
      } else {
        const err = (mp.status === "rejected" ? mp.reason : (model as PromiseRejectedResult).reason) as Error;
        this.fail(`Could not load ${mp.status === "rejected" ? "the body and hand tracker" : "the sign model"}: ${err.message}${model.status === "fulfilled" ? " The examples still work." : ""}`);
      }
    });
  }

  // ------------------------------------------------------------ store plumbing
  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getSnapshot = (): Snapshot => this.snap;
  onLineFinal(cb: (line: CaptionLine) => void): () => void {
    this.finalListeners.add(cb);
    return () => this.finalListeners.delete(cb);
  }
  private update(p: Partial<Snapshot>): void {
    this.snap = { ...this.snap, ...p };
    for (const l of this.listeners) l();
  }
  private setStatus(text: string, kind: StatusKind = "info"): void {
    this.update({ statusText: text, statusKind: kind });
  }
  private fail(text: string): void {
    this.update({ phase: "error", statusText: text, statusKind: "error" });
  }
  private setMode(mode: Mode): void {
    this.update({ mode });
    const mirrored = mode === "camera" && this.facing === "user";
    this.video.style.transform = mirrored ? "scaleX(-1)" : "";
    this.canvas.style.transform = mirrored ? "scaleX(-1)" : "";
  }
  setShowSkeleton(v: boolean): void {
    this.update({ showSkeleton: v });
    if (!v) this.clearOverlay();
  }

  // ------------------------------------------------------------ captions
  private get cur(): Line {
    return this.lines[this.lines.length - 1]!;
  }
  private publishLines(): void {
    const out: CaptionLine[] = this.lines.filter((l) => l.glosses.length).map(toCaption);
    this.update({ lines: out.slice(-MAX_LINES) });
  }
  /** End the current caption line (a pause, Stop, or the end of a clip) and tell the listeners once. */
  private finishLine(): void {
    const line = this.cur;
    if (!line.glosses.length) return;
    line.final = true;
    this.lines.push({ id: ++this.lineSeq, glosses: [], final: false });
    while (this.lines.length > MAX_LINES + 1) this.lines.shift();
    this.publishLines();
    const c = toCaption(line);
    for (const l of this.finalListeners) l(c);
  }
  private onStreamEvent = (e: Parameters<Parameters<Fc10Stream["on"]>[0]>[0]): void => {
    if (e.type === "gloss") {
      const g = this.label(e.id);
      if (g.hidden) return;
      this.cur.glosses.push(g);
      this.runGlosses++;
      this.publishLines();
    }
  };

  // ------------------------------------------------------------ loading
  private async countedFetch(url: string, init?: RequestInit): Promise<Response> {
    const res = await fetch(url, init);
    if (!res.ok || !res.body) return res;
    const reader = res.body.getReader();
    const parts: Uint8Array[] = [];
    let n = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      n += value.length;
      this.loadedBytes += value.length;
      if (this.snap.phase === "loading") {
        const p = Math.min(0.99, this.loadedBytes / BIG_BYTES);
        this.update({
          progress: p,
          statusText: `Downloading the models: ${Math.round(p * 100)} % of ${Math.round(BIG_BYTES / 1e6)} MB (once, then cached).`,
          statusKind: "info",
        });
      }
    }
    const all = new Uint8Array(n);
    let o = 0;
    for (const p of parts) {
      all.set(p, o);
      o += p.length;
    }
    return new Response(all, { status: res.status, statusText: res.statusText, headers: res.headers });
  }

  private async fetchVerified(path: string, sha256: string): Promise<Uint8Array> {
    const res = await this.countedFetch(path, { credentials: "same-origin" });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || type.includes("text/html")) throw new Error(`${path} is missing on this server.`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const actual = await sha256Hex(bytes);
    if (actual !== sha256) throw new Error(`${path}: SHA-256 mismatch (got ${actual}).`);
    return bytes;
  }

  private async loadModel(): Promise<void> {
    const [model, vocab] = await Promise.all([
      this.fetchVerified("/" + FILES["fc10_step.onnx"].to, FILES["fc10_step.onnx"].sha256),
      this.fetchVerified("/" + FILES["fc10_vocab.json"].to, FILES["fc10_vocab.json"].sha256),
    ]);
    const itos = (JSON.parse(new TextDecoder().decode(vocab)) as { itos: string[] }).itos;
    if (itos.length !== FC10.vocabSize) throw new Error(`vocabulary has ${itos.length} entries, expected ${FC10.vocabSize}`);
    this.label = makeLabeler(itos);
    this.runner = await createOrtRunner({ modelBytes: model, wasmUrl: ortWasmUrl });
    this.stream = new Fc10Stream({ runner: this.runner });
    this.stream.on(this.onStreamEvent);
  }

  // ------------------------------------------------------------ MediaPipe source
  private makeSource(delegate: "GPU" | "CPU"): HolisticWebSource {
    const engine = this;
    const s = createHolisticWebSource({
      video: this.video,
      wasmBasePath: mpAssets.wasmBasePath,
      modelUrl: mpAssets.models["holistic_landmarker.task"].path,
      modelSha256: mpAssets.models["holistic_landmarker.task"].sha256,
      delegate,
      // Let the browser cache the 13.7 MB .task (the source asks for no-store by default); the hash is still checked.
      fetchFn: (input, init) => this.countedFetch(String(input), { ...init, cache: "default" }),
      getUserMedia: (c) => this.mediaProvider(c),
      // Read at every start(); ignored when the "camera" is an uploaded file.
      get constraints(): MediaStreamConstraints {
        return engine.cameraConstraints();
      },
    });
    s.onFrame((f) => this.onFrame(f));
    s.onState((state, error) => {
      if (state === "error" && error) void this.onSourceError(error);
    });
    return s;
  }

  private cameraConstraints(): MediaStreamConstraints {
    return { audio: false, video: { facingMode: { ideal: this.facing }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } } };
  }

  /** MediaPipe failed while running: on GPU, retry once on CPU. */
  private async onSourceError(error: EngineError): Promise<void> {
    if (error.code === "extractor-failed" && this.source.delegate === "GPU" && this.delegatePref === "GPU") {
      this.delegatePref = "CPU";
      const was = this.snap.mode;
      this.setStatus("The graphics mode failed on this device; switching to the slower CPU mode…", "warn");
      this.source.dispose();
      this.source = this.makeSource("CPU");
      this.mpReady = this.source.load();
      try {
        await this.mpReady;
        if (was === "camera") await this.startCamera();
        else this.setStatus("Ready (CPU mode). Press a button to start.", "ok");
      } catch (err) {
        this.showError(err as EngineError);
      }
      return;
    }
    this.showError(error);
  }

  private showError(error: EngineError | Error): void {
    const code = (error as EngineError).code;
    if (code === "camera-denied" || code === "camera-unavailable") {
      const m = /Camera:\s*([A-Za-z]+Error)/.exec(error.message);
      const name = m?.[1] ?? "UnknownError";
      this.setStatus(`${cameraErrorHelp(name, navigator.userAgent)} The examples work without a camera.`, "warn");
    } else {
      this.setStatus(`Something went wrong: ${error.message}`, "error");
    }
    if (this.snap.mode !== "idle") this.stop();
  }

  // ------------------------------------------------------------ frames (camera and uploaded clip)
  /** Subscribe to the landmark frames of the camera or an uploaded clip. */
  onLandmarks(cb: (frame: LandmarkFrame) => void): () => void {
    this.landmarkListeners.add(cb);
    return () => this.landmarkListeners.delete(cb);
  }

  /** Turn the fc10 weather recogniser on or off (the camera and skeleton keep running). */
  setFc10Enabled(v: boolean): void {
    this.fc10Enabled = v;
  }

  private onFrame(frame: LandmarkFrame): void {
    const stream = this.stream;
    if ((this.snap.mode !== "camera" && this.snap.mode !== "upload") || !stream) return;
    for (const l of this.landmarkListeners) l(frame);
    if (this.canvas.width !== frame.image.width || this.canvas.height !== frame.image.height) {
      this.canvas.width = frame.image.width;
      this.canvas.height = frame.image.height;
    }
    if (this.ctx) {
      if (this.snap.showSkeleton) drawSkeleton(this.ctx, { ...frame, presence: { ...frame.presence, face: false } }, this.canvas.width, this.canvas.height);
      else this.clearOverlay();
    }
    if (!this.fc10Enabled) return;
    const hands = frame.presence.leftHand || frame.presence.rightHand;
    const t = frame.timestampMs;
    if (hands) {
      this.handsAbsentSince = null;
      this.segmented = false;
    } else if (this.handsAbsentSince === null) {
      this.handsAbsentSince = t;
    } else if (!this.segmented && t - this.handsAbsentSince > PAUSE_MS) {
      this.segmented = true;
      stream.finalize();
      stream.reset("pause");
      this.finishLine();
    }
    stream.push(t, rawFromHuFrame(frame));
  }

  private clearOverlay(): void {
    this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private resetForRun(reason: string): void {
    this.stream?.reset(reason);
    this.finishLine();
    this.runGlosses = 0;
    this.handsAbsentSince = null;
    this.segmented = false;
  }

  // ------------------------------------------------------------ public actions
  async startCamera(): Promise<void> {
    const problem = cameraProblem({
      userAgent: navigator.userAgent,
      isSecureContext: window.isSecureContext,
      hasGetUserMedia: typeof navigator.mediaDevices?.getUserMedia === "function",
    });
    if (problem) {
      this.setStatus(
        problem === "in-app-browser"
          ? "This in-app browser cannot use the camera. Open the page in Chrome or Safari, or use an example."
          : problem === "insecure"
            ? "The camera needs a secure (https) page."
            : "This browser cannot use the camera. Use an example or upload a clip.",
        "warn",
      );
      return;
    }
    if (this.snap.phase === "loading") {
      // iOS Safari: ask for the camera now, inside the tap; a later gesture-less request can be refused.
      this.setStatus("Allow the camera; it starts when the models are loaded.", "info");
      try {
        const probe = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: this.facing } } });
        for (const t of probe.getTracks()) t.stop();
      } catch (err) {
        const name = (err as { name?: string }).name ?? "UnknownError";
        this.setStatus(`${cameraErrorHelp(name, navigator.userAgent)} The examples work without a camera.`, "warn");
        return;
      }
    }
    try {
      await Promise.all([this.modelReady, this.mpReady]);
    } catch {
      return; // the load error is already shown
    }
    if (this.disposed || !this.stream) return;
    this.stopAll();
    this.mediaProvider = (c) => navigator.mediaDevices.getUserMedia(c);
    this.resetForRun("camera");
    this.setMode("camera");
    this.setStatus("Opening the camera…");
    try {
      await this.source.start();
      if (this.snap.mode === "camera") this.setStatus("Live. Sign to the camera; captions appear below the video.", "ok");
    } catch (err) {
      this.setMode("idle");
      this.showError(err as EngineError);
    }
  }

  async startUpload(file: File, crop: Crop = "whole"): Promise<void> {
    if (!canUploadClips()) {
      this.setStatus("Uploading a clip needs Chrome, Edge or Firefox on a computer or Android phone. The examples work everywhere.", "warn");
      return;
    }
    try {
      await Promise.all([this.modelReady, this.mpReady]);
    } catch {
      return;
    }
    if (this.disposed || !this.stream) return;
    this.stopAll();
    const url = URL.createObjectURL(file);
    const fv = document.createElement("video") as CapturableVideo;
    fv.muted = true;
    fv.playsInline = true;
    fv.preload = "auto";
    fv.src = url;
    try {
      await new Promise<void>((resolve, reject) => {
        fv.onloadedmetadata = () => resolve();
        fv.onerror = () => reject(new Error("This file could not be opened as a video."));
      });
    } catch (err) {
      URL.revokeObjectURL(url);
      this.setStatus((err as Error).message, "error");
      return;
    }
    this.fileVideo = fv;
    this.fileUrl = url;
    this.mediaProvider = async () => {
      if (crop === "whole") return fv.captureStream!();
      const c = cropStream(fv, crop);
      this.cropStop = c.stop;
      return c.stream;
    };
    this.resetForRun("upload");
    this.setMode("upload");
    this.setStatus(`Reading ${file.name}… (plays at normal speed)`, "info");
    try {
      // Start the file and MediaPipe together so no frames are lost at the start.
      const started = this.source.start();
      await fv.play();
      await started;
      fv.onended = () => void this.finishUpload();
      if (this.snap.mode === "upload") this.setStatus(`Reading ${file.name}…`, "ok");
    } catch (err) {
      this.cleanupFile();
      this.setMode("idle");
      this.showError(err as EngineError);
    }
  }

  private async finishUpload(): Promise<void> {
    if (this.snap.mode !== "upload") return;
    const stream = this.stream;
    await new Promise((r) => setTimeout(r, 300)); // let the last frames through MediaPipe
    await stream?.idle();
    if (this.snap.mode !== "upload") return;
    stream?.finalize();
    this.finishLine();
    this.source.stop();
    this.cleanupFile();
    this.clearOverlay();
    this.setMode("idle");
    this.setStatus(
      this.runGlosses ? "Finished. Upload another clip, or try the camera." : "Finished, but no signs were recognised. The model only knows German weather-forecast signs; play an example.",
      this.runGlosses ? "ok" : "warn",
    );
  }

  private cleanupFile(): void {
    this.cropStop?.();
    this.cropStop = null;
    if (this.fileVideo) {
      this.fileVideo.onended = null;
      this.fileVideo.pause();
      this.fileVideo.removeAttribute("src");
      this.fileVideo.load();
    }
    if (this.fileUrl) URL.revokeObjectURL(this.fileUrl);
    this.fileVideo = null;
    this.fileUrl = null;
  }

  /** Plays one recorded clip: the one at `index` (wraps around), or the next in turn when no index is given. */
  async startDemo(index?: number): Promise<void> {
    try {
      await this.modelReady;
    } catch {
      return;
    }
    const stream = this.stream;
    if (this.disposed || !stream) return;
    this.stopAll();
    let clips: DemoClip[];
    try {
      clips = await this.loadDemo();
    } catch (err) {
      this.setStatus(`The examples are not available on this server (${(err as Error).message}).`, "error");
      return;
    }
    const n = (index ?? this.demoIndex++) % clips.length;
    const clip = clips[n]!;
    this.resetForRun("demo");
    this.setMode("demo");
    this.canvas.width = DEMO_W;
    this.canvas.height = DEMO_H;
    this.setStatus(`Example ${n + 1} of ${clips.length}: a recorded weather forecast (skeleton only, no video) runs through the same model.`, "ok");
    let i = 0;
    const t0 = performance.now();
    const runId = ++this.demoRun;
    // Watchdog: never hang. A clip lasts frames/25 s; after that plus 15 s, show what is there.
    const deadline = window.setTimeout(() => {
      if (this.snap.mode === "demo" && runId === this.demoRun) {
        stream.finalize();
        this.finishLine();
        this.setMode("idle");
        this.clearOverlay();
        this.setStatus("The example ended early: this device or tab was too slow. Press an example to try again.", "warn");
      }
    }, (clip.frames.length / FC10.fps) * 1000 + 15000);
    const tick = (): void => {
      if (this.snap.mode !== "demo" || runId !== this.demoRun) return;
      // A hidden tab throttles timers: feed the rest at once instead of in real time.
      const due = document.visibilityState === "hidden" ? clip.frames.length : Math.floor((performance.now() - t0) / (1000 / FC10.fps));
      while (i <= due && i < clip.frames.length) {
        const f = clip.frames[i]!;
        stream.pushResampled(t0 + i * 40, f);
        if (this.ctx) {
          if (this.snap.showSkeleton) drawSkeleton(this.ctx, huFrameFromRaw(f, i, DEMO_W, DEMO_H), DEMO_W, DEMO_H);
          else this.clearOverlay();
        }
        i++;
      }
      if (i >= clip.frames.length) {
        this.demoTimer = null;
        void stream.idle().then(() => {
          clearTimeout(deadline);
          if (runId !== this.demoRun || this.snap.mode !== "demo") return;
          stream.finalize();
          this.finishLine();
          this.clearOverlay();
          this.setMode("idle");
          this.setStatus("Example finished. Pick another example, or start your camera.", "ok");
        });
        return;
      }
      this.demoTimer = window.setTimeout(tick, 20);
    };
    tick();
  }

  private async loadDemo(): Promise<DemoClip[]> {
    if (this.demoClips) return this.demoClips;
    const f = FILES["demo/demo-clips.json"];
    const bytes = await this.fetchVerified("/" + f.to, f.sha256);
    this.demoClips = parseDemoClips(JSON.parse(new TextDecoder().decode(bytes)) as DemoClipFile);
    return this.demoClips;
  }

  /** Stop whatever is running without announcing it (used before starting something else). */
  private stopAll(): void {
    this.demoRun++;
    if (this.demoTimer !== null) clearTimeout(this.demoTimer);
    this.demoTimer = null;
    if (this.snap.mode === "camera" || this.snap.mode === "upload") this.source.stop();
    this.cleanupFile();
    if (this.snap.mode !== "idle") {
      this.stream?.finalize();
      this.finishLine();
    }
    this.clearOverlay();
    this.setMode("idle");
  }

  stop(): void {
    const was = this.snap.mode;
    this.stopAll();
    if (was !== "idle") this.setStatus("Stopped. Start the camera, upload a clip, or play an example.", "info");
  }

  dispose(): void {
    this.disposed = true;
    this.stopAll();
    this.unbindLifecycle?.();
    this.source.dispose();
    void this.runner?.release();
    this.guard.uninstall();
    this.listeners.clear();
    this.finalListeners.clear();
  }
}

function toCaption(l: Line): CaptionLine {
  return {
    id: l.id,
    de: l.glosses.map((g) => g.gloss).join(" "),
    en: l.glosses.map((g) => g.english ?? "?").join(" · "),
    final: l.final,
  };
}
