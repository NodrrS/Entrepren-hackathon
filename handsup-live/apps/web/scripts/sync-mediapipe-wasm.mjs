#!/usr/bin/env node
// Copies the pinned @mediapipe/tasks-vision WASM files from node_modules into public/ (so they
// are self-hosted, never loaded from a CDN) and checks each file's SHA-256 against
// mediapipe-assets.json. `--record` writes the hashes the first time (review and commit them).
// Runs before `dev` and `build`.
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const assetsPath = join(appRoot, "mediapipe-assets.json");
const assets = JSON.parse(readFileSync(assetsPath, "utf8"));
const record = process.argv.includes("--record");
const require = createRequire(import.meta.url);

// The SIMD and no-SIMD builds; FilesetResolver picks one at runtime. The "module" variant is unused.
const FILES = [
  "vision_wasm_internal.js",
  "vision_wasm_internal.wasm",
  "vision_wasm_nosimd_internal.js",
  "vision_wasm_nosimd_internal.wasm",
];

const pkgVersion = JSON.parse(
  readFileSync(join(dirname(require.resolve("@mediapipe/tasks-vision/vision_wasm_internal.js")), "..", "package.json"), "utf8"),
).version;
if (pkgVersion !== assets.tasksVision) {
  console.error(`wasm:sync: installed @mediapipe/tasks-vision is ${pkgVersion}, pinned is ${assets.tasksVision} (D-014).`);
  process.exit(1);
}

const outDir = join(appRoot, "public", assets.wasmBasePath.replace(/^\//, ""));
mkdirSync(outDir, { recursive: true });
let changed = false;
for (const name of FILES) {
  const src = require.resolve(`@mediapipe/tasks-vision/${name}`);
  const bytes = readFileSync(src);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const expected = assets.wasm[name]?.sha256;
  if (!expected) {
    if (!record) {
      console.error(`wasm:sync: no pinned SHA-256 for ${name}. Run \`npm run wasm:sync -- --record\`, review, commit.`);
      process.exit(1);
    }
    assets.wasm[name] = { sha256, sizeBytes: bytes.length };
    changed = true;
  } else if (expected !== sha256) {
    console.error(`wasm:sync: SHA-256 mismatch for ${name}: expected ${expected}, got ${sha256}.`);
    process.exit(1);
  }
  copyFileSync(src, join(outDir, name));
}
if (changed) writeFileSync(assetsPath, JSON.stringify(assets, null, 2) + "\n");
console.log(`wasm:sync: ${FILES.length} files verified and copied to ${outDir}${changed ? " (hashes recorded)" : ""}.`);
