#!/usr/bin/env node
// Copies the model and runtime files the demo needs into public/ and checks every SHA-256 against the
// pins of the live app (../web/live-assets.json and ../web/mediapipe-assets.json), so there is one source
// of truth. Nothing here is committed (see .gitignore). A wrong hash fails; a missing file prints how to get it.
//
//   fc10_step.onnx, fc10_vocab.json, demo/demo-clips.json   from FC10_DIR (see handsup-live/README.md)
//   holistic_landmarker.task                                from HOLISTIC_TASK, or ../web/public/models/
//   MediaPipe WASM                                          from node_modules (@mediapipe/tasks-vision 1.0.1)
//   onnxruntime-web WASM                                    verified only (Vite emits it as a hashed asset)
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const webRoot = resolve(appRoot, "..", "web");
const live = JSON.parse(readFileSync(join(webRoot, "live-assets.json"), "utf8"));
const mp = JSON.parse(readFileSync(join(webRoot, "mediapipe-assets.json"), "utf8"));
const require = createRequire(import.meta.url);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
let failed = false;
let missing = 0;

function copyChecked(src, dest, expected, label) {
  const bytes = readFileSync(src);
  const actual = sha(bytes);
  if (actual !== expected) {
    console.error(`sync-assets: SHA-256 mismatch for ${label}: expected ${expected}, got ${actual}.`);
    failed = true;
    return;
  }
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
}

// onnxruntime-web (verified only)
for (const [name, { sha256 }] of Object.entries(live.ort.files)) {
  const actual = sha(readFileSync(require.resolve(`onnxruntime-web/${name}`)));
  if (actual !== sha256) {
    console.error(`sync-assets: SHA-256 mismatch for ${name}: expected ${sha256}, got ${actual}.`);
    failed = true;
  }
}

// fc10 model, vocabulary, demo landmarks
const candidates = [process.env.FC10_DIR, resolve(appRoot, "../../../HandsUp-models/fc10"), resolve(appRoot, "../../../../HandsUp-models/fc10")].filter(Boolean);
const fc10Dir = candidates.find((d) => existsSync(join(d, "fc10_step.onnx")));
for (const [name, { to, sha256 }] of Object.entries(live.fc10.files)) {
  const src = fc10Dir ? join(fc10Dir, name) : null;
  if (!src || !existsSync(src)) {
    missing++;
    console.warn(`sync-assets: MISSING ${name}. Download it as described in handsup-live/README.md and set FC10_DIR.`);
    continue;
  }
  copyChecked(src, join(appRoot, "public", to), sha256, name);
}

// MediaPipe holistic .task
const taskName = "holistic_landmarker.task";
const taskSrc = [process.env.HOLISTIC_TASK, join(webRoot, "public", "models", taskName)].filter(Boolean).find((p) => existsSync(p));
if (!taskSrc) {
  missing++;
  console.warn(`sync-assets: MISSING ${taskName}. Download it as described in handsup-live/README.md (or set HOLISTIC_TASK).`);
} else {
  copyChecked(taskSrc, join(appRoot, "public", mp.models[taskName].path.replace(/^\//, "")), mp.models[taskName].sha256, taskName);
}

// MediaPipe WASM
const pkgJson = JSON.parse(readFileSync(join(dirname(require.resolve("@mediapipe/tasks-vision/vision_wasm_internal.js")), "..", "package.json"), "utf8"));
if (pkgJson.version !== mp.tasksVision) {
  console.error(`sync-assets: installed @mediapipe/tasks-vision is ${pkgJson.version}, pinned is ${mp.tasksVision}.`);
  process.exit(1);
}
for (const [name, { sha256 }] of Object.entries(mp.wasm)) {
  copyChecked(require.resolve(`@mediapipe/tasks-vision/${name}`), join(appRoot, "public", mp.wasmBasePath.replace(/^\//, ""), name), sha256, name);
}

if (failed) process.exit(1);
if (missing) {
  console.error(`sync-assets: ${missing} file(s) missing, the page will not work without them.`);
  process.exit(2);
}
console.log(`sync-assets: all model and runtime files verified (fc10 files from ${fc10Dir}).`);
