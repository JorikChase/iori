#!/usr/bin/env python3
"""The automaton's sheet for one eye: the engine's frames (stage renders, last = the rendering to draw) cropped square
round the iris at N px, and the anatomy at every crop pixel, from the eye file only (read-only use of the fly-down
study's Eye reader: iris-engine/study/flydown/rig.py; nothing in the engine is touched).

In:  tools/iris-automaton/captures/<ref>-<stage>.png   (engine canvas grabs, RGBA, alpha 0 = not drawn = the white page)
Out: papers/iris-automaton/data/<ref>/<stage>.png      N × N RGB (the stages; the page is white and needs no file)
     papers/iris-automaton/data/<ref>/fields.png       N × N RGB: R tangent θ/π (mod π), G strand crest, B crypt
     papers/iris-automaton/data/<ref>/region.png       N × N grey: 0 off the eye, 255 pupil, else 1 + 253·ρ on the iris
     papers/iris-automaton/data/<ref>/sheet.json       stage names, crop placement, µm per crop px

The crop and the photo frame are matched as printprep.py does it: the render's iris circle (the smallest circle round
everything not white) is the fit's limbus, a similarity (the start pose looks straight at the eye, no mirror).
/usr/bin/python3 tools/iris-automaton/prep.py 26 09 35 25 [--n 384] [--stages photo,final]"""
import os, sys, json, argparse, numpy as np, cv2
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, 'iris-engine', 'study', 'flydown'))
from rig import Eye                                                   # noqa: E402  (read-only reader of the eye file)
CAP = os.path.join(HERE, 'captures'); OUT = os.path.join(ROOT, 'papers', 'iris-automaton', 'data')

def load_grab(path):
    im = cv2.imread(path, cv2.IMREAD_UNCHANGED); assert im is not None, path
    rgb = im[..., :3][..., ::-1].astype(np.float32); a = (im[..., 3:4].astype(np.float32) / 255) if im.shape[2] == 4 else 1
    return rgb * a + 255 * (1 - a)                                    # undrawn = the white page

def crest_map(eye, tomap, N, scale):
    """the traced strands drawn as ink: every curve the eye file ships (veins strongest, then fibres, guides, the
    sheet's fibres and veins), antialiased lines at the crop's scale, softly normalised to [0, 1]"""
    acc = np.zeros((N * 4, N * 4), np.float32)                       # drawn ×4, area-averaged down
    for key, w in (('veins', 1.0), ('fibres', 0.9), ('svein', 0.8), ('sfib', 0.7), ('guides', 0.45)):
        for cv in eye.t.get(key, []):
            q = np.array(cv['xy'], np.float64) * eye.k
            if len(q) < 2: continue
            X, Y = tomap(q[:, 0], q[:, 1]); pts = np.round(np.stack([X, Y], 1) * 4 * 16).astype(np.int32)
            lay = np.zeros_like(acc); cv2.polylines(lay, [pts], False, w, thickness=max(1, int(round(4 * scale))), lineType=cv2.LINE_AA, shift=4)
            np.maximum(acc, lay, out=acc)
    c = cv2.resize(acc, (N, N), interpolation=cv2.INTER_AREA)
    c = cv2.GaussianBlur(c, (0, 0), 0.6)
    p = np.percentile(c[c > 0.02], 90) if (c > 0.02).any() else 1
    return np.clip(c / max(p, 1e-6), 0, 1)

