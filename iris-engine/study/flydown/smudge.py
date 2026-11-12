#!/usr/bin/env python3
"""Base-texture smudge (iori, 2026-11-11): the photograph's own grain, grown / smudged a little along the vector fields so
its noise pixels stop standing out on the base texture and read as fibre. Offline, CPU, on the native photo.

Only the photo's FINE residual is touched (the bands below SIG native px: the grain); the base below it is kept, so no
structure moves. Each method returns a new residual; the view is base + mix(R, R', strength), with R' rescaled to R's
local rms so the texture keeps its contrast and only changes its grain direction.

  none     today
  lic-a    line integral convolution (Cabral & Leedom 1993) along OUR anatomy: the fitted strand tangent (curves'
           structure tensor), streamlines integrated through the field, Gaussian weights, length L µm
  lic-i    the same along the IMAGE's own structure tensor (what generic filters do) — the comparison
  ced      coherence-enhancing diffusion (Weickert 1999) of the residual with the anatomy tensor: diffuses along the
           strand, barely across, n explicit steps
  aniso    straight anisotropic Gaussian along the tangent (σ_along = L/2, σ_across small) — LIC without curvature
  regrow   the grain re-grown, not blurred: oriented Gabor-like noise (Lagae 2009) whose phase is demodulated from R
           (as rig.alg_erosion's octave 0), so the grain becomes strands that keep the photo's own positions
All are weighted by the measured coherence (a strong field smudges more; the isotropic sheet keeps more of its grain)
and stopped at crypt walls (the relief slope) so nothing smears across an edge.

/usr/bin/python3 smudge.py            → smudge/sheet-<spot>.jpg, smudge/<spot>-<method>-sweep.mp4, smudge/measure.json"""
import os, sys, json, subprocess, numpy as np, cv2
from PIL import Image
from rig import Eye, lin2srgb, hash3
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, 'smudge'); os.makedirs(OUT, exist_ok=True)
SIG = 1.2                                     # native px: the residual = the bands finer than this (the grain)
SPOTS = {'26-crypt-lip': ('26', 1185, 1965), '26-sheet': ('26', 1965, 705), '35-strands': ('35', 1920, 600), '09-crypts': ('09', 2610, 1680)}
HALF = 200                                    # native px half-size of the crop

def crop_fields(eye, cx, cy, h=HALF):
    sl = (slice(cy - h, cy + h), slice(cx - h, cx + h))
    L = eye.lin[sl].astype(np.float32)
    logY = np.log(np.maximum(L @ np.array([0.2126, 0.7152, 0.0722], np.float32), 1e-4))
    base = cv2.GaussianBlur(logY, (0, 0), SIG); R = logY - base
    f = {k: getattr(eye, k)[sl].astype(np.float32) for k in ('tx', 'ty', 'coh', 'crypt', 'gx', 'gy')}
    return L, logY, base, R, f

def image_tensor(img, s=2.0):
    gx = cv2.Sobel(img, cv2.CV_32F, 1, 0, ksize=3); gy = cv2.Sobel(img, cv2.CV_32F, 0, 1, ksize=3)
    J11, J22, J12 = [cv2.GaussianBlur(a, (0, 0), s) for a in (gx * gx, gy * gy, gx * gy)]
    th = 0.5 * np.arctan2(2 * J12, J11 - J22) + np.pi / 2                 # the tangent: across the gradient
    lam = np.sqrt((J11 - J22) ** 2 + 4 * J12 ** 2); coh = lam / (J11 + J22 + 1e-9)
    return np.cos(th).astype(np.float32), np.sin(th).astype(np.float32), np.clip(coh, 0, 1).astype(np.float32)

