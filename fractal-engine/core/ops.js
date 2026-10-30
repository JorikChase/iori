// The transform library. The orbit lives in 4-D: every point is [x, y, z, w]. One entry per op:
//   params  — positional parameters with defaults and ranges (the notation is positional, JSON is keyed)
//   wRule   — how it changes the running derivative dr used by distance estimates:
//             'unchanged' (isometries), 'mul' (dr *= k, k returned by fwd), 'plus' (dr += 1, the +c),
//             'none' (no honest factor: flame variations; the formula is then not pullSafe)
//   fwd     — the forward map on state s = {p, c}; mutates s.p; returns {k?, branch}
//   jac     — analytic 4×4 Jacobian at p, or undefined (the CPU backend then differentiates numerically)
//   inv     — one preimage of p under the op, choosing a branch with rng.pick; null when the point has
//             none; an op with inv: null has no inverse (push applies fwd, as flames do)
//   glyph   — the UI glyph id; no words anywhere else
//   seed    — the estimate read at the end of the orbit, for the formulas r/dr cannot measure:
//             seed(p, dr, P) → { v, g, dr, t } (see the seeds below)
//
// The 3-D families (box and sphere folds, the White–Nylander bulb, complex powers, flames) leave w
// alone or treat it like any other axis, so a 3-D formula on the default slice (w = 0) is exactly what
// it was. The 4-D ones — rotate4, sort4, bulb4, quat — use all four.
//
// Push and pull are the same formula in opposite directions: the preimages of an expanding fold are the
// branches of a contracting IFS.

import { I4, dot, len, len2, add, sub, mul, normalize, diag, scaled, reflection, rotationXYZ, rotation4, lift4, transpose, matVec } from './vec.js';

const p = (k, d, min, max) => ({ k, d, min, max });
const TAU = 2 * Math.PI;

export const OPS = {};
const def = (o) => { OPS[o.name] = o; return o; };

// ---------- affine ----------------------------------------------------------------------------

def({
  name: 'translate', alias: ['+'], glyph: 'translate', wRule: 'unchanged',
  params: [p('x', 0), p('y', 0), p('z', 0), p('w', 0)],
  fwd(s, P) { s.p = add(s.p, [P.x, P.y, P.z, P.w]); return { branch: 0 }; },
  jac: () => I4(),
  inv: (q, P) => sub(q, [P.x, P.y, P.z, P.w]),
});

// p += c, where c is the orbit's constant (the point itself for a Mandelbrot-type set, a fixed value
// for a Julia set)
def({
  name: '+c', glyph: 'c', wRule: 'plus',
  params: [],
  fwd(s) { s.p = add(s.p, s.c); return { branch: 0 }; },
  jac: () => I4(),
  inv: (q, P, rng, s) => sub(q, s.c),
});

def({
  name: 'scale', glyph: 'scale', wRule: 'mul',
  params: [p('s', 2, -64, 64)],
  fwd(s, P) { s.p = mul(s.p, P.s); return { k: Math.abs(P.s), branch: 0 }; },
  jac: (q, P) => diag(P.s, P.s, P.s, P.s),
  inv: (q, P) => (P.s === 0 ? null : mul(q, 1 / P.s)),
});

// the 3-D Euler rotation (w untouched)
def({
  name: 'rotate', glyph: 'rotate', wRule: 'unchanged',
  params: [p('x', 0), p('y', 0), p('z', 0)],
  fwd(s, P) { s.p = matVec(lift4(rotationXYZ(P.x, P.y, P.z)), s.p); return { branch: 0 }; },
  jac: (q, P) => lift4(rotationXYZ(P.x, P.y, P.z)),
  inv: (q, P) => matVec(transpose(lift4(rotationXYZ(P.x, P.y, P.z))), q),
});

// the six planes of 4-D rotation, in degrees
def({
  name: 'rotate4', glyph: 'rotate4', wRule: 'unchanged',
  params: [p('xy', 0), p('xz', 0), p('xw', 0), p('yz', 0), p('yw', 0), p('zw', 0)],
  fwd(s, P) { s.p = matVec(rotation4([P.xy, P.xz, P.xw, P.yz, P.yw, P.zw]), s.p); return { branch: 0 }; },
  jac: (q, P) => rotation4([P.xy, P.xz, P.xw, P.yz, P.yw, P.zw]),
  inv: (q, P) => matVec(transpose(rotation4([P.xy, P.xz, P.xw, P.yz, P.yw, P.zw])), q),
});

// ---------- folds ------------------------------------------------------------------------------
// A fold is many-to-one. fwd takes the branch the point's position dictates; inv picks one of the
// valid preimages at random. Every fold is an isometry piecewise, so dr is unchanged.

