// The WGSL interpreter: the same orbit as core/cpu.js, with the trace statistics the look layer reads.
// The orbit lives in 4-D (vec4f); the world reaches it through the slice: embed(x) = head.slice·(x, w₀).
// Three readings of one op table, exactly as in core/ops.js:
//   opFwd  — the forward map (pull: per pixel, iterate() / de())
//   opInv  — one random preimage, or failure (push: per sample, invStep())
//   opTan  — the forward map's derivative along a tangent (the dual numbers)
// test/parity.html diffs all three against the CPU.
//
// Records: five vec4f per op, [code, p0 … p18]. Rotations (3-D and 4-D) are packed as one row-major 4×4.
//
// The chimera (mix, code 22) runs two sub-stacks — slots of their own — on the same point and blends
// them. WGSL has no recursion, so it is never an opFwd/opInv/opTan case: fwdAt, invAt and the dual
// loop dispatch on it and call the per-op functions for its sub-stacks, which hold no mix.

// a shader source's drivers switched on (gpu/pack.js drives(f) says which variant a formula needs)
import { SH_STOPS_AT, SH_BINDS_AT, SH_NODE_VEC4, SHADE_VEC4 } from '../core/shade.js';
import { MAX_PIECES } from '../core/collage.js';
import { REGION4, CL_AT } from './pack.js';

export const withDrive = (source) => source.replace('const DRIVE_ON = false;', 'const DRIVE_ON = true;');

