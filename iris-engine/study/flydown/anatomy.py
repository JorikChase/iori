#!/usr/bin/env python3
"""Reading the eye (paper 0.4 ch 4; research brief papers/study/2026-11-11-iris-anatomy-and-flow-sota.md, A1 + A2).

A1  coherence persistence: the photo's structure tensor (gradient σ 1 px, doubled angle) integrated at σ_ρ = 2, 4, 8,
    16, 32 native px; per class (crypt, strand, sheet) the median coherence and the angle to our fitted tangent at each
    scale. Where coherence stays high as σ_ρ shrinks, strand direction survives into the fine octaves: it sets how far
    below the photo the grain may be grown along the strands (the smudge length, the cascade's erosion depth).
A2  fingerprint-style (Chikkerur 2007 STFT, after Hong, Wan & Jain 1998): every 32-px window (Hann) of the photo's
    band-passed log luminance → the spectral peak in the strand band (wavelength 3–24 px): ridge ORIENTATION (across
    the wave vector), SPACING (µm), RELIABILITY (peak energy / band energy). Disagreement with our tangent > 25° where
    reliable marks anatomy the fit has not traced.
/usr/bin/python3 anatomy.py 26 09 35  →  anatomy/<ref>-a1.jpg, <ref>-a2.jpg, anatomy/measure.json, anatomy/<ref>-a2.npz"""
import os, sys, json, numpy as np, cv2
from rig import Eye
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, 'anatomy'); os.makedirs(OUT, exist_ok=True)
SCALES = [2, 4, 8, 16, 32]

def tensor(img, s_rho, s_g=1.0):
    g = cv2.GaussianBlur(img, (0, 0), s_g)
    gx = cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3); gy = cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3)
    J11, J22, J12 = [cv2.GaussianBlur(a, (0, 0), s_rho) for a in (gx * gx, gy * gy, gx * gy)]
    tr = J11 + J22 + 1e-9; lam = np.sqrt((J11 - J22) ** 2 + 4 * J12 ** 2)
    th = 0.5 * np.arctan2(2 * J12, J11 - J22) + np.pi / 2               # tangent: across the gradient
    return np.clip(lam / tr, 0, 1), th

def classes(eye):
    iris = eye.iris > 0.5
    r = np.hypot(*np.meshgrid(np.arange(eye.W) - eye.pc[0], np.arange(eye.H) - eye.pc[1]))
    rp = eye.c['align']['pupil'][2] * eye.H; iris &= r > rp * 1.12
    crypt = iris & (eye.crypt > 0.5); strand = iris & ~crypt & (eye.coh > 0.6); sheet = iris & ~crypt & ~strand
    return {'crypt': crypt, 'strand': strand, 'sheet': sheet}

def angdiff(a, b):
    d = np.abs(((a - b) + np.pi / 2) % np.pi - np.pi / 2); return np.degrees(d)

def a1(eye, cls):
    out = {}; maps = []
    th_fit = np.arctan2(eye.ty, eye.tx)
    for s in SCALES:
        coh, th = tensor(eye.logY.astype(np.float32), s); maps.append(coh)
        out[s] = {k: {'coh': round(float(np.median(coh[m])), 3), 'angleToFit': round(float(np.median(angdiff(th, th_fit)[m & (eye.coh > 0.3)])) if (m & (eye.coh > 0.3)).any() else -1, 1)} for k, m in cls.items()}
    # the noise floor: the same tensor on white noise — coherence that a pure-grain photo would show at each scale
    rng = np.random.default_rng(0); nz = rng.standard_normal((512, 512)).astype(np.float32)
    for s in SCALES:
        out[s]['noise'] = {'coh': round(float(np.median(tensor(nz, s)[0][64:-64, 64:-64])), 3), 'angleToFit': 45.0}
    return out, maps