// reflect p across the hyperplane n·p = d when it lies on the n·p < d side (nw last: older formulas
// wrote nx ny nz d)
def({
  name: 'fold.plane', glyph: 'plane', wRule: 'unchanged',
  params: [p('nx', 1), p('ny', 0), p('nz', 0), p('d', 0), p('nw', 0)],
  fwd(s, P) {
    const n = normalize([P.nx, P.ny, P.nz, P.nw]);
    const t = dot(s.p, n) - P.d;
    if (t < 0) { s.p = sub(s.p, mul(n, 2 * t)); return { branch: 1 }; }
    return { branch: 0 };
  },
  jac(q, P) {
    const n = normalize([P.nx, P.ny, P.nz, P.nw]);
    return dot(q, n) - P.d < 0 ? reflection(n) : I4();
  },
  inv(q, P, rng) {
    const n = normalize([P.nx, P.ny, P.nz, P.nw]);
    const t = dot(q, n) - P.d;
    if (t < 0) return null; // nothing maps to the far side
    return rng.pick(2) ? sub(q, mul(n, 2 * t)) : q;
  },
});

// Mandelbox box fold, every axis: x → clamp(x, −l, l)·2 − x
def({
  name: 'fold.box', glyph: 'box', wRule: 'unchanged',
  params: [p('l', 1, 0, 64)],
  fwd(s, P) {
    let branch = 0;
    s.p = s.p.map((x, i) => {
      if (x > P.l) { branch += 1 * 3 ** i; return 2 * P.l - x; }
      if (x < -P.l) { branch += 2 * 3 ** i; return -2 * P.l - x; }
      return x;
    });
    return { branch };
  },
  jac(q, P) { return diag(...q.map((x) => (Math.abs(x) > P.l ? -1 : 1))); },
  inv(q, P, rng) {
    return q.map((y) => {
      const c = [];
      if (Math.abs(y) <= P.l) c.push(y);
      if (y < P.l) c.push(2 * P.l - y);   // came from above
      if (y > -P.l) c.push(-2 * P.l - y); // came from below
      return c[rng.pick(c.length)];
    });
  },
});

// the box fold with a limit per axis (the pseudo-Kleinian's cell): a limit is a limit, 0 mirrors the axis
const CELL = ['lx', 'ly', 'lz', 'lw'];
def({
  name: 'fold.cell', glyph: 'cell', wRule: 'unchanged',
  params: [p('lx', 1, 0, 64), p('ly', 1, 0, 64), p('lz', 1, 0, 64), p('lw', 1, 0, 64)],
  fwd(s, P) {
    let branch = 0;
    s.p = s.p.map((x, i) => {
      const l = P[CELL[i]];
      if (x > l) { branch += 1 * 3 ** i; return 2 * l - x; }
      if (x < -l) { branch += 2 * 3 ** i; return -2 * l - x; }
      return x;
    });
    return { branch };
  },
  jac(q, P) { return diag(...q.map((x, i) => (Math.abs(x) > P[CELL[i]] ? -1 : 1))); },
  inv(q, P, rng) {
    return q.map((y, i) => {
      const l = P[CELL[i]], c = [];
      if (Math.abs(y) <= l) c.push(y);
      if (y < l) c.push(2 * l - y);
      if (y > -l) c.push(-2 * l - y);
      return c[rng.pick(c.length)];
    });
  },
});

// the lattice: every axis wrapped into [−l, l); l = 0 leaves the axis alone. Space becomes one cell, so
// an inversion after it repeats for ever (the Apollonian family). The preimages are the lattice's
// translates; the walk takes the cell or a neighbour
def({
  name: 'wrap', glyph: 'wrap', wRule: 'unchanged',
  params: [p('lx', 1, 0, 64), p('ly', 1, 0, 64), p('lz', 1, 0, 64), p('lw', 0, 0, 64)],
  fwd(s, P) {
    let branch = 0;
    s.p = s.p.map((x, i) => {
      const l = P[CELL[i]];
      if (!(l > 0)) return x;
      const m = Math.floor(x / (2 * l) + 0.5);
      if (m !== 0) branch += 1 << i;
      return x - 2 * l * m;
    });
    return { branch };
  },
  jac: () => I4(),
  inv(q, P, rng) {
    const o = [...q];
    for (let i = 0; i < 4; i++) {
      const l = P[CELL[i]];
      if (!(l > 0)) continue;
      if (q[i] < -l || q[i] > l) return null;
      o[i] = q[i] + 2 * l * (rng.pick(3) - 1);
    }
    return o;
  },
});

