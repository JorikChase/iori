#!/usr/bin/env python3
"""1:1 cross-sections of a band's rope (flydown.js fdRope, ported line for line) for band half-widths w: one round rope,
the fork (two thinner ropes and a web), the flare. Strand lines: a synthetic 23 µm line pattern carried round the section.
Out: study/flydown/proto-fork-sections.jpg. No GPU."""
import numpy as np, cv2, sys
smooth = lambda e0, e1, x: (lambda t: t * t * (3 - 2 * t))(np.clip((x - e0) / (e1 - e0), 0, 1))
def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1); return b * (1 - h) + a * h - k * h * (1 - h)
LAM, TUBEB, ROPER = 23.0, 9.0, 28.0          # µm (fibre wavelength, F.tubeB, F.ropeR)
def lineD(arc):                               # distance along the rim to the nearest line axis (lines every LAM)
    return LAM * np.abs(((arc / LAM + 0.5) % 1.0) - 0.5)
def vn(px, py):                                # fdVn: value noise
    ix, iy = np.floor(px), np.floor(py); fx, fy = px - ix, py - iy; fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    h = lambda a, b: np.modf(np.sin(a * 127.1 + b * 311.7) * 43758.5453)[0] % 1.0
    return (h(ix, iy) * (1 - fx) + h(ix + 1, iy) * fx) * (1 - fy) + (h(ix, iy + 1) * (1 - fx) + h(ix + 1, iy + 1) * fx) * fy
NZ = (0.3 * 40, 0.41 * 10)                     # a fixed point along the band (uv × (40, 10)), as the shader's nz
def rope(x, hp, w, hh=0.0, fork_on=1.0):
    Rv = min(w, ROPER); f = w / Rv; fork = fork_on * smooth(1.3, 2.2, f)
    Rs = Rv * (1 - 0.25 * fork); a = max(w - Rs, 0); tW = 2 * Rs + (0.3 * Rs - 2 * Rs) * fork; kf = 0.3 * Rs; P = 3.2 * Rv
    sideE = np.where(x >= 0, 11.3, 23.9)
    RE = Rs * (1 + (0.7 + 0.4 * vn(NZ[0] + sideE, NZ[1] + sideE) - 1) * fork); aE = np.maximum(w - RE, 0); cx = np.where(x >= 0, aE, -aE)
    ki = np.floor(x / P + 0.5); xk = P * ki; rk = Rs * fork * smooth(0.6 * P, 1.0 * P, a - np.abs(xk)) * (0.7 + 0.4 * vn(NZ[0] + ki * 5.1 + 37, NZ[1] + ki * 5.1 + 37))
    kl = np.floor(x / P) + 0.5; xl = P * kl; rl = 0.65 * Rs * fork * smooth(0.1 * P, 0.4 * P, a - np.abs(xl)) * (0.7 + 0.4 * vn(NZ[0] + kl * 7.3 + 71, NZ[1] + kl * 7.3 + 71))
    qx, qy = x - cx, hp - (hh - RE); kx, ky = x - xk, hp - (hh - rk); lx, ly = x - xl, hp - (hh - 1.5 * Rs - 0.5 * rl)
    dC = np.hypot(qx, qy) - RE; dK = np.where(rk > 0.1, np.hypot(kx, ky) - rk, 1e3); dL = np.where(rl > 0.1, np.hypot(lx, ly) - rl, 1e3)
    pwx, pwy = np.abs(x) - a, np.abs(hp - (hh - 0.5 * tW)) - 0.5 * tW
    dW = np.hypot(np.maximum(pwx, 0), np.maximum(pwy, 0)) + np.minimum(np.maximum(pwx, pwy), 0)
    rf = min(TUBEB, 0.45 * Rs)
    n = np.where((dC <= dK) & (dC <= dL), 0, np.where(dK <= dL, 1, 2))
    R0 = np.choose(n, [RE, rk, rl]); c0 = np.choose(n, [cx, xk, xl]); q0x = np.choose(n, [qx, kx, lx]); q0y = np.choose(n, [qy, ky, ly]); rho0 = np.hypot(q0x, q0y)
    dO = np.choose(n, [np.minimum(dK, dL), np.minimum(dC, dL), np.minimum(dC, dK)])
    arc = c0 + R0 * np.arctan2(q0x, q0y); rf0 = np.minimum(rf, 0.45 * R0)
    dF = np.minimum(np.hypot(lineD(arc), rho0 - (R0 - rf0)) - rf0, rho0 - (R0 - 0.6 * rf0))
    d0 = lineD(x); d1 = 0.5 * LAM - d0; rw = rf * (1 - 0.3 * fork)
    dR = np.minimum(np.hypot(d0, hp - (hh - rw)) - rw, np.minimum(np.hypot(d1, hp - (hh - Rs)) - 0.85 * rw, np.hypot(d0, hp - (hh - 1.8 * Rs)) - 0.7 * rw))
    dFW = np.minimum(np.maximum(dR, np.abs(x) - a), dW + 0.6 * rf * fork)
    return smin(smin(dF, dO, kf), dFW, kf), fork
S = 3                                          # px per µm
cols = []
for w in (22, 45, 70, 110, 160, 240):
    X = np.arange(-260, 260, 1 / S); Z = np.arange(20, -90, -1 / S); x, z = np.meshgrid(X, Z)
    d, fk = rope(x, z, w)
    img = np.full(d.shape + (3,), (32, 30, 26), np.uint8)
    img[d < 0] = (120, 200, 215)
    edge = np.abs(d) < 0.6; img[edge] = (230, 245, 250)
    img[np.abs(z) < 0.35] = (90, 90, 90)                                   # the old surface (the band's top)
    for xe in (-w, w): img[:, int((xe + 260) * S)] = (60, 60, 160)         # the band's edges (the crypt rims)
    t = f'w {w} um  fork {fk:.2f}'
    for c, th in (((0, 0, 0), 4), ((255, 255, 255), 1)): cv2.putText(img, t, (10, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.7, c, th + 1, cv2.LINE_AA)
    cols.append(img)
out = np.vstack([np.hstack(cols[:3]), np.hstack(cols[3:])])
cv2.rectangle(out, (out.shape[1] - 20 - 50 * S, out.shape[0] - 24), (out.shape[1] - 20, out.shape[0] - 18), (255, 255, 255), -1)
cv2.putText(out, '50 um', (out.shape[1] - 20 - 50 * S, out.shape[0] - 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1, cv2.LINE_AA)
cv2.imwrite(sys.argv[1] if len(sys.argv) > 1 else 'proto-fork-sections.jpg', out, [cv2.IMWRITE_JPEG_QUALITY, 90])
