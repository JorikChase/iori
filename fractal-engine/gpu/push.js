// Push renderer: the same formula run backwards. Walkers play the chaos game through the inverse
// branches, backing up out of dead ends through a short history (core/cpu.js push(), on the GPU); every sample is a Gaussian splat whose covariance is
// carried along the walk, Σ ← J Σ Jᵀ + ε²I, with J the Jacobian of the inverse step — so a splat
// takes the size and stretch of the cell of the attractor it stands for. Splats land in a fixed-point
// histogram (atomics), are resolved into a float accumulation, and shown with flame-style
// log-density tonemapping. Depth of field is free: the circle of confusion is added to the projected
// covariance.
//
// For a formula with +c and no fixed c, push needs one constant: the app passes the point the camera
// looks at, so push shows the Julia set of where you are.

import { INTERP, INVERSE, DUAL, COLLAGE, withDrive, withCollage } from './wgsl.js';
import { drives } from './pack.js';

const WALKER_BYTES = 64;
const HISTORY = 16;       // as core/cpu.js: the walk backs up out of dead ends through this history
const PV_FLOATS = 44;
const SCALE = 1024; // fixed-point scale of the histogram

const WALK = INTERP + /* wgsl */ `
var<private> rngState: u32;
fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
fn rnd() -> f32 { rngState = pcg(rngState); return f32(rngState >> 8u) / 16777216.0; }
fn pick(n: u32) -> u32 { return min(u32(rnd() * f32(n)), max(n, 1u) - 1u); }
` + INVERSE + DUAL + /* wgsl */ `
struct PView {
  pos: vec4f,    // xyz camera, w tan(fov/2)
  right: vec4f,  // xyz, w aperture radius
  up: vec4f,     // xyz, w focus distance
  fwd: vec4f,    // xyz, w near plane
  res: vec4f,    // xy histogram size, z frame, w steps per walker per frame
  cpush: vec4f,  // w base splat size ε (world units)
  look: vec4f,   // x hue, y iridescence, z colour spread, w max splat radius (px)
  key: vec4f,    // rgb key colour, w fog density
  misc: vec4f,   // x burn-in steps, y seed, z respawn radius, w 1 while capturing splats
  c4: vec4f,     // the constant for +c, in 4-D
  slab: vec4f,   // x the slab's half-width along w around the slice (world units; 0: the whole shadow)
};

// the walk lives in 4-D: its point, its history and its covariance (10 numbers of a symmetric 4×4)
struct Walker {
  top: u32, depth: u32, age: u32, rng: u32,  // ring-buffer top, entries held, steps since spawn
  sd: vec4f,             // Σ diagonal xx yy zz ww
  soA: vec4f,            // Σ off-diagonal xy xz xw yz
  soB: vec4f,            // Σ off-diagonal yw zw
};
const HISTORY = ${HISTORY}u;

@group(1) @binding(0) var<uniform> pv: PView;
@group(1) @binding(1) var<storage, read_write> walkers: array<Walker>;
@group(1) @binding(2) var<storage, read_write> hist: array<atomic<u32>>;
@group(1) @binding(3) var<storage, read_write> stacks: array<vec4f>;   // HISTORY entries per walker, two vec4 each: p, (colour)
@group(1) @binding(4) var<storage, read_write> capture: array<vec4f>;  // 3 per sample, in the world: p + colour, Σ diagonal + weight, Σ off-diagonal
@group(1) @binding(5) var<storage, read_write> captured: array<atomic<u32>>;

struct Inv { p: vec4f, col: f32, ok: bool };

// one inverse iteration of a slot: its ops in reverse order
fn invStep(slot: u32, q: vec4f, col0: f32) -> Inv {
  var r: Inv;
  r.p = q; r.col = col0; r.ok = true;
  let start = slotStart(slot);
  let len = slotLen(slot);
  for (var j = 0u; j < len; j++) {
    let oi = start + len - 1u - j;
    let s = invAt(oi, r.p, pv.c4);
    if (!s.ok) { r.ok = false; return r; }
    r.p = s.p;
    if (s.branch != 0u) { r.col = branchColour(r.col, oi, s.branch); }
  }
  return r;
}

fn tint(col: f32, cosv: f32) -> vec3f {
  if ((head.flags & FLAG_SHADE) != 0u) {
    // the formula's colour graph; a splat knows only its fold colour index
    var r: Readings;
    r.col = col;
    return shadeRun(r).color.rgb * length(pv.key.rgb);
  }
  let base = pv.key.rgb;
  let film = 0.5 + 0.5 * cos(6.2831853 * (vec3f(0.0, 0.33, 0.67) + col * pv.look.z + cosv * 0.35 + pv.look.x));
  return mix(base, film * length(base), pv.look.y);
}

fn splat(p: vec3f, S: mat3x3f, col: f32, weight: f32) {
  let d = p - pv.pos.xyz;
  let z = dot(d, pv.fwd.xyz);
  if (z < pv.fwd.w) { return; }
  let x = dot(d, pv.right.xyz);
  let y = dot(d, pv.up.xyz);
  let W = pv.res.x;
  let H = pv.res.y;
  let k = H / (2.0 * pv.pos.w);
  let cx = W * 0.5 + k * x / z;
  let cy = H * 0.5 - k * y / z;
  if (cx < -8.0 || cy < -8.0 || cx > W + 8.0 || cy > H + 8.0) { return; }
  // project the covariance: rows of the screen Jacobian
  let du = k * (pv.right.xyz - (x / z) * pv.fwd.xyz) / z;
  let dv = -k * (pv.up.xyz - (y / z) * pv.fwd.xyz) / z;
  let Su = S * du;
  let Sv = S * dv;
  // circle of confusion from the thin lens, in pixels
  let coc = pv.right.w * abs(z - pv.up.w) / z * k / max(pv.up.w, 1e-6);
  var a = dot(du, Su) + coc * coc + 0.25;
  var b = dot(du, Sv);
  var c = dot(dv, Sv) + coc * coc + 0.25;
  // cap the footprint: shrink the kernel, keep its energy
  let tr = a + c;
  let lmax = 0.5 * tr + sqrt(max(0.25 * tr * tr - (a * c - b * b), 0.0));
  let R = pv.look.w;
  let rad = 3.0 * sqrt(lmax);
  if (rad > R) { let f = (R / rad) * (R / rad); a = a * f; b = b * f; c = c * f; }
  if (!(rad == rad) || !(a > 0.0) || !(c > 0.0)) { return; }
  let det = max(a * c - b * b, 1e-8);
  let ia = c / det;
  let ib = -b / det;
  let ic = a / det;
  let ext = i32(ceil(min(rad, R)));
  let x0 = i32(floor(cx));
  let y0 = i32(floor(cy));
  let fog = exp(-z * pv.key.w);
  let rgb = tint(col, 0.0) * fog * weight;
  // normalise over the pixels actually covered so every sample carries the same energy
  var sum = 0.0;
  for (var j = -ext; j <= ext; j++) {
    for (var i = -ext; i <= ext; i++) {
      let ox = f32(x0 + i) + 0.5 - cx;
      let oy = f32(y0 + j) + 0.5 - cy;
      sum = sum + exp(-0.5 * (ia * ox * ox + 2.0 * ib * ox * oy + ic * oy * oy));
    }
  }
  if (!(sum > 1e-6)) { return; }
  for (var j = -ext; j <= ext; j++) {
    for (var i = -ext; i <= ext; i++) {
      let px = x0 + i;
      let py = y0 + j;
      if (px < 0 || py < 0 || px >= i32(W) || py >= i32(H)) { continue; }
      let ox = f32(px) + 0.5 - cx;
      let oy = f32(py) + 0.5 - cy;
      let w = exp(-0.5 * (ia * ox * ox + 2.0 * ib * ox * oy + ic * oy * oy)) / sum;
      let idx = (u32(py) * u32(W) + u32(px)) * 4u;
      let v = w * ${SCALE}.0;
      atomicAdd(&hist[idx], u32(v * rgb.r + 0.5));
      atomicAdd(&hist[idx + 1u], u32(v * rgb.g + 0.5));
      atomicAdd(&hist[idx + 2u], u32(v * rgb.b + 0.5));
      atomicAdd(&hist[idx + 3u], u32(v + 0.5));
    }
  }
}

fn sigmaOf(w: Walker) -> mat4x4f {
  return mat4x4f(vec4f(w.sd.x, w.soA.x, w.soA.y, w.soA.z),
                 vec4f(w.soA.x, w.sd.y, w.soA.w, w.soB.x),
                 vec4f(w.soA.y, w.soA.w, w.sd.z, w.soB.y),
                 vec4f(w.soA.z, w.soB.x, w.soB.y, w.sd.w));
}

fn resetSigma(w: ptr<function, Walker>) {
  let e2 = pv.cpush.w * pv.cpush.w;
  (*w).sd = vec4f(e2); (*w).soA = vec4f(0.0); (*w).soB = vec4f(0.0);
}

fn respawn(wi: u32, w: ptr<function, Walker>) {
  var p = vec4f(1.0);
  for (var i = 0; i < 12; i++) {
    p = vec4f(rnd(), rnd(), rnd(), rnd()) * 2.0 - 1.0;
    if (dot(p, p) <= 1.0) { break; }
  }
  (*w).top = 0u; (*w).depth = 1u; (*w).age = 0u;
  stacks[wi * HISTORY * 2u] = p * pv.misc.z;
  stacks[wi * HISTORY * 2u + 1u] = vec4f(rnd(), 0.0, 0.0, 0.0);
  resetSigma(w);
}

@compute @workgroup_size(64)
fn walk(@builtin(global_invocation_id) gid: vec3u) {
  let wi = gid.x;
  if (wi >= arrayLength(&walkers)) { return; }
  var w = walkers[wi];
  rngState = w.rng;
  if (rngState == 0u || w.depth == 0u) {
    if (rngState == 0u) { rngState = pcg(wi * 9781u + u32(pv.misc.y) * 6271u + 1u); }
    respawn(wi, &w);
  }
  let e2 = pv.cpush.w * pv.cpush.w;
  let steps = u32(pv.res.w);
  for (var s = 0u; s < steps; s++) {
    let at = (wi * HISTORY + w.top) * 2u;
    let q = stacks[at];
    let col = stacks[at + 1u].x;
    let iter = head.iters - 1u - (w.age % head.iters);
    let slot = schedAt(iter);
    // a chimera's self-fields: the walk knows the iteration it inverts; the trap it reads is the point's own
    fIter = f32(iter); fIters = f32(head.iters); fTrap = dot(q, q);
    // drivers (core/cpu.js push): the hoisted ones read at the walk point, the orbit readings at the
    // walk's iteration and point; the replays below keep them
    if (DRIVE_ON) { driveStart(q); if (drvAny) { driveIter(q, 1.0, iter, f32(head.iters)); } }
    // one random attempt; a dead end backs up instead of retrying (see core/cpu.js push)
    let seed = rngState;
    mixKeep = true;
    let res = invStep(slot, q, col);
    mixKeep = false;
    let after = rngState;
    if (!res.ok || any(res.p != res.p) || dot(res.p, res.p) > head.bail * head.bail) {
      w.depth = w.depth - 1u;
      if (w.depth == 0u) { respawn(wi, &w); continue; }
      w.top = (w.top + HISTORY - 1u) % HISTORY;
      w.age = max(w.age, 1u) - 1u;
      resetSigma(&w);
      continue;
    }
    // Jacobian of the step, its branch choices held fixed by replaying the seed
    let h = 1e-3 * max(length(q), 0.05);
    // (a chimera answers the replays from its kept solution: see mixReplay in gpu/wgsl.js)
    mixReplay = true;
    rngState = seed; let c0 = invStep(slot, q + vec4f(h, 0.0, 0.0, 0.0), col).p;
    rngState = seed; let c1 = invStep(slot, q + vec4f(0.0, h, 0.0, 0.0), col).p;
    rngState = seed; let c2 = invStep(slot, q + vec4f(0.0, 0.0, h, 0.0), col).p;
    rngState = seed; let c3 = invStep(slot, q + vec4f(0.0, 0.0, 0.0, h), col).p;
    mixReplay = false;
    rngState = after;
    var J = mat4x4f((c0 - res.p) / h, (c1 - res.p) / h, (c2 - res.p) / h, (c3 - res.p) / h);
    // a perturbed point can fall on another branch (near a fold edge); its difference quotient is then
    // a jump, not a derivative. Such a step restarts the splat at the base size.
    let jn = max(max(length(J[0]), length(J[1])), max(length(J[2]), length(J[3])));
    if (!(jn < 16.0)) { J = mat4x4f(vec4f(0.0), vec4f(0.0), vec4f(0.0), vec4f(0.0)); }
    let Sn = J * sigmaOf(w) * transpose(J);
    w.sd = vec4f(Sn[0][0], Sn[1][1], Sn[2][2], Sn[3][3]) + vec4f(e2);
    w.soA = vec4f(Sn[1][0], Sn[2][0], Sn[3][0], Sn[2][1]);
    w.soB = vec4f(Sn[3][1], Sn[3][2], 0.0, 0.0);
    w.top = (w.top + 1u) % HISTORY;
    let nat = (wi * HISTORY + w.top) * 2u;
    stacks[nat] = res.p;
    stacks[nat + 1u] = vec4f(res.col, 0.0, 0.0, 0.0);
    w.depth = min(w.depth + 1u, HISTORY);
    w.age = w.age + 1u;
    if (f32(w.age) > pv.misc.x) {
      // back to the world: the sample's place along the slice's axes, and a weight by its distance off
      // the slice — a slab of the 4-D attractor around the world, or its whole shadow when slab = 0
      let u = unembed(res.p);
      var weight = 1.0;
      if (pv.slab.x > 0.0) { weight = exp(-0.5 * (u.w / pv.slab.x) * (u.w / pv.slab.x)); }
      if (weight > 0.02) {
        // the covariance seen in the world: Eᵀ Σ E over the slice's three axes
        let S4 = sigmaOf(w);
        let E = mat3x4f(head.slice[0], head.slice[1], head.slice[2]);
        let S = transpose(E) * S4 * E;
        splat(u.xyz, S, res.col, weight);
        if (pv.misc.w > 0.5) {
          let k = atomicAdd(&captured[0], 1u);
          if (k < arrayLength(&capture) / 3u) {
            capture[k * 3u] = vec4f(u.xyz, res.col);
            capture[k * 3u + 1u] = vec4f(S[0][0], S[1][1], S[2][2], weight);
            capture[k * 3u + 2u] = vec4f(S[1][0], S[2][0], S[2][1], 0.0);
          }
        }
      }
    }
  }
  w.rng = rngState;
  walkers[wi] = w;
}
`;

