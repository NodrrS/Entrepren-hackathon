// Fetching a YouTube video for the demo (POST /api/video). The browser cannot read frames from YouTube and the
// page may only talk to its own origin, so the server downloads a short clip with yt-dlp and sends it back as
// an mp4; the page then treats it like an uploaded clip. Nothing about the link is logged.
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const MAX_SECONDS = 180;
export const MAX_BYTES = 40 * 1024 * 1024;
export const DOWNLOAD_TIMEOUT_MS = Number(process.env.VIDEO_TIMEOUT_MS ?? 90_000);

const HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"]);
const ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * Returns the video id of a YouTube link, or null. Only https links on the four YouTube hosts with a valid
 * 11-character id are accepted; the caller rebuilds the watch URL from the id, so nothing else the visitor
 * typed ever reaches the command.
 */
export function parseVideoId(raw) {
  if (typeof raw !== "string" || raw.length > 300) return null;
  let u;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port || !HOSTS.has(u.hostname)) return null;
  let id = null;
  if (u.hostname === "youtu.be") {
    id = u.pathname.split("/")[1] ?? null;
  } else if (u.pathname === "/watch") {
    id = u.searchParams.get("v");
  } else {
    const m = /^\/(shorts|embed|live)\/([^/]+)/.exec(u.pathname);
    id = m ? m[2] : null;
  }
  return id && ID.test(id) ? id : null;
}

export const watchUrl = (id) => `https://www.youtube.com/watch?v=${id}`;

/** Is yt-dlp installed? */
export function ytdlpAvailable() {
  try {
    return spawnSync("yt-dlp", ["--version"], { timeout: 5000 }).status === 0;
  } catch {
    return false;
  }
}

/** Sliding-window limit per key (the main limiter's window is fixed at one minute, this one is hourly). */
export function createLimiter(max, windowMs) {
  const hits = new Map();
  return (key) => {
    const now = Date.now();
    const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    const limited = list.length >= max;
    if (!limited) list.push(now);
    hits.set(key, list);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
    return limited;
  };
}

function fail(code, message) {
  return Object.assign(new Error(message), { code });
}

/** Downloads the video to a temporary folder, reads it and always deletes the folder. Errors carry a `code`. */
export async function downloadVideo(id) {
  const dir = await mkdtemp(join(tmpdir(), "handsup-video-"));
  try {
    const args = [
      "--ignore-config",
      "--no-playlist",
      "--no-warnings",
      "--no-progress",
      "--no-cache-dir",
      "--match-filter", `duration <= ${MAX_SECONDS} & !is_live`,
      "--max-filesize", String(MAX_BYTES),
      // Video only (no audio is needed), mp4 up to 480p, H.264 first (plays everywhere), so no merging and a small file.
      "-f", "bv[height<=480][vcodec^=avc1][ext=mp4]/bv[height<=480][ext=mp4]/b[height<=480][ext=mp4]",
      "-o", join(dir, "video.%(ext)s"),
      "--", watchUrl(id),
    ];
    const out = await new Promise((resolve, reject) => {
      const child = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"], env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" } });
      let text = "";
      const grab = (d) => { if (text.length < 4000) text += d.toString(); };
      child.stdout.on("data", grab);
      child.stderr.on("data", grab);
      const timer = setTimeout(() => { child.kill("SIGKILL"); reject(fail("timeout", "timeout")); }, DOWNLOAD_TIMEOUT_MS);
      child.on("error", () => { clearTimeout(timer); reject(fail("unavailable", "yt-dlp is not installed")); });
      child.on("close", (status) => { clearTimeout(timer); resolve({ status, text }); });
    });
    const files = (await readdir(dir)).filter((f) => f.startsWith("video."));
    if (files.length === 0) {
      if (/does not pass filter|live event|is live/i.test(out.text)) throw fail("too-long", "too long or live");
      if (/File is larger than max-filesize/i.test(out.text)) throw fail("too-big", "too big");
      if (/Private video|unavailable|not available|removed|Sign in|age|copyright/i.test(out.text)) throw fail("not-available", "not available");
      throw fail("failed", "download failed");
    }
    const file = join(dir, files[0]);
    if ((await stat(file)).size > MAX_BYTES) throw fail("too-big", "too big");
    return await readFile(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// What the visitor is told for each failure.
export const MESSAGES = {
  "too-long": ["422", `That video is too long or live. Use a clip of up to ${MAX_SECONDS / 60} minutes.`],
  "too-big": ["413", "That video is too large. Use a shorter clip."],
  "not-available": ["404", "That video is not available (private, removed or restricted)."],
  timeout: ["504", "Getting the video took too long. Try a shorter clip."],
  unavailable: ["503", "Video links are not available on this server."],
  failed: ["502", "The video could not be downloaded."],
};
