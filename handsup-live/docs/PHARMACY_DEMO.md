# Hands Up Apotheke: pharmacy two-way research demo (`/pharmacy/`)

Built 2026-11-17 for the hackathon pitch (D-019). German UI. Runs fully in the browser; no video leaves the device.

## What it does

| Side | How | Quality |
|---|---|---|
| **Antworten** (pharmacist → customer, the main feature) | German quick replies, typed text or voice (Web Speech API, only on a tap) are mapped to ASL signs (`src/pharmacy/words.ts`) and played as a signing figure from recorded PopSign skeletons (`src/pharmacy/avatar.ts`). Words without a sign stay as text. | About 22 signs: hello, sick, owie (pain), head, tooth, please, thankyou, yes, no, water, wait, where, drink, morning, night, later, sleep, time, finish, fine, haveto, hot. |
| **Kunde gebärdet** (customer → pharmacist), **experimentell** | Camera → MediaPipe Holistic → a sign is cut out when the hands go down → DTW template matching against PopSign examples of 12 signs → German word with confidence. | Leave-signer-out on 123 clips: **new signers 29 % top-1 (13/45), 42 % top-3**; same signers 87 %. The page states this; "Beispiel abspielen" shows the flow with a recorded skeleton. |

For continuous signing the page links to `/live/` (fc10, DGS weather).

## Data and licences

- **PopSign ASL v1.0** (Georgia Tech), **CC BY 4.0**, per-sign archives from `https://signdata.cc.gatech.edu/data/popsign_v1_0/<game|non-game>/<split>/<sign>.tar` (no login). SHA-256 of every archive: `HandsUp-models/popsign-raw/SHA256SUMS.txt`. The videos were deleted after landmark extraction (D-013); only pose and hand points are kept (no face mesh, no pixels).
- Not used: Kaggle "asl-signs" (D-013, Kaggle rule 7.B forbids redistribution).
- `apps/web/public/pharmacy/signs.json` (about 2.7 MB) is built by `node scripts/build-pharmacy-signs.mjs` and is **gitignored** in this repo (RF2). Publishing it on the demo site is redistribution under CC BY 4.0, credited in the page footer.
- Extraction tool (dev only, never built): `tools/extract.html` with `POPSIGN_DIR` set, using the pinned Holistic task for the pose and Google's `hand_landmarker.task` (Apache-2.0, SHA-256 `fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1`, kept in `HandsUp-models/mediapipe-extra/`) for the hands. Clips are first decoded to 25 FPS JPEGs by `ml/export/popsign_frames.py`, because a hidden browser tab does not decode `<video>`.

## Rebuild

```bash
node scripts/build-pharmacy-signs.mjs --eval
```

```bash
npm run build -w @handsup/web
```

## Known limits

- ASL, not DGS. Few signers per sign, so recognition of new people is weak; a real model needs far more data and training.
- Voice input: Chrome and Safari may send the audio to Google or Apple for recognition (stated on the page). Typing always works and stays on the device.
- The signing figure is a skeleton replay of one real signer per word, not a 3D avatar, and the word order is German, not ASL grammar.
