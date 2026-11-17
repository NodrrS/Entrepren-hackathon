/**
 * Dev-only: run the pinned MediaPipe HolisticLandmarker (pose) and HandLandmarker (hands) over
 * PopSign clips, decoded beforehand to 25 FPS JPEG frames by ml/export/popsign_frames.py (a hidden
 * browser tab stops decoding <video>, images still decode). Saves pose + hand landmarks only (no
 * face mesh, no pixels) as JSON through the dev server middleware in vite.config.ts (POPSIGN_DIR).
 * URL options: ?only=<substring> ?delegate=CPU
 */
import { FilesetResolver, HandLandmarker, HolisticLandmarker } from "@mediapipe/tasks-vision";
import { installNetworkGuard } from "../privacy";
import { sha256Hex } from "@handsup/sign-engine";
import mpAssets from "../../mediapipe-assets.json";

installNetworkGuard(window);
const status = document.getElementById("status")!;
const canvas = document.createElement("canvas");
const c2d = canvas.getContext("2d")!;
const HAND_SHA = "fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1";

function b64(f: Float32Array): string {
  const u = new Uint8Array(f.buffer);
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}
const enc = (p: string) => p.split("/").map(encodeURIComponent).join("/");

async function main(): Promise<void> {
  const m = mpAssets.models["holistic_landmarker.task"];
  const bytes = new Uint8Array(await (await fetch(m.path)).arrayBuffer());
  if ((await sha256Hex(bytes)) !== m.sha256) throw new Error("task hash mismatch");
  // Hands from the standalone HandLandmarker (palm detection): Holistic finds hands only where its
  // pose puts the wrists, which fails on PopSign's close-up selfie clips. Dev-only model, not shipped.
  const handBytes = new Uint8Array(await (await fetch("/__popsign/hand-task")).arrayBuffer());
  if ((await sha256Hex(handBytes)) !== HAND_SHA) throw new Error("hand task hash mismatch");
  const fileset = await FilesetResolver.forVisionTasks(mpAssets.wasmBasePath);
  const params = new URLSearchParams(location.search);
  const delegate = params.get("delegate") === "CPU" ? "CPU" : "GPU";
  const only = params.get("only");
  const list = (await (await fetch("/__popsign/list-frames")).json()) as string[];
  const done = new Set((await (await fetch("/__popsign/list-done2")).json()) as string[]);
  const todo = list.filter((p) => (!only || p.includes(only)) && !done.has(p));
  let ts = 0;
  let n = 0;
  for (const clip of todo) {
    // Fresh landmarkers per clip: tracking state must not carry over between people.
    const lm = await HolisticLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: bytes, delegate },
      runningMode: "VIDEO",
      outputFaceBlendshapes: false,
      outputPoseSegmentationMasks: false,
    });
    const hands = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: handBytes, delegate },
      runningMode: "VIDEO",
      numHands: 2,
    });
    const meta = (await (await fetch(`/__popsign/fr/${enc(clip)}/meta.json`)).json()) as { frames: number; width: number; height: number };
    const T = meta.frames;
    const pts = new Float32Array(T * 75 * 3);
    const present: number[][] = [];
    for (let k = 0; k < T; k++) {
      const blob = await (await fetch(`/__popsign/fr/${enc(clip)}/${String(k).padStart(4, "0")}.jpg`)).blob();
      const bmp = await createImageBitmap(blob);
      if (canvas.width !== bmp.width || canvas.height !== bmp.height) {
        canvas.width = bmp.width;
        canvas.height = bmp.height;
      }
      c2d.drawImage(bmp, 0, 0);
      bmp.close();
      ts += 40;
      const r = lm.detectForVideo(canvas, ts);
      const h = hands.detectForVideo(canvas, ts);
      // Slot by image position (unmirrored image: the signer's right hand is on the image left):
      // smaller wrist x -> "right hand" slot 54.., larger -> "left hand" slot 33..
      const found = [...h.landmarks].sort((a, b) => a[0]!.x - b[0]!.x);
      let leftH: (typeof found)[number] | undefined;
      let rightH: (typeof found)[number] | undefined;
      if (found.length >= 2) [rightH, leftH] = [found[0], found[1]];
      else if (found.length === 1) {
        const pose = r.poseLandmarks[0];
        const mid = pose ? (pose[11]!.x + pose[12]!.x) / 2 : 0.5;
        if (found[0]![0]!.x < mid) rightH = found[0];
        else leftH = found[0];
      }
      const parts = [r.poseLandmarks[0], leftH, rightH];
      const offs = [0, 33, 54];
      const counts = [33, 21, 21];
      const pr = [0, 0, 0, 0];
      parts.forEach((lmList, j) => {
        if (!lmList || lmList.length < counts[j]!) return;
        pr[j] = 1;
        for (let i = 0; i < counts[j]!; i++) {
          const o = (k * 75 + offs[j]! + i) * 3;
          pts[o] = lmList[i]!.x;
          pts[o + 1] = lmList[i]!.y;
          pts[o + 2] = lmList[i]!.z;
        }
      });
      present.push(pr);
    }
    lm.close();
    hands.close();
    const [split, sign, id] = clip.split("/");
    const out = { id, sign, split, frames: T, fps: 25, keypoints_b64: b64(pts), present, width: meta.width, height: meta.height };
    await fetch(`/__popsign/save/${enc(clip)}.json`, { method: "POST", body: JSON.stringify(out) });
    n++;
    status.textContent = `${n} / ${todo.length}: ${clip} (${T} frames, hands in ${present.filter((p) => p[1] || p[2]).length})`;
  }
  status.textContent = `DONE ${n}`;
}
main().catch((e) => {
  status.textContent = `ERROR ${String(e)}`;
});
