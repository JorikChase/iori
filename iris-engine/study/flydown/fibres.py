#!/usr/bin/env python3
"""Some fibres below the photograph (iori, 2026-11-11: "keep some fibres") — a look choice on top of the measured rule.

Below the photo the detail is   φ · fibres + (1 − φ) · cells
  fibres  a phasor cascade along the fitted tangent: the photo-scale fibres (phasor v2: measured λ, the photo's Gabor
          phase and amplitude) and, below them, fibre octaves at λ/2, λ/4, λ/8 — each pivot takes its parent's phase
          doubled (the child fibre sits on the parent's crest) plus a small per-pivot jitter, its amplitude the parent's
          × the photo's spectral slope; each octave fades in only once the view resolves it (2 → 4 view px per period)
  cells   the seeded mosaic of the cascade D′ with SOFT walls (wall width 0.35, weight 0.25: no hairlines below ×4) and
          soft melanin (each cell's value blended over its neighbours by distance, τ 0.12 cell: no polygon facets)
  φ       the fibre share at the first octave below the photo, × DECAY per further octave
Projection as before: at and above one photo pixel, the view is the photo's native mix (phasor v2 at its 0.7 sweet spot).
/usr/bin/python3 fibres.py → fibres/sheet-<spot>.jpg, fibres/<spot>-phi<φ>-zoom.mp4"""
import os, numpy as np, cv2
from PIL import Image
from rig import Eye, alg_mosaic, calibrate, lin2srgb, hash3
import smudge as S
import phasor2 as P2
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, 'fibres'); os.makedirs(OUT, exist_ok=True)
PHIS = [0.0, 0.2, 0.35, 0.5]; DECAY = 0.7; NOCT = 3

def zfield(px, py, piv, Lc):
    """the phasor's complex field (Σ w A e^{iφ}) and its fibre-profile value at arbitrary positions"""
    gx, gy, G, t_x, t_y, lam = piv; H, W = gx.shape
    Z = np.zeros(px.shape, np.complex64); ws = np.zeros(px.shape, np.float32)
    ci, cj = np.floor((py - Lc / 2) / Lc).astype(int), np.floor((px - Lc / 2) / Lc).astype(int)
    for di in (-1, 0, 1, 2):
        for dj in (-1, 0, 1, 2):
            i = np.clip(ci + di, 0, H - 1); j = np.clip(cj + dj, 0, W - 1)
            dx, dy = px - gx[i, j], py - gy[i, j]; w = np.exp(-(dx * dx + dy * dy) / (Lc * Lc))
            ph = 2 * np.pi * (dx * -t_y[i, j] + dy * t_x[i, j]) / lam[i, j] + np.angle(G[i, j])
            Z += (w * np.abs(G[i, j])) * np.exp(1j * ph); ws += w
    Z /= np.maximum(ws, 1e-6)
    u = 0.5 + 0.5 * np.cos(np.angle(Z)); prof = (u ** 1.6 - 0.4206) / 0.34 * np.abs(Z)
    return Z, prof

def child(piv, Lc, k, slope):
    """the next fibre octave: pivots at half the spacing, phase = 2 × the parent's phase there (+ jitter), amplitude ×
    the photo's slope; same tangent"""
    gx, gy, G, t_x, t_y, lam = piv; L2 = Lc / 2
    H, W = gx.shape[0] * 2, gx.shape[1] * 2
    ny, nx = np.mgrid[0:H, 0:W].astype(np.float32); cgx = nx * L2 + L2 / 2; cgy = ny * L2 + L2 / 2
    Zp, _ = zfield(cgx, cgy, piv, Lc)
    at = lambda a: cv2.resize(a, (W, H), interpolation=cv2.INTER_LINEAR)
    jit = (hash3(nx.astype(np.int64), ny.astype(np.int64), k, 23) - 0.5) * 1.2
    Gc = (np.abs(Zp) * slope) * np.exp(1j * (2 * np.angle(Zp) + jit))
    return (cgx, cgy, Gc.astype(np.complex64), at(t_x), at(t_y), at(lam) / 2), L2

