import { describe, expect, it } from "vitest";
import {
  Emitter,
  createManualSegmenter,
  createNormaliser,
  createPointSubsetFeatures,
  createSignEngine,
  topK,
  type Classifier,
  type EngineEvent,
  type FeatureWindow,
  type LandmarkFrame,
  type LandmarkSource,
  type SourceState,
  type EngineError,
} from "../src/index";
import { syntheticFrame } from "./helpers";

class FakeSource implements LandmarkSource {
  readonly info = { extractor: "fake", extractorVersion: "0", assetSha256: {} };
  state: SourceState = "idle";
  startCalls = 0;
  stopCalls = 0;
  failStart: Error | null = null;
  private readonly frames = new Emitter<[LandmarkFrame]>();
  private readonly states = new Emitter<[SourceState, EngineError | undefined]>();
  async start() {
    this.startCalls++;
    if (this.failStart) throw this.failStart;
    this.state = "running";
    this.states.emit("running", undefined);
  }
  stop() {
    this.stopCalls++;
    this.state = "stopped";
  }
  onFrame(l: (f: LandmarkFrame) => void) {
    return this.frames.on(l);
  }
  onState(l: (s: SourceState, e?: EngineError) => void) {
    return this.states.on(l);
  }
  push(t: number) {
    this.frames.emit(syntheticFrame({ timestampMs: t, frameIndex: t }));
  }
  fail(error: EngineError) {
    this.states.emit("error", error);
  }
  get listeners() {
    return this.frames.size;
  }
}

const LABELS = ["HELLO", "THANK-YOU", "YES", "NO"];
const features = createPointSubsetFeatures({ id: "hands@1", points: [["leftHand", 0], ["rightHand", 0]] });

