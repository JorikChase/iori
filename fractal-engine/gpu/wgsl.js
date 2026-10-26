// The WGSL interpreter: the same orbit as core/cpu.js, with the trace statistics the look layer reads.
// Two directions over one op table, exactly as in core/ops.js:
//   opFwd  — the forward map (pull: per pixel, iterate() / de())
//   opInv  — one random preimage, or failure (push: per sample, invStep())
// Every op here must match its fwd/inv in core/ops.js; test/parity.html diffs the two.

export const INTERP = /* wgsl */ `
struct Head {
  iters: u32, schedLen: u32, flags: u32, bail: f32,
  starts: vec4u, lens: vec4u,
  sched: array<vec4u, 16>,
  c: vec4f,      // the fixed constant when FLAG_JULIA is set
};

struct Trace {
  p: vec3f,      // final point
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

// Per-invocation parameter overrides: a record reads as its packed value plus d · (d record / dθ)
// for up to two parameters. The atlas lens varies two parameters across its pixels this way. Exact for
// every parameter whose record is linear in it (all but rotation angles and plane normals, which the
// lens does not offer).
var<private> ov0: u32 = 0xffffffffu;
var<private> ov1: u32 = 0xffffffffu;
var<private> ovD: vec2f = vec2f(0.0);
var<private> ovRec0: array<vec4f, 4>;
var<private> ovRec1: array<vec4f, 4>;

fn rec(oi: u32, k: u32) -> vec4f {
  var r = ops[oi * 4u + k];
  if (oi == ov0) { r = r + ovD.x * ovRec0[k]; }
  if (oi == ov1) { r = r + ovD.y * ovRec1[k]; }
  return r;
}

fn schedAt(i: u32) -> u32 {
  let k = i % head.schedLen;
  return head.sched[k / 4u][k % 4u];
}

fn branchColour(col: f32, opIndex: u32, branch: u32) -> f32 {
  // every branch taken pulls the colour index toward that branch's own value
  let own = fract(f32(opIndex) * 0.6180339 + f32(branch) * 0.3819660);
  return mix(col, own, 0.5);
}

struct Step { p: vec3f, k: f32, branch: u32, ok: bool };

// ---------- forward ----------------------------------------------------------------------------
// returns the new point; k multiplies dr (wRule 'mul'), k < 0 means dr += 1 (the +c rule)
fn opFwd(oi: u32, p: vec3f, c: vec3f) -> Step {
  let a = rec(oi, 0u);
  let b = rec(oi, 1u);
  let cc = rec(oi, 2u);
  var s: Step;
  s.p = p; s.k = 1.0; s.branch = 0u; s.ok = true;
  switch u32(a.x) {
    case 0u: { s.p = p + a.yzw; }
    case 1u: { s.p = p + c; s.k = -1.0; }
    case 2u: { s.p = p * a.y; s.k = abs(a.y); }
    case 3u: {
      // the matrix is packed row-major from p0: a.yzw | b.xyz | b.w cc.xy
      s.p = vec3f(dot(a.yzw, p), dot(b.xyz, p), dot(vec3f(b.w, cc.xy), p));
    }
    case 4u: {
      let d = dot(p, a.yzw) - b.x;
      if (d < 0.0) { s.p = p - 2.0 * d * a.yzw; s.branch = 1u; }
    }
    case 5u: {
      let l = a.y;
      s.branch = select(0u, 1u, p.x > l) + select(0u, 2u, p.x < -l)
               + select(0u, 3u, p.y > l) + select(0u, 6u, p.y < -l)
               + select(0u, 9u, p.z > l) + select(0u, 18u, p.z < -l);
      s.p = clamp(p, vec3f(-l), vec3f(l)) * 2.0 - p;
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
      s.branch = select(0u, 1u, p.x < 0.0) + select(0u, 2u, p.y < 0.0) + select(0u, 4u, p.z < 0.0);
      s.p = abs(p);
    }
    case 8u: {
      var x = p;
      if (x.x < x.y) { x = x.yxz; s.branch = s.branch + 1u; }
      if (x.y < x.z) { x = x.xzy; s.branch = s.branch + 2u; }
      if (x.x < x.y) { x = x.yxz; s.branch = s.branch + 4u; }
      s.p = x;
    }
    case 9u: {
      let r = length(p);
      if (r > 0.0) {
        let n = a.y;
        let theta = acos(clamp(p.z / r, -1.0, 1.0)) * n;
        let phi = atan2(p.y, p.x) * n;
        s.k = n * pow(r, n - 1.0);
        s.p = pow(r, n) * vec3f(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta));
      } else { s.k = 0.0; }
    }
    case 10u: {
      let r = length(p.xy);
      if (r > 0.0) {
        let n = a.y;
        let ang = atan2(p.y, p.x) * n;
        s.k = n * pow(r, n - 1.0);
        s.p = vec3f(pow(r, n) * cos(ang), pow(r, n) * sin(ang), p.z);
      } else { s.k = 0.0; }
    }
    case 11u: {
      let r2 = dot(p, p);
      if (r2 > 0.0) { s.p = p / r2; s.k = 1.0 / r2; }
    }
    case 12u: {
      let ang = a.y * p.z;
      s.p = vec3f(cos(ang) * p.x - sin(ang) * p.y, sin(ang) * p.x + cos(ang) * p.y, p.z);
    }
    case 13u: {
      let r2 = dot(p.xy, p.xy);
      if (r2 > 0.0) { s.p = vec3f(p.xy / r2, p.z); s.k = 1.0 / r2; }
    }
    case 14u: {
      let r2 = dot(p.xy, p.xy);
      s.p = vec3f(p.x * sin(r2) - p.y * cos(r2), p.x * cos(r2) + p.y * sin(r2), p.z);
    }
    case 15u: { s.p = vec3f(sin(p.x), sin(p.y), p.z); }
    case 16u: {
      let r = length(p.xy);
      if (r > 0.0) { s.p = vec3f((p.x - p.y) * (p.x + p.y) / r, 2.0 * p.x * p.y / r, p.z); }
    }
    case 17u: { s.p = vec3f(atan2(p.x, p.y) / PI, length(p.xy) - 1.0, p.z); }
    default: {}
  }
  return s;
}

fn iterate(p0: vec3f, c: vec3f) -> Trace {
  var t: Trace;
  t.p = p0; t.dr = 1.0; t.n = 0u; t.escaped = false; t.trap = 1e20; t.col = 0.0;
  let bail2 = head.bail * head.bail;
  for (var i = 0u; i < head.iters; i++) {
    let slot = schedAt(i);
    let start = head.starts[slot];
    for (var j = 0u; j < head.lens[slot]; j++) {
      let s = opFwd(start + j, t.p, c);
      t.p = s.p;
      if (s.k < 0.0) { t.dr = t.dr + 1.0; } else { t.dr = t.dr * s.k; }
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
fn cFor(p: vec3f) -> vec3f { return select(p, head.c.xyz, (head.flags & FLAG_JULIA) != 0u); }

fn de(p: vec3f) -> f32 { return deOf(iterate(p, cFor(p))); }
`;