def a2(eye, win=32, step=8, lam_lo=3.0, lam_hi=24.0):
    L = eye.logY.astype(np.float32)
    band = cv2.GaussianBlur(L, (0, 0), 0.6) - cv2.GaussianBlur(L, (0, 0), 6.0)          # the strand band
    ys, xs = np.nonzero(eye.iris > 0.5); y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    gy = np.arange(y0, y1 - win, step); gx = np.arange(x0, x1 - win, step)
    hann = np.outer(np.hanning(win), np.hanning(win)).astype(np.float32)
    f = np.fft.fftfreq(win); FX, FY = np.meshgrid(f, f); FR = np.hypot(FX, FY)
    inb = (FR >= 1 / lam_hi) & (FR <= 1 / lam_lo) & (FY > 0) | ((FY == 0) & (FX > 0) & (FR >= 1 / lam_hi) & (FR <= 1 / lam_lo))
    ori = np.zeros((len(gy), len(gx)), np.float32); spc = np.zeros_like(ori); rel = np.zeros_like(ori)
    idx = np.nonzero(inb.ravel())[0]; fxs, fys = FX.ravel()[idx], FY.ravel()[idx]
    for i, y in enumerate(gy):
        rows = np.stack([band[y:y + win, x:x + win] for x in gx]) * hann
        P = np.abs(np.fft.fft2(rows)) ** 2
        Pb = P.reshape(len(gx), -1)[:, idx]
        # smooth the spectrum a little by averaging the top-3 bins' vector (doubled angle) for a stable estimate
        k = np.argmax(Pb, 1); pk = Pb[np.arange(len(gx)), k]
        fxk, fyk = fxs[k], fys[k]
        ori[i] = np.arctan2(fyk, fxk) + np.pi / 2                       # ridges run across the wave vector
        spc[i] = 1 / np.hypot(fxk, fyk) * eye.UM
        tot = Pb.sum(1) + 1e-12
        # reliability: energy within ±1 bin of the peak direction against the band's total
        ang = np.arctan2(fys, fxs)
        near = np.abs(((ang[None, :] - np.arctan2(fyk, fxk)[:, None]) + np.pi / 2) % np.pi - np.pi / 2) < np.radians(15)
        rel[i] = (Pb * near).sum(1) / tot
    # orientation smoothed as a doubled angle (the fingerprint rule), weighted by reliability
    c2, s2 = cv2.GaussianBlur(rel * np.cos(2 * ori), (0, 0), 1.5), cv2.GaussianBlur(rel * np.sin(2 * ori), (0, 0), 1.5)
    ori_s = 0.5 * np.arctan2(s2, c2)
    cy, cx = gy + win // 2, gx + win // 2
    return {'ori': ori_s, 'spacing': spc, 'rel': rel, 'cy': cy, 'cx': cx}

def sheet_a1(eye, maps, res, ref):
    ys, xs = np.nonzero(eye.iris > 0.5); y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    tiles = []
    for s, m in zip(SCALES, maps):
        t = cv2.resize(m[y0:y1, x0:x1], (300, int(300 * (y1 - y0) / (x1 - x0))), interpolation=cv2.INTER_AREA)
        t = cv2.applyColorMap((t * 255).astype(np.uint8), cv2.COLORMAP_INFERNO)
        cv2.putText(t, f'rho {s} px = {s * eye.UM:.0f} um', (6, 18), 0, 0.5, (255, 255, 255), 1, cv2.LINE_AA); tiles.append(t)
    row = np.concatenate([np.pad(t, ((0, 0), (0, 3), (0, 0))) for t in tiles], 1)
    # the plot: median coherence vs scale per class
    pw, ph = row.shape[1], 220; plot = np.full((ph, pw, 3), 20, np.uint8)
    cols = {'strand': (80, 220, 255), 'sheet': (200, 200, 200), 'crypt': (255, 120, 80), 'noise': (90, 90, 90)}
    X = lambda i: int(60 + i * (pw - 120) / (len(SCALES) - 1)); Y = lambda v: int(ph - 30 - v * (ph - 60))
    for v in (0, 0.25, 0.5, 0.75): cv2.line(plot, (50, Y(v)), (pw - 40, Y(v)), (60, 60, 60), 1); cv2.putText(plot, f'{v:.2f}', (8, Y(v) + 4), 0, 0.4, (160, 160, 160), 1)
    for i, s in enumerate(SCALES): cv2.putText(plot, f'{s * eye.UM:.0f} um', (X(i) - 18, ph - 10), 0, 0.42, (160, 160, 160), 1)
    for k, c in cols.items():
        pts = [(X(i), Y(res[s][k]['coh'])) for i, s in enumerate(SCALES)]
        for a, b in zip(pts, pts[1:]): cv2.line(plot, a, b, c, 2, cv2.LINE_AA)
        cv2.putText(plot, k, (pts[-1][0] + 4, pts[-1][1]), 0, 0.45, c, 1)
    cv2.putText(plot, f'eye {ref}: median coherence of the photo by integration scale (A1)', (60, 20), 0, 0.5, (255, 255, 255), 1)
    cv2.imwrite(os.path.join(OUT, f'{ref}-a1.jpg'), np.concatenate([row, plot], 0), [cv2.IMWRITE_JPEG_QUALITY, 88])

