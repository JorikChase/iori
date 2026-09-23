// graph.js — the vein network as vector data: mask → distance transform → skeleton → node/edge graph
// with widths, then the network morphometrics of study/05 §3-4.
//
// This is the foundation of the revised P2 (proto/FINDINGS.md: the continuum hybrid does not channel,
// so the Tero adaptation runs on the graph, where paths compete by construction) AND of harness tier
// T2, which compares these same numbers against real Physarum networks. One implementation, so the
// engine and the scorecard can never disagree about what a vein is.
//
// Pure functions over a cell readback. Costs a few hundred ms on a 2048² dish, so it belongs in a
// worker or on a timer — the network changes on a scale of sim-minutes, not frames.

import { maskAbove } from './metrics.js';

/** Exact squared Euclidean distance transform (Felzenszwalb & Huttenlocher), one pass per axis.
 *  Returns distance in CELLS from each occupied cell to the nearest empty one — i.e. half the local
 *  vein width, which is where edge widths come from. */
export function distanceTransform(m, n) {
  const INF = 1e20;
  const f = new Float64Array(n), d = new Float64Array(n * n);
  const v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let i = 0; i < n * n; i++) d[i] = m[i] ? INF : 0;
  const pass = (get, set) => {
    for (let q = 0; q < n; q++) f[q] = get(q);
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < n; q++) {
      let s;
      for (;;) {
        s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
        if (s > z[k]) break;
        k--;
      }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++;
      set(q, (q - v[k]) * (q - v[k]) + f[v[k]]);
    }
  };
  for (let y = 0; y < n; y++) pass((x) => d[y * n + x], (x, val) => { d[y * n + x] = val; });
  for (let x = 0; x < n; x++) pass((y) => d[y * n + x], (y, val) => { d[y * n + x] = val; });
  for (let i = 0; i < n * n; i++) d[i] = Math.sqrt(d[i]);
  return d;
}

const NB8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

/** Guo–Hall thinning to a one-cell-wide skeleton (study/05 §4.2 names it as the protocol choice).
 *  Iterates two sub-passes until nothing changes; bounded so a pathological mask cannot hang a frame. */
export function skeleton(mask, n, maxIter = 80) {
  // Allocation-free: only cells that are still set get visited, and the neighbourhood is read inline.
  // (The first version built an array per pixel per iteration and dominated the extraction time.)
  const s = Uint8Array.from(mask);
  for (let x = 0; x < n; x++) { s[x] = 0; s[(n - 1) * n + x] = 0; }
  for (let y = 0; y < n; y++) { s[y * n] = 0; s[y * n + n - 1] = 0; }
  let live = [];
  for (let i = 0; i < n * n; i++) if (s[i]) live.push(i);
  const doomed = [];
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = 0;
    for (let sub = 0; sub < 2; sub++) {
      doomed.length = 0;
      for (const i of live) {
        if (!s[i]) continue;
        const E = s[i + 1], NE = s[i - n + 1], N = s[i - n], NW = s[i - n - 1];
        const W = s[i - 1], SW = s[i + n - 1], S = s[i + n], SE = s[i + n + 1];
        const C = (!E && (NE || N) ? 1 : 0) + (!N && (NW || W) ? 1 : 0) + (!W && (SW || S) ? 1 : 0) + (!S && (SE || E) ? 1 : 0);
        if (C !== 1) continue;
        const N1 = (NE || N ? 1 : 0) + (NW || W ? 1 : 0) + (SW || S ? 1 : 0) + (SE || E ? 1 : 0);
        const N2 = (N || NW ? 1 : 0) + (W || SW ? 1 : 0) + (S || SE ? 1 : 0) + (E || NE ? 1 : 0);
        const Nm = N1 < N2 ? N1 : N2;
        if (Nm < 2 || Nm > 3) continue;
        const cond = sub === 0 ? ((NE || N || !SE) && E) : ((SW || S || !NW) && W);
        if (!cond) doomed.push(i);
      }
      for (const i of doomed) { s[i] = 0; changed++; }
    }
    if (!changed) break;
    live = live.filter((i) => s[i]);
  }
  return s;
}

