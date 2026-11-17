/**
 * onnxruntime-web (WASM) step vs onnxruntime Python on the same synthetic inputs (fixtures/step.json).
 * Needs the gitignored model: set FC10_ONNX, or it looks in ../../../HandsUp-models/fc10 (the
 * owner's machine layout). Skipped when the file is not there.
 */
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CACHE_VALUES } from "../src";
import { createOrtRunner } from "../src/ort";
import fx from "./fixtures/step.json";

const here = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const candidates = [process.env["FC10_ONNX"], resolve(here, "../../../../../../../HandsUp-models/fc10/fc10_step.onnx"), resolve(here, "../../../../HandsUp-models/fc10/fc10_step.onnx")];
const modelPath = candidates.find((p) => p && existsSync(p));

describe.skipIf(!modelPath)("fc10_step.onnx in onnxruntime-web", () => {
  it("matches onnxruntime CPU (Python) within 1e-4 over 3 cached steps", async () => {
    const require = createRequire(import.meta.url);
    const ortDist = dirname(require.resolve("onnxruntime-web/ort-wasm-simd-threaded.wasm"));
    const runner = await createOrtRunner({
      modelBytes: new Uint8Array(readFileSync(modelPath!)),
      wasmUrl: "ort-wasm-simd-threaded.wasm",
      wasmBinary: new Uint8Array(readFileSync(resolve(ortDist, "ort-wasm-simd-threaded.wasm"))),
      warmupSteps: 1,
    });
    let k: Float32Array = new Float32Array(CACHE_VALUES);
    let v: Float32Array = new Float32Array(CACHE_VALUES);
    let maxDiff = 0;
    for (let s = 0; s < fx.steps.length; s++) {
      const out = await runner.run({ x: Float32Array.from(fx.x[s]!), kCache: k, vCache: v, pos: s * 4 });
      k = out.kCache;
      v = out.vCache;
      const exp = fx.steps[s]!;
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 16; c++) maxDiff = Math.max(maxDiff, Math.abs(out.logits[r * 1233 + c]! - exp.logits_first16[r]![c]!));
        let best = 0;
        for (let c = 1; c < 1233; c++) if (out.logits[r * 1233 + c]! > out.logits[r * 1233 + best]!) best = c;
        expect(best).toBe(exp.argmax[r]);
      }
    }
    expect(maxDiff).toBeLessThan(1e-4);
    await runner.release();
  }, 60_000);
});
