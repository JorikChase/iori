// The transform library. One entry per op; each op declares:
//   params  — positional parameters with defaults and ranges (the notation is positional, JSON is keyed)
//   wRule   — how it changes the running derivative dr used by distance estimates:
//             'unchanged' (isometries), 'mul' (dr *= k, k returned by fwd), 'plus' (dr += 1, the +c)
//   fwd     — the forward map on state s = {p, c}; mutates s.p; returns {k?, branch}
//   jac     — analytic 3×3 Jacobian at p, or undefined (the CPU backend then differentiates numerically)
//   inv     — one preimage of p under the op, choosing a branch with rng.pick; null when the op has no
//             usable inverse (the push engine then applies fwd, as flames do)
//   glyph   — the UI glyph id; no words anywhere else
//
// Push and pull are the same formula in opposite directions: the preimages of an expanding fold are the
// branches of a contracting IFS.

import { I3, dot, len, len2, add, sub, mul, normalize, diag, scaled, reflection, rotationXYZ, transpose, matVec } from './vec.js';

const p = (k, d, min, max) => ({ k, d, min, max });

export const OPS = {};
const def = (o) => { OPS[o.name] = o; return o; };

// ---------- affine ----------------------------------------------------------------------------

def({
  name: 'translate', alias: ['+'], glyph: 'translate', wRule: 'unchanged',
  params: [p('x', 0), p('y', 0), p('z', 0)],
  fwd(s, P) { s.p = add(s.p, [P.x, P.y, P.z]); return { branch: 0 }; },
  jac: () => I3(),
  inv: (q, P) => sub(q, [P.x, P.y, P.z]),
});

// p += c, where c is the orbit's constant (the pixel for a Mandelbrot-type set, a fixed value for a Julia)
def({
  name: '+c', glyph: 'c', wRule: 'plus',
  params: [],
  fwd(s) { s.p = add(s.p, s.c); return { branch: 0 }; },
  jac: () => I3(),
  inv: (q, P, rng, s) => sub(q, s.c),
});

def({
  name: 'scale', glyph: 'scale', wRule: 'mul',
  params: [p('s', 2, -64, 64)],
  fwd(s, P) { s.p = mul(s.p, P.s); return { k: Math.abs(P.s), branch: 0 }; },
  jac: (q, P) => diag(P.s, P.s, P.s),
  inv: (q, P) => (P.s === 0 ? null : mul(q, 1 / P.s)),
});

def({
  name: 'rotate', glyph: 'rotate', wRule: 'unchanged',
  params: [p('x', 0), p('y', 0), p('z', 0)],
  fwd(s, P) { s.p = matVec(rotationXYZ(P.x, P.y, P.z), s.p); return { branch: 0 }; },
  jac: (q, P) => rotationXYZ(P.x, P.y, P.z),
  inv: (q, P) => matVec(transpose(rotationXYZ(P.x, P.y, P.z)), q),
});

// ---------- folds ------------------------------------------------------------------------------
// A fold is many-to-one. fwd takes the branch the point's position dictates; inv picks one of the
// valid preimages at random. Every fold is an isometry piecewise, so dr is unchanged.

// reflect p across the plane n·p = d when it lies on the n·p < d side
def({
  name: 'fold.plane', glyph: 'plane', wRule: 'unchanged',
  params: [p('nx', 1), p('ny', 0), p('nz', 0), p('d', 0)],
  fwd(s, P) {
    const n = normalize([P.nx, P.ny, P.nz]);
    const t = dot(s.p, n) - P.d;
    if (t < 0) { s.p = sub(s.p, mul(n, 2 * t)); return { branch: 1 }; }
    return { branch: 0 };
  },
  jac(q, P) {
    const n = normalize([P.nx, P.ny, P.nz]);
    return dot(q, n) - P.d < 0 ? reflection(n) : I3();
  },
  inv(q, P, rng) {
    const n = normalize([P.nx, P.ny, P.nz]);
    const t = dot(q, n) - P.d;
    if (t < 0) return null; // nothing maps to the far side
    return rng.pick(2) ? sub(q, mul(n, 2 * t)) : q;
  },
});

