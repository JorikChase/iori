#!/usr/bin/env python3
"""study/11 §5.6 P2 — the ruler's phantom: iris-like tiles whose every strand, crypt, bridge and crossing is KNOWN.

Why a phantom and not a render of a fitted eye: a fitted eye's primitives ARE today's detections, so scoring a detector
on its render measures agreement with today's detector, not with the tissue. Here the truth is drawn first and the image
is made from it, on each photo's own measured terms (`measure`): its µm per pixel, the plateau's and the crypt floor's
luminance, the plateau's ISOTROPIC speckle (tools/abl_texture.py, band by band), and the strand contrasts the photo shows.

Image model (linear luminance, the fitter's pY):
  ground   plateau level, or the crypt floor inside a crypt (a hard edge in plan, 8 µm); the FLANK: the plateau beside a crypt
           darkened toward the edge (a measured share, over 30–110 µm) — the slope in the ABL's shadow
  strands  a Gaussian profile across (FWHM = the strand's width), drawn in z order OVER what is below: L = L (1 − g) + Ls g,
           Ls = the local ground level × (1 + c) — so where two strands cross the upper one is continuous and the lower one
           vanishes under it, as in a weave. Valleys (dark lines) multiply: L ·= 1 − c g.
  bundles  broad radial bundles (bright) and troughs (dark), 45–110 µm, modulating the plateau's ground: the photo's directional
           18–75 µm energy (their contrast calibrated so the phantom's bands match the photo's total band rms)
  bridge   a wide bright strand from plateau across a crypt to plateau, drawn last, with its shadow on the floor
  speckle  isotropic, the photo's band rms measured the photo's way (calibrate_gains; ×0.7 on the floor), multiplicative;
           then a 0.6 px PSF and sensor noise
Ground truth per tile (JSON): every curve (px, per-sample FWHM µm, contrast, class, z, visible flag per sample), the
crossings (who is over), the crypt polygons, the bridges; the flank as a PNG mask.

usage: /usr/bin/python3 phantom.py measure 26          → study/detect/params-26.json (needs the sheet dump, local only)
       /usr/bin/python3 phantom.py build 26 [--seeds 3] → study/detect/phantom-26/<scenario>-<seed>.{npy,json,png}
"""
import os, sys, json, math
import numpy as np
import cv2

ENG = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
OUT = os.path.join(ENG, 'study', 'detect')
TILE_MM = 2.0
CLS_BRIGHT = ('plateau', 'fine', 'deck', 'bridge')


# ------------------------------------------------------------------ measurement (once per eye, from the sheet dump)
def measure(ref):
    import pickle
    d = pickle.load(open(os.path.join(ENG, 'study/proof-layers/sheet', f'sheet-{ref}.pkl'), 'rb'))
    tex = json.load(open(os.path.join(ENG, 'study/proof-layers/sheet', f'abltex-{ref}.json')))
    pY, sd, UM, inner = d['pY'].astype(np.float32), d['sd'], float(d['UM']), d['inner']
    G = lambda s: cv2.GaussianBlur(pY, (0, 0), s)
    Ln, Lg = G(1.5) / np.maximum(G(14), 1e-4), G(2) / np.maximum(G(14), 1e-4)
    at = lambda paths, img: np.concatenate([img[np.asarray(p)[:, 0].astype(int), np.asarray(p)[:, 1].astype(int)] for p in paths])
    pct = lambda v: [round(float(x), 3) for x in np.percentile(v, [10, 50, 90])]
    plate = float(np.median(pY[(sd < -20) & inner])); floor = float(np.median(pY[sd > 8]))
    # the flank: the plateau's darkening against the distance from the crypt edge (median profile), for the phantom's shadow
    prof = [round(float(np.median(pY[(sd <= -a) & (sd > -a - 4) & inner]) / plate), 3) for a in range(0, 48, 4)]
    P = {'ref': ref, 'UM': round(UM, 4), 'plateau': round(plate, 5), 'floor': round(floor, 5), 'floorRel': round(floor / plate, 3),
         'bands': [{'um': b['band_um'], 'iso_rms': b['iso_rms']} for b in tex['bands']],
         'contrast': {'guide': pct(at(d['gpaths'], Lg)), 'fine': pct(at(d['sfp'], Ln)), 'deck': pct(at(d['fpaths'], Ln))},
         'flankProfile': {'px_step': 4, 'rel': prof},
         'src': 'phantom.py measure: sheet dump + abltex (study/11 §5.6 P2)'}
    os.makedirs(OUT, exist_ok=True); json.dump(P, open(os.path.join(OUT, f'params-{ref}.json'), 'w'), indent=1); print(json.dumps(P, indent=1))


