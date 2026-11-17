// Copied unchanged from apps/web/src/overlay.ts (Hands Up live app). Keep in sync by hand; a later API swap removes the need.
/**
 * Skeleton overlay drawn from a `hu-landmarks/v1` frame (not from MediaPipe's own result), so
 * the overlay works with any extractor behind the LandmarkSource interface.
 */
import { CHANNELS, PART_LAYOUT, type BodyPart, type LandmarkFrame } from "@handsup/sign-engine";

/** Standard 21-point hand topology. */
export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

/** Upper-body BlazePose connections (legs are not useful for signing and are skipped). */
export const POSE_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [15, 17], [15, 19], [15, 21], [17, 19], [16, 18], [16, 20], [16, 22], [18, 20],
  [11, 23], [12, 24], [23, 24],
  [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8], [9, 10],
];

export interface OverlayColours {
  readonly pose: string;
  readonly leftHand: string;
  readonly rightHand: string;
  readonly face: string;
}

export const DEFAULT_COLOURS: OverlayColours = {
  pose: "#F4F1EA",
  leftHand: "#FF5A36", // Signal Coral (D-010)
  rightHand: "#36C2FF",
  face: "rgba(244, 241, 234, 0.55)",
};

/** Canvas-pixel position of a point, or null if absent. */
export function toCanvas(frame: LandmarkFrame, part: BodyPart, index: number, w: number, h: number): [number, number] | null {
  const i = (PART_LAYOUT[part].offset + index) * CHANNELS;
  const x = frame.points[i]!;
  const y = frame.points[i + 1]!;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [x * w, y * h];
}

export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  frame: LandmarkFrame,
  w: number,
  h: number,
  colours: OverlayColours = DEFAULT_COLOURS,
): void {
  ctx.clearRect(0, 0, w, h);
  const line = Math.max(2, Math.round(Math.min(w, h) / 240));

  if (frame.presence.face) {
    ctx.fillStyle = colours.face;
    // Every 4th mesh point is enough to show tracking without clutter.
    for (let i = 0; i < PART_LAYOUT.face.count; i += 4) {
      const p = toCanvas(frame, "face", i, w, h);
      if (p) ctx.fillRect(p[0] - 1, p[1] - 1, 2, 2);
    }
  }
  if (frame.presence.pose) drawPart(ctx, frame, "pose", POSE_CONNECTIONS, colours.pose, line, w, h);
  if (frame.presence.leftHand) drawPart(ctx, frame, "leftHand", HAND_CONNECTIONS, colours.leftHand, line, w, h);
  if (frame.presence.rightHand) drawPart(ctx, frame, "rightHand", HAND_CONNECTIONS, colours.rightHand, line, w, h);
}

function drawPart(
  ctx: CanvasRenderingContext2D,
  frame: LandmarkFrame,
  part: BodyPart,
  connections: ReadonlyArray<readonly [number, number]>,
  colour: string,
  line: number,
  w: number,
  h: number,
): void {
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.lineWidth = line;
  ctx.beginPath();
  for (const [a, b] of connections) {
    const pa = toCanvas(frame, part, a, w, h);
    const pb = toCanvas(frame, part, b, w, h);
    if (!pa || !pb) continue;
    ctx.moveTo(pa[0], pa[1]);
    ctx.lineTo(pb[0], pb[1]);
  }
  ctx.stroke();
  const used = new Set(connections.flat());
  for (const i of used) {
    const p = toCanvas(frame, part, i, w, h);
    if (!p) continue;
    ctx.beginPath();
    ctx.arc(p[0], p[1], line * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}
