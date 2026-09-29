#!/usr/bin/env python3
"""study/11 §5.6 P3 — the new 2-D strand detector. Scored by ruler.py on the phantom against today's (baseline.py).

  1. EVIDENCE — an orientation score: elongated second-derivative-of-Gaussian filters across the strand, K directions × S
     widths, on the local-contrast image (each region — crypt, plateau — normalised by its OWN local mean, so a crypt's
     edge is not a ridge). Scale-normalised with σ^1.5 (Lindeberg's γ = 3/4 for ridges): the winning σ IS the strand's σ, so
     FWHM = 2.355 σ — no convention to calibrate. Two strands crossing answer in two directions: a crossing is not a junction.
  2. CANDIDATES — per direction, non-maximum suppression across the strand and across neighbouring directions: each point
     keeps (x, y, θ, width, strength); a crossing keeps both.
  3. TRACKING — in (x, y, θ): step along the heading, take the strongest candidate in the next position within ±1 direction
     and 1.5 px across; where there is none, go on straight up to GAP px (the strand under another, a short occlusion) and
     keep the run only if the strand is found again in line. A strand is followed through a crossing by construction.
  4. THRESHOLDS FROM THE NULL — the eye's own isotropic grain (phantom.speckle with its calibrated gains) run through the same
     bank: per width, the strength at the 99.9th / 99th percentile of the null's candidates sets the high / low threshold,
     and the shortest kept strand is the length at which the null's surviving false lines fall under NULL_DENSITY mm / mm².
usage: from detect2 import Detector; D = Detector.for_eye('26'); curves = D(pY, crypt_mask)
       /usr/bin/python3 detect2.py 26      → calibrate on the null, run on the phantom, score, compare with the baseline
"""
import os, sys, json, math
import numpy as np
import cv2
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
ENG = os.path.normpath(os.path.join(HERE, '..', '..')); OUT = os.path.join(ENG, 'study', 'detect')

K_DIRS = 16
FWHM_UM = [8, 12, 18, 27, 40, 60, 90]
ELONG = float(os.environ.get('D2_ELONG', 4.0))            # the filter's along-strand σ, in across σ (at least MIN_ALONG_PX): long enough to beat isotropic grain, short enough to bend
MIN_ALONG_PX = float(os.environ.get('D2_ALONG', 8.0))   # swept 2.5/5 · 4/8 · 6/12 on the phantom: 4/8 (study/11 §5.6 P3)
GAP_UM = 110.0         # the longest straight run without evidence a strand may cross (under a strand 40 µm wide at 30° ≈ 80 µm)
NULL_DENSITY = 0.3     # mm of false line per mm² of grain the calibration allows
LOCAL_UM = 65.0        # the local mean the contrast is taken against (abl_texture.py's)
FLANK_UM = 110.0       # how far out from a crypt's edge its shadow ramp reaches (the phantom's widest flank)
LO_PCT = float(os.environ.get('D2_LO', 80.0))          # the tracker follows evidence down to the null's 80th percentile; a curve is then accepted on its score Σ (z − z0)
DROP = float(os.environ.get('D2_DROP', 3.0))             # a walk ends where its running score has fallen this far below its peak (and is cut back to the peak)


def kernel(sigma, theta, along):
    """−∂²/∂v² of an anisotropic Gaussian (v across the strand at angle θ), zero-mean, scale-normalised σ^1.5"""
    h = int(math.ceil(3.5 * max(sigma, along))); y, x = np.mgrid[-h:h + 1, -h:h + 1].astype(np.float64)
    u = x * math.cos(theta) + y * math.sin(theta); v = -x * math.sin(theta) + y * math.cos(theta)
    g = np.exp(-u * u / (2 * along * along) - v * v / (2 * sigma * sigma)); g /= g.sum()
    k = -(v * v / sigma ** 4 - 1 / sigma ** 2) * g; k -= k.mean()
    return (k * sigma ** 1.5).astype(np.float32)


