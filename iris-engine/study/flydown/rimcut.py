#!/usr/bin/env python3
"""A 1:1 side cut through a crypt's edge with the renderer's rim rules (flydown.js fdRimFrame / fdRimLip, ported line for line,
the cut taken along the uphill direction so n is ±1). In: the layer model's height along the cut (rim-profile.json, 1 µm steps,
read with IrisTissue.auxAtUVs). Out: off (the height map) vs the rim at the given (reach, undercut, thickness) settings."""
import json, sys, numpy as np, cv2
D = json.load(open(sys.argv[1])); h = np.array(D['h']); s0, ds = D['s0'], D['ds']; N = len(h); X_ = s0 + ds * np.arange(N)
H = lambda s: np.interp(s, X_, h)
SD = (lambda s: np.interp(s, X_, np.array(D['sd']))) if 'sd' in D else None     # the baked edge map along the cut (flydown.js bakeRim)
def smooth(a, b, x): t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
def frame(s, P):
    ov, uc, T = P; hh = H(s); e = 0.024
    g = (H(s + e) - H(s - e)) / (2 * e)
    if abs(g) < 0.35: return None
    n = np.sign(g); at = lambda um: H(s + n * um * 0.001)
    h0, h1, h2, h3, h4 = at(-40), at(-16), hh, at(16), at(40)
    hT = max(h3, h4); hF = min(h0, h1, at(-80)); drop = hT - hF
    w = smooth(0.04, 0.07, drop)
    if w <= 0: return None
    LT = hT - 0.15 * drop; c = None
    if h3 < LT: c = 16 + 24 * (LT - h3) / max(h4 - h3, 1e-6)
    elif h2 < LT: c = 16 * (LT - h2) / max(h3 - h2, 1e-6)
    elif h1 < LT: c = -16 + 16 * (LT - h1) / max(h2 - h1, 1e-6)
    elif h0 < LT: c = -40 + 24 * (LT - h0) / max(h1 - h0, 1e-6)
    if c is None: return None
    cb = c - 16
    hb = np.interp(cb, [-40, -16, 0, 16], [h0, h1, h2, h3])
    h8 = at(max(c, 0) + 80)
    w *= 1 - smooth(0.3, 0.45, abs(h4 - h3) / 0.024); w *= 1 - smooth(0.012, 0.022, abs(h8 - hT)); w *= smooth(0.6, 1.0, (LT - hb) / 0.016)
    if w <= 0.01: return None
    x = -c
    if x < -ov * 1.8 - 2 or x > uc + 2 * T + 6: return None
    hu = np.interp(-uc, [-40, -16, 0], [h0, h1, h2])
    return dict(w=w, x=x * 0.001, hT=hT, hu=min(hh, hu), ov=ov * 1.0 * 0.001, P=P)
def frame_baked(s, P):
    """flydown.js fdRimFrame since the edge map: the distance and its gradient from the map, the sheet behind the lip, the wall cut back"""
    ov, uc, T = P; hh = H(s); sd = SD(s) * 1000
    if sd < -2 * ov - 10 or sd > uc + 2 * T + 10: return None
    g = (SD(s + 0.001) - SD(s - 0.001)) / 0.002
    if abs(g) < 0.01: return None
    du = 1 / g * 0.001                                                  # cut mm per µm of distance
    hT = H(s + du * (uc + 2 * T + 6 - sd)); hu = H(s - du * uc)
    wc = (1 - smooth(0.001 * T + 0.01, 0.001 * T + 0.04, hT - hh)) * (1 - smooth(uc, uc + 0.8 * T, sd))
    return dict(w=1.0, x=sd * 0.001, hT=hT, hu=hh * (1 - wc) + min(hh, hu) * wc, ov=ov * 0.001, P=P, baked=True)
def lip(f, hp):
    ov, uc, T = f['P']; w = f['w']; r = 0.0005 * T * max(w, 0.2); uc *= 0.001; dr = 0.4 * r
    A = np.array([-f['ov'] * w, f['hT'] - r - dr]); B = np.array([uc + 2 * r + 0.004, f['hT'] - r])
    P = np.stack([np.full_like(hp, f['x']), hp], -1); ab = B - A; t = np.clip(((P - A) @ ab) / (ab @ ab), 0, 1)
    return np.linalg.norm(P - A - t[:, None] * ab, axis=-1) - r
def cut(P, sa, sb, za, zb, px=1e-3, fr=None):
    S = np.arange(sa, sb, px); Z = np.arange(zb, za, -px / 2); img = np.zeros((len(Z), len(S)), np.uint8)
    for j, s in enumerate(S):
        hh = H(s); f = (fr or frame)(s, P) if P else None
        top = hh if f is None else (f['hu'] if f.get('baked') else hh * (1 - f['w']) + f['hu'] * f['w'])
        col = Z <= top
        if f is not None: col |= lip(f, Z) < 0
        img[:, j] = np.where(col, 255, 0)
    return img
if __name__ == '__main__':
    sa, sb, za, zb = -0.34, -0.06, -0.26, 0.02   # mm across, height window
    rows = []
    for P, t, fr in [(None, 'height map (off)', None), ((35, 22, 18), 'per-point edge search, 35 / 22 / 18 um', frame), ((35, 22, 18), 'baked edge map, 35 / 22 / 18 um', frame_baked)]:
        im = cut(P, sa, sb, za, zb, fr=fr); im = cv2.cvtColor(im, cv2.COLOR_GRAY2BGR); im[im[..., 0] > 0] = (120, 170, 150); im[im[..., 0] == 0] = (40, 30, 25)
        im = cv2.resize(im, None, fx=3, fy=1.5, interpolation=cv2.INTER_NEAREST)
        cv2.putText(im, t + '   (1:1, 280 x 280 um)', (8, 22), 0, 0.6, (255, 255, 255), 1, cv2.LINE_AA); rows.append(im)
    cv2.imwrite(sys.argv[2], np.concatenate([np.pad(r, ((0, 4), (0, 0), (0, 0)), constant_values=255) for r in rows], 0))
