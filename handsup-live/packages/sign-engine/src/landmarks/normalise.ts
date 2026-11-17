/**
 * `hu-norm/v1`: the normalisation contract. The SAME code runs at training time (via the
 * Python port, gated by the P1-11 parity test) and at inference time on web and mobile, so the
 * model never sees extractor- or camera-specific coordinates.
 *
 * For each frame, in this order:
 *  1. Aspect correction: px = x * width, py = y * height, pz = z * width (MediaPipe z uses
 *     roughly the x scale). Pose z is discarded (set to 0) as the MediaPipe docs advise.
 *  2. Un-mirror: if `image.mirrored`, px = width - px, so every frame is in the camera's
 *     non-mirrored view (training video is not mirrored).
 *  3. Reference: centre = midpoint of the two shoulders (pose 11, 12), scale = the 2-D
 *     shoulder distance, both in pixels. Valid only if the pose is present, both shoulders are
 *     finite, both visibilities >= `minShoulderVisibility`, and scale >= `minScalePx`.
 *     Otherwise the last valid reference is reused for up to `maxHoldMs`; after that the frame
 *     has no reference and ALL its values are NaN (`reference.valid === false`).
 *  4. out = (p - centre) / scale for x and y, and z / scale for z. y still points down.
 *  5. Canonical dominant hand: if `dominantHand === "left"`, x = -x, the leftHand and
 *     rightHand blocks (and their presence) are swapped, and the pose left/right pairs are
 *     swapped. Face points are only x-negated (no face-mesh index remap in v1). The output is
 *     always "right-dominant".
 * Absent parts stay NaN. Nothing is imputed here; feature extractors decide how to fill gaps.
 */
import {
  BODY_PARTS,
  CHANNELS,
  HU_LANDMARKS_V1,
  PART_LAYOUT,
  POSE,
  POSE_LEFT_RIGHT_PAIRS,
  VALUE_COUNT,
  type LandmarkFrame,
  type LandmarkSchemaId,
  type PartPresence,
} from "./schema";

export const HU_NORM_V1 = "hu-norm/v1" as const;
export type NormalisationId = typeof HU_NORM_V1;

export type DominantHand = "left" | "right";

export interface NormaliserOptions {
  /** The signer's dominant hand. "left" mirrors to the canonical right-dominant form. Default "right". */
  readonly dominantHand?: DominantHand;
  /** Minimum pose visibility for each shoulder. Default 0.5. */
  readonly minShoulderVisibility?: number;
  /** Minimum shoulder distance in pixels. Default 8. */
  readonly minScalePx?: number;
  /** How long a previous reference may be reused when the shoulders drop out. Default 500 ms. */
  readonly maxHoldMs?: number;
}

export interface Reference {
  readonly valid: boolean;
  /** "shoulders" = computed from this frame, "held" = reused, "none" = no reference. */
  readonly source: "shoulders" | "held" | "none";
  /** Centre in pixels (NaN when invalid). */
  readonly centreX: number;
  readonly centreY: number;
  /** Shoulder width in pixels (NaN when invalid). */
  readonly scale: number;
  /** Timestamp of the frame the reference was computed on. */
  readonly fromTimestampMs: number;
}

export interface NormalisedFrame {
  readonly schema: LandmarkSchemaId;
  readonly space: NormalisationId;
  readonly frameIndex: number;
  readonly timestampMs: number;
  /** VALUE_COUNT floats in PART_LAYOUT order, in shoulder-width units. NaN where absent. */
  readonly points: Float32Array;
  readonly presence: PartPresence;
  readonly reference: Reference;
  /** Always "right" after normalisation. */
  readonly canonicalDominant: "right";
  /** True if the frame was mirrored to reach the canonical form (left-dominant signer). */
  readonly mirroredToCanonical: boolean;
}

/** The feature/normaliser stage of the pipeline. Stateful (reference hold), so it can be reset. */
export interface Normaliser {
  readonly id: NormalisationId;
  normalise(frame: LandmarkFrame): NormalisedFrame;
  reset(): void;
}

const DEFAULTS = {
  dominantHand: "right" as DominantHand,
  minShoulderVisibility: 0.5,
  minScalePx: 8,
  maxHoldMs: 500,
};

const INVALID_REFERENCE: Reference = {
  valid: false,
  source: "none",
  centreX: Number.NaN,
  centreY: Number.NaN,
  scale: Number.NaN,
  fromTimestampMs: Number.NaN,
};

