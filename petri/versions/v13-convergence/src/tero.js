// tero.js — Physarum flux adaptation on the vein graph (Tero, Kobayashi & Nakagaki 2007; Tero et al.
// 2010). This is P2 on the route the coupling-B gate pointed at (proto/FINDINGS.md): on a continuum
// sheet the competition between paths never starts, on a graph it works by construction.
//
//   Kirchhoff:   sum_j (D_ij / L_ij) (p_i - p_j) = b_i          b = +I0 at the source, -I0 at the sink
//   flux:        Q_ij = (D_ij / L_ij) (p_i - p_j)
//   adaptation:  dD_ij/dt = f(|Q_ij|) - r D_ij
//
// f(Q) = Q^mu (power) converges to the shortest path for mu = 1 (Bonifaci, Mehlhorn & Varma 2012);
// f(Q) = Q^mu / (Qh^mu + Q^mu) (sigmoid) with a fresh random source/sink pair among the terminals on
// every iteration is Tero 2010's form, and it keeps the loops that make a network fault tolerant.
//
// Pure functions: no GPU, no DOM. Runs in the graph worker and in node for the unit tests.

/** Connected components. Returns an Int32Array of component ids and the count. */
export function components(g) {
  const adj = g.nodes.map(() => []);
  g.edges.forEach((e, i) => { adj[e.a].push(i); adj[e.b].push(i); });
  const comp = new Int32Array(g.nodes.length).fill(-1);
  let k = 0;
  for (let s = 0; s < g.nodes.length; s++) {
    if (comp[s] >= 0) continue;
    const stack = [s]; comp[s] = k;
    while (stack.length) {
      const v = stack.pop();
      for (const ei of adj[v]) { const e = g.edges[ei]; const w = e.a === v ? e.b : e.a; if (comp[w] < 0) { comp[w] = k; stack.push(w); } }
    }
    k++;
  }
  return { comp, count: k, adj };
}

/** Solve the weighted graph Laplacian L p = b by Jacobi-preconditioned CG.
 *  L is singular on every component (only differences of p matter), so b must balance within each
 *  component; the mean of p is then projected out per component, the graph analogue of the mean
 *  projection the P1b grid solver needed. */
export function solvePressure(g, cond, b, comp, ncomp, { tol = 1e-8, maxit = 2000 } = {}) {
  const V = g.nodes.length;
  const diag = new Float64Array(V);
  for (let i = 0; i < g.edges.length; i++) { const e = g.edges[i]; diag[e.a] += cond[i]; diag[e.b] += cond[i]; }
  const Ap = (x, out) => {
    out.fill(0);
    for (let i = 0; i < g.edges.length; i++) {
      const e = g.edges[i], c = cond[i], d = x[e.a] - x[e.b];
      out[e.a] += c * d; out[e.b] -= c * d;
    }
    return out;
  };
  const cnt = new Float64Array(ncomp);
  for (let v = 0; v < V; v++) cnt[comp[v]]++;
  const project = (x) => {
    const s = new Float64Array(ncomp);
    for (let v = 0; v < V; v++) s[comp[v]] += x[v];
    for (let v = 0; v < V; v++) x[v] -= s[comp[v]] / cnt[comp[v]];
  };
  const p = new Float64Array(V), r = Float64Array.from(b), z = new Float64Array(V), q = new Float64Array(V);
  project(r);
  for (let v = 0; v < V; v++) z[v] = diag[v] > 0 ? r[v] / diag[v] : 0;
  project(z);
  const d = Float64Array.from(z);
  let rz = 0; for (let v = 0; v < V; v++) rz += r[v] * z[v];
  const r0 = Math.sqrt(r.reduce((a, x) => a + x * x, 0));
  if (r0 === 0) return { p, iters: 0, residual: 0 };           // no current anywhere: nothing to solve
  let it = 0, rn = r0;
  for (; it < maxit; it++) {
    Ap(d, q);
    let dq = 0; for (let v = 0; v < V; v++) dq += d[v] * q[v];
    if (Math.abs(dq) < 1e-300) break;
    const al = rz / dq;
    for (let v = 0; v < V; v++) { p[v] += al * d[v]; r[v] -= al * q[v]; }
    rn = Math.sqrt(r.reduce((a, x) => a + x * x, 0));
    if (rn <= tol * r0) break;
    for (let v = 0; v < V; v++) z[v] = diag[v] > 0 ? r[v] / diag[v] : 0;
    project(z);
    let rz2 = 0; for (let v = 0; v < V; v++) rz2 += r[v] * z[v];
    const be = rz2 / (rz || 1e-300);
    for (let v = 0; v < V; v++) d[v] = z[v] + be * d[v];
    rz = rz2;
  }
  project(p);
  return { p, iters: it, residual: rn / r0 };
}

function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/** Terminals decide where current enters and leaves a component:
 *  - two or more (food sources, the inoculum): Tero 2010 — a random source/sink pair per iteration;
 *  - exactly one (a body with no food yet): it pumps toward its own growing tips (degree-1 nodes),
 *    the "front sink" of study/02 §4.3;
 *  - none: no current, so the component's veins decay. That is what dissolves stray fragments. */
