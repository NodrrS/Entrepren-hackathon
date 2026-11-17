/**
 * Guided scenario: the app knows which DGS sign the customer should sign next and checks a simple,
 * signer-independent feature rule on the camera's sign segment (where the hand is relative to the
 * head and chest, and how it moves). Steps without a fair rule accept any clear sign segment and
 * are marked "~" (loose). This is NOT open recognition; the page says so.
 *
 * Frames are aspect-corrected raw frames (fc10 layout): pose 0..32, left hand 33..53, right 54..74.
 */
import type { RawSeqFrame } from "./classify";

export type RuleKind = "hallo" | "kopf" | "schmerz" | "bitte" | "danke" | "loose";

export interface GuidedStep {
  readonly gloss: string;
  readonly de: string;
  readonly rule: RuleKind;
  /** What to do, shown when the rule does not match yet. */
  readonly hint: string;
}

export interface GuidedTurn {
  readonly title: string;
  readonly steps: readonly GuidedStep[];
  readonly de: string;
  readonly en: string;
}

const L = (gloss: string, de: string, hint = "eine deutliche Gebärde vor dem Körper"): GuidedStep => ({ gloss, de, rule: "loose", hint });

export const TURN_1: GuidedTurn = {
  title: "Kundin, Teil 1",
  steps: [
    { gloss: "HALLO", de: "Hallo", rule: "hallo", hint: "Hand neben dem Kopf heben und winken" },
    { gloss: "KOPF", de: "Kopf", rule: "kopf", hint: "Hand an Stirn oder Schläfe" },
    { gloss: "SCHMERZ", de: "Schmerz", rule: "schmerz", hint: "am Kopf kleine, wiederholte Bewegung" },
    L("ARZT", "Arzt", "ARZT gebärden (am Handgelenk)"),
    L("GEHEN", "gehen"),
    L("HIER", "hier", "nach unten zeigen"),
    L("REZEPT", "Rezept"),
    L("DEUTSCH", "Deutsch"),
    L("LESEN", "lesen", "LESEN gebärden (vor dem Gesicht)"),
    L("KANN-NICHT", "kann nicht"),
    { gloss: "BITTE", de: "bitte", rule: "bitte", hint: "flache Hand vor der Brust nach vorn oder unten" },
    L("HELFEN", "helfen"),
  ],
  de: "Hallo, ich habe Kopfschmerzen. Ich war beim Arzt, hier ist das Rezept. Ich kann kein Deutsch lesen, bitte helfen Sie mir.",
  en: "Hello, I have a headache. I went to the doctor, here is the prescription. I can't read German, please help me.",
};

export const TURN_3: GuidedTurn = {
  title: "Kundin, Teil 3",
  steps: [
    L("VERSTEHEN", "verstehen", "VERSTEHEN gebärden (an der Stirn)"),
    { gloss: "DANKE", de: "danke", rule: "danke", hint: "Hand vom Kinn nach vorn" },
    L("HILFE", "Hilfe"),
  ],
  de: "Ah, ich verstehe. Danke für Ihre Hilfe.",
  en: "Ah, I understand. Thank you for your help.",
};

interface Ref {
  nx: number;
  ny: number;
  sy: number;
  w: number;
}

function ref(frames: readonly RawSeqFrame[]): Ref | null {
  let n = 0, nx = 0, ny = 0, sy = 0, w = 0;
  for (const f of frames) {
    if (!f.present[0]) continue;
    const p = f.points;
    const sw = Math.hypot(p[33]! - p[36]!, p[34]! - p[37]!); // shoulders 11 and 12
    if (!(sw > 0.01)) continue;
    n++;
    nx += p[0]!;
    ny += p[1]!;
    sy += (p[34]! + p[37]!) / 2;
    w += sw;
  }
  return n ? { nx: nx / n, ny: ny / n, sy: sy / n, w: w / n } : null;
}

/** Track of one hand over the segment (wrist and index tip), in shoulder-width units around the nose. */
interface Track {
  wx: number[];
  wy: number[];
  tx: number[];
  ty: number[];
}

function tracks(frames: readonly RawSeqFrame[], r: Ref): Track[] {
  const out: Track[] = [];
  for (const start of [33, 54]) {
    const h = start === 33 ? 1 : 2;
    const t: Track = { wx: [], wy: [], tx: [], ty: [] };
    for (const f of frames) {
      if (!f.present[h]) continue;
      const p = f.points;
      t.wx.push((p[start * 3]! - r.nx) / r.w);
      t.wy.push((p[start * 3 + 1]! - r.ny) / r.w);
      t.tx.push((p[(start + 8) * 3]! - r.nx) / r.w);
      t.ty.push((p[(start + 8) * 3 + 1]! - r.ny) / r.w);
    }
    if (t.wx.length >= 4) out.push(t);
  }
  return out;
}

const range = (v: number[]) => (v.length ? Math.max(...v) - Math.min(...v) : 0);
/** Direction changes of a 1-D signal, ignoring wiggles below `eps`. */
function reversals(v: number[], eps: number): number {
  let n = 0, dir = 0, anchor = v[0] ?? 0;
  for (const x of v) {
    const d = x - anchor;
    if (Math.abs(d) < eps) continue;
    const s = Math.sign(d);
    if (dir && s !== dir) n++;
    dir = s;
    anchor = x;
  }
  return n;
}

