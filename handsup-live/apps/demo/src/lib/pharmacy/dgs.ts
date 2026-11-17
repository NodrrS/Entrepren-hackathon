/**
 * DGS sign player for /pharmacy: plays a gloss sequence as real SignDict videos next to a "skeleton
 * person" (precomputed MediaPipe pose + hands, in sync with the video), with a Video / Skeleton /
 * Both view. Glosses without an openly licensed video are shown as a text card ("Gebärde folgt")
 * for 1.2 s; they are never faked.
 */
import { FEAT_DIM, aspectCorrect, type RawSeqFrame, type Template } from "./classify";
import { drawAvatar, fitClip, type AvatarStyle } from "./avatar";

export interface DgsSign {
  readonly de: string;
  readonly en: string;
  readonly shown: string;
  readonly substitute: boolean;
  readonly note: string;
  readonly licence: string;
  readonly licenceUrl: string;
  readonly credit: string;
  readonly source: string;
  readonly video: string;
  readonly frames: RawSeqFrame[];
  readonly width: number;
  readonly height: number;
}

export interface DgsData {
  readonly signs: Record<string, DgsSign>;
  readonly missing: Record<string, { de: string; en: string }>;
  readonly sentences: { speaker: string; glosses: string[]; de: string; en: string }[];
  readonly templates: Template[];
}

interface DgsFile {
  seqLen: number;
  featDim: number;
  signs: Record<string, Omit<DgsSign, "frames" | "width" | "height"> & { skeleton: { frames: number; width: number; height: number; keypoints_b64: string; present: number[][] }; templates: string[] }>;
  missing: Record<string, { de: string; en: string }>;
  sentences: { speaker: string; glosses: string[]; de: string; en: string }[];
}

function f32(b64: string): Float32Array {
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Float32Array(u.buffer);
}

export async function loadDgs(url = "/pharmacy/dgs/dgs.json"): Promise<DgsData> {
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok || (res.headers.get("content-type") ?? "").includes("text/html")) throw new Error("dgs.json fehlt");
  const d = (await res.json()) as DgsFile;
  if (d.featDim !== FEAT_DIM) throw new Error("dgs.json passt nicht zu dieser Version");
  const signs: Record<string, DgsSign> = {};
  const templates: Template[] = [];
  for (const [g, s] of Object.entries(d.signs)) {
    const pts = f32(s.skeleton.keypoints_b64);
    const frames: RawSeqFrame[] = s.skeleton.present.map((p, i) => ({ points: pts.subarray(i * 225, (i + 1) * 225), present: [!!p[0], !!p[1], !!p[2], !!p[3]] as const }));
    signs[g] = { ...s, frames, width: s.skeleton.width, height: s.skeleton.height };
    for (const t of s.templates) {
      const flat = f32(t);
      const seq: Float32Array[] = [];
      for (let i = 0; i < d.seqLen; i++) seq.push(flat.subarray(i * FEAT_DIM, (i + 1) * FEAT_DIM));
      templates.push({ sign: g, signer: "signdict", seq });
    }
  }
  return { signs, missing: d.missing, sentences: d.sentences, templates };
}

/** Frames of a sign, aspect-corrected like the camera path (for the recogniser). */
export function featureFrames(s: DgsSign): RawSeqFrame[] {
  return s.frames.map((f) => aspectCorrect(f, s.width, s.height));
}

export type View = "video" | "skeleton" | "both";

export interface PlayerEls {
  readonly root: HTMLElement; // gets data-view
  readonly video: HTMLVideoElement;
  readonly canvas: HTMLCanvasElement;
  readonly card: HTMLElement; // text card for missing signs
  readonly cardWord: HTMLElement;
  readonly gloss: HTMLElement;
  readonly word: HTMLElement;
}

export interface Step {
  readonly gloss: string;
  readonly de: string;
  readonly en: string;
  readonly available: boolean;
}

export function stepsFor(glosses: readonly string[], data: DgsData): Step[] {
  return glosses.map((g) => {
    const s = data.signs[g];
    if (s) return { gloss: g, de: s.de, en: s.en, available: true };
    const m = data.missing[g];
    return { gloss: g, de: m?.de ?? g.toLowerCase(), en: m?.en ?? "", available: false };
  });
}

export class DgsPlayer {
  private token = 0;
  private readonly ctx: CanvasRenderingContext2D | null;

  constructor(
    private readonly els: PlayerEls,
    private readonly data: DgsData,
  ) {
    this.ctx = els.canvas.getContext("2d");
    els.canvas.width = 400;
    els.canvas.height = 320;
  }

  setView(v: View): void {
    this.els.root.dataset["view"] = v;
  }

  stop(): void {
    this.token++;
    this.els.video.pause();
  }

  /** Play the steps in order. `onStep(i)` fires when step i starts, `onDone` at the end. */
  async play(steps: readonly Step[], onStep?: (i: number, s: Step) => void): Promise<boolean> {
    const my = ++this.token;
    for (let i = 0; i < steps.length; i++) {
      if (my !== this.token) return false;
      const st = steps[i]!;
      onStep?.(i, st);
      this.els.gloss.textContent = st.gloss;
      this.els.word.textContent = st.en ? `${st.de} · ${st.en}` : st.de;
      if (!st.available) {
        this.els.root.dataset["card"] = "true";
        this.els.cardWord.textContent = st.de;
        this.ctx?.clearRect(0, 0, this.els.canvas.width, this.els.canvas.height);
        await new Promise((r) => setTimeout(r, 1200));
        continue;
      }
      this.els.root.dataset["card"] = "false";
      await this.playSign(this.data.signs[st.gloss]!, my);
    }
    return my === this.token;
  }

  private async playSign(s: DgsSign, my: number): Promise<void> {
    const v = this.els.video;
    const style: AvatarStyle = { aspect: s.width / s.height, body: true };
    const W = this.els.canvas.width, H = this.els.canvas.height;
    const fit = fitClip(s.frames, W, H, style);
    v.src = s.video;
    v.muted = true;
    v.playsInline = true;
    try {
      await new Promise<void>((res, rej) => {
        v.onloadeddata = () => res();
        v.onerror = () => rej(new Error("video"));
        setTimeout(res, 4000); // never hang on a slow network
      });
      await v.play().catch(() => undefined);
    } catch {
      /* the skeleton still plays on its own clock */
    }
    const t0 = performance.now();
    const dur = s.frames.length / 25;
    for (;;) {
      if (my !== this.token) return;
      // follow the video clock when it plays, else wall-clock time
      const t = !v.paused && v.currentTime > 0 ? v.currentTime : (performance.now() - t0) / 1000;
      const i = Math.min(s.frames.length - 1, Math.floor(t * 25));
      if (this.ctx) drawAvatar(this.ctx, s.frames[i]!, fit, W, H, style);
      if (t >= dur || (v.ended && t > 0.2)) break;
      await new Promise((r) => setTimeout(r, 30));
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}
