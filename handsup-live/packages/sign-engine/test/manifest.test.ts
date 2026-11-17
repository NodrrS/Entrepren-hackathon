import { describe, expect, it } from "vitest";
import {
  PINNED_MEDIAPIPE,
  sha256Hex,
  validateManifest,
  verifySha256,
  verifyVocabulary,
  vocabularySha256,
  type ModelManifest,
} from "../src/index";

const HASH = "a".repeat(64);
const LABELS = ["HELLO", "THANK-YOU", "YES"];

async function example(): Promise<ModelManifest> {
  return {
    manifestSchema: "hu-model-manifest/v1",
    model: {
      id: "asl-isolated-test",
      version: "0.1.0",
      task: "isolated-sign-classification",
      signLanguage: "ase",
      outputLanguage: "en",
    },
    landmarks: {
      schema: "hu-landmarks/v1",
      normalisation: "hu-norm/v1",
      extractor: {
        name: "mediapipe-tasks-vision",
        version: "1.0.1",
        assets: [{ role: "holistic_landmarker", path: "holistic_landmarker.task", sha256: HASH, sizeBytes: 1000 }],
      },
    },
    runtime: "onnx",
    files: [{ role: "classifier", path: "model.onnx", sha256: HASH, sizeBytes: 2000 }],
    input: { name: "landmarks", dtype: "float32", shape: [1, 64, 390], frames: 64, features: 390, featureSpec: "hands+lips@1" },
    output: { name: "logits", kind: "logits" },
    vocabulary: { labels: LABELS, sha256: await vocabularySha256(LABELS) },
    licence: {
      model: "LicenseRef-HandsUp-Proprietary",
      trainingData: [
        {
          dataset: "PopSign ASL v1.0",
          licence: "CC-BY-4.0",
          url: "https://example.org/popsign-test-fixture",
          attribution: "test fixture attribution",
        },
      ],
    },
    attribution: ["PopSign ASL v1.0 (CC BY 4.0)"],
  };
}

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };
async function mutated(fn: (m: Mutable<ModelManifest>) => void): Promise<string[]> {
  const m = structuredClone(await example()) as Mutable<ModelManifest>;
  fn(m);
  const r = validateManifest(m);
  return r.ok ? [] : r.errors;
}

describe("hu-model-manifest/v1", () => {
  it("accepts a complete manifest and pins MediaPipe 1.0.1", async () => {
    const r = validateManifest(await example());
    expect(r).toMatchObject({ ok: true });
    expect(PINNED_MEDIAPIPE.version).toBe("1.0.1");
  });

  it("rejects non-objects", () => {
    expect(validateManifest(null)).toEqual({ ok: false, errors: ["manifest must be an object"] });
    expect(validateManifest([]).ok).toBe(false);
  });

  it("rejects a different MediaPipe version (D-014)", async () => {
    expect(await mutated((m) => (m.landmarks.extractor.version = "0.10.21"))).toContain(
      'landmarks.extractor.version must be the pinned "1.0.1" (D-014)',
    );
  });

  it("requires a SHA-256 and size for every .task and model file", async () => {
    const errs = await mutated((m) => {
      m.landmarks.extractor.assets[0]!.sha256 = "ABC";
      m.files[0]!.sizeBytes = 0;
    });
    expect(errs).toContain("landmarks.extractor.assets[0].sha256 must be 64 lower-case hex characters");
    expect(errs).toContain("files[0].sizeBytes must be a positive integer");
    expect(await mutated((m) => (m.files = []))).toContain("files must be a non-empty array");
  });

  it("rejects file paths that escape the model folder or are URLs", async () => {
    expect(await mutated((m) => (m.files[0]!.path = "../x.onnx"))).toContain("files[0].path must be a relative path inside the model folder");
    expect(await mutated((m) => (m.files[0]!.path = "https://cdn.example/x.onnx"))).toContain(
      "files[0].path must be a relative path inside the model folder",
    );
  });

  it("checks the input shape against frames and features", async () => {
    expect(await mutated((m) => (m.input.shape = [1, 32, 390]))).toContain("input.shape second-to-last dimension must equal input.frames");
    expect(await mutated((m) => (m.input.shape = [1, 64, 12]))).toContain("input.shape last dimension must equal input.features");
  });

  it("enforces the licence policy: NC and GPL data or weights fail (D-003, D-007)", async () => {
    expect(await mutated((m) => (m.licence.trainingData[0]!.licence = "CC-BY-NC-4.0"))).toContain(
      'licence.trainingData[0].licence "CC-BY-NC-4.0" is not allowed for a shipped model (D-003)',
    );
    expect(await mutated((m) => (m.licence.model = "GPL-3.0"))).toContain('licence.model "GPL-3.0" is not on the allow-list (D-007)');
    expect(await mutated((m) => (m.licence.trainingData = []))).toContain("licence.trainingData must list every training dataset (D-003)");
    expect(await mutated((m) => (m.attribution = []))).toContain("attribution must not be empty when training data is listed (CC BY)");
  });

  it("validates identity fields and vocabulary", async () => {
    const errs = await mutated((m) => {
      m.model.id = "Bad Id";
      m.model.version = "1.0";
      m.model.signLanguage = "asl-us";
      m.vocabulary.labels = ["A", "A"];
    });
    expect(errs).toEqual(
      expect.arrayContaining([
        "model.id must be kebab-case",
        "model.version must be a semantic version",
        "model.signLanguage must be an ISO 639-3 code",
        "vocabulary.labels must be unique",
      ]),
    );
  });

  it("vocabulary hash is SHA-256 of the labels joined by newline", async () => {
    const m = await example();
    expect(await verifyVocabulary(m)).toBe(true);
    expect(await verifyVocabulary({ ...m, vocabulary: { ...m.vocabulary, labels: ["HELLO", "YES", "THANK-YOU"] } })).toBe(false);
  });
});

describe("sha256", () => {
  it("matches the known test vector for 'abc'", async () => {
    const abc = new TextEncoder().encode("abc");
    const expected = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    expect(await sha256Hex(abc)).toBe(expected);
    expect(await verifySha256(abc.buffer, expected.toUpperCase())).toBe(true);
    expect(await verifySha256(abc, HASH)).toBe(false);
  });
});
