/**
 * /pharmacy: DGS pharmacy research demo, entirely on device.
 *  Kundin gebärdet: a scenario plays the customer's DGS sentence from SignDict videos with the
 *    skeleton person, recognises each sign with the DTW template recogniser and builds the German and
 *    English text word by word; optionally the camera (skeleton overlay, experimental recognition).
 *  Apotheke antwortet: the pharmacist's answer, quick replies, typed text or voice are played as DGS
 *    sign videos next to the skeleton person. Signs without an open video are shown as text cards.
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
import { SignSegmenter, aspectCorrect, classify, sequenceFeatures, type RawSeqFrame } from "./classify";
import { DgsPlayer, featureFrames, loadDgs, stepsFor, type DgsData, type Step, type View } from "./dgs";
import { normalise } from "./words";

const guard = installNetworkGuard(window);
guard.onBlocked((r) => console.warn(`Hands Up blocked an outbound ${r.api} request to ${r.url}`));

const $ = <T extends HTMLElement>(id: string) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el as T;
};
const ui = {
  status: $("status"),
  tabCustomer: $<HTMLButtonElement>("tab-customer"),
  tabReply: $<HTMLButtonElement>("tab-reply"),
  paneCustomer: $("pane-customer"),
  paneReply: $("pane-reply"),
  openin: $("openin"),
  openinUrl: $("openin-url"),
  copyLink: $<HTMLButtonElement>("copy-link"),
  player: $("player"),
  scenario: $<HTMLButtonElement>("scenario"),
  scenario2: $<HTMLButtonElement>("scenario2"),
  sentence: $("sentence"),
  sentenceDe: $("sentence-de"),
  sentenceEn: $("sentence-en"),
  answer: $<HTMLButtonElement>("answer"),
  answerText: $("answer-text"),
  quick: $("quick"),
  replyText: $<HTMLInputElement>("reply-text"),
  replyGo: $<HTMLButtonElement>("reply-go"),
  mic: $<HTMLButtonElement>("mic"),
  micNote: $("mic-note"),
  tokens: $("reply-tokens"),
  credits: $("credits"),
  // camera
  stage: $("stage"),
  video: $<HTMLVideoElement>("video"),
  canvas: $<HTMLCanvasElement>("overlay"),
  placeholder: $("placeholder"),
  signing: $("signing"),
  start: $<HTMLButtonElement>("start"),
  startBig: $<HTMLButtonElement>("start-big"),
  flip: $<HTMLButtonElement>("flip"),
  clear: $<HTMLButtonElement>("clear"),
};
const ctx = ui.canvas.getContext("2d");

function setStatus(text: string, kind: "info" | "ok" | "warn" | "error" = "info"): void {
  ui.status.textContent = text;
  ui.status.dataset["kind"] = kind;
}

let data: DgsData | null = null;
let player: DgsPlayer | null = null;

// ---------------------------------------------------------------- tabs + view
function showTab(which: "customer" | "reply"): void {
  const c = which === "customer";
  ui.tabCustomer.classList.toggle("active", c);
  ui.tabReply.classList.toggle("active", !c);
  ui.tabCustomer.setAttribute("aria-selected", String(c));
  ui.tabReply.setAttribute("aria-selected", String(!c));
  ui.paneCustomer.hidden = !c;
  ui.paneReply.hidden = c;
  player?.stop();
  if (!c && running) stopCamera("Kamera aus, während die Apotheke antwortet.");
}
ui.tabCustomer.addEventListener("click", () => showTab("customer"));
ui.tabReply.addEventListener("click", () => showTab("reply"));
for (const b of document.querySelectorAll<HTMLButtonElement>(".viewbar button")) {
  b.addEventListener("click", () => {
    for (const o of document.querySelectorAll(".viewbar button")) o.classList.toggle("on", o === b);
    player?.setView(b.dataset["view"] as View);
  });
}

// ---------------------------------------------------------------- customer text, word by word
interface Word {
  gloss: string;
  de: string;
  en: string;
  confidence: number | null; // null = shown as text card (no sign video)
}
const words: Word[] = [];
function renderWords(): void {
  ui.sentence.textContent = "";
  if (!words.length) {
    const s = document.createElement("span");
    s.className = "muted";
    s.textContent = "…";
    ui.sentence.append(s);
    return;
  }
  words.forEach((w, i) => {
    const span = document.createElement("span");
    const low = w.confidence !== null && w.confidence < 0.35;
    span.className = `w${w.confidence === null ? " text" : ""}${low ? " low" : ""}${i === words.length - 1 ? " new" : ""}`;
    span.textContent = (low ? "? " : "") + w.de;
    const small = document.createElement("small");
    small.textContent = w.confidence === null ? `${w.gloss} · Textkarte` : `${w.gloss} · ${Math.round(w.confidence * 100)} %`;
    span.append(small);
    ui.sentence.append(span);
  });
}

async function runScenario(index: number): Promise<void> {
  if (!data || !player) return;
  if (running) stopCamera();
  const sent = data.sentences[index];
  if (!sent) return;
  words.length = 0;
  renderWords();
  ui.sentenceDe.textContent = "";
  ui.sentenceEn.textContent = "";
  ui.player.hidden = false;
  setStatus("Szenario: DGS-Videos aus SignDict, Skelett von MediaPipe, Text Wort für Wort.", "ok");
  const steps = stepsFor(sent.glosses, data);
  const d = data;
  const done = await player.play(steps, (_i, st) => {
    // recognise the sign from its skeleton (template recogniser), or show the text card's word
    if (st.available) {
      const q = sequenceFeatures(featureFrames(d.signs[st.gloss]!), false, 6, "presence");
      const p = q ? classify(q, d.templates) : null;
      const g = p?.sign ?? st.gloss;
      const s = d.signs[g];
      words.push({ gloss: g, de: s?.de ?? st.de, en: s?.en ?? st.en, confidence: p?.confidence ?? 0 });
    } else words.push({ gloss: st.gloss, de: st.de, en: st.en, confidence: null });
    renderWords();
  });
  if (done) {
    ui.sentenceDe.textContent = sent.de;
    ui.sentenceEn.textContent = sent.en;
    setStatus("Szenario fertig. Weiter mit „Apotheke antwortet“.", "ok");
  }
}
ui.scenario.addEventListener("click", () => void runScenario(0));
ui.scenario2.addEventListener("click", () => void runScenario(2));

// ---------------------------------------------------------------- pharmacist reply
/** German words -> DGS glosses (with or without an open video; the player shows text cards for the rest). */
const DE_TO_GLOSS: Record<string, string> = {
  hallo: "HALLO",
  ich: "ICH", mir: "ICH", mich: "ICH",
  arzt: "ARZT", aerztin: "ARZT", doktor: "ARZT",
  gehen: "GEHEN", geh: "GEHEN", gehe: "GEHEN",
  deutsch: "DEUTSCH",
  "kann nicht": "KANN-NICHT", nicht: "KANN-NICHT",
  bitte: "BITTE",
  medikament: "MEDIKAMENT", medikamente: "MEDIKAMENT", tablette: "MEDIKAMENT", tabletten: "MEDIKAMENT", arznei: "MEDIKAMENT",
  zwei: "ZWEI", "2": "ZWEI",
  woche: "WOCHE", wochen: "WOCHE",
  verstehen: "VERSTEHEN", verstanden: "VERSTEHEN", verstehe: "VERSTEHEN",
  danke: "DANKE", dankeschoen: "DANKE",
  zeigen: "ZEIGEN", zeig: "ZEIGEN", sehen: "ZEIGEN",
  dreimal: "DREI-MAL", "drei mal": "DREI-MAL",
  tag: "TAG", taeglich: "TAG",
  nach: "NACH",
  essen: "ESSEN", mahlzeit: "ESSEN",
  fuenf: "FÜNF", "5": "FÜNF",
  euro: "EURO",
  kopf: "KOPF", kopfschmerzen: "KOPF",
  schmerz: "SCHMERZ", schmerzen: "SCHMERZ",
  hier: "HIER",
  helfen: "HELFEN", hilfe: "HILFE",
  rezept: "REZEPT",
  lesen: "LESEN",
};
const STOP = new Set(["die", "der", "das", "den", "dem", "des", "und", "ein", "eine", "einen", "zu", "zum", "zur", "am", "im", "sie", "es", "mit", "fuer", "lang", "kostet", "lassen", "dieses", "diese"]);

