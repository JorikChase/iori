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
  starts: vec4u, lens: vec4u,
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
};

@group(0) @binding(0) var<uniform> head: Head;
@group(0) @binding(1) var<storage, read> ops: array<vec4f>;

const FLAG_POWER = 1u;
const FLAG_UNSAFE = 2u;
const FLAG_JULIA = 4u;
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

fn rec(oi: u32, k: u32) -> vec4f {
  var r = ops[oi * REC4 + k];
  if (oi == ov0) { r = r + ovD.x * ovRec0[k]; }
  if (oi == ov1) { r = r + ovD.y * ovRec1[k]; }
  return r;
}

fn embed(x: vec3f) -> vec4f { return head.slice * vec4f(x, head.sliceW.x); }
// back to the world: xyz along the slice's axes, w how far off the slice
fn unembed(x4: vec4f) -> vec4f { let v = transpose(head.slice) * x4; return vec4f(v.xyz, v.w - head.sliceW.x); }

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
const MIX = 22u;
// record: [22, w, k, r], n̂, [slot A, slot B, 0, 0]
// ω(p) = σ(logit w + k·(n̂·p) + r·(|p| − 1)), and its gradient (core/ops.js mixWeight)
struct MixW { w: f32, g: vec4f };
fn mixW(oi: u32, p: vec4f) -> MixW {
  let a = rec(oi, 0u);
  let n = rec(oi, 1u);
  var m: MixW;
  m.g = vec4f(0.0);
  if (a.y <= 0.0) { m.w = 0.0; return m; }
  if (a.y >= 1.0) { m.w = 1.0; return m; }
  let r = length(p);
  var pr = vec4f(0.0);
  if (r > 0.0) { pr = p / r; }
  let s = log(a.y / (1.0 - a.y)) + a.z * dot(n, p) + a.w * (r - 1.0);
  m.w = 1.0 / (1.0 + exp(-s));
  m.g = m.w * (1.0 - m.w) * (a.z * n + a.w * pr);
  return m;
}

struct Fwd { p: vec4f, dr: f32, branch: u32 };

// a sub-stack's ops on (p, dr); branches are not coloured (the mix colours by species)
fn runKid(slot: u32, p0: vec4f, c: vec4f, dr0: f32) -> Fwd {
  var o: Fwd;
  o.p = p0; o.dr = dr0; o.branch = 0u;
  let start = head.starts[slot];
  for (var j = 0u; j < head.lens[slot]; j++) {
    let s = opFwd(start + j, o.p, c);
    o.p = s.p;
    if (s.k < 0.0) { o.dr = o.dr + 1.0; } else { o.dr = o.dr * s.k; }
  }
  return o;
}

// (1 − ω)F_A + ωF_B; dr the larger branch's plus |F_B − F_A|·|∇ω|·dr; the branch is the leading species
fn mixFwd(oi: u32, p: vec4f, c: vec4f, dr: f32) -> Fwd {
  let kids = rec(oi, 2u);
  let A = runKid(u32(kids.x), p, c, dr);
  let B = runKid(u32(kids.y), p, c, dr);
  let m = mixW(oi, p);
  var o: Fwd;
  o.p = mix(A.p, B.p, m.w);
  o.dr = max(A.dr, B.dr) + length(B.p - A.p) * length(m.g) * dr;
  o.branch = select(1u, 2u, m.w > 0.5);
  return o;
}

// one op of a scheduled slot: the chimera, or any other op with its dr rule applied
fn fwdAt(oi: u32, p: vec4f, c: vec4f, dr: f32) -> Fwd {
  if (u32(rec(oi, 0u).x) == MIX) { return mixFwd(oi, p, c, dr); }
  let s = opFwd(oi, p, c);
  var o: Fwd;
  o.p = s.p; o.branch = s.branch;
  if (s.k < 0.0) { o.dr = dr + 1.0; } else { o.dr = dr * s.k; }
  return o;
}

