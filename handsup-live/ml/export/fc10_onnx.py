"""Export the thesis model fc10 to ONNX as a per-chunk streaming step, and prove parity.

Run with the THESIS virtual environment (it has torch and onnxruntime), on CPU:

    C:/Users/user/Desktop/Projects/Thesis/.venv/Scripts/python.exe ml/export/fc10_onnx.py \
        --thesis C:/Users/user/Desktop/Projects/Thesis --out apps/web/public/models

The thesis repo is only read (its ``src`` is imported); nothing is written there.

The ONNX graph is ONE streaming step of ``CSLRModel.stream_step`` with the cache made explicit:

    inputs   x        float32 [1, 8, 51, 4]   8 raw frames (stride 2 x C 4), normalised (src/data/normalize.py)
             k_cache  float32 [6, 1, 4, 32, 64]  roped keys of the last L_c*C = 32 encoder frames, newest last
             v_cache  float32 [6, 1, 4, 32, 64]
             pos      int64   [1]               encoder frames consumed so far (multiple of 4)
    outputs  logits   float32 [1, 4, 1233]     CTC logits for the 4 encoder frames of this chunk
             k_out, v_out                      the updated caches (shifted by 4, new frames appended)
             pos_out  int64   [1]

Cache slots before the first 32 encoder frames are padding and masked out (slot j is valid iff
j >= 32 - min(pos, 32)). With R = 0 and L_c = 8 the thesis ring buffer holds exactly the chunks
c-8..c-1, all inside the attention window, so this is the same computation.

Parity: for 3 dev clips (truncated to whole 8-frame chunks; the live path never has a short
last chunk) the thesis ``stream_step`` loop and the ONNX loop must give the same glosses
(closure rule) and logits within 1e-4.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from torch import Tensor, nn

FC10 = "experiments/EXP-20261110-cslr-p14-student-attn-v2-nokd-sc-init-fc10-s0"


class StepModule(nn.Module):
    """One streaming chunk of fc10 with an explicit, fixed-size KV cache."""

    def __init__(self, model) -> None:
        super().__init__()
        enc = model.encoder
        if enc.variant != "attn" or enc.R != 0 or enc.L_c is None or model.embed.front is not None:
            raise ValueError("only the attn variant with R=0, finite L_c and the flat embedding is supported")
        self.m = model
        self.C, self.L_c, self.stride = enc.C, enc.L_c, model.stride
        self.n_layers = len(enc.layers)
        self.n_heads = enc.layers[0].attn.n_heads
        self.d_h = enc.layers[0].attn.d_h
        self.W = self.L_c * self.C  # cached encoder frames per layer
        self.sc_layer = model.sc_layer

    def _rope(self, x: Tensor, pos: Tensor) -> Tensor:
        d_h = x.shape[-1]
        inv_freq = 1.0 / (10000.0 ** (torch.arange(0, d_h, 2, dtype=torch.float32) / d_h))
        ang = pos.to(torch.float32)[:, None] * inv_freq[None, :]
        cos, sin = ang.cos(), ang.sin()
        x1, x2 = x[..., 0::2], x[..., 1::2]
        return torch.stack((x1 * cos - x2 * sin, x1 * sin + x2 * cos), dim=-1).flatten(-2)

    def forward(self, x: Tensor, k_cache: Tensor, v_cache: Tensor, pos: Tensor):
        m = self.m
        B, T = x.shape[:2]
        u, _ = m.embed(x.reshape(B, T, -1))  # [1, C, d]
        p = pos + torch.arange(self.C, dtype=torch.int64)  # absolute encoder positions
        n_valid = torch.clamp(pos, max=self.W)  # [1]
        slot = torch.arange(self.W, dtype=torch.int64)
        cache_ok = slot >= (self.W - n_valid)  # [W]
        key_ok = torch.cat((cache_ok, torch.ones(self.C, dtype=torch.bool)))  # [W + C]
        h = u
        k_new, v_new = [], []
        for i, layer in enumerate(m.encoder.layers):
            at = layer.attn
            a = layer.norm(h)
            q = self._rope(at._split(at.q(a)), p)
            k = self._rope(at._split(at.k(a)), p)
            v = at._split(at.v(a))
            k_all = torch.cat((k_cache[i], k), dim=2)
            v_all = torch.cat((v_cache[i], v), dim=2)
            scores = q @ k_all.transpose(-1, -2) / math.sqrt(self.d_h)
            scores = torch.where(key_ok[None, None, None, :], scores, torch.full_like(scores, torch.finfo(torch.float32).min))
            out = (scores.softmax(dim=-1) @ v_all).transpose(1, 2).reshape(B, self.C, -1)
            h = layer.ffn(h + at.o(out))
            k_new.append(k_all[:, :, self.C:])
            v_new.append(v_all[:, :, self.C:])
            if self.sc_layer is not None and i + 1 == self.sc_layer:
                h = m._sc_fn(h)[0]
        logits = m.head(m.encoder.final_norm(h))
        return logits, torch.stack(k_new), torch.stack(v_new), pos + self.C


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--thesis", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path, help="folder for fc10_step.onnx (gitignored)")

    ap.add_argument("--clips", type=int, default=3)
    ap.add_argument("--threads", type=int, default=2)
    args = ap.parse_args()
    torch.set_num_threads(args.threads)
    thesis = args.thesis.resolve()
    out_dir = args.out.resolve()

    os.chdir(thesis)  # manifests use paths relative to the thesis root
    sys.path.insert(0, str(thesis))
    from src.data.datasets import make_dataset
    from src.evaluation.evaluate import load_checkpoint_model
    from src.inference.streaming_decoder import StreamingGreedyDecoder

    import onnxruntime as ort

    ckpt = thesis / FC10 / "best.pt"
    model, vocab, ck = load_checkpoint_model(ckpt, torch.device("cpu"))
    step = StepModule(model).eval()
    K, d_in = ck["num_keypoints"], ck["d_in"]
    raw = step.stride * step.C
    L, H, W, dh = step.n_layers, step.n_heads, step.W, step.d_h
    print(f"fc10: K={K} d_in={d_in} raw_chunk={raw} layers={L} heads={H} cache={W} d_h={dh} vocab={len(vocab)}")

    out_dir.mkdir(parents=True, exist_ok=True)
    onnx_path = out_dir / "fc10_step.onnx"
    dummy = (torch.zeros(1, raw, K, d_in), torch.zeros(L, 1, H, W, dh), torch.zeros(L, 1, H, W, dh), torch.zeros(1, dtype=torch.int64))
    # The TorchScript exporter only needs the `onnx` package to splice custom onnxscript functions
    # into the proto; this graph has none, so pass the bytes through (no new package needed).
    from torch.onnx._internal.torchscript_exporter import onnx_proto_utils
    onnx_proto_utils._add_onnxscript_fn = lambda model_bytes, custom_opsets: model_bytes
    with torch.no_grad():
        torch.onnx.export(step, dummy, str(onnx_path), input_names=["x", "k_cache", "v_cache", "pos"],
                          output_names=["logits", "k_out", "v_out", "pos_out"], opset_version=17, dynamo=False,
                          do_constant_folding=True)
    print(f"wrote {onnx_path} ({onnx_path.stat().st_size} bytes)")

    so = ort.SessionOptions()
    so.intra_op_num_threads = args.threads
    sess = ort.InferenceSession(str(onnx_path), so, providers=["CPUExecutionProvider"])

    data_cfg = ck["config"]["data"]
    ds = make_dataset(data_cfg, "dev", vocab)
    report = {"clips": [], "max_abs_logit_diff": 0.0}
    step_ms = []
    for ci in range(args.clips):
        item = ds[ci]
        x = item["x"]  # [T, K, d_in]
        T = (x.shape[0] // raw) * raw
        x = x[:T]
        # thesis streaming loop
        state = model.stream_init(1)
        dec_pt = StreamingGreedyDecoder(blank=0, rule="closure")
        dec_ox = StreamingGreedyDecoder(blank=0, rule="closure")
        kc = np.zeros((L, 1, H, W, dh), np.float32)
        vc = np.zeros_like(kc)
        pos = np.zeros(1, np.int64)
        lp_all, lo_all = [], []
        with torch.no_grad():
            for s in range(0, T, raw):
                xc = x[s:s + raw][None]
                lp, state = model.stream_step(xc, state)
                lp = lp[0].float()
                t0 = time.perf_counter()
                lo, kc, vc, pos = sess.run(None, {"x": xc.numpy().astype(np.float32), "k_cache": kc, "v_cache": vc, "pos": pos})
                step_ms.append((time.perf_counter() - t0) * 1000)
                lo = torch.from_numpy(lo[0])
                dec_pt.push(torch.softmax(lp, -1), s + raw)
                dec_ox.push(torch.softmax(lo, -1), s + raw)
                lp_all.append(lp)
                lo_all.append(lo)
        dec_pt.finalize(T)
        dec_ox.finalize(T)
        diff = float((torch.cat(lp_all) - torch.cat(lo_all)).abs().max())
        g_pt, g_ox = vocab.decode(dec_pt.emitted), vocab.decode(dec_ox.emitted)
        report["clips"].append({"sample_id": item["sample_id"], "frames": T, "max_abs_logit_diff": diff,
                                "glosses_torch": g_pt, "glosses_onnx": g_ox, "same_glosses": g_pt == g_ox,
                                "ref": vocab.decode(item["targets"].tolist())})
        report["max_abs_logit_diff"] = max(report["max_abs_logit_diff"], diff)
        print(f"{item['sample_id']}: T={T} max|dlogit|={diff:.2e} same={g_pt == g_ox}\n  hyp: {' '.join(g_pt)}")

    report["onnx_sha256"] = sha256(onnx_path)
    report["onnx_bytes"] = onnx_path.stat().st_size
    report["ort_cpu_step_ms_median"] = float(np.median(step_ms[5:])) if len(step_ms) > 5 else None
    report["ort_threads"] = args.threads
    report["pass"] = report["max_abs_logit_diff"] <= 1e-4 and all(c["same_glosses"] for c in report["clips"])
    report["checkpoint"] = f"{FC10}/best.pt"
    report["checkpoint_sha256"] = sha256(ckpt)
    (out_dir / "fc10_parity.json").write_text(json.dumps(report, indent=1, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({k: report[k] for k in ("max_abs_logit_diff", "pass", "onnx_sha256", "onnx_bytes", "ort_cpu_step_ms_median")}, indent=1))

    # vocabulary for the web app (ids -> gloss strings)
    (out_dir / "fc10_vocab.json").write_text(json.dumps({"itos": vocab.itos, "blank": 0}, ensure_ascii=False), encoding="utf-8")

    return 0 if report["pass"] else 1


if __name__ == "__main__":
    sys.exit(main())
