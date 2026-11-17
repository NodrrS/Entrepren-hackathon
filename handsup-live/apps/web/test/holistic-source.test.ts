import { describe, expect, it } from "vitest";
import { sha256Hex, validateFrame, type LandmarkFrame } from "@handsup/sign-engine";
import { createHolisticWebSource, type HolisticLike } from "@handsup/sign-engine/sources/mediapipe-holistic-web";

const MODEL = new TextEncoder().encode("fake .task bytes");

class FakeTrack {
  stopped = false;
  stop() {
    this.stopped = true;
  }
}

function fakeVideo() {
  let cb: (() => void) | null = null;
  const v = {
    readyState: 4,
    videoWidth: 640,
    videoHeight: 480,
    srcObject: null as unknown,
    muted: false,
    playsInline: false,
    paused: true,
    async play() {
      this.paused = false;
    },
    pause() {
      this.paused = true;
    },
    requestVideoFrameCallback(f: () => void) {
      cb = f;
      return 1;
    },
    cancelVideoFrameCallback() {
      cb = null;
    },
    /** Deliver one camera frame. */
    frame() {
      const f = cb;
      cb = null;
      f?.();
    },
  };
  return v;
}

function setup(opts: { contentType?: string; status?: number; sha?: string | null; gumError?: string; gpuFails?: boolean } = {}) {
  const video = fakeVideo();
  const tracks = [new FakeTrack()];
  const fetched: string[] = [];
  const delegates: string[] = [];
  let t = 0;
  const landmarker: HolisticLike = {
    detectForVideo: () => ({
      faceLandmarks: [Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }))],
      poseLandmarks: [Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }))],
      leftHandLandmarks: [],
      rightHandLandmarks: [Array.from({ length: 21 }, () => ({ x: 0.4, y: 0.4, z: 0 }))],
    }),
    close() {},
  };
  const source = createHolisticWebSource({
    video: video as unknown as HTMLVideoElement,
    wasmBasePath: "/mediapipe/wasm",
    modelUrl: "/models/holistic_landmarker.task",
    modelSha256: opts.sha === undefined ? null : opts.sha,
    fetchFn: (async (url: RequestInfo | URL) => {
      fetched.push(String(url));
      return new Response(MODEL, { status: opts.status ?? 200, headers: { "content-type": opts.contentType ?? "application/octet-stream" } });
    }) as typeof fetch,
    getUserMedia: async () => {
      if (opts.gumError) throw Object.assign(new Error(opts.gumError), { name: opts.gumError });
      return { getTracks: () => tracks } as unknown as MediaStream;
    },
    now: () => (t += 5),
    createLandmarker: async (_bytes, delegate) => {
      delegates.push(delegate);
      if (opts.gpuFails && delegate === "GPU") throw new Error("no WebGL");
      return landmarker;
    },
  });
  return { source, video, tracks, fetched, delegates };
}

describe("MediaPipe Holistic web source", () => {
  it("refuses to load when the SHA-256 is not pinned (never fetches)", async () => {
    const { source, fetched } = setup({ sha: null });
    await expect(source.load()).rejects.toMatchObject({ code: "model-hash-mismatch" });
    expect(fetched).toEqual([]);
  });

  it("reports model-missing when the dev server answers with index.html or 404", async () => {
    const sha = await sha256Hex(MODEL);
    await expect(setup({ sha, contentType: "text/html" }).source.load()).rejects.toMatchObject({ code: "model-missing" });
    await expect(setup({ sha, status: 404 }).source.load()).rejects.toMatchObject({ code: "model-missing" });
  });

  it("rejects a model whose SHA-256 does not match", async () => {
    const { source, delegates } = setup({ sha: "0".repeat(64) });
    await expect(source.load()).rejects.toMatchObject({ code: "model-hash-mismatch" });
    expect(delegates).toEqual([]); // MediaPipe never saw the bytes
  });

  it("falls back from GPU to CPU", async () => {
    const { source, delegates } = setup({ sha: await sha256Hex(MODEL), gpuFails: true });
    await source.load();
    expect(delegates).toEqual(["GPU", "CPU"]);
    expect(source.delegate).toBe("CPU");
  });

  it("emits valid hu-landmarks/v1 frames and releases the camera on stop()", async () => {
    const { source, video, tracks, fetched } = setup({ sha: await sha256Hex(MODEL) });
    const frames: LandmarkFrame[] = [];
    const states: string[] = [];
    source.onFrame((f) => frames.push(f));
    source.onState((s) => states.push(s));
    await source.start();
    expect(fetched).toEqual(["/models/holistic_landmarker.task"]); // same origin only
    video.frame();
    video.frame();
    expect(frames).toHaveLength(2);
    expect(validateFrame(frames[0]!)).toEqual([]);
    expect(frames[0]!.presence).toEqual({ face: true, pose: true, leftHand: false, rightHand: true });
    expect(frames[1]!.timestampMs).toBeGreaterThan(frames[0]!.timestampMs);
    expect(frames[1]!.frameIndex).toBe(1);
    expect(frames[0]!.image).toEqual({ width: 640, height: 480, mirrored: false });

    source.stop();
    expect(tracks.every((t) => t.stopped)).toBe(true);
    expect(video.srcObject).toBeNull();
    video.frame(); // no callback pending any more
    expect(frames).toHaveLength(2);
    expect(states).toEqual(["starting", "running", "stopped"]);
  });

  it("maps a denied permission to camera-denied", async () => {
    const { source } = setup({ sha: await sha256Hex(MODEL), gumError: "NotAllowedError" });
    await expect(source.start()).rejects.toMatchObject({ code: "camera-denied" });
    expect(source.state).toBe("error");
  });
});