/** Skeleton → graph. Nodes are skeleton cells with a neighbour count other than 2 (junctions and
 *  ends); edges are the runs of degree-2 cells between them, carrying length in mm and the mean
 *  width from the distance transform. Spurs shorter than `pruneMm` are dropped and their node
 *  removed — thinning always produces some, and they would otherwise dominate the degree histogram. */
export function buildGraph(skel, dist, n, cellMm, { pruneMm = 0.25, spurWidths = 3, keepTips = [], tipReach = 0 } = {}) {
  const deg = new Uint8Array(n * n);
  for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) {
    if (!skel[y * n + x]) continue;
    let c = 0;
    for (const [dx, dy] of NB8) if (skel[(y + dy) * n + x + dx]) c++;
    deg[y * n + x] = c;
  }
  // Junction cells come in clumps: thinning leaves two or three touching cells at a crossing, and
  // treating each as its own node invents extra nodes and extra loops (measured on a 3x3 test
  // lattice: 15 nodes and 12 loops where there are 5 and 4). Flood-fill each clump into one node.
  const nodeOf = new Int32Array(n * n).fill(-1);
  const nodes = [];
  const stack = [];
  for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) {
    const i0 = y * n + x;
    if (!skel[i0] || deg[i0] === 2 || nodeOf[i0] >= 0) continue;
    const id = nodes.length;
    let sx = 0, sy = 0, cnt = 0, maxDist = 0;
    stack.length = 0; stack.push(i0); nodeOf[i0] = id;
    while (stack.length) {
      const i = stack.pop();
      const cx = i % n, cy = (i / n) | 0;
      sx += cx; sy += cy; cnt++;
      if (dist[i] > maxDist) maxDist = dist[i];
      for (const [dx, dy] of NB8) {
        const q = (cy + dy) * n + cx + dx;
        if (q < 0 || q >= n * n || !skel[q] || deg[q] === 2 || nodeOf[q] >= 0) continue;
        nodeOf[q] = id; stack.push(q);
      }
    }
    nodes.push({ x: (sx / cnt) * cellMm, y: (sy / cnt) * cellMm, deg: 0, r_mm: maxDist * cellMm, cells: cnt });
  }
  // Walk each degree-2 run exactly once by consuming its interior cells; a run's interior belongs to
  // one edge alone, which is what makes the dedup exact rather than heuristic.
  const used = new Uint8Array(n * n);
  const edges = [];
  const addEdge = (a, b, len, wsum, steps) => {
    if (a < 0 || b < 0) return;
    edges.push({ a, b, len_mm: Math.max(len, 1) * cellMm, width_mm: (2 * wsum / Math.max(steps, 1)) * cellMm, cells: steps });
  };
  for (let i0 = 0; i0 < n * n; i0++) {
    const a = nodeOf[i0];
    if (a < 0) continue;
    const x0 = i0 % n, y0 = (i0 / n) | 0;
    for (const [dx0, dy0] of NB8) {
      const x1 = x0 + dx0, y1 = y0 + dy0;
      if (x1 < 1 || y1 < 1 || x1 >= n - 1 || y1 >= n - 1) continue;
      const first = y1 * n + x1;
      if (!skel[first]) continue;
      if (nodeOf[first] >= 0) continue;              // node-to-node adjacency: handled below
      if (used[first]) continue;
      let prev = i0, cur = first, len = Math.hypot(dx0, dy0), wsum = dist[cur], steps = 1, guard = 0;
      used[cur] = 1;
      while (deg[cur] === 2 && guard++ < 4 * n) {
        const cx = cur % n, cy = (cur / n) | 0;
        let nxt = -1, ndx = 0, ndy = 0;
        for (const [dx, dy] of NB8) {
          const q = (cy + dy) * n + cx + dx;
          if (q === prev || !skel[q]) continue;
          nxt = q; ndx = dx; ndy = dy; break;
        }
        if (nxt < 0) break;
        len += Math.hypot(ndx, ndy); wsum += dist[nxt]; steps++;
        prev = cur; cur = nxt;
        if (nodeOf[cur] >= 0) break;
        used[cur] = 1;
      }
      addEdge(a, nodeOf[cur], len, wsum, steps);
    }
  }
  // Two node clumps that touch directly are one edge, counted once.
  const seen = new Set();
  for (let i0 = 0; i0 < n * n; i0++) {
    const a = nodeOf[i0];
    if (a < 0) continue;
    const x0 = i0 % n, y0 = (i0 / n) | 0;
    for (const [dx, dy] of NB8) {
      const q = (y0 + dy) * n + x0 + dx;
      const b = q >= 0 && q < n * n ? nodeOf[q] : -1;
      if (b < 0 || b === a) continue;
      const key = Math.min(a, b) * 1e7 + Math.max(a, b);
      if (seen.has(key)) continue;
      seen.add(key);
      addEdge(a, b, Math.hypot(dx, dy), 0.5 * (dist[i0] + dist[q]), 1);
    }
  }
  // Prune spurs: a dead end shorter than its own width is thinning noise, not a vein.
  const degCount = new Int32Array(nodes.length);
  for (const e of edges) { degCount[e.a]++; degCount[e.b]++; }
  const keep = edges.filter((e) => {
    const tip = degCount[e.a] === 1 ? e.a : degCount[e.b] === 1 ? e.b : -1;
    if (tip < 0 || e.len_mm >= Math.max(pruneMm, spurWidths * e.width_mm)) return true;
    // A dead end that ENDS ON FOOD is the organism's feeding branch, not thinning noise: pruning it
    // hid the contact from the adaptation, the flake got no terminal, and its tube faded (fixture
    // diagnosis 2026-09-22: 8 of 36 flakes dropped this way on one frame). keepTips: [[x, y, r], …] mm.
    const T = nodes[tip];
    return keepTips.some(([x, y, r = 0]) => (T.x - x) ** 2 + (T.y - y) ** 2 <= (r + tipReach) ** 2);
  });
  const live = new Set();
  for (const e of keep) { live.add(e.a); live.add(e.b); }
  const remap = new Map();
  const outNodes = [];
  for (let i = 0; i < nodes.length; i++) if (live.has(i)) { remap.set(i, outNodes.length); outNodes.push({ ...nodes[i], deg: 0 }); }
  const outEdges = keep.map((e) => ({ ...e, a: remap.get(e.a), b: remap.get(e.b) }));
  for (const e of outEdges) { outNodes[e.a].deg++; outNodes[e.b].deg++; }
  return { nodes: outNodes, edges: outEdges, cellMm };
}

