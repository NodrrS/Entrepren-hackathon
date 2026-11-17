/**
 * /pharmacy: two-way research demo for a pharmacy counter, entirely on device.
 *  A) customer signs -> MediaPipe Holistic -> sign segmentation -> template recogniser (ASL
 *     shortlist, PopSign examples) -> German words with confidence.
 *  B) pharmacist types, taps a quick reply or speaks -> words -> PopSign example skeletons
 *     played back as a signing figure.
 * Privacy (D-004): same-origin only (CSP + network guard), nothing stored, camera off when hidden.
 */
import { installNetworkGuard } from "../privacy";
import type { EngineError, LandmarkFrame } from "@handsup/sign-engine";
import { createHolisticWebSource } from "@handsup/sign-engine/sources/mediapipe-holistic-web";
import { rawFromHuFrame } from "@handsup/fc10-runtime";
import mpAssets from "../../mediapipe-assets.json";
import { bindCameraLifecycle } from "../lifecycle";
import { drawSkeleton } from "../overlay";
import { cameraErrorHelp, cameraProblem } from "../live/camera-support";
import { FEAT_DIM, SignSegmenter, aspectCorrect, classify, sequenceFeatures, type RawSeqFrame, type Template } from "./classify";
import { QUICK_REPLIES, SIGN_DE, textToSigns } from "./words";
import { drawAvatar, fitClip } from "./avatar";

const guard = installNetworkGuard(window);
guard.onBlocked((r) => console.warn(`Hands Up blocked an outbound ${r.api} request to ${r.url}`));

const $ = <T extends HTMLElement>(id: string) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el as T;
};
const ui = {
  status: $("status"),
  tabSign: $<HTMLButtonElement>("tab-sign"),
  tabReply: $<HTMLButtonElement>("tab-reply"),
  paneSign: $("pane-sign"),
  paneReply: $("pane-reply"),
  openin: $("openin"),
  openinUrl: $("openin-url"),
  copyLink: $<HTMLButtonElement>("copy-link"),
  stage: $("stage"),
  video: $<HTMLVideoElement>("video"),
  canvas: $<HTMLCanvasElement>("overlay"),
  placeholder: $("placeholder"),
  signing: $("signing"),
  start: $<HTMLButtonElement>("start"),
  startBig: $<HTMLButtonElement>("start-big"),
  flip: $<HTMLButtonElement>("flip"),
  example: $<HTMLButtonElement>("example"),
  clear: $<HTMLButtonElement>("clear"),
  sentence: $("sentence"),
  sentenceEn: $("sentence-en"),
  known: $("known"),
  avatar: $<HTMLCanvasElement>("avatar"),
  avatarWord: $("avatar-word"),
  avatarSub: $("avatar-sub"),
  quick: $("quick"),
  replyText: $<HTMLInputElement>("reply-text"),
  replyGo: $<HTMLButtonElement>("reply-go"),
  mic: $<HTMLButtonElement>("mic"),
  micNote: $("mic-note"),
  tokens: $("reply-tokens"),
};
const ctx = ui.canvas.getContext("2d");
const actx = ui.avatar.getContext("2d");

function setStatus(text: string, kind: "info" | "ok" | "warn" | "error" = "info"): void {
  ui.status.textContent = text;
  ui.status.dataset["kind"] = kind;
}

// ---------------------------------------------------------------- tabs
function showTab(which: "sign" | "reply"): void {
  const sign = which === "sign";
  ui.tabSign.classList.toggle("active", sign);
  ui.tabReply.classList.toggle("active", !sign);
  ui.tabSign.setAttribute("aria-selected", String(sign));
  ui.tabReply.setAttribute("aria-selected", String(!sign));
  ui.paneSign.hidden = !sign;
  ui.paneReply.hidden = sign;
  if (!sign && running) stopCamera("Kamera aus, während die Apotheke antwortet.");
}
ui.tabSign.addEventListener("click", () => showTab("sign"));
ui.tabReply.addEventListener("click", () => showTab("reply"));