def local_contrast(pY, crypt, um):
    """relative contrast against the local mean of the pixel's OWN region (crypt or plateau)"""
    s = LOCAL_UM / um; out = np.zeros_like(pY, dtype=np.float32)
    for m in (crypt, ~crypt):
        if not m.any(): continue
        w = m.astype(np.float32); mean = cv2.GaussianBlur(pY * w, (0, 0), s) / np.maximum(cv2.GaussianBlur(w, (0, 0), s), 1e-4)
        out[m] = (pY[m] / np.maximum(mean[m], 1e-6) - 1)
    return out


class Detector:
    NULL_NAME = 'null'                                                              # the calibration file: study/detect/<NULL_NAME>-<eye>.json
    def __init__(self, um, thresholds=None, min_len_px=None):
        self.um = um; self.sig = [f / 2.355 / um for f in FWHM_UM]; self.th = [(k + 0.5) * math.pi / K_DIRS for k in range(K_DIRS)]
        self.bank = [[kernel(s, t, max(ELONG * s, MIN_ALONG_PX)) for t in self.th] for s in self.sig]
        self.T = thresholds; self.min_len_px = min_len_px; self.crypt_grain = 1.0

    # ---- 1. evidence: the response per scale and direction
    def responses(self, C):
        return np.stack([np.stack([cv2.filter2D(C, cv2.CV_32F, k, borderType=cv2.BORDER_REFLECT) for k in row]) for row in self.bank])   # (S, K, H, W)

    # ---- 2. candidates: normalised by the null per scale, best scale per (direction, pixel), NMS across and in θ
    def candidates(self, R, sign, region_gain=None):
        R = sign * R; S, K, H, W = R.shape
        best = R.argmax(0); Rb = np.take_along_axis(R, best[None], 0)[0]               # the scale is selected on the RAW response (σ^1.5 makes it the width)
        hi = np.asarray(self.T['hi'] if self.T else np.ones(S), np.float32); Z = Rb / hi[best]   # then judged against the null at that scale
        if region_gain is not None: Z = Z / region_gain[None]                         # each region against its OWN grain (the crypt floor's is measured)
        gy, gx = np.mgrid[0:H, 0:W].astype(np.float32); keep = np.zeros((K, H, W), bool)
        for k, t in enumerate(self.th):
            nx, ny = -math.sin(t), math.cos(t)
            a = cv2.remap(Z[k], gx + nx, gy + ny, cv2.INTER_LINEAR); b = cv2.remap(Z[k], gx - nx, gy - ny, cv2.INTER_LINEAR)
            keep[k] = (Z[k] >= a) & (Z[k] >= b)
        keep &= (Z >= np.roll(Z, 1, 0)) & (Z >= np.roll(Z, -1, 0))                   # a local maximum in direction too
        return Z, best, keep

    # ---- 3. tracking in (x, y, θ)
    def track(self, Z, best, keep, lo, hi, gap_px):
        K, H, W = Z.shape; cand = keep & (Z >= np.asarray(lo, np.float32)[best]); used = np.zeros_like(cand)
        ks, ys, xs = np.nonzero(cand & (Z >= hi)); order = np.argsort(-Z[ks, ys, xs]); curves = []
        def pick(p, k):
            xi, yi = int(round(p[0])), int(round(p[1])); bestv, bestc = -1, None
            for dk in (-1, 0, 1):
                kk = (k + dk) % K; t = self.th[kk]
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        x, y = xi + dx, yi + dy
                        if 0 <= x < W and 0 <= y < H and cand[kk, y, x] and not used[kk, y, x] and Z[kk, y, x] > bestv:
                            bestv, bestc = Z[kk, y, x], (x, y, kk)
            return bestc
        def mark(x, y, k):
            for dk in (-1, 0, 1):
                kk = (k + dk) % K
                used[kk, max(0, y - 1):y + 2, max(0, x - 1):x + 2] = True
        z0 = self.T.get('z0', 0.0) if self.T else 0.0
        def walk(x0, y0, k0, sgn):
            """step along the heading; the run's score is Σ (z − z0): grain (z ≈ z0) adds nothing, a strand adds steadily. The
            walk ends where the running sum has fallen DROP below its peak (or a gap exceeds gap_px) and is cut back to the peak."""
            p = np.array([x0, y0], float); t = self.th[k0]; h = np.array([math.cos(t), math.sin(t)]) * sgn; k = k0
            pts, zs, sc, gap, pend = [], [], [], 0, []; S, Smax, imax = 0.0, 0.0, 0
            while True:
                p = p + h
                if not (1 <= p[0] < W - 1 and 1 <= p[1] < H - 1): break
                c = pick(p, k)
                if c is not None and np.hypot(c[0] - p[0], c[1] - p[1]) > 1.6: c = None
                if c is None:
                    gap += 1; pend.append(p.copy())
                    if gap > gap_px: break
                    continue
                x, y, kk = c; q = np.array([x, y], float)
                tt = self.th[kk]; hn = np.array([math.cos(tt), math.sin(tt)]); hn = hn if hn @ h >= 0 else -hn
                if pend: pts += [pp.tolist() for pp in pend]; zs += [0.0] * len(pend); sc += [sc[-1] if sc else best[kk, y, x]] * len(pend); pend = []
                p = 0.5 * p + 0.5 * q; h = 0.6 * h + 0.4 * hn; h /= np.linalg.norm(h); k = kk; gap = 0
                zz = float(Z[kk, y, x]); pts.append(p.tolist()); zs.append(zz); sc.append(int(best[kk, y, x])); mark(x, y, kk)
                S += zz - z0
                if S > Smax: Smax, imax = S, len(pts)
                if S < Smax - DROP: break
            return pts[:imax], zs[:imax], sc[:imax], Smax
        for i in order:
            k, y, x = ks[i], ys[i], xs[i]
            if used[k, y, x]: continue
            mark(x, y, k)
            f = walk(x, y, k, 1); b = walk(x, y, k, -1)
            pts = b[0][::-1] + [[float(x), float(y)]] + f[0]; zs = b[1][::-1] + [float(Z[k, y, x])] + f[1]; sc = b[2][::-1] + [int(best[k, y, x])] + f[2]
            curves.append({'xy': pts, 'z': zs, 'scale': sc, 'score': f[3] + b[3] + float(Z[k, y, x]) - z0})
        return curves

    def __call__(self, pY, crypt, raw=False):
        crypt = crypt.astype(bool); self._region = crypt; C = local_contrast(pY.astype(np.float32), crypt, self.um); out = []
        # each region filtered on its own (the other region's contrast zeroed — its mean): no filter straddles a crypt's edge
        if crypt.any() and (~crypt).any():
            Rc, Rp = self.responses(np.where(crypt, C, 0).astype(np.float32)), self.responses(np.where(crypt, 0, C).astype(np.float32))
            R = np.where(crypt[None, None], Rc, Rp); del Rc, Rp
        else: R = self.responses(C)
        border = np.zeros_like(crypt)
        if crypt.any():                                                               # the edge itself and, on the plateau, the flank's ramp
            din = cv2.distanceTransform(crypt.astype(np.uint8), cv2.DIST_L2, 5); dout = cv2.distanceTransform((~crypt).astype(np.uint8), cv2.DIST_L2, 5)
            border = (din < 1.5) & crypt | (dout < 1.5) & ~crypt
            gx, gy = cv2.Sobel(dout, cv2.CV_32F, 1, 0), cv2.Sobel(dout, cv2.CV_32F, 0, 1); ea = np.arctan2(gy, gx) + np.pi / 2   # the edge's tangent
            flank = (~crypt) & (dout < FLANK_UM / self.um)
        gap_px = GAP_UM / self.um
        for sign, pol in ((1, 'bright'), (-1, 'dark')):
            Z, best, keep = self.candidates(R, sign, np.where(crypt, self.crypt_grain, 1.0).astype(np.float32) if crypt.any() else None); keep &= ~border[None]
            if pol == 'dark' and crypt.any():                                          # a dark line along the edge in the flank is its shadow ramp, not a valley
                for k, t in enumerate(self.th):
                    par = np.abs(np.sin(t - ea)) < math.sin(math.radians(25)); keep[k] &= ~(flank & par)
            for c in self.track(Z, best, keep, self.T['lo_z'], 1.0, gap_px):
                xy = np.asarray(c['xy']); L = np.hypot(*np.diff(xy, axis=0).T).sum() if len(xy) > 1 else 0
                zs = np.asarray(c['z']); ev = c['score']; zm = float(zs[zs > 0].mean()) if (zs > 0).any() else 0
                if not raw and ev < self.T['evidence']: continue
                fw = [FWHM_UM[s] for s in c['scale']]
                q = np.clip(np.round(xy).astype(int), 0, np.array(crypt.shape[::-1]) - 1); inside = crypt[q[:, 1], q[:, 0]].mean() if len(q) else 0
                cls = ('valley' if pol == 'dark' else ('deck' if inside > 0.5 else ('fine' if np.median(fw) < 25 else 'plateau')))
                if pol == 'bright' and 0.1 < inside < 0.9 and np.median(fw) >= 27 and not crypt[q[0, 1], q[0, 0]] and not crypt[q[-1, 1], q[-1, 0]]: cls = 'bridge'
                out.append({'xy': xy.tolist(), 'fwhm_um': fw, 'cls': cls, 'id': len(out), 'len_px': float(L), 'z': zm, 'evidence': ev})
        return out

    # ---- 4. thresholds from the eye's own grain
    @classmethod
    def for_eye(cls, ref, recalibrate=False):
        path = os.path.join(OUT, f'{cls.NULL_NAME}-{ref}{os.environ.get("D2_TAG", "")}.json')
        P = json.load(open(os.path.join(OUT, f'params-{ref}.json'))); D = cls(P['UM']); D.crypt_grain = P.get('cryptGrain', 1.0)
        if os.path.exists(path) and not recalibrate:
            c = json.load(open(path)); D.T = c['T']; D.min_len_px = 0; return D
        import phantom as ph
        P['_gains'], _ = ph.calibrate_gains(P); N = 512; R = np.random.default_rng(11)
        def null_img():
            img = (P['plateau'] * (1 + ph.speckle(P, N, R, P['_gains']))).astype(np.float32)
            img = cv2.GaussianBlur(img, (0, 0), ph.PSF_PX); return np.clip(img + R.normal(0, 0.0015, img.shape) + np.sqrt(np.maximum(img, 0) * 2e-5) * R.normal(0, 1, img.shape), 1e-5, 1).astype(np.float32)
        none = np.zeros((N, N), bool); m = np.zeros((N, N), bool); m[24:-24, 24:-24] = True
        # per scale: the null's candidate strengths (NMS across and in θ, both polarities)
        qs = [[], []]
        for _ in range(2):
            Rr = D.responses(local_contrast(null_img(), none, D.um))
            for sign in (1, -1):
                for s in range(Rr.shape[0]):
                    r = sign * Rr[s]; D.T = None
                    Zs = r; keep = np.zeros_like(r, bool); gy, gx = np.mgrid[0:N, 0:N].astype(np.float32)
                    for k, t in enumerate(D.th):
                        nx, ny = -math.sin(t), math.cos(t); a = cv2.remap(Zs[k], gx + nx, gy + ny, cv2.INTER_LINEAR); b = cv2.remap(Zs[k], gx - nx, gy - ny, cv2.INTER_LINEAR)
                        keep[k] = (Zs[k] >= a) & (Zs[k] >= b) & m
                    keep &= (Zs >= np.roll(Zs, 1, 0)) & (Zs >= np.roll(Zs, -1, 0))
                    v = Zs[keep]; v = v[v > 0]
                    while len(qs[0]) <= s: qs[0].append([]); qs[1].append([])
                    qs[0][s].append(np.percentile(v, 99.9)); qs[1][s].append(np.percentile(v, LO_PCT))
        hi = [float(np.mean(v)) for v in qs[0]]; lo = [float(np.mean(v)) for v in qs[1]]
        D.T = {'hi': hi, 'lo': lo, 'lo_z': [l / h for l, h in zip(lo, hi)], 'evidence': 0.0, 'z0': 0.0}
        # z0: the grain's own typical strength at a candidate the tracker may step on (its mean over the null's candidates above lo)
        zv = []
        for _ in range(2):
            img = null_img(); C0 = local_contrast(img, none, D.um); R0 = D.responses(C0)
            for sign in (1, -1):
                Z0, b0, k0 = D.candidates(R0, sign); v = Z0[k0 & (Z0 >= np.asarray(D.T['lo_z'], np.float32)[b0]) & m[None]]; zv.append(v)
        D.T['z0'] = float(np.concatenate(zv).mean())
        # acceptance: the integrated evidence at which the null's surviving lines fall under NULL_DENSITY mm / mm²
        evs = []; area = 0
        for _ in range(3):
            img = null_img(); cs = D(img, none, raw=True); area += ((N - 48) * D.um / 1000) ** 2
            evs += [(c['evidence'], c['len_px']) for c in cs if all(24 <= p[0] < N - 24 and 24 <= p[1] < N - 24 for p in c['xy'][::5])]
        evs.sort(key=lambda e: -e[0]); cum = np.cumsum([e[1] for e in evs]) * D.um / 1000 / area
        k = int(np.argmax(cum > NULL_DENSITY)) if (cum > NULL_DENSITY).any() else len(evs) - 1
        D.T['evidence'] = float(evs[k][0]) + 1e-3 if evs else 0.0; D.min_len_px = 0
        json.dump({'T': D.T, 'null_density': NULL_DENSITY, 'lo_pct': LO_PCT, 'drop': DROP, 'null_lines_raw_mm_per_mm2': round(float(cum[-1]) if len(cum) else 0, 2),
                   'src': 'detect2.py for_eye: the eye\'s isotropic grain (phantom.speckle, calibrated gains), 3 × 512² px'}, open(path, 'w'), indent=1)
        return D


