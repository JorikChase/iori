#!/usr/bin/env python3
"""The sweet spot for aligning the grain with the structure vectors (iori, 2026-11-11: "is there a sweetspot?").

Criterion — self-similarity, measured on the photo itself (A1): the grain one octave BELOW should be as directional as
the photo is one octave ABOVE. So at each spot and class, the target is the photo's coherence excess over the noise floor
at ρ = 4 px; the grown grain is measured at ρ = 2 px. Too little alignment leaves sensor noise (below target), too much
combs it into stripes (above target: invented structure). The sweep:
  α  strength: how much of the grain is replaced (0 = the photo, 1 = all grown)
  β  field: 0 = our fitted anatomy tangent, 1 = the photo's own fingerprint orientation (A2) where it is reliable
  method: phasor (the grain re-grown as oriented phasor noise, phase from the photo) and LIC along the field
/usr/bin/python3 sweet.py → sweet/<spot>.jpg (curves + the sweet-spot tiles), sweet/measure.json"""
import os, json, numpy as np, cv2
from rig import Eye
import smudge as S
from anatomy import tensor
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, 'sweet'); os.makedirs(OUT, exist_ok=True)
ALPHAS = np.linspace(0, 1, 11); BETAS = [0.0, 0.5, 1.0]
NOISE = {2: 0.297, 4: 0.161}                                          # A1's noise floor (white noise, same tensor)