// Mandelbox sphere fold: |p| < rmin → scale by rfix²/rmin²; rmin ≤ |p| < rfix → invert in the rfix sphere.
// rmin = 0 is the bare inversion k = max(rfix²/|p|², 1) of the Kleinian families
def({
  name: 'fold.sphere', glyph: 'sphere', wRule: 'mul',
  params: [p('rmin', 0.5, 0, 64), p('rfix', 1, 1e-6, 64)],
  fwd(s, P) {
    const r2 = len2(s.p), m2 = P.rmin * P.rmin, f2 = P.rfix * P.rfix;
    if (r2 < m2) { const k = f2 / m2; s.p = mul(s.p, k); return { k, branch: 0 }; }
    if (r2 < f2) { const k = f2 / r2; s.p = mul(s.p, k); return { k, branch: 1 }; }
    return { k: 1, branch: 2 };
  },
  jac(q, P) {
    const r2 = len2(q), m2 = P.rmin * P.rmin, f2 = P.rfix * P.rfix;
    if (r2 < m2) return scaled(I4(), f2 / m2);
    if (r2 < f2) {
      const k = f2 / r2, J = scaled(I4(), k);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) J[i * 4 + j] -= 2 * k * q[i] * q[j] / r2;
      return J;
    }
    return I4();
  },
  inv(q, P, rng) {
    const r = len(q), m2 = P.rmin * P.rmin, f2 = P.rfix * P.rfix, c = [];
    const k0 = f2 / m2;
    if (P.rmin > 0 && r / k0 < P.rmin) c.push(mul(q, 1 / k0));
    if (r > P.rfix && r <= f2 / P.rmin) c.push(mul(q, f2 / (r * r)));
    if (r >= P.rfix) c.push(q);
    return c.length ? c[rng.pick(c.length)] : null;
  },
});

// per-axis absolute value: the coordinate-hyperplane folds at once
def({
  name: 'abs', glyph: 'abs', wRule: 'unchanged',
  params: [],
  fwd(s) {
    let branch = 0;
    s.p = s.p.map((x, i) => { if (x < 0) branch += 1 << i; return Math.abs(x); });
    return { branch };
  },
  jac: (q) => diag(...q.map((x) => (x < 0 ? -1 : 1))),
  inv(q, P, rng) { if (q.some((x) => x < 0)) return null; return q.map((x) => (rng.pick(2) ? -x : x)); },
});

// sort x, y, z descending (with abs, the Menger / octahedral fold); w untouched
const sortFwd = (k) => (s) => {
  const idx = [...Array(k).keys()].sort((a, b) => s.p[b] - s.p[a]);
  const out = [...s.p];
  idx.forEach((src, row) => { out[row] = s.p[src]; });
  s.p = out;
  // the branch is the permutation's rank, as a mixed-radix number
  return { branch: idx.reduce((a, v) => a * k + v, 0) };
};
const sortJac = (k) => (q) => {
  const idx = [...Array(k).keys()].sort((a, b) => q[b] - q[a]);
  const J = I4();
  for (let r = 0; r < k; r++) for (let c = 0; c < 4; c++) J[r * 4 + c] = 0;
  idx.forEach((src, row) => { J[row * 4 + src] = 1; });
  return J;
};
const perms = (k) => {
  const out = [];
  const go = (rest, acc) => { if (!rest.length) out.push(acc); else rest.forEach((x, i) => go([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, x])); };
  go([...Array(k).keys()], []);
  return out;
};
const PERMS3 = perms(3), PERMS4 = perms(4);
const sortInv = (k, all) => (q, P, rng) => {
  for (let i = 0; i + 1 < k; i++) if (!(q[i] >= q[i + 1])) return null;
  const perm = all[rng.pick(all.length)];
  const out = [...q];
  perm.forEach((dst, i) => { out[dst] = q[i]; });
  return out;
};
def({ name: 'sort', glyph: 'sort', wRule: 'unchanged', params: [], fwd: sortFwd(3), jac: sortJac(3), inv: sortInv(3, PERMS3) });
def({ name: 'sort4', glyph: 'sort4', wRule: 'unchanged', params: [], fwd: sortFwd(4), jac: sortJac(4), inv: sortInv(4, PERMS4) });

// ---------- powers -----------------------------------------------------------------------------

// Mandelbulb power (White–Nylander spherical triplex) on x, y, z; w untouched. dr *= n·r^(n−1)
def({
  name: 'bulb', glyph: 'bulb', wRule: 'mul',
  params: [p('n', 8, 1, 64)],
  fwd(s, P) {
    const [x, y, z, w] = s.p;
    const r = Math.hypot(x, y, z);
    if (r === 0) return { k: 0, branch: 0 };
    const theta = Math.acos(Math.max(-1, Math.min(1, z / r))), phi = Math.atan2(y, x);
    const rn = r ** P.n, t = theta * P.n, f = phi * P.n;
    s.p = [rn * Math.sin(t) * Math.cos(f), rn * Math.sin(t) * Math.sin(f), rn * Math.cos(t), w];
    return { k: P.n * r ** (P.n - 1), branch: 0 };
  },
  inv(q, P, rng) {
    // the forward map reads θ ∈ [0, π] off the point, so a preimage's polar angle must lie there; the
    // candidates are (±θ + 2πk)/n (φ shifted by π for −), every azimuth (φ + 2πj)/n — each checked
    const r = Math.hypot(q[0], q[1], q[2]);
    if (r === 0) return q;
    const theta = Math.acos(Math.max(-1, Math.min(1, q[2] / r))), phi = Math.atan2(q[1], q[0]);
    const n = Math.max(1, Math.round(P.n)), rn = r ** (1 / P.n), c = [];
    for (const sg of [1, -1]) for (let k = 0; k < n; k++) {
      const t = (sg * theta + TAU * k) / P.n;
      if (t < 0 || t > Math.PI) continue;
      for (let j = 0; j < n; j++) {
        const f = (phi + (sg < 0 ? Math.PI : 0) + TAU * j) / P.n;
        const cand = [rn * Math.sin(t) * Math.cos(f), rn * Math.sin(t) * Math.sin(f), rn * Math.cos(t), q[3]];
        const s = { p: [...cand] };
        OPS.bulb.fwd(s, P);
        if (len(sub(s.p, q)) <= 1e-9 * Math.max(1, r)) c.push(cand);
      }
    }
    return c.length ? c[rng.pick(c.length)] : null;
  },
});