export const INTERP = /* wgsl */ `
struct Head {
  iters: u32, schedLen: u32, flags: u32, bail: f32,
  starts: array<vec4u, 2>, lens: array<vec4u, 2>,   // eight slots
  sched: array<vec4u, 16>,
  c: vec4f,        // the fixed constant when FLAG_JULIA is set
  slice: mat4x4f,  // the world's place in 4-D: x₄ = slice · (x, y, z, sliceW.x)
  sliceW: vec4f,   // x the slice's offset along w, y the drivers' clock (s), z the step factor 1 / L
};

struct Trace {
  p: vec4f,      // final point
  dr: f32,       // running derivative
  n: u32,        // iterations done
  escaped: bool,
  trap: f32,     // min |p|² along the orbit
  col: f32,      // branch record: flame-style colour index in [0, 1)
  sp: f32,       // the leading species of the last chimera ÷ (k − 1); 0 without one (a shading reading)
};

@group(0) @binding(0) var<uniform> head: Head;
@group(0) @binding(1) var<storage, read> ops: array<vec4f>;

const FLAG_POWER = 1u;
const FLAG_UNSAFE = 2u;
const FLAG_JULIA = 4u;
const FLAG_SHADE = 8u;
const FLAG_DRIVE = 16u;
// The drivers compile only into the variant that needs them (withDrive below): with DRIVE_ON false every
// hook folds away and an undriven formula's shaders are the size they were before formula v2.
const DRIVE_ON = false;
const PI = 3.14159265;
const REC4 = 5u;

// Per-invocation parameter overrides: a record reads as its packed value plus d · (d record / dθ)
// for up to two parameters. The atlas lens varies two parameters across its pixels this way. Exact for
// every parameter whose record is linear in it (all but rotation angles and plane normals, which the
// lens does not offer).
var<private> ov0: u32 = 0xffffffffu;
var<private> ov1: u32 = 0xffffffffu;
var<private> ovD: vec2f = vec2f(0.0);
var<private> ovRec0: array<vec4f, 5>;
var<private> ovRec1: array<vec4f, 5>;

// The dual numbers' selected parameter (DUAL): its op and d record / dθ. A chimera differentiates its
// field through the record by central differences, reading it nudged by tanEps · tanRec.
var<private> tanOi: u32 = 0xffffffffu;
var<private> tanRec: array<vec4f, 5>;
var<private> tanEps: f32 = 0.0;

fn rec(oi: u32, k: u32) -> vec4f {
  var r = ops[oi * REC4 + k];
  // a driven op reads its driven values (DRIVE below); the test is one bit for undriven formulas
  if (DRIVE_ON && drvAny) { if (drvIs(oi)) { r = drvRec(oi, k, r); } }
  if (oi == ov0) { r = r + ovD.x * ovRec0[k]; }
  if (oi == ov1) { r = r + ovD.y * ovRec1[k]; }
  if (oi == tanOi) { r = r + tanEps * tanRec[k]; }
  return r;
}

fn embed(x: vec3f) -> vec4f { return head.slice * vec4f(x, head.sliceW.x); }
// back to the world: xyz along the slice's axes, w how far off the slice
fn unembed(x4: vec4f) -> vec4f { let v = transpose(head.slice) * x4; return vec4f(v.xyz, v.w - head.sliceW.x); }

fn slotStart(s: u32) -> u32 { return head.starts[s / 4u][s % 4u]; }
fn slotLen(s: u32) -> u32 { return head.lens[s / 4u][s % 4u]; }

fn schedAt(i: u32) -> u32 {
  let k = i % head.schedLen;
  return head.sched[k / 4u][k % 4u];
}

fn branchColour(col: f32, opIndex: u32, branch: u32) -> f32 {
  // every branch taken pulls the colour index toward that branch's own value
  let own = fract(f32(opIndex) * 0.6180339 + f32(branch) * 0.3819660);
  return mix(col, own, 0.5);
}

// the packed 4×4 of a rotation as a matrix whose columns are its rows: p · M = R p, M · q = Rᵀ q
fn rowsOf(oi: u32) -> mat4x4f {
  let a = rec(oi, 0u); let b = rec(oi, 1u); let c = rec(oi, 2u); let d = rec(oi, 3u); let e = rec(oi, 4u);
  return mat4x4f(vec4f(a.yzw, b.x), vec4f(b.yzw, c.x), vec4f(c.yzw, d.x), vec4f(d.yzw, e.x));
}

// the 4-D bulb's forward map (hyperspherical coordinates, every angle and the radius to the n)
fn bulb4(p: vec4f, n: f32) -> vec4f {
  let r = length(p);
  let r1 = length(p.yzw);
  let t1 = acos(clamp(p.x / r, -1.0, 1.0)) * n;
  var t2 = 0.0;
  if (r1 > 0.0) { t2 = acos(clamp(p.y / r1, -1.0, 1.0)) * n; }
  let f = atan2(p.w, p.z) * n;
  let R = pow(r, n);
  return R * vec4f(cos(t1), sin(t1) * cos(t2), sin(t1) * sin(t2) * cos(f), sin(t1) * sin(t2) * sin(f));
}

struct Step { p: vec4f, k: f32, branch: u32, ok: bool };

// ---------- forward ----------------------------------------------------------------------------
// returns the new point; k multiplies dr (wRule 'mul'), k < 0 means dr += 1 (the +c rule)
fn opFwd(oi: u32, p: vec4f, c: vec4f) -> Step {
  let a = rec(oi, 0u);
  let b = rec(oi, 1u);
  var s: Step;
  s.p = p; s.k = 1.0; s.branch = 0u; s.ok = true;
  switch u32(a.x) {
    case 0u: { s.p = p + vec4f(a.yzw, b.x); }
    case 1u: { s.p = p + c; s.k = -1.0; }
    case 2u: { s.p = p * a.y; s.k = abs(a.y); }
    case 3u: { s.p = p * rowsOf(oi); }
    case 4u: {
      let n = vec4f(a.yzw, b.x);
      let d = dot(p, n) - b.y;
      if (d < 0.0) { s.p = p - 2.0 * d * n; s.branch = 1u; }
    }
    case 5u: {
      let l = a.y;
      s.branch = select(0u, 1u, p.x > l) + select(0u, 2u, p.x < -l)
               + select(0u, 3u, p.y > l) + select(0u, 6u, p.y < -l)
               + select(0u, 9u, p.z > l) + select(0u, 18u, p.z < -l)
               + select(0u, 27u, p.w > l) + select(0u, 54u, p.w < -l);
      s.p = clamp(p, vec4f(-l), vec4f(l)) * 2.0 - p;
    }
    case 6u: {
      let r2 = dot(p, p);
      let m2 = a.y * a.y;
      let f2 = a.z * a.z;
      if (r2 < m2) { s.k = f2 / m2; s.p = p * s.k; }
      else if (r2 < f2) { s.k = f2 / r2; s.p = p * s.k; s.branch = 1u; }
      else { s.branch = 2u; }
    }
    case 7u: {
      s.branch = select(0u, 1u, p.x < 0.0) + select(0u, 2u, p.y < 0.0) + select(0u, 4u, p.z < 0.0) + select(0u, 8u, p.w < 0.0);
      s.p = abs(p);
    }
    case 8u: {
      var x = p.xyz;
      if (x.x < x.y) { x = x.yxz; s.branch = s.branch + 1u; }
      if (x.y < x.z) { x = x.xzy; s.branch = s.branch + 2u; }
      if (x.x < x.y) { x = x.yxz; s.branch = s.branch + 4u; }
      s.p = vec4f(x, p.w);
    }
    case 9u: {
      let r = length(p.xyz);
      if (r > 0.0) {
        let n = a.y;
        let theta = acos(clamp(p.z / r, -1.0, 1.0)) * n;
        let phi = atan2(p.y, p.x) * n;
        s.k = n * pow(r, n - 1.0);
        s.p = vec4f(pow(r, n) * vec3f(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta)), p.w);
      } else { s.k = 0.0; }
    }
    case 10u: {
      let r = length(p.xy);
      if (r > 0.0) {
        let n = a.y;
        let ang = atan2(p.y, p.x) * n;
        s.k = n * pow(r, n - 1.0);
        s.p = vec4f(pow(r, n) * cos(ang), pow(r, n) * sin(ang), p.z, p.w);
      } else { s.k = 0.0; }
    }
    case 11u: {
      let r2 = dot(p, p);
      if (r2 > 0.0) { s.p = p / r2; s.k = 1.0 / r2; }
    }
    case 12u: {
      let ang = a.y * p.z;
      s.p = vec4f(cos(ang) * p.x - sin(ang) * p.y, sin(ang) * p.x + cos(ang) * p.y, p.z, p.w);
    }
    case 13u: {
      let r2 = dot(p.xy, p.xy);
      if (r2 > 0.0) { s.p = vec4f(p.xy / r2, p.zw); s.k = 1.0 / r2; }
    }
    case 14u: {
      let r2 = dot(p.xy, p.xy);
      s.p = vec4f(p.x * sin(r2) - p.y * cos(r2), p.x * cos(r2) + p.y * sin(r2), p.z, p.w);
    }
    case 15u: { s.p = vec4f(sin(p.x), sin(p.y), p.z, p.w); }
    case 16u: {
      let r = length(p.xy);
      if (r > 0.0) { s.p = vec4f((p.x - p.y) * (p.x + p.y) / r, 2.0 * p.x * p.y / r, p.z, p.w); }
    }
    case 17u: { s.p = vec4f(atan2(p.x, p.y) / PI, length(p.xy) - 1.0, p.z, p.w); }
    case 19u: {
      // descending sort of four values by a five-swap network; the branch records each swap
      var x = p;
      if (x.x < x.y) { x = x.yxzw; s.branch = s.branch + 1u; }
      if (x.z < x.w) { x = x.xywz; s.branch = s.branch + 2u; }
      if (x.x < x.z) { x = x.zyxw; s.branch = s.branch + 4u; }
      if (x.y < x.w) { x = x.xwzy; s.branch = s.branch + 8u; }
      if (x.y < x.z) { x = x.xzyw; s.branch = s.branch + 16u; }
      s.p = x;
    }
    case 20u: {
      let r = length(p);
      if (r > 0.0) { let n = a.y; s.k = n * pow(r, n - 1.0); s.p = bulb4(p, n); } else { s.k = 0.0; }
    }
    case 21u: {
      s.k = 2.0 * length(p);
      s.p = vec4f(p.x * p.x - dot(p.yzw, p.yzw), 2.0 * p.x * p.yzw);
    }
    default: {}
  }
  return s;
}

// ---------- the chimera -------------------------------------------------------------------------
// k species (up to seven sub-stacks) blended by a field's weights (core/fields.js, bit for bit).
const MIX = 22u;
const MAXK = 8u;

// The orbit's running context, which the fields read: set by whoever runs an orbit (iterate, the
// dual loop, the JIT, the loop engine, the push walk). fP0 the start (the world frame), fTrap the least
// |p|² so far (the start included), fIter the iteration under way of fIters.
var<private> fP0: vec4f;
var<private> fTrap: f32 = 0.0;
var<private> fIter: f32 = 0.0;
var<private> fIters: f32 = 1.0;
fn startOrbit(p0: vec4f) { fP0 = p0; fTrap = dot(p0, p0); fIter = 0.0; fIters = f32(head.iters); if (DRIVE_ON) { driveStart(p0); } }

// the field library's hash and noise
fn fhash(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
fn funit(h: u32) -> f32 { return f32(h >> 8u) / 16777216.0; }
fn lattice(i: vec4i, seed: u32) -> f32 {
  let h = (bitcast<u32>(i.x) * 0x8da6b343u) ^ (bitcast<u32>(i.y) * 0xd8163841u) ^ (bitcast<u32>(i.z) * 0xcb1ab31fu)
        ^ (bitcast<u32>(i.w) * 0x165667b1u) ^ (seed * 0x27d4eb2fu);
  return funit(fhash(h)) * 2.0 - 1.0;
}
struct Noise { n: f32, g: vec4f };
// 4-D value noise with the quintic fade, and its gradient
fn noise4(x: vec4f, seed: u32) -> Noise {
  let fi = floor(x);
  let i = vec4i(fi);
  let t = x - fi;
  let u = t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
  let du = 30.0 * t * t * (t - 1.0) * (t - 1.0);
  var o: Noise;
  o.n = 0.0; o.g = vec4f(0.0);
  for (var c = 0u; c < 16u; c++) {
    let b = vec4u(c & 1u, (c >> 1u) & 1u, (c >> 2u) & 1u, (c >> 3u) & 1u);
    let v = lattice(i + vec4i(b), seed);
    let on = b == vec4u(1u);
    let f = select(1.0 - u, u, on);
    let df = select(-du, du, on);
    o.n = o.n + v * f.x * f.y * f.z * f.w;
    o.g = o.g + v * vec4f(df.x * f.y * f.z * f.w, f.x * df.y * f.z * f.w, f.x * f.y * df.z * f.w, f.x * f.y * f.z * df.w);
  }
  return o;
}
fn fbm(x: vec4f, freq: f32, octaves: u32, seed: u32) -> Noise {
  var o: Noise;
  o.n = 0.0; o.g = vec4f(0.0);
  var a = 1.0;
  var f = freq;
  for (var k = 0u; k < octaves; k++) {
    let r = noise4(x * f + 17.3 * f32(k) * vec4f(1.0, 2.0, 3.0, 4.0), seed + k);
    o.n = o.n + a * r.n;
    o.g = o.g + a * f * r.g;
    a = a * 0.5; f = f * 2.0;
  }
  return o;
}
fn site(seed: u32, j: u32, size: f32) -> vec4f {
  var y = vec4f(0.0);
  for (var a = 0u; a < 4u; a++) { y[a] = size * (2.0 * funit(fhash((seed * 0x9e3779b9u) ^ ((j * 4u + a + 1u) * 0x85ebca6bu))) - 1.0); }
  return y;
}

// The weights of the species at x: w, their gradients G in x, their derivatives S in the reading.
// record: [22, kind, at, first species slot], [k, w, g, 0], a vector, [scalars] (gpu/pack.js)
struct MixW { w: array<f32, 8>, G: array<vec4f, 8>, S: array<f32, 8>, k: u32 };
fn mixWeights(oi: u32, x: vec4f, dr: f32) -> MixW {
  let a = rec(oi, 0u);
  let b = rec(oi, 1u);
  let v = rec(oi, 2u);
  let q = rec(oi, 3u);
  let kind = u32(a.y);
  let k = u32(b.x);
  var m: MixW;
  m.k = k;
  if (kind == 4u) {
    // tissue: a softmax over the sites' squared distances; site j is species j mod k
    let n = min(u32(round(q.x)), 16u);
    let size = q.y;
    let tau = max(q.z * size, 1e-9);
    let seed = u32(round(q.w));
    var ys: array<vec4f, 16>;
    var emax = -1e30;
    for (var j = 0u; j < n; j++) { ys[j] = site(seed, j, size); let d = x - ys[j]; emax = max(emax, -dot(d, d) / tau); }
    var Z = 0.0;
    for (var j = 0u; j < n; j++) {
      let d = x - ys[j];
      let pi = exp(-dot(d, d) / tau - emax);
      Z = Z + pi;
      let i = j % k;
      m.w[i] = m.w[i] + pi;
      m.G[i] = m.G[i] - pi * 2.0 * d / tau;
    }
    var ebar = vec4f(0.0);
    for (var i = 0u; i < k; i++) { m.w[i] = m.w[i] / Z; m.G[i] = m.G[i] / Z; ebar = ebar + m.G[i]; }
    for (var i = 0u; i < k; i++) { m.G[i] = m.G[i] - m.w[i] * ebar; }
    return m;
  }
  if (kind == 8u) {
    // blend: constant relative weights, all zero an even blend
    var sum = 0.0;
    for (var i = 0u; i < k; i++) { let a = max(select(q[i % 4u], v[i % 4u], i < 4u), 0.0); m.w[i] = a; sum = sum + a; }
    for (var i = 0u; i < k; i++) { m.w[i] = select(1.0 / f32(k), m.w[i] / sum, sum > 0.0); }
    return m;
  }
  let w = b.y;
  if (w <= 0.0) { m.w[0] = 1.0; return m; }
  if (w >= 1.0) { m.w[k - 1u] = 1.0; return m; }
  var s = 0.0;
  var gs = vec4f(0.0);
  var sr = 0.0;
  switch kind {
    case 1u: { let nl = length(v); var n = vec4f(0.0); if (nl > 0.0) { n = v / nl; } s = b.z * dot(n, x); gs = b.z * n; }
    case 2u: { let d = x - v; let r = length(d); s = b.z * (r - q.x); if (r > 0.0) { gs = b.z * d / r; } }
    case 3u: { let f = fbm(x, q.x, u32(round(q.y)), u32(round(q.z))); s = b.z * f.n; gs = b.z * f.g; }
    case 5u: { s = b.z * (fTrap - q.x); sr = b.z; }
    case 6u: { s = b.z * (fIter / fIters - 0.5); sr = b.z; }
    case 7u: { s = b.z * log(max(dr, 1e-30)) / (fIter + 1.0); sr = b.z; }
    default: {}
  }
  let sg = 1.0 / (1.0 + exp(-(log(w / (1.0 - w)) + s)));
  let u = f32(k - 1u) * sg;
  let du = f32(k - 1u) * sg * (1.0 - sg);
  let i0 = min(u32(max(floor(u), 0.0)), k - 2u);
  let t = u - f32(i0);
  m.w[i0] = 1.0 - t; m.w[i0 + 1u] = t;
  m.G[i0] = -du * gs; m.G[i0 + 1u] = du * gs;
  m.S[i0] = -du * sr; m.S[i0 + 1u] = du * sr;
  return m;
}

// an orbit-frame field read within the ball of radius FIELD_R and on its sphere beyond (core/fields.js)
const FIELD_R = 2.0;
fn orbitWeights(oi: u32, x: vec4f, dr: f32) -> MixW {
  let r = length(x);
  if (!(r > FIELD_R)) { return mixWeights(oi, x, dr); }
  var m = mixWeights(oi, x * (FIELD_R / r), dr);
  let xh = x / r;
  for (var i = 0u; i < m.k; i++) { m.G[i] = (FIELD_R / r) * (m.G[i] - xh * dot(xh, m.G[i])); }
  return m;
}
fn fieldAt(oi: u32, p: vec4f, dr: f32, world: bool) -> MixW {
  if (world) { return mixWeights(oi, fP0, dr); }
  return orbitWeights(oi, p, dr);
}

struct Fwd { p: vec4f, dr: f32, branch: u32, sp: f32 };

// a sub-stack's ops on (p, dr); branches are not coloured (the mix colours by species)
fn runKid(slot: u32, p0: vec4f, c: vec4f, dr0: f32) -> Fwd {
  var o: Fwd;
  o.p = p0; o.dr = dr0; o.branch = 0u;
  let start = slotStart(slot);
  for (var j = 0u; j < slotLen(slot); j++) {
    let s = opFwd(start + j, o.p, c);
    o.p = s.p;
    if (s.k < 0.0) { o.dr = o.dr + 1.0; } else { o.dr = o.dr * s.k; }
  }
  return o;
}

// The blend of the species' results (kp, kd: each species' point and dr): Σ ωᵢFᵢ; dr = Σ ωᵢ drᵢ
// (core/ops.js says why the field's stretch is not in it); the branch the leading species.
// The interpreter and the JIT both end here.
fn mixCombine(oi: u32, p: vec4f, dr: f32, kp0: array<vec4f, 8>, kd0: array<f32, 8>) -> Fwd {
  var kp = kp0;
  var kd = kd0;
  let world = rec(oi, 0u).z > 0.5;
  let m = fieldAt(oi, p, dr, world);
  var o: Fwd;
  o.p = vec4f(0.0);
  o.dr = 0.0;
  var lead = 0u;
  for (var i = 0u; i < m.k; i++) {
    o.p = o.p + m.w[i] * kp[i];
    o.dr = o.dr + m.w[i] * kd[i];
    if (m.w[i] > m.w[lead]) { lead = i; }
  }
  o.branch = 1u + lead;
  o.sp = f32(lead) / max(f32(m.k) - 1.0, 1.0);
  return o;
}

fn mixFwd(oi: u32, p: vec4f, c: vec4f, dr: f32) -> Fwd {
  let a = rec(oi, 0u);
  let k = u32(rec(oi, 1u).x);
  var kp: array<vec4f, 8>;
  var kd: array<f32, 8>;
  for (var i = 0u; i < k; i++) { let r = runKid(u32(a.w) + i, p, c, dr); kp[i] = r.p; kd[i] = r.dr; }
  return mixCombine(oi, p, dr, kp, kd);
}

// one op of a scheduled slot: the chimera, or any other op with its dr rule applied
fn fwdAt(oi: u32, p: vec4f, c: vec4f, dr: f32) -> Fwd {
  if (u32(rec(oi, 0u).x) == MIX) { return mixFwd(oi, p, c, dr); }
  let s = opFwd(oi, p, c);
  var o: Fwd;
  o.p = s.p; o.branch = s.branch; o.sp = -1.0;
  if (s.k < 0.0) { o.dr = dr + 1.0; } else { o.dr = dr * s.k; }
  return o;
}

fn iterate(p0: vec4f, c: vec4f) -> Trace {
  var t: Trace;
  t.p = p0; t.dr = 1.0; t.n = 0u; t.escaped = false; t.trap = 1e20; t.col = 0.0;
  let bail2 = head.bail * head.bail;
  startOrbit(p0);
  for (var i = 0u; i < head.iters; i++) {
    let slot = schedAt(i);
    let start = slotStart(slot);
    fIter = f32(i);
    if (DRIVE_ON && drvAny) { driveIter(t.p, t.dr, i, f32(head.iters)); }
    for (var j = 0u; j < slotLen(slot); j++) {
      let s = fwdAt(start + j, t.p, c, t.dr);
      t.p = s.p;
      t.dr = s.dr;
      if (s.sp >= 0.0) { t.sp = s.sp; }
      if (s.branch != 0u) { t.col = branchColour(t.col, start + j, s.branch); }
    }
    t.n = i + 1u;
    let r2 = dot(t.p, t.p);
    t.trap = min(t.trap, r2);
    fTrap = min(fTrap, r2);
    if (!(r2 <= bail2)) { t.escaped = true; break; }
  }
  return t;
}

fn deOf(t: Trace) -> f32 {
  let r = length(t.p);
  if (!(t.dr > 0.0) || r == 0.0) { return 0.0; }
  if ((head.flags & FLAG_POWER) != 0u) {
    if (t.escaped && r > 1.0) { return 0.5 * log(r) * r / t.dr; }
    return 0.0;
  }
  return r / abs(t.dr);
}

// pull: the constant is the point itself unless the formula fixes it
fn cFor(p: vec4f) -> vec4f { return select(p, head.c, (head.flags & FLAG_JULIA) != 0u); }

// the distance estimate at a world point
fn de(x: vec3f) -> f32 { let q = embed(x); return deOf(iterate(q, cFor(q))); }

// ---------- drivers: op parameters driven by the orbit, the world, the clock (core/drive.js) ---------
// The program sits after the shading one (gpu/pack.js packDrive). One f32 register per node: the
// hoisted nodes (the start, fields, time, param) are computed once per orbit, at its first iteration;
// the orbit readings and what reads them at the start of every iteration, before its ops (core/drive.js
// says why). A driven op's record reads as its packed value plus (v − own) · d record / dθ — exact, the
// record being linear in every parameter but rotation angles and plane normals: those ops (up to four)
// are rebuilt once per register update into drvNL, so rec() stays small wherever it is inlined (one
// call site per heavy function: Metal's compile time grows with every inlined copy).
const DR_BASE = ${320 + SHADE_VEC4}u;   // (MAX_OPS · REC + the shading program) / 4
const DR_NODES = DR_BASE + 2u;
const DR_BINDS = DR_NODES + 96u;  // DR_NODES + 32 · 3; ten vec4 per binding
var<private> drvAny: bool = false;
var<private> drvFirst: bool = false;
var<private> drvMask: vec4u;
var<private> drvStart: vec4f;
var<private> drvReg: array<f32, 32>;
var<private> drvV: array<f32, 16>;
var<private> drvNL: array<vec4f, 20>;
// one node parameter nudged (the dual numbers' central difference for a sensed driver parameter)
var<private> drvNudgeNode: u32 = 0xffffffffu;
var<private> drvNudgeSlot: u32 = 0u;
var<private> drvNudge: f32 = 0.0;

fn drvIs(oi: u32) -> bool { return ((drvMask[min(oi >> 4u, 3u)] >> (oi & 15u)) & 1u) != 0u; }
fn driveStart(p0: vec4f) {
  drvAny = (head.flags & FLAG_DRIVE) != 0u;
  if (!drvAny) { return; }
  drvFirst = true;
  drvStart = p0;
  drvMask = vec4u(ops[DR_BASE + 1u]);
}
// the raymarch's step factor: 1 / L, set per frame from the sensed steepness of the drivers
fn drvStep() -> f32 { if (DRIVE_ON && (head.flags & FLAG_DRIVE) != 0u) { return head.sliceW.z; } return 1.0; }

fn drvP(i: u32, k: u32) -> f32 {
  var v = ops[DR_NODES + i * 3u + 1u + k / 4u][k % 4u];
  if (i == drvNudgeNode && k == drvNudgeSlot) { v = v + drvNudge; }
  return v;
}
struct DrvRead { i: f32, r: f32, trap: f32, lyap: f32, p: vec4f };
struct DV { v: f32, g: vec4f };

// a world field as a number at x, and its gradient there
fn drvField(i: u32, ty: u32, x: vec4f) -> DV {
  var o: DV;
  o.v = 0.0; o.g = vec4f(0.0);
  switch ty {
    case 13u: {
      let n = vec4f(drvP(i, 0u), drvP(i, 1u), drvP(i, 2u), drvP(i, 3u));
      var l = length(n);
      if (l == 0.0) { l = 1.0; }
      let g = drvP(i, 4u);
      o.v = g * dot(n, x) / l; o.g = g * n / l;
    }
    case 14u: {
      let d = x - vec4f(drvP(i, 0u), drvP(i, 1u), drvP(i, 2u), drvP(i, 3u));
      let L = length(d);
      let g = drvP(i, 5u);
      o.v = g * (L - drvP(i, 4u));
      if (L > 0.0) { o.g = g * d / L; }
    }
    case 15u: {
      let f = fbm(x, drvP(i, 0u), u32(round(drvP(i, 2u))), u32(round(drvP(i, 3u))));
      o.v = drvP(i, 1u) * f.n; o.g = drvP(i, 1u) * f.g;
    }
    case 16u: {
      let k = clamp(u32(round(drvP(i, 0u))), 2u, 16u);
      let size = drvP(i, 1u);
      let seed = u32(round(drvP(i, 3u)));
      if (drvP(i, 4u) > 0.5) {
        // the wall: the gap between the two nearest sites' distances
        var s0 = 1e30; var s1 = 1e30;
        var y0 = vec4f(0.0); var y1 = vec4f(0.0);
        for (var j = 0u; j < k; j++) {
          let y = site(seed, j, size);
          let dd = length(x - y);
          if (dd < s0) { s1 = s0; y1 = y0; s0 = dd; y0 = y; } else if (dd < s1) { s1 = dd; y1 = y; }
        }
        o.v = (s1 - s0) / size;
        o.g = ((x - y1) / max(s1, 1e-12) - (x - y0) / max(s0, 1e-12)) / size;
      } else {
        // the cell: the softmax-weighted cell index ÷ (k − 1)
        let tau = max(drvP(i, 2u) * size, 1e-9);
        var ys: array<vec4f, 16>;
        var emax = -1e30;
        for (var j = 0u; j < k; j++) { ys[j] = site(seed, j, size); let d = x - ys[j]; emax = max(emax, -dot(d, d) / tau); }
        var Z = 0.0; var V = 0.0;
        var G = vec4f(0.0); var GV = vec4f(0.0);
        for (var j = 0u; j < k; j++) {
          let d = x - ys[j];
          let pi = exp(-dot(d, d) / tau - emax);
          let cj = f32(j) / f32(k - 1u);
          let ge = -2.0 * d / tau;
          Z = Z + pi; V = V + pi * cj; G = G + pi * ge; GV = GV + pi * cj * ge;
        }
        o.v = V / Z;
        o.g = GV / Z - o.v * G / Z;
      }
    }
    default: {}
  }
  return o;
}

// a node's value (and, for a field, its gradient at the start)
fn drvNode(i: u32, a: vec4f, rd: DrvRead) -> DV {
  let ty = u32(a.x);
  if (ty >= 13u && ty <= 16u) { return drvField(i, ty, drvStart); }
  var o: DV;
  o.v = drvScalar(i, a, rd); o.g = vec4f(0.0);
  return o;
}
fn drvScalar(i: u32, a: vec4f, rd: DrvRead) -> f32 {
  let ty = u32(a.x);
  switch ty {
    case 1u: { return rd.i; }
    case 2u: { return rd.r; }
    case 3u: { return rd.trap; }
    case 4u: { return rd.lyap; }
    case 5u, 6u, 7u, 8u: { return rd.p[ty - 5u]; }
    case 9u, 10u, 11u, 12u: { return drvStart[ty - 9u]; }
    case 17u: {
      let u = head.sliceW.y * drvP(i, 0u) + drvP(i, 1u);
      let fr = u - floor(u);
      let w = u32(drvP(i, 2u));
      if (w == 0u) { return fr; }
      if (w == 2u) { return 1.0 - abs(2.0 * fr - 1.0); }
      return 0.5 + 0.5 * sin(6.2831853 * u);
    }
    case 18u: { return drvP(i, 0u); }
    case 19u: {
      var x = 0.0;
      if (a.y >= 0.0) { x = drvReg[u32(a.y)]; }
      var y = drvP(i, 1u);
      if (a.z >= 0.0) { y = drvReg[u32(a.z)]; }
      return shMath(u32(drvP(i, 0u)), x, y);
    }
    case 20u: {
      var x = 0.0;
      if (a.y >= 0.0) { x = drvReg[u32(a.y)]; }
      var d = drvP(i, 1u) - drvP(i, 0u);
      if (d == 0.0) { d = 1e-12; }
      let v = (x - drvP(i, 0u)) / d;
      if (drvP(i, 2u) > 0.5) { return clamp(v, 0.0, 1.0); }
      return v;
    }
    default: { return 0.0; }
  }
}

fn drvReadings(p: vec4f, dr: f32, i: u32, n: f32) -> DrvRead {
  var rd: DrvRead;
  rd.i = f32(i) / n; rd.r = length(p); rd.trap = fTrap; rd.lyap = log(max(dr, 1e-30)) / (f32(i) + 1.0); rd.p = p;
  return rd;
}

// at the start of iteration i (of n): the registers, then every binding's value, clamped to its range
fn driveIter(p: vec4f, dr: f32, i: u32, n: f32) {
  let h = ops[DR_BASE];
  if (!drvFirst && h.z < 0.5) { return; }
  let rd = drvReadings(p, dr, i, n);
  let nn = min(u32(h.x), 32u);
  for (var k = 0u; k < nn; k++) {
    let a = ops[DR_NODES + k * 3u];
    if (drvFirst || a.w > 0.5) { drvReg[k] = drvNode(k, a, rd).v; }
  }
  drvFirst = false;
  let nb = min(u32(h.y), 16u);
  for (var b = 0u; b < nb; b++) {
    let B = ops[DR_BINDS + b * 10u];
    let C = ops[DR_BINDS + b * 10u + 1u];
    drvV[b] = clamp(B.z + drvReg[u32(B.y)] * (B.w - B.z), C.y, C.z);
  }
  drvRebuild();
}

// A driven rotation's or plane fold's whole record, rebuilt from its raw parameters with the driven
// values in (binding nudgeB nudged by h: the dual numbers' central difference). Rotations as plane
// rotations applied in order (core/vec.js): rotate is x (yz), then y (zx), then z (xy); rotate4 its six
// planes xy, xz, xw, yz, yw, zw.
fn drvBuild(oi: u32, nudgeB: u32, h: f32) -> array<vec4f, 5> {
  // no dynamically indexed local arrays here: Metal miscompiled an earlier form (rows read back as
  // another mode's) once this function was inlined beside the chimera code
  let nb = min(u32(ops[DR_BASE].y), 16u);
  var a = vec4f(0.0);
  var b4 = vec4f(0.0);
  var mode = 0u;
  var have = false;
  for (var b = 0u; b < nb; b++) {
    let at = DR_BINDS + b * 10u;
    if (u32(ops[at].x) != oi) { continue; }
    if (!have) { a = ops[at + 8u]; b4 = ops[at + 9u]; mode = u32(ops[at + 1u].w); have = true; }
    let s = u32(ops[at + 2u].x);
    let v = drvV[b] + select(0.0, h, b == nudgeB);
    a = select(a, vec4f(v), vec4<bool>(s == 0u, s == 1u, s == 2u, s == 3u));
    b4 = select(b4, vec4f(v), vec4<bool>(s == 4u, s == 5u, s == 6u, s == 7u));
  }
  let code = ops[oi * REC4].x;
  if (mode == 3u) {
    var n = a;
    let l = length(n);
    if (l > 0.0) { n = n / l; }
    return array<vec4f, 5>(vec4f(code, n.xyz), vec4f(n.w, b4.x, 0.0, 0.0), vec4f(0.0), vec4f(0.0), vec4f(0.0));
  }
  var r0 = vec4f(1.0, 0.0, 0.0, 0.0);
  var r1 = vec4f(0.0, 1.0, 0.0, 0.0);
  var r2 = vec4f(0.0, 0.0, 1.0, 0.0);
  var r3 = vec4f(0.0, 0.0, 0.0, 1.0);
  var g: mat2x4f;
  if (mode == 1u) {
    g = drvGivens(r1, r2, a.x); r1 = g[0]; r2 = g[1];
    g = drvGivens(r0, r2, -a.y); r0 = g[0]; r2 = g[1];
    g = drvGivens(r0, r1, a.z); r0 = g[0]; r1 = g[1];
  } else {
    g = drvGivens(r0, r1, a.x); r0 = g[0]; r1 = g[1];
    g = drvGivens(r0, r2, a.y); r0 = g[0]; r2 = g[1];
    g = drvGivens(r0, r3, a.z); r0 = g[0]; r3 = g[1];
    g = drvGivens(r1, r2, a.w); r1 = g[0]; r2 = g[1];
    g = drvGivens(r1, r3, b4.x); r1 = g[0]; r3 = g[1];
    g = drvGivens(r2, r3, b4.y); r2 = g[0]; r3 = g[1];
  }
  return array<vec4f, 5>(vec4f(code, r0.xyz), vec4f(r0.w, r1.xyz), vec4f(r1.w, r2.xyz), vec4f(r2.w, r3.xyz), vec4f(r3.w, 0.0, 0.0, 0.0));
}
// rows i and j of a matrix after the plane rotation by t degrees in their plane, applied from the left
fn drvGivens(ri: vec4f, rj: vec4f, t: f32) -> mat2x4f {
  let r = t * PI / 180.0;
  let c = cos(r);
  let s = sin(r);
  return mat2x4f(c * ri - s * rj, s * ri + c * rj);
}

// after the values change: every rebuilt op's record into drvNL (its slot: [raw slot, nl slot, …])
fn drvRebuild() {
  let nb = min(u32(ops[DR_BASE].y), 16u);
  var done = 0u;
  for (var b = 0u; b < nb; b++) {
    let at = DR_BINDS + b * 10u;
    if (ops[at + 1u].w < 0.5) { continue; }
    let nl = u32(ops[at + 2u].y);
    if (((done >> nl) & 1u) != 0u) { continue; }
    done = done | (1u << nl);
    let r = drvBuild(u32(ops[at].x), 0xffffffffu, 0.0);
    for (var k = 0u; k < 5u; k++) { drvNL[nl * 5u + k] = r[k]; }
  }
}

fn drvRec(oi: u32, k: u32, r: vec4f) -> vec4f {
  let nb = min(u32(ops[DR_BASE].y), 16u);
  var o = r;
  var nl = -1;
  for (var b = 0u; b < nb; b++) {
    let at = DR_BINDS + b * 10u;
    if (u32(ops[at].x) != oi) { continue; }
    let C = ops[at + 1u];
    if (C.w > 0.5) { nl = i32(ops[at + 2u].y); } else { o = o + (drvV[b] - C.x) * ops[at + 3u + k]; }
  }
  if (nl >= 0) { o = drvNL[min(u32(nl), 3u) * 5u + k]; }
  return o;
}

// ---------- shading: the formula's colour graph (core/shade.js, operation for operation) ------------
// The program sits after the op records (gpu/pack.js SHADE_AT): a header [n, colour node, glow node,
// glow is a colour] [gain, bindings], four vec4 per node, the stops, the bindings. One vec4 register
// per node. Drivers → colour: an input ≤ −2 reads the drivers' register −2 − i (drvReg, as the hit's
// orbit left it), and the bindings set parameters from them — only in the drivers' variant (DRIVE_ON);
// elsewhere a driver reads 0 and every parameter keeps its own value.
const SH_BASE = 320u;            // MAX_OPS · REC / 4
const SH_NODES = SH_BASE + 2u;
const SH_NODE4 = ${SH_NODE_VEC4}u;
const SH_STOPS = ${320 + SH_STOPS_AT}u;
const SH_BINDS = ${320 + SH_BINDS_AT}u;
// piece and seam: a collage's own shade (gpu/wgsl.js COLLAGE); 0 for a formula
struct Readings { col: f32, trap: f32, depth: f32, lyap: f32, facing: f32, species: f32, w: f32, piece: f32, seam: f32 };
struct ShadeOut { color: vec4f, glow: vec4f, glowIsColour: bool, hasGlow: bool, gain: f32 };
// up to four driven stops: their places among all stops (−1 none) and their driven t
var<private> shOvI: vec4i = vec4i(-1);
var<private> shOvV: vec4f;

fn shRgb2hsv(c: vec3f) -> vec3f {
  let mx = max(c.x, max(c.y, c.z));
  let mn = min(c.x, min(c.y, c.z));
  let d = mx - mn;
  var h = 0.0;
  if (d > 0.0) {
    if (mx == c.x) { h = ((c.y - c.z) / d) / 6.0; }
    else if (mx == c.y) { h = ((c.z - c.x) / d + 2.0) / 6.0; }
    else { h = ((c.x - c.y) / d + 4.0) / 6.0; }
    h = h - floor(h);
  }
  return vec3f(h, select(0.0, d / mx, mx > 0.0), mx);
}
fn shHsv2rgb(c: vec3f) -> vec3f {
  let hh = (c.x - floor(c.x)) * 6.0;
  let i = u32(floor(hh)) % 6u;
  let f = hh - floor(hh);
  let v = c.z;
  let p = v * (1.0 - c.y);
  let q = v * (1.0 - c.y * f);
  let t = v * (1.0 - c.y * (1.0 - f));
  switch i {
    case 0u: { return vec3f(v, t, p); }
    case 1u: { return vec3f(q, v, p); }
    case 2u: { return vec3f(p, v, t); }
    case 3u: { return vec3f(p, q, v); }
    case 4u: { return vec3f(t, p, v); }
    default: { return vec3f(v, p, q); }
  }
}
fn shCbrt(x: f32) -> f32 { return sign(x) * pow(abs(x), 1.0 / 3.0); }
fn shRgb2oklab(c: vec3f) -> vec3f {
  let l = shCbrt(0.4122214708 * c.x + 0.5363325363 * c.y + 0.0514459929 * c.z);
  let m = shCbrt(0.2119034982 * c.x + 0.6806995451 * c.y + 0.1073969566 * c.z);
  let s = shCbrt(0.0883024619 * c.x + 0.2817188376 * c.y + 0.6299787005 * c.z);
  return vec3f(0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s);
}
fn shOklab2rgb(c: vec3f) -> vec3f {
  let l3 = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  let m3 = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  let s3 = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  let L = l3 * l3 * l3;
  let M = m3 * m3 * m3;
  let S = s3 * s3 * s3;
  return vec3f(4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S, -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S, -0.0041960863 * L - 0.7034186147 * M + 1.7076147010 * S);
}
fn shToSpace(c: vec3f, sp: u32) -> vec3f {
  if (sp == 1u) { return shRgb2hsv(c); }
  if (sp == 2u) { return shRgb2oklab(c); }
  return c;
}
fn shFromSpace(c: vec3f, sp: u32) -> vec3f {
  if (sp == 1u) { return shHsv2rgb(vec3f(c.x - floor(c.x), clamp(c.y, 0.0, 1.0), clamp(c.z, 0.0, 1.0))); }
  if (sp == 2u) { return shOklab2rgb(c); }
  return c;
}
fn shT(j: u32) -> f32 {
  var t = ops[SH_STOPS + 2u * j].x;
  if (DRIVE_ON) { let m = shOvI == vec4i(i32(j)); if (any(m)) { t = dot(select(vec4f(0.0), shOvV, m), vec4f(1.0)); } }
  return t;
}
fn shC(j: u32) -> vec4f { return ops[SH_STOPS + 2u * j + 1u]; }

// log2 → · scale + offset → clamp / repeat / mirror → invert
fn shMap(x: f32, m: vec4f) -> f32 {
  var v = x;
  let fl = u32(m.w);
  if ((fl & 1u) != 0u) { v = log2(max(v, 1e-12)); }
  v = v * m.x + m.y;
  let mode = u32(m.z);
  if (mode == 0u) { v = clamp(v, 0.0, 1.0); }
  else if (mode == 1u) { v = v - floor(v); }
  else { v = v - 2.0 * floor(v * 0.5); if (v > 1.0) { v = 2.0 - v; } }
  if ((fl & 2u) != 0u) { v = 1.0 - v; }
  return v;
}

// a turn around the hue ring in Oklab (core/shade.js hueTurn): a, b rotated, lightness kept
fn shHue(c: vec4f, hue: f32) -> vec4f {
  if (hue == 0.0) { return c; }
  let lab = shRgb2oklab(c.rgb);
  let th = 6.2831853 * hue;
  let cs = cos(th);
  let sn = sin(th);
  return vec4f(clamp(shOklab2rgb(vec3f(lab.x, lab.y * cs - lab.z * sn, lab.y * sn + lab.z * cs)), vec3f(0.0), vec3f(1.0)), c.w);
}

fn shRamp(b: vec4f, m: vec4f, x: f32, hue: f32) -> vec4f {
  let s0 = u32(b.x);
  let n = u32(b.y);
  let interp = u32(b.z);
  let sp = u32(b.w);
  let t = shMap(x, m);
  if (n <= 1u || t <= shT(s0)) { return shHue(clamp(shC(s0), vec4f(0.0), vec4f(1.0)), hue); }
  if (t >= shT(s0 + n - 1u)) { return shHue(clamp(shC(s0 + n - 1u), vec4f(0.0), vec4f(1.0)), hue); }
  var i = 0u;
  for (var j = 0u; j < n; j++) { if (shT(s0 + j) <= t) { i = j; } }
  if (interp == 0u) { return shHue(clamp(shC(s0 + i), vec4f(0.0), vec4f(1.0)), hue); }
  let i1 = min(i + 1u, n - 1u);
  let ta = shT(s0 + i);
  let tb = shT(s0 + i1);
  var f = select(0.0, (t - ta) / (tb - ta), tb > ta);
  var idx = array<u32, 4>(i, i1, i1, i1);
  var w = vec4f(1.0 - f, f, 0.0, 0.0);
  var count = 2u;
  if (interp == 2u) { f = f * f * (3.0 - 2.0 * f); w = vec4f(1.0 - f, f, 0.0, 0.0); }
  if (interp >= 3u) {
    idx = array<u32, 4>(select(i - 1u, 0u, i == 0u), i, i1, min(i + 2u, n - 1u));
    count = 4u;
    let f2 = f * f;
    let f3 = f2 * f;
    if (interp == 3u) { w = vec4f((1.0 - f) * (1.0 - f) * (1.0 - f) / 6.0, (3.0 * f3 - 6.0 * f2 + 4.0) / 6.0, (-3.0 * f3 + 3.0 * f2 + 3.0 * f + 1.0) / 6.0, f3 / 6.0); }
    else { w = 0.5 * vec4f(-f3 + 2.0 * f2 - f, 3.0 * f3 - 5.0 * f2 + 2.0, -3.0 * f3 + 4.0 * f2 + f, f3 - f2); }
  }
  var cs: array<vec3f, 4>;
  for (var k = 0u; k < count; k++) { cs[k] = shToSpace(shC(s0 + idx[k]).rgb, sp); }
  if (sp == 1u) {
    // hues the shortest way round, relative to the segment's first stop
    let hue0 = cs[select(1u, 0u, count == 2u)].x;
    for (var k = 0u; k < count; k++) { cs[k].x = cs[k].x - round(cs[k].x - hue0); }
  }
  var mixed = vec3f(0.0);
  var alpha = 0.0;
  for (var k = 0u; k < count; k++) { mixed = mixed + w[k] * cs[k]; alpha = alpha + w[k] * shC(s0 + idx[k]).w; }
  return shHue(vec4f(clamp(shFromSpace(mixed, sp), vec3f(0.0), vec3f(1.0)), clamp(alpha, 0.0, 1.0)), hue);
}

fn shMath(op: u32, a: f32, b: f32) -> f32 {
  switch op {
    case 0u: { return a + b; }
    case 1u: { return a - b; }
    case 2u: { return a * b; }
    case 3u: { return min(a, b); }
    case 4u: { return max(a, b); }
    case 5u: { return pow(max(a, 0.0), b); }
    case 6u: { return 0.5 + 0.5 * sin(6.2831853 * a * b); }
    case 7u: { return select(a, floor(a / b) * b, b > 0.0); }
    default: { return a; }
  }
}

fn shMix(mode: u32, a: vec4f, b: vec4f, f: f32) -> vec4f {
  var rgb = mix(a.rgb, b.rgb, f);
  if (mode == 1u) { rgb = mix(a.rgb, a.rgb * b.rgb, f); }
  else if (mode == 2u) { rgb = mix(a.rgb, 1.0 - (1.0 - a.rgb) * (1.0 - b.rgb), f); }
  else if (mode == 3u) { rgb = a.rgb + b.rgb * f; }
  return vec4f(rgb, mix(a.w, b.w, f));
}

// a binding's value: lo + v · (hi − lo), clamped (core/shade.js boundShade)
fn shBound(k: u32) -> f32 {
  let A = ops[SH_BINDS + 2u * k];
  let B = ops[SH_BINDS + 2u * k + 1u];
  return clamp(B.x + drvReg[u32(A.z)] * (B.y - B.x), B.z, B.w);
}
// a number input: a node's register, a driver's (≤ −2), or the default
fn shNum(reg: ptr<function, array<vec4f, 32>>, i: i32, d: f32) -> f32 {
  if (i >= 0) { return (*reg)[i].x; }
  if (DRIVE_ON && i <= -2) { return drvReg[u32(-2 - i)]; }
  return d;
}

fn shadeRun(r: Readings) -> ShadeOut {
  var reg: array<vec4f, 32>;
  let h = ops[SH_BASE];
  let h2 = ops[SH_BASE + 1u];
  var gain = h2.x;
  let nb = select(0u, min(u32(h2.y), 16u), DRIVE_ON);
  shOvI = vec4i(-1);
  if (DRIVE_ON) {
    var s = 0u;
    for (var k = 0u; k < nb; k++) {
      let A = ops[SH_BINDS + 2u * k];
      if (u32(A.y) == 3u && s < 4u) { shOvI[s] = i32(A.w); shOvV[s] = shBound(k); s++; }
      if (u32(A.y) == 6u) { gain = shBound(k); }
    }
  }
  let n = min(u32(h.x), 32u);
  for (var i = 0u; i < n; i++) {
    let a = ops[SH_NODES + i * SH_NODE4];
    var b = ops[SH_NODES + i * SH_NODE4 + 1u];
    var c = ops[SH_NODES + i * SH_NODE4 + 2u];
    var d = ops[SH_NODES + i * SH_NODE4 + 3u];
    if (DRIVE_ON) {
      for (var k = 0u; k < nb; k++) {
        let A = ops[SH_BINDS + 2u * k];
        if (i32(A.x) != i32(i)) { continue; }
        let v = shBound(k);
        switch u32(A.y) {
          case 0u: { c.x = v; }
          case 1u: { c.y = v; }
          case 2u: { d.x = v; }
          case 4u, 5u: { b.y = v; }
          default: {}
        }
      }
    }
    let ty = u32(a.x);
    let i0 = i32(a.y);
    let i1 = i32(a.z);
    let i2 = i32(a.w);
    var v = vec4f(0.0);
    switch ty {
      case 1u: { v.x = r.col; }
      case 2u: { v.x = r.trap; }
      case 3u: { v.x = r.depth; }
      case 4u: { v.x = r.lyap; }
      case 5u: { v.x = r.facing; }
      case 6u: { v.x = r.species; }
      case 7u: { v.x = r.w; }
      case 8u: { v.x = r.piece; }
      case 9u: { v.x = r.seam; }
      case 10u: { v = shRamp(b, c, shNum(&reg, i0, 0.0), d.x); }
      case 11u: { v.x = shMath(u32(b.x), shNum(&reg, i0, 0.0), shNum(&reg, i1, b.y)); }
      case 12u: {
        let f = shNum(&reg, i2, b.y);
        var ca = vec4f(0.0); if (i0 >= 0) { ca = reg[i0]; }
        var cb = vec4f(0.0); if (i1 >= 0) { cb = reg[i1]; }
        v = shMix(u32(b.x), ca, cb, f);
      }
      default: {}
    }
    reg[i] = v;
  }
  var o: ShadeOut;
  let ci = i32(h.y);
  let gi = i32(h.z);
  if (ci >= 0) { o.color = reg[ci]; }
  o.hasGlow = gi >= 0;
  if (gi >= 0) { o.glow = reg[gi]; }
  o.glowIsColour = h.w > 0.5;
  o.gain = gain;
  return o;
}
`;

