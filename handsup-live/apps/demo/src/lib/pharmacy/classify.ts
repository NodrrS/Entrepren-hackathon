/**
 * Isolated-sign recognition by template matching, for the /pharmacy research demo.
 *
 * No trained network: each known sign has a few example sequences (MediaPipe pose + hands,
 * extracted from PopSign ASL v1.0, CC BY 4.0). A new sign is compared with every example by
 * dynamic time warping (DTW) on shoulder-normalised features; the nearest examples vote.
 * Mirrored examples are added so left- and right-handed signing both match.
 *
 * Raw frame layout (same as fc10-runtime): 75 points x (x, y, z): pose 0..32, left hand
 * 33..53, right hand 54..74; presence [pose, left, right, face].
 */

export interface RawSeqFrame {
  readonly points: Float32Array; // 225
  readonly present: readonly [boolean, boolean, boolean, boolean] | readonly boolean[];
}

// Per hand: 21 x (x, y) shape relative to the wrist in palm units, the wrist position relative to
// the nose in palm units, and a presence flag. Signer-invariant: no shoulder width, no body size.
const HAND_DIM = 21 * 2 + 2 + 1;
export const FEAT_DIM = 2 * HAND_DIM; // 90
export const SEQ_LEN = 24;

/**
 * MediaPipe normalises x by the image width and y by the height. Scale x by width/height so
 * distances are in the same unit on portrait clips (PopSign) and landscape phone cameras.
 */
export function aspectCorrect(f: RawSeqFrame, width: number, height: number): RawSeqFrame {
  const k = width / height;
  const pts = new Float32Array(f.points);
  for (let i = 0; i < pts.length; i += 3) pts[i] = pts[i]! * k;
  return { points: pts, present: f.present };
}

/** Shoulder centre and width of a frame, or null if the pose is missing. */
function shoulders(f: RawSeqFrame): { cx: number; cy: number; w: number } | null {
  if (!f.present[0]) return null;
  const p = f.points;
  const ax = p[11 * 3]!, ay = p[11 * 3 + 1]!, bx = p[12 * 3]!, by = p[12 * 3 + 1]!;
  const w = Math.hypot(ax - bx, ay - by);
  if (!(w > 0.01)) return null;
  return { cx: (ax + bx) / 2, cy: (ay + by) / 2, w };
}

/** Is a hand "in use" (present and above the lower chest)? Used to cut signs out of a stream. */
export function handActive(f: RawSeqFrame, ref: { cy: number; w: number } | null): boolean {
  for (const [h, wrist] of [[1, 33], [2, 54]] as const) {
    if (!f.present[h]) continue;
    if (!ref) return true;
    const y = f.points[wrist * 3 + 1]!;
    if (y < ref.cy + 1.1 * ref.w) return true;
  }
  return false;
}

interface Ref {
  readonly nx: number;
  readonly ny: number;
  /** median palm size over the clip */
  readonly s: number;
}

function palm(p: Float32Array, start: number): number {
  const wx = p[start * 3]!, wy = p[start * 3 + 1]!;
  const d1 = Math.hypot(p[(start + 5) * 3]! - wx, p[(start + 5) * 3 + 1]! - wy);
  const d2 = Math.hypot(p[(start + 17) * 3]! - wx, p[(start + 17) * 3 + 1]! - wy);
  return (d1 + d2) / 2;
}

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : NaN;
}

/** Nose position and palm size of a clip (medians), or null without hands. */
function clipRef(frames: readonly RawSeqFrame[]): Ref | null {
  const nx: number[] = [], ny: number[] = [], ps: number[] = [], hx: number[] = [], hy: number[] = [];
  for (const f of frames) {
    if (f.present[0]) {
      nx.push(f.points[0]!);
      ny.push(f.points[1]!);
    }
    for (const [h, start] of [[1, 33], [2, 54]] as const) {
      if (!f.present[h]) continue;
      const s = palm(f.points, start);
      if (s > 0.005) ps.push(s);
      hx.push(f.points[start * 3]!);
      hy.push(f.points[start * 3 + 1]!);
    }
  }
  if (!ps.length) return null;
  // without a pose, use a point above the hands' mean as a stand-in for the nose
  return nx.length ? { nx: median(nx), ny: median(ny), s: median(ps) } : { nx: median(hx), ny: median(hy) - 4 * median(ps), s: median(ps) };
}