// Mandelbox box fold: per axis x → clamp(x, −l, l)·2 − x
def({
  name: 'fold.box', glyph: 'box', wRule: 'unchanged',
  params: [p('l', 1, 0, 64)],
  fwd(s, P) {
    let branch = 0;
    const out = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      const x = s.p[i];
      if (x > P.l) { out[i] = 2 * P.l - x; branch += 1 * 3 ** i; }
      else if (x < -P.l) { out[i] = -2 * P.l - x; branch += 2 * 3 ** i; }
      else out[i] = x;
    }
    s.p = out;
    return { branch };
  },
  jac(q, P) { return diag(...q.map((x) => (Math.abs(x) > P.l ? -1 : 1))); },
  inv(q, P, rng) {
    const out = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      const y = q[i], c = [];
      if (Math.abs(y) <= P.l) c.push(y);
      if (y < P.l) c.push(2 * P.l - y);   // came from above
      if (y > -P.l) c.push(-2 * P.l - y); // came from below
      out[i] = c[rng.pick(c.length)];
    }
    return out;
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
    if (r2 < m2) return scaled(I3(), f2 / m2);
    if (r2 < f2) {
      const k = f2 / r2, J = scaled(I3(), k);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) J[i * 3 + j] -= 2 * k * q[i] * q[j] / r2;
      return J;
    }
    return I3();
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

// per-axis absolute value: the three coordinate-plane folds at once
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

// sort coordinates descending (with abs, the Menger / octahedral fold)
def({
  name: 'sort', glyph: 'sort', wRule: 'unchanged',
  params: [],
  fwd(s) {
    const idx = [0, 1, 2].sort((a, b) => s.p[b] - s.p[a]);
    s.p = idx.map((i) => s.p[i]);
    return { branch: idx[0] * 2 + (idx[1] > idx[2] ? 1 : 0) };
  },
  jac(q) {
    const idx = [0, 1, 2].sort((a, b) => q[b] - q[a]);
    const J = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    idx.forEach((src, row) => { J[row * 3 + src] = 1; });
    return J;
  },
  inv(q, P, rng) {
    if (!(q[0] >= q[1] && q[1] >= q[2])) return null;
    const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    const perm = perms[rng.pick(6)];
    const out = [0, 0, 0];
    perm.forEach((dst, i) => { out[dst] = q[i]; });
    return out;
  },
});

// ---------- powers -----------------------------------------------------------------------------

// Mandelbulb power (White–Nylander spherical triplex). dr *= n·r^(n−1)
def({
  name: 'bulb', glyph: 'bulb', wRule: 'mul',
  params: [p('n', 8, 1, 64)],
  fwd(s, P) {
    const r = len(s.p);
    if (r === 0) return { k: 0, branch: 0 };
    const theta = Math.acos(Math.max(-1, Math.min(1, s.p[2] / r))), phi = Math.atan2(s.p[1], s.p[0]);
    const rn = r ** P.n, t = theta * P.n, f = phi * P.n;
    s.p = [rn * Math.sin(t) * Math.cos(f), rn * Math.sin(t) * Math.sin(f), rn * Math.cos(t)];
    return { k: P.n * r ** (P.n - 1), branch: 0 };
  },
  inv(q, P, rng) {
    // The forward map reads θ ∈ [0, π] off the point, so a preimage must have its θ there; the
    // candidates are (±θ + 2πk)/n (the minus sign with φ shifted by π), (φ + 2πj)/n, kept when the
    // forward map returns q.
    const r = len(q);
    if (r === 0) return q;
    const theta = Math.acos(Math.max(-1, Math.min(1, q[2] / r))), phi = Math.atan2(q[1], q[0]);
    const n = Math.max(1, Math.round(P.n)), rn = r ** (1 / P.n), c = [];
    for (const sg of [1, -1]) for (let k = 0; k < n; k++) {
      const t = (sg * theta + 2 * Math.PI * k) / P.n;
      if (t < 0 || t > Math.PI) continue;
      for (let j = 0; j < n; j++) {
        const f = (phi + (sg < 0 ? Math.PI : 0) + 2 * Math.PI * j) / P.n;
        const cand = [rn * Math.sin(t) * Math.cos(f), rn * Math.sin(t) * Math.sin(f), rn * Math.cos(t)];
        const s = { p: [...cand] };
        OPS.bulb.fwd(s, P);
        if (len(sub(s.p, q)) <= 1e-9 * Math.max(1, r)) c.push(cand);
      }
    }
    return c.length ? c[rng.pick(c.length)] : null;
  },
});

