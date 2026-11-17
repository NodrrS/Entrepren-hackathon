/**
 * Segmenters. v1 ships only the press-to-sign segmenter here; the hand-presence/velocity
 * heuristic is P3-01. Both implement the same `Segmenter` hook.
 */
import type { NormalisedFrame } from "../landmarks/normalise";
import type { SegmentSignal, Segmenter } from "./types";

/**
 * Press-to-sign: the UI calls `begin()` / `end()` (e.g. hold a button or the space bar). The
 * signal is emitted on the next frame, so segment times are always frame timestamps.
 */
export interface ManualSegmenter extends Segmenter {
  begin(): void;
  end(): void;
  cancel(): void;
  readonly active: boolean;
}

export function createManualSegmenter(): ManualSegmenter {
  let pending: "begin" | "end" | "cancel" | null = null;
  let active = false;
  let startMs = Number.NaN;

  return {
    id: "manual/v1",
    get active() {
      return active;
    },
    begin() {
      if (!active) pending = "begin";
    },
    end() {
      if (active || pending === "begin") pending = "end";
    },
    cancel() {
      if (active || pending !== null) pending = "cancel";
    },
    reset() {
      pending = null;
      active = false;
      startMs = Number.NaN;
    },
    push(frame: NormalisedFrame): SegmentSignal | null {
      const p = pending;
      pending = null;
      if (p === "begin" && !active) {
        active = true;
        startMs = frame.timestampMs;
        return { type: "start", atMs: startMs };
      }
      if (p === "end") {
        if (!active) {
          // begin() and end() both arrived before one frame: nothing was captured.
          return null;
        }
        active = false;
        return { type: "end", startMs, endMs: frame.timestampMs };
      }
      if (p === "cancel" && active) {
        active = false;
        return { type: "cancel", atMs: frame.timestampMs };
      }
      return null;
    },
  };
}