const RESOLVE = /* wgsl */ `
struct RV { size: vec4f };   // x width, y height, z decay of the old accumulation
@group(0) @binding(0) var<uniform> rv: RV;
@group(0) @binding(1) var<storage, read_write> hist: array<atomic<u32>>;
@group(0) @binding(2) var<storage, read_write> accum: array<vec4f>;
@compute @workgroup_size(64)
fn resolve(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  let n = u32(rv.size.x) * u32(rv.size.y);
  if (i >= n) { return; }
  let v = vec4f(f32(atomicExchange(&hist[i * 4u], 0u)), f32(atomicExchange(&hist[i * 4u + 1u], 0u)),
                f32(atomicExchange(&hist[i * 4u + 2u], 0u)), f32(atomicExchange(&hist[i * 4u + 3u], 0u))) / ${SCALE}.0;
  accum[i] = accum[i] * rv.size.z + v;
}
`;

const DISPLAY = /* wgsl */ `
struct D { size: vec4f, tone: vec4f };  // size: canvas wh, hist wh; tone: x 1/Σweights, y gain, z exposure
@group(0) @binding(0) var<uniform> disp: D;
@group(0) @binding(1) var<storage, read> accum: array<vec4f>;
@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}
fn toSrgb(c: vec3f) -> vec3f {
  return select(1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055, c * 12.92, c <= vec3f(0.0031308));
}
fn at(q: vec2i) -> vec4f {
  let wh = vec2i(disp.size.zw);
  let c = clamp(q, vec2i(0), wh - 1);
  return accum[u32(c.y) * u32(wh.x) + u32(c.x)];
}
@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let q = fc.xy / disp.size.xy * disp.size.zw - 0.5;
  let i0 = vec2i(floor(q));
  let f = fract(q);
  let s = mix(mix(at(i0), at(i0 + vec2i(1, 0)), f.x), mix(at(i0 + vec2i(0, 1)), at(i0 + vec2i(1, 1)), f.x), f.y) * disp.tone.x;
  // flame tonemapping: colour is the mean colour of what landed here, brightness the log of how much
  let dens = s.a * disp.tone.y;
  var o = vec3f(0.0);
  if (s.a > 1e-9) { o = (s.rgb / s.a) * log(1.0 + dens) * disp.tone.z; }
  o = toSrgb(clamp(o / (1.0 + o * 0.25), vec3f(0.0), vec3f(1.0)));
  let n = fract(sin(dot(fc.xy, vec2f(12.9898, 78.233))) * 43758.5453);
  return vec4f(o + (n - 0.5) / 255.0, 1.0);
}
`;

