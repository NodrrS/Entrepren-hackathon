#!/usr/bin/env node
// Build the DGS part of the /pharmacy demo into apps/web/public/pharmacy/dgs/:
//   <GLOSS>.mp4      the SignDict sign videos we may use (SHA-256 checked against the source list)
//   dgs.json         per sign: words, licence, credit, video path, precomputed skeleton (MediaPipe pose +
//                    hands at 25 FPS) and DTW templates; the missing glosses; the scenario sentences
// and apps/web/public/pharmacy/CREDITS.md. Inputs:
//   DGS_DIR      (default HandsUp-previews/dgs-pharmacy): media/*.mp4, signs.json, CREDITS.md
//   POPSIGN_DIR  (default HandsUp-models/popsign-raw): landmarks/dgs/signdict/<GLOSS>.json
//                (made by apps/web/tools/extract.html from frames decoded by ml/export/popsign_frames.py)
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FEAT_DIM, SEQ_LEN, makeTemplates } from "../apps/web/src/pharmacy/classify.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DGS = process.env.DGS_DIR ?? "C:/Users/user/Desktop/Projects/HandsUp-previews/dgs-pharmacy";
const POPSIGN = process.env.POPSIGN_DIR ?? "C:/Users/user/Desktop/Projects/HandsUp-models/popsign-raw";
const OUT = join(root, "apps", "web", "public", "pharmacy");

// Exact signs and the two close stand-ins only (SuperManager rules, 2026-11-17). Not used: TAG (shows
// MORGEN), ESSEN (shows KOCHEN): wrong meaning; REZEPT (BRIEF), LESEN (BUCH), EURO (KAUFEN): too weak.
const USE = ["HALLO", "ICH", "ARZT", "GEHEN", "DEUTSCH", "KANN-NICHT", "BITTE", "MEDIKAMENT", "ZWEI", "WOCHE", "VERSTEHEN", "DANKE"];

const src = JSON.parse(readFileSync(join(DGS, "signs.json"), "utf8"));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const b64 = (f) => Buffer.from(f.buffer, f.byteOffset, f.byteLength).toString("base64");
mkdirSync(join(OUT, "dgs"), { recursive: true });

const signs = {};
const missing = {};
for (const [gloss, s] of Object.entries(src.signs)) {
  if (!USE.includes(gloss)) {
    missing[gloss] = { de: s.de, en: s.en };
    continue;
  }
  const bytes = readFileSync(join(DGS, s.media));
  if (sha(bytes) !== s.sha256) throw new Error(`${gloss}: video SHA-256 mismatch`);
  const lmPath = join(POPSIGN, "landmarks", "dgs", "signdict", `${gloss}.json`);
  if (!existsSync(lmPath)) throw new Error(`${gloss}: no skeleton at ${lmPath} (run the extraction tool)`);
  const lm = JSON.parse(readFileSync(lmPath, "utf8"));
  copyFileSync(join(DGS, s.media), join(OUT, "dgs", `${gloss}.mp4`));
  // DTW templates of this clip (aspect-corrected like the camera path), for the scenario recogniser
  const pts = Buffer.from(lm.keypoints_b64, "base64");
  const f32 = new Float32Array(pts.buffer, pts.byteOffset, pts.length / 4);
  const k = lm.width / lm.height;
  const frames = [];
  for (let t = 0; t < lm.frames; t++) {
    const p = new Float32Array(f32.subarray(t * 225, (t + 1) * 225));
    for (let i = 0; i < 225; i += 3) p[i] *= k;
    frames.push({ points: p, present: lm.present[t].map(Boolean) });
  }
  const templates = makeTemplates([{ sign: gloss, signer: "signdict", frames }]).map((t) => {
    const flat = new Float32Array(SEQ_LEN * FEAT_DIM);
    t.seq.forEach((f, i) => flat.set(f, i * FEAT_DIM));
    return b64(flat);
  });
  signs[gloss] = {
    de: s.de, en: s.en, shown: s.sign_shown, substitute: !!s.substitute, note: s.note ?? "",
    licence: s.licence, licenceUrl: s.licence_url, credit: s.credit, source: s.source_url, sha256: s.sha256,
    video: `/pharmacy/dgs/${gloss}.mp4`,
    skeleton: { fps: 25, frames: lm.frames, width: lm.width, height: lm.height, keypoints_b64: lm.keypoints_b64, present: lm.present },
    templates,
  };
}
for (const g of src.missing ?? []) if (!signs[g] && !missing[g]) missing[g] = { de: g.toLowerCase(), en: "" };

writeFileSync(join(OUT, "dgs", "dgs.json"), JSON.stringify({
  source: "SignDict (https://signdict.org); per-video licences below. Skeletons: MediaPipe pose + hands, computed by Hands Up.",
  seqLen: SEQ_LEN, featDim: FEAT_DIM, signs, missing, sentences: src.sentences,
}));

const rows = USE.map((g) => {
  const s = signs[g];
  return `| ${g} | ${s.shown}${s.substitute ? " (stand-in)" : ""} | dgs/${g}.mp4 | ${s.source} | ${s.credit} | [${s.licence}](${s.licenceUrl}) | \`${s.sha256}\` |`;
});
writeFileSync(join(OUT, "CREDITS.md"), `# /pharmacy demo data: credits and licences

## DGS sign videos (dgs/*.mp4) and their skeletons (dgs/dgs.json)
From SignDict (https://signdict.org), a community DGS dictionary; most videos originate from Wikisign DGS (dgs.wikisign.org).
Only videos marked CC BY-SA 3.0 DE or CC BY 4.0 are used. The skeletons in dgs.json are MediaPipe landmarks computed from these
videos by Hands Up; as adaptations of CC BY-SA videos they are shared under the same licence (CC BY-SA 3.0 DE) with the same credit.

| Gloss | Sign shown | File | Source | Credit | Licence | SHA-256 |
|---|---|---|---|---|---|---|
${rows.join("\n")}

Glosses with no openly licensed video are shown as text cards ("Gebärde folgt"): ${Object.keys(missing).join(", ")}.

## ASL sign skeletons (signs.json)
PopSign ASL v1.0, Georgia Tech, CC BY 4.0 (https://signdata.cc.gatech.edu/view/datasets/popsign_v1_0/). Pose and hand landmarks only
(MediaPipe), no video, no face mesh. Built by scripts/build-pharmacy-signs.mjs.

## SHA-256
${["signs.json", "dgs/dgs.json"].filter((f) => existsSync(join(OUT, f))).map((f) => `- ${f}: \`${sha(readFileSync(join(OUT, f)))}\``).join("\n")}
`);
console.log(`dgs: ${Object.keys(signs).length} signs with video + skeleton, ${Object.keys(missing).length} shown as text cards -> ${join(OUT, "dgs")}`);
