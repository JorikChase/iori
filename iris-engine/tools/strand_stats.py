#!/usr/bin/env python3
"""S0 (study/08 §3.3): strand statistics from the super-macro sectors — priors for the strand grower.

    /usr/bin/python3 iris-engine/tools/strand_stats.py            # all super-macro / sector images in ref-staging/

Per image, inside the in-focus part only:
- scale: circles fitted to the pupil edge (and the limbus when it is in the frame). µm/px from the limbus
  (radius 5.9 mm) when present, otherwise from an ASSUMED pupil diameter (3.0 mm, ring-lit macro) — so every
  length carries that uncertainty (≈ ±30 %); ratios between lengths do not.
- two ridge populations by scale-normalised Hessian ridges: `child` (σ 6–18 µm) and `guide` (σ 30–85 µm);
  each thresholded, thinned (Zhang–Suen), spurs pruned, split into segments at junctions.
- per population: width (FWHM across the ridge), segment length, tortuosity, angle to the radial direction,
  waviness (RMS lateral deviation from the 400 µm-smoothed centreline, and its wavelength; segments ≥ 600 µm), spacing to the next
  ridge across the flow, junction / endpoint densities, 3- vs 4-arm junctions, coverage, colour (Lab) on the
  ridge vs in the gaps.

Output: study/s0-strands/<id>.json + <id>-overlay.jpg (guides orange, children cyan, junctions red) and
summary.json. Photographs stay in ref-staging/ (gitignored); overlays are derived previews.
"""
import cv2, glob, json, os, sys
import numpy as np
from scipy import ndimage as ndi

ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ENG, 'study', 's0-strands')
WORK_LONG = 2000                       # working size (long side), ≈ 3 µm/px on these frames
PUPIL_MM_ASSUMED, LIMBUS_R_MM = 3.0, 5.9


def fit_circle(pts):
    x, y = pts[:, 0], pts[:, 1]
    A = np.c_[2 * x, 2 * y, np.ones(len(x))]
    c, *_ = np.linalg.lstsq(A, x * x + y * y, rcond=None)
    return c[0], c[1], float(np.sqrt(c[2] + c[0] ** 2 + c[1] ** 2))