/** Keep only the largest connected component. Standard protocol for network morphometrics: a dish
 *  carries detached fragments and freshly seeded blobs, and counting them makes the meshedness index
 *  negative (E < V-1 is a forest, not a network) and the MST ratio meaningless. */
export function largestComponent(g) {
  const adj = g.nodes.map(() => []);
  g.edges.forEach((e, i) => { adj[e.a].push(i); adj[e.b].push(i); });
  const comp = new Int32Array(g.nodes.length).fill(-1);
  let best = -1, bestSize = 0;
  for (let s = 0; s < g.nodes.length; s++) {
    if (comp[s] >= 0) continue;
    const id = s; let size = 0; const stack = [s]; comp[s] = id;
    while (stack.length) {
      const v = stack.pop(); size++;
      for (const ei of adj[v]) {
        const w = g.edges[ei].a === v ? g.edges[ei].b : g.edges[ei].a;
        if (comp[w] < 0) { comp[w] = id; stack.push(w); }
      }
    }
    if (size > bestSize) { bestSize = size; best = id; }
  }
  const remap = new Map();
  const nodes = [];
  g.nodes.forEach((nd, i) => { if (comp[i] === best) { remap.set(i, nodes.length); nodes.push({ ...nd, deg: 0 }); } });
  const edges = g.edges.filter((e) => comp[e.a] === best).map((e) => ({ ...e, a: remap.get(e.a), b: remap.get(e.b) }));
  for (const e of edges) { nodes[e.a].deg++; nodes[e.b].deg++; }
  return { ...g, nodes, edges, components: new Set(Array.from(comp)).size };
}

