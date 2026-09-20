#!/usr/bin/env python3
"""S6 guide-scale measurement (study/08 §7): trace bundle/guide-scale ridges on the engine's own aligned,
exactly-scaled bench photos (dumped by fit.dumpForGuideTrace → ref/guide-dump-<eye>.json), and emit ridge
centrelines + width + brightness for `guide_trace_score.js` to rasterise and score against the photo's own
B1/B2 bands (fit.bandCorrOf) — the ceiling for a fitted-guide representation, before any renderer work.

    /usr/bin/python3 iris-engine/tools/guide_trace.py            # all ref/guide-dump-*.json

Unlike S0 (tools/strand_stats.py), these photos already carry the engine's own pose fit, so ppm (px/mm) is
exact, not assumed — no scale uncertainty. Guide scale from S0 (study/08 §4): width ≈ 111–130 µm, i.e. the
B1/B2 boundary; Hessian-ridge σ swept 30/42/60/85 µm (S0's `guide` population), converted to px by ppm.
Luminance is flattened by a 1 mm low-pass (matching fit.js's LOW_MM) before ridge detection, so a ridge is
found by *local* contrast, not by which zone of the iris it sits in.

Output: study/audit-s6/guide-trace-<eye>.json ({ridges: [{pts, width_px, val}], ppm, W, H}) and an overlay jpg.
"""
import cv2, glob, json, os, sys, base64
import numpy as np

ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = os.path.join(ENG, 'ref')
OUT = os.path.join(ENG, 'study', 'audit-s6')
GUIDE_UM = [30, 42, 60, 85]                # S0's guide population scales


def crossing(sk):
    p = np.pad(sk.astype(np.uint8), 1)
    P = [p[:-2, 1:-1], p[:-2, 2:], p[1:-1, 2:], p[2:, 2:], p[2:, 1:-1], p[2:, :-2], p[1:-1, :-2], p[:-2, :-2]]
    return sum(((P[i] == 0) & (P[(i + 1) % 8] == 1)).astype(np.int32) for i in range(8)) * (sk > 0)


def zhang_suen(img):
    a = img.astype(np.uint8).copy()
    def nb(a):
        p = np.pad(a, 1)
        return [p[:-2, 1:-1], p[:-2, 2:], p[1:-1, 2:], p[2:, 2:], p[2:, 1:-1], p[2:, :-2], p[1:-1, :-2], p[:-2, :-2]]
    while True:
        changed = False
        for step in (0, 1):
            P = nb(a); B = sum(P)
            A = sum(((P[i] == 0) & (P[(i + 1) % 8] == 1)).astype(np.uint8) for i in range(8))
            c = (P[0] * P[2] * P[4] == 0) & (P[2] * P[4] * P[6] == 0) if step == 0 else (P[0] * P[2] * P[6] == 0) & (P[0] * P[4] * P[6] == 0)
            rm = (a == 1) & (B >= 2) & (B <= 6) & (A == 1) & c
            if rm.any(): a[rm] = 0; changed = True
        if not changed: return a


def prune(skel, min_len):
    sk = skel.copy()
    for _ in range(3):
        deg = crossing(sk)
        junc = cv2.dilate(((deg >= 3) & (sk > 0)).astype(np.uint8), np.ones((3, 3), np.uint8))
        segs = ((sk > 0) & (junc == 0)).astype(np.uint8)
        n, lab, st, _ = cv2.connectedComponentsWithStats(segs, connectivity=8)
        ends = (deg == 1) & (sk > 0)
        has_end = np.zeros(n, bool); has_end[np.unique(lab[ends])] = True
        small = (st[:, cv2.CC_STAT_AREA] < min_len) & has_end; small[0] = False
        if not small.any(): break
        sk[small[lab]] = 0; sk = zhang_suen(sk)
    return sk


