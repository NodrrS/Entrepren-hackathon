import { describe, expect, it } from "vitest";
import {
  CACHE_VALUES,
  FC10,
  Fc10Stream,
  MODEL_VALUES,
  RAW_VALUES,
  makeLabeler,
  rawFromHuFrame,
  type RawFrame,
  type StepInput,
  type StepOutput,
} from "../src";

/** Fake model: every frame of a chunk gets label (pos / 4 mod 3) + 1. */
class FakeRunner {
  calls: StepInput[] = [];
  async run(input: StepInput): Promise<StepOutput> {
    this.calls.push(input);
    expect(input.x.length).toBe(8 * MODEL_VALUES);
    expect(input.kCache.length).toBe(CACHE_VALUES);
    const logits = new Float32Array(FC10.C * FC10.vocabSize);
    const label = ((input.pos / 4) % 3) + 1;
    for (let r = 0; r < FC10.C; r++) logits[r * FC10.vocabSize + label] = 10;
    return { logits, kCache: input.kCache, vCache: input.vCache };
  }
}

const frame = (): RawFrame => ({ points: new Float32Array(RAW_VALUES), present: [true, true, true, false] });

describe("Fc10Stream", () => {
  it("runs one step per 8 frames, in order, with pos advancing by 4", async () => {
    const runner = new FakeRunner();
    const s = new Fc10Stream({ runner, now: () => 0 });
    const glosses: number[] = [];
    s.on((e) => {
      if (e.type === "gloss") glosses.push(e.id);
    });
    for (let i = 0; i < 40; i++) s.pushResampled(i * 40, frame());
    await s.idle();
    expect(runner.calls.map((c) => c.pos)).toEqual([0, 4, 8, 12, 16]);
    s.finalize();
    expect(glosses).toEqual([1, 2, 3, 1, 2]);
  });

  it("resamples 30 FPS input to 25 FPS chunks", async () => {
    const runner = new FakeRunner();
    const s = new Fc10Stream({ runner, now: () => 0 });
    for (let i = 0; i < 60; i++) s.push(i * (1000 / 30), frame());
    await s.idle();
    expect(runner.calls.length).toBe(6); // 2 s -> 50 frames -> 6 whole chunks
  });

  it("reset clears the cache position", async () => {
    const runner = new FakeRunner();
    const s = new Fc10Stream({ runner, now: () => 0 });
    for (let i = 0; i < 8; i++) s.pushResampled(i * 40, frame());
    await s.idle();
    s.reset();
    for (let i = 0; i < 8; i++) s.pushResampled(i * 40, frame());
    await s.idle();
    expect(runner.calls.map((c) => c.pos)).toEqual([0, 0]);
  });
});

describe("helpers", () => {
  it("maps hu-landmarks/v1 frames to the raw 75-point layout", () => {
    const points = new Float32Array(543 * 3).map((_, i) => i);
    const raw = rawFromHuFrame({ points, presence: { face: true, pose: true, leftHand: false, rightHand: true } });
    expect(raw.points[0]).toBe(468 * 3);
    expect(raw.points[33 * 3]).toBe(501 * 3);
    expect(raw.points[54 * 3 + 2]).toBe(522 * 3 + 2);
    expect(raw.present).toEqual([true, false, true, true]);
  });

  it("labels glosses with English or unknown and hides special tokens", () => {
    const label = makeLabeler(["<blank>", "__ON__", "WETTER", "ZZZ-NEU", "loc-NORD"]);
    expect(label(1).hidden).toBe(true);
    expect(label(2)).toMatchObject({ gloss: "WETTER", english: "weather", hidden: false });
    expect(label(3).english).toBeNull();
    expect(label(4).english).toBe("north");
  });
});
