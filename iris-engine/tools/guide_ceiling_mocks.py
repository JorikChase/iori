#!/usr/bin/python3
"""study/08 §8 — controls on the §7 guide-ceiling test, offline (no browser, no render).

§7 concluded "the gap between the box reconstruction and the real-pixel footprint is per-texel brightness inside
the strand" and proposed S1b = seeded noise inside the strand tube. Before building that, this script mocks it and
its alternatives on the same data (study/audit-s6/guide-dump-*.json + guide-trace-*.json) with a Python port of
fit.js's oracleParts/partCorrOf (mask-normalised Gaussians, cuts 1.0 / 0.30 / 0.09 / 0.03 mm, σ = λ·ppm/5.3).

Rows (everything outside the ridges' footprint is the 1 mm low-pass, as in §7):
  box-peak      §7's box: centreline luminance, flat across the traced width          (validates the port)
  true          §7's coverage control: real photo pixels inside the footprint          (validates the port)
  box-mean      flat across the width, but each segment takes the MEAN photo luminance of its own footprint
  tube          smooth tube cross-profile, peak = centreline luminance
  noise-*       S1b as proposed: box-mean × (1 + 0.3·seeded noise), noise σ 15 / 40 µm  (unplaced texture)
  true-blur-*   real pixels inside the footprint, low-passed at σ 10 / 20 / 40 / 80 µm  (resolution a FITTED
                brightness term would need)
  true-wide-*   real pixels inside a footprint 1.5× / 2× as wide                        (what the flanks carry)

Run: /usr/bin/python3 tools/guide_ceiling_mocks.py   → study/audit-s1b/ceiling-mocks.json + a printed table
"""
import base64, glob, json, os, sys
import numpy as np, cv2

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'study', 'audit-s6')
OUT = os.path.join(HERE, '..', 'study', 'audit-s1b')
CUTS = [1.0, 0.30, 0.09, 0.03]
PARTS = ['LOW', 'B1', 'B2', 'B3']


def parts_of(L, M, ppm):
    LM = L * M
    G = []
    for mm in CUTS:
        s = mm * ppm / 5.3
        a = cv2.GaussianBlur(LM, (0, 0), s); w = cv2.GaussianBlur(M, (0, 0), s)
        G.append(np.where(M > 0, a / np.maximum(w, 1e-3), 0))
    return {'LOW': G[0], 'B1': G[1] - G[0], 'B2': G[2] - G[1], 'B3': G[3] - G[2]}


def corr_of(Pp, Pr, M):
    m = M > 0; out = {}
    for nm in PARTS:
        a = Pp[nm][m] - Pp[nm][m].mean(); b = Pr[nm][m] - Pr[nm][m].mean()
        va, vb = (a * a).sum(), (b * b).sum()
        out[nm] = round(float((a * b).sum() / np.sqrt(va * vb)) if va > 0 and vb > 0 else 0.0, 3)
    return out


def load(eye):
    d = json.load(open(os.path.join(SRC, 'guide-dump-%s.json' % eye)))
    ppm = d['ppm']
    photo = cv2.imdecode(np.frombuffer(base64.b64decode(d['photoPNG'].split(',')[1]), np.uint8), cv2.IMREAD_COLOR)
    mrgba = cv2.imdecode(np.frombuffer(base64.b64decode(d['maskPNG'].split(',')[1]), np.uint8), cv2.IMREAD_UNCHANGED)
    M = (mrgba[..., 3] > 127).astype(np.float32)
    L = (0.114 * photo[..., 0] + 0.587 * photo[..., 1] + 0.299 * photo[..., 2]).astype(np.float32) / 255.0
    return ppm, L, M, cv2.GaussianBlur(L, (0, 0), 1.0 * ppm / 5.3)


