#!/usr/bin/env python3
"""The bioprint's per-eye preview (print.js, the opening): data/<ref>.print.png + .print.json.

  .print.jpg  the eye at its start pose, as the page shows it once the layer model is on (study/shots/start-<ref>.png,
       captured by tools/flydown/rig.js capStart), cropped square round the iris, 512 px — tens of KB, so the print
       begins before the 2–4 MB eye file lands
  .print.png  512 px, the strand coordinates (2026-11-12): R = the length along the strand from the pupil margin (0..1),
       G/B = the angle at the margin where the strand starts (16 bit, hi/lo: which strand), A = 0 off the eye (the white
       page is never printed), else 64 + 191 × crypt; print.js grows each strand from it
  json the crop's centre and half-size relative to the canvas height, from the canvas centre (y up), so the page can
       place it on any canvas: the start pose scales with the height (the 24 mm sensor)
/usr/bin/python3 printprep.py 26 09 25 35"""
import os, sys, json, heapq, numpy as np, cv2
from rig import Eye, hash3
HERE = os.path.dirname(os.path.abspath(__file__)); ENG = os.path.dirname(os.path.dirname(HERE))
N, NA = 512, 512                                                      # preview px (JPEG), arrival px (PNG, one Dijkstra node per px)
ACROSS, CRYPT_SLOW, CRYPT_LATE, JIT = 3.5, 2.5, 0.25, 0.06

