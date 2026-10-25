// The WGSL interpreter: the same orbit as core/cpu.js iterate(), with the trace statistics the look
// layer reads. Every op here must match its fwd in core/ops.js; test/parity.html diffs the two.

export const INTERP = /* wgsl */ `
struct Head {
  iters: u32, schedLen: u32, flags: u32, bail: f32,
  starts: vec4u, lens: vec4u,
  sched: array<vec4u, 16>,
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

fn schedAt(i: u32) -> u32 {
  let k = i % head.schedLen;
  return head.sched[k / 4u][k % 4u];
}

fn branchColour(col: f32, opIndex: u32, branch: u32) -> f32 {
  // every branch taken pulls the colour index toward that branch's own value
  let own = fract(f32(opIndex) * 0.6180339 + f32(branch) * 0.3819660);
  return mix(col, own, 0.5);
}

fn iterate(p0: vec3f, c: vec3f) -> Trace {
  var t: Trace;
  t.p = p0; t.dr = 1.0; t.n = 0u; t.escaped = false; t.trap = 1e20; t.col = 0.0;
  let bail2 = head.bail * head.bail;
  for (var i = 0u; i < head.iters; i++) {
    let slot = schedAt(i);
    let start = head.starts[slot];
    let len = head.lens[slot];
    for (var j = 0u; j < len; j++) {
      let oi = start + j;
      let a = ops[oi * 4u];
      let b = ops[oi * 4u + 1u];
      let cc = ops[oi * 4u + 2u];
      let code = u32(a.x);
      var p = t.p;
      var branch = 0u;
      switch code {
        case 0u: { p = p + a.yzw; }
        case 1u: { p = p + c; t.dr = t.dr + 1.0; }
        case 2u: { p = p * a.y; t.dr = t.dr * abs(a.y); }
        case 3u: {
          // the matrix is packed row-major from p0: a.yzw | b.xyz | b.w cc.xy
          let r0 = vec3f(a.y, a.z, a.w);
          let r1 = vec3f(b.x, b.y, b.z);
          let r2 = vec3f(b.w, cc.x, cc.y);
          p = vec3f(dot(r0, p), dot(r1, p), dot(r2, p));
        }
        case 4u: {
          let n = a.yzw;
          let d = dot(p, n) - b.x;
          if (d < 0.0) { p = p - 2.0 * d * n; branch = 1u; }
        }
        case 5u: {
          let l = a.y;
          let q = clamp(p, vec3f(-l), vec3f(l)) * 2.0 - p;
          branch = select(0u, 1u, p.x > l) + select(0u, 2u, p.x < -l)
                 + select(0u, 3u, p.y > l) + select(0u, 6u, p.y < -l)
                 + select(0u, 9u, p.z > l) + select(0u, 18u, p.z < -l);
          p = q;
        }
        case 6u: {
          let r2 = dot(p, p);
          let m2 = a.y * a.y;
          let f2 = a.z * a.z;
          if (r2 < m2) { let k = f2 / m2; p = p * k; t.dr = t.dr * k; branch = 0u; }
          else if (r2 < f2) { let k = f2 / r2; p = p * k; t.dr = t.dr * k; branch = 1u; }
          else { branch = 2u; }
        }
        case 7u: {
          branch = select(0u, 1u, p.x < 0.0) + select(0u, 2u, p.y < 0.0) + select(0u, 4u, p.z < 0.0);
          p = abs(p);
        }
        case 8u: {
          // descending sort of three values
          var x = p;
          if (x.x < x.y) { x = x.yxz; branch = branch + 1u; }
          if (x.y < x.z) { x = x.xzy; branch = branch + 2u; }
          if (x.x < x.y) { x = x.yxz; branch = branch + 4u; }
          p = x;
        }
        case 9u: {
          let r = length(p);
          if (r > 0.0) {
            let n = a.y;
            let theta = acos(clamp(p.z / r, -1.0, 1.0)) * n;
            let phi = atan2(p.y, p.x) * n;
            let rn = pow(r, n);
            t.dr = t.dr * n * pow(r, n - 1.0);
            p = rn * vec3f(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta));
          } else { t.dr = 0.0; }
        }
        case 10u: {
          let r = length(p.xy);
          if (r > 0.0) {
            let n = a.y;
            let ang = atan2(p.y, p.x) * n;
            let rn = pow(r, n);
            t.dr = t.dr * n * pow(r, n - 1.0);
            p = vec3f(rn * cos(ang), rn * sin(ang), p.z);
          } else { t.dr = 0.0; }
        }
        case 11u: {
          let r2 = dot(p, p);
          if (r2 > 0.0) { p = p / r2; t.dr = t.dr / r2; }
        }
        case 12u: {
          let ang = a.y * p.z;
          let cs = cos(ang); let sn = sin(ang);
          p = vec3f(cs * p.x - sn * p.y, sn * p.x + cs * p.y, p.z);
        }
        case 13u: {
          let r2 = dot(p.xy, p.xy);
          if (r2 > 0.0) { p = vec3f(p.xy / r2, p.z); t.dr = t.dr / r2; }
        }
        case 14u: {
          let r2 = dot(p.xy, p.xy);
          let cs = cos(r2); let sn = sin(r2);
          p = vec3f(p.x * sn - p.y * cs, p.x * cs + p.y * sn, p.z);
        }
        case 15u: { p = vec3f(sin(p.x), sin(p.y), p.z); }
        case 16u: {
          let r = length(p.xy);
          if (r > 0.0) { p = vec3f((p.x - p.y) * (p.x + p.y) / r, 2.0 * p.x * p.y / r, p.z); }
        }
        case 17u: {
          p = vec3f(atan2(p.x, p.y) / 3.14159265, length(p.xy) - 1.0, p.z);
        }
        default: {}
      }
      t.p = p;
      if (branch != 0u) { t.col = branchColour(t.col, oi, branch); }
    }
    t.n = i + 1u;
    let r2 = dot(t.p, t.p);
    t.trap = min(t.trap, r2);
    if (!(r2 <= bail2)) { t.escaped = true; break; }
  }
  return t;
}

const FLAG_POWER = 1u;
const FLAG_UNSAFE = 2u;

fn deOf(t: Trace) -> f32 {
  let r = length(t.p);
  if (!(t.dr > 0.0) || r == 0.0) { return 0.0; }
  if ((head.flags & FLAG_POWER) != 0u) {
    if (t.escaped && r > 1.0) { return 0.5 * log(r) * r / t.dr; }
    return 0.0;
  }
  return r / abs(t.dr);
}

fn de(p: vec3f) -> f32 { return deOf(iterate(p, p)); }
`;
