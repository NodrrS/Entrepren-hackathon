#!/usr/bin/env node
// Hands Up demo server: serves the built page (dist/) and one narrow speech route.
//
//   GET  /api/health  -> { ok: boolean }   whether the Voice Control service answers
//   POST /api/tts     -> audio/wav         body { text: string (<= 400 chars), lang: "en" | "de" }
//
// The Voice Control URL and key come from the environment (VOICE_CONTROL_URL, VOICE_CONTROL_API_KEY) and
// never reach the browser. Only the text that is to be spoken is forwarded; camera video never gets here.
// Nothing about requests (text, IPs) is logged.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { MAX_TEXT_CHARS, VOICES } from "./voices.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(here, "..", "dist");
const PORT = Number(process.env.PORT ?? 8810);
const HOST = process.env.HOST ?? "127.0.0.1";
const VC_URL = (process.env.VOICE_CONTROL_URL ?? "http://127.0.0.1:8765").replace(/\/+$/, "");
const VC_KEY = process.env.VOICE_CONTROL_API_KEY ?? "";
const vcHeaders = VC_KEY ? { Authorization: `Bearer ${VC_KEY}` } : {};

const MAX_QUEUE = 4; // requests waiting for the single speech engine; more get a 503
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30; // speech requests per client per minute
const TTS_TIMEOUT_MS = 30_000;

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
  "Permissions-Policy": "camera=(self), microphone=(), geolocation=(), interest-cohort=()",
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
function rateLimited(id) {
  const now = Date.now();
  const list = (hits.get(id) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (list.length >= RATE_MAX) {
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

async function synthesize(text, lang) {
  const v = VOICES[lang];
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

async function readBody(req, limit = 4096) {
  const chunks = [];
  let n = 0;
  for await (const c of req) {
    n += c.length;
    if (n > limit) throw Object.assign(new Error("body too large"), { status: 413 });
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString("utf8");
}

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

  const job = enqueue(() => synthesize(text, lang));
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
    if (p === "/api/health" && req.method === "GET") return json(res, 200, { ok: await voiceUp() });
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
  console.log(`Hands Up demo on http://${HOST}:${PORT} (voice service ${VC_KEY ? "with key" : "without key"}; serving ${DIST})`);
});