/** Typed German -> steps. Known words become DGS glosses; other words become text cards. */
export function textToSteps(text: string, d: DgsData): Step[] {
  const raw = text.split(/\s+/).filter(Boolean);
  const out: Step[] = [];
  for (let i = 0; i < raw.length; i++) {
    const two = i + 1 < raw.length ? normalise(`${raw[i]} ${raw[i + 1]}`) : "";
    if (two && DE_TO_GLOSS[two]) {
      out.push(...stepsFor([DE_TO_GLOSS[two]!], d));
      i++;
      continue;
    }
    const w = normalise(raw[i]!);
    if (!w || STOP.has(w)) continue;
    const g = DE_TO_GLOSS[w];
    if (g) out.push(...stepsFor([g], d));
    else out.push({ gloss: raw[i]!.toUpperCase(), de: raw[i]!.replace(/[.,!?;:]+$/, ""), en: "", available: false });
  }
  return out;
}

async function playReply(steps: Step[], label: string): Promise<void> {
  if (!player) return;
  ui.player.hidden = false;
  ui.tokens.textContent = "";
  const chips = steps.map((s) => {
    const c = document.createElement("span");
    c.className = `t${s.available ? " sign" : ""}`;
    c.textContent = s.available ? s.gloss : `${s.de} (Text)`;
    ui.tokens.append(c);
    return c;
  });
  setStatus(label, "ok");
  await player.play(steps, (i) => chips.forEach((c, j) => c.classList.toggle("now", j === i)));
  chips.forEach((c) => c.classList.remove("now"));
}

