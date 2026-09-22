#!/usr/bin/env python3
"""study/11 T7 — ref 09's blue: where should the yellow pigment's absorption edge sit?

The spectral LUT (a port of the engine's buildSpectralLut) absorbs yellow pigment with a logistic edge at 500 nm. Its
blues are then violet (a* > 0) and ref 09's cyan-blue (a* −13, b* −8) is out of reach: ΔE 10.8 under the fitter's best
grade, where no white-preserving camera matrix of plausible size recovers it (tools/t7/blue.py). This sweeps the edge
on all four eyes, the camera grade re-chosen for each as the fitter chooses it (chroma × hue grid, within 10 % of the
best ΔE, the smallest gain), and reports each eye's colour error — the edge must help 09 without costing the others.

    /usr/bin/python3 iris-engine/tools/t7/yellow_edge.py
"""
import json, os, sys
import cv2, numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import layer_proof as LP
from scipy.spatial import cKDTree

ENG = LP.ENG; cases = json.load(open(os.path.join(ENG, 'ref', 'cases.json')))
def samples(ref):
    f = next(k for k in cases if k.startswith(ref + '-')); AL = cases[f]['align']
    im = cv2.imread(os.path.join(ENG, 'ref', f)); h, w = im.shape[:2]; sm = cv2.resize(im, (1200, int(round(h * 1200 / w))), interpolation=cv2.INTER_AREA)
    lab = cv2.cvtColor(sm.astype(np.float32) / 255, cv2.COLOR_BGR2Lab); H, W = lab.shape[:2]; yy, xx = np.mgrid[0:H, 0:W]; P, L = AL['pupil'], AL['limbus']
    r = np.hypot((xx / W - P[0]) * W, (yy / H - P[1]) * H) / H
    px = lab[(r > P[2] * 1.15) & (r < L[2] * 0.92) & (lab[..., 0] > 22)]
    return px[np.random.RandomState(1).choice(len(px), min(6000, len(px)), replace=False)]
def lut(edge):
    save = LP.yel; LP.yel = 1 - 1 / (1 + np.exp(-(LP.lam - edge) / 14))
    try: return LP.build_lut()[0]
    finally: LP.yel = save
EYES = ['09', '25', '26', '35']; S = {r: samples(r) for r in EYES}
blue = {r: (S[r][:, 2] < -4) & (S[r][:, 1] < 2) for r in EYES}
print('edge  ' + '   '.join(f'{r}: grade → ΔE all (blue)' for r in EYES))
for edge in (500, 480, 470, 460, 450):
    base = np.concatenate([LP.lin2lab(lut(edge) * s) for s in LP.SCALES]); cells = []
    trees = {(g, rot): cKDTree(LP.grade(base, g, rot)) for g in (1.0, 1.2, 1.4, 1.6, 1.8, 2.0, 2.4) for rot in (-10, 0, 10, 20, 30, 40)}
    for r in EYES:
        tried = [(float(np.median(t.query(S[r])[0])), g, rot) for (g, rot), t in trees.items()]
        emin = min(x[0] for x in tried); e, g, rot = min((x for x in tried if x[0] <= 1.10 * emin + 0.05), key=lambda x: (x[1], abs(x[2])))
        d = trees[(g, rot)].query(S[r])[0]; b = float(np.median(d[blue[r]])) if blue[r].sum() > 50 else float('nan')
        cells.append(f'×{g} {rot:+3d}° → {e:4.2f} ({b:5.2f})')
    print(f'{edge}   ' + '   '.join(cells), flush=True)
