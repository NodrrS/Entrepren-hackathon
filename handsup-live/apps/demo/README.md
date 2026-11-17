# Hands Up demo (sign video → text → speech)

A festival demo page: sign to the camera, upload a clip, or play the built-in demo clip; the signing is turned into
text **on the device** (the same MediaPipe + fc10 pipeline as live.handsupai.com), and each finished caption line is
**spoken aloud** by the Voice Control service. A second box turns typed text into speech.

```
Browser ── MediaPipe + fc10 (on device, video never leaves it)
   │  caption text only
   └── POST /api/tts ──► server/index.mjs (this Mac) ──► Voice Control (Tailscale, key stays server-side)
```

## Run it locally

Model files are not in git (see `../../README.md` for the four downloads and `FC10_DIR`).

```bash
cd handsup-live
npm install
export FC10_DIR="$(pwd)/../HandsUp-models/fc10"
export VOICE_CONTROL_URL=...        # the Voice Control address (Tailscale)
export VOICE_CONTROL_API_KEY=...    # never commit or print it
npm run build -w @handsup/demo      # syncs + SHA-checks the model files, then builds dist/
npm start -w @handsup/demo          # http://127.0.0.1:8810 (PORT / HOST override)
```

`npm run dev -w @handsup/demo` runs Vite only (no speech route).

## Pieces

| Path | What |
|---|---|
| `src/lib/recognizer/engine.ts` | Camera, uploaded clip and demo clip → MediaPipe → fc10 → caption lines. **The seam for the future recognition API:** replace this class (same `Snapshot` / actions) with one that calls the API. |
| `src/lib/recognizer.ts` | `useRecognizer()` React hook over the engine. |
| `src/lib/speech.ts` | `speak(text, lang)` and `checkVoice()` → `/api/tts`, `/api/health`. |
| `src/lib/shared/` | Small helpers copied from `apps/web` (skeleton overlay, network guard, demo-clip parser, camera help). |
| `server/index.mjs` | Static files + the two API routes; 400-character cap, one speech job at a time, per-client rate limit, fixed voices (`server/voices.mjs`). |
| `scripts/sync-assets.mjs` | Copies the model and runtime files into `public/` (git-ignored) and checks every SHA-256 against `apps/web/*-assets.json`. |

## Notes

- Uploaded clips play at normal speed and are read through `captureStream()` (Chrome, Edge, Firefox, Android). Safari
  and iOS can use the camera and the demo clip.
- The model knows ~1,200 German Sign Language weather-forecast signs (PHOENIX-2014, non-commercial research use).
  Everyday signing gives wrong or no words.
- Publishing from the Mac: `~/Projects/alpharelay-mac-deploy/bin/relay deploy hands-up-demo 8810` (public, no login).
  The server must be running; it is not restarted after a reboot.
