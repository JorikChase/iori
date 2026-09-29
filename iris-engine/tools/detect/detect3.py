#!/usr/bin/env python3
"""study/11 §5.6 P3b — detect2's evidence and thresholds, with the tracking that did not overshoot on the real photo.

What detect2 got wrong on eye 26's real crypts (study/detect/detect2-26-real.png): its walks never ended — the real plateau's
texture is directionally coherent, a candidate in the right direction is always within reach, and a straight gap of 110 µm
let a walk run on through anything, across crypt edges, into star-shaped convergences. Here:
  · a walk is BOUNDED BY ITS REGION: it ends where it would step out of the crypt (or the plateau) it started in — deck and
    plateau strands meet at the edge, they do not run through it (bridges, which do, get their own pass later);
  · a gap is crossed ONLY UNDER AN OCCLUDER (iori's separator rule, 2026-09-27: "if one strand is separating other strands, the
    cut strands flow under it"): past GAP_JITTER_PX without evidence, the walk goes on only if, inside the gap, a strong
    candidate (z ≥ 1) runs at least OCC_MIN_DEG off its own direction — a strand across its path — and then no further than
    GAP_OCC_UM; the points in that gap are marked `under` (the strand passes beneath the one it crossed: over / under for L1).
usage: /usr/bin/python3 detect3.py 26   → calibrate on the null (study/detect/null3-26.json), score on the phantom beside today
"""
import os, sys, math, json
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import detect2 as d2

GAP_JITTER_PX = 2          # a gap this short is NMS jitter, crossed freely
GAP_OCC_UM = 60.0          # the longest gap crossed under an occluder (a 40 µm strand at ≈ 40°)
OCC_MIN_DEG = 34.0         # an occluder runs at least this far off the walk's direction (3 of 16 direction bins)


class Detector(d2.Detector):
    NULL_NAME = 'null3'

    def track(self, Z, best, keep, lo, hi, gap_px):
        K, H, W = Z.shape; cand = keep & (Z >= np.asarray(lo, np.float32)[best]); used = np.zeros_like(cand)
        strong = keep & (Z >= hi); region = getattr(self, '_region', None)
        region = region if region is not None and region.shape == (H, W) else np.zeros((H, W), bool)
        occ_bins = int(math.ceil(OCC_MIN_DEG / (180.0 / K))); gap_occ = GAP_OCC_UM / self.um
        ks, ys, xs = np.nonzero(cand & (Z >= hi)); order = np.argsort(-Z[ks, ys, xs]); curves = []; z0 = self.T.get('z0', 0.0) if self.T else 0.0
        def pick(p, k):
            xi, yi = int(round(p[0])), int(round(p[1])); bv, bc = -1, None
            for dk in (-1, 0, 1):
                kk = (k + dk) % K
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        x, y = xi + dx, yi + dy
                        if 0 <= x < W and 0 <= y < H and cand[kk, y, x] and not used[kk, y, x] and Z[kk, y, x] > bv: bv, bc = Z[kk, y, x], (x, y, kk)
            return bc
        def occluder(p, k):
            xi, yi = int(round(p[0])), int(round(p[1]))
            if not (0 <= xi < W and 0 <= yi < H): return False
            for kk in range(K):
                d = min((kk - k) % K, (k - kk) % K)
                if d >= occ_bins and strong[kk, max(0, yi - 1):yi + 2, max(0, xi - 1):xi + 2].any(): return True
            return False
        def mark(x, y, k):
            for dk in (-1, 0, 1): used[(k + dk) % K, max(0, y - 1):y + 2, max(0, x - 1):x + 2] = True
        def walk(x0, y0, k0, sgn):
            reg = region[y0, x0]; p = np.array([x0, y0], float); t = self.th[k0]; h = np.array([math.cos(t), math.sin(t)]) * sgn; k = k0
            pts, zs, sc, und = [], [], [], []; gap, pend, occ = 0, [], False; S, Smax, imax = 0.0, 0.0, 0
            while True:
                p = p + h
                if not (1 <= p[0] < W - 1 and 1 <= p[1] < H - 1): break
                if region[int(round(p[1])), int(round(p[0]))] != reg: break          # bounded by its region
                c = pick(p, k)
                if c is not None and math.hypot(c[0] - p[0], c[1] - p[1]) > 1.6: c = None
                if c is None:
                    gap += 1; pend.append(p.copy()); occ = occ or occluder(p, k)
                    if gap > GAP_JITTER_PX and not occ: break                       # no strand across the gap: the strand ends here
                    if gap > gap_occ: break
                    continue
                x, y, kk = c; q = np.array([x, y], float)
                tt = self.th[kk]; hn = np.array([math.cos(tt), math.sin(tt)]); hn = hn if hn @ h >= 0 else -hn
                if pend:
                    hidden = occ and len(pend) > GAP_JITTER_PX
                    pts += [pp.tolist() for pp in pend]; zs += [0.0] * len(pend); sc += [sc[-1] if sc else best[kk, y, x]] * len(pend); und += [hidden] * len(pend); pend = []
                p = 0.5 * p + 0.5 * q; h = 0.6 * h + 0.4 * hn; h /= np.linalg.norm(h); k = kk; gap = 0; occ = False
                zz = float(Z[kk, y, x]); pts.append(p.tolist()); zs.append(zz); sc.append(int(best[kk, y, x])); und.append(False); mark(x, y, kk)
                S += zz - z0
                if S > Smax: Smax, imax = S, len(pts)
                if S < Smax - d2.DROP: break
            return pts[:imax], zs[:imax], sc[:imax], und[:imax], Smax
        for i in order:
            k, y, x = ks[i], ys[i], xs[i]
            if used[k, y, x]: continue
            mark(x, y, k); f = walk(x, y, k, 1); b = walk(x, y, k, -1)
            curves.append({'xy': b[0][::-1] + [[float(x), float(y)]] + f[0], 'z': b[1][::-1] + [float(Z[k, y, x])] + f[1],
                           'scale': b[2][::-1] + [int(best[k, y, x])] + f[2], 'under': b[3][::-1] + [False] + f[3], 'score': f[4] + b[4] + float(Z[k, y, x]) - z0})
        return curves


if __name__ == '__main__':
    ref = sys.argv[1] if len(sys.argv) > 1 else '26'
    import baseline as B
    D = Detector.for_eye(ref, recalibrate='--recalibrate' in sys.argv)
    rows = B.run(ref, detector=lambda img, crypt, um: D(img, crypt), tag='detect3'); s = B.summary(rows)
    json.dump(s, open(os.path.join(d2.OUT, f'detect3-{ref}-summary.json'), 'w'), indent=1)
    base = json.load(open(os.path.join(d2.OUT, f'baseline-{ref}-summary.json'))); v2 = json.load(open(os.path.join(d2.OUT, f'detect2-{ref}-summary.json')))
    keys = ('recall', 'recall_chance', 'precision', 'precision_chance', 'fp_mm_per_mm2', 'whole', 'cross_over', 'cross_under')
    f = lambda d: ' · '.join('—' if d.get(k) is None else f"{d.get(k):.2f}" for k in keys)
    print('scenario: today | detect2 | detect3   (' + ' · '.join(keys) + ')')
    for sc in s['scenarios']: print(f'{sc:11s} {f(base["scenarios"].get(sc, {}))}  |  {f(v2["scenarios"].get(sc, {}))}  |  {f(s["scenarios"][sc])}')
