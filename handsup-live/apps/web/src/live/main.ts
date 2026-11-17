/**
 * /live: live sign recognition research demo, entirely on device.
 *
 * camera -> MediaPipe HolisticLandmarker (tasks-vision 1.0.1, pinned .task) -> hu-landmarks/v1
 *   -> fc10 raw layout -> 25 FPS -> thesis normalisation -> 8-frame chunks -> fc10 ONNX step
 *   (onnxruntime-web WASM, explicit KV cache) -> closure CTC decoding -> German glosses + rough English.
 * Fallback: bundled demo landmarks (no video) through the same pipeline.
 *
 * Privacy (D-004): same-origin requests only (CSP + network guard), nothing stored, camera off
 * when the page is hidden. Model files are SHA-256-checked before use.
 */
import { installNetworkGuard } from "../privacy";
import { sha256Hex, type EngineError, type LandmarkFrame } from "@handsup/sign-engine";
import { createHolisticWebSource } from "@handsup/sign-engine/sources/mediapipe-holistic-web";
import { Fc10Stream, FC10, makeLabeler, rawFromHuFrame, type GlossLabel } from "@handsup/fc10-runtime";
import { createOrtRunner, type OrtRunner } from "@handsup/fc10-runtime/ort";
import mpAssets from "../../mediapipe-assets.json";
import liveAssets from "../../live-assets.json";
// Emitted once by Vite as a hashed same-origin asset; its SHA-256 is checked at build time (live:sync).
import ortWasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
import { FpsMeter } from "../fps";
import { bindCameraLifecycle } from "../lifecycle";
import { drawSkeleton } from "../overlay";
import { Captions, englishText, germanText } from "./captions";
import { huFrameFromRaw, parseDemoClips, type DemoClip, type DemoClipFile } from "./demo";

const guard = installNetworkGuard(window);

const $ = <T extends HTMLElement>(id: string) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el as T;
};
const ui = {
  status: $("status"),
  stage: $("stage"),
  video: $<HTMLVideoElement>("video"),
  canvas: $<HTMLCanvasElement>("overlay"),
  placeholder: $("placeholder"),
  capDe: $("cap-de"),
  capEn: $("cap-en"),
  start: $<HTMLButtonElement>("start"),
  flip: $<HTMLButtonElement>("flip"),
  demo: $<HTMLButtonElement>("demo"),
  landmarks: $<HTMLInputElement>("landmarks"),
  slow: $("slow"),
  slowText: $("slow-text"),
  slowDemo: $<HTMLButtonElement>("slow-demo"),
  lines: $("lines"),
  reference: $("reference"),
  mFps: $("m-fps"),
  mDelay: $("m-delay"),
  mStep: $("m-step"),
  mEngine: $("m-engine"),
};
const ctx = ui.canvas.getContext("2d");

function setStatus(text: string, kind: "info" | "ok" | "warn" | "error" = "info"): void {
  ui.status.textContent = text;
  ui.status.dataset["kind"] = kind;
}

guard.onBlocked((r) => console.warn(`Hands Up blocked an outbound ${r.api} request to ${r.url}`));

// ---------------------------------------------------------------- camera + MediaPipe
let facing: "user" | "environment" = "user";
const sourceOptions = {
  video: ui.video,
  wasmBasePath: mpAssets.wasmBasePath,
  modelUrl: mpAssets.models["holistic_landmarker.task"].path,
  modelSha256: mpAssets.models["holistic_landmarker.task"].sha256,
  // Let the browser cache the 13.7 MB .task (the source asks for no-store by default); the hash is still checked.
  fetchFn: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, cache: "default" }),
  // Read at every start(), so "Flip camera" takes effect on the next start.
  get constraints(): MediaStreamConstraints {
    return {
      audio: false,
      video: { facingMode: { ideal: facing }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
    };
  },
};
// GPU first; on any MediaPipe GPU failure (load or while running, a known iOS Safari risk) we switch to CPU.
// "?delegate=CPU" forces CPU (for testing on a phone).
let delegatePref: "GPU" | "CPU" = new URLSearchParams(location.search).get("delegate") === "CPU" ? "CPU" : "GPU";
let source = makeSource(delegatePref);

function makeSource(delegate: "GPU" | "CPU") {
  // Keep `constraints` a live getter (Flip camera), so do not spread the options object.
  const s = createHolisticWebSource(Object.defineProperties({ delegate }, Object.getOwnPropertyDescriptors(sourceOptions)) as typeof sourceOptions & { delegate: "GPU" | "CPU" });
  s.onFrame(onFrame);
  s.onState((state, error) => {
    if (state === "error" && error) void onSourceError(error);
  });
  return s;
}

