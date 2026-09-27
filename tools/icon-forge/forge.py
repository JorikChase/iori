#!/usr/bin/env python3
"""3DIE / IORI icon forge — builds every site icon from the painted sheets.

TWO SHEETS, TWO JOBS (split 2026-09-27).

  APP_SHEET  logo_2026.png — the painted full-bleed sheet with the 3die
             signature. Home-screen / installed-app icon only: apple-touch-icon,
             the manifest icons, the Windows tiles, /apple-touch-icon.png.
  MARK_SHEET logo_dark.png — the simple triangle mark. Everything that reads at
             tab size or stands in for the site in text: /favicon.ico,
             icon/favicon/*, icon/og.png. iris-engine, petri and every other
             page show this one in the browser tab.

Both are used FULL BLEED — cropping or rescaling only throws away composition.

iOS 26 does not apply Liquid Glass to web-clip icons; only native .icon bundles
built in Icon Composer get the system material. So what ships is the artwork
itself, not a synthetic effect.

The Android maskable icon is the one variant that may differ, because its safe
zone is a circle of 80% diameter — see MASKABLE_FILL.

Everything resamples in linear light and converts to sRGB (the triangle sheets
are Display P3), which the icons shipping before this carried no profile at all.

NOTE: these files are replaced in place at fixed URLs. They must never be served
`immutable` — see the @icons rule in server_setup.sh, and bump ICON_VERSION in
site.py whenever the artwork changes so clients holding an old copy refetch.

Run:  uv run --with pillow,numpy tools/icon-forge/forge.py board
      uv run --with pillow,numpy tools/icon-forge/forge.py build
      ... --app LOGO.PNG --mark LOGO.PNG build
"""


import argparse
import io
import os

import numpy as np
from PIL import Image, ImageCms
Image.MAX_IMAGE_PIXELS = None

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))

SOURCES = ["logo_2026.png", "logo_dark.png", "LOGO.PNG"]
APP_SHEET = "logo_2026.png"     # installed-app / home-screen icon
MARK_SHEET = "logo_dark.png"    # browser tab, and the site's stand-in in text

# Android masks to a circle of 80% diameter, so how much of the sheet may fill
# the icon depends on how far the sheet's content reaches.
#   logo_dark / LOGO  are an isolated triangle mark whose outermost pixel sits at
#     radius 1.190 in artwork units, past the inscribed circle: fill <= 0.8/1.190
#     = 0.672, so the tips survive the crop.
#   logo_2026 is a full-bleed painting with no isolated mark. Everything that
#     carries it — the green wedge, the 3die signature, the red and the yellow —
#     sits inside the circle already, so it fills the icon and lets the crop eat
#     the outer paint, which is what full-bleed artwork is for. Insetting it
#     instead turns two thirds of the icon into flat ground tone.
MASKABLE_FILL = {"logo_2026.png": 1.0}
MASKABLE_FILL_DEFAULT = 0.65
# Width of the fade from sheet into pad, as a fraction of the sheet's side.
PAD_FEATHER = 0.09

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


# --- source ----------------------------------------------------------------
_cache = {}


def load_source(name):
    """The named sheet as linear-light RGB in sRGB primaries."""
    key = ("src", name)
    if key in _cache:
        return _cache[key]
    im = Image.open(os.path.join(ROOT, name))
    icc = im.info.get("icc_profile")
    im = im.convert("RGB")
    if icc:
        # Display P3 -> sRGB. Without this the greens and the red shift.
        src = ImageCms.ImageCmsProfile(io.BytesIO(icc))
        im = ImageCms.profileToProfile(im, src, _SRGB, outputMode="RGB")
    a = np.asarray(im, dtype=np.float32) / 255.0
    _cache[key] = to_linear(a)
    return _cache[key]


# --- composition -----------------------------------------------------------
def ground_tone(name):
    """The sheet's background colour: the median of its least-saturated half,
    which on every sheet is the untouched ground."""
    key = ("tone", name)
    if key in _cache:
        return _cache[key]
    small = resize_linear(load_source(name), (256, 256)).reshape(-1, 3)
    sat = small.max(-1) - small.min(-1)
    ground = small[sat <= np.median(sat)]
    _cache[key] = np.median(ground, axis=0).astype(np.float32)
    return _cache[key]


def compose(name, w, h=None, fill=1.0):
    """The named sheet at w x h. Square targets at fill=1.0 are the artwork itself,
    resampled and nothing else — no crop, no reframing. Anything smaller or
    non-square centres the full sheet on the sheet's own ground tone."""
    h = h or w
    ss = max(2, int(np.ceil(640.0 / max(w, h))))
    W, H = w * ss, h * ss

    side = int(round(min(W, H) * fill))
    img = resize_linear(load_source(name), (side, side))

    if (side, side) != (W, H):
        # Pad with the sheet's own ground tone. Mirroring the edges instead
        # duplicates the mark, because the artwork runs right to its borders —
        # at fill 0.65 that band is a third of the icon and turns it into a
        # kaleidoscope.
        # Feathered, because the pad is flat and the sheet is not: matched to
        # within 1.2 sRGB levels the boundary is still obvious as texture
        # meeting smoothness, and it lands inside Android's visible circle.
        top, left = (H - side) // 2, (W - side) // 2
        canvas = np.empty((H, W, 3), dtype=np.float32)
        canvas[:] = ground_tone(name)
        f = max(int(side * PAD_FEATHER), 1)
        r = np.arange(side, dtype=np.float32)
        ramp = np.clip(np.minimum(r, side - 1 - r) / f, 0.0, 1.0)
        a = np.minimum(ramp[:, None], ramp[None, :])[..., None]
        a = a * a * (3.0 - 2.0 * a)
        region = canvas[top:top + side, left:left + side]
        canvas[top:top + side, left:left + side] = region * (1.0 - a) + img * a
        img = canvas

    out = Image.fromarray(
        (np.clip(to_srgb(img), 0, 1) * 255.0 + 0.5).astype(np.uint8), "RGB")
    return out.resize((w, h), Image.LANCZOS)


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

    master = compose(args.app, 1024)
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
# The full iOS ladder. 120/152/167/180 are the ones any page actually links as
# apple-touch-icon; the rest keep the set complete for anything that asks.
IOS_SIZES = [16, 20, 29, 32, 40, 50, 57, 58, 60, 64, 72, 76, 80, 87, 100, 114,
             120, 128, 144, 152, 167, 180, 192, 256, 512, 1024]
