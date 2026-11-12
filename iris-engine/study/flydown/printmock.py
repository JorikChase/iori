#!/usr/bin/env python3
"""Bioprint mock (offline, for iori to choose the look before the engine work): today's engine frame of eye 26 laid
down like pigment cells. Arrival time T = an anisotropic geodesic from the pupil margin (Dijkstra on a coarse grid:
along the strand tangent ×1, across ×3.5), plus a delay on crypt floors and a per-12 µm-cell jitter. Each area arrives
coarse (blurred) and sharpens; a thin wet front (darker, more saturated, a glint) leads.
/usr/bin/python3 printmock.py  →  print/26-{black,white}.gif + strips"""
import os, heapq, numpy as np, cv2
from PIL import Image
from rig import Eye, hash3
HERE = os.path.dirname(os.path.abspath(__file__))
ACROSS, CRYPT, JIT, DUR = 3.5, 0.35, 0.06, 2.0

def arrival(eye, A, shape):
    """T in [0,1] on the render frame (shape), via a coarse grid in native px."""
    H, W = shape; g = 4                                              # grid step in render px
    gh, gw = H // g, W // g
    ys, xs = np.mgrid[0:gh, 0:gw].astype(np.float32) * g + g / 2
    Ainv = cv2.invertAffineTransform(A)                              # render px → fit px
    fx = Ainv[0, 0] * xs + Ainv[0, 1] * ys + Ainv[0, 2]; fy = Ainv[1, 0] * xs + Ainv[1, 1] * ys + Ainv[1, 2]
    k = eye.W / 1280.0; nx, ny = (fx * k).astype(np.float32), (fy * k).astype(np.float32)
    tx, ty, cr = eye.at(eye.tx, nx, ny), eye.at(eye.ty, nx, ny), eye.at(eye.crypt, nx, ny)
    iris = eye.at(eye.iris, nx, ny) > 0.5
    r = np.hypot(nx - eye.pc[0], ny - eye.pc[1]); rp = eye.c['align']['pupil'][2] * eye.H
    seed = iris & (r < rp * 1.12)
    T = np.full((gh, gw), np.inf); pq = []
    for y, x in zip(*np.nonzero(seed)): T[y, x] = 0; pq.append((0.0, y, x))
    heapq.heapify(pq)
    nb = [(dy, dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx]
    while pq:
        t, y, x = heapq.heappop(pq)
        if t > T[y, x]: continue
        for dy, dx in nb:
            yy, xx = y + dy, x + dx
            if not (0 <= yy < gh and 0 <= xx < gw) or not iris[yy, xx]: continue
            d = np.array([dx, dy], float) / np.hypot(dx, dy); al = abs(d[0] * tx[y, x] + d[1] * ty[y, x])
            c = np.hypot(dx, dy) * np.hypot(al, ACROSS * np.sqrt(max(0.0, 1 - al * al))) * (1 + 2.5 * cr[yy, xx])
            if t + c < T[yy, xx]: T[yy, xx] = t + c; heapq.heappush(pq, (t + c, yy, xx))
    T[~np.isfinite(T)] = np.nan
    T = T / np.nanpercentile(T, 99.5)
    um = eye.UM; cell = 12.0
    jit = hash3(np.floor(nx * um / cell).astype(np.int64), np.floor(ny * um / cell).astype(np.int64), 0, 11)
    T = np.clip(T * (1 - JIT - CRYPT * 0.5) + CRYPT * 0.5 * cr + JIT * jit, 0, 1)
    T = cv2.resize(np.nan_to_num(T, nan=1.0).astype(np.float32), (W, H), interpolation=cv2.INTER_LINEAR)
    m = cv2.resize(iris.astype(np.float32), (W, H)) > 0.5
    return T, m

def frames(img, T, m, bg, n=48):
    img = img.astype(np.float32) / 255; out = []
    blur = [cv2.GaussianBlur(img, (0, 0), s) for s in (12, 4, 1.2)]
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    wet = cv2.cvtColor(np.dstack([hsv[..., 0], np.clip(hsv[..., 1] * 1.35, 0, 1), hsv[..., 2] * 0.72]), cv2.COLOR_HSV2BGR)
    rng = np.random.default_rng(3); glint = (rng.random(T.shape) > 0.985).astype(np.float32)
    glint = cv2.GaussianBlur(glint, (0, 0), 1.2) * 6
    for f in range(n):
        t = f / (n - 1) * 1.15
        age = t - T                                                  # < 0: not yet printed
        a = np.clip(age / 0.035, 0, 1)                               # the cell is laid down
        sharp = np.clip(age / 0.25, 0, 1)                            # coarse → fine
        lv = np.where(sharp[..., None] < 0.33, blur[0] * (1 - sharp[..., None] * 3) + blur[1] * sharp[..., None] * 3,
             np.where(sharp[..., None] < 0.66, blur[1] * (2 - sharp[..., None] * 3) + blur[2] * (sharp[..., None] * 3 - 1),
                      blur[2] * (3 - sharp[..., None] * 3) + img * (sharp[..., None] * 3 - 2)))
        w = np.clip(1 - age / 0.12, 0, 1) * (age > 0)                # the wet front fades as the ink sets
        col = lv * (1 - w[..., None] * 0.6) + wet * (w[..., None] * 0.6) + (glint * w)[..., None]
        a3 = (a * m)[..., None]; full = img if f == n - 1 else None
        fr = np.clip(bg * (1 - a3) + col * a3, 0, 1)
        if t >= 1.15: fr = np.where(m[..., None], img, bg)
        out.append((fr * 255 + 0.5).astype(np.uint8))
    return out

if __name__ == '__main__':
    eye = Eye('26'); A = np.load(os.path.join(HERE, 'today', '26-affine.npy'))
    img = cv2.imread(os.path.join(HERE, 'today', '26-full.jpg'))
    sc = 480 / img.shape[1]; img = cv2.resize(img, (480, int(img.shape[0] * sc)), interpolation=cv2.INTER_AREA)
    A = A * sc
    T, m = arrival(eye, A, img.shape[:2])
    os.makedirs(os.path.join(HERE, 'print'), exist_ok=True)
    white = img.astype(np.float32) / 255                             # the engine's own page/sclera outside the iris
    for name, bg in (('black', np.zeros_like(white)), ('white', np.where(m[..., None], 1.0, white))):
        fr = frames(img, T, m, bg)
        ims = [Image.fromarray(f[..., ::-1]) for f in fr] + [Image.fromarray(fr[-1][..., ::-1])] * 10
        ims[0].save(os.path.join(HERE, 'print', f'26-{name}.gif'), save_all=True, append_images=ims[1:], duration=42, loop=0)
        pick = [6, 14, 22, 30, 38, 47]
        cv2.imwrite(os.path.join(HERE, 'print', f'26-{name}-strip.jpg'), np.concatenate([np.pad(fr[i], ((0, 0), (0, 4), (0, 0))) for i in pick], 1), [cv2.IMWRITE_JPEG_QUALITY, 88])
    print('ok')
