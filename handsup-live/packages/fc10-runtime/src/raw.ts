/**
 * hu-landmarks/v1 frame (from @handsup/sign-engine's MediaPipe Holistic source) -> fc10 raw frame.
 * Structural types only, so this package does not depend on sign-engine at runtime.
 * The sign-engine source copies Holistic's left/right hands without swapping and feeds the
 * non-mirrored video, exactly like the thesis extraction (scripts/extract_pose.py).
 */
import { RAW_CHANNELS, RAW_VALUES, type RawFrame } from "./layout";

export interface HuFrameLike {
  readonly points: Float32Array; // hu-landmarks/v1: face 0..467, pose 468..500, left 501..521, right 522..542, x/y/z
  readonly presence: { readonly face: boolean; readonly pose: boolean; readonly leftHand: boolean; readonly rightHand: boolean };
}

const HU_POSE = 468;
const HU_LEFT = 501;
const HU_RIGHT = 522;

export function rawFromHuFrame(frame: HuFrameLike): RawFrame {
  const points = new Float32Array(RAW_VALUES);
  points.set(frame.points.subarray(HU_POSE * RAW_CHANNELS, (HU_POSE + 33) * RAW_CHANNELS), 0);
  points.set(frame.points.subarray(HU_LEFT * RAW_CHANNELS, (HU_LEFT + 21) * RAW_CHANNELS), 33 * RAW_CHANNELS);
  points.set(frame.points.subarray(HU_RIGHT * RAW_CHANNELS, (HU_RIGHT + 21) * RAW_CHANNELS), 54 * RAW_CHANNELS);
  const p = frame.presence;
  return { points, present: [p.pose, p.leftHand, p.rightHand, p.face] };
}
