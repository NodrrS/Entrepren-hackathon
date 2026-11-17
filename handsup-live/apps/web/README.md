# @handsup/web: landmark harness (P1-01)

A minimal Vite + TypeScript page: camera → `@mediapipe/tasks-vision@1.0.1` HolisticLandmarker →
`hu-landmarks/v1` frames (through the `sign-engine` interfaces) → skeleton overlay + FPS meter.
The full React PWA is Phase 7; this is the measurement harness for P1-02 and P1-03.

## Run
```bash
npm install                 # repo root, once (heavy job: take the machine lock)
npm run dev -w @handsup/web # copies + verifies the WASM, then serves http://localhost:5173
```
Without the model file the page shows **"Model files missing"**. To enable it (the download needs approval):
1. Download `holistic_landmarker.task` from the `sourceUrl` in `mediapipe-assets.json` into `public/models/`.
2. `npm run models:pin -w @handsup/web`: checks the size and Google's MD5, records the SHA-256. Commit the JSON.

## Privacy
- **Self-hosted only:** the WASM (`public/mediapipe/wasm/`, copied from node_modules and SHA-256-checked) and the
  `.task` file (`public/models/`, SHA-256-checked before MediaPipe sees it). Both folders are gitignored.
- **No outbound requests:** a CSP (`connect-src 'self'`) plus a same-origin network guard. tasks-vision 1.0.1 contains a
  usage logger that POSTs to `https://odml.pa.googleapis.com/v1/log`; both layers block it, and the "Blocked requests"
  meter counts any attempt.
- **Nothing stored:** no storage APIs, no recording APIs; frames stay in memory.
- **Camera off** when the tab is hidden, on `pagehide` and on `beforeunload`. It never restarts by itself.
- The display is mirrored with CSS only; MediaPipe gets un-mirrored frames (`image.mirrored = false`).

## /live: live sign recognition research demo
`live/index.html` + `src/live/`: camera → MediaPipe Holistic → `@handsup/fc10-runtime` (thesis normalisation, 25 FPS
resampling, 8-frame chunks, fc10 ONNX step with KV cache in onnxruntime-web WASM, closure CTC decoding) → German
glosses with rough English words. A Demo button plays PHOENIX dev landmarks (no video) through the same pipeline.
Research only: fc10 is trained on PHOENIX-2014 (non-commercial), see D-018.

- `npm run live:sync` (runs before dev/build) copies the fc10 model, vocabulary and demo landmarks from `FC10_DIR`
  (default `../HandsUp-models/fc10` next to the repo) into `public/` and checks each SHA-256 in `live-assets.json`.
- Open http://localhost:5173/live/. Deploy: `docs/LIVE_DEMO_DEPLOY.md`. QR code: `scripts/make_live_qr.py`.
