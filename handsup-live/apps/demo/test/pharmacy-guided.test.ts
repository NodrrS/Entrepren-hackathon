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

  it("Assistenz advances within about 1.5 s of visible, moving hands", () => {
    const t = new GuidedTracker(TURN_1);
    t.skip(); // now at KOPF; feed ARZT (no head touch) so only Assistenz can advance
    const frames = onScreen("ARZT", 0.3, true);
    let at = -1;
    frames.forEach((f, i) => {
      if (at < 0 && t.push(f)) at = i;
    });
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThanOrEqual(60); // 2.4 s at 25 FPS, incl. the hand-raise at the start
  });
});
