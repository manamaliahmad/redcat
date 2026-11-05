#!/usr/bin/env python3
"""make-depth.py — photo to grayscale depth map (Depth Anything V2 Small).
Usage: python make-depth.py <input-image> <output-png>
Runs locally on CPU via transformers. First run downloads ~100MB of
weights from Hugging Face; later runs are fully local. Prints a timing
breakdown (model load vs inference) and sizes — the real speed on this
PC, never a guessed number. Exits non-zero with a clear message when
transformers is missing (pip install transformers timm).
"""
import sys
import time

from PIL import Image


def main():
    if len(sys.argv) != 3:
        print("Usage: python make-depth.py <input-image> <output-png>")
        return 1
    src, dst = sys.argv[1], sys.argv[2]
    try:
        import torch  # noqa: F401  (pipeline needs torch present)
        from transformers import pipeline
    except ImportError as e:
        print("DEPTH_ERROR transformers missing: %s — run: pip install transformers timm" % e)
        return 1
    t0 = time.time()
    img = Image.open(src).convert("RGB")
    pipe = pipeline(
        "depth-estimation",
        model="depth-anything/Depth-Anything-V2-Small-hf",
    )
    t_load = time.time()
    result = pipe(img)
    depth = result["depth"]
    if depth.size != img.size:
        depth = depth.resize(img.size)
    depth.save(dst)
    t1 = time.time()
    print("DEPTH_OK input=%s size=%sx%s output=%s load=%.1fs inference=%.1fs total=%.1fs" % (
        src, img.width, img.height, dst, t_load - t0, t1 - t_load, t1 - t0))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
