/**
 * Resample a variable-rate frame stream (camera + MediaPipe, often 15 to 30 FPS) to the 25 FPS
 * the model was trained on (PHOENIX-2014 is 25 FPS; one chunk = 8 frames = 0.32 s).
 *
 * Output tick k is at t0 + k * 40 ms. For each tick the input frame nearest in time is used
 * (sample and hold, no interpolation, so presence flags stay exact). Faster input drops frames,
 * slower input repeats them. A gap longer than `maxGapMs` (tab paused, camera stall) resets the
 * clock, and the caller should reset the model state too (onGap).
 */
export interface Timed<T> {
  readonly t: number;
  readonly value: T;
}

export class FrameResampler<T> {
  private t0 = 0;
  private k = 0;
  private prev: Timed<T> | null = null;
  readonly periodMs: number;

  constructor(
    readonly fps = 25,
    private readonly maxGapMs = 1000,
  ) {
    this.periodMs = 1000 / fps;
  }

  reset(): void {
    this.prev = null;
    this.k = 0;
  }

  /** Push one input frame; returns the output frames (with their tick times) now due. */
  push(t: number, value: T): { frames: Timed<T>[]; gap: boolean } {
    const frames: Timed<T>[] = [];
    let gap = false;
    if (this.prev && (t - this.prev.t > this.maxGapMs || t < this.prev.t)) {
      gap = true;
      this.reset();
    }
    if (!this.prev) {
      this.t0 = t;
      this.k = 1;
      this.prev = { t, value };
      frames.push({ t, value });
      return { frames, gap };
    }
    for (let tick = this.t0 + this.k * this.periodMs; tick <= t; tick = this.t0 + this.k * this.periodMs) {
      const usePrev = tick - this.prev.t < t - tick;
      frames.push({ t: tick, value: usePrev ? this.prev.value : value });
      this.k++;
    }
    this.prev = { t, value };
    return { frames, gap };
  }
}