// the 4-D bulb: hyperspherical coordinates (θ₁ from x, θ₂ from y in the yzw space, φ in zw), every
// angle and the radius raised to n. dr *= n·r^(n−1)
export function bulb4Fwd(p4, n) {
  const [x, y, z, w] = p4;
  const r = Math.hypot(x, y, z, w);
  if (r === 0) return { p: [0, 0, 0, 0], k: 0 };
  const r1 = Math.hypot(y, z, w);
  const t1 = Math.acos(Math.max(-1, Math.min(1, x / r)));
  const t2 = r1 > 0 ? Math.acos(Math.max(-1, Math.min(1, y / r1))) : 0;
  const f = Math.atan2(w, z);
  const R = r ** n, a = n * t1, b = n * t2, g = n * f;
  return {
    p: [R * Math.cos(a), R * Math.sin(a) * Math.cos(b), R * Math.sin(a) * Math.sin(b) * Math.cos(g), R * Math.sin(a) * Math.sin(b) * Math.sin(g)],
    k: n * r ** (n - 1),
  };
}
def({
  name: 'bulb4', glyph: 'bulb4', wRule: 'mul',
  params: [p('n', 8, 1, 64)],
  fwd(s, P) { const o = bulb4Fwd(s.p, P.n); s.p = o.p; return { k: o.k, branch: 0 }; },
  inv(q, P, rng) {
    // the forward map reads θ₁, θ₂ ∈ [0, π] off the point. With s₁ the sign of sin(nθ₁'), a preimage
    // needs cos(nθ₂') = s₁ cos θ₂ and an azimuth shifted by π when s₁·s₂ = −1; each candidate is checked
    const r = len(q);
    if (r === 0) return q;
    const r1 = Math.hypot(q[1], q[2], q[3]);
    const T1 = Math.acos(Math.max(-1, Math.min(1, q[0] / r)));
    const T2 = r1 > 0 ? Math.acos(Math.max(-1, Math.min(1, q[1] / r1))) : 0;
    const F = Math.atan2(q[3], q[2]);
    const n = Math.max(1, Math.round(P.n)), rn = r ** (1 / P.n), c = [];
    for (const s1 of [1, -1]) for (let k = 0; k <= n; k++) {
      const t1 = (s1 * T1 + TAU * k) / P.n;
      if (t1 < 0 || t1 > Math.PI) continue;
      const base2 = s1 > 0 ? T2 : Math.PI - T2;
      for (const s2 of [1, -1]) for (let m = 0; m <= n; m++) {
        const t2 = (s2 * base2 + TAU * m) / P.n;
        if (t2 < 0 || t2 > Math.PI) continue;
        const j = rng.pick(n);
        const f = (F + (s1 * s2 < 0 ? Math.PI : 0) + TAU * j) / P.n;
        const cand = [rn * Math.cos(t1), rn * Math.sin(t1) * Math.cos(t2), rn * Math.sin(t1) * Math.sin(t2) * Math.cos(f), rn * Math.sin(t1) * Math.sin(t2) * Math.sin(f)];
        if (len(sub(bulb4Fwd(cand, P.n).p, q)) <= 1e-7 * Math.max(1, r)) c.push(cand);
      }
    }
    return c.length ? c[rng.pick(c.length)] : null;
  },
});

