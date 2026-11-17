# Instructions for AI agents and teammates

Read this before you change or deploy anything in this repo.

## 1. What lives here

| Path | What it is |
|---|---|
| `handsup-live/` | **Hands Up Live**: sign language to text in the browser. The live demo code. |
| `handsup-live/README.md` | How to install, get the model files and run it locally. |
| `handsup-live/TEAM.md` | Short team guide: which site is which, and how to ship a change. |
| `.github/workflows/handsup-dev-deploy.yml` | The automatic deploy to dev.handsupai.com. |
| `README.md`, `CASES.md`, `Hackathon-Plan-17-Nov.docx` | The team's hackathon plan. Don't change them unless asked. |

## 2. The two websites

| Address | Purpose | How it gets updated |
|---|---|---|
| **https://dev.handsupai.com** | Team test site. Try new designs here. | **Automatic.** Every push to `main` that changes `handsup-live/**` deploys here within about 1 to 2 minutes. |
| **https://live.handsupai.com** | Stable demo: the pitch, the QR code, the public. | **Manual, Karmel only.** Never deploy here from this repo or from CI. |

Both run on Cloudflare (Workers with static assets, free plan) in Karmel's account, on the domain `handsupai.com`.

| Site | Cloudflare Worker name | Wrangler config |
|---|---|---|
| dev.handsupai.com | `hands-up-dev` | `handsup-live/deploy/dev/wrangler.jsonc` |
| live.handsupai.com | `hands-up-live` | `handsup-live/deploy/live/wrangler.jsonc` (reference only; deployed by Karmel) |

## 3. How a deploy to dev works (step by step)

The workflow `.github/workflows/handsup-dev-deploy.yml` runs on GitHub Actions:

1. **Trigger:** a push to `main` that touches `handsup-live/**`, or a manual run (GitHub → Actions → "Deploy Hands Up to dev.handsupai.com" → Run workflow).
2. Check out the code and set up Node 22.
3. `npm install` in `handsup-live/`.
4. Download the model files from the live site (they are not in git):
   - `https://live.handsupai.com/models/fc10_step.onnx`
   - `https://live.handsupai.com/models/fc10_vocab.json`
   - `https://live.handsupai.com/demo/demo-clips.json`
   - `https://live.handsupai.com/models/holistic_landmarker.task`
5. `npm run build -w @handsup/web` with `FC10_DIR` pointing at the downloaded models. The build checks every file's SHA-256 against `apps/web/live-assets.json` and `apps/web/mediapipe-assets.json`, and fails on any mismatch.
6. `wrangler deploy` in `handsup-live/deploy/dev/`, which publishes to dev.handsupai.com.

To check a deploy: GitHub → **Actions** tab → the latest "Deploy Hands Up to dev.handsupai.com" run. Then open https://dev.handsupai.com/live/ and tap **Demo clip**. It must show `MORGEN WETTER WIE-AUSSEHEN MITTWOCH ZEHNTE NOVEMBER`.

## 4. Secrets and variables: where they are

They are stored in GitHub, never in the code:

**GitHub → this repo → Settings → Secrets and variables → Actions → "Secrets" tab**

| Name | What it is | Who manages it |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token that lets the workflow deploy the Worker | Karmel only |
| `CLOUDFLARE_ACCOUNT_ID` | The Cloudflare account ID (an identifier, not a password) | Karmel only |
| `HANDSUP_DEPLOY_ENABLED` | Marker that deploys are switched on (not read by the workflow) | Karmel only |

The workflow reads them as `${{ secrets.CLOUDFLARE_API_TOKEN }}` and `${{ secrets.CLOUDFLARE_ACCOUNT_ID }}`. GitHub hides their values in logs.

Where the token comes from: Cloudflare dashboard → My Profile → **API Tokens**. Its permissions are Workers Scripts Edit (account), plus Workers Routes Edit and Zone Read on `handsupai.com`.

### Rules for secrets (strict)
- **Never** print, echo, log or copy a secret, and never paste one into chat, issues, pull requests or code.
- **Never** add a step that sends a secret anywhere, and never change the workflow to deploy to `live.handsupai.com` or any other Worker.
- The token can edit **every** Worker in Karmel's Cloudflare account, including other projects. Use it only through the existing workflow, for `hands-up-dev`.
- If a secret leaks, or you think it might have, tell Karmel right away so they can delete the token in Cloudflare.
- Only Karmel adds, changes or deletes secrets.

## 5. How to ship a change

1. Create a branch: `git checkout -b my-change`.
2. Edit in `handsup-live/`. The page is `apps/web/live/index.html` and `apps/web/src/live/`; the model runtime is `packages/fc10-runtime/`.
3. Run locally (see `handsup-live/README.md`) and test `/live/` and the Demo clip.
4. Run the tests: `npm test -w @handsup/web` and `npm test -w @handsup/fc10-runtime`.
5. Open a pull request into `main`. When it's merged, it goes to **dev.handsupai.com** automatically.
6. Ask Karmel to promote it to **live.handsupai.com** when it's ready.

## 6. Things you must not do
- Don't commit model files (`*.onnx`, `*.task`), PHOENIX data or demo landmarks. `.gitignore` covers them.
- Don't add analytics, tracking or any upload of camera video. The video must stay on the user's device.
- Don't add paid services or new third-party domains (the page's Content-Security-Policy allows only its own site).
- Don't remove the "research demo" note. The model was trained on PHOENIX-2014, which is for non-commercial research only.

## 7. Who to ask
Karmel Salah, the founder, decides on deploys to live, secrets and anything not covered here.
