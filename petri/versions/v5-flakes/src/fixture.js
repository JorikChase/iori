// fixture.js — Tero et al. 2010's network metrics in food-source mode (study/05 §3.2, §4.2 #9–10).
//
//   TL_MST  total length of the vein network / length of the Euclidean MST over the food sources
//   MD_MST  mean shortest-path distance between food-source pairs through the network / the same
//           through the MST
//   FT      fault tolerance: 1 − (length of bridges whose failure isolates a food source) / TL — the
//           probability that no food source is cut off when one link fails, failure ∝ link length
//
// Tero 2010, Physarum (n = 21): 1.75 ± 0.30, 0.85 ± 0.04, 0.86 ± 0.04 (illuminated). Tokyo rail:
// ≈ 1.8, 0.85, 0.96. MST: 1, 1, 0.
//
// "The vein network" is the set of edges the adaptation keeps conducting — the analogue of the tubes
// Tero photographed after the plasmodium had withdrawn from explored ground — restricted to the
// components that join two or more food sources. Pure functions; unit-tested in tests/fixture.test.mjs.

/** Euclidean MST over points [[x, y], …] (Prim, dense). Returns total length and the tree edges. */
export function pointMST(pts) {
  const k = pts.length;
  if (k < 2) return { length: 0, edges: [] };
  const inT = new Uint8Array(k), best = new Float64Array(k).fill(Infinity), from = new Int32Array(k).fill(-1);
  best[0] = 0; let total = 0; const edges = [];
  for (let it = 0; it < k; it++) {
    let u = -1, bv = Infinity;
    for (let i = 0; i < k; i++) if (!inT[i] && best[i] < bv) { bv = best[i]; u = i; }
    inT[u] = 1; total += bv; if (from[u] >= 0) edges.push([from[u], u, bv]);
    for (let v = 0; v < k; v++) if (!inT[v]) {
      const d = Math.hypot(pts[u][0] - pts[v][0], pts[u][1] - pts[v][1]);
      if (d < best[v]) { best[v] = d; from[v] = u; }
    }
  }
  return { length: total, edges };
}

/** All-pairs mean of shortest-path distances between `terms` (node ids) over weighted edges. */
function meanPairDistance(V, edges, terms) {
  const adj = Array.from({ length: V }, () => []);
  for (const [a, b, w] of edges) { adj[a].push([b, w]); adj[b].push([a, w]); }
  let sum = 0, pairs = 0, unreachable = 0;
  for (let s = 0; s < terms.length; s++) {
    const dist = new Float64Array(V).fill(Infinity); dist[terms[s]] = 0;
    const done = new Uint8Array(V);
    // binary heap Dijkstra
    const h = [[0, terms[s]]];
    const push = (x) => { h.push(x); let i = h.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (h[p][0] <= h[i][0]) break; [h[p], h[i]] = [h[i], h[p]]; i = p; } };
    const pop = () => { const top = h[0], last = h.pop(); if (h.length) { h[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < h.length && h[l][0] < h[m][0]) m = l; if (r < h.length && h[r][0] < h[m][0]) m = r; if (m === i) break; [h[m], h[i]] = [h[i], h[m]]; i = m; } } return top; };
    while (h.length) {
      const [d, u] = pop(); if (done[u]) continue; done[u] = 1;
      for (const [v, w] of adj[u]) if (d + w < dist[v]) { dist[v] = d + w; push([dist[v], v]); }
    }
    for (let t = s + 1; t < terms.length; t++) {
      if (Number.isFinite(dist[terms[t]])) { sum += dist[terms[t]]; pairs++; } else unreachable++;
    }
  }
  return { mean: pairs ? sum / pairs : NaN, pairs, unreachable };
}

/** Bridges (Tarjan, iterative) of an undirected multigraph. Returns a Uint8Array flag per edge. */
export function bridges(V, edges) {
  const adj = Array.from({ length: V }, () => []);
  edges.forEach(([a, b], i) => { adj[a].push([b, i]); adj[b].push([a, i]); });
  const tin = new Int32Array(V).fill(-1), low = new Int32Array(V), isBridge = new Uint8Array(edges.length);
  let timer = 0;
  for (let root = 0; root < V; root++) {
    if (tin[root] >= 0) continue;
    const stack = [[root, -1, 0]];
    tin[root] = low[root] = timer++;
    while (stack.length) {
      const top = stack[stack.length - 1];
      const [u, viaEdge] = top;
      if (top[2] < adj[u].length) {
        const [v, ei] = adj[u][top[2]++];
        if (ei === viaEdge) continue;
        if (tin[v] < 0) { tin[v] = low[v] = timer++; stack.push([v, ei, 0]); }
        else low[u] = Math.min(low[u], tin[v]);
      } else {
        stack.pop();
        if (stack.length) {
          const p = stack[stack.length - 1][0];
          low[p] = Math.min(low[p], low[u]);
          if (low[u] > tin[p]) isBridge[viaEdge] = 1;
        }
      }
    }
  }
  return isBridge;
}