// complex power on (x, y); z, w untouched. dr *= n·r^(n−1)
def({
  name: 'power', glyph: 'power', wRule: 'mul',
  params: [p('n', 2, 1, 64)],
  fwd(s, P) {
    const r = Math.hypot(s.p[0], s.p[1]);
    if (r === 0) return { k: 0, branch: 0 };
    const a = Math.atan2(s.p[1], s.p[0]) * P.n, rn = r ** P.n;
    s.p = [rn * Math.cos(a), rn * Math.sin(a), s.p[2], s.p[3]];
    return { k: P.n * r ** (P.n - 1), branch: 0 };
  },
  jac(q, P) {
    // d(z^n)/dz = n z^(n−1) is a similarity on the plane
    const r = Math.hypot(q[0], q[1]);
    if (r === 0) return diag(0, 0, 1, 1);
    const a = Math.atan2(q[1], q[0]) * (P.n - 1), m = P.n * r ** (P.n - 1);
    const c = m * Math.cos(a), s = m * Math.sin(a);
    return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  },
  inv(q, P, rng) {
    const r = Math.hypot(q[0], q[1]);
    if (r === 0) return q;
    const n = Math.round(P.n);
    const a = (Math.atan2(q[1], q[0]) + TAU * rng.pick(n)) / P.n, rn = r ** (1 / P.n);
    return [rn * Math.cos(a), rn * Math.sin(a), q[2], q[3]];
  },
});

// the quaternion square, (x, y, z, w) = x + yi + zj + wk: q² = (x² − |v|², 2x·v). With +c, the
// quaternion Mandelbrot and Julia sets. dr *= 2|q|
def({
  name: 'quat', glyph: 'quat', wRule: 'mul',
  params: [],
  fwd(s) {
    const [a, b, c, d] = s.p;
    const r = len(s.p);
    s.p = [a * a - b * b - c * c - d * d, 2 * a * b, 2 * a * c, 2 * a * d];
    return { k: 2 * r, branch: 0 };
  },
  jac(q) {
    const [a, b, c, d] = q;
    return [2 * a, -2 * b, -2 * c, -2 * d, 2 * b, 2 * a, 0, 0, 2 * c, 0, 2 * a, 0, 2 * d, 0, 0, 2 * a];
  },
  inv(q, P, rng) {
    // the two square roots ±√q; on the negative real axis every unit imaginary direction is one
    const [a, b, c, d] = q;
    const r = len(q), vl = Math.hypot(b, c, d);
    let root;
    if (vl === 0 && a < 0) {
      const u = [rng.pick(2) ? 1 : -1, 0, 0];
      const s = Math.sqrt(-a);
      root = [0, u[0] * s, 0, 0];
    } else if (a >= 0) {
      const x = Math.sqrt((r + a) / 2);
      root = x > 0 ? [x, b / (2 * x), c / (2 * x), d / (2 * x)] : [0, 0, 0, 0];
    } else {
      // q₀ < 0: the imaginary size first, so r + q₀ never cancels
      const y = Math.sqrt((r - a) / 2);
      root = [vl / (2 * y), (b * y) / vl, (c * y) / vl, (d * y) / vl];
    }
    return rng.pick(2) ? root : mul(root, -1);
  },
});

// hypersphere inversion p → p/|p|²; an involution, so inv is fwd. dr *= 1/|p|²
def({
  name: 'invert', glyph: 'invert', wRule: 'mul',
  params: [],
  fwd(s) {
    const r2 = len2(s.p);
    if (r2 === 0) return { k: 1, branch: 0 };
    s.p = mul(s.p, 1 / r2);
    return { k: 1 / r2, branch: 0 };
  },
  jac(q) {
    const r2 = len2(q);
    if (r2 === 0) return I4();
    const k = 1 / r2, J = scaled(I4(), k);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) J[i * 4 + j] -= 2 * k * q[i] * q[j] / r2;
    return J;
  },
  inv(q) { const r2 = len2(q); return r2 === 0 ? q : mul(q, 1 / r2); },
});

// rotate (x, y) by a·z degrees per unit height
def({
  name: 'twist', glyph: 'twist', wRule: 'unchanged',
  params: [p('a', 90, -3600, 3600)],
  fwd(s, P) {
    const t = (P.a * s.p[2] * Math.PI) / 180, c = Math.cos(t), sn = Math.sin(t);
    s.p = [c * s.p[0] - sn * s.p[1], sn * s.p[0] + c * s.p[1], s.p[2], s.p[3]];
    return { branch: 0 };
  },
  inv(q, P) {
    const t = (-P.a * q[2] * Math.PI) / 180, c = Math.cos(t), sn = Math.sin(t);
    return [c * q[0] - sn * q[1], sn * q[0] + c * q[1], q[2], q[3]];
  },
});

// ---------- flame variations (planar, z and w untouched) ---------------------------------------
// Flames are contractive forward maps, so these have no inverse: push applies fwd. They break the
// distance estimate, so pull marks the formula 'unsafe' and steps conservatively.

def({
  name: 'spherical', glyph: 'spherical', wRule: 'mul',
  params: [],
  fwd(s) {
    const r2 = s.p[0] * s.p[0] + s.p[1] * s.p[1];
    if (r2 === 0) return { k: 1, branch: 0 };
    s.p = [s.p[0] / r2, s.p[1] / r2, s.p[2], s.p[3]];
    return { k: 1 / r2, branch: 0 };
  },
  inv(q) {
    const r2 = q[0] * q[0] + q[1] * q[1];
    return r2 === 0 ? q : [q[0] / r2, q[1] / r2, q[2], q[3]];
  },
});

