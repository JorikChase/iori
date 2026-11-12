#!/usr/bin/env python3
"""The fly-down's per-eye inputs for the GPU (decision 1: a separate file beside the fit), in the TISSUE's polar
coordinates (uv = atlasUV: u = angle/2π + ½, v = tissue v), so the shader reads them where it reads the layer model.

  data/<ref>.seed.png   L8 8192 × 1024      the photo's finest-band residual R / its mean envelope (128 + 40·x); the
                                             mosaic's blurred Rb is its mip on the GPU
  data/<ref>.steer.png  RGBA8 2048 × 256    R,G = coherence · (cos 2φ, sin 2φ), φ = strand tangent RELATIVE to the radial
                                             B   = crypt class (0..1)
                                             A   = relief slope magnitude (rig's |∇h| · 2, clipped to 1)
                        + steer2 RGBA8      R,G = relief downhill direction relative to the radial (½ + ½ cos, sin)
                                             B = the band envelope Ramp / its mean / 4.2, A = the photo has iris here

The photo → tissue mapping is the engine's own coordinate map at the fit pose (fit.getMap(), exported by the page as
study/shots/map-<ref>-<W>x<H>.f32.png: float32 u, v, inside per fit pixel), inverted by linear interpolation.
/usr/bin/python3 seedtex.py 26 [09 35]"""
import os, sys, glob, json, numpy as np, cv2
from scipy.interpolate import griddata
HERE = os.path.dirname(os.path.abspath(__file__)); ENG = os.path.dirname(os.path.dirname(HERE))
from rig import Eye

SU, SV = 8192, 1024           # seed: ≈ 4.6 µm × 3.9 µm at the limbus (the photo's own 4.66 µm)
TU, TV = 2048, 256            # steering: smooth fields

def inverse_map(ref):
    f = glob.glob(os.path.join(ENG, 'study', 'shots', f'map-{ref}-*.f32.png'))[0]
    W, H = map(int, os.path.basename(f).split('-')[2].split('.')[0].split('x'))
    m = np.fromfile(f, np.float32).reshape(H, W, 3)
    ys, xs = np.nonzero(m[..., 2] > 0.5); u, v = m[ys, xs, 0], m[ys, xs, 1]
    # the seam: duplicate the points near it shifted by ±1 in u
    lo, hi = u < 0.05, u > 0.95
    U = np.concatenate([u, u[lo] + 1, u[hi] - 1]); V = np.concatenate([v, v[lo], v[hi]])
    X = np.concatenate([xs, xs[lo], xs[hi]]).astype(np.float64); Y = np.concatenate([ys, ys[lo], ys[hi]]).astype(np.float64)
    return W, H, U, V, X, Y, float(v.max())

def sample_grid(W, H, U, V, X, Y, nu, nv, k):
    gu, gv = np.meshgrid((np.arange(nu) + 0.5) / nu, (np.arange(nv) + 0.5) / nv)
    pts = np.stack([U, V], 1)
    gx = griddata(pts, X, (gu, gv), method='linear'); gy = griddata(pts, Y, (gu, gv), method='linear')
    ok = np.isfinite(gx) & np.isfinite(gy)
    nx = (np.nan_to_num(gx) + 0.5) * k - 0.5; ny = (np.nan_to_num(gy) + 0.5) * k - 0.5   # fit px → native px
    return nx.astype(np.float32), ny.astype(np.float32), ok, gu

def sense(eye, W, H, U, V, X, Y, k):
    """+1 when tissue u runs with the photo's angle (atan2 with y down), −1 against: walked along one tissue row through the
    engine's own map. (2026-11-12: the earlier test — the spread of 2πu ∓ angle over scattered map points — read +1 for eye 26,
    where u runs against; every fibre was then drawn mirrored about the radial: radial ones looked right, a bridge 45° off came
    out across it. Measured on renders: drawn vs photo lean, mirrored at 70 % of the leaning pixels.)"""
    nx, ny, ok, _ = sample_grid(W, H, U, V, X, Y, 256, 32, k)
    cx, cy = eye.pc; vals = []
    for j in (8, 12, 16, 20):
        m = ok[j]
        if m.sum() < 20: continue
        a = np.unwrap(np.arctan2(ny[j][m] - cy, nx[j][m] - cx)); vals.append(np.sign(np.median(np.diff(a))))
    return 1.0 if np.median(vals) > 0 else -1.0

