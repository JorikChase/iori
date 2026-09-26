"""Iris Engine — roots: a traced shard followed along its own vector (study/11 §5.2.1, iori 2026-09-26).

The deck fibres the tracer finds are FRAGMENTS: the skeleton is split at every junction, a ridge is lost under a
neighbour or in a shadow, and what remains is a mesh of ≈ 0.13 mm runs with vertical ends. This pass asks, for every
fragment end, whether the fibre goes on: it marches the end tangent forward through a corridor and looks for another
fragment's end that continues it — close, nearly collinear, the same width and colour, and with ridge evidence along
the path between them (the tracer's own response, at a LOWER level than the tracer's threshold, so a join is made only
where the photograph shows tissue between the two). Joins chain into ROOTS. An end that runs into the BODY of another
fibre is a BRANCH (or a merge, when nearly parallel) — the larger root structure. The fibres themselves are never
rewritten: a root points at them. Provenance `inferred`.

Pure numpy / OpenCV / scipy; no engine, no GL. Units: window pixels (the fitter's native crop), tangents unit.
"""
import numpy as np
import cv2


def _unit(v):
    n = np.hypot(*v); return v / n if n > 1e-9 else v


def _ends(fibres, radii):
    """one record per fibre end: position, OUTWARD unit tangent, width, colour, brightness"""
    E = []
    for i, c in enumerate(fibres):
        q = c['xy'].astype(np.float64); n = len(q)
        if n < 2: continue
        k = min(3, n - 1); r = radii[i]
        for e in (0, 1):
            p, t = (q[0], _unit(q[0] - q[k])) if e == 0 else (q[-1], _unit(q[-1] - q[-1 - k]))
            sl = slice(0, k + 1) if e == 0 else slice(n - k - 1, n)
            E.append({'i': i, 'e': e, 'p': p, 't': t, 'r': float(np.median(r[sl])), 'w': float(np.median(c['w'][sl])),
                      'a': float(np.median(c['a'][sl])) if 'a' in c else 0.0, 'b': float(np.median(c['b'][sl])) if 'b' in c else 0.0,
                      'val': float(np.median(c['val'][sl])) if 'val' in c else 1.0})
    return E


def _hermite(p0, t0, p1, t1, n):
    """a cubic from p0 leaving along t0 to p1 arriving along t1 (both unit, magnitude = the chord), n samples"""
    s = np.linspace(0, 1, n)[:, None]; g = np.hypot(*(p1 - p0))
    h00, h10, h01, h11 = 2 * s ** 3 - 3 * s ** 2 + 1, s ** 3 - 2 * s ** 2 + s, -2 * s ** 3 + 3 * s ** 2, s ** 3 - s ** 2
    return h00 * p0 + h10 * (g * t0) + h01 * p1 + h11 * (g * t1)


def _evidence(path, R, lo, sd, wall_px, k_lo):
    """fraction of the corridor's samples that the ridge map supports (R ≥ k_lo · lo) among those inside a hole"""
    H, W = R.shape
    x = np.clip(np.round(path[:, 0]).astype(int), 0, W - 1); y = np.clip(np.round(path[:, 1]).astype(int), 0, H - 1)
    lo_v = lo[y, x] if isinstance(lo, np.ndarray) and lo.ndim == 2 else np.full(len(x), float(lo))
    inside = sd[y, x] > -wall_px
    if inside.sum() == 0: return 0.0, 0.0
    return float(np.mean(R[y, x][inside] >= k_lo * lo_v[inside])), float(inside.mean())


