/**
 * Pure mapping from a MediaPipe Tasks `HolisticLandmarkerResult` to a `hu-landmarks/v1` frame.
 *
 * This file does NOT import `@mediapipe/tasks-vision`; it works on the result's shape, so it
 * can be unit-tested and reused by any platform that produces the same structure (web, and the
 * mobile plugin's JS bridge, P1-05). The pin is D-014: tasks-vision 1.0.1 / mediapipe 1.0.1.
 *
 * Mapping rules (datasets/MANIFEST.md "MediaPipe version pin"):
 * - face: the first 468 of MediaPipe's 478 points (iris 468..477 dropped). A face with fewer
 *   than 468 points is treated as absent.
 * - pose: 33 BlazePose points, plus visibility.
 * - hands: 21 points each. Holistic's `leftHandLandmarks` / `rightHandLandmarks` are copied to
 *   leftHand / rightHand, unless `swapHands` is set. Whether Holistic's labels are
 *   subject-relative on a non-mirrored image is UNVERIFIED (P1-06); until P1-11 or a live check
 *   confirms it, frames say `handedness.verified = false`.
 * - Only the first detected person is used.
 */
import {
  CHANNELS,
  HU_LANDMARKS_V1,
  MEDIAPIPE_FACE_POINTS_WITH_IRIS,
  PART_LAYOUT,
  emptyPoints,
  emptyPresence,
  type BodyPart,
  type ImageInfo,
  type LandmarkFrame,
} from "../landmarks/schema";

/** Structural twin of tasks-vision's NormalizedLandmark. */
export interface MpLandmark {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly visibility?: number;
}

/** The fields of tasks-vision's HolisticLandmarkerResult that we use. */
export interface MpHolisticResultLike {
  readonly faceLandmarks: ReadonlyArray<ReadonlyArray<MpLandmark>>;
  readonly poseLandmarks: ReadonlyArray<ReadonlyArray<MpLandmark>>;
  readonly leftHandLandmarks: ReadonlyArray<ReadonlyArray<MpLandmark>>;
  readonly rightHandLandmarks: ReadonlyArray<ReadonlyArray<MpLandmark>>;
}

export interface HolisticMappingOptions {
  /** Swap Holistic's left/right hand outputs (use if a live check shows they are image-relative). */
  readonly swapHands?: boolean;
  /** Set true only once the left/right semantics have been verified for this configuration. */
  readonly handednessVerified?: boolean;
}

export interface FrameMeta {
  readonly frameIndex: number;
  readonly timestampMs: number;
  readonly image: ImageInfo;
  readonly inferenceMs?: number;
}

export const HOLISTIC_HANDEDNESS_SOURCE = "mediapipe-holistic";

export function holisticResultToFrame(
  result: MpHolisticResultLike,
  meta: FrameMeta,
  options: HolisticMappingOptions = {},
): LandmarkFrame {
  const points = emptyPoints();
  const poseVisibility = new Float32Array(PART_LAYOUT.pose.count).fill(Number.NaN);
  const presence = emptyPresence();

  const face = result.faceLandmarks[0];
  if (face && face.length >= PART_LAYOUT.face.count && face.length <= MEDIAPIPE_FACE_POINTS_WITH_IRIS) {
    presence.face = copyPart(points, "face", face);
  }

  const pose = result.poseLandmarks[0];
  if (pose && pose.length === PART_LAYOUT.pose.count) {
    presence.pose = copyPart(points, "pose", pose);
    if (presence.pose) {
      for (let i = 0; i < pose.length; i++) {
        const v = pose[i]!.visibility;
        poseVisibility[i] = typeof v === "number" && Number.isFinite(v) ? v : Number.NaN;
      }
    }
  }

  const mpLeft = result.leftHandLandmarks[0];
  const mpRight = result.rightHandLandmarks[0];
  const [left, right] = options.swapHands ? [mpRight, mpLeft] : [mpLeft, mpRight];
  if (left && left.length === PART_LAYOUT.leftHand.count) presence.leftHand = copyPart(points, "leftHand", left);
  if (right && right.length === PART_LAYOUT.rightHand.count) presence.rightHand = copyPart(points, "rightHand", right);

  const frame: LandmarkFrame = {
    schema: HU_LANDMARKS_V1,
    space: "image",
    frameIndex: meta.frameIndex,
    timestampMs: meta.timestampMs,
    image: meta.image,
    points,
    poseVisibility,
    presence,
    handedness: {
      convention: "subject",
      source: HOLISTIC_HANDEDNESS_SOURCE,
      verified: options.handednessVerified ?? false,
    },
    ...(meta.inferenceMs !== undefined ? { timing: { inferenceMs: meta.inferenceMs } } : {}),
  };
  return frame;
}

/**
 * Copy the first `count` landmarks of a part. If any copied value is not finite, the whole part
 * is reset to NaN and reported absent, so a part is either fully present or fully absent.
 */
function copyPart(points: Float32Array, part: BodyPart, landmarks: ReadonlyArray<MpLandmark>): boolean {
  const { offset, count } = PART_LAYOUT[part];
  const start = offset * CHANNELS;
  for (let i = 0; i < count; i++) {
    const lm = landmarks[i]!;
    const j = start + i * CHANNELS;
    if (!Number.isFinite(lm.x) || !Number.isFinite(lm.y) || !Number.isFinite(lm.z)) {
      points.fill(Number.NaN, start, start + count * CHANNELS);
      return false;
    }
    points[j] = lm.x;
    points[j + 1] = lm.y;
    points[j + 2] = lm.z;
  }
  return true;
}
