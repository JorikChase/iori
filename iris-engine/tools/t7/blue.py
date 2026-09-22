#!/usr/bin/env python3
"""study/11 T7: why ref 09's blue lands grey-green. Measures, on the photograph's own iris pixels:
  · how blue the engine's spectral LUT can go at all (min b* per lightness band, before any grade),
  · the blue pixels' ΔE to the nearest LUT colour under the fitter's chosen grade and under a wider grid
    (negative hue rotations too), and what the rest of the iris costs under each.
    /usr/bin/python3 iris-engine/tools/t7/blue.py [NN]
"""
import json, os, sys
import cv2, numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import layer_proof as LP
from scipy.spatial import cKDTree

ENG = LP.ENG; REF = sys.argv[1] if len(sys.argv) > 1 else '09'
cases = json.load(open(os.path.join(ENG, 'ref', 'cases.json'))); FILE = next(f for f in cases if f.startswith(REF + '-')); AL = cases[FILE]['align']
im = cv2.imread(os.path.join(ENG, 'ref', FILE)); h, w = im.shape[:2]; sc = 1600 / w
small = cv2.resize(im, (1600, int(round(h * sc))), interpolation=cv2.INTER_AREA)
lab = cv2.cvtColor(small.astype(np.float32) / 255, cv2.COLOR_BGR2Lab); H, W = lab.shape[:2]
yy, xx = np.mgrid[0:H, 0:W]; P, L = AL['pupil'], AL['limbus']
r = np.hypot((xx / W - P[0]) * W, (yy / H - P[1]) * H) / H
iris = (r > P[2] * 1.15) & (r < L[2] * 0.92) & (lab[..., 0] > 22)             # tissue, not pupil, not the limbal fade
px = lab[iris][::7]
blue = px[(px[:, 2] < -4) & (px[:, 1] < 2)]; rest = px[~((px[:, 2] < -4) & (px[:, 1] < 2))]
print(f'ref {FILE}: {len(px)} iris samples · blue (b* < −4, a* < 2): {100 * len(blue) / len(px):.1f} % · '
      f'blue median Lab {np.round(np.median(blue, 0), 1).tolist() if len(blue) else "—"}')

LUT, PRM = LP.build_lut(); base = np.concatenate([LP.lin2lab(LUT * s) for s in LP.SCALES])
for lo, hi in ((30, 45), (45, 60), (60, 75)):
    m = (base[:, 0] >= lo) & (base[:, 0] < hi)
    j = np.argmin(base[m, 2]); print(f'  LUT reach, L* {lo}–{hi}: most blue b* {base[m][j, 2]:.1f} (a* {base[m][j, 1]:.1f})')

def cost(g, rot):
    t = cKDTree(LP.grade(base, g, rot)); db = t.query(blue)[0] if len(blue) else np.zeros(1); dr = t.query(rest[::3])[0]
    return float(np.median(db)), float(np.median(dr))
print('  grade            blue ΔE (median)   rest ΔE (median)')
rows = []
for g in (1.0, 1.4, 1.6, 2.0, 2.4):
    for rot in (-40, -20, -10, 0, 10, 20, 30, 40):
        b_, r_ = cost(g, rot); rows.append((g, rot, b_, r_))
for g, rot, b_, r_ in sorted(rows, key=lambda t: t[2] + t[3])[:8]:
    print(f'  ×{g:<4} {rot:+4d}°       {b_:6.2f}             {r_:6.2f}')
b_, r_ = cost(1.6, 30); print(f'  the fitter chose ×1.6 +30°:  blue {b_:.2f} · rest {r_:.2f}')

# ---- the proposal: the camera grade as a 3×3 matrix in linear RGB (a real camera's colour matrix), fitted by
# alternating nearest-LUT assignment and weighted least squares; blue and the rest weighted equally
def lab_lin(x): return LP.lab2lin(np.asarray(x, np.float32))
tb, tr = lab_lin(blue), lab_lin(rest[::3]); T_all = np.concatenate([tb, tr]); Lt = np.concatenate([blue, rest[::3]])
wts = np.concatenate([np.full(len(tb), 0.5 / max(1, len(tb))), np.full(len(tr), 0.5 / len(tr))])
lin_base = np.concatenate([LUT * s for s in LP.SCALES])
def matrix_cost(M):
    cl = LP.lin2lab(np.clip(lin_base @ M.T, 0, 1)); t = cKDTree(cl); d, j = t.query(Lt)
    return d, j
# start from the chosen rotation grade, expressed as the matrix that best reproduces it on the LUT
g0 = LP.lab2lin(LP.grade(LP.lin2lab(lin_base[::17]), 1.6, 30)); M = np.linalg.lstsq(lin_base[::17], g0, rcond=None)[0].T
for it in range(12):
    d, j = matrix_cost(M); src = lin_base[j]
    Wr = np.sqrt(wts)[:, None]; M = np.linalg.lstsq(src * Wr, T_all * Wr, rcond=None)[0].T
d, _ = matrix_cost(M)
print(f'  3×3 matrix grade:  blue {np.median(d[:len(tb)]):.2f} · rest {np.median(d[len(tb):]):.2f}   M = {np.round(M, 3).tolist()}')

# ---- constrained: white-preserving (every row sums to 1, so grey stays grey) and pulled toward the identity by lam.
# Solved per row: minimise Σ w (m·c − t)² + lam ‖m − e‖²  subject to Σm = 1  (a KKT system of 4 unknowns).
def solve_row(C, t, w, e, lam):
    A = (C * w[:, None]).T @ C + lam * np.eye(3); b = (C * w[:, None]).T @ t + lam * e
    K = np.zeros((4, 4)); K[:3, :3] = A; K[:3, 3] = 1; K[3, :3] = 1
    return np.linalg.solve(K, np.r_[b, 1.0])[:3]
print('  white-preserving matrix, pulled to identity by λ:')
for lam in (1e-1, 1e-2, 3e-3, 1e-3, 1e-4):
    M = np.eye(3)
    for it in range(12):
        d, j = matrix_cost(M); C = lin_base[j]
        M = np.stack([solve_row(C, T_all[:, k], wts, np.eye(3)[k], lam) for k in range(3)])
    d, _ = matrix_cost(M); off = np.abs(M - np.eye(3)).max()
    print(f'    λ {lam:<7} blue {np.median(d[:len(tb)]):5.2f} · rest {np.median(d[len(tb):]):5.2f} · largest off-identity {off:.2f} · M {np.round(M, 2).tolist()}')
