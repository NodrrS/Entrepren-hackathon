/**
 * `hu-model-manifest/v1`: shipped as JSON next to every model (ARCHITECTURE.md §2, D-003, D-006,
 * D-007, D-014). A model is only loaded after its manifest validates and its files' SHA-256
 * hashes match.
 */
import { HU_NORM_V1, type NormalisationId } from "../landmarks/normalise";
import { HU_LANDMARKS_V1, type LandmarkSchemaId } from "../landmarks/schema";

export const HU_MODEL_MANIFEST_V1 = "hu-model-manifest/v1" as const;

/** The MediaPipe pin (D-014). Changing it means re-extracting, re-validating and bumping models. */
export const PINNED_MEDIAPIPE = {
  extractor: "mediapipe-tasks-vision",
  version: "1.0.1",
} as const;

export interface FileRef {
  /** What the file is for, e.g. "holistic_landmarker" or "classifier". */
  readonly role: string;
  /** Path relative to the manifest. */
  readonly path: string;
  /** Lower-case hex SHA-256 of the file's bytes. */
  readonly sha256: string;
  readonly sizeBytes: number;
}

export interface TrainingDataLicence {
  readonly dataset: string;
  /** SPDX id, or LicenseRef-HandsUp-Consented for our own consented recordings. */
  readonly licence: string;
  readonly url: string;
  readonly attribution: string;
}

export interface ModelManifest {
  readonly manifestSchema: typeof HU_MODEL_MANIFEST_V1;
  readonly model: {
    /** kebab-case, e.g. "asl-isolated-cnn-transformer". */
    readonly id: string;
    /** Semantic version, e.g. "0.1.0". */
    readonly version: string;
    readonly task: "isolated-sign-classification";
    /** ISO 639-3 sign language code, e.g. "ase" (ASL), "isr" (Israeli SL). */
    readonly signLanguage: string;
    /** BCP 47 tag of the output text, e.g. "en". */
    readonly outputLanguage: string;
  };
  readonly landmarks: {
    readonly schema: LandmarkSchemaId;
    readonly normalisation: NormalisationId;
    readonly extractor: {
      readonly name: typeof PINNED_MEDIAPIPE.extractor;
      readonly version: string;
      /** The `.task` files, matched by SHA-256 on every platform (D-014). */
      readonly assets: readonly FileRef[];
    };
  };
  readonly runtime: "onnx" | "litert" | "coreml" | "rules";
  readonly files: readonly FileRef[];
  readonly input: {
    readonly name: string;
    readonly dtype: "float32";
    /** e.g. [1, 64, 390] = batch, frames, features. The last two must equal frames/features. */
    readonly shape: readonly number[];
    readonly frames: number;
    readonly features: number;
    /** The FeatureExtractor id the model was trained with. */
    readonly featureSpec: string;
  };
  readonly output: {
    readonly name: string;
    readonly kind: "logits" | "probabilities";
  };
  readonly vocabulary: {
    readonly labels: readonly string[];
    /** SHA-256 of the labels joined with "\n" (UTF-8), see vocabularySha256(). */
    readonly sha256: string;
  };
  readonly licence: {
    /** SPDX id of the model weights. */
    readonly model: string;
    readonly trainingData: readonly TrainingDataLicence[];
  };
  /** Attribution lines to show in the app's credits (CC BY requires them). */
  readonly attribution: readonly string[];
}

/** Licences a shipped model and its training data may carry (D-003, D-007). */
export const MODEL_LICENCE_ALLOW = new Set(["Apache-2.0", "MIT", "BSD-2-Clause", "BSD-3-Clause", "ISC", "LicenseRef-HandsUp-Proprietary"]);
export const DATA_LICENCE_ALLOW = new Set(["CC-BY-4.0", "CC0-1.0", "LicenseRef-HandsUp-Consented"]);

const SHA256_RE = /^[0-9a-f]{64}$/;
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$/;
const KEBAB_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ISO639_3_RE = /^[a-z]{3}$/;
const NC_RE = /(^|-)NC(-|$)|NonCommercial|GPL/i;

