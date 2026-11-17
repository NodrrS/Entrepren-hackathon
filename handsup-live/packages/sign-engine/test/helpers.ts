import {
  CHANNELS,
  HU_LANDMARKS_V1,
  PART_LAYOUT,
  POSE,
  emptyPoints,
  emptyPresence,
  type BodyPart,
  type LandmarkFrame,
  type PartPresence,
} from "../src/index";

export interface SyntheticOptions {
  frameIndex?: number;
  timestampMs?: number;
  width?: number;
  height?: number;
  mirrored?: boolean;
  parts?: BodyPart[];
  /** Shoulders in normalised image coordinates. */
  leftShoulder?: [number, number];
  rightShoulder?: [number, number];
  shoulderVisibility?: number;
}

/**
 * A synthetic frame: every present point sits at (0.5, 0.5, 0.01) except the shoulders and
 * the first point of each hand, which are placed so tests can check the transform.
 */
export function syntheticFrame(o: SyntheticOptions = {}): LandmarkFrame {
  const parts = o.parts ?? ["face", "pose", "leftHand", "rightHand"];
  const points = emptyPoints();
  const presence: PartPresence = emptyPresence();
  const poseVisibility = new Float32Array(PART_LAYOUT.pose.count).fill(Number.NaN);
  for (const part of parts) {
    presence[part] = true;
    const { offset, count } = PART_LAYOUT[part];
    for (let i = 0; i < count; i++) {
      const j = (offset + i) * CHANNELS;
      points[j] = 0.5;
      points[j + 1] = 0.5;
      points[j + 2] = 0.01;
    }
  }
  if (presence.pose) {
    poseVisibility.fill(0.99);
    const ls = o.leftShoulder ?? [0.6, 0.5];
    const rs = o.rightShoulder ?? [0.4, 0.5];
    set(points, "pose", POSE.leftShoulder, [ls[0], ls[1], 0.3]);
    set(points, "pose", POSE.rightShoulder, [rs[0], rs[1], 0.3]);
    if (o.shoulderVisibility !== undefined) {
      poseVisibility[POSE.leftShoulder] = o.shoulderVisibility;
      poseVisibility[POSE.rightShoulder] = o.shoulderVisibility;
    }
  }
  if (presence.leftHand) set(points, "leftHand", 0, [0.7, 0.4, 0]);
  if (presence.rightHand) set(points, "rightHand", 0, [0.3, 0.4, 0]);
  return {
    schema: HU_LANDMARKS_V1,
    space: "image",
    frameIndex: o.frameIndex ?? 0,
    timestampMs: o.timestampMs ?? 0,
    image: { width: o.width ?? 1000, height: o.height ?? 500, mirrored: o.mirrored ?? false },
    points,
    poseVisibility,
    presence,
    handedness: { convention: "subject", source: "test", verified: true },
  };
}

export function set(points: Float32Array, part: BodyPart, index: number, xyz: [number, number, number]): void {
  const j = (PART_LAYOUT[part].offset + index) * CHANNELS;
  points[j] = xyz[0];
  points[j + 1] = xyz[1];
  points[j + 2] = xyz[2];
}
