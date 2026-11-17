/**
 * Feature extraction: turns a normalised frame into the fixed-length vector a classifier eats.
 * The feature spec id goes in the model manifest (`input.featureSpec`) so a model can say which
 * extractor it was trained with.
 */
import { CHANNELS, PART_LAYOUT, type BodyPart } from "./schema";
import type { NormalisedFrame } from "./normalise";

export interface FeatureExtractor {
  /** Stable id, recorded in the model manifest, e.g. "points-xy/hands+lips@1". */
  readonly id: string;
  /** Floats per frame. */
  readonly featureSize: number;
  /** Write the features for one frame into `out` (length featureSize) and return it. */
  extract(frame: NormalisedFrame, out?: Float32Array): Float32Array;
}

export interface PointSubsetOptions {
  readonly id: string;
  /** Points to use, as [part, index-within-part]. */
  readonly points: ReadonlyArray<readonly [BodyPart, number]>;
  /** Channels to keep: 2 = x,y; 3 = x,y,z. Default 2. */
  readonly channels?: 2 | 3;
  /** Value written for NaN (absent) inputs. Default 0. */
  readonly fillValue?: number;
  /** Append one presence flag (0/1) per body part used, in BODY_PARTS order. Default true. */
  readonly presenceFlags?: boolean;
}

/** A feature extractor that selects a fixed subset of points (and optional presence flags). */
export function createPointSubsetFeatures(options: PointSubsetOptions): FeatureExtractor {
  const channels = options.channels ?? 2;
  const fill = options.fillValue ?? 0;
  const withFlags = options.presenceFlags ?? true;
  const valueIdx = options.points.map(([part, i]) => {
    const layout = PART_LAYOUT[part];
    if (!Number.isInteger(i) || i < 0 || i >= layout.count) {
      throw new RangeError(`${part} point ${i} is out of range 0..${layout.count - 1}`);
    }
    return (layout.offset + i) * CHANNELS;
  });
  const partsUsed = (["face", "pose", "leftHand", "rightHand"] as const).filter((p) =>
    options.points.some(([part]) => part === p),
  );
  const featureSize = valueIdx.length * channels + (withFlags ? partsUsed.length : 0);

  return {
    id: options.id,
    featureSize,
    extract(frame, out = new Float32Array(featureSize)) {
      if (out.length !== featureSize) throw new RangeError(`out must have length ${featureSize}`);
      let k = 0;
      for (const base of valueIdx) {
        for (let c = 0; c < channels; c++) {
          const v = frame.points[base + c]!;
          out[k++] = Number.isFinite(v) ? v : fill;
        }
      }
      if (withFlags) for (const p of partsUsed) out[k++] = frame.presence[p] ? 1 : 0;
      return out;
    },
  };
}

/** Every point of the given parts, in order: a convenience for building subsets. */
export function allPointsOf(...parts: BodyPart[]): Array<[BodyPart, number]> {
  const out: Array<[BodyPart, number]> = [];
  for (const part of parts) for (let i = 0; i < PART_LAYOUT[part].count; i++) out.push([part, i]);
  return out;
}
