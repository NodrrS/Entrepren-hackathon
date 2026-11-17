import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs module without types
import { buildMessages, cleanSentence } from "../server/rewrite-prompt.mjs";

describe("cleanSentence", () => {
  it("strips reasoning blocks, quotes and line breaks", () => {
    expect(cleanSentence('<think>hmm\nlet me see</think>\n"It will rain\nin the north."')).toBe("It will rain in the north.");
    expect(cleanSentence("„Morgen regnet es.“")).toBe("Morgen regnet es.");
    expect(cleanSentence("<think>never closed")).toBe("");
    expect(cleanSentence(undefined)).toBe("");
  });
});

describe("buildMessages", () => {
  it("ends with the real line and uses the language's examples", () => {
    const en = buildMessages("A B", "a · b", "en");
    expect(en[0].role).toBe("system");
    expect(en.at(-1)).toEqual({ role: "user", content: "Glosses: A B\nWord hints: a · b" });
    expect(en.at(-2).role).toBe("assistant");
    const de = buildMessages("A B", "", "de");
    expect(de.at(-1).content).toBe("Glosses: A B");
    expect(de[0].content).toContain("Deutschen Gebärdensprache");
  });
});

// The real server, run as a child process against a stub OpenAI-style gateway.
type Stub = { server: Server; url: string; seen: Array<{ auth: string | undefined; body: any }>; mode: { current: "ok" | "error" | "slow" | "think" } };

async function startStub(): Promise<Stub> {
  const seen: Stub["seen"] = [];
  const mode: Stub["mode"] = { current: "ok" };
  const server = createServer(async (req: IncomingMessage, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    if (req.url?.endsWith("/models")) { res.writeHead(200, { "Content-Type": "application/json" }); return res.end('{"data":[]}'); }
    seen.push({ auth: req.headers.authorization, body: JSON.parse(Buffer.concat(chunks).toString() || "{}") });
    if (mode.current === "error") { res.writeHead(500); return res.end("boom"); }
    const reply = () => {
      const content = mode.current === "think" ? '<think>x</think>"Hello there."' : "Hello there.";
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content } }] }));
    };
    if (mode.current === "slow") return void setTimeout(reply, 2000);
    reply();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`, seen, mode };
}

async function startDemo(env: Record<string, string>): Promise<{ proc: ChildProcess; base: string }> {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const proc = spawn(process.execPath, ["server/index.mjs"], {
    env: { PATH: process.env.PATH ?? "", PORT: String(port), HOST: "127.0.0.1", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("server did not start")), 8000);
    proc.stdout!.on("data", (d: Buffer) => { if (d.toString().includes("Hands Up demo on")) { clearTimeout(t); resolve(); } });
    proc.on("exit", () => reject(new Error("server exited")));
  });
  return { proc, base: `http://127.0.0.1:${port}` };
}

const post = (base: string, body: unknown, headers: Record<string, string> = { "Content-Type": "application/json" }) =>
  fetch(`${base}/api/rewrite`, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });

describe("POST /api/rewrite", () => {
  const cleanup: Array<() => void> = [];
  afterEach(() => { while (cleanup.length) cleanup.pop()!(); });

  async function setup(extra: Record<string, string> = {}) {
    const stub = await startStub();
    const demo = await startDemo({ LLM_BASE_URL: stub.url, LLM_API_KEY: "secret-test-key", LLM_MODEL: "test-model", ...extra });
    cleanup.push(() => { demo.proc.kill(); stub.server.close(); });
    await new Promise((r) => setTimeout(r, 100)); // let the start-up warm-up call finish
    stub.seen.length = 0;
    return { stub, base: demo.base };
  }

  it("returns the cleaned sentence and calls the gateway with the key, model and examples", async () => {
    const { stub, base } = await setup();
    stub.mode.current = "think";
    const res = await post(base, { glosses: "MORGEN WETTER", hints: "tomorrow · weather", lang: "en" });
    expect(res.status).toBe(200);
    const text = await res.text();
    const data = JSON.parse(text);
    expect(data.sentence).toBe("Hello there.");
    expect(typeof data.ms).toBe("number");
    expect(text).not.toContain("secret-test-key");
    expect(stub.seen).toHaveLength(1);
    expect(stub.seen[0]!.auth).toBe("Bearer secret-test-key");
    expect(stub.seen[0]!.body.model).toBe("test-model");
    expect(stub.seen[0]!.body.temperature).toBe(0);
    expect(stub.seen[0]!.body.messages.at(-1).content).toBe("Glosses: MORGEN WETTER\nWord hints: tomorrow · weather");
  });

  it("rejects bad requests", async () => {
    const { base } = await setup();
    expect((await post(base, { glosses: "", lang: "en" })).status).toBe(400);
    expect((await post(base, { glosses: "A", lang: "fr" })).status).toBe(400);
    expect((await post(base, { glosses: "A".repeat(401), lang: "en" })).status).toBe(400);
    expect((await post(base, "not json")).status).toBe(400);
    expect((await post(base, { glosses: "A", lang: "en" }, { "Content-Type": "text/plain" })).status).toBe(415);
    expect((await fetch(`${base}/api/rewrite`)).status).toBe(405);
  });

  it("answers 502 when the gateway fails and 504 when it is too slow", async () => {
    const { stub, base } = await setup({ LLM_TIMEOUT_MS: "300" });
    stub.mode.current = "error";
    expect((await post(base, { glosses: "A", lang: "en" })).status).toBe(502);
    stub.mode.current = "slow";
    expect((await post(base, { glosses: "A", lang: "en" })).status).toBe(504);
  });

  it("answers 503 and reports llm:false when no key is set", async () => {
    const stub = await startStub();
    const demo = await startDemo({ LLM_BASE_URL: stub.url });
    cleanup.push(() => { demo.proc.kill(); stub.server.close(); });
    expect((await post(demo.base, { glosses: "A", lang: "en" })).status).toBe(503);
    const health = (await (await fetch(`${demo.base}/api/health`)).json()) as { llm: boolean };
    expect(health.llm).toBe(false);
  });

  it("reports llm:true in /api/health when the gateway answers", async () => {
    const { base } = await setup();
    expect(((await (await fetch(`${base}/api/health`)).json()) as { llm: boolean }).llm).toBe(true);
  });
});
