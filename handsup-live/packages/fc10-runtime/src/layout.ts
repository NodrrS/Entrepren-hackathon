/**
 * Point layout of fc10 (thesis src/data/normalize.py, subset "hands_body").
 *
 * Raw input ("raw75"): the MediaPipe Holistic points the thesis extraction stores first, in the
 * same order (scripts/extract_pose.py LAYOUT): pose 0..32, left hand 33..53, right hand 54..74,
 * each (x, y, z) in MediaPipe normalised image coordinates of the NON-mirrored image, with
 * Holistic's own left/right hand labels. The face (75..552 in the thesis) is not used by fc10.
 *
 * Model input: 51 points = both hands (raw 33..74) then 9 upper-body pose points, each
 * (x, y, z, validity) = 204 numbers per frame.
 */
export const RAW_POINTS = 75;
export const RAW_CHANNELS = 3;
export const RAW_VALUES = RAW_POINTS * RAW_CHANNELS;

export const POSE = [0, 33] as const;
export const LEFT_HAND = [33, 54] as const;
export const RIGHT_HAND = [54, 75] as const;
export const SHOULDER_L = 11;
export const SHOULDER_R = 12;

const HANDS = Array.from({ length: RIGHT_HAND[1] - LEFT_HAND[0] }, (_, i) => LEFT_HAND[0] + i);
const UPPER_BODY = [0, 11, 12, 13, 14, 15, 16, 23, 24];

/** Raw indices of the 51 model points, in model order. */
export const HANDS_BODY: readonly number[] = [...HANDS, ...UPPER_BODY];
export const MODEL_POINTS = HANDS_BODY.length; // 51
export const MODEL_CHANNELS = 4; // x, y, z, validity
export const MODEL_VALUES = MODEL_POINTS * MODEL_CHANNELS; // 204

/** Presence flags, thesis order: pose, left hand, right hand, face. */
export type Presence4 = readonly [boolean, boolean, boolean, boolean];

/** Presence column (0 pose, 1 left, 2 right) that governs a raw index. */
export function presenceGroup(index: number): 0 | 1 | 2 {
  if (index >= POSE[0] && index < POSE[1]) return 0;
  if (index >= LEFT_HAND[0] && index < LEFT_HAND[1]) return 1;
  if (index >= RIGHT_HAND[0] && index < RIGHT_HAND[1]) return 2;
  throw new RangeError(`raw index ${index} outside the 75-point layout`);
}

export const HANDS_BODY_GROUPS: readonly (0 | 1 | 2)[] = HANDS_BODY.map(presenceGroup);

/** One raw frame: 75 points x (x, y, z) and the 4 presence flags. */
export interface RawFrame {
  readonly points: Float32Array; // RAW_VALUES
  readonly present: Presence4;
}
