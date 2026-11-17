import { describe, expect, it } from "vitest";
import { HANDS_BODY, MODEL_VALUES, RAW_VALUES, StreamingNormalizer, type Presence4 } from "../src";

interface Fixture {
  indices: number[];
  T: number;
  raw: number[][][];
  present: boolean[][];
  expected: number[][][];
}
import raw from "./fixtures/normalize.json";
const fx = raw as unknown as Fixture;

describe("StreamingNormalizer vs thesis normalize_pose", () => {
  it("uses the thesis point order (hands then upper body)", () => {
    expect(HANDS_BODY).toEqual(fx.indices);
    expect(HANDS_BODY.length).toBe(51);
    expect(MODEL_VALUES).toBe(204);
  });

  it("matches the Python output frame by frame within 1e-5", () => {
    const n = new StreamingNormalizer(0.9);
    let maxDiff = 0;
    for (let t = 0; t < fx.T; t++) {
      const points = new Float32Array(RAW_VALUES);
      fx.raw[t]!.forEach((p, i) => points.set(p, i * 3));
      const out = n.step({ points, present: fx.present[t] as unknown as Presence4 });
      const exp = fx.expected[t]!.flat();
      for (let i = 0; i < MODEL_VALUES; i++) maxDiff = Math.max(maxDiff, Math.abs(out[i]! - exp[i]!));
    }
    expect(maxDiff).toBeLessThan(1e-5);
  });

  it("zeroes absent parts", () => {
    const n = new StreamingNormalizer();
    const points = new Float32Array(RAW_VALUES).fill(Number.NaN);
    const out = n.step({ points, present: [false, false, false, false] });
    expect([...out].every((v) => v === 0)).toBe(true);
  });

  it("reset() forgets the EMA", () => {
    const n = new StreamingNormalizer();
    const points = new Float32Array(RAW_VALUES).fill(0.5);
    points.set([0.4, 0.5, 0], 11 * 3);
    points.set([0.6, 0.5, 0], 12 * 3);
    const a = n.step({ points, present: [true, true, true, false] }).slice();
    points.set([0.3, 0.6, 0], 11 * 3);
    n.step({ points, present: [true, true, true, false] });
    n.reset();
    points.set([0.4, 0.5, 0], 11 * 3);
    const b = n.step({ points, present: [true, true, true, false] });
    expect([...b]).toEqual([...a]);
  });
});
