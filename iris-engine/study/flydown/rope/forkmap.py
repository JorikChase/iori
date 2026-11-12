#!/usr/bin/env python3
"""Where the ropes fork, top-down, on the CPU (fdRope's rule, without growing the shader): the band weight (data/<eye>.bridge.png,
gw = smoothstep(0.25, 0.6)), the fibre direction phi (data/<eye>.steer.png: phi = ½ atan2), the half-width w from the baked BAND
map (signed distance to the band's edge, + inside) sampled 80 µm either side across the band (dumped by the browser with F._bandAt:
study/shots/rope-band-<eye>.f32.png, 4096×512 float32, uv v 0…1); the crypt map (F._rimAt: rope-sd-<eye>) for the grey. Out: a map (sheet light, crypts dark; ropes coloured by how many run side by side: 1 green, 2 red, 3 yellow, 4 blue, 5+ violet) and the fork spots."""
import numpy as np, cv2, json, sys
eye = sys.argv[1] if len(sys.argv) > 1 else '26'; out = sys.argv[2] if len(sys.argv) > 2 else 'forkmap.jpg'
W, H = 4096, 512
sd = np.fromfile(f'study/shots/rope-sd-{eye}.f32.png', np.float32).reshape(H, W)
bd = np.fromfile(f'study/shots/rope-band-{eye}.f32.png', np.float32).reshape(H, W)
br = cv2.imread(f'data/{eye}.bridge.png', cv2.IMREAD_UNCHANGED).astype(np.float32) / 255
st = cv2.imread(f'data/{eye}.steer.png', cv2.IMREAD_UNCHANGED)[..., [2, 1, 0, 3]].astype(np.float32) / 255   # BGRA -> RGBA
br = cv2.resize(br, (W, H), interpolation=cv2.INTER_LINEAR); st = cv2.resize(st, (W, H), interpolation=cv2.INTER_LINEAR)
ss = lambda e0, e1, x: (lambda t: t * t * (3 - 2 * t))(np.clip((x - e0) / (e1 - e0), 0, 1))
gw = ss(0.25, 0.6, br)
cs = st[..., :2] * 2 - 1; phi = 0.5 * np.arctan2(cs[..., 1], cs[..., 0])
u = (np.arange(W) + 0.5) / W; v = (np.arange(H) + 0.5) / H; U, V = np.meshgrid(u, v)
rr = 2 + 4 * V; acu = np.cos(phi) / (2 * np.pi * rr); acv = -np.sin(phi) / 4
def samp(uu, vv):
    x = (uu % 1.0) * W - 0.5; y = np.clip(vv * H - 0.5, 0, H - 1)
    return cv2.remap(bd, x.astype(np.float32), y.astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_WRAP)
dl = 0.08
sA = samp(U + acu * dl, V + acv * dl); sB = samp(U - acu * dl, V - acv * dl)
w = np.maximum(0.5 * (sA + sB) + dl, 0.006) * 1000; x = 0.5 * (sB - sA) * 1000      # µm
Rv = np.minimum(w, 28.0); f = w / Rv
fork = ss(1.3, 2.2, f)
rope = (gw > 0.05) & (np.abs(x) < w + 10)
# floating only where crypt floor lies on BOTH sides across the band (the renderer's fdGround, 60–560 µm each way); the crypt map
# stands in for its height test (inside a crypt: sd < −20 µm). Elsewhere the band stays ground and the rope is buried in it
def csamp(uu, vv):
    xx = (uu % 1.0) * W - 0.5; yy = np.clip(vv * H - 0.5, 0, H - 1)
    return cv2.remap(sd, xx.astype(np.float32), yy.astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_WRAP)
hitA = np.zeros_like(sd, bool); hitB = np.zeros_like(sd, bool)
for d in (0.06, 0.12, 0.2, 0.3, 0.42, 0.56):
    hitA |= csamp(U + acu * d, V + acv * d) < -0.02; hitB |= csamp(U - acu * d, V - acv * d) < -0.02
floating = hitA & hitB
rope_all = rope; rope = rope & floating
Rs = Rv * (1 - 0.25 * fork); a = np.maximum(w - Rs, 0); P = 3.2 * Rv
inner = np.where(a >= 0.8 * P, 2 * np.floor((a - 0.8 * P) / P) + 1, 0)
count = np.where(fork < 0.5, 1, 2 + inner).astype(int)
base = np.clip(0.55 + sd * 2.5, 0.08, 0.85); img = np.dstack([base] * 3) * 255
pal = {1: (90, 200, 90), 2: (40, 40, 235), 3: (60, 210, 230), 4: (220, 140, 60), 5: (220, 90, 200)}
for c, col in pal.items(): m = rope & (np.minimum(count, 5) == c); img[m] = 0.35 * img[m] + 0.65 * np.array(col)
m0 = rope_all & ~rope; img[m0] = 0.7 * img[m0] + 0.3 * np.array((0, 0, 0))
img = img.astype(np.uint8)
# fork spots: forked rope pixels, clustered
m = (rope & (count >= 3) & (np.abs(x) < 20)).astype(np.uint8); n, lab, stats, cen = cv2.connectedComponentsWithStats(m, 8)
spots = sorted([dict(u=float(cen[i][0] / W), v=float(cen[i][1] / H), px=int(stats[i][4])) for i in range(1, n)], key=lambda s: -s['px'])
stats_ = {'band px': int(rope_all.sum()), 'floating px': int(rope.sum())}; stats_.update({f'{c} ropes': int((rope & (np.minimum(count, 5) == c)).sum()) for c in pal})
json.dump({'share': stats_, 'spots': spots[:20]}, open(out.replace('.jpg', '.json'), 'w'), indent=1)
for s in spots[:8]: cv2.circle(img, (int(s['u'] * W), int(s['v'] * H)), 14, (255, 255, 255), 2)
cv2.imwrite(out, img, [cv2.IMWRITE_JPEG_QUALITY, 88]); print(stats_, spots[:8])
