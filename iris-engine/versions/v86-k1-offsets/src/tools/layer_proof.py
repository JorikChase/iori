#!/usr/bin/env python3
"""Spec §30 P0 — hand-built proof of the tissue LAYER model on one crypt window of ref 26. No fitter, no engine.

Question: if the engine drew the iris as   cornea · border-layer SHEET with holes (+ rim pigment) · fibre DECK of
explicit curves · dark ground,   and a fitter found these primitives, would the render look like the photograph
at 1:1 — in structure AND colour?

The render below uses ONLY primitives measured from the photo (never photo pixels):
  · hole outlines        closed curves, 24 Fourier harmonics each                        (the sheet's coverage)
  · fibre curves         centrelines + width + a 1-D brightness payload every ~20 µm     (deck inside the holes,
                                                                                          guides on the sheet)
  · rim pigment          a 1-D strength payload along each outline
  · materials            sheet = a 0.1 mm colour/brightness cell field owned by sheet pixels only; deck, ground,
                         rim = one material each.  EVERY colour goes through the engine's spectral LUT
                         (port of buildSpectralLut, + a neutral-scatter axis) and one per-photo camera grade.
  · seeded               matte tissue grain; camera blur and sensor grain (camera, not tissue)

Run:  /usr/bin/python3 iris-engine/tools/layer_proof.py      → iris-engine/study/proof-layers/
"""
import os, sys, json
import cv2
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from strand_stats import zhang_suen, ridge, prune, order_path   # the S0 tracer (study/08 §4)

ENG = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
OUT = os.path.join(ENG, 'study', 'proof-layers'); os.makedirs(OUT, exist_ok=True)
PPM_FIT = 71.4751                     # px/mm of ref 26 at the 1280 px fit image (fit.dumpForGuideTrace)
WIN = (330, 620, 220)                 # window centre (fit px) and size (fit px)
CELL_MM = 0.10                        # the sheet's material cells
PAYLOAD_UM = 20.0                     # sampling of the 1-D payloads along curves

# ---------------------------------------------------------------- colour: the engine's spectral LUT, ported
lam = np.array([400, 420, 440, 460, 480, 500, 520, 540, 560, 580, 600, 620, 640, 660, 680, 700.])
xb = np.array([0.0143, 0.1344, 0.3483, 0.2908, 0.0956, 0.0049, 0.0633, 0.2904, 0.5945, 0.9163, 1.0622, 0.8544, 0.4479, 0.1649, 0.0468, 0.0114])
yb = np.array([0.0004, 0.0040, 0.0230, 0.0600, 0.1390, 0.3230, 0.7100, 0.9540, 0.9950, 0.8700, 0.6310, 0.3810, 0.1750, 0.0610, 0.0170, 0.0041])
zb = np.array([0.0679, 0.6456, 1.7471, 1.6692, 0.8130, 0.2720, 0.0782, 0.0203, 0.0039, 0.0017, 0.0008, 0.0002, 0, 0, 0, 0])
d65 = np.array([82.75, 93.43, 104.86, 117.81, 115.92, 109.35, 104.79, 104.41, 100.0, 95.79, 90.01, 87.70, 83.70, 80.21, 78.28, 71.61])
_ip = lambda pts: np.interp(lam, [p[0] for p in pts], [p[1] for p in pts])
aEu, aPh = (lam / 550) ** -3.33, (lam / 550) ** -4.75
Ripe, rhoEu, rhoPh = _ip([[464, .020], [549, .030], [611, .045]]), _ip([[464, .022], [549, .038], [611, .065]]), _ip([[464, .055], [549, .15], [611, .26]])
yel = 1 - 1 / (1 + np.exp(-(lam - 500) / 14))
XYZ2RGB = np.array([[3.2406, -1.5372, -0.4986], [-0.9689, 1.8758, 0.0415], [0.0557, -0.2040, 1.0570]])


def build_lut(rayExp=5.0, mies=(0, .08, .2, .35, .5, .7, 1.0)):
    ray = (550 / lam) ** rayExp
    ax = [6 * ((np.arange(24) + .5) / 24) ** 2, 0.5 * (np.arange(16) + .5) / 16, np.linspace(0, 1, 5), np.linspace(0, 2.5, 8), np.array(mies)]
    G = np.meshgrid(*ax, indexing='ij'); Ma, Ds, ph, yl, mi = [g.reshape(-1, 1) for g in G]
    melS = aEu + (aPh - aEu) * ph; sigS = np.maximum(Ds, .005) * (ray + (1 - ray) * mi); sigA = 0.7 * Ma * melS + 1e-4
    a = 1 + sigA / sigS; b = np.sqrt(np.maximum(a * a - 1, 1e-6)); x = np.minimum(b * sigS, 30); coth = np.cosh(x) / np.sinh(x)
    Rs = (1 - Ripe * (a - b * coth)) / (a - Ripe + b * coth); T = np.exp(-Ma * melS); rho = rhoEu + (rhoPh - rhoEu) * ph; Ty = np.exp(-yl * yel)
    r = ((1 - T) * rho + T * T * Rs) * Ty * Ty
    w = np.stack([xb * d65, yb * d65, zb * d65]); XYZ = r @ w.T / w.sum(1)
    params = np.hstack([Ma, Ds, ph, yl, mi])
    return np.maximum(XYZ @ XYZ2RGB.T, 0).astype(np.float32), params.astype(np.float32)     # linear sRGB (R, G, B), parameters


def lin2lab(lin):                          # lin: (N, 3) linear sRGB, RGB order
    s = np.where(lin <= .0031308, 12.92 * lin, 1.055 * np.clip(lin, 1e-9, None) ** (1 / 2.4) - .055).astype(np.float32)
    return cv2.cvtColor(np.clip(s, 0, 1)[None, :, ::-1].copy(), cv2.COLOR_BGR2Lab)[0]
def lab2lin(lab):                          # (N, 3) Lab → linear sRGB RGB
    bgr = cv2.cvtColor(lab.astype(np.float32)[None], cv2.COLOR_Lab2BGR)[0]; s = np.clip(bgr[:, ::-1], 0, 1)
    return np.where(s <= .04045, s / 12.92, ((s + .055) / 1.055) ** 2.4)
def grade(lab, g, rot):                    # the per-photo camera grade: chroma gain + hue rotation (view parameter, not tissue)
    t = np.radians(rot); out = lab.copy(); a, b = lab[:, 1] * g, lab[:, 2] * g
    out[:, 1] = a * np.cos(t) - b * np.sin(t); out[:, 2] = a * np.sin(t) + b * np.cos(t); return out
SCALES = np.array([.25, .35, .5, .7, .85, 1.0, 1.2, 1.5], np.float32)      # brightness multiplier on the albedo (the engine's brightness field)