def sheet_a2(eye, r, ref):
    th_fit = np.arctan2(eye.ty, eye.tx)[r['cy'][:, None], r['cx'][None, :]]
    rel = r['rel']; dis = angdiff(r['ori'], th_fit); ok = eye.iris[r['cy'][:, None], r['cx'][None, :]] > 0.5
    def col(a, cm, lo, hi):
        u = np.clip((a - lo) / (hi - lo), 0, 1); u[~ok] = 0; im = cv2.applyColorMap((u * 255).astype(np.uint8), cm); im[~ok] = 0
        return cv2.resize(im, (360, int(360 * a.shape[0] / a.shape[1])), interpolation=cv2.INTER_NEAREST)
    hue = ((r['ori'] % np.pi) / np.pi * 179).astype(np.uint8); hsv = np.dstack([hue, np.full_like(hue, 255), (np.clip(rel / 0.6, 0, 1) * 255).astype(np.uint8)])
    oim = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR); oim[~ok] = 0; oim = cv2.resize(oim, (360, int(360 * hue.shape[0] / hue.shape[1])), interpolation=cv2.INTER_NEAREST)
    mis = (dis > 25) & (rel > np.percentile(rel[ok], 60)) & ok
    dim = col(dis, cv2.COLORMAP_TURBO, 0, 60); dim[cv2.resize(mis.astype(np.uint8), (dim.shape[1], dim.shape[0]), interpolation=cv2.INTER_NEAREST) > 0] = (255, 255, 255)
    tiles = [(oim, 'orientation (hue) x reliability'), (col(r['spacing'], cv2.COLORMAP_VIRIDIS, 20, 120), 'spacing 20-120 um'),
             (col(rel, cv2.COLORMAP_INFERNO, 0, 0.6), 'reliability'), (dim, 'vs our tangent (white: >25 deg, reliable)')]
    out = []
    for t, s in tiles:
        t = t.copy(); cv2.putText(t, s, (6, 18), 0, 0.45, (255, 255, 255), 1, cv2.LINE_AA); out.append(np.pad(t, ((0, 0), (0, 3), (0, 0))))
    cv2.imwrite(os.path.join(OUT, f'{ref}-a2.jpg'), np.concatenate(out, 1), [cv2.IMWRITE_JPEG_QUALITY, 88])
    sp = r['spacing'][ok & (rel > np.percentile(rel[ok], 50))]
    return {'spacingMedianUm': round(float(np.median(sp)), 1), 'spacingIQRUm': [round(float(np.percentile(sp, 25)), 1), round(float(np.percentile(sp, 75)), 1)],
            'reliabilityMedian': round(float(np.median(rel[ok])), 3), 'disagreeFracReliable': round(float(mis.sum() / max(1, ok.sum())), 3),
            'disagreeMedianDeg': round(float(np.median(dis[ok & (rel > np.percentile(rel[ok], 50))])), 1)}

if __name__ == '__main__':
    refs = sys.argv[1:] or ['26', '09', '35']; allres = {}
    p = os.path.join(OUT, 'measure.json'); allres = json.load(open(p)) if os.path.exists(p) else {}
    for ref in refs:
        eye = Eye(ref); cls = classes(eye)
        r1, maps = a1(eye, cls); sheet_a1(eye, maps, r1, ref)
        r2 = a2(eye); m2 = sheet_a2(eye, r2, ref)
        np.savez_compressed(os.path.join(OUT, f'{ref}-a2.npz'), **r2)
        allres[ref] = {'A1': {str(k): v for k, v in r1.items()}, 'A2': m2}
        print(ref, json.dumps(allres[ref]))
        json.dump(allres, open(p, 'w'), indent=1)
