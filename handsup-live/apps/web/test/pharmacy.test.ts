import { describe, expect, it } from "vitest";
import { SignSegmenter, aspectCorrect, classify, makeTemplates, sequenceFeatures, type RawSeqFrame } from "../src/pharmacy/classify";
import { textToSigns } from "../src/pharmacy/words";

/** Synthetic signer: shoulders fixed; the right hand moves along `path(t)` (t in 0..1) while up. */
function clip(path: (t: number) => [number, number], n = 30, jitter = 0, seed = 1, leftHanded = false): RawSeqFrame[] {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * jitter;
  const frames: RawSeqFrame[] = [];
  for (let i = 0; i < n; i++) {
    const p = new Float32Array(225);
    p.set([0.4, 0.5, 0], 11 * 3);
    p.set([0.6, 0.5, 0], 12 * 3);
    p.set([0.5, 0.3, 0], 0);
    // elbows and wrists at rest, symmetric about x = 0.5
    p.set([0.35, 0.65, 0], 13 * 3);
    p.set([0.65, 0.65, 0], 14 * 3);
    p.set([0.38, 0.8, 0], 15 * 3);
    p.set([0.62, 0.8, 0], 16 * 3);
    const [x0, y0] = path(i / (n - 1));
    const start = leftHanded ? 33 : 54;
    for (let j = 0; j < 21; j++) {
      const x = x0 + 0.01 * (j % 5) + rnd();
      // a real left hand is the mirror image of a right hand (about the body midline x = 0.5)
      p.set([leftHanded ? 1 - x : x, y0 + 0.01 * Math.floor(j / 5) + rnd(), 0], (start + j) * 3);
    }
    frames.push({ points: p, present: [true, leftHanded, !leftHanded, false] });
  }
  return frames;
}
const UP = (t: number): [number, number] => [0.6, 0.6 - 0.3 * t];
const SIDE = (t: number): [number, number] => [0.4 + 0.3 * t, 0.45];
const CIRCLE = (t: number): [number, number] => [0.5 + 0.1 * Math.cos(6.28 * t), 0.45 + 0.1 * Math.sin(6.28 * t)];

describe("pharmacy template recogniser", () => {
  const templates = makeTemplates([
    { sign: "up", signer: "a", frames: clip(UP, 30, 0.01, 1) },
    { sign: "up", signer: "b", frames: clip(UP, 40, 0.01, 2) },
    { sign: "side", signer: "a", frames: clip(SIDE, 30, 0.01, 3) },
    { sign: "side", signer: "b", frames: clip(SIDE, 36, 0.01, 4) },
    { sign: "circle", signer: "a", frames: clip(CIRCLE, 30, 0.01, 5) },
    { sign: "circle", signer: "b", frames: clip(CIRCLE, 34, 0.01, 6) },
  ]);

  it("recognises new examples at another speed", () => {
    for (const [name, path] of [["up", UP], ["side", SIDE], ["circle", CIRCLE]] as const) {
      const q = sequenceFeatures(clip(path, 25, 0.02, 9))!;
      expect(classify(q, templates)!.sign).toBe(name);
    }
  });

  it("matches left-handed signing through the mirrored templates", () => {
    const q = sequenceFeatures(clip(SIDE, 28, 0.02, 11, true))!;
    // mirrored SIDE moves right-to-left in the image, but the mirror template matches it
    expect(classify(q, templates)!.sign).toBe("side");
  });

  it("cuts a stream into signs at pauses with the hands down", () => {
    const got: number[] = [];
    const seg = new SignSegmenter((f) => got.push(f.length));
    const rest = clip(() => [0.6, 0.95], 12); // hand below the chest = inactive
    for (const f of [...rest, ...clip(UP, 30), ...rest, ...clip(SIDE, 30), ...rest]) seg.push(f);
    expect(got.length).toBe(2);
  });

  it("corrects the aspect ratio of x", () => {
    const f = clip(UP, 2)[0]!;
    expect(aspectCorrect(f, 3, 4).points[11 * 3]).toBeCloseTo(0.4 * 0.75, 6);
  });
});

describe("German reply -> signs", () => {
  it("maps known words, keeps the rest as text", () => {
    const t = textToSigns("Morgens mit Wasser trinken, danke!");
    expect(t.map((x) => x.sign)).toEqual(["morning", null, "water", "drink", "thankyou"]);
    expect(textToSigns("Zahnschmerzen? Später")[0]!.sign).toBe("tooth");
    expect(textToSigns("zu Hause")[0]!.sign).toBe("home");
  });
});
