import { spawn, type ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs module without types
import { createLimiter, parseVideoId, watchUrl } from "../server/video-link.mjs";

describe("parseVideoId", () => {
  const ID = "dQw4w9WgXcQ";
  it("accepts the YouTube link shapes", () => {
    expect(parseVideoId(`https://www.youtube.com/watch?v=${ID}`)).toBe(ID);
    expect(parseVideoId(`https://youtube.com/watch?v=${ID}&t=42s&list=PL123`)).toBe(ID);
    expect(parseVideoId(`https://m.youtube.com/watch?v=${ID}`)).toBe(ID);
    expect(parseVideoId(`https://youtu.be/${ID}?si=abc`)).toBe(ID);
    expect(parseVideoId(`https://www.youtube.com/shorts/${ID}`)).toBe(ID);
    expect(parseVideoId(`https://www.youtube.com/embed/${ID}`)).toBe(ID);
    expect(parseVideoId(`  https://youtu.be/${ID}  `)).toBe(ID);
  });

  it("rejects everything else", () => {
    for (const bad of [
      `http://www.youtube.com/watch?v=${ID}`, // not https
      `https://example.com/watch?v=${ID}`, // other host
      `https://youtube.com.evil.example/watch?v=${ID}`, // look-alike host
      `https://evil.example/https://www.youtube.com/watch?v=${ID}`,
      `https://user:pass@www.youtube.com/watch?v=${ID}`, // credentials
      `https://www.youtube.com:8443/watch?v=${ID}`, // port
      "https://www.youtube.com/playlist?list=PLabcdefghijk", // no video
      "https://www.youtube.com/watch?v=short",
      "https://www.youtube.com/watch?v=--exec=id%20", // option-like id
      "https://www.youtube.com/watch?v=dQw4w9WgXc;", // odd character
      `https://www.youtube.com/watch?v=${ID}x`, // too long
      "--exec=touch /tmp/x",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "",
      "x".repeat(400),
      undefined,
      42,
    ]) {
      expect(parseVideoId(bad as string), String(bad)).toBeNull();
    }
  });

  it("rebuilds the watch URL from the id only", () => {
    expect(watchUrl("dQw4w9WgXcQ")).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  });
});

describe("createLimiter", () => {
  it("allows `max` hits per key inside the window, then limits", () => {
    const limited = createLimiter(3, 60_000);
    expect([limited("a"), limited("a"), limited("a"), limited("a")]).toEqual([false, false, false, true]);
    expect(limited("b")).toBe(false); // another visitor is unaffected
  });
});

describe("POST /api/video", () => {
  let proc: ChildProcess | undefined;
  afterEach(() => { proc?.kill(); proc = undefined; });

  async function start(env: Record<string, string>) {
    const port = 20000 + Math.floor(Math.random() * 20000);
    proc = spawn(process.execPath, ["server/index.mjs"], { env: { PATH: process.env.PATH ?? "", PORT: String(port), HOST: "127.0.0.1", ...env }, stdio: ["ignore", "pipe", "pipe"] });
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("server did not start")), 8000);
      proc!.stdout!.on("data", (d: Buffer) => { if (d.toString().includes("Hands Up demo on")) { clearTimeout(t); resolve(); } });
      proc!.on("exit", () => reject(new Error("server exited")));
    });
    return `http://127.0.0.1:${port}`;
  }
  const post = (base: string, body: unknown) => fetch(`${base}/api/video`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  it("is off unless VIDEO_LINKS=on: 503 and links:false in /api/health", async () => {
    const base = await start({});
    expect((await post(base, { url: "https://youtu.be/dQw4w9WgXcQ" })).status).toBe(503);
    expect(((await (await fetch(`${base}/api/health`)).json()) as { links: boolean }).links).toBe(false);
  });

  it("when on, rejects bad links with 400 and wrong methods with 405 (no download is started)", async () => {
    const base = await start({ VIDEO_LINKS: "on" });
    const health = (await (await fetch(`${base}/api/health`)).json()) as { links: boolean };
    if (!health.links) return; // yt-dlp is not installed on this machine: the route stays off (covered above)
    expect((await post(base, { url: "https://example.com/watch?v=dQw4w9WgXcQ" })).status).toBe(400);
    expect((await post(base, { url: "--exec=id" })).status).toBe(400);
    expect((await post(base, {})).status).toBe(400);
    expect((await fetch(`${base}/api/video`)).status).toBe(405);
  });
});