def lic(R, tx, ty, Lpx, step=0.5):
    """streamlines both ways through the (axis) field, sign-consistent stepping; Gaussian weights over length Lpx"""
    H, W = R.shape; ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
    acc = R.copy(); wsum = np.ones_like(R); n = int(Lpx / step)
    sig = max(Lpx / 2.5, 1e-3)
    for sgn in (1, -1):
        px, py = xs.copy(), ys.copy(); dx0 = tx * sgn; dy0 = ty * sgn
        for k in range(1, n + 1):
            vx = cv2.remap(tx, px, py, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT); vy = cv2.remap(ty, px, py, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
            flip = np.where(vx * dx0 + vy * dy0 < 0, -1.0, 1.0).astype(np.float32); vx *= flip; vy *= flip; dx0, dy0 = vx, vy
            px = px + vx * step; py = py + vy * step
            w = np.exp(-0.5 * (k * step / sig) ** 2)
            acc += w * cv2.remap(R, px, py, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT); wsum += w
    return acc / wsum

def aniso(R, tx, ty, Lpx, across=0.35):
    """per-pixel oriented Gaussian, approximated by 8 orientation-binned anisotropic kernels blended by angle"""
    th = np.arctan2(ty, tx) % np.pi; out = np.zeros_like(R); wt = np.zeros_like(R); K = 8
    for k in range(K):
        a = k * np.pi / K; sa, sc = max(Lpx / 2, 0.5), across
        r = int(np.ceil(3 * sa)); yy, xx = np.mgrid[-r:r + 1, -r:r + 1].astype(np.float32)
        u = xx * np.cos(a) + yy * np.sin(a); v = -xx * np.sin(a) + yy * np.cos(a)
        ker = np.exp(-0.5 * ((u / sa) ** 2 + (v / sc) ** 2)); ker /= ker.sum()
        f = cv2.filter2D(R, -1, ker, borderType=cv2.BORDER_REFLECT)
        d = np.abs(((th - a + np.pi / 2) % np.pi) - np.pi / 2); w = np.clip(1 - d / (np.pi / K), 0, 1)
        out += w * f; wt += w
    return out / np.maximum(wt, 1e-6)

def ced(R, tx, ty, iters=20, dt=0.2, along=1.0, across=0.02):
    """explicit anisotropic diffusion with a fixed tensor D = along·t tᵀ + across·n nᵀ (the anatomy's, not the image's)"""
    a = along * tx * tx + across * ty * ty; b = (along - across) * tx * ty; c = along * ty * ty + across * tx * tx
    u = R.copy()
    for _ in range(iters):
        ux = (np.roll(u, -1, 1) - np.roll(u, 1, 1)) / 2; uy = (np.roll(u, -1, 0) - np.roll(u, 1, 0)) / 2
        jx, jy = a * ux + b * uy, b * ux + c * uy
        u = u + dt * ((np.roll(jx, -1, 1) - np.roll(jx, 1, 1)) / 2 + (np.roll(jy, -1, 0) - np.roll(jy, 1, 0)) / 2)
    return u

def regrow(R, tx, ty, lam=2.0, Lc=3.0):
    """oriented stripes across the tangent at wavelength lam px, phase demodulated from R per 3×3-px cell (the seed)"""
    H, W = R.shape; ys, xs = np.mgrid[0:H, 0:W].astype(np.float32); nx, ny = -ty, tx
    Z = np.zeros((H, W), np.complex64); c = Lc
    cx0, cy0 = np.floor(xs / c), np.floor(ys / c)
    for oy in (-1, 0, 1):
        for ox in (-1, 0, 1):
            ix, iy = cx0 + ox, cy0 + oy
            qx, qy = (ix + 0.5) * c, (iy + 0.5) * c
            # demodulate R across the local normal round the pivot
            acc = np.zeros((H, W), np.complex64)
            for s in (-2, -1, 0, 1, 2):
                sx, sy = qx + s * 0.5 * lam * nx, qy + s * 0.5 * lam * ny
                acc += cv2.remap(R, sx.astype(np.float32), sy.astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT) * np.exp(-1j * 2 * np.pi * s * 0.5)
            ph = np.angle(acc)
            dx, dy = xs - qx, ys - qy; w = np.exp(-(dx * dx + dy * dy) / (c * c) * 1.2)
            Z += w * np.exp(1j * (2 * np.pi * (dx * nx + dy * ny) / lam + ph))
    return np.real(Z).astype(np.float32)

def rms_match(Rn, R, s=6):
    """rescale Rn to R's local rms (the texture keeps its contrast, only the grain changes direction)"""
    e0 = np.sqrt(cv2.GaussianBlur(R * R, (0, 0), s)); e1 = np.sqrt(cv2.GaussianBlur(Rn * Rn, (0, 0), s))
    return Rn * e0 / np.maximum(e1, 1e-6)

def method(name, R, f, Lpx):
    if name == 'none': return R
    if name == 'lic-a': return lic(R, f['tx'], f['ty'], Lpx)
    if name == 'lic-i': tx, ty, _ = image_tensor(R + 0 * R, 2.0); return lic(R, tx, ty, Lpx)
    if name == 'ced': return ced(R, f['tx'], f['ty'], iters=int(6 * Lpx))
    if name == 'aniso': return aniso(R, f['tx'], f['ty'], Lpx)
    if name == 'regrow': return regrow(R, f['tx'], f['ty'])
    raise ValueError(name)

def compose(base, R, Rm, f, L, strength):
    """view = base + mix(R, R', w); w = strength × (0.35 + 0.65·coherence) × (1 − wall), colour from the photo's chroma"""
    wall = np.clip(np.hypot(f['gx'], f['gy']) * 2, 0, 1)
    w = strength * (0.35 + 0.65 * f['coh']) * (1 - 0.8 * wall)
    logY = base + R * (1 - w) + rms_match(Rm, R) * w
    Y0 = np.maximum(L @ np.array([0.2126, 0.7152, 0.0722], np.float32), 1e-4)
    rgb = L * (np.exp(logY) / Y0)[..., None]
    return lin2srgb(np.clip(rgb, 0, 1))

def zoomed(img, z, N=320):
    h = img.shape[0] // 2; r = N / (2 * z)
    c = img[int(h - r):int(h + r), int(h - r):int(h + r)]
    return cv2.resize(c, (N, N), interpolation=cv2.INTER_CUBIC if z > 1 else cv2.INTER_AREA)

def measure(R, Rs, f):
    """directional share of the grain (structure-tensor coherence of the residual), its orientation error against the
    anatomy tangent, how much of the photo's own residual survives (corr), energy kept"""
    tx, ty, coh = image_tensor(Rs, 3.0); m = f['coh'] > 0.3
    err = np.degrees(np.arccos(np.clip(np.abs(tx * f['tx'] + ty * f['ty']), 0, 1)))
    return {'dirShare': round(float(coh.mean()), 3), 'orientErr': round(float(np.median(err[m])) if m.any() else -1, 1),
            'corrToPhoto': round(float(np.corrcoef(R.ravel(), Rs.ravel())[0, 1]), 3), 'energy': round(float(Rs.std() / R.std()), 3)}

METHODS = ['none', 'lic-a', 'lic-i', 'ced', 'aniso', 'regrow']
TITLES = {'none': 'today: the photo grain as it is', 'lic-a': 'LIC along the fitted anatomy', 'lic-i': "LIC along the image's own tensor",
          'ced': 'coherence-enhancing diffusion (anatomy tensor)', 'aniso': 'straight anisotropic Gaussian', 'regrow': 'grain re-grown as oriented phasor noise'}

def to_mp4(gif):
    """sequences are kept as MP4 (≈ 1/30 of the GIF)"""
    mp4 = gif[:-4] + '.mp4'
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', gif, '-movflags', '+faststart', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-crf', '20', mp4], check=True)
    os.remove(gif)

