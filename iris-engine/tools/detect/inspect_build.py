#!/usr/bin/env python3
"""study/11 §5.6 P3b — the data behind the inspect view (tools/detect/inspect.html): the same regions under every detector.

Cases: real 2 mm crops of an eye's native photo (its two largest crypts, the most crypt-dense window, a plain plateau, the
pupillary zone, the window with the most narrow plateau necks between crypts — iori's bridge sites) and the phantom's tiles
(with their truth). For each case and each detector: its curves; for the phantom, the ruler's scores (with the chance floor).
usage: /usr/bin/python3 inspect_build.py 26 [--detectors today,detect2]   → study/detect/inspect/…  (index.json + per case)
"""
import os, sys, json, pickle, glob
import numpy as np
import cv2
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
from ruler import with_chance, public
ENG = os.path.normpath(os.path.join(HERE, '..', '..')); OUT = os.path.join(ENG, 'study', 'detect', 'inspect')
N = 429

def detectors(names, ref):
    D = {}
    for n in names:
        if n == 'today':
            from baseline import today; D[n] = today
        elif n.startswith('detect'):
            mod = __import__(n); Det = mod.Detector.for_eye(ref); D[n] = (lambda Det: (lambda img, crypt, um: Det(img, crypt)))(Det)
    return D

