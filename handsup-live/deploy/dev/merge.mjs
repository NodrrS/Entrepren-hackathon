#!/usr/bin/env node
// dev.handsupai.com = the team app (apps/demo) at "/" (/signer, /counter) plus the web app's /live/ and
// /pharmacy/ (apps/web). Merges both builds into deploy/dev/dist for the Worker (wrangler.jsonc).
// Run after `npm run build -w @handsup/web` and `npm run build -w @handsup/demo`.
import { cpSync, existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const web = join(root, "apps", "web", "dist");
const demo = join(root, "apps", "demo", "dist");
const out = join(root, "deploy", "dev", "dist");
for (const d of [web, demo]) if (!existsSync(join(d, "index.html"))) throw new Error(`missing build: ${d}`);
rmSync(out, { recursive: true, force: true });
// 1. the web app without its root page (the P1-01 harness) and without its "/" -> /live/ redirect
cpSync(web, out, { recursive: true, filter: (src) => !["index.html", "_redirects"].includes(src.slice(web.length + 1).split("\\").join("/")) });
// 2. the team app on top (same /app/ asset folder, hashed names; shared model files are identical)
for (const n of readdirSync(demo)) cpSync(join(demo, n), join(out, n), { recursive: true });
// 3. the team app is a single-page app: /signer and /counter serve its index.html
writeFileSync(join(out, "_redirects"), "/signer  /index.html  200\n/counter  /index.html  200\n");
console.log(`dev site: ${out}`);
