#!/usr/bin/env node
// After an APPROVED manual download of holistic_landmarker.task into public/models/, this checks
// its size and Google's published MD5 (from the storage object's metadata, recorded in
// mediapipe-assets.json) and then records its SHA-256. Review and commit the JSON change.
// This script never downloads anything.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assetsPath = join(appRoot, "mediapipe-assets.json");
const assets = JSON.parse(readFileSync(assetsPath, "utf8"));

let failed = false;
for (const [name, m] of Object.entries(assets.models)) {
  const file = join(appRoot, "public", m.path.replace(/^\//, ""));
  if (!existsSync(file)) {
    console.error(`models:pin: ${name} is missing at ${file}. Download it (approval needed) from:\n  ${m.sourceUrl}`);
    failed = true;
    continue;
  }
  const bytes = readFileSync(file);
  if (bytes.length !== m.sizeBytes) {
    console.error(`models:pin: ${name} is ${bytes.length} bytes, expected ${m.sizeBytes}.`);
    failed = true;
    continue;
  }
  const md5 = createHash("md5").update(bytes).digest("base64");
  if (md5 !== m.gcsMd5Base64) {
    console.error(`models:pin: ${name} MD5 ${md5} does not match Google's ${m.gcsMd5Base64}.`);
    failed = true;
    continue;
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (m.sha256 && m.sha256 !== sha256) {
    console.error(`models:pin: ${name} SHA-256 ${sha256} differs from the pinned ${m.sha256}. Not overwriting.`);
    failed = true;
    continue;
  }
  m.sha256 = sha256;
  console.log(`models:pin: ${name} OK, sha256 ${sha256}`);
}
if (failed) process.exit(1);
writeFileSync(assetsPath, JSON.stringify(assets, null, 2) + "\n");
