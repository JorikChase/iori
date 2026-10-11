#!/usr/bin/env python3
"""K2.1 (study/16): write the MATERIALS into an eye file — beside the colours for now (K2.2 makes the bake read them, and
drops the colours at its gate).

Per colour-bearing sample: `mat` = five u8 indices into the fitter's LUT grid (Ma 24 · Ds 16 · pheo 5 · yellow 8 · mie 7,
tools/layer_proof.py build_lut) and `lum` = the luminance scale, so that rgb = grade(LUT[mat] × lum). Fibres, guides and
beads get per-point `mat` / `lum`; the cells get matS / lumS (sheet) and matG / lumG (ground); the rim gets rimMat / rimLum;
`materialChannels` records the grid, the LUT's constants and the formula. The beads were measured Lab, not materials — they
are fitted to the nearest material here (decided 2026-10-11).

  /usr/bin/python3 tools/materials/publish.py 26 [09 25 35]     → data/NN.iris rewritten; a regeneration check per class
"""
import sys, os, json
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); ENG = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(ENG, 'tools')); sys.path.insert(0, os.path.join(ENG, 'tools', 'eyefile'))
import layer_proof as LP
from recover import invert_chroma, candidates
from read import read, parse
from pack import build

SHAPE = (24, 16, 5, 8, 7)
_CLOUD = {}
def grid():
    mies = (0, .08, .2, .35, .5, .7, 1.0)
    return {'order': ['Ma', 'Ds', 'pheo', 'yellow', 'mie'], 'shape': list(SHAPE),
            'Ma': [round(6 * ((i + .5) / 24) ** 2, 6) for i in range(24)], 'Ds': [round(0.5 * (j + .5) / 16, 6) for j in range(16)],
            'pheo': [round(x, 6) for x in np.linspace(0, 1, 5)], 'yellow': [round(x, 6) for x in np.linspace(0, 2.5, 8)], 'mie': list(mies),
            'lut': {'rayExp': 5.0, 'yellowEdgeNm': LP.YELLOW_EDGE_NM, 'source': 'tools/layer_proof.py build_lut (the fitter\'s port of the engine\'s buildSpectralLut, + the mie axis)'},
            'formula': 'rgb (linear sRGB, photo space) = grade(clip01(LUT[mat] * lum), frame.grade.chroma, frame.grade.hue); guides: that colour divided by its own luminance (a chromaticity at unit luminance, as the fitter exported it)'}