export interface Check {
  readonly ok: boolean;
  /** "rule" when a feature rule matched, "loose" when any clear segment counts */
  readonly how: "rule" | "loose";
}

/** Does this sign segment satisfy the step's rule? */
export function checkStep(step: GuidedStep, frames: readonly RawSeqFrame[]): Check {
  const r = ref(frames);
  const ts = r ? tracks(frames, r) : [];
  const clear = ts.some((t) => t.wx.length >= 6);
  if (step.rule === "loose") return { ok: clear, how: "loose" };
  if (!r || !ts.length) return { ok: false, how: "rule" };
  // distances in shoulder widths, origin at the nose (y grows downwards)
  const nearHead = (t: Track) => t.tx.filter((x, i) => Math.hypot(x, t.ty[i]! + 0.15) < 0.75).length >= 3;
  switch (step.rule) {
    case "hallo":
      // fingers raised beside the head (tip at head height, to the side) with side-to-side motion
      return { ok: ts.some((t) => t.tx.filter((x, i) => t.ty[i]! < 0.35 && Math.abs(x) > 0.3).length >= 3 && range(t.tx) > 0.25), how: "rule" };
    case "kopf":
      return { ok: ts.some(nearHead), how: "rule" };
    case "schmerz":
      return {
        ok: ts.some((t) => nearHead(t) && reversals(t.tx, 0.04) + reversals(t.ty, 0.04) >= 2) ||
          (ts.length === 2 && ts[0]!.tx.some((x, i) => Math.abs(x - (ts[1]!.tx[i] ?? 99)) < 0.4)),
        how: "rule",
      };
    case "bitte": {
      // flat hand in front of the chest (wrist and fingertips below the shoulders, not at the face) that moves
      const chestY = (r.sy - r.ny) / r.w;
      return {
        ok: ts.some((t) => {
          const n = t.wy.length;
          const low = t.wy.filter((y, i) => y > chestY + 0.15 && t.ty[i]! > chestY).length;
          return low >= n / 2 && (range(t.wy) > 0.25 || range(t.wx) > 0.25);
        }),
        how: "rule",
      };
    }
    case "danke": {
      // fingertips at the mouth or chin first, then away from it
      const dm = (t: Track) => t.tx.map((x, i) => Math.hypot(x, t.ty[i]! - 0.3));
      return {
        ok: ts.some((t) => {
          const d = dm(t);
          const first = d.findIndex((v) => v < 0.4);
          if (first < 0 || d.filter((v) => v < 0.4).length < 3) return false;
          const after = t.ty.slice(first);
          return Math.max(...after) - Math.min(...after) > 0.3; // then down and away from the mouth
        }),
        how: "rule",
      };
    }
  }
  return { ok: false, how: "rule" };
}

// ---------------------------------------------------------------------------------------------
// Rolling-window tracker (no pauses needed): rules run on the last ~0.6 s on every frame; when the
// current step fires, the step advances at once and the window is cleared, so a signer can sign
// the whole sentence in one flow. Assistenz: if the person is clearly signing but the step has not
// matched within 1.5 s, it advances with "~" so the demo never stalls.

export interface TrackerDebug {
  hands: number;
  headDist: number; // closest fingertip to the head, in shoulder widths (Infinity without hands)
  motion: number; // mean hand speed over the window, shoulder widths per frame
  step: string;
}

export interface Advance {
  readonly index: number;
  readonly how: "rule" | "loose" | "assist";
}

interface Pt {
  x: number;
  y: number;
}
interface FrameFeat {
  hands: { w: Pt; tip: Pt }[]; // relative to the nose, in shoulder widths
  shY: number; // shoulder line relative to the nose
}

const WINDOW = 15; // 0.6 s at 25 FPS

export class GuidedTracker {
  private buf: FrameFeat[] = [];
  private ref: { nx: number; ny: number; sy: number; w: number } | null = null;
  private stepFrames = 0;
  index = 0;
  assist = true;
  debug: TrackerDebug = { hands: 0, headDist: Infinity, motion: 0, step: "" };

  constructor(readonly turn: GuidedTurn) {}

  get done(): boolean {
    return this.index >= this.turn.steps.length;
  }

  /** Skip the current step (presenter). */
  skip(): void {
    this.next();
  }

  private next(): void {
    this.index++;
    this.buf = [];
    this.stepFrames = 0;
  }