def({
  name: 'swirl', glyph: 'swirl', wRule: 'none',
  params: [],
  fwd(s) {
    const r2 = s.p[0] * s.p[0] + s.p[1] * s.p[1], c = Math.cos(r2), sn = Math.sin(r2);
    s.p = [s.p[0] * sn - s.p[1] * c, s.p[0] * c + s.p[1] * sn, s.p[2], s.p[3]];
    return { branch: 0 };
  },
  inv: null,
});

def({
  name: 'sin', glyph: 'sin', wRule: 'none',
  params: [],
  fwd(s) { s.p = [Math.sin(s.p[0]), Math.sin(s.p[1]), s.p[2], s.p[3]]; return { branch: 0 }; },
  inv: null,
});

def({
  name: 'horseshoe', glyph: 'horseshoe', wRule: 'none',
  params: [],
  fwd(s) {
    const r = Math.hypot(s.p[0], s.p[1]);
    if (r === 0) return { branch: 0 };
    s.p = [((s.p[0] - s.p[1]) * (s.p[0] + s.p[1])) / r, (2 * s.p[0] * s.p[1]) / r, s.p[2], s.p[3]];
    return { branch: 0 };
  },
  inv: null,
});

def({
  name: 'polar', glyph: 'polar', wRule: 'none',
  params: [],
  fwd(s) {
    s.p = [Math.atan2(s.p[0], s.p[1]) / Math.PI, Math.hypot(s.p[0], s.p[1]) - 1, s.p[2], s.p[3]];
    return { branch: 0 };
  },
  inv: null,
});

// ---------- the Kleinian groups and the seeds -----------------------------------------------------
// One iteration of a Kleinian group on the Maskit slice (Jos Leys, fractalforums 2016; Maskit's
// parametrisation): wrap into the cell (sheared by b/a so the lattice follows the twist), a half turn
// about (−b/2, a/2) above the separation line, then the generator: inversion, point reflection, the
// shift by (−b, a). dr *= 1/|p|². One op, because its estimate reads a and its inverse needs all of it.
export const kleinLine = (x, P) => P.a * (0.5 + 0.2 * Math.sin((Math.sign(P.b) * Math.PI * (x + P.b * 0.5)) / P.bx));
function kleinFwd(q, P) {
  let [x, y, z] = q;
  const { a, b, bx, bz } = P;
  x -= 2 * bx * Math.floor((x + (b / a) * y + bx) / (2 * bx));
  z -= 2 * bz * Math.floor((z + bz) / (2 * bz));
  y -= a * Math.floor(y / a);
  const up = y >= kleinLine(x, P);
  if (up) { x = -b - x; y = a - y; z = -z; }
  const iR = 1 / (x * x + y * y + z * z);
  return { p: [-b + iR * x, a - iR * y, -iR * z, q[3]], k: iR, branch: up ? 1 : 2 };
}
def({
  name: 'kleinian', glyph: 'kleinian', wRule: 'mul',
  params: [p('a', 1.95, 0.1, 8), p('b', 0.02, -4, 4), p('bx', 1, 0.05, 16), p('bz', 1, 0.05, 16)],
  fwd(s, P) { const o = kleinFwd(s.p, P); s.p = o.p; return { k: o.k, branch: o.branch }; },
  inv(q, P, rng) {
    const { a, b, bx, bz } = P;
    // the generator undone; then the half turn, whichever of the two lands on its own side of the line
    const u = [-b - q[0], q[1] - a, q[2]], r2 = u[0] * u[0] + u[1] * u[1] + u[2] * u[2];
    if (r2 === 0) return null;
    const z = [-u[0] / r2, -u[1] / r2, -u[2] / r2], c = [];
    if (z[1] < kleinLine(z[0], P)) c.push(z);
    const h = [-b - z[0], a - z[1], -z[2]];
    if (h[1] >= kleinLine(h[0], P)) c.push(h);
    if (!c.length) return null;
    const v = c[rng.pick(c.length)], sh = v[0] + (b / a) * v[1];
    // a point outside the wrapped cell is never produced; inside it, every lattice translate is a preimage
    if (v[1] < 0 || v[1] >= a || Math.abs(v[2]) > bz || Math.abs(sh) > bx) return null;
    return [v[0] + 2 * bx * (rng.pick(3) - 1), v[1], v[2] + 2 * bz * (rng.pick(3) - 1), q[3]];
  },
  seed(q, dr, P) {
    const low = q[1] <= P.a - q[1], y = low ? q[1] : P.a - q[1];
    return { v: Math.min(y, 0.3), g: y < 0.3 ? [0, low ? 1 : -1, 0, 0] : [0, 0, 0, 0], dr: Math.max(dr, 2), t: 0 };
  },
});

