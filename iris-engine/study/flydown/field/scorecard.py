#!/usr/bin/env python3
"""Landscape analysis step 2: the fly-down's field (probe boxes, tools/flydown/fieldprobe.js) against the anatomy references
(study/flydown/ref/README.md: photo measurements, ±15 %; Tan et al. 2025 for crypt areas).
Usage: /usr/bin/python3 scorecard.py <out.json> raw/<box> [raw/<box> ...]   (each box saved with kind + col)
Per box, then pooled per eye and overall:
  rope thickness  the rope's width across (2 x distance to its footprint's edge, on its medial axis) and its floating height,
                  mid-span (> 150 um from the band's end, the band map's G) and at the ends (< 40 um)        ref 40-60 / 80-120 um
  rope spacing    centre-to-centre distance from each rope to its nearest neighbour rope (ropes = footprint pieces >= 60 um long)
                                                                                                              ref 150-250 um (ladder rungs)
  crypt area      every crypt of the eye from the baked crypt map (FP.crypts -> raw/crypts-<eye>.json), not touching
                  the map's inner or outer edge; this is the layer model's measurement of the photo, shown for scale  ref 0.015-0.3 mm2
  faults          visible free strand pieces (>= 1000 um3, not touching the ground), wall fins thinner than 8 um per mm of wall"""
import json, os, sys, numpy as np
from scipy import ndimage as ndi
from skimage import morphology, measure

REF = {'rope_mid_um': (40, 60), 'rope_end_um': (80, 120), 'end_over_mid': (1.6, 2.4), 'spacing_um': (150, 250), 'crypt_mm2': (0.015, 0.3)}

def box(base):
    M = json.load(open(base + '.json')); N, NZ, st, z0 = M['N'], M['NZ'], M['step'], M['z0']; um = st * 1000
    G = np.fromfile(base + '.ground.f32', np.float32).reshape(N, N, 4); S = np.fromfile(base + '.sdf.f32', np.float32).reshape(NZ, N, N)
    C = np.fromfile(base + '.col.f32', np.float32).reshape(N, N, 4); e = C[..., 0] * 1000
    h, hraw, gw = G[..., 0], G[..., 1], G[..., 2]; Z = z0 + st * np.arange(NZ); gnd = Z[:, None, None] - h[None]
    band = ndi.binary_dilation(gw > 0.02, iterations=3); ss = S < 0
    fl = ss & (gnd > st) & band[None]; foot = fl.any(0); H = fl.sum(0) * um
    W = ndi.distance_transform_edt(foot) * um; sk = morphology.skeletonize(foot) & (W > 2.5)
    def med(a): return round(float(np.median(a)), 1) if a.size else None
    # rope CORES: per column the longest vertical run of floating rope solid; runs of 20 um and more are rope (the loose fibres
    # between ropes are at most 18 um, the reference's fine fibres <= 20-25 um)
    run = np.zeros((N, N)); cur = np.zeros((N, N))
    for z in range(NZ): cur = np.where(fl[z], cur + 1, 0); run = np.maximum(run, cur)
    run *= um; core = run >= 20
    mid, end = sk & (e >= 150), sk & (e < 40)
    cm, ce = core & (e >= 150), core & (e < 40)
    r = {'box': os.path.basename(base), 'eye': M['eye'], 'uv': M['uv'], 'size_mm': round(N * st, 2), 'core_mid_um': med(run[cm]), 'core_end_um': med(run[ce]), 'core_share_mid': round(float(cm.sum() / max(1, (foot & (e >= 150)).sum())), 2),
         'rope_mid': {'width': med(2 * W[mid]), 'height': med(H[mid]), 'n': int(mid.sum())}, 'rope_end': {'width': med(2 * W[end]), 'height': med(H[end]), 'n': int(end.sum())}}
    # rope spacing: pieces of the rope footprint >= 60 um long, centroid to nearest other centroid
    lab, n = ndi.label(foot); cs = []
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        m = lab[sl] == i; yy, xx = np.nonzero(m)
        if max(np.ptp(yy), np.ptp(xx)) * um >= 60: cs.append(((yy.mean() + sl[0].start) * um, (xx.mean() + sl[1].start) * um))
    cs = np.array(cs); nn = []
    if len(cs) > 1:
        d = np.hypot(cs[:, None, 0] - cs[None, :, 0], cs[:, None, 1] - cs[None, :, 1]); np.fill_diagonal(d, np.inf); nn = d.min(1)
    r['ropes'] = len(cs); r['spacing_um'] = med(np.array(nn)) if len(nn) else None
    # crypts wholly inside the box
    cr = hraw < -0.025; lab, n = ndi.label(cr); areas = []
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        if sl[0].start == 0 or sl[1].start == 0 or sl[0].stop == N or sl[1].stop == N: continue
        a = (lab[sl] == i).sum() * st * st
        if a >= 0.002: areas.append(a)
    r['crypts_inside'] = len(areas); r['crypt_mm2'] = [round(float(a), 3) for a in sorted(areas, reverse=True)]
    # faults: free strand pieces >= 1000 um3; wall fins thinner than 8 um (opening by a disc of radius 2 voxels) per mm of wall
    labs, ns = ndi.label(ss); touch = set(np.unique(labs[ss & ndi.binary_dilation(gnd <= 0)]).tolist()) - {0}
    szs = np.bincount(labs.ravel(), minlength=ns + 1); v = um ** 3
    r['free_flakes_ge1000um3'] = int(sum(1 for i in range(1, ns + 1) if i not in touch and szs[i] * v >= 1000))
    gy, gx = np.gradient(h, st); wall = (np.hypot(gx, gy) > 1.5) & (gw < 0.05); fins = 0; wall_mm = 0.0
    lw, nw = ndi.label(ndi.binary_dilation(wall, iterations=2))
    for k in range(1, nw + 1):
        m = lw == k
        if m.sum() < 200: continue
        top, bot = np.percentile(hraw[m], 90), np.percentile(hraw[m], 10)
        if top - bot < 0.03: continue
        sl_ = h > (top + bot) / 2; bm = ndi.binary_dilation(m, iterations=6)
        rem = sl_ & ~morphology.binary_opening(sl_, morphology.disk(2)) & bm; l2, n2 = ndi.label(rem)
        fins += int((np.bincount(l2.ravel())[1:] >= 3).sum()); wall_mm += measure.perimeter(sl_ & bm) * st / 2   # the band holds both faces of the slice's edge: half its perimeter
    r['wall_mm'] = round(wall_mm, 2); r['fins_per_mm_wall'] = round(fins / wall_mm, 1) if wall_mm > 0.05 else None
    r['_pool'] = {'core_mid': run[cm], 'core_end': run[ce], 'mid_w': 2 * W[mid], 'end_w': 2 * W[end], 'mid_h': H[mid], 'end_h': H[end], 'nn': np.array(nn), 'areas': np.array(areas)}
    return r