/** Does removing bridge `ei` separate two food terminals? It does exactly when the side cut off
 *  contains at least one terminal AND the rest still contains one. Computed per bridge by a flood fill
 *  that does not cross it; networks here have 10^2–10^3 edges, so this is cheap enough. */
function bridgeSeparatesFood(V, edges, ei, isTerm) {
  const adj = Array.from({ length: V }, () => []);
  edges.forEach(([a, b], i) => { if (i !== ei) { adj[a].push(b); adj[b].push(a); } });
  const [a] = edges[ei];
  const seen = new Uint8Array(V); const st = [a]; seen[a] = 1; let termsA = 0;
  while (st.length) { const u = st.pop(); if (isTerm[u]) termsA++; for (const v of adj[u]) if (!seen[v]) { seen[v] = 1; st.push(v); } }
  let total = 0; for (let v = 0; v < V; v++) if (isTerm[v]) total++;
  return termsA > 0 && termsA < total;
}

/**
 * net:   { nodes: [[x, y], …], edges: [[a, b, len], …], D: [...] } in one coordinate frame (mm)
 * food:  [[x, y], …] food-source positions in the same frame
 * opts:  alive — conductivity above which a vein counts as a tube; reach — mm from a food source to
 *        the node that serves it
 */
export function teroMetrics(net, food, { alive = 0.05, reach = 2.0 } = {}) {
  const V = net.nodes.length;
  // food source -> nearest node within reach
  const served = food.map(([x, y]) => {
    let best = -1, bd = reach * reach;
    net.nodes.forEach(([nx, ny], v) => { const d = (nx - x) ** 2 + (ny - y) ** 2; if (d < bd) { bd = d; best = v; } });
    return best;
  });
  // the tube network: conducting edges
  const tubes = net.edges.filter((e, i) => (net.D ? net.D[i] : 1) > alive);
  // components of the tube network, keep those holding >= 2 served food sources
  const parent = Int32Array.from({ length: V }, (_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (const [a, b] of tubes) parent[find(a)] = find(b);
  const foodByRoot = new Map();
  served.forEach((v, k) => { if (v >= 0) { const r = find(v); (foodByRoot.get(r) || foodByRoot.set(r, []).get(r)).push(k); } });
  let mainRoot = -1, mainCount = 0;
  for (const [r, ks] of foodByRoot) if (ks.length > mainCount) { mainCount = ks.length; mainRoot = r; }
  const reachedIdx = mainRoot >= 0 ? foodByRoot.get(mainRoot) : [];
  const coverage = reachedIdx.length / food.length;
  if (reachedIdx.length < 2) return { coverage, reached: reachedIdx.length, TL_MST: NaN, MD_MST: NaN, FT: NaN };
  const net2 = tubes.filter(([a]) => find(a) === mainRoot);
  const TL = net2.reduce((s, e) => s + e[2], 0);
  const pts = reachedIdx.map((k) => food[k]);
  const mst = pointMST(pts);
  const terms = [...new Set(reachedIdx.map((k) => served[k]))];
  const md = meanPairDistance(V, net2, terms);
  const mstEdges = mst.edges.map(([i, j, w]) => [i, j, w]);
  const mdMST = meanPairDistance(pts.length, mstEdges, pts.map((_, i) => i));
  const isTerm = new Uint8Array(V); for (const t of terms) isTerm[t] = 1;
  const br = bridges(V, net2);
  let cut = 0;
  net2.forEach((e, i) => { if (br[i] && bridgeSeparatesFood(V, net2, i, isTerm)) cut += e[2]; });
  return {
    coverage: +coverage.toFixed(3), reached: reachedIdx.length, tubes: net2.length,
    TL_mm: +TL.toFixed(1), MST_mm: +mst.length.toFixed(1),
    TL_MST: +(TL / mst.length).toFixed(3),
    MD_MST: +(md.mean / mdMST.mean).toFixed(3),
    FT: +(1 - cut / TL).toFixed(3),
  };
}

/** A deterministic 36-source fixture: Tero's source count and density scaled into the dish. Tero's
 *  own layout (the cities around Tokyo) was never re-digitised for this project, so this is NOT his
 *  geometry and the numbers compare by regime, not point for point. Returns dish-centred mm. */
export function fixture36(seed = 2010, radius = 34, minSep = 7.5) {
  let a = seed >>> 0;
  const rnd = () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const pts = [[0, 0]];                               // "Tokyo": where the plasmodium starts
  for (let tries = 0; pts.length < 36 && tries < 20000; tries++) {
    const r = radius * Math.sqrt(rnd()), th = rnd() * 2 * Math.PI;
    const p = [r * Math.cos(th), r * Math.sin(th)];
    if (pts.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) >= minSep)) pts.push(p);
  }
  return pts.map(([x, y]) => [+x.toFixed(2), +y.toFixed(2)]);
}
