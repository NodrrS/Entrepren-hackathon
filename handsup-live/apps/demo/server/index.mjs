#!/usr/bin/env node
// Hands Up demo server: serves the built page (dist/) and two narrow routes: speech and sentence rewriting.
//
//   GET  /api/health   -> { ok: boolean, llm: boolean, links: boolean }   whether Voice Control / the LLM gateway answer / video links work
//   POST /api/tts      -> audio/wav     body { text: string (<= 400 chars), lang: "en" | "de", voice?: "default" | "c3po" | "snape" }
//   POST /api/rewrite  -> { sentence, ms }   body { glosses: string, hints?: string, lang: "en" | "de" }
//                         turns raw sign glosses into one natural sentence with an LLM (metacon, via LiteLLM)
//   POST /api/simplify -> { sentence, tiles }   body { text: string, lang: "en" | "de" }
//                         the staff answer as very short plain sentences + up to 3 picture tiles (LLM, strict JSON)
//   POST /api/transcribe?lang=en|de -> { text }   body audio/wav (<= 1 MB): staff speech to text via Voice Control
//   POST /api/video    -> video/mp4     body { url: a YouTube link }   only when VIDEO_LINKS=on and yt-dlp is installed
//                         fetches a short clip (<= 3 min, <= 40 MB, 480p, no audio) for the page to translate
//
// The Voice Control URL and key (VOICE_CONTROL_URL, VOICE_CONTROL_API_KEY) and the LLM gateway settings
// (LLM_BASE_URL, LLM_API_KEY, LLM_MODEL) come from the environment and never reach the browser. Only the
// recognised words and the text to be spoken are forwarded; camera video never gets here.
// Nothing about requests (text, IPs) is logged.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMessages, cleanSentence } from "./rewrite-prompt.mjs";
import { buildSimplifyMessages, parseSimplify } from "./simplify-prompt.mjs";
import { MESSAGES, createLimiter, downloadVideo, parseVideoId, ytdlpAvailable } from "./video-link.mjs";
import { MAX_TEXT_CHARS, VOICE_STYLES, VOICES } from "./voices.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(here, "..", "dist");
const PORT = Number(process.env.PORT ?? 8810);
const HOST = process.env.HOST ?? "127.0.0.1";
const VC_URL = (process.env.VOICE_CONTROL_URL ?? "http://127.0.0.1:8765").replace(/\/+$/, "");
const VC_KEY = process.env.VOICE_CONTROL_API_KEY ?? "";
const vcHeaders = VC_KEY ? { Authorization: `Bearer ${VC_KEY}` } : {};
// LLM gateway (LiteLLM on metacon, OpenAI-compatible). No default key: without one /api/rewrite answers 503
// and the page falls back to the raw words.
const LLM_URL = (process.env.LLM_BASE_URL ?? "http://metacon:4000/v1").replace(/\/+$/, "");
const LLM_KEY = process.env.LLM_API_KEY ?? "";
const LLM_MODEL = process.env.LLM_MODEL ?? "qwen3:8b";
const llmHeaders = { Authorization: `Bearer ${LLM_KEY}` };

const MAX_QUEUE = 4; // requests waiting for the single speech engine; more get a 503
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30; // speech requests per client per minute
const TTS_TIMEOUT_MS = 30_000;
const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS ?? 6_000);
const REWRITE_RATE_MAX = 40; // rewrite requests per client per minute
const MAX_AUDIO_BYTES = 1024 * 1024; // staff recordings: about 30 s of 16 kHz mono 16-bit audio
// Video links: off unless VIDEO_LINKS=on (and yt-dlp is installed). One download at a time, 3 per client per hour.
const LINKS_ON = process.env.VIDEO_LINKS === "on" && ytdlpAvailable();
const VIDEO_PER_HOUR = 3;
const videoLimited = createLimiter(VIDEO_PER_HOUR, 60 * 60_000);
let videoBusy = false;

// ---------------------------------------------------------------- helpers
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".onnx": "application/octet-stream",
  ".task": "application/octet-stream",
  ".webmanifest": "application/manifest+json",
};

// The page may only talk to its own origin (AGENTS.md section 6). blob: serves the generated audio and video.
const CSP = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob: mediastream:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "font-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const SECURITY_HEADERS = {
  "Content-Security-Policy": CSP,
  "Permissions-Policy": "camera=(self), microphone=(self), geolocation=(), interest-cohort=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Cross-Origin-Opener-Policy": "same-origin",
};

function cacheFor(path) {
  if (path.startsWith("/app/") || path.startsWith("/assets/")) return "public, max-age=31536000, immutable"; // hashed build files
  if (path.startsWith("/models/") || path.startsWith("/mediapipe/")) return "public, max-age=2592000";
  if (path.startsWith("/demo/")) return "public, max-age=86400";
  return "no-cache";
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}
const json = (res, status, obj) => send(res, status, JSON.stringify(obj), { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });

