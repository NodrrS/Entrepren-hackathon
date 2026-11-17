/**
 * The signing figure for replies: a simple head, shoulders and two detailed hands, drawn from a
 * recorded PopSign skeleton and fitted to the canvas per clip. Only the reliable points are drawn
 * (hands from the hand tracker; nose, eyes, ears and shoulders from the pose); the pose's arms are
 * skipped because they are wrong on PopSign's close-up selfie clips.
 */
import { HAND_CONNECTIONS } from "@/lib/shared/overlay";
import type { RawSeqFrame } from "./classify";

export interface Fit {
  readonly ox: number;
  readonly oy: number;
  readonly scale: number;
}

export interface AvatarStyle {
  /** width / height of the source video (x is scaled into the y unit) */
  readonly aspect: number;
  /** draw the arms from the pose (reliable on full-body videos such as SignDict, not on PopSign selfies) */
  readonly body: boolean;
}
export const POPSIGN_STYLE: AvatarStyle = { aspect: 0.75, body: false };

/** Fit all frames of a clip (hands, head, shoulders) into w x h with a margin. */
export function fitClip(frames: readonly RawSeqFrame[], w: number, h: number, style: AvatarStyle = POPSIGN_STYLE): Fit {
  const ASPECT = style.aspect;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const add = (x: number, y: number) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  };
  for (const f of frames) {
    const p = f.points;
    if (f.present[0]) for (const i of style.body ? [0, 2, 5, 7, 8, 11, 12, 13, 14] : [0, 2, 5, 7, 8, 11, 12]) add(p[i * 3]! * ASPECT, p[i * 3 + 1]!);
    for (const [hh, start] of [[1, 33], [2, 54]] as const) {
      if (!f.present[hh]) continue;
      for (let i = 0; i < 21; i++) add(p[(start + i) * 3]! * ASPECT, p[(start + i) * 3 + 1]!);
    }
  }
  if (!Number.isFinite(minX)) return { ox: 0, oy: 0, scale: Math.min(w, h) };
  // keep the shoulders inside, but never zoom in more than the hands need
  maxY = Math.min(maxY, 1.15);
  const bw = maxX - minX, bh = maxY - minY;
  const scale = Math.min((w * 0.86) / bw, (h * 0.86) / bh);
  return { ox: w / 2 - ((minX + maxX) / 2) * scale, oy: h / 2 - ((minY + maxY) / 2) * scale, scale };
}

export function drawAvatar(ctx: CanvasRenderingContext2D, f: RawSeqFrame, fit: Fit, w: number, h: number, style: AvatarStyle = POPSIGN_STYLE): void {
  const ASPECT = style.aspect;
  ctx.clearRect(0, 0, w, h);
  const p = f.points;
  const X = (i: number) => fit.ox + p[i * 3]! * ASPECT * fit.scale;
  const Y = (i: number) => fit.oy + p[i * 3 + 1]! * fit.scale;
  const line = Math.max(3, Math.round(w / 90));
  if (f.present[0]) {
    // head: circle through the ears, centred between the eyes and the nose
    const cx = (X(2) + X(5) + X(0)) / 3, cy = (Y(2) + Y(5) + Y(0)) / 3;
    const r = Math.max(18, Math.hypot(X(7) - X(8), Y(7) - Y(8)) * 0.62);
    ctx.fillStyle = "rgba(244, 241, 234, 0.12)";
    ctx.strokeStyle = "#F4F1EA";
    ctx.lineWidth = line;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // shoulders and neck
    const sx = (X(11) + X(12)) / 2, sy = (Y(11) + Y(12)) / 2;
    ctx.beginPath();
    ctx.moveTo(X(11), Y(11));
    ctx.lineTo(X(12), Y(12));
    ctx.moveTo(sx, sy);
    ctx.lineTo(cx, cy + r);
    ctx.stroke();
    if (style.body) {
      // arms in the brand coral; the hands are drawn brighter on top
      ctx.strokeStyle = "#FF5A36";
      ctx.lineWidth = line * 1.6;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      // torso: shoulders to hips (hips only when they are inside the video)
      ctx.strokeStyle = "rgba(255, 90, 54, 0.55)";
      ctx.lineWidth = line * 1.4;
      const hipsIn = p[23 * 3 + 1]! < 0.98 && p[24 * 3 + 1]! < 0.98;
      const hipY = (i: number) => (hipsIn ? Y(i) : Math.min(h - 2, Y(i)));
      ctx.beginPath();
      ctx.moveTo(X(11), Y(11));
      ctx.lineTo(X(23), hipY(23));
      ctx.lineTo(X(24), hipY(24));
      ctx.lineTo(X(12), Y(12));
      ctx.stroke();
      ctx.strokeStyle = "#FF5A36";
      ctx.lineWidth = line * 1.6;
      for (const [a, b, c, hand, start] of [[11, 13, 15, 1, 33], [12, 14, 16, 2, 54]] as const) {
        ctx.beginPath();
        ctx.moveTo(X(a), Y(a));
        ctx.lineTo(X(b), Y(b));
        // forearm to the tracked hand's wrist; without a tracked hand only when the pose wrist is inside
        // the video (a hand out of view is hidden, not drawn as a stray arm)
        if (f.present[hand]) ctx.lineTo(X(start), Y(start));
        else if (p[c * 3 + 1]! < 0.98) ctx.lineTo(X(c), Y(c));
        ctx.stroke();
      }
    }
  }
  const hands = style.body ? ([[1, 33, "#FFE8A3"], [2, 54, "#FFE8A3"]] as const) : ([[1, 33, "#FF5A36"], [2, 54, "#36C2FF"]] as const);
  for (const [hh, start, colour] of hands) {
    if (!f.present[hh]) continue;
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    ctx.lineWidth = line;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) {
      ctx.moveTo(X(start + a), Y(start + a));
      ctx.lineTo(X(start + b), Y(start + b));
    }
    ctx.stroke();
    for (let i = 0; i < 21; i++) {
      ctx.beginPath();
      ctx.arc(X(start + i), Y(start + i), line * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
