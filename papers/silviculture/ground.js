// Chapter 3, the ground: one grid, the landscape-evolution step in two solvers, two noise generators and one
// harness that measures any heightfield the way paper 0 measured its region. Paper 0's kernels are imported, not
// copied: ε-Priority-Flood, Rho8 receivers, drainage over flats, the Braun–Willett stack and accumulation
// (papers/fractals/landscape-terrain.js), and the drainage statistics with Earth's ranges (landscape-stats.js).
//
// The stream-power step (3.1) is the simplest form of the law: uniform uplift U, ∂h/∂t = U − K·A^m·S^n with
// m = 0.45, n = 1, optional hillslope creep D∇²h, every edge an outlet at height 0. Two solvers on the same grid:
//   implicit (Braun & Willett 2013): receivers first, h_i ← (h_i + U·dt + F·h_r)/(1 + F), F = K·A^m·dt/Δ;
//   explicit: h_i ← h_i + U·dt − K·A^m·(h_i − h_r)/Δ·dt, stable only while F < 1 (a Courant condition).
// The two noise generators (3.4) are the baselines every learned or procedural terrain is compared to:
// fBm by diamond-square (paper 0's 2.3) and ridged multifractal noise (Musgrave's form, octaves of (1 − |n|)²).
// Liberties: no strata, no talus, no lakes trapping sediment, no climate; channels from A ≥ 0.05 km² as in paper 0.
import { flood, receivers, resolveFlats, buildStack, accumulate, diamondSquare, noise2, hash32 } from '../fractals/landscape-terrain.js';
import { computeStats, EARTH } from '../fractals/landscape-stats.js';

export { EARTH };
export const SIZE = 10000, CELLS = 257, M = 0.45, A_C = 5e4;
const DX = [1, 1, 0, -1, -1, -1, 0, 1], DY = [0, 1, 1, 1, 0, -1, -1, -1];

class MinHeap {
  constructor(cap) { this.k = new Float64Array(cap + 1); this.v = new Int32Array(cap + 1); this.n = 0; }
  push(key, val) { const k = this.k, v = this.v; let i = ++this.n; while (i > 1) { const p = i >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; } k[i] = key; v[i] = val; }
  pop() {
    const k = this.k, v = this.v, top = v[1], lk = k[this.n], lv = v[this.n], n = --this.n; let i = 1;
    for (;;) { let c = i << 1; if (c > n) break; if (c < n && k[c + 1] < k[c]) c++; if (k[c] >= lk) break; k[i] = k[c]; v[i] = v[c]; i = c; }
    k[i] = lk; v[i] = lv; return top;
  }
}

/** a grid with the fields paper 0's kernels read; every edge cell is an outlet */
export function makeGrid(n = CELLS, size = SIZE) {
  const N = n * n, cell = size / (n - 1);
  const g = {
    n, N, S: size, cell, cellA: cell * cell, iter: 0,
    h: new Float64Array(N), w: new Float64Array(N), tmp: new Float64Array(N),
    rec: new Int32Array(N), rdist: new Float32Array(N), stack: new Int32Array(N), A: new Float64Array(N), qs: new Float64Array(N),
    ndon: new Int32Array(N + 1), don: new Int32Array(N), seed: new Uint8Array(N), seedList: null,
    closed: new Uint8Array(N), pit: new Int32Array(N), heap: new MinHeap(N), off: new Int32Array(8), dist: new Float32Array(8),
  };
  for (let k = 0; k < 8; k++) { g.off[k] = DY[k] * n + DX[k]; g.dist[k] = cell * (k & 1 ? Math.SQRT2 : 1); }
  const seeds = [];
  for (let i = 0; i < N; i++) { const x = i % n, y = (i - x) / n; if (x === 0 || y === 0 || x === n - 1 || y === n - 1) { g.seed[i] = 1; seeds.push(i); } }
  g.seedList = Int32Array.from(seeds);
  return g;
}
export function hydro(g, flats = false) { g.iter++; flood(g); receivers(g); if (flats) resolveFlats(g); buildStack(g); accumulate(g); }

// ------------------------------------------------------------------------------------------- generators
const norm = (h, relief) => { let lo = Infinity, hi = -Infinity; for (const v of h) { if (v < lo) lo = v; if (v > hi) hi = v; } const s = relief / (hi - lo || 1); for (let i = 0; i < h.length; i++) h[i] = (h[i] - lo) * s; return h; };
/** fBm by diamond-square, Hurst H, scaled to `relief` metres */
export function fbm(g, seed, H = 0.8, relief = 1500) {
  const d = diamondSquare(g.n - 1, H, hash32(seed, 3, 0xfb));
  for (let i = 0; i < g.N; i++) g.h[i] = d.z[i];
  norm(g.h, relief); return g;
}
/** ridged multifractal noise: Σ w_k·(1 − |noise|)², each octave weighted by the one before (Musgrave 1994) */
export function ridged(g, seed, relief = 1500, oct = 8) {
  const n = g.n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    let f = 3 / n, a = 1, sum = 0, wgt = 1;
    for (let o = 0; o < oct; o++) { let s = 1 - Math.abs(noise2(i * f, j * f, seed * 31 + o)); s *= s; s *= wgt; wgt = Math.min(1, s * 2); sum += s * a; f *= 2; a *= 0.5; }
    g.h[j * n + i] = sum;
  }
  norm(g.h, relief); return g;
}

