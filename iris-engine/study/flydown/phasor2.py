#!/usr/bin/env python3
"""Phasor v2 (iori, 2026-11-11): the photo's grain re-grown as fibres, with nothing chosen that can be measured.

  spacing   the fibre wavelength inside the strands, measured: fingerprint-style spectral peaks in 16-px windows over the
            finest band (λ 2.2–8 native px), kept only where their reliability beats the same measurement on white noise;
            elsewhere the spot's median
  phase     per pivot (a lattice of λ/1.5), the photo's own Gabor response across the fibre (2-D Gaussian-weighted
            demodulation at the measured λ, along our fitted tangent): phase AND amplitude, so where the photo has no
            oriented energy the fibres are weak and its grain stays — less invented
  profile   sharp crests, flat troughs ((½ + ½ cos φ)^1.6, zero mean): a fibre, not a sine, so finer zooms get real
            harmonics below the photo's pixel
  mix       α = 0.7, the measured sweet spot (sweet.py)
  project   below the photo, the fine field minus its own box-filtered native band plus the native target: reduced back to
            the photo's pixels, the view IS the native mix — nothing the photo shows is moved
Held-out test (the honest one): halve the photo, grow v2 at ×2 from the halved eye, compare with the octave the halving
removed (full − bicubic(halved)) — against v1, LIC and noise.
/usr/bin/python3 phasor2.py → phasor2/sheet-<spot>.jpg, phasor2/<spot>-zoom.mp4, phasor2/measure.json"""
import os, json, subprocess, numpy as np, cv2
from PIL import Image
from rig import Eye, lin2srgb
import smudge as S
from anatomy import tensor
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, 'phasor2'); os.makedirs(OUT, exist_ok=True)
ALPHA = 0.7

def fine_spacing(R, mask, win=16, step=4, lo=2.2, hi=8.0):
    """per-window wavelength (px) and reliability over the finest band; and the same reliability on white noise"""
    def scan(img):
        H, W = img.shape; hann = np.outer(np.hanning(win), np.hanning(win)).astype(np.float32)
        f = np.fft.fftfreq(win); FX, FY = np.meshgrid(f, f); FR = np.hypot(FX, FY)
        inb = ((FR >= 1 / hi) & (FR <= 1 / lo)) & ((FY > 0) | ((FY == 0) & (FX > 0)))
        idx = np.nonzero(inb.ravel())[0]; fr = FR.ravel()[idx]
        ys = np.arange(0, H - win, step); xs = np.arange(0, W - win, step); lam = np.zeros((len(ys), len(xs)), np.float32); rel = np.zeros_like(lam)
        for i, y in enumerate(ys):
            P = np.abs(np.fft.fft2(np.stack([img[y:y + win, x:x + win] for x in xs]) * hann)) ** 2
            Pb = P.reshape(len(xs), -1)[:, idx]; k = np.argmax(Pb, 1)
            lam[i] = 1 / fr[k]; rel[i] = Pb[np.arange(len(xs)), k] / (Pb.sum(1) + 1e-12)
        return lam, rel, ys + win // 2, xs + win // 2
    lam, rel, cy, cx = scan(R)
    noise = np.random.default_rng(1).standard_normal(R.shape).astype(np.float32) * R.std()
    _, reln, _, _ = scan(noise)
    thr = float(np.percentile(reln, 90))                                  # beats 90 % of noise windows
    m = mask[cy[:, None], cx[None, :]] & (rel > thr)
    return lam, rel, thr, m, cy, cx