_BASE = {}; _TREE = {}
def invert(targets, LUT, g, rot):
    """nearest graded LUT colour × brightness multiplier for each target Lab; returns (index, scale, achieved Lab, ΔE)"""
    if id(LUT) not in _BASE: _BASE[id(LUT)] = np.concatenate([lin2lab(LUT * s) for s in SCALES])
    cand = grade(_BASE[id(LUT)], g, rot); n = len(LUT)
    if len(targets) > 400:                                                   # many targets: a KD-tree on the graded cloud (cached per grade)
        from scipy.spatial import cKDTree
        key = (id(LUT), g, rot)
        if key not in _TREE: _TREE.clear(); _TREE[key] = cKDTree(cand)
        dist, j = _TREE[key].query(np.asarray(targets, np.float32), k=1, workers=-1)
        return j % n, SCALES[j // n], cand[j], dist.astype(np.float32)
    idx = np.zeros(len(targets), int); sc = np.zeros(len(targets), np.float32); got = np.zeros((len(targets), 3), np.float32); dE = np.zeros(len(targets), np.float32)
    for k in range(0, len(targets), 40):
        t = targets[k:k + 40]; e = ((t[:, None, :] - cand[None]) ** 2).sum(2); j = e.argmin(1)
        idx[k:k + 40] = j % n; sc[k:k + 40] = SCALES[j // n]; got[k:k + 40] = cand[j]; dE[k:k + 40] = np.sqrt(e[np.arange(len(t)), j])
    return idx, sc, got, dE


# ---------------------------------------------------------------- primitives from the photo (the "hand")
def fourier_smooth(cnt, M=24, n=512):
    p = cnt[:, 0, :].astype(np.float64); d = np.r_[0, np.cumsum(np.hypot(*np.diff(np.r_[p, p[:1]], axis=0).T))]
    t = np.linspace(0, d[-1], n, endpoint=False); q = np.r_[p, p[:1]]
    z = np.interp(t, d, q[:, 0]) + 1j * np.interp(t, d, q[:, 1]); Z = np.fft.fft(z); keep = np.zeros(n, bool); keep[:M + 1] = True; keep[-M:] = True
    z = np.fft.ifft(np.where(keep, Z, 0)); return np.stack([z.real, z.imag], 1)


def centrelines(Lf, focus, sig_px, min_len, regions=None):
    """S0 recipe: multi-scale bright-ridge strength, NMS across the ridge, hysteresis, thinning, pruning → ordered paths"""
    R, S, nx, ny = ridge(Lf, sig_px)
    H, W = Lf.shape; gy, gx = np.mgrid[0:H, 0:W].astype(np.float32); st = max(1.0, 0.5 * sig_px[0])
    Rs = cv2.GaussianBlur(R, (0, 0), max(0.8, 0.35 * sig_px[0]))
    Ra = cv2.remap(Rs, gx + st * nx, gy + st * ny, cv2.INTER_LINEAR); Rb = cv2.remap(Rs, gx - st * nx, gy - st * ny, cv2.INTER_LINEAR)
    vals = R[focus & (R > 0)]; hi, lo = np.percentile(vals, 45), np.percentile(vals, 15)
    if regions is not None:                                                  # thresholds per hole: a dark crypt is judged against itself
        hi, lo = np.full(R.shape, hi, np.float32), np.full(R.shape, lo, np.float32)
        for r in range(1, int(regions.max()) + 1):
            m = (regions == r) & (R > 0)
            if m.sum() > 200: hi[regions == r], lo[regions == r] = np.percentile(R[m], 45), np.percentile(R[m], 15)
    cand = cv2.dilate(((Rs >= Ra) & (Rs >= Rb) & (R > lo) & focus).astype(np.uint8), np.ones((2, 2), np.uint8))
    n0, l0 = cv2.connectedComponents(cand, connectivity=8)
    strong = np.zeros(n0, bool); strong[np.unique(l0[(R > hi) & (cand > 0)])] = True; strong[0] = False
    sk = prune(zhang_suen(strong[l0].astype(np.uint8)), min_len)
    # split at junctions, order each open segment
    p = np.pad(sk, 1); P = [p[:-2, 1:-1], p[:-2, 2:], p[1:-1, 2:], p[2:, 2:], p[2:, 1:-1], p[2:, :-2], p[1:-1, :-2], p[:-2, :-2]]
    deg = sum(((P[i] == 0) & (P[(i + 1) % 8] == 1)).astype(np.int32) for i in range(8)) * (sk > 0)
    seg = ((sk > 0) & (cv2.dilate(((deg >= 3)).astype(np.uint8), np.ones((3, 3), np.uint8)) == 0)).astype(np.uint8)
    n, lab = cv2.connectedComponents(seg, connectivity=8); paths = []
    for i in range(1, n):
        ys, xs = np.nonzero(lab == i)
        if len(ys) >= min_len: paths.append(order_path(ys, xs))           # (row, col)
    return paths, S


def extend_to_walls(paths, sd, max_px=70):
    """Model prior: a deck fibre does not end in mid-air — it runs on under the shadow until it meets the wall (or another
    fibre). Geometry of the extension is INFERRED (provenance), its brightness payload is still read from the photo."""
    H, W = sd.shape; ink = np.ones((H, W), np.uint8)
    for p in paths: ink[p[:, 0].astype(int), p[:, 1].astype(int)] = 0
    near = cv2.distanceTransform(ink, cv2.DIST_L2, 5); out = []
    for p in paths:
        p = p.astype(np.float64)
        for end in (0, 1):
            q = p[::-1] if end == 0 else p
            if len(q) < 5 or sd[int(q[-1, 0]), int(q[-1, 1])] < 6: continue        # already at a wall
            t = q[-1] - q[-min(len(q), 8)]; t /= max(np.hypot(*t), 1e-6); add = []; pos = q[-1].copy()
            for k in range(max_px):
                pos = pos + t; y, x = int(round(pos[0])), int(round(pos[1]))
                if not (0 <= y < H and 0 <= x < W) or sd[y, x] < 1.5: break
                if k > 8 and near[y, x] < 2.5: break
                add.append(pos.copy())
            if add: q = np.vstack([q, np.array(add)])
            p = q[::-1] if end == 0 else q
        out.append(p)
    return out


def payload_curve(path, step_px, sample, width_map, extra=None):
    """resample a pixel path every step_px, smooth it, and read the 1-D payloads there"""
    p = path[:, ::-1].astype(np.float64)                                   # (x, y)
    k = max(3, int(round(step_px)) | 1); pad = np.pad(p, ((k // 2, k // 2), (0, 0)), mode='edge')
    p = np.stack([np.convolve(pad[:, c], np.ones(k) / k, mode='valid') for c in (0, 1)], 1)
    d = np.r_[0, np.cumsum(np.hypot(*np.diff(p, axis=0).T))]; m = max(2, int(d[-1] / step_px) + 1); t = np.linspace(0, d[-1], m)
    q = np.stack([np.interp(t, d, p[:, 0]), np.interp(t, d, p[:, 1])], 1).astype(np.float32)
    rd = lambda img: cv2.remap(img, q[None, :, 0], q[None, :, 1], cv2.INTER_LINEAR)[0]
    out = {'xy': q, 'val': rd(sample), 'w': rd(width_map)}
    for kx, img in (extra or {}).items(): out[kx] = rd(img)
    return out


def raster_multi(curves, shape, keys):
    """distance to the nearest centreline + several payload channels of that nearest curve point"""
    H, W = shape; ink = np.ones((H, W), np.uint8); vals = {kx: np.zeros((H, W), np.float32) for kx in keys}
    for c in curves:
        q = c['xy']
        for i in range(len(q) - 1):
            m = int(max(2, np.ceil(np.hypot(*(q[i + 1] - q[i])) * 2)))
            for s_ in np.linspace(0, 1, m):
                x, y = q[i] * (1 - s_) + q[i + 1] * s_; xi, yi = int(round(x)), int(round(y))
                if 0 <= xi < W and 0 <= yi < H:
                    ink[yi, xi] = 0
                    for kx in keys: vals[kx][yi, xi] = c[kx][i] * (1 - s_) + c[kx][i + 1] * s_
    dist, lab = cv2.distanceTransformWithLabels(ink, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    ys, xs = np.nonzero(ink == 0); out = {}
    for kx in keys:
        t = np.zeros(lab.max() + 1, np.float32); t[lab[ys, xs]] = vals[kx][ys, xs]; out[kx] = t[lab]
    return dist, out


def curve_colours(curves, LUT, G, ROT):
    """each payload sample's colour goes through the spectral LUT: photo Lab at the sample → nearest graded LUT material →
    that material's chromaticity (linear RGB at unit luminance), stored on the curve as cr / cg / cb"""
    T = np.concatenate([np.stack([c['L'], c['a'], c['b']], 1) for c in curves]).astype(np.float32)
    idx, _, _, dE = invert(T, LUT, G, ROT); chroma = LUT[idx] / np.maximum(LUT[idx] @ LUMA, 1e-5)[:, None]; k = 0
    lit = sstep(12.0, 28.0, T[:, 0])[:, None]; ok = T[:, 0] > 28                                        # a sample in deep shadow has no measurable chromaticity:
    if ok.any(): chroma = chroma * lit + np.median(chroma[ok], 0)[None, :] * (1 - lit)                   # it takes the curves' typical colour instead of noise
    for c in curves:
        n = len(c['xy']); c['cr'], c['cg'], c['cb'] = chroma[k:k + n, 0].copy(), chroma[k:k + n, 1].copy(), chroma[k:k + n, 2].copy(); k += n
    return float(dE.mean()), len(np.unique(idx))


def raster_curves(curves, shape, key='val'):
    """nearest-curve fields: distance to the nearest centreline and that curve's payload / width there (Voronoi of the curves).
    Per-pixel distance to polylines with interpolated payload = what a distance-field bake (smooth union of tubes) evaluates."""
    H, W = shape; ink = np.ones((H, W), np.uint8); val = np.zeros((H, W), np.float32); wid = np.zeros((H, W), np.float32)
    for c in curves:
        q = c['xy']; n = len(q)
        for i in range(n - 1):                                             # dense sub-steps so every centreline pixel carries interpolated payload
            m = int(max(2, np.ceil(np.hypot(*(q[i + 1] - q[i])) * 2)))
            for s in np.linspace(0, 1, m):
                x, y = q[i] * (1 - s) + q[i + 1] * s; xi, yi = int(round(x)), int(round(y))
                if 0 <= xi < W and 0 <= yi < H: ink[yi, xi] = 0; val[yi, xi] = c[key][i] * (1 - s) + c[key][i + 1] * s; wid[yi, xi] = c['w'][i] * (1 - s) + c['w'][i + 1] * s
    dist, lab = cv2.distanceTransformWithLabels(ink, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    ys, xs = np.nonzero(ink == 0); lut_v = np.zeros(lab.max() + 1, np.float32); lut_w = np.zeros(lab.max() + 1, np.float32)
    lut_v[lab[ys, xs]] = val[ys, xs]; lut_w[lab[ys, xs]] = wid[ys, xs]
    return dist, lut_v[lab], lut_w[lab]


def srgb2lin(bgr8):
    s = bgr8[..., ::-1].astype(np.float32) / 255; return np.where(s <= .04045, s / 12.92, ((s + .055) / 1.055) ** 2.4)
def lin2bgr8(lin):
    s = np.where(lin <= .0031308, 12.92 * lin, 1.055 * np.clip(lin, 1e-9, None) ** (1 / 2.4) - .055); return (np.clip(s[..., ::-1], 0, 1) * 255 + .5).astype(np.uint8)
LUMA = np.array([0.2126, 0.7152, 0.0722], np.float32)
sstep = lambda a, b, x: (lambda t: t * t * (3 - 2 * t))(np.clip((x - a) / (b - a), 0, 1))


def main():
    nat = cv2.imread(os.path.join(ENG, 'ref', '26-green-crypts-isolated.jpg')); k = nat.shape[1] / 1280.0
    WHOLE = '--whole' in sys.argv; TAG = 'whole-26' if WHOLE else 'proof-26'
    PUP = (641.0511, 463.2756, 166.7331); LIMB = (638.7877, 462.2253, 418.13)                           # ref 26 at the 1280 px fit image (fit.dumpForGuideTrace)
    if WHOLE: cx, cy = LIMB[0], LIMB[1]; w = 2 * (LIMB[2] + 12)
    else: cx, cy, w = WIN
    y0, x0, n = int((cy - w / 2) * k), int((cx - w / 2) * k), int(w * k)
    y0, x0 = max(0, y0), max(0, x0)
    photo = nat[y0:y0 + n, x0:x0 + n].copy(); UM = 1000.0 / (PPM_FIT * k); H, W = photo.shape[:2]
    plin = srgb2lin(photo); pY = plin @ LUMA; plab = cv2.cvtColor(photo.astype(np.float32) / 255, cv2.COLOR_BGR2Lab)
    print(f'window {n} px = {n * UM / 1000:.2f} mm · {UM:.2f} µm/px')

    # ---- aperture (the photographer's cutout; K1's parameter + a feather)
    iris = (cv2.GaussianBlur(plab[..., 0], (0, 0), 3) > 8).astype(np.uint8)
    ic, _ = cv2.findContours(iris, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)                           # black pits inside crypts are tissue, not background
    iris = np.zeros_like(iris); cv2.drawContours(iris, [max(ic, key=cv2.contourArea)], -1, 1, -1)
    pupil_px = np.hypot(*(np.mgrid[0:H, 0:W][::-1] - np.array([PUP[0] * k - x0, PUP[1] * k - y0])[:, None, None])) < 1.07 * PUP[2] * k
    iris[pupil_px] = 0                                                                                   # the pupil and its ruff are not this model's tissue
    aper = cv2.GaussianBlur(iris.astype(np.float32), (0, 0), 7)
    inner = cv2.erode(iris, np.ones((41, 41), np.uint8)) > 0

    # ---- 1. sheet coverage: hole outlines (dark AND low b* — a hole in the pigmented sheet, not a shadow)
    s4 = cv2.GaussianBlur(plab, (0, 0), 2.5)
    near = cv2.erode(iris, np.ones((21, 21), np.uint8)) > 0
    # a hole is dark AND grey; dark and SATURATED is pigment lying on the sheet (the brown spots of ref 26 read as pits otherwise)
    # …and "grey" is relative to the sheet AROUND it: on the amber side of an iris the deck seen through a hole is browner than on
    # the green side, and a fixed b* threshold keeps only the darkest cores (ragged masks). Local sheet b* = a wide upper envelope.
    kk = int(round(0.35 * 1000 / UM)) | 1
    b_loc = cv2.GaussianBlur(cv2.dilate(np.where(near, s4[..., 2], 0).astype(np.float32), np.ones((kk, kk), np.uint8)), (0, 0), kk / 2.5)
    L_loc = cv2.GaussianBlur(cv2.dilate(np.where(near, s4[..., 0], 0).astype(np.float32), np.ones((kk, kk), np.uint8)), (0, 0), kk / 2.5)
    grey = s4[..., 2] < np.maximum(14.0, 0.42 * b_loc)
    Hm = (((grey & (s4[..., 0] < np.maximum(46.0, 0.85 * L_loc))) | ((s4[..., 0] < 24) & (s4[..., 2] < np.maximum(16.0, 0.45 * b_loc)) & (s4[..., 1] < 3))) & near).astype(np.uint8)
    Hm = cv2.morphologyEx(cv2.morphologyEx(Hm, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)), cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
    cnts, hier = cv2.findContours(Hm, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    amin = (0.12 * 1000 / UM) ** 2                                                                       # ≥ 0.12 mm across
    outer = [i for i, c in enumerate(cnts) if hier[0][i][3] < 0 and cv2.contourArea(c) >= amin]
    isl = [i for i, c in enumerate(cnts) if hier[0][i][3] in outer and cv2.contourArea(c) >= 0.35 * amin]  # sheet islands and septa inside a hole
    harm = lambda c_, lo: int(np.clip(cv2.arcLength(c_, True) / 40.0, lo, 160))                          # harmonics with the perimeter: one per ≈ 0.19 mm of outline
    outlines = [fourier_smooth(cnts[i], harm(cnts[i], 16), 1024 if cv2.arcLength(cnts[i], True) > 1500 else 512) for i in outer]; islands = [fourier_smooth(cnts[i], harm(cnts[i], 8), 256) for i in isl]
    holes = np.zeros((H, W), np.uint8); cv2.fillPoly(holes, [o.round().astype(np.int32) for o in outlines], 1)
    cv2.fillPoly(holes, [o.round().astype(np.int32) for o in islands], 0); outlines = outlines + islands
    sd = cv2.distanceTransform(holes, cv2.DIST_L2, 5) - cv2.distanceTransform(1 - holes, cv2.DIST_L2, 5)  # + inside a hole, px
    WALL = 8.0                                                                                           # px ≈ 23 µm soft wall
    cover = 1 - sstep(-WALL, WALL, sd)                                                                   # 1 = sheet, 0 = hole
    sheet_px = (sd < -14) & inner; hole_px = sd > 5; rim_px = (sd > -12) & (sd < -3) & inner
    print(f'{len(outlines)} hole outlines · holes {100 * holes[inner].mean():.1f} % of the window')

    # ---- 2. deck fibres inside the holes, guides on the sheet: curves + width + 1-D payload
    Lf = cv2.GaussianBlur(pY.astype(np.float32), (0, 0), 1.0)
    step = PAYLOAD_UM / UM
    base_h = cv2.GaussianBlur(np.where(hole_px, pY, 0).astype(np.float32), (0, 0), 14) / np.maximum(cv2.GaussianBlur(hole_px.astype(np.float32), (0, 0), 14), 1e-3)
    # fibres are FOUND on local contrast (a fibre in a crypt's shadow is as real as one in the light — the eye normalises,
    # an absolute threshold does not) and their payload is READ from the true luminance, so they render as dim as they are
    Ln = (cv2.GaussianBlur(pY.astype(np.float32), (0, 0), 1.5) / np.maximum(cv2.GaussianBlur(pY.astype(np.float32), (0, 0), 14), 0.004)).astype(np.float32)
    _, hole_lab = cv2.connectedComponents((sd > 1).astype(np.uint8), connectivity=8)
    fpaths, fS = centrelines(Ln, sd > 1, [2.0, 3.0, 4.5], 6, hole_lab)
    fpaths = extend_to_walls(fpaths, sd)
    Lbody = cv2.GaussianBlur(pY.astype(np.float32), (0, 0), 2.5)                                          # a fibre's BODY brightness, not its peak
    lab_f = cv2.GaussianBlur(plab, (0, 0), 2.5); lab_g = cv2.GaussianBlur(plab, (0, 0), 3.5)             # colour is read at the body scale (finer = chroma noise)
    chan = lambda L3: {'L': np.ascontiguousarray(L3[..., 0]), 'a': np.ascontiguousarray(L3[..., 1]), 'b': np.ascontiguousarray(L3[..., 2])}
    fibres = [payload_curve(p, step, Lbody, fS * 2.0, chan(lab_f)) for p in fpaths]
    # the dark VEINS between fibres: valleys of the same local-contrast image, traced as curves of their own; their payload is
    # how dark the gap is RELATIVE to the fibre bodies beside it (so a vein in a shadow is a vein, not a second shadow)
    vpaths, vS = centrelines(-Ln, sd > 0, [1.5, 2.5], 6, hole_lab)
    vrel = np.clip(cv2.GaussianBlur(pY.astype(np.float32), (0, 0), 0.8) / np.maximum(cv2.GaussianBlur(pY.astype(np.float32), (0, 0), 5.0), 1e-4), 0.15, 1.0).astype(np.float32)
    veins = [payload_curve(p, step, vrel, vS * 1.1) for p in vpaths]
    base_s = cv2.GaussianBlur(np.where(sheet_px, pY, 0).astype(np.float32), (0, 0), 0.5 * CELL_MM * 1000 / UM) / np.maximum(cv2.GaussianBlur(sheet_px.astype(np.float32), (0, 0), 0.5 * CELL_MM * 1000 / UM), 1e-3)
    gpaths, gS = centrelines(cv2.GaussianBlur(Lf, (0, 0), 2.0), sd < -6, [4.0, 6.0, 9.0], 14)
    den_s = cv2.GaussianBlur(sheet_px.astype(np.float32), (0, 0), 0.5 * CELL_MM * 1000 / UM)
    base_s = np.where(den_s > 0.1, base_s, float(np.median(pY[sheet_px])))                                # islands inside a hole have no sheet field of their own
    ratio = np.clip(cv2.GaussianBlur(Lf, (0, 0), 2.0) / np.maximum(base_s, 1e-3), 0.4, 1.8).astype(np.float32)             # guides carry brightness RELATIVE to the sheet field
    guides = [payload_curve(p, step, ratio, gS * 1.6, chan(lab_g)) for p in gpaths]
    # the sheet's own fine texture: faint fibres and veins showing on / through the border layer, below the guide scale —
    # found on local contrast, payload = brightness relative to the 28 µm neighbourhood (so they ride on cells × guides)
    fine = np.clip(cv2.GaussianBlur(pY.astype(np.float32), (0, 0), 1.2) / np.maximum(cv2.GaussianBlur(pY.astype(np.float32), (0, 0), 6.0), 1e-4), 0.5, 1.6).astype(np.float32)
    # …but at this scale the flat sheet is mostly SENSOR GRAIN, and tracing grain would be fitting noise (it did: short worms in
    # every direction, and a flattering B3). Tissue streaks are long, straight and run with the radial flow; grain is none of these.
    Ls = (cv2.GaussianBlur(pY.astype(np.float32), (0, 0), 2.2) / np.maximum(cv2.GaussianBlur(pY.astype(np.float32), (0, 0), 14), 0.004)).astype(np.float32)
    ctr = np.array([PUP[0] * k - x0, PUP[1] * k - y0])                           # pupil centre of ref 26 in window px (x, y)
    def tissue_like(path):
        q = path[:, ::-1].astype(np.float64); L_ = np.hypot(*np.diff(q, axis=0).T).sum(); chord = q[-1] - q[0]; c = np.hypot(*chord)
        if L_ < 26 or c / max(L_, 1e-6) < 0.8: return False                                              # ≥ 0.12 mm and straight
        rad = q.mean(0) - ctr; cosang = abs(chord @ rad) / max(c * np.hypot(*rad), 1e-6)
        return cosang > np.cos(np.radians(40)) or L_ > 64                                                # with the flow, or long enough to be structure anyway
    sfp, sfS = centrelines(Ls, (sd < -4) & near, [2.0, 3.0], 12); svp, svS = centrelines(-Ls, (sd < -4) & near, [2.0, 3.0], 12)
    n_raw = (len(sfp), len(svp)); sfp = [q for q in sfp if tissue_like(q)]; svp = [q for q in svp if tissue_like(q)]
    print(f'sheet fine curves kept {len(sfp)}/{n_raw[0]} fibres, {len(svp)}/{n_raw[1]} veins (the rest reads as grain)')
    sfib = [payload_curve(p, step, fine, sfS * 1.3) for p in sfp]; svein = [payload_curve(p, step, fine, svS * 1.2) for p in svp]
    nf, ng = sum(len(c['xy']) for c in fibres), sum(len(c['xy']) for c in guides)
    print(f'{len(fibres)} deck fibres ({nf} payload samples) · {len(guides)} sheet guides ({ng} samples)')

    # ---- 3. rim pigment: 1-D strength along each outline (how much more amber than the sheet next to it)
    LUT, PRM = build_lut()
    sheet_lab = np.array([np.median(plab[..., c][sheet_px]) for c in range(3)], np.float32)
    rim_strength = []
    for o in outlines:
        d = np.roll(o, -1, 0) - np.roll(o, 1, 0); nrm = np.stack([d[:, 1], -d[:, 0]], 1); nrm /= np.maximum(np.hypot(*nrm.T)[:, None], 1e-6)
        if cv2.pointPolygonTest(o.astype(np.float32), tuple((o[0] + 6 * nrm[0]).astype(np.float32)), False) > 0: nrm = -nrm   # outward
        q = (o + 7 * nrm).astype(np.float32); samp = cv2.remap(cv2.GaussianBlur(plab, (0, 0), 2.5), q[None, :, 0], q[None, :, 1], cv2.INTER_LINEAR)[0]
        far = (o + 30 * nrm).astype(np.float32); ref_ = cv2.remap(cv2.GaussianBlur(plab, (0, 0), 6.0), far[None, :, 0], far[None, :, 1], cv2.INTER_LINEAR)[0]   # the sheet 0.14 mm further out: the LOCAL reference
        amber = np.clip(((samp[:, 1] - ref_[:, 1]) + 0.5 * (ref_[:, 0] - samp[:, 0])) / 18.0, 0, 1)      # redder and darker than the sheet beside it
        kk = 9; amber = np.convolve(np.r_[amber[-kk:], amber, amber[:kk]], np.ones(kk) / kk, 'same')[kk:-kk]
        rim_strength.append(amber.astype(np.float32))
    rim_curves = [{'xy': np.r_[o, o[:1]].astype(np.float32), 'val': np.r_[a, a[:1]], 'w': np.full(len(o) + 1, 1, np.float32)} for o, a in zip(outlines, rim_strength)]
    _, rim_val, _ = raster_curves(rim_curves, (H, W)); RIM_W = 9.0                                        # px ≈ 42 µm
    rim = rim_val * np.exp(-((sd + 5.0) / RIM_W) ** 2) * (sd < 2)

    # ---- 4. materials, class-owned, through the spectral LUT + one camera grade
    strong_rim = rim_px & (rim > 0.45)
    fib_d, fib_v, fib_w = raster_curves(fibres, (H, W))
    on_fibre = hole_px & (fib_d < 0.5 * np.maximum(fib_w, 2)); off_fibre = hole_px & (fib_d > 0.9 * np.maximum(fib_w, 2))
    cls = {'sheet': sheet_px, 'deck': on_fibre, 'ground': off_fibre, 'rim': strong_rim}
    tgt = {kx: np.array([np.median(plab[..., c][m]) for c in range(3)], np.float32) for kx, m in cls.items()}
    # one camera grade for the photo: classes + a sample of fibre and guide colours decide it (colour is judged where it is owned)
    samp = np.concatenate([np.stack([c['L'], c['a'], c['b']], 1) for c in fibres + guides])[::9].astype(np.float32)
    samp = samp[samp[:, 0] > 22][::3]                                                                    # dark samples have no usable chromaticity
    gt = np.concatenate([np.repeat(np.stack(list(tgt.values())), 6, 0), samp]); tried = []
    for g in (1.0, 1.2, 1.4, 1.6, 1.8, 2.0, 2.4, 2.8):
        for rot in (0, 10, 20, 30, 40):
            _, _, _, dE = invert(gt, LUT, g, rot); tried.append((float(dE.mean()), g, rot))
    # grade and pigment trade off (more gain + a paler material ≈ less gain + a richer one): the error surface is flat along
    # that valley, so take the MILDEST grade within 10 % of the best — the materials stay physical, the camera stays a camera
    emin = min(t[0] for t in tried); best = min((t for t in tried if t[0] <= 1.10 * emin + 0.05), key=lambda t: (t[1], abs(t[2])))
    print('  grade valley: ' + ' · '.join(f'×{g} {min(t[0] for t in tried if t[1] == g):.2f}' for g in sorted({t[1] for t in tried})))
    _, G, ROT = best; print(f'camera grade: chroma ×{G}, hue {ROT:+d}° (ΔE {best[0]:.2f} over {len(gt)} colour targets)')
    dEf, nmf = curve_colours(fibres, LUT, G, ROT); dEg, nmg = curve_colours(guides, LUT, G, ROT)
    print(f'  per-sample colour through the LUT: fibres ΔE {dEf:.2f} ({nmf} materials) · guides ΔE {dEg:.2f} ({nmg} materials)')
    # sheet cell field (colour + brightness), owned by sheet pixels only
    cs = int(round(CELL_MM * 1000 / UM)); gy, gx = H // cs + 1, W // cs + 1
    wsum = cv2.resize(sheet_px.astype(np.float32), (gx, gy), interpolation=cv2.INTER_AREA)
    cell_lab = np.stack([cv2.resize(np.where(sheet_px, plab[..., c], 0).astype(np.float32), (gx, gy), interpolation=cv2.INTER_AREA) for c in range(3)], 2) / np.maximum(wsum[..., None], 1e-4)
    known = (wsum > 0.08).astype(np.uint8)
    _, nearest = cv2.distanceTransformWithLabels(1 - known, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)   # a cell with no sheet pixels (inside a hole) takes the nearest sheet cell's material
    src = np.zeros(nearest.max() + 1, int); ky, kx_ = np.nonzero(known); src[nearest[ky, kx_]] = ky * gx + kx_
    cell_lab = np.where(known[..., None] > 0, cell_lab, cell_lab.reshape(-1, 3)[src[nearest]])
    ci, csc, cgot, cdE = invert(cell_lab.reshape(-1, 3), LUT, G, ROT)
    report = {'grade': {'chroma': G, 'hue': ROT}, 'classes': {}}
    mats = {}
    for kx in cls:
        i, s_, got, dE = invert(tgt[kx][None], LUT, G, ROT); mats[kx] = (LUT[i[0]], float(s_[0]))
        report['classes'][kx] = {'photo_Lab': [round(float(v), 1) for v in tgt[kx]], 'model_Lab': [round(float(v), 1) for v in got[0]], 'dE': round(float(dE[0]), 2),
                                 'material': dict(zip(['melanin', 'stroma', 'pheo', 'yellow', 'mie'], [round(float(v), 3) for v in PRM[i[0]]]))}
        print(f"  {kx:7s} photo Lab {report['classes'][kx]['photo_Lab']} → model {report['classes'][kx]['model_Lab']}  ΔE {dE[0]:.2f}  {report['classes'][kx]['material']}")
    print(f'  sheet cells: {gx}×{gy}, LUT ΔE mean {cdE[known.reshape(-1) > 0].mean():.2f}')
    up = lambda a: cv2.resize(a.astype(np.float32), (W, H), interpolation=cv2.INTER_CUBIC)
    sheet_alb = np.stack([up((LUT[ci][:, c] * csc).reshape(gy, gx)) for c in range(3)], 2)                 # linear RGB albedo × cell brightness

    # ---- 5. compose the layers (linear light)
    rs = np.random.RandomState(26)
    # deck: tubes under a frontal ring flash — brightness payload × round cross-profile, over the dark ground
    # deck: broad fibres packed side by side — every floor point takes the body brightness of its nearest fibre (the curves'
    # Voronoi cells; wall shadows arrive with the payload), a little roundness, and the traced veins cut the dark gaps
    v_d, v_v, v_w = raster_curves(veins, (H, W))
    vein = (1 - v_v) * np.exp(-0.5 * (v_d / np.maximum(v_w, 1.2)) ** 2)
    roundness = 0.78 + 0.22 * np.sqrt(np.clip(1 - (fib_d / np.maximum(1.4 * fib_w, 3.0)) ** 2, 0, 1))
    deckY = cv2.GaussianBlur(fib_v, (0, 0), 2.5) * roundness * (1 - vein)
    prof = 1 - sstep(14.0, 26.0, fib_d)                                                                   # no fibre within ≈ 0.1 mm: a true pit, the ground shows
    _, fc = raster_multi(fibres, (H, W), ['cr', 'cg', 'cb'])                                              # each fibre's own LUT colour, spread over its Voronoi cell
    deck_chroma = cv2.GaussianBlur(np.stack([fc['cr'], fc['cg'], fc['cb']], 2), (0, 0), 2.5)
    deck_rgb = deck_chroma / np.maximum(deck_chroma @ LUMA, 1e-5)[..., None] * deckY[..., None]
    gY = cv2.GaussianBlur(np.where(off_fibre, pY, 0).astype(np.float32), (0, 0), 20) / np.maximum(cv2.GaussianBlur(off_fibre.astype(np.float32), (0, 0), 20), 1e-3)   # ground level, 0.1 mm scale
    ground_rgb = mats['ground'][0][None, None, :] / max(float(mats['ground'][0] @ LUMA), 1e-4) * gY[..., None]
    hole_rgb = ground_rgb * (1 - prof[..., None]) + np.maximum(deck_rgb, ground_rgb * 0) * prof[..., None]
    # sheet: cell material × guides (relative brightness along traced bundles) × seeded matte grain
    g_d, g_v, g_w = raster_curves(guides, (H, W))
    gprof = np.exp(-0.5 * (g_d / np.maximum(0.55 * g_w, 2.0)) ** 2)
    sheet_mod = 1 + (g_v - 1) * gprof
    sf_d, sf_v, sf_w = raster_curves(sfib, (H, W)); sv_d, sv_v, sv_w = raster_curves(svein, (H, W))
    sheet_mod = sheet_mod * (1 + (np.maximum(sf_v, 1) - 1) * np.exp(-0.5 * (sf_d / np.maximum(sf_w, 1.2)) ** 2)) * (1 - (1 - np.minimum(sv_v, 1)) * np.exp(-0.5 * (sv_d / np.maximum(sv_w, 1.2)) ** 2))
    _, gc = raster_multi(guides, (H, W), ['cr', 'cg', 'cb'])                                               # colour finer than the 0.1 mm cells rides on the guides
    gch = cv2.GaussianBlur(np.stack([gc['cr'], gc['cg'], gc['cb']], 2), (0, 0), 3.0); gmix = (0.85 * np.exp(-0.5 * (g_d / np.maximum(0.9 * g_w, 3.0)) ** 2))[..., None]
    sY = sheet_alb @ LUMA; sheet_alb = (sheet_alb / np.maximum(sY, 1e-5)[..., None] * (1 - gmix) + gch / np.maximum(gch @ LUMA, 1e-5)[..., None] * gmix) * sY[..., None]
    grain_t = cv2.GaussianBlur(rs.randn(H, W).astype(np.float32), (0, 0), 1.6); grain_t /= grain_t.std()
    sheet_rgb = sheet_alb * (sheet_mod * (1 + 0.055 * grain_t))[..., None]
    rim_alb = mats['rim'][0] * mats['rim'][1]
    sheet_rgb = sheet_rgb * (1 - rim[..., None]) + rim_alb[None, None, :] * (sheet_mod * (1 + 0.055 * grain_t))[..., None] * rim[..., None]
    lin = hole_rgb * (1 - cover[..., None]) + sheet_rgb * cover[..., None]
    # camera: grade, lens blur, sensor grain, the aperture
    lab_img = grade(lin2lab(lin.reshape(-1, 3)), G, ROT); lin = lab2lin(lab_img).reshape(H, W, 3).astype(np.float32)
    lin = cv2.GaussianBlur(lin, (0, 0), 1.3) * aper[..., None]
    clean = lin2bgr8(lin)
    hp = lambda img: img.astype(np.float32) - cv2.GaussianBlur(img.astype(np.float32), (0, 0), 3.0)
    flat = sheet_px & (g_d > 12)                                                                         # sensor grain measured on flat sheet, away from guides
    sig_cam = np.sqrt(np.maximum(hp(photo)[flat].var(0) - hp(clean)[flat].var(0), 0))                     # what the clean render lacks there, per channel
    nz = cv2.GaussianBlur(rs.randn(H, W, 3).astype(np.float32), (0, 0), 0.8); nz = hp(nz); nz /= nz[flat].std(0)[None, None, :]   # demosaic-sized grain, not white noise
    noisy = np.clip(clean.astype(np.float32) + nz * sig_cam[None, None, :] * (aper[..., None] > 0.5), 0, 255).astype(np.uint8)

    # ---- 5b. export the primitives for the engine's tissueModel variant (spec §30 P1): positions in FIT pixels of the 1280 px fit
    # image (the engine maps them to tissue (u, v) through its own coordinate map), sizes in mm, colours as linear sRGB in PHOTO
    # space (graded LUT colours × payload) — the engine converts them to albedo by inverting its own camera and lighting
    if '--export' in sys.argv:
        kx_, ky_ = nat.shape[1] / 1280.0, nat.shape[0] / 925.0; MM = UM / 1000.0
        def fitxy(q): return np.stack([(x0 + q[:, 0] + 0.5) / kx_ - 0.5, (y0 + q[:, 1] + 0.5) / ky_ - 0.5], 1)
        def graded(lin): return lab2lin(grade(lin2lab(np.clip(lin, 1e-5, None).astype(np.float32)), G, ROT))
        r3 = lambda a_: [[round(float(v), 4) for v in row] for row in a_]; r1 = lambda a_, d=4: [round(float(v), d) for v in a_]
        def curve(c, **kw): return dict(xy=r3(fitxy(c['xy'])), w=r1(c['w'] * MM, 5), **kw)
        ex = {'ref': '26-green-crypts-isolated.jpg', 'fit': [1280, 925], 'grade': {'chroma': G, 'hue': ROT},
              'mm': {'wall': WALL * MM, 'rimW': RIM_W * MM, 'rimOff': 5.0 * MM, 'pit': [14 * MM, 26 * MM], 'bodyBlur': 2.5 * MM, 'guideColBlur': 3.0 * MM, 'depth': 0.01},
              'outlines': [], 'fibres': [], 'veins': [], 'guides': [], 'sfib': [], 'svein': []}
        for i_, (o, a_) in enumerate(zip(outlines, rim_strength)):
            ex['outlines'].append({'xy': r3(fitxy(o)), 'rim': r1(a_), 'island': i_ >= len(outlines) - len(islands)})
        for c in fibres:
            ch = np.stack([c['cr'], c['cg'], c['cb']], 1); ex['fibres'].append(curve(c, rgb=r3(graded(ch * c['val'][:, None]))))
        # relative payloads also carry the photo-space luminance they are relative TO: the engine's camera is not linear, so a
        # ratio has to be converted through it (albedo(base × ratio) / albedo(base)), not copied
        def rdl(c, img): q = c['xy']; return r1(cv2.remap(img.astype(np.float32), q[None, :, 0], q[None, :, 1], cv2.INTER_LINEAR)[0], 5)
        b5, b6 = cv2.GaussianBlur(pY.astype(np.float32), (0, 0), 5.0), cv2.GaussianBlur(pY.astype(np.float32), (0, 0), 6.0)
        for c in veins: ex['veins'].append(curve(c, val=r1(c['val']), base=rdl(c, b5)))
        for c in guides:
            ch = np.stack([c['cr'], c['cg'], c['cb']], 1); yl = np.maximum(lab2lin(np.stack([c['L'], 0 * c['L'], 0 * c['L']], 1)) @ LUMA, 1e-4)
            gcol = graded(ch * yl[:, None]); ex['guides'].append(curve(c, val=r1(c['val']), base=rdl(c, base_s), rgb=r3(gcol / np.maximum(gcol @ LUMA, 1e-5)[:, None])))
        for c in sfib: ex['sfib'].append(curve(c, val=r1(c['val']), base=rdl(c, b6)))
        for c in svein: ex['svein'].append(curve(c, val=r1(c['val']), base=rdl(c, b6)))
        cyy, cxx = np.mgrid[0:gy, 0:gx]; cpos = np.stack([(cxx.ravel() + 0.5) * W / gx - 0.5, (cyy.ravel() + 0.5) * H / gy - 0.5], 1)
        inwin = cv2.resize(iris.astype(np.float32), (gx, gy), interpolation=cv2.INTER_AREA).ravel() > 0.5
        gcell = cv2.resize(gY.astype(np.float32), (gx, gy), interpolation=cv2.INTER_AREA).ravel()
        gch = mats['ground'][0] / max(float(mats['ground'][0] @ LUMA), 1e-5)
        ex['cells'] = {'xy': r3(fitxy(cpos)[inwin]), 'sheet': r3(graded(LUT[ci] * csc[:, None])[inwin]), 'ground': r3(graded(gch[None, :] * np.maximum(gcell, 1e-4)[:, None])[inwin])}
        ex['rimRGB'] = r1(graded((mats['rim'][0] * mats['rim'][1])[None, :])[0])
        json.dump(ex, open(os.path.join(OUT, ('tissue-26-whole.json' if WHOLE else 'tissue-26.json')), 'w'), separators=(',', ':'))
        print('exported', 'tissue-26-whole.json' if WHOLE else 'tissue-26.json', round(os.path.getsize(os.path.join(OUT, ('tissue-26-whole.json' if WHOLE else 'tissue-26.json'))) / 1024), 'KB')

    # ---- 6. judge: same window of the engine's current fit (v84c), and numbers
    eng = cv2.imread(os.path.join(OUT, 'engine-v84c-26-render.png'))
    ex0, ey0 = int(round(x0 / k)), int(round(y0 / (nat.shape[0] / 925.0)))
    eng_w = cv2.resize(eng[ey0:ey0 + int(round(H / (nat.shape[0] / 925.0))), ex0:ex0 + int(round(W / k))], (W, H), interpolation=cv2.INTER_CUBIC) if eng is not None else np.zeros_like(photo)

    def metrics(img):
        lab = cv2.cvtColor(img.astype(np.float32) / 255, cv2.COLOR_BGR2Lab); m = inner
        A = lambda x: cv2.resize(np.where(m[..., None], x, 0).astype(np.float32), (gx, gy), interpolation=cv2.INTER_AREA)
        wt = cv2.resize(m.astype(np.float32), (gx, gy), interpolation=cv2.INTER_AREA); ok = wt > 0.9
        P, R = A(plab) / np.maximum(wt[..., None], 1e-4), A(lab) / np.maximum(wt[..., None], 1e-4)
        out = {'cellDab': float(np.hypot(P[..., 1] - R[..., 1], P[..., 2] - R[..., 2])[ok].mean()), 'cellDL': float(np.abs(P[..., 0] - R[..., 0])[ok].mean())}
        c50 = int(round(50.0 / UM)); g50 = (W // c50, H // c50); m3 = m[..., None]
        A50 = lambda x: cv2.resize(np.where(m3, cv2.GaussianBlur(x, (0, 0), 1.5), 0).astype(np.float32), g50, interpolation=cv2.INTER_AREA)
        w50 = cv2.resize(m.astype(np.float32), g50, interpolation=cv2.INTER_AREA); h50 = cv2.resize((hole_px & m).astype(np.float32), g50, interpolation=cv2.INTER_AREA)
        P5, R5 = A50(plab) / np.maximum(w50[..., None], 1e-4), A50(lab) / np.maximum(w50[..., None], 1e-4); d5 = np.hypot(P5[..., 1] - R5[..., 1], P5[..., 2] - R5[..., 2])
        out['dab50'] = float(d5[w50 > 0.9].mean()); out['dab50_hole'] = float(d5[h50 > 0.9].mean()); out['dab50_sheet'] = float(d5[(w50 > 0.9) & (h50 < 0.05)].mean())
        for kx, mk in (('hole', hole_px), ('sheet', sheet_px), ('rim', strong_rim)):
            out['dab_' + kx] = float(np.hypot(np.median(plab[..., 1][mk]) - np.median(lab[..., 1][mk]), np.median(plab[..., 2][mk]) - np.median(lab[..., 2][mk])))
        ppm = 1000.0 / UM                                                       # bands as in the engine (§23): σ = λ / 5.3
        for nm, lo_mm, hi_mm in (('B1', 0.3, 1.0), ('B2', 0.09, 0.3), ('B3', 0.03, 0.09)):
            bp = lambda x: cv2.GaussianBlur(x, (0, 0), lo_mm * ppm / 5.3) - cv2.GaussianBlur(x, (0, 0), hi_mm * ppm / 5.3)
            a, b = bp(plab[..., 0])[m], bp(lab[..., 0])[m]; out[nm + '_corr'] = float(np.corrcoef(a, b)[0, 1]); out[nm + '_ratio'] = float(b.std() / a.std())
        return {k2: round(v, 3) for k2, v in out.items()}
    report['metrics'] = {'engine_v84c': metrics(eng_w), 'layers_clean': metrics(clean), 'layers_with_camera_grain': metrics(noisy)}
    report['primitives'] = {'outlines': len(outlines), 'outline_coeffs': len(outlines) * 65 * 2, 'fibres': len(fibres), 'fibre_samples': nf, 'guides': len(guides), 'guide_samples': ng, 'veins': len(veins), 'vein_samples': int(sum(len(c['xy']) for c in veins)), 'sheet_fibres': len(sfib), 'sheet_fibre_samples': int(sum(len(c['xy']) for c in sfib)), 'sheet_veins': len(svein), 'sheet_vein_samples': int(sum(len(c['xy']) for c in svein)),
                            'rim_samples': int(sum(len(a) for a in rim_strength)), 'sheet_cells': int(gx * gy), 'window_mm2': round(float(iris.sum()) * (UM / 1000) ** 2, 2)}
    for kx, v in report['metrics'].items(): print(kx, v)
    print(report['primitives'])
    json.dump(report, open(os.path.join(OUT, TAG + '.json'), 'w'), indent=1)

    def tag(img, t):
        img = img.copy(); cv2.rectangle(img, (0, 0), (W, 30), (0, 0, 0), -1); cv2.putText(img, t, (8, 21), cv2.FONT_HERSHEY_SIMPLEX, 0.62, (255, 255, 255), 1, cv2.LINE_AA); return img
    cv2.imwrite(os.path.join(OUT, TAG + '.jpg'), np.hstack([tag(photo, 'photo (native, 4.7 um/px)'), tag(noisy, 'layer model: primitives only'), tag(eng_w, 'engine today (v84c)')]), [cv2.IMWRITE_JPEG_QUALITY, 93])
    cv2.imwrite(os.path.join(OUT, TAG + '-clean.jpg'), np.hstack([tag(photo, 'photo'), tag(clean, 'layer model, no camera grain')]), [cv2.IMWRITE_JPEG_QUALITY, 93])
    ov = photo.copy()
    for o in outlines: cv2.polylines(ov, [o.round().astype(np.int32)], True, (0, 200, 255), 1, cv2.LINE_AA)
    for c in fibres: cv2.polylines(ov, [c['xy'].round().astype(np.int32)], False, (255, 255, 0), 1, cv2.LINE_AA)
    for c in guides: cv2.polylines(ov, [c['xy'].round().astype(np.int32)], False, (255, 0, 255), 1, cv2.LINE_AA)
    for c in veins: cv2.polylines(ov, [c['xy'].round().astype(np.int32)], False, (0, 0, 255), 1, cv2.LINE_AA)
    cv2.imwrite(os.path.join(OUT, TAG + '-primitives.jpg'), tag(ov, 'primitives: outlines (orange) fibres (cyan) veins (red) guides (magenta)'), [cv2.IMWRITE_JPEG_QUALITY, 92])


if __name__ == '__main__':
    main()
