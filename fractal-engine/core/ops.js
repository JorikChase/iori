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

// Mandelbox sphere fold: |p| < rmin → scale by rfix²/rmin²; rmin ≤ |p| < rfix → invert in the rfix sphere
def({
  name: 'fold.sphere', glyph: 'sphere', wRule: 'mul',
  params: [p('rmin', 0.5, 1e-6, 64), p('rfix', 1, 1e-6, 64)],
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
    if (r / k0 < P.rmin) c.push(mul(q, 1 / k0));
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

// ---------- the chimera -------------------------------------------------------------------------
// [A ‖ B]: two sub-stacks run on the same point in the same iteration and their results blended,
//   p → (1 − ω(p))·F_A(p) + ω(p)·F_B(p)
// — new dynamics, not a collage of finished shapes. The weight is a field over the orbit point: a
// logistic of w's logit plus a linear ramp along n and a radial ramp, so k = r = 0 is the constant w
// exactly, w = 0 or 1 is one pure species, and anything else is a smooth wall between the species:
//   ω(p) = σ(logit w + k·(n̂·p) + r·(|p| − 1))
// dr after the mix is the larger of the two branches' plus |F_B − F_A|·|∇ω|·dr: a bound on the blend's
// stretch (its Jacobian is (1 − ω)J_A + ωJ_B + (F_B − F_A)∇ωᵀ). The sub-stacks are slots of their own
// (formula.js mixKids); the maps that run them live in core/cpu.js, the GPU's in gpu/wgsl.js.
const logit = (w) => Math.log(w / (1 - w));
export function mixWeight(q, P) {
  // w = 0 or 1: one pure species, whatever the field
  if (P.w <= 0 || P.w >= 1) return { w: P.w <= 0 ? 0 : 1, g: [0, 0, 0, 0] };
  const n = normalize([P.nx, P.ny, P.nz, P.nw]), r = len(q);
  const sArg = logit(P.w) + P.k * dot(n, q) + P.r * (r - 1);
  const w = 1 / (1 + Math.exp(-sArg)), ww = w * (1 - w);
  const g = n.map((x, i) => ww * (P.k * x + (r > 0 ? (P.r * q[i]) / r : 0)));
  return { w, g };
}
def({
  name: 'mix', glyph: 'mix', wRule: 'mix',
  params: [p('w', 0.5, 0, 1), p('k', 0), p('nx', 1), p('ny', 0), p('nz', 0), p('nw', 0), p('r', 0)],
  inv: null,
});

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