if __name__ == '__main__':
    ref = sys.argv[1] if len(sys.argv) > 1 else '26'
    import baseline as B
    D = Detector.for_eye(ref, recalibrate='--recalibrate' in sys.argv)
    print('thresholds', {k: ([round(x, 3) for x in v] if isinstance(v, list) else round(v, 3)) for k, v in D.T.items()})
    rows = B.run(ref, detector=lambda img, crypt, um: D(img, crypt), tag='detect2'); s = B.summary(rows)
    json.dump(s, open(os.path.join(OUT, f'detect2-{ref}-summary.json'), 'w'), indent=1)
    base = json.load(open(os.path.join(OUT, f'baseline-{ref}-summary.json')))
    print('\nscenario: today → new   (recall · chance · precision · chance · false mm/mm² · whole · crossings over/under)')
    f = lambda d: ' · '.join('—' if d.get(k) is None else f"{d.get(k):.2f}" for k in ('recall', 'recall_chance', 'precision', 'precision_chance', 'fp_mm_per_mm2', 'whole', 'cross_over', 'cross_under'))
    for sc in s['scenarios']: print(f'{sc:11s} {f(base["scenarios"].get(sc, {}))}   →   {f(s["scenarios"][sc])}')
    print('\nclass: today → new   (recall · chance · width ratio)')
    g = lambda d: ' · '.join('—' if d.get(k) is None else f"{d.get(k):.2f}" for k in ('recall', 'recall_chance', 'width_ratio'))
    for c in s['classes']: print(f'{c:9s} {g(base["classes"].get(c, {}))}   →   {g(s["classes"][c])}')
