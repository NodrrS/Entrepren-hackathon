import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs module without types
import { ICONS, buildSimplifyMessages, parseSimplify } from "../server/simplify-prompt.mjs";

describe("parseSimplify", () => {
  it("accepts a good answer, with reasoning blocks and text around the JSON", () => {
    const raw = '<think>x</think>Here: {"sentence":"1 tablet. Up to 3 times a day. €6.50.","tiles":[{"icon":"pill","value":"1","label":"tablet"},{"icon":"CLOCK","value":"3×","label":"max a day"},{"icon":"money","value":"€6.50","label":"price"}]}';
    const out = parseSimplify(raw);
    expect(out.sentence).toBe("1 tablet. Up to 3 times a day. €6.50.");
    expect(out.tiles.map((t: { icon: string }) => t.icon)).toEqual(["pill", "clock", "money"]);
  });

  it("keeps only valid tiles (known icon, short value, a label) and at most three", () => {
    const out = parseSimplify(JSON.stringify({
      sentence: "Ok.",
      tiles: [
        { icon: "rocket", value: "1", label: "x" }, // unknown icon
        { icon: "pill", value: "with water", label: "water" }, // value too long
        { icon: "pill", value: "2", label: "" }, // no label
        { icon: "yes", value: "yes", label: "ok" },
        { icon: "no", value: "no", label: "x" },
        { icon: "wait", value: "…", label: "wait" },
        { icon: "clock", value: "1", label: "extra" },
      ],
    }));
    expect(out.tiles.map((t: { icon: string }) => t.icon)).toEqual(["yes", "no", "wait"]);
  });

  it("returns null without a usable sentence", () => {
    for (const bad of [undefined, "", "no json here", "{broken", '{"sentence":""}', '{"tiles":[]}', 42]) expect(parseSimplify(bad as string)).toBeNull();
  });

  it("builds a prompt that ends with the staff text and lists the icons", () => {
    const m = buildSimplifyMessages("Hello there", "en");
    expect(m.at(-1)).toEqual({ role: "user", content: "Hello there" });
    expect(m[0].content).toContain(ICONS[0]);
  });
});

// ---- the real server against stubs
type Seen = { url: string; auth: string | undefined; ctype: string | undefined; body: Buffer };
async function startStub(handler: (req: IncomingMessage, body: Buffer, seen: Seen[]) => { status: number; body: string }) {
  const seen: Seen[] = [];
  const server: Server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks);
    seen.push({ url: req.url ?? "", auth: req.headers.authorization, ctype: req.headers["content-type"], body });
    const out = handler(req, body, seen);
    res.writeHead(out.status, { "Content-Type": "application/json" });
    res.end(out.body);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen };
}

async function startDemo(env: Record<string, string>) {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const proc: ChildProcess = spawn(process.execPath, ["server/index.mjs"], { env: { PATH: process.env.PATH ?? "", PORT: String(port), HOST: "127.0.0.1", ...env }, stdio: ["ignore", "pipe", "pipe"] });
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("server did not start")), 8000);
    proc.stdout!.on("data", (d: Buffer) => { if (d.toString().includes("Hands Up demo on")) { clearTimeout(t); resolve(); } });
    proc.on("exit", () => reject(new Error("server exited")));
  });
  return { proc, base: `http://127.0.0.1:${port}` };
}

// A tiny valid-looking WAV: RIFF header + 2000 bytes of silence.
const wav = () => { const b = Buffer.alloc(2044); b.write("RIFF", 0, "ascii"); b.write("WAVE", 8, "ascii"); return b; };

