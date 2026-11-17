/**
 * P1-01 web harness: camera → HolisticLandmarker (tasks-vision 1.0.1) → hu-landmarks/v1 →
 * skeleton overlay + FPS meter. The only place that picks a concrete extractor is the
 * composition below; everything else talks to the sign-engine interfaces.
 */
import { installNetworkGuard } from "./privacy";
import { createNormaliser, createSignEngine, type EngineError, type LandmarkFrame } from "@handsup/sign-engine";
import { createHolisticWebSource } from "@handsup/sign-engine/sources/mediapipe-holistic-web";
import assets from "../mediapipe-assets.json";
import { FpsMeter } from "./fps";
import { bindCameraLifecycle } from "./lifecycle";
import { drawSkeleton } from "./overlay";

// Install the guard before anything else can make a request.
const guard = installNetworkGuard(window);

const $ = <T extends HTMLElement>(id: string) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el as T;
};
const statusEl = $("status");
const missingEl = $("missing");
const missingDetail = $("missing-detail");
const startBtn = $<HTMLButtonElement>("start");
const stopBtn = $<HTMLButtonElement>("stop");
const video = $<HTMLVideoElement>("video");
const canvas = $<HTMLCanvasElement>("overlay");
const meters = {
  fps: $("fps"),
  latency: $("latency"),
  delegate: $("delegate"),
  parts: $("parts"),
  reference: $("reference"),
  blocked: $("blocked"),
};

function setStatus(text: string, kind: "info" | "ok" | "warn" | "error" = "info"): void {
  statusEl.textContent = text;
  statusEl.dataset.kind = kind;
}

guard.onBlocked((r) => {
  meters.blocked.textContent = String(guard.blocked.length);
  console.warn(`Hands Up blocked an outbound ${r.api} request to ${r.url}`);
});

const model = assets.models["holistic_landmarker.task"];
const source = createHolisticWebSource({
  video,
  wasmBasePath: assets.wasmBasePath,
  modelUrl: model.path,
  modelSha256: model.sha256,
});
const engine = createSignEngine({ source, normaliser: createNormaliser() });

const ctx = canvas.getContext("2d");
const fps = new FpsMeter();
let lastMeterUpdate = 0;

source.onFrame((frame: LandmarkFrame) => {
  if (canvas.width !== frame.image.width || canvas.height !== frame.image.height) {
    canvas.width = frame.image.width;
    canvas.height = frame.image.height;
  }
  if (ctx) drawSkeleton(ctx, frame, canvas.width, canvas.height);
  fps.tick(frame.timestampMs, frame.timing?.inferenceMs);
  if (frame.timestampMs - lastMeterUpdate > 250) {
    lastMeterUpdate = frame.timestampMs;
    meters.fps.textContent = fps.fps.toFixed(1);
    const ms = fps.meanInferenceMs;
    meters.latency.textContent = Number.isFinite(ms) ? `${ms.toFixed(1)} ms` : "–";
    const p = frame.presence;
    meters.parts.textContent = [p.face && "face", p.pose && "pose", p.leftHand && "L", p.rightHand && "R"].filter(Boolean).join(" · ") || "none";
  }
});

engine.on((event) => {
  if (event.type === "frame") {
    meters.reference.textContent = event.frame.reference.valid ? event.frame.reference.source : "none";
  } else if (event.type === "status") {
    const running = event.status === "running";
    startBtn.disabled = running;
    stopBtn.disabled = !running;
    if (event.status === "stopped") {
      setStatus("Camera off.", "info");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      fps.reset();
    }
  } else if (event.type === "error") {
    showError(event.error);
  }
});

function showError(error: EngineError): void {
  if (error.code === "model-missing" || error.code === "model-hash-mismatch") {
    missingEl.hidden = false;
    missingDetail.textContent = error.message;
    setStatus("Model files missing: the harness cannot start.", "error");
    startBtn.disabled = true;
    return;
  }
  const text: Partial<Record<EngineError["code"], string>> = {
    "camera-denied": "Camera permission was denied. Allow the camera for this page and press Start again.",
    "camera-unavailable": "No usable camera was found.",
    "extractor-failed": "MediaPipe failed to start.",
  };
  setStatus(`${text[error.code] ?? "Error."} (${error.message})`, "error");
  startBtn.disabled = false;
}

startBtn.addEventListener("click", () => {
  startBtn.disabled = true;
  setStatus("Starting the camera…");
  void engine.start().then(() => {
    if (engine.status === "running") setStatus("Running. Landmarks are computed on this device.", "ok");
  });
});
stopBtn.addEventListener("click", () => engine.stop());

bindCameraLifecycle({ document, window }, (reason) => {
  if (source.state === "running" || source.state === "starting") {
    engine.stop();
    setStatus(reason === "hidden" ? "Camera stopped because the tab was hidden. Press Start to resume." : "Camera stopped.", "warn");
  }
});

// Load (fetch + verify + initialise) the model up front, so a missing model shows before the camera opens.
void source
  .load()
  .then(() => {
    meters.delegate.textContent = source.delegate ?? "–";
    setStatus("Model verified (SHA-256). Press Start camera.", "ok");
    startBtn.disabled = false;
  })
  .catch((err: EngineError) => showError({ code: err.code ?? "unknown", message: err.message ?? String(err) }));
