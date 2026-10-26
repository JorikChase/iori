// The field library: what weighs the species of a chimera (ops.js mix.*) against each other.
//
// A field returns, at an evaluation point x (4-D) with the orbit's running context, one weight per
// species (they sum to 1), each weight's gradient in x, and each weight's derivative in the field's
// reading (the self-fields: trap, depth, λ). Two families:
//
//   scalar  a real s(x) — 0 for mix, a ramp for axis, a shell for sphere, fBm for noise, a running
//           reading for trap / depth / lyap — placed on the species' line by
//             u = (k − 1)·σ(logit w + s)
//           and shared between the two species u falls between (hat functions). For two species that
//           is ω_B = σ(logit w + s): w = 0 or 1 is one pure species whatever the field.
//   tissue  Voronoi cells: n sites in a box of half-size `size`, site j a cell of species j mod k,
//           soft walls from a softmax over −|x − x_j|² / (soft·size)
//
// Frame: `at` 0 evaluates the field at the orbit point every iteration (a new dynamics: the species
// depend on where the orbit is); `at` 1 at the world point the orbit started from, once (a spatial
// tissue: each place in the world has its blend). Self-fields read the orbit, so they have no frame.
//
// The hash is the WGSL one (gpu/wgsl.js FIELDS) bit for bit, so CPU and GPU draw the same sites and noise.

export const FIELD_KIND = { mix: 0, 'mix.axis': 1, 'mix.sphere': 2, 'mix.noise': 3, 'mix.tissue': 4, 'mix.trap': 5, 'mix.depth': 6, 'mix.lyap': 7 };
export const SELF_KINDS = new Set(['mix.trap', 'mix.depth', 'mix.lyap']);

// PCG hash on u32
export function fhash(v) {
  const s = (Math.imul(v >>> 0, 747796405) + 2891336453) >>> 0;
  const w = Math.imul(((s >>> ((s >>> 28) + 4)) ^ s) >>> 0, 277803737) >>> 0;
  return ((w >>> 22) ^ w) >>> 0;
}
const unit = (h) => (h >>> 8) / 16777216;

// value of the lattice point (i, j, k, l) for a seed, in [−1, 1)
function lattice(i, j, k, l, seed) {
  const h = (Math.imul(i, 0x8da6b343) ^ Math.imul(j, 0xd8163841) ^ Math.imul(k, 0xcb1ab31f) ^ Math.imul(l, 0x165667b1) ^ Math.imul(seed, 0x27d4eb2f)) >>> 0;
  return unit(fhash(h)) * 2 - 1;
}

// 4-D value noise with the quintic fade, and its gradient
export function noise4(x, seed) {
  const i = x.map(Math.floor), t = x.map((v, a) => v - i[a]);
  const u = t.map((v) => v * v * v * (v * (v * 6 - 15) + 10));
  const du = t.map((v) => 30 * v * v * (v - 1) * (v - 1));
  let n = 0;
  const g = [0, 0, 0, 0];
  for (let c = 0; c < 16; c++) {
    const b = [c & 1, (c >> 1) & 1, (c >> 2) & 1, (c >> 3) & 1];
    const v = lattice(i[0] + b[0], i[1] + b[1], i[2] + b[2], i[3] + b[3], seed);
    const f = b.map((bit, a) => (bit ? u[a] : 1 - u[a]));
    n += v * f[0] * f[1] * f[2] * f[3];
    for (let a = 0; a < 4; a++) {
      let p = b[a] ? du[a] : -du[a];
      for (let o = 0; o < 4; o++) if (o !== a) p *= f[o];
      g[a] += v * p;
    }
  }
  return { n, g };
}

// fBm: octaves of noise, each twice the frequency and half the amplitude, shifted so they decorrelate
export function fbm(x, freq, octaves, seed) {
  let n = 0, a = 1, f = freq;
  const g = [0, 0, 0, 0];
  for (let o = 0; o < octaves; o++) {
    const r = noise4(x.map((v, k) => v * f + 17.3 * o * (k + 1)), seed + o);
    n += a * r.n;
    for (let k = 0; k < 4; k++) g[k] += a * f * r.g[k];
    a *= 0.5; f *= 2;
  }
  return { n, g };
}

// site j of a tissue: uniform in the box of half-size `size`
export function site(seed, j, size) {
  return [0, 1, 2, 3].map((a) => size * (2 * unit(fhash((Math.imul(seed, 0x9e3779b9) ^ Math.imul(j * 4 + a + 1, 0x85ebca6b)) >>> 0)) - 1));
}

const zero4 = () => [0, 0, 0, 0];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];

