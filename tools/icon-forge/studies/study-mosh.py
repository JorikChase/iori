"""MOSHINE icon crops: every square crop of iori's moshed screenshots, scored for colour and detail.

uv run --with pillow,numpy --no-project tools/icon-forge/studies/study-mosh.py
Colour is measured at 32 px as well as at app size, so a crop only scores if it survives on a home screen.
"""
import pathlib
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from study import OUT, board

SRC = pathlib.Path(__file__).parent / "mosh-src"
TOP = 4


def colourful(a):
    """Hasler and Süsstrunk's colourfulness on an RGB array."""
    rg = a[..., 0] - a[..., 1]
    yb = .5 * (a[..., 0] + a[..., 1]) - a[..., 2]
    return np.hypot(rg.std(), yb.std()) + .3 * np.hypot(rg.mean(), yb.mean())


def detail(a):
    g = a.mean(axis=2)
    return np.abs(g[1:-1, 1:-1] * 4 - g[:-2, 1:-1] - g[2:, 1:-1] - g[1:-1, :-2] - g[1:-1, 2:]).mean()


def score(c):
    big = np.asarray(c.resize((180, 180), Image.LANCZOS), float)
    tiny = np.asarray(c.resize((32, 32), Image.LANCZOS), float)
    return colourful(big) + 1.4 * colourful(tiny) + 1.2 * detail(big), colourful(tiny), detail(big)


def overlap(a, b):
    w = max(0, min(a[0] + a[2], b[0] + b[2]) - max(a[0], b[0]))
    h = max(0, min(a[1] + a[2], b[1] + b[2]) - max(a[1], b[1]))
    return w * h / min(a[2], b[2]) ** 2


def main():
    (OUT / "mosh").mkdir(parents=True, exist_ok=True)
    it = []
    for f in sorted(SRC.iterdir()):
        im = Image.open(f).convert("RGB")
        W, H = im.size
        cands = []
        for side in [round(H * k) for k in (1, .8, .62, .46)]:
            step = max(8, side // 12)
            for y in range(0, H - side + 1, step):
                for x in range(0, W - side + 1, step):
                    c = im.crop((x, y, x + side, y + side))
                    cands.append((*score(c), (x, y, side)))
        cands.sort(key=lambda r: -r[0])
        keep = []
        for r in cands:
            if all(overlap(r[3], k[3]) < .3 for k in keep):
                keep.append(r)
            if len(keep) == TOP:
                break
        print(f.name, (W, H), [(round(k[0]), k[3]) for k in keep])
        for i, (s, col, det, (x, y, side)) in enumerate(keep):
            c = im.crop((x, y, x + side, y + side)).resize((1024, 1024), Image.LANCZOS)
            n = f"{f.stem}-{i + 1}"
            c.save(OUT / "mosh" / f"{n}.png")
            it.append((f"{n}  {side}px", c))
    board(it, "mosh-board", 4, 170)


if __name__ == "__main__":
    main()