def build(ref):
    eye = Eye(ref); eye.flow(); W, H, U, V, X, Y, vmax = inverse_map(ref); k = eye.W / W
    cx, cy = eye.pc
    # orientation: does u run with the photo's angle or against it (y points down in the photo)?
    sigma = sense(eye, W, H, U, V, X, Y, k)
    print(f'{ref}: map {W}x{H}, k {k:.3f}, data v ≤ {vmax:.3f}, u runs {"with" if sigma > 0 else "against"} the photo angle')
    out = {}
    # ---- seed
    nx, ny, ok, _ = sample_grid(W, H, U, V, X, Y, SU, SV, k)
    mean = float(eye.Ramp[eye.iris > 0.5].mean())
    R = cv2.remap(eye.R, nx, ny, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT) / mean
    Rb = cv2.remap(eye.Rb, nx, ny, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT) / mean
    A = cv2.remap(eye.Ramp, nx, ny, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT) / mean
    I = cv2.remap(eye.iris, nx, ny, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT) * ok
    seed = np.clip(128 + 40 * np.clip(R, -3, 3) + 0.5, 0, 255).astype(np.uint8)     # one channel: the blurred Rb is its mip on the GPU
    cv2.imwrite(os.path.join(ENG, 'data', f'{ref}.seed.png'), seed, [cv2.IMWRITE_PNG_COMPRESSION, 9])
    env = (cv2.resize(A, (TU, TV), interpolation=cv2.INTER_AREA), cv2.resize(I.astype(np.float32), (TU, TV), interpolation=cv2.INTER_AREA))
    # ---- steering
    nx, ny, ok, gu = sample_grid(W, H, U, V, X, Y, TU, TV, k)
    at = lambda img: cv2.remap(img, nx, ny, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    tx, ty, coh = at(eye.tx), at(eye.ty), at(eye.coh); cr = at(eye.crypt); gx, gy = at(eye.gx), at(eye.gy)
    rad = np.arctan2(ny - cy, nx - cx)                                   # the photo's radial angle at each texel
    phi = sigma * (np.arctan2(ty, tx) - rad)                             # tangent, relative to the radial, in the tissue's sense
    gphi = sigma * (np.arctan2(-gy, -gx) - rad); gm = np.hypot(gx, gy)
    s1 = np.stack([0.5 + 0.5 * coh * np.cos(2 * phi), 0.5 + 0.5 * coh * np.sin(2 * phi), np.clip(cr, 0, 1), np.clip(gm * 2, 0, 1)], -1)
    s2 = np.stack([0.5 + 0.5 * np.cos(gphi), 0.5 + 0.5 * np.sin(gphi), np.clip(env[0] / 4.2, 0, 1), np.clip(env[1], 0, 1)], -1)
    s1[~ok] = [0.5, 0.5, 0, 0]
    for name, s in (('steer', s1), ('steer2', s2)):
        img = np.clip(s * 255 + 0.5, 0, 255).astype(np.uint8)
        cv2.imwrite(os.path.join(ENG, 'data', f'{ref}.{name}.png'), img[..., [2, 1, 0, 3]], [cv2.IMWRITE_PNG_COMPRESSION, 9])
    # the bands between crypts (Eye.flow: two crypts close together, the tissue between them): the fly-down floats them as
    # strand bridges and drops the ground under them to the crypt floors (iori 2026-11-12)
    bg = cv2.remap(eye.gap, nx, ny, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT) * ok
    cv2.imwrite(os.path.join(ENG, 'data', f'{ref}.bridge.png'), np.clip(bg * 255 + 0.5, 0, 255).astype(np.uint8), [cv2.IMWRITE_PNG_COMPRESSION, 9])
    meta = {'ref': ref, 'um_per_native_px': eye.UM, 'sigma': sigma, 'vmax': vmax, 'seed': [SU, SV], 'steer': [TU, TV],
            'octaves_um': [round(2 * eye.UM / 2 ** i, 3) for i in range(4)], 'gain': None,
            'seedScale': 40, 'ampScale': 60, 'held': None}
    from rig import calibrate
    calibrate(eye); meta['gain'] = float(eye.gain); meta['oamp'] = [float(x) for x in eye.oamp]; meta['held'] = float(eye.held)
    json.dump(meta, open(os.path.join(ENG, 'data', f'{ref}.seed.json'), 'w'), indent=1)
    print(' ', {k_: os.path.getsize(os.path.join(ENG, 'data', f'{ref}.{k_}.png')) // 1024 for k_ in ('seed', 'steer', 'steer2')}, 'KB')

if __name__ == '__main__' and '--phasor' not in sys.argv and '--grain' not in sys.argv:
    for r in sys.argv[1:] or ['26']: build(r)

# ---------------------------------------------------------------- phasor v2 pivots for the GPU (iori, 2026-11-11: the chain
# phasor v2 at 0.7 at the photo's scale, fibres 0.35 over soft cells below, no fade). On a polar lattice in tissue uv
# (NU × NV, about the fibre spacing apart), each pivot holds the photo's Gabor response across the fibre at the measured
# fibre wavelength: R = phase / 2π, G = amplitude (√, normalised), B = the across-fibre direction n relative to the radial
# (/ 2π), A = 255 inside the photo's iris. data/<ref>.phasor.png + fields in data/<ref>.seed.json.
def build_phasor(ref, NU=2560, NV=288):
    import phasor2 as P2
    eye = Eye(ref); eye.flow(); W, H, U, V, X, Y, vmax = inverse_map(ref); k = eye.W / W; cx, cy = eye.pc
    # the fibre wavelength: phasor2's measurement on a mid-iris crop on each side
    lams = []
    rl = 0.5 * (eye.c['align']['limbus'][2] + eye.c['align']['limbus'][3]) * eye.H; rp = eye.c['align']['pupil'][2] * eye.H
    for ang in (0.0, np.pi / 2, np.pi, 1.5 * np.pi):
        px, py = int(cx + 0.55 * (rl + rp) * np.cos(ang)), int(cy + 0.55 * (rl + rp) * np.sin(ang))
        sl = (slice(py - 200, py + 200), slice(px - 200, px + 200))
        Lg = np.log(np.maximum((eye.lin[sl] @ np.array([0.2126, 0.7152, 0.0722], np.float32)), 1e-4)).astype(np.float32)
        Rc = Lg - cv2.GaussianBlur(Lg, (0, 0), 1.2)
        lw, rel, thr, okw, _, _ = P2.fine_spacing(Rc, np.ones_like(Rc, bool))
        if okw.sum() > 20: lams.append(float(np.median(lw[okw])))
    lam = float(np.median(lams)) if lams else 4.5
    # the native residual and the pivots' native positions (through the engine's own map)
    Lg = np.log(np.maximum(eye.lin @ np.array([0.2126, 0.7152, 0.0722], np.float32), 1e-4)).astype(np.float32)
    R = Lg - cv2.GaussianBlur(Lg, (0, 0), 1.2)
    nx, ny, ok, _ = sample_grid(W, H, U, V, X, Y, NU, NV, k)
    at = lambda a, x, y: cv2.remap(a, x.astype(np.float32), y.astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    t_x, t_y = at(eye.tx, nx, ny), at(eye.ty, nx, ny); n_x, n_y = -t_y, t_x
    # the fibre width by radius (iori 2026-11-11: finer lines by the pupil). The photo cannot measure it there: its finest
    # band reads 21–25 µm at every radius (its own resolution limit). So an anatomical prior: the pupillary zone's fibres are
    # finer than the ciliary zone's — 0.6 × the measured width at the pupil margin, back to 1 by the collarette (~35 %)
    fr = np.clip((np.hypot(nx - cx, ny - cy) - rp) / max(rl - rp, 1.0), 0, 1); sc = 0.6 + 0.4 * (lambda x: x * x * (3 - 2 * x))(np.clip(fr / 0.35, 0, 1))
    lam_l = (lam * sc).astype(np.float32)
    def gab(px, py):
        """the photo's Gabor response across the fibre at any native points: complex, its n (across) and its width there"""
        tx_, ty_ = at(eye.tx, px, py), at(eye.ty, px, py); nx_, ny_ = -ty_, tx_
        f_ = np.clip((np.hypot(px - cx, py - cy) - rp) / max(rl - rp, 1.0), 0, 1); s_ = np.clip(f_ / 0.35, 0, 1); lm = (lam * (0.6 + 0.4 * s_ * s_ * (3 - 2 * s_))).astype(np.float32)
        acc = np.zeros(px.shape, np.complex64); ws = 0
        for a in (-2, -1, 0, 1, 2):
            for b in (-2, -1, 0, 1, 2):
                sx = px + (a * 0.25 * nx_ + b * 0.5 * tx_) * lm; sy = py + (a * 0.25 * ny_ + b * 0.5 * ty_) * lm
                w = np.exp(-(a * a + b * b) / 4.0); acc += w * at(R, sx, sy) * np.exp(-1j * 2 * np.pi * a * 0.25); ws += w
        return acc / ws, nx_, ny_, lm
    G, _, _, _ = gab(nx, ny)
    # coherence ALONG THE STRAND'S OWN PATH (iori 2026-11-12: "traced correctly, not polar but along the strand path"): from each
    # pivot the strand is followed both ways along its tangent (the straightened field, its sign kept continuous), the photo's
    # response read at every step and carried back to the pivot (phase advanced by the offset across the fibre there; a step
    # whose across-direction points the other way is conjugated, so the waves add coherently), Gaussian σ = 4 fibre widths.
    # It replaced an average over the polar lattice's radial neighbours, which pulled every strand toward the radial
    sigpx = 4.0 * lam; h = 0.5 * lam; K = int(np.ceil(2 * sigpx / h))
    Gs = G.copy(); Ws = np.ones(G.shape, np.float32)
    for sgn in (1.0, -1.0):
        px, py = nx.copy(), ny.copy(); ptx, pty = t_x * sgn, t_y * sgn
        for kk in range(1, K + 1):
            tx_, ty_ = at(eye.tx, px, py), at(eye.ty, px, py); fl = np.where(tx_ * ptx + ty_ * pty < 0, -1.0, 1.0).astype(np.float32)
            tx_, ty_ = tx_ * fl, ty_ * fl; px, py = (px + h * tx_).astype(np.float32), (py + h * ty_).astype(np.float32); ptx, pty = tx_, ty_
            Gk, nxk, nyk, lk = gab(px, py)
            cj = (nxk * n_x + nyk * n_y) < 0; Gk = np.where(cj, np.conj(Gk), Gk); nxk = np.where(cj, -nxk, nxk); nyk = np.where(cj, -nyk, nyk)
            w = float(np.exp(-0.5 * (kk * h / sigpx) ** 2))
            ph = 2 * np.pi * ((nx - px) * nxk + (ny - py) * nyk) / lk
            Gs += w * Gk * np.exp(1j * ph).astype(np.complex64); Ws += w
    G = (0.1 * G + 0.9 * Gs / Ws).astype(np.complex64)
    mean = float(eye.Ramp[eye.iris > 0.5].mean())
    amp = np.abs(G) / mean                                               # in the seed's units (R / mean envelope)
    ampMax = float(np.percentile(amp[ok], 99.5))
    # n relative to the radial IN THE TISSUE'S SENSE: tissue u runs against the photo's angle (y points down in the photo), so an
    # angle measured in the photo is mirrored in the plane the renderer draws in. Without this sign every fibre was drawn mirrored
    # about the radial — invisible for radial strands, perpendicular for a bridge 45° off (iori 2026-11-12: "why they go
    # perpendicular to the bridge direction"). build() always applied it to the steering (sigma); the phasor never did
    sigma = sense(eye, W, H, U, V, X, Y, k)
    if os.environ.get('PHASOR_SIGMA'): sigma = float(os.environ['PHASOR_SIGMA'])   # tests: force the sense
    print(ref, 'phasor sense', sigma)
    rad = np.arctan2(ny - cy, nx - cx); nrel = (sigma * (np.arctan2(n_y, n_x) - rad)) % (2 * np.pi)
    I = at(eye.iris, nx, ny) * ok
    img = np.dstack([(np.angle(G) % (2 * np.pi)) / (2 * np.pi), np.sqrt(np.clip(amp / ampMax, 0, 1)), nrel / (2 * np.pi), np.where(I > 0.5, sc, 0.0)])   # alpha: valid → the local width factor (0.6–1)
    cv2.imwrite(os.path.join(ENG, 'data', f'{ref}.phasor.png'), np.clip(img * 255 + 0.5, 0, 255).astype(np.uint8)[..., [2, 1, 0, 3]], [cv2.IMWRITE_PNG_COMPRESSION, 9])
    # c0: the native fibre field's rms against the grain's, so the 0.3 / 0.7 mix keeps the grain's contrast
    m = (eye.iris > 0.5); c0 = float(R[m].std() / mean) / max(float((np.abs(G)[ok & (I > 0.5)] / mean).std()) * 0.7, 1e-6)
    meta_p = os.path.join(ENG, 'data', f'{ref}.seed.json'); meta = json.load(open(meta_p))
    meta.update({'phasor': [NU, NV], 'fibreLambdaUm': round(lam * eye.UM, 2), 'phasorAmpMax': ampMax, 'phasorC0': round(c0, 3)})
    json.dump(meta, open(meta_p, 'w'), indent=1)
    print(ref, 'phasor', {'lambdaUm': round(lam * eye.UM, 1), 'ampMax': round(ampMax, 3), 'c0': round(c0, 3)}, os.path.getsize(os.path.join(ENG, 'data', f'{ref}.phasor.png')) // 1024, 'KB')

if __name__ == '__main__' and '--phasor' in sys.argv:
    for r in [a for a in sys.argv[1:] if a != '--phasor'] or ['26']: build_phasor(r)

# ---------------------------------------------------------------- grain areas (iori, 2026-11-11: "detect the grain areas and make
# sure the grains there are smeared into the generated structure"). Grain = energy in the photo's finest band WITHOUT direction:
# the band's local energy against the eye's median, times how little of it is oriented (the structure tensor's coherence at
# ρ 2 px over white noise's, and the Gabor response at the measured fibre wavelength against the band's own rms).
# data/<ref>.grain.png  L8 2048 × 256 in tissue uv: 0 = structure (keep), 255 = grain (smear into the generated structure)
def build_grain(ref, NU=2048, NV=256):
    from anatomy import tensor
    eye = Eye(ref); eye.flow(); W, H, U, V, X, Y, vmax = inverse_map(ref); k = eye.W / W
    Lg = np.log(np.maximum(eye.lin @ np.array([0.2126, 0.7152, 0.0722], np.float32), 1e-4)).astype(np.float32)
    R = Lg - cv2.GaussianBlur(Lg, (0, 0), 1.2)
    E = np.sqrt(cv2.GaussianBlur(R * R, (0, 0), 6.0))                          # local fine-band rms
    m = eye.iris > 0.5; Emed = float(np.median(E[m]))
    coh, _ = tensor(R, 2.0); excess = np.clip((cv2.GaussianBlur(coh, (0, 0), 4.0) - 0.297) / 0.12, 0, 1)   # 0 = as directionless as noise
    energetic = np.clip((E / Emed - 0.85) / 0.5, 0, 1)                           # clearly more fine energy than the eye's typical (tightened 2026-11-11: the first mask was too large)
    g = energetic * np.clip(1 - 1.2 * excess, 0, 1)
    g = cv2.GaussianBlur(g.astype(np.float32), (0, 0), 6.0)
    nx, ny, ok, _ = sample_grid(W, H, U, V, X, Y, NU, NV, k)
    gp = cv2.remap(g, nx, ny, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT) * ok
    cv2.imwrite(os.path.join(ENG, 'data', f'{ref}.grain.png'), np.clip(gp * 255 + 0.5, 0, 255).astype(np.uint8), [cv2.IMWRITE_PNG_COMPRESSION, 9])
    # a check image in the photo's own frame: the photo with grain areas tinted magenta
    ys, xs = np.nonzero(m); y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    ph = (np.clip(eye.lin[y0:y1, x0:x1], 0, 1) ** (1 / 2.2))[..., ::-1]; gg = g[y0:y1, x0:x1][..., None]
    over = ph * (1 - 0.6 * gg) + np.array([1.0, 0.0, 1.0]) * 0.6 * gg
    out = np.concatenate([ph, over], 1); s = 1400 / out.shape[1]
    cv2.imwrite(os.path.join(HERE, 'grain', f'{ref}-grain.jpg'), cv2.resize((np.clip(out, 0, 1) * 255).astype(np.uint8), None, fx=s, fy=s, interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 88])
    print(ref, 'grain', {'meanInIris': round(float(g[m].mean()), 3), 'fracAbove05': round(float((g[m] > 0.5).mean()), 3)})

if __name__ == '__main__' and '--grain' in sys.argv:
    os.makedirs(os.path.join(HERE, 'grain'), exist_ok=True)
    for r in [a for a in sys.argv[1:] if a != '--grain'] or ['26']: build_grain(r)