// The inverse half, for push. Needs a random source: the includer defines
//   fn pick(n: u32) -> u32   (uniform in [0, n))
export const INVERSE = /* wgsl */ `
// one preimage of q under op oi, choosing a branch with pick(); ok = false when q has none
fn opInv(oi: u32, q: vec3f, c: vec3f) -> Step {
  let a = rec(oi, 0u);
  let b = rec(oi, 1u);
  let cc = rec(oi, 2u);
  var s: Step;
  s.p = q; s.k = 1.0; s.branch = 0u; s.ok = true;
  switch u32(a.x) {
    case 0u: { s.p = q - a.yzw; }
    case 1u: { s.p = q - c; }
    case 2u: { if (a.y == 0.0) { s.ok = false; } else { s.p = q / a.y; } }
    case 3u: {
      // Rᵀ q: the rows of R as columns
      s.p = q.x * a.yzw + q.y * b.xyz + q.z * vec3f(b.w, cc.xy);
    }
    case 4u: {
      let t = dot(q, a.yzw) - b.x;
      if (t < 0.0) { s.ok = false; }
      else if (pick(2u) == 1u) { s.p = q - 2.0 * t * a.yzw; s.branch = 1u; }
    }
    case 5u: {
      let l = a.y;
      var o = vec3f(0.0);
      for (var i = 0u; i < 3u; i++) {
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
      var cand = array<vec3f, 3>(q, q, q);
      var m = 0u;
      if (r / k0 < a.y) { cand[m] = q / k0; m++; }
      if (r > a.z && r <= f2 / a.y) { cand[m] = q * (f2 / (r * r)); m++; }
      if (r >= a.z) { cand[m] = q; m++; }
      if (m == 0u) { s.ok = false; } else { let k = pick(m); s.p = cand[k]; s.branch = k; }
    }
    case 7u: {
      if (any(q < vec3f(0.0))) { s.ok = false; }
      else {
        s.branch = pick(8u);
        s.p = q * vec3f(select(1.0, -1.0, (s.branch & 1u) != 0u), select(1.0, -1.0, (s.branch & 2u) != 0u), select(1.0, -1.0, (s.branch & 4u) != 0u));
      }
    }
    case 8u: {
      if (!(q.x >= q.y && q.y >= q.z)) { s.ok = false; }
      else {
        s.branch = pick(6u);
        switch s.branch {
          case 0u: { s.p = q.xyz; }
          case 1u: { s.p = q.xzy; }
          case 2u: { s.p = q.yxz; }
          case 3u: { s.p = q.zxy; }
          case 4u: { s.p = q.yzx; }
          default: { s.p = q.zyx; }
        }
      }
    }
    case 9u: {
      // every t = (±θ + 2πk)/n inside [0, π] is a preimage polar angle (with φ shifted by π for −);
      // every azimuth (φ + 2πj)/n is valid
      let r = length(q);
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
          s.p = rn * vec3f(sin(tt) * cos(f), sin(tt) * sin(f), cos(tt));
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
        s.p = vec3f(rn * cos(ang), rn * sin(ang), q.z);
        s.branch = j;
      }
    }
    case 11u: { let r2 = dot(q, q); if (r2 > 0.0) { s.p = q / r2; } }
    case 12u: {
      let ang = -a.y * q.z;
      s.p = vec3f(cos(ang) * q.x - sin(ang) * q.y, sin(ang) * q.x + cos(ang) * q.y, q.z);
    }
    case 13u: { let r2 = dot(q.xy, q.xy); if (r2 > 0.0) { s.p = vec3f(q.xy / r2, q.z); } }
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
// iterateDual carries five columns: three for the position gradient (normals, the DE's gradient),
// one for the selected parameter (the metric), one renormalised at fixed c (the Lyapunov exponent).
export const DUAL = /* wgsl */ `
var<private> tanOi: u32 = 0xffffffffu;
var<private> tanRec: array<vec4f, 4>;