/**
 * Per-frame features. Hands are ordered by image position relative to the nose (after the
 * optional mirror), not by MediaPipe's left/right label, so Holistic and HandLandmarker data
 * agree. A single hand goes to the slot of its side. `mirror` flips x (left-handed signing).
 */
export function frameFeatures(f: RawSeqFrame, ref: Ref, mirror: boolean): Float32Array {
  const out = new Float32Array(FEAT_DIM);
  const p = f.points;
  const sx = mirror ? -1 : 1;
  const hands: number[] = [];
  if (f.present[1]) hands.push(33);
  if (f.present[2]) hands.push(54);
  const wx = (start: number) => (sx * (p[start * 3]! - ref.nx)) / ref.s;
  const slots: (number | null)[] = [null, null];
  if (hands.length === 2) {
    const [a, b] = hands as [number, number];
    if (wx(a) <= wx(b)) [slots[0], slots[1]] = [a, b];
    else [slots[0], slots[1]] = [b, a];
  } else if (hands.length === 1) {
    slots[wx(hands[0]!) < 0 ? 0 : 1] = hands[0]!;
  }
  let o = 0;
  for (const start of slots) {
    if (start !== null) {
      const ps = Math.max(palm(p, start), 1e-4);
      const x0 = p[start * 3]!, y0 = p[start * 3 + 1]!;
      for (let i = 0; i < 21; i++) {
        out[o + i * 2] = (sx * (p[(start + i) * 3]! - x0)) / ps;
        out[o + i * 2 + 1] = (p[(start + i) * 3 + 1]! - y0) / ps;
      }
      out[o + 42] = wx(start) / 4;
      out[o + 43] = (y0 - ref.ny) / ref.s / 4;
      out[o + 44] = 1;
    }
    o += HAND_DIM;
  }
  return out;
}

/**
 * Trim to the hand-active span, normalise and resample to SEQ_LEN frames. Null if too short.
 * trim "presence": every frame with a hand counts (recorded clips); "body": only hands above the
 * lower chest count (live camera, where resting hands at the waist are visible too).
 */
export function sequenceFeatures(frames: readonly RawSeqFrame[], mirror = false, minActive = 6, trim: "presence" | "body" = "presence"): Float32Array[] | null {
  let bodyRef: { cy: number; w: number } | null = null;
  if (trim === "body") {
    const sh = frames.map(shoulders).filter((x): x is NonNullable<typeof x> => !!x);
    if (sh.length) bodyRef = { cy: median(sh.map((x) => x.cy)), w: median(sh.map((x) => x.w)) };
  }
  let a = -1, b = -1;
  frames.forEach((f, i) => {
    if (handActive(f, bodyRef)) {
      if (a < 0) a = i;
      b = i;
    }
  });
  if (a < 0 || b - a + 1 < minActive) return null;
  const span = frames.slice(a, b + 1);
  const ref = clipRef(span);
  if (!ref) return null;
  const out: Float32Array[] = [];
  for (let k = 0; k < SEQ_LEN; k++) {
    const t = (k * (span.length - 1)) / (SEQ_LEN - 1);
    out.push(frameFeatures(span[Math.round(t)]!, ref, mirror));
  }
  return out;
}

/** Feature weights (shape, position, missing hand); tuned with scripts/build-pharmacy-signs.mjs --eval. */
export const WEIGHTS = { shape: 0.25, pos: 6, missing: 3 };

function frameDist(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (const off of [0, HAND_DIM]) {
    const pa = a[off + 44]!, pb = b[off + 44]!;
    if (pa && pb) {
      for (let i = 0; i < 42; i++) {
        const d = a[off + i]! - b[off + i]!;
        s += WEIGHTS.shape * d * d; // hand shape
      }
      for (let i = 42; i < 44; i++) {
        const d = a[off + i]! - b[off + i]!;
        s += WEIGHTS.pos * d * d; // where the hand is, relative to the face
      }
    } else if (pa !== pb) s += WEIGHTS.missing;
  }
  return Math.sqrt(s);
}

