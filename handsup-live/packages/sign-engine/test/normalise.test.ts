import { describe, expect, it } from "vitest";
import { HU_NORM_V1, POSE, createNormaliser, getPoint, isUsable } from "../src/index";
import { set, syntheticFrame } from "./helpers";

// Image 1000x500. Shoulders at x 0.6 and 0.4 (px 600 and 400), y 0.5 (px 250).
// Centre = (500, 250) px, scale = 200 px.

describe("hu-norm/v1", () => {
  it("centres on the shoulders and scales by shoulder width, in pixel space", () => {
    const n = createNormaliser().normalise(syntheticFrame());
    expect(n.space).toBe(HU_NORM_V1);
    expect(n.reference).toMatchObject({ valid: true, source: "shoulders", centreX: 500, centreY: 250, scale: 200 });
    const [lx, ly] = getPoint(n.points, "pose", POSE.leftShoulder);
    const [rx] = getPoint(n.points, "pose", POSE.rightShoulder);
    expect(lx).toBeCloseTo(0.5);
    expect(ly).toBeCloseTo(0);
    expect(rx).toBeCloseTo(-0.5);
    // Left hand wrist at (0.7, 0.4) -> px (700, 200) -> ((700-500)/200, (200-250)/200) = (1, -0.25)
    const [hx, hy, hz] = getPoint(n.points, "leftHand", 0);
    expect(hx).toBeCloseTo(1);
    expect(hy).toBeCloseTo(-0.25);
    expect(hz).toBeCloseTo(0);
  });

  it("corrects the aspect ratio (x by width, y by height, z by width)", () => {
    const f = syntheticFrame();
    set(f.points, "face", 0, [0.5, 0.7, 0.02]); // px (500, 350), z px 20
    const [x, y, z] = getPoint(createNormaliser().normalise(f).points, "face", 0);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(0.5); // (350-250)/200
    expect(z).toBeCloseTo(0.1); // 20/200
  });

  it("discards pose z", () => {
    const n = createNormaliser().normalise(syntheticFrame());
    expect(getPoint(n.points, "pose", POSE.leftShoulder)[2]).toBe(0);
  });

  it("un-mirrors a mirrored image so both views give the same output", () => {
    const plain = createNormaliser().normalise(syntheticFrame());
    // The mirrored image: every x becomes 1 - x.
    const m = syntheticFrame({ mirrored: true, leftShoulder: [0.4, 0.5], rightShoulder: [0.6, 0.5] });
    set(m.points, "leftHand", 0, [0.3, 0.4, 0]);
    set(m.points, "rightHand", 0, [0.7, 0.4, 0]);
    const n = createNormaliser().normalise(m);
    expect(getPoint(n.points, "leftHand", 0)[0]).toBeCloseTo(getPoint(plain.points, "leftHand", 0)[0]);
    expect(getPoint(n.points, "pose", POSE.leftShoulder)[0]).toBeCloseTo(0.5);
  });

  it("mirrors a left-dominant signer to the canonical right-dominant form", () => {
    const f = syntheticFrame({ parts: ["pose", "leftHand"] });
    const n = createNormaliser({ dominantHand: "left" }).normalise(f);
    expect(n.mirroredToCanonical).toBe(true);
    expect(n.canonicalDominant).toBe("right");
    // The signer's left hand is now in the rightHand block, with x negated.
    expect(n.presence).toMatchObject({ leftHand: false, rightHand: true });
    expect(getPoint(n.points, "rightHand", 0)[0]).toBeCloseTo(-1);
    expect(getPoint(n.points, "leftHand", 0).every(Number.isNaN)).toBe(true);
    // Pose pairs are swapped: the "left shoulder" slot now holds the old right shoulder, negated.
    expect(getPoint(n.points, "pose", POSE.leftShoulder)[0]).toBeCloseTo(0.5);
    expect(getPoint(n.points, "pose", POSE.rightShoulder)[0]).toBeCloseTo(-0.5);
  });

  it("keeps absent parts NaN and never imputes", () => {
    const n = createNormaliser().normalise(syntheticFrame({ parts: ["pose", "rightHand"] }));
    expect(getPoint(n.points, "face", 10).every(Number.isNaN)).toBe(true);
    expect(getPoint(n.points, "leftHand", 5).every(Number.isNaN)).toBe(true);
    expect(n.presence.face).toBe(false);
  });

  it("holds the last reference for up to maxHoldMs, then gives an all-NaN frame", () => {
    const norm = createNormaliser({ maxHoldMs: 500 });
    norm.normalise(syntheticFrame({ timestampMs: 0 }));
    const held = norm.normalise(syntheticFrame({ timestampMs: 400, parts: ["leftHand"] }));
    expect(held.reference).toMatchObject({ valid: true, source: "held", scale: 200 });
    expect(getPoint(held.points, "leftHand", 0)[0]).toBeCloseTo(1);
    expect(isUsable(held)).toBe(true);

    const lost = norm.normalise(syntheticFrame({ timestampMs: 600, parts: ["leftHand"] }));
    expect(lost.reference.valid).toBe(false);
    expect(Array.from(lost.points).every(Number.isNaN)).toBe(true);
    expect(isUsable(lost)).toBe(false);
  });

  it("rejects low-visibility or collapsed shoulders", () => {
    expect(createNormaliser().normalise(syntheticFrame({ shoulderVisibility: 0.2 })).reference.valid).toBe(false);
    const collapsed = syntheticFrame({ leftShoulder: [0.5, 0.5], rightShoulder: [0.502, 0.5] }); // 2 px apart
    expect(createNormaliser().normalise(collapsed).reference.valid).toBe(false);
  });

  it("reset() forgets the held reference", () => {
    const norm = createNormaliser();
    norm.normalise(syntheticFrame({ timestampMs: 0 }));
    norm.reset();
    expect(norm.normalise(syntheticFrame({ timestampMs: 10, parts: ["leftHand"] })).reference.valid).toBe(false);
  });

  it("does not mutate the input frame", () => {
    const f = syntheticFrame();
    const before = Array.from(f.points);
    createNormaliser({ dominantHand: "left" }).normalise(f);
    expect(Array.from(f.points)).toEqual(before);
  });
});