def strand_field(eye, q=4):
    """every point of the iris traced back along the strands' tangent (outward-oriented, a little radial so it never
    circles) to the pupil margin: the angle where its strand starts there, and the length along it. Semi-Lagrangian on
    a 1/q grid of the photo; returns a sampler (native x, y) -> (u0 in turns, length normalised to the eye's 99.5 %)"""
    gh, gw = eye.H // q, eye.W // q; gy, gx = (np.mgrid[0:gh, 0:gw].astype(np.float32) + 0.5) * q - 0.5
    tx, ty = eye.at(eye.tx, gx, gy).astype(np.float32), eye.at(eye.ty, gx, gy).astype(np.float32); I = eye.at(eye.iris.astype(np.float32), gx, gy) > 0.5
    r = np.hypot(gx - eye.pc[0], gy - eye.pc[1]); rp = eye.c['align']['pupil'][2] * eye.H
    rx, ry = (gx - eye.pc[0]) / np.maximum(r, 1e-6), (gy - eye.pc[1]) / np.maximum(r, 1e-6)
    sg = np.sign(tx * rx + ty * ry); sg[sg == 0] = 1
    ox, oy = tx * sg + 0.35 * rx, ty * sg + 0.35 * ry; on_ = np.maximum(np.hypot(ox, oy), 1e-6); ox, oy = ox / on_, oy / on_
    ang = np.arctan2(gy - eye.pc[1], gx - eye.pc[0]).astype(np.float32); A0c, A0s = np.cos(ang), np.sin(ang)
    margin = r < rp * 1.04
    yy, xx = np.mgrid[0:gh, 0:gw].astype(np.float32); bx, by = (xx - ox).astype(np.float32), (yy - oy).astype(np.float32)
    pull = lambda a: cv2.remap(a, bx, by, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    Ac, As, S = A0c.copy(), A0s.copy(), np.zeros((gh, gw), np.float32)
    for _ in range(int(max(gh, gw) * 0.45)):
        Ac, As, S = np.where(margin, A0c, pull(Ac)), np.where(margin, A0s, pull(As)), np.where(margin, 0.0, pull(S) + 1.0).astype(np.float32)
    smax = max(float(np.percentile(S[I & ~margin], 99.5)), 1e-6) if (I & ~margin).any() else 1.0
    def sample(nx, ny):
        X, Y = ((nx + 0.5) / q - 0.5).astype(np.float32), ((ny + 0.5) / q - 0.5).astype(np.float32)
        c, s_, L = [cv2.remap(a, X, Y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE) for a in (Ac, As, S)]
        return ((np.arctan2(s_, c) / (2 * np.pi)) % 1.0).astype(np.float64), np.clip(L / smax, 0, 1)
    return sample

def enc(u0, sN, alpha):
    v = np.floor(u0 * 65535.0); return np.dstack([np.clip(sN, 0, 1) * 255 + 0.5, v // 256, v % 256, alpha]).astype(np.uint8)

def tissue_map(ref, eye, Fs, NU=2048, NV=256):
    """the same strands in tissue uv: data/<ref>.strands.png (R length, G/B the strand's angle at the margin, A 64 + 191 ×
    crypt on the iris, 0 off it) — print.js reads it through the frame's own (u, v) map, at any pose and zoom"""
    from seedtex import inverse_map, sample_grid
    W, H, U, V, X, Y, vmax = inverse_map(ref); k = eye.W / W
    nx, ny, ok, _ = sample_grid(W, H, U, V, X, Y, NU, NV, k)
    u0, sN = Fs(nx, ny); cr = eye.at(eye.crypt, nx, ny)
    # beyond the photographed iris (the tissue runs on under the limbus) no strand was traced: its length would read 0 and it
    # printed first, a ring at the limbus (iori 2026-11-12) — there the print arrives last
    sN = np.where(eye.at(eye.iris, nx, ny) > 0.5, sN, 1.0)
    img = enc(u0, sN, np.where(ok, 64 + 191 * np.clip(cr, 0, 1), 0))
    cv2.imwrite(os.path.join(ENG, 'data', f'{ref}.strands.png'), img[..., [2, 1, 0, 3]], [cv2.IMWRITE_PNG_COMPRESSION, 9])
    print(ref, 'strands.png', os.path.getsize(os.path.join(ENG, 'data', f'{ref}.strands.png')) // 1024, 'KB')

def build(ref):
    im = cv2.imread(os.path.join(ENG, 'study', 'shots', f'start-{ref}.png'), cv2.IMREAD_UNCHANGED)
    H, W = im.shape[:2]
    rgb = im[..., :3]
    ink = cv2.GaussianBlur(rgb, (0, 0), 2).min(2) < 245                # the eye: anything not the white page
    ink = cv2.morphologyEx(ink.astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    cs, _ = cv2.findContours(ink, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE); cnt = max(cs, key=cv2.contourArea)
    (cx, cy), rr = cv2.minEnclosingCircle(cnt)
    half = rr * 1.04; x0, y0 = cx - half, cy - half
    M = np.float32([[N / (2 * half), 0, -x0 * N / (2 * half)], [0, N / (2 * half), -y0 * N / (2 * half)]])
    rgbP = cv2.warpAffine(rgb, M, (N, N), flags=cv2.INTER_AREA, borderValue=(255, 255, 255))
    # the photo's frame: the render's iris circle ↔ the fit's limbus (similarity; the fit pose has no mirror)
    eye = Eye(ref); eye.flow(); al = eye.c["align"]["limbus"]; k = eye.k
    pcx, pcy = al[0] * eye.W, al[1] * eye.H; pr = 0.5 * (al[2] + al[3]) * eye.H
    s = rr / pr                                                       # render px per native px (the render's circle is the limbus edge)
    gn = NA; ys, xs = np.mgrid[0:gn, 0:gn].astype(np.float32) + 0.5
    rx, ry = xs / gn * 2 * half + x0, ys / gn * 2 * half + y0           # canvas px
    cov = cv2.remap(cv2.GaussianBlur(ink.astype(np.float32), (0, 0), 1.0), rx.astype(np.float32), ry.astype(np.float32), cv2.INTER_LINEAR)
    nx, ny = ((rx - cx) / s + pcx).astype(np.float32), ((ry - cy) / s + pcy).astype(np.float32)
    tx, ty, cr = eye.at(eye.tx, nx, ny), eye.at(eye.ty, nx, ny), eye.at(eye.crypt, nx, ny)
    iris = cov > 0.5
    r = np.hypot(nx - eye.pc[0], ny - eye.pc[1]); rp = eye.c['align']['pupil'][2] * eye.H
    pupil = r < rp * 1.02
    # ---- the strand coordinates (iori 2026-11-12: "an uneven growth of the individual strands we generate from the center"),
    # traced once in the photo's own frame (strand_field) and sampled here at the preview's pixels; the same field is written
    # in tissue uv (data/<ref>.strands.png) for the real frame and the edit prints, so the strands keep their identity
    Fs = strand_field(eye)
    u0, sN = Fs(nx, ny)
    # alpha: 0 = not the eye (the page), else 64 + 191 × crypt (crypt floors fill late, under the strands)
    sl = enc(u0, sN, np.where(iris, 64 + 191 * np.clip(cr, 0, 1), 0))
    ids = (u0 * 256) % 1.0; chk = np.dstack([sN * 255, (ids < 0.5) * 200 * iris, np.clip(cr, 0, 1) * 255]).astype(np.uint8)
    cv2.imwrite(os.path.join(HERE, 'printprep', f'{ref}-strands.png'), chk)
    try: tissue_map(ref, eye, Fs)
    except IndexError: print(ref, 'no coordinate map (study/shots/map-<ref>-*.f32.png): no strands.png')
    cv2.imwrite(os.path.join(ENG, 'data', f'{ref}.print.jpg'), rgbP, [cv2.IMWRITE_JPEG_QUALITY, 86])
    cv2.imwrite(os.path.join(ENG, 'data', f'{ref}.print.png'), sl[..., [2, 1, 0, 3]], [cv2.IMWRITE_PNG_COMPRESSION, 9])   # R length, G/B the strand's angle (16 bit), A eye + crypt
    place = {'cx': (cx - W / 2) / H, 'cy': -(cy - H / 2) / H, 'half': half / H, 'captured': [W, H], 'ref': ref}
    json.dump(place, open(os.path.join(ENG, 'data', f'{ref}.print.json'), 'w'), indent=1)
    print(ref, {k_: round(v, 4) if isinstance(v, float) else v for k_, v in place.items()}, sum(os.path.getsize(os.path.join(ENG, 'data', f'{ref}.print.{e}')) for e in ('png', 'jpg')) // 1024, 'KB')

if __name__ == '__main__':
    for r in sys.argv[1:] or ['26', '09', '25', '35']: build(r)