// ---------------------------------------------------------------- model
let runner: OrtRunner | null = null;
let stream: Fc10Stream | null = null;
let label: (id: number) => GlossLabel = (id) => ({ id, gloss: String(id), english: null, hidden: false });

async function fetchVerified(path: string, sha256: string): Promise<Uint8Array> {
  // Normal HTTP caching: the files are public, and the SHA-256 check below still runs on every load.
  const res = await fetch(path, { credentials: "same-origin" });
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || type.includes("text/html")) throw new Error(`${path} is missing on this server.`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const actual = await sha256Hex(bytes);
  if (actual !== sha256) throw new Error(`${path}: SHA-256 mismatch (got ${actual}).`);
  return bytes;
}

const FILES = liveAssets.fc10.files;
async function loadModel(): Promise<void> {
  const [model, vocab] = await Promise.all([
    fetchVerified("/" + FILES["fc10_step.onnx"].to, FILES["fc10_step.onnx"].sha256),
    fetchVerified("/" + FILES["fc10_vocab.json"].to, FILES["fc10_vocab.json"].sha256),
  ]);
  const itos = (JSON.parse(new TextDecoder().decode(vocab)) as { itos: string[] }).itos;
  if (itos.length !== FC10.vocabSize) throw new Error(`vocabulary has ${itos.length} entries, expected ${FC10.vocabSize}`);
  label = makeLabeler(itos);
  runner = await createOrtRunner({ modelBytes: model, wasmUrl: ortWasmUrl });
  updateEngine();
  ui.mStep.textContent = `${runner.warmupMs.toFixed(1)} ms`;
  stream = new Fc10Stream({ runner });
  stream.on(onStreamEvent);
}

// ---------------------------------------------------------------- captions + meters
const captions = new Captions(6);
const stepTimes: number[] = [];
const delays: number[] = [];
const median = (v: number[]) => (v.length ? [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)]! : Number.NaN);
const push20 = (arr: number[], x: number) => {
  arr.push(x);
  if (arr.length > 20) arr.shift();
};

function render(newest = false): void {
  const cur = captions.current;
  const last = cur.glosses.length ? cur : captions.lines[captions.lines.length - 2] ?? cur;
  ui.capDe.textContent = "";
  last.glosses.forEach((g, i) => {
    const span = document.createElement("span");
    span.textContent = (i ? " " : "") + g.gloss;
    if (newest && i === last.glosses.length - 1) span.className = "new";
    ui.capDe.append(span);
  });
  ui.capEn.textContent = englishText(last);
  ui.lines.textContent = "";
  for (const line of captions.lines) {
    const li = document.createElement("li");
    if (!line.glosses.length) {
      const empty = document.createElement("span");
      empty.className = "empty";
      empty.textContent = "…";
      li.append(empty);
    } else {
      const de = document.createElement("div");
      de.className = "de";
      de.textContent = germanText(line);
      const en = document.createElement("div");
      en.className = "en";
      en.textContent = englishText(line);
      li.append(de, en);
    }
    ui.lines.append(li);
  }
}

let lastMeterAt = 0;
function onStreamEvent(e: Parameters<Parameters<Fc10Stream["on"]>[0]>[0]): void {
  if (e.type === "gloss") {
    if (captions.add(label(e.id))) render(true);
  } else if (e.type === "step") {
    push20(stepTimes, e.computeMs);
    if (mode === "camera") push20(delays, e.delayMs);
    const now = performance.now();
    if (now - lastMeterAt > 300) {
      lastMeterAt = now;
      ui.mStep.textContent = `${median(stepTimes).toFixed(1)} ms`;
      ui.mDelay.textContent = mode === "camera" && delays.length ? `${Math.round(median(delays))} ms` : "–";
    }
    if (mode === "camera" && e.backlog > 3) showSlow("The sign model cannot keep up on this device.");
  }
}

// ---------------------------------------------------------------- modes
type Mode = "idle" | "camera" | "demo";
let mode: Mode = "idle";
const fps = new FpsMeter();
let startedAt = 0;
let handsAbsentSince: number | null = null;
let segmented = false;
const PAUSE_MS = 1500; // a pause without hands ends the caption line and resets the model

function setMode(m: Mode): void {
  mode = m;
  ui.stage.dataset["mode"] = m;
  ui.placeholder.hidden = m !== "idle";
  ui.start.textContent = m === "camera" ? "Stop" : "Start";
  ui.start.dataset["running"] = String(m === "camera");
  ui.demo.textContent = m === "demo" ? "Stop demo" : "Demo clip";
  ui.flip.disabled = m === "demo";
  if (m !== "camera") ui.mFps.textContent = "–";
}

function showSlow(text: string): void {
  if (!ui.slow.hidden) return;
  ui.slowText.textContent = `${text} Results will be poor. The demo clip shows what the model can do.`;
  ui.slow.hidden = false;
}

