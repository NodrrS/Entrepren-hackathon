/**
 * The signing figure for replies: a simple head, shoulders and two detailed hands, drawn from a
 * recorded PopSign skeleton and fitted to the canvas per clip. Only the reliable points are drawn
 * (hands from the hand tracker; nose, eyes, ears and shoulders from the pose); the pose's arms are
 * skipped because they are wrong on PopSign's close-up selfie clips.
 */
import { HAND_CONNECTIONS } from "../overlay";
import type { RawSeqFrame } from "./classify";

export interface Fit {
  readonly ox: number;
  readonly oy: number;
  readonly scale: number;
}

const ASPECT = 0.75; // PopSign clips are 3:4 portrait: x is scaled to the y unit

/** Fit all frames of a clip (hands, head, shoulders) into w x h with a margin. */
export function fitClip(frames: readonly RawSeqFrame[], w: number, h: number): Fit {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const add = (x: number, y: number) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  };
  for (const f of frames) {
    const p = f.points;
    if (f.present[0]) for (const i of [0, 2, 5, 7, 8, 11, 12]) add(p[i * 3]! * ASPECT, p[i * 3 + 1]!);
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

export function drawAvatar(ctx: CanvasRenderingContext2D, f: RawSeqFrame, fit: Fit, w: number, h: number): void {
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
  }
  for (const [hh, start, colour] of [[1, 33, "#FF5A36"], [2, 54, "#36C2FF"]] as const) {
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