ui.answer.addEventListener("click", () => {
  if (!data) return;
  const s = data.sentences[1]!;
  ui.answerText.textContent = `„${s.de}“ · ${s.en}`;
  void playReply(stepsFor(s.glosses, data), "Antwort der Apotheke in DGS (fehlende Gebärden als Textkarte).");
});

const QUICK: [string, string[]][] = [
  ["Medikament", ["MEDIKAMENT"]],
  ["Zwei Wochen", ["ZWEI", "WOCHE"]],
  ["Verstanden?", ["VERSTEHEN"]],
  ["Bitte", ["BITTE"]],
  ["Danke", ["DANKE"]],
  ["Zum Arzt gehen", ["ARZT", "GEHEN"]],
  ["Hallo", ["HALLO"]],
];
for (const [label, glosses] of QUICK) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.addEventListener("click", () => {
    if (data) void playReply(stepsFor(glosses, data), `„${label}“ in DGS.`);
  });
  ui.quick.append(b);
}
const goText = () => {
  if (data) void playReply(textToSteps(ui.replyText.value, data), "Getippte Antwort in DGS (Wort für Wort).");
};
ui.replyGo.addEventListener("click", goText);
ui.replyText.addEventListener("keydown", (e) => {
  if (e.key === "Enter") goText();
});

type SR = { lang: string; interimResults: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null; start(): void };
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
      ui.replyText.value = e.results[0]?.[0]?.transcript ?? "";
      goText();
    };
    rec.onerror = (e) => setStatus(`Spracheingabe: ${e.error}. Bitte tippen.`, "warn");
    rec.onend = () => (ui.mic.textContent = "🎤");
    rec.start();
  });
}

