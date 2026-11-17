import { describe, expect, it } from "vitest";
import { getPoint, holisticResultToFrame, validateFrame, type MpLandmark } from "../src/index";

const pts = (n: number, x = 0.5): MpLandmark[] =>
  Array.from({ length: n }, (_, i) => ({ x, y: i / 1000, z: 0.001 * i, visibility: 0.9 }));

const meta = { frameIndex: 3, timestampMs: 100, image: { width: 640, height: 480, mirrored: false } };

describe("holisticResultToFrame (MediaPipe Tasks HolisticLandmarker -> hu-landmarks/v1)", () => {
  it("drops the 10 iris points (478 -> 468) and maps every part", () => {
    const f = holisticResultToFrame(
      { faceLandmarks: [pts(478)], poseLandmarks: [pts(33)], leftHandLandmarks: [pts(21, 0.7)], rightHandLandmarks: [pts(21, 0.3)] },
      { ...meta, inferenceMs: 12 },
    );
    expect(validateFrame(f)).toEqual([]);
    expect(f.presence).toEqual({ face: true, pose: true, leftHand: true, rightHand: true });
    expect(getPoint(f.points, "face", 467)[1]).toBeCloseTo(0.467);
    expect(getPoint(f.points, "pose", 0)).toEqual([0.5, 0, 0]);
    expect(getPoint(f.points, "leftHand", 0)[0]).toBeCloseTo(0.7);
    expect(getPoint(f.points, "rightHand", 0)[0]).toBeCloseTo(0.3);
    expect(f.poseVisibility[0]).toBeCloseTo(0.9);
    expect(f.timing).toEqual({ inferenceMs: 12 });
    expect(f.handedness).toEqual({ convention: "subject", source: "mediapipe-holistic", verified: false });
    expect(f.frameIndex).toBe(3);
  });

  it("accepts a 468-point face (no iris)", () => {
    const f = holisticResultToFrame({ faceLandmarks: [pts(468)], poseLandmarks: [], leftHandLandmarks: [], rightHandLandmarks: [] }, meta);
    expect(f.presence.face).toBe(true);
  });

  it("treats empty or wrongly-sized parts as absent", () => {
    const f = holisticResultToFrame(
      { faceLandmarks: [pts(100)], poseLandmarks: [pts(32)], leftHandLandmarks: [], rightHandLandmarks: [pts(20)] },
      meta,
    );
    expect(f.presence).toEqual({ face: false, pose: false, leftHand: false, rightHand: false });
    expect(Array.from(f.points).every(Number.isNaN)).toBe(true);
    expect(Array.from(f.poseVisibility).every(Number.isNaN)).toBe(true);
    expect(f.timing).toBeUndefined();
    expect(validateFrame(f)).toEqual([]);
  });

  it("a part with a non-finite value is dropped entirely", () => {
    const hand = pts(21);
    hand[5] = { x: Number.NaN, y: 0, z: 0 };
    const f = holisticResultToFrame({ faceLandmarks: [], poseLandmarks: [], leftHandLandmarks: [hand], rightHandLandmarks: [] }, meta);
    expect(f.presence.leftHand).toBe(false);
    expect(getPoint(f.points, "leftHand", 0).every(Number.isNaN)).toBe(true);
    expect(validateFrame(f)).toEqual([]);
  });

  it("swapHands swaps Holistic's left/right outputs", () => {
    const f = holisticResultToFrame(
      { faceLandmarks: [], poseLandmarks: [], leftHandLandmarks: [pts(21, 0.7)], rightHandLandmarks: [] },
      meta,
      { swapHands: true, handednessVerified: true },
    );
    expect(f.presence).toMatchObject({ leftHand: false, rightHand: true });
    expect(getPoint(f.points, "rightHand", 0)[0]).toBeCloseTo(0.7);
    expect(f.handedness.verified).toBe(true);
  });

  it("uses only the first person and tolerates missing visibility", () => {
    const pose = pts(33).map(({ x, y, z }) => ({ x, y, z }));
    const f = holisticResultToFrame(
      { faceLandmarks: [], poseLandmarks: [pose, pts(33, 0.9)], leftHandLandmarks: [], rightHandLandmarks: [] },
      meta,
    );
    expect(getPoint(f.points, "pose", 0)[0]).toBeCloseTo(0.5);
    expect(Number.isNaN(f.poseVisibility[0])).toBe(true);
  });
});
