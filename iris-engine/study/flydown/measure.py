#!/usr/bin/env python3
"""study/17 §2.7 — the held-out octave. The photograph is halved (9.3 µm/px on eye 26); each algorithm predicts the
octave the halving removed (λ ≈ 9.3 µm), on the native grid; the prediction is compared with the real octave.
  A   erosion, octave 1 below the halved photo: phases from the hash lineage (predicted, no access to the octave)
  A'  erosion, octave 0 on the full photo: phases demodulated from the octave itself (the shipping case: the seed)
  B   mosaic, likewise predicted;  B' mosaic seeded from the octave itself
  C   by-example: one self-example ×2 step from the halved photo, minus plain bicubic (what it adds)
  N   isotropic value noise (what ablTex-style statistics give)
Per region (sheet / crypt): corr = pixel correlation with the real octave; energy = rms ratio; dir = directional
share (structure-tensor coherence of the band, energy-weighted); ori = median angle between the band's and the real
octave's dominant orientation (where both are coherent).
python3 measure.py 26 1185 1965  → measure/26-<x>-<y>.json"""
import sys, os, json, numpy as np, cv2
from rig import Eye, calibrate, alg_erosion, alg_mosaic, upscale_self, hash3
HERE = os.path.dirname(os.path.abspath(__file__))

def band(L, s=0.75):                         # the λ ≈ 2–4 native px band of a log-luminance image
    return cv2.GaussianBlur(L, (0, 0), s) - cv2.GaussianBlur(L, (0, 0), 2 * s)

def tensor(b, s=4):
    gy, gx = np.gradient(b); J = [cv2.GaussianBlur(a, (0, 0), s) for a in (gx * gx, gx * gy, gy * gy)]
    th = 0.5 * np.arctan2(2 * J[1], J[0] - J[2]); coh = np.sqrt((J[0] - J[2]) ** 2 + 4 * J[1] ** 2) / (J[0] + J[2] + 1e-12)
    return th, coh, J[0] + J[2]

def stats(pred, real, m):
    p, r = pred[m], real[m]
    corr = float(np.corrcoef(p, r)[0, 1]); en = float(p.std() / (r.std() + 1e-12))
    tp, cp, ep = tensor(pred); tr, cr, er = tensor(real)
    dirp = float((cp * ep)[m].sum() / (ep[m].sum() + 1e-12)); dirr = float((cr * er)[m].sum() / (er[m].sum() + 1e-12))
    both = m & (cp > 0.3) & (cr > 0.3)
    d = np.abs(((tp - tr + np.pi / 2) % np.pi) - np.pi / 2)
    ori = float(np.degrees(np.median(d[both]))) if both.sum() > 50 else None
    return {'corr': round(corr, 3), 'energy': round(en, 2), 'dir': round(dirp, 3), 'dirReal': round(dirr, 3), 'ori': ori and round(ori, 1)}

def run(ref, P, half=200):
    full = calibrate(Eye(ref)); dn = calibrate(Eye(ref, down=2))
    x0, y0 = int(P[0]) - half, int(P[1]) - half; n = 2 * half
    X, Y = np.meshgrid(np.arange(x0, x0 + n, dtype=np.float32), np.arange(y0, y0 + n, dtype=np.float32))
    # the held-out octave = exactly what the halving removed: full − bicubic(halved), in log luminance
    hu = cv2.resize(dn.logY, (dn.logY.shape[1] * 2, dn.logY.shape[0] * 2), interpolation=cv2.INTER_CUBIC)
    real = (full.logY[y0:y0 + n, x0:x0 + n] - hu[y0:y0 + n, x0:x0 + n]).astype(np.float32)
    m = full.iris[y0:y0 + n, x0:x0 + n] > 0.5; cr = full.crypt[y0:y0 + n, x0:x0 + n]
    regions = {'sheet': m & (cr < 0.1), 'crypt': m & (cr > 0.9)}
    s = full.UM
    out = {}
    # predicted (halved eye): its grid is native/2, so native px X → X/2
    Xd, Yd = X / 2, Y / 2
    _, oA = alg_erosion(dn, Xd, Yd, 0.5, ret_oct=True); _, oB = alg_mosaic(dn, Xd, Yd, 0.5, ret_oct=True)   # s small: octaves unfaded
    _, oA1 = alg_erosion(full, X, Y, 0.5, ret_oct=True); _, oB1 = alg_mosaic(full, X, Y, 0.5, ret_oct=True)
    # predicted octaves sit one level below the halved eye's first: rescale by its slope so both columns compare the level
    preds = {'A': oA[1] / dn.oamp[1], "A'": oA1[0], 'B': oB[1] / dn.oamp[1], "B'": oB1[0]}
    # C: one ×2 self-example step from the halved photo's crop
    cd = dn.logY[y0 // 2 - 8:(y0 + n) // 2 + 8, x0 // 2 - 8:(x0 + n) // 2 + 8]; cl = dn.crypt[y0 // 2 - 8:(y0 + n) // 2 + 8, x0 // 2 - 8:(x0 + n) // 2 + 8]
    up = upscale_self(cd, cl, 1)[1][16:16 + n, 16:16 + n]
    bic = cv2.resize(cd, (cd.shape[1] * 2, cd.shape[0] * 2), interpolation=cv2.INTER_CUBIC)[16:16 + n, 16:16 + n]
    preds['C'] = up - bic                                    # only what the self-examples ADD over plain magnification
    rng = hash3(np.round(X).astype(np.int64), np.round(Y).astype(np.int64), 0, 9) - 0.5
    preds['N'] = rng
    for k, p in preds.items():
        pb = np.asarray(p, np.float32) - cv2.GaussianBlur(np.asarray(p, np.float32), (0, 0), 2.0)   # same band as the held-out octave
        out[k] = {rn: stats(pb, real, rm) for rn, rm in regions.items() if rm.sum() > 500}
    os.makedirs(os.path.join(HERE, 'measure'), exist_ok=True)
    f = os.path.join(HERE, 'measure', f'{ref}-{int(P[0])}-{int(P[1])}.json'); json.dump(out, open(f, 'w'), indent=1)
    return out, {k: int(v.sum()) for k, v in regions.items()}

if __name__ == '__main__':
    out, cnt = run(sys.argv[1], np.array([float(sys.argv[2]), float(sys.argv[3])]))
    print(cnt)
    for k, v in out.items(): print(k, v)