def raster(ridges, ppm, H, W, chunk_mm=0.10):
    """width-exact rasteriser: every pixel finds its nearest centreline pixel (distance transform with labels) and
    inherits that point's ridge half-width, centreline luminance and along-ridge chunk id. cv2.line is NOT
    width-exact (thickness 7 paints 9 px) — the first version of this table used it and over-painted by ≈ 25 %."""
    src = np.ones((H, W), np.uint8); hw_px = np.zeros((H, W), np.float32); peak = np.zeros((H, W), np.float32); chunk = np.zeros((H, W), np.int32)
    CH = max(2, int(round(chunk_mm * ppm))); nchunk = 1
    for r in ridges:
        pts = r['pts']
        if len(pts) < 2: continue
        vals = r.get('vals') or [r['val']] * len(pts)
        for i, (x, y) in enumerate(pts):
            xi, yi = int(round(x)), int(round(y))
            if 0 <= xi < W and 0 <= yi < H:
                src[yi, xi] = 0; hw_px[yi, xi] = 0.5 * r['width_mm'] * ppm; peak[yi, xi] = vals[i]; chunk[yi, xi] = nchunk + i // CH
        nchunk += len(pts) // CH + 1
    dist, lab = cv2.distanceTransformWithLabels(src, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    zy, zx = np.nonzero(src == 0)
    lut = lambda a, dt: (lambda l: (l.__setitem__(lab[zy, zx], a[zy, zx]), l)[1])(np.zeros(lab.max() + 1, dt))
    return dist, lut(hw_px, np.float32)[lab], lut(peak, np.float32)[lab], lut(chunk, np.int64)[lab], nchunk


def run(eye):
    """§8.1: controls on §7's own guide trace"""
    ppm, L, M, low = load(eye)
    t = json.load(open(os.path.join(SRC, 'guide-trace-%s.json' % eye)))
    Pp = parts_of(L, M, ppm); H, W = L.shape
    dist, HWp, PK, CHK, nchunk = raster(t['ridges'], ppm, H, W)
    cover = lambda scale=1.0: np.clip(HWp * scale - dist + 0.5, 0, 1)   # antialiased coverage, like the canvas stroke
    A = cover(); F = A > 0.5
    res = {'_coverage': round(float((A * M).sum() / M.sum()), 3), '_ridges': len(t['ridges'])}
    comp = lambda a, val: low + a * (val - low)
    sc = lambda img: corr_of(Pp, parts_of(img.astype(np.float32), M, ppm), M)

    res['box-peak'] = sc(comp(A, PK))                                   # §7's box
    res['true'] = sc(comp(A, L))                                        # §7's coverage control
    cnt = np.bincount(CHK[F], minlength=nchunk + 1); sm = np.bincount(CHK[F], weights=L[F], minlength=nchunk + 1)
    MEAN = (sm / np.maximum(cnt, 1))[CHK].astype(np.float32)
    res['box-mean'] = sc(comp(A, MEAN))
    tube = np.sqrt(np.clip(1 - (dist / np.maximum(1.6 * HWp, 1e-3)) ** 2, 0, 1))   # FWHM ≈ the traced width
    res['tube'] = sc(low + tube * (PK - low))
    rng = np.random.default_rng(1234)
    for um in (15, 40):                                                 # S1b as proposed: seeded, unplaced
        n = cv2.GaussianBlur(rng.standard_normal((H, W)).astype(np.float32), (0, 0), max(0.6, um / 1000 * ppm)); n /= n.std()
        res['noise-%d' % um] = sc(comp(A, MEAN * (1 + 0.3 * n)))
    for um in (10, 20, 40, 80):                                         # a FITTED brightness term at finite resolution
        res['true-blur-%d' % um] = sc(comp(A, cv2.GaussianBlur(L, (0, 0), max(0.3, um / 1000 * ppm))))
    for s2 in (1.5, 2.0):
        Aw = cover(s2); res['true-wide-%.1f' % s2] = dict(sc(comp(Aw, L)), coverage=round(float((Aw * M).sum() / M.sum()), 3))
    # is the ridge footprint special? the same amount of true pixels somewhere else:
    res['true-gaps-only'] = dict(sc(comp(1 - A, L)), coverage=round(float(((1 - A) * M).sum() / M.sum()), 3))   # everywhere BUT the ridges
    Af = A[::-1, ::-1].copy()                                           # the same footprint rotated 180°: ridge-shaped, wrong places
    res['true-rot180'] = dict(sc(comp(Af, L)), coverage=round(float((Af * M).sum() / M.sum()), 3))
    return res


# ---- §8.2: what can a fitted STRAND-OBJECT representation reach? ridges and valleys (dark gaps), guide and child
# scale, each object = a centreline + one width + one brightness per `chunk_mm` of its length (flat across).
SETS = {'G': dict(sigmas_um=None, invert=False), 'Gv': dict(sigmas_um=None, invert=True),
        'C': dict(sigmas_um=[14, 20, 28], invert=False), 'Cv': dict(sigmas_um=[14, 20, 28], invert=True)}


def objects(eye):
    sys.path.insert(0, HERE); import guide_trace as gt
    ppm, L, M, low = load(eye); Pp = parts_of(L, M, ppm); H, W = L.shape
    T = {}
    for k, o in SETS.items():
        f = os.path.join(OUT, 'trace-%s-%s.json' % (k, eye))
        if not os.path.exists(f): gt.trace(os.path.join(SRC, 'guide-dump-%s.json' % eye), tag='trace-' + k, out_dir=OUT, **o)
        T[k] = json.load(open(f))['ridges']
    res = {}
    for combo in (['G'], ['G', 'Gv'], ['C'], ['C', 'Cv'], ['G', 'Gv', 'C', 'Cv']):
        for chunk_mm in (0.10, 0.05):
            R = [r for k in combo for r in T[k]]
            dist, HWp, PK, CHK, nchunk = raster(R, ppm, H, W, chunk_mm)
            A = np.clip(HWp - dist + 0.5, 0, 1); F = A > 0.5
            cnt = np.bincount(CHK[F], minlength=nchunk + 1); sm = np.bincount(CHK[F], weights=L[F], minlength=nchunk + 1)
            MEAN = (sm / np.maximum(cnt, 1))[CHK].astype(np.float32)
            c = corr_of(Pp, parts_of((low + A * (MEAN - low)).astype(np.float32), M, ppm), M)
            mm = sum(r['len_mm'] for r in R)
            # bytes: a polyline knot per 0.1 mm (2 × u16) + a brightness byte per chunk + width and header per object
            c.update(objects=len(R), len_mm=round(mm), coverage=round(float((A * M).sum() / M.sum()), 3), kB=round((mm / 0.10 * 4 + mm / chunk_mm + 4 * len(R)) / 1024, 1))
            res['+'.join(combo) + ' @%.2f' % chunk_mm] = c
    return res


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if a != '--objects']
    eyes = args or sorted(os.path.basename(f)[11:13] for f in glob.glob(os.path.join(SRC, 'guide-dump-??.json')))
    os.makedirs(OUT, exist_ok=True)
    allr = {}; fn = objects if '--objects' in sys.argv else run
    for e in eyes:
        allr[e] = fn(e)
        print('eye', e, *(('footprint coverage', allr[e]['_coverage']) if '_coverage' in allr[e] else ()))
        for k, v in allr[e].items():
            if k[0] != '_': print('  %-20s B1 %.3f  B2 %.3f  B3 %.3f  LOW %.3f' % (k, v['B1'], v['B2'], v['B3'], v['LOW']) + ''.join('  %s %s' % (q, v[q]) for q in ('coverage', 'objects', 'len_mm', 'kB') if q in v))
    json.dump(allr, open(os.path.join(OUT, 'object-ceiling.json' if fn is objects else 'ceiling-mocks.json'), 'w'), indent=1)
