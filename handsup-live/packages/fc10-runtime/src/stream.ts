/**
 * Streaming recogniser: raw frames (any rate) -> 25 FPS -> normalised -> chunks of 8 frames ->
 * one model step each (explicit KV cache) -> closure decoding -> glosses.
 *
 * Mirrors the thesis loop (src/evaluation/stream_eval.py stream_clip) for whole chunks. The model
 * call is injected (StepRunner), so this file has no onnxruntime dependency and runs in tests.
 * Steps are run strictly in order (the cache is sequential); chunks that arrive while a step is
 * running wait in a queue, and `backlog` tells the UI when the device is too slow.
 */
import { ClosureDecoder, argmaxRows } from "./decoder";
import { MODEL_VALUES, type RawFrame } from "./layout";
import { StreamingNormalizer } from "./normalize";
import { FrameResampler } from "./resample";

export const FC10 = {
  stride: 2,
  C: 4,
  rawFramesPerChunk: 8,
  layers: 6,
  heads: 4,
  cacheFrames: 32, // L_c 8 chunks x C 4
  headDim: 64,
  vocabSize: 1233,
  fps: 25,
} as const;

export const CACHE_VALUES = FC10.layers * FC10.heads * FC10.cacheFrames * FC10.headDim;

export interface StepInput {
  readonly x: Float32Array; // [1, 8, 51, 4]
  readonly kCache: Float32Array; // [6, 1, 4, 32, 64]
  readonly vCache: Float32Array;
  readonly pos: number; // encoder frames consumed (multiple of 4)
}
export interface StepOutput {
  readonly logits: Float32Array; // [1, 4, 1233]
  readonly kCache: Float32Array;
  readonly vCache: Float32Array;
}
export interface StepRunner {
  run(input: StepInput): Promise<StepOutput>;
}

export interface GlossEvent {
  readonly type: "gloss";
  readonly id: number;
  /** Time (ms, same clock as the input) of the last frame of the chunk that closed the gloss. */
  readonly chunkEndT: number;
  /** When the gloss became available (ms, performance.now clock of the runner). */
  readonly at: number;
}
export interface StepEvent {
  readonly type: "step";
  readonly computeMs: number;
  /** From the capture of the chunk's last frame to the end of its model step. */
  readonly delayMs: number;
  readonly backlog: number;
  readonly labels: readonly number[];
}
export type StreamEvent = GlossEvent | StepEvent | { readonly type: "reset"; readonly reason: string };

export interface StreamOptions {
  readonly runner: StepRunner;
  readonly now?: () => number;
  readonly fps?: number;
}

export class Fc10Stream {
  private readonly runner: StepRunner;
  private readonly now: () => number;
  private readonly resampler: FrameResampler<RawFrame>;
  private readonly normalizer = new StreamingNormalizer(0.9);
  private readonly decoder = new ClosureDecoder(0);
  private chunk: Float32Array = new Float32Array(FC10.rawFramesPerChunk * MODEL_VALUES);
  private inChunk = 0;
  private kCache: Float32Array = new Float32Array(CACHE_VALUES);
  private vCache: Float32Array = new Float32Array(CACHE_VALUES);
  private pos = 0;
  private rawFrames = 0;
  private queue: { x: Float32Array; endT: number; endFrame: number; epoch: number }[] = [];
  private running = false;
  private epoch = 0;
  private readonly listeners = new Set<(e: StreamEvent) => void>();

  constructor(opts: StreamOptions) {
    this.runner = opts.runner;
    this.now = opts.now ?? (() => performance.now());
    this.resampler = new FrameResampler<RawFrame>(opts.fps ?? FC10.fps);
  }

  on(l: (e: StreamEvent) => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  get backlog(): number {
    return this.queue.length + (this.running ? 1 : 0);
  }

  /** Feed one frame with its capture time (ms). */
  push(t: number, frame: RawFrame): void {
    const { frames, gap } = this.resampler.push(t, frame);
    if (gap) this.resetModel("gap");
    for (const f of frames) this.pushResampled(f.t, f.value);
  }

  /** Feed a frame that is already at 25 FPS (demo clips). */
  pushResampled(t: number, frame: RawFrame): void {
    const off = this.inChunk * MODEL_VALUES;
    this.normalizer.step(frame, this.chunk.subarray(off, off + MODEL_VALUES));
    this.inChunk++;
    this.rawFrames++;
    if (this.inChunk === FC10.rawFramesPerChunk) {
      this.queue.push({ x: this.chunk, endT: t, endFrame: this.rawFrames, epoch: this.epoch });
      this.chunk = new Float32Array(FC10.rawFramesPerChunk * MODEL_VALUES);
      this.inChunk = 0;
      void this.drain();
    }
  }

  /** Start a new utterance: clear the cache, the normaliser EMA, the decoder and the clock. */
  reset(reason = "reset"): void {
    this.resampler.reset();
    this.resetModel(reason);
  }

  /** Flush the open gloss (Stop pressed or clip ended). */
  finalize(): void {
    const t = this.now();
    for (const e of this.decoder.finalize(this.rawFrames)) this.emit({ type: "gloss", id: e.id, chunkEndT: t, at: t });
  }

  private resetModel(reason: string): void {
    this.epoch++;
    this.queue = [];
    this.normalizer.reset();
    this.decoder.reset();
    this.kCache = new Float32Array(CACHE_VALUES);
    this.vCache = new Float32Array(CACHE_VALUES);
    this.pos = 0;
    this.inChunk = 0;
    this.rawFrames = 0;
    this.emit({ type: "reset", reason });
  }

  /** Resolves when every queued chunk has been processed (tests, demo end). */
  async idle(): Promise<void> {
    while (this.running || this.queue.length) await new Promise((r) => setTimeout(r, 1));
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length) {
        const job = this.queue.shift()!;
        const t0 = this.now();
        const out = await this.runner.run({ x: job.x, kCache: this.kCache, vCache: this.vCache, pos: this.pos });
        const t1 = this.now();
        if (job.epoch !== this.epoch) continue; // reset while the step was running
        this.kCache = out.kCache;
        this.vCache = out.vCache;
        this.pos += FC10.C;
        const labels = argmaxRows(out.logits, FC10.C, FC10.vocabSize);
        this.emit({ type: "step", computeMs: t1 - t0, delayMs: t1 - job.endT, backlog: this.queue.length, labels });
        for (const e of this.decoder.push(labels, job.endFrame)) this.emit({ type: "gloss", id: e.id, chunkEndT: job.endT, at: t1 });
      }
    } finally {
      this.running = false;
    }
  }

  private emit(e: StreamEvent): void {
    for (const l of this.listeners) l(e);
  }
}
