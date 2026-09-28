#!/usr/bin/env python3
"""study/11 §5.4 L1 — the sheet's strands, traced (iori, 2026-09-28: "start L1 with the sheet tracing on eye 26").

The sheet (≈ ¾ of an iris) was never traced as strands: 0.1 mm colour cells, 45 µm guides and a few hundred brightness-only
streaks. At 3× zoom the render keeps 29 % of the photo's finest contrast there (the crypts keep 62 %) — study/11 §5.5.
The difficulty is the one layer_proof.py names: at the finest scale the flat sheet is mostly SENSOR GRAIN, and tracing grain
is fitting noise. Here the image decides what is tissue:

  1. a flow field from the structure tensor of the local-contrast image (≈ 40 µm integration) — strands run with it, grain
     has no direction;
  2. smoothing ALONG the flow only (σ ≈ 14 µm): a strand survives it, grain averages down;
  3. a NULL tracer, identical but with the flow turned 90°: what it finds is grain (and the rare cross strand). The ridge
     threshold is the lowest at which the null finds ≤ `NULL_FRAC` of what the real tracer finds — a rule that asks the
     image, not a percentile;
  4. bright ridges (strands, the glints) and dark valleys (the gaps, the deep shadows) are traced the same way.

Measured: how well each set of curves REBUILDS the sheet's fine structure — every curve drawn with the local contrast read at
its samples, band-passed (σ 1 → 6 px) and correlated with the photo's, on the sheet only; for today's sheet curves, the new
ones and the null ones (the grain baseline). Nothing here goes into the model.

usage: /usr/bin/python3 sheet_trace.py ../study/proof-layers/sheet/sheet-26.pkl  [--null-frac 0.1]
       (the pickle: layer_proof.py --ref 26 --whole --dump-sheet FILE --dump-exit)
"""
import os, sys, json, pickle, time
import cv2
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from strand_stats import zhang_suen, ridge, prune, order_path
from layer_proof import payload_curve, raster_curves

NULL_FRAC = float(sys.argv[sys.argv.index('--null-frac') + 1]) if '--null-frac' in sys.argv else 0.10
SCALES = [1.2, 1.8, 2.7, 4.0]               # across the strand, px (5.6–19 µm at 4.66 µm / px)
SIG_ALONG = 3.0                             # along the flow, px (14 µm)
SIG_GRAD = 3.0                              # the gradient's own scale, px (at 1 px the gradient is mostly grain: coherence 0.03; at 3, 0.18)
SIG_FLOW = 12.0                             # structure tensor integration, px (56 µm)
RADIAL = 0.5                                # the radial prior's weight against the local tensor (trabeculae run root → collarette)
MIN_LEN_MM = 0.05


def flow_field(L, PC):
    g = cv2.GaussianBlur(L, (0, 0), SIG_GRAD); gx = cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3); gy = cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3)
    J = [cv2.GaussianBlur(a, (0, 0), SIG_FLOW) for a in (gx * gx, gy * gy, gx * gy)]
    # the radial prior: a tensor whose gradient direction is TANGENTIAL (so its strands run radially), scaled to the local trace
    H, W = L.shape; yy, xx = np.mgrid[0:H, 0:W].astype(np.float32); ra = np.arctan2(yy - PC[1], xx - PC[0]); tx, ty = -np.sin(ra), np.cos(ra)
    k = RADIAL * (J[0] + J[1]); J = [J[0] + k * tx * tx, J[1] + k * ty * ty, J[2] + k * tx * ty]
    th = 0.5 * np.arctan2(2 * J[2], J[0] - J[1])                              # the gradient's direction; strands run ⟂ to it
    tr = J[0] + J[1]; df = np.sqrt((J[0] - J[1]) ** 2 + 4 * J[2] ** 2)
    coh = (df / np.maximum(tr, 1e-12)) ** 2
    return (th + np.pi / 2).astype(np.float32), coh.astype(np.float32)