// ---------------------------------------------------------------- sign data (templates + reply clips)
interface SignsFile {
  recognise: string[];
  seqLen: number;
  featDim: number;
  reply: Record<string, { frames: number; keypoints_b64: string; present: number[][] }>;
  templates: { sign: string; signer: string; seq_b64: string }[];
}
let templates: Template[] = [];
let replyClips: Record<string, RawSeqFrame[]> = {};

function f32(b64: string): Float32Array {
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Float32Array(u.buffer);
}

async function loadSigns(): Promise<void> {
  const res = await fetch("/pharmacy/signs.json", { credentials: "same-origin" });
  if (!res.ok || (res.headers.get("content-type") ?? "").includes("text/html")) throw new Error("signs.json fehlt");
  const data = (await res.json()) as SignsFile;
  if (data.featDim !== FEAT_DIM) throw new Error("signs.json passt nicht zu dieser Version");
  templates = data.templates.map((t) => {
    const flat = f32(t.seq_b64);
    const seq: Float32Array[] = [];
    for (let i = 0; i < data.seqLen; i++) seq.push(flat.subarray(i * FEAT_DIM, (i + 1) * FEAT_DIM));
    return { sign: t.sign, signer: t.signer, seq };
  });
  replyClips = {};
  for (const [sign, c] of Object.entries(data.reply)) {
    const pts = f32(c.keypoints_b64);
    replyClips[sign] = c.present.map((p, i) => ({ points: pts.subarray(i * 225, (i + 1) * 225), present: [!!p[0], !!p[1], !!p[2], !!p[3]] as const }));
  }
  ui.known.textContent = data.recognise.map((s) => SIGN_DE[s] ?? s).join(" · ");
}

// ---------------------------------------------------------------- A: recognition
interface Word {
  sign: string;
  confidence: number;
}
const sentence: Word[] = [];
function renderSentence(): void {
  ui.sentence.textContent = "";
  if (!sentence.length) {
    const s = document.createElement("span");
    s.className = "muted";
    s.textContent = "…";
    ui.sentence.append(s);
    ui.sentenceEn.textContent = "";
    return;
  }
  sentence.forEach((w, i) => {
    const span = document.createElement("span");
    span.className = `w${w.confidence < 0.35 ? " low" : ""}${i === sentence.length - 1 ? " new" : ""}`;
    span.textContent = (w.confidence < 0.35 ? "? " : "") + (SIGN_DE[w.sign] ?? w.sign);
    const small = document.createElement("small");
    small.textContent = `${Math.round(w.confidence * 100)} %`;
    span.append(small);
    ui.sentence.append(span);
  });
  ui.sentenceEn.textContent = "ASL: " + sentence.map((w) => w.sign.toUpperCase()).join(" · ");
}

const segmenter = new SignSegmenter((frames) => {
  ui.signing.hidden = true;
  const q = sequenceFeatures(frames, false, 6, "body");
  if (!q) return;
  const p = classify(q, templates);
  if (!p) return;
  sentence.push({ sign: p.sign, confidence: p.confidence });
  if (sentence.length > 8) sentence.shift();
  renderSentence();
});

// 25 FPS resampling of the camera stream (nearest frame), like the fc10 runtime.
let tick0 = -1;
let k = 0;
let lastRaw: { t: number; f: RawSeqFrame } | null = null;
function pushCamera(t: number, f: RawSeqFrame): void {
  if (tick0 < 0 || (lastRaw && t - lastRaw.t > 1000)) {
    tick0 = t;
    k = 0;
    segmenter.reset();
  }
  for (let tick = tick0 + k * 40; tick <= t; tick = tick0 + k * 40) {
    const use = lastRaw && tick - lastRaw.t < t - tick ? lastRaw.f : f;
    segmenter.push(use);
    k++;
  }
  lastRaw = { t, f };
  ui.signing.hidden = !segmenter.inSign;
}