ANDROID_SIZES = [48, 72, 96, 144, 192, 512]
FAVICON_ICO = [16, 32, 48]
# Browser-tab icons, built from the mark sheet and linked by every page's
# rel="icon". Kept in their own folder so the split stays obvious: nothing under
# icon/ios or icon/android is ever a tab icon.
FAVICON_PNG = [16, 32, 48]
DASH_APP_SIZES = [180, 192, 512]
DASH_MARK_SIZES = [16, 32]


def cmd_build(args):
    app, mark = args.app, args.mark
    icon = os.path.join(ROOT, "icon")
    n = 0

    # ---- installed-app icon: the painted sheet ---------------------------
    for s_ in IOS_SIZES:
        save(compose(app, s_), os.path.join(icon, "ios", f"{s_}.png"))
        n += 1

    for s_ in ANDROID_SIZES:
        save(compose(app, s_),
             os.path.join(icon, "android", f"launchericon-{s_}x{s_}.png"))
        n += 1
    # Android/Chrome mask icons to a circle inset ~20%; MASKABLE_FILL says how
    # much of this sheet may fill the frame.
    mfill = MASKABLE_FILL.get(app, MASKABLE_FILL_DEFAULT)
    for s_ in (192, 512):
        save(compose(app, s_, fill=mfill),
             os.path.join(icon, "android", f"maskable-{s_}x{s_}.png"))
        n += 1

    # iOS probes these two at the web root whenever the link tags do not give it
    # what it wants. Without them it falls back to scaling the 32px favicon onto
    # a white plate, which is what an iPad did on 2026-09-27.
    for name in ("apple-touch-icon.png", "apple-touch-icon-precomposed.png"):
        save(compose(app, 180), os.path.join(ROOT, name))
        n += 1

    # Windows tiles: regenerate at whatever dimensions each existing file has,
    # so the set (including the non-square splash/wide tiles) stays intact.
    wdir = os.path.join(icon, "windows")
    if os.path.isdir(wdir):
        for name in sorted(os.listdir(wdir)):
            if not name.endswith(".png"):
                continue
            fp = os.path.join(wdir, name)
            with Image.open(fp) as ex:
                w, h = ex.size
            save(compose(app, w, h), fp)
            n += 1

    # ---- tab icon and text stand-in: the mark sheet ----------------------
    for s_ in FAVICON_PNG:
        save(compose(mark, s_), os.path.join(icon, "favicon", f"{s_}.png"))
        n += 1

    ico = [compose(mark, s_) for s_ in FAVICON_ICO]
    ico[-1].save(os.path.join(ROOT, "favicon.ico"), format="ICO",
                 sizes=[(s_, s_) for s_ in FAVICON_ICO],
                 append_images=ico[:-1])
    n += 1

    # Social card — a link preview is text context, not an installed app.
    save(compose(mark, 1200, 630), os.path.join(icon, "og.png"))
    n += 1

    # ---- dash/ rsyncs to its own webroot, so it carries its own copies ----
    dash = os.path.join(ROOT, "dash")
    if os.path.isdir(dash):
        for s_ in DASH_APP_SIZES:
            save(compose(app, s_), os.path.join(dash, "icon", f"{s_}.png"))
            n += 1
        save(compose(app, 512, fill=mfill),
             os.path.join(dash, "icon", "maskable-512.png"))
        n += 1
        for s_ in DASH_MARK_SIZES:
            save(compose(mark, s_), os.path.join(dash, "icon", f"{s_}.png"))
            n += 1
        dico = [compose(mark, s_) for s_ in FAVICON_ICO]
        dico[-1].save(os.path.join(dash, "favicon.ico"), format="ICO",
                      sizes=[(s_, s_) for s_ in FAVICON_ICO],
                      append_images=dico[:-1])
        n += 1

    print(f"[build] wrote {n} files — app icon from {app}, tab icon from {mark}")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--app", choices=sorted(SOURCES), default=APP_SHEET,
                    help=f"sheet for the installed-app icon (default: {APP_SHEET})")
    ap.add_argument("--mark", choices=sorted(SOURCES), default=MARK_SHEET,
                    help=f"sheet for the browser tab icon (default: {MARK_SHEET})")
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("board", help="contact sheet at real icon sizes")
    b.set_defaults(fn=cmd_board)
    bd = sub.add_parser("build", help="write every icon the sites reference")
    bd.set_defaults(fn=cmd_build)
    args = ap.parse_args()
    for name in (args.app, args.mark):
        if not os.path.isfile(os.path.join(ROOT, name)):
            raise SystemExit(f"source not found: {name}")
    print(f"[forge] app: {args.app}   mark: {args.mark}   (both full bleed)")
    args.fn(args)


if __name__ == "__main__":
    main()
