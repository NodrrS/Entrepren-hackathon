// Copied unchanged from apps/web/src/live/demo.ts (Hands Up live app). Keep in sync by hand; a later API swap removes the need.
/**
 * Demo fallback: a few PHOENIX-2014 dev clips as LANDMARKS ONLY (no video), played at 25 FPS
 * through the same fc10 pipeline. The file is made by ml/export/fc10_fixtures.py, copied into
 * public/demo/ by `npm run live:sync`, and never committed (research data, RF2).
 */
import { CHANNELS, PART_LAYOUT, VALUE_COUNT, type LandmarkFrame } from "@handsup/sign-engine";
import { RAW_VALUES, type Presence4, type RawFrame } from "@handsup/fc10-runtime";

export interface DemoClipFile {
  readonly clips: ReadonlyArray<{
    readonly id: string;
    readonly frames: number;
    readonly fps: number;
    readonly reference: readonly string[];
    readonly keypoints_b64: string;
    readonly present: ReadonlyArray<readonly number[]>;
  }>;
}

export interface DemoClip {
  readonly id: string;
  readonly reference: readonly string[];
  readonly frames: readonly RawFrame[];
}

function decodeF32(b64: string): Float32Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

export function parseDemoClips(file: DemoClipFile): DemoClip[] {
  return file.clips.map((c) => {
    const all = decodeF32(c.keypoints_b64);
    if (all.length !== c.frames * RAW_VALUES) throw new Error(`demo clip ${c.id}: expected ${c.frames * RAW_VALUES} values, got ${all.length}`);
    const frames: RawFrame[] = [];
    for (let t = 0; t < c.frames; t++) {
      const p = c.present[t]!;
      frames.push({
        points: all.subarray(t * RAW_VALUES, (t + 1) * RAW_VALUES),
        present: [!!p[0], !!p[1], !!p[2], !!p[3]] as Presence4,
      });
    }
    return { id: c.id, reference: c.reference, frames };
  });
}

/** Raw 75-point frame -> a hu-landmarks/v1 frame, only so the existing skeleton overlay can draw it. */
export function huFrameFromRaw(raw: RawFrame, index: number, width: number, height: number): LandmarkFrame {
  const points = new Float32Array(VALUE_COUNT).fill(Number.NaN);
  const parts: [keyof typeof PART_LAYOUT, number, boolean][] = [
    ["pose", 0, raw.present[0]],
    ["leftHand", 33, raw.present[1]],
    ["rightHand", 54, raw.present[2]],
  ];
  for (const [part, start, present] of parts) {
    if (!present) continue;
    const { offset, count } = PART_LAYOUT[part];
    points.set(raw.points.subarray(start * CHANNELS, (start + count) * CHANNELS), offset * CHANNELS);
  }
  return {
    schema: "hu-landmarks/v1",
    space: "image",
    frameIndex: index,
    timestampMs: index * 40,
    image: { width, height, mirrored: false },
    points,
    poseVisibility: new Float32Array(PART_LAYOUT.pose.count).fill(Number.NaN),
    presence: { face: false, pose: raw.present[0], leftHand: raw.present[1], rightHand: raw.present[2] },
    handedness: { convention: "subject", source: "mediapipe-holistic", verified: false },
  } as LandmarkFrame;
}
