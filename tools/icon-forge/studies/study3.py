"""Third round: the Audio blobs, the fractal shortlist, and iori's picks side by side as a family.

uv run --with pillow,numpy --no-project tools/icon-forge/studies/study3.py blob|variants|short|family
"""
import cmath
import pathlib
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from study import GREEN, INK, OCHRE, OUT, RED, ROOT, S, board
from study2 import apollo, carpet_bleed, flake, grid, hilbert_bleed, ramp, smooth_escape

STUDY = pathlib.Path(__file__).parent / "out"
BONE = (235, 228, 210)
INKS = {"white": INK, "green": GREEN, "bone": BONE}


def seahorse(zoom=.0165, c=-.7445 + .115j, stops=None, freq=1.0):
    u, v = grid()
    p = c + ((u - .5) + 1j * (v - .5)) * zoom
    n = smooth_escape(p, it=900)
    t = np.nan_to_num((np.sin(np.sqrt(np.nan_to_num(n)) * freq) + 1) / 2)
    return ramp(t, stops or [(10, 12, 13), GREEN, BONE, OCHRE, (10, 12, 13)])


def multibrot(power=4, zoom=2.5, turn=0.0, col=INK):
    u, v = grid()
    p = ((u - .5) * zoom + 1j * (v - .5) * zoom) * cmath.exp(1j * turn)
    z = np.zeros_like(p)
    m = np.ones(p.shape, bool)
    for _ in range(220):
        z[m] = z[m] ** power + p[m]
        m &= np.abs(z) < 4
    a = np.zeros((*p.shape, 3), "uint8")
    a[m] = col
    return Image.fromarray(a)


def tint(im, ink, ground=(0, 0, 0)):
    a = np.asarray(im.convert("L"), float)[..., None] / 255
    return Image.fromarray((np.array(ground) * (1 - a) + np.array(ink) * a).astype("uint8"))


def cmd_blob():
    d = OUT / "orb"
    keep = sorted(d.glob("blob-*.png"))
    board([(p.stem, Image.open(p)) for p in keep], "orb-blob-board", 4, 150)
    real = sorted(d.glob("real-*.png"))
    if real:
        board([(p.stem, Image.open(p)) for p in real], "orb-real-board", 4, 170)


def cmd_variants():
    d = OUT / "orb"
    v = d / "variants"
    for pick in ("real-1", "real-5"):
        it = [(pick, Image.open(d / f"{pick}.png"))]
        it += [(p.stem.replace(pick + "-", ""), Image.open(p)) for p in sorted(v.glob(f"{pick}-one-*.png"))]
        it += [(p.stem.replace(pick + "-", ""), Image.open(p)) for p in sorted(v.glob(f"{pick}-two-*.png"))]
        board(it, f"orb-variants-{pick}", 6, 110)


def cmd_short():
    warm = [(8, 9, 10), RED, OCHRE, BONE, (8, 9, 10)]
    audio = [(8, 9, 10), (26, 199, 199), BONE, (255, 107, 26), (8, 9, 10)]
    it = [
        ("seahorse", seahorse()),
        ("seahorse close", seahorse(zoom=.0052, c=-.7463 + .1102j, freq=1.2)),
        ("seahorse warm", seahorse(stops=warm)),
        ("seahorse teal orange", seahorse(stops=audio)),
        ("multibrot 4 upright", multibrot(turn=cmath.pi / 2)),
        ("multibrot 4 bone", multibrot(turn=cmath.pi / 2, col=BONE)),
        ("hexaflake", flake(6, 3, 1 / 3)),
        ("hexaflake green", tint(flake(6, 3, 1 / 3), GREEN)),
        ("carpet 4", carpet_bleed(4)),
        ("carpet 4 on green", tint(carpet_bleed(4), BONE, GREEN)),
        ("hilbert 5", hilbert_bleed(5)),
        ("hilbert 3 for the tab", hilbert_bleed(3)),
    ]
    (OUT / "fractal").mkdir(parents=True, exist_ok=True)
    for n, im in it:
        im.convert("RGB").save(OUT / "fractal" / f"short-{n.replace(' ', '-')}.png")
    board(it, "fractal-short-board", 4, 150)


def cmd_family():
    o = lambda p: Image.open(OUT / p)
    it = [
        ("3die (current)", Image.open(ROOT / "icon/ios/512.png").resize((S, S), Image.LANCZOS)),
        ("Audio", o("orb/audio-pick.png")),
        ("Iris B", o("iris/r2-B.png")),
        ("Petri 3 colours", o("petri/three-strains.png")),
        ("Petri white", o("petri/white,-depth-2.png")),
        ("Petri real crop", o("petri/proto-crop.png")),
        ("Fractal seahorse", o("fractal/fractal-pick.png")),
        ("Fractal multibrot 4", o("fractal/short-multibrot-4-upright.png")),
        ("Fractal hexaflake", o("fractal/short-hexaflake.png")),
        ("Fractal carpet 4", o("fractal/short-carpet-4.png")),
        ("Fractal hilbert 5", o("fractal/short-hilbert-5.png")),
    ]
    board(it, "family-board", 4, 150)


if __name__ == "__main__":
    {"blob": cmd_blob, "variants": cmd_variants, "short": cmd_short, "family": cmd_family}[sys.argv[1]]()