def build(ref, N, stages):
    frames = [load_grab(os.path.join(CAP, f'{ref}-{s}.png')) for s in stages]
    T = frames[-1]; H, W = T.shape[:2]
    ink = cv2.GaussianBlur(T, (0, 0), 2).min(2) < 245
    ink = cv2.morphologyEx(ink.astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    cs, _ = cv2.findContours(ink, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE); cnt = max(cs, key=cv2.contourArea)
    (cx, cy), rr = cv2.minEnclosingCircle(cnt)
    half = rr * 1.06; x0, y0 = cx - half, cy - half; z = N / (2 * half)
    M = np.float32([[z, 0, -x0 * z], [0, z, -y0 * z]])
    crops = [cv2.warpAffine(f, M, (N, N), flags=cv2.INTER_AREA, borderValue=(255, 255, 255)) for f in frames]
    eye = Eye(ref); al = eye.c['align']; lc = np.array([al['limbus'][0] * eye.W, al['limbus'][1] * eye.H])
    pr = 0.5 * (al['limbus'][2] + al['limbus'][3]) * eye.H; s = rr / pr          # canvas px per native px
    ys, xs = np.mgrid[0:N, 0:N].astype(np.float32) + 0.5
    rx, ry = xs / z + x0, ys / z + y0
    nx, ny = ((rx - cx) / s + lc[0]).astype(np.float32), ((ry - cy) / s + lc[1]).astype(np.float32)
    tomap = lambda X, Y: (((X - lc[0]) * s + cx - x0) * z, ((Y - lc[1]) * s + cy - y0) * z)
    tx, ty, cr = eye.at(eye.tx, nx, ny), eye.at(eye.ty, nx, ny), eye.at(eye.crypt, nx, ny)
    theta = np.mod(np.arctan2(ty, tx), np.pi)
    # radius: 0 at the pupil margin, 1 at the limbus, along the ray from the pupil centre
    pc = eye.pc; rp = al['pupil'][2] * eye.H; Rl = pr
    dx, dy = nx - pc[0], ny - pc[1]; r = np.hypot(dx, dy) + 1e-6; ux, uy = dx / r, dy / r
    ox, oy = pc[0] - lc[0], pc[1] - lc[1]; bq = ux * ox + uy * oy; tl = -bq + np.sqrt(np.maximum(bq * bq - (ox * ox + oy * oy - Rl * Rl), 0))
    rho = np.clip((r - rp) / np.maximum(tl - rp, 1e-3), 0, 1)
    cov = cv2.warpAffine(cv2.GaussianBlur(ink.astype(np.float32), (0, 0), 1.0), M, (N, N), flags=cv2.INTER_AREA)
    pupil = (r < rp * 1.0) & (cov > 0.5)
    iris = (cov > 0.5) & ~pupil & (r < tl * 1.0)
    traced = crest_map(eye, tomap, N, z * s * eye.k / eye.k) * iris
    # the bright ridges of the flattest stage across the fitted tangent (the strands the tracer left out): the second
    # derivative of luminance along the normal n = (−sin θ, cos θ), bright lines only, normalised per eye
    Yf = cv2.GaussianBlur(crops[0] @ np.array([0.2126, 0.7152, 0.0722], np.float32), (0, 0), 1.0)
    dxx = cv2.Sobel(Yf, cv2.CV_32F, 2, 0, ksize=3); dyy = cv2.Sobel(Yf, cv2.CV_32F, 0, 2, ksize=3); dxy = cv2.Sobel(Yf, cv2.CV_32F, 1, 1, ksize=3)
    nX, nY = -np.sin(theta), np.cos(theta)
    ridge = np.maximum(-(nX * nX * dxx + 2 * nX * nY * dxy + nY * nY * dyy), 0) * iris
    ridge = np.clip(ridge / max(np.percentile(ridge[iris], 92), 1e-6), 0, 1) ** 1.5
    crest = np.maximum(traced, 0.8 * ridge)
    region = np.where(pupil, 255, np.where(iris, 1 + np.round(253 * rho), 0)).astype(np.uint8)
    d = os.path.join(OUT, ref); os.makedirs(d, exist_ok=True)
    for name, im in zip(stages, crops):
        cv2.imwrite(os.path.join(d, f'{name}.png'), np.clip(im + 0.5, 0, 255).astype(np.uint8)[..., ::-1], [cv2.IMWRITE_PNG_COMPRESSION, 9])
    # no alpha: a browser canvas premultiplies it and would spoil the other channels where it is small
    fl = np.dstack([np.round(theta / np.pi * 255) % 256, np.round(crest * 255), np.round(np.clip(cr, 0, 1) * 255 * iris)]).astype(np.uint8)
    cv2.imwrite(os.path.join(d, 'fields.png'), fl[..., ::-1], [cv2.IMWRITE_PNG_COMPRESSION, 9])
    cv2.imwrite(os.path.join(d, 'region.png'), region, [cv2.IMWRITE_PNG_COMPRESSION, 9])
    meta = {'ref': ref, 'N': N, 'stages': stages, 'canvas': [W, H], 'crop': [float(x0), float(y0), float(2 * half)],
            'um_per_px': float(eye.UM / s / z), 'iris_px': int(iris.sum()), 'pupil_px': int(pupil.sum())}
    json.dump(meta, open(os.path.join(d, 'sheet.json'), 'w'), indent=1)
    kb = sum(os.path.getsize(os.path.join(d, f)) for f in os.listdir(d)) // 1024
    print(ref, meta['um_per_px'], 'µm/px', meta['iris_px'], 'iris px', kb, 'KB')
    # a check sheet: the rendering with the crest in red and crypts in blue over it (study only, not shipped)
    chk = crops[-1].copy(); chk[..., 0] = np.maximum(chk[..., 0], crest * 255); chk[..., 2] = np.maximum(chk[..., 2], np.clip(cr, 0, 1) * iris * 200)
    os.makedirs(os.path.join(HERE, 'check'), exist_ok=True)
    cv2.imwrite(os.path.join(HERE, 'check', f'{ref}-fields.jpg'), np.clip(chk, 0, 255).astype(np.uint8)[..., ::-1], [cv2.IMWRITE_JPEG_QUALITY, 85])

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('refs', nargs='*', default=['26', '09', '35', '25'])
    ap.add_argument('--n', type=int, default=384); ap.add_argument('--stages', default='final')
    a = ap.parse_args()
    for r in a.refs: build(r, a.n, a.stages.split(','))
