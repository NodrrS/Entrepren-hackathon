import { describe, expect, it } from "vitest";
import { FrameResampler } from "../src";

function run(inputFps: number, seconds: number): number[] {
  const r = new FrameResampler<number>(25);
  const out: number[] = [];
  const n = Math.round(inputFps * seconds);
  for (let i = 0; i < n; i++) out.push(...r.push(1000 + (i * 1000) / inputFps, i).frames.map((f) => f.t));
  return out;
}

describe("FrameResampler to 25 FPS", () => {
  it.each([15, 24, 25, 30, 60])("gives 25 frames per second from %i FPS input", (fps) => {
    const ticks = run(fps, 4);
    expect(Math.abs(ticks.length - 100)).toBeLessThanOrEqual(2);
    for (let i = 1; i < ticks.length; i++) expect(ticks[i]! - ticks[i - 1]!).toBeCloseTo(40, 6);
  });

  it("uses the input frame nearest to each tick", () => {
    const r = new FrameResampler<string>(25);
    r.push(0, "a");
    expect(r.push(30, "b").frames).toEqual([]);
    expect(r.push(45, "c").frames.map((f) => f.value)).toEqual(["c"]); // tick 40: c is 5 ms away, b 10 ms
    expect(r.push(100, "d").frames.map((f) => f.value)).toEqual(["d"]); // tick 80: d 20 ms, c 35 ms
  });

  it("reports a gap and restarts the clock", () => {
    const r = new FrameResampler<number>(25, 1000);
    r.push(0, 0);
    r.push(40, 1);
    const res = r.push(5000, 2);
    expect(res.gap).toBe(true);
    expect(res.frames.map((f) => f.t)).toEqual([5000]);
  });
});
