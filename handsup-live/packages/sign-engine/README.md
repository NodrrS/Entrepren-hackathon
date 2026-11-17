# @handsup/sign-engine

The model-replaceable core (ARCHITECTURE.md §2, D-006). Apps import **only** from this package's
public API, never a concrete model. Task P1-04.

## What is here
| Module | Contents |
|---|---|
| `src/landmarks/schema.ts` | **`hu-landmarks/v1`**: 543 points (face 468 · pose 33 · left hand 21 · right hand 21), x/y/z, NaN = absent, presence flags, pose visibility, timestamps, handedness contract, `validateFrame()` |
| `src/landmarks/normalise.ts` | **`hu-norm/v1`** normalisation contract + `createNormaliser()` (the `Normaliser` stage) |
| `src/landmarks/features.ts` | `FeatureExtractor` interface + a point-subset extractor |
| `src/adapters/mediapipeHolistic.ts` | Pure mapping from a MediaPipe Tasks `HolisticLandmarkerResult` (1.0.1, D-014) to `hu-landmarks/v1` (478 → 468 face points). Does not import MediaPipe. |
| `src/engine/types.ts` | The interfaces: `LandmarkSource`, `Segmenter` (hook), `Classifier` (top-k + confidence), `EngineEvent`, `SignEngine` |
| `src/engine/engine.ts` | `createSignEngine()`: the default pipeline, with a bounded ring buffer and at most one classification in flight |
| `src/engine/segmenters.ts` | Press-to-sign `ManualSegmenter` (the heuristic segmenter is P3-01) |
| `src/manifest/manifest.ts` | **`hu-model-manifest/v1`** type, `validateManifest()`, SHA-256 and vocabulary-hash helpers |

## The contracts on one page

**`hu-landmarks/v1` frame** (`LandmarkFrame`, space `"image"`)
- `points`: `Float32Array(1629)` = 543 × (x, y, z), in the order face → pose → leftHand → rightHand.
  Kaggle ISLR uses face → left_hand → pose → right_hand, so importing Kaggle data would need a remap (we don't import it, D-013).
- x and y are normalised to [0, 1] by the image width and height; z is as MediaPipe defines it. An absent part is all NaN with `presence[part] = false`. A part is all-or-nothing.
- `leftHand` is the signer's **anatomical** left hand (`handedness.convention = "subject"`). Whether Holistic's labels already mean that is UNVERIFIED, so adapters set `handedness.verified = false` until P1-11 or a live check confirms it.
- `timestampMs` is monotonic and strictly increasing; `frameIndex` counts from 0; `image` carries the width, height and `mirrored`.

**`hu-norm/v1`** (`NormalisedFrame`), in order:
1. to pixels: x·W, y·H, z·W; pose z is discarded (0)
2. un-mirror if the image was mirrored
3. centre = the shoulder midpoint (pose 11/12), scale = the shoulder distance. This needs visibility ≥ 0.5 and ≥ 8 px; otherwise the last reference is held for ≤ 500 ms; otherwise the whole frame is NaN (`reference.valid = false`)
4. (p − centre) / scale
5. for a left-dominant signer: negate x, and swap the hand blocks and the pose left/right pairs (face: x only). The output is always right-dominant.

The Python training pipeline must port exactly this (the P1-11 parity test).

**`hu-model-manifest/v1`**: model id + semver, the ISO 639-3 sign language, the landmark schema and normalisation ids,
the extractor `mediapipe-tasks-vision` **1.0.1** with the SHA-256 and size of every `.task` file, the model files with
SHA-256 and size, the runtime, the input name/dtype/shape (frames × features) + feature-spec id, the output kind, the vocabulary +
its SHA-256, the model licence + every training dataset's licence (only CC-BY-4.0, CC0-1.0 or our own consented data;
NC and GPL fail), and the attribution lines.

## Commands
```bash
npm test                                # from the repo root: licence check + script tests + typecheck + vitest
npm run test -w @handsup/sign-engine    # this package's unit tests only
```
