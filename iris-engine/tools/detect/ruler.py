#!/usr/bin/env python3
"""study/11 §5.6 P2 — the ruler: a detector's curves against a phantom's truth (phantom.py).

A detection is a list of curves {xy: [[x, y], …] px, fwhm_um: number | per-sample list, cls: 'bright' | 'valley' | a class,
id}. Both sides are resampled every pixel with their tangents. Matching is geometric and direction-aware:
  a TRUTH sample is FOUND when a detected sample of the same polarity (bright / dark) lies within tol = max(½ FWHM, 1.5 px)
  + 1 px and runs within 30° of it;  a DETECTED sample is TRUE when a truth sample (visible or not: a strand followed under
  another is not an invention) of its polarity lies within the same tolerance and direction.
Reported, per class and per scenario:
  recall      found / visible truth length          precision   true / detected length
  fp_density  false detected length per mm² (on the null tiles this is the grain's false-positive rate)
  width       median detected / true FWHM on found samples, and its spread (median |log ratio|)
  continuity  per truth strand ≥ 100 µm visible: pieces = distinct detected curves covering it; whole = the best one curve
              covers ≥ 90 % of its visible length
  crossings   per truth crossing, for the strand OVER and the one UNDER: the same detected curve found on both sides
              (2–6 widths away) — survives. The under strand's survival is the join the detector must infer.
  ladder      the found share per (width, contrast) cell — the detection limit
usage: from ruler import score; score(gt_json, det_curves) → dict
       /usr/bin/python3 ruler.py GT.json DET.json   (prints the report)
       with_chance(gt, det): the same, plus the chance floor (the truth shifted 70 µm: recall there is luck)
"""
import json, math, sys
import numpy as np
from scipy.spatial import cKDTree

DARK = ('valley', 'trough')

def resample(xy, step=1.0):
    xy = np.asarray(xy, float)
    if len(xy) < 2: return xy, np.zeros((len(xy), 2)), np.zeros(len(xy))
    seg = np.hypot(*np.diff(xy, axis=0).T); t = np.r_[0, np.cumsum(seg)]
    if t[-1] < 1e-6: return xy[:1], np.zeros((1, 2)), np.zeros(1)
    m = max(2, int(t[-1] / step) + 1); ts = np.linspace(0, t[-1], m)
    q = np.stack([np.interp(ts, t, xy[:, 0]), np.interp(ts, t, xy[:, 1])], 1)
    tg = np.gradient(q, axis=0); tg /= np.maximum(np.hypot(*tg.T), 1e-9)[:, None]
    return q, tg, np.interp(ts, t, np.arange(len(xy)))

def per_sample(v, n, idx):
    v = np.asarray(v, float)
    return np.full(len(idx), float(v)) if v.ndim == 0 else np.interp(idx, np.arange(len(v)), v)