// ---------------------------------------------------------------- camera
let facing: "user" | "environment" = "user";
let running = false;
let modelsReady = false;
const sourceOptions = {
  video: ui.video,
  wasmBasePath: mpAssets.wasmBasePath,
  modelUrl: mpAssets.models["holistic_landmarker.task"].path,
  modelSha256: mpAssets.models["holistic_landmarker.task"].sha256,
  fetchFn: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, cache: "default" }),
  get constraints(): MediaStreamConstraints {
    return { audio: false, video: { facingMode: { ideal: facing }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } } };
  },
};
let delegatePref: "GPU" | "CPU" = new URLSearchParams(location.search).get("delegate") === "CPU" ? "CPU" : "GPU";
let source = makeSource(delegatePref);

function makeSource(delegate: "GPU" | "CPU") {
  const s = createHolisticWebSource(Object.defineProperties({ delegate }, Object.getOwnPropertyDescriptors(sourceOptions)) as typeof sourceOptions & { delegate: "GPU" | "CPU" });
  s.onFrame(onFrame);
  s.onState((state, error) => {
    if (state === "error" && error) void onSourceError(error);
  });
  return s;
}

function onFrame(frame: LandmarkFrame): void {
  if (!running) return;
  if (ui.canvas.width !== frame.image.width || ui.canvas.height !== frame.image.height) {
    ui.canvas.width = frame.image.width;
    ui.canvas.height = frame.image.height;
    ui.stage.style.aspectRatio = `${frame.image.width} / ${frame.image.height}`;
  }
  if (ctx) drawSkeleton(ctx, { ...frame, presence: { ...frame.presence, face: false } }, ui.canvas.width, ui.canvas.height);
  pushCamera(frame.timestampMs, aspectCorrect(rawFromHuFrame(frame), frame.image.width, frame.image.height));
}

async function onSourceError(error: EngineError): Promise<void> {
  if (error.code === "extractor-failed" && source.delegate === "GPU" && delegatePref === "GPU") {
    delegatePref = "CPU";
    setStatus("Grafikmodus fehlgeschlagen, wechsle in den langsameren CPU-Modus…", "warn");
    source.dispose();
    source = makeSource("CPU");
    await source.load();
    if (running) {
      running = false;
      await startCamera();
    }
    return;
  }
  showCameraError(error);
}

function showCameraError(error: EngineError | Error): void {
  const m = /Camera:\s*([A-Za-z]+Error)/.exec(error.message);
  const name = m?.[1] ?? (error as Error).name ?? "Error";
  setStatus(`${cameraErrorHelp(name, navigator.userAgent)} [${name}] „Beispiel abspielen“ geht ohne Kamera.`, "warn");
  stopCamera();
}

function cameraProblemNow() {
  return cameraProblem({ userAgent: navigator.userAgent, isSecureContext: window.isSecureContext, hasGetUserMedia: typeof navigator.mediaDevices?.getUserMedia === "function" });
}

let pendingStart = false;
async function startCamera(): Promise<void> {
  if (cameraProblemNow()) {
    ui.openinUrl.textContent = location.origin + location.pathname;
    ui.openin.hidden = false;
    setStatus("Kein Kamerazugriff in diesem Browser. Seite in Safari oder Chrome öffnen.", "warn");
    return;
  }
  if (!modelsReady) {
    if (!pendingStart) {
      pendingStart = true;
      setStatus("Kamera erlauben; sie startet, sobald die Modelle geladen sind.", "info");
      try {
        // iOS: ask inside the tap
        const probe = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facing } } });
        for (const t of probe.getTracks()) t.stop();
      } catch (err) {
        pendingStart = false;
        showCameraError(Object.assign(new Error(`Camera: ${(err as Error).name}: ${(err as Error).message}`), { name: (err as Error).name }));
      }
    }
    return;
  }
  pendingStart = false;
  stopExample();
  ui.start.disabled = true;
  setStatus("Kamera wird geöffnet…");
  segmenter.reset();
  tick0 = -1;
  running = true;
  ui.placeholder.hidden = true;
  ui.stage.dataset["mirrored"] = String(facing === "user");
  try {
    await source.start();
    if (running) setStatus("Bereit: einzelne Gebärden zeigen, Hände dazwischen kurz senken.", "ok");
  } catch (err) {
    running = false;
    ui.placeholder.hidden = false;
    showCameraError(err as Error);
  } finally {
    ui.start.disabled = false;
    ui.start.textContent = running ? "Kamera stoppen" : "Kamera starten";
  }
}