def pivots_phase(R, tx, ty, lam_px, Lc):
    """Gabor demodulation at every lattice pivot: complex response across the fibre (along n), 2-D Gaussian window"""
    H, W = R.shape; gy, gx = np.mgrid[0:H:Lc, 0:W:Lc].astype(np.float32); gy += Lc / 2; gx += Lc / 2
    at = lambda a, x, y: cv2.remap(a, x.astype(np.float32), y.astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    t_x, t_y, lam = at(tx, gx, gy), at(ty, gx, gy), at(lam_px, gx, gy)
    n_x, n_y = -t_y, t_x; acc = np.zeros(gx.shape, np.complex64); wsum = 0
    for a in (-2, -1, 0, 1, 2):                                          # across (n), in quarter wavelengths
        for b in (-2, -1, 0, 1, 2):                                      # along (t)
            sx = gx + (a * 0.25 * n_x + b * 0.5 * t_x) * lam; sy = gy + (a * 0.25 * n_y + b * 0.5 * t_y) * lam
            w = np.exp(-(a * a / 4.0 + b * b / 4.0)); r = at(R, sx, sy)
            acc += w * r * np.exp(-1j * 2 * np.pi * a * 0.25); wsum += w
    return gx, gy, acc / wsum, t_x, t_y, lam

def evaluate(px, py, piv, Lc, prof=1.6):
    """the phasor field at arbitrary positions (native px): Σ w·A·profile(2π (x−q)·n/λ + φ)"""
    gx, gy, G, t_x, t_y, lam = piv; H, W = gx.shape
    out = np.zeros(px.shape, np.float32); ws = np.zeros(px.shape, np.float32)
    ci, cj = np.floor((py - Lc / 2) / Lc).astype(int), np.floor((px - Lc / 2) / Lc).astype(int)
    for di in (-1, 0, 1, 2):
        for dj in (-1, 0, 1, 2):
            i = np.clip(ci + di, 0, H - 1); j = np.clip(cj + dj, 0, W - 1)
            qx, qy = gx[i, j], gy[i, j]; dx, dy = px - qx, py - qy
            w = np.exp(-(dx * dx + dy * dy) / (Lc * Lc) * 1.0)
            nx_, ny_ = -t_y[i, j], t_x[i, j]; g = G[i, j]
            ph = 2 * np.pi * (dx * nx_ + dy * ny_) / lam[i, j] + np.angle(g)
            u = 0.5 + 0.5 * np.cos(ph); f = u ** prof - 0.4206
            out += w * np.abs(g) * f / 0.34; ws += w
    return out / np.maximum(ws, 1e-6)

def grid(N, z, c):
    o = (np.arange(int(N * z)) + 0.5) / z - 0.5; X, Y = np.meshgrid(c[0] - N / 2 + o, c[1] - N / 2 + o); return X.astype(np.float32), Y.astype(np.float32)

def v2_native_and_fine(R, f, lam_map, z=1.0, Lc=None):
    lam_med = float(np.median(lam_map)); Lc = Lc or max(1.5, lam_med / 1.5)
    piv = pivots_phase(R, f['tx'], f['ty'], lam_map, Lc)
    H, W = R.shape; ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
    Rv = evaluate(xs, ys, piv, Lc)
    return Rv, piv, Lc

def run(spot):
    ref, cx, cy = S.SPOTS[spot]; eye = Eye(ref); L, logY, base, R, f = S.crop_fields(eye, cx, cy)
    strand = (f['coh'] > 0.6) & (f['crypt'] < 0.5); iris = np.ones_like(strand)
    lam_w, rel, thr, okw, wy, wx = fine_spacing(R, iris)
    lam_med = float(np.median(lam_w[okw])) if okw.sum() > 20 else 2.5
    # the measured spacing map: reliable windows, elsewhere the median, smoothed
    lm = np.where(okw, lam_w, lam_med).astype(np.float32); lm = cv2.GaussianBlur(lm, (0, 0), 2.0)
    lam_map = cv2.resize(lm, (R.shape[1], R.shape[0]), interpolation=cv2.INTER_LINEAR)
    Rv, piv, Lc = v2_native_and_fine(R, f, lam_map)
    wall = np.clip(np.hypot(f['gx'], f['gy']) * 2, 0, 1); w = ALPHA * (1 - 0.8 * wall)
    target = R * (1 - w) + S.rms_match(Rv, R) * w                       # the native mix
    meas = {'fibreLambdaPx': round(lam_med, 2), 'fibreLambdaUm': round(lam_med * eye.UM, 1), 'reliableFrac': round(float(okw.mean()), 3),
            'noiseThr': round(thr, 3), 'corrToPhoto': round(float(np.corrcoef(R.ravel(), target.ravel())[0, 1]), 3)}
    # views at ×1 … ×8: base bicubic + the projected fine field
    rows = {}; Y0 = np.maximum(L @ np.array([0.2126, 0.7152, 0.0722], np.float32), 1e-4)
    c = (R.shape[1] / 2, R.shape[0] / 2); N = 320 / 1
    v1 = S.rms_match(S.regrow(R, f['tx'], f['ty'], lam=2.5, Lc=3.0), R); target_v1 = R * (1 - w) + v1 * w
    lic = S.rms_match(S.lic(R, f['tx'], f['ty'], 14.0 / eye.UM), R); target_lic = R * (1 - 0.4 * (1 - 0.8 * wall)) + lic * 0.4 * (1 - 0.8 * wall)
    def view(kind, z):
        n = 320; X, Y = grid(n / z, z, c); X = X[:n, :n]; Y = Y[:n, :n]
        at = lambda a, interp=cv2.INTER_CUBIC: cv2.remap(a.astype(np.float32), X, Y, interp, borderMode=cv2.BORDER_REFLECT)
        if kind == 'photo': g = at(R)
        elif kind == 'v1': g = at(target_v1)
        elif kind == 'lic': g = at(target_lic)
        else:                                                            # v2: fine phasor, projected onto the native mix
            fine = evaluate(X, Y, piv, Lc)
            ww = at(w, cv2.INTER_LINEAR)
            # projection: everything at or above the photo's pixel comes from the native mix (so, box-filtered back to the
            # photo's pixels, the view IS the native mix); the phasor adds only what lies below one native pixel
            g = at(target)
            if z > 1:
                k = max(2, int(round(z))); g = g + (fine - cv2.blur(fine, (k, k))) * ww
        logv = at(base) + g; Lv = np.dstack([at(L[..., i]) for i in range(3)]); Yv = np.maximum(Lv @ np.array([0.2126, 0.7152, 0.0722], np.float32), 1e-4)
        rgb = lin2srgb(np.clip(Lv * (np.exp(logv) / Yv)[..., None], 0, 1))
        return (rgb[..., ::-1] * 255 + 0.5).astype(np.uint8)
    titles = {'photo': 'the photo, magnified', 'lic': 'LIC at its sweet spot (0.4)', 'v1': 'phasor v1 at 0.7 (fixed 2.5 px, 1-D phase)', 'v2': f"phasor v2: measured lambda {lam_med * eye.UM:.1f} um, Gabor phase+amplitude, projected"}
    zs = (1, 2, 4, 8); tiles = []
    for kind in ('photo', 'lic', 'v1', 'v2'):
        row = [S.label(view(kind, z), f'x{z}  {eye.UM / z:.2f} um/px') for z in zs]
        r = np.concatenate([np.pad(t, ((0, 3), (0, 3), (0, 0))) for t in row], 1)
        head = np.zeros((26, r.shape[1], 3), np.uint8); cv2.putText(head, titles[kind], (8, 18), 0, 0.5, (120, 230, 255), 1, cv2.LINE_AA)
        tiles.append(np.concatenate([head, r], 0))
    top = np.zeros((32, tiles[0].shape[1], 3), np.uint8)
    cv2.putText(top, f"eye {ref} {spot}: fibre wavelength {meas['fibreLambdaUm']} um ({meas['reliableFrac'] * 100:.0f}% of windows beat noise); v2 native corr to photo {meas['corrToPhoto']}", (8, 21), 0, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
    cv2.imwrite(os.path.join(OUT, f'sheet-{spot}.jpg'), np.concatenate([top] + tiles, 0), [cv2.IMWRITE_JPEG_QUALITY, 90])
    # a continuous zoom ×1 → ×8 of v2 beside the photo
    fr = []
    for z in np.exp(np.linspace(0, np.log(8), 40)):
        a, b = view('photo', z), view('v2', z)
        fr.append(Image.fromarray(np.concatenate([S.label(a, f'photo x{z:.1f}'), S.label(b, f'phasor v2 x{z:.1f}')], 1)[..., ::-1]))
    g = os.path.join(OUT, f'{spot}-zoom.gif'); fr[0].save(g, save_all=True, append_images=fr[1:] + fr[::-1], duration=80, loop=0); S.to_mp4(g)
    return meas

def heldout(spot):
    """halve the photo; grow each method at ×2 from the halved eye; compare with the octave the halving removed"""
    ref, cx, cy = S.SPOTS[spot]; full = Eye(ref); half = Eye(ref, down=2)
    Lf, logYf, basef, Rf, ff = S.crop_fields(full, cx, cy)
    Lh, logYh, baseh, Rh, fh = S.crop_fields(half, cx // 2, cy // 2, h=S.HALF // 2)
    up = lambda a: cv2.resize(a, (a.shape[1] * 2, a.shape[0] * 2), interpolation=cv2.INTER_CUBIC)
    target = logYf - up(logYh)                                           # what the halving removed
    m = np.ones(target.shape, bool); m[:8] = m[-8:] = False; m[:, :8] = m[:, -8:] = False
    lam_w, rel, thr, okw, _, _ = fine_spacing(Rh, np.ones_like(Rh, bool)); lam_med = float(np.median(lam_w[okw])) if okw.sum() > 20 else 2.5
    Rv, piv, Lc = v2_native_and_fine(Rh, fh, np.full_like(Rh, lam_med))
    n = target.shape[0]; o = (np.arange(n) + 0.5) / 2 - 0.5; X, Y = np.meshgrid(o, o); X = X.astype(np.float32); Y = Y.astype(np.float32)
    fine = evaluate(X, Y, piv, Lc); fine = fine - cv2.blur(fine, (2, 2))          # only what lies below the halved pixel
    v1h = S.regrow(Rh, fh['tx'], fh['ty'], lam=2.5, Lc=3.0); v1f = up(v1h) - cv2.blur(up(v1h), (2, 2))
    lich = S.lic(Rh, fh['tx'], fh['ty'], 14.0 / half.UM); licf = up(lich) - cv2.blur(up(lich), (2, 2))
    noise = np.random.default_rng(0).standard_normal(target.shape).astype(np.float32); noise -= cv2.blur(noise, (2, 2))
    tx, ty = ff['tx'], ff['ty']
    def score(pred):
        c = float(np.corrcoef(pred[m], target[m])[0, 1])
        ct, tt = tensor(target.astype(np.float32), 2.0); cp, tp = tensor(pred.astype(np.float32), 2.0)
        err = np.degrees(np.arccos(np.clip(np.abs(np.cos(tt - tp)), 0, 1)))
        return {'corr': round(c, 3), 'dirTarget': round(float(np.median(ct[m])), 3), 'dirPred': round(float(np.median(cp[m])), 3), 'orientErrToTarget': round(float(np.median(err[m & (ct > np.median(ct))])), 1)}
    return {k: score(v) for k, v in (('v2', fine), ('v1', v1f), ('lic', licf), ('noise', noise))} | {'lambdaHalfPx': round(lam_med, 2)}

if __name__ == '__main__':
    res = {}
    for s in S.SPOTS:
        res[s] = {'v2': run(s), 'heldout': heldout(s)}; print(s, json.dumps(res[s]))
        json.dump(res, open(os.path.join(OUT, 'measure.json'), 'w'), indent=1)