fn iterate(p0: vec4f, c: vec4f) -> Trace {
  var t: Trace;
  t.p = p0; t.dr = 1.0; t.n = 0u; t.escaped = false; t.trap = 1e20; t.col = 0.0;
  let bail2 = head.bail * head.bail;
  for (var i = 0u; i < head.iters; i++) {
    let slot = schedAt(i);
    let start = head.starts[slot];
    for (var j = 0u; j < head.lens[slot]; j++) {
      let s = fwdAt(start + j, t.p, c, t.dr);
      t.p = s.p;
      t.dr = s.dr;
      if (s.branch != 0u) { t.col = branchColour(t.col, start + j, s.branch); }
    }
    t.n = i + 1u;
    let r2 = dot(t.p, t.p);
    t.trap = min(t.trap, r2);
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
  let start = head.starts[slot];
  let len = head.lens[slot];
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
// blend with its exact Jacobian from the tangents; up to four guesses, alternating species from a pick
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

fn mixJacobian(oi: u32, x: vec4f, c: vec4f) -> mat4x4f {
  return mat4x4f(mixTan(oi, x, c, 1.0, vec4f(1.0, 0.0, 0.0, 0.0), 0.0, vec4f(0.0), false).v,
                 mixTan(oi, x, c, 1.0, vec4f(0.0, 1.0, 0.0, 0.0), 0.0, vec4f(0.0), false).v,
                 mixTan(oi, x, c, 1.0, vec4f(0.0, 0.0, 1.0, 0.0), 0.0, vec4f(0.0), false).v,
                 mixTan(oi, x, c, 1.0, vec4f(0.0, 0.0, 0.0, 1.0), 0.0, vec4f(0.0), false).v);
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
  let kids = rec(oi, 2u);
  let first = pick(2u);
  let tol = 3e-6 * (1.0 + length(q));
  for (var g = 0u; g < MIX_GUESSES; g++) {
    let which = (first + g) & 1u;
    let guess = kidInv(select(u32(kids.x), u32(kids.y), which == 1u), q, c);
    if (!guess.ok) { continue; }
    var x = guess.p;
    var best = 1e30;
    var bestX = x;
    var stall = 0u;
    for (var i = 0u; i <= MIX_NEWTON; i++) {
      let F = mixFwd(oi, x, c, 1.0).p - q;
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
var<private> tanOi: u32 = 0xffffffffu;
var<private> tanRec: array<vec4f, 5>;

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
  let start = head.starts[slot];
  for (var j = 0u; j < head.lens[slot]; j++) {
    let s = opFwd(start + j, o.p, c);
    let t = opTan(start + j, o.p, c, o.v, dc, withRec);
    if (s.k >= 0.0) { o.ddr = s.k * o.ddr + t.dk * o.dr; o.dr = o.dr * s.k; } else { o.dr = o.dr + 1.0; }
    o.v = t.v;
    o.p = s.p;
  }
  return o;
}

struct MixT { v: vec4f, ddr: f32 };
fn mixTan(oi: u32, p: vec4f, c: vec4f, dr: f32, v: vec4f, ddr: f32, dc: vec4f, withRec: bool) -> MixT {
  let kids = rec(oi, 2u);
  let A = kidTan(u32(kids.x), p, c, dr, v, ddr, dc, withRec);
  let B = kidTan(u32(kids.y), p, c, dr, v, ddr, dc, withRec);
  let a = rec(oi, 0u);
  let n = rec(oi, 1u);
  let m = mixW(oi, p);
  let w = m.w;
  let r = length(p);
  var pr = vec4f(0.0);
  if (r > 0.0) { pr = p / r; }
  // ds: the logistic argument's derivative; dh: of its gradient h = k n̂ + r p̂
  var ds = 0.0;
  var dh = vec4f(0.0);
  if (w > 0.0 && w < 1.0) {
    ds = a.z * dot(n, v) + a.w * dot(pr, v);
    if (r > 0.0) { dh = a.w * (v - pr * dot(pr, v)) / r; }
    if (withRec && oi == tanOi) {
      let da = tanRec[0];
      let dn = tanRec[1];
      ds = ds + da.y / (a.y * (1.0 - a.y)) + da.z * dot(n, p) + a.z * dot(dn, p) + da.w * (r - 1.0);
      dh = dh + da.z * n + a.z * dn + da.w * pr;
    }
  }
  let dw = w * (1.0 - w) * ds;
  let d = B.p - A.p;
  var o: MixT;
  o.v = mix(A.v, B.v, w) + d * dw;
  let h = a.z * n + a.w * pr;
  let g = w * (1.0 - w) * h;
  let dg = dw * (1.0 - 2.0 * w) * h + w * (1.0 - w) * dh;
  let dl = length(d);
  let gl = length(g);
  var ddl = 0.0;
  if (dl > 0.0) { ddl = dot(d, B.v - A.v) / dl; }
  var dgl = 0.0;
  if (gl > 0.0) { dgl = dot(g, dg) / gl; }
  o.ddr = select(A.ddr, B.ddr, B.dr > A.dr) + ddl * gl * dr + dl * dgl * dr + dl * gl * ddr;
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
  for (var i = 0u; i < head.iters; i++) {
    let slot = schedAt(i);
    let start = head.starts[slot];
    for (var j = 0u; j < head.lens[slot]; j++) {
      let oi = start + j;
      let p = d.t.p;
      if (u32(rec(oi, 0u).x) == MIX) {
        let dr = d.t.dr;
        let f = mixFwd(oi, p, c, dr);
        let m0 = mixTan(oi, p, c, dr, g0, gdr.x, dc0, false);
        let m1 = mixTan(oi, p, c, dr, g1, gdr.y, dc1, false);
        let m2 = mixTan(oi, p, c, dr, g2, gdr.z, dc2, false);
        let mq = mixTan(oi, p, c, dr, q, qdr, vec4f(0.0), true);
        let ml = mixTan(oi, p, c, dr, lv, 0.0, vec4f(0.0), false);
        g0 = m0.v; g1 = m1.v; g2 = m2.v; q = mq.v; lv = ml.v;
        gdr = vec3f(m0.ddr, m1.ddr, m2.ddr);
        qdr = mq.ddr;
        d.t.dr = f.dr;
        d.t.p = f.p;
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
