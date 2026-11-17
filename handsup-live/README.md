# Hands Up Live: sign language to text in the browser

Live at **https://live.handsupai.com**. Open it on a phone, press Start and sign. Everything runs on the device: MediaPipe tracks the hands and body, and our streaming model (fc10) turns the movements into words every 0.32 seconds. The video is never uploaded.

**Research demo.** The model was trained on PHOENIX-2014 (German Sign Language, TV weather forecasts, 1,233 signs). The data and the model are for non-commercial research only.

## What's in here

| Path | What it is |
|---|---|
| `apps/web` | The web app. `/live/` is the demo page (`src/live/`). `/pharmacy/` is the two-way pharmacy demo (`src/pharmacy/`, see `docs/PHARMACY_DEMO.md`). `/` is a landmark test harness. |
| `packages/fc10-runtime` | The sign model in the browser: normalisation, 25 fps resampling, streaming with the KV cache, CTC decoding, and the gloss to English mapping. |
| `packages/sign-engine` | Landmark schema and the MediaPipe Holistic adapter. |
| `ml/export` | Python scripts that exported fc10 to ONNX and made the test fixtures (they need the thesis code; you won't need them to run the app). |
| `deploy/live` | Cloudflare Worker config for live.handsupai.com. |
| `docs/LIVE_DEMO_DEPLOY.md` | Deploy, rollback and the phone test checklist. |
| `docs/qr` | QR code for https://live.handsupai.com. |

## Run it locally

You need Node 22.12 or newer.

```bash
cd handsup-live
npm install
```

The model files are not in git (they are large and research only). Download them from the live site into a folder, then point `FC10_DIR` at it:

```bash
mkdir -p ../HandsUp-models/fc10/demo
curl -o ../HandsUp-models/fc10/fc10_step.onnx https://live.handsupai.com/models/fc10_step.onnx
curl -o ../HandsUp-models/fc10/fc10_vocab.json https://live.handsupai.com/models/fc10_vocab.json
curl -o ../HandsUp-models/fc10/demo/demo-clips.json https://live.handsupai.com/demo/demo-clips.json
curl -o apps/web/public/models/holistic_landmarker.task https://live.handsupai.com/models/holistic_landmarker.task
export FC10_DIR="$(pwd)/../HandsUp-models/fc10"
```

Every file is checked against the SHA-256 values in `apps/web/live-assets.json` and `apps/web/mediapipe-assets.json`, so a wrong file fails the build.

```bash
npm run dev -w @handsup/web     # opens the app; go to /live/
npm test -w @handsup/web        # web tests
npm test -w @handsup/fc10-runtime
```

The camera needs HTTPS or localhost. To test on a phone, use the deployed site, or run `npx vite --host` with an HTTPS tunnel.

## How the live page works

1. The camera gives frames, which are resampled to 25 fps.
2. MediaPipe Holistic gives 51 points per frame (body plus 21 per hand), each with x, y, z and presence.
3. The points are normalised exactly like in training (checked against Python within 1e-5).
4. Every 8 frames (0.32 s), one model step runs with the cache of earlier steps, at about 2 to 10 ms on a laptop.
5. CTC decoding adds the new glosses to the captions, with a rough English line under them.

## Rules for the team

- Don't commit model files, PHOENIX data or demo landmarks (`.gitignore` covers them). The pharmacy data `apps/web/public/pharmacy/signs.json` (PopSign ASL v1.0, CC BY 4.0) is built by `node scripts/build-pharmacy-signs.mjs`.
- Don't put API keys or tokens in the code.
- Before changing the live site, ask Karmel. Deploys go through `deploy/live`.
