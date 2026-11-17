/**
 * Browser `LandmarkSource`: camera → MediaPipe Tasks HolisticLandmarker (tasks-vision 1.0.1,
 * D-014) → `hu-landmarks/v1` frames. Exported as a separate subpath
 * (`@handsup/sign-engine/sources/mediapipe-holistic-web`) so the core stays MediaPipe-free.
 *
 * Privacy (D-004):
 * - The WASM files and the `.task` model are loaded from the app's own origin only.
 * - The `.task` bytes are fetched once, checked against the pinned SHA-256 BEFORE they are given
 *   to MediaPipe, and never cached or stored by us.
 * - Video frames go from the <video> element straight into MediaPipe in memory. Nothing is
 *   recorded; `stop()` stops every camera track.
 * - tasks-vision 1.0.1 contains a usage logger that POSTs to a Google endpoint. The app must
 *   block it (CSP connect-src 'self' + a same-origin fetch guard); see apps/web.
 */
import { FilesetResolver, HolisticLandmarker } from "@mediapipe/tasks-vision";
import { holisticResultToFrame, type HolisticMappingOptions } from "../adapters/mediapipeHolistic";
import type { EngineError, LandmarkSource, SourceInfo, SourceState, Unsubscribe } from "../engine/types";
import { Emitter } from "../engine/util";
import type { LandmarkFrame } from "../landmarks/schema";
import { PINNED_MEDIAPIPE, sha256Hex } from "../manifest/manifest";

export interface HolisticWebSourceOptions {
  /** The <video> element frames are read from (the app renders it, e.g. mirrored with CSS). */
  readonly video: HTMLVideoElement;
  /** Same-origin base path of the tasks-vision WASM files, e.g. "/mediapipe/wasm". */
  readonly wasmBasePath: string;
  /** Same-origin URL of holistic_landmarker.task. */
  readonly modelUrl: string;
  /** The pinned SHA-256 of the .task file. null = not pinned yet, which refuses to load. */
  readonly modelSha256: string | null;
  readonly delegate?: "GPU" | "CPU";
  readonly mapping?: HolisticMappingOptions;
  /** getUserMedia constraints. Default: user-facing 1280x720 @ 30 FPS, no audio. */
  readonly constraints?: MediaStreamConstraints;
  /** Injection points for tests. */
  readonly fetchFn?: typeof fetch;
  readonly getUserMedia?: (c: MediaStreamConstraints) => Promise<MediaStream>;
  readonly now?: () => number;
  readonly createLandmarker?: (modelBytes: Uint8Array, delegate: "GPU" | "CPU") => Promise<HolisticLike>;
}

/** The part of HolisticLandmarker we use (lets tests substitute a fake). */
export interface HolisticLike {
  detectForVideo(video: HTMLVideoElement, timestampMs: number): {
    faceLandmarks: { x: number; y: number; z: number; visibility?: number }[][];
    poseLandmarks: { x: number; y: number; z: number; visibility?: number }[][];
    leftHandLandmarks: { x: number; y: number; z: number; visibility?: number }[][];
    rightHandLandmarks: { x: number; y: number; z: number; visibility?: number }[][];
  };
  close(): void;
}

export class SourceError extends Error implements EngineError {
  constructor(
    readonly code: EngineError["code"],
    message: string,
  ) {
    super(message);
    this.name = "SourceError";
  }
}

export const DEFAULT_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
};

export interface HolisticWebSource extends LandmarkSource {
  /** Fetch + verify the model and initialise MediaPipe, without opening the camera. */
  load(): Promise<void>;
  /** The delegate actually in use after load(). */
  readonly delegate: "GPU" | "CPU" | null;
  /** Release MediaPipe too (stop() only releases the camera). */
  dispose(): void;
}

