#!/usr/bin/env python3
"""Tiles for the D0 zoom viewer (viewer/index.html): per spot, per algorithm, one 512² view at every half-octave of
zoom from ×1 to ×32. The page draws the nearest level below the current zoom, scaled by ≤ √2, crossfaded into the
next. Rendered once offline (rig.py is CPU numpy; live is far too slow).
/usr/bin/python3 viewer/build.py [spot ...]  →  viewer/tiles/<spot>/<alg>-<i>.jpg + viewer/tiles/index.json"""
import os, sys, json, time, numpy as np, cv2
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.dirname(HERE))
from rig import Eye, calibrate, render, octaves

SPOTS = {'26-crypt-lip': ('26', 1185, 1965, 'eye 26 · crypt lip'), '26-sheet': ('26', 1965, 705, 'eye 26 · flat sheet'),
         '09-crypts': ('09', 2610, 1680, 'eye 09 · crypt field'), '35-strands': ('35', 1920, 600, 'eye 35 · wavy strands')}
ALGS = [('photo', 'photo, magnified'), ('today', "today's engine"), ('erosion', 'A erosion'), ('mosaic', 'B mosaic'),
        ('example', 'C by-example'), ('cascade', 'D cascade'), ('proposal', 'P proposal: soft mosaic + coherent erosion')]
ZOOMS = [round(2 ** (i / 2), 4) for i in range(11)]          # 1 … 32
N = 512

def today_tile(spot, z):
    """today's engine was captured at ×1, 2, 4, 8, 16 for the sheets, each covering a 320-view-px field (320 native px at ×1).
    A 512-px tile at z covers 512 native px / z: take the deepest capture that still covers it, crop; at ×1–×1.6 no capture
    is wide enough, so the ×1 capture sits in the middle on black."""
    have = [1, 2, 4, 8, 16]; need = N / z                               # native px this tile spans
    ok = [h for h in have if 320 / h >= need - 1e-6]
    zc = max(ok) if ok else 1
    f = os.path.join(os.path.dirname(HERE), 'today', spot, f'x{zc}.jpg')
    if not os.path.exists(f): return None
    src = cv2.resize(cv2.imread(f), (640, 640), interpolation=cv2.INTER_AREA)  # the sheet's own mapping, at 2 px per sheet px
    frac = need / (320 / zc)                                            # tile field / capture field
    if frac <= 1:
        c = 640 * frac; a = (640 - c) / 2
        return cv2.resize(src[int(round(a)):int(round(a + c)), int(round(a)):int(round(a + c))], (N, N), interpolation=cv2.INTER_AREA if c > N else cv2.INTER_CUBIC)
    out = np.zeros((N, N, 3), np.uint8); s = int(round(N / frac)); o = (N - s) // 2
    out[o:o + s, o:o + s] = cv2.resize(src, (s, s), interpolation=cv2.INTER_AREA); return out

def build(spot):
    ref, x, y, title = SPOTS[spot]; P = np.array([x, y], float)
    eye = calibrate(Eye(ref)); eye.ex_r, eye.ex_keep = 300, 400     # a 512-px ×1 view must fit the example crop
    out = os.path.join(HERE, 'tiles', spot); os.makedirs(out, exist_ok=True); cache = {}; t0 = time.time()
    for key, _ in ALGS:
        for i, z in enumerate(ZOOMS):
            if key == 'today':
                im = today_tile(spot, z)
                if im is None: continue
            else:
                rgb = render(eye, P, eye.UM / z, N, key, cache=cache)
                im = (rgb[..., ::-1] * 255 + 0.5).astype(np.uint8)
            cv2.imwrite(os.path.join(out, f'{key}-{i}.jpg'), im, [cv2.IMWRITE_JPEG_QUALITY, 86])
        print(f'{spot} {key}: {time.time() - t0:.0f} s', flush=True)
    return {'title': title, 'ref': ref, 'P': [x, y], 'um': eye.UM, 'octaves': [l for _, l in octaves(eye)]}

if __name__ == '__main__':
    if sys.argv[1:2] == ['--today']:                            # re-cut today's tiles only
        for sp in SPOTS:
            for i, z in enumerate(ZOOMS):
                im = today_tile(sp, z)
                if im is not None: cv2.imwrite(os.path.join(HERE, 'tiles', sp, f'today-{i}.jpg'), im, [cv2.IMWRITE_JPEG_QUALITY, 86])
        sys.exit()
    spots = sys.argv[1:] or list(SPOTS)
    idx_f = os.path.join(HERE, 'tiles', 'index.json')
    idx = json.load(open(idx_f)) if os.path.exists(idx_f) else {'spots': {}}
    idx.update({'N': N, 'zooms': ZOOMS, 'algs': ALGS, 'floor_um': 1.0})
    for s in spots:
        idx['spots'][s] = build(s)
        json.dump(idx, open(idx_f, 'w'), indent=1)
    print('done')