// the field's running reading for the self-fields
export function reading(kind, ctx) {
  if (kind === 'mix.trap') return ctx.trap;
  if (kind === 'mix.depth') return ctx.i / ctx.n;
  if (kind === 'mix.lyap') return Math.log(Math.max(ctx.dr, 1e-30)) / (ctx.i + 1);
  return 0;
}

// An orbit-frame field is read inside the ball of radius FIELD_R, where the fractal lives, and on its
// sphere beyond: an escaping orbit sees the field change with its direction only. Without this a field
// that keeps varying far out (noise) meets species whose results are |p| apart, and float32 orbits
// lose each other within a few iterations (measured: CPU vs GPU 0.4 apart after 12 at gain 2).
export const FIELD_R = 2;
export function orbitWeights(op, P, k, x, ctx) {
  const r = Math.hypot(...x);
  if (!(r > FIELD_R)) return weights(op, P, k, x, ctx);
  const y = x.map((v) => (v * FIELD_R) / r), W = weights(op, P, k, y, ctx);
  // ∂y/∂x = (R/r)(I − x̂x̂ᵀ), symmetric: G_x = (R/r)(G_y − x̂ (x̂·G_y))
  const xh = x.map((v) => v / r);
  W.G = W.G.map((g) => { const d = dot(xh, g); return g.map((v, a) => (FIELD_R / r) * (v - xh[a] * d)); });
  return W;
}

// The weights of k species at x. Returns { w: [k], G: [k][4] (∂ω/∂x), S: [k] (∂ω/∂reading) }.
export function weights(op, P, k, x, ctx) {
  const w = new Array(k).fill(0), G = Array.from({ length: k }, zero4), S = new Array(k).fill(0);
  if (op === 'mix.tissue') {
    const n = Math.round(P.n), size = P.size, tau = Math.max(P.soft * size, 1e-9), seed = Math.round(P.seed);
    const sites = Array.from({ length: n }, (_, j) => site(seed, j, size));
    const e = sites.map((y) => { const d = x.map((v, a) => v - y[a]); return -dot(d, d) / tau; });
    const m = Math.max(...e);
    const pi = e.map((v) => Math.exp(v - m)), Z = pi.reduce((a, b) => a + b, 0);
    const ebar = zero4();
    sites.forEach((y, j) => { pi[j] /= Z; for (let a = 0; a < 4; a++) ebar[a] += pi[j] * (-2 * (x[a] - y[a]) / tau); });
    sites.forEach((y, j) => {
      const i = j % k;
      w[i] += pi[j];
      for (let a = 0; a < 4; a++) G[i][a] += pi[j] * (-2 * (x[a] - y[a]) / tau);
    });
    for (let i = 0; i < k; i++) for (let a = 0; a < 4; a++) G[i][a] -= w[i] * ebar[a];
    return { w, G, S };
  }
  // scalar fields: s and its gradient (in x) or its derivative in the reading
  if (P.w <= 0 || P.w >= 1) { w[P.w <= 0 ? 0 : k - 1] = 1; return { w, G, S }; }
  let s = 0, gs = zero4(), sr = 0;
  if (op === 'mix.axis') {
    const nl = Math.hypot(P.nx, P.ny, P.nz, P.nw) || 1, n = [P.nx, P.ny, P.nz, P.nw].map((v) => v / nl);
    s = P.g * dot(n, x); gs = n.map((v) => P.g * v);
  } else if (op === 'mix.sphere') {
    const d = [x[0] - P.cx, x[1] - P.cy, x[2] - P.cz, x[3] - P.cw], r = Math.hypot(...d);
    s = P.g * (r - P.r); if (r > 0) gs = d.map((v) => (P.g * v) / r);
  } else if (op === 'mix.noise') {
    const f = fbm(x, P.f, Math.round(P.o), Math.round(P.seed));
    s = P.g * f.n; gs = f.g.map((v) => P.g * v);
  } else if (op === 'mix.trap') {
    s = P.g * (ctx.trap - P.t); sr = P.g;
  } else if (op === 'mix.depth') {
    s = P.g * (ctx.i / ctx.n - 0.5); sr = P.g;
  } else if (op === 'mix.lyap') {
    s = P.g * reading(op, ctx); sr = P.g;
  }
  const sg = 1 / (1 + Math.exp(-(Math.log(P.w / (1 - P.w)) + s)));
  const u = (k - 1) * sg, du = (k - 1) * sg * (1 - sg);
  const i0 = Math.min(Math.max(Math.floor(u), 0), k - 2), t = u - i0;
  w[i0] = 1 - t; w[i0 + 1] = t;
  for (let a = 0; a < 4; a++) { G[i0][a] = -du * gs[a]; G[i0 + 1][a] = du * gs[a]; }
  S[i0] = -du * sr; S[i0 + 1] = du * sr;
  return { w, G, S };
}