// The collage's walk (core/collage.js collagePush): the formula's walk with the pieces behind their
// index (gpu/wgsl.js withCollage). A piece with its own constant (c=) walks with it; the others take
// the app's, as a formula does.
const COLLAGE_WALK = withCollage(WALK.replace(/pv\.c4/g, 'walkC()')) + COLLAGE + /* wgsl */ `
fn walkC() -> vec4f { return select(pv.c4, heads[hp].c, (heads[hp].flags & FLAG_JULIA) != 0u); }
fn clFallback(i: u32, col: f32, facing: f32) -> vec4f { return vec4f(tint(col, facing), 1.0); }
` + `@compute @workgroup_size(64)
fn cwalk(@builtin(global_invocation_id) gid: vec3u) {
  let wi = gid.x;
  if (wi >= arrayLength(&walkers)) { return; }
  // walker wi walks piece wi mod n: every piece its own attractor, the walkers shared alike
  let piece = wi % u32(ops[CL_BASE].x);
  clSelect(piece);
  let own = ops[CL_BASE].y > 0.5;
  var w = walkers[wi];
  rngState = w.rng;
  if (rngState == 0u || w.depth == 0u) {
    if (rngState == 0u) { rngState = pcg(wi * 9781u + u32(pv.misc.y) * 6271u + 1u); }
    respawn(wi, &w);
  }
  let e2 = pv.cpush.w * pv.cpush.w;
  let steps = u32(pv.res.w);
  for (var s = 0u; s < steps; s++) {
    let at = (wi * HISTORY + w.top) * 2u;
    let q = stacks[at];
    let col = stacks[at + 1u].x;
    let iter = heads[hp].iters - 1u - (w.age % heads[hp].iters);
    let slot = schedAt(iter);
    // a chimera's self-fields: the walk knows the iteration it inverts; the trap it reads is the point's own
    fIter = f32(iter); fIters = f32(heads[hp].iters); fTrap = dot(q, q);
    // drivers (core/cpu.js push): the hoisted ones read at the walk point, the orbit readings at the
    // walk's iteration and point; the replays below keep them
    if (DRIVE_ON) { driveStart(q); if (drvAny) { driveIter(q, 1.0, iter, f32(heads[hp].iters)); } }
    // one random attempt; a dead end backs up instead of retrying (see core/cpu.js push)
    let seed = rngState;
    mixKeep = true;
    let res = invStep(slot, q, col);
    mixKeep = false;
    let after = rngState;
    if (!res.ok || any(res.p != res.p) || dot(res.p, res.p) > heads[hp].bail * heads[hp].bail) {
      w.depth = w.depth - 1u;
      if (w.depth == 0u) { respawn(wi, &w); continue; }
      w.top = (w.top + HISTORY - 1u) % HISTORY;
      w.age = max(w.age, 1u) - 1u;
      resetSigma(&w);
      continue;
    }
    // Jacobian of the step, its branch choices held fixed by replaying the seed
    let h = 1e-3 * max(length(q), 0.05);
    // (a chimera answers the replays from its kept solution: see mixReplay in gpu/wgsl.js)
    mixReplay = true;
    rngState = seed; let c0 = invStep(slot, q + vec4f(h, 0.0, 0.0, 0.0), col).p;
    rngState = seed; let c1 = invStep(slot, q + vec4f(0.0, h, 0.0, 0.0), col).p;
    rngState = seed; let c2 = invStep(slot, q + vec4f(0.0, 0.0, h, 0.0), col).p;
    rngState = seed; let c3 = invStep(slot, q + vec4f(0.0, 0.0, 0.0, h), col).p;
    mixReplay = false;
    rngState = after;
    var J = mat4x4f((c0 - res.p) / h, (c1 - res.p) / h, (c2 - res.p) / h, (c3 - res.p) / h);
    // a perturbed point can fall on another branch (near a fold edge); its difference quotient is then
    // a jump, not a derivative. Such a step restarts the splat at the base size.
    let jn = max(max(length(J[0]), length(J[1])), max(length(J[2]), length(J[3])));
    if (!(jn < 16.0)) { J = mat4x4f(vec4f(0.0), vec4f(0.0), vec4f(0.0), vec4f(0.0)); }
    let Sn = J * sigmaOf(w) * transpose(J);
    w.sd = vec4f(Sn[0][0], Sn[1][1], Sn[2][2], Sn[3][3]) + vec4f(e2);
    w.soA = vec4f(Sn[1][0], Sn[2][0], Sn[3][0], Sn[2][1]);
    w.soB = vec4f(Sn[3][1], Sn[3][2], 0.0, 0.0);
    w.top = (w.top + 1u) % HISTORY;
    let nat = (wi * HISTORY + w.top) * 2u;
    stacks[nat] = res.p;
    stacks[nat + 1u] = vec4f(res.col, 0.0, 0.0, 0.0);
    w.depth = min(w.depth + 1u, HISTORY);
    w.age = w.age + 1u;
    if (f32(w.age) > pv.misc.x) {
      // through the slice, to one copy of the repetition (round robin), into the world, kept by the
      // piece's share there (gpu/wgsl.js clKeep); the slab weight as a formula's, faded by the share
      let kp = clKeep(piece, res.p, w.age);
      var slab = 1.0;
      if (pv.slab.x > 0.0) { slab = exp(-0.5 * (kp.off / pv.slab.x) * (kp.off / pv.slab.x)); }
      if (kp.ok && kp.a >= 1e-3 && slab > 0.02) {
        let S4 = sigmaOf(w);
        let E = mat3x4f(heads[hp].slice[0], heads[hp].slice[1], heads[hp].slice[2]);
        let S = kp.G * (transpose(E) * S4 * E) * transpose(kp.G);
        let weight = slab * kp.a;
        // the collage's own shade colours every splat (a splat knows only its fold index, and the
        // collage's drivers at its point)
        if (own) { clShadeDrive(kp.p); clSelect(CL_OWN); }
        splat(kp.p, S, res.col, weight);
        clSelect(piece);
        if (pv.misc.w > 0.5) {
          let k = atomicAdd(&captured[0], 1u);
          if (k < arrayLength(&capture) / 3u) {
            capture[k * 3u] = vec4f(kp.p, res.col);
            capture[k * 3u + 1u] = vec4f(S[0][0], S[1][1], S[2][2], weight);
            capture[k * 3u + 2u] = vec4f(S[1][0], S[2][0], S[2][1], f32(piece));
          }
        }
      }
    }
  }
  w.rng = rngState;
  walkers[wi] = w;
}
`;