// The inverse half, for push. Needs a random source: the includer defines
//   var<private> rngState: u32   and   fn pick(n: u32) -> u32   (uniform in [0, n), advancing rngState)
export const INVERSE = /* wgsl */ `
// the k-th permutation of four, by the factorial number system
fn perm4(k0: u32) -> vec4u {
  var pool = array<u32, 4>(0u, 1u, 2u, 3u);
  var out = vec4u(0u);
  var k = k0;
  var left = 4u;
  for (var i = 0u; i < 4u; i++) {
    var f = 1u;
    for (var m = 1u; m < left; m++) { f = f * m; }
    let idx = k / f;
    k = k % f;
    out[i] = pool[idx];
    for (var m = idx; m + 1u < left; m++) { pool[m] = pool[m + 1u]; }
    left = left - 1u;
  }
  return out;
}

// one preimage of q under op oi of a scheduled slot: the chimera's, or opInv's. The chimera needs the
// dual numbers (mixTan) for its Newton steps, so a shader with INVERSE includes DUAL too.
fn invAt(oi: u32, q: vec4f, c: vec4f) -> Step {
  if (u32(rec(oi, 0u).x) == MIX) { return mixInv(oi, q, c); }
  return opInv(oi, q, c);
}

// a sub-stack inverted: its ops in reverse order
fn kidInv(slot: u32, q: vec4f, c: vec4f) -> Step {
  var s: Step;
  s.p = q; s.k = 1.0; s.branch = 0u; s.ok = true;
  let start = slotStart(slot);
  let len = slotLen(slot);
  for (var j = 0u; j < len; j++) {
    let r = opInv(start + len - 1u - j, s.p, c);
    if (!r.ok) { s.ok = false; return s; }
    s.p = r.p;
  }
  return s;
}

// x with M x = y, by elimination with partial pivoting; ok = false when M is singular
struct Solve { x: vec4f, ok: bool };
fn solve4(M: mat4x4f, y: vec4f) -> Solve {
  // rows of M with y appended (M is column-major)
  var A = array<vec4f, 4>(vec4f(M[0][0], M[1][0], M[2][0], M[3][0]), vec4f(M[0][1], M[1][1], M[2][1], M[3][1]),
                          vec4f(M[0][2], M[1][2], M[2][2], M[3][2]), vec4f(M[0][3], M[1][3], M[2][3], M[3][3]));
  var b = y;
  var o: Solve;
  o.ok = false;
  for (var k = 0u; k < 4u; k++) {
    var piv = k;
    for (var i = k + 1u; i < 4u; i++) { if (abs(A[i][k]) > abs(A[piv][k])) { piv = i; } }
    if (!(abs(A[piv][k]) > 1e-20)) { return o; }
    let tr = A[k]; A[k] = A[piv]; A[piv] = tr;
    let tb = b[k]; b[k] = b[piv]; b[piv] = tb;
    for (var i = 0u; i < 4u; i++) {
      if (i == k) { continue; }
      let f = A[i][k] / A[k][k];
      A[i] = A[i] - f * A[k];
      b[i] = b[i] - f * b[k];
    }
  }
  o.x = vec4f(b[0] / A[0][0], b[1] / A[1][1], b[2] / A[2][2], b[3] / A[3][3]);
  o.ok = true;
  return o;
}

// The blend's preimage (core/cpu.js mixInv): one species inverted for a first guess, then Newton on the
// blend with its exact Jacobian from the tangents; up to four guesses, cycling the species from a pick
const MIX_NEWTON = 8u;
const MIX_GUESSES = 4u;

// The push walk differentiates each step by replaying it at four nudged points. For the chimera that
// would solve Newton five times; instead the walk keeps the solution and the blend's Jacobian there
// (mixKeep), and the replays answer by linearisation (mixReplay): x* + J⁻¹(q − q*), the exact
// derivative of the preimage. A formula holds at most one mix (four slots), so one set suffices.
var<private> mixKeep: bool = false;
var<private> mixReplay: bool = false;
var<private> mixX: vec4f;
var<private> mixQ: vec4f;
var<private> mixJ: mat4x4f;
var<private> mixBranch: u32;
var<private> mixRng: u32;   // the random state after the solve, so ops inverted later pick as they did

// The inverse has no start point: a world-frame field is read at the point solved for (fP0 = x, and
// its column moves with x); the self-fields at the context the walk set (fTrap, fIter).
fn mixAt(oi: u32, x: vec4f, c: vec4f) -> vec4f { fP0 = x; return mixFwd(oi, x, c, 1.0).p; }
fn mixJacobian(oi: u32, x: vec4f, c: vec4f) -> mat4x4f {
  fP0 = x;
  let z = vec4f(0.0);
  let I = array<vec4f, 5>(vec4f(1.0, 0.0, 0.0, 0.0), vec4f(0.0, 1.0, 0.0, 0.0), vec4f(0.0, 0.0, 1.0, 0.0), vec4f(0.0, 0.0, 0.0, 1.0), z);
  let t = mixTan(oi, x, c, 1.0, 4u, I, array<f32, 5>(0.0, 0.0, 0.0, 0.0, 0.0), array<vec4f, 5>(z, z, z, z, z), I,
                 array<f32, 5>(0.0, 0.0, 0.0, 0.0, 0.0), 99u);
  return mat4x4f(t.v[0], t.v[1], t.v[2], t.v[3]);
}

fn mixInv(oi: u32, q: vec4f, c: vec4f) -> Step {
  var s: Step;
  s.p = q; s.k = 1.0; s.branch = 0u; s.ok = false;
  if (mixReplay) {
    let d = solve4(mixJ, q - mixQ);
    s.ok = d.ok; s.p = mixX + d.x; s.branch = mixBranch;
    rngState = mixRng;
    return s;
  }
  let a = rec(oi, 0u);
  let k = u32(rec(oi, 1u).x);
  let first = pick(k);
  let tol = 3e-6 * (1.0 + length(q));
  for (var g = 0u; g < MIX_GUESSES; g++) {
    let which = (first + g) % k;
    let guess = kidInv(u32(a.w) + which, q, c);
    if (!guess.ok) { continue; }
    var x = guess.p;
    var best = 1e30;
    var bestX = x;
    var stall = 0u;
    for (var i = 0u; i <= MIX_NEWTON; i++) {
      let F = mixAt(oi, x, c) - q;
      let e = length(F);
      // a guess outside Newton's basin shows soon: two steps without the residual shrinking (one is
      // allowed — crossing a fold's edge can cost a step)
      if (e < 0.9 * best) { best = e; bestX = x; stall = 0u; } else { stall++; }
      if (best <= tol || i == MIX_NEWTON || stall >= 2u || !(e == e)) { break; }
      let d = solve4(mixJacobian(oi, x, c), F);
      if (!d.ok) { break; }
      x = x - d.x;
    }
    // float32 stalls a little above the CPU's tolerance: accept what Newton brought within 30×
    if (best <= 30.0 * tol) {
      s.ok = true; s.p = bestX; s.branch = 1u + which;
      if (mixKeep) { mixX = bestX; mixQ = q; mixJ = mixJacobian(oi, bestX, c); mixBranch = s.branch; mixRng = rngState; }
      return s;
    }
  }
  return s;
}

// one preimage of q under op oi, choosing a branch with pick(); ok = false when q has none
fn opInv(oi: u32, q: vec4f, c: vec4f) -> Step {
  let a = rec(oi, 0u);
  let b = rec(oi, 1u);
  var s: Step;
  s.p = q; s.k = 1.0; s.branch = 0u; s.ok = true;
  switch u32(a.x) {
    case 0u: { s.p = q - vec4f(a.yzw, b.x); }
    case 1u: { s.p = q - c; }
    case 2u: { if (a.y == 0.0) { s.ok = false; } else { s.p = q / a.y; } }
    case 3u: { s.p = rowsOf(oi) * q; }
    case 4u: {
      let n = vec4f(a.yzw, b.x);
      let t = dot(q, n) - b.y;
      if (t < 0.0) { s.ok = false; }
      else if (pick(2u) == 1u) { s.p = q - 2.0 * t * n; s.branch = 1u; }
    }
    case 5u: {
      let l = a.y;
      var o = vec4f(0.0);
      for (var i = 0u; i < 4u; i++) {
        let y = q[i];
        // candidates in a fixed order: y itself (inside), 2l − y (came from above), −2l − y (below)
        var cand = array<f32, 3>(0.0, 0.0, 0.0);
        var m = 0u;
        if (abs(y) <= l) { cand[m] = y; m++; }
        if (y < l) { cand[m] = 2.0 * l - y; m++; }
        if (y > -l) { cand[m] = -2.0 * l - y; m++; }
        let k = pick(m);
        o[i] = cand[k];
        s.branch = s.branch * 3u + k;
      }
      s.p = o;
    }
    case 6u: {
      let r = length(q);
      let m2 = a.y * a.y;
      let f2 = a.z * a.z;
      let k0 = f2 / m2;
      var cand = array<vec4f, 3>(q, q, q);
      var m = 0u;
      if (r / k0 < a.y) { cand[m] = q / k0; m++; }
      if (r > a.z && r <= f2 / a.y) { cand[m] = q * (f2 / (r * r)); m++; }
      if (r >= a.z) { cand[m] = q; m++; }
      if (m == 0u) { s.ok = false; } else { let k = pick(m); s.p = cand[k]; s.branch = k; }
    }
    case 7u: {
      if (any(q < vec4f(0.0))) { s.ok = false; }
      else {
        s.branch = pick(16u);
        s.p = q * vec4f(select(1.0, -1.0, (s.branch & 1u) != 0u), select(1.0, -1.0, (s.branch & 2u) != 0u),
                        select(1.0, -1.0, (s.branch & 4u) != 0u), select(1.0, -1.0, (s.branch & 8u) != 0u));
      }
    }
    case 8u: {
      if (!(q.x >= q.y && q.y >= q.z)) { s.ok = false; }
      else {
        s.branch = pick(6u);
        var x = q.xyz;
        switch s.branch {
          case 0u: { x = q.xyz; }
          case 1u: { x = q.xzy; }
          case 2u: { x = q.yxz; }
          case 3u: { x = q.zxy; }
          case 4u: { x = q.yzx; }
          default: { x = q.zyx; }
        }
        s.p = vec4f(x, q.w);
      }
    }
    case 19u: {
      if (!(q.x >= q.y && q.y >= q.z && q.z >= q.w)) { s.ok = false; }
      else {
        s.branch = pick(24u);
        let pm = perm4(s.branch);
        var o = vec4f(0.0);
        for (var i = 0u; i < 4u; i++) { o[pm[i]] = q[i]; }
        s.p = o;
      }
    }
    case 9u: {
      // every t = (±θ + 2πk)/n inside [0, π] is a preimage polar angle (with φ shifted by π for −);
      // every azimuth (φ + 2πj)/n is valid
      let r = length(q.xyz);
      if (r > 0.0) {
        let n = a.y;
        let ni = u32(max(1.0, round(n)));
        let theta = acos(clamp(q.z / r, -1.0, 1.0));
        let phi = atan2(q.y, q.x);
        var count = 0u;
        for (var k = 0u; k <= ni; k++) {
          if ((theta + 2.0 * PI * f32(k)) / n <= PI) { count++; }
          if (k >= 1u && (2.0 * PI * f32(k) - theta) / n <= PI && (2.0 * PI * f32(k) - theta) >= 0.0) { count++; }
        }
        if (count == 0u) { s.ok = false; }
        else {
          var want = pick(count);
          var tt = 0.0;
          var flip = 0.0;
          for (var k = 0u; k <= ni; k++) {
            if ((theta + 2.0 * PI * f32(k)) / n <= PI) {
              if (want == 0u) { tt = (theta + 2.0 * PI * f32(k)) / n; flip = 0.0; break; }
              want--;
            }
            if (k >= 1u && (2.0 * PI * f32(k) - theta) / n <= PI && (2.0 * PI * f32(k) - theta) >= 0.0) {
              if (want == 0u) { tt = (2.0 * PI * f32(k) - theta) / n; flip = PI; break; }
              want--;
            }
          }
          let j = pick(ni);
          let f = (phi + flip + 2.0 * PI * f32(j)) / n;
          let rn = pow(r, 1.0 / n);
          s.p = vec4f(rn * vec3f(sin(tt) * cos(f), sin(tt) * sin(f), cos(tt)), q.w);
          s.branch = j;
        }
      }
    }
    case 20u: {
      // with s₁ the sign of sin(nθ₁'), a preimage needs cos(nθ₂') = s₁ cos θ₂ and the azimuth shifted
      // by π when s₁·s₂ = −1; every (s₁, k, s₂, m) with both angles in [0, π] is one (checked on the
      // CPU: 218,800 candidates over n = 2, 3, 8, all genuine)
      let r = length(q);
      if (r > 0.0) {
        let n = a.y;
        let ni = u32(max(1.0, round(n)));
        let r1 = length(q.yzw);
        let T1 = acos(clamp(q.x / r, -1.0, 1.0));
        var T2 = 0.0;
        if (r1 > 0.0) { T2 = acos(clamp(q.y / r1, -1.0, 1.0)); }
        let F = atan2(q.w, q.z);
        var count = 0u;
        for (var i1 = 0u; i1 < 2u; i1++) {
          let s1 = select(1.0, -1.0, i1 == 1u);
          let base2 = select(PI - T2, T2, i1 == 0u);
          for (var k = 0u; k <= ni; k++) {
            let t1 = (s1 * T1 + 2.0 * PI * f32(k)) / n;
            if (t1 < 0.0 || t1 > PI) { continue; }
            for (var i2 = 0u; i2 < 2u; i2++) {
              let s2 = select(1.0, -1.0, i2 == 1u);
              for (var m = 0u; m <= ni; m++) {
                let t2 = (s2 * base2 + 2.0 * PI * f32(m)) / n;
                if (t2 >= 0.0 && t2 <= PI) { count++; }
              }
            }
          }
        }
        if (count == 0u) { s.ok = false; }
        else {
          var want = pick(count);
          var t1o = 0.0; var t2o = 0.0; var shift = 0.0;
          var found = false;
          for (var i1 = 0u; i1 < 2u && !found; i1++) {
            let s1 = select(1.0, -1.0, i1 == 1u);
            let base2 = select(PI - T2, T2, i1 == 0u);
            for (var k = 0u; k <= ni && !found; k++) {
              let t1 = (s1 * T1 + 2.0 * PI * f32(k)) / n;
              if (t1 < 0.0 || t1 > PI) { continue; }
              for (var i2 = 0u; i2 < 2u && !found; i2++) {
                let s2 = select(1.0, -1.0, i2 == 1u);
                for (var m = 0u; m <= ni && !found; m++) {
                  let t2 = (s2 * base2 + 2.0 * PI * f32(m)) / n;
                  if (t2 < 0.0 || t2 > PI) { continue; }
                  if (want == 0u) { t1o = t1; t2o = t2; shift = select(0.0, PI, s1 * s2 < 0.0); found = true; }
                  else { want--; }
                }
              }
            }
          }
          let j = pick(ni);
          let f = (F + shift + 2.0 * PI * f32(j)) / n;
          let rn = pow(r, 1.0 / n);
          s.p = rn * vec4f(cos(t1o), sin(t1o) * cos(t2o), sin(t1o) * sin(t2o) * cos(f), sin(t1o) * sin(t2o) * sin(f));
          s.branch = j;
        }
      }
    }
    case 10u: {
      let r = length(q.xy);
      if (r > 0.0) {
        let n = a.y;
        let j = pick(u32(max(1.0, round(n))));
        let ang = (atan2(q.y, q.x) + 2.0 * PI * f32(j)) / n;
        let rn = pow(r, 1.0 / n);
        s.p = vec4f(rn * cos(ang), rn * sin(ang), q.z, q.w);
        s.branch = j;
      }
    }
    case 21u: {
      // ±√q; on the negative real axis, ±√(−q₀)·i. For q₀ < 0 the imaginary size comes first,
      // (r − q₀)/2, so r + q₀ never cancels in float32
      let r = length(q);
      let vl = length(q.yzw);
      var root = vec4f(0.0);
      if (vl == 0.0 && q.x < 0.0) { root = vec4f(0.0, sqrt(-q.x), 0.0, 0.0); }
      else if (q.x >= 0.0) {
        let x = sqrt((r + q.x) * 0.5);
        if (x > 0.0) { root = vec4f(x, q.yzw / (2.0 * x)); }
      } else {
        let y = sqrt((r - q.x) * 0.5);
        root = vec4f(vl / (2.0 * y), q.yzw * (y / vl));
      }
      s.branch = pick(2u);
      s.p = select(root, -root, s.branch == 1u);
    }
    case 11u: { let r2 = dot(q, q); if (r2 > 0.0) { s.p = q / r2; } }
    case 12u: {
      let ang = -a.y * q.z;
      s.p = vec4f(cos(ang) * q.x - sin(ang) * q.y, sin(ang) * q.x + cos(ang) * q.y, q.z, q.w);
    }
    case 13u: { let r2 = dot(q.xy, q.xy); if (r2 > 0.0) { s.p = vec4f(q.xy / r2, q.zw); } }
    default: {
      // no inverse (flame variations): push applies the forward map, as flames do
      s = opFwd(oi, q, c);
      s.ok = true;
    }
  }
  return s;
}
`;