describe("POST /api/simplify", () => {
  const cleanup: Array<() => void> = [];
  afterEach(() => { while (cleanup.length) cleanup.pop()!(); });
  const post = (base: string, body: unknown) => fetch(`${base}/api/simplify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  it("returns validated tiles from the gateway's JSON", async () => {
    const answer = JSON.stringify({ sentence: "1 tablet. €6.50.", tiles: [{ icon: "pill", value: "1", label: "tablet" }, { icon: "bogus", value: "x", label: "y" }] });
    const gw = await startStub((req) => (req.url?.endsWith("/models") ? { status: 200, body: '{"data":[]}' } : { status: 200, body: JSON.stringify({ choices: [{ message: { content: answer } }] }) }));
    const demo = await startDemo({ LLM_BASE_URL: `${gw.url}/v1`, LLM_API_KEY: "k" });
    cleanup.push(() => { demo.proc.kill(); gw.server.close(); });
    const res = await post(demo.base, { text: "This one is €6.50", lang: "en" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sentence: "1 tablet. €6.50.", tiles: [{ icon: "pill", value: "1", label: "tablet" }] });
  });

  it("answers 502 on an unusable answer, 400 on bad input, 503 without a key", async () => {
    const gw = await startStub((req) => (req.url?.endsWith("/models") ? { status: 200, body: '{"data":[]}' } : { status: 200, body: JSON.stringify({ choices: [{ message: { content: "sorry, no JSON" } }] }) }));
    const demo = await startDemo({ LLM_BASE_URL: `${gw.url}/v1`, LLM_API_KEY: "k" });
    const off = await startDemo({});
    cleanup.push(() => { demo.proc.kill(); off.proc.kill(); gw.server.close(); });
    expect((await post(demo.base, { text: "hi", lang: "en" })).status).toBe(502);
    expect((await post(demo.base, { text: "", lang: "en" })).status).toBe(400);
    expect((await post(demo.base, { text: "hi", lang: "fr" })).status).toBe(400);
    expect((await post(off.base, { text: "hi", lang: "en" })).status).toBe(503);
  });
});

describe("POST /api/transcribe", () => {
  const cleanup: Array<() => void> = [];
  afterEach(() => { while (cleanup.length) cleanup.pop()!(); });
  const post = (base: string, lang: string, body: Buffer | string, type = "audio/wav") => fetch(`${base}/api/transcribe?lang=${lang}`, { method: "POST", headers: { "Content-Type": type }, body: typeof body === "string" ? body : new Uint8Array(body) });

  it("forwards the recording as multipart with the key and returns the text", async () => {
    const vc = await startStub(() => ({ status: 200, body: '{"text":" This costs six euros. "}' }));
    const demo = await startDemo({ VOICE_CONTROL_URL: vc.url, VOICE_CONTROL_API_KEY: "vc-secret" });
    cleanup.push(() => { demo.proc.kill(); vc.server.close(); });
    const res = await post(demo.base, "en", wav());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "This costs six euros." });
    const seen = vc.seen.find((s) => s.url === "/v1/audio/transcriptions")!;
    expect(seen.auth).toBe("Bearer vc-secret");
    expect(seen.ctype).toContain("multipart/form-data");
    const text = seen.body.toString("latin1");
    expect(text).toContain('name="file"');
    expect(text).toContain("RIFF");
    expect(text).toContain("English");
  });

  it("rejects bad input and maps a failing voice service to 502", async () => {
    const vc = await startStub(() => ({ status: 500, body: "{}" }));
    const demo = await startDemo({ VOICE_CONTROL_URL: vc.url });
    cleanup.push(() => { demo.proc.kill(); vc.server.close(); });
    expect((await post(demo.base, "fr", wav())).status).toBe(400);
    expect((await post(demo.base, "en", "nope")).status).toBe(400); // too small, not a WAV
    expect((await post(demo.base, "en", wav(), "text/plain")).status).toBe(415);
    expect((await post(demo.base, "en", Buffer.alloc(1024 * 1024 + 10, 1))).status).toBe(413);
    expect((await post(demo.base, "en", wav())).status).toBe(502);
  });
});

describe("POST /api/tts voices", () => {
  const cleanup: Array<() => void> = [];
  afterEach(() => { while (cleanup.length) cleanup.pop()!(); });
  const post = (base: string, body: unknown) => fetch(`${base}/api/tts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  it("sends the default voice, or the allow-listed character voice by id, and refuses anything else", async () => {
    const vc = await startStub(() => ({ status: 200, body: "RIFF-fake-audio" }));
    const demo = await startDemo({ VOICE_CONTROL_URL: vc.url });
    cleanup.push(() => { demo.proc.kill(); vc.server.close(); });
    const voices = () => vc.seen.filter((s) => s.url === "/v1/audio/speech").map((s) => JSON.parse(s.body.toString()).voice);

    expect((await post(demo.base, { text: "Hello", lang: "en" })).status).toBe(200);
    expect((await post(demo.base, { text: "Hallo", lang: "de", voice: "default" })).status).toBe(200);
    expect((await post(demo.base, { text: "Hello", lang: "en", voice: "snape" })).status).toBe(200);
    expect((await post(demo.base, { text: "Hello", lang: "en", voice: "c3po" })).status).toBe(200);
    expect(voices()).toEqual(["Ryan", "Aiden", "voice-1dbe708a4613", "voice-034233ea177a"]);

    for (const bad of ["Snape", "voice-ffd5e2be09ff", "MorganFreeman", "constructor", "__proto__", 1]) {
      expect((await post(demo.base, { text: "Hello", lang: "en", voice: bad })).status, String(bad)).toBe(400);
    }
    expect(voices()).toHaveLength(4); // nothing else reached the voice service
  });
});

describe("static files: /pharmacy/ data and byte ranges", () => {
  const cleanup: Array<() => void> = [];
  afterEach(() => { while (cleanup.length) cleanup.pop()!(); });

  it("serves the DGS data read-only, answers ranges, and never leaves the folder", async () => {
    const demo = await startDemo({});
    cleanup.push(() => demo.proc.kill());
    const json = await fetch(`${demo.base}/pharmacy/dgs/dgs.json`);
    expect(json.status).toBe(200);
    expect(json.headers.get("content-type")).toContain("application/json");

    const full = await fetch(`${demo.base}/pharmacy/dgs/HALLO.mp4`);
    expect(full.status).toBe(200);
    expect(full.headers.get("content-type")).toBe("video/mp4");
    expect(full.headers.get("accept-ranges")).toBe("bytes");
    const size = Number(full.headers.get("content-length"));
    await full.arrayBuffer();

    const part = await fetch(`${demo.base}/pharmacy/dgs/HALLO.mp4`, { headers: { Range: "bytes=10-19" } });
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe(`bytes 10-19/${size}`);
    expect((await part.arrayBuffer()).byteLength).toBe(10);
    expect((await fetch(`${demo.base}/pharmacy/dgs/HALLO.mp4`, { headers: { Range: `bytes=${size}-` } })).status).toBe(416);

    for (const p of ["/pharmacy/%2e%2e/%2e%2e/demo/package.json", "/pharmacy/..%2f..%2fdemo%2fpackage.json", "/pharmacy/dgs/", "/pharmacy/nope.json"]) {
      expect([403, 404], p).toContain((await fetch(`${demo.base}${p}`)).status); // refused or not found: never served
    }
  });
});