function clientId(req) {
  // Behind the Cloudflare tunnel the real address is in cf-connecting-ip.
  const h = req.headers["cf-connecting-ip"];
  return (Array.isArray(h) ? h[0] : h) || req.socket.remoteAddress || "unknown";
}

// ---------------------------------------------------------------- rate limit (in memory, per client)
const hits = new Map();
function rateLimited(id, max = RATE_MAX) {
  const now = Date.now();
  const list = (hits.get(id) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (list.length >= max) {
    hits.set(id, list);
    return true;
  }
  list.push(now);
  hits.set(id, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < RATE_WINDOW_MS)) hits.delete(k);
  return false;
}

// ---------------------------------------------------------------- one speech job at a time (the engine handles one)
let tail = Promise.resolve();
let waiting = 0;
function enqueue(job) {
  if (waiting >= MAX_QUEUE) return null;
  waiting++;
  const run = tail.then(job, job);
  tail = run.then(
    () => {},
    () => {},
  ).finally(() => {
    waiting--;
  });
  return run;
}

async function synthesize(text, lang, style = "default") {
  const v = { ...VOICES[lang], voice: VOICE_STYLES[style] ?? VOICES[lang].voice };
  const res = await fetch(`${VC_URL}/v1/audio/speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...vcHeaders },
    body: JSON.stringify({ input: text, voice: v.voice, language: v.language, response_format: "wav" }),
    signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
  });
  if (!res.ok) {
    const err = new Error(`voice service answered ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return Buffer.from(await res.arrayBuffer());
}

async function readBuffer(req, limit = 4096) {
  const chunks = [];
  let n = 0;
  for await (const c of req) {
    n += c.length;
    if (n > limit) throw Object.assign(new Error("body too large"), { status: 413 });
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}
const readBody = async (req, limit = 4096) => (await readBuffer(req, limit)).toString("utf8");

// ---------------------------------------------------------------- routes
let healthCache = { at: 0, ok: false };
async function voiceUp() {
  if (Date.now() - healthCache.at < 5000) return healthCache.ok;
  let ok = false;
  try {
    const r = await fetch(`${VC_URL}/healthz`, { signal: AbortSignal.timeout(3000) });
    ok = r.ok;
  } catch {
    ok = false;
  }
  healthCache = { at: Date.now(), ok };
  return ok;
}

let llmCache = { at: 0, ok: false };
async function llmUp() {
  if (!LLM_KEY) return false;
  if (Date.now() - llmCache.at < 5000) return llmCache.ok;
  let ok = false;
  try {
    const r = await fetch(`${LLM_URL}/models`, { headers: llmHeaders, signal: AbortSignal.timeout(3000) });
    ok = r.ok;
  } catch {
    ok = false;
  }
  llmCache = { at: Date.now(), ok };
  return ok;
}

/** One chat completion on the gateway; returns the answer text. */
async function llmChat(messages, maxTokens) {
  const res = await fetch(`${LLM_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...llmHeaders },
    body: JSON.stringify({ model: LLM_MODEL, messages, temperature: 0, seed: 42, max_tokens: maxTokens, think: false }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  });
  if (!res.ok) {
    const err = new Error(`llm gateway answered ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content;
}

async function rewriteSentence(glosses, hints, lang) {
  return cleanSentence(await llmChat(buildMessages(glosses, hints, lang), 120));
}

async function handleRewrite(req, res) {
  if (!LLM_KEY) return json(res, 503, { error: "Sentences are not set up on this server." });
  if (!(req.headers["content-type"] ?? "").includes("application/json")) return json(res, 415, { error: "send JSON" });
  if (rateLimited(`rw:${clientId(req)}`, REWRITE_RATE_MAX)) return json(res, 429, { error: "Too many requests. Try again in a minute." });
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (e) {
    return json(res, e.status === 413 ? 413 : 400, { error: "invalid request body" });
  }
  const glosses = typeof body?.glosses === "string" ? body.glosses.trim() : "";
  const hints = typeof body?.hints === "string" ? body.hints.trim() : "";
  const lang = body?.lang;
  if (!glosses) return json(res, 400, { error: "glosses is empty" });
  if (glosses.length > MAX_TEXT_CHARS || hints.length > MAX_TEXT_CHARS) return json(res, 400, { error: `text is longer than ${MAX_TEXT_CHARS} characters` });
  if (lang !== "en" && lang !== "de") return json(res, 400, { error: 'lang must be "en" or "de"' });

  const t0 = Date.now();
  try {
    const sentence = (await rewriteSentence(glosses, hints, lang)).slice(0, MAX_TEXT_CHARS);
    if (!sentence) return json(res, 502, { error: "The sentence service gave no answer." });
    json(res, 200, { sentence, ms: Date.now() - t0 });
  } catch (e) {
    const timeout = e?.name === "TimeoutError" || e?.name === "AbortError";
    console.error(`rewrite failed: ${timeout ? "timeout" : (e?.message ?? "error")}`);
    json(res, timeout ? 504 : 502, { error: "The sentence service is not available right now." });
  }
}

async function handleSimplify(req, res) {
  if (!LLM_KEY) return json(res, 503, { error: "Sentences are not set up on this server." });
  if (!(req.headers["content-type"] ?? "").includes("application/json")) return json(res, 415, { error: "send JSON" });
  if (rateLimited(`sp:${clientId(req)}`, REWRITE_RATE_MAX)) return json(res, 429, { error: "Too many requests. Try again in a minute." });
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (e) {
    return json(res, e.status === 413 ? 413 : 400, { error: "invalid request body" });
  }
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const lang = body?.lang;
  if (!text) return json(res, 400, { error: "text is empty" });
  if (text.length > MAX_TEXT_CHARS) return json(res, 400, { error: `text is longer than ${MAX_TEXT_CHARS} characters` });
  if (lang !== "en" && lang !== "de") return json(res, 400, { error: 'lang must be "en" or "de"' });
  try {
    const out = parseSimplify(await llmChat(buildSimplifyMessages(text, lang), 260));
    if (!out) return json(res, 502, { error: "The picture service gave no usable answer." });
    json(res, 200, out);
  } catch (e) {
    const timeout = e?.name === "TimeoutError" || e?.name === "AbortError";
    console.error(`simplify failed: ${timeout ? "timeout" : (e?.message ?? "error")}`);
    json(res, timeout ? 504 : 502, { error: "The picture service is not available right now." });
  }
}

async function transcribeAudio(wav, lang) {
  const form = new FormData();
  form.append("file", new Blob([wav], { type: "audio/wav" }), "answer.wav");
  form.append("language", lang === "de" ? "German" : "English");
  const res = await fetch(`${VC_URL}/v1/audio/transcriptions`, { method: "POST", headers: vcHeaders, body: form, signal: AbortSignal.timeout(TTS_TIMEOUT_MS) });
  if (!res.ok) {
    const err = new Error(`voice service answered ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  return typeof data?.text === "string" ? data.text.trim() : "";
}

async function handleTranscribe(req, res, url) {
  if (!(req.headers["content-type"] ?? "").includes("audio/wav")) return json(res, 415, { error: "send audio/wav" });
  if (rateLimited(`tr:${clientId(req)}`, RATE_MAX)) return json(res, 429, { error: "Too many requests. Try again in a minute." });
  const lang = url.searchParams.get("lang");
  if (lang !== "en" && lang !== "de") return json(res, 400, { error: 'lang must be "en" or "de"' });
  let wav;
  try {
    wav = await readBuffer(req, MAX_AUDIO_BYTES);
  } catch (e) {
    return json(res, e.status === 413 ? 413 : 400, { error: e.status === 413 ? "The recording is too long." : "invalid request body" });
  }
  if (wav.length < 1000 || wav.toString("ascii", 0, 4) !== "RIFF") return json(res, 400, { error: "That is not a WAV recording." });
  const job = enqueue(() => transcribeAudio(wav, lang));
  if (!job) return json(res, 503, { error: "The voice is busy. Try again in a moment." });
  try {
    json(res, 200, { text: await job });
  } catch (e) {
    const timeout = e?.name === "TimeoutError" || e?.name === "AbortError";
    console.error(`transcribe failed: ${timeout ? "timeout" : (e?.message ?? "error")}`);
    json(res, timeout ? 504 : 502, { error: "The voice service is not available right now." });
  }
}

async function handleVideo(req, res) {
  if (!LINKS_ON) return json(res, 503, { error: "Video links are not available on this server." });
  if (!(req.headers["content-type"] ?? "").includes("application/json")) return json(res, 415, { error: "send JSON" });
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (e) {
    return json(res, e.status === 413 ? 413 : 400, { error: "invalid request body" });
  }
  const id = parseVideoId(body?.url);
  if (!id) return json(res, 400, { error: "That is not a YouTube link. Paste a link like https://www.youtube.com/watch?v=…" });
  if (videoBusy) return json(res, 503, { error: "Another video is being fetched. Try again in a minute." });
  if (videoLimited(clientId(req))) return json(res, 429, { error: `Video links are limited to ${VIDEO_PER_HOUR} per hour. Try again later.` });
  videoBusy = true;
  try {
    const mp4 = await downloadVideo(id);
    send(res, 200, mp4, { "Content-Type": "video/mp4", "Content-Length": mp4.length, "Cache-Control": "no-store" });
  } catch (e) {
    const [status, error] = MESSAGES[e?.code] ?? MESSAGES.failed;
    console.error(`video failed: ${e?.code ?? "error"}`);
    json(res, Number(status), { error });
  } finally {
    videoBusy = false;
  }
}

async function handleTts(req, res) {
  if (!(req.headers["content-type"] ?? "").includes("application/json")) return json(res, 415, { error: "send JSON" });
  if (rateLimited(clientId(req))) return json(res, 429, { error: "Too many requests. Try again in a minute." });
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (e) {
    return json(res, e.status === 413 ? 413 : 400, { error: "invalid request body" });
  }
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const lang = body?.lang;
  if (!text) return json(res, 400, { error: "text is empty" });
  if (text.length > MAX_TEXT_CHARS) return json(res, 400, { error: `text is longer than ${MAX_TEXT_CHARS} characters` });
  if (lang !== "en" && lang !== "de") return json(res, 400, { error: 'lang must be "en" or "de"' });
  const style = body?.voice ?? "default";
  if (!Object.hasOwn(VOICE_STYLES, style)) return json(res, 400, { error: 'voice must be "default", "c3po" or "snape"' });

  const job = enqueue(() => synthesize(text, lang, style));
  if (!job) return json(res, 503, { error: "The voice is busy. Try again in a moment." });
  try {
    const wav = await job;
    send(res, 200, wav, { "Content-Type": "audio/wav", "Content-Length": wav.length, "Cache-Control": "no-store" });
  } catch (e) {
    const timeout = e?.name === "TimeoutError" || e?.name === "AbortError";
    console.error(`tts failed: ${timeout ? "timeout" : (e?.message ?? "error")}`);
    json(res, timeout ? 504 : 502, { error: "The voice service is not available right now." });
  }
}

function serveStatic(req, res, pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return json(res, 400, { error: "bad path" });
  }
  let file = normalize(join(DIST, rel));
  if (file !== DIST && !file.startsWith(DIST + sep)) return json(res, 403, { error: "forbidden" });
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file)) {
    // Real files that are missing must 404 (not return index.html), so model downloads fail loudly.
    if (extname(rel)) return json(res, 404, { error: "not found" });
    file = join(DIST, "index.html");
  }
  if (!existsSync(file)) return json(res, 503, { error: "Not built yet: run npm run build -w @handsup/demo." });
  const st = statSync(file);
  const ext = extname(file);
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    "Content-Type": TYPES[ext] ?? "application/octet-stream",
    "Content-Length": st.size,
    "Cache-Control": cacheFor(pathname),
  });
  if (req.method === "HEAD") return res.end();
  createReadStream(file).pipe(res);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://local");
    const p = url.pathname;
    if (p === "/api/health" && req.method === "GET") {
      const [ok, llm] = await Promise.all([voiceUp(), llmUp()]);
      return json(res, 200, { ok, llm, links: LINKS_ON });
    }
    if (p === "/api/simplify") {
      if (req.method !== "POST") return json(res, 405, { error: "POST only" });
      return await handleSimplify(req, res);
    }
    if (p === "/api/transcribe") {
      if (req.method !== "POST") return json(res, 405, { error: "POST only" });
      return await handleTranscribe(req, res, url);
    }
    if (p === "/api/video") {
      if (req.method !== "POST") return json(res, 405, { error: "POST only" });
      return await handleVideo(req, res);
    }
    if (p === "/api/rewrite") {
      if (req.method !== "POST") return json(res, 405, { error: "POST only" });
      return await handleRewrite(req, res);
    }
    if (p === "/api/tts") {
      if (req.method !== "POST") return json(res, 405, { error: "POST only" });
      return await handleTts(req, res);
    }
    if (p.startsWith("/api/")) return json(res, 404, { error: "not found" });
    if (req.method !== "GET" && req.method !== "HEAD") return json(res, 405, { error: "GET only" });
    return serveStatic(req, res, p);
  } catch (e) {
    console.error(`server error: ${e?.message ?? e}`);
    if (!res.headersSent) json(res, 500, { error: "server error" });
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Hands Up demo on http://${HOST}:${PORT} (voice service ${VC_KEY ? "with key" : "without key"}; sentences ${LLM_KEY ? `via ${LLM_MODEL}` : "off (no LLM_API_KEY)"}; video links ${LINKS_ON ? "on" : "off"}; serving ${DIST})`);
  // Load the model now so the first visitor does not wait for a cold start.
  if (LLM_KEY) rewriteSentence("MORGEN WETTER", "", "en").catch(() => {});
});