export function createNormaliser(options: NormaliserOptions = {}): Normaliser {
  const opts = { ...DEFAULTS, ...options };
  let held: Reference | null = null;

  function computeReference(frame: LandmarkFrame, px: Float32Array): Reference {
    if (frame.presence.pose) {
      const l = (PART_LAYOUT.pose.offset + POSE.leftShoulder) * CHANNELS;
      const r = (PART_LAYOUT.pose.offset + POSE.rightShoulder) * CHANNELS;
      const lx = px[l]!, ly = px[l + 1]!, rx = px[r]!, ry = px[r + 1]!;
      const lv = frame.poseVisibility[POSE.leftShoulder]!;
      const rv = frame.poseVisibility[POSE.rightShoulder]!;
      // NaN visibility means "the extractor has no visibility"; accept it then.
      const visOk = (v: number) => Number.isNaN(v) || v >= opts.minShoulderVisibility;
      if ([lx, ly, rx, ry].every(Number.isFinite) && visOk(lv) && visOk(rv)) {
        const scale = Math.hypot(lx - rx, ly - ry);
        if (scale >= opts.minScalePx) {
          const ref: Reference = {
            valid: true,
            source: "shoulders",
            centreX: (lx + rx) / 2,
            centreY: (ly + ry) / 2,
            scale,
            fromTimestampMs: frame.timestampMs,
          };
          held = ref;
          return ref;
        }
      }
    }
    if (held && frame.timestampMs - held.fromTimestampMs <= opts.maxHoldMs && frame.timestampMs >= held.fromTimestampMs) {
      return { ...held, source: "held" };
    }
    held = null;
    return INVALID_REFERENCE;
  }

  return {
    id: HU_NORM_V1,
    reset() {
      held = null;
    },
    normalise(frame: LandmarkFrame): NormalisedFrame {
      const { width, height, mirrored } = frame.image;
      const src = frame.points;
      const px = new Float32Array(VALUE_COUNT);
      const poseStart = PART_LAYOUT.pose.offset * CHANNELS;
      const poseEnd = poseStart + PART_LAYOUT.pose.count * CHANNELS;

      // 1-2. Aspect correction and un-mirroring, into pixels.
      for (let i = 0; i < VALUE_COUNT; i += CHANNELS) {
        let x = src[i]! * width;
        if (mirrored) x = width - x;
        px[i] = x;
        px[i + 1] = src[i + 1]! * height;
        const z = src[i + 2]!;
        px[i + 2] = i >= poseStart && i < poseEnd ? (Number.isNaN(z) ? z : 0) : z * width;
      }

      // 3. Reference.
      const reference = computeReference(frame, px);
      const out = new Float32Array(VALUE_COUNT);
      const mirror = opts.dominantHand === "left";
      const presence: PartPresence = mirror
        ? { ...frame.presence, leftHand: frame.presence.rightHand, rightHand: frame.presence.leftHand }
        : { ...frame.presence };
      if (!reference.valid) {
        out.fill(Number.NaN);
        return {
          schema: HU_LANDMARKS_V1,
          space: HU_NORM_V1,
          frameIndex: frame.frameIndex,
          timestampMs: frame.timestampMs,
          points: out,
          presence,
          reference,
          canonicalDominant: "right",
          mirroredToCanonical: mirror,
        };
      }

      // 4. Centre and scale.
      const { centreX, centreY, scale } = reference;
      for (let i = 0; i < VALUE_COUNT; i += CHANNELS) {
        out[i] = (px[i]! - centreX) / scale;
        out[i + 1] = (px[i + 1]! - centreY) / scale;
        out[i + 2] = px[i + 2]! / scale;
      }

      // 5. Canonical right-dominant form.
      if (mirror) {
        for (let i = 0; i < VALUE_COUNT; i += CHANNELS) out[i] = -out[i]!;
        swapBlocks(out, PART_LAYOUT.leftHand.offset, PART_LAYOUT.rightHand.offset, PART_LAYOUT.leftHand.count);
        for (const [a, b] of POSE_LEFT_RIGHT_PAIRS) {
          swapBlocks(out, PART_LAYOUT.pose.offset + a, PART_LAYOUT.pose.offset + b, 1);
        }
      }

      return {
        schema: HU_LANDMARKS_V1,
        space: HU_NORM_V1,
        frameIndex: frame.frameIndex,
        timestampMs: frame.timestampMs,
        points: out,
        presence,
        reference,
        canonicalDominant: "right",
        mirroredToCanonical: mirror,
      };
    },
  };
}

/** Swap `count` points starting at point offsets a and b. */
function swapBlocks(values: Float32Array, a: number, b: number, count: number): void {
  const n = count * CHANNELS;
  const ia = a * CHANNELS;
  const ib = b * CHANNELS;
  for (let k = 0; k < n; k++) {
    const t = values[ia + k]!;
    values[ia + k] = values[ib + k]!;
    values[ib + k] = t;
  }
}

/** True if the frame has a valid reference and at least one body part present. */
export function isUsable(frame: NormalisedFrame): boolean {
  return frame.reference.valid && BODY_PARTS.some((p) => frame.presence[p]);
}
