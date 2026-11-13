#!/usr/bin/env python3
"""The fly-down's field probe (flydown.js F.probeField, saved by tools/flydown/fieldprobe.js) → meshes + sanity numbers.
In:  <raw>.json / .ground.f32 / .sdf.f32 (study/field/raw/<name>)
Out: study/field/<name>/  ground.ply, strands.ply, all.ply (marching cubes, 1 unit = 1 mm, z up = hp), stats.json

The solid is what the renderer's march hits: below the march's ground h(x, y), or inside the strands' SDF.
  ropes       the strand solid that floats (above the ground). Width across the rope from its 2-D footprint (2 × the distance to
              the footprint's edge on its medial axis), height from the voxel column; mid-span vs the ends by the geodesic distance
              along the footprint from where the band still sits on the sheet (its ends)
  flakes      connected pieces of the solid (6-connected voxels) apart from the main body, by size
  comb fins   on the crypt walls: a horizontal slice through each wall's middle; what an opening with a disc of radius r removes are
              fins thinner than 2r. Counted, and their share of the wall band's area; plus the wall's high-pass roughness (RMS)
Usage: /usr/bin/python3 mesh.py iris-engine/study/field/raw/crypt26a   (needs numpy, scipy, scikit-image)"""
import json, os, sys, numpy as np
from scipy import ndimage as ndi
from skimage import measure, morphology, graph

base = sys.argv[1]; name = os.path.basename(base)
M = json.load(open(base + '.json')); N, NZ, st, z0 = M['N'], M['NZ'], M['step'], M['z0']
G = np.fromfile(base + '.ground.f32', np.float32).reshape(N, N, 4)          # [iy, ix, (h, raw h, band weight, gap + 2 rimW)]
S = np.fromfile(base + '.sdf.f32', np.float32).reshape(NZ, N, N)           # [iz, iy, ix] mm
out = os.path.join(os.path.dirname(os.path.dirname(base)), name); os.makedirs(out, exist_ok=True)
h, hraw, gw = G[..., 0], G[..., 1], G[..., 2]
Z = z0 + st * np.arange(NZ)                                                   # layer heights (hp, mm)
gnd = Z[:, None, None] - h[None]                                             # > 0 above the ground
S = np.minimum(S, 1.0)

def ply(path, v, f):
    with open(path, 'wb') as fo:
        fo.write(f'ply\nformat binary_little_endian 1.0\nelement vertex {len(v)}\nproperty float x\nproperty float y\nproperty float z\nelement face {len(f)}\nproperty list uchar int vertex_indices\nend_header\n'.encode())
        fo.write(v.astype('<f4').tobytes())
        ff = np.empty(len(f), dtype=[('n', 'u1'), ('i', '<i4', 3)]); ff['n'] = 3; ff['i'] = f; fo.write(ff.tobytes())

def mc(field, path):
    """marching cubes of the 0-level (solid < 0), closed at the box's faces; vertices in mm, x radial, y tangential, z = hp"""
    F = np.pad(field.transpose(2, 1, 0), 1, constant_values=1.0)          # → [ix, iy, iz]
    F[:, :, 0] = np.where(F[:, :, 1] < 0, 1.0, 1.0)                         # an open bottom face is closed by the pad
    v, f, _, _ = measure.marching_cubes(F, 0.0, spacing=(st, st, st))
    v = v - st; v[:, 0] -= 0.5 * N * st - 0.5 * st; v[:, 1] -= 0.5 * N * st - 0.5 * st; v[:, 2] += z0
    ply(path, v, f[:, ::-1]); return len(v), len(f)

stats = {'name': name, 'eye': M['eye'], 'uv': M['uv'], 'box_mm': [N * st, N * st, NZ * st], 'step_um': st * 1000, 'level': M['level'], 'flags': M['flags'], 'probe_ms': M['ms']}
stats['mesh'] = {'ground': mc(gnd, os.path.join(out, 'ground.ply')), 'strands': mc(S, os.path.join(out, 'strands.ply')), 'all': mc(np.minimum(gnd, S), os.path.join(out, 'all.ply'))}

