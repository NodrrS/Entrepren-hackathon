import { describe, expect, it } from "vitest";
import {
  Emitter,
  FeatureRing,
  allPointsOf,
  createManualSegmenter,
  createNormaliser,
  createPointSubsetFeatures,
  resampleWindow,
  softmax,
  topK,
} from "../src/index";
import { syntheticFrame } from "./helpers";

describe("point-subset feature extractor", () => {
  it("selects points, fills NaN and appends presence flags", () => {
    const fx = createPointSubsetFeatures({ id: "test@1", points: [["leftHand", 0], ["rightHand", 0]], channels: 2, fillValue: -9 });
    expect(fx.featureSize).toBe(2 * 2 + 2);
    const n = createNormaliser().normalise(syntheticFrame({ parts: ["pose", "leftHand"] }));
    const v = Array.from(fx.extract(n));
    expect(v[0]).toBeCloseTo(1);
    expect(v[1]).toBeCloseTo(-0.25);
    expect(v.slice(2)).toEqual([-9, -9, 1, 0]);
  });

  it("supports xyz, no flags, and validates indices and output size", () => {
    const fx = createPointSubsetFeatures({ id: "hands@1", points: allPointsOf("leftHand", "rightHand"), channels: 3, presenceFlags: false });
    expect(fx.featureSize).toBe(42 * 3);
    expect(() => createPointSubsetFeatures({ id: "x", points: [["pose", 33]] })).toThrow(RangeError);
    const n = createNormaliser().normalise(syntheticFrame());
    expect(() => fx.extract(n, new Float32Array(3))).toThrow(RangeError);
  });
});

describe("FeatureRing (bounded buffer)", () => {
  it("keeps the newest `capacity` frames in order", () => {
    const r = new FeatureRing(3, 2);
    for (let t = 0; t < 5; t++) r.push(Float32Array.of(t, t * 10), t * 100);
    expect(r.length).toBe(3);
    const s = r.snapshot();
    expect(Array.from(s.data)).toEqual([2, 20, 3, 30, 4, 40]);
    expect(s).toMatchObject({ frames: 3, startMs: 200, endMs: 400 });
    r.clear();
    expect(r.snapshot().frames).toBe(0);
  });

  it("rejects bad sizes", () => {
    expect(() => new FeatureRing(0, 2)).toThrow(RangeError);
    expect(() => new FeatureRing(2, 2).push(new Float32Array(3), 0)).toThrow(RangeError);
  });
});

describe("resampleWindow", () => {
  it("down- and up-samples by nearest frame", () => {
    const data = Float32Array.of(0, 1, 2, 3, 4, 5, 6, 7); // 8 frames x 1 feature
    expect(Array.from(resampleWindow(data, 8, 1, 4))).toEqual([1, 3, 5, 7]);
    expect(Array.from(resampleWindow(Float32Array.of(0, 1), 2, 1, 4))).toEqual([0, 0, 1, 1]);
    expect(Array.from(resampleWindow(Float32Array.of(5, 6), 1, 2, 2))).toEqual([5, 6, 5, 6]);
    expect(() => resampleWindow(new Float32Array(0), 0, 1, 4)).toThrow(RangeError);
  });
});

describe("softmax / topK", () => {
  it("softmax is stable and sums to 1", () => {
    const p = softmax([1000, 1000, 0]);
    expect(p[0]).toBeCloseTo(0.5);
    expect(p[0]! + p[1]! + p[2]!).toBeCloseTo(1);
  });

  it("returns the top-k sorted with confidence", () => {
    const labels = ["A", "B", "C", "D"];
    const r = topK([0.1, 3, 2, -1], labels, 3);
    expect(r.map((x) => x.label)).toEqual(["B", "C", "A"]);
    expect(r[0]!.confidence).toBeGreaterThan(r[1]!.confidence);
    expect(r[0]!.index).toBe(1);
    const probs = topK([0.2, 0.5, 0.3, 0], labels, 10, "probabilities");
    expect(probs).toHaveLength(4);
    expect(probs[0]).toEqual({ label: "B", index: 1, confidence: 0.5 });
    expect(() => topK([1], labels, 1)).toThrow(RangeError);
    expect(() => topK([1, 2, 3, 4], labels, 0)).toThrow(RangeError);
  });

  it("breaks ties by lower index", () => {
    expect(topK([1, 1], ["A", "B"], 2).map((x) => x.label)).toEqual(["A", "B"]);
  });
});

describe("Emitter", () => {
  it("delivers to all listeners even if one throws, and unsubscribes", () => {
    const e = new Emitter<[number]>();
    const got: number[] = [];
    const orig = console.error;
    console.error = () => {};
    try {
      e.on(() => {
        throw new Error("boom");
      });
      const off = e.on((n) => got.push(n));
      e.emit(1);
      off();
      e.emit(2);
    } finally {
      console.error = orig;
    }
    expect(got).toEqual([1]);
    expect(e.size).toBe(1);
  });
});

describe("manual (press-to-sign) segmenter", () => {
  const frame = (t: number) => createNormaliser().normalise(syntheticFrame({ timestampMs: t }));

  it("emits start and end on the next frames", () => {
    const s = createManualSegmenter();
    expect(s.push(frame(0))).toBeNull();
    s.begin();
    expect(s.push(frame(10))).toEqual({ type: "start", atMs: 10 });
    expect(s.active).toBe(true);
    expect(s.push(frame(20))).toBeNull();
    s.end();
    expect(s.push(frame(30))).toEqual({ type: "end", startMs: 10, endMs: 30 });
    expect(s.active).toBe(false);
  });

  it("cancel abandons the segment; begin+end before a frame yields nothing", () => {
    const s = createManualSegmenter();
    s.begin();
    s.push(frame(0));
    s.cancel();
    expect(s.push(frame(5))).toEqual({ type: "cancel", atMs: 5 });
    s.begin();
    s.end();
    expect(s.push(frame(6))).toBeNull();
    expect(s.active).toBe(false);
  });
});