// Dual numbers: every op's tangent map, so derivatives ride the orbit instead of being sampled by
// finite differences. opTan(p, v) is the derivative of opFwd at p in direction v — plus, for the op
// that owns the selected parameter, the derivative through its packed record (tanRec = d record / dθ,
// computed on the CPU, so Euler angles and normalised normals need no derivative code here), plus the
// derivative through c. dk is the derivative of the op's dr factor.
// iterateDual carries five columns: three for the position gradient along the world's axes (the
// slice's first three columns), one for the selected parameter (the metric), one renormalised at
// fixed c (the Lyapunov exponent).
export const DUAL = /* wgsl */ `
struct Tan { v: vec4f, dk: f32 };

// ---------- drivers in the dual numbers ------------------------------------------------------------
// Every register carries its derivative along the dual columns 0–2 (the world's axes) and 3 (the
// selected parameter) — forward mode through the readings' own tangents, the fields' gradients and
// the maths. A driven op's record then moves along column j by Σ dθ_b/dj · d record/dθ_b (drvE, which
// the callers load before opTan). Column 4 (λ) holds the drivers still, as core/cpu.js's Jacobian does.
var<private> tanCol: u32 = 99u;
var<private> drvFreeze: bool = false;  // the frozen row: every driver held (the step factor compares)
var<private> drvSelKind: u32 = 0u;     // the sensed driver parameter: 1 a band's lo, 2 its hi, 3 a node's
var<private> drvSelIdx: u32 = 0u;
var<private> drvSelSlot: u32 = 0u;
var<private> drvRegD: array<vec4f, 32>;
var<private> drvVD: array<vec4f, 16>;
var<private> drvE: array<vec4f, 5>;
var<private> drvEOn: bool = false;
// a rebuilt op's record derivative in each of its bound parameters (up to eight such bindings)
var<private> drvNLD: array<vec4f, 40>;

// a row of the parameter-tangent table: [op, kind, index, slot] (gpu/pack.js paramTangents)
fn tanSelect(h: vec4f) {
  let kind = u32(h.y);
  tanOi = select(u32(h.x), 0xffffffffu, kind != 0u);
  drvSelKind = kind;
  drvSelIdx = u32(h.z);
  drvSelSlot = u32(h.w);
  drvFreeze = kind == 4u;
}

fn drvMathD(op: u32, a: f32, b: f32) -> vec2f {
  switch op {
    case 0u: { return vec2f(1.0, 1.0); }
    case 1u: { return vec2f(1.0, -1.0); }
    case 2u: { return vec2f(b, a); }
    case 3u: { return select(vec2f(0.0, 1.0), vec2f(1.0, 0.0), a <= b); }
    case 4u: { return select(vec2f(0.0, 1.0), vec2f(1.0, 0.0), a >= b); }
    case 5u: { if (a > 0.0) { let v = pow(a, b); return vec2f(b * v / a, v * log(a)); } return vec2f(0.0); }
    case 6u: { let c = PI * cos(6.2831853 * a * b); return vec2f(c * b, c * a); }
    default: { return vec2f(0.0); }
  }
}

// driveIter with derivatives. G: the point's columns (g0, g1, g2, q); gdr, dtrap: dr's and the trap
// reading's; S: the start's columns (what the hoisted nodes see move)
fn driveIterDual(p: vec4f, dr: f32, i: u32, n: f32, G: mat4x4f, gdr: vec4f, dtrap: vec4f, S: mat4x4f) {
  let h = ops[DR_BASE];
  if (!drvFirst && h.z < 0.5) { return; }
  let rd = drvReadings(p, dr, i, n);
  let nn = min(u32(h.x), 32u);
  for (var k = 0u; k < nn; k++) {
    let a = ops[DR_NODES + k * 3u];
    if (!(drvFirst || a.w > 0.5)) { continue; }
    let ty = u32(a.x);
    // the value, and for the sensed node parameter two nudged values (one call site: Metal inlines)
    let sel = drvSelKind == 3u && drvSelIdx == k;
    let hh = 1e-3 * max(1.0, abs(drvP(k, drvSelSlot)));
    var vals = vec3f(0.0);
    var g = vec4f(0.0);
    for (var e = 0u; e < select(1u, 3u, sel); e++) {
      drvNudgeNode = select(0xffffffffu, k, e > 0u);
      drvNudgeSlot = drvSelSlot;
      drvNudge = select(-hh, hh, e == 1u);
      let r = drvNode(k, a, rd);
      vals[e] = r.v;
      if (e == 0u) { g = r.g; }
    }
    drvNudgeNode = 0xffffffffu; drvNudge = 0.0;
    var D = vec4f(0.0);
    switch ty {
      case 2u: { if (rd.r > 0.0) { D = vec4f(dot(p, G[0]), dot(p, G[1]), dot(p, G[2]), dot(p, G[3])) / rd.r; } }
      case 3u: { D = dtrap; }
      case 4u: { if (dr > 1e-30) { D = gdr / (dr * (f32(i) + 1.0)); } }
      case 5u, 6u, 7u, 8u: { let c = ty - 5u; D = vec4f(G[0][c], G[1][c], G[2][c], G[3][c]); }
      case 9u, 10u, 11u, 12u: { let c = ty - 9u; D = vec4f(S[0][c], S[1][c], S[2][c], 0.0); }
      case 13u, 14u, 15u, 16u: { D = vec4f(dot(g, S[0]), dot(g, S[1]), dot(g, S[2]), 0.0); }
      // another op's own value: it moves only when that parameter is the one sensed
      case 18u: { if (drvSelKind == 0u && drvP(k, 1u) >= 0.0 && tanOi == u32(drvP(k, 1u)) && drvSelSlot == u32(drvP(k, 2u))) { D.w = 1.0; } }
      case 19u: {
        var x = 0.0; var dx = vec4f(0.0);
        if (a.y >= 0.0) { x = drvReg[u32(a.y)]; dx = drvRegD[u32(a.y)]; }
        var y = drvP(k, 1u); var dy = vec4f(0.0);
        if (a.z >= 0.0) { y = drvReg[u32(a.z)]; dy = drvRegD[u32(a.z)]; }
        let pd = drvMathD(u32(drvP(k, 0u)), x, y);
        D = pd.x * dx + pd.y * dy;
      }
      case 20u: {
        var x = 0.0;
        if (a.y >= 0.0) { x = drvReg[u32(a.y)]; D = drvRegD[u32(a.y)]; }
        var d = drvP(k, 1u) - drvP(k, 0u);
        if (d == 0.0) { d = 1e-12; }
        let u = (x - drvP(k, 0u)) / d;
        D = D / d;
        if (drvP(k, 2u) > 0.5 && (u < 0.0 || u > 1.0)) { D = vec4f(0.0); }
      }
      default: {}
    }
    if (sel) { D.w = D.w + (vals.y - vals.z) / (2.0 * hh); }
    drvReg[k] = vals.x;
    drvRegD[k] = D;
  }
  drvFirst = false;
  let nb = min(u32(h.y), 16u);
  for (var b = 0u; b < nb; b++) {
    let B = ops[DR_BINDS + b * 10u];
    let C = ops[DR_BINDS + b * 10u + 1u];
    let x = drvReg[u32(B.y)];
    let raw = B.z + x * (B.w - B.z);
    drvV[b] = clamp(raw, C.y, C.z);
    var D = (B.w - B.z) * drvRegD[u32(B.y)];
    if (drvSelKind == 1u && drvSelIdx == b) { D.w = D.w + 1.0 - x; }
    if (drvSelKind == 2u && drvSelIdx == b) { D.w = D.w + x; }
    if (raw < C.y || raw > C.z || drvFreeze) { D = vec4f(0.0); }
    drvVD[b] = D;
  }
  drvRebuild();
  // the rebuilt ops' record derivatives, by central differences through drvBuild: angles (degrees) a
  // twentieth of a degree, normals a thousandth — float32 rounding stays small
  for (var b = 0u; b < nb; b++) {
    let at = DR_BINDS + b * 10u;
    let C = ops[at + 1u];
    if (C.w < 0.5 || drvFreeze) { continue; }
    let j = min(u32(ops[at + 2u].z), 7u);
    let hb = select(1e-3 * max(1.0, abs(drvV[b])), 0.05, C.w < 2.5);
    for (var e = 0u; e < 2u; e++) {
      let r = drvBuild(u32(ops[at].x), b, select(-hb, hb, e == 0u));
      for (var k = 0u; k < 5u; k++) {
        if (e == 0u) { drvNLD[j * 5u + k] = r[k]; } else { drvNLD[j * 5u + k] = (drvNLD[j * 5u + k] - r[k]) / (2.0 * hb); }
      }
    }
  }
}

// row k of op oi's record moved along dual column col by its drivers
fn drvRecD(oi: u32, k: u32, col: u32) -> vec4f {
  let nb = min(u32(ops[DR_BASE].y), 16u);
  var o = vec4f(0.0);
  for (var b = 0u; b < nb; b++) {
    let at = DR_BINDS + b * 10u;
    if (u32(ops[at].x) != oi) { continue; }
    let d = drvVD[b][col];
    if (ops[at + 1u].w > 0.5) { o = o + d * drvNLD[min(u32(ops[at + 2u].z), 7u) * 5u + k]; }
    else { o = o + d * ops[at + 3u + k]; }
  }
  return o;
}
// whether op oi moves with its drivers along column col (and drvE loaded with how, when it does)
fn drvLoad(oi: u32, col: u32) -> bool {
  if (!(drvAny && !drvFreeze && col < 4u && drvIs(oi))) { return false; }
  for (var k = 0u; k < 5u; k++) { drvE[k] = drvRecD(oi, k, col); }
  return true;
}

fn opTan(oi: u32, p: vec4f, c: vec4f, v: vec4f, dc: vec4f, withRec: bool) -> Tan {
  let a = rec(oi, 0u);
  let b = rec(oi, 1u);
  var da = vec4f(0.0);
  var db = vec4f(0.0);
  var drows = mat4x4f(vec4f(0.0), vec4f(0.0), vec4f(0.0), vec4f(0.0));
  if (withRec && oi == tanOi) {
    da = tanRec[0]; db = tanRec[1];
    drows = mat4x4f(vec4f(tanRec[0].yzw, tanRec[1].x), vec4f(tanRec[1].yzw, tanRec[2].x), vec4f(tanRec[2].yzw, tanRec[3].x), vec4f(tanRec[3].yzw, tanRec[4].x));
  }
  if (DRIVE_ON && drvEOn) {
    da = da + drvE[0]; db = db + drvE[1];
    drows = drows + mat4x4f(vec4f(drvE[0].yzw, drvE[1].x), vec4f(drvE[1].yzw, drvE[2].x), vec4f(drvE[2].yzw, drvE[3].x), vec4f(drvE[3].yzw, drvE[4].x));
  }
  var o: Tan;
  o.v = v; o.dk = 0.0;
  switch u32(a.x) {
    case 0u: { o.v = v + vec4f(da.yzw, db.x); }
    case 1u: { o.v = v + dc; }
    case 2u: { o.v = a.y * v + da.y * p; o.dk = sign(a.y) * da.y; }
    case 3u: { o.v = v * rowsOf(oi) + p * drows; }
    case 4u: {
      let n = vec4f(a.yzw, b.x);
      let t = dot(p, n) - b.y;
      if (t < 0.0) {
        let dn = vec4f(da.yzw, db.x);
        let dt = dot(v, n) + dot(p, dn) - db.y;
        o.v = v - 2.0 * (dt * n + t * dn);
      }
    }
    case 5u: {
      let l = a.y;
      let dl = da.y;
      for (var i = 0u; i < 4u; i++) {
        if (p[i] > l) { o.v[i] = 2.0 * dl - v[i]; }
        else if (p[i] < -l) { o.v[i] = -2.0 * dl - v[i]; }
      }
    }
    case 6u: {
      let r2 = dot(p, p);
      let m2 = a.y * a.y;
      let f2 = a.z * a.z;
      if (r2 < m2) {
        let k = f2 / m2;
        o.dk = 2.0 * k * (da.z / a.z - da.y / a.y);
        o.v = k * v + o.dk * p;
      } else if (r2 < f2) {
        let k = f2 / r2;
        let dr2 = 2.0 * dot(p, v);
        o.dk = (2.0 * a.z * da.z - k * dr2) / r2;
        o.v = k * v + o.dk * p;
      }
    }
    case 7u: { o.v = v * select(vec4f(1.0), vec4f(-1.0), p < vec4f(0.0)); }
    case 8u: {
      var x = p.xyz;
      var w = v.xyz;
      if (x.x < x.y) { x = x.yxz; w = w.yxz; }
      if (x.y < x.z) { x = x.xzy; w = w.xzy; }
      if (x.x < x.y) { x = x.yxz; w = w.yxz; }
      o.v = vec4f(w, v.w);
    }
    case 19u: {
      var x = p;
      var w = v;
      if (x.x < x.y) { x = x.yxzw; w = w.yxzw; }
      if (x.z < x.w) { x = x.xywz; w = w.xywz; }
      if (x.x < x.z) { x = x.zyxw; w = w.zyxw; }
      if (x.y < x.w) { x = x.xwzy; w = w.xwzy; }
      if (x.y < x.z) { x = x.xzyw; w = w.xzyw; }
      o.v = w;
    }
    case 9u: {
      let r = length(p.xyz);
      if (r > 0.0) {
        let n = a.y;
        let dn = da.y;
        let rxy2 = dot(p.xy, p.xy);
        let drr = dot(p.xyz, v.xyz) / r;
        let th = acos(clamp(p.z / r, -1.0, 1.0));
        let ph = atan2(p.y, p.x);
        var dth = 0.0;
        var dph = 0.0;
        if (rxy2 > 0.0) {
          dth = (p.z * drr - r * v.z) / (r * sqrt(rxy2));
          dph = (p.x * v.y - p.y * v.x) / rxy2;
        }
        let R = pow(r, n);
        let T = n * th;
        let F = n * ph;
        let lr = log(r);
        let dR = n * pow(r, n - 1.0) * drr + R * lr * dn;
        let dT = n * dth + th * dn;
        let dF = n * dph + ph * dn;
        let u = vec3f(sin(T) * cos(F), sin(T) * sin(F), cos(T));
        o.v = vec4f(dR * u + R * vec3f(cos(T) * cos(F) * dT - sin(T) * sin(F) * dF,
                                       cos(T) * sin(F) * dT + sin(T) * cos(F) * dF,
                                       -sin(T) * dT), v.w);
        o.dk = n * (n - 1.0) * pow(r, n - 2.0) * drr + pow(r, n - 1.0) * (1.0 + n * lr) * dn;
      } else { o.v = vec4f(0.0, 0.0, 0.0, v.w); }
    }
    case 20u: {
      let r = length(p);
      if (r > 0.0) {
        let n = a.y;
        let dn = da.y;
        let r1 = length(p.yzw);
        let r2 = length(p.zw);
        let drr = dot(p, v) / r;
        let t1 = acos(clamp(p.x / r, -1.0, 1.0));
        var t2 = 0.0;
        var dt1 = 0.0;
        var dt2 = 0.0;
        var dph = 0.0;
        if (r1 > 0.0) {
          t2 = acos(clamp(p.y / r1, -1.0, 1.0));
          dt1 = (p.x * drr - r * v.x) / (r * r1);
          let dr1 = dot(p.yzw, v.yzw) / r1;
          if (r2 > 0.0) { dt2 = (p.y * dr1 - r1 * v.y) / (r1 * r2); dph = (p.z * v.w - p.w * v.z) / (r2 * r2); }
        }
        let ph = atan2(p.w, p.z);
        let R = pow(r, n);
        let A = n * t1; let B = n * t2; let G = n * ph;
        let lr = log(r);
        let dR = n * pow(r, n - 1.0) * drr + R * lr * dn;
        let dA = n * dt1 + t1 * dn;
        let dB = n * dt2 + t2 * dn;
        let dG = n * dph + ph * dn;
        let u = vec4f(cos(A), sin(A) * cos(B), sin(A) * sin(B) * cos(G), sin(A) * sin(B) * sin(G));
        let du = vec4f(-sin(A) * dA,
                       cos(A) * cos(B) * dA - sin(A) * sin(B) * dB,
                       cos(A) * sin(B) * cos(G) * dA + sin(A) * cos(B) * cos(G) * dB - sin(A) * sin(B) * sin(G) * dG,
                       cos(A) * sin(B) * sin(G) * dA + sin(A) * cos(B) * sin(G) * dB + sin(A) * sin(B) * cos(G) * dG);
        o.v = dR * u + R * du;
        o.dk = n * (n - 1.0) * pow(r, n - 2.0) * drr + pow(r, n - 1.0) * (1.0 + n * lr) * dn;
      } else { o.v = vec4f(0.0); }
    }
    case 21u: {
      o.v = 2.0 * vec4f(p.x * v.x - dot(p.yzw, v.yzw), p.x * v.yzw + v.x * p.yzw);
      let r = length(p);
      if (r > 0.0) { o.dk = 2.0 * dot(p, v) / r; }
    }
    case 10u: {
      let r = length(p.xy);
      if (r > 0.0) {
        let n = a.y;
        let dn = da.y;
        let al = atan2(p.y, p.x);
        let dal = (p.x * v.y - p.y * v.x) / (r * r);
        let drr = dot(p.xy, v.xy) / r;
        let lr = log(r);
        let R = pow(r, n);
        let A = n * al;
        let dR = n * pow(r, n - 1.0) * drr + R * lr * dn;
        let dA = n * dal + al * dn;
        o.v = vec4f(dR * cos(A) - R * sin(A) * dA, dR * sin(A) + R * cos(A) * dA, v.z, v.w);
        o.dk = n * (n - 1.0) * pow(r, n - 2.0) * drr + pow(r, n - 1.0) * (1.0 + n * lr) * dn;
      } else { o.v = vec4f(0.0, 0.0, v.z, v.w); }
    }
    case 11u: {
      let r2 = dot(p, p);
      if (r2 > 0.0) {
        let dr2 = 2.0 * dot(p, v);
        o.v = v / r2 - p * dr2 / (r2 * r2);
        o.dk = -dr2 / (r2 * r2);
      }
    }
    case 12u: {
      let ang = a.y * p.z;
      let dang = a.y * v.z + p.z * da.y;
      let cs = cos(ang);
      let sn = sin(ang);
      o.v = vec4f(cs * v.x - sn * v.y - (sn * p.x + cs * p.y) * dang,
                  sn * v.x + cs * v.y + (cs * p.x - sn * p.y) * dang, v.z, v.w);
    }
    case 13u: {
      let r2 = dot(p.xy, p.xy);
      if (r2 > 0.0) {
        let dr2 = 2.0 * dot(p.xy, v.xy);
        o.v = vec4f(v.xy / r2 - p.xy * dr2 / (r2 * r2), v.zw);
        o.dk = -dr2 / (r2 * r2);
      }
    }
    case 14u: {
      let r2 = dot(p.xy, p.xy);
      let dr2 = 2.0 * dot(p.xy, v.xy);
      let cs = cos(r2);
      let sn = sin(r2);
      o.v = vec4f(v.x * sn - v.y * cs + (p.x * cs + p.y * sn) * dr2,
                  v.x * cs + v.y * sn + (-p.x * sn + p.y * cs) * dr2, v.z, v.w);
    }
    case 15u: { o.v = vec4f(cos(p.x) * v.x, cos(p.y) * v.y, v.z, v.w); }
    case 16u: {
      let r = length(p.xy);
      if (r > 0.0) {
        let drr = dot(p.xy, v.xy) / r;
        o.v = vec4f((2.0 * p.x * v.x - 2.0 * p.y * v.y) / r - (p.x * p.x - p.y * p.y) * drr / (r * r),
                    2.0 * (p.y * v.x + p.x * v.y) / r - 2.0 * p.x * p.y * drr / (r * r), v.z, v.w);
      }
    }
    case 17u: {
      let r2 = dot(p.xy, p.xy);
      if (r2 > 0.0) {
        let r = sqrt(r2);
        o.v = vec4f((p.y * v.x - p.x * v.y) / r2 / PI, dot(p.xy, v.xy) / r, v.z, v.w);
      }
    }
    default: {}
  }
  return o;
}

// ---------- the chimera's tangent ---------------------------------------------------------------
// A sub-stack along a tangent (v, ddr: the tangent of p and of dr), and the blend's (core/cpu.js
// mixJacobian, and the derivative of its dr bound):
//   v' = (1 − ω)v_A + ωv_B + (F_B − F_A)·dω
//   dr' = max(dr_A, dr_B) + |F_B − F_A|·|∇ω|·dr, differentiated term by term
struct KidT { p: vec4f, dr: f32, v: vec4f, ddr: f32 };
fn kidTan(slot: u32, p0: vec4f, c: vec4f, dr0: f32, v0: vec4f, ddr0: f32, dc: vec4f, withRec: bool) -> KidT {
  var o: KidT;
  o.p = p0; o.dr = dr0; o.v = v0; o.ddr = ddr0;
  let start = slotStart(slot);
  for (var j = 0u; j < slotLen(slot); j++) {
    let s = opFwd(start + j, o.p, c);
    drvEOn = DRIVE_ON && drvLoad(start + j, tanCol);
    let t = opTan(start + j, o.p, c, o.v, dc, withRec);
    drvEOn = false;
    if (s.k >= 0.0) { o.ddr = s.k * o.ddr + t.dk * o.dr; o.dr = o.dr * s.k; } else { o.dr = o.dr + 1.0; }
    o.v = t.v;
    o.p = s.p;
  }
  return o;
}

struct MixT { v: vec4f, ddr: f32 };
// the step for central differences through a record: small against the record's values
fn recStep(oi: u32) -> f32 {
  var rv = 1.0;
  var dv = 1e-12;
  for (var k = 1u; k < 4u; k++) {
    let r = abs(rec(oi, k));
    let d = abs(tanRec[k]);
    rv = max(rv, max(max(r.x, r.y), max(r.z, r.w)));
    dv = max(dv, max(max(d.x, d.y), max(d.z, d.w)));
  }
  return 1e-3 * rv / dv;
}
// The blend along up to five tangent columns at once (one call site keeps the shader small: the field
// code would otherwise be inlined for every column). Per column j: vs[j] the tangent, ddrs[j] its dr
// derivative, dcs[j] its derivative of c, v0s[j] its value at the orbit's start (what a world-frame
// field sees move), dts[j] its derivative of the trap reading; column recCol also carries the selected
// parameter's record derivative. The weights move by ∇ωᵢ·v (or ·v0) plus ∂ωᵢ/∂reading · dreading plus,
// for the field's own parameter, the record's central difference. dr = Σ ωᵢ drᵢ moves with both.
struct MixCols { v: array<vec4f, 5>, ddr: array<f32, 5> };
fn mixTan(oi: u32, p: vec4f, c: vec4f, dr: f32, n: u32, vs0: array<vec4f, 5>, ddrs0: array<f32, 5>,
          dcs0: array<vec4f, 5>, v0s0: array<vec4f, 5>, dts0: array<f32, 5>, recCol: u32) -> MixCols {
  var vs = vs0;
  var ddrs = ddrs0;
  var dcs = dcs0;
  var v0s = v0s0;
  var dts = dts0;
  let a = rec(oi, 0u);
  let k = u32(rec(oi, 1u).x);
  let kind = u32(a.y);
  let world = a.z > 0.5;
  let m = fieldAt(oi, p, dr, world);
  let own = recCol < n && oi == tanOi;
  // Nudged weights, at one call site of the field (every inlined copy costs Metal compile time): the
  // field's own parameter ± (jobs 0, 1), then, for a driven field, its record's motion in each column ±
  var pw: array<array<f32, 8>, 2>;
  var eps = 1.0;
  if (own) { eps = recStep(oi); }
  var dOn: array<bool, 5>;
  var dRec: array<array<vec4f, 5>, 5>;
  var dEps: array<f32, 5>;
  var dwd: array<array<f32, 8>, 5>;
  var jobs = 2u;
  if (DRIVE_ON && drvAny) {
    for (var j = 0u; j < n; j++) {
      if (!drvLoad(oi, select(j, 99u, recCol == 99u))) { continue; }
      var big = 0.0;
      for (var q = 0u; q < 5u; q++) { big = max(big, max(max(abs(drvE[q].x), abs(drvE[q].y)), max(abs(drvE[q].z), abs(drvE[q].w)))); }
      if (big > 0.0) { dOn[j] = true; dRec[j] = drvE; jobs = 2u + 2u * n; }
    }
  }
  let sOi = tanOi;
  let sRec = tanRec;
  for (var e = 0u; e < jobs; e++) {
    let jd = (max(e, 2u) - 2u) / 2u;
    if (e < 2u) {
      if (!own) { continue; }
      tanEps = select(-eps, eps, e == 0u);
    } else {
      if (!dOn[jd]) { continue; }
      tanOi = oi;
      tanRec = dRec[jd];
      if (e % 2u == 0u) { dEps[jd] = recStep(oi); }
      tanEps = select(-dEps[jd], dEps[jd], e % 2u == 0u);
    }
    let me = fieldAt(oi, p, dr, world);
    for (var i = 0u; i < k; i++) {
      if (e < 2u) { pw[e][i] = me.w[i]; }
      else if (e % 2u == 0u) { dwd[jd][i] = me.w[i]; }
      else { dwd[jd][i] = (dwd[jd][i] - me.w[i]) / (2.0 * dEps[jd]); }
    }
    tanOi = sOi; tanRec = sRec; tanEps = 0.0;
  }
  var o: MixCols;
  var A: array<KidT, 8>;
  for (var j = 0u; j < n; j++) {
    let v = vs[j];
    let withRec = j == recCol;
    // the dual column under way (Newton's identity columns, recCol 99, hold the drivers)
    tanCol = select(99u, j, recCol != 99u);
    for (var i = 0u; i < k; i++) { A[i] = kidTan(u32(a.w) + i, p, c, dr, v, ddrs[j], dcs[j], withRec); }
    let vx = select(v, v0s[j], world);
    var dread = 0.0;
    if (kind == 5u) { dread = dts[j]; }
    if (kind == 7u) { dread = ddrs[j] / (max(dr, 1e-30) * (fIter + 1.0)); }
    var V = vec4f(0.0);
    var D = 0.0;
    for (var i = 0u; i < k; i++) {
      var dw = dot(m.G[i], vx) + m.S[i] * dread + dwd[j][i];
      if (withRec && own) { dw = dw + (pw[0][i] - pw[1][i]) / (2.0 * eps); }
      V = V + m.w[i] * A[i].v + dw * A[i].p;
      D = D + m.w[i] * A[i].ddr + dw * A[i].dr;
    }
    o.v[j] = V;
    o.ddr[j] = D;
  }
  tanCol = 99u;
  return o;
}

struct Dual {
  t: Trace,
  g0: vec4f, g1: vec4f, g2: vec4f,  // ∂p/∂x along the world's axes (through c too when c is the point)
  gdr: vec3f,                       // ∂dr/∂x
  q: vec4f,                         // ∂p/∂θ for the selected parameter
  qdr: f32,                         // ∂dr/∂θ
  lyap: f32,                        // mean log stretch per iteration of a tangent at fixed c
};

fn iterateDual(p0: vec4f, c: vec4f, cIsP: bool) -> Dual {
  var d: Dual;
  d.t.p = p0; d.t.dr = 1.0; d.t.n = 0u; d.t.escaped = false; d.t.trap = 1e20; d.t.col = 0.0;
  // the world's axes in 4-D: the slice's first three columns
  var g0 = head.slice[0];
  var g1 = head.slice[1];
  var g2 = head.slice[2];
  var gdr = vec3f(0.0);
  var q = vec4f(0.0);
  var qdr = 0.0;
  var lv = head.slice * vec4f(normalize(vec3f(0.6, 0.48, 0.64)), 0.0);
  var lsum = 0.0;
  let k = select(0.0, 1.0, cIsP);
  let dc0 = g0 * k;
  let dc1 = g1 * k;
  let dc2 = g2 * k;
  let bail2 = head.bail * head.bail;
  // the chimera's context and its tangents: the start's columns (a world field sees them), and the
  // trap reading's derivative along each column, which follows the iterate that set it
  startOrbit(p0);
  let s0 = g0;
  let s1 = g1;
  let s2 = g2;
  var dft = 2.0 * vec3f(dot(p0, g0), dot(p0, g1), dot(p0, g2));
  var dftq = 0.0;
  for (var i = 0u; i < head.iters; i++) {
    let slot = schedAt(i);
    let start = slotStart(slot);
    fIter = f32(i);
    if (DRIVE_ON && drvAny) {
      driveIterDual(d.t.p, d.t.dr, i, f32(head.iters), mat4x4f(g0, g1, g2, q), vec4f(gdr, qdr), vec4f(dft, dftq),
                    mat4x4f(s0, s1, s2, vec4f(0.0)));
    }
    for (var j = 0u; j < slotLen(slot); j++) {
      let oi = start + j;
      let p = d.t.p;
      if (u32(rec(oi, 0u).x) == MIX) {
        let dr = d.t.dr;
        let f = mixFwd(oi, p, c, dr);
        let z = vec4f(0.0);
        let mt = mixTan(oi, p, c, dr, 5u, array<vec4f, 5>(g0, g1, g2, q, lv), array<f32, 5>(gdr.x, gdr.y, gdr.z, qdr, 0.0),
                        array<vec4f, 5>(dc0, dc1, dc2, z, z), array<vec4f, 5>(s0, s1, s2, z, z),
                        array<f32, 5>(dft.x, dft.y, dft.z, dftq, 0.0), 3u);
        g0 = mt.v[0]; g1 = mt.v[1]; g2 = mt.v[2]; q = mt.v[3]; lv = mt.v[4];
        gdr = vec3f(mt.ddr[0], mt.ddr[1], mt.ddr[2]);
        qdr = mt.ddr[3];
        d.t.dr = f.dr;
        d.t.p = f.p;
        d.t.sp = f.sp;
        d.t.col = branchColour(d.t.col, oi, f.branch);
        continue;
      }
      let s = opFwd(oi, p, c);
      // a driven op: its record's motion along each column, loaded at one call site
      var E: array<vec4f, 20>;
      var eOn = vec4<bool>(false);
      if (DRIVE_ON && drvAny) { for (var m = 0u; m < 4u; m++) { eOn[m] = drvLoad(oi, m); for (var r = 0u; r < 5u; r++) { E[m * 5u + r] = drvE[r]; } } }
      drvEOn = eOn.x; if (eOn.x) { drvE = array<vec4f, 5>(E[0], E[1], E[2], E[3], E[4]); }
      let t0 = opTan(oi, p, c, g0, dc0, false);
      drvEOn = eOn.y; if (eOn.y) { drvE = array<vec4f, 5>(E[5], E[6], E[7], E[8], E[9]); }
      let t1 = opTan(oi, p, c, g1, dc1, false);
      drvEOn = eOn.z; if (eOn.z) { drvE = array<vec4f, 5>(E[10], E[11], E[12], E[13], E[14]); }
      let t2 = opTan(oi, p, c, g2, dc2, false);
      drvEOn = eOn.w; if (eOn.w) { drvE = array<vec4f, 5>(E[15], E[16], E[17], E[18], E[19]); }
      let tq = opTan(oi, p, c, q, vec4f(0.0), true);
      drvEOn = false;
      let tl = opTan(oi, p, c, lv, vec4f(0.0), false);
      let dr = d.t.dr;
      if (s.k >= 0.0) {
        gdr = s.k * gdr + vec3f(t0.dk, t1.dk, t2.dk) * dr;
        qdr = s.k * qdr + tq.dk * dr;
        d.t.dr = dr * s.k;
      } else {
        d.t.dr = dr + 1.0;
      }
      g0 = t0.v; g1 = t1.v; g2 = t2.v; q = tq.v; lv = tl.v;
      d.t.p = s.p;
      if (s.branch != 0u) { d.t.col = branchColour(d.t.col, oi, s.branch); }
    }
    d.t.n = i + 1u;
    let l = length(lv);
    if (l > 0.0 && l < 1e30) { lsum = lsum + log(l); lv = lv / l; }
    let r2 = dot(d.t.p, d.t.p);
    d.t.trap = min(d.t.trap, r2);
    if (r2 < fTrap) { fTrap = r2; dft = 2.0 * vec3f(dot(d.t.p, g0), dot(d.t.p, g1), dot(d.t.p, g2)); dftq = 2.0 * dot(d.t.p, q); }
    if (!(r2 <= bail2)) { d.t.escaped = true; break; }
  }
  d.g0 = g0; d.g1 = g1; d.g2 = g2;
  d.gdr = gdr;
  d.q = q;
  d.qdr = qdr;
  d.lyap = lsum / f32(max(d.t.n, 1u));
  return d;
}

// derivative of the distance estimate along a tangent (dp, ddr), matching deOf()
fn deTan(t: Trace, dp: vec4f, ddr: f32) -> f32 {
  let r = length(t.p);
  if (!(t.dr > 0.0) || r == 0.0) { return 0.0; }
  let dr_ = dot(t.p, dp) / r;
  if ((head.flags & FLAG_POWER) != 0u) {
    if (t.escaped && r > 1.0) {
      return 0.5 * ((log(r) + 1.0) * dr_ / t.dr - r * log(r) * ddr / (t.dr * t.dr));
    }
    return 0.0;
  }
  return dr_ / t.dr - r * ddr / (t.dr * t.dr);
}

// the gradient of the distance estimate along the world's axes
fn deGrad(d: Dual) -> vec3f {
  return vec3f(deTan(d.t, d.g0, d.gdr.x), deTan(d.t, d.g1, d.gdr.y), deTan(d.t, d.g2, d.gdr.z));
}
`;

