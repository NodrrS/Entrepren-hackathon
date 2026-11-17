/**
 * The demo clip through the real fc10 model (onnxruntime-web WASM in Node) must give the same glosses that
 * live.handsupai.com shows (docs/LIVE_DEMO_DEPLOY.md and AGENTS.md: MORGEN WETTER WIE-AUSSEHEN MITTWOCH ZEHNTE NOVEMBER).
 * Needs the gitignored model files (FC10_DIR, see handsup-live/README.md); skipped when they are not there.
 */
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FC10, Fc10Stream, makeLabeler } from "@handsup/fc10-runtime";
import { createOrtRunner } from "@handsup/fc10-runtime/ort";
import { parseDemoClips, type DemoClipFile } from "../src/lib/shared/demo";

const here = dirname(fileURLToPath(import.meta.url));
const dir = [process.env["FC10_DIR"], resolve(here, "../../../../HandsUp-models/fc10")].filter((d): d is string => !!d).find((d) => existsSync(join(d, "fc10_step.onnx")));

describe.skipIf(!dir)("demo clip through fc10", () => {
  it("reproduces the glosses of the live demo", async () => {
    const require = createRequire(import.meta.url);
    const wasmDir = dirname(require.resolve("onnxruntime-web/ort-wasm-simd-threaded.wasm"));
    const runner = await createOrtRunner({
      modelBytes: new Uint8Array(readFileSync(join(dir!, "fc10_step.onnx"))),
      wasmUrl: "ort-wasm-simd-threaded.wasm",
      wasmBinary: new Uint8Array(readFileSync(join(wasmDir, "ort-wasm-simd-threaded.wasm"))),
      warmupSteps: 1,
    });
    const itos = (JSON.parse(readFileSync(join(dir!, "fc10_vocab.json"), "utf8")) as { itos: string[] }).itos;
    const label = makeLabeler(itos);
    const clips = parseDemoClips(JSON.parse(readFileSync(join(dir!, "demo", "demo-clips.json"), "utf8")) as DemoClipFile);
    expect(clips.length).toBeGreaterThan(0);

    const clip = clips[0]!;
    const stream = new Fc10Stream({ runner });
    const glosses: string[] = [];
    stream.on((e) => {
      if (e.type !== "gloss") return;
      const g = label(e.id);
      if (!g.hidden) glosses.push(g.gloss);
    });
    clip.frames.forEach((f, i) => stream.pushResampled(i * (1000 / FC10.fps), f));
    await stream.idle();
    stream.finalize();
    await stream.idle();
    await runner.release();

    expect(glosses.join(" ")).toBe("MORGEN WETTER WIE-AUSSEHEN MITTWOCH ZEHNTE NOVEMBER");
  }, 60_000);
});