function rightHandSide(g, comp, ncomp, terminalsByComp, tipsByComp, rng, I0) {
  const b = new Float64Array(g.nodes.length);
  for (let c = 0; c < ncomp; c++) {
    const T = terminalsByComp[c] || [];
    if (T.length >= 2) {
      // A fixed FRACTION of the terminals is active on each iteration, in random pairs: k = T/6 pairs,
      // so every food source is active a third of the time however many there are. Tero 2010 draws a
      // single pair, which gives each source a share of 2/T — the more food a network joined, the less
      // current each connection carried, until peripheral tubes fell under the survival threshold and
      // the 36-source fixture lost food it had reached (tests #8). Pairing ALL terminals at once fixes
      // that but turns the flows steady, and steady shared flows build Steiner trees and lose the loops
      // that fluctuation keeps (test #4). A third, drawn fresh each iteration, keeps both; for three
      // terminals it is exactly Tero's single pair.
      const k = Math.max(1, Math.round(T.length / 6));
      const order = T.slice();
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      for (let i = 0; i < k; i++) { b[order[2 * i]] += I0; b[order[2 * i + 1]] -= I0; }
    } else if (T.length === 1) {
      const tips = (tipsByComp[c] || []).filter((v) => v !== T[0]);
      if (!tips.length) continue;
      b[T[0]] += I0;
      for (const v of tips) b[v] -= I0 / tips.length;
    }
  }
  return b;
}

/** Iterate the adaptation. D is per edge and is updated in place; returns the last flux and the
 *  solver statistics. Deterministic for a given seed. */
export function adapt(g, D, terminals, {
  mode = 'sigmoid', mu = 1.8, Qh = 0.5, r = 1.0, dt = 0.25, iters = 24, I0 = 1.0, seed = 1,
  Dmin = 1e-4, Dmax = 8,
} = {}) {
  const { comp, count } = components(g);
  const terminalsByComp = [], tipsByComp = [];
  for (const v of new Set(terminals)) (terminalsByComp[comp[v]] ||= []).push(v);
  g.nodes.forEach((nd, v) => { if (nd.deg === 1) (tipsByComp[comp[v]] ||= []).push(v); });
  // Peel dead ends. In a component with two or more terminals, a branch that ends without reaching a
  // terminal carries exactly zero current (Kirchhoff), so it is removed before solving and simply
  // decays. This shrinks the system to the part that conducts: with 28-36 food terminals on a dish the
  // update had grown to 1-5 s. Components with one terminal keep their tips — those are its sinks.
  const isTerm = new Uint8Array(g.nodes.length); for (const v of terminals) isTerm[v] = 1;
  const deg = new Int32Array(g.nodes.length);
  for (const e of g.edges) { deg[e.a]++; deg[e.b]++; }
  const edgeOn = new Uint8Array(g.edges.length).fill(1);
  const inc = g.nodes.map(() => []); g.edges.forEach((e, i) => { inc[e.a].push(i); inc[e.b].push(i); });
  const queue = [];
  for (let v = 0; v < g.nodes.length; v++) if (deg[v] === 1 && !isTerm[v] && (terminalsByComp[comp[v]] || []).length >= 2) queue.push(v);
  while (queue.length) {
    const v = queue.pop();
    for (const ei of inc[v]) if (edgeOn[ei]) {
      edgeOn[ei] = 0; const e = g.edges[ei], w = e.a === v ? e.b : e.a;
      deg[v]--; deg[w]--;
      if (deg[w] === 1 && !isTerm[w]) queue.push(w);
    }
  }
  const live = []; g.edges.forEach((e, i) => { if (edgeOn[i]) live.push(i); });
  const sub = { nodes: g.nodes, edges: live.map((i) => g.edges[i]) };
  const rng = mulberry(seed);
  const Qabs = new Float64Array(g.edges.length);
  let solves = 0, maxResid = 0;
  const subCond = new Float64Array(live.length);
  for (let k = 0; k < iters; k++) {
    for (let j = 0; j < live.length; j++) { const i = live[j]; subCond[j] = D[i] / Math.max(g.edges[i].len_mm, 1e-6); }
    const b = rightHandSide(g, comp, count, terminalsByComp, tipsByComp, rng, I0);
    const { p, residual } = solvePressure(sub, subCond, b, comp, count, { tol: 1e-6 });   // flux needs 1e-6, not 1e-8
    solves++; maxResid = Math.max(maxResid, residual);
    const pOf = (v) => p[v];
    for (let i = 0; i < g.edges.length; i++) {
      const e = g.edges[i];
      const q = edgeOn[i] ? Math.abs((D[i] / Math.max(e.len_mm, 1e-6)) * (pOf(e.a) - pOf(e.b))) / I0 : 0;
      Qabs[i] = q;
      const f = mode === 'power' ? Math.pow(q, mu) : Math.pow(q, mu) / (Math.pow(Qh, mu) + Math.pow(q, mu));
      D[i] = Math.min(Dmax, Math.max(Dmin, D[i] + dt * (f - r * D[i])));
    }
  }
  return { Q: Qabs, components: count, solves, maxResidual: maxResid, solvedEdges: live.length };
}

