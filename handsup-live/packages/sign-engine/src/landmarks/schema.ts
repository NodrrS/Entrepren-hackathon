/**
 * `hu-landmarks/v1`: the canonical, extractor-independent landmark frame (D-006, D-014).
 *
 * Layout: 543 points in this fixed order (point-major, 3 channels x, y, z):
 *
 *   | part       | offset | count | source                                                   |
 *   |------------|--------|-------|----------------------------------------------------------|
 *   | face       | 0      | 468   | MediaPipe face mesh 0..467 (iris points 468..477 dropped)|
 *   | pose       | 468    | 33    | BlazePose 0..32                                          |
 *   | leftHand   | 501    | 21    | the signer's anatomical LEFT hand, hand topology 0..20   |
 *   | rightHand  | 522    | 21    | the signer's anatomical RIGHT hand                       |
 *
 * Note: this order (face, pose, left, right) differs from the Kaggle ISLR parquet order
 * (face, left_hand, pose, right_hand). We re-extract our own landmarks (D-013), so that only
 * matters if Kaggle data is ever imported, which needs an explicit remap.
 *
 * Coordinates in a raw `LandmarkFrame` (space "image"):
 * - x, y: normalised to [0, 1] by the image width and height (MediaPipe convention; values can
 *   fall slightly outside [0, 1] for points outside the image). y points down.
 * - z: MediaPipe's relative depth (face: relative to the head centre; hands: relative to the
 *   wrist; roughly the same scale as x). Pose z "should be discarded" (MediaPipe docs) and the
 *   normaliser does discard it.
 * - A part that was not detected has `presence[part] === false` and all its values are NaN.
 *
 * Handedness contract: `leftHand` is always the signer's anatomical left hand, whatever the
 * extractor calls it and whether or not the image was mirrored. Adapters are responsible for
 * this and must say how they know (`handedness.verified`).
 */

export const HU_LANDMARKS_V1 = "hu-landmarks/v1" as const;
export type LandmarkSchemaId = typeof HU_LANDMARKS_V1;

/** Channels per point: x, y, z. */
export const CHANNELS = 3 as const;

export const PART_LAYOUT = {
  face: { offset: 0, count: 468 },
  pose: { offset: 468, count: 33 },
  leftHand: { offset: 501, count: 21 },
  rightHand: { offset: 522, count: 21 },
} as const;

export type BodyPart = keyof typeof PART_LAYOUT;
export const BODY_PARTS: readonly BodyPart[] = ["face", "pose", "leftHand", "rightHand"];

export const POINT_COUNT = 543 as const;
export const VALUE_COUNT = POINT_COUNT * CHANNELS; // 1629

/** MediaPipe FaceLandmarker / HolisticLandmarker emit 478 face points (468 mesh + 10 iris). */
export const MEDIAPIPE_FACE_POINTS_WITH_IRIS = 478 as const;

/** BlazePose indices used by the normaliser. */
export const POSE = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftWrist: 15,
  rightWrist: 16,
} as const;

/**
 * BlazePose left/right pairs (subject-relative), used when mirroring to the canonical
 * right-dominant form. Index 0 (nose) has no pair.
 */
export const POSE_LEFT_RIGHT_PAIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 4], [2, 5], [3, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16],
  [17, 18], [19, 20], [21, 22], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32],
];

export type PartPresence = Record<BodyPart, boolean>;

export interface ImageInfo {
  /** Width in pixels of the image the landmarks were computed on. */
  readonly width: number;
  /** Height in pixels. */
  readonly height: number;
  /** True if that image was horizontally mirrored (a "selfie view") before extraction. */
  readonly mirrored: boolean;
}

export interface HandednessInfo {
  /** Always "subject": leftHand = the signer's anatomical left hand. */
  readonly convention: "subject";
  /** Where the left/right labels came from, e.g. "mediapipe-holistic". */
  readonly source: string;
  /** False until the source's left/right semantics have been verified (P1-11 parity / live check). */
  readonly verified: boolean;
}

