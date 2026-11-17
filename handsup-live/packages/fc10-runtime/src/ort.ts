/**
 * onnxruntime-web runner for fc10_step.onnx (subpath "@handsup/fc10-runtime/ort").
 *
 * - The model bytes are passed in (the app fetches them from its own origin and checks the
 *   pinned SHA-256 first). The ORT WASM file is self-hosted (`wasmUrl`), never a CDN.
 * - Backend: WASM, single thread. fc10 needs about 2 to 3 ms per 0.32 s chunk on a laptop CPU,
 *   so WebGPU would not help (and would add a GPU read-back per step), and ORT's WebGPU build
 *   needs a 29.5 MB WASM file, over the 25 MiB per-file limit of Cloudflare Pages. Threads would
 *   need cross-origin isolation (COOP/COEP) for no gain at this size.
 */
import * as ort from "onnxruntime-web/wasm";
import { CACHE_VALUES, FC10, type StepInput, type StepOutput, type StepRunner } from "./stream";

export type OrtBackend = "wasm";

export interface OrtRunner extends StepRunner {
  readonly backend: OrtBackend;
  /** Median warm-up step time (ms). */
  readonly warmupMs: number;
  release(): Promise<void>;
}

export interface OrtRunnerOptions {
  readonly modelBytes: Uint8Array;
  /** Same-origin URL of ort-wasm-simd-threaded.wasm, e.g. "/ort/ort-wasm-simd-threaded.wasm".
   *  Only the .wasm is fetched; its JS glue is inside the onnxruntime-web bundle. */
  readonly wasmUrl: string;
  /** Optional: the .wasm bytes themselves (Node tests, where fetch cannot read files). */
  readonly wasmBinary?: Uint8Array;
  readonly warmupSteps?: number;
}

const X_DIMS = [1, FC10.rawFramesPerChunk, 51, 4];
const CACHE_DIMS = [FC10.layers, 1, FC10.heads, FC10.cacheFrames, FC10.headDim];

async function step(session: ort.InferenceSession, input: StepInput): Promise<StepOutput> {
  const feeds = {
    x: new ort.Tensor("float32", input.x as Float32Array<ArrayBuffer>, X_DIMS),
    k_cache: new ort.Tensor("float32", input.kCache as Float32Array<ArrayBuffer>, CACHE_DIMS),
    v_cache: new ort.Tensor("float32", input.vCache as Float32Array<ArrayBuffer>, CACHE_DIMS),
    pos: new ort.Tensor("int64", BigInt64Array.from([BigInt(input.pos)]), [1]),
  };
  const out = await session.run(feeds);
  return {
    logits: out["logits"]!.data as Float32Array,
    kCache: out["k_out"]!.data as Float32Array,
    vCache: out["v_out"]!.data as Float32Array,
  };
}

export async function createOrtRunner(opts: OrtRunnerOptions): Promise<OrtRunner> {
  ort.env.wasm.wasmPaths = { wasm: opts.wasmUrl };
  if (opts.wasmBinary) ort.env.wasm.wasmBinary = opts.wasmBinary;
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  const session = await ort.InferenceSession.create(opts.modelBytes, {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all",
  });
  // Warm-up on zeros (JIT, allocations), then report the median step time.
  let k: Float32Array = new Float32Array(CACHE_VALUES);
  let v: Float32Array = new Float32Array(CACHE_VALUES);
  const x = new Float32Array(FC10.rawFramesPerChunk * 51 * 4);
  const times: number[] = [];
  for (let i = 0; i < (opts.warmupSteps ?? 6); i++) {
    const t0 = performance.now();
    const out = await step(session, { x, kCache: k, vCache: v, pos: i * FC10.C });
    times.push(performance.now() - t0);
    k = out.kCache;
    v = out.vCache;
  }
  times.sort((a, b) => a - b);
  return {
    backend: "wasm",
    warmupMs: times[Math.floor(times.length / 2)] ?? Number.NaN,
    run: (input) => step(session, input),
    release: () => session.release(),
  };
}