def score(gt, det, cos_min=math.cos(math.radians(30))):
    UM = gt['UM']; N = gt['N']; area_mm2 = (N * UM / 1000) ** 2
    T = {'xy': [], 'tg': [], 'fw': [], 'vis': [], 'cid': [], 'cls': [], 'pol': []}
    for c in gt['curves']:
        q, tg, idx = resample(c['xy']); fw = per_sample(c['fwhm_um'], len(c['xy']), idx) / UM
        vis = np.interp(idx, np.arange(len(c['vis'])), np.asarray(c['vis'], float)) > 0.5
        T['xy'].append(q); T['tg'].append(tg); T['fw'].append(fw); T['vis'].append(vis); T['cid'].append(np.full(len(q), c['id'])); T['cls'].append([c['cls']] * len(q)); T['pol'].append(np.full(len(q), c['cls'] in DARK))
    if not gt['curves']:                                                         # the null tile: nothing to find, every detection is false
        T = {'xy': np.zeros((0, 2)), 'tg': np.zeros((0, 2)), 'fw': np.zeros(0), 'vis': np.zeros(0, bool), 'cid': np.zeros(0, int), 'cls': [], 'pol': np.zeros(0, bool)}
    else:
        for k in T: T[k] = np.concatenate(T[k]) if k != 'cls' else sum(T[k], [])
    T['cls'] = np.array(T['cls'])
    D = {'xy': [], 'tg': [], 'fw': [], 'did': [], 'pol': []}
    for i, c in enumerate(det):
        if len(c['xy']) < 2: continue
        q, tg, idx = resample(c['xy']); fw = per_sample(c.get('fwhm_um', 0), len(c['xy']), idx) / UM
        D['xy'].append(q); D['tg'].append(tg); D['fw'].append(fw); D['did'].append(np.full(len(q), c.get('id', i))); D['pol'].append(np.full(len(q), c.get('cls') in DARK))
    if not D['xy']: D = {k: np.zeros((0, 2)) if k in ('xy', 'tg') else np.zeros(0) for k in D}
    else: D = {k: np.concatenate(v) for k, v in D.items()}
    tol = np.maximum(0.5 * T['fw'], 1.5) + 1.0
    # truth → detections
    found = np.zeros(len(T['xy']), bool); match_did = np.full(len(T['xy']), -1); match_fw = np.full(len(T['xy']), np.nan)
    if len(D['xy']):
        tree = cKDTree(D['xy'])
        for i, cand in enumerate(tree.query_ball_point(T['xy'], tol)):
            best, bd = -1, 1e9
            for j in cand:
                if D['pol'][j] != T['pol'][i] or abs(float(D['tg'][j] @ T['tg'][i])) < cos_min: continue
                d = float(np.hypot(*(D['xy'][j] - T['xy'][i])))
                if d < bd: best, bd = j, d
            if best >= 0: found[i] = True; match_did[i] = D['did'][best]; match_fw[i] = D['fw'][best]
    # detections → truth
    true = np.zeros(len(D['xy']), bool)
    if len(D['xy']) and len(T['xy']):
        ttree = cKDTree(T['xy']); rmax = float(tol.max())
        for j, cand in enumerate(ttree.query_ball_point(D['xy'], rmax)):
            for i in cand:
                if T['pol'][i] != D['pol'][j] or abs(float(D['tg'][j] @ T['tg'][i])) < cos_min: continue
                if np.hypot(*(D['xy'][j] - T['xy'][i])) <= tol[i]: true[j] = True; break
    mm = UM / 1000
    out = {'tile': gt['name'], 'area_mm2': round(area_mm2, 3), 'classes': {}}
    for cls in sorted(set(T['cls'])):
        m = (T['cls'] == cls) & T['vis']
        if not m.any(): continue
        f = found & m; wr = match_fw[f] / T['fw'][f]; wr = wr[np.isfinite(wr) & (wr > 0)]
        out['classes'][cls] = {'truth_mm': round(m.sum() * mm, 2), 'recall': round(f.sum() / m.sum(), 3),
                               'width_ratio': round(float(np.median(wr)), 2) if len(wr) else None, 'width_spread': round(float(np.median(np.abs(np.log(wr)))), 2) if len(wr) else None}
    vis_all = T['vis']
    out['recall'] = round(float((found & vis_all).sum() / vis_all.sum()), 3) if vis_all.any() else None
    out['detected_mm'] = round(len(D['xy']) * mm, 2); out['precision'] = round(float(true.mean()), 3) if len(true) else None
    out['fp_mm_per_mm2'] = round(float((~true).sum() * mm / area_mm2), 2)
    # continuity
    whole, pieces, n = 0, [], 0
    for c in gt['curves']:
        m = (T['cid'] == c['id']) & T['vis']
        if m.sum() * UM < 100: continue
        n += 1; ids = match_did[m & found]; ids = ids[ids >= 0]
        if not len(ids): pieces.append(0); continue
        u, k = np.unique(ids, return_counts=True); pieces.append(len(u))
        if k.max() >= 0.9 * m.sum(): whole += 1
    out['continuity'] = {'strands': n, 'whole': round(whole / max(1, n), 3), 'pieces_median': float(np.median(pieces)) if pieces else None,
                         'missed': round(sum(1 for p in pieces if p == 0) / max(1, n), 3)}
    # crossings: for OVER and UNDER, the same detected curve on both sides
    surv = {'over': [0, 0], 'under': [0, 0]}
    for x in gt.get('crossings', []):
        for role, cid in (('over', x['over']), ('under', x['b'] if x['over'] == x['a'] else x['a'])):
            m = T['cid'] == cid; idx = np.nonzero(m)[0]
            if len(idx) < 10: continue
            q = T['xy'][idx]; k0 = int(np.argmin(np.hypot(*(q - np.asarray(x['xy'])).T))); w = max(3.0, float(np.median(T['fw'][idx])))
            lo = [i for i in range(len(idx)) if 2 * w <= k0 - i <= 6 * w]; hi = [i for i in range(len(idx)) if 2 * w <= i - k0 <= 6 * w]
            if not lo or not hi: continue
            a = set(match_did[idx[lo]][found[idx[lo]]]); b = set(match_did[idx[hi]][found[idx[hi]]])
            surv[role][1] += 1; surv[role][0] += 1 if (a & b) - {-1} else 0
    out['crossings'] = {r: (round(v[0] / v[1], 3) if v[1] else None, v[1]) for r, v in surv.items()}
    # the ladder: found share per (width, contrast) cell
    if gt['name'].startswith('ladder'):
        cells = {}
        for c in gt['curves']:
            m = T['cid'] == c['id']; key = f"{c['fwhm_um'][0]:.0f}um@{c['c']:.2f}"; cells[key] = round(float(found[m].mean()), 2)
        out['ladder'] = cells
    out['_found'] = found; out['_true'] = true; out['_T'] = T; out['_D'] = D
    return out

