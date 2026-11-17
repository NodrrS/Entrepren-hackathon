import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { aspectCorrect, type RawSeqFrame } from "../src/lib/pharmacy/classify";
import { GuidedTracker, TURN_1 } from "../src/lib/pharmacy/guided";

// The committed SignDict skeletons (apps/web/public/pharmacy/dgs/dgs.json): real DGS signs.
const dgs = JSON.parse(readFileSync(new URL("../../web/public/pharmacy/dgs/dgs.json", import.meta.url), "utf8")) as {
  signs: Record<string, { skeleton: { frames: number; width: number; height: number; keypoints_b64: string; present: number[][] } }>;
};

/**
 * The clip as a phone camera would see it when the video is shown small on a screen: the source frame scaled to
 * `scale` of a 1280x720 camera frame (placed at the centre), optionally mirrored (front camera), then aspect-corrected
 * exactly like the live path.
 */
function onScreen(gloss: string, scale: number, mirror: boolean): RawSeqFrame[] {
  const s = dgs.signs[gloss]!.skeleton;
  const b = Buffer.from(s.keypoints_b64, "base64");
  const f = new Float32Array(b.buffer, b.byteOffset, b.length / 4);
  const W = 1280, H = 720;
  const h = H * scale, w = h * (s.width / s.height);
  const ox = (W - w) / 2, oy = (H - h) / 2;
  return s.present.map((p, t) => {
    const pts = new Float32Array(225);
    for (let i = 0; i < 75; i++) {
      let x = (ox + f[(t * 75 + i) * 3]! * w) / W;
      if (mirror) x = 1 - x;
      pts[i * 3] = x;
      pts[i * 3 + 1] = (oy + f[(t * 75 + i) * 3 + 1]! * h) / H;
      pts[i * 3 + 2] = f[(t * 75 + i) * 3 + 2]!;
    }
    return aspectCorrect({ points: pts, present: p.map(Boolean) }, W, H);
  });
}

describe("guided pharmacy rules on a small figure (scale and mirror free)", () => {
  for (const mirror of [false, true]) {
    for (const scale of [0.3, 1]) {
      it(`HALLO triggers by rule at ${scale * 100} % size, ${mirror ? "mirrored" : "not mirrored"}`, () => {
        const t = new GuidedTracker(TURN_1);
        t.assist = false; // the rule itself must fire
        const hits = onScreen("HALLO", scale, mirror).map((f) => t.push(f)).filter(Boolean);
        expect(hits[0]?.index).toBe(0);
        expect(hits[0]?.how).toBe("rule");
      });
    }
  }

});

/** Synthetic signer (shoulders at y 0.5, nose at 0.3); the right hand follows `hand(t)`; null = hands down/out of view. */
function synth(n: number, hand: (i: number) => [number, number] | null): RawSeqFrame[] {
  return Array.from({ length: n }, (_, i) => {
    const p = new Float32Array(225);
    p.set([0.5, 0.3, 0], 0);
    p.set([0.6, 0.5, 0], 11 * 3);
    p.set([0.4, 0.5, 0], 12 * 3);
    const h = hand(i);
    if (h) for (let j = 0; j < 21; j++) p.set([h[0] + 0.005 * (j % 5), h[1] - 0.01 * Math.floor(j / 4), 0], (54 + j) * 3);
    return { points: p, present: [true, false, !!h, false] };
  });
}
const wave = (i: number): [number, number] => [0.28 + 0.06 * Math.sin(i / 3), 0.3]; // beside the head, waving
const advances = (frames: RawSeqFrame[], assist = true) => {
  const t = new GuidedTracker(TURN_1);
  t.assist = assist;
  return frames.map((f) => t.push(f)).filter((a): a is NonNullable<typeof a> => !!a).map((a) => `${TURN_1.steps[a.index]!.gloss}:${a.how}`);
};

describe("one continuous movement counts once", () => {
  it("a 6 s continuous HALLO wave gives exactly HALLO, nothing more (with Assistenz on)", () => {
    expect(advances(synth(150, wave))).toEqual(["HALLO:rule"]);
  });

  it("two clearly separate segments give 2 steps", () => {
    const frames = [...synth(50, wave), ...synth(15, () => null), ...synth(50, (i) => [0.45 + 0.02 * Math.sin(i / 2), 0.22])];
    const got = advances(frames, false);
    expect(got.length).toBe(2);
    expect(got[0]).toBe("HALLO:rule");
  });

  it("Assistenz advances at most one step per segment, only after 3 s", () => {
    const t = new GuidedTracker(TURN_1);
    t.skip(); // at KOPF; move in front of the chest (never at the head) for 6 s, one segment
    const hits: number[] = [];
    synth(150, (i) => [0.5 + 0.08 * Math.sin(i / 3), 0.75]).forEach((f, i) => { if (t.push(f)) hits.push(i); });
    expect(hits.length).toBe(1);
    expect(hits[0]).toBeGreaterThanOrEqual(75);
  });
});
