import { describe, expect, it } from "vitest";
import { makeLabeler, rawFromHuFrame } from "@handsup/fc10-runtime";
import { Captions, englishText, germanText } from "../src/live/captions";
import { huFrameFromRaw, parseDemoClips } from "../src/live/demo";

const label = makeLabeler(["<blank>", "__ON__", "WETTER", "MORGEN", "XYZ-UNBEKANNT"]);

describe("/live captions", () => {
  it("appends glosses, hides special tokens, marks unknown English words", () => {
    const c = new Captions();
    expect(c.add(label(1))).toBe(false);
    c.add(label(3));
    c.add(label(2));
    c.add(label(4));
    expect(germanText(c.current)).toBe("MORGEN WETTER XYZ-UNBEKANNT");
    expect(englishText(c.current)).toBe("tomorrow · weather · ?");
  });

  it("starts a new line only after content and keeps at most maxLines", () => {
    const c = new Captions(2);
    c.newLine();
    expect(c.lines.length).toBe(1);
    for (let i = 0; i < 4; i++) {
      c.add(label(2));
      c.newLine();
    }
    expect(c.lines.length).toBe(2);
  });
});

describe("/live demo clips", () => {
  it("decodes base64 float32 landmarks and round-trips through the overlay frame", () => {
    const T = 2;
    const values = new Float32Array(T * 75 * 3).map((_, i) => i / 1000);
    const b64 = btoa(String.fromCharCode(...new Uint8Array(values.buffer)));
    const [clip] = parseDemoClips({
      clips: [{ id: "x", frames: T, fps: 25, reference: ["A"], keypoints_b64: b64, present: [[1, 1, 0, 0], [1, 0, 1, 0]] }],
    });
    expect(clip!.frames.length).toBe(2);
    expect(clip!.frames[1]!.present).toEqual([true, false, true, false]);
    expect(clip!.frames[1]!.points[0]).toBeCloseTo(0.225, 6);
    const hu = huFrameFromRaw(clip!.frames[0]!, 0, 420, 520);
    const back = rawFromHuFrame(hu);
    expect(back.points.subarray(0, 33 * 3)).toEqual(clip!.frames[0]!.points.subarray(0, 33 * 3));
    expect(back.present).toEqual([true, true, false, false]);
  });
});
