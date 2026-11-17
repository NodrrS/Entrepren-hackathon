# Hands Up demo (sign video → text → speech)

A festival demo page: sign to the camera, upload a clip, or play the built-in demo clip; the signing is turned into
text **on the device** (the same MediaPipe + fc10 pipeline as live.handsupai.com). The sign model outputs raw
German Sign Language glosses (`MORGEN WETTER WIE-AUSSEHEN ...`), so each finished caption line is first rewritten
by an **LLM into one natural sentence** (English or German), shown large under the gloss chips with a latency badge,
and then **spoken aloud** by the Voice Control service. A second box turns typed text into speech.

```
Browser ── MediaPipe + fc10 (on device, video never leaves it)
   │  recognised words only
   ├── POST /api/rewrite ─► server/index.mjs (this Mac) ─► LiteLLM gateway on metacon (Tailscale, key stays server-side)
   └── POST /api/tts ─────►                              ─► Voice Control (Tailscale, key stays server-side)
```

If the LLM is unreachable or `LLM_API_KEY` is not set, the page falls back to the raw words (as before) and still speaks.

## Run it locally

Model files are not in git (see `../../README.md` for the four downloads and `FC10_DIR`).

```bash
cd handsup-live
npm install
export FC10_DIR="$(pwd)/../HandsUp-models/fc10"
export VOICE_CONTROL_URL=...        # the Voice Control address (Tailscale)
export VOICE_CONTROL_API_KEY=...    # never commit or print it
# Sentences (optional): the metacon LiteLLM gateway. Needs Tailscale and a per-person key.
export LLM_BASE_URL=http://metacon:4000/v1   # default
export LLM_MODEL=qwen3:8b                     # default
export LLM_API_KEY="$(security find-generic-password -s metacon-llm -a "$USER" -w)"   # macOS Keychain; never commit or print it
# YouTube links (optional): needs `brew install yt-dlp`. Off unless this is set.
export VIDEO_LINKS=on
npm run build -w @handsup/demo      # syncs + SHA-checks the model files, then builds dist/
npm start -w @handsup/demo          # http://127.0.0.1:8810 (PORT / HOST override)
```

`npm run dev -w @handsup/demo` runs Vite only (no speech route).

## Pieces

| Path | What |
|---|---|
| `src/lib/recognizer/engine.ts` | Camera, uploaded clip and demo clip → MediaPipe → fc10 → caption lines. **The seam for the future recognition API:** replace this class (same `Snapshot` / actions) with one that calls the API. |
| `src/lib/recognizer.ts` | `useRecognizer()` React hook over the engine. |
| `src/lib/speech.ts` | `speak(text, lang)` and `checkHealth()` → `/api/tts`, `/api/health` (voice and LLM status). |
| `src/lib/rewrite.ts` | `rewrite(glosses, hints, lang)` → `/api/rewrite`, one natural sentence for a caption line. |
| `src/lib/shared/` | Small helpers copied from `apps/web` (skeleton overlay, network guard, demo-clip parser, camera help). |
| `server/index.mjs` | Static files + the API routes (`/api/tts`, `/api/rewrite`, `/api/health`); 400-character cap, one speech job at a time, per-client rate limits, fixed voices (`server/voices.mjs`). |
| `server/video-link.mjs` | YouTube link check (`parseVideoId`), the `yt-dlp` download, the per-visitor hourly limiter. |
| `src/lib/videoLink.ts` | `fetchVideo(url)` → `/api/video`, returns the clip as a `File` for `startUpload`. |
| `server/rewrite-prompt.mjs` | The gloss → sentence prompt (system message + few-shot examples per language) and the answer cleaner. |
| `scripts/sync-assets.mjs` | Copies the model and runtime files into `public/` (git-ignored) and checks every SHA-256 against `apps/web/*-assets.json`. |

## Notes

- The rewrite needs the LLM gateway, which is only reachable over Tailscale. It works where this server runs on
  the Mac (local and the alpharelay tunnel); dev.handsupai.com serves `apps/web` and is not affected. The gateway
  logs each request (the glosses and the answer) under the key's name. Only the recognised words are sent.
- **YouTube links** (`POST /api/video`, only with `VIDEO_LINKS=on` and `yt-dlp` installed): the server fetches the
  clip and the page reads it like an uploaded one (same on-device recognition, then sentence and speech). Only
  `https` links on youtube.com, m.youtube.com and youtu.be with a valid video id are accepted (the server rebuilds the
  watch URL itself); up to 3 minutes, 40 MB, 480p without audio, one download at a time, 3 per visitor per hour,
  90 s timeout, temp files deleted. The link is never logged. Downloading from YouTube is against YouTube's terms of
  service: switch `VIDEO_LINKS` off to disable it. The **Signer** choice crops an interpreter inset (half or corner of
  the frame) before the tracker, for links and uploads alike. The model only knows German weather-forecast signs.
- The three **Examples** buttons play the three clips in `demo-clips.json`, in file order.
- Lines are rewritten and spoken strictly in order. Switching the language re-writes the newest caption only.

- Uploaded clips play at normal speed and are read through `captureStream()` (Chrome, Edge, Firefox, Android). Safari
  and iOS can use the camera and the demo clip.
- The model knows ~1,200 German Sign Language weather-forecast signs (PHOENIX-2014, non-commercial research use).
  Everyday signing gives wrong or no words.
- Publishing from the Mac: `~/Projects/alpharelay-mac-deploy/bin/relay deploy hands-up-demo 8810` (public, no login).
  The server must be running; it is not restarted after a reboot.