// ------------------------------------------------------------------------------------------- stream power (3.1)
export function createSPL({ seed = 1, n = CELLS, U = 5e-4, K = 1.2e-5, D = 0.02 } = {}) {
  const g = makeGrid(n);
  const P = { U, K, D, dt: 1e5, solver: 'implicit', creep: true };
  let t = 0, courant = 0, change = 0;
  const init = () => { // a low fBm surface, 20 m of roughness: the drainage starts from noise
    const d = diamondSquare(n - 1, 0.6, hash32(seed, 9, 0x5b1));
    let lo = Infinity, hi = -Infinity; for (const v of d.z) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    for (let i = 0; i < g.N; i++) g.h[i] = g.seed[i] ? 0 : 20 * (d.z[i] - lo) / (hi - lo);
    t = 0;
  };
  init();
  const old = new Float64Array(g.N);
  function creep(dt) {
    const r = P.D * dt / g.cellA, ns = Math.max(1, Math.ceil(r / 0.2)), rr = r / ns;
    let a = g.h, b = g.tmp;
    for (let s = 0; s < ns; s++) {
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const k = y * n + x; if (g.seed[k]) { b[k] = a[k]; continue; }
        b[k] = a[k] + rr * (a[k - 1] + a[k + 1] + a[k - n] + a[k + n] - 4 * a[k]);
      }
      const tt = a; a = b; b = tt;
    }
    if (a !== g.h) g.h.set(a);
  }
  function step() {
    hydro(g);
    old.set(g.h);
    const { h, rec, rdist, stack, A } = g, dt = P.dt;
    let cmax = 0;
    if (P.solver === 'implicit') {
      for (let j = 0; j < g.nstack; j++) {
        const i = stack[j], r = rec[i]; if (r === i) continue;
        const F = P.K * Math.pow(A[i], M) * dt / rdist[i]; if (F > cmax) cmax = F;
        h[i] = (h[i] + P.U * dt + F * h[r]) / (1 + F);
      }
    } else {
      // explicit: every cell from the old surface; overshoot is the instability
      for (let i = 0; i < g.N; i++) {
        const r = rec[i]; if (r === i) continue;
        const F = P.K * Math.pow(A[i], M) * dt / rdist[i]; if (F > cmax) cmax = F;
        h[i] = Math.max(-3000, Math.min(9000, old[i] + P.U * dt - F * (old[i] - old[r])));
      }
    }
    if (P.creep) creep(dt);
    let ch = 0; for (let i = 0; i < g.N; i++) if (!g.seed[i]) ch = Math.max(ch, Math.abs(h[i] - old[i]) / dt);
    change = ch / P.U; courant = cmax; t += dt;
    return true;
  }
  const stats = () => { let mx = 0, mean = 0, c = 0; for (let i = 0; i < g.N; i++) if (!g.seed[i]) { mx = Math.max(mx, g.h[i]); mean += g.h[i]; c++; } return { t, max: mx, mean: mean / c, courant, change }; };
  return { g, P, step, init, stats, get t() { return t; } };
}

// ------------------------------------------------------------------------------------------- the harness
/** Strahler order on channel cells (A ≥ A_C), as paper 0 does it */
export function strahler(g, land) {
  const { N, rec, A, stack } = g, ns = g.nstack;
  const order = new Uint8Array(N), mx = new Uint8Array(N), cnt = new Uint8Array(N);
  for (let j = ns - 1; j >= 0; j--) {
    const i = stack[j]; if (A[i] < A_C || (land && !land[i])) continue;
    order[i] = mx[i] === 0 ? 1 : cnt[i] >= 2 ? mx[i] + 1 : mx[i];
    const r = rec[i];
    if (r !== i && A[r] >= A_C) { if (order[i] > mx[r]) { mx[r] = order[i]; cnt[r] = 1; } else if (order[i] === mx[r]) cnt[r]++; }
  }
  return order;
}
/**
 * Measure a heightfield (g.h, metres, on a 10 km grid). Pits are filled first (Priority-Flood), as every drainage
 * analysis does; the fill depth (mean metres of water the pits would hold) says how much of the surface does not
 * drain on its own. Network statistics come from paper 0's computeStats on the filled surface.
 */
export function measureGround(g) {
  hydro(g, true);
  const { N, n, h, w, rec, cellA } = g;
  let fill = 0, pits = 0;
  for (let i = 0; i < N; i++) { const d = w[i] - h[i]; if (d > 0.01) { fill += d; pits++; } }
  const order = strahler(g);
  const slope = new Float32Array(N), receiver = new Int32Array(N), waterKind = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const r = rec[i]; receiver[i] = r === i ? -1 : r;
    slope[i] = r === i ? 0 : Math.atan(Math.max(0, h[i] - h[r]) / g.rdist[i]);
    if (w[i] - h[i] > 0.3) waterKind[i] = 2;
  }
  const t = { n, cell_m: g.cell, receiver, area: g.A, height: w, order, waterKind, slope, seaLevel: null };
  const s = computeStats(t, { stack: g.stack.slice(0, g.nstack), rdist: g.rdist });
  s.fill_m = fill / N; s.pit_share = pits / N; s.order = order;
  return s;
}
/** the same numbers from a paper 0 Terrain (already measured at generation) */
export const KEYS = ['hack_h', 'tau', 'horton_Rb', 'horton_Rl', 'concavity', 'hypsometric_integral'];
