#!/usr/bin/env python3
"""The depth fade (iori, 2026-11-11): below the photograph the fibres must give way to cells, by how much per octave.

1  A leak-free held-out test. Halve the photo; the target is what the halving removed, kept ONLY above the halved
   photo's Nyquist (an FFT band mask at 0.9 × its Nyquist). Every prediction is band-limited the same way, and a
   control — the halved photo itself, bicubically magnified — measures how much the resampling alone "predicts". A
   method is credited only for what it scores above that control.
2  The fade rule, decided without looking at the target: the octave below the photo should be as directional as the
   halved photo's own finest octave is (self-similarity in each octave's own pixels). The prediction is a mix
   φ·fibres + (1 − φ)·cells (phasor v2's sub-pixel fibres; the seeded Worley mosaic's octave), energy from the photo's
   spectral slope. φ_rule is the mix whose directionality meets the rule; φ_oracle is the one that meets the TARGET's —
   the rule is validated when they agree.
3  A view of the full eye, ×1 → ×16, with φ per octave: φ₁ from the rule, then decaying by the photo's own ratio of
   directional excess between its two finest octaves.
/usr/bin/python3 depth.py → depth/sheet-<spot>.jpg, depth/<spot>-zoom.mp4, depth/measure.json"""
import os, json, numpy as np, cv2
from PIL import Image
from rig import Eye, alg_mosaic, calibrate, lin2srgb
import smudge as S
import phasor2 as P2
from anatomy import tensor
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, 'depth'); os.makedirs(OUT, exist_ok=True)
NOISE2 = 0.297                                                         # coherence of white noise at ρ 2 px (A1)
PHIS = np.linspace(0, 1, 11)

def band(img, lo):
    """keep only frequencies above lo (cycles/px), radially"""
    F = np.fft.fft2(img); fy = np.fft.fftfreq(img.shape[0]); fx = np.fft.fftfreq(img.shape[1])
    R = np.hypot(*np.meshgrid(fx, fy)); m = np.clip((R - lo) / (0.04), 0, 1)
    return np.real(np.fft.ifft2(F * m)).astype(np.float32)

def dirx(img, mask, rho=2.0): c, _ = tensor(img.astype(np.float32), rho); return float(np.median(c[mask])) - NOISE2

def corr(a, b, m): return float(np.corrcoef(a[m], b[m])[0, 1])