function fakeClassifier(opts: { delayMs?: number; fail?: boolean } = {}) {
  const seen: FeatureWindow[] = [];
  const c: Classifier = {
    info: { modelId: "fake-model", modelVersion: "0.0.1", inputFrames: 8, inputFeatures: features.featureSize, labels: LABELS },
    async classify(window, k) {
      seen.push(window);
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      if (opts.fail) throw new Error("model exploded");
      return { topK: topK([3, 1, 0.5, 0], LABELS, k), latencyMs: 4 };
    },
    dispose() {},
  };
  return { c, seen };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("createSignEngine", () => {
  it("landmarks-only mode emits status and normalised frames", async () => {
    const source = new FakeSource();
    const engine = createSignEngine({ source, normaliser: createNormaliser() });
    const events: EngineEvent[] = [];
    engine.on((e) => events.push(e));
    await engine.start();
    source.push(0);
    source.push(33);
    engine.stop();
    source.push(66); // after stop: ignored
    expect(events.map((e) => e.type)).toEqual(["status", "frame", "frame", "status"]);
    const frame = events[1];
    expect(frame?.type === "frame" && frame.frame.space).toBe("hu-norm/v1");
    expect(engine.status).toBe("stopped");
    expect(source.stopCalls).toBe(1);
    expect(source.listeners).toBe(0);
  });

  it("segment -> bounded window -> classifier -> final top-3 prediction", async () => {
    const source = new FakeSource();
    const segmenter = createManualSegmenter();
    const { c, seen } = fakeClassifier();
    const engine = createSignEngine({
      source,
      normaliser: createNormaliser(),
      recognition: { segmenter, features, classifier: c },
      maxSegmentFrames: 20,
    });
    const events: EngineEvent[] = [];
    engine.on((e) => events.push(e));
    await engine.start();
    segmenter.begin();
    for (let t = 0; t < 30; t++) source.push(t * 33);
    segmenter.end();
    source.push(30 * 33);
    await flush();

    const seg = events.filter((e) => e.type === "segment");
    expect(seg.map((e) => e.type === "segment" && e.signal.type)).toEqual(["start", "end"]);
    const preds = events.filter((e) => e.type === "prediction");
    expect(preds).toHaveLength(1);
    const p = preds[0]!;
    if (p.type !== "prediction") throw new Error("unreachable");
    expect(p.kind).toBe("final");
    expect(p.topK.map((x) => x.label)).toEqual(["HELLO", "THANK-YOU", "YES"]);
    expect(p).toMatchObject({ modelId: "fake-model", modelVersion: "0.0.1", latencyMs: 4 });
    // Ring capacity 20: only the newest 20 of the 31 frames are kept, then resampled to 8.
    expect(seen[0]).toMatchObject({ frames: 8, features: features.featureSize, startMs: 11 * 33, endMs: 30 * 33 });
    expect(seen[0]!.data).toHaveLength(8 * features.featureSize);
  });

  it("drops too-short segments and cancelled segments", async () => {
    const source = new FakeSource();
    const segmenter = createManualSegmenter();
    const { c, seen } = fakeClassifier();
    const engine = createSignEngine({ source, normaliser: createNormaliser(), recognition: { segmenter, features, classifier: c }, minSegmentFrames: 5 });
    await engine.start();
    segmenter.begin();
    source.push(0);
    source.push(33);
    segmenter.end();
    source.push(66);
    segmenter.begin();
    for (let t = 3; t < 20; t++) source.push(t * 33);
    segmenter.cancel();
    source.push(700);
    await flush();
    expect(seen).toHaveLength(0);
  });

  it("emits partial hypotheses while signing, skipping while one is in flight", async () => {
    const source = new FakeSource();
    const segmenter = createManualSegmenter();
    const { c, seen } = fakeClassifier({ delayMs: 5 });
    const engine = createSignEngine({
      source,
      normaliser: createNormaliser(),
      recognition: { segmenter, features, classifier: c },
      partialEveryMs: 100,
    });
    const events: EngineEvent[] = [];
    engine.on((e) => events.push(e));
    await engine.start();
    segmenter.begin();
    for (let t = 0; t <= 20; t++) source.push(t * 33); // ~660 ms, partials requested every 100 ms
    await new Promise((r) => setTimeout(r, 20));
    segmenter.end();
    source.push(21 * 33);
    await new Promise((r) => setTimeout(r, 20));
    const kinds = events.filter((e) => e.type === "prediction").map((e) => (e.type === "prediction" ? e.kind : ""));
    expect(kinds.filter((k) => k === "partial").length).toBeGreaterThanOrEqual(1);
    expect(kinds.filter((k) => k === "partial").length).toBeLessThan(6); // some were skipped while busy
    expect(kinds[kinds.length - 1]).toBe("final");
    expect(seen.length).toBe(kinds.length);
  });

  it("drops results that arrive after stop()", async () => {
    const source = new FakeSource();
    const segmenter = createManualSegmenter();
    const { c } = fakeClassifier({ delayMs: 10 });
    const engine = createSignEngine({ source, normaliser: createNormaliser(), recognition: { segmenter, features, classifier: c } });
    const events: EngineEvent[] = [];
    engine.on((e) => events.push(e));
    await engine.start();
    segmenter.begin();
    for (let t = 0; t < 10; t++) source.push(t * 33);
    segmenter.end();
    source.push(400);
    engine.stop();
    await new Promise((r) => setTimeout(r, 30));
    expect(events.some((e) => e.type === "prediction")).toBe(false);
  });

  it("reports classifier and source errors as events", async () => {
    const source = new FakeSource();
    const segmenter = createManualSegmenter();
    const { c } = fakeClassifier({ fail: true });
    const engine = createSignEngine({ source, normaliser: createNormaliser(), recognition: { segmenter, features, classifier: c } });
    const events: EngineEvent[] = [];
    engine.on((e) => events.push(e));
    await engine.start();
    segmenter.begin();
    for (let t = 0; t < 10; t++) source.push(t * 33);
    segmenter.end();
    source.push(400);
    await flush();
    await flush();
    expect(events.find((e) => e.type === "error")).toMatchObject({ error: { code: "classifier-failed" } });

    source.fail({ code: "camera-denied", message: "denied" });
    expect(engine.status).toBe("error");
    expect(events.filter((e) => e.type === "error").pop()).toMatchObject({ error: { code: "camera-denied" } });
  });

  it("turns a failing source.start() into an error event", async () => {
    const source = new FakeSource();
    source.failStart = Object.assign(new Error("no model"), { code: "model-missing" });
    const engine = createSignEngine({ source, normaliser: createNormaliser() });
    const events: EngineEvent[] = [];
    engine.on((e) => events.push(e));
    await engine.start();
    expect(engine.status).toBe("error");
    expect(events.find((e) => e.type === "error")).toMatchObject({ error: { code: "model-missing", message: "no model" } });
  });

  it("refuses a feature extractor that does not match the model input", () => {
    const { c } = fakeClassifier();
    const wrong = createPointSubsetFeatures({ id: "face@1", points: [["face", 0]] });
    expect(() =>
      createSignEngine({
        source: new FakeSource(),
        normaliser: createNormaliser(),
        recognition: { segmenter: createManualSegmenter(), features: wrong, classifier: c },
      }),
    ).toThrow(/expects/);
  });
});