# ---- ropes
solid_s = S < 0
float_ = solid_s & (gnd > st)                                                  # strand solid clear of the ground
foot_all = float_.any(0)
band = ndi.binary_dilation(gw > 0.02, iterations=3)                            # a band's columns: its rope (fdRope); elsewhere the crypts' fine tubes (fdTube)
foot = foot_all & band                                                         # the ropes' footprint
tubes = foot_all & ~band
land = foot & (hraw - h < 0.010)                                               # the rope's ends: where the band still sits on the sheet (its ground not dropped)
fl_len = float_.sum(0) * st * 1000                                             # µm of floating strand per column (vertical)
if foot.any():
    W = ndi.distance_transform_edt(foot) * st * 1000                          # µm to the footprint's edge
    sk = morphology.skeletonize(foot)
    cost = np.where(foot | land, 1.0, np.inf)
    seeds = np.argwhere(land & foot) if (land & foot).any() else np.argwhere(land)
    if len(seeds):
        D, _ = graph.MCP_Geometric(cost).find_costs(seeds); D = D * st * 1000   # µm along the footprint from the nearest landing
    else: D = np.full(foot.shape, np.inf)
    ax = sk & np.isfinite(D) & (W > 2.5)
    end = ax & (D < 30); mid = ax & (D > 80)
    def q(a): return None if a.size == 0 else {k: round(float(np.percentile(a, p)), 1) for k, p in (('p10', 10), ('median', 50), ('p90', 90))} | {'n': int(a.size)}
    tl = fl_len[tubes]; tw = 2 * ndi.distance_transform_edt(tubes)[morphology.skeletonize(tubes)] * st * 1000
    stats['crypt_tubes'] = {'footprint_mm2': round(float(tubes.sum() * st * st), 4), 'width_um': q(tw), 'height_um': q(tl)}
    stats['ropes'] = {
        'footprint_mm2': round(float(foot.sum() * st * st), 4),
        'width_um_mid': q(2 * W[mid]), 'width_um_end': q(2 * W[end]),
        'height_um_mid': q(fl_len[mid]), 'height_um_end': q(fl_len[end]),
        'note': 'width = 2 x distance to the footprint edge on its medial axis; height = floating solid in the column; end: < 30 um from where the band still sits on the sheet (ground dropped < 10 um), geodesic along the footprint; mid: > 80 um'}
    stats['ropes']['mid_over_end_width'] = round(stats['ropes']['width_um_mid']['median'] / stats['ropes']['width_um_end']['median'], 2) if mid.any() and end.any() else None
    np.save(os.path.join(out, 'rope_maps.npy'), np.stack([foot.astype(np.float32), W, np.where(np.isfinite(D), D, -1), fl_len]))

# ---- the taper by distance to the band's end (the band map's G; needs a probe saved with kind, which writes .col.f32)
if os.path.exists(base + '.col.f32') and foot.any():
    e = np.fromfile(base + '.col.f32', np.float32).reshape(N, N, 4)[..., 0] * 1000
    skt = morphology.skeletonize(foot) & (W > 2.5); tp = {}
    for lo, hi in ((0, 40), (40, 90), (90, 150), (150, 400)):
        m = skt & (e >= lo) & (e < hi)
        if m.any(): tp[f'{lo}-{hi}um'] = {'n': int(m.sum()), 'width_um': round(float(np.median(2 * W[m])), 1), 'float_height_um': round(float(np.median(fl_len[m])), 1)}
    stats['rope_taper_by_end_distance'] = tp
