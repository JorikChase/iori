#!/usr/bin/env python3
"""Growth order (study/17 §4.2): detail grows over the coarse picture from the view centre (the raycast point).
Arrival time T(x) = anisotropic distance from the centre — along the strand tangent ×1, across it ×ACROSS — plus a
crossing cost into crypts, plus a jitter quantised to cell size so the sheet prints cell by cell. Each octave k is born
at T + k·STAGGER (never finer before coarser) and fades in over FADE. The view = base × exp(Σ D_k · s_k(t)).
The metric is frozen per pixel (not a true geodesic); a fast-marching front is the engine version.
python3 grow.py 26 crypt-lip 1185 1965 8 [cascade]  →  growth/26-crypt-lip-x8.gif + strip"""
import os, sys, numpy as np, cv2
from PIL import Image
from rig import Eye, calibrate, alg_erosion, alg_mosaic, lin2srgb, fade, octaves, hash3

HERE = os.path.dirname(os.path.abspath(__file__))
ACROSS, CRYPT_COST, FADE, STAGGER = 3.5, 0.6, 0.18, 0.12   # FADE / STAGGER in units of the full growth time

def run(ref, name, P, zoom, alg='cascade', N=384, frames=40):
    eye = calibrate(Eye(ref)); s = eye.UM / zoom
    X, Y = eye.grid(P, s, N)
    base = eye.at(eye.base, X, Y, cv2.INTER_CUBIC)
    _, oA = alg_erosion(eye, X, Y, s, ret_oct=True); _, oB = alg_mosaic(eye, X, Y, s, ret_oct=True)
    coh = eye.at(eye.coh, X, Y); cr = eye.at(eye.crypt, X, Y); gm = np.hypot(eye.at(eye.gx, X, Y), eye.at(eye.gy, X, Y))
    wdir = np.clip(np.maximum(cr, np.clip(gm * 2, 0, 1)) * 0.85 + coh * 0.5, 0, 1)
    if alg == 'erosion': wdir = np.ones_like(wdir)
    if alg == 'mosaic': wdir = np.zeros_like(wdir)
    octs = [None if a is None else wdir * a + (1 - wdir) * b for a, b in zip(oA, oB)]
    octs = [o if o is not None else np.zeros_like(X, dtype=np.float64) for o in octs]
    # arrival time
    tx, ty = eye.at(eye.tx, X, Y), eye.at(eye.ty, X, Y)
    dx, dy = (X - P[0]) * eye.UM, (Y - P[1]) * eye.UM
    along = dx * tx + dy * ty; across = -dx * ty + dy * tx
    T = np.sqrt(along ** 2 + (ACROSS * across) ** 2) + CRYPT_COST * cr * N * s / 2
    cell = 12.0                                                    # µm: jitter per cell so the sheet prints cell by cell
    jit = hash3(np.floor(X * eye.UM / cell).astype(np.int64), np.floor(Y * eye.UM / cell).astype(np.int64), 0, 11)
    T = T / np.percentile(T, 99) * (1 - FADE - STAGGER * len(octs)) + 0.10 * jit * (1 - wdir)
    out = []
    for f in range(frames):
        t = f / (frames - 1) * 1.08
        D = np.zeros_like(X, dtype=np.float64)
        for k, o in enumerate(octs):
            u = np.clip((t - T - k * STAGGER) / FADE, 0, 1); D += o * u * u * (3 - 2 * u)
        rgb = lin2srgb(np.clip(base * np.exp(D)[..., None], 0, 1))
        out.append((rgb * 255 + 0.5).astype(np.uint8))
    os.makedirs(os.path.join(HERE, 'growth'), exist_ok=True)
    stem = os.path.join(HERE, 'growth', f'{ref}-{name}-x{zoom}-{alg}')
    ims = [Image.fromarray(o) for o in out] + [Image.fromarray(out[-1])] * 8
    ims[0].save(stem + '.gif', save_all=True, append_images=ims[1:], duration=70, loop=0)
    pick = [0, 6, 12, 18, 26, frames - 1]
    strip = np.concatenate([np.pad(out[i][..., ::-1], ((0, 0), (0, 4), (0, 0))) for i in pick], 1)
    cv2.imwrite(stem + '-strip.jpg', strip, [cv2.IMWRITE_JPEG_QUALITY, 90])
    return stem

if __name__ == '__main__':
    a = sys.argv
    print(run(a[1], a[2], np.array([float(a[3]), float(a[4])]), int(a[5]), a[6] if len(a) > 6 else 'cascade'))