// A seed is an estimate for an orbit that never escapes (scale 1: r/dr has nothing to measure): the
// distance from the orbit's last point to a shape, over dr, the shape's preimage under the orbit. The op
// itself does nothing to the point, so its parameters are sensed, lensed, grabbed, bred and driven like
// any other. seed(p, dr, P) returns v the shape's distance, g its gradient in p, dr the divisor, t the
// offset: the estimate is |v/dr − t|. The first seed of a formula is the one read; an orbit that escaped
// is measured by r/dr as always, and a seed in a chimera's species only where that species leads
// (core/formula.js seedSpecies), so a Kleinian cell beside a box keeps each one's measure.
const seedOp = (name, params, seed) => def({ name, glyph: name, wRule: 'unchanged', params, fwd: () => ({ branch: 0 }), jac: () => I4(), inv: (q) => q, seed });
// a plane (a slab, doubled by the abs): k·|n·p − d|. Knighty's pseudo-Kleinian, k = ½; iq's Apollonian, k = ¼
seedOp('seed.slab', [p('nx', 0), p('ny', 0), p('nz', 1), p('d', 0), p('t', 0), p('k', 0.5, 0, 4)], (q, dr, P) => {
  const n = normalize([P.nx, P.ny, P.nz, 0]), e = dot(q, n) - P.d, sg = e < 0 ? -1 : 1;
  return { v: P.k * sg * e, g: mul(n, P.k * sg), dr, t: P.t };
});
seedOp('seed.sphere', [p('r', 1, 0, 64), p('k', 1, 0, 4)], (q, dr, P) => {
  const l = len([q[0], q[1], q[2], 0]), e = l - P.r, sg = e < 0 ? -1 : 1;
  return { v: P.k * sg * e, g: l > 0 ? [P.k * sg * q[0] / l, P.k * sg * q[1] / l, P.k * sg * q[2] / l, 0] : [0, 0, 0, 0], dr, t: 0 };
});
// knighty's "thingy": a disc of radius r in the xy plane and its axis, the pillars of the classic
// pseudo-Kleinian pictures: max(ρ − r, |ρ z|/|p|)
seedOp('seed.pillar', [p('r', 0.1, 0, 64), p('k', 1, 0, 4)], (q, dr, P) => {
  const [x, y, z] = q, rho = Math.hypot(x, y), l = Math.hypot(x, y, z), a = rho - P.r, b = l > 0 ? Math.abs(rho * z) / l : 0;
  if (a >= b) return { v: P.k * a, g: rho > 0 ? [P.k * x / rho, P.k * y / rho, 0, 0] : [0, 0, 0, 0], dr, t: 0 };
  if (!(l > 0) || !(rho > 0)) return { v: P.k * b, g: [0, 0, 0, 0], dr, t: 0 };
  const sg = z < 0 ? -1 : 1, l3 = l * l * l;
  return { v: P.k * b, g: [P.k * sg * z * x * z * z / (rho * l3), P.k * sg * z * y * z * z / (rho * l3), P.k * sg * rho * rho * rho / l3, 0], dr, t: 0 };
});

// ---------- the Mandalay fold -----------------------------------------------------------------------
// DarkBeam's fold as knighty adapted it (fractalforums, "'new' fractal type Mandalay", 2011): on |p|, each
// axis stepped against the larger of the other two. fo the step's width, g the gap before the far step.
// x, y, z only.
const mdAxis = (x, a, b, fo, g) => {
  const y = Math.max(a, b), t1 = x - 2 * fo, t2 = y - 4 * fo;
  return Math.min(Math.min(Math.max(Math.abs(t1 + fo) - fo, t2), Math.max(t1 - g, y)), x);
};
export function mandalayFwd(q, P) {
  const s = [0, 1, 2].map((i) => (q[i] < 0 ? -1 : 1)), [x, y, z] = [Math.abs(q[0]), Math.abs(q[1]), Math.abs(q[2])];
  return [s[0] * mdAxis(x, y, z, P.fo, P.g), s[1] * mdAxis(y, x, z, P.fo, P.g), s[2] * mdAxis(z, x, y, P.fo, P.g), q[3]];
}
export const MANDALAY_TRIES = 16;
def({
  name: 'fold.mandalay', glyph: 'mandalay', wRule: 'unchanged',
  params: [p('fo', 0.5, 0.01, 8), p('g', 0, 0, 8)],
  fwd(s, P) {
    const o = mandalayFwd(s.p, P);
    // the branch records which axes the fold moved
    let branch = 0;
    for (let i = 0; i < 3; i++) if (o[i] !== s.p[i]) branch += 1 << i;
    s.p = o;
    return { branch };
  },
  // About half of space lies on branches of rank 2 (an axis takes another's value): their image has no
  // volume, so a generic point's preimages all come from the branches where each axis keeps its own
  // coordinate. Those are tried at random, an axis at a time, each checked against the forward map.
  inv(q, P, rng) {
    const { fo, g } = P;
    for (let t = 0; t < MANDALAY_TRIES; t++) {
      const c = [0, 0, 0, q[3]];
      for (let i = 0; i < 3; i++) {
        const sg = rng.pick(2) ? -1 : 1, u = q[i] * sg, k = rng.pick(4);
        c[i] = sg * (k === 0 ? u : k === 1 ? u + 2 * fo : k === 2 ? u + 2 * fo + g : -u);
      }
      if (len(sub(mandalayFwd(c, P), q)) <= 1e-9 * (1 + len(q))) return c;
    }
    return null;
  },
});