def ridge(L, sigmas):
    best = np.zeros_like(L); nx = np.zeros_like(L); ny = np.zeros_like(L)
    for s in sigmas:
        g = cv2.GaussianBlur(L, (0, 0), s)
        gxx = cv2.Sobel(g, cv2.CV_32F, 2, 0, ksize=3); gyy = cv2.Sobel(g, cv2.CV_32F, 0, 2, ksize=3); gxy = cv2.Sobel(g, cv2.CV_32F, 1, 1, ksize=3)
        tr, df = gxx + gyy, np.sqrt((gxx - gyy) ** 2 + 4 * gxy ** 2)
        l1, l2 = (tr - df) / 2, (tr + df) / 2
        R = np.where((l1 < 0) & (np.abs(l2) < 0.6 * np.abs(l1)), -l1, 0) * s * s
        th = 0.5 * np.arctan2(2 * gxy, gxx - gyy)
        ex, ey = np.cos(th + np.pi / 2), np.sin(th + np.pi / 2)
        d_a = gxx * ex * ex + 2 * gxy * ex * ey + gyy * ey * ey
        d_b = gxx * ey * ey - 2 * gxy * ex * ey + gyy * ex * ex
        sw = d_b < d_a
        ex2, ey2 = np.where(sw, -ey, ex), np.where(sw, ex, ey)
        up = R > best
        best[up] = R[up]; nx[up] = ex2[up]; ny[up] = ey2[up]
    return best, nx, ny


