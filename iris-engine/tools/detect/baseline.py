#!/usr/bin/env python3
"""study/11 §5.6 P2 — TODAY's detector on the phantom, scored by the ruler: the baseline the new 2-D detector must beat.

The fitter's own tracers (tools/layer_proof.py §2), called with its own parameters on a tile's linear luminance: deck fibres
in the crypts (local contrast, σ 2 · 3 · 4.5 px, hysteresis per hole at the 20th / 5th percentile, extended to the walls),
the dark veins between them, the plateau's guides (σ 4 · 6 · 9 px on a blurred image), its fine fibres and veins (σ 2 · 3,
kept when "tissue-like": long, straight, radial). The crypt mask is the phantom's own — hole detection is not what is
measured here, strand detection is. Widths: the tracer's w = 2 × its best scale, reported as FWHM = 1.18 w (the convention
of study/11 §5.2.3) — the ruler's width ratio says whether that convention holds.
usage: /usr/bin/python3 baseline.py 26 → study/detect/baseline-26.json and overlays study/detect/baseline-26/*.png
"""
import os, sys, json, glob
import numpy as np
import cv2
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
from layer_proof import centrelines, extend_to_walls
from ruler import with_chance, public, overlay

ENG = os.path.normpath(os.path.join(HERE, '..', '..')); OUT = os.path.join(ENG, 'study', 'detect')

def today(pY, crypt, UM):
    """layer_proof.py §2 on one tile → curves {xy (x, y px), fwhm_um, cls}"""
    pY = pY.astype(np.float32); H, W = pY.shape; G = lambda img, s: cv2.GaussianBlur(img, (0, 0), s)
    holes = crypt.astype(np.uint8)
    sd = cv2.distanceTransform(holes, cv2.DIST_L2, 5) - cv2.distanceTransform(1 - holes, cv2.DIST_L2, 5)
    near = np.ones((H, W), bool); near[:6] = near[-6:] = False; near[:, :6] = near[:, -6:] = False
    out = []
    def emit(paths, S, cls, k=1.18):
        for p in paths:
            p = np.asarray(p, float); r, c = np.clip(p[:, 0].astype(int), 0, H - 1), np.clip(p[:, 1].astype(int), 0, W - 1)
            out.append({'xy': np.stack([p[:, 1], p[:, 0]], 1).tolist(), 'fwhm_um': (k * 2.0 * S[r, c] * UM).tolist(), 'cls': cls, 'id': len(out)})
    Ln = (G(pY, 1.5) / np.maximum(G(pY, 14), 0.004)).astype(np.float32)
    if holes.any():
        _, hole_lab = cv2.connectedComponents((sd > 1).astype(np.uint8), connectivity=8)
        rx = {}; fpaths, fS = centrelines(Ln, sd > 1, [2.0, 3.0, 4.5], 6, hole_lab, out=rx, pct=(20, 5))
        fpaths = extend_to_walls(fpaths, sd, ridge=rx); emit(fpaths, fS, 'deck')
        vpaths, vS = centrelines(-Ln, sd > 0, [1.5, 2.5], 6, hole_lab); emit(vpaths, vS, 'valley')
    Lf = G(pY, 1.0)
    gpaths, gS = centrelines(G(Lf, 2.0), (sd < -6) & near, [4.0, 6.0, 9.0], 14); emit(gpaths, gS, 'plateau')
    Ls = (G(pY, 2.2) / np.maximum(G(pY, 14), 0.004)).astype(np.float32)
    ctr = np.array([W / 2, H * 60.0])                                            # the pupil far below: the tile's flow (up) is radial
    def tissue_like(path):
        q = path[:, ::-1].astype(np.float64); L_ = np.hypot(*np.diff(q, axis=0).T).sum(); chord = q[-1] - q[0]; c = np.hypot(*chord)
        if L_ < 26 or c / max(L_, 1e-6) < 0.8: return False
        rad = q.mean(0) - ctr; cosang = abs(chord @ rad) / max(c * np.hypot(*rad), 1e-6)
        return cosang > np.cos(np.radians(40)) or L_ > 64
    sfp, sfS = centrelines(Ls, (sd < -4) & near, [2.0, 3.0], 12); svp, svS = centrelines(-Ls, (sd < -4) & near, [2.0, 3.0], 12)
    emit([q for q in sfp if tissue_like(q)], sfS, 'fine'); emit([q for q in svp if tissue_like(q)], svS, 'valley')
    return out

def run(ref, detector=today, tag='baseline'):
    tiles = sorted(glob.glob(os.path.join(OUT, f'phantom-{ref}', '*.json'))); rows = []; os.makedirs(os.path.join(OUT, f'{tag}-{ref}'), exist_ok=True)
    for f in tiles:
        gt = json.load(open(f)); base = f[:-5]; img = np.load(base + '.npy'); crypt = cv2.imread(base + '-crypt.png', 0) > 127
        det = detector(img, crypt, gt['UM']); r = with_chance(gt, det)
        overlay(base + '.png', r, os.path.join(OUT, f'{tag}-{ref}', os.path.basename(base) + '.png'))
        rows.append(public(r)); print(gt['name'], 'recall', r['recall'], 'chance', r['recall_chance'], 'precision', r['precision'], 'fp/mm²', r['fp_mm_per_mm2'], 'whole', r['continuity']['whole'], 'crossings', r['crossings'])
    json.dump(rows, open(os.path.join(OUT, f'{tag}-{ref}.json'), 'w'), indent=1)
    return rows

def summary(rows):
    """per scenario: mean recall / precision / fp density / whole / crossing survival; per class: recall and width ratio"""
    from collections import defaultdict
    S = defaultdict(lambda: defaultdict(list)); C = defaultdict(lambda: defaultdict(list))
    for r in rows:
        sc = r['tile'].rsplit('-', 1)[0]
        for k in ('recall', 'recall_chance', 'precision', 'precision_chance', 'fp_mm_per_mm2'):
            if r[k] is not None: S[sc][k].append(r[k])
        if r['continuity']['strands']: S[sc]['whole'].append(r['continuity']['whole'])
        for role in ('over', 'under'):
            v, n = r['crossings'][role]
            if n: S[sc]['cross_' + role].append(v)
        for cls, v in r['classes'].items():
            C[cls]['recall'].append(v['recall'])
            if v.get('recall_chance') is not None: C[cls]['recall_chance'].append(v['recall_chance'])
            if v['width_ratio']: C[cls]['width_ratio'].append(v['width_ratio'])
    f = lambda v: round(float(np.mean(v)), 3) if v else None
    return {'scenarios': {sc: {k: f(v) for k, v in d.items()} for sc, d in S.items()}, 'classes': {c: {k: f(v) for k, v in d.items()} for c, d in C.items()},
            'ladder': ladder(rows, 'ladder'), 'ladder_chance': ladder(rows, 'ladder_chance')}

def ladder(rows, key):
    cells = {}
    for r in rows:
        for k, v in (r.get(key) or {}).items(): cells.setdefault(k, []).append(v)
    return {k: round(float(np.mean(v)), 2) for k, v in cells.items()} or None

if __name__ == '__main__':
    ref = sys.argv[1] if len(sys.argv) > 1 else '26'
    rows = run(ref); s = summary(rows); json.dump(s, open(os.path.join(OUT, f'baseline-{ref}-summary.json'), 'w'), indent=1); print(json.dumps(s, indent=1))