export type ManifestResult = { ok: true; manifest: ModelManifest } | { ok: false; errors: string[] };

/**
 * Structural and policy validation (synchronous). It does not hash files; use verifySha256()
 * on the bytes and verifyVocabulary() for the label hash.
 */
export function validateManifest(input: unknown): ManifestResult {
  const errors: string[] = [];
  const err = (msg: string) => errors.push(msg);
  if (!isObj(input)) return { ok: false, errors: ["manifest must be an object"] };
  const m = input;

  if (m.manifestSchema !== HU_MODEL_MANIFEST_V1) err(`manifestSchema must be "${HU_MODEL_MANIFEST_V1}"`);

  const model = obj(m.model, "model", err);
  if (model) {
    if (!isStr(model.id) || !KEBAB_RE.test(model.id)) err("model.id must be kebab-case");
    if (!isStr(model.version) || !SEMVER_RE.test(model.version)) err("model.version must be a semantic version");
    if (model.task !== "isolated-sign-classification") err(`model.task must be "isolated-sign-classification"`);
    if (!isStr(model.signLanguage) || !ISO639_3_RE.test(model.signLanguage)) err("model.signLanguage must be an ISO 639-3 code");
    if (!isStr(model.outputLanguage) || model.outputLanguage.length < 2) err("model.outputLanguage must be a BCP 47 tag");
  }

  const lm = obj(m.landmarks, "landmarks", err);
  if (lm) {
    if (lm.schema !== HU_LANDMARKS_V1) err(`landmarks.schema must be "${HU_LANDMARKS_V1}"`);
    if (lm.normalisation !== HU_NORM_V1) err(`landmarks.normalisation must be "${HU_NORM_V1}"`);
    const ex = obj(lm.extractor, "landmarks.extractor", err);
    if (ex) {
      if (ex.name !== PINNED_MEDIAPIPE.extractor) err(`landmarks.extractor.name must be "${PINNED_MEDIAPIPE.extractor}"`);
      if (ex.version !== PINNED_MEDIAPIPE.version) {
        err(`landmarks.extractor.version must be the pinned "${PINNED_MEDIAPIPE.version}" (D-014)`);
      }
      fileRefs(ex.assets, "landmarks.extractor.assets", err);
    }
  }

  if (!["onnx", "litert", "coreml", "rules"].includes(m.runtime as string)) err("runtime must be onnx, litert, coreml or rules");
  fileRefs(m.files, "files", err);

  const input_ = obj(m.input, "input", err);
  if (input_) {
    if (!isStr(input_.name) || input_.name === "") err("input.name is required");
    if (input_.dtype !== "float32") err(`input.dtype must be "float32"`);
    if (!isPosInt(input_.frames)) err("input.frames must be a positive integer");
    if (!isPosInt(input_.features)) err("input.features must be a positive integer");
    if (!isStr(input_.featureSpec) || input_.featureSpec === "") err("input.featureSpec is required");
    if (!Array.isArray(input_.shape) || input_.shape.length < 2 || !input_.shape.every(isPosInt)) {
      err("input.shape must be an array of positive integers");
    } else {
      const shape = input_.shape as number[];
      if (shape[shape.length - 1] !== input_.features) err("input.shape last dimension must equal input.features");
      if (shape[shape.length - 2] !== input_.frames) err("input.shape second-to-last dimension must equal input.frames");
    }
  }

  const out = obj(m.output, "output", err);
  if (out) {
    if (!isStr(out.name) || out.name === "") err("output.name is required");
    if (out.kind !== "logits" && out.kind !== "probabilities") err(`output.kind must be "logits" or "probabilities"`);
  }

  const vocab = obj(m.vocabulary, "vocabulary", err);
  if (vocab) {
    const labels = vocab.labels;
    if (!Array.isArray(labels) || labels.length === 0 || !labels.every((l) => isStr(l) && l.trim() !== "" && !l.includes("\n"))) {
      err("vocabulary.labels must be a non-empty array of non-empty single-line strings");
    } else if (new Set(labels).size !== labels.length) {
      err("vocabulary.labels must be unique");
    }
    if (!isStr(vocab.sha256) || !SHA256_RE.test(vocab.sha256)) err("vocabulary.sha256 must be 64 lower-case hex characters");
  }

  const lic = obj(m.licence, "licence", err);
  if (lic) {
    if (!isStr(lic.model) || !MODEL_LICENCE_ALLOW.has(lic.model)) err(`licence.model "${String(lic.model)}" is not on the allow-list (D-007)`);
    if (!Array.isArray(lic.trainingData) || lic.trainingData.length === 0) {
      err("licence.trainingData must list every training dataset (D-003)");
    } else {
      lic.trainingData.forEach((d, i) => {
        if (!isObj(d)) return err(`licence.trainingData[${i}] must be an object`);
        if (!isStr(d.dataset) || d.dataset === "") err(`licence.trainingData[${i}].dataset is required`);
        if (!isStr(d.licence) || NC_RE.test(d.licence) || !DATA_LICENCE_ALLOW.has(d.licence)) {
          err(`licence.trainingData[${i}].licence "${String(d.licence)}" is not allowed for a shipped model (D-003)`);
        }
        if (!isStr(d.url) || !/^https:\/\//.test(d.url)) err(`licence.trainingData[${i}].url must be an https URL`);
        if (!isStr(d.attribution) || d.attribution === "") err(`licence.trainingData[${i}].attribution is required`);
      });
    }
  }

  if (!Array.isArray(m.attribution) || !m.attribution.every(isStr)) err("attribution must be an array of strings");
  else if (Array.isArray(lic?.trainingData) && lic.trainingData.length > 0 && m.attribution.length === 0) {
    err("attribution must not be empty when training data is listed (CC BY)");
  }

  return errors.length === 0 ? { ok: true, manifest: input as unknown as ModelManifest } : { ok: false, errors };
}

// ---------------------------------------------------------------- hashing (Web Crypto: browsers and Node >= 20)

export async function sha256Hex(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", view as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** True if `bytes` hash to `expected` (lower-case hex). */
export async function verifySha256(bytes: ArrayBuffer | Uint8Array, expected: string): Promise<boolean> {
  return (await sha256Hex(bytes)) === expected.toLowerCase();
}

/** The canonical vocabulary hash: SHA-256 of the labels joined with "\n", UTF-8. */
export async function vocabularySha256(labels: readonly string[]): Promise<string> {
  return sha256Hex(new TextEncoder().encode(labels.join("\n")));
}

export async function verifyVocabulary(manifest: ModelManifest): Promise<boolean> {
  return (await vocabularySha256(manifest.vocabulary.labels)) === manifest.vocabulary.sha256;
}

// ---------------------------------------------------------------- helpers

type Obj = Record<string, unknown>;
function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isStr(v: unknown): v is string {
  return typeof v === "string";
}
function isPosInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}
function obj(v: unknown, name: string, err: (m: string) => void): Obj | null {
  if (!isObj(v)) {
    err(`${name} must be an object`);
    return null;
  }
  return v;
}
function fileRefs(v: unknown, name: string, err: (m: string) => void): void {
  if (!Array.isArray(v) || v.length === 0) {
    err(`${name} must be a non-empty array`);
    return;
  }
  v.forEach((f, i) => {
    if (!isObj(f)) return err(`${name}[${i}] must be an object`);
    if (!isStr(f.role) || f.role === "") err(`${name}[${i}].role is required`);
    if (!isStr(f.path) || f.path === "" || f.path.includes("..") || /^[a-z]+:/i.test(f.path)) {
      err(`${name}[${i}].path must be a relative path inside the model folder`);
    }
    if (!isStr(f.sha256) || !SHA256_RE.test(f.sha256)) err(`${name}[${i}].sha256 must be 64 lower-case hex characters`);
    if (!isPosInt(f.sizeBytes)) err(`${name}[${i}].sizeBytes must be a positive integer`);
  });
}