// ---------- the chimera -------------------------------------------------------------------------
// [A ‖ B ‖ …] field: up to seven sub-stacks run on the same point in the same iteration and their
// results blended by weights from a field (core/fields.js),
//   p → Σ ωᵢ(x)·Fᵢ(p)
// — new dynamics, not a collage of finished shapes. One op per field kind; all share the maps that
// run the sub-stacks (core/cpu.js, gpu/wgsl.js), and differ only in their weights.
// dr after the mix is Σ ωᵢ·drᵢ, the bound on |Σ ωᵢJᵢ| (the largest branch's would be looser still, and
// wrong in a pure cell: a bulb-3 cell beside a bulb-8 one took the 8's 8r⁷ and its estimate fell 260×).
// The blend's full Jacobian is Σ ωᵢJᵢ + Σ Fᵢ∇ωᵢᵀ, and the second term is left out of dr on purpose: a
// strict bound would add Σ |Fᵢ − p'|·|∇ωᵢ|·dr every iteration,
// which grows with |p| along an escaping orbit wherever the field keeps varying (noise never
// saturates) and drove the estimate to 1e-15 at points far outside the set (measured 2026-10-26). So
// the estimate is the species' own, and steep field walls can be overstepped by the marcher. The
// Jacobian (Lyapunov, push) keeps the field term.
// Parameters:
//   s       how many species: the brackets say it (hidden from the notation, never edited)
//   w       where the scalar fields sit on the line of species: 0 the first, 1 the last
//   g       the field's gain
//   at      the frame: 0 the orbit point every iteration, 1 the world point the orbit started from
// Discrete parameters (counts, seeds, the frame) are never sensed, lensed, grabbed or bred.
const dq = (k, d, min, max) => ({ k, d, min, max, discrete: true });
const SPECIES = { k: 's', d: 2, min: 2, max: 7, discrete: true, hidden: true };
const AT = (d) => dq('at', d, 0, 1);
const mixDef = (name, glyph, params) => def({ name, glyph, wRule: 'mix', params: [...params, SPECIES], inv: null });
mixDef('mix', 'mix', [p('w', 0.5, 0, 1)]);
mixDef('mix.axis', 'mix.axis', [p('w', 0.5, 0, 1), p('g', 1, -64, 64), p('nx', 1), p('ny', 0), p('nz', 0), p('nw', 0), AT(0)]);
mixDef('mix.sphere', 'mix.sphere', [p('w', 0.5, 0, 1), p('g', 1, -64, 64), p('r', 1, 0, 16), p('cx', 0), p('cy', 0), p('cz', 0), p('cw', 0), AT(0)]);
mixDef('mix.noise', 'mix.noise', [p('w', 0.5, 0, 1), p('g', 2, -16, 16), p('f', 1, 0, 16), dq('o', 2, 1, 4), dq('seed', 0, 0, 65535), AT(0)]);
mixDef('mix.tissue', 'mix.tissue', [dq('n', 6, 2, 16), p('size', 1.5, 1e-3, 32), p('soft', 0.1, 1e-4, 2), dq('seed', 0, 0, 65535), AT(1)]);
mixDef('mix.trap', 'mix.trap', [p('w', 0.5, 0, 1), p('g', 4, -64, 64), p('t', 0.5, 0, 64)]);
mixDef('mix.depth', 'mix.depth', [p('w', 0.5, 0, 1), p('g', 6, -256, 256)]);
// constant weights for every species (the Metasurface's junctions, where three cells meet); relative
mixDef('mix.blend', 'mix', ['a', 'b', 'c', 'd', 'e', 'f', 'h'].map((k) => p(k, 1, 0, 64)));
mixDef('mix.lyap', 'mix.lyap', [p('w', 0.5, 0, 1), p('g', 2, -64, 64)]);
export const isMix = (name) => name === 'mix' || name.startsWith('mix.');

// ---------- lookup -----------------------------------------------------------------------------

export const ALIASES = {};
for (const o of Object.values(OPS)) for (const a of o.alias || []) ALIASES[a] = o.name;

export function getOp(name) {
  return OPS[name] || OPS[ALIASES[name]] || null;
}

// keyed params with defaults filled in
export function fillParams(op, given = {}) {
  const P = {};
  for (const q of op.params) P[q.k] = given[q.k] === undefined ? q.d : given[q.k];
  return P;
}

export const opNames = () => Object.keys(OPS);