function stopCamera(msg?: string): void {
  running = false;
  source.stop();
  segmenter.flush();
  ctx?.clearRect(0, 0, ui.canvas.width, ui.canvas.height);
  ui.placeholder.hidden = false;
  ui.signing.hidden = true;
  ui.start.textContent = "Kamera starten";
  if (msg) setStatus(msg, "info");
}

ui.start.addEventListener("click", () => (running ? stopCamera("Kamera aus.") : void startCamera()));
ui.startBig.addEventListener("click", () => void startCamera());
ui.flip.addEventListener("click", () => {
  facing = facing === "user" ? "environment" : "user";
  if (running) {
    stopCamera();
    void startCamera();
  }
});
ui.clear.addEventListener("click", () => {
  sentence.length = 0;
  renderSentence();
});
ui.copyLink.addEventListener("click", () => {
  const url = ui.openinUrl.textContent ?? location.href;
  void navigator.clipboard?.writeText(url).then(() => (ui.copyLink.textContent = "Kopiert"));
});

// Example: play recorded PopSign skeletons ("Kopf, Schmerz, bitte") through the same recogniser.
let exampleTimer: number | null = null;
function stopExample(): void {
  if (exampleTimer !== null) clearTimeout(exampleTimer);
  exampleTimer = null;
}
function playExample(): void {
  if (running) stopCamera();
  stopExample();
  const words = ["head", "owie", "please"].filter((w) => replyClips[w]);
  const frames: RawSeqFrame[] = [];
  const rest = replyClips[words[0]!]?.[0];
  for (const w of words) {
    frames.push(...replyClips[w]!);
    if (rest) for (let i = 0; i < 12; i++) frames.push({ points: rest.points, present: [rest.present[0], false, false, false] });
  }
  sentence.length = 0;
  renderSentence();
  segmenter.reset();
  ui.placeholder.hidden = true;
  ui.stage.dataset["mirrored"] = "false";
  ui.stage.style.aspectRatio = "3 / 4";
  ui.canvas.width = 390;
  ui.canvas.height = 520;
  setStatus("Beispiel: aufgezeichnete Skelettpunkte (kein Video) laufen durch dieselbe Erkennung.", "ok");
  const fitEx = fitClip(frames, 390, 520);
  let i = 0;
  const t0 = performance.now();
  const step = () => {
    const due = document.visibilityState === "hidden" ? frames.length : Math.floor((performance.now() - t0) / 40);
    while (i <= due && i < frames.length) {
      const f = frames[i]!;
      segmenter.push(aspectCorrect(f, 3, 4));
      if (ctx) drawAvatar(ctx, f, fitEx, 390, 520);
      i++;
    }
    ui.signing.hidden = !segmenter.inSign;
    if (i >= frames.length) {
      segmenter.flush();
      ui.signing.hidden = true;
      exampleTimer = null;
      setStatus("Beispiel fertig. Kamera starten, um selbst zu gebärden.", "ok");
      return;
    }
    exampleTimer = window.setTimeout(step, 20);
  };
  step();
}
ui.example.addEventListener("click", playExample);

