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
  let a = ops[oi * 4u];
  let b = ops[oi * 4u + 1u];
  let cc = ops[oi * 4u + 2u];
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
  let a = ops[oi * 4u];
  let b = ops[oi * 4u + 1u];
  let cc = ops[oi * 4u + 2u];
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