def find_roots(fibres, radii, R, lo, sd, step_px, um, gmax_mm=0.30, turn_deg=30.0, k_lo=0.5, ev_min=0.35,
               score_min=0.50, wall_px=8.0, dab_max=10.0, branch_mm=0.15, across_mm=0.03):
    """fibres: the fitter's curves ('xy' (n,2) window px, 'w', 'val', 'L','a','b'); radii: per-sample tube radius (px);
    R, lo: the ridge map the fibres were traced on and its low hysteresis threshold (map or scalar); sd: signed distance,
    + inside a hole. Returns dict(links, branches, roots, stats)."""
    from scipy.spatial import cKDTree
    px = 1000.0 / um; gmax = gmax_mm * px; cos_turn = np.cos(np.radians(turn_deg)); across = across_mm * px
    E = _ends(fibres, radii)
    if len(E) < 2: return {'links': [], 'branches': [], 'roots': [], 'stats': {}}
    P = np.array([e['p'] for e in E]); tree = cKDTree(P)
    pairs = tree.query_pairs(r=gmax, output_type='ndarray')
    cand = []
    for a, b in pairs:
        A, B = E[a], E[b]
        if A['i'] == B['i']: continue
        d = B['p'] - A['p']; gap = float(np.hypot(*d))
        if gap < 1e-6: continue
        u = d / gap
        ca, cb = float(A['t'] @ u), float(-B['t'] @ u)                       # A leaves toward B, B leaves toward A
        if ca < cos_turn or cb < cos_turn: continue
        # the join must stay in its LANE: the other end's sideways offset from each end's own line is under half the strand
        # spacing (65 µm measured across the flow on eye 26) — a 30° turn over a 0.2 mm gap would otherwise reach the next lane
        if abs(A['t'][0] * d[1] - A['t'][1] * d[0]) > across or abs(B['t'][0] * d[1] - B['t'][1] * d[0]) > across: continue
        rw = A['w'] / max(B['w'], 1e-6)
        if rw < 0.5 or rw > 2.0: continue
        dab = float(np.hypot(A['a'] - B['a'], A['b'] - B['b']))
        if dab > dab_max: continue
        rv = A['val'] / max(B['val'], 1e-6)
        if rv < 0.4 or rv > 2.5: continue
        n = max(3, int(round(gap)))
        path = _hermite(A['p'], A['t'], B['p'], -B['t'], n)
        if gap <= 1.5 * step_px: ev, inside = 1.0, 1.0                       # a junction the tracer split: the ridges meet there
        else: ev, inside = _evidence(path, R, lo, sd, wall_px, k_lo)
        if inside < 0.8 or ev < ev_min: continue
        turn = np.degrees(np.arccos(np.clip(min(ca, cb), -1, 1)))
        score = 0.30 * (1 - turn / turn_deg) + 0.25 * (1 - gap / gmax) + 0.30 * ev + 0.10 * (1 - dab / dab_max) + 0.05 * (1 - abs(np.log2(rw)))
        if score >= score_min: cand.append((score, a, b, gap, turn, ev, dab))
    cand.sort(key=lambda c: -c[0])
    # greedy: one link per end, no cycles (a root is a path — a weave's cycles live in the heights, not in the chaining)
    parent = list(range(len(fibres)))
    def find(x):
        while parent[x] != x: parent[x] = parent[parent[x]]; x = parent[x]
        return x
    used = set(); links = []
    for score, a, b, gap, turn, ev, dab in cand:
        if a in used or b in used: continue
        A, B = E[a], E[b]; ra, rb = find(A['i']), find(B['i'])
        if ra == rb: continue
        parent[ra] = rb; used.add(a); used.add(b)
        links.append({'a': [A['i'], A['e']], 'b': [B['i'], B['e']], 'gapMm': round(gap / px, 5), 'turnDeg': round(float(turn), 1),
                      'conf': round(float(ev), 3), 'score': round(float(score), 3), 'dab': round(dab, 2), '_ea': a, '_eb': b})
    # branches: an unlinked end marched along its tangent into the body of another fibre
    H, W = R.shape; idmap = np.zeros((H, W), np.int32)
    for i, c in enumerate(fibres):
        th = max(1, int(round(2 * float(np.median(radii[i])))))
        cv2.polylines(idmap, [c['xy'].round().astype(np.int32)], False, int(i + 1), th)
    branches = []; bmax = branch_mm * px
    for k, A in enumerate(E):
        if k in used: continue
        i = A['i']; pos = A['p'].copy(); hit = None; steps = 0
        for s in range(1, int(bmax) + 1):
            pos = A['p'] + A['t'] * s; x, y = int(round(pos[0])), int(round(pos[1]))
            if not (0 <= x < W and 0 <= y < H): break
            j = int(idmap[y, x]) - 1
            if j >= 0 and j != i: hit = (j, s); break
            steps = s
        if hit is None: continue
        j, s = hit; q = fibres[j]['xy'].astype(np.float64)
        sj = int(np.argmin(np.hypot(*(q - pos).T)))
        if sj < 2 or sj > len(q) - 3: continue                                # hit an END, not a body: that is a continuation the chaining already judged
        tj = _unit(q[min(len(q) - 1, sj + 1)] - q[max(0, sj - 1)])
        ang = float(np.degrees(np.arccos(np.clip(abs(A['t'] @ tj), 0, 1))))
        path = np.stack([A['p'] + A['t'] * v for v in np.linspace(0, s, max(3, s))])
        ev, inside = _evidence(path, R, lo, sd, wall_px, k_lo) if s > 1.5 * step_px else (1.0, 1.0)
        if inside < 0.8 or ev < ev_min: continue
        branches.append({'from': [i, A['e']], 'into': [j, sj], 'gapMm': round(s / px, 5), 'angleDeg': round(ang, 1),
                         'kind': 'branch' if ang > turn_deg else 'merge', 'conf': round(float(ev), 3), '_e': k})
    # roots: walk the links. Each fibre has at most one link per end, so every root is a simple path.
    at = {}                                                                   # (fibre, end) → link index
    for li, L in enumerate(links): at[tuple(L['a'])] = li; at[tuple(L['b'])] = li
    seen = set(); roots = []
    for i in range(len(fibres)):
        if i in seen: continue
        deg = ((i, 0) in at) + ((i, 1) in at)
        if deg == 0: seen.add(i); continue
        if deg == 2: continue                                                 # start only from a root's free end
        chain = []; cur, rev = i, (i, 0) in at                                # enter at the free end: forward if the link is at end 1
        while True:
            seen.add(cur); chain.append([cur, bool(rev)])
            out_end = 0 if rev else 1
            li = at.get((cur, out_end))
            if li is None: break
            L = links[li]; nxt = L['b'] if L['a'] == [cur, out_end] else L['a']
            cur, rev = nxt[0], nxt[1] == 1                                    # entering at end 1 means traversing it reversed
            if cur in seen: break
        roots.append(chain)
    for i in range(len(fibres)):                                              # anything left unseen with links was a cycle — cannot happen, but never lose a fibre
        if i not in seen: roots.append([[i, False]]); seen.add(i)
    flen = [float(np.hypot(*np.diff(c['xy'].astype(np.float64), axis=0).T).sum()) for c in fibres]
    out_roots = []
    for chain in roots:
        ids = [f for f, _ in chain]
        L = sum(flen[f] for f in ids) + sum(lk['gapMm'] * px for lk in links if lk['a'][0] in ids and lk['b'][0] in ids)
        out_roots.append({'fibres': chain, 'lengthMm': round(L / px, 4)})
    # every end classified: wall (the fibre dives under the sheet — the tracer's extend_to_walls stopped it there), link,
    # branch, merge, or free. The free fraction is taken over the ends INSIDE the holes: a wall end is not free, the fibre
    # goes on under the sheet where no photograph sees it. Real tissue leaves ≈ 20–25 % of visible ends free (study/08 §4).
    H, W = R.shape
    kind = [['free', 'free'] for _ in fibres]
    for k, e in enumerate(E):
        x, y = int(np.clip(round(e['p'][0]), 0, W - 1)), int(np.clip(round(e['p'][1]), 0, H - 1))
        if sd[y, x] < 6: kind[e['i']][e['e']] = 'wall'
    for L in links: kind[L['a'][0]][L['a'][1]] = 'link'; kind[L['b'][0]][L['b'][1]] = 'link'
    for B in branches: kind[B['from'][0]][B['from'][1]] = B['kind']
    flat = [k_ for kk in kind for k_ in kk]; n_ends = len(flat)
    n_wall = flat.count('wall'); in_hole = n_ends - n_wall; n_free = flat.count('free')
    linked = len(used); branched = len(branches)
    multi = [r for r in out_roots if len(r['fibres']) > 1]
    stats = {'fibres': len(fibres), 'ends': n_ends, 'ends_wall': n_wall, 'ends_in_hole': in_hole, 'ends_linked': linked, 'ends_branched': branched,
             'ends_free': n_free, 'free_fraction_in_hole': round(n_free / max(1, in_hole), 3), 'wall_fraction': round(n_wall / max(1, n_ends), 3),
             'candidates': len(cand), 'links': len(links), 'roots': len(multi), 'fibres_in_roots': sum(len(r['fibres']) for r in multi),
             'fibres_per_root': {'median': float(np.median([len(r['fibres']) for r in multi])) if multi else 0, 'max': max((len(r['fibres']) for r in multi), default=0)},
             'root_length_mm': {'median': round(float(np.median([r['lengthMm'] for r in multi])), 4) if multi else 0, 'p90': round(float(np.percentile([r['lengthMm'] for r in multi], 90)), 4) if multi else 0, 'max': max((r['lengthMm'] for r in multi), default=0)},
             'fragment_length_mm': {'median': round(float(np.median(flen)) / px, 4), 'p90': round(float(np.percentile(flen, 90)) / px, 4)},
             'link_gap_mm': {'median': round(float(np.median([l['gapMm'] for l in links])), 4) if links else 0, 'p90': round(float(np.percentile([l['gapMm'] for l in links], 90)), 4) if links else 0},
             'link_conf': {'median': round(float(np.median([l['conf'] for l in links])), 3) if links else 0},
             'branches': {'branch': sum(b['kind'] == 'branch' for b in branches), 'merge': sum(b['kind'] == 'merge' for b in branches)}}
    for L in links: L.pop('_ea'); L.pop('_eb')
    for B in branches: B.pop('_e')
    return {'links': links, 'branches': branches, 'roots': out_roots, 'stats': stats, 'ends': E, 'endKinds': kind}


