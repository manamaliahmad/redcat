#!/usr/bin/env python3
"""cutout.py — photo to transparent-background cutout (rembg).
Usage: python cutout.py <input-image> <output-png>
Proven pattern in this project (the /rembg flow). No model download on
later runs: rembg caches the u2net weights after the first run.
Prints input/output sizes and elapsed seconds. Exits non-zero on error.
"""
import sys
import time

from PIL import Image
from rembg import remove


def main():
    if len(sys.argv) != 3:
        print("Usage: python cutout.py <input-image> <output-png>")
        return 1
    src, dst = sys.argv[1], sys.argv[2]
    t0 = time.time()
    img = Image.open(src).convert("RGB")
    out = remove(img)
    out.save(dst)
    print("CUTOUT_OK input=%s size=%sx%s output=%s elapsed=%.1fs" % (
        src, img.width, img.height, dst, time.time() - t0))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
