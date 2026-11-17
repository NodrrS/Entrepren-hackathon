import { describe, expect, it } from "vitest";
import { ClosureDecoder, argmaxRows } from "../src";

interface Case {
  posteriors: number[][];
  chunk: number;
  emitted: [number, number][];
  finalized: [number, number][];
}
import raw from "./fixtures/decoder.json";
const fx = raw as unknown as { cases: Case[] };

describe("ClosureDecoder vs thesis StreamingGreedyDecoder (closure)", () => {
  it.each(fx.cases.map((c, i) => [i, c] as const))("case %i", (_, c) => {
    const d = new ClosureDecoder(0);
    const V = c.posteriors[0]!.length;
    const got: [number, number][] = [];
    for (let k = 0; k * c.chunk < c.posteriors.length; k++) {
      const rows = c.posteriors.slice(k * c.chunk, (k + 1) * c.chunk);
      const labels = argmaxRows(rows.flat(), rows.length, V);
      for (const e of d.push(labels, (k + 1) * 8)) got.push([e.id, e.emitFrame]);
    }
    expect(got).toEqual(c.emitted);
    const fin = d.finalize((c.posteriors.length / c.chunk) * 8).map((e) => [e.id, e.emitFrame]);
    expect(fin).toEqual(c.finalized);
  });

  it("merges repeats and skips blanks", () => {
    const d = new ClosureDecoder(0);
    expect(d.push([0, 3, 3, 0], 8).map((e) => e.id)).toEqual([3]);
    expect(d.push([3, 3, 3, 3], 16)).toEqual([]);
    // a blank separates two runs of the same gloss (CTC), so 3 is emitted twice
    expect(d.push([4, 4, 0, 0], 24).map((e) => e.id)).toEqual([3, 4]);
    expect(d.emittedIds).toEqual([3, 3, 4]);
  });
});
