"""Test fixtures and demo data for the fc10 web runtime (packages/fc10-runtime, apps/web /live).

Run with the THESIS virtual environment (CPU):

    C:/Users/user/Desktop/Projects/Thesis/.venv/Scripts/python.exe ml/export/fc10_fixtures.py \
        --thesis C:/Users/user/Desktop/Projects/Thesis \
        --onnx C:/Users/user/Desktop/Projects/HandsUp-models/fc10/fc10_step.onnx \
        --fixtures packages/fc10-runtime/test/fixtures \
        --demo-out C:/Users/user/Desktop/Projects/HandsUp-models/fc10/demo

1. ``--fixtures`` (committed): SYNTHETIC inputs only, no PHOENIX data.
   - normalize.json: random raw MediaPipe frames (pose 33 + left hand 21 + right hand 21, with gaps)
     and the thesis ``normalize_pose`` output for them.
   - decoder.json: random chunked posteriors and the thesis ``StreamingGreedyDecoder`` (closure) output.
   - step.json: three ONNX steps on synthetic normalised input (logits slice + argmax per frame).
2. ``--demo-out`` (NOT committed, RF2): raw landmarks of a few PHOENIX dev clips that fc10 decodes
   correctly, for the /live demo fallback. Landmarks only, never video. Research use only.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import sys
from pathlib import Path

import numpy as np
import torch

DEMO_CLIPS = [
    "dev__09November_2010_Tuesday_tagesschau_default-0__1",
    "dev__23November_2011_Wednesday_tagesschau_default-0__1",
    "dev__29November_2011_Tuesday_tagesschau_default-10__1",
]
N_RAW = 75  # pose 33 + left hand 21 + right hand 21 (the face is not used by fc10)


def b64_f32(a: np.ndarray) -> str:
    return base64.b64encode(np.ascontiguousarray(a, dtype="<f4").tobytes()).decode("ascii")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--thesis", required=True, type=Path)
    ap.add_argument("--onnx", required=True, type=Path)
    ap.add_argument("--fixtures", type=Path)
    ap.add_argument("--demo-out", type=Path)
    args = ap.parse_args()
    torch.set_num_threads(2)
    thesis = args.thesis.resolve()
    fixtures = args.fixtures.resolve() if args.fixtures else None
    demo_out = args.demo_out.resolve() if args.demo_out else None
    onnx_path = args.onnx.resolve()
    os.chdir(thesis)
    sys.path.insert(0, str(thesis))
    from src.data.normalize import KEYPOINT_SUBSETS, normalize_pose
    from src.inference.streaming_decoder import StreamingGreedyDecoder
    import onnxruntime as ort

    rng = np.random.default_rng(20261117)

    if fixtures:
        fixtures.mkdir(parents=True, exist_ok=True)
        # ---- normalisation ----
        T = 16
        kp = np.zeros((T, 553, 3), np.float32)
        kp[:, :N_RAW] = rng.uniform(-0.2, 1.2, size=(T, N_RAW, 3)).astype(np.float32)
        kp[:, :N_RAW, 2] *= 0.3
        present = np.ones((T, 4), bool)
        present[:, 3] = False  # no face (unused)
        present[0:2, 0] = False  # no pose in the first frames: centre 0, scale 1
        present[5, 0] = False  # pose lost mid-clip: reuse the EMA
        present[3:7, 1] = False  # left hand missing
        present[9:12, 2] = False  # right hand missing
        present[13, :3] = False  # nothing at all
        kp[8, 12] = kp[8, 11]  # zero shoulder width: pose not usable in this frame
        out = normalize_pose(kp, present, "hands_body", alpha=0.9, use_z=True).numpy()
        (fixtures / "normalize.json").write_text(json.dumps({
            "source": "synthetic (ml/export/fc10_fixtures.py), thesis src/data/normalize.py normalize_pose, subset hands_body, alpha 0.9, use_z",
            "indices": KEYPOINT_SUBSETS["hands_body"],
            "T": T, "n_raw": N_RAW,
            "raw": kp[:, :N_RAW].round(6).tolist(),  # values exactly representable after rounding below
            "present": present.tolist(),
            "expected": out.tolist(),
        }), encoding="utf-8")
        # recompute with the rounded raw values so the fixture is self-consistent
        d = json.loads((fixtures / "normalize.json").read_text(encoding="utf-8"))
        kp2 = np.zeros((T, 553, 3), np.float32)
        kp2[:, :N_RAW] = np.asarray(d["raw"], np.float32)
        d["expected"] = normalize_pose(kp2, present, "hands_body", alpha=0.9, use_z=True).numpy().tolist()
        (fixtures / "normalize.json").write_text(json.dumps(d), encoding="utf-8")

        # ---- decoder ----
        cases = []
        V = 6
        for c in range(4):
            n_chunks = 10
            labels = rng.choice(V, size=n_chunks * 4, p=[0.5, 0.1, 0.1, 0.1, 0.1, 0.1])
            post = rng.uniform(0, 0.1, size=(n_chunks * 4, V))
            post[np.arange(len(labels)), labels] = 1.0
            post = post / post.sum(-1, keepdims=True)
            dec = StreamingGreedyDecoder(blank=0, rule="closure")
            emitted = []
            for k in range(n_chunks):
                emitted += dec.push(torch.tensor(post[k * 4:(k + 1) * 4]), (k + 1) * 8)
            fin = dec.finalize(n_chunks * 8)
            cases.append({"posteriors": post.round(6).tolist(), "chunk": 4, "emitted": emitted, "finalized": fin})
        (fixtures / "decoder.json").write_text(json.dumps({"source": "thesis src/inference/streaming_decoder.py closure rule", "cases": cases}), encoding="utf-8")

        # ---- ONNX steps on synthetic input ----
        sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
        kc = np.zeros((6, 1, 4, 32, 64), np.float32)
        vc = np.zeros_like(kc)
        pos = np.zeros(1, np.int64)
        xs, steps = [], []
        for s in range(3):
            x = (rng.normal(0, 0.5, size=(1, 8, 51, 4))).astype(np.float32).round(4)
            x[..., 3] = 1.0
            logits, kc, vc, pos = sess.run(None, {"x": x, "k_cache": kc, "v_cache": vc, "pos": pos})
            xs.append(x.reshape(-1).tolist())
            steps.append({"logits_first16": logits[0, :, :16].tolist(), "argmax": logits[0].argmax(-1).tolist(),
                          "logsumexp": [float(np.log(np.exp(r - r.max()).sum()) + r.max()) for r in logits[0]]})
        (fixtures / "step.json").write_text(json.dumps({"source": "synthetic x through fc10_step.onnx (onnxruntime CPU)", "x": xs, "steps": steps}), encoding="utf-8")
        print(f"fixtures written to {fixtures}")

    if demo_out:
        demo_out.mkdir(parents=True, exist_ok=True)
        import csv
        rows = {r["sample_id"]: r for r in csv.DictReader(open("data/processed/phoenix2014/dev.csv", encoding="utf-8"))}
        manifest_dir = Path("data/processed/phoenix2014")
        clips = []
        for sid in DEMO_CLIPS:
            r = rows[sid]
            with np.load(manifest_dir / r["npz_path"]) as f:
                kp, pr = f["keypoints"].astype(np.float32), f["present"]
            clips.append({"id": sid, "frames": int(kp.shape[0]), "fps": 25, "reference": r["glosses"].split(),
                          "keypoints_b64": b64_f32(kp[:, :N_RAW]), "present": pr.astype(int).tolist()})
        (demo_out / "demo-clips.json").write_text(json.dumps({
            "note": "PHOENIX-2014 dev landmarks (MediaPipe Holistic, pose+hands only, no video). Non-commercial research use only. Never commit.",
            "layout": "keypoints [T, 75, 3] float32 little-endian: pose 0..32, left hand 33..53, right hand 54..74; present [T, 4]: pose, left, right, face",
            "clips": clips}), encoding="utf-8")
        print(f"demo clips written to {demo_out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