# ---- flakes (the whole solid; 6-connected)
solid = solid_s | (gnd <= 0)
lab, n = ndi.label(solid)
sz = np.bincount(lab.ravel())[1:]
big = int(np.argmax(sz)) + 1 if n else 0
rest = np.sort(sz[np.arange(1, n + 1) != big])[::-1] if n else np.array([])
vox_um3 = (st * 1000) ** 3
stats['flakes'] = {'components': int(n), 'main_voxels': int(sz.max()) if n else 0, 'others': int(len(rest)),
                   'others_by_size_um3': {'<1e3': int((rest * vox_um3 < 1e3).sum()), '1e3-1e4': int(((rest * vox_um3 >= 1e3) & (rest * vox_um3 < 1e4)).sum()),
                                          '1e4-1e5': int(((rest * vox_um3 >= 1e4) & (rest * vox_um3 < 1e5)).sum()), '>=1e5': int((rest * vox_um3 >= 1e5).sum())},
                   'largest_others_um3': [round(float(x * vox_um3)) for x in rest[:8]]}
# strand pieces that touch nothing (floating free in the field)
lab_s, ns = ndi.label(solid_s)
touch = np.unique(lab_s[solid_s & ndi.binary_dilation(gnd <= 0)])
stats['flakes']['strand_pieces'] = int(ns); stats['flakes']['strand_pieces_free'] = int(ns - len(touch[touch > 0]))

# ---- comb fins on the crypt walls (the height map's cliffs)
gy, gx = np.gradient(h, st)
slope = np.hypot(gx, gy)
wall = (slope > 1.5) & (gw < 0.05)                                             # steep, and not a band's healed ground
hs = ndi.gaussian_filter(h, 4)                                                 # σ 8 µm
rough = (h - hs)[wall] * 1000
fins = {}
if wall.any():
    lab_w, nw = ndi.label(ndi.binary_dilation(wall, iterations=2))
    walls = []
    for k in range(1, nw + 1):
        m = lab_w == k
        if m.sum() < 200: continue
        top, bot = np.percentile(hraw[m], 90), np.percentile(hraw[m], 10)
        if top - bot < 0.03: continue
        walls.append(((top + bot) / 2, m))
    for r in (1, 2, 3):                                                       # disc radius in voxels: fins thinner than 2r voxels
        cnt, area, band = 0, 0, 0
        for zc, m in walls:
            sl = h > zc                                                        # the slice through the wall's middle: solid where the ground is above
            band_m = ndi.binary_dilation(m, iterations=6)
            op = morphology.binary_opening(sl, morphology.disk(r))
            rem = sl & ~op & band_m
            l2, n2 = ndi.label(rem); s2 = np.bincount(l2.ravel())[1:]
            cnt += int((s2 >= 3).sum()); area += int(rem.sum()); band += int((sl & band_m).sum())
        fins[f'thinner_than_{2 * r * st * 1000:.0f}um'] = {'count': cnt, 'area_share_of_wall_band': round(area / max(band, 1), 4)}
    perim = []
    for zc, m in walls:
        sl = (h > zc); sm = ndi.gaussian_filter(sl.astype(float), 4) > 0.5
        bm = ndi.binary_dilation(m, iterations=6)
        p_raw = measure.perimeter(sl & bm); p_sm = measure.perimeter(sm & bm)
        if p_sm > 0: perim.append(p_raw / p_sm)
    stats['comb_fins'] = {'walls': len(walls), 'wall_px': int(wall.sum()), 'roughness_rms_um': round(float(np.sqrt(np.mean(rough ** 2))), 2),
                          'roughness_p95_um': round(float(np.percentile(np.abs(rough), 95)), 2), 'fins': fins,
                          'contour_tortuosity_median': round(float(np.median(perim)), 3) if perim else None,
                          'note': 'walls: slope > 1.5, outside bands, >= 30 um tall; fins: what an opening by a disc removes from the mid-wall slice; roughness: h minus h blurred at sigma 8 um, on wall pixels; tortuosity: mid-wall contour length raw / smoothed (sigma 8 um)'}
json.dump(stats, open(os.path.join(out, 'stats.json'), 'w'), indent=1)
print(json.dumps(stats, indent=1))