# ------------------------------------------------------------------ geometry helpers
def smooth_curve(R, start, heading, length_px, wave_px, lam_px=60.0, step=1.0, turn=0.02):
    """a gently wandering curve: its heading drifts (a random walk damped back to its mean), plus a sine wave across"""
    n = max(2, int(length_px / step)); h0 = heading; h = heading; p = np.array(start, float); pts = [p.copy()]
    for i in range(n):
        h += R.normal(0, turn) - 0.05 * (h - h0)
        p = p + step * np.array([math.cos(h), math.sin(h)]); pts.append(p.copy())
    pts = np.array(pts)
    if wave_px > 0:
        t = np.r_[0, np.cumsum(np.hypot(*np.diff(pts, axis=0).T))]; nrm = np.gradient(pts, axis=0)[:, ::-1] * [1, -1]
        nrm /= np.maximum(np.hypot(*nrm.T), 1e-9)[:, None]; pts = pts + nrm * (wave_px * np.sin(R.uniform(0, 6.28) + 6.283 * t / max(lam_px, 8)))[:, None]
    return pts


def blob(R, centre, r_px, lobes=4, amp=0.28, n=256):
    """a crypt outline: a radius with a few random harmonics (lobes), closed"""
    th = np.linspace(0, 2 * np.pi, n, endpoint=False); r = np.ones(n)
    for k in range(2, 2 + lobes): r += R.uniform(-amp, amp) / k ** 0.6 * np.cos(k * th + R.uniform(0, 6.28))
    aspect = R.uniform(0.55, 1.0); rot = R.uniform(0, np.pi)
    x, y = r * np.cos(th), aspect * r * np.sin(th)
    return np.stack([centre[0] + r_px * (x * math.cos(rot) - y * math.sin(rot)), centre[1] + r_px * (x * math.sin(rot) + y * math.cos(rot))], 1)


def dist_to_polyline(xy, H, W, pad):
    """distance (px) from every pixel of the curve's bounding box to the curve (resampled every 0.5 px, KD-tree), the box,
    and the curve's own sample index (fractional) nearest to each pixel"""
    from scipy.spatial import cKDTree
    x0, y0 = max(0, int(xy[:, 0].min() - pad)), max(0, int(xy[:, 1].min() - pad)); x1, y1 = min(W, int(xy[:, 0].max() + pad) + 1), min(H, int(xy[:, 1].max() + pad) + 1)
    if x1 <= x0 or y1 <= y0 or len(xy) < 2: return None, None, None
    seg = np.hypot(*np.diff(xy, axis=0).T); t = np.r_[0, np.cumsum(seg)]; m = max(2, int(t[-1] / 0.5) + 1); ts = np.linspace(0, t[-1], m)
    q = np.stack([np.interp(ts, t, xy[:, 0]), np.interp(ts, t, xy[:, 1])], 1); idx = np.interp(ts, t, np.arange(len(xy)))
    yy, xx = np.mgrid[y0:y1, x0:x1]; d, k = cKDTree(q).query(np.stack([xx.ravel() + 0.5, yy.ravel() + 0.5], 1), distance_upper_bound=pad + 1)
    d = np.where(np.isfinite(d), d, 1e9).reshape(xx.shape).astype(np.float32); k = np.minimum(k, m - 1)
    return d, (x0, y0, x1, y1), idx[k].reshape(xx.shape)