def pupil_circle(gray):
    """largest dark blob touching or near the frame → circle through its boundary that is not the frame edge"""
    g = cv2.GaussianBlur(gray, (0, 0), 6)
    thr = np.percentile(g, 4) * 1.6 + 0.01
    m = (g < thr).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((15, 15), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    if n < 2: return None
    k = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    blob = (lab == k).astype(np.uint8)
    if blob.sum() < 0.01 * blob.size: return None
    edge = blob - cv2.erode(blob, np.ones((3, 3), np.uint8))
    ys, xs = np.nonzero(edge)
    H, W = gray.shape
    keep = (xs > 8) & (xs < W - 9) & (ys > 8) & (ys < H - 9)
    pts = np.c_[xs[keep], ys[keep]].astype(np.float64)
    if len(pts) < 50: return None
    for _ in range(3):                                  # trimmed refit
        cx, cy, r = fit_circle(pts)
        d = np.abs(np.hypot(pts[:, 0] - cx, pts[:, 1] - cy) - r)
        pts = pts[d < max(2.0, np.percentile(d, 80))]
    return cx, cy, r


def zhang_suen(img):
    a = img.astype(np.uint8).copy()
    def nb(a):
        p = np.pad(a, 1)
        return [p[:-2, 1:-1], p[:-2, 2:], p[1:-1, 2:], p[2:, 2:], p[2:, 1:-1], p[2:, :-2], p[1:-1, :-2], p[:-2, :-2]]
    while True:
        changed = False
        for step in (0, 1):
            P = nb(a)
            B = sum(P)
            A = sum(((P[i] == 0) & (P[(i + 1) % 8] == 1)).astype(np.uint8) for i in range(8))
            if step == 0: c = (P[0] * P[2] * P[4] == 0) & (P[2] * P[4] * P[6] == 0)
            else:         c = (P[0] * P[2] * P[6] == 0) & (P[0] * P[4] * P[6] == 0)
            rm = (a == 1) & (B >= 2) & (B <= 6) & (A == 1) & c
            if rm.any(): a[rm] = 0; changed = True
        if not changed: return a


def ridge(L, sigmas):
    """scale-normalised bright-ridge strength, its scale and the across-ridge direction"""
    best = np.zeros_like(L); bs = np.zeros_like(L); nx = np.zeros_like(L); ny = np.zeros_like(L)
    for s in sigmas:
        g = cv2.GaussianBlur(L, (0, 0), s)
        gxx = cv2.Sobel(g, cv2.CV_32F, 2, 0, ksize=3); gyy = cv2.Sobel(g, cv2.CV_32F, 0, 2, ksize=3); gxy = cv2.Sobel(g, cv2.CV_32F, 1, 1, ksize=3)
        tr, df = gxx + gyy, np.sqrt((gxx - gyy) ** 2 + 4 * gxy ** 2)
        l1, l2 = (tr - df) / 2, (tr + df) / 2                         # l1 ≤ l2; a bright ridge has l1 ≪ 0, |l2| small
        R = np.where((l1 < 0) & (np.abs(l2) < 0.6 * np.abs(l1)), -l1, 0) * s * s
        th = 0.5 * np.arctan2(2 * gxy, gxx - gyy)                     # direction of the l2 eigenvector … the l1 one is ⟂
        ex, ey = np.cos(th + np.pi / 2), np.sin(th + np.pi / 2)
        # pick the eigenvector belonging to l1 (largest |curvature|): test which of the two gives the lower second derivative
        d_a = gxx * ex * ex + 2 * gxy * ex * ey + gyy * ey * ey
        d_b = gxx * ey * ey - 2 * gxy * ex * ey + gyy * ex * ex
        sw = d_b < d_a
        ex2, ey2 = np.where(sw, -ey, ex), np.where(sw, ex, ey)
        up = R > best
        best[up] = R[up]; bs[up] = s; nx[up] = ex2[up]; ny[up] = ey2[up]
    return best, bs, nx, ny


def crossing(sk):
    """crossing number (0→1 transitions around the 8-neighbourhood): 1 = end, 2 = line, ≥ 3 = junction"""
    p = np.pad(sk.astype(np.uint8), 1)
    P = [p[:-2, 1:-1], p[:-2, 2:], p[1:-1, 2:], p[2:, 2:], p[2:, 1:-1], p[2:, :-2], p[1:-1, :-2], p[:-2, :-2]]
    return sum(((P[i] == 0) & (P[(i + 1) % 8] == 1)).astype(np.int32) for i in range(8)) * (sk > 0)


def prune(skel, min_len):
    """drop spurs shorter than min_len px (iteratively remove short end-segments)"""
    sk = skel.copy()
    K = np.ones((3, 3), np.float32)
    for _ in range(3):
        deg = crossing(sk)
        junc = cv2.dilate(((deg >= 3) & (sk > 0)).astype(np.uint8), np.ones((3, 3), np.uint8))
        segs = ((sk > 0) & (junc == 0)).astype(np.uint8)
        n, lab, st, _ = cv2.connectedComponentsWithStats(segs, connectivity=8)
        ends = ((deg == 1) & (sk > 0))
        has_end = np.zeros(n, bool); has_end[np.unique(lab[ends])] = True
        small = (st[:, cv2.CC_STAT_AREA] < min_len) & has_end; small[0] = False
        if not small.any(): break
        sk[small[lab]] = 0
        sk = zhang_suen(sk)
    return sk


def segments(sk):
    K = np.ones((3, 3), np.float32)
    deg = crossing(sk)
    jmask = ((deg >= 3) & (sk > 0)).astype(np.uint8)
    nj, jlab, jst, jcent = cv2.connectedComponentsWithStats(cv2.dilate(jmask, np.ones((3, 3), np.uint8)), connectivity=8)
    segm = ((sk > 0) & (cv2.dilate(jmask, np.ones((3, 3), np.uint8)) == 0)).astype(np.uint8)
    n, lab = cv2.connectedComponents(segm, connectivity=8)
    # arms per junction = distinct segments touching the junction blob
    arms = []
    big = cv2.dilate((jlab > 0).astype(np.uint8), np.ones((3, 3), np.uint8))
    jl2 = ndi.grey_dilation(jlab, size=(3, 3))
    touch = (lab > 0) & (jl2 > 0)
    pairs = set(zip(jl2[touch].tolist(), lab[touch].tolist()))
    cnt = {}
    for j, s in pairs: cnt[j] = cnt.get(j, 0) + 1
    arms = [cnt.get(j, 0) for j in range(1, nj)]
    ends = int(((deg == 1) & (sk > 0)).sum())
    return n - 1, lab, arms, jcent[1:], ends


def order_path(ys, xs):
    """order the pixels of one 8-connected open segment from one end to the other"""
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


def pct(v, qs=(10, 25, 50, 75, 90)):
    v = np.asarray(v, np.float64); v = v[np.isfinite(v)]
    return None if len(v) == 0 else {('p%d' % q): round(float(np.percentile(v, q)), 3) for q in qs} | {'n': int(len(v)), 'mean': round(float(v.mean()), 3)}


def population(name, Lf, focus, sig_um, um, centre, lab_img, overlay, colour):
    sig = [max(1.0, s / um) for s in sig_um]
    R, S, nx, ny = ridge(Lf, sig)
    # centrelines: non-maximum suppression of the ridge strength across the ridge, then hysteresis
    H0, W0 = Lf.shape
    gy, gx = np.mgrid[0:H0, 0:W0].astype(np.float32)
    st = max(1.0, 0.5 * sig[0])                                       # compare half a σ away: a flat-topped bundle has no 1-px maximum
    Rs = cv2.GaussianBlur(R, (0, 0), max(0.8, 0.35 * sig[0]))
    Ra = cv2.remap(Rs, gx + st * nx, gy + st * ny, cv2.INTER_LINEAR); Rb = cv2.remap(Rs, gx - st * nx, gy - st * ny, cv2.INTER_LINEAR)
    vals = R[focus & (R > 0)]
    hi, lo = np.percentile(vals, 70), np.percentile(vals, 40)
    cand = ((Rs >= Ra) & (Rs >= Rb) & (R > lo) & focus).astype(np.uint8)
    cand = cv2.dilate(cand, np.ones((2, 2), np.uint8))                # close one-pixel breaks of the NMS line
    n0, l0 = cv2.connectedComponents(cand, connectivity=8)
    strong = np.zeros(n0, bool); strong[np.unique(l0[(R > hi) & (cand > 0)])] = True; strong[0] = False
    mask = ((R > lo) & focus).astype(np.uint8)                        # ridge *area*, for coverage and the gap colour
    sk = zhang_suen(strong[l0].astype(np.uint8))
    sk = prune(sk, int(round(3 * sig[0] + 4)))
    nseg, lab, arms, jcent, ends = segments(sk)
    H, W = Lf.shape
    area_mm2 = focus.sum() * (um / 1000) ** 2
    # widths: FWHM of the flattened luminance along the ridge normal
    ys, xs = np.nonzero(sk)
    sel = np.random.RandomState(1).choice(len(ys), min(len(ys), 6000), replace=False)
    widths, spacing = [], []
    reach = int(round(6 * sig[-1] + 6))
    sk_d = sk.astype(bool)
    for i in sel:
        y, x = ys[i], xs[i]; ex, ey = nx[y, x], ny[y, x]
        t = np.arange(-reach, reach + 1)
        px, py = x + t * ex, y + t * ey
        ok = (px >= 0) & (px < W - 1) & (py >= 0) & (py < H - 1)
        if ok.sum() < len(t): continue
        prof = Lf[np.round(py).astype(int), np.round(px).astype(int)]
        c = reach; peak = prof[c]
        lo_l, lo_r = prof[:c].min(), prof[c + 1:].min(); base = max(lo_l, lo_r)
        if peak - base <= 0.02: continue
        half = base + 0.5 * (peak - base)
        l = c
        while l > 0 and prof[l] > half: l -= 1
        r = c
        while r < len(prof) - 1 and prof[r] > half: r += 1
        if l > 0 and r < len(prof) - 1: widths.append((r - l) * um)
        for sgn in (-1, 1):                                          # distance to the next ridge of this population across the flow
            for k in range(int(2 * sig[0]) + 2, reach * 2):
                qx, qy = int(round(x + sgn * k * ex)), int(round(y + sgn * k * ey))
                if qx < 1 or qy < 1 or qx >= W - 1 or qy >= H - 1: break
                if sk_d[qy - 1:qy + 2, qx - 1:qx + 2].any(): spacing.append(k * um); break
    # segments: length, tortuosity, radial angle, crimp
    lens, tort, ang, crimpA, crimpL = [], [], [], [], []
    smooth_px = max(5, int(round(400 / um)))                          # waviness = deviation from the 400 µm-smoothed centreline
    for s in range(1, nseg + 1):
        yy, xx = np.nonzero(lab == s)
        if len(yy) < 6: continue
        p = order_path(yy, xx)
        if len(p) >= 9:                                               # take the pixel staircase out before measuring lengths
            k5 = np.ones(5) / 5; p = np.c_[np.convolve(p[:, 0], k5, 'valid'), np.convolve(p[:, 1], k5, 'valid')]
        d = np.hypot(np.diff(p[:, 0]), np.diff(p[:, 1])); arc = d.sum(); chord = np.hypot(*(p[-1] - p[0]))
        lens.append(arc * um)
        if chord > 4: tort.append(arc / chord)
        if centre is not None and chord > 4:
            mid = p[len(p) // 2]; rad = np.array([mid[0] - centre[1], mid[1] - centre[0]]); seg = p[-1] - p[0]
            ca = abs(np.dot(rad, seg)) / (np.linalg.norm(rad) * np.linalg.norm(seg) + 1e-9)
            ang.append(np.degrees(np.arccos(min(1, ca))))
        if len(p) > 1.5 * smooth_px:
            k = np.ones(smooth_px) / smooth_px
            sy, sx = np.convolve(p[:, 0], k, 'valid'), np.convolve(p[:, 1], k, 'valid')
            o = (smooth_px - 1) // 2; q = p[o:o + len(sy)]
            ty, tx = np.gradient(sy), np.gradient(sx); nrm = np.hypot(ty, tx) + 1e-9
            dev = ((q[:, 0] - sy) * tx - (q[:, 1] - sx) * ty) / nrm      # signed lateral deviation, px
            crimpA.append(float(np.sqrt((dev ** 2).mean())) * um)
            zc = np.nonzero(np.diff(np.sign(dev)) != 0)[0]
            if len(zc) >= 2: crimpL.append(2 * float(np.mean(np.diff(zc))) * um)
    ey_, ex_ = np.nonzero((crossing(sk) == 1))
    near = int(round(max(3, 0.6 * (np.median(spacing) if spacing else 40) / um)))
    merges = 0
    for y, x in zip(ey_, ex_):
        own = lab[max(0, y - 1):y + 2, max(0, x - 1):x + 2].max()
        win = lab[max(0, y - near):y + near + 1, max(0, x - near):x + near + 1]
        if ((win > 0) & (win != own)).any(): merges += 1
    merge_fraction = round(merges / max(1, len(ey_)), 3)
    on = sk_d; gaps = focus & (cv2.dilate(mask, np.ones((5, 5), np.uint8)) == 0)
    labm = lambda m: [round(float(lab_img[..., c][m].mean()), 1) for c in range(3)] if m.any() else None
    overlay[cv2.dilate(sk, np.ones((2, 2), np.uint8)) > 0] = colour
    for c in jcent: cv2.circle(overlay, (int(c[0]), int(c[1])), 2, (0, 0, 255), -1)
    a = np.array(arms)
    return {
        'sigmas_um': sig_um, 'focus_area_mm2': round(float(area_mm2), 3),
        'coverage': round(float(mask[focus].mean()), 3),
        'width_um': pct(widths), 'spacing_um': pct(spacing), 'segment_length_um': pct(lens), 'tortuosity': pct(tort),
        'angle_to_radial_deg': pct(ang), 'crimp_rms_um': pct(crimpA), 'crimp_wavelength_um': pct(crimpL),
        'segments_per_mm2': round(nseg / area_mm2, 1), 'junctions_per_mm2': round(len(arms) / area_mm2, 1), 'endpoints_per_mm2': round(ends / area_mm2, 1),
        'endpoints_next_to_another_strand': merge_fraction,
        'junction_arms': {'3': int((a == 3).sum()), '4': int((a == 4).sum()), '5+': int((a >= 5).sum())},
        'length_mm_per_mm2': round(float(sk.sum() * um / 1000 / area_mm2), 2),
        'lab_on_ridge': labm(on), 'lab_in_gaps': labm(gaps),
    }


def analyse(path):
    ident = os.path.basename(path).replace('.jpg', '')
    im = cv2.imread(path)
    sc = WORK_LONG / max(im.shape[:2])
    im = cv2.resize(im, None, fx=sc, fy=sc, interpolation=cv2.INTER_AREA)
    H, W = im.shape[:2]
    gray = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
    lab_img = cv2.cvtColor(im.astype(np.float32) / 255, cv2.COLOR_BGR2Lab)
    pc = pupil_circle(gray)
    scale_from = 'assumed 3 µm/px'; um = 3.0; centre = None
    if pc:
        centre = (pc[0], pc[1]); um = PUPIL_MM_ASSUMED * 1000 / (2 * pc[2]); scale_from = 'pupil diameter ASSUMED %.1f mm' % PUPIL_MM_ASSUMED
    # flatten and find the in-focus region
    Lf = gray / (cv2.GaussianBlur(gray, (0, 0), 150 / um) + 0.03)
    Lf = cv2.GaussianBlur(Lf, (0, 0), 1.0)                            # sensor grain
    dog = lambda a, b: cv2.GaussianBlur(Lf, (0, 0), a / um) - cv2.GaussianBlur(Lf, (0, 0), b / um)
    e_f = cv2.GaussianBlur(dog(10, 30) ** 2, (0, 0), 200 / um)        # absolute strand-band energy, smoothed over crypts and bundles
    tissue = gray > max(0.05, np.percentile(gray, 8))
    if pc: tissue &= np.hypot(*np.meshgrid(np.arange(W) - pc[0], np.arange(H) - pc[1])) > pc[2] * 1.06
    focus = tissue & (e_f > np.percentile(e_f[tissue], 60))
    focus = cv2.morphologyEx(focus.astype(np.uint8), cv2.MORPH_OPEN, np.ones((9, 9), np.uint8)).astype(bool)
    overlay = im.copy(); overlay[~focus] = (overlay[~focus] * 0.35).astype(np.uint8)
    out = {'id': ident, 'work_px': [W, H], 'um_per_px_work': round(um, 3), 'um_per_px_native': round(um * sc, 3), 'scale_from': scale_from,
           'pupil_circle_px': [round(v, 1) for v in pc] if pc else None, 'focus_fraction': round(float(focus.mean()), 3)}
    out['guide'] = population('guide', Lf, focus, [30, 42, 60, 85], um, centre, lab_img, overlay, (0, 150, 255))
    out['child'] = population('child', Lf, focus, [6, 9, 13, 18], um, centre, lab_img, overlay, (255, 230, 0))
    os.makedirs(OUT, exist_ok=True)
    cv2.imwrite(os.path.join(OUT, ident + '-overlay.jpg'), overlay, [cv2.IMWRITE_JPEG_QUALITY, 88])
    json.dump(out, open(os.path.join(OUT, ident + '.json'), 'w'), indent=1)
    return out


if __name__ == '__main__':
    files = sys.argv[1:] or sorted(glob.glob(os.path.join(ENG, 'ref-staging', 'u-supermacro-*.jpg')) + glob.glob(os.path.join(ENG, 'ref-staging', 'u-sector-*.jpg')))
    res = []
    for f in files:
        print('…', os.path.basename(f), flush=True)
        r = analyse(f); res.append(r)
        for pop in ('guide', 'child'):
            p = r[pop]; g = lambda k: (p[k] or {}).get('p50')
            print(f"   {pop:5s} width {g('width_um')} µm · spacing {g('spacing_um')} · seg {g('segment_length_um')} · tort {g('tortuosity')} · angle {g('angle_to_radial_deg')}° · crimp {g('crimp_rms_um')}/{g('crimp_wavelength_um')} µm · junc {p['junctions_per_mm2']}/mm² · ends→neighbour {p['endpoints_next_to_another_strand']} · cover {p['coverage']}")
    json.dump(res, open(os.path.join(OUT, 'summary.json'), 'w'), indent=1)