RAW = None
def eye_crypts(eye):
    p = os.path.join(RAW, f'crypts-{eye}.json')
    return np.array([c['mm2'] for c in json.load(open(p)) if not c['edge'] and c['mm2'] >= 0.002]) if os.path.exists(p) else np.array([])

def pooled(rs):
    P = lambda k: np.concatenate([r['_pool'][k] for r in rs]) if rs else np.array([])
    ca = np.concatenate([eye_crypts(e) for e in sorted({r['eye'] for r in rs})])
    md = lambda a: round(float(np.median(a)), 1) if a.size else None
    mw, ew = md(P('mid_w')), md(P('end_w'))
    cmid, cend = md(P('core_mid')), md(P('core_end'))
    return {'boxes': len(rs), 'core_mid': cmid, 'core_end': cend, 'core_end_over_mid': round(cend / cmid, 2) if cmid and cend else None, 'rope_mid_width': mw, 'rope_end_width': ew, 'end_over_mid': round(ew / mw, 2) if mw and ew else None,
            'rope_mid_height': md(P('mid_h')), 'rope_end_height': md(P('end_h')), 'spacing_um': md(P('nn')),
            'crypt_mm2_median': round(float(np.median(ca)), 3) if ca.size else None, 'crypts': int(ca.size),
            'crypts_in_ref_range': int(((ca >= REF['crypt_mm2'][0]) & (ca <= REF['crypt_mm2'][1])).sum()), 'crypts_over_0p3': int((ca > 0.3).sum()), 'largest_mm2': round(float(ca.max()), 2) if ca.size else None,
            'free_flakes_ge1000um3_per_box': round(sum(r['free_flakes_ge1000um3'] for r in rs) / len(rs), 1),
            'fins_per_mm_wall': round(float(np.median([r['fins_per_mm_wall'] for r in rs if r['fins_per_mm_wall'] is not None])), 1) if any(r['fins_per_mm_wall'] is not None for r in rs) else None}

def mark(v, lo, hi):
    if v is None: return '—'
    return f'{v}' + (' ✓' if lo <= v <= hi else (' low' if v < lo else ' high'))

if __name__ == '__main__':
    out, bases = sys.argv[1], sys.argv[2:]
    RAW = os.path.dirname(bases[0]); rs = [box(b) for b in bases]; eyes = sorted({r['eye'] for r in rs})
    res = {'ref': REF, 'boxes': [{k: v for k, v in r.items() if k != '_pool'} for r in rs], 'by_eye': {e: pooled([r for r in rs if r['eye'] == e]) for e in eyes}, 'all': pooled(rs)}
    json.dump(res, open(out, 'w'), indent=1)
    rows = [('eye ' + e, res['by_eye'][e]) for e in eyes] + [('all', res['all'])]
    print('| | rope core mid-span (ref 40–60 µm) | rope core at ends (ref 80–120 µm) | core end / mid | footprint width mid / end | end / mid (ref ~2×) | heights mid / end | rope spacing (ref 150–250 µm) | crypts of the eye in the ref area range (0.015–0.3 mm²) | visible free flakes per box | wall fins < 8 µm per mm |')
    print('|---|---|---|---|---|---|---|---|---|---|---|')
    for name, p in rows:
        print(f"| {name} ({p['boxes']} boxes) | {mark(p['core_mid'], *REF['rope_mid_um'])} | {mark(p['core_end'], *REF['rope_end_um'])} | {p['core_end_over_mid']} | {p['rope_mid_width']} / {p['rope_end_width']} | {mark(p['end_over_mid'], *REF['end_over_mid'])} | {p['rope_mid_height']} / {p['rope_end_height']} | {mark(p['spacing_um'], *REF['spacing_um'])} | {p['crypts_in_ref_range']} of {p['crypts']} (median {p['crypt_mm2_median']}, {p['crypts_over_0p3']} larger, up to {p['largest_mm2']}) | {p['free_flakes_ge1000um3_per_box']} | {p['fins_per_mm_wall']} |")