// ---------- the collage (core/collage.js) ------------------------------------------------------------
// A collage's shaders are the formula's with two private indices in front of the head and the ops
// buffer (withCollage below): hp picks a piece's head, pb its ops region (gpu/pack.js packCollage), so
// every function above runs on whichever piece is selected. WGSL has no recursion, and an op never
// reaches another piece: the pieces are dispatched from the collage's own loop (collageAt), never from
// inside opFwd — one call site of iterate, however many pieces.
export function withCollage(source) {
  const BIND = '@group(0) @binding(0) var<uniform> head: Head;';
  if (!source.includes(BIND)) throw new Error('no head binding to replace');
  return source
    .replace(BIND, `@group(0) @binding(0) var<uniform> heads: array<Head, ${MAX_PIECES + 1}>;
var<private> hp: u32 = 0u;   // the selected piece's head
var<private> pb: u32 = 0u;   // and its ops region (vec4)`)
    .replace(/\bhead\./g, 'heads[hp].')
    .replace(/\bops\[/g, 'ops[pb + ')
    // the collage's own estimate and step factor take these names (COLLAGE)
    .replace('fn de(x: vec3f) -> f32 {', 'fn deFormula(x: vec3f) -> f32 {')
    .replace('fn drvStep() -> f32 {', 'fn drvStepFormula() -> f32 {');
}

// After withCollage(source). The collage program (gpu/pack.js packCollage) is read with absolute
// indices: this code is not rewritten. The includer defines
//   fn clFallback(i: u32, col: f32, facing: f32) -> vec4f   a piece's colour when it has no shade
export const COLLAGE = /* wgsl */ `
const CL_REGION = ${REGION4}u;
const CL_OWN = ${MAX_PIECES}u;              // the collage's own region and head: its shade and drive programs
const CL_BASE = ${CL_AT / 4}u;
const CL_PIECES = CL_BASE + 2u;
const CL_JOINS = CL_PIECES + ${MAX_PIECES * 4}u;
const CL_BINDS = CL_JOINS + ${(MAX_PIECES - 1) * 2}u;
const CL_MAXP = ${MAX_PIECES}u;
const CL_CIRC = 3.41421356;                 // 1 / (1 − √½)
const CL_SQRT_HALF = 0.70710678;

var<private> clV: array<f32, 16>;           // the collage drive's values at the point
var<private> clNB: u32 = 0u;
var<private> clFreeze: bool = false;        // hold the drive's values (the step factor's frozen estimate)
// each piece's orbit at the last point (its trace, its 4-D start): the colour reads them
var<private> clTr: array<Trace, ${MAX_PIECES}>;
var<private> clQ: array<vec4f, ${MAX_PIECES}>;

fn clSelect(i: u32) { hp = i; pb = i * CL_REGION; }
fn clGmod(x: f32, y: f32) -> f32 { return x - y * floor(x / y); }

// the drive at world point x: its nodes (as a formula's drive program, read in the collage's region),
// then every binding's value, clamped to its parameter's range (core/collage.js drivenAt)
fn clDrive(x: vec3f) {
  if (clFreeze) { return; }
  let h = ops[CL_BASE];
  clNB = select(0u, min(u32(h.z), 16u), h.w > 0.5);
  if (clNB == 0u) { return; }
  clSelect(CL_OWN);
  drvStart = vec4f(x, 0.0);
  var rd: DrvRead;
  let nn = min(u32(ops[pb + DR_BASE].x), 32u);
  for (var k = 0u; k < nn; k++) { drvReg[k] = drvNode(k, ops[pb + DR_NODES + k * 3u], rd).v; }
  for (var b = 0u; b < clNB; b++) {
    let B = ops[CL_BINDS + 2u * b];
    let C = ops[CL_BINDS + 2u * b + 1u];
    clV[b] = clamp(B.z + drvReg[u32(B.y)] * (B.w - B.z), C.x, C.y);
  }
  clSelect(0u);
}

// the collage's own drivers' registers at world point x, for its shade (core/collage.js collageDrivers):
// the drive program's nodes as clDrive runs them, whether or not anything shape-wise is bound. The
// shade reads them through drvReg ('d:' inputs, bindings: the drivers' variant). Does nothing when the
// collage's shade reads no drivers (the program's second vec4, w).
fn clShadeDrive(x: vec3f) {
  if (ops[CL_BASE + 1u].w < 0.5) { return; }
  clSelect(CL_OWN);
  drvStart = vec4f(x, 0.0);
  var rd: DrvRead;
  let nn = min(u32(ops[pb + DR_BASE].x), 32u);
  for (var k = 0u; k < nn; k++) { drvReg[k] = drvNode(k, ops[pb + DR_NODES + k * 3u], rd).v; }
  clSelect(0u);
}

// one vec4 of the program with the driven values in (flat: the program index of its first number)
fn clRead(at: u32, flat: u32) -> vec4f {
  var v = ops[at];
  for (var b = 0u; b < clNB; b++) {
    let t = u32(ops[CL_BINDS + 2u * b].x);
    if (t >= flat && t < flat + 4u) { v[t - flat] = clV[b]; }
  }
  return v;
}

// Rz·Ry·Rx in degrees (core/vec.js rotationXYZ); u * R = Rᵀu
fn clRot(a: vec3f) -> mat3x3f {
  let r = a * (PI / 180.0);
  let cx = cos(r.x); let sx = sin(r.x);
  let cy = cos(r.y); let sy = sin(r.y);
  let cz = cos(r.z); let sz = sin(r.z);
  let Rx = mat3x3f(vec3f(1.0, 0.0, 0.0), vec3f(0.0, cx, sx), vec3f(0.0, -sx, cx));
  let Ry = mat3x3f(vec3f(cy, 0.0, -sy), vec3f(0.0, 1.0, 0.0), vec3f(sy, 0.0, cy));
  let Rz = mat3x3f(vec3f(cz, sz, 0.0), vec3f(-sz, cz, 0.0), vec3f(0.0, 0.0, 1.0));
  return Rz * Ry * Rx;
}

// the plane of a polar repetition: the two axes other than its own, right-handed
fn clPlane(axis: u32) -> vec2u { return select(select(vec2u(0u, 1u), vec2u(2u, 0u), axis == 1u), vec2u(1u, 2u), axis == 0u); }

// the domain fold (core/collage.js repFold): a point of the piece's frame → its point in the drawn copy.
// A = [kind, three numbers], B = [the last three, 0]
fn clFold(A: vec4f, B: vec4f, v: vec3f) -> vec3f {
  var q = v;
  let kind = u32(A.x);
  if (kind == 1u) {
    for (var k = 0u; k < 3u; k++) {
      let c = A[k + 1u];
      if (c > 0.0) { q[k] = q[k] - c * clamp(floor(q[k] / c + 0.5), -B[k], B[k]); }
    }
  } else if (kind == 2u) {
    for (var k = 0u; k < 3u; k++) { if (A[k + 1u] > 0.5) { q[k] = abs(q[k]) - B[k]; } }
  } else if (kind == 3u) {
    let uw = clPlane(u32(A.w));
    let sec = 6.2831853 / A.y;
    let th = clGmod(atan2(q[uw.y], q[uw.x]) + sec * 0.5, sec) - sec * 0.5;
    let rho = length(vec2f(q[uw.x], q[uw.y]));
    q[uw.x] = rho * cos(th) - A.z;
    q[uw.y] = rho * sin(th);
  }
  return q;
}

// The repetition's copies (core/collage.js repCopies): how many, and copy k's map — the drawn copy's
// point q is at L·q + o in the piece's frame
fn clCopies(A: vec4f, B: vec4f) -> u32 {
  let kind = u32(A.x);
  if (kind == 1u) {
    var n = 1u;
    for (var k = 0u; k < 3u; k++) { if (A[k + 1u] > 0.0) { n = n * (2u * u32(B[k]) + 1u); } }
    return n;
  }
  if (kind == 2u) { return 1u << u32(A.y + A.z + A.w); }
  if (kind == 3u) { return u32(A.y); }
  return 1u;
}
struct ClCopy { L: mat3x3f, o: vec3f };
fn clCopy(A: vec4f, B: vec4f, k0: u32) -> ClCopy {
  var c: ClCopy;
  c.L = mat3x3f(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), vec3f(0.0, 0.0, 1.0));
  c.o = vec3f(0.0);
  let kind = u32(A.x);
  if (kind == 1u) {
    // the copies nest x, then y, then z (z the innermost)
    var k = k0;
    for (var a = 2; a >= 0; a--) {
      let ax = u32(a);
      if (A[ax + 1u] > 0.0) { let m = 2u * u32(B[ax]) + 1u; c.o[ax] = (f32(k % m) - B[ax]) * A[ax + 1u]; k = k / m; }
    }
  } else if (kind == 2u) {
    // each mirrored axis doubles the list, the last one mirrored the lowest bit: p_a = σ_a·(q_a + o_a)
    var bit = 0u;
    var s = vec3f(1.0);
    for (var a = 2; a >= 0; a--) {
      let ax = u32(a);
      if (A[ax + 1u] > 0.5) { if (((k0 >> bit) & 1u) != 0u) { s[ax] = -1.0; } bit = bit + 1u; }
    }
    c.L = mat3x3f(vec3f(s.x, 0.0, 0.0), vec3f(0.0, s.y, 0.0), vec3f(0.0, 0.0, s.z));
    c.o = s * B.xyz * A.yzw;
  } else if (kind == 3u) {
    let uw = clPlane(u32(A.w));
    let t = f32(k0) * 6.2831853 / A.y;
    let cs = cos(t); let sn = sin(t);
    // columns: L[u][u] = c, L[w][u] = s, L[u][w] = −s, L[w][w] = c
    c.L[uw.x][uw.x] = cs; c.L[uw.x][uw.y] = sn; c.L[uw.y][uw.x] = -sn; c.L[uw.y][uw.y] = cs;
    c.o[uw.x] = cs * A.z; c.o[uw.y] = sn * A.z;
  }
  return c;
}

// the kernels (core/collage.js smin): [d, ∂d/∂a, ∂d/∂b]; k in KERNELS order (6 hard)
fn clToward(d: f32, g: f32, aLow: bool) -> vec3f { return select(vec3f(d, 1.0 - g, g), vec3f(d, g, 1.0 - g), aLow); }
fn clSmin(k: u32, a: f32, b: f32, r: f32, steps: f32) -> vec3f {
  let aLow = a <= b;
  let lo = select(vec3f(b, 0.0, 1.0), vec3f(a, 1.0, 0.0), aLow);
  if (k == 6u || !(r > 0.0)) { return lo; }
  let m = lo.x;
  let x = abs(a - b);
  var o = lo;
  switch k {
    case 0u: { let h = clamp(0.5 + 0.5 * (b - a) / r, 0.0, 1.0); o = vec3f(b + (a - b) * h - r * h * (1.0 - h), h, 1.0 - h); }
    case 1u: { let h = max(r - x, 0.0) / r; o = clToward(m - h * h * h * r / 6.0, 1.0 - h * h / 2.0, aLow); }
    case 2u: { let e = exp(-x / r); o = clToward(m - r * log(1.0 + e), 1.0 / (1.0 + e), aLow); }
    case 3u: {
      let R = r * CL_CIRC;
      let h = max(R - x, 0.0) / R;
      let s = sqrt(1.0 + 2.0 * h - h * h);
      o = clToward(m - R * 0.5 * (1.0 + h - s), 1.0 - 0.5 * (1.0 - (1.0 - h) / s), aLow);
    }
    case 4u: {
      let st = r / max(steps, 1.0);
      let u = b - r;
      let z = clGmod(u - a + st, 2.0 * st) - st;
      let v = 0.5 * (u + a + abs(z));
      if (v < m) { let sg = select(-1.0, 1.0, z >= 0.0); o = vec3f(v, 0.5 * (1.0 - sg), 0.5 * (1.0 + sg)); }
    }
    case 5u: { let v = (a - r + b) * CL_SQRT_HALF; if (v < m) { o = vec3f(v, CL_SQRT_HALF, CL_SQRT_HALF); } }
    default: {}
  }
  return o;
}

// one join (core/collage.js joinEval): [d, ∂d/∂a, ∂d/∂b, seam]. J0 = [op, kernel, r, n], J1 = [w]
fn clJoin(J0: vec4f, J1: vec4f, a: f32, b: f32) -> vec4f {
  let op = u32(J0.x);
  let k = u32(J0.y);
  let r = J0.z;
  if (op == 3u) { let w = clamp(J1.x, 0.0, 1.0); return vec4f((1.0 - w) * a + w * b, 1.0 - w, w, 4.0 * w * (1.0 - w)); }
  var o: vec4f;
  var x = a - b;
  if (op == 1u) { let s = clSmin(k, -a, -b, r, J0.w); o = vec4f(-s.x, s.y, s.z, 0.0); }
  else if (op == 2u) { let s = clSmin(k, -a, b, r, J0.w); o = vec4f(-s.x, s.y, -s.z, 0.0); x = a + b; }
  else { o = vec4f(clSmin(k, a, b, r, J0.w), 0.0); }
  if (k != 6u && r > 0.0) { o.w = clamp(1.0 - abs(x) / r, 0.0, 1.0); }
  return o;
}

struct ClPlace { t: vec3f, s: f32, R: mat3x3f, g: f32, A: vec4f, B: vec4f };
fn clPlace(i: u32) -> ClPlace {
  let at = CL_PIECES + i * 4u;
  let P0 = clRead(at, i * 16u);
  let P1 = clRead(at + 1u, i * 16u + 4u);
  var o: ClPlace;
  o.t = P0.xyz; o.s = P0.w; o.R = clRot(P1.xyz); o.g = P1.w;
  o.A = clRead(at + 2u, i * 16u + 8u);
  o.B = clRead(at + 3u, i * 16u + 12u);
  return o;
}

// Everything the collage knows at world point x (core/collage.js collageAt): d, each piece's own
// estimate, its share (summing to 1), piece (Σ wᵢ·i/(n − 1)), seam, the leading piece, and the fold
// colour index blended by the shares (the glow's)
struct ClAt { d: f32, piece: f32, seam: f32, lead: u32, col: f32, n: u32, w: array<f32, ${MAX_PIECES}>, dist: array<f32, ${MAX_PIECES}> };
fn collageAt(x: vec3f) -> ClAt {
  var o: ClAt;
  let np = min(u32(ops[CL_BASE].x), CL_MAXP);
  o.n = np;
  clDrive(x);
  for (var i = 0u; i < np; i++) {
    let P = clPlace(i);
    let v = clFold(P.A, P.B, ((x - P.t) * P.R) / P.s);
    clSelect(i);
    let q = embed(v);
    let t = iterate(q, cFor(q));
    clTr[i] = t;
    clQ[i] = q;
    o.dist[i] = P.s * deOf(t) - P.g;
  }
  clSelect(0u);
  var D = o.dist[0];
  o.w[0] = 1.0;
  for (var j = 0u; j + 1u < np; j++) {
    let J0 = clRead(CL_JOINS + 2u * j, 128u + 8u * j);
    let J1 = clRead(CL_JOINS + 2u * j + 1u, 128u + 8u * j + 4u);
    let r = clJoin(J0, J1, D, o.dist[j + 1u]);
    let A = abs(r.y);
    let B = abs(r.z);
    let share = select(0.5, A / (A + B), A + B > 0.0);
    for (var k = 0u; k <= j; k++) { o.w[k] = o.w[k] * share; }
    o.w[j + 1u] = 1.0 - share;
    D = r.x;
    o.seam = max(o.seam, r.w);
  }
  o.d = D;
  var best = -1.0;
  for (var i = 0u; i < np; i++) {
    if (np > 1u) { o.piece = o.piece + o.w[i] * f32(i) / f32(np - 1u); }
    o.col = o.col + o.w[i] * clTr[i].col;
    if (o.w[i] > best) { best = o.w[i]; o.lead = i; }
  }
  return o;
}

fn de(x: vec3f) -> f32 { return collageAt(x).d; }

// the march's step factor: the static one (the chamfers, an unsafe piece) times the measured 1 / L
// (the head's step word, gpu/render.js setStep)
fn clStep() -> f32 { return ops[CL_BASE + 1u].x * heads[CL_OWN].sliceW.z; }
fn drvStep() -> f32 { return clStep(); }

// piece i's readings at the last collageAt (core/shade.js READINGS; lyap the caller's)
fn clReadings(i: u32, facing: f32, lyap: f32) -> Readings {
  let t = clTr[i];
  var r: Readings;
  r.col = t.col; r.trap = t.trap; r.depth = f32(t.n) / f32(max(heads[i].iters, 1u)); r.lyap = lyap;
  r.facing = facing; r.species = t.sp; r.w = clQ[i].w;
  return r;
}

// The colour at hit x (core/collage.js collageColour): the collage's own shade, read with the
// share-weighted readings plus piece and seam and the collage's own drivers at x; otherwise every
// piece's colour (its shade, or the engine's own: clFallback) blended by the shares. One call site of
// shadeRun.
fn collageColour(x: vec3f, at: ClAt, facing: f32, lyap: array<f32, ${MAX_PIECES}>) -> vec4f {
  let own = ops[CL_BASE].y > 0.5;
  var m: Readings;
  if (own) {
    for (var i = 0u; i < at.n; i++) {
      let w = at.w[i];
      let r = clReadings(i, facing, lyap[i]);
      m.col = m.col + w * r.col; m.trap = m.trap + w * r.trap; m.depth = m.depth + w * r.depth; m.lyap = m.lyap + w * r.lyap;
      m.facing = m.facing + w * r.facing; m.species = m.species + w * r.species; m.w = m.w + w * r.w;
    }
    m.piece = at.piece; m.seam = at.seam;
    clShadeDrive(x);
  }
  var out = vec4f(0.0);
  let n = select(at.n, 1u, own);
  for (var k = 0u; k < n; k++) {
    var wt = 1.0;
    var r = m;
    var reg = CL_OWN;
    if (!own) {
      wt = at.w[k];
      if (!(wt > 0.0)) { continue; }
      r = clReadings(k, facing, lyap[k]);
      reg = k;
    }
    clSelect(reg);
    var c: vec4f;
    if ((heads[hp].flags & FLAG_SHADE) != 0u) { c = shadeRun(r).color; } else { c = clFallback(k, r.col, facing); }
    out = out + wt * c;
  }
  clSelect(0u);
  return out;
}

// Push (core/collage.js collagePush): a sample x4 of piece i's own walk goes through its slice into its
// frame, to copy k of its repetition (dropped when it does not fold back to the drawn copy: it lies in
// another copy's cell) and through the placement into the world, where the collage keeps it by the
// piece's share. G maps the piece's slice frame into the world (s·R·L): the splat's covariance is
// G Σ Gᵀ. Leaves the piece selected.
struct ClKeep { p: vec3f, off: f32, a: f32, ok: bool, G: mat3x3f };
fn clKeep(i: u32, x4: vec4f, k: u32) -> ClKeep {
  var o: ClKeep;
  clSelect(i);
  let u = unembed(x4);
  o.off = u.w;
  let P = clPlace(i);
  let cp = clCopy(P.A, P.B, k % clCopies(P.A, P.B));
  let v = cp.L * u.xyz + cp.o;
  let back = clFold(P.A, P.B, v);
  o.ok = length(back - u.xyz) <= 1e-4 * max(1.0, length(u.xyz));
  o.p = P.R * (v * P.s) + P.t;
  o.G = P.s * (P.R * cp.L);
  if (o.ok) { let at = collageAt(o.p); o.a = at.w[i]; }
  clSelect(i);
  return o;
}

// the step factor's measurement (gpu/render.js collageStep): |∇D| at x, then with the drive's values
// held at x's own — their ratio is the steepness the drive adds (core/collage.js says why it exists)
fn clSteep(x: vec3f, h: f32) -> vec2f {
  var g = vec3f(0.0);
  var g0 = vec3f(0.0);
  for (var a = 0u; a < 3u; a++) {
    var e = vec3f(0.0);
    e[a] = h;
    g[a] = (de(x + e) - de(x - e)) / (2.0 * h);
  }
  clDrive(x);
  clFreeze = true;
  for (var a = 0u; a < 3u; a++) {
    var e = vec3f(0.0);
    e[a] = h;
    g0[a] = (de(x + e) - de(x - e)) / (2.0 * h);
  }
  clFreeze = false;
  return vec2f(length(g), length(g0));
}
`;