def with_chance(gt, det, shift_px=15.0):
    """score, plus the CHANCE floor: the same detections against the truth shifted by shift_px in x and y (70 µm at 4.66 µm/px) —
    what a detector scores by drawing lines where there are none. Recall at or under it is luck, not detection."""
    r = score(gt, det)
    sh = dict(gt); sh['curves'] = [dict(c, xy=(np.asarray(c['xy'], float) + shift_px).tolist()) for c in gt['curves']]; sh['crossings'] = []
    ch = score(sh, det); r['recall_chance'] = ch['recall']; r['precision_chance'] = ch['precision']   # a line through dense truth matches something by luck too
    for cls, v in r['classes'].items(): v['recall_chance'] = ch['classes'].get(cls, {}).get('recall')
    if 'ladder' in ch: r['ladder_chance'] = ch['ladder']
    return r

def public(r): return {k: v for k, v in r.items() if not k.startswith('_')}

def overlay(img_png, r, path):
    """the tile with truth and detection: found truth green, missed truth magenta, false detections red, true ones cyan"""
    import cv2
    im = cv2.imread(img_png); im = (im * 0.55).astype(np.uint8); T, D = r['_T'], r['_D']
    for pts, ok, cols in ((T['xy'][T['vis']], r['_found'][T['vis']], ((60, 220, 60), (255, 60, 255))), (D['xy'], r['_true'], ((255, 220, 40), (40, 40, 255)))):
        for p, o in zip(pts, ok): im[int(min(max(p[1], 0), im.shape[0] - 1)), int(min(max(p[0], 0), im.shape[1] - 1))] = cols[0] if o else cols[1]
    cv2.imwrite(path, im)

if __name__ == '__main__':
    gt = json.load(open(sys.argv[1])); det = json.load(open(sys.argv[2]))
    print(json.dumps(public(score(gt, det)), indent=1))
