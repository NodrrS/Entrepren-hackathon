#!/usr/bin/env node
// Build apps/web/public/pharmacy/signs.json for the /pharmacy demo from PopSign ASL v1.0 landmarks
// (Georgia Tech, CC BY 4.0) extracted by apps/web/tools/extract.html into $POPSIGN_DIR/landmarks.
//   node scripts/build-pharmacy-signs.mjs [--eval]
// Output (gitignored, like all landmark data, RF2):
//   reply[sign]     one clip per sign (raw pose + hands, trimmed) for the signing skeleton
//   templates[]     DTW feature sequences (24 x 100) of the recognition shortlist, with mirrors
// --eval prints leave-one-signer-out accuracy of the recogniser on the shortlist.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WEIGHTS, aspectCorrect, classify, makeTemplates, handActive, SEQ_LEN, FEAT_DIM } from "../apps/web/src/pharmacy/classify.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const POPSIGN = process.env.POPSIGN_DIR ?? "C:/Users/user/Desktop/Projects/HandsUp-models/popsign-raw";
const LM = join(POPSIGN, "landmarks");
const OUT = join(root, "apps", "web", "public", "pharmacy", "signs.json");
export const RECOGNISE = ["hello", "sick", "owie", "head", "tooth", "please", "thankyou", "yes", "no", "water", "wait", "where"];

function decode(b64) {
  const buf = Buffer.from(b64, "base64");
  return new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
}
const b64 = (f) => Buffer.from(f.buffer, f.byteOffset, f.byteLength).toString("base64");

function loadClips() {
  const clips = [];
  const walk = (d) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (n.endsWith(".json")) {
        const j = JSON.parse(readFileSync(p, "utf8"));
        const pts = decode(j.keypoints_b64);
        const frames = [];
        for (let t = 0; t < j.frames; t++) frames.push({ points: pts.subarray(t * 225, (t + 1) * 225), present: j.present[t].map(Boolean) });
        // signer id: "4a.8005-hello-..." or "gtsignstudy4a.8031-hello-..." -> participant number
        const base = n.replace(/\.json$/, "");
        const signer = (base.match(/(\d{4})-/) ?? [null, base.split("-")[0]])[1];
        clips.push({ sign: j.sign, signer, split: j.split, id: base, frames, featFrames: frames.map((f) => aspectCorrect(f, j.width, j.height)) });
      }
    }
  };
  if (existsSync(LM)) walk(LM);
  return clips;
}

const clips = loadClips().filter((c) => c.split !== "dgs" && c.frames.some((f) => f.present[1] || f.present[2])); // dgs/: SignDict, built by build-pharmacy-dgs.mjs
const signs = [...new Set(clips.map((c) => c.sign))].sort();
console.log(`${clips.length} clips with hands, ${signs.length} signs: ${signs.map((s) => `${s}(${clips.filter((c) => c.sign === s).length})`).join(" ")}`);

if (process.env.W) Object.assign(WEIGHTS, JSON.parse(process.env.W));
if (process.argv.includes("--eval")) {
  // Leave the clip's signer out when another signer of that sign exists ("cross-signer", the honest
  // number); otherwise leave only the clip out ("same-signer", optimistic). Reported separately.
  const rec = clips.filter((c) => RECOGNISE.includes(c.sign));
  const stats = { cross: [0, 0, 0], same: [0, 0, 0] };
  const confusion = {};
  for (const c of rec) {
    let train = rec.filter((o) => o.signer !== c.signer);
    let kind = "cross";
    if (!train.some((o) => o.sign === c.sign)) {
      train = rec.filter((o) => o.id !== c.id);
      kind = "same";
    }
    const q = makeTemplates([{ ...c, frames: c.featFrames }])[0];
    if (!q) continue;
    const p = classify(q.seq, makeTemplates(train.map((o) => ({ ...o, frames: o.featFrames }))));
    const st = stats[kind];
    st[1]++;
    if (p.sign === c.sign) st[0]++;
    else (confusion[`${c.sign}->${p.sign}`] ??= 0), confusion[`${c.sign}->${p.sign}`]++;
    if (p.ranking.slice(0, 3).some((r) => r.sign === c.sign)) st[2]++;
  }
  for (const [k, [ok, n, t3]] of Object.entries(stats)) if (n) console.log(`${k}-signer: top-1 ${(100 * ok / n).toFixed(1)} % (${ok}/${n}), top-3 ${(100 * t3 / n).toFixed(1)} %`);
  console.log("signers per sign:", Object.fromEntries(RECOGNISE.map((s) => [s, new Set(rec.filter((c) => c.sign === s).map((c) => c.signer)).size])));
  console.log("most confused:", JSON.stringify(Object.entries(confusion).sort((a, b) => b[1] - a[1]).slice(0, 10)));
}

// reply clips: for each sign, the clip with the longest hand-active span inside 1..3 s, trimmed with a margin
const reply = {};
for (const s of signs) {
  let best = null;
  for (const c of clips.filter((c) => c.sign === s)) {
    const idx = c.frames.map((f, i) => (handActive(f, null) ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) continue;
    const a = Math.max(0, idx[0] - 4), b = Math.min(c.frames.length - 1, idx[idx.length - 1] + 4);
    const len = b - a + 1;
    const both = c.frames.slice(a, b + 1).filter((f) => f.present[0]).length / len;
    const score = (len >= 20 && len <= 90 ? 1 : 0) + both + (c.split === "val" ? 0.1 : 0);
    if (!best || score > best.score) best = { score, c, a, b };
  }
  if (!best) continue;
  const fr = best.c.frames.slice(best.a, best.b + 1);
  const pts = new Float32Array(fr.length * 225);
  fr.forEach((f, i) => pts.set(f.points, i * 225));
  reply[s] = { id: best.c.id, frames: fr.length, keypoints_b64: b64(pts), present: fr.map((f) => f.present.map((x) => (x ? 1 : 0))) };
}

// The reply clips also drive the "Beispiel" demo of the recogniser, so they are kept out of the templates.
const replyIds = new Set(Object.values(reply).map((r) => r.id));
const templates = makeTemplates(clips.filter((c) => RECOGNISE.includes(c.sign) && !replyIds.has(c.id)).map((c) => ({ ...c, frames: c.featFrames }))).map((t) => {
  const flat = new Float32Array(SEQ_LEN * FEAT_DIM);
  t.seq.forEach((f, i) => flat.set(f, i * FEAT_DIM));
  return { sign: t.sign, signer: t.signer, seq_b64: b64(flat) };
});

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({
  source: "PopSign ASL v1.0 (Georgia Tech), CC BY 4.0, https://signdata.cc.gatech.edu/view/datasets/popsign_v1_0/ . Landmarks extracted with MediaPipe Holistic (pose + hands only, no face mesh, no video).",
  seqLen: SEQ_LEN, featDim: FEAT_DIM, recognise: RECOGNISE.filter((s) => signs.includes(s)), reply, templates,
}));
console.log(`wrote ${OUT}: ${Object.keys(reply).length} reply clips, ${templates.length} templates, ${(statSync(OUT).size / 1e6).toFixed(2)} MB`);