def publish(ref):
    path = os.path.join(ENG, 'data', f'{ref}.iris'); buf = open(path, 'rb').read(); head, _ = parse(buf); t, c, cal = read(buf)
    G, ROT = float(t['grade']['chroma']), float(t['grade'].get('hue', 0))   # the grade's hue is in DEGREES (layer_proof.grade: np.radians(rot))
    LUT, P = LP.build_lut()
    def graded(lin): return LP.lab2lin(LP.grade(LP.lin2lab(np.clip(lin, 1e-5, None).astype(np.float32)), G, ROT))
    def srgb8(lin): v = np.clip(lin, 0, 1); return np.round(255 * np.where(v <= 0.0031308, 12.92 * v, 1.055 * np.power(v, 1 / 2.4) - 0.055))
    def fit(rgb, unit=False):
        """material = the nearest LUT chromaticity (ungraded, matched in Lab at one luminance); scale = the luminance ratio,
        corrected once for the grade's own luminance change. The fitter's colours went through OpenCV's float Lab conversions,
        precise to ≈ 1e-3 and not smooth (measured on synthetic colours: the TRUE material reproduces its colour to 1e-4 in
        only half the cases), so a material is defined to that precision and the gate is the renderer's: the regenerated
        colour within one 8-bit sRGB step of the shipped one. Guides: a chromaticity at unit luminance (layer_proof.py:711)."""
        rgb = np.asarray(rgb, np.float32).reshape(-1, 3)
        idx, sc, dE = invert_chroma(np.maximum(rgb, 1e-5), LUT, G, ROT)
        base = LUT[idx]; Yb = np.maximum(base @ LP.LUMA, 1e-9); Yt = np.maximum(rgb @ LP.LUMA, 0)
        Yt = Yt.astype(np.float32)
        if unit:
            # guides (layer_proof.py:711): graded(chromaticity × yl) normalised to unit luminance, yl = the photo's luminance at the
            # point — a different clip and grade per sample, so the material is matched DIRECTLY in that space: a KD-tree over
            # every material at 24 luminances (the table is dense: 87 k distinct chromaticities, and ungraded nearest-chroma
            # picks the wrong neighbour). The colour is judged at the bake's own brightness (×0.25, tissue.js `chroma`)
            from scipy.spatial import cKDTree
            ck = ('guideCloud', G, ROT)
            if ck not in _CLOUD:
                Yl = np.maximum(LUT @ LP.LUMA, 1e-9); chrom = LUT / Yl[:, None]; S = np.exp(np.linspace(np.log(0.004), np.log(1.0), 24)).astype(np.float32); pts = []
                for s_ in S:
                    g = graded(chrom * s_); pts.append(g / np.maximum(g @ LP.LUMA, 1e-9)[:, None])
                _CLOUD.clear(); _CLOUD[ck] = (cKDTree(np.concatenate(pts)), S, Yl)   # per grade: one eye's cloud must not serve the next
            tree, S, Yl_ = _CLOUD[ck]; n = len(LUT)
            _, j = tree.query(rgb, k=1, workers=-1); idx = j % n; yl = S[j // n]
            base = LUT[idx]; Yb = np.maximum(base @ LP.LUMA, 1e-9); sc = (yl / Yb).astype(np.float32)
        else:
            sc = (Yt / Yb).astype(np.float32)
            g = graded(base * sc[:, None]); Yg = np.maximum(g @ LP.LUMA, 1e-9); corr = np.clip(Yt / Yg, 0.5, 2.0); sc = np.where(Yt > 1e-4, sc * corr, sc).astype(np.float32)   # the grade is not exactly luminance-preserving (0.985–1.022); near-black cells keep the plain ratio
        sc5 = np.round(sc.astype(np.float64), 5)
        g = graded(base * sc5[:, None].astype(np.float32)); g = g / np.maximum(g @ LP.LUMA, 1e-9)[:, None] if unit else g
        err = np.abs(g - rgb).max(1); k8 = 0.25 if unit else 1.0; err8 = np.abs(srgb8(k8 * g) - srgb8(k8 * rgb)).max(1)
        mats = np.stack(np.unravel_index(idx, SHAPE), 1).astype(int)
        return mats, sc5, err, err8, dE
    rep = {}
    def note(name, err, err8, dE): rep[name] = {'n': int(len(err)), 'within1step': float((err8 <= 1).mean()), 'within2steps': float((err8 <= 2).mean()), 'max8': float(err8.max()), 'maxErr': float(err.max()), 'dE_p95': float(np.percentile(dE, 95))}
    for setname in ('fibres', 'guides', 'beads'):
        pts = [p for cv in t[setname] for p in cv['rgb']]; mats, lum, err, err8, dE = fit(pts, unit=(setname == 'guides')); note(setname, err, err8, dE); k = 0
        for cv in t[setname]:
            n = len(cv['rgb']); cv['mat'] = mats[k:k + n].tolist(); cv['lum'] = lum[k:k + n].tolist(); k += n
    cells = t['cells']
    mats, lum, err, err8, dE = fit(cells['sheet']); note('cells.sheet', err, err8, dE); cells['matS'] = mats.tolist(); cells['lumS'] = lum.tolist()
    mats, lum, err, err8, dE = fit(cells['ground']); note('cells.ground', err, err8, dE); cells['matG'] = mats.tolist(); cells['lumG'] = lum.tolist()
    mats, lum, err, err8, dE = fit([t['rimRGB']]); note('rim', err, err8, dE); t['rimMat'] = mats[0].tolist(); t['rimLum'] = float(lum[0])
    t['materialChannels'] = grid()
    if '--drop-rgb' in sys.argv:                      # K2.2's gate passed: the colours are derived, the file carries materials only
        for setname in ('fibres', 'guides', 'beads'):
            for cv in t[setname]: cv.pop('rgb', None)
        cells.pop('sheet', None); cells.pop('ground', None); t.pop('rimRGB', None)
        t['materialChannels']['rgbDropped'] = True
    out = build(ref, t, c, cal, head_over={'engine': head.get('engine'), 'scores': head.get('scores'), 'modified': head.get('modified'),
                                           'provenance': dict(head.get('provenance', {}), materials='measured (LUT materials recovered from the fitted colours, K2.1)')})
    t2, c2, cal2 = read(out)
    def same(a, b):                                       # numeric equality (1 and 1.0 are one number in the page)
        if isinstance(a, bool) or isinstance(b, bool): return a == b
        if isinstance(a, (int, float, np.integer, np.floating)) and isinstance(b, (int, float, np.integer, np.floating)): return float(a) == float(b)
        if isinstance(a, dict): return isinstance(b, dict) and set(a) == set(b) and all(same(a[k], b[k]) for k in a)
        if isinstance(a, list): return isinstance(b, list) and len(a) == len(b) and all(same(x, y) for x, y in zip(a, b))
        return a == b
    bad = [k for k in t if not same(t[k], t2[k])]; assert not bad and cal2 == cal, f'round trip: {bad}'
    open(path, 'wb').write(out)
    json.dump({'ref': ref, 'grade': t['grade'], 'classes': rep, 'bytes': len(out)}, open(os.path.join(ENG, 'study', 'materials', f'publish-{ref}.json'), 'w'), indent=1)
    print(f'eye {ref}: {len(buf) / 1024:.0f} → {len(out) / 1024:.0f} KB')
    for k, v in rep.items(): print(f'   {k:13s} n {v["n"]:6d}  regenerated within 1 sRGB step: {100 * v["within1step"]:5.1f} %  within 2: {100 * v["within2steps"]:5.1f} %  max {v["max8"]:.0f} steps  (linear max |Δ| {v["maxErr"]:.4f}, chroma ΔE p95 {v["dE_p95"]:.2f})')
    return rep

if __name__ == '__main__':
    for r in ([a for a in sys.argv[1:] if not a.startswith('--')] or ['26']): publish(r)
