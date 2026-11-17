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

## Two modes (design/mockups)

| Address | Mode | Screens |
| --- | --- | --- |
| `/signer` | The signer's phone, standing on the counter | 1 Set up → 2 Signing (top half rotated for staff: sentence, quick replies, hold to speak) → 3 Reply (picture tiles + simple sentence, Bigger, Sign answer) |
| `/counter` | The business's tablet | 4 Staff view (stage, caption card, conversation, quick replies, hold to speak, Show to customer) → 5 Customer view (big tiles, Sign your answer) |
| `/` | Phones get `/signer`, bigger screens `/counter` | |

Three sources, chosen on both screens: **Live camera** (the default); **Weather**, the recorded weather forecast (the three
clips in `demo-clips.json`, back to back) read by the real model, each line turned into a sentence and spoken; and
**Pharmacy** (Mock mode), which plays a scripted pharmacy dialogue (HALLO MEDIKAMENT KOPF SCHMERZ → "Hello. I need medicine
for a headache.", then NEIN → "No.") with no camera, model or LLM, so the whole flow works on stage. Off, the camera
and the real model run (weather vocabulary).

**Voice:** Default (Ryan for English, Aiden for German) is the main voice and is selected on every load; a switch
offers two character voices, C-3PO and Snape, to show the speech is real. The page sends only the style name
(`"default" | "c3po" | "snape"`); the server maps it to a fixed voice id (`server/voices.mjs`), so no other voice can
be reached. The weather forecast **pauses after every clip** and goes on with **Next clip**.

**Home:** every screen has a Home button (and the logo on the counter view) back to the start of its mode.

**Latency** (debug): "Show latency" in the phone settings, "Latency" in the counter header, or `?debug` in the
address. It shows the last and average time of each step (sign model step, signs → sentence, sentence → voice, staff
speech → text, answer → pictures), measured in the browser and kept in memory only: no addresses, keys, model names or
voice ids are shown, and nothing is sent anywhere.

**Staff answer:** a quick reply (built-in picture reply), typed text, or **hold to speak**: the page records 16 kHz WAV
and `POST /api/transcribe` has Voice Control write it down (same one-at-a-time queue as speech). Free text goes to
`POST /api/simplify`, where the LLM returns very short sentences and up to 3 tiles as JSON (checked against a fixed icon
list); if that fails the answer is shown as big text.

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
| `server/simplify-prompt.mjs` | Prompt and answer checker for the picture reply (`parseSimplify`). |
| `src/lib/useSession.ts` | What both modes share: mock or real source, ordered rewrite → speech, conversation, staff reply. |
| `src/lib/mockSigner.ts`, `src/lib/replies.ts`, `src/lib/recordWav.ts`, `src/lib/route.ts` | Mock dialogue, built-in replies + `/api/simplify`, WAV recording, `/signer` `/counter` routing. |
| `src/components/signer/` | Phone screens 1–3 and the settings sheet. `src/components/CounterApp.tsx` and `CustomerView.tsx` are screens 4–5. |
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
