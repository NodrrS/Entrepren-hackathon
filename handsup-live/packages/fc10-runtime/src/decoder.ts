/**
 * Port of the thesis StreamingGreedyDecoder, "closure" rule (src/inference/streaming_decoder.py):
 * greedy CTC on per-frame argmax labels; a gloss is emitted once a later frame carries a
 * different label (so emissions are never revised), and the open one is flushed by finalize().
 * Only the argmax is used, so logits can be passed directly (softmax does not change it).
 */
export interface Emission {
  readonly id: number;
  /** Raw (25 fps) frames consumed when the gloss was emitted. */
  readonly emitFrame: number;
}

export function argmaxRows(values: Float32Array | readonly number[], rows: number, cols: number): number[] {
  const out: number[] = [];
  for (let r = 0; r < rows; r++) {
    let best = 0;
    let bestV = -Infinity;
    for (let c = 0; c < cols; c++) {
      const v = values[r * cols + c]!;
      if (v > bestV) {
        bestV = v;
        best = c;
      }
    }
    out.push(best);
  }
  return out;
}

export class ClosureDecoder {
  private readonly emitted: Emission[] = [];
  private readonly collapsed: number[] = [];
  private runOpen = false;
  private prevLabel: number | null = null;

  constructor(private readonly blank = 0) {}

  get emittedIds(): number[] {
    return this.emitted.map((e) => e.id);
  }

  /** Labels (argmax) of the next chunk's frames; returns the newly emitted glosses. */
  push(labels: readonly number[], emitFrame: number): Emission[] {
    for (const label of labels) {
      if (label !== this.prevLabel) {
        this.runOpen = label !== this.blank;
        if (this.runOpen) this.collapsed.push(label);
      }
      this.prevLabel = label;
    }
    return this.emitReady(emitFrame, false);
  }

  finalize(emitFrame: number): Emission[] {
    return this.emitReady(emitFrame, true);
  }

  reset(): void {
    this.emitted.length = 0;
    this.collapsed.length = 0;
    this.runOpen = false;
    this.prevLabel = null;
  }

  private emitReady(emitFrame: number, final: boolean): Emission[] {
    const out: Emission[] = [];
    while (this.emitted.length < this.collapsed.length) {
      const n = this.emitted.length;
      const lastAndOpen = this.runOpen && n === this.collapsed.length - 1;
      if (!final && lastAndOpen) break;
      const e = { id: this.collapsed[n]!, emitFrame };
      this.emitted.push(e);
      out.push(e);
    }
    return out;
  }
}
