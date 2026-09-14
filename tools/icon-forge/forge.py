#!/usr/bin/env python3
"""3DIE / IORI icon forge — builds every site icon from the painted LOGO.PNG.

The source artwork bleeds to its own canvas edges (the green tip reaches 2.4%
from the top, the gold point 95.6% across), so pasting it straight into an
iOS icon loses both tips to the squircle mask. This reframes it instead: the
painted mark is matted off its paper, scaled into the safe area, and set back
down on a paper field extended from a clean patch of the original sheet.

Everything resamples in linear light and converts Display P3 -> sRGB, which
the icons shipping today skip (they carry no profile at all).

Run:  uv run --with pillow,numpy,scipy tools/icon-forge/forge.py board
      uv run --with pillow,numpy,scipy tools/icon-forge/forge.py build
      ... --source LOGO.PNG build      # the light sheet
"""

import argparse
import io
import os

import numpy as np
from PIL import Image, ImageCms
from scipy.ndimage import (binary_closing, binary_dilation, binary_opening,
                           distance_transform_edt, gaussian_filter, label,
                           map_coordinates)

Image.MAX_IMAGE_PIXELS = None

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))

# Each source sheet needs its own way to tell paint from ground, and its own
# clean patch of ground to extend the frame with (y, x, size).
#
#   light: paint is darker than the sheet, or coloured. Needed because the
#          paper's own grain reaches 0.078 saturation — as high as the sage
#          green — so saturation alone cannot carry it.
#   dark:  the ground is *exactly* neutral (60% of pixels sit at sat 0.000)
#          while every paint carries chroma, so saturation alone is decisive.
#          Luminance is useless here: the bright top-left corner of the ground
#          (0.369) outranks the red paint (0.234).
SOURCES = {
    "logo_dark.png": dict(mode="dark", patch=(900, 2050, 900)),
    "LOGO.PNG": dict(mode="light", patch=(750, 2150, 800)),
}
DEFAULT_SOURCE = "logo_dark.png"

MARK_SCALE = 0.74      # mark bbox as a fraction of the icon, for the iOS squircle
MASKABLE_SCALE = 0.54  # Android maskable keeps content inside an 80%-diameter circle

_SRGB = ImageCms.createProfile("sRGB")
SRGB_BYTES = ImageCms.ImageCmsProfile(_SRGB).tobytes()


# --- colour / resampling ---------------------------------------------------
def to_linear(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def to_srgb(c):
    c = np.clip(c, 0.0, 1.0)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def resize_linear(arr, size):
    """Resample in linear light. Doing this in sRGB darkens edges — the usual
    reason downscaled logos look muddy."""
    out = []
    for c in range(arr.shape[-1]):
        im = Image.fromarray(arr[..., c].astype(np.float32), "F")
        out.append(np.asarray(im.resize(size, Image.LANCZOS), dtype=np.float32))
    return np.stack(out, axis=-1)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


# --- source ----------------------------------------------------------------
_cache = {}


def load_source():
    """Return (linear RGB, matte, bbox) for the painted mark, in sRGB primaries."""
    if "src" in _cache:
        return _cache["src"]

    name = _cache["source"]
    prof = SOURCES[name]
    im = Image.open(os.path.join(ROOT, name))
    icc = im.info.get("icc_profile")
    im = im.convert("RGB")
    if icc:
        # Display P3 -> sRGB. Without this the greens and the red shift.
        src = ImageCms.ImageCmsProfile(io.BytesIO(icc))
        im = ImageCms.profileToProfile(im, src, _SRGB, outputMode="RGB")

    a = np.asarray(im, dtype=np.float32) / 255.0
    mn = a.min(-1)
    sat = a.max(-1) - mn

    if prof["mode"] == "dark":
        solid = sat > 0.025
        matte = smoothstep(0.018, 0.070, sat)
    else:
        solid = (mn < 0.78) | (sat > 0.14)
        matte = np.maximum(smoothstep(0.76, 0.58, mn), smoothstep(0.05, 0.15, sat))

    solid = binary_closing(binary_opening(solid, np.ones((11, 11))), np.ones((21, 21)))
    lab, _ = label(solid)
    sz = np.bincount(lab.ravel())
    sz[0] = 0
    region = np.isin(lab, np.where(sz > 0.0015 * solid.size)[0])

    # Gate the matte to the mark's own region so ground grain can't leak in and
    # print a seam where the sheet gets extended.
    gate = gaussian_filter(binary_dilation(region, np.ones((25, 25))).astype(np.float32), 8.0)
    matte = np.clip(matte * np.clip(gate * 1.15, 0.0, 1.0), 0.0, 1.0)

    ys, xs = np.where(region)
    bbox = (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()))
    _cache["src"] = (to_linear(a), matte.astype(np.float32), bbox)
    return _cache["src"]


