/**
 * Port of the thesis StreamingNormalizer (src/data/normalize.py): shoulder-centred,
 * shoulder-width-scaled coordinates with a causal EMA (alpha 0.9) of the centre and scale.
 *
 * - The EMA starts at the first frame with a usable pose (pose present, both shoulders finite,
 *   width > 0); before that the centre is 0 and the scale 1. Frames without a usable pose reuse
 *   the previous EMA values.
 * - A point whose part is absent is exactly 0 in every channel; validity is 1.0 or 0.0.
 * - Non-finite results become 0 (torch.nan_to_num).
 * Feeding a clip frame by frame equals normalize_pose on the whole clip (test/normalize.test.ts
 * checks this against values dumped from the thesis code).
 */
import {
  HANDS_BODY,
  HANDS_BODY_GROUPS,
  MODEL_CHANNELS,
  MODEL_VALUES,
  RAW_CHANNELS,
  SHOULDER_L,
  SHOULDER_R,
  type RawFrame,
} from "./layout";

export class StreamingNormalizer {
  private centre = [0, 0, 0];
  private scale = 1;
  private seenPose = false;

  constructor(private readonly alpha = 0.9) {}

  reset(): void {
    this.centre = [0, 0, 0];
    this.scale = 1;
    this.seenPose = false;
  }

  /** One raw frame -> 204 model values (written into `out` if given). */
  step(frame: RawFrame, out: Float32Array = new Float32Array(MODEL_VALUES)): Float32Array {
    const p = frame.points;
    const a = SHOULDER_L * RAW_CHANNELS;
    const b = SHOULDER_R * RAW_CHANNELS;
    // Float32 arithmetic like the thesis tensors (Math.fround keeps parity tight).
    const dx = Math.fround(p[a]! - p[b]!);
    const dy = Math.fround(p[a + 1]! - p[b + 1]!);
    const dz = Math.fround(p[a + 2]! - p[b + 2]!);
    const w = Math.fround(Math.sqrt(dx * dx + dy * dy + dz * dz));
    let finite = true;
    for (let c = 0; c < 3; c++) if (!Number.isFinite(p[a + c]!) || !Number.isFinite(p[b + c]!)) finite = false;
    const usable = frame.present[0] && finite && w > 0;
    if (usable) {
      const o = [0, 1, 2].map((c) => Math.fround(Math.fround(0.5) * Math.fround(p[a + c]! + p[b + c]!)));
      if (this.seenPose) {
        const al = Math.fround(this.alpha);
        const bl = Math.fround(1 - this.alpha);
        this.centre = this.centre.map((v, c) => Math.fround(Math.fround(al * v) + Math.fround(bl * o[c]!)));
        this.scale = Math.fround(Math.fround(al * this.scale) + Math.fround(bl * w));
      } else {
        this.centre = o;
        this.scale = w;
        this.seenPose = true;
      }
    }
    for (let k = 0; k < HANDS_BODY.length; k++) {
      const valid = frame.present[HANDS_BODY_GROUPS[k]!];
      const src = HANDS_BODY[k]! * RAW_CHANNELS;
      const dst = k * MODEL_CHANNELS;
      for (let c = 0; c < 3; c++) {
        let v = valid ? Math.fround(Math.fround(p[src + c]! - this.centre[c]!) / this.scale) : 0;
        if (!Number.isFinite(v)) v = 0;
        out[dst + c] = v;
      }
      out[dst + 3] = valid ? 1 : 0;
    }
    return out;
  }
}
