# Team guide: where things run

| Address | What | Who changes it |
|---|---|---|
| https://live.handsupai.com | The stable demo (QR code, pitch) | Karmel only |
| https://dev.handsupai.com | The team test site: try new designs here | Deployed from `main` |

## How to ship a change
1. Make a branch, change the code in `handsup-live/` (the page is `apps/web/live/index.html` and `apps/web/src/live/`).
2. Run it locally (see README.md) and check /live/ and the Demo clip.
3. Open a pull request into `main`. When it is merged, the change goes to **dev.handsupai.com**.
4. When Karmel is happy with dev, it is promoted to live.handsupai.com.

Automatic deploys to dev turn on once Karmel adds the Cloudflare secrets to this repo (Settings, Secrets and variables, Actions: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and the variable `HANDSUP_DEPLOY_ENABLED` = `true`). Until then, ask Karmel to deploy.

Never commit tokens, model files or PHOENIX data.