struct Tan { v: vec3f, dk: f32 };

fn opTan(oi: u32, p: vec3f, c: vec3f, v: vec3f, dc: vec3f, withRec: bool) -> Tan {
  let a = rec(oi, 0u);
  let b = rec(oi, 1u);
  let cc = rec(oi, 2u);
  var da = vec4f(0.0);
  var db = vec4f(0.0);
  var dcc = vec4f(0.0);
  if (withRec && oi == tanOi) { da = tanRec[0]; db = tanRec[1]; dcc = tanRec[2]; }
  var o: Tan;
  o.v = v; o.dk = 0.0;
  switch u32(a.x) {
    case 0u: { o.v = v + da.yzw; }
    case 1u: { o.v = v + dc; }
    case 2u: { o.v = a.y * v + da.y * p; o.dk = sign(a.y) * da.y; }
    case 3u: {
      o.v = vec3f(dot(a.yzw, v), dot(b.xyz, v), dot(vec3f(b.w, cc.xy), v))
          + vec3f(dot(da.yzw, p), dot(db.xyz, p), dot(vec3f(db.w, dcc.xy), p));
    }
    case 4u: {
      let n = a.yzw;
      let t = dot(p, n) - b.x;
      if (t < 0.0) {
        let dt = dot(v, n) + dot(p, da.yzw) - db.x;
        o.v = v - 2.0 * (dt * n + t * da.yzw);
      }
    }
    case 5u: {
      let l = a.y;
      let dl = da.y;
      for (var i = 0u; i < 3u; i++) {
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
    case 7u: { o.v = v * select(vec3f(1.0), vec3f(-1.0), p < vec3f(0.0)); }
    case 8u: {
      var x = p;
      var w = v;
      if (x.x < x.y) { x = x.yxz; w = w.yxz; }
      if (x.y < x.z) { x = x.xzy; w = w.xzy; }
      if (x.x < x.y) { x = x.yxz; w = w.yxz; }
      o.v = w;
    }
    case 9u: {
      let r = length(p);
      if (r > 0.0) {
        let n = a.y;
        let dn = da.y;
        let rxy2 = dot(p.xy, p.xy);
        let drr = dot(p, v) / r;
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
        o.v = dR * u + R * vec3f(cos(T) * cos(F) * dT - sin(T) * sin(F) * dF,
                                 cos(T) * sin(F) * dT + sin(T) * cos(F) * dF,
                                 -sin(T) * dT);
        o.dk = n * (n - 1.0) * pow(r, n - 2.0) * drr + pow(r, n - 1.0) * (1.0 + n * lr) * dn;
      } else { o.v = vec3f(0.0); }
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
        o.v = vec3f(dR * cos(A) - R * sin(A) * dA, dR * sin(A) + R * cos(A) * dA, v.z);
        o.dk = n * (n - 1.0) * pow(r, n - 2.0) * drr + pow(r, n - 1.0) * (1.0 + n * lr) * dn;
      } else { o.v = vec3f(0.0, 0.0, v.z); }
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
      o.v = vec3f(cs * v.x - sn * v.y - (sn * p.x + cs * p.y) * dang,
                  sn * v.x + cs * v.y + (cs * p.x - sn * p.y) * dang, v.z);
    }
    case 13u: {
      let r2 = dot(p.xy, p.xy);
      if (r2 > 0.0) {
        let dr2 = 2.0 * dot(p.xy, v.xy);
        o.v = vec3f(v.xy / r2 - p.xy * dr2 / (r2 * r2), v.z);
        o.dk = -dr2 / (r2 * r2);
      }
    }
    case 14u: {
      let r2 = dot(p.xy, p.xy);
      let dr2 = 2.0 * dot(p.xy, v.xy);
      let cs = cos(r2);
      let sn = sin(r2);
      o.v = vec3f(v.x * sn - v.y * cs + (p.x * cs + p.y * sn) * dr2,
                  v.x * cs + v.y * sn + (-p.x * sn + p.y * cs) * dr2, v.z);
    }
    case 15u: { o.v = vec3f(cos(p.x) * v.x, cos(p.y) * v.y, v.z); }
    case 16u: {
      let r = length(p.xy);
      if (r > 0.0) {
        let drr = dot(p.xy, v.xy) / r;
        o.v = vec3f((2.0 * p.x * v.x - 2.0 * p.y * v.y) / r - (p.x * p.x - p.y * p.y) * drr / (r * r),
                    2.0 * (p.y * v.x + p.x * v.y) / r - 2.0 * p.x * p.y * drr / (r * r), v.z);
      }
    }
    case 17u: {
      let r2 = dot(p.xy, p.xy);
      if (r2 > 0.0) {
        let r = sqrt(r2);
        o.v = vec3f((p.y * v.x - p.x * v.y) / r2 / PI, dot(p.xy, v.xy) / r, v.z);
      }
    }
    default: {}
  }
  return o;
}

struct Dual {
  t: Trace,
  g: mat3x3f,     // ∂p/∂p0, columns x y z (through c too when c is the point itself)
  gdr: vec3f,     // ∂dr/∂p0
  q: vec3f,       // ∂p/∂θ for the selected parameter
  qdr: f32,       // ∂dr/∂θ
  lyap: f32,      // mean log stretch per iteration of a tangent at fixed c
};

fn iterateDual(p0: vec3f, c: vec3f, cIsP: bool) -> Dual {
  var d: Dual;
  d.t.p = p0; d.t.dr = 1.0; d.t.n = 0u; d.t.escaped = false; d.t.trap = 1e20; d.t.col = 0.0;
  var g0 = vec3f(1.0, 0.0, 0.0);
  var g1 = vec3f(0.0, 1.0, 0.0);
  var g2 = vec3f(0.0, 0.0, 1.0);
  var gdr = vec3f(0.0);
  var q = vec3f(0.0);
  var qdr = 0.0;
  var lv = normalize(vec3f(0.6, 0.48, 0.64));
  var lsum = 0.0;
  let k = select(0.0, 1.0, cIsP);
  let dc0 = vec3f(k, 0.0, 0.0);
  let dc1 = vec3f(0.0, k, 0.0);
  let dc2 = vec3f(0.0, 0.0, k);
  let bail2 = head.bail * head.bail;
  for (var i = 0u; i < head.iters; i++) {
    let slot = schedAt(i);
    let start = head.starts[slot];
    for (var j = 0u; j < head.lens[slot]; j++) {
      let oi = start + j;
      let p = d.t.p;
      let s = opFwd(oi, p, c);
      let t0 = opTan(oi, p, c, g0, dc0, false);
      let t1 = opTan(oi, p, c, g1, dc1, false);
      let t2 = opTan(oi, p, c, g2, dc2, false);
      let tq = opTan(oi, p, c, q, vec3f(0.0), true);
      let tl = opTan(oi, p, c, lv, vec3f(0.0), false);
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
  d.g = mat3x3f(g0, g1, g2);
  d.gdr = gdr;
  d.q = q;
  d.qdr = qdr;
  d.lyap = lsum / f32(max(d.t.n, 1u));
  return d;
}

// derivative of the distance estimate along a tangent (dp, ddr), matching deOf()
fn deTan(t: Trace, dp: vec3f, ddr: f32) -> f32 {
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

fn deGrad(d: Dual) -> vec3f {
  return vec3f(deTan(d.t, d.g[0], d.gdr.x), deTan(d.t, d.g[1], d.gdr.y), deTan(d.t, d.g[2], d.gdr.z));
}
`;
