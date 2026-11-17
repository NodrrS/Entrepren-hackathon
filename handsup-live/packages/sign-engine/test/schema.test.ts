import { describe, expect, it } from "vitest";
import {
  BODY_PARTS,
  CHANNELS,
  PART_LAYOUT,
  POINT_COUNT,
  POSE_LEFT_RIGHT_PAIRS,
  VALUE_COUNT,
  getPoint,
  validateFrame,
  valueIndex,
} from "../src/index";
import { syntheticFrame } from "./helpers";

describe("hu-landmarks/v1 layout", () => {
  it("has 543 points: face 468 + pose 33 + left hand 21 + right hand 21, contiguous", () => {
    expect(POINT_COUNT).toBe(543);
    expect(VALUE_COUNT).toBe(543 * 3);
    expect(PART_LAYOUT.face).toEqual({ offset: 0, count: 468 });
    expect(PART_LAYOUT.pose).toEqual({ offset: 468, count: 33 });
    expect(PART_LAYOUT.leftHand).toEqual({ offset: 501, count: 21 });
    expect(PART_LAYOUT.rightHand).toEqual({ offset: 522, count: 21 });
    let next = 0;
    for (const p of BODY_PARTS) {
      expect(PART_LAYOUT[p].offset).toBe(next);
      next += PART_LAYOUT[p].count;
    }
    expect(next).toBe(POINT_COUNT);
  });

  it("indexes points and rejects out-of-range indices", () => {
    expect(valueIndex("face", 0)).toBe(0);
    expect(valueIndex("pose", 0)).toBe(468 * CHANNELS);
    expect(valueIndex("rightHand", 20)).toBe(542 * CHANNELS);
    expect(() => valueIndex("leftHand", 21)).toThrow(RangeError);
    expect(() => valueIndex("face", -1)).toThrow(RangeError);
    expect(() => valueIndex("pose", 1.5)).toThrow(RangeError);
  });

  it("pose left/right pairs cover 1..32 exactly once", () => {
    const seen = POSE_LEFT_RIGHT_PAIRS.flat().sort((a, b) => a - b);
    expect(seen).toEqual(Array.from({ length: 32 }, (_, i) => i + 1));
  });
});

describe("validateFrame", () => {
  it("accepts a well-formed frame", () => {
    expect(validateFrame(syntheticFrame())).toEqual([]);
  });

  it("accepts absent parts as NaN", () => {
    const f = syntheticFrame({ parts: ["pose"] });
    expect(validateFrame(f)).toEqual([]);
    expect(getPoint(f.points, "leftHand", 0).every(Number.isNaN)).toBe(true);
  });

  it("flags presence that disagrees with the data", () => {
    const f = syntheticFrame({ parts: ["pose"] });
    const bad = { ...f, presence: { ...f.presence, leftHand: true } };
    expect(validateFrame(bad)).toContain("leftHand is marked present but has no finite values");
    const bad2 = { ...f, presence: { ...f.presence, pose: false } };
    expect(validateFrame(bad2)).toContain("pose is marked absent but has finite values");
  });

  it("flags wrong buffer sizes and schema", () => {
    const f = syntheticFrame();
    expect(validateFrame({ ...f, points: new Float32Array(10) })).toContain(`points must be a Float32Array of length ${VALUE_COUNT}`);
    expect(validateFrame({ ...f, schema: "hu-landmarks/v0" as never })).toContain("schema must be hu-landmarks/v1");
    expect(validateFrame({ ...f, image: { width: 0, height: 1, mirrored: false } })).toContain("image width and height must be > 0");
  });
});