/** Attach each point to the network where it actually touches it: the nearest point on any edge
 *  (edges taken as straight segments between their nodes), splitting that edge with a new node when
 *  the nearest point is interior. Nearest-NODE attachment missed every food source that a vein runs
 *  straight past with no junction nearby, so it never became a terminal, its branch carried no current
 *  and decayed — the P2 fixture lost 17 -> 4 food sources that way. Mutates g; returns node ids and
 *  the conductivity array extended for the split edges. */
export function attachPoints(g, D, points, reach) {
  const ids = [];
  let Dx = Array.from(D);
  for (const [x, y, r = 0] of points) {
    const lim = (r + reach) ** 2;
    let best = -1, bd = lim, bt = 0;
    for (let i = 0; i < g.edges.length; i++) {
      const e = g.edges[i], A = g.nodes[e.a], B = g.nodes[e.b];
      const vx = B.x - A.x, vy = B.y - A.y, L2 = vx * vx + vy * vy;
      const tt = L2 > 0 ? Math.max(0, Math.min(1, ((x - A.x) * vx + (y - A.y) * vy) / L2)) : 0;
      const d = (A.x + tt * vx - x) ** 2 + (A.y + tt * vy - y) ** 2;
      if (d < bd) { bd = d; best = i; bt = tt; }
    }
    if (best < 0) continue;
    const e = g.edges[best];
    if (bt < 0.05) { ids.push(e.a); continue; }
    if (bt > 0.95) { ids.push(e.b); continue; }
    const A = g.nodes[e.a], B = g.nodes[e.b];
    const v = g.nodes.length;
    g.nodes.push({ x: A.x + bt * (B.x - A.x), y: A.y + bt * (B.y - A.y), deg: 2 });
    const b0 = e.b, len = e.len_mm;
    e.b = v; e.len_mm = Math.max(len * bt, 1e-3);
    g.edges.push({ ...e, a: v, b: b0, len_mm: Math.max(len * (1 - bt), 1e-3) });
    Dx.push(Dx[best]);
    ids.push(v);
  }
  return { ids: [...new Set(ids)], D: Float64Array.from(Dx) };
}

/** Terminal nodes from points in grid mm: the node nearest each point, if within `reach` mm. */
export function nearestNodes(g, points, reach = 1.5) {
  const out = [];
  for (const [x, y] of points) {
    let best = -1, bd = reach * reach;
    g.nodes.forEach((nd, v) => { const d = (nd.x - x) ** 2 + (nd.y - y) ** 2; if (d < bd) { bd = d; best = v; } });
    if (best >= 0) out.push(best);
  }
  return [...new Set(out)];
}

/** Rasterise per-edge conductivity onto a gn x gn field covering `span` mm (max where edges cross),
 *  drawn as thick lines so the agents can sense a vein across its width. This field is also the
 *  memory between two extractions: a re-extracted edge starts from the field sampled along it. */
export let RASTER_RAD = 0;
export const setRasterRad = (r) => { RASTER_RAD = r; };
export function rasterise(g, D, gn, span, field = new Float32Array(gn * gn)) {
  field.fill(0);
  const cell = span / gn;
  g.edges.forEach((e, i) => {
    const A = g.nodes[e.a], B = g.nodes[e.b];
    const len = Math.hypot(B.x - A.x, B.y - A.y);
    const steps = Math.max(1, Math.ceil(len / (cell * 0.5)));
    // A CONSTANT radius, not the measured vein width: the kernel holds a trail floor under the field, so
    // a width-sized raster makes the next extraction measure a wider vein and the one after wider still
    // (veins grew into bands several mm across within a few updates — measured). A constant breaks that
    // loop. Radius 0 broke it too but left agents a one-cell target to sense (A/B in HANDOFF).
    const rad = RASTER_RAD;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const cx = Math.floor((A.x + (B.x - A.x) * t) / cell), cy = Math.floor((A.y + (B.y - A.y) * t) / cell);
      for (let oy = -rad; oy <= rad; oy++) for (let ox = -rad; ox <= rad; ox++) {
        const x = cx + ox, y = cy + oy;
        if (x < 0 || y < 0 || x >= gn || y >= gn) continue;
        const k = y * gn + x;
        if (D[i] > field[k]) field[k] = D[i];
      }
    }
  });
  return field;
}

/** Initial conductivity for a freshly extracted graph: the previous field sampled along each edge,
 *  or D0 for an edge that did not exist last time. */
export function sampleField(g, field, gn, span, D0 = 0.3) {
  const cell = span / gn;
  return Float64Array.from(g.edges, (e) => {
    const A = g.nodes[e.a], B = g.nodes[e.b];
    let s = 0, c = 0;
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      const x = Math.floor((A.x + (B.x - A.x) * t) / cell), y = Math.floor((A.y + (B.y - A.y) * t) / cell);
      if (x >= 0 && y >= 0 && x < gn && y < gn) { s += field[y * gn + x]; c++; }
    }
    const v = c ? s / c : 0;
    return v > 1e-3 ? v : D0;
  });
}