def order_path(ys, xs):
    pts = list(zip(ys.tolist(), xs.tolist())); S = set(pts)
    def nbrs(p): return [(p[0] + dy, p[1] + dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if (dy or dx) and (p[0] + dy, p[1] + dx) in S]
    start = next((p for p in pts if len(nbrs(p)) == 1), pts[0])
    path, seen = [start], {start}
    while True:
        nx = [q for q in nbrs(path[-1]) if q not in seen]
        if not nx: break
        q = min(nx, key=lambda q: abs(q[0] - path[-1][0]) + abs(q[1] - path[-1][1]))
        path.append(q); seen.add(q)
    return np.array(path, np.float64)


def trace(path, sigmas_um=None, invert=False, tag='guide-trace', out_dir=None):
    # sigmas_um / invert / tag / out_dir (study/08 §8): the same tracer at another scale, or on the valleys (dark gaps)
    # instead of the ridges. The defaults reproduce §7's traces exactly.
    d = json.load(open(path))
    ident, ppm, W, H = d['file'][:2], d['ppm'], d['W'], d['H']
    photo = cv2.imdecode(np.frombuffer(base64.b64decode(d['photoPNG'].split(',')[1]), np.uint8), cv2.IMREAD_COLOR)
    mrgba = cv2.imdecode(np.frombuffer(base64.b64decode(d['maskPNG'].split(',')[1]), np.uint8), cv2.IMREAD_UNCHANGED)
    mask = mrgba[..., 3] > 127
    # luminance exactly as fit.js's lumOf (BGR order swapped to R,G,B weights)
    L = (0.114 * photo[..., 0] + 0.587 * photo[..., 1] + 0.299 * photo[..., 2]).astype(np.float32) / 255.0
    low = cv2.GaussianBlur(L, (0, 0), 1.0 * ppm / 5.3)                 # 1 mm low-pass, matches fit.js LOW_MM
    flat = (L - low) / (low + 0.02) + 0.5                              # a flattened field, ridge-detector friendly
    if invert: flat = 1.0 - flat
    sig = [max(0.9, um / 1000 * ppm) for um in (sigmas_um or GUIDE_UM)]
    R, nx, ny = ridge(flat, sig)
    H0, W0 = flat.shape
    gy, gx = np.mgrid[0:H0, 0:W0].astype(np.float32)
    Rs = cv2.GaussianBlur(R, (0, 0), max(0.8, 0.35 * sig[0]))
    st = max(1.0, 0.5 * sig[0])
    Ra = cv2.remap(Rs, gx + st * nx, gy + st * ny, cv2.INTER_LINEAR); Rb = cv2.remap(Rs, gx - st * nx, gy - st * ny, cv2.INTER_LINEAR)
    vals = R[mask & (R > 0)]
    hi, lo = np.percentile(vals, 78), np.percentile(vals, 45)
    cand = ((Rs >= Ra) & (Rs >= Rb) & (R > lo) & mask).astype(np.uint8)
    cand = cv2.dilate(cand, np.ones((2, 2), np.uint8))
    n0, l0 = cv2.connectedComponents(cand, connectivity=8)
    strong = np.zeros(n0, bool); strong[np.unique(l0[(R > hi) & (cand > 0)])] = True; strong[0] = False
    sk = zhang_suen(strong[l0].astype(np.uint8))
    sk = prune(sk, int(round(3 * sig[0] + 4)))
    deg = crossing(sk)
    jmask = ((deg >= 3) & (sk > 0)).astype(np.uint8)
    segm = ((sk > 0) & (cv2.dilate(jmask, np.ones((3, 3), np.uint8)) == 0)).astype(np.uint8)
    n, lab = cv2.connectedComponents(segm, connectivity=8)
    overlay = photo.copy(); overlay[~mask] = (overlay[~mask] * 0.4).astype(np.uint8)
    ridges = []
    reach = int(round(6 * sig[-1] + 6))
    for s in range(1, n):
        yy, xx = np.nonzero(lab == s)
        if len(yy) < 6: continue
        p = order_path(yy, xx)
        if len(p) >= 9:
            k5 = np.ones(5) / 5; p = np.c_[np.convolve(p[:, 0], k5, 'valid'), np.convolve(p[:, 1], k5, 'valid')]
        if len(p) < 4: continue
        widths, vals_r, val_idx = [], [], []
        step = max(1, len(p) // 60)   # denser along-ridge sampling: brightness modulates along the length, not just across it
        for i in range(0, len(p), step):
            y, x = int(round(p[i, 0])), int(round(p[i, 1]))
            if not (0 <= y < H0 and 0 <= x < W0): continue
            ex, ey = nx[y, x], ny[y, x]
            t = np.arange(-reach, reach + 1)
            px, py = x + t * ex, y + t * ey
            ok = (px >= 0) & (px < W0 - 1) & (py >= 0) & (py < H0 - 1)
            if ok.sum() < len(t): continue
            prof = flat[np.round(py).astype(int), np.round(px).astype(int)]
            c = reach; peak = prof[c]; base = max(prof[:c].min(), prof[c + 1:].min())
            if peak - base <= 0.015: continue
            half = base + 0.5 * (peak - base); l = c
            while l > 0 and prof[l] > half: l -= 1
            r = c
            while r < len(prof) - 1 and prof[r] > half: r += 1
            if l > 0 and r < len(prof) - 1: widths.append((r - l) / ppm)
            lprof = L[np.round(py).astype(int), np.round(px).astype(int)]
            vals_r.append(float(lprof[c])); val_idx.append(i)
        if not widths or len(vals_r) < 2: continue
        pts_xy = [[float(p[i, 1]), float(p[i, 0])] for i in range(len(p))]
        w = float(np.median(widths))
        # per-point brightness (real strands modulate along their length, not just across it): the sampled
        # points at val_idx, linearly interpolated onto every path point
        vpt = np.interp(np.arange(len(p)), val_idx, vals_r)
        val_med = float(np.median(vals_r))
        ridges.append({'pts': pts_xy, 'width_mm': round(w, 4), 'val': round(val_med, 4),
                        'vals': [round(float(x), 4) for x in vpt], 'len_mm': round((len(p) - 1) / ppm, 3)})
        for (yy0, xx0) in p.astype(int):
            if 0 <= yy0 < H0 and 0 <= xx0 < W0: overlay[yy0, xx0] = (0, 255, 255)
    out_dir = out_dir or OUT
    os.makedirs(out_dir, exist_ok=True)
    cv2.imwrite(os.path.join(out_dir, '%s-%s-overlay.jpg' % (tag, ident)), overlay, [cv2.IMWRITE_JPEG_QUALITY, 90])
    out = {'eye': d['file'], 'ppm': ppm, 'W': W, 'H': H, 'sigmas_px': [round(x, 2) for x in sig],
           'gapVal': round(float(L[mask].mean() - L[mask].std() * 0.3), 4), 'ridges': ridges}
    json.dump(out, open(os.path.join(out_dir, '%s-%s.json' % (tag, ident)), 'w'))
    print(ident, tag, 'ridges', len(ridges), 'total mm', round(sum(r['len_mm'] for r in ridges), 1),
          'median width um', round(1000 * np.median([r['width_mm'] for r in ridges]), 1) if ridges else None,
          'mask mm2', round(mask.sum() / ppm ** 2, 1))
    return out


if __name__ == '__main__':
    files = sys.argv[1:] or sorted(glob.glob(os.path.join(REF, 'guide-dump-*.json')))
    files = [f for f in files if not f.endswith('done.json')]
    for f in files: trace(f)
