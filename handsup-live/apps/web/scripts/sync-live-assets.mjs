#!/usr/bin/env node
// Copies the /live assets into public/ and checks each SHA-256 against live-assets.json:
// - the onnxruntime-web WASM file in node_modules (checked only; Vite bundles it, self-hosted, never a CDN);
// - the fc10 model, vocabulary and demo landmarks from FC10_DIR (gitignored, never committed).
// Runs before `dev` and `build`. A missing optional file only warns; a wrong hash fails.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const pins = JSON.parse(readFileSync(join(appRoot, "live-assets.json"), "utf8"));
const require = createRequire(import.meta.url);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
let failed = false;

function copyChecked(src, dest, expected, label) {
  const bytes = readFileSync(src);
  const actual = sha(bytes);
  if (actual !== expected) {
    console.error(`live:sync: SHA-256 mismatch for ${label}: expected ${expected}, got ${actual}.`);
    failed = true;
    return;
  }
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
}

// onnxruntime-web
const ortPkg = JSON.parse(readFileSync(join(dirname(require.resolve("onnxruntime-web/ort-wasm-simd-threaded.wasm")), "..", "package.json"), "utf8"));
if (ortPkg.version !== pins.ort.version) {
  console.error(`live:sync: installed onnxruntime-web is ${ortPkg.version}, pinned is ${pins.ort.version}.`);
  process.exit(1);
}
// Verified only: Vite emits the .wasm itself (main.ts imports it with ?url), so no copy in public/.
for (const [name, { sha256 }] of Object.entries(pins.ort.files)) {
  const actual = sha(readFileSync(require.resolve(`onnxruntime-web/${name}`)));
  if (actual !== sha256) {
    console.error(`live:sync: SHA-256 mismatch for ${name}: expected ${sha256}, got ${actual}.`);
    failed = true;
  }
}

// fc10
const candidates = [process.env.FC10_DIR, resolve(appRoot, "../../../HandsUp-models/fc10"), resolve(appRoot, "../../../../../../HandsUp-models/fc10")].filter(Boolean);
const fc10Dir = candidates.find((d) => existsSync(join(d, "fc10_step.onnx")));
let missing = 0;
for (const [name, { to, sha256, required }] of Object.entries(pins.fc10.files)) {
  const src = fc10Dir ? join(fc10Dir, name) : null;
  if (!src || !existsSync(src)) {
    missing++;
    console.warn(`live:sync: ${required ? "MISSING" : "optional, missing"}: ${name} (set FC10_DIR to the folder with the fc10 files).`);
    continue;
  }
  copyChecked(src, join(appRoot, "public", to), sha256, name);
}
if (failed) process.exit(1);
console.log(`live:sync: onnxruntime-web ${pins.ort.version} WASM verified; fc10 files from ${fc10Dir ?? "(not found)"}${missing ? `, ${missing} missing` : ", all verified"}.`);