def run(spot):
    ref, cx, cy = S.SPOTS[spot]; eye = calibrate(Eye(ref)); L, logY, base, R, f = S.crop_fields(eye, cx, cy)
    lam_w, rel, thr, okw, _, _ = P2.fine_spacing(R, np.ones_like(R, bool)); lam = float(np.median(lam_w[okw])) if okw.sum() > 20 else 2.5
    Rv, piv0, Lc0 = P2.v2_native_and_fine(R, f, np.full_like(R, lam))
    wall = np.clip(np.hypot(f['gx'], f['gy']) * 2, 0, 1); w = 0.7 * (1 - 0.8 * wall)
    target = R * (1 - w) + S.rms_match(Rv, R) * w
    pivs = [(piv0, Lc0)]
    for k in range(1, NOCT + 1): pivs.append(child(*pivs[-1], k, eye.ratio))
    c = (R.shape[1] / 2, R.shape[0] / 2); fade = lambda lam_px, z: np.clip(((lam_px * z) - 2) / 2, 0, 1) ** 2 * (3 - 2 * np.clip(((lam_px * z) - 2) / 2, 0, 1))
    def view(phi1, z, n=300, slope=None, boost=1.0):
        X, Y = P2.grid(n / z, z, c); X, Y = X[:n, :n], Y[:n, :n]
        at = lambda a: cv2.remap(a.astype(np.float32), X, Y, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
        g = at(base) + at(target)
        if z > 1:
            k = max(2, int(round(z)))
            F = np.zeros(X.shape, np.float32)
            for o, (pv, Lc) in enumerate(pivs):
                lam_o = lam / 2 ** o; fo = float(fade(lam_o, z))
                if fo <= 0: continue
                _, pr = zfield(X, Y, pv, Lc); F += pr * fo * (DECAY ** max(0, o - 1) if o else 1.0)
            F = F - cv2.blur(F, (k, k))
            C = alg_mosaic(eye, X + cx - S.HALF, Y + cy - S.HALF, eye.UM / z, wall=0.35, wall_w=0.25, soft=0.12).astype(np.float32); C = C - cv2.blur(C, (k, k))
            sC = float(C.std()) + 1e-9; F = F / (float(F.std()) + 1e-9) * sC
            phi = phi1
            o = np.log2(z); mult = boost * ((slope / eye.ratio) ** max(0.0, o - 1) if slope else 1.0)   # amplitude below the photo
            g = g + (phi * F + (1 - phi) * C) * mult
        Lv = np.dstack([at(L[..., i]) for i in range(3)]); Yv = np.maximum(Lv @ np.array([0.2126, 0.7152, 0.0722], np.float32), 1e-4)
        rgb = lin2srgb(np.clip(Lv * (np.exp(g) / Yv)[..., None], 0, 1)); return (rgb[..., ::-1] * 255 + 0.5).astype(np.uint8)
    if AMP_ONLY: return view, eye
    zs = (2, 4, 8, 16); rows = []
    for phi in PHIS:
        r = np.concatenate([np.pad(S.label(view(phi, z), f'x{z}  {eye.UM / z:.2f} um/px'), ((0, 3), (0, 3), (0, 0))) for z in zs], 1)
        head = np.zeros((26, r.shape[1], 3), np.uint8)
        t = 'cells only, soft walls (the measured rule)' if phi == 0 else f'fibre share {phi:.2f} below the photo (octaves {lam * eye.UM:.0f}, {lam * eye.UM / 2:.0f}, {lam * eye.UM / 4:.0f}, {lam * eye.UM / 8:.1f} um, x{DECAY} each)'
        cv2.putText(head, t, (8, 18), 0, 0.5, (120, 230, 255), 1, cv2.LINE_AA); rows.append(np.concatenate([head, r], 0))
    cv2.imwrite(os.path.join(OUT, f'sheet-{spot}.jpg'), np.concatenate(rows, 0), [cv2.IMWRITE_JPEG_QUALITY, 90])
    fr = []
    for z in np.exp(np.linspace(0, np.log(16), 44)):
        fr.append(Image.fromarray(np.concatenate([S.label(view(0.0, z), f'cells x{z:.1f}'), S.label(view(0.35, z), f'fibre share 0.35 x{z:.1f}')], 1)[..., ::-1]))
    g = os.path.join(OUT, f'{spot}-zoom.gif'); fr[0].save(g, save_all=True, append_images=fr[1:] + fr[::-1], duration=80, loop=0); S.to_mp4(g)

AMP_ONLY = False
OPTIONS = [(None, 1.0, "the photo's slope (x{r:.2f} per octave), as measured"), (0.9, 1.0, 'slower fade: x0.90 per octave'),
           (1.0, 1.0, 'no fade: every octave as strong as the first'), (1.0, 1.5, 'no fade, x1.5')]

def amp_sheet(spot, phi=0.35):
    """the second look choice: how strong the detail stays below the photograph, at iori's fibre share (0.35)"""
    global AMP_ONLY
    AMP_ONLY = True; view, eye = run(spot); AMP_ONLY = False
    zs = (2, 4, 8, 16); rows = []
    for slope, boost, t in OPTIONS:
        r = np.concatenate([np.pad(S.label(view(phi, z, slope=slope, boost=boost), f'x{z}  {eye.UM / z:.2f} um/px'), ((0, 3), (0, 3), (0, 0))) for z in zs], 1)
        head = np.zeros((26, r.shape[1], 3), np.uint8); cv2.putText(head, t.format(r=eye.ratio) + f'   (fibre share {phi})', (8, 18), 0, 0.5, (120, 230, 255), 1, cv2.LINE_AA)
        rows.append(np.concatenate([head, r], 0))
    cv2.imwrite(os.path.join(OUT, f'amp-{spot}.jpg'), np.concatenate(rows, 0), [cv2.IMWRITE_JPEG_QUALITY, 90])

if __name__ == '__main__':
    import sys
    if sys.argv[1:2] == ['--amp']:
        for s in sys.argv[2:] or list(S.SPOTS): amp_sheet(s); print(s, 'amp done')
    else:
        for s in sys.argv[1:] or list(S.SPOTS): run(s); print(s, 'done')
