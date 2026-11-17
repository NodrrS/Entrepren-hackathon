"""Decode PopSign clips to small JPEG frames at 25 FPS for in-browser landmark extraction.

    <Thesis>/.venv/Scripts/python.exe -I ml/export/popsign_frames.py --root <HandsUp-models>/popsign-raw --max 10 --workers 3

Why: the browser stops decoding <video> in a hidden tab, so the extraction page reads JPEG frames
instead. Frames are 480 px wide, written to <root>/frames/<split>/<sign>/<clip>/NNNN.jpg plus
meta.json, and deleted together with the videos after extraction (D-013: videos of people stay
local and temporary). Uses OpenCV only; no network.
"""
from __future__ import annotations

import argparse
import json
import sys
from multiprocessing import Pool
from pathlib import Path

FPS = 25


def job(args: tuple[str, str]) -> str:
    import cv2

    src, dst = Path(args[0]), Path(args[1])
    if (dst / "meta.json").exists():
        return "skip"
    cap = cv2.VideoCapture(str(src))
    rate = cap.get(cv2.CAP_PROP_FPS) or 30.0
    w, h = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    scale = min(1.0, 480 / max(1, w))
    size = (round(w * scale), round(h * scale))
    dst.mkdir(parents=True, exist_ok=True)
    i = k = 0
    while True:
        ok = cap.grab()
        if not ok:
            break
        # keep the source frame nearest to each 25 FPS tick
        if i >= round(k * rate / FPS):
            ok, img = cap.retrieve()
            if not ok:
                break
            cv2.imwrite(str(dst / f"{k:04d}.jpg"), cv2.resize(img, size, interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 85])
            k += 1
        i += 1
    cap.release()
    (dst / "meta.json").write_text(json.dumps({"frames": k, "fps": FPS, "width": w, "height": h}), encoding="utf-8")
    return "done"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True, type=Path)
    ap.add_argument("--max", type=int, default=10, help="clips per split and sign")
    ap.add_argument("--workers", type=int, default=3)
    a = ap.parse_args()
    vid = a.root / "vid"
    jobs = []
    for split in sorted(p for p in vid.iterdir() if p.is_dir()):
        for sign in sorted(p for p in split.iterdir() if p.is_dir()):
            clips = sorted(sign.rglob("*.mp4"))[: a.max]
            for c in clips:
                jobs.append((str(c), str(a.root / "frames" / split.name / sign.name / c.stem)))
    print(f"{len(jobs)} clips", flush=True)
    with Pool(a.workers) as pool:
        for n, r in enumerate(pool.imap_unordered(job, jobs), 1):
            if n % 20 == 0:
                print(f"{n}/{len(jobs)}", flush=True)
    print("done", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