def label(img, t):
    o = img.copy(); cv2.rectangle(o, (0, 0), (o.shape[1], 20), (0, 0, 0), -1)
    cv2.putText(o, t, (6, 15), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA); return o

def run(spot, Lum=14.0, strength=0.8):
    ref, cx, cy = SPOTS[spot]; eye = Eye(ref); L, logY, base, R, f = crop_fields(eye, cx, cy)
    Lpx = Lum / eye.UM; res = {}; rows = []; outs = {}
    for m in METHODS:
        Rm = method(m, R, f, Lpx); outs[m] = Rm
        img = compose(base, R, Rm, f, L, 0.0 if m == 'none' else strength)
        u8 = (img[..., ::-1] * 255 + 0.5).astype(np.uint8)
        wall = np.clip(np.hypot(f['gx'], f['gy']) * 2, 0, 1); w = (0.0 if m == 'none' else strength) * (0.35 + 0.65 * f['coh']) * (1 - 0.8 * wall)
        res[m] = measure(R, R * (1 - w) + rms_match(Rm, R) * w, f)
        tiles = [label(zoomed(u8, z), f'x{z}  {eye.UM / z:.2f} um/px') for z in (1, 2, 4)]
        rn = np.clip(128 + 60 * (R * (1 - w) + rms_match(Rm, R) * w) / (R.std() * 2.5), 0, 255).astype(np.uint8)
        tiles.append(label(cv2.cvtColor(zoomed(rn, 2), cv2.COLOR_GRAY2BGR), 'the grain alone, x2'))
        row = np.concatenate([np.pad(t, ((0, 3), (0, 3), (0, 0))) for t in tiles], 1)
        head = np.zeros((26, row.shape[1], 3), np.uint8)
        cv2.putText(head, f"{TITLES[m]}   dir {res[m]['dirShare']}  orient {res[m]['orientErr']} deg  corr {res[m]['corrToPhoto']}", (8, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (120, 230, 255), 1, cv2.LINE_AA)
        rows.append(np.concatenate([head, row], 0))
    sheet = np.concatenate(rows, 0)
    top = np.zeros((34, sheet.shape[1], 3), np.uint8)
    cv2.putText(top, f'eye {ref} {spot} - grain below {SIG} px smudged along the field: L = {Lum:.0f} um, strength {strength}, weighted by coherence, stopped at crypt walls', (8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (255, 255, 255), 1, cv2.LINE_AA)
    cv2.imwrite(os.path.join(OUT, f'sheet-{spot}.jpg'), np.concatenate([top, sheet], 0), [cv2.IMWRITE_JPEG_QUALITY, 90])
    # sequences: strength 0 → 1 → 0 for the anatomy LIC and the regrowth, at x4; and a length sweep for LIC
    for m in ('lic-a', 'regrow', 'ced'):
        fr = []
        for s in list(np.linspace(0, 1, 16)) + list(np.linspace(1, 0, 16)):
            img = compose(base, R, outs[m], f, L, float(s)); u8 = (img[..., ::-1] * 255 + 0.5).astype(np.uint8)
            fr.append(Image.fromarray(label(zoomed(u8, 4, 400), f'{TITLES[m]}  strength {s:.2f}')[..., ::-1]))
        g = os.path.join(OUT, f'{spot}-{m}-sweep.gif'); fr[0].save(g, save_all=True, append_images=fr[1:], duration=90, loop=0); to_mp4(g)
    fr = []
    for Lu in (0, 3, 6, 10, 14, 20, 28, 40, 28, 20, 14, 10, 6, 3):
        Rm = lic(R, f['tx'], f['ty'], max(Lu, 0.01) / eye.UM) if Lu else R
        img = compose(base, R, Rm, f, L, strength if Lu else 0.0); u8 = (img[..., ::-1] * 255 + 0.5).astype(np.uint8)
        fr.append(Image.fromarray(label(zoomed(u8, 4, 400), f'LIC along the anatomy, length {Lu} um')[..., ::-1]))
    g = os.path.join(OUT, f'{spot}-lic-length.gif'); fr[0].save(g, save_all=True, append_images=fr[1:], duration=160, loop=0); to_mp4(g)
    return res

if __name__ == '__main__':
    spots = sys.argv[1:] or list(SPOTS); allres = {}
    for s in spots:
        allres[s] = run(s); print(s, json.dumps(allres[s]))
    json.dump(allres, open(os.path.join(OUT, 'measure.json'), 'w'), indent=1)

def export(spot, dst):
    """the live figure's inputs (papers/iris): the photo crop (sRGB PNG) and the anatomy field (RGBA PNG:
    R,G = ½ + ½·(cos 2θ, sin 2θ) of the strand tangent, B = coherence, A = 1 − crypt-wall slope)"""
    ref, cx, cy = SPOTS[spot]; eye = Eye(ref); L, logY, base, R, f = crop_fields(eye, cx, cy)
    os.makedirs(dst, exist_ok=True)
    cv2.imwrite(os.path.join(dst, f'{spot}-rgb.png'), (lin2srgb(L)[..., ::-1] * 255 + 0.5).astype(np.uint8))
    th = np.arctan2(f['ty'], f['tx']); wall = np.clip(np.hypot(f['gx'], f['gy']) * 2, 0, 1)
    fld = np.dstack([0.5 + 0.5 * np.cos(2 * th), 0.5 + 0.5 * np.sin(2 * th), f['coh'], 1 - wall])
    cv2.imwrite(os.path.join(dst, f'{spot}-field.png'), (np.clip(fld, 0, 1)[..., [2, 1, 0, 3]] * 255 + 0.5).astype(np.uint8))
    return {'spot': spot, 'ref': ref, 'um': eye.UM, 'size': 2 * HALF}
