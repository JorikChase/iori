#!/usr/bin/env python3
"""study/11 step 1: why do eyes 25 and 26 lose ~1 MATCH2 in the LEGACY fitter under engine 0.9.5 (yellow edge 450 nm)?
The legacy fitter (fit.js materialFromPhoto) inverts the ENGINE's LUT (index.html buildSpectralLut: mie fixed 0.15,
48 × 32 × 8 × 8) with wL 0.6 and has only EV and a saturation gain on the camera side — no hue rotation, "hue stays with
the material". So its reach is the engine LUT's hue gamut. This rebuilds that LUT at a given edge and measures, per eye,
the nearest-colour ΔE (L weighted 0.6) of the iris pixels, the saturation gain free in 0.8–2.2 as the fitter's.
    /usr/bin/python3 iris-engine/tools/t7/engine_gamut.py [edge …]
"""
import json, os, sys
import cv2, numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import layer_proof as LP
from scipy.spatial import cKDTree
ENG = LP.ENG; lam = LP.lam; cases = json.load(open(os.path.join(ENG, 'ref', 'cases.json')))
def engine_lut(edge, rayExp=5.0, mie=0.15, X=48, Y=32, P=8, YL=8):
    ray = (550 / lam) ** rayExp; yel = 1 - 1 / (1 + np.exp(-(lam - edge) / 14))
    ix, jy, ip, iy = np.meshgrid(np.arange(X), np.arange(Y), np.arange(P), np.arange(YL), indexing='ij')
    Ma = (6 * ((ix + .5) / X) ** 2).reshape(-1, 1); Ds = (0.5 * (jy + .5) / Y).reshape(-1, 1); ph = (ip / (P - 1)).reshape(-1, 1); yl = (2.5 * iy / (YL - 1)).reshape(-1, 1)
    melS = LP.aEu + (LP.aPh - LP.aEu) * ph; sigS = np.maximum(Ds, .005) * (ray + (1 - ray) * mie); sigA = 0.7 * Ma * melS + 1e-4
    a = 1 + sigA / sigS; b = np.sqrt(np.maximum(a * a - 1, 1e-6)); x = np.minimum(b * sigS, 30); coth = np.cosh(x) / np.sinh(x)
    Rs = (1 - LP.Ripe * (a - b * coth)) / (a - LP.Ripe + b * coth); T = np.exp(-Ma * melS); rho = LP.rhoEu + (LP.rhoPh - LP.rhoEu) * ph; Ty = np.exp(-yl * yel)
    r = ((1 - T) * rho + T * T * Rs) * Ty * Ty; w = np.stack([LP.xb * LP.d65, LP.yb * LP.d65, LP.zb * LP.d65]); XYZ = r @ w.T / w.sum(1)
    return LP.lin2lab(np.maximum(XYZ @ LP.XYZ2RGB.T, 0).astype(np.float32))
def samples(ref):
    f = next(k for k in cases if k.startswith(ref + '-')); AL = cases[f]['align']
    im = cv2.imread(os.path.join(ENG, 'ref', f)); h, w = im.shape[:2]; sm = cv2.resize(im, (1200, int(round(h * 1200 / w))), interpolation=cv2.INTER_AREA)
    lab = cv2.cvtColor(sm.astype(np.float32) / 255, cv2.COLOR_BGR2Lab); H, W = lab.shape[:2]; yy, xx = np.mgrid[0:H, 0:W]; P, L = AL['pupil'], AL['limbus']
    r = np.hypot((xx / W - P[0]) * W, (yy / H - P[1]) * H) / H; px = lab[(r > P[2] * 1.15) & (r < L[2] * 0.92) & (lab[..., 0] > 22)]
    return px[np.random.RandomState(1).choice(len(px), min(6000, len(px)), replace=False)]
EDGES = [float(e) for e in sys.argv[1:]] or [500.0, 475.0, 450.0]
S = {r: samples(r) for r in ['09', '25', '26', '35']}
sw = np.array([np.sqrt(0.6), 1, 1], np.float32)
print('edge   ' + '   '.join(f'{r}: ΔE (sat, hue err °)' for r in S))
for e in EDGES:
    lab = engine_lut(e); cells = []
    for r, px in S.items():
        best = None
        for s in (0.8, 1.0, 1.3, 1.6, 2.0, 2.2):
            q = lab.copy(); q[:, 1:] *= s; d, j = cKDTree(q * sw).query(px * sw)
            if best is None or np.median(d) < best[0]:
                hp = np.degrees(np.arctan2(px[:, 2], px[:, 1])); hq = np.degrees(np.arctan2(q[j, 2], q[j, 1])); ch = np.hypot(px[:, 1], px[:, 2]) > 8
                herr = np.median(np.abs((hq - hp + 180) % 360 - 180)[ch]); best = (float(np.median(d)), s, float(herr))
        cells.append(f'{best[0]:5.2f} (×{best[1]}, {best[2]:4.1f}°)')
    print(f'{int(e)}    ' + '   '.join(cells), flush=True)