/** A raw `hu-landmarks/v1` frame straight from a landmark source. */
export interface LandmarkFrame {
  readonly schema: LandmarkSchemaId;
  readonly space: "image";
  /** Monotonic frame counter from the source, starting at 0. */
  readonly frameIndex: number;
  /** Capture time in ms on a monotonic clock (e.g. performance.now()). Strictly increasing. */
  readonly timestampMs: number;
  readonly image: ImageInfo;
  /** VALUE_COUNT floats: [x0, y0, z0, x1, y1, z1, ...] in PART_LAYOUT order. NaN where absent. */
  readonly points: Float32Array;
  /** 33 pose visibility scores in [0, 1] (NaN when the pose is absent or the extractor has none). */
  readonly poseVisibility: Float32Array;
  readonly presence: PartPresence;
  readonly handedness: HandednessInfo;
  /** Optional timing, for the FPS/latency meters. */
  readonly timing?: { readonly inferenceMs: number };
}

/** Index of the first value (x) of point `index` within `part`. */
export function valueIndex(part: BodyPart, index: number): number {
  const layout = PART_LAYOUT[part];
  if (!Number.isInteger(index) || index < 0 || index >= layout.count) {
    throw new RangeError(`${part} point ${index} is out of range 0..${layout.count - 1}`);
  }
  return (layout.offset + index) * CHANNELS;
}

/** Read one point as [x, y, z]. */
export function getPoint(points: Float32Array, part: BodyPart, index: number): [number, number, number] {
  const i = valueIndex(part, index);
  return [points[i] ?? Number.NaN, points[i + 1] ?? Number.NaN, points[i + 2] ?? Number.NaN];
}

/** A points buffer with every value NaN (nothing detected). */
export function emptyPoints(): Float32Array {
  return new Float32Array(VALUE_COUNT).fill(Number.NaN);
}

export function emptyPresence(): PartPresence {
  return { face: false, pose: false, leftHand: false, rightHand: false };
}

/** Structural validation of a frame. Returns a list of problems (empty = valid). */
export function validateFrame(frame: LandmarkFrame): string[] {
  const errors: string[] = [];
  if (frame.schema !== HU_LANDMARKS_V1) errors.push(`schema must be ${HU_LANDMARKS_V1}`);
  if (frame.space !== "image") errors.push(`space must be "image"`);
  if (!(frame.points instanceof Float32Array) || frame.points.length !== VALUE_COUNT) {
    errors.push(`points must be a Float32Array of length ${VALUE_COUNT}`);
  }
  if (!(frame.poseVisibility instanceof Float32Array) || frame.poseVisibility.length !== PART_LAYOUT.pose.count) {
    errors.push(`poseVisibility must be a Float32Array of length ${PART_LAYOUT.pose.count}`);
  }
  if (!Number.isFinite(frame.timestampMs)) errors.push("timestampMs must be finite");
  if (!Number.isInteger(frame.frameIndex) || frame.frameIndex < 0) errors.push("frameIndex must be a non-negative integer");
  if (!(frame.image.width > 0) || !(frame.image.height > 0)) errors.push("image width and height must be > 0");
  if (frame.handedness.convention !== "subject") errors.push(`handedness.convention must be "subject"`);
  if (errors.length > 0) return errors;

  for (const part of BODY_PARTS) {
    const { offset, count } = PART_LAYOUT[part];
    const start = offset * CHANNELS;
    const end = start + count * CHANNELS;
    let finite = 0;
    for (let i = start; i < end; i++) if (Number.isFinite(frame.points[i])) finite++;
    if (frame.presence[part] && finite === 0) errors.push(`${part} is marked present but has no finite values`);
    if (!frame.presence[part] && finite > 0) errors.push(`${part} is marked absent but has finite values`);
  }
  return errors;
}
