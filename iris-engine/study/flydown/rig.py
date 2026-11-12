#!/usr/bin/env python3
"""D0 — the fly-down experiments (study/17 §2.7, iori's priority 1). Offline, CPU, no engine files touched.

Everything here is evaluated POINTWISE at any position and any zoom, in the native photograph's frame
(µm = native px × UM). What a view sees:

  base   = the photograph low-passed below its finest band (σ0), magnified bicubically — the far view's content
  detail = the octaves an algorithm adds from the photo's finest band downward (λ0 = 2 native px ≈ 9.3 µm),
           each faded to exactly zero when the view's pixel is coarser than half its wavelength
  view   = base × exp(detail)   (luminance only: hue stays with the material)

Steering comes only from what the eye file ships (study/17 §1.5): the traced curves (deck fibres, veins, sheet guides,
sheet fibres) give the strand tangent, the crypt outlines give the class and a relief proxy (sheet 0, crypt floor −pit,
a wall of the fitted width). The photograph gives the SEED: its finest-band residual R, and the local band energy.

Algorithms (one function each, same signature):
  A  erosion   — a Johansen-style erosion filter whose gully direction is the fitted strand tangent (and the relief
                 gradient on crypt walls); phasor stripes per octave, re-steered by the octaves above; octave 0's
                 phases demodulated from R (the grain becomes stripes where it agrees with the anatomy)
  B  mosaic    — an anisotropic Worley cell mosaic (ABL cells ≈ 12 µm, then granules), cell melanin seeded by R
  C  example   — by-example magnification from the eye's own photograph (local self-examples, Freedman & Fattal 2011;
                 the exemplar-graph idea of Han et al. 2008): each ×2 step copies the high band of the best-matching
                 nearby patch one scale up
  D  cascade   — study/17's recommendation: A where the anatomy has a direction or a slope, B on the flat sheet
"""
import os, sys, json, numpy as np, cv2

HERE = os.path.dirname(os.path.abspath(__file__)); ENG = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ENG, 'tools', 'eyefile')); import read as eyeread

REFS = {'26': '26-green-crypts-isolated.jpg', '09': '09-blue-green-isolated.jpg', '25': '25-green-amber-ring-isolated.jpg',
        '35': '35-grey-green-isolated.jpg'}
FLOOR_UM = 1.0            # decision 4 (provisional): no octave finer than this; below it, soft magnification
LAM0_PX = 2.0             # octave 0 wavelength in native px (the photo's finest band)

def srgb2lin(x): return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)
def lin2srgb(x): x = np.clip(x, 0, 1); return np.where(x <= 0.0031308, 12.92 * x, 1.055 * x ** (1 / 2.4) - 0.055)

# ---------------------------------------------------------------- integer hashing (deterministic, tile-exact)
def hash3(ix, iy, k, salt=0):
    h = (ix.astype(np.int64) * 73856093) ^ (iy.astype(np.int64) * 19349663) ^ ((np.int64(k) + 1) * 83492791) ^ (np.int64(salt) * 2654435761)
    h = h & 0xffffffff
    h = (h ^ (h >> 16)) * 0x45d9f3b & 0xffffffff
    h = (h ^ (h >> 16)) * 0x45d9f3b & 0xffffffff
    h = h ^ (h >> 16)
    return (h & 0xffffff).astype(np.float64) / float(0x1000000)

