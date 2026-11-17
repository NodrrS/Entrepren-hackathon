/**
 * The default `SignEngine`: wires a LandmarkSource → Normaliser → Segmenter → FeatureExtractor →
 * bounded window → Classifier, and emits `EngineEvent`s. Every stage is injected, so the app
 * never knows which model is behind it.
 *
 * Real-time rules: frames are processed as they arrive; the only buffer is a fixed-size ring of
 * feature vectors for the current segment; at most one classification is in flight (a partial
 * hypothesis is skipped while one runs; a final one waits for it).
 */
import type { FeatureExtractor } from "../landmarks/features";
import { isUsable, type Normaliser } from "../landmarks/normalise";
import type { LandmarkFrame } from "../landmarks/schema";
import type {
  Classifier,
  EngineError,
  EngineEvent,
  EngineStatus,
  LandmarkSource,
  SignEngine,
  Segmenter,
  Unsubscribe,
} from "./types";
import { Emitter, FeatureRing, makeWindow, resampleWindow } from "./util";

export interface RecognitionStages {
  readonly segmenter: Segmenter;
  readonly features: FeatureExtractor;
  readonly classifier: Classifier;
}

export interface SignEngineOptions {
  readonly source: LandmarkSource;
  readonly normaliser: Normaliser;
  /** Omit to run landmarks-only (the P1-01 harness): only "frame"/"status"/"error" events. */
  readonly recognition?: RecognitionStages;
  /** Predictions per event. Default 3 (the top-3 correction UI). */
  readonly topK?: number;
  /** Max frames kept per segment (ring capacity). Default 150 (~5 s at 30 FPS). */
  readonly maxSegmentFrames?: number;
  /** Segments with fewer usable frames are dropped. Default 5. */
  readonly minSegmentFrames?: number;
  /** Emit a partial hypothesis at most this often while signing. Default: no partials. */
  readonly partialEveryMs?: number;
  /** Clock for latency measurements. Default performance.now. */
  readonly now?: () => number;
}

export function createSignEngine(options: SignEngineOptions): SignEngine {
  const { source, normaliser, recognition } = options;
  const k = options.topK ?? 3;
  const minFrames = options.minSegmentFrames ?? 5;
  const now = options.now ?? (() => performance.now());
  if (recognition && recognition.features.featureSize !== recognition.classifier.info.inputFeatures) {
    throw new RangeError(
      `feature extractor "${recognition.features.id}" gives ${recognition.features.featureSize} features but ` +
        `model ${recognition.classifier.info.modelId} expects ${recognition.classifier.info.inputFeatures}`,
    );
  }
  const ring = recognition ? new FeatureRing(options.maxSegmentFrames ?? 150, recognition.features.featureSize) : null;
  const scratch = recognition ? new Float32Array(recognition.features.featureSize) : null;

  const events = new Emitter<[EngineEvent]>();
  let status: EngineStatus = "idle";
  let subscriptions: Unsubscribe[] = [];
  let collecting = false;
  let lastPartialMs = -Infinity;
  let inFlight: Promise<void> = Promise.resolve();
  let busy = false;
  let generation = 0;

  const currentStatus = (): EngineStatus => status;
  const setStatus = (s: EngineStatus) => {
    if (s === status) return;
    status = s;
    events.emit({ type: "status", status: s });
  };
  const emitError = (error: EngineError) => events.emit({ type: "error", error });

  function classify(kind: "partial" | "final"): void {
    if (!recognition || !ring || ring.length < minFrames) return;
    if (kind === "partial" && busy) return;
    const snap = ring.snapshot();
    const { classifier } = recognition;
    const info = classifier.info;
    const data = resampleWindow(snap.data, snap.frames, ring.featureSize, info.inputFrames);
    const window = makeWindow(data, info.inputFrames, ring.featureSize, snap.startMs, snap.endMs);
    const gen = generation;
    busy = true;
    inFlight = inFlight
      .then(async () => {
        const t0 = now();
        const result = await classifier.classify(window, k);
        if (gen !== generation) return; // stopped meanwhile: drop the stale result
        events.emit({
          type: "prediction",
          kind,
          startMs: window.startMs,
          endMs: window.endMs,
          topK: result.topK.slice(0, k),
          modelId: info.modelId,
          modelVersion: info.modelVersion,
          latencyMs: Number.isFinite(result.latencyMs) ? result.latencyMs : now() - t0,
        });
      })
      .catch((err: unknown) => {
        if (gen === generation) emitError({ code: "classifier-failed", message: String(err) });
      })
      .finally(() => {
        busy = false;
      });
  }

  function onFrame(frame: LandmarkFrame): void {
    if (status !== "running") return;
    const norm = normaliser.normalise(frame);
    events.emit({ type: "frame", frame: norm });
    if (!recognition || !ring || !scratch) return;

    const signal = recognition.segmenter.push(norm);
    if (signal) events.emit({ type: "segment", signal });
    if (signal?.type === "start") {
      ring.clear();
      collecting = true;
      lastPartialMs = norm.timestampMs;
    }
    if (collecting && isUsable(norm)) {
      ring.push(recognition.features.extract(norm, scratch), norm.timestampMs);
    }
    if (signal?.type === "end") {
      collecting = false;
      classify("final");
      ring.clear();
    } else if (signal?.type === "cancel") {
      collecting = false;
      ring.clear();
    } else if (collecting && options.partialEveryMs !== undefined && norm.timestampMs - lastPartialMs >= options.partialEveryMs) {
      lastPartialMs = norm.timestampMs;
      classify("partial");
    }
  }

  return {
    get status() {
      return status;
    },
    on(listener) {
      return events.on(listener);
    },
    async start() {
      if (status === "running") return;
      normaliser.reset();
      recognition?.segmenter.reset();
      ring?.clear();
      collecting = false;
      subscriptions = [
        source.onFrame(onFrame),
        source.onState((s, error) => {
          if (s === "error") {
            emitError(error ?? { code: "unknown", message: "landmark source failed" });
            setStatus("error");
          } else if (s === "stopped" && status === "running") {
            setStatus("stopped");
          }
        }),
      ];
      setStatus("running");
      try {
        await source.start();
      } catch (err) {
        // The source may already have reported this failure through onState("error").
        if (currentStatus() !== "error") {
          emitError(asEngineError(err));
          setStatus("error");
        }
      }
    },
    stop() {
      generation++;
      for (const u of subscriptions) u();
      subscriptions = [];
      source.stop();
      collecting = false;
      ring?.clear();
      if (status !== "idle") setStatus("stopped");
    },
  };
}

function asEngineError(err: unknown): EngineError {
  if (err && typeof err === "object" && "code" in err && "message" in err) {
    const e = err as { code: unknown; message: unknown };
    if (typeof e.code === "string" && typeof e.message === "string") return e as EngineError;
  }
  return { code: "unknown", message: err instanceof Error ? err.message : String(err) };
}