# ------------------------------------------------------------------ the grain: the photo's isotropic speckle, band for band
def band_rms(img, mask, UM, bands):
    """the band rms of the local-contrast image, EXACTLY as tools/abl_texture.py measures the photo: Ln = L / its 65 µm
    Gaussian mean, band = Gσ=a/UM − Gσ=b/UM (σ in px = the band's µm over µm/px)"""
    Ln = img / np.maximum(cv2.GaussianBlur(img, (0, 0), 65.0 / UM), 1e-6)
    return [float(np.sqrt(((cv2.GaussianBlur(Ln, (0, 0), b0 / UM) - cv2.GaussianBlur(Ln, (0, 0), b1 / UM))[mask] ** 2).mean())) for b0, b1 in [bd['um'] for bd in bands]]

def speckle(P, N, R, gains):
    """a relative field: independent white noise band-passed in the photo's four bands, each × its gain"""
    UM, n = P['UM'], np.zeros((N, N), np.float32)
    for g, bd in zip(gains, P['bands']):
        w = R.normal(0, 1, (N, N)).astype(np.float32); n += g * (cv2.GaussianBlur(w, (0, 0), bd['um'][0] / UM) - cv2.GaussianBlur(w, (0, 0), bd['um'][1] / UM))
    return n

PSF_PX = 0.6
def calibrate_gains(P, N=600, iters=5):
    """the gains for which a strand-free plateau, blurred by the PSF, measures the photo's isotropic band rms — each band
    rescaled by target / measured, repeated (the bands overlap)"""
    R = np.random.default_rng(7); target = np.array([bd['iso_rms'] for bd in P['bands']]); g = target * 3.0
    m = np.zeros((N, N), bool); m[40:-40, 40:-40] = True; seed_state = R.bit_generator.state
    for _ in range(iters):
        R.bit_generator.state = seed_state
        img = cv2.GaussianBlur((P['plateau'] * (1 + speckle(P, N, R, g))).astype(np.float32), (0, 0), PSF_PX)
        meas = np.array(band_rms(img, m, P['UM'], P['bands'])); g = g * target / np.maximum(meas, 1e-6)
    R.bit_generator.state = seed_state
    img = cv2.GaussianBlur((P['plateau'] * (1 + speckle(P, N, R, g))).astype(np.float32), (0, 0), PSF_PX)
    return [float(x) for x in g], [round(x, 4) for x in band_rms(img, m, P['UM'], P['bands'])]


