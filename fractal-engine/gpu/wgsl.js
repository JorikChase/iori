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

export const INTERP = /* wgsl */ `
struct Head {
  iters: u32, schedLen: u32, flags: u32, bail: f32,
  starts: array<vec4u, 2>, lens: array<vec4u, 2>,   // eight slots
  sched: array<vec4u, 16>,
  c: vec4f,        // the fixed constant when FLAG_JULIA is set
  slice: mat4x4f,  // the world's place in 4-D: x₄ = slice · (x, y, z, sliceW.x)
  sliceW: vec4f,
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
fn startOrbit(p0: vec4f) { fP0 = p0; fTrap = dot(p0, p0); fIter = 0.0; fIters = f32(head.iters); }

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

// ---------- shading: the formula's colour graph (core/shade.js, operation for operation) ------------
// The program sits after the op records (gpu/pack.js SHADE_AT): a header [n, colour node, glow node,
// glow is a colour], three vec4 per node, then the stops. One vec4 register per node.
const SH_BASE = 320u;            // MAX_OPS · REC / 4
const SH_STOPS = 417u;           // SH_BASE + 1 + 32 · 3
struct Readings { col: f32, trap: f32, depth: f32, lyap: f32, facing: f32, species: f32, w: f32 };
struct ShadeOut { color: vec4f, glow: vec4f, glowIsColour: bool, hasGlow: bool };

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
fn shT(j: u32) -> f32 { return ops[SH_STOPS + 2u * j].x; }
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

fn shRamp(b: vec4f, m: vec4f, x: f32) -> vec4f {
  let s0 = u32(b.x);
  let n = u32(b.y);
  let interp = u32(b.z);
  let sp = u32(b.w);
  let t = shMap(x, m);
  if (n <= 1u || t <= shT(s0)) { return clamp(shC(s0), vec4f(0.0), vec4f(1.0)); }
  if (t >= shT(s0 + n - 1u)) { return clamp(shC(s0 + n - 1u), vec4f(0.0), vec4f(1.0)); }
  var i = 0u;
  for (var j = 0u; j < n; j++) { if (shT(s0 + j) <= t) { i = j; } }
  if (interp == 0u) { return clamp(shC(s0 + i), vec4f(0.0), vec4f(1.0)); }
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
  return vec4f(clamp(shFromSpace(mixed, sp), vec3f(0.0), vec3f(1.0)), clamp(alpha, 0.0, 1.0));
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

fn shadeRun(r: Readings) -> ShadeOut {
  var reg: array<vec4f, 32>;
  let h = ops[SH_BASE];
  let n = min(u32(h.x), 32u);
  for (var i = 0u; i < n; i++) {
    let a = ops[SH_BASE + 1u + i * 3u];
    let b = ops[SH_BASE + 2u + i * 3u];
    let c = ops[SH_BASE + 3u + i * 3u];
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
      case 10u: { var x = 0.0; if (i0 >= 0) { x = reg[i0].x; } v = shRamp(b, c, x); }
      case 11u: {
        var x = 0.0; if (i0 >= 0) { x = reg[i0].x; }
        var y = b.y; if (i1 >= 0) { y = reg[i1].x; }
        v.x = shMath(u32(b.x), x, y);
      }
      case 12u: {
        var f = b.y; if (i2 >= 0) { f = reg[i2].x; }
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
    let t = opTan(start + j, o.p, c, o.v, dc, withRec);
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
  // the field's own parameter: its weights nudged ±
  var pw: array<array<f32, 8>, 2>;
  var eps = 1.0;
  if (own) {
    eps = recStep(oi);
    for (var e = 0u; e < 2u; e++) {
      tanEps = select(-eps, eps, e == 0u);
      let me = fieldAt(oi, p, dr, world);
      for (var i = 0u; i < k; i++) { pw[e][i] = me.w[i]; }
    }
    tanEps = 0.0;
  }
  var o: MixCols;
  var A: array<KidT, 8>;
  for (var j = 0u; j < n; j++) {
    let v = vs[j];
    let withRec = j == recCol;
    for (var i = 0u; i < k; i++) { A[i] = kidTan(u32(a.w) + i, p, c, dr, v, ddrs[j], dcs[j], withRec); }
    let vx = select(v, v0s[j], world);
    var dread = 0.0;
    if (kind == 5u) { dread = dts[j]; }
    if (kind == 7u) { dread = ddrs[j] / (max(dr, 1e-30) * (fIter + 1.0)); }
    var V = vec4f(0.0);
    var D = 0.0;
    for (var i = 0u; i < k; i++) {
      var dw = dot(m.G[i], vx) + m.S[i] * dread;
      if (withRec && own) { dw = dw + (pw[0][i] - pw[1][i]) / (2.0 * eps); }
      V = V + m.w[i] * A[i].v + dw * A[i].p;
      D = D + m.w[i] * A[i].ddr + dw * A[i].dr;
    }
    o.v[j] = V;
    o.ddr[j] = D;
  }
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
      let t0 = opTan(oi, p, c, g0, dc0, false);
      let t1 = opTan(oi, p, c, g1, dc1, false);
      let t2 = opTan(oi, p, c, g2, dc2, false);
      let tq = opTan(oi, p, c, q, vec4f(0.0), true);
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