export function createHolisticWebSource(options: HolisticWebSourceOptions): HolisticWebSource {
  const fetchFn = options.fetchFn ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const getUserMedia =
    options.getUserMedia ?? ((c: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(c));
  const now = options.now ?? (() => performance.now());
  const createLandmarker = options.createLandmarker ?? defaultCreateLandmarker(options.wasmBasePath);
  const video = options.video;

  const frames = new Emitter<[LandmarkFrame]>();
  const states = new Emitter<[SourceState, EngineError | undefined]>();
  let state: SourceState = "idle";
  let landmarker: HolisticLike | null = null;
  let loading: Promise<void> | null = null;
  let delegate: "GPU" | "CPU" | null = null;
  let stream: MediaStream | null = null;
  let frameIndex = 0;
  let lastTs = -Infinity;
  let loopHandle: number | null = null;
  let runToken = 0;

  const info: SourceInfo = {
    extractor: `${PINNED_MEDIAPIPE.extractor}/holistic`,
    extractorVersion: PINNED_MEDIAPIPE.version,
    assetSha256: options.modelSha256 ? { "holistic_landmarker.task": options.modelSha256 } : {},
  };

  // Read through a function so TypeScript does not keep a stale narrowing across awaits.
  const currentState = (): SourceState => state;
  const setState = (s: SourceState, error?: EngineError) => {
    state = s;
    states.emit(s, error);
  };

  async function load(): Promise<void> {
    if (landmarker) return;
    if (loading) return loading;
    loading = (async () => {
      if (!options.modelSha256) {
        throw new SourceError("model-hash-mismatch", "The SHA-256 of holistic_landmarker.task is not pinned yet (run `npm run models:pin`).");
      }
      let res: Response;
      try {
        res = await fetchFn(options.modelUrl, { cache: "no-store", credentials: "same-origin" });
      } catch (err) {
        throw new SourceError("model-missing", `Could not load ${options.modelUrl}: ${String(err)}`);
      }
      const type = res.headers.get("content-type") ?? "";
      // A dev server answers a missing file with index.html (200, text/html).
      if (!res.ok || type.includes("text/html")) {
        throw new SourceError("model-missing", `Model file not found at ${options.modelUrl}.`);
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      const actual = await sha256Hex(bytes);
      if (actual !== options.modelSha256.toLowerCase()) {
        throw new SourceError("model-hash-mismatch", `SHA-256 mismatch for ${options.modelUrl}: expected ${options.modelSha256}, got ${actual}.`);
      }
      const preferred = options.delegate ?? "GPU";
      try {
        landmarker = await createLandmarker(bytes, preferred);
        delegate = preferred;
      } catch (err) {
        if (preferred === "CPU") throw new SourceError("extractor-failed", `MediaPipe failed to start: ${String(err)}`);
        try {
          landmarker = await createLandmarker(bytes, "CPU");
          delegate = "CPU";
        } catch (err2) {
          throw new SourceError("extractor-failed", `MediaPipe failed to start: ${String(err2)}`);
        }
      }
    })();
    try {
      await loading;
    } finally {
      loading = null;
    }
  }

  function scheduleNext(token: number): void {
    const v = video as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number;
    };
    const tick = () => {
      if (token !== runToken) return;
      processFrame();
      scheduleNext(token);
    };
    loopHandle = typeof v.requestVideoFrameCallback === "function" ? v.requestVideoFrameCallback(tick) : requestAnimationFrame(tick);
  }

  function cancelLoop(): void {
    if (loopHandle === null) return;
    const v = video as HTMLVideoElement & { cancelVideoFrameCallback?: (h: number) => void };
    if (typeof v.cancelVideoFrameCallback === "function") v.cancelVideoFrameCallback(loopHandle);
    else cancelAnimationFrame(loopHandle);
    loopHandle = null;
  }

  function processFrame(): void {
    if (!landmarker || video.readyState < 2 || video.videoWidth === 0) return;
    let ts = now();
    if (ts <= lastTs) ts = lastTs + 0.001; // MediaPipe needs strictly increasing timestamps
    lastTs = ts;
    try {
      const result = landmarker.detectForVideo(video, ts);
      const frame = holisticResultToFrame(
        result,
        {
          frameIndex: frameIndex++,
          timestampMs: ts,
          image: { width: video.videoWidth, height: video.videoHeight, mirrored: false },
          inferenceMs: now() - ts,
        },
        options.mapping,
      );
      frames.emit(frame);
    } catch (err) {
      stopCamera();
      setState("error", { code: "extractor-failed", message: String(err) });
    }
  }

  function stopCamera(): void {
    runToken++;
    cancelLoop();
    if (stream) for (const track of stream.getTracks()) track.stop();
    stream = null;
    video.pause();
    video.srcObject = null;
  }

  return {
    info,
    get state() {
      return state;
    },
    get delegate() {
      return delegate;
    },
    load,
    async start() {
      if (state === "running" || state === "starting") return;
      setState("starting");
      try {
        await load();
        if (currentState() !== "starting") return; // stop() was called while the model loaded
        try {
          stream = await getUserMedia(options.constraints ?? DEFAULT_CONSTRAINTS);
        } catch (err) {
          const name = (err as { name?: string } | null)?.name;
          throw new SourceError(
            name === "NotAllowedError" || name === "SecurityError" ? "camera-denied" : "camera-unavailable",
            `Camera: ${String(err)}`,
          );
        }
        if (currentState() !== "starting") {
          // stop() was called while we were waiting for permission.
          for (const t of stream.getTracks()) t.stop();
          stream = null;
          return;
        }
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        await video.play();
        frameIndex = 0;
        setState("running");
        scheduleNext(++runToken);
      } catch (err) {
        stopCamera();
        const e = err instanceof SourceError ? err : new SourceError("unknown", String(err));
        setState("error", { code: e.code, message: e.message });
        throw e;
      }
    },
    stop() {
      const wasActive = state === "running" || state === "starting";
      stopCamera();
      if (wasActive) setState("stopped");
    },
    dispose() {
      this.stop();
      landmarker?.close();
      landmarker = null;
      delegate = null;
      frames.clear();
      states.clear();
    },
    onFrame(listener): Unsubscribe {
      return frames.on(listener);
    },
    onState(listener): Unsubscribe {
      return states.on(listener);
    },
  };
}

function defaultCreateLandmarker(wasmBasePath: string) {
  return async (modelBytes: Uint8Array, delegate: "GPU" | "CPU"): Promise<HolisticLike> => {
    const fileset = await FilesetResolver.forVisionTasks(wasmBasePath);
    return HolisticLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: modelBytes, delegate },
      runningMode: "VIDEO",
      // Never needed: blendshapes are expression coefficients (no emotion features, RF2).
      outputFaceBlendshapes: false,
      outputPoseSegmentationMasks: false,
    });
  };
}