def ground_field(w, h, seed=3):
    """The sheet's ground, extended to any size from a clean patch of it."""
    key = ("ground", w, h)
    if key in _cache:
        return _cache[key]
    lin, _, _ = load_source()
    y, x, s = SOURCES[_cache["source"]]["patch"]
    patch = lin[y:y + s, x:x + s]

    # Scaled up, not tiled: repeating the patch prints a regular grain pattern
    # that reads as wood, and the mirror seams are visible at 1024.
    field = resize_linear(patch, (w, h))
    res = (h, w)

    # Upscaling magnifies the patch's strokes into heavy banding, so pull the
    # texture contrast back toward the sheet's mean tone. Keeps the ground,
    # drops the noise that would only muddy a 60px icon.
    mean = field.mean((0, 1), keepdims=True)
    field = mean + (field - mean) * 0.32

    # Dither, multiplicative so it tracks the local level. Additive noise sized
    # for the light sheet is ~12% modulation against this dark ground, which
    # reads as static.
    rng = np.random.default_rng(seed)
    n = gaussian_filter(rng.standard_normal(res + (1,)).astype(np.float32), (1.1, 1.1, 0))
    yy, xx = np.mgrid[0:res[0], 0:res[1]].astype(np.float32)
    yy, xx = yy / res[0], xx / res[1]
    shade = 1.0 - 0.050 * np.clip((xx * 0.45 + yy * 0.85) - 0.18, 0.0, 1.4)
    field = np.clip(field * shade[..., None] * (1.0 + n * 0.030), 0.0, 1.0)
    _cache[key] = field.astype(np.float32)
    return _cache[key]


# --- composition -----------------------------------------------------------
def compose(w, h=None, scale=MARK_SCALE):
    """Reframed icon at w x h, rendered straight from the 3000px source."""
    h = h or w
    ss = max(2, int(np.ceil(640.0 / max(w, h))))
    W, H = w * ss, h * ss

    lin, matte, bbox = load_source()
    x0, y0, x1, y1 = bbox
    crop, crop_m = lin[y0:y1 + 1, x0:x1 + 1], matte[y0:y1 + 1, x0:x1 + 1]
    ih, iw = crop_m.shape

    k = scale * min(W, H) / max(iw, ih)
    tw, th = max(int(round(iw * k)), 1), max(int(round(ih * k)), 1)
    mark = resize_linear(crop, (tw, th))
    mmat = resize_linear(crop_m[..., None], (tw, th))[..., 0]

    base = ground_field(W, H).copy()
    ox, oy = (W - tw) // 2, (H - th) // 2
    a = mmat[..., None]
    base[oy:oy + th, ox:ox + tw] = base[oy:oy + th, ox:ox + tw] * (1.0 - a) + mark * a

    srgb = to_srgb(base)
    img = Image.fromarray((np.clip(srgb, 0, 1) * 255.0 + 0.5).astype(np.uint8), "RGB")
    return img.resize((w, h), Image.LANCZOS)


def save(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, format="PNG", optimize=True, icc_profile=SRGB_BYTES)


# --- previews --------------------------------------------------------------
def squircle(size, n=5.0, ss=4):
    r = size * ss
    y, x = np.mgrid[0:r, 0:r].astype(np.float32)
    u, v = (x + 0.5) / r * 2 - 1, (y + 0.5) / r * 2 - 1
    inside = (np.abs(u) ** n + np.abs(v) ** n) <= 1.0
    return Image.fromarray((inside * 255).astype(np.uint8), "L").resize((size, size), Image.LANCZOS)