function clearOverlay(): void {
  ctx?.clearRect(0, 0, ui.canvas.width, ui.canvas.height);
}

function onFrame(frame: LandmarkFrame): void {
  if (mode !== "camera" || !stream) return;
  if (ui.canvas.width !== frame.image.width || ui.canvas.height !== frame.image.height) {
    ui.canvas.width = frame.image.width;
    ui.canvas.height = frame.image.height;
    ui.stage.style.aspectRatio = `${frame.image.width} / ${frame.image.height}`;
  }
  if (ctx) {
    if (ui.landmarks.checked) drawSkeleton(ctx, { ...frame, presence: { ...frame.presence, face: false } }, ui.canvas.width, ui.canvas.height);
    else clearOverlay();
  }
  fps.tick(frame.timestampMs, frame.timing?.inferenceMs);
  const hands = frame.presence.leftHand || frame.presence.rightHand;
  const t = frame.timestampMs;
  if (hands) {
    handsAbsentSince = null;
    segmented = false;
  } else if (handsAbsentSince === null) {
    handsAbsentSince = t;
  } else if (!segmented && t - handsAbsentSince > PAUSE_MS) {
    segmented = true;
    stream.finalize();
    stream.reset("pause");
    captions.newLine();
    render();
  }
  stream.push(t, rawFromHuFrame(frame));
  if (t - lastFpsAt > 500) {
    lastFpsAt = t;
    ui.mFps.textContent = `${fps.fps.toFixed(0)} fps`;
    if (t - startedAt > 6000 && fps.fps > 0 && fps.fps < 10) showSlow(`The camera pipeline runs at only ${fps.fps.toFixed(0)} frames a second (25 needed).`);
  }
}
let lastFpsAt = 0;

/** MediaPipe failed while running: on GPU, retry once on CPU with the camera still wanted. */
async function onSourceError(error: EngineError): Promise<void> {
  if (error.code === "extractor-failed" && source.delegate === "GPU" && delegatePref === "GPU") {
    delegatePref = "CPU";
    const wasLive = mode === "camera";
    setStatus("The graphics mode failed on this device; switching to the slower CPU mode…", "warn");
    source.dispose();
    source = makeSource("CPU");
    try {
      await source.load();
      updateEngine();
      if (wasLive) await startCamera();
      else setStatus("Ready (CPU mode). Press Start.", "ok");
    } catch (err) {
      showError(err as EngineError);
    }
    return;
  }
  showError(error);
}

function updateEngine(): void {
  ui.mEngine.textContent = `${runner?.backend.toUpperCase() ?? "?"} · MediaPipe ${source.delegate ?? "?"}`;
}

function showError(error: EngineError | Error): void {
  const code = (error as EngineError).code;
  if (code === "camera-denied") {
    setStatus("The camera is blocked for this page. Allow it in the browser settings, or press Demo clip.", "warn");
  } else if (code === "camera-unavailable") {
    setStatus("No camera could be opened. Press Demo clip to see the model on a recorded skeleton.", "warn");
  } else {
    setStatus(`Something went wrong: ${error.message}`, "error");
  }
  if (mode === "camera") stopCamera();
  ui.start.disabled = false;
}

async function startCamera(): Promise<void> {
  if (!stream) return;
  stopDemo();
  ui.start.disabled = true;
  ui.reference.hidden = true;
  setStatus("Opening the camera…");
  stream.reset("start");
  captions.newLine();
  render();
  fps.reset();
  delays.length = 0;
  handsAbsentSince = null;
  segmented = false;
  ui.slow.hidden = true;
  setMode("camera");
  ui.stage.dataset["mirrored"] = String(facing === "user");
  try {
    await source.start();
    startedAt = performance.now();
    lastFpsAt = 0;
    if (mode === "camera") setStatus("Live. Sign to the camera; captions appear below the video.", "ok");
  } catch (err) {
    setMode("idle");
    showError(err as EngineError);
  } finally {
    ui.start.disabled = false;
  }
}

function stopCamera(): void {
  source.stop();
  stream?.finalize();
  clearOverlay();
  setMode("idle");
  setStatus("Camera off. Press Start to sign again.", "info");
}

// ---------------------------------------------------------------- demo
let demoClips: DemoClip[] | null = null;
let demoIndex = 0;
let demoTimer: number | null = null;

async function loadDemo(): Promise<DemoClip[]> {
  if (demoClips) return demoClips;
  const f = FILES["demo/demo-clips.json"];
  const bytes = await fetchVerified("/" + f.to, f.sha256);
  demoClips = parseDemoClips(JSON.parse(new TextDecoder().decode(bytes)) as DemoClipFile);
  return demoClips;
}