def a2_field(ref, cx, cy, h, shape):
    z = np.load(os.path.join(HERE, 'anatomy', f'{ref}-a2.npz'))
    gy, gx = z['cy'], z['cx']; c2, s2 = np.cos(2 * z['ori']), np.sin(2 * z['ori']); rel = z['rel']
    ys = np.arange(cy - h, cy + h, dtype=np.float32); xs = np.arange(cx - h, cx + h, dtype=np.float32)
    mx = ((xs - gx[0]) / (gx[1] - gx[0])).astype(np.float32); my = ((ys - gy[0]) / (gy[1] - gy[0])).astype(np.float32)
    MX, MY = np.meshgrid(mx, my)
    at = lambda a: cv2.remap(a.astype(np.float32), MX, MY, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    return at(c2), at(s2), at(rel)

def mixed_field(f, a2, beta):
    c2a, s2a = np.cos(2 * np.arctan2(f['ty'], f['tx'])), np.sin(2 * np.arctan2(f['ty'], f['tx']))
    c2p, s2p, rel = a2; w = beta * np.clip(rel / 0.4, 0, 1)
    th = 0.5 * np.arctan2((1 - w) * s2a + w * s2p, (1 - w) * c2a + w * c2p)
    return np.cos(th).astype(np.float32), np.sin(th).astype(np.float32)

def excess(R, mask, rho):
    c, _ = tensor(R.astype(np.float32), rho); return float(np.median(c[mask])) - NOISE[rho]

def run(spot):
    ref, cx, cy = S.SPOTS[spot]; eye = Eye(ref); L, logY, base, R, f = S.crop_fields(eye, cx, cy)
    a2 = a2_field(ref, cx, cy, S.HALF, R.shape)
    strand = (f['coh'] > 0.6) & (f['crypt'] < 0.5); sheet = (f['coh'] <= 0.6) & (f['crypt'] < 0.5)
    masks = {k: m for k, m in (('strand', strand), ('sheet', sheet)) if m.sum() > 2000}
    # target: the photo one octave up (its own band at ρ 4 px), per class
    target = {k: excess(logY - cv2.GaussianBlur(logY, (0, 0), 2 * S.SIG), m, 4) for k, m in masks.items()}
    wall = np.clip(np.hypot(f['gx'], f['gy']) * 2, 0, 1)
    res = {'target': target, 'curves': {}}
    for meth in ('phasor', 'lic'):
        for beta in BETAS:
            tx, ty = mixed_field(f, a2, beta)
            Rm = S.regrow(R, tx, ty, lam=2.5, Lc=3.0) if meth == 'phasor' else S.lic(R, tx, ty, 14.0 / eye.UM)
            Rm = S.rms_match(Rm, R)
            cur = {k: [] for k in masks}
            for a in ALPHAS:
                w = a * (1 - 0.8 * wall); Ro = R * (1 - w) + Rm * w
                for k, m in masks.items(): cur[k].append(round(excess(Ro, m, 2), 4))
            res['curves'][f'{meth}-b{beta}'] = cur
    # the sweet spot per method/β/class: the α where the grown grain's excess crosses the photo's one-octave-up excess
    sweet = {}
    for key, cur in res['curves'].items():
        sweet[key] = {}
        for k, ys in cur.items():
            t = target[k]; a = None
            for i in range(1, len(ALPHAS)):
                if (ys[i - 1] - t) * (ys[i] - t) <= 0 and ys[i] != ys[i - 1]: a = float(ALPHAS[i - 1] + (t - ys[i - 1]) / (ys[i] - ys[i - 1]) * (ALPHAS[i] - ALPHAS[i - 1])); break
            sweet[key][k] = None if a is None else round(a, 2)
    res['sweet'] = sweet
    # the sheet: curves (strand, sheet) for phasor and LIC at β 0 and 1, and tiles at the sweet spots
    pw, ph = 900, 260; plot = np.full((ph, pw, 3), 20, np.uint8)
    X = lambda a: int(60 + a * (pw - 220)); ymax = max(0.35, max(max(v) for c in res['curves'].values() for v in c.values()) + 0.02)
    Y = lambda v: int(ph - 30 - (v + 0.05) / (ymax + 0.05) * (ph - 60))
    for v in (0, 0.1, 0.2, 0.3): cv2.line(plot, (50, Y(v)), (X(1), Y(v)), (60, 60, 60), 1); cv2.putText(plot, f'{v:.1f}', (12, Y(v) + 4), 0, 0.4, (150, 150, 150), 1)
    cols = {'phasor-b0.0': (80, 220, 255), 'phasor-b1.0': (40, 140, 255), 'lic-b0.0': (120, 255, 120), 'lic-b1.0': (60, 160, 60)}
    y_lab = 40
    for key, c in cols.items():
        for k, ys in res['curves'][key].items():
            pts = [(X(a), Y(v)) for a, v in zip(ALPHAS, ys)]
            for p, q in zip(pts, pts[1:]): cv2.line(plot, p, q, c, 2 if k == 'strand' else 1, cv2.LINE_AA)
        cv2.putText(plot, key.replace('-b0.0', ' / our anatomy').replace('-b1.0', " / the photo's own field"), (X(1) + 10, y_lab), 0, 0.42, c, 1); y_lab += 18
    for k, t in target.items():
        cv2.line(plot, (50, Y(t)), (X(1), Y(t)), (255, 255, 255), 1); cv2.putText(plot, f'target {k} (photo, one octave up)', (X(1) + 10, Y(t) + 4), 0, 0.4, (255, 255, 255), 1)
    cv2.putText(plot, f'eye {ref} {spot}: directional excess of the grain at 9 um vs strength (thick = strand areas, thin = sheet)', (60, 18), 0, 0.48, (255, 255, 255), 1)
    for i, a in enumerate(ALPHAS[::2]): cv2.putText(plot, f'{a:.1f}', (X(a) - 8, ph - 10), 0, 0.4, (150, 150, 150), 1)
    tiles = []
    for key in ('phasor-b0.0', 'phasor-b1.0', 'lic-b0.0'):
        meth, beta = key.split('-b'); beta = float(beta); tx, ty = mixed_field(f, a2, beta)
        Rm = S.regrow(R, tx, ty, lam=2.5, Lc=3.0) if meth == 'phasor' else S.lic(R, tx, ty, 14.0 / eye.UM)
        a = sweet[key].get('strand') or sweet[key].get('sheet') or 0.5
        img = S.compose(base, R, Rm, f, L, a); u8 = (img[..., ::-1] * 255 + 0.5).astype(np.uint8)
        tiles.append(S.label(S.zoomed(u8, 4, 300), f'{key} at sweet a={a:.2f} (x4)'))
    img0 = S.compose(base, R, R, f, L, 0.0); u8 = (img0[..., ::-1] * 255 + 0.5).astype(np.uint8); tiles.insert(0, S.label(S.zoomed(u8, 4, 300), 'the photo (x4)'))
    row = np.concatenate([np.pad(t, ((0, 0), (0, 3), (0, 0))) for t in tiles], 1)
    W = max(row.shape[1], plot.shape[1]); pad = lambda a: np.pad(a, ((0, 0), (0, W - a.shape[1]), (0, 0)))
    cv2.imwrite(os.path.join(OUT, f'{spot}.jpg'), np.concatenate([pad(plot), pad(row)], 0), [cv2.IMWRITE_JPEG_QUALITY, 88])
    return res

if __name__ == '__main__':
    allres = {}
    for s in S.SPOTS:
        allres[s] = run(s); print(s, json.dumps({'target': allres[s]['target'], 'sweet': allres[s]['sweet']}))
        json.dump(allres, open(os.path.join(OUT, 'measure.json'), 'w'), indent=1)