def heldout(spot):
    ref, cx, cy = S.SPOTS[spot]; full = Eye(ref); half = calibrate(Eye(ref, down=2))
    Lf, logYf, basef, Rf, ff = S.crop_fields(full, cx, cy)
    Lh, logYh, baseh, Rh, fh = S.crop_fields(half, cx // 2, cy // 2, h=S.HALF // 2)
    up = lambda a: cv2.resize(a, (a.shape[1] * 2, a.shape[0] * 2), interpolation=cv2.INTER_CUBIC)
    lo = 0.9 * 0.25                                                    # 0.9 × the halved photo's Nyquist, in full-res cycles/px
    target = band(logYf - up(logYh), lo)
    m = np.zeros(target.shape, bool); m[12:-12, 12:-12] = True
    n = target.shape[0]; o = ((np.arange(n) + 0.5) / 2 - 0.5).astype(np.float32); X, Y = np.meshgrid(o, o)
    # fibres: phasor v2 grown from the halved photo, evaluated at full resolution
    lam_w, rel, thr, okw, _, _ = P2.fine_spacing(Rh, np.ones_like(Rh, bool)); lam = float(np.median(lam_w[okw])) if okw.sum() > 20 else 2.5
    _, piv, Lc = P2.v2_native_and_fine(Rh, fh, np.full_like(Rh, lam))
    fib = band(P2.evaluate(X, Y, piv, Lc), lo)
    # cells: the seeded mosaic's octave at full-res pixel size, from the halved eye
    Xh, Yh = X + (cx // 2 - S.HALF // 2), Y + (cy // 2 - S.HALF // 2)
    cel = band(alg_mosaic(half, Xh, Yh, half.UM / 2).astype(np.float32), lo)
    ctrl = band(up(logYh), lo); noise = band(np.random.default_rng(0).standard_normal(target.shape).astype(np.float32), lo)
    # energy: the halved photo's finest band rms × its spectral slope (not the target's)
    e_pred = float(np.std(band(logYh, 0.9 * 0.5)) * half.ratio) if hasattr(half, 'ratio') else float(np.std(target))
    nz = lambda a: a / (a[m].std() + 1e-9) * e_pred
    fib, cel, noise = nz(fib), nz(cel), nz(noise)
    # the rule: the halved photo's own finest octave, its directionality in its own pixels
    rule = dirx(band(logYh, 0.9 * 0.25), np.ones(logYh.shape, bool) & (np.pad(np.ones((logYh.shape[0] - 12, logYh.shape[1] - 12), bool), 6)))
    tgt_dir = dirx(target, m)
    curve = []
    for phi in PHIS:
        pred = phi * fib + (1 - phi) * cel; pred = nz(pred)
        curve.append({'phi': round(float(phi), 1), 'dir': round(dirx(pred, m), 4), 'corr': round(corr(pred, target, m), 3)})
    pick = lambda goal: min(curve, key=lambda c: abs(c['dir'] - goal))['phi']
    res = {'targetDir': round(tgt_dir, 4), 'ruleDir': round(rule, 4), 'phiRule': pick(rule), 'phiOracle': pick(tgt_dir),
           'control': round(corr(ctrl, target, m), 3), 'noise': round(corr(noise, target, m), 3),
           'fibres': round(corr(fib, target, m), 3), 'cells': round(corr(cel, target, m), 3),
           'energyPredOverTarget': round(e_pred / float(target[m].std()), 3), 'curve': curve, 'lambdaHalfPx': round(lam, 2)}
    return res

def ratio_excess(eye, logY):
    """the photo's directional excess in its finest octave over the next, for the per-octave decay"""
    m = np.ones(logY.shape, bool); m[:8] = m[-8:] = False; m[:, :8] = m[:, -8:] = False
    b1 = band(logY, 0.225); b2 = band(cv2.resize(cv2.resize(logY, None, fx=0.5, fy=0.5, interpolation=cv2.INTER_AREA), None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC), 0.1125)
    e1, e2 = max(dirx(b1, m), 1e-3), max(dirx(b2, m), 1e-3); return float(np.clip(e1 / e2, 0.2, 1.0))

def view_sheet(spot, phi1):
    """the full eye from ×1 to ×16: photo bicubic, fibres only (φ 1), cells only (φ 0), the depth fade"""
    ref, cx, cy = S.SPOTS[spot]; eye = calibrate(Eye(ref)); L, logY, base, R, f = S.crop_fields(eye, cx, cy)
    lam_w, rel, thr, okw, _, _ = P2.fine_spacing(R, np.ones_like(R, bool)); lam = float(np.median(lam_w[okw])) if okw.sum() > 20 else 2.5
    _, piv, Lc = P2.v2_native_and_fine(R, f, np.full_like(R, lam))
    dec = ratio_excess(eye, logY)
    c = (R.shape[1] / 2, R.shape[0] / 2)
    def view(kind, z, n=300):
        X, Y = P2.grid(n / z, z, c); X, Y = X[:n, :n], Y[:n, :n]
        at = lambda a: cv2.remap(a.astype(np.float32), X, Y, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
        g = at(logY)
        if kind != 'photo' and z > 1:
            k = max(2, int(round(z)))
            fib = P2.evaluate(X, Y, piv, Lc); fib = fib - cv2.blur(fib, (k, k))
            cel = alg_mosaic(eye, X + cx - S.HALF, Y + cy - S.HALF, eye.UM / z).astype(np.float32); cel = cel - cv2.blur(cel, (k, k))
            fib = fib / (fib.std() + 1e-9); cel = cel / (cel.std() + 1e-9)
            # φ per octave: φ₁ at the first octave below the photo, × dec per further octave (z = 2^octave)
            octs = np.log2(z); phi = phi1 * dec ** max(0.0, octs - 1)
            if kind == 'fibres': phi = 1.0
            if kind == 'cells': phi = 0.0
            amp = float(np.std(R)) * eye.ratio ** max(0.0, octs - 1) * 0.9
            g = g + (phi * fib + (1 - phi) * cel) / np.sqrt(phi ** 2 + (1 - phi) ** 2 + 1e-9) * amp * min(1.0, octs)
        Lv = np.dstack([at(L[..., i]) for i in range(3)]); Yv = np.maximum(Lv @ np.array([0.2126, 0.7152, 0.0722], np.float32), 1e-4)
        rgb = lin2srgb(np.clip(Lv * (np.exp(g) / Yv)[..., None], 0, 1)); return (rgb[..., ::-1] * 255 + 0.5).astype(np.uint8)
    zs = (1, 2, 4, 8, 16); titles = {'photo': 'the photo, magnified (bicubic)', 'fibres': 'fibres all the way down (phasor v2, phi 1)', 'cells': 'cells only (seeded mosaic, phi 0)',
                                     'fade': f'the depth fade: phi1 {phi1:.1f} from the rule, x{dec:.2f} per octave'}
    rows = []
    for kind in ('photo', 'fibres', 'cells', 'fade'):
        r = np.concatenate([np.pad(S.label(view(kind, z), f'x{z}  {eye.UM / z:.2f} um/px'), ((0, 3), (0, 3), (0, 0))) for z in zs], 1)
        head = np.zeros((26, r.shape[1], 3), np.uint8); cv2.putText(head, titles[kind], (8, 18), 0, 0.5, (120, 230, 255), 1, cv2.LINE_AA); rows.append(np.concatenate([head, r], 0))
    cv2.imwrite(os.path.join(OUT, f'sheet-{spot}.jpg'), np.concatenate(rows, 0), [cv2.IMWRITE_JPEG_QUALITY, 90])
    fr = []
    for z in np.exp(np.linspace(0, np.log(16), 48)):
        fr.append(Image.fromarray(np.concatenate([S.label(view('photo', z), f'photo x{z:.1f}'), S.label(view('fade', z), f'depth fade x{z:.1f}')], 1)[..., ::-1]))
    g = os.path.join(OUT, f'{spot}-zoom.gif'); fr[0].save(g, save_all=True, append_images=fr[1:] + fr[::-1], duration=80, loop=0); S.to_mp4(g)
    return {'decayPerOctave': round(dec, 3), 'lambdaPx': round(lam, 2)}

if __name__ == '__main__':
    res = {}
    for s in S.SPOTS:
        h = heldout(s); v = view_sheet(s, h['phiRule'])
        res[s] = {'heldout': {k: v_ for k, v_ in h.items() if k != 'curve'}, 'view': v, 'curve': h['curve']}
        print(s, json.dumps(res[s]['heldout']), json.dumps(v))
        json.dump(res, open(os.path.join(OUT, 'measure.json'), 'w'), indent=1)