# ------------------------------------------------------------------ the tile
class Tile:
    def __init__(self, P, seed, name):
        self.P, self.R, self.name = P, np.random.default_rng(seed), name
        self.UM = P['UM']; self.N = int(round(TILE_MM * 1000 / self.UM)); N = self.N
        self.crypt = np.zeros((N, N), np.uint8); self.curves = []; self.crypts = []; self.valleys = []
    def um(self, v): return v / self.UM                                   # µm → px
    def add_crypt(self, centre, r_um, lobes=4):
        poly = blob(self.R, centre, self.um(r_um), lobes); cv2.fillPoly(self.crypt, [np.round(poly * 16).astype(np.int32)], 1, cv2.LINE_8, 4)
        self.crypts.append(poly); return poly
    def add(self, xy, cls, fwhm_um, c, z=None):
        fw = np.broadcast_to(np.asarray(fwhm_um, float), (len(xy),)).copy()
        self.curves.append({'id': len(self.curves), 'xy': np.asarray(xy, float), 'fwhm': fw, 'c': float(c), 'cls': cls, 'z': float(self.R.uniform() if z is None else z)})
    def render(self):
        P, R, N, UM = self.P, self.R, self.N, self.UM
        crypt = self.crypt.astype(bool)
        sdc = cv2.distanceTransform((~crypt).astype(np.uint8), cv2.DIST_L2, 5)           # px from the crypt, outside it
        # ground: plateau, the floor inside crypts (a hard 8 µm edge), the flank's shadow outside them
        edge = cv2.GaussianBlur(crypt.astype(np.float32), (0, 0), max(0.6, self.um(8) / 2.355))
        ground = P['plateau'] * (1 - edge) + P['floor'] * edge
        self.flank_w = self.R.uniform(30, 110); self.flank_d = self.R.uniform(0.12, 0.35)   # µm wide, how much darker at the edge
        shade = 1 - self.flank_d * np.exp(-sdc / self.um(self.flank_w / 2.0)) * (~crypt) if self.crypts else np.ones((N, N), np.float32)
        ground = (ground * shade).astype(np.float32)
        for c in [c for c in self.curves if c['cls'] in ('bundle', 'trough')]:     # broad bundles and troughs: part of the ground the strands lie on
            fw_px = self.um(c['fwhm']); d, box, tpar = dist_to_polyline(c['xy'], N, N, 2.5 * fw_px.max() + 3)
            if d is None: continue
            x0, y0, x1, y1 = box; g = np.exp(-4 * math.log(2) * (d / np.interp(tpar, np.arange(len(fw_px)), fw_px)) ** 2)
            ground[y0:y1, x0:x1] *= 1 + (c['c'] if c['cls'] == 'bundle' else -c['c']) * g * (1 - edge[y0:y1, x0:x1])
        L = ground.copy()
        self.flank = ((shade < 0.82) & ~crypt).astype(np.uint8)
        # valleys first (dark lines in the ground), then strands in z order (the upper replaces the lower), bridges last
        order = sorted([c for c in self.curves if c['cls'] not in ('bundle', 'trough')], key=lambda c: (c['cls'] == 'bridge', c['cls'] != 'valley', c['z']))
        for c in order:
            fw_px = self.um(c['fwhm']); pad = 2.5 * fw_px.max() + 3
            d, box, tpar = dist_to_polyline(c['xy'], N, N, pad)
            if d is None: continue
            x0, y0, x1, y1 = box; fwl = np.interp(tpar, np.arange(len(fw_px)), fw_px)
            g = np.exp(-4 * math.log(2) * (d / np.maximum(fwl, 0.5)) ** 2)
            # round ends: the profile fades over one width past the curve's ends (tpar clipped there already gives a cap)
            if c['cls'] == 'deck': g = g * edge[y0:y1, x0:x1]                    # past the crypt's edge a deck strand runs under the ABL: not seen
            if c['cls'] == 'valley': L[y0:y1, x0:x1] *= 1 - c['c'] * g
            else:
                Ls = ground[y0:y1, x0:x1] * (1 + c['c']) if c['cls'] != 'bridge' else P['plateau'] * (1 + c['c'])
                L[y0:y1, x0:x1] = L[y0:y1, x0:x1] * (1 - g) + Ls * g
            if c['cls'] == 'bridge':                                     # its shadow on the floor, offset away from the light
                sh = c.get('shadow', (self.um(40), self.um(55))); M = np.float32([[1, 0, sh[0]], [0, 1, sh[1]]])
                gs = np.zeros((N, N), np.float32); gs[y0:y1, x0:x1] = g; gs = cv2.warpAffine(gs, M, (N, N))
                L = np.where(crypt, L * (1 - 0.45 * gs), L).astype(np.float32)
        # visibility of each GT sample: covered by a higher strand's core (g > 0.5 of a strand drawn after it) → hidden
        self.visibility(order)
        # speckle: the photo's isotropic band rms (calibrate_gains, measured as abl_texture.py measures the photo); the floor 0.7 of it
        n = speckle(P, N, R, P['_gains'])
        L = L * (1 + n * np.where(crypt, 0.7, 1.0))
        L = cv2.GaussianBlur(L.astype(np.float32), (0, 0), PSF_PX)
        L = np.clip(L + R.normal(0, 0.0015, L.shape) + np.sqrt(np.maximum(L, 0) * 2e-5) * R.normal(0, 1, L.shape), 1e-5, 1).astype(np.float32)
        self.img = L; return L
    def visibility(self, order):
        N = self.N; cover = np.full((N, N), -1, np.int32)
        for rank, c in enumerate(order):
            if c['cls'] == 'valley': continue
            d, box, _ = dist_to_polyline(c['xy'], N, N, 1 + self.um(c['fwhm'].max()))
            if d is None: continue
            x0, y0, x1, y1 = box; core = d < 0.5 * self.um(np.median(c['fwhm']))
            sub = cover[y0:y1, x0:x1]; sub[core] = rank
        rank_of = {c['id']: r for r, c in enumerate(order)}
        for c in self.curves:
            q = np.round(c['xy']).astype(int); ok = (q[:, 0] >= 0) & (q[:, 1] >= 0) & (q[:, 0] < N) & (q[:, 1] < N); vis = np.zeros(len(q), bool)
            top = cover[np.clip(q[:, 1], 0, N - 1), np.clip(q[:, 0], 0, N - 1)]
            vis[ok] = (top[ok] <= rank_of.get(c['id'], 1 << 30)) | (c['cls'] == 'valley')
            if c['cls'] in ('bundle', 'trough'): vis = ok & (self.crypt[np.clip(q[:, 1], 0, N - 1), np.clip(q[:, 0], 0, N - 1)] == 0)
            if c['cls'] == 'deck': vis &= self.crypt[np.clip(q[:, 1], 0, N - 1), np.clip(q[:, 0], 0, N - 1)] > 0   # under the ABL past the edge: hidden
            c['vis'] = vis
    def crossings(self):
        out = []; bright = [c for c in self.curves if c['cls'] not in ('valley', 'bundle', 'trough')]
        from scipy.spatial import cKDTree
        for i, a in enumerate(bright):
            ta = cKDTree(a['xy'])
            for b in bright[i + 1:]:
                pr = ta.query_ball_point(b['xy'], 1.0)
                hits = [(k, j) for j, ks in enumerate(pr) for k in ks]
                if not hits: continue
                k, j = hits[len(hits) // 2]
                over = a['id'] if (a['cls'] == 'bridge') > (b['cls'] == 'bridge') or ((a['cls'] == 'bridge') == (b['cls'] == 'bridge') and a['z'] > b['z']) else b['id']
                ga = np.gradient(a['xy'], axis=0)[k]; gb = np.gradient(b['xy'], axis=0)[j]
                ang = math.degrees(math.acos(min(1, abs(float(ga @ gb) / (np.linalg.norm(ga) * np.linalg.norm(gb) + 1e-9)))))
                out.append({'a': a['id'], 'ia': int(k), 'b': b['id'], 'ib': int(j), 'over': over, 'angle': round(ang, 1), 'xy': [round(float(x), 2) for x in a['xy'][k]]})
        return out
    def save(self, d):
        os.makedirs(d, exist_ok=True); base = os.path.join(d, self.name)
        np.save(base + '.npy', self.img)
        gt = {'name': self.name, 'UM': self.UM, 'N': self.N, 'params': self.P['ref'], 'flank': {'w_um': round(self.flank_w, 1), 'dark': round(self.flank_d, 3)},
              'curves': [{'id': c['id'], 'cls': c['cls'], 'c': round(c['c'], 4), 'z': round(c['z'], 3), 'xy': np.round(c['xy'], 2).tolist(), 'fwhm_um': np.round(c['fwhm'], 1).tolist(), 'vis': c['vis'].astype(int).tolist()} for c in self.curves],
              'crossings': self.crossings(), 'crypts': [np.round(p, 2).tolist() for p in self.crypts]}
        json.dump(gt, open(base + '.json', 'w'))
        cv2.imwrite(base + '-crypt.png', self.crypt * 255); cv2.imwrite(base + '-flank.png', self.flank * 255)
        v = np.clip(self.img / (self.P['plateau'] * 1.8), 0, 1); v = np.where(v <= 0.0031308, 12.92 * v, 1.055 * v ** (1 / 2.4) - 0.055)
        cv2.imwrite(base + '.png', (v * 255).astype(np.uint8))


# ------------------------------------------------------------------ scenarios
def draw(lo, hi, R, n=None, log=True):
    return float(math.exp(R.uniform(math.log(lo), math.log(hi)))) if log else float(R.uniform(lo, hi))

def plateau_strands(T, n, region=None, flow=-math.pi / 2):
    R, N = T.R, T.N
    for _ in range(n):
        fine = R.uniform() < 0.55
        w = draw(10, 25, R) if fine else draw(25, 60, R); c = draw(0.06, 0.45, R) if fine else draw(0.08, 0.55, R)
        start = (R.uniform(0.05, 0.95) * N, R.uniform(0.2, 1.1) * N)
        xy = smooth_curve(R, start, flow + R.normal(0, 0.25), T.um(draw(200, 1400, R)), T.um(R.uniform(0, 8)), T.um(R.uniform(200, 450)))
        if region is not None:                                                   # keep only the runs outside the crypts (plateau strands end at the edge)
            q = np.clip(np.round(xy).astype(int), 0, N - 1); keep = region[q[:, 1], q[:, 0]] == 0
            runs = np.split(np.arange(len(xy)), np.where(np.diff(keep.astype(int)) != 0)[0] + 1)
            for r_ in runs:
                if keep[r_[0]] and len(r_) > T.um(80): T.add(xy[r_], 'fine' if fine else 'plateau', w, c)
        else: T.add(xy, 'fine' if fine else 'plateau', w, c)

BUNDLE_W = (45, 110)            # µm: the scale of the photo's DIRECTIONAL 18–75 µm band energy (wider is absorbed by its 65 µm local mean)
BUNDLE_C = (0.05, 0.55)         # contrast range, and BUNDLE_N per 2 mm tile: calibrated on eye 26 so the phantom's four bands match the
BUNDLE_N = 44                   # photo's TOTAL band rms (0.127 0.093 0.085 0.072 against 0.126 0.094 0.088 0.072, three seeds) — the
                                # plateau of the photo is densely streaked; the isotropic grain alone gave 0.064 / 0.049 in the last two
def bundles(T, n, region=None):
    """broad radial bundles (bright) and troughs (dark) of the plateau, 45–110 µm across, long — the photo's 18–75 µm
    energy that is directional (abltex: about half of it)"""
    R, N = T.R, T.N
    for k in range(n):
        xy = smooth_curve(R, (R.uniform(-0.05, 1.05) * N, 1.15 * N), -math.pi / 2 + R.normal(0, 0.12), 1.3 * N, T.um(R.uniform(0, 30)), T.um(R.uniform(500, 1200)), step=2.0, turn=0.01)
        T.add(xy, 'bundle' if k % 2 == 0 else 'trough', draw(*BUNDLE_W, R), draw(*BUNDLE_C, R))

def valleys(T, n, inside=None):
    R, N = T.R, T.N
    for _ in range(n):
        start = (R.uniform(0.05, 0.95) * N, R.uniform(0.2, 1.0) * N)
        xy = smooth_curve(R, start, -math.pi / 2 + R.normal(0, 0.3), T.um(draw(150, 700, R)), T.um(R.uniform(0, 5)), T.um(R.uniform(200, 450)))
        if inside is not None:                                                   # the longest run inside
            q = np.clip(np.round(xy).astype(int), 0, N - 1); m = inside[q[:, 1], q[:, 0]] > 0
            runs = [r_ for r_ in np.split(np.arange(len(xy)), np.where(np.diff(m.astype(int)) != 0)[0] + 1) if m[r_[0]]]
            if not runs: continue
            r_ = max(runs, key=len)
            if len(r_) < T.um(60): continue
            xy = xy[r_]
        T.add(xy, 'valley', draw(10, 22, R), draw(0.1, 0.35, R))

def deck(T, n, spread=0.7):
    R, N = T.R, T.N; ys, xs = np.nonzero(T.crypt)
    if not len(xs): return
    for _ in range(n):
        k = R.integers(len(xs)); h = -math.pi / 2 + R.normal(0, spread)
        xy = smooth_curve(R, (xs[k], ys[k]), h, T.um(draw(150, 900, R)), T.um(R.uniform(0, 6)), T.um(R.uniform(200, 450)))
        xy = np.vstack([smooth_curve(R, (xs[k], ys[k]), h + math.pi, T.um(draw(80, 500, R)), 0)[::-1], xy[1:]])   # both ways from the seed
        T.add(xy, 'deck', draw(15, 45, R), draw(0.25, 1.6, R))

def bridge(T, crypt_poly):
    R, N = T.R, T.N; c = crypt_poly.mean(0); ang = R.uniform(0, math.pi); d = np.array([math.cos(ang), math.sin(ang)])
    span = np.ptp(crypt_poly @ d) * 0.5 + T.um(120)
    a, b = c - d * span, c + d * span; n = int(np.linalg.norm(b - a))
    t = np.linspace(0, 1, n)[:, None]; xy = a + (b - a) * t + np.array([-d[1], d[0]]) * T.um(R.uniform(-40, 40)) * np.sin(np.pi * t)
    T.add(xy, 'bridge', draw(35, 80, R), draw(0.08, 0.4, R), z=2.0)

def scenario(P, name, seed):
    T = Tile(P, seed, f'{name}-{seed}'); R, N = T.R, T.N
    if name == 'plateau':
        bundles(T, BUNDLE_N); plateau_strands(T, 28); valleys(T, 14)
    elif name == 'crypt':
        poly = T.add_crypt((N * R.uniform(0.4, 0.6), N * R.uniform(0.4, 0.6)), R.uniform(450, 650), lobes=5)
        bundles(T, BUNDLE_N); deck(T, 26); valleys(T, 22, inside=T.crypt); plateau_strands(T, 14, region=cv2.dilate(T.crypt, np.ones((5, 5), np.uint8)))
    elif name == 'bridges':
        p1 = T.add_crypt((N * 0.36, N * 0.5), R.uniform(300, 420), lobes=4); p2 = T.add_crypt((N * 0.70, N * 0.5), R.uniform(250, 380), lobes=4)
        bundles(T, BUNDLE_N); deck(T, 18); valleys(T, 12, inside=T.crypt); plateau_strands(T, 10, region=cv2.dilate(T.crypt, np.ones((5, 5), np.uint8)))
        for p in (p1, p2):
            for _ in range(R.integers(1, 3)): bridge(T, p)
    elif name == 'crossings':
        angs = [10, 20, 30, 45, 60, 90]
        for i, a in enumerate(angs):
            cx, cy = N * (0.17 + 0.33 * (i % 3)), N * (0.28 + 0.45 * (i // 3)); L = T.um(600)
            for s, h in ((0, -math.pi / 2), (1, -math.pi / 2 + math.radians(a))):
                d = np.array([math.cos(h), math.sin(h)]); t = np.linspace(-0.5, 0.5, int(L))[:, None]
                T.add(np.array([cx, cy]) + t * L * d, 'plateau', draw(18, 40, R), 0.35 if s == 0 else R.choice([0.35, 0.18]), z=float(s))
    elif name == 'ladder':
        widths = [6, 9, 13, 19, 28, 40, 58, 80]; cons = [0.03, 0.06, 0.12, 0.25, 0.5]
        for i, w in enumerate(widths):
            for j, c in enumerate(cons):
                x = N * (0.07 + 0.86 * i / (len(widths) - 1)); y0 = N * (0.04 + 0.19 * j)
                T.add(np.array([[x, y0], [x, y0 + T.um(300)]]), 'plateau', w, c)
    elif name == 'null':
        T.add_crypt((N * 0.5, N * 0.5), R.uniform(400, 600), lobes=5)
    elif name == 'nullbundle':                                                   # grain + bundles, no strands: what a detector finds that is not a strand
        bundles(T, BUNDLE_N)
    T.render(); return T

SCENARIOS = ['plateau', 'crypt', 'bridges', 'crossings', 'ladder', 'null', 'nullbundle']

if __name__ == '__main__':
    cmd, ref = sys.argv[1], sys.argv[2]
    if cmd == 'measure': measure(ref)
    elif cmd == 'build':
        P = json.load(open(os.path.join(OUT, f'params-{ref}.json'))); P['_gains'], got = calibrate_gains(P)
        print('grain gains', [round(x, 3) for x in P['_gains']], '→ band rms', got, 'target', [bd['iso_rms'] for bd in P['bands']])
        seeds = int(sys.argv[sys.argv.index('--seeds') + 1]) if '--seeds' in sys.argv else 3
        only = sys.argv[sys.argv.index('--only') + 1].split(',') if '--only' in sys.argv else SCENARIOS
        for name in only:
            for s in range(seeds if name != 'ladder' else max(seeds, 5)):
                T = scenario(P, name, 1000 * SCENARIOS.index(name) + s); T.save(os.path.join(OUT, f'phantom-{ref}'))
                print(name, s, f'{T.N} px', len(T.curves), 'curves')