class Eye:
    """The photograph, the seed and the steering fields of one eye, in native px."""
    def __init__(self, ref='26', down=1):
        self.ref = ref
        t, c, _ = eyeread.read(open(os.path.join(ENG, 'data', f'{ref}.iris'), 'rb').read())
        self.t, self.c = t, c
        bgr = cv2.imread(os.path.join(ENG, 'ref', REFS[ref])).astype(np.float32) / 255
        if down > 1: bgr = cv2.resize(bgr, (bgr.shape[1] // down, bgr.shape[0] // down), interpolation=cv2.INTER_AREA)   # held-out test (§2.7)
        self.H, self.W = bgr.shape[:2]
        self.k = self.W / t['fit'][0]                                        # fit px → native px
        al = c['align']; fitH = t['fit'][1]
        self.UM = 1000.0 / (al['limbus'][2] * fitH / 5.85 * self.k)          # µm per native px (layer_proof.py's UM)
        self.pc = np.array([al['pupil'][0] * self.W, al['pupil'][1] * self.H])
        self.lin = srgb2lin(bgr[..., ::-1].astype(np.float64)).astype(np.float32)   # RGB linear
        Y = self.lin @ np.array([0.2126, 0.7152, 0.0722], np.float32)
        self.Y = np.maximum(Y, 1e-4)
        self.logY = np.log(self.Y).astype(np.float32)
        s0 = 0.5 * LAM0_PX / np.pi * 2.2                                     # σ that removes the λ0 band (≈ 0.7 px)
        self.sig0 = s0
        self.base = cv2.GaussianBlur(self.lin, (0, 0), s0 * 1.6)             # the far view's content, grain removed
        self.R = (self.logY - cv2.GaussianBlur(self.logY, (0, 0), s0 * 1.6)).astype(np.float32)   # the seed: finest band
        self.Rb = cv2.GaussianBlur(self.R, (0, 0), 0.8)
        self.iris = (cv2.GaussianBlur(Y, (0, 0), 3) > 0.004).astype(np.float32)
        self.Ramp = np.sqrt(cv2.GaussianBlur(self.R ** 2 * self.iris, (0, 0), 10) / np.maximum(cv2.GaussianBlur(self.iris, (0, 0), 10), 1e-3)).astype(np.float32)
        self._fields()

    def _fields(self):
        t, k = self.t, self.k
        H, W = self.H, self.W
        # strand tangent: structure tensor of every traced curve's segments, splatted and blurred
        J = np.zeros((3, H, W), np.float32)
        for key, wgt in (('fibres', 1.0), ('veins', 0.6), ('guides', 1.0), ('sfib', 0.8), ('svein', 0.5)):
            for cv in t.get(key, []):
                q = np.array(cv['xy'], np.float64) * k
                if len(q) < 2: continue
                d = np.diff(q, axis=0); L = np.hypot(d[:, 0], d[:, 1]) + 1e-9; d /= L[:, None]
                m = 0.5 * (q[1:] + q[:-1]); ix = np.clip(m[:, 0].astype(int), 0, W - 1); iy = np.clip(m[:, 1].astype(int), 0, H - 1)
                np.add.at(J[0], (iy, ix), wgt * L * d[:, 0] ** 2); np.add.at(J[1], (iy, ix), wgt * L * d[:, 0] * d[:, 1]); np.add.at(J[2], (iy, ix), wgt * L * d[:, 1] ** 2)
        Js = np.stack([cv2.GaussianBlur(J[i], (0, 0), 9) for i in range(3)])
        Jw = np.stack([cv2.GaussianBlur(J[i], (0, 0), 45) for i in range(3)])
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        rx, ry = xx - self.pc[0], yy - self.pc[1]; rr = np.hypot(rx, ry) + 1e-3
        rad = np.stack([rx * rx, rx * ry, ry * ry]) / rr ** 2                     # the radial fallback
        tr_s = Js[0] + Js[2]; tr_w = Jw[0] + Jw[2]
        nrm = lambda A: A / np.maximum(A[0] + A[2], 1e-9)
        Jt = nrm(Js) * np.clip(tr_s / (np.percentile(tr_s[tr_s > 0], 60) + 1e-9), 0, 1) + nrm(Jw + 1e-9) * 0.35 + rad * 0.12
        a, b, c_ = Jt[0], Jt[1], Jt[2]
        self.Jfit = np.stack([a, b, c_]).astype(np.float32)                      # the fitted direction as a tensor (flow() blends it)
        th = 0.5 * np.arctan2(2 * b, a - c_)                                      # dominant direction (the tangent)
        lam = np.sqrt((a - c_) ** 2 + 4 * b * b); coh = lam / np.maximum(a + c_, 1e-9)
        self.tx, self.ty = np.cos(th).astype(np.float32), np.sin(th).astype(np.float32)
        self.coh = np.clip(coh * np.clip(tr_s / (np.percentile(tr_s[tr_s > 0], 40) + 1e-9), 0.25, 1), 0, 1).astype(np.float32)
        # class and relief proxy from the crypt outlines
        holes = np.zeros((H, W), np.uint8)
        outer = [np.array(o['xy']) * k for o in t['outlines'] if not o.get('island')]
        isl = [np.array(o['xy']) * k for o in t['outlines'] if o.get('island')]
        cv2.fillPoly(holes, [o.round().astype(np.int32) for o in outer], 1); cv2.fillPoly(holes, [o.round().astype(np.int32) for o in isl], 0)
        sd = (cv2.distanceTransform(holes, cv2.DIST_L2, 5) - cv2.distanceTransform(1 - holes, cv2.DIST_L2, 5)) * self.UM   # µm, + inside
        wall = t['mm']['wall'] * 1000; pit = 1000 * float(np.mean(t['mm']['pit']))
        s = np.clip((sd + wall) / (2 * wall), 0, 1); s = s * s * (3 - 2 * s)
        self.crypt = s.astype(np.float32)
        self.sd = sd.astype(np.float32)                                          # µm to the crypt edge, + inside
        self.holes = holes
        self.h = (-pit * s).astype(np.float32)                                    # µm
        gy, gx = np.gradient(cv2.GaussianBlur(self.h, (0, 0), 2)); self.gx, self.gy = (gx / self.UM).astype(np.float32), (gy / self.UM).astype(np.float32)

    # ------------------------------------------------------------------ sampling helpers
    def grid(self, P, s_um, N):
        """native-px coordinates of an N×N view centred on P (native px) at s µm per view pixel."""
        o = (np.arange(N) - (N - 1) / 2) * s_um / self.UM
        X, Y = np.meshgrid(P[0] + o, P[1] + o)
        return X.astype(np.float32), Y.astype(np.float32)

    def flow(self, rho_px=10.0, hug=0.4, inside_um=25.0, bridge_um=500.0, macro_um=(40.0, 120.0), dark=(0.35, 0.75)):
        """the strands' direction as iori drew it (2026-11-12: blue = right, red = wrong): in the tissue the PHOTO's own strands
        where they show (its structure tensor over ~rho_px, by coherence), the fitted field elsewhere; round a crypt the fibres
        HUG its outline (the contour's tangent), over a reach that grows with the crypt (hug × its equivalent radius), and split
        round its ends; INSIDE a crypt they run along its LONG axis (the hole's own second moments), not across it.
        Blended as tensors (a line field). Sets tx / ty; the fitted field stays in tx0 / ty0. Returns (tx, ty)"""
        if not hasattr(self, 'tx0'): self.tx0, self.ty0 = self.tx.copy(), self.ty.copy()
        H, W = self.tx0.shape; yy_, xx_ = np.mgrid[0:H, 0:W].astype(np.float32)
        T = lambda tx, ty: np.stack([tx * tx, tx * ty, ty * ty])                 # a direction as a unit tensor
        # the photo: gradients of the fine band; the strands run ACROSS the gradient
        g = cv2.GaussianBlur(self.R, (0, 0), 1.5); gx = cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3); gy = cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3)
        Jg = np.stack([cv2.GaussianBlur(q, (0, 0), rho_px) for q in (gx * gx, gx * gy, gy * gy)])
        tr = Jg[0] + Jg[2] + 1e-12; coh = np.sqrt((Jg[0] - Jg[2]) ** 2 + 4 * Jg[1] ** 2) / tr
        thg = 0.5 * np.arctan2(2 * Jg[1], Jg[0] - Jg[2]) + np.pi / 2               # across the gradient
        Jp = T(np.cos(thg), np.sin(thg))
        Jf = self.Jfit / np.maximum(self.Jfit[0] + self.Jfit[2], 1e-9)
        wp = np.clip((coh - 0.25) / 0.35, 0, 1) * 0.85
        Jt = wp * Jp + (1 - wp) * Jf
        # the crypts: per hole its long axis and size; outside, the nearest hole's outline, hugged within hug × its radius
        n, lab = cv2.connectedComponents(self.holes.astype(np.uint8), connectivity=8)
        axis = np.zeros((n, 2), np.float32); req = np.ones(n, np.float32)
        for i in range(1, n):
            ys, xs = np.nonzero(lab == i)
            if len(xs) < 5: continue
            x0, y0 = xs.mean(), ys.mean(); mxx, myy, mxy = ((xs - x0) ** 2).mean(), ((ys - y0) ** 2).mean(), ((xs - x0) * (ys - y0)).mean()
            th = 0.5 * np.arctan2(2 * mxy, mxx - myy); axis[i] = (np.cos(th), np.sin(th)); req[i] = np.sqrt(len(xs) / np.pi) * self.UM
        _, near = cv2.distanceTransformWithLabels((1 - self.holes).astype(np.uint8), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
        hy, hx = np.nonzero(self.holes)                                          # the labels of the zero pixels, in raster order
        lab_of = np.zeros(near.max() + 1, np.int32); lab_of[1:len(hx) + 1] = lab[hy, hx]
        nl = lab_of[near]; nl[self.holes > 0] = lab[self.holes > 0]
        sd = self.sd; sgy, sgx = np.gradient(cv2.GaussianBlur(sd, (0, 0), 3)); sn = np.maximum(np.hypot(sgx, sgy), 1e-6)
        Jh = T(-sgy / sn, sgx / sn)                                               # along the outline
        reach = hug * req[nl]
        wh = np.exp(-np.maximum(-sd, 0) / np.maximum(reach, 1)) * (nl > 0) * (sd <= 0)
        Ja = T(axis[nl, 0], axis[nl, 1])
        win = np.clip(sd / inside_um, 0, 1) * (nl > 0)
        # BRIDGES (iori 2026-11-12: "why they go perpendicular to the bridge direction"): tissue between two crypts close together
        # runs ALONG the band, parallel to both walls — the direction across the band is the gradient of (d1 − d2), the distances
        # to the nearest and the second-nearest crypt; the band's own lines run perpendicular to it. The photo's fine texture
        # there can run radially (measured: 91° in a band at 122°) and it no longer wins inside a bridge.
        q = 4; hs = cv2.resize(self.holes.astype(np.uint8), (W // q, H // q), interpolation=cv2.INTER_NEAREST); ls = cv2.resize(lab.astype(np.int32).astype(np.float32), (W // q, H // q), interpolation=cv2.INTER_NEAREST).astype(np.int32)
        d1 = np.full(hs.shape, 1e9, np.float32); d2 = np.full(hs.shape, 1e9, np.float32)
        for i in range(1, n):
            m = (ls == i)
            if not m.any(): continue
            di = cv2.distanceTransform((~m).astype(np.uint8), cv2.DIST_L2, 5) * q * self.UM
            lo = di < d1; d2 = np.where(lo, d1, np.minimum(d2, di)); d1 = np.where(lo, di, d1)
        up = lambda a: cv2.resize(a, (W, H), interpolation=cv2.INTER_LINEAR)
        D1, D2 = up(np.minimum(d1, 5e3)), up(np.minimum(d2, 5e3))
        dd = cv2.GaussianBlur(D1 - D2, (0, 0), 4); bgy, bgx = np.gradient(dd); bn = np.maximum(np.hypot(bgx, bgy), 1e-6)
        Jb = T(-bgy / bn, bgx / bn)                                              # perpendicular to the across-band gradient
        wb = np.clip(1 - (D1 + D2) / bridge_um, 0, 1); wb = wb * wb * (3 - 2 * wb) * (sd <= 0)
        # BRANCHES — the tissue's own formations at their scale (iori 2026-11-12: the yellow bridge, 500 µm wide, 234 µm from any
        # crypt, its lines drawn across it): the photo's direction from its colour and brightness at ~40 µm, integrated over
        # ~120 µm — both sides of a band say "along the band", a crypt rim "along the rim", the radial streaks "radial". Where
        # that structure is strong and coherent it leads; a strip at the pupil's and the limbus's edges is left out (rings by
        # contrast alone).
        gL = cv2.GaussianBlur(self.logY.astype(np.float32), (0, 0), macro_um[0] / self.UM)
        mx = cv2.Sobel(gL, cv2.CV_32F, 1, 0, ksize=3); my = cv2.Sobel(gL, cv2.CV_32F, 0, 1, ksize=3)
        Jm = np.stack([cv2.GaussianBlur(q, (0, 0), macro_um[1] / self.UM) for q in (mx * mx, mx * my, my * my)])
        trm = Jm[0] + Jm[2] + 1e-12; cohm = np.sqrt((Jm[0] - Jm[2]) ** 2 + 4 * Jm[1] ** 2) / trm
        thm = 0.5 * np.arctan2(2 * Jm[1], Jm[0] - Jm[2]) + np.pi / 2                # across the gradient: along the formation
        rr = np.hypot(xx_ - self.pc[0], yy_ - self.pc[1]); rp_ = self.c['align']['pupil'][2] * self.H; rl_ = 0.5 * (self.c['align']['limbus'][2] + self.c['align']['limbus'][3]) * self.H
        edge = np.clip(((rr - rp_) * self.UM - 150) / 150, 0, 1) * np.clip(((rl_ - rr) * self.UM - 150) / 150, 0, 1)
        stren = np.sqrt(trm); sref = np.percentile(stren[(self.iris > 0.5) & (edge > 0.5)], 75) + 1e-12
        wm = np.clip((cohm - 0.35) / 0.35, 0, 1) * np.clip(stren / sref, 0, 1) * edge * (sd <= 0)
        wm = wm * wm * (3 - 2 * wm)
        Jmac = T(np.cos(thm), np.sin(thm))
        self.bridge = np.maximum(wb, wm).astype(np.float32); self.branch = wm.astype(np.float32)
        self.gap = wb.astype(np.float32)                                          # the bands BETWEEN crypts (iori: these float, the ground drops under them)
        Jbr = (Jb * wb + Jmac * wm) / np.maximum(wb + wm, 1e-6); wbr = np.maximum(wb, wm)
        J = ((Jt * (1 - wh) + Jh * wh) * (1 - wbr) + Jbr * wbr) * (1 - win) + Ja * win
        # THE DARKEST CRYPTS (iori 2026-11-12: "diagonal and not naturally away from the center … it happens for the darkest
        # crypts, mask those out like the grain around the pupil"): there the photo holds almost no fibre signal, and the crypt's
        # long axis led the lines diagonally. A mask from the luminance well below the iris's own (log units, ~15 µm smoothing),
        # inside or at a crypt; in it the strands run radially, away from the centre
        Lb = cv2.GaussianBlur(self.logY.astype(np.float32), (0, 0), 15.0 / self.UM); med = float(np.median(Lb[self.iris > 0.5]))
        dk = np.clip((med - Lb - dark[0]) / (dark[1] - dark[0]), 0, 1); dk = dk * dk * (3 - 2 * dk)
        dk = dk * np.clip((sd + 40.0) / 40.0, 0, 1)                              # in a crypt, or within 40 µm of one
        dk = cv2.GaussianBlur(dk.astype(np.float32), (0, 0), 6.0 / self.UM * 4)
        self.dark = dk.astype(np.float32)
        rx, ry = xx_ - self.pc[0], yy_ - self.pc[1]; rn = np.maximum(np.hypot(rx, ry), 1e-6)
        J = J * (1 - dk) + T(rx / rn, ry / rn) * dk
        J = np.stack([cv2.GaussianBlur(q.astype(np.float32), (0, 0), 2.0) for q in J])
        th = 0.5 * np.arctan2(2 * J[1], J[0] - J[2])
        self.tx, self.ty = np.cos(th).astype(np.float32), np.sin(th).astype(np.float32)
        return self.tx, self.ty

    def straighten(self, deg=25.0, rim=(30.0, 80.0), deg_in=15.0):
        """the fibre direction held near the radial (iori 2026-11-12: "mid-iris swirls"; "bridge lines pointing along the growth
        of the branch"): the fitted tangent bends round every crypt and that swirl reached far into the tissue. Its angle off the
        radial is limited softly (φmax · tanh(φ / φmax)) to ±deg; on the TISSUE side of a crypt wall, within rim µm, the fit's own
        bend stays (the trabeculae hug the rim); INSIDE a crypt it is ±deg_in, so the floating strands continue the fibres from
        outside across the gap instead of circling it. Returns (tx, ty); the fitted field stays in tx0 / ty0"""
        if not hasattr(self, 'tx0'): self.tx0, self.ty0 = self.tx.copy(), self.ty.copy()
        H, W = self.tx0.shape; yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        ar = np.arctan2(yy - self.pc[1], xx - self.pc[0])
        phi = np.arctan2(self.ty0, self.tx0) - ar; phi = (phi + np.pi / 2) % np.pi - np.pi / 2       # a line field: (-π/2, π/2]
        sd = getattr(self, 'sd', np.full((H, W), -1e3, np.float32))
        near = 1 - np.clip((np.abs(np.minimum(sd, 0)) - rim[0]) / (rim[1] - rim[0]), 0, 1); near = near * near * (3 - 2 * near)
        near = near * (sd <= 0)                                                  # the bend is the rim's, on the tissue side only
        inside = np.clip(sd / 20.0, 0, 1)
        pmax = np.radians(deg) * (1 - near) + np.radians(89.0) * near
        pmax = pmax * (1 - inside) + np.radians(deg_in) * inside
        phi2 = pmax * np.tanh(phi / np.maximum(pmax, 1e-3))
        th = ar + phi2; self.tx, self.ty = np.cos(th).astype(np.float32), np.sin(th).astype(np.float32)
        return self.tx, self.ty

    def at(self, img, X, Y, interp=cv2.INTER_LINEAR):
        return cv2.remap(img, X, Y, interp, borderMode=cv2.BORDER_REFLECT)

# ---------------------------------------------------------------- the fade (exactly zero when unresolved)
def fade(lam_um, s_um):
    r = lam_um / s_um                      # view pixels per wavelength
    f = np.clip((r - 2.0) / 2.0, 0, 1)     # 0 at 2 px per period (Nyquist), full at 4
    return f * f * (3 - 2 * f)

def octaves(eye):
    """wavelengths (µm) from the photo's finest band down to the floor, and their amplitude law."""
    lam0 = LAM0_PX * eye.UM; out = []; l = lam0; i = 0
    while l >= FLOOR_UM * 0.99: out.append((i, l)); l /= 2; i += 1
    return out

def band_slope(eye):
    """measured spectral slope of the photo's log-luminance bands (rms ratio per octave), over the iris."""
    m = eye.iris > 0.5; L = eye.logY; prev = None; r = []
    for s in (0.7, 1.4, 2.8, 5.6):
        b = cv2.GaussianBlur(L, (0, 0), s) - cv2.GaussianBlur(L, (0, 0), 2 * s); v = float(np.sqrt((b[m] ** 2).mean()))
        if prev: r.append(prev / v)
        prev = v
    return r                                # fine/coarse per octave

# ================================================================= A — steered erosion filter (phasor gullies)
def alg_erosion(eye, X, Y, s_um, seeded=True, branch=0.3, slope_w=1.0, ret_oct=False):
    UM = eye.UM; px, py = X * UM, Y * UM                                     # µm
    tx, ty = eye.at(eye.tx, X, Y), eye.at(eye.ty, X, Y); coh = eye.at(eye.coh, X, Y)
    gx, gy = eye.at(eye.gx, X, Y), eye.at(eye.gy, X, Y); amp = eye.at(eye.Ramp, X, Y)
    # the steering vector: the tangent (an axis) signed to agree with the downhill slope, blended with the slope
    sgn = np.where(tx * -gx + ty * -gy < 0, -1.0, 1.0); tx, ty = tx * sgn, ty * sgn
    gm = np.hypot(gx, gy); ws = np.clip(gm * 1.5, 0, 1) * slope_w
    Gx = tx * (1 - ws) * (0.3 + 0.7 * coh) + (-gx / (gm + 1e-6)) * ws
    Gy = ty * (1 - ws) * (0.3 + 0.7 * coh) + (-gy / (gm + 1e-6)) * ws
    D = np.zeros_like(X, dtype=np.float64); octs = []
    for i, lam in octaves(eye):
        f = fade(lam, s_um)
        if np.all(f == 0): octs.append(None); continue
        n = np.hypot(Gx, Gy) + 1e-9; dx, dy = Gx / n, Gy / n                 # gully direction
        nx, ny = -dy, dx                                                     # across the gully
        c = lam                                                              # one period per cell
        cx0, cy0 = np.floor(px / c), np.floor(py / c)
        Zr = np.zeros_like(D); Zi = np.zeros_like(D); Ws = np.zeros_like(D)
        for oy in (-1, 0, 1):
            for ox in (-1, 0, 1):
                ix, iy = cx0 + ox, cy0 + oy
                qx = (ix + 0.2 + 0.6 * hash3(ix, iy, i, 1)) * c; qy = (iy + 0.2 + 0.6 * hash3(ix, iy, i, 2)) * c
                ddx, ddy = px - qx, py - qy; d2 = (ddx * ddx + ddy * ddy) / (c * c)
                w = np.exp(-d2 * 2.2)
                if seeded and i == 0:
                    # the seed: this cell's phase is the photograph's finest-band residual demodulated across the gully
                    ph = eye._seedphase(qx / UM, qy / UM, nx, ny, lam, ix, iy)
                else:
                    ph = 2 * np.pi * hash3(ix, iy, i, 3)
                a = 2 * np.pi * (ddx * nx + ddy * ny) / lam + ph
                w = w * (0.35 + 0.65 * hash3(ix, iy, i, 4))      # fibres differ in strength
                Zr += w * np.cos(a); Zi += w * np.sin(a); Ws += w
        phi = np.arctan2(Zi, Zr); mag = np.hypot(Zr, Zi) / np.maximum(Ws, 1e-9)
        # an erosion profile: sharp crests (fibres), flatter floors; zero mean over a period
        u = 0.5 + 0.5 * np.cos(phi); prof = u ** 1.6 - 0.4206
        dprof = -1.6 * u ** 0.6 * 0.5 * np.sin(phi)
        oct_ = prof * np.clip(0.35 + mag, 0, 1.2)
        c_ = oct_ / 0.34 * 0.75 * getattr(eye, 'gain', 1.0) * f * (eye.oamp[i] if hasattr(eye, 'oamp') else 1.0)
        octs.append(c_ * amp); D += c_                         # octs: what this octave adds to log luminance
        # re-steer the next octave by this one's slope (Johansen): gullies branch down the flanks of the coarser ones
        Gx = Gx + branch * dprof * nx * np.clip(0.35 + mag, 0, 1.2); Gy = Gy + branch * dprof * ny * np.clip(0.35 + mag, 0, 1.2)
    D *= amp
    return (D, octs) if ret_oct else D

def _seedphase(self, qx, qy, nx, ny, lam, ix, iy):
    """phase of R along n at wavelength lam, demodulated in a small window round the pivot (native px)."""
    # sample R on a 5×5 stencil round each pivot (vectorised: q arrays share X's shape)
    acc_r = np.zeros_like(qx, dtype=np.float64); acc_i = np.zeros_like(acc_r)
    lam_px = lam / self.UM
    for sy in (-2, -1, 0, 1, 2):
        for sx in (-2, -1, 0, 1, 2):
            x = qx + sx * 0.6 * lam_px; y = qy + sy * 0.6 * lam_px
            r = cv2.remap(self.R, x.astype(np.float32), y.astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
            w = np.exp(-(sx * sx + sy * sy) / 4.0)
            a = 2 * np.pi * ((x - qx) * nx + (y - qy) * ny) / lam_px
            acc_r += w * r * np.cos(a); acc_i += w * r * np.sin(a)
    return np.arctan2(acc_i, acc_r)
Eye._seedphase = _seedphase

# ================================================================= B — Worley cell mosaic
def alg_mosaic(eye, X, Y, s_um, seeded=True, stretch=1.6, ret_oct=False, wall=0.12, wall_w=0.9, soft=0.0):
    UM = eye.UM; px, py = X * UM, Y * UM
    tx, ty = eye.at(eye.tx, X, Y), eye.at(eye.ty, X, Y); amp = eye.at(eye.Ramp, X, Y)
    D = np.zeros_like(X, dtype=np.float64); octs = []
    # level sizes: the ABL's cells (≈ 2 λ0 ≈ 12–19 µm), then granules inside them
    for i, lam in octaves(eye):
        f = fade(lam, s_um)
        if np.all(f == 0): octs.append(None); continue
        c = lam * 1.3
        # anisotropic metric on a FIXED lattice (rotating the lattice with the tangent drew swirls): distances are
        # measured in the local tangent frame, stretched along the strand
        cx0, cy0 = np.floor(px / c), np.floor(py / c)
        F1 = np.full_like(D, 1e9); F2 = np.full_like(D, 1e9); M = np.zeros_like(D); Ms = np.zeros_like(D); Ws = np.zeros_like(D)   # soft: each cell's melanin blended over its neighbours by distance (no facets)
        for oy in (-2, -1, 0, 1, 2):
            for ox in (-2, -1, 0, 1, 2):
                ix, iy = cx0 + ox, cy0 + oy
                qx = (ix + hash3(ix, iy, i, 5)) * c; qy = (iy + hash3(ix, iy, i, 6)) * c
                ddx, ddy = px - qx, py - qy
                d = np.hypot((ddx * tx + ddy * ty) / stretch, -ddx * ty + ddy * tx) / c
                if seeded and i == 0:
                    # the cell's melanin = the photo's residual at its feature point
                    m = cv2.remap(eye.Rb, (qx / UM).astype(np.float32), (qy / UM).astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT) / (eye.Ramp.mean() + 1e-6)
                else:
                    m = (hash3(ix, iy, i, 7) - 0.5) * 2.4
                if soft > 0: ww = np.exp(-d / soft); Ms += ww * m; Ws += ww
                closer = d < F1
                F2 = np.where(closer, F1, np.minimum(F2, d)); M = np.where(closer, m, M); F1 = np.where(closer, d, F1)
        if soft > 0: M = Ms / np.maximum(Ws, 1e-12)
        edge = F2 - F1
        border = np.exp(-(edge / wall) ** 2)                                 # dark cell walls
        dome = 1 - np.clip(F1, 0, 1) ** 2                                    # soft cell bodies
        oct_ = 0.55 * np.clip(M, -2.5, 2.5) + 0.6 * (dome - 0.55) - wall_w * (border - 0.25)
        c_ = oct_ / 0.6 * 0.75 * getattr(eye, 'gain', 1.0) * f * (eye.oamp[i] if hasattr(eye, 'oamp') else 1.0)
        octs.append(c_ * amp); D += c_
    D *= amp
    return (D, octs) if ret_oct else D

# ================================================================= D — the cascade (A on anatomy with a direction, B on the sheet)
def alg_cascade(eye, X, Y, s_um, seeded=True):
    a = alg_erosion(eye, X, Y, s_um, seeded); b = alg_mosaic(eye, X, Y, s_um, seeded)
    coh = eye.at(eye.coh, X, Y); cr = eye.at(eye.crypt, X, Y); gm = np.hypot(eye.at(eye.gx, X, Y), eye.at(eye.gy, X, Y))
    wdir = np.clip(np.maximum(cr, np.clip(gm * 2, 0, 1)) * 0.85 + coh * 0.5, 0, 1)
    return wdir * a + (1 - wdir) * b

# ================================================================= P — the README's proposal (2026-11-11)
def alg_proposal(eye, X, Y, s_um, seeded=True):
    """seeded mosaic with soft walls everywhere; erosion gullies only where the anatomy is MEASURABLY coherent (dense
    traced fibres, crypt walls), weighted by coherence, not by class."""
    b = alg_mosaic(eye, X, Y, s_um, seeded, wall=0.22, wall_w=0.45)
    a = alg_erosion(eye, X, Y, s_um, seeded)
    coh = eye.at(eye.coh, X, Y); gm = np.hypot(eye.at(eye.gx, X, Y), eye.at(eye.gy, X, Y))
    c = np.clip((coh - 0.45) / 0.4, 0, 1); c = c * c * (3 - 2 * c)
    wdir = np.clip(np.maximum(c, np.clip(gm * 2, 0, 1)), 0, 1) * 0.8
    return wdir * a + (1 - wdir) * b

# ================================================================= C — by-example (local self-examples)
def upscale_self(img_log, cls, steps, patch=5, rad=4, seed=0):
    """img_log: native-px log-luminance crop. Each step ×2: bicubic + the high band of the best nearby patch one scale up.
    Returns the list of levels (level 0 = input)."""
    levels = [img_log]; cur = img_log; cl = cls
    for st in range(steps):
        Hc, Wc = cur.shape
        up = cv2.resize(cur, (Wc * 2, Hc * 2), interpolation=cv2.INTER_CUBIC)
        clu = cv2.resize(cl, (Wc * 2, Hc * 2), interpolation=cv2.INTER_LINEAR)
        # exemplar pair at the current scale: low = what a ×2 bicubic of a ½-scale copy looks like, high = the rest
        half = cv2.resize(cur, (Wc // 2, Hc // 2), interpolation=cv2.INTER_AREA)
        low = cv2.resize(half, (Wc, Hc), interpolation=cv2.INTER_CUBIC); high = cur - low
        # for every pixel of `up`, the source position at the current scale is (x/2, y/2); search ±rad round it
        best = np.full(up.shape, np.inf, np.float32); bx = np.zeros(up.shape, np.float32); by = np.zeros(up.shape, np.float32)
        yy, xx = np.mgrid[0:up.shape[0], 0:up.shape[1]].astype(np.float32)
        sx, sy = xx / 2, yy / 2
        k = (patch, patch)
        for dy in range(-rad, rad + 1):
            for dx in range(-rad, rad + 1):
                lx, ly = sx + dx, sy + dy
                cand = cv2.remap(low, lx, ly, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
                ccl = cv2.remap(cl, lx, ly, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
                ssd = cv2.boxFilter((cand - up) ** 2, -1, k, normalize=True) + 0.02 * (ccl - clu) ** 2
                # a tiny hashed tie-break so flat areas do not all pick the same offset
                better = ssd < best
                best = np.where(better, ssd, best); bx = np.where(better, lx, bx); by = np.where(better, ly, by)
        hf = cv2.remap(high, bx, by, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        hf = cv2.GaussianBlur(hf, (0, 0), 0.5)
        cur = up + hf; cl = clu; levels.append(cur)
    return levels

# ================================================================= rendering a view
def render(eye, P, s_um, N, alg, seeded=True, detail_gain=1.0, cache=None):
    X, Y = eye.grid(P, s_um, N)
    base = eye.at(eye.base, X, Y, cv2.INTER_CUBIC)
    if alg == 'photo':
        rgb = eye.at(eye.lin, X, Y, cv2.INTER_CUBIC)
    elif alg == 'base':
        rgb = base
    elif alg == 'example':
        rgb = render_example(eye, P, s_um, N, cache)
    elif alg == 'refined':
        # D refined (iori chose D, 2026-11-11): P's seeded soft-wall mosaic + coherence-weighted erosion, with the by-example
        # magnification blended in (geometric mean in luminance, weight EX) for the photographic softness
        p_ = render(eye, P, s_um, N, 'proposal', seeded, detail_gain, cache)
        e_ = render(eye, P, s_um, N, 'example', seeded, detail_gain, cache)
        from_s = lambda x: np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)
        EX = 0.4
        return lin2srgb(np.exp((1 - EX) * np.log(np.maximum(from_s(p_), 1e-5)) + EX * np.log(np.maximum(from_s(e_), 1e-5))))
    else:
        f = {'erosion': alg_erosion, 'mosaic': alg_mosaic, 'cascade': alg_cascade, 'proposal': alg_proposal}[alg]
        D = f(eye, X, Y, s_um, seeded) * detail_gain
        rgb = base * np.exp(D)[..., None]
        # decision 2: the synthesised octave 0 replaces the photo's own finest band only once it is resolved; until
        # then the view IS today's content (here: the photograph)
        f0 = fade(octaves(eye)[0][1], s_um)
        rgb = eye.at(eye.lin, X, Y, cv2.INTER_CUBIC) * (1 - f0) + rgb * f0
    return lin2srgb(np.clip(rgb, 0, 1))

def render_example(eye, P, s_um, N, cache):
    """C: run the self-example pyramid on a native crop round P (cached per P), then sample the right level."""
    key = (eye.ref, tuple(np.round(P, 2)))
    if cache is not None and key in cache: levels, x0, y0 = cache[key]
    else:
        r = getattr(eye, 'ex_r', 260); x0, y0 = int(P[0]) - r, int(P[1]) - r
        crop = eye.logY[y0:y0 + 2 * r, x0:x0 + 2 * r].copy(); cls = eye.crypt[y0:y0 + 2 * r, x0:x0 + 2 * r].copy()
        lv = [crop]; cur, cl, cx, cy = crop, cls, r, r
        # each step: keep only the middle part (what deeper views need) so sizes stay bounded
        nsteps = len(octaves(eye)) - 1
        levels = [(crop, 0, 0, 1)]
        for st in range(nsteps):
            Hc = cur.shape[0]; keep = min(Hc, getattr(eye, 'ex_keep', 320))
            a = (Hc - keep) // 2; cur_c = cur[a:a + keep, a:a + keep]; cl_c = cl[a:a + keep, a:a + keep]
            off = levels[-1][1] + a / levels[-1][3], levels[-1][2] + a / levels[-1][3]
            nxt = upscale_self(cur_c, cl_c, 1)[1]
            sc = levels[-1][3] * 2
            levels.append((nxt, off[0], off[1], sc))
            cur, cl = nxt, cv2.resize(cl_c, (keep * 2, keep * 2), interpolation=cv2.INTER_LINEAR)
        if cache is not None: cache[key] = (levels, x0, y0)
    X, Y = eye.grid(P, s_um, N)
    # pick the deepest level whose pixel is ≤ the view pixel (in native px: 1/sc) and that covers the view
    span = N * s_um / eye.UM / 2
    pick = None
    for lv, ox, oy, sc in levels:
        Lx = (X - x0 - ox) * sc; Ly = (Y - y0 - oy) * sc
        inside = Lx.min() >= 2 and Ly.min() >= 2 and Lx.max() <= lv.shape[1] - 3 and Ly.max() <= lv.shape[0] - 3
        if inside and (1 / sc) * eye.UM >= s_um * 0.99 or pick is None and inside: pick = (lv, Lx, Ly)
        if inside and (1 / sc) * eye.UM <= s_um * 1.01: pick = (lv, Lx, Ly)
    lv, Lx, Ly = pick
    logY = cv2.remap(lv.astype(np.float32), Lx.astype(np.float32), Ly.astype(np.float32), cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
    base = eye.at(eye.base, X, Y, cv2.INTER_CUBIC)
    lowY = np.log(np.maximum(base @ np.array([0.2126, 0.7152, 0.0722], np.float32), 1e-4))
    return base * np.exp(np.clip(logY - lowY, -3, 3))[..., None]

def calibrate(eye):
    """per-octave amplitudes: octave 0 matches the photo's finest band rms in the view where it is resolved; deeper
    octaves continue the photo's measured spectral slope (rms ratio per octave)."""
    sl = band_slope(eye); ratio = float(np.median(sl))          # fine/coarse rms per octave (< 1)
    # the finest bands are flat or rising (sensor grain is white); the anatomy's own slope is read where grain no
    # longer dominates: the coarsest measured octave pair
    ratio = min(float(sl[-1]), 0.85)
    eye.slope = sl; eye.ratio = ratio
    eye.oamp = [ratio ** i for i, _ in octaves(eye)]
    # amplitude: the held-out octave (full − bicubic(halved), §2.7) sets the level. Its rms over the iris against the mean
    # seed envelope gives this eye's gain; the per-algorithm constants were measured on eye 26 (measure.py: A 1.7×,
    # B 2.6× too strong before this). Eye 09's grain is much finer than its octave, which a fixed constant over-drove.
    h = cv2.resize(cv2.resize(eye.logY, (eye.W // 2, eye.H // 2), interpolation=cv2.INTER_AREA), (eye.W // 2 * 2, eye.H // 2 * 2), interpolation=cv2.INTER_CUBIC)
    m = eye.iris[:h.shape[0], :h.shape[1]] > 0.5
    held = float((eye.logY[:h.shape[0], :h.shape[1]] - h)[m].std())
    eye.held = held; eye.gain = held / float(eye.Ramp[eye.iris > 0.5].mean()) / 0.80   # 0.80 = eye 26's ratio
    return eye
