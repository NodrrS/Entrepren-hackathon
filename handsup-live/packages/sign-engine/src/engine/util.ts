import type { FeatureWindow, Prediction, Unsubscribe } from "./types";

/** Minimal synchronous event emitter. A throwing listener does not stop the others. */
export class Emitter<T extends unknown[]> {
  private readonly listeners = new Set<(...args: T) => void>();

  on(listener: (...args: T) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(...args: T): void {
    for (const l of [...this.listeners]) {
      try {
        l(...args);
      } catch (err) {
        // A listener bug must not break the real-time loop.
        console.error("sign-engine: listener threw", err);
      }
    }
  }

  get size(): number {
    return this.listeners.size;
  }

  clear(): void {
    this.listeners.clear();
  }
}

/**
 * Fixed-capacity ring buffer of feature vectors. When full, the oldest frame is overwritten, so
 * memory is bounded no matter how long a segment lasts (real-time rule: bounded buffers).
 */
export class FeatureRing {
  private readonly data: Float32Array;
  private readonly times: Float64Array;
  private head = 0;
  private count = 0;

  constructor(
    readonly capacity: number,
    readonly featureSize: number,
  ) {
    if (!Number.isInteger(capacity) || capacity <= 0) throw new RangeError("capacity must be a positive integer");
    if (!Number.isInteger(featureSize) || featureSize <= 0) throw new RangeError("featureSize must be a positive integer");
    this.data = new Float32Array(capacity * featureSize);
    this.times = new Float64Array(capacity);
  }

  get length(): number {
    return this.count;
  }

  push(features: Float32Array, timestampMs: number): void {
    if (features.length !== this.featureSize) throw new RangeError(`expected ${this.featureSize} features`);
    this.data.set(features, this.head * this.featureSize);
    this.times[this.head] = timestampMs;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
  }

  /** Copy the buffered frames, oldest first, into a new frame-major array. */
  snapshot(): { data: Float32Array; frames: number; startMs: number; endMs: number } {
    const frames = this.count;
    const out = new Float32Array(frames * this.featureSize);
    const first = (this.head - this.count + this.capacity) % this.capacity;
    for (let k = 0; k < frames; k++) {
      const slot = (first + k) % this.capacity;
      out.set(this.data.subarray(slot * this.featureSize, (slot + 1) * this.featureSize), k * this.featureSize);
    }
    const startMs = frames > 0 ? this.times[first]! : Number.NaN;
    const endMs = frames > 0 ? this.times[(first + frames - 1) % this.capacity]! : Number.NaN;
    return { data: out, frames, startMs, endMs };
  }
}

/**
 * Resample a frame-major window to exactly `targetFrames` by nearest-frame sampling (the
 * classifier's fixed input length). Throws on an empty window.
 */
export function resampleWindow(
  data: Float32Array,
  frames: number,
  features: number,
  targetFrames: number,
): Float32Array {
  if (frames <= 0) throw new RangeError("cannot resample an empty window");
  if (!Number.isInteger(targetFrames) || targetFrames <= 0) throw new RangeError("targetFrames must be a positive integer");
  const out = new Float32Array(targetFrames * features);
  for (let t = 0; t < targetFrames; t++) {
    // Map the centre of output frame t to the nearest input frame.
    const src = Math.min(frames - 1, Math.floor(((t + 0.5) * frames) / targetFrames));
    out.set(data.subarray(src * features, (src + 1) * features), t * features);
  }
  return out;
}

export function makeWindow(
  data: Float32Array,
  frames: number,
  features: number,
  startMs: number,
  endMs: number,
): FeatureWindow {
  return { data, frames, features, startMs, endMs };
}

/** Numerically stable softmax. */
export function softmax(scores: ArrayLike<number>): Float64Array {
  const out = new Float64Array(scores.length);
  let max = -Infinity;
  for (let i = 0; i < scores.length; i++) max = Math.max(max, scores[i]!);
  let sum = 0;
  for (let i = 0; i < scores.length; i++) {
    const e = Math.exp(scores[i]! - max);
    out[i] = e;
    sum += e;
  }
  for (let i = 0; i < out.length; i++) out[i] = out[i]! / sum;
  return out;
}

/**
 * Top-k predictions from raw scores. `kind: "logits"` applies softmax first; "probabilities"
 * uses the scores as given. Ties keep the lower index first.
 */
export function topK(
  scores: ArrayLike<number>,
  labels: readonly string[],
  k: number,
  kind: "logits" | "probabilities" = "logits",
): Prediction[] {
  if (scores.length !== labels.length) throw new RangeError(`got ${scores.length} scores for ${labels.length} labels`);
  if (!Number.isInteger(k) || k <= 0) throw new RangeError("k must be a positive integer");
  const probs = kind === "logits" ? softmax(scores) : Float64Array.from(scores as ArrayLike<number>);
  const idx = Array.from({ length: probs.length }, (_, i) => i);
  idx.sort((a, b) => probs[b]! - probs[a]! || a - b);
  return idx.slice(0, Math.min(k, idx.length)).map((i) => ({ label: labels[i]!, index: i, confidence: probs[i]! }));
}
