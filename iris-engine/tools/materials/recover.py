#!/usr/bin/env python3
"""K2.0 (study/14 phase 2): recover the MATERIAL behind every shipped colour of an eye.

The fitter (tools/layer_proof.py) sends every colour through the spectral LUT — nearest graded LUT material × a brightness
scale — and exports the RESULT as linear RGB (`rgb`, cells.sheet / ground, rimRGB). So each shipped colour is
graded(LUT[material] × scale), rounded to 4 decimals; inverting it with the same LUT and the eye's grade recovers the
material (Ma, Ds, pheo, yellow, mie) and the scale, with a residual that should be rounding only. The report says whether
that holds per class, which materials and mie levels are in use, and writes the recovered materials for K2.1.

  /usr/bin/python3 tools/materials/recover.py 26        → study/materials/recover-26.json + a report on stdout
"""
import sys, os, json
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); ENG = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(ENG, 'tools')); sys.path.insert(0, os.path.join(ENG, 'tools', 'eyefile'))
import layer_proof as LP
from read import read

_CH = {}
def invert_chroma(lin, LUT, G, ROT, Y0=0.18):
    """A shipped colour is graded(LUT[m] × scale) with ANY scale (the fitter's val / base / cell luminance), so the material is
    the CHROMATICITY: ungrade the colour, divide out its luminance, match against the LUT's chromaticities in Lab at one
    luminance Y0, then the scale is the luminance ratio. Returns (index, scale, ΔE at Y0)."""
    from scipy.spatial import cKDTree
    key = (id(LUT), Y0)
    if key not in _CH:
        Yl = np.maximum(LUT @ LP.LUMA, 1e-6); _CH[key] = (cKDTree(LP.lin2lab(LUT / Yl[:, None] * Y0)), Yl)
    tree, Yl = _CH[key]
    un = LP.lab2lin(LP.grade(LP.lin2lab(lin.astype(np.float32)), 1.0 / G, -ROT)); un = np.maximum(un, 1e-6)
    Y = np.maximum(un @ LP.LUMA, 1e-6); lab_t = LP.lin2lab(un / Y[:, None] * Y0)
    dE, j = tree.query(lab_t, k=1, workers=-1)
    return j, (Y / Yl[j]).astype(np.float32), dE.astype(np.float32)

def recover(ref):
    t, c, _ = read(open(os.path.join(ENG, 'data', f'{ref}.iris'), 'rb').read())
    G, ROT = float(t['grade']['chroma']), float(t['grade'].get('hue', 0)) * np.pi / 180 if abs(t['grade'].get('hue', 0)) > 6.3 else float(t['grade'].get('hue', 0))
    LUT, P = LP.build_lut()
    classes = {
        'cells.sheet': np.array(t['cells']['sheet'], np.float32), 'cells.ground': np.array(t['cells']['ground'], np.float32),
        'fibres.rgb': np.array([p for cv in t['fibres'] for p in cv['rgb']], np.float32),
        'guides.rgb': np.array([p for cv in t['guides'] for p in cv['rgb']], np.float32),
        'beads.rgb': np.array([p for cv in t['beads'] for p in cv['rgb']], np.float32),
        'rimRGB': np.array([t['rimRGB']], np.float32) }
    out = {'ref': ref, 'grade': t['grade'], 'lut': {'axes': ['Ma', 'Ds', 'pheo', 'yellow', 'mie'], 'shape': [24, 16, 5, 8, 7]}, 'classes': {}}
    print(f'eye {ref} · grade chroma {G} hue {ROT}')
    print(f'{"class":13s} {"n":>6s} {"dE med":>7s} {"p95":>6s} {"max":>6s} {"mats":>5s} {"mie levels (count)":32s} {"scale lo..hi":>14s}  (ΔE = chromaticity at Y 0.18, after ungrading)')
    for name, rgb in classes.items():
        if not len(rgb): continue
        lin = np.maximum(rgb, 1e-5)
        idx, sc, dE = invert_chroma(lin, LUT, G, ROT)
        prm = P[idx]; mies = prm[:, 4]; u, cnt = np.unique(np.round(mies, 2), return_counts=True)
        out['classes'][name] = {'n': int(len(rgb)), 'idx': idx.astype(int).tolist(), 'scale': [float(x) for x in sc], 'dE': {'median': float(np.median(dE)), 'p95': float(np.percentile(dE, 95)), 'max': float(dE.max())},
                                'unique': int(len(np.unique(idx))), 'mie': {str(k): int(v) for k, v in zip(u, cnt)}}
        print(f'{name:13s} {len(rgb):6d} {np.median(dE):7.3f} {np.percentile(dE, 95):6.3f} {dE.max():6.3f} {len(np.unique(idx)):5d} {str({float(k): int(v) for k, v in zip(u, cnt)}):32s} {sc.min():6.3f}..{sc.max():.3f}')
    os.makedirs(os.path.join(ENG, 'study', 'materials'), exist_ok=True)
    json.dump(out, open(os.path.join(ENG, 'study', 'materials', f'recover-{ref}.json'), 'w'))
    # the axes actually used, over all classes
    allidx = np.concatenate([np.array(v['idx']) for v in out['classes'].values()]); prm = P[allidx]
    for i, ax in enumerate(out['lut']['axes']):
        u = np.unique(np.round(prm[:, i], 3)); print(f'  {ax:7s} values in use: {len(u):3d}  range {prm[:, i].min():.3f}..{prm[:, i].max():.3f}')
    return out

if __name__ == '__main__':
    for r in (sys.argv[1:] or ['26']): recover(r)
