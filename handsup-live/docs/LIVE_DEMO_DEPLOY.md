# Hands Up Live: hosting and redeploy

**Live since 2026-11-17: https://live.handsupai.com** (the root redirects to `/live/`).
Deployed on the owner's instruction by the SuperManager session (D-018). Free plan only.

The `/live` page is a static site that runs fully in the visitor's browser: MediaPipe plus the thesis model fc10 in
onnxruntime-web. There is no server code, no database, no visitor account and no analytics. Phones only allow the
camera on HTTPS pages; Cloudflare provides the certificate.

## How it is hosted

| Item | Value |
|---|---|
| Cloudflare product | Worker with static assets only (no Worker code), free plan |
| Worker name | `hands-up-live` |
| Address | custom domain `live.handsupai.com` (DNS record created by Cloudflare when the domain was attached) |
| Config in the repo | `deploy/live/wrangler.jsonc` (assets = `apps/web/dist`) |
| Headers and redirects | `apps/web/public/_headers`, `apps/web/public/_redirects` (copied into `dist/`, honoured by Workers assets) |
| wrangler | the copy already logged in on this PC: `C:\Users\user\Desktop\Projects\hossts\web\node_modules\.bin\wrangler` |

Why not the bare `handsupai.com`: that name already has DNS records managed outside this Worker, and they were left
untouched. Moving the landing page plus `/live` to the bare domain is a separate owner decision; a prepared, not
deployed, setup is in `deploy/handsupai/` (`node scripts/build-handsupai.mjs`, then `wrangler deploy` there). It
needs the existing records checked first.

Why a Worker and not Pages: wrangler can attach a custom domain to a Worker from the command line, but not to a Pages
project.

## What is served

About 73 MB in 25 files, largest 23.6 MB (the limit is 25 MiB per file):

| Path | What | Licence | Cache |
|---|---|---|---|
| `/live/` | the page | ours | `no-cache` |
| `/app/*` | page code and the ONNX Runtime WASM (hashed names) | ours; ONNX Runtime Web MIT | 1 year, immutable |
| `/models/holistic_landmarker.task`, `/mediapipe/wasm/*` | MediaPipe body and hand tracking | Apache-2.0 | 30 days |
| `/models/fc10_step.onnx`, `/models/fc10_vocab.json` | thesis sign model and its 1,233 glosses | **PHOENIX-2014: non-commercial research only** | 30 days |
| `/demo/demo-clips.json` | skeleton points (no video) of 3 PHOENIX dev clips for the Demo button | **PHOENIX-2014: non-commercial research only** | 1 day |

The page checks the SHA-256 of every model file on each load, so a stale or altered file is refused.
`/` (the P1-01 harness) redirects to `/live/`.

## Redeploy

Only the owner or the SuperManager deploys. From the repo (with the models in `C:\Users\user\Desktop\Projects\HandsUp-models\`):

```bash
npm run build -w @handsup/web
```

```bash
cd deploy/live && C:/Users/user/Desktop/Projects/hossts/web/node_modules/.bin/wrangler deploy
```

The build copies and checks the model files: the MediaPipe `.task` from `apps/web/public/models/`, and fc10 from
`HandsUp-models\fc10`, made by `ml/export/fc10_onnx.py` and `ml/export/fc10_fixtures.py`. Set `FC10_DIR` if that folder
moves. Run `wrangler deploy --dry-run` first to see what would change. Undo: `wrangler rollback` in the same folder.

To leave the PHOENIX demo points out: delete `apps/web/dist/demo/` before `wrangler deploy`. The Demo button then
says the demo is not available; the live camera still works.

To take the site down: Cloudflare dashboard, **Workers & Pages → hands-up-live → Settings → Delete**.

## QR codes

- `docs/qr/hands-up-live-qr.svg` and `.png`: black on white, error correction H, "Scan to try Hands Up live" and the
  address under the code. Encodes `https://live.handsupai.com` (decode checked). Remake with
  `python scripts/make_qr_card.py https://live.handsupai.com --out docs/qr`.
- `marketing/live-demo-qr/hands-up-live-qr.html`: a printable A4 page with the code, three steps and the research and
  privacy note. Remake with `python scripts/make_live_qr.py https://live.handsupai.com --out marketing/live-demo-qr`.

## Phone checklist

1. Open https://live.handsupai.com. The status line says "Ready" after the models load (about 65 MB the first time,
   cached after that).
2. **Demo clip** shows a skeleton and glosses such as `MORGEN WETTER WIE-AUSSEHEN MITTWOCH ZEHNTE NOVEMBER`.
3. **Start**, allow the camera: you see yourself mirrored, the skeleton follows your hands, and the Camera meter shows
   about 15 to 30 fps. **Flip camera** switches to the back camera. Test on iPhone Safari and Android Chrome.
4. Leaving the tab turns the camera off.

## Slow venue Wi-Fi

Open the page once on each demo phone before the pitch, over mobile data or good Wi-Fi, and wait for "Ready": the
65 MB stay cached, so later loads are fast. If a visitor's phone loads too slowly, use the Demo clip on your own phone.

## Known limits

- Accuracy: about 47 % word error rate on PHOENIX weather forecasts, and much worse on other signing, signers,
  lighting and camera angles. It knows only German Sign Language weather vocabulary. Say this when you show it.
- Speed: each 0.32 s chunk takes a few ms in the model; MediaPipe is the slow part. Under 10 fps, the page suggests the
  Demo clip.
- No WebGPU: ONNX Runtime's WebGPU build needs a 29.5 MB file (over the per-file limit) and gives no gain for a model
  this small.
