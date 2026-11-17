#!/usr/bin/env node
// D-007 licence allow-list check over package-lock.json. Runs in CI and as part of `npm test`.
// Exits 1 if any dependency has a denied licence, or a shipped dependency is off the allow-list.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkLockfile } from "./licence-policy.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lockPath = join(root, "package-lock.json");
if (!existsSync(lockPath)) {
  console.error("check-licences: package-lock.json not found; run `npm install` first.");
  process.exit(1);
}
const lock = JSON.parse(readFileSync(lockPath, "utf8"));

const readMeta = (key) => {
  const p = join(root, key, "package.json");
  if (!existsSync(p)) return undefined;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return undefined;
  }
};

const { checked, failures, warnings } = checkLockfile(lock, readMeta);
const fmt = (x) => `  - ${x.name}@${x.version}  [${x.licence}]  ${x.dev ? "dev" : "shipped"}: ${x.reason}`;

if (warnings.length > 0) {
  console.warn(`check-licences: ${warnings.length} dev-only package(s) need a licence review (warning only):`);
  for (const w of warnings) console.warn(fmt(w));
}
if (failures.length > 0) {
  console.error(`check-licences: FAILED, ${failures.length} package(s) violate the D-007 allow-list:`);
  for (const f of failures) console.error(fmt(f));
  process.exit(1);
}
console.log(`check-licences: OK, ${checked} packages checked, 0 failures, ${warnings.length} dev-only warning(s).`);
