#!/usr/bin/env python3
"""study/11 §5.5 option (a) (iori, 2026-09-28: "go with (a), texture on the front layer") — the anterior border layer's
granular micro-texture, measured per eye.

The sheet's finest contrast has no direction (tools/sheet_trace.py): speckle, not strands. It is rendered as a seeded
isotropic texture on the ABL whose STATISTICS match the photograph's — never its pixels:

  1. on the photo's sheet at native resolution, the local-contrast image (luminance over its 65 µm neighbourhood) in four
     bands (DoG, σ in µm); in each, the share of the energy with no direction (twice the energy along the flow over the
     sum along + across: grain and granules have equal energy both ways, a strand has it across) → the isotropic rms;
  2. how that rms scales with the sheet's brightness: rms ∝ brightness^e (relative contrast ∝ brightness^(e − 1));
  3. the shader's own noise (compose `vnoise`, ported bit for bit in float32) in four rotated octaves, each's response in the
     same bands measured on a synthetic field; the octave amplitudes that reproduce the target band energies (energies add
     for independent octaves: a non-negative least squares on the squares).

Writes study/proof-layers/sheet/abltex-NN.json — what `IrisTissue.ablTex` takes.
usage: /usr/bin/python3 abl_texture.py ../study/proof-layers/sheet/sheet-26.pkl
"""
import os, sys, json, pickle
import cv2
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sheet_trace import flow_field

BANDS_UM = [(4.7, 9.3), (9.3, 18.6), (18.6, 37.3), (37.3, 74.6)]
FIT_OCT = [1, 2]                            # the octaves fitted: 12 and 24 µm. 6 µm cells are finer than the base bake's 5.7 µm texel (it would
                                            # average them away unpredictably; the free fit put 3.15 there, a std of 0.69 > the photo's 0.42)
FIT_N = 3                                   # bands / octaves the texture carries: up to 37 µm. The 37–75 µm band is half directional and its
                                            # structure sits where the cells and guides already put it; a random octave there cost the whole-eye score
OCT_UM = [6.0, 12.0, 24.0, 48.0]                    # value-noise cell sizes of the four octaves
OCT_ROT = [0.0, 0.61, 1.23, 1.87]                   # each octave's grid rotated (radians), so no grid axis dominates
OCT_OFF = [(3.1, 7.7), (11.3, 2.9), (5.3, 13.1), (17.9, 8.3)]


def hash2(px, py):                                  # compose's hash(), float32 as GLSL highp
    f = np.float32
    p3x = np.mod(px * f(.1031), f(1)); p3y = np.mod(py * f(.1031), f(1)); p3z = np.mod(px * f(.1031), f(1))
    d = p3x * (p3y + f(33.33)) + p3y * (p3z + f(33.33)) + p3z * (p3x + f(33.33))
    p3x, p3y, p3z = p3x + d, p3y + d, p3z + d
    return np.mod((p3x + p3y) * p3z, f(1))


def vnoise(x, y):
    ix, iy = np.floor(x), np.floor(y); fx, fy = x - ix, y - iy
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy)
    a, b, c, d = hash2(ix, iy), hash2(ix + 1, iy), hash2(ix, iy + 1), hash2(ix + 1, iy + 1)
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def octave(k, xmm, ymm):
    """one octave, HIGH-PASSED: the value noise minus the mean of its four one-cell neighbours (a lattice Laplacian). Value noise
    is white at long wavelengths — every cell an independent value — so averaged into a 28 µm pixel it still leaves variance the
    photo's speckle does not have (whole-eye MATCH2 −1.2 on eye 26); the high-pass removes it."""
    c, s = np.cos(OCT_ROT[k]), np.sin(OCT_ROT[k]); u = (c * xmm - s * ymm) / (OCT_UM[k] / 1000) + OCT_OFF[k][0]; v = (s * xmm + c * ymm) / (OCT_UM[k] / 1000) + OCT_OFF[k][1]
    u, v = u.astype(np.float32), v.astype(np.float32); o = np.float32(1)
    return vnoise(u, v) - np.float32(0.25) * (vnoise(u + o, v) + vnoise(u - o, v) + vnoise(u, v + o) + vnoise(u, v - o))


def band(img, s1, s2): return cv2.GaussianBlur(img, (0, 0), s1) - cv2.GaussianBlur(img, (0, 0), s2)