// ---------------------------------------------------------------- camera (experimental)
const camWords: Word[] = [];
const segmenter = new SignSegmenter((frames) => {
  ui.signing.hidden = true;
  if (!data) return;
  const q = sequenceFeatures(frames, false, 6, "body");
  const p = q ? classify(q, data.templates) : null;
  if (!p) return;
  const s = data.signs[p.sign]!;
  camWords.push({ gloss: p.sign, de: s.de, en: s.en, confidence: p.confidence });
  words.length = 0;
  words.push(...camWords.slice(-8));
  renderWords();
  ui.sentenceEn.textContent = words.map((w) => w.en).join(" · ");
});
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
    segmenter.push(lastRaw && tick - lastRaw.t < t - tick ? lastRaw.f : f);
    k++;
  }
  lastRaw = { t, f };
  ui.signing.hidden = !segmenter.inSign;
}

let facing: "user" | "environment" = "user";
let running = false;
let mpReady = false;
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
  setStatus(`${cameraErrorHelp(name, navigator.userAgent)} [${name}] Das Szenario geht ohne Kamera.`, "warn");
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
  if (!mpReady) {
    if (!pendingStart) {
      pendingStart = true;
      setStatus("Kamera erlauben; sie startet, sobald die Körpererkennung geladen ist.", "info");
      try {
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
  player?.stop();
  ui.start.disabled = true;
  setStatus("Kamera wird geöffnet…");
  segmenter.reset();
  camWords.length = 0;
  tick0 = -1;
  running = true;
  ui.placeholder.hidden = true;
  ui.stage.dataset["mirrored"] = String(facing === "user");
  try {
    await source.start();
    if (running) setStatus("Kamera läuft: einzelne Gebärden zeigen, Hände dazwischen kurz senken.", "ok");
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
  words.length = 0;
  camWords.length = 0;
  renderWords();
  ui.sentenceDe.textContent = "";
  ui.sentenceEn.textContent = "";
});
ui.copyLink.addEventListener("click", () => {
  void navigator.clipboard?.writeText(ui.openinUrl.textContent ?? location.href).then(() => (ui.copyLink.textContent = "Kopiert"));
});

// ---------------------------------------------------------------- start-up
bindCameraLifecycle({ document, window }, () => {
  if (running) stopCamera("Kamera gestoppt, weil die Seite verdeckt war.");
  player?.stop();
});
renderWords();
if (cameraProblemNow()) {
  ui.openinUrl.textContent = location.origin + location.pathname;
  ui.openin.hidden = false;
}

function renderCredits(d: DgsData): void {
  ui.credits.textContent = "";
  for (const [g, s] of Object.entries(d.signs)) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = s.source;
    a.rel = "noreferrer";
    a.textContent = `${g}${s.substitute ? ` (gezeigt: ${s.shown})` : ""}`;
    const lic = document.createElement("a");
    lic.href = s.licenceUrl;
    lic.rel = "noreferrer";
    lic.textContent = s.licence;
    li.append(a, `: ${s.credit}, `, lic);
    ui.credits.append(li);
  }
}

void loadDgs()
  .then((d) => {
    data = d;
    player = new DgsPlayer(
      { root: ui.player, video: $<HTMLVideoElement>("dgs-video"), canvas: $<HTMLCanvasElement>("dgs-skel"), card: $("card"), cardWord: $("card-word"), gloss: $("p-gloss"), word: $("p-word") },
      d,
    );
    renderCredits(d);
    setStatus(`Bereit: ${Object.keys(d.signs).length} DGS-Gebärden mit Video. „Szenario abspielen“ drücken.`, "ok");
  })
  .catch((err: Error) => setStatus(`Gebärden-Daten fehlen: ${err.message}`, "error"));
void source
  .load()
  .then(() => {
    mpReady = true;
    if (pendingStart) void startCamera();
  })
  .catch((err: Error) => {
    if (pendingStart) setStatus(`Die Körpererkennung lädt nicht: ${err.message}`, "warn");
  });