def smooth_along(L, ang):
    """a 1-D Gaussian along the direction `ang` at every pixel (straight over ±3σ, 42 µm: the flow is smooth at that scale)"""
    H, W = L.shape; gy, gx = np.mgrid[0:H, 0:W].astype(np.float32); tx, ty = np.cos(ang), np.sin(ang)
    acc = np.zeros_like(L); ws = 0.0
    for t in np.arange(-3 * SIG_ALONG, 3 * SIG_ALONG + 0.5, 1.0):
        w = float(np.exp(-0.5 * (t / SIG_ALONG) ** 2)); ws += w
        t = np.float32(t); acc += w * cv2.remap(L, (gx + t * tx).astype(np.float32), (gy + t * ty).astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    return acc / ws


def candidates(Lo, focus):
    """ridge strength after NMS across the ridge (the centrelines() recipe), and the maps the tracing needs"""
    R, S, nx, ny = ridge(Lo, SCALES)
    H, W = Lo.shape; gy, gx = np.mgrid[0:H, 0:W].astype(np.float32); st = 0.6
    Rs = cv2.GaussianBlur(R, (0, 0), 0.8)
    Ra = cv2.remap(Rs, gx + st * nx, gy + st * ny, cv2.INTER_LINEAR); Rb = cv2.remap(Rs, gx - st * nx, gy - st * ny, cv2.INTER_LINEAR)
    nms = (Rs >= Ra) & (Rs >= Rb) & (R > 0) & focus
    return R, S, nms


def trace(R, nms, hi, lo, min_len):
    cand = cv2.dilate((nms & (R > lo)).astype(np.uint8), np.ones((2, 2), np.uint8))
    n0, l0 = cv2.connectedComponents(cand, connectivity=8)
    strong = np.zeros(n0, bool); strong[np.unique(l0[(R > hi) & (cand > 0)])] = True; strong[0] = False
    sk = prune(zhang_suen(strong[l0].astype(np.uint8)), min_len)
    p = np.pad(sk, 1); P = [p[:-2, 1:-1], p[:-2, 2:], p[1:-1, 2:], p[2:, 2:], p[2:, 1:-1], p[2:, :-2], p[1:-1, :-2], p[:-2, :-2]]
    deg = sum(((P[i] == 0) & (P[(i + 1) % 8] == 1)).astype(np.int32) for i in range(8)) * (sk > 0)
    seg = ((sk > 0) & (cv2.dilate((deg >= 3).astype(np.uint8), np.ones((3, 3), np.uint8)) == 0)).astype(np.uint8)
    n, lab = cv2.connectedComponents(seg, connectivity=8); paths = []
    for i in range(1, n):
        ys, xs = np.nonzero(lab == i)
        if len(ys) >= min_len: paths.append(order_path(ys, xs))
    return paths


def main():
    t0 = time.time(); D = pickle.load(open(sys.argv[1], 'rb')); UM = D['UM']; sd = D['sd']; pY = D['pY'].astype(np.float32)
    REF = D.get('REF', '26'); out_dir = os.path.dirname(os.path.abspath(sys.argv[1]))
    sheet = (sd < -4) & D['near']; inner = D['inner'] & (sd < -14)
    Ln = (cv2.GaussianBlur(pY, (0, 0), 1.0) / np.maximum(cv2.GaussianBlur(pY, (0, 0), 14), 0.004)).astype(np.float32)   # local contrast, ≈ 1 on the sheet
    ang, coh = flow_field(Ln, D['PC'])
    print(f'eye {REF}: sheet {sheet.sum() / 1e6:.2f} Mpx · flow coherence median {np.median(coh[inner]):.2f}')
    min_len = int(round(MIN_LEN_MM * 1000 / UM))
    res, sets = {}, {}
    for kind, sgn in (('ridge', 1.0), ('valley', -1.0)):
        maps = {}
        for mode, a in (('real', ang), ('null', ang + np.float32(np.pi / 2))):
            Lo = smooth_along(sgn * Ln, a); R, S, nms = candidates(Lo, sheet); maps[mode] = (R, S, nms)
        # the threshold that asks the image: the lowest ridge strength at which the null finds ≤ NULL_FRAC of the real count
        vr, vn = np.sort(maps['real'][0][maps['real'][2]]), np.sort(maps['null'][0][maps['null'][2]])
        qs = np.quantile(vr, np.linspace(0.30, 0.995, 140)); hi = qs[-1]
        for q in qs:
            nr = len(vr) - np.searchsorted(vr, q); nn = len(vn) - np.searchsorted(vn, q)
            if nn <= NULL_FRAC * nr: hi = q; break
        lo = 0.5 * hi
        for mode in ('real', 'null'):
            R, S, nms = maps[mode]
            paths = trace(R, nms, hi, lo, min_len)
            curves = [payload_curve(p, D['step'], Ln, S * 2.0) for p in paths]
            sets[f'{kind}-{mode}'] = curves
            ln_mm = sum(np.hypot(*np.diff(c['xy'], axis=0).T).sum() for c in curves) * UM / 1000
            res[f'{kind}-{mode}'] = {'curves': len(curves), 'length_mm': round(ln_mm, 1)}
        res[kind + '-threshold'] = {'hi': float(hi), 'kept_frac_of_nms': round(float((vr > hi).mean()), 3),
                                    'null_over_real_px': round(float((vn > hi).sum() / max(1, (vr > hi).sum())), 3)}
        print(f'{kind}: hi {hi:.4f} (keeps {100 * (vr > hi).mean():.0f} % of NMS pixels) · real {res[kind + "-real"]} · null {res[kind + "-null"]}  [{time.time() - t0:.0f} s]')
    # today's sheet curves, with the same payload rule (the geometry is what is compared)
    Rr, Sr, _ = candidates(smooth_along(Ln, ang), sheet)
    old = {'guides': D['gpaths'], 'sfib': D['sfp'], 'svein': D['svp']}
    for k_, ps in old.items(): sets['today-' + k_] = [payload_curve(p, D['step'], Ln, Sr * 2.0) for p in ps]

    # ---- how well a set of curves rebuilds the sheet's fine structure
    H, W = sd.shape; band = lambda x: cv2.GaussianBlur(x, (0, 0), 1.0) - cv2.GaussianBlur(x, (0, 0), 6.0)
    target = band(Ln)
    def rebuild(curves):
        if not curves: return np.ones((H, W), np.float32)
        d, v, w = raster_curves(curves, (H, W)); w = np.maximum(w * 0.5, 0.8)
        return (1.0 + (v - 1.0) * np.exp(-0.5 * (d / w) ** 2)).astype(np.float32)
    def corr(img):
        a, b = band(img)[inner], target[inner]; a = a - a.mean(); b = b - b.mean()
        return round(float((a * b).sum() / np.sqrt((a * a).sum() * (b * b).sum() + 1e-12)), 3)
    recs = {'today (guides + streaks + veins)': rebuild(sets['today-guides'] + sets['today-sfib'] + sets['today-svein']),
            'new (ridges + valleys)': rebuild(sets['ridge-real'] + sets['valley-real']),
            'null (grain baseline)': rebuild(sets['ridge-null'] + sets['valley-null'])}
    # both together: the valleys' dark and the ridges' bright on one image (a pixel takes the nearer curve's)
    res['rebuild_corr'] = {k: corr(r) for k, r in recs.items()}
    print('rebuild correlation with the photo\'s sheet band (σ 1 → 6 px):', res['rebuild_corr'], f'[{time.time() - t0:.0f} s]')
    res['params'] = {'NULL_FRAC': NULL_FRAC, 'SCALES_px': SCALES, 'SIG_ALONG_px': SIG_ALONG, 'SIG_FLOW_px': SIG_FLOW, 'SIG_GRAD_px': SIG_GRAD, 'RADIAL': RADIAL, 'MIN_LEN_MM': MIN_LEN_MM, 'UM': UM}
    res['today'] = {k: len(D[p]) for k, p in (('guides', 'gpaths'), ('sfib', 'sfp'), ('svein', 'svp'))}
    json.dump(res, open(os.path.join(out_dir, f'sheet-{REF}.json'), 'w'), indent=1, default=float)
    pickle.dump({k: [{'xy': c['xy'], 'val': c['val'], 'w': c['w']} for c in v] for k, v in sets.items()}, open(os.path.join(out_dir, f'sheet-{REF}-curves.pkl'), 'wb'), protocol=4)

    # ---- the detection sheet: four sheet regions, the photo and the traces (new ridges yellow, new valleys cyan, today's grey)
    photo = D['photo']; PC = D['PC']; half = int(round(0.6 * 1000 / UM)); tiles = []
    rp, rl = np.hypot(*(np.argwhere(inner) - PC[::-1]).T).min(), np.hypot(*(np.argwhere(inner) - PC[::-1]).T).max()
    for a_deg, frac in ((40, 0.45), (140, 0.7), (230, 0.35), (320, 0.6)):
        a_ = np.radians(a_deg); r_ = rp + frac * (rl - rp); cx, cy = int(PC[0] + r_ * np.cos(a_)), int(PC[1] + r_ * np.sin(a_))
        x0, y0 = max(0, cx - half), max(0, cy - half); crop = photo[y0:y0 + 2 * half, x0:x0 + 2 * half]
        up = 2.5; base = cv2.resize(crop, None, fx=up, fy=up, interpolation=cv2.INTER_CUBIC)
        ov = (base * 0.55).astype(np.uint8)
        def draw(curves, col, th):
            for c in curves:
                q = (c['xy'] - [x0, y0]) * up
                if (q[:, 0] < -10).all() or (q[:, 0] > base.shape[1] + 10).all() or (q[:, 1] < -10).all() or (q[:, 1] > base.shape[0] + 10).all(): continue
                cv2.polylines(ov, [q.round().astype(np.int32)], False, col, th, cv2.LINE_AA)
        draw(sets['today-guides'] + sets['today-sfib'] + sets['today-svein'], (150, 150, 150), 1)
        draw(sets['valley-real'], (255, 220, 0), 1); draw(sets['ridge-real'], (0, 230, 255), 1)
        tile = np.hstack([base, np.full((base.shape[0], 6, 3), 255, np.uint8), ov])
        cv2.putText(tile, f'{a_deg} deg, {frac:.2f} of the way out - photo | new ridges yellow, new valleys cyan, today grey', (8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1, cv2.LINE_AA)
        tiles.append(tile)
    sheet_img = np.vstack([np.vstack([t, np.full((6, t.shape[1], 3), 255, np.uint8)]) for t in tiles])
    cv2.imwrite(os.path.join(out_dir, f'sheet-{REF}-detect.jpg'), sheet_img, [cv2.IMWRITE_JPEG_QUALITY, 88])
    print(f'wrote sheet-{REF}.json, sheet-{REF}-curves.pkl, sheet-{REF}-detect.jpg in {out_dir} [{time.time() - t0:.0f} s]')


if __name__ == '__main__':
    main()