async function startDemo(): Promise<void> {
  if (!stream) return;
  if (mode === "camera") stopCamera();
  let clips: DemoClip[];
  try {
    clips = await loadDemo();
  } catch (err) {
    setStatus(`The demo clip is not available on this server (${String((err as Error).message)}).`, "error");
    return;
  }
  const clip = clips[demoIndex % clips.length]!;
  demoIndex++;
  stream.reset("demo");
  captions.newLine();
  render();
  setMode("demo");
  ui.stage.dataset["mirrored"] = "false";
  ui.canvas.width = 420;
  ui.canvas.height = 520; // PHOENIX frames are 210 x 260
  ui.stage.style.aspectRatio = "210 / 260";
  ui.reference.hidden = true;
  setStatus("Demo: a recorded weather forecast skeleton (landmarks only, no video) runs through the same model.", "ok");
  let i = 0;
  const t0 = performance.now();
  const tick = () => {
    if (mode !== "demo" || !stream) return;
    const due = Math.floor((performance.now() - t0) / (1000 / FC10.fps));
    while (i <= due && i < clip.frames.length) {
      const f = clip.frames[i]!;
      stream.pushResampled(t0 + i * 40, f);
      if (ctx) {
        if (ui.landmarks.checked) drawSkeleton(ctx, huFrameFromRaw(f, i, 420, 520), 420, 520);
        else clearOverlay();
      }
      i++;
    }
    if (i >= clip.frames.length) {
      void stream.idle().then(() => {
        stream?.finalize();
        ui.reference.hidden = false;
        ui.reference.textContent = "";
        const strong = document.createElement("strong");
        strong.textContent = "Human annotation of this clip: ";
        ui.reference.append(strong, clip.reference.filter((g) => !g.startsWith("__")).join(" "));
        setMode("idle");
        clearOverlay();
        ui.placeholder.hidden = true;
        setStatus("Demo finished. Press Demo clip for another one, or Start for your camera.", "ok");
      });
      demoTimer = null;
      return;
    }
    demoTimer = window.setTimeout(tick, 20);
  };
  demoTimer = window.setTimeout(tick, 20);
}

function stopDemo(): void {
  if (demoTimer !== null) clearTimeout(demoTimer);
  demoTimer = null;
  if (mode === "demo") {
    stream?.finalize();
    clearOverlay();
    setMode("idle");
  }
}

// ---------------------------------------------------------------- wiring
ui.start.addEventListener("click", () => {
  if (mode === "camera") stopCamera();
  else void startCamera();
});
ui.flip.addEventListener("click", () => {
  facing = facing === "user" ? "environment" : "user";
  ui.flip.textContent = facing === "user" ? "Flip camera" : "Front camera";
  if (mode === "camera") {
    source.stop();
    void startCamera();
  }
});
ui.demo.addEventListener("click", () => {
  if (mode === "demo") {
    stopDemo();
    setStatus("Demo stopped.", "info");
  } else void startDemo();
});
ui.slowDemo.addEventListener("click", () => {
  ui.slow.hidden = true;
  void startDemo();
});
ui.landmarks.addEventListener("change", () => {
  if (!ui.landmarks.checked) clearOverlay();
});

bindCameraLifecycle({ document, window }, (reason) => {
  if (mode === "camera") {
    stopCamera();
    if (reason === "hidden") setStatus("Camera stopped because the page was hidden. Press Start to go on.", "warn");
  }
  if (mode === "demo") stopDemo();
});

/** WebAssembly SIMD (needed by ONNX Runtime 1.31 and the fast MediaPipe build): Safari 16.4+, Chrome 91+. */
function hasWasmSimd(): boolean {
  try {
    return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
  } catch {
    return false;
  }
}

render();
if (!hasWasmSimd()) {
  setStatus("This browser is too old for the sign model (it needs WebAssembly SIMD: iPhone with iOS 16.4 or newer, or a current Chrome, Firefox or Edge). Please update the browser.", "error");
} else {
  // Load both independently: the demo needs only the sign model, the camera needs both.
  void Promise.allSettled([source.load(), loadModel()]).then(([mp, model]) => {
    updateEngine();
    if (model.status === "fulfilled") ui.demo.disabled = false;
    if (mp.status === "fulfilled" && model.status === "fulfilled") {
      ui.start.disabled = false;
      setStatus("Ready. Press Start and allow the camera, or try the demo clip.", "ok");
    } else {
      const err = (mp.status === "rejected" ? mp.reason : (model as PromiseRejectedResult).reason) as Error;
      setStatus(`Could not load ${mp.status === "rejected" ? "the body and hand tracker" : "the sign model"}: ${err.message}${model.status === "fulfilled" ? " The demo clip still works." : ""}`, "error");
    }
  });
}