/** Engine path: a value per cell (the slot's density channel, 0 elsewhere), OR-downsampled by `ds`
 *  before thinning. At normal the veins are several cells wide, so extracting at half resolution
 *  loses no topology and costs a quarter as much. */
/** Morphological closing (dilate then erode, 8-neighbourhood, `r` passes each). Bridges the one-cell
 *  gaps a thresholded agent trail leaves along a vein, which otherwise cut one vein into many components. */
export function close(m, n, r = 1) {
  let a = m;
  const step = (src, grow) => {
    const out = new Uint8Array(n * n);
    for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) {
      const i = y * n + x;
      let v = src[i];
      if (grow ? !v : v) {
        const any = src[i - 1] | src[i + 1] | src[i - n] | src[i + n] | src[i - n - 1] | src[i - n + 1] | src[i + n - 1] | src[i + n + 1];
        const all = src[i - 1] & src[i + 1] & src[i - n] & src[i + n] & src[i - n - 1] & src[i - n + 1] & src[i + n - 1] & src[i + n + 1];
        v = grow ? any : all;
      }
      out[i] = v;
    }
    return out;
  };
  for (let k = 0; k < r; k++) a = step(a, true);
  for (let k = 0; k < r; k++) a = step(a, false);
  return a;
}

export function extractValues(vals, n, cellMm, { ds = 1, level = 0.05, closeR = 0, ...opts } = {}) {
  const N = n * n;
  let max = 0, count = 0;
  for (let k = 0; k < N; k++) { const v = vals[k]; if (v > 0) { count++; if (v > max) max = v; } }
  const m0 = new Uint8Array(N);
  if (count) {
    const B = 4096, hist = new Uint32Array(B);
    for (let k = 0; k < N; k++) { const v = vals[k]; if (v > 0) hist[Math.min(B - 1, ((v / max) * B) | 0)]++; }
    const want = Math.floor(count * 0.99);
    let acc = 0, b = 0; for (; b < B; b++) { acc += hist[b]; if (acc > want) break; }
    const thr = level * ((b + 0.5) / B) * max;
    for (let k = 0; k < N; k++) if (vals[k] > thr) m0[k] = 1;
  }
  let m = m0, nn = n;
  if (ds > 1) {
    nn = Math.floor(n / ds); m = new Uint8Array(nn * nn);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m0[y * n + x]) m[((y / ds) | 0) * nn + ((x / ds) | 0)] = 1;
  }
  if (closeR > 0) m = close(m, nn, closeR);
  const dist = distanceTransform(m, nn);
  const skel = skeleton(m, nn);
  return buildGraph(skel, dist, nn, cellMm * ds, opts);
}

/** One call: cells → graph. */
export function extract(cells, n, slot, cellMm, opts = {}) {
  const m = maskAbove(cells, n, slot);
  const dist = distanceTransform(m, n);
  const skel = skeleton(m, n);
  const g = buildGraph(skel, dist, n, cellMm, opts);
  return opts.whole ? g : largestComponent(g);
}

// ------------------------------------------------------------------------------ network morphometrics
const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(a.length, 1);

