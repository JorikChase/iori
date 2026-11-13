#!/usr/bin/env python3
"""Cutaway slabs of a field probe: the solid between two tangential (y) positions, meshed closed, so a side view shows the
true section (ground below, ropes and tubes floating). Picks the rows richest in floating rope unless rows are given.
Usage: /usr/bin/python3 slabs.py iris-engine/study/field/raw/<name> [thickness_um=40] [row ...]
Out:   study/field/<name>/slab-<y_um>.ply (1 unit = 1 mm, same frame as mesh.py), slabs.json"""
import json, os, sys, numpy as np
from scipy import ndimage as ndi
from skimage import measure
base = sys.argv[1]; name = os.path.basename(base); th = float(sys.argv[2]) if len(sys.argv) > 2 else 40
M = json.load(open(base + '.json')); N, NZ, st, z0 = M['N'], M['NZ'], M['step'], M['z0']
G = np.fromfile(base + '.ground.f32', np.float32).reshape(N, N, 4); S = np.minimum(np.fromfile(base + '.sdf.f32', np.float32).reshape(NZ, N, N), 1.0)
h, gw = G[..., 0], G[..., 2]; Z = z0 + st * np.arange(NZ); gnd = Z[:, None, None] - h[None]
out = os.path.join(os.path.dirname(os.path.dirname(base)), name); os.makedirs(out, exist_ok=True)
half = int(round(th / 1000 / st / 2))
if len(sys.argv) > 3: rows = [int(a) for a in sys.argv[3:]]
else:
    rope = ((S < 0) & (gnd > st)).any(0) & ndi.binary_dilation(gw > 0.02, iterations=3)
    score = ndi.uniform_filter1d(rope.sum(1).astype(float), 2 * half + 1); rows = []
    for r in np.argsort(score)[::-1]:
        if all(abs(r - q) > 6 * half for q in rows) and half < r < N - half: rows.append(int(r))
        if len(rows) == 2: break
def ply(path, v, f):   # binary PLY, as mesh.py
    with open(path, 'wb') as fo:
        fo.write(f'ply\nformat binary_little_endian 1.0\nelement vertex {len(v)}\nproperty float x\nproperty float y\nproperty float z\nelement face {len(f)}\nproperty list uchar int vertex_indices\nend_header\n'.encode())
        fo.write(v.astype('<f4').tobytes()); ff = np.empty(len(f), dtype=[('n', 'u1'), ('i', '<i4', 3)]); ff['n'] = 3; ff['i'] = f; fo.write(ff.tobytes())
info = []
for r in rows:
    F = np.minimum(gnd, S)[:, r - half:r + half + 1, :].transpose(2, 1, 0)          # [ix, iy, iz]
    F = np.pad(F, 1, constant_values=1.0)
    v, f, _, _ = measure.marching_cubes(F, 0.0, spacing=(st, st, st))
    v = v - st; v[:, 0] -= 0.5 * N * st - 0.5 * st; v[:, 1] += (r - half) * st - 0.5 * N * st + 0.5 * st; v[:, 2] += z0
    y_um = round(((r + 0.5) - 0.5 * N) * st * 1000); p = os.path.join(out, f'slab-{y_um:+d}.ply'); ply(p, v, f[:, ::-1])
    info.append({'row': r, 'y_um': y_um, 'thickness_um': th, 'verts': len(v), 'file': os.path.basename(p)})
json.dump(info, open(os.path.join(out, 'slabs.json'), 'w'), indent=1); print(json.dumps(info))