export async function createPush(R, { walkers = 32768 } = {}) {
  const { device, ctx, format, headBuf, opsBuf, formulaLayout } = R;

  const viewLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  });
  const resolveLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  });
  const dispLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
    ],
  });

  const compile = async (code) => {
    const m = device.createShaderModule({ code });
    const errs = (await m.getCompilationInfo()).messages.filter((x) => x.type === 'error');
    if (errs.length) throw new Error('wgsl: ' + errs.map((x) => `${x.lineNum}:${x.linePos} ${x.message}`).join('\n'));
    return m;
  };
  const driveWalk = () => ['walk', withDrive(WALK), [formulaLayout, viewLayout], 'walk'];
  const collageWalk = (pk) => [pk.drives ? 'cwalk+drive' : 'cwalk', pk.drives ? withDrive(COLLAGE_WALK) : COLLAGE_WALK, [formulaLayout, viewLayout], 'cwalk'];
  // the pipeline for what the renderer holds (a collage's once compiled: null until then)
  const walkFor = () => {
    const pk = R.packed;
    if (pk && pk.collage) return R.variant(...collageWalk(pk));
    return (pk && drives(pk.formula) && R.variant(...driveWalk())) || walkPipe;
  };
  const walkPipe = device.createComputePipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [formulaLayout, viewLayout] }),
    compute: { module: await compile(WALK), entryPoint: 'walk' },
  });
  const resolvePipe = device.createComputePipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [resolveLayout] }),
    compute: { module: await compile(RESOLVE), entryPoint: 'resolve' },
  });
  const dispModule = await compile(DISPLAY);
  const dispPipe = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [dispLayout] }),
    vertex: { module: dispModule, entryPoint: 'vs' },
    fragment: { module: dispModule, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });

  const formulaGroup = device.createBindGroup({
    layout: formulaLayout,
    entries: [{ binding: 0, resource: { buffer: headBuf } }, { binding: 1, resource: { buffer: opsBuf } }],
  });
  const pvBuf = device.createBuffer({ size: PV_FLOATS * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const rvBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const dispBuf = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const walkerBuf = device.createBuffer({ size: walkers * WALKER_BYTES, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  const stackBuf = device.createBuffer({ size: walkers * HISTORY * 32, usage: GPUBufferUsage.STORAGE });
  // capture targets: a dummy pair when not capturing
  let capBuf = device.createBuffer({ size: 48, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  let capCount = device.createBuffer({ size: 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
  let capturing = false;

  let w = 0, h = 0, hist = null, accum = null, walkGroup, resolveGroup, dispGroup;
  let weight = 0; // Σ of the decay weights in the accumulation

  function resize(iw, ih) {
    iw = Math.max(8, iw | 0); ih = Math.max(8, ih | 0);
    if (iw === w && ih === h) return false;
    w = iw; h = ih;
    if (hist) { hist.destroy(); accum.destroy(); }
    hist = device.createBuffer({ size: w * h * 16, usage: GPUBufferUsage.STORAGE });
    accum = device.createBuffer({ size: w * h * 16, usage: GPUBufferUsage.STORAGE });
    makeWalkGroup();
    resolveGroup = device.createBindGroup({
      layout: resolveLayout,
      entries: [{ binding: 0, resource: { buffer: rvBuf } }, { binding: 1, resource: { buffer: hist } }, { binding: 2, resource: { buffer: accum } }],
    });
    dispGroup = device.createBindGroup({
      layout: dispLayout,
      entries: [{ binding: 0, resource: { buffer: dispBuf } }, { binding: 1, resource: { buffer: accum } }],
    });
    weight = 0;
    return true;
  }

  function makeWalkGroup() {
    if (!hist) return;
    walkGroup = device.createBindGroup({
      layout: viewLayout,
      entries: [
        { binding: 0, resource: { buffer: pvBuf } }, { binding: 1, resource: { buffer: walkerBuf } },
        { binding: 2, resource: { buffer: hist } }, { binding: 3, resource: { buffer: stackBuf } },
        { binding: 4, resource: { buffer: capBuf } }, { binding: 5, resource: { buffer: capCount } },
      ],
    });
  }

  // Splats: run frames with capture on until `count` samples (past burn-in) are recorded, then read
  // them back: { p, col, cov } per sample, cov = [xx, xy, xz, yy, yz, zz] — the walk's own Σ.
  async function captureSplats(v, canvas, count, onProgress = () => {}) {
    capBuf.destroy(); capCount.destroy();
    capBuf = device.createBuffer({ size: count * 48, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    capCount = device.createBuffer({ size: 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(capCount, 0, new Uint32Array(4));
    makeWalkGroup();
    if (R.packed && R.packed.collage) await R.variant.ready(...collageWalk(R.packed));
    else if (R.packed && drives(R.packed.formula)) await R.variant.ready(...driveWalk());
    capturing = true;
    const rb = device.createBuffer({ size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    let got = 0;
    try {
      for (let i = 0; i < 400 && got < count; i++) {
        frame({ ...v, frame: v.frame + i, decay: 1 }, canvas);
        const enc = device.createCommandEncoder();
        enc.copyBufferToBuffer(capCount, 0, rb, 0, 16);
        device.queue.submit([enc.finish()]);
        await rb.mapAsync(GPUMapMode.READ);
        got = new Uint32Array(rb.getMappedRange())[0];
        rb.unmap();
        onProgress(Math.min(1, got / count));
      }
      const n = Math.min(got, count);
      const out = device.createBuffer({ size: Math.max(48, n * 48), usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
      const enc = device.createCommandEncoder();
      enc.copyBufferToBuffer(capBuf, 0, out, 0, Math.max(48, n * 48));
      device.queue.submit([enc.finish()]);
      await out.mapAsync(GPUMapMode.READ);
      const d = new Float32Array(out.getMappedRange().slice(0));
      out.unmap(); out.destroy();
      const samples = [];
      for (let k = 0; k < n; k++) {
        const o = k * 12;
        // a collage's samples also say their piece (the weight then carries its share)
        samples.push({ p: [d[o], d[o + 1], d[o + 2]], col: d[o + 3], cov: [d[o + 4], d[o + 8], d[o + 9], d[o + 5], d[o + 10], d[o + 6]], weight: d[o + 7], ...(R.packed && R.packed.collage ? { piece: d[o + 11] } : {}) });
      }
      return samples;
    } finally {
      capturing = false;
      rb.destroy();
    }
  }

  // new formula: walkers forget where they were
  function resetWalkers() {
    device.queue.writeBuffer(walkerBuf, 0, new Uint8Array(walkers * WALKER_BYTES));
  }

  const pv = new Float32Array(PV_FLOATS);
  // v: camera as in the pull renderer, plus c, eps, steps, burn, seed, spawn, maxRadius, decay, gain
  function frame(v, canvas) {
    pv.set([...v.pos, v.tanHalfFov, ...v.right, v.aperture, ...v.up, v.focus, ...v.fwd, v.near,
      w, h, v.frame, v.steps, 0, 0, 0, v.eps, v.hue, v.iridescence, v.spread, v.maxRadius,
      ...v.key, v.fog, v.burn, v.seed, v.spawn, capturing ? 1 : 0,
      ...[0, 1, 2, 3].map((i) => v.c[i] || 0), v.slab || 0, 0, 0, 0]);
    device.queue.writeBuffer(pvBuf, 0, pv);
    weight = weight * v.decay + 1;
    device.queue.writeBuffer(rvBuf, 0, new Float32Array([w, h, v.decay, 0]));
    // density gain: one unit when the frame's samples are spread evenly over the image
    const samplesPerFrame = walkers * v.steps;
    const gain = v.gain * (w * h) / samplesPerFrame;
    device.queue.writeBuffer(dispBuf, 0, new Float32Array([canvas.width, canvas.height, w, h, 1 / weight, gain, v.exposure, 0]));

    const enc = device.createCommandEncoder();
    const cp = enc.beginComputePass();
    // a driven formula walks in the drivers' variant (gpu/render.js variant), once it is compiled; a
    // collage in its own, and not at all until then
    const wp = walkFor();
    if (wp) {
      cp.setPipeline(wp);
      cp.setBindGroup(0, formulaGroup);
      cp.setBindGroup(1, walkGroup);
      cp.dispatchWorkgroups(Math.ceil(walkers / 64));
    }
    cp.setPipeline(resolvePipe);
    cp.setBindGroup(0, resolveGroup);
    cp.dispatchWorkgroups(Math.ceil((w * h) / 64));
    cp.end();
    const rp = enc.beginRenderPass({
      colorAttachments: [{ view: ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
    });
    rp.setPipeline(dispPipe);
    rp.setBindGroup(0, dispGroup);
    rp.draw(3);
    rp.end();
    device.queue.submit([enc.finish()]);
  }

  resetWalkers();
  return { resize, frame, resetWalkers, captureSplats, walkers, get size() { return [w, h]; } };
}

export { WALK, COLLAGE_WALK };