def cmd_board(args):
    """Contact sheet: the icon at real sizes, under the iOS squircle mask."""
    out_dir = os.path.join(HERE, "preview")
    os.makedirs(out_dir, exist_ok=True)
    sizes = [256, 180, 120, 80, 60, 32]
    pad = gap = 24
    row_h = 256
    width = 2 * pad + sum(sizes) + gap * (len(sizes) - 1)

    master = compose(1024)
    save(master, os.path.join(out_dir, "icon-1024.png"))
    for wall, wname in (((236, 234, 230), "light"), ((22, 24, 27), "dark")):
        board = Image.new("RGB", (width, 2 * pad + row_h), wall)
        x = pad
        for s_ in sizes:
            board.paste(master.resize((s_, s_), Image.LANCZOS),
                        (x, pad + (row_h - s_) // 2), squircle(s_))
            x += s_ + gap
        p = os.path.join(out_dir, f"board-{wname}.png")
        board.save(p)
        print(f"[board] {p}")


# --- build -----------------------------------------------------------------
IOS_SIZES = [16, 20, 29, 32, 40, 50, 57, 58, 60, 64, 72, 76, 80, 87, 100, 114,
             120, 128, 144, 152, 167, 180, 192, 256, 512, 1024]
ANDROID_SIZES = [48, 72, 96, 144, 192, 512]
FAVICON_ICO = [16, 32, 48]


def cmd_build(args):
    icon = os.path.join(ROOT, "icon")
    n = 0

    for s_ in IOS_SIZES:
        save(compose(s_), os.path.join(icon, "ios", f"{s_}.png"))
        n += 1

    for s_ in ANDROID_SIZES:
        save(compose(s_), os.path.join(icon, "android", f"launchericon-{s_}x{s_}.png"))
        n += 1
    # Android/Chrome mask icons to a circle inset ~20%, so these need more air.
    for s_ in (192, 512):
        save(compose(s_, scale=MASKABLE_SCALE),
             os.path.join(icon, "android", f"maskable-{s_}x{s_}.png"))
        n += 1

    # Windows tiles: regenerate at whatever dimensions each existing file has,
    # so the set (including the non-square splash/wide tiles) stays intact.
    wdir = os.path.join(icon, "windows")
    if os.path.isdir(wdir):
        for name in sorted(os.listdir(wdir)):
            if not name.endswith(".png"):
                continue
            p = os.path.join(wdir, name)
            with Image.open(p) as ex:
                w, h = ex.size
            save(compose(w, h, scale=MARK_SCALE if w == h else 0.58), p)
            n += 1

    # Multi-resolution favicon.ico at the web root, rendered per size.
    ico = [compose(s_) for s_ in FAVICON_ICO]
    ico[-1].save(os.path.join(ROOT, "favicon.ico"), format="ICO",
                 sizes=[(s_, s_) for s_ in FAVICON_ICO],
                 append_images=ico[:-1])
    n += 1

    # Social card.
    save(compose(1200, 630, scale=0.62), os.path.join(icon, "og.png"))
    n += 1

    print(f"[build] wrote {n} files from {_cache['source']}")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--source", choices=sorted(SOURCES), default=DEFAULT_SOURCE,
                    help=f"source sheet to build from (default: {DEFAULT_SOURCE})")
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("board", help="contact sheet at real icon sizes")
    b.set_defaults(fn=cmd_board)
    bd = sub.add_parser("build", help="write every icon the sites reference")
    bd.set_defaults(fn=cmd_build)
    args = ap.parse_args()
    if not os.path.isfile(os.path.join(ROOT, args.source)):
        raise SystemExit(f"source not found: {args.source}")
    _cache["source"] = args.source
    print(f"[forge] source: {args.source} ({SOURCES[args.source]['mode']} ground)")
    args.fn(args)


if __name__ == "__main__":
    main()