// ---------------------------------------------------------------- B: reply -> signing figure
let playToken = 0;
async function playReply(text: string): Promise<void> {
  const tokens = textToSigns(text);
  const my = ++playToken;
  const W = 390, H = 520; // PopSign clips are 3:4 portrait
  ui.avatar.width = W;
  ui.avatar.height = H;
  ui.tokens.textContent = "";
  const chips = tokens.map((t) => {
    const s = document.createElement("span");
    s.className = `t${t.sign && replyClips[t.sign] ? " sign" : ""}`;
    s.textContent = t.word;
    ui.tokens.append(s);
    return s;
  });
  const signed = tokens.filter((t) => t.sign && replyClips[t.sign]);
  if (!signed.length) {
    ui.avatarWord.textContent = text;
    ui.avatarSub.textContent = "Für diese Wörter gibt es noch keine Gebärde.";
    return;
  }
  // one fit for the whole reply, so the figure does not jump between words
  const fit = fitClip(signed.flatMap((t) => replyClips[t.sign!]!), W, H);
  for (let ti = 0; ti < tokens.length; ti++) {
    const t = tokens[ti]!;
    if (my !== playToken) return;
    chips.forEach((c, j) => c.classList.toggle("now", j === ti));
    if (!t.sign || !replyClips[t.sign]) continue;
    ui.avatarWord.textContent = t.word.toUpperCase();
    ui.avatarSub.textContent = `ASL: ${t.sign.toUpperCase()}`;
    const clip = replyClips[t.sign]!;
    const t0 = performance.now();
    for (;;) {
      if (my !== playToken) return;
      const i = Math.floor((performance.now() - t0) / 50); // 0.8x speed: PopSign signs are quick
      if (i >= clip.length) break;
      if (actx) drawAvatar(actx, clip[i]!, fit, W, H);
      await new Promise((r) => setTimeout(r, 30)); // a timer, not rAF: keeps going in a background tab
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  chips.forEach((c) => c.classList.remove("now"));
  ui.avatarSub.textContent = "Fertig. Zum Wiederholen erneut tippen.";
}

for (const q of QUICK_REPLIES) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = q.label;
  b.addEventListener("click", () => {
    ui.replyText.value = q.text;
    void playReply(q.text);
  });
  ui.quick.append(b);
}
ui.replyGo.addEventListener("click", () => void playReply(ui.replyText.value));
ui.replyText.addEventListener("keydown", (e) => {
  if (e.key === "Enter") void playReply(ui.replyText.value);
});

// Voice input (Web Speech API, where the browser offers it). Started only by a tap.
type SR = { lang: string; interimResults: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null; start(): void; stop(): void };
const SRCtor = (window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: new () => SR }).webkitSpeechRecognition;
if (!SRCtor) {
  ui.mic.hidden = true;
  ui.micNote.textContent = "Spracheingabe gibt es in diesem Browser nicht; bitte tippen. Getippter Text bleibt auf dem Gerät.";
} else {
  ui.mic.addEventListener("click", () => {
    const rec = new SRCtor();
    rec.lang = "de-DE";
    rec.interimResults = false;
    ui.mic.textContent = "⏺";
    rec.onresult = (e) => {
      const text = e.results[0]?.[0]?.transcript ?? "";
      ui.replyText.value = text;
      void playReply(text);
    };
    rec.onerror = (e) => setStatus(`Spracheingabe: ${e.error}. Bitte tippen.`, "warn");
    rec.onend = () => (ui.mic.textContent = "🎤");
    rec.start();
  });
}

// ---------------------------------------------------------------- start-up
bindCameraLifecycle({ document, window }, () => {
  if (running) stopCamera("Kamera gestoppt, weil die Seite verdeckt war. Zum Weitermachen „Kamera starten“.");
  stopExample();
});
renderSentence();
showTab("reply");
if (cameraProblemNow()) {
  ui.openinUrl.textContent = location.origin + location.pathname;
  ui.openin.hidden = false;
}
void Promise.allSettled([source.load(), loadSigns()]).then(([mp, signs]) => {
  if (signs.status === "rejected") {
    setStatus(`Gebärden-Daten fehlen: ${(signs.reason as Error).message}`, "error");
    return;
  }
  if (mp.status === "rejected") {
    setStatus(`Die Körper- und Handerkennung lädt nicht: ${(mp.reason as Error).message}. „Antworten“ und „Beispiel abspielen“ gehen trotzdem.`, "warn");
    return;
  }
  modelsReady = true;
  if (pendingStart) void startCamera();
  else setStatus("Bereit. „Kamera starten“ oder „Beispiel abspielen“.", "ok");
});