// complex power on (x, y); z untouched. dr *= n·r^(n−1)
def({
  name: 'power', glyph: 'power', wRule: 'mul',
  params: [p('n', 2, 1, 64)],
  fwd(s, P) {
    const r = Math.hypot(s.p[0], s.p[1]);
    if (r === 0) return { k: 0, branch: 0 };
    const a = Math.atan2(s.p[1], s.p[0]) * P.n, rn = r ** P.n;
    s.p = [rn * Math.cos(a), rn * Math.sin(a), s.p[2]];
    return { k: P.n * r ** (P.n - 1), branch: 0 };
  },
  jac(q, P) {
    // d(z^n)/dz = n z^(n−1) is a similarity on the plane
    const r = Math.hypot(q[0], q[1]);
    if (r === 0) return diag(0, 0, 1);
    const a = Math.atan2(q[1], q[0]) * (P.n - 1), m = P.n * r ** (P.n - 1);
    const c = m * Math.cos(a), s = m * Math.sin(a);
    return [c, -s, 0, s, c, 0, 0, 0, 1];
  },
  inv(q, P, rng) {
    const r = Math.hypot(q[0], q[1]);
    if (r === 0) return q;
    const n = Math.round(P.n);
    const a = (Math.atan2(q[1], q[0]) + 2 * Math.PI * rng.pick(n)) / P.n, rn = r ** (1 / P.n);
    return [rn * Math.cos(a), rn * Math.sin(a), q[2]];
  },
});

// sphere inversion p → p/|p|²; an involution, so inv is fwd. dr *= 1/|p|²
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
    if (r2 === 0) return I3();
    const k = 1 / r2, J = scaled(I3(), k);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) J[i * 3 + j] -= 2 * k * q[i] * q[j] / r2;
    return J;
  },
  inv(q) { const r2 = len2(q); return r2 === 0 ? q : mul(q, 1 / r2); },
});

// rotate around z by a·z degrees per unit height
def({
  name: 'twist', glyph: 'twist', wRule: 'unchanged',
  params: [p('a', 90, -3600, 3600)],
  fwd(s, P) {
    const t = (P.a * s.p[2] * Math.PI) / 180, c = Math.cos(t), sn = Math.sin(t);
    s.p = [c * s.p[0] - sn * s.p[1], sn * s.p[0] + c * s.p[1], s.p[2]];
    return { branch: 0 };
  },
  inv(q, P) {
    const t = (-P.a * q[2] * Math.PI) / 180, c = Math.cos(t), sn = Math.sin(t);
    return [c * q[0] - sn * q[1], sn * q[0] + c * q[1], q[2]];
  },
});

// ---------- flame variations (planar, z untouched) ---------------------------------------------
// Flames are contractive forward maps, so these have no inverse: push applies fwd. They break the
// distance estimate, so pull marks the formula 'unsafe' and steps conservatively.

def({
  name: 'spherical', glyph: 'spherical', wRule: 'mul',
  params: [],
  fwd(s) {
    const r2 = s.p[0] * s.p[0] + s.p[1] * s.p[1];
    if (r2 === 0) return { k: 1, branch: 0 };
    s.p = [s.p[0] / r2, s.p[1] / r2, s.p[2]];
    return { k: 1 / r2, branch: 0 };
  },
  inv(q) {
    const r2 = q[0] * q[0] + q[1] * q[1];
    return r2 === 0 ? q : [q[0] / r2, q[1] / r2, q[2]];
  },
});

def({
  name: 'swirl', glyph: 'swirl', wRule: 'none',
  params: [],
  fwd(s) {
    const r2 = s.p[0] * s.p[0] + s.p[1] * s.p[1], c = Math.cos(r2), sn = Math.sin(r2);
    s.p = [s.p[0] * sn - s.p[1] * c, s.p[0] * c + s.p[1] * sn, s.p[2]];
    return { branch: 0 };
  },
  inv: null,
});

def({
  name: 'sin', glyph: 'sin', wRule: 'none',
  params: [],
  fwd(s) { s.p = [Math.sin(s.p[0]), Math.sin(s.p[1]), s.p[2]]; return { branch: 0 }; },
  inv: null,
});

def({
  name: 'horseshoe', glyph: 'horseshoe', wRule: 'none',
  params: [],
  fwd(s) {
    const r = Math.hypot(s.p[0], s.p[1]);
    if (r === 0) return { branch: 0 };
    s.p = [((s.p[0] - s.p[1]) * (s.p[0] + s.p[1])) / r, (2 * s.p[0] * s.p[1]) / r, s.p[2]];
    return { branch: 0 };
  },
  inv: null,
});

def({
  name: 'polar', glyph: 'polar', wRule: 'none',
  params: [],
  fwd(s) {
    s.p = [Math.atan2(s.p[0], s.p[1]) / Math.PI, Math.hypot(s.p[0], s.p[1]) - 1, s.p[2]];
    return { branch: 0 };
  },
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