/** DTW with a Sakoe-Chiba band of +-6 frames. */
export function dtw(a: readonly Float32Array[], b: readonly Float32Array[], band = 6): number {
  const n = a.length, m = b.length;
  const INF = 1e18;
  let prev = new Float64Array(m + 1).fill(INF);
  let cur = new Float64Array(m + 1).fill(INF);
  prev[0] = 0;
  for (let i = 1; i <= n; i++) {
    cur.fill(INF);
    const lo = Math.max(1, i - band), hi = Math.min(m, i + band);
    for (let j = lo; j <= hi; j++) {
      const c = frameDist(a[i - 1]!, b[j - 1]!);
      cur[j] = c + Math.min(prev[j]!, cur[j - 1]!, prev[j - 1]!);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[m]! / (n + m);
}

export interface Template {
  readonly sign: string;
  readonly signer: string;
  readonly seq: Float32Array[];
}

export interface Prediction {
  readonly sign: string;
  /** 0..1, from the distance gap between the best and the second-best sign. */
  readonly confidence: number;
  readonly ranking: readonly { sign: string; distance: number }[];
}

export function makeTemplates(clips: readonly { sign: string; signer: string; frames: readonly RawSeqFrame[] }[]): Template[] {
  const out: Template[] = [];
  for (const c of clips) {
    for (const mirror of [false, true]) {
      const seq = sequenceFeatures(c.frames, mirror);
      if (seq) out.push({ sign: c.sign, signer: c.signer, seq });
    }
  }
  return out;
}

/** k-nearest templates (per sign: mean of its k best distances), best sign first. */
export function classify(query: readonly Float32Array[], templates: readonly Template[], k = 3): Prediction | null {
  if (!templates.length) return null;
  const per = new Map<string, number[]>();
  for (const t of templates) {
    const d = dtw(query, t.seq);
    const arr = per.get(t.sign) ?? [];
    arr.push(d);
    per.set(t.sign, arr);
  }
  const ranking = [...per.entries()]
    .map(([sign, ds]) => {
      ds.sort((x, y) => x - y);
      const top = ds.slice(0, k);
      return { sign, distance: top.reduce((s, x) => s + x, 0) / top.length };
    })
    .sort((x, y) => x.distance - y.distance);
  const best = ranking[0]!;
  const second = ranking[1]?.distance ?? best.distance * 2;
  const confidence = Math.max(0, Math.min(1, (second - best.distance) / (0.25 * second)));
  return { sign: best.sign, confidence, ranking };
}

/**
 * Cuts isolated signs out of a 25 FPS stream: a sign is a run of hand-active frames, ended by
 * `gap` inactive frames (default 0.32 s) or a 3 s limit.
 */
export class SignSegmenter {
  private buf: RawSeqFrame[] = [];
  private active = 0;
  private idle = 0;
  private ref: { cx: number; cy: number; w: number } | null = null;
  private readonly onSign: (frames: RawSeqFrame[]) => void;
  private readonly gap: number;
  private readonly maxFrames: number;
  private readonly minActive: number;

  // No TS parameter properties: this file is also run by Node's type stripping (build script).
  constructor(onSign: (frames: RawSeqFrame[]) => void, gap = 8, maxFrames = 75, minActive = 8) {
    this.onSign = onSign;
    this.gap = gap;
    this.maxFrames = maxFrames;
    this.minActive = minActive;
  }

  get inSign(): boolean {
    return this.active > 0;
  }

  push(f: RawSeqFrame): void {
    const s = shoulders(f);
    if (s) this.ref = this.ref ? { cx: 0.8 * this.ref.cx + 0.2 * s.cx, cy: 0.8 * this.ref.cy + 0.2 * s.cy, w: 0.8 * this.ref.w + 0.2 * s.w } : s;
    const on = handActive(f, this.ref);
    if (on) {
      this.active++;
      this.idle = 0;
      this.buf.push(f);
    } else if (this.active) {
      this.idle++;
      this.buf.push(f);
      if (this.idle >= this.gap) this.flush();
    } else {
      // keep 4 frames of lead-in
      this.buf.push(f);
      if (this.buf.length > 4) this.buf.shift();
    }
    if (this.buf.length >= this.maxFrames && this.active) this.flush();
  }

  flush(): void {
    const frames = this.buf;
    const enough = this.active >= this.minActive;
    this.buf = [];
    this.active = 0;
    this.idle = 0;
    if (enough) this.onSign(frames);
  }

  reset(): void {
    this.buf = [];
    this.active = 0;
    this.idle = 0;
    this.ref = null;
  }
}
