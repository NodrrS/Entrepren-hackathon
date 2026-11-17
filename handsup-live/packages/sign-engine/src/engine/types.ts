/**
 * The `sign-engine` interfaces (ARCHITECTURE.md §2, D-006). Apps depend on these only; every
 * concrete extractor, normaliser, segmenter and classifier sits behind them, so a model can be
 * swapped by changing a manifest and an adapter, never the app.
 *
 *   LandmarkSource ──LandmarkFrame──▶ Normaliser ──NormalisedFrame──▶ Segmenter (hook)
 *                                                      │                 │ start / end
 *                                                      ▼                 ▼
 *                                              FeatureExtractor ──▶ bounded window ──▶ Classifier
 *                                                                                    │ top-k
 *                                                                                    ▼
 *                                                                              EngineEvent
 */
import type { LandmarkFrame } from "../landmarks/schema";
import type { NormalisedFrame } from "../landmarks/normalise";

export type Unsubscribe = () => void;

// ---------------------------------------------------------------- landmark source

export type SourceState = "idle" | "starting" | "running" | "stopped" | "error";

export interface SourceInfo {
  /** e.g. "mediapipe-tasks-vision/holistic". */
  readonly extractor: string;
  /** Exact extractor version, e.g. "1.0.1" (D-014). */
  readonly extractorVersion: string;
  /** SHA-256 of each extractor asset (the `.task` files), by file name. */
  readonly assetSha256: Readonly<Record<string, string>>;
}

/**
 * Produces a stream of `hu-landmarks/v1` frames from a camera (or a test fixture). Push-based:
 * frames are delivered as they are produced; nothing is buffered or stored by the source.
 */
export interface LandmarkSource {
  readonly info: SourceInfo;
  readonly state: SourceState;
  start(): Promise<void>;
  /** Stops capture and releases the camera. Idempotent. */
  stop(): void;
  onFrame(listener: (frame: LandmarkFrame) => void): Unsubscribe;
  onState(listener: (state: SourceState, error?: EngineError) => void): Unsubscribe;
}

// ---------------------------------------------------------------- segmenter hook

export type SegmentSignal =
  | { readonly type: "start"; readonly atMs: number }
  | { readonly type: "end"; readonly startMs: number; readonly endMs: number }
  /** The current segment was abandoned (e.g. too short, or the signer left the frame). */
  | { readonly type: "cancel"; readonly atMs: number };

/**
 * Decides where one sign starts and ends. v1: a heuristic or press-to-sign (P3-01); v3: learned.
 * Called once per normalised frame; returns a signal or null.
 */
export interface Segmenter {
  readonly id: string;
  push(frame: NormalisedFrame): SegmentSignal | null;
  reset(): void;
}

// ---------------------------------------------------------------- classifier

export interface FeatureWindow {
  /** frames * features floats, frame-major. */
  readonly data: Float32Array;
  readonly frames: number;
  readonly features: number;
  readonly startMs: number;
  readonly endMs: number;
}

export interface Prediction {
  /** Vocabulary label (a gloss), e.g. "HELLO". */
  readonly label: string;
  /** Index into the manifest vocabulary. */
  readonly index: number;
  /** Probability in [0, 1]. */
  readonly confidence: number;
}

export interface Classification {
  /** Sorted by confidence, highest first; at most the requested k. */
  readonly topK: readonly Prediction[];
  readonly latencyMs: number;
}

export interface ClassifierInfo {
  readonly modelId: string;
  readonly modelVersion: string;
  /** Fixed input size the model expects. The engine resamples windows to `frames`. */
  readonly inputFrames: number;
  readonly inputFeatures: number;
  readonly labels: readonly string[];
}

export interface Classifier {
  readonly info: ClassifierInfo;
  classify(window: FeatureWindow, k: number): Promise<Classification>;
  dispose(): void;
}

// ---------------------------------------------------------------- result events

export interface EngineError {
  readonly code:
    | "camera-denied"
    | "camera-unavailable"
    | "model-missing"
    | "model-hash-mismatch"
    | "extractor-failed"
    | "classifier-failed"
    | "unknown";
  readonly message: string;
}

export type EngineStatus = "idle" | "running" | "stopped" | "error";

export type EngineEvent =
  | { readonly type: "status"; readonly status: EngineStatus }
  | { readonly type: "frame"; readonly frame: NormalisedFrame }
  | { readonly type: "segment"; readonly signal: SegmentSignal }
  | {
      readonly type: "prediction";
      /** "partial" = a hypothesis while signing; "final" = the segment has ended. */
      readonly kind: "partial" | "final";
      readonly startMs: number;
      readonly endMs: number;
      readonly topK: readonly Prediction[];
      readonly modelId: string;
      readonly modelVersion: string;
      readonly latencyMs: number;
    }
  | { readonly type: "error"; readonly error: EngineError };

export interface SignEngine {
  readonly status: EngineStatus;
  start(): Promise<void>;
  stop(): void;
  on(listener: (event: EngineEvent) => void): Unsubscribe;
}