def real_cases(ref):
    d = pickle.load(open(os.path.join(ENG, 'study/proof-layers/sheet', f'sheet-{ref}.pkl'), 'rb'))
    pY, sd, photo, inner, UM, PC = d['pY'].astype(np.float32), d['sd'], d['photo'], d['inner'], float(d['UM']), np.asarray(d['PC'], float)
    H, W = pY.shape; crypt = (sd > 0).astype(np.uint8); ok = cv2.erode(inner.astype(np.uint8), np.ones((N, N), np.uint8)) > 0   # window centres whose window lies inside the iris
    ok[:N // 2] = ok[-N // 2:] = False; ok[:, :N // 2] = ok[:, -N // 2:] = False
    frac = cv2.blur(crypt.astype(np.float32), (N, N))
    D = (0.06 + 0.05) * 1000 / UM                                                      # the terrain's bridge rule: plateau narrower than 2 D between crypts
    dout = cv2.distanceTransform(1 - crypt, cv2.DIST_L2, 5); core = ((dout > D) & (crypt == 0)).astype(np.uint8)
    reach = cv2.distanceTransform(1 - core, cv2.DIST_L2, 5); narrow = ((crypt == 0) & (dout <= D) & (reach > D) & inner).astype(np.float32)
    nfrac = cv2.blur(narrow, (N, N))
    n, lab, st, cen = cv2.connectedComponentsWithStats(crypt); big = np.argsort(-st[1:, cv2.CC_STAT_AREA]) + 1
    picks = []
    def add(name, cx, cy, why):
        cx, cy = int(np.clip(cx, N // 2, W - N // 2 - 1)), int(np.clip(cy, N // 2, H - N // 2 - 1))
        if any(abs(cx - p[1]) < N // 2 and abs(cy - p[2]) < N // 2 for p in picks): return
        picks.append((name, cx, cy, why))
    y, x = np.unravel_index(np.where(ok, nfrac, -1).argmax(), nfrac.shape); add('necks', x, y, 'the most plateau narrower than 0.22 mm between crypts (bridge sites)')
    for j in big[:2]: add(f'crypt-{len(picks)}', *cen[j], 'one of the two largest crypts')
    y, x = np.unravel_index(np.where(ok, frac, -1).argmax(), frac.shape); add('crypt-dense', x, y, 'the window with the most crypt')
    y, x = np.unravel_index(np.where(ok, -frac, -2).argmax(), frac.shape); add('plateau', x, y, 'the window with the least crypt')
    rp = np.percentile(np.hypot(*(np.argwhere(inner)[:, ::-1] - PC).T), 1)            # ≈ the pupil margin's radius
    for a in np.linspace(0, 2 * np.pi, 16, endpoint=False):
        cx, cy = PC + (rp + N * 0.55) * np.array([np.cos(a), np.sin(a)])
        if 0 <= int(cy) < H and 0 <= int(cx) < W and ok[int(cy), int(cx)]: add('pupillary', cx, cy, 'beside the pupil: the pupillary zone and collarette'); break
    out = []
    for name, cx, cy, why in picks:
        x0, y0 = cx - N // 2, cy - N // 2
        out.append({'name': f'{ref}-{name}', 'kind': 'real', 'why': why, 'at': [int(cx), int(cy)], 'UM': UM,
                    'img': pY[y0:y0 + N, x0:x0 + N].copy(), 'rgb': photo[y0:y0 + N, x0:x0 + N].copy(), 'crypt': crypt[y0:y0 + N, x0:x0 + N].astype(bool)})
    return out

def phantom_cases(ref):
    out = []
    for name in ('plateau-0', 'crypt-1000', 'bridges-2000', 'crossings-3000', 'nullbundle-6000', 'null-5000'):
        base = os.path.join(ENG, 'study/detect', f'phantom-{ref}', name)
        if not os.path.exists(base + '.json'): continue
        gt = json.load(open(base + '.json'))
        out.append({'name': f'phantom-{name}', 'kind': 'phantom', 'why': 'known truth', 'UM': gt['UM'], 'gt': gt,
                    'img': np.load(base + '.npy'), 'rgb': cv2.imread(base + '.png'), 'crypt': cv2.imread(base + '-crypt.png', 0) > 127})
    return out

def slim(curves):
    return [{'xy': np.round(np.asarray(c['xy'], float), 1).tolist(), 'cls': c['cls'], 'w': round(float(np.median(np.atleast_1d(c.get('fwhm_um', 0)))), 1)} for c in curves]

if __name__ == '__main__':
    ref = sys.argv[1] if len(sys.argv) > 1 else '26'
    names = sys.argv[sys.argv.index('--detectors') + 1].split(',') if '--detectors' in sys.argv else ['today', 'detect2']
    D = detectors(names, ref); os.makedirs(OUT, exist_ok=True)
    idx = json.load(open(os.path.join(OUT, 'index.json'))) if os.path.exists(os.path.join(OUT, 'index.json')) else {'cases': {}, 'detectors': []}
    for n in names:
        if n not in idx['detectors']: idx['detectors'].append(n)
    for case in real_cases(ref) + phantom_cases(ref):
        cd = os.path.join(OUT, case['name']); os.makedirs(cd, exist_ok=True)
        cv2.imwrite(os.path.join(cd, 'photo.png'), case['rgb']); cv2.imwrite(os.path.join(cd, 'crypt.png'), case['crypt'].astype(np.uint8) * 255)
        meta = idx['cases'].get(case['name'], {'name': case['name'], 'kind': case['kind'], 'why': case['why'], 'UM': case['UM'], 'N': N, 'eye': ref, 'at': case.get('at'), 'scores': {}, 'stats': {}})
        if case['kind'] == 'phantom':
            json.dump({'curves': [{'xy': np.round(np.asarray(c['xy'], float), 1).tolist(), 'cls': c['cls'], 'w': c['fwhm_um'][0], 'vis': c['vis']} for c in case['gt']['curves']]}, open(os.path.join(cd, 'truth.json'), 'w'))
        for n, det in D.items():
            curves = det(case['img'], case['crypt'], case['UM']); json.dump({'curves': slim(curves)}, open(os.path.join(cd, f'{n}.json'), 'w'))
            L = [np.hypot(*np.diff(np.asarray(c['xy'], float), axis=0).T).sum() * case['UM'] for c in curves if len(c['xy']) > 1]
            meta['stats'][n] = {'curves': len(curves), 'mm': round(sum(L) / 1000, 1), 'median_um': round(float(np.median(L)), 0) if L else 0}
            if case['kind'] == 'phantom':
                r = public(with_chance(case['gt'], curves))
                meta['scores'][n] = {k: r.get(k) for k in ('recall', 'recall_chance', 'precision', 'precision_chance', 'fp_mm_per_mm2')} | {'whole': r['continuity']['whole'], 'cross_over': r['crossings']['over'][0], 'cross_under': r['crossings']['under'][0]}
            print(case['name'], n, meta['stats'][n], meta['scores'].get(n, ''))
        idx['cases'][case['name']] = meta
    json.dump(idx, open(os.path.join(OUT, 'index.json'), 'w'), indent=1)
