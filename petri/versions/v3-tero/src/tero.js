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
      const s = T[Math.floor(rng() * T.length)];
      let t = s; while (t === s) t = T[Math.floor(rng() * T.length)];
      b[s] += I0; b[t] -= I0;
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
  const rng = mulberry(seed);
  const cond = new Float64Array(g.edges.length);
  const Qabs = new Float64Array(g.edges.length);
  let solves = 0, maxResid = 0;
  for (let k = 0; k < iters; k++) {
    for (let i = 0; i < g.edges.length; i++) cond[i] = D[i] / Math.max(g.edges[i].len_mm, 1e-6);
    const b = rightHandSide(g, comp, count, terminalsByComp, tipsByComp, rng, I0);
    const { p, residual } = solvePressure(g, cond, b, comp, count);
    solves++; maxResid = Math.max(maxResid, residual);
    for (let i = 0; i < g.edges.length; i++) {
      const e = g.edges[i];
      const q = Math.abs(cond[i] * (p[e.a] - p[e.b])) / I0;
      Qabs[i] = q;
      const f = mode === 'power' ? Math.pow(q, mu) : Math.pow(q, mu) / (Math.pow(Qh, mu) + Math.pow(q, mu));
      D[i] = Math.min(Dmax, Math.max(Dmin, D[i] + dt * (f - r * D[i])));
    }
  }
  return { Q: Qabs, components: count, solves, maxResidual: maxResid };
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
export function rasterise(g, D, gn, span, field = new Float32Array(gn * gn)) {
  field.fill(0);
  const cell = span / gn;
  g.edges.forEach((e, i) => {
    const A = g.nodes[e.a], B = g.nodes[e.b];
    const len = Math.hypot(B.x - A.x, B.y - A.y);
    const steps = Math.max(1, Math.ceil(len / (cell * 0.5)));
    const rad = Math.max(0, Math.round((0.5 * e.width_mm) / cell));
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