/** Minimum spanning tree length over the node set (Prim, dense — node counts are 10^3-10^4). */
function mstLength(nodes) {
  const k = nodes.length;
  if (k < 2) return 0;
  const inTree = new Uint8Array(k), best = new Float64Array(k).fill(Infinity);
  best[0] = 0; let total = 0;
  for (let it = 0; it < k; it++) {
    let u = -1, bv = Infinity;
    for (let i = 0; i < k; i++) if (!inTree[i] && best[i] < bv) { bv = best[i]; u = i; }
    if (u < 0) break;
    inTree[u] = 1; total += bv;
    for (let v = 0; v < k; v++) if (!inTree[v]) {
      const d = Math.hypot(nodes[u].x - nodes[v].x, nodes[u].y - nodes[v].y);
      if (d < best[v]) best[v] = d;
    }
  }
  return total;
}

/** The numbers study/05 §3 gates on, computed the same way for a simulated dish and for a real one. */
export function networkStats(g) {
  const { nodes, edges } = g;
  if (!edges.length) return { nodes: 0, edges: 0 };
  const degs = nodes.map((nd) => nd.deg);
  const hist = {};
  for (const d of degs) hist[d] = (hist[d] || 0) + 1;
  const branching = degs.filter((d) => d >= 3);
  const deg3 = branching.length ? branching.filter((d) => d === 3).length / branching.length : 0;
  const widths = edges.map((e) => e.width_mm).filter((w) => w > 0);
  const lw = widths.map(Math.log);
  const muL = mean(lw);
  const sdL = Math.sqrt(mean(lw.map((x) => (x - muL) ** 2)));
  const lens = edges.map((e) => e.len_mm);
  const TL = lens.reduce((a, b) => a + b, 0);
  const mst = mstLength(nodes);
  // alpha (meshedness): independent loops as a fraction of the planar maximum
  const V = nodes.length, E = edges.length;
  const alpha = V > 3 ? (E - V + 1) / (2 * V - 5) : 0;   // planar maximum needs V >= 4
  return {
    nodes: V, edges: E,
    degreeHistogram: hist,
    deg3Fraction: +deg3.toFixed(4),
    meanWidth_mm: +mean(widths).toFixed(4),
    widthLogMu: +muL.toFixed(4), widthLogSigma: +sdL.toFixed(4),
    meanLength_mm: +mean(lens).toFixed(4),
    totalLength_mm: +TL.toFixed(2),
    mstLength_mm: +mst.toFixed(2),
    TL_MST: mst > 0 ? +(TL / mst).toFixed(3) : null,
    alpha: +alpha.toFixed(4),
  };
}

/** T2's five no-download gates (study/05 §3): published numbers that need no dataset. Each row says
 *  what it is, what was measured, and the source, so a failure names the physics. */
export function t2Gates(stats) {
  const rows = [
    { name: 'degree-3 fraction of branch points', target: '>= 0.90', value: stats.deg3Fraction,
      pass: stats.deg3Fraction >= 0.90, source: 'Baumgarten, Ueda & Hauser 2010 PRE 82:046113' },
    { name: 'vein widths log-normal (sigma)', target: '0.25 - 0.85', value: stats.widthLogSigma,
      pass: stats.widthLogSigma > 0.25 && stats.widthLogSigma < 0.85, source: 'Baumgarten 2010' },
    { name: 'total length against the MST', target: '1.45 - 2.05', value: stats.TL_MST,
      pass: stats.TL_MST !== null && stats.TL_MST > 1.45 && stats.TL_MST < 2.05,
      source: 'Tero et al. 2010 Science 327:439 (1.75 +/- 0.30, n = 21)' },
    { name: 'meshedness alpha', target: '0.04 - 0.30', value: stats.alpha,
      pass: stats.alpha > 0.04 && stats.alpha < 0.30, source: 'Bebber et al. 2007 Proc R Soc B 274:2307' },
  ];
  return { rows, passed: rows.filter((r) => r.pass).length, total: rows.length };
}