def main():
    D = pickle.load(open(sys.argv[1], 'rb')); UM = float(D['UM']); pY = D['pY'].astype(np.float32); sd = D['sd']; REF = D.get('REF', '26')
    sheet = D['inner'] & (sd < -14)
    Ln = pY / np.maximum(cv2.GaussianBlur(pY, (0, 0), 65.0 / UM), 1e-4)
    ang, _ = flow_field(Ln.astype(np.float32), D['PC']); tx, ty = np.cos(ang), np.sin(ang)
    mean = cv2.GaussianBlur(pY, (0, 0), 8); Yref = float(np.median(mean[sheet]))
    target, rows = [], []
    for (a, b) in BANDS_UM:
        B = band(Ln, a / UM, b / UM).astype(np.float32)
        gx = cv2.Sobel(B, cv2.CV_32F, 1, 0, ksize=3); gy = cv2.Sobel(B, cv2.CV_32F, 0, 1, ksize=3)
        Ea = float(((gx * tx + gy * ty) ** 2)[sheet].mean()); Ec = float(((-gx * ty + gy * tx) ** 2)[sheet].mean())
        iso = min(1.0, 2 * Ea / (Ea + Ec)); rms = float(np.sqrt((B[sheet] ** 2).mean())); target.append(rms * np.sqrt(iso))
        # brightness dependence of this band, in absolute linear light
        Ba = band(pY, a / UM, b / UM); mv = mean[sheet]; bv = Ba[sheet]; qs = np.quantile(mv, np.linspace(0.05, 0.95, 7))
        mu, sg = [], []
        for lo, hi in zip(qs[:-1], qs[1:]):
            s = (mv >= lo) & (mv < hi); mu.append(mv[s].mean()); sg.append(bv[s].std())
        e = float(np.polyfit(np.log(mu), np.log(sg), 1)[0])
        rows.append({'band_um': [a, b], 'rms': round(rms, 4), 'isotropic_share': round(iso, 3), 'iso_rms': round(target[-1], 4), 'exp': round(e, 2)})
        print(f'band {a:.0f}–{b:.0f} µm: rms {rms:.4f} · isotropic {100 * iso:.0f} % → {target[-1]:.4f} · rms ∝ brightness^{e:.2f}')
    # the octaves' band responses, on a synthetic field at the photo's sampling
    n = 1536; yy, xx = np.mgrid[0:n, 0:n].astype(np.float64) * UM / 1000
    M = np.zeros((len(BANDS_UM), len(OCT_UM)))
    for k in range(len(OCT_UM)):
        f = octave(k, xx, yy).astype(np.float32)
        for bi, (a, b) in enumerate(BANDS_UM): M[bi, k] = float(np.sqrt((band(f, a / UM, b / UM)[64:-64, 64:-64] ** 2).mean()))
    # energies add: target² = M² · amp²  (non-negative, by active set)
    A2 = (M ** 2)[:FIT_N][:, FIT_OCT]; t2 = (np.array(target) ** 2)[:FIT_N]; act = list(range(len(FIT_OCT)))
    while True:
        x = np.zeros(len(FIT_OCT)); x[act] = np.linalg.lstsq(A2[:, act], t2, rcond=None)[0]
        if (x >= 0).all() or not act: break
        act = [i for i in act if x[i] > 0]
    amp = np.zeros(len(OCT_UM)); amp[FIT_OCT] = np.sqrt(np.maximum(x, 0)); fit = np.sqrt((M ** 2) @ amp ** 2)
    e_all = float(np.average([r['exp'] for r in rows], weights=np.array(target) ** 2))
    for bi, r in enumerate(rows): r['fit_rms'] = round(float(fit[bi]), 4)
    print('octave amplitudes', dict(zip(OCT_UM, amp.round(3))), '· fitted band rms', fit.round(4), 'target', np.round(target, 4), f'· exponent (energy-weighted) {e_all:.2f}')
    tex = sum(a_ * octave(k, xx, yy) for k, a_ in enumerate(amp)); var = float(tex.var())
    tex28 = cv2.resize(tex.astype(np.float32), None, fx=UM / 28.0, fy=UM / 28.0, interpolation=cv2.INTER_AREA)
    print(f'texture std {np.sqrt(var):.3f} · left after averaging into 28 µm pixels (the scored scale): std {tex28.std():.4f}')
    out = {'ref': REF, 'var': round(var, 4), 'std28um': round(float(tex28.std()), 4), 'bands': rows, 'octUm': OCT_UM, 'octRot': OCT_ROT, 'octOff': OCT_OFF, 'amp': [round(float(a_), 4) for a_ in amp], 'exp': round(e_all, 2),
           'gain': 0.8, 'yrefPhotoLin': round(Yref, 4), 'note': 'relative contrast of the photo-space linear luminance; the engine applies it to the ABL albedo, scaled by gain'}
    path = os.path.join(os.path.dirname(os.path.abspath(sys.argv[1])), f'abltex-{REF}.json'); json.dump(out, open(path, 'w'), indent=1); print('wrote', path)


if __name__ == '__main__':
    main()