def draw_roots(photo, fibres, radii, res, dim=0.6):
    """the review overlay: each root in its own colour, singletons grey, joins white, branches yellow, merges cyan"""
    ov = (photo.astype(np.float32) * dim).astype(np.uint8)
    col_of = {}
    multi = [r for r in res['roots'] if len(r['fibres']) > 1]
    for n, r in enumerate(multi):
        h = int((n * 137.508) % 180); c = cv2.cvtColor(np.uint8([[[h, 200, 255]]]), cv2.COLOR_HSV2BGR)[0, 0]
        for f, _ in r['fibres']: col_of[f] = (int(c[0]), int(c[1]), int(c[2]))
    for i, c in enumerate(fibres):
        col = col_of.get(i, (120, 120, 120)); th = 3 if i in col_of else 1                     # thin: the photo must stay readable under the lines
        cv2.polylines(ov, [c['xy'].round().astype(np.int32)], False, col, th, cv2.LINE_AA)
    for L in res['links']:
        a, b = L['a'], L['b']; pa = fibres[a[0]]['xy'][0 if a[1] == 0 else -1]; pb = fibres[b[0]]['xy'][0 if b[1] == 0 else -1]
        cv2.line(ov, tuple(pa.round().astype(int)), tuple(pb.round().astype(int)), (255, 255, 255), 1, cv2.LINE_AA)
    for B in res['branches']:
        j, sj = B['into']; p = fibres[j]['xy'][sj]
        cv2.circle(ov, tuple(p.round().astype(int)), 3, (0, 220, 255) if B['kind'] == 'branch' else (255, 220, 0), 1, cv2.LINE_AA)
    for i, kk in enumerate(res.get('endKinds', [])):                         # a free end inside a hole: red — where a strand should go on
        for e, k_ in enumerate(kk):
            if k_ == 'free': cv2.circle(ov, tuple(fibres[i]['xy'][0 if e == 0 else -1].round().astype(int)), 3, (0, 0, 255), -1, cv2.LINE_AA)
    return ov
