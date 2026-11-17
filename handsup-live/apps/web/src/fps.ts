/**
 * FPS and latency meter over a sliding time window (default 1 s). Bounded: it keeps at most
 * `maxSamples` timestamps.
 */
export class FpsMeter {
  private readonly times: number[] = [];
  private readonly latencies: number[] = [];

  constructor(
    private readonly windowMs = 1000,
    private readonly maxSamples = 240,
  ) {}

  /** Record one processed frame at time `t` (ms) with an optional inference latency. */
  tick(t: number, inferenceMs?: number): void {
    this.times.push(t);
    this.latencies.push(inferenceMs ?? Number.NaN);
    while (this.times.length > this.maxSamples || (this.times.length > 0 && t - this.times[0]! > this.windowMs)) {
      this.times.shift();
      this.latencies.shift();
    }
  }

  /** Frames per second over the window (0 with fewer than 2 samples). */
  get fps(): number {
    const n = this.times.length;
    if (n < 2) return 0;
    const span = this.times[n - 1]! - this.times[0]!;
    return span > 0 ? ((n - 1) * 1000) / span : 0;
  }

  /** Mean inference latency in ms over the window (NaN if none recorded). */
  get meanInferenceMs(): number {
    const vals = this.latencies.filter(Number.isFinite);
    return vals.length === 0 ? Number.NaN : vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  reset(): void {
    this.times.length = 0;
    this.latencies.length = 0;
  }
}