  /** One 25 FPS frame (aspect-corrected). Returns the advance, if the current step fired. */
  push(f: RawSeqFrame): Advance | null {
    if (this.done) return null;
    const p = f.points;
    if (f.present[0]) {
      const w = Math.hypot(p[33]! - p[36]!, p[34]! - p[37]!);
      if (w > 0.01) {
        const r = { nx: p[0]!, ny: p[1]!, sy: (p[34]! + p[37]!) / 2, w };
        this.ref = this.ref ? { nx: 0.7 * this.ref.nx + 0.3 * r.nx, ny: 0.7 * this.ref.ny + 0.3 * r.ny, sy: 0.7 * this.ref.sy + 0.3 * r.sy, w: 0.8 * this.ref.w + 0.2 * r.w } : r;
      }
    }
    // No pose yet (a small or partly visible signer): a stand-in reference from the hands, so motion and
    // Assistenz still work. Shoulder width ~ 2.5 palm lengths; the "nose" sits above the hands.
    if (!this.ref) {
      for (const [h, s] of [[1, 33], [2, 54]] as const) {
        if (!f.present[h]) continue;
        const palm = Math.hypot(p[(s + 9) * 3]! - p[s * 3]!, p[(s + 9) * 3 + 1]! - p[s * 3 + 1]!);
        if (palm > 0.002) {
          const w = 2.5 * palm;
          this.ref = { nx: p[s * 3]!, ny: p[s * 3 + 1]! - 0.8 * w, sy: p[s * 3 + 1]! - 0.2 * w, w };
          break;
        }
      }
    }
    const r = this.ref;
    const feat: FrameFeat = { hands: [], shY: r ? (r.sy - r.ny) / r.w : 0.6 };
    if (r) {
      for (const [h, s] of [[1, 33], [2, 54]] as const) {
        if (!f.present[h]) continue;
        feat.hands.push({
          w: { x: (p[s * 3]! - r.nx) / r.w, y: (p[s * 3 + 1]! - r.ny) / r.w },
          tip: { x: (p[(s + 8) * 3]! - r.nx) / r.w, y: (p[(s + 8) * 3 + 1]! - r.ny) / r.w },
        });
      }
    }
    this.buf.push(feat);
    if (this.buf.length > WINDOW) this.buf.shift();
    this.stepFrames++;

    const step = this.turn.steps[this.index]!;
    const motion = this.motion();
    const headDists = this.buf.flatMap((b) => b.hands.map((h) => Math.hypot(h.tip.x, h.tip.y + 0.1)));
    this.debug = { hands: feat.hands.length, headDist: headDists.length ? Math.min(...headDists.slice(-3)) : Infinity, motion, step: step.gloss };

    const fired = this.rule(step.rule, motion);
    if (fired) {
      const a: Advance = { index: this.index, how: step.rule === "loose" ? "loose" : "rule" };
      this.next();
      return a;
    }
    // Assistenz: active signing for 1.5 s without a match -> advance with "~"
    if (this.assist && this.stepFrames >= 38 && motion > 0.02 && feat.hands.length) {
      const a: Advance = { index: this.index, how: "assist" };
      this.next();
      return a;
    }
    return null;
  }

  /** Mean wrist speed (shoulder widths per frame) over the window, for frames where the hand is seen in both. */
  private motion(): number {
    let sum = 0, n = 0;
    for (let i = 1; i < this.buf.length; i++) {
      const a = this.buf[i - 1]!, b = this.buf[i]!;
      const k = Math.min(a.hands.length, b.hands.length);
      for (let j = 0; j < k; j++) {
        sum += Math.hypot(b.hands[j]!.w.x - a.hands[j]!.w.x, b.hands[j]!.w.y - a.hands[j]!.w.y);
        n++;
      }
    }
    return n ? sum / n : 0;
  }

  private count(pred: (h: { w: Pt; tip: Pt }, b: FrameFeat) => boolean): number {
    return this.buf.filter((b) => b.hands.some((h) => pred(h, b))).length;
  }

  private rule(kind: RuleKind, motion: number): boolean {
    const nearHead = (h: { tip: Pt }) => Math.hypot(h.tip.x, h.tip.y + 0.1) < 1.0;
    const aboveShoulders = (h: { tip: Pt }, b: FrameFeat) => h.tip.y < b.shY;
    switch (kind) {
      case "hallo": {
        // any hand at or above shoulder height near the head, moving left-right (scale- and mirror-free)
        const up = this.buf.flatMap((b) => b.hands.filter((h) => h.tip.y < b.shY + 0.15 && Math.abs(h.tip.x) < 2.0).map((h) => h.tip.x));
        return up.length >= 4 && Math.max(...up) - Math.min(...up) > 0.12 && motion > 0.008;
      }
      case "kopf":
        // any hand above the shoulder line near the head
        return this.count((h, b) => aboveShoulders(h, b) && nearHead(h)) >= 4;
      case "schmerz":
        // movement near the head for about 0.4 s
        return this.count(nearHead) >= 10 && motion > 0.01;
      case "bitte":
        // a hand below the shoulders moving
        return this.count((h, b) => h.w.y > b.shY) >= 8 && motion > 0.015;
      case "danke":
        // a hand near the mouth/chin with motion
        return this.count((h) => Math.hypot(h.tip.x, h.tip.y - 0.3) < 0.8) >= 4 && motion > 0.015;
      case "loose":
        // any 0.35 s burst of hand motion
        return this.buf.length >= 9 && this.buf.slice(-9).every((b) => b.hands.length > 0) && motion > 0.02;
    }
  }
}
