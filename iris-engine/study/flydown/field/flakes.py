#!/usr/bin/env python3
"""Which rule made each free piece of the strand solid (a piece touching neither the ground nor the main body).
Needs a probe saved with kind (FP.run(name, {..., kind: true})). kind = flydown.js g_fdSdK at the nearest surface:
1 crypt tube (fdTube's SDF), 2–3.5 rope (fdRope; 3.5 = its underside), 5 rim lip.
Usage: /usr/bin/python3 flakes.py iris-engine/study/field/raw/<name> [--json out.json]"""
import json, sys, numpy as np
from scipy import ndimage as ndi
base = sys.argv[1]
M = json.load(open(base + '.json')); N, NZ, st, z0 = M['N'], M['NZ'], M['step'], M['z0']
G = np.fromfile(base + '.ground.f32', np.float32).reshape(N, N, 4)
S = np.fromfile(base + '.sdf.f32', np.float32).reshape(NZ, N, N); K = np.fromfile(base + '.kind.f32', np.float32).reshape(NZ, N, N)
h, hraw, gw, gap = G[..., 0], G[..., 1], G[..., 2], G[..., 3]
Z = z0 + st * np.arange(NZ); gnd = Z[:, None, None] - h[None]
ss = S < 0
lab, n = ndi.label(ss)
touch = set(np.unique(lab[ss & ndi.binary_dilation(gnd <= 0)]).tolist()) - {0}
sz = np.bincount(lab.ravel(), minlength=n + 1)
objs = ndi.find_objects(lab)
rows = []
for i in range(1, n + 1):
    if i in touch: continue
    sl = objs[i - 1]; m = lab[sl] == i; k = K[sl][m]
    zz, yy, xx = np.nonzero(m); zz = zz + sl[0].start; yy = yy + sl[1].start; xx = xx + sl[2].start
    kind = 'tube' if np.median(k) < 1.5 else ('lip' if np.median(k) > 4.5 else 'rope')
    rows.append({'id': i, 'vox': int(sz[i]), 'um3': round(float(sz[i] * (st * 1000) ** 3)), 'kind': kind, 'k_med': round(float(np.median(k)), 2),
                 'gw_med': round(float(np.median(gw[yy, xx])), 2), 'gap_med': round(float(np.median(gap[yy, xx])), 2),
                 'clear_um': round(float(np.median((Z[zz] - h[yy, xx]) * 1000)), 1), 'below_top_um': round(float(np.median((hraw[yy, xx] - Z[zz]) * 1000)), 1),
                 'xy_um': [round(float((xx.mean() + 0.5 - N / 2) * st * 1000)), round(float((yy.mean() + 0.5 - N / 2) * st * 1000))],
                 'extent_um': [int((np.ptp(xx) + 1) * st * 1000), int((np.ptp(yy) + 1) * st * 1000), int((np.ptp(zz) + 1) * st * 1000)]})
by = {}
for r in rows: b = by.setdefault(r['kind'], {'n': 0, 'um3': 0}); b['n'] += 1; b['um3'] += r['um3']
out = {'pieces': n, 'touching': len(touch), 'free': len(rows), 'by_kind': by, 'largest': sorted(rows, key=lambda r: -r['vox'])[:12]}
print(json.dumps(out, indent=1))
if '--json' in sys.argv: json.dump({'summary': out, 'all': rows}, open(sys.argv[sys.argv.index('--json') + 1], 'w'), indent=1)
