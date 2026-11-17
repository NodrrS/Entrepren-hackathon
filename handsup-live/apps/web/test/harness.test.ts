import { describe, expect, it } from "vitest";
import { holisticResultToFrame, PART_LAYOUT } from "@handsup/sign-engine";
import { FpsMeter } from "../src/fps";
import { bindCameraLifecycle } from "../src/lifecycle";
import { HAND_CONNECTIONS, POSE_CONNECTIONS, drawSkeleton, toCanvas } from "../src/overlay";

class Target {
  private readonly l = new Map<string, Set<() => void>>();
  visibilityState = "visible";
  addEventListener(t: string, f: () => void) {
    if (!this.l.has(t)) this.l.set(t, new Set());
    this.l.get(t)!.add(f);
  }
  removeEventListener(t: string, f: () => void) {
    this.l.get(t)?.delete(f);
  }
  dispatch(t: string) {
    for (const f of this.l.get(t) ?? []) f();
  }
  count() {
    let n = 0;
    for (const s of this.l.values()) n += s.size;
    return n;
  }
}

describe("camera lifecycle", () => {
  it("stops on hidden, pagehide and beforeunload, not on visible", () => {
    const doc = new Target();
    const win = new Target();
    const reasons: string[] = [];
    const unbind = bindCameraLifecycle({ document: doc, window: win }, (r) => reasons.push(r));
    doc.dispatch("visibilitychange"); // still visible
    doc.visibilityState = "hidden";
    doc.dispatch("visibilitychange");
    win.dispatch("pagehide");
    win.dispatch("beforeunload");
    expect(reasons).toEqual(["hidden", "pagehide", "unload"]);
    unbind();
    expect(doc.count() + win.count()).toBe(0);
  });
});

describe("FpsMeter", () => {
  it("measures ~30 FPS and mean latency over a 1 s window", () => {
    const m = new FpsMeter();
    for (let i = 0; i <= 60; i++) m.tick(i * (1000 / 30), 10 + (i % 2));
    expect(m.fps).toBeCloseTo(30, 0);
    expect(m.meanInferenceMs).toBeCloseTo(10.5, 0);
    m.reset();
    expect(m.fps).toBe(0);
    expect(Number.isNaN(m.meanInferenceMs)).toBe(true);
  });

  it("is bounded", () => {
    const m = new FpsMeter(1_000_000, 10);
    for (let i = 0; i < 100; i++) m.tick(i);
    expect(m.fps).toBeCloseTo(1000, 0);
  });
});

describe("overlay", () => {
  it("connection indices are inside the hu-landmarks/v1 part sizes", () => {
    for (const [a, b] of HAND_CONNECTIONS) expect(Math.max(a, b)).toBeLessThan(PART_LAYOUT.leftHand.count);
    for (const [a, b] of POSE_CONNECTIONS) expect(Math.max(a, b)).toBeLessThan(PART_LAYOUT.pose.count);
  });

  it("draws only present parts, from hu-landmarks/v1 coordinates", () => {
    const hand = Array.from({ length: 21 }, (_, i) => ({ x: 0.5, y: i / 40, z: 0 }));
    const frame = holisticResultToFrame(
      { faceLandmarks: [], poseLandmarks: [], leftHandLandmarks: [hand], rightHandLandmarks: [] },
      { frameIndex: 0, timestampMs: 0, image: { width: 640, height: 480, mirrored: false } },
    );
    expect(toCanvas(frame, "leftHand", 20, 640, 480)).toEqual([320, 240]);
    expect(toCanvas(frame, "rightHand", 0, 640, 480)).toBeNull();

    const ops: string[] = [];
    const ctx = new Proxy(
      {},
      {
        get: (_t, prop) => (typeof prop === "string" && ["clearRect", "beginPath", "moveTo", "lineTo", "stroke", "arc", "fill", "fillRect"].includes(prop) ? () => ops.push(prop) : undefined),
        set: () => true,
      },
    ) as unknown as CanvasRenderingContext2D;
    drawSkeleton(ctx, frame, 640, 480);
    expect(ops[0]).toBe("clearRect");
    expect(ops.filter((o) => o === "lineTo")).toHaveLength(HAND_CONNECTIONS.length);
    expect(ops.filter((o) => o === "arc")).toHaveLength(21);
    expect(ops.includes("fillRect")).toBe(false); // no face drawn
  });
});
