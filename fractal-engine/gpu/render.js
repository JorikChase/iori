// Pull renderer. One compute pass marches one jittered sample per pixel through the distance field
// and blends it into a float accumulation texture (ping-pong); a display pass tonemaps it to the
// canvas. Formula changes rewrite two buffers; nothing recompiles.
//
// The field is read as a radiance field: the surface is where the density steps (de < pixel cone),
// near-misses emit (the glow), depth absorbs (the fog). One key light, soft shadows, AO, thin-lens DOF.

import { INTERP, DUAL, COLLAGE, withDrive, withCollage, collageRewrite } from './wgsl.js';
import { withJit, structureKey, jitIterate } from './jit.js';
import { canonical } from '../core/formula.js';
import { MAX_PIECES, isCollage } from '../core/collage.js';
import { pack, drives, shapes, packCollage, MAX_OPS, REC, HEAD_BYTES, OPS_FLOATS, CLOCK_WORD, STEP_WORD, COLLAGE_HEAD_BYTES, COLLAGE_OPS_FLOATS } from './pack.js';

const VIEW_FLOATS = 52;

export const MARCH = INTERP + DUAL + /* wgsl */ `
struct View {
  pos: vec4f,    // xyz camera, w tan(fov/2)
  right: vec4f,  // xyz, w aperture radius
  up: vec4f,     // xyz, w focus distance
  fwd: vec4f,    // xyz, w blend weight of this sample
  light: vec4f,  // xyz key lamp position (carried just off the camera), w glow strength
  look: vec4f,   // x hue, y fog density, z exposure (display), w terrace bands
  tune: vec4f,   // x step scale, y max distance, z epsilon scale, w frame
  key: vec4f,    // rgb key colour, w ambient
  res: vec4f,    // xy internal resolution, z max steps, w glow width
  extra: vec4f,  // x iridescence, y colour spread, z shadow softness, w quality (0 moving, 1 still)
  lamp: vec4f,   // x falloff range, y intensity, z Lyapunov channel mix, w unused
  lyap: vec4f,   // x centre of the λ colour scale, y 1/half-width
  tile: vec4f,   // a tile of a larger image: xy its offset, zw the whole image's size (0: no tile)
};

@group(1) @binding(0) var<uniform> view: View;
@group(1) @binding(1) var prevTex: texture_2d<f32>;
@group(1) @binding(2) var outTex: texture_storage_2d<rgba32float, write>;

fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
var<private> seed: u32;
fn rnd() -> f32 { seed = pcg(seed); return f32(seed) / 4294967296.0; }

fn normalAt(p: vec3f, e: f32) -> vec3f {
  let k = vec2f(1.0, -1.0);
  return normalize(k.xyy * de(p + k.xyy * e) + k.yyx * de(p + k.yyx * e)
                 + k.yxy * de(p + k.yxy * e) + k.xxx * de(p + k.xxx * e));
}

fn softShadow(ro: vec3f, rd: vec3f, tmin: f32, tmax: f32) -> f32 {
  var res = 1.0;
  var t = tmin;
  let k = view.extra.z;
  for (var i = 0; i < 48; i++) {
    let d = de(ro + rd * t) * view.tune.x * drvStep();
    res = min(res, k * d / t);
    t = t + clamp(d, tmin * 0.5, tmax * 0.1);
    if (res < 0.002 || t > tmax) { break; }
  }
  return clamp(res, 0.0, 1.0);
}

fn ambientOcclusion(p: vec3f, n: vec3f, s: f32, taps: i32) -> f32 {
  var occ = 0.0;
  var w = 1.0;
  for (var i = 1; i <= taps; i++) {
    let h = s * f32(i) * f32(i);
    occ = occ + w * max(h - de(p + n * h), 0.0) / h;
    w = w * 0.6;
  }
  return clamp(1.0 - occ * 0.45, 0.0, 1.0);
}

// one saturated key colour, pushed toward thin-film iridescence by the branch record
fn tint(col: f32, cosv: f32) -> vec3f {
  let base = view.key.rgb;
  let film = 0.5 + 0.5 * cos(6.2831853 * (vec3f(0.0, 0.33, 0.67) + col * view.extra.y + cosv * 0.35 + view.look.x));
  return mix(base, film * length(base), view.extra.x);
}

fn shade(ro: vec3f, rd: vec3f, pixelAngle: f32) -> vec3f {
  var t = 0.0;
  var glow = 0.0;
  var glowCol = 0.0;
  var hit = false;
  var tr: Trace;
  let maxSteps = i32(view.res.z);
  let unsafeScale = select(1.0, 0.3, (head.flags & FLAG_UNSAFE) != 0u);
  for (var i = 0; i < maxSteps; i++) {
    let p = ro + rd * t;
    let q4 = embed(p);
    tr = iterate(q4, cFor(q4));
    let d = deOf(tr) * view.tune.x * unsafeScale * drvStep();
    let eps = max(t * pixelAngle * view.tune.z, 1e-6);
    // near-misses emit: the glow is the field's density seen edge-on
    let g = exp(-d / max(view.res.w * (t + 0.05), 1e-6));
    glow = glow + g * 0.04;
    glowCol = mix(glowCol, tr.col, g * 0.1);
    if (d < eps) { hit = true; break; }
    t = t + d;
    if (t > view.tune.y) { break; }
  }
  let absorb = exp(-t * view.look.y);
  var c = vec3f(0.0);
  if (hit) {
    let p = ro + rd * t;
    let eps = max(t * pixelAngle * view.tune.z, 1e-6);
    // the normal is the gradient of the distance estimate, carried by dual numbers through one orbit
    // (four extra orbits by finite differences before); the same orbit yields the Lyapunov exponent
    let p4 = embed(p);
    let dd = iterateDual(p4, cFor(p4), (head.flags & FLAG_JULIA) == 0u);
    var n = deGrad(dd);
    let nl = length(n);
    if (nl > 0.0 && nl < 1e30) { n = n / nl; } else { n = normalAt(p, eps * 0.5); }
    let lam = dd.lyap;
    let toL = view.light.xyz - p;
    let dist = length(toL);
    let L = toL / max(dist, 1e-6);
    let fall = 1.0 / (1.0 + (dist * dist) / (view.lamp.x * view.lamp.x));
    let diff = max(dot(n, L), 0.0);
    // shadows and occlusion only once the camera is still; while moving the frame must stay cheap
    var sh = 1.0;
    var ao = 1.0;
    if (view.extra.w > 0.5) {
      sh = 0.0;
      if (diff > 0.0) { sh = softShadow(p + n * eps * 2.0, L, eps * 4.0, dist); }
      ao = ambientOcclusion(p, n, max(eps * 4.0, 0.002 * t + eps), 5);
    } else {
      // a stand-in close to the still frame's mean, so stopping does not flash
      ao = ambientOcclusion(p, n, max(eps * 4.0, 0.002 * t + eps), 2);
      sh = 0.3 * ao;
    }
    var alb = tint(tr.col, dot(n, -rd));
    if ((head.flags & FLAG_SHADE) != 0u) {
      // the formula's own colour graph, fed the orbit's readings at the hit
      var rr: Readings;
      rr.col = tr.col; rr.trap = tr.trap; rr.depth = f32(tr.n) / f32(max(head.iters, 1u)); rr.lyap = lam;
      rr.facing = dot(n, -rd); rr.species = tr.sp; rr.w = p4.w;
      alb = shadeRun(rr).color.rgb;
    }
    if (view.look.w > 0.0) {
      // terraces: quantised orbit-trap bands
      let band = fract(log2(max(tr.trap, 1e-12)) * view.look.w);
      alb = alb * (0.55 + 0.45 * step(0.5, band));
    }
    let rim = pow(1.0 - max(dot(n, -rd), 0.0), 4.0);
    var emit = vec3f(0.0);
    if (view.lamp.z > 0.0) {
      // Lyapunov channel: calm (orbits converge) cool and dark, chaotic (they separate) hot and glowing;
      // the scale is centred on this view's own median λ
      let x = clamp((lam - view.lyap.x) * view.lyap.y, -1.0, 1.0);
      let hot = view.key.rgb * 1.4 + vec3f(0.25, 0.2, 0.05);
      let heat = mix(vec3f(0.06, 0.08, 0.28), hot, 0.5 + 0.5 * x);
      alb = mix(alb, heat, view.lamp.z);
      emit = view.lamp.z * max(x, 0.0) * max(x, 0.0) * hot * 0.35;
    }
    c = alb * (diff * sh * fall * view.lamp.y + view.key.w * ao) + alb * rim * 0.15 * ao * fall + emit;
  }
  var glc = tint(glowCol, 0.0);
  if ((head.flags & FLAG_SHADE) != 0u) {
    // the glow: the graph's glow output (a colour tints, a number scales), else its surface colour
    var gr: Readings;
    gr.col = glowCol;
    let so = shadeRun(gr);
    if (so.hasGlow) { if (so.glowIsColour) { glc = so.glow.rgb; } else { glc = glc * so.glow.x; } } else { glc = so.color.rgb; }
    // the glow's strength (core/shade.js out.gain: 1 unless set or driven — the pulse)
    glc = glc * so.gain;
  }
  let gl = glc * glow * view.light.w;
  return c * absorb + gl * mix(1.0, absorb, 0.6);
}

@compute @workgroup_size(8, 8)
fn march(@builtin(global_invocation_id) gid: vec3u) {
  let res = vec2u(view.res.xy);
  if (gid.x >= res.x || gid.y >= res.y) { return; }
  // a tile is an off-axis window of the whole image: its pixels keep their place in the full frame
  let tiled = view.tile.z > 0.0;
  let full = select(vec2f(res), view.tile.zw, tiled);
  let at = vec2f(gid.xy) + select(vec2f(0.0), view.tile.xy, tiled);
  seed = pcg(u32(at.x) + pcg(u32(at.y) + pcg(u32(view.tune.w))));
  let aspect = full.x / full.y;
  let jitter = vec2f(rnd(), rnd());
  let uv = ((at + jitter) / full) * 2.0 - 1.0;
  let th = view.pos.w;
  let dir = normalize(view.fwd.xyz + view.right.xyz * uv.x * th * aspect - view.up.xyz * uv.y * th);
  // thin lens
  let a = rnd() * 6.2831853;
  let r = sqrt(rnd()) * view.right.w;
  let lens = (view.right.xyz * cos(a) + view.up.xyz * sin(a)) * r;
  let focal = view.pos.xyz + dir * (view.up.w / dot(dir, view.fwd.xyz));
  let ro = view.pos.xyz + lens;
  let rd = normalize(focal - ro);
  let pixelAngle = 2.0 * th / full.y;
  var c = shade(ro, rd, pixelAngle);
  if (!(c.x == c.x && c.y == c.y && c.z == c.z)) { c = vec3f(0.0); }
  c = min(c, vec3f(64.0));
  let prev = textureLoad(prevTex, vec2i(gid.xy), 0);
  let w = view.fwd.w;
  textureStore(outTex, vec2i(gid.xy), vec4f(mix(prev.rgb, c, w), 1.0));
}
`;

// The collage's march (core/collage.js; gpu/wgsl.js COLLAGE): the formula's helpers (the view, normals,
// shadows, occlusion, the tint) around a shade() of its own — the march steps by the collage's estimate,
// the hit takes its normal by differences of it (the duals do not cross the joins), every piece with a
// share runs its dual orbit once for λ, and the colour is the pieces' blended by the shares or the
// collage's own shade. The JIT does not know collages: the interpreter draws them.
const MARCH_VIEW = MARCH.slice(MARCH.indexOf('struct View'), MARCH.indexOf('fn shade(ro: vec3f'));
const MARCH_ENTRY = MARCH.slice(MARCH.indexOf('@compute @workgroup_size(8, 8)\nfn march'));
const COLLAGE_SHADE = /* wgsl */ `
fn clFallback(i: u32, col: f32, facing: f32) -> vec4f { return vec4f(tint(col, facing), 1.0); }

fn shade(ro: vec3f, rd: vec3f, pixelAngle: f32) -> vec3f {
  var t = 0.0;
  var glow = 0.0;
  var glowCol = 0.0;
  var hit = false;
  let maxSteps = i32(view.res.z);
  let k = clStep();
  for (var i = 0; i < maxSteps; i++) {
    let at = collageAt(ro + rd * t);
    let d = at.d * view.tune.x * k;
    let eps = max(t * pixelAngle * view.tune.z, 1e-6);
    let g = exp(-d / max(view.res.w * (t + 0.05), 1e-6));
    glow = glow + g * 0.04;
    glowCol = mix(glowCol, at.col, g * 0.1);
    if (d < eps) { hit = true; break; }
    t = t + d;
    if (t > view.tune.y) { break; }
  }
  let absorb = exp(-t * view.look.y);
  var c = vec3f(0.0);
  if (hit) {
    let p = ro + rd * t;
    let eps = max(t * pixelAngle * view.tune.z, 1e-6);
    let n = normalAt(p, eps * 0.5);
    // the pieces' orbits at the hit (the normal's taps moved them), then λ where a piece has a share
    let at = collageAt(p);
    var lams: array<f32, ${MAX_PIECES}>;
    var lam = 0.0;
    for (var i = 0u; i < at.n; i++) {
      if (!(at.w[i] > 1e-3)) { continue; }
      clSelect(i);
      let q = clQ[i];
      let dd = iterateDual(q, cFor(q), (heads[hp].flags & FLAG_JULIA) == 0u);
      lams[i] = dd.lyap;
      lam = lam + at.w[i] * dd.lyap;
    }
    clSelect(0u);
    let toL = view.light.xyz - p;
    let dist = length(toL);
    let L = toL / max(dist, 1e-6);
    let fall = 1.0 / (1.0 + (dist * dist) / (view.lamp.x * view.lamp.x));
    let diff = max(dot(n, L), 0.0);
    var sh = 1.0;
    var ao = 1.0;
    if (view.extra.w > 0.5) {
      sh = 0.0;
      if (diff > 0.0) { sh = softShadow(p + n * eps * 2.0, L, eps * 4.0, dist); }
      ao = ambientOcclusion(p, n, max(eps * 4.0, 0.002 * t + eps), 5);
    } else {
      ao = ambientOcclusion(p, n, max(eps * 4.0, 0.002 * t + eps), 2);
      sh = 0.3 * ao;
    }
    var alb = collageColour(p, at, dot(n, -rd), lams).rgb;
    if (view.look.w > 0.0) {
      let band = fract(log2(max(clTr[at.lead].trap, 1e-12)) * view.look.w);
      alb = alb * (0.55 + 0.45 * step(0.5, band));
    }
    let rim = pow(1.0 - max(dot(n, -rd), 0.0), 4.0);
    var emit = vec3f(0.0);
    if (view.lamp.z > 0.0) {
      let x = clamp((lam - view.lyap.x) * view.lyap.y, -1.0, 1.0);
      let hot = view.key.rgb * 1.4 + vec3f(0.25, 0.2, 0.05);
      let heat = mix(vec3f(0.06, 0.08, 0.28), hot, 0.5 + 0.5 * x);
      alb = mix(alb, heat, view.lamp.z);
      emit = view.lamp.z * max(x, 0.0) * max(x, 0.0) * hot * 0.35;
    }
    c = alb * (diff * sh * fall * view.lamp.y + view.key.w * ao) + alb * rim * 0.15 * ao * fall + emit;
  }
  var glc = tint(glowCol, 0.0);
  if (ops[CL_BASE].y > 0.5) {
    // the collage's own shade colours the glow as a formula's does (its drivers read where the ray ended)
    clShadeDrive(ro + rd * t);
    clSelect(CL_OWN);
    var gr: Readings;
    gr.col = glowCol;
    let so = shadeRun(gr);
    clSelect(0u);
    if (so.hasGlow) { if (so.glowIsColour) { glc = so.glow.rgb; } else { glc = glc * so.glow.x; } } else { glc = so.color.rgb; }
    glc = glc * so.gain;
  }
  let gl = glc * glow * view.light.w;
  return c * absorb + gl * mix(1.0, absorb, 0.6);
}
`;
export const COLLAGE_MARCH = withCollage(INTERP + DUAL) + COLLAGE + MARCH_VIEW + COLLAGE_SHADE + MARCH_ENTRY;

// The collage's march with every piece's structure JIT (gpu/jit.js): piece i's orbit is iterateP<i>, read
// from its own head and region as the interpreter reads it, and collageAt's one call site of iterate
// dispatches on the piece. Its key is the pieces' structures: values (placements, joins, parameters) stay
// in the buffer.
const PIECE_CALL = 'let t = iterate(q, cFor(q));';
export function collageJit(source, collage) {
  if (!source.includes(PIECE_CALL)) throw new Error('no piece orbit to replace');
  const fns = collage.pieces.map((q, i) => collageRewrite(jitIterate(q.f, 'structure')).replace('fn iterate(p0: vec4f, c: vec4f) -> Trace {', `fn iterateP${i}(p0: vec4f, c: vec4f) -> Trace {`));
  return source.replace(PIECE_CALL, 'let t = iteratePiece(i, q, cFor(q));') + fns.join('') + `
fn iteratePiece(i: u32, p0: vec4f, c: vec4f) -> Trace {
  switch i {
${collage.pieces.map((_, i) => `    case ${i}u: { return iterateP${i}(p0, c); }`).join('\n')}
    default: { return iterate(p0, c); }
  }
}
`;
}
const collageJitKey = (c) => JSON.stringify(c.pieces.map((q) => structureKey(q.f)));

// the step factor's measurement for a driven collage: at world points (on or near its surface),
// |∇D| and |∇D| with the drive held there (gpu/wgsl.js clSteep)
export const COLLAGE_STEP = withCollage(INTERP) + COLLAGE + /* wgsl */ `
fn clFallback(i: u32, col: f32, facing: f32) -> vec4f { return vec4f(1.0); }
struct CS { n: vec4u, h: vec4f };
@group(1) @binding(0) var<uniform> cs: CS;
@group(1) @binding(1) var<storage, read> cpts: array<vec4f>;
@group(1) @binding(2) var<storage, read_write> cout: array<vec4f>;
@compute @workgroup_size(64)
fn steep(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= cs.n.x) { return; }
  let p = cpts[i].xyz;
  cout[i] = vec4f(clSteep(p, cs.h.x * max(1.0, length(p))), de(p), 0.0);
}`;

// The atlas lens: for two parameters, every pixel of the map is one parameter pair, coloured by how
// many on-screen pixels the surface would be from the held point under it — the held point's own
// "Mandelbrot set" (the Mandelbrot set is this map for the Julia family at z = 0). The span is set by
// the metric, so the map covers exactly what a drag across the screen would reach.
export const LENS = INTERP + /* wgsl */ `
struct LV {
  x: vec4f,      // xyz the held point, w world size of one CSS pixel at its depth
  span: vec4f,   // x first parameter across the width, y second across the height, z w, w h (texels)
  ov: vec4u,     // x op of the first parameter, y op of the second, z how many (1 or 2)
  key: vec4f,    // rgb key colour
};
@group(1) @binding(0) var<uniform> lv: LV;
@group(1) @binding(1) var<storage, read> drecs: array<vec4f, 10>;
@group(1) @binding(2) var lensOut: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8)
fn lensMap(@builtin(global_invocation_id) gid: vec3u) {
  if (f32(gid.x) >= lv.span.z || f32(gid.y) >= lv.span.w) { return; }
  ov0 = lv.ov.x;
  ov1 = select(0xffffffffu, lv.ov.y, lv.ov.z > 1u);
  for (var k = 0u; k < 5u; k++) { ovRec0[k] = drecs[k]; ovRec1[k] = drecs[5u + k]; }
  let u = (f32(gid.x) + 0.5) / lv.span.z - 0.5;
  let v = 0.5 - (f32(gid.y) + 0.5) / lv.span.w;
  ovD = vec2f(u * lv.span.x, v * lv.span.y);
  let x = embed(lv.x.xyz);
  let t = iterate(x, cFor(x));
  var px = deOf(t) / lv.x.w;
  if ((head.flags & FLAG_POWER) != 0u && !t.escaped) { px = 0.0; }
  // on the surface: the key colour; away from it: dark, with a hairline at every doubling of distance
  let near = exp(-px / 3.0);
  let band = fract(log2(1.0 + px));
  let line = 1.0 - smoothstep(0.0, 0.05, min(band, 1.0 - band));
  let col = lv.key.rgb * (0.04 + 1.2 * near) + vec3f(line * 0.16 * (1.0 - near));
  textureStore(lensOut, vec2i(gid.xy), vec4f(col, 1.0));
}
`;

const DISPLAY = /* wgsl */ `
struct Disp { size: vec4f, look: vec4f, inset: vec4f };  // look: x exposure, y lens on; inset: cx cy r (px)
@group(0) @binding(0) var<uniform> disp: Disp;
@group(0) @binding(1) var accum: texture_2d<f32>;
@group(0) @binding(2) var lensTex: texture_2d<f32>;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}

fn aces(x: vec3f) -> vec3f {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), vec3f(0.0), vec3f(1.0));
}
fn toSrgb(c: vec3f) -> vec3f {
  return select(1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055, c * 12.92, c <= vec3f(0.0031308));
}

@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  // lens open: the map fills the view and the field shrinks into the inset circle
  var at = fc.xy;
  if (disp.look.y > 0.5) {
    let d = fc.xy - disp.inset.xy;
    if (length(d) > disp.inset.z) {
      let lsz = vec2f(textureDimensions(lensTex));
      let lq = vec2i(clamp(fc.xy / disp.size.xy * lsz, vec2f(0.0), lsz - 1.0));
      var o = toSrgb(clamp(textureLoad(lensTex, lq, 0).rgb, vec3f(0.0), vec3f(1.0)));
      let n = fract(sin(dot(fc.xy, vec2f(12.9898, 78.233))) * 43758.5453);
      return vec4f(o + (n - 0.5) / 255.0, 1.0);
    }
    at = disp.size.xy * 0.5 + d / disp.inset.z * min(disp.size.x, disp.size.y) * 0.5;
  }
  // bilinear from the internal resolution to the canvas
  let src = disp.size.zw;
  let q = at / disp.size.xy * src - 0.5;
  let i0 = vec2i(floor(q));
  let f = fract(q);
  let mx = vec2i(src) - 1;
  let a = textureLoad(accum, clamp(i0, vec2i(0), mx), 0).rgb;
  let b = textureLoad(accum, clamp(i0 + vec2i(1, 0), vec2i(0), mx), 0).rgb;
  let c = textureLoad(accum, clamp(i0 + vec2i(0, 1), vec2i(0), mx), 0).rgb;
  let d = textureLoad(accum, clamp(i0 + vec2i(1, 1), vec2i(0), mx), 0).rgb;
  let col = mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  var o = toSrgb(aces(col * disp.look.x));
  // dither to hide banding in the dark
  let n = fract(sin(dot(fc.xy, vec2f(12.9898, 78.233))) * 43758.5453);
  o = o + (n - 0.5) / 255.0;
  return vec4f(o, 1.0);
}
`;

export async function createRenderer(canvas) {
  if (!navigator.gpu) throw new Error('no-webgpu');
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('no-adapter');
  // timestamps, when the adapter has them, for the benchmark rig (test/run-bench.mjs); off unless asked
  const device = await adapter.requestDevice({ requiredFeatures: adapter.features.has('timestamp-query') ? ['timestamp-query'] : [] });
  const ctx = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: 'opaque' });

  // sized for a collage (a head and an ops region per piece, gpu/pack.js packCollage); a formula uses the first
  const headBuf = device.createBuffer({ size: COLLAGE_HEAD_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const opsBuf = device.createBuffer({ size: COLLAGE_OPS_FLOATS * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  const viewBuf = device.createBuffer({ size: VIEW_FLOATS * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const dispBuf = device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

  const formulaLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
    ],
  });
  const viewLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'unfilterable-float' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba32float' } },
    ],
  });
  const dispLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
    ],
  });

  const marchModule = device.createShaderModule({ code: MARCH });
  const info = await marchModule.getCompilationInfo();
  const errs = info.messages.filter((m) => m.type === 'error');
  if (errs.length) throw new Error('wgsl: ' + errs.map((m) => `${m.lineNum}:${m.linePos} ${m.message}`).join('\n'));

  const marchPipe = device.createComputePipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [formulaLayout, viewLayout] }),
    compute: { module: marchModule, entryPoint: 'march' },
  });
  const dispModule = device.createShaderModule({ code: DISPLAY });
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

  // The drivers' variants (gpu/wgsl.js withDrive): every pipeline that runs the orbit has one, compiled
  // in the background the first time a driven formula needs it (a few seconds; the undriven shaders
  // stay the size they were). Until it is ready a driven formula draws with its own values.
  // variant(key, code, layouts, entryPoint) → the pipeline, or null while it builds; .ready(key) awaits.
  const variants = new Map();
  function variantEntry(key, code, layouts, entryPoint) {
    let v = variants.get(key);
    if (!v) {
      v = { pipe: null, building: null };
      variants.set(key, v);
      v.building = (async () => {
        const module = device.createShaderModule({ code: typeof code === 'function' ? code() : code });
        const errs = (await module.getCompilationInfo()).messages.filter((m) => m.type === 'error');
        if (errs.length) throw new Error(`wgsl ${key}: ` + errs.map((m) => `${m.lineNum}:${m.linePos} ${m.message}`).join('\n'));
        v.pipe = await device.createComputePipelineAsync({ layout: device.createPipelineLayout({ bindGroupLayouts: layouts }), compute: { module, entryPoint } });
      })().catch((e) => { console.warn(e.message); variants.delete(key); });
    }
    return v;
  }
  const variant = (...a) => variantEntry(...a).pipe;
  variant.ready = async (...a) => { const v = variantEntry(...a); await v.building; return v.pipe; };
  const driveMarch = () => [`march`, withDrive(MARCH), [formulaLayout, viewLayout], 'march'];
  // a collage's march, in the drivers' variant when a piece's own drive program runs
  const collageMarch = (pk) => [pk.drives ? 'cmarch+drive' : 'cmarch', pk.drives ? withDrive(COLLAGE_MARCH) : COLLAGE_MARCH, [formulaLayout, viewLayout], 'march'];
  // and with its pieces' JITs (built in the background; the interpreter's march draws until then)
  const collageJitMarch = (pk) => {
    const key = `cjit${pk.drives ? '+drive' : ''}:${pk.jitKey || (pk.jitKey = collageJitKey(pk.collage))}`;
    return [key, () => collageJit(pk.drives ? withDrive(COLLAGE_MARCH) : COLLAGE_MARCH, pk.collage), [formulaLayout, viewLayout], 'march'];
  };
  const collagePipe = (pk) => variant(...collageJitMarch(pk)) || variant(...collageMarch(pk));

  // the lens map: computed once when the lens opens, then composited every frame while it is open
  const lensLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba16float' } },
    ],
  });
  const lensModule = device.createShaderModule({ code: LENS });
  const lensErrs = (await lensModule.getCompilationInfo()).messages.filter((m) => m.type === 'error');
  if (lensErrs.length) throw new Error('wgsl lens: ' + lensErrs.map((m) => `${m.lineNum}:${m.linePos} ${m.message}`).join('\n'));
  const lensPipe = device.createComputePipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [formulaLayout, lensLayout] }),
    compute: { module: lensModule, entryPoint: 'lensMap' },
  });
  const lvBuf = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const drecBuf = device.createBuffer({ size: 160, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  const mkLensTex = (lw, lh) => device.createTexture({
    size: [lw, lh], format: 'rgba16float', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
  });
  let lensTex = mkLensTex(1, 1);
  const lensState = { on: false, inset: [0, 0, 0] };

  let tex = [], viewGroups = [], dispGroups = [], w = 0, h = 0, cur = 0;

  function resize(iw, ih) {
    iw = Math.max(8, iw | 0); ih = Math.max(8, ih | 0);
    if (iw === w && ih === h) return false;
    w = iw; h = ih;
    tex.forEach((t) => t.destroy());
    tex = [0, 1].map(() => device.createTexture({
      size: [w, h], format: 'rgba32float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC,
    }));
    viewGroups = [0, 1].map((i) => device.createBindGroup({
      layout: viewLayout,
      entries: [
        { binding: 0, resource: { buffer: viewBuf } },
        { binding: 1, resource: tex[i].createView() },
        { binding: 2, resource: tex[1 - i].createView() },
      ],
    }));
    makeDispGroups();
    cur = 0;
    return true;
  }

  function makeDispGroups() {
    if (!tex.length) return;
    dispGroups = [0, 1].map((i) => device.createBindGroup({
      layout: dispLayout,
      entries: [
        { binding: 0, resource: { buffer: dispBuf } }, { binding: 1, resource: tex[i].createView() },
        { binding: 2, resource: lensTex.createView() },
      ],
    }));
  }

  // L: { x (held point), foot (world size of a CSS px there), spans [s1, s2?], ops [oi0, oi1?],
  //      drecs [Float64Array(20), …] (one per parameter), size [lw, lh], key }
  function lens(L) {
    if (lensTex.width !== L.size[0] || lensTex.height !== L.size[1]) { lensTex.destroy(); lensTex = mkLensTex(...L.size); makeDispGroups(); }
    const lvd = new ArrayBuffer(64), f = new Float32Array(lvd), u = new Uint32Array(lvd);
    f.set([...L.x, L.foot, L.spans[0], L.spans[1] || 0, L.size[0], L.size[1]]);
    u[8] = L.ops[0]; u[9] = L.ops[1] ?? 0xffffffff; u[10] = L.drecs.length;
    f.set([...L.key, 0], 12);
    device.queue.writeBuffer(lvBuf, 0, lvd);
    const d = new Float32Array(40);
    L.drecs.forEach((r, i) => d.set(r, i * 20));
    device.queue.writeBuffer(drecBuf, 0, d);
    const group = device.createBindGroup({
      layout: lensLayout,
      entries: [{ binding: 0, resource: { buffer: lvBuf } }, { binding: 1, resource: { buffer: drecBuf } }, { binding: 2, resource: lensTex.createView() }],
    });
    const enc = device.createCommandEncoder();
    const cp = enc.beginComputePass();
    cp.setPipeline((packed && drives(packed.formula) && variant('lens', withDrive(LENS), [formulaLayout, lensLayout], 'lensMap')) || lensPipe);
    cp.setBindGroup(0, formulaGroup);
    cp.setBindGroup(1, group);
    cp.dispatchWorkgroups(Math.ceil(L.size[0] / 8), Math.ceil(L.size[1] / 8));
    cp.end();
    device.queue.submit([enc.finish()]);
  }
  function setLens(on, inset = [0, 0, 0]) { lensState.on = on; lensState.inset = inset; }

  let packed = null;
  // the drivers' clock (seconds) and the step factor 1 / L live in the head (every head of a collage),
  // kept across formulas
  const drive = { clock: 0, step: 1 };
  function driveWords(head) {
    for (let o = 0; o < head.byteLength; o += HEAD_BYTES) { const fl = new Float32Array(head, o, HEAD_BYTES / 4); fl[CLOCK_WORD] = drive.clock; fl[STEP_WORD] = drive.step; }
  }
  function setDriveWords() {
    if (!packed) return;
    driveWords(packed.head);
    for (let o = 0; o < packed.head.byteLength; o += HEAD_BYTES) device.queue.writeBuffer(headBuf, o + CLOCK_WORD * 4, new Float32Array([drive.clock, drive.step]));
  }
  // t: seconds (the app's clock, or a video frame's time)
  function setClock(t) { if (drive.clock === t) return; drive.clock = t; setDriveWords(); }
  // L ≥ 1: the drivers' steepness the sensing pass measured (gpu/sense.js step)
  function setStep(L) { const s = 1 / Math.max(1, L || 1); if (drive.step === s) return; drive.step = s; setDriveWords(); }
  function setFormula(f) {
    packed = pack(f);
    driveWords(packed.head);
    if (drives(packed.formula)) variant(...driveMarch());
    // a new structure gets its JIT in the background; the interpreter draws until it is ready
    compileStructureJit(packed.formula).catch((e) => console.warn(e.message));
    device.queue.writeBuffer(headBuf, 0, packed.head);
    device.queue.writeBuffer(opsBuf, 0, packed.ops);
  }
  // a collage (core/collage.js) in place of the formula: packed.collage is set and packed.formula null
  // until the next setFormula. Its march compiles in the background; until then nothing is drawn.
  function setCollage(c) {
    packed = { ...packCollage(c), formula: null };
    driveWords(packed.head);
    variant(...collageMarch(packed));
    // one collage JIT kept: the last structure's goes when another starts building
    const jit = collageJitMarch(packed);
    for (const k of variants.keys()) if (k.startsWith('cjit') && k !== jit[0]) variants.delete(k);
    variant(...jit);
    device.queue.writeBuffer(headBuf, 0, packed.head);
    device.queue.writeBuffer(opsBuf, 0, packed.ops);
  }
  const collageReady = async () => (packed && packed.collage ? variant.ready(...collageMarch(packed)) : null);
  const collageJitReady = async () => (packed && packed.collage ? variant.ready(...collageJitMarch(packed)) : null);

  const viewData = new Float32Array(VIEW_FLOATS);
  // v: { pos, right, up, fwd, tanHalfFov, aperture, focus, blend, light, glow, hue, fog, exposure,
  //      terrace, stepScale, maxDist, epsScale, frame, key, ambient, maxSteps, glowWidth,
  //      iridescence, spread, shadowK }
  const packView = (out, v, vw, vh) => out.set([...v.pos, v.tanHalfFov, ...v.right, v.aperture, ...v.up, v.focus, ...v.fwd, v.blend,
    ...v.light, v.glow, v.hue, v.fog, v.exposure, v.terrace, v.stepScale, v.maxDist, v.epsScale, v.frame,
    ...v.key, v.ambient, vw, vh, v.maxSteps, v.glowWidth, v.iridescence, v.spread, v.shadowK, v.quality, v.lampRange, v.lampPower, v.lyapMix || 0, 0,
    v.lyapCentre || 0, v.lyapScale || 1, 0, 0, ...(v.tile || [0, 0, 0, 0])]);

  // The JIT (gpu/jit.js), two caches built in the background:
  //   literal    compiled for one set of values — still frames and stills of that exact formula
  //   structure  compiled for one structure, values from the buffer — everything else: live editing,
  //              drift, walks, every frame of a video; rebuilt only when the ops, schedule or
  //              iteration count change
  // Until one is ready the interpreter draws, so nothing ever waits for a compile.
  const jits = { literal: { pipe: null, key: null, building: null }, structure: { pipe: null, key: null, building: null } };
  async function buildJit(f, kind) {
    const J = jits[kind];
    const key = kind === 'literal' ? canonical(f) : structureKey(f);
    if (J.key === key || J.building === key) return J.key === key;
    J.building = key;
    try {
      const module = device.createShaderModule({ code: withJit(drives(f) ? withDrive(MARCH) : MARCH, f, kind) });
      const errs = (await module.getCompilationInfo()).messages.filter((m) => m.type === 'error');
      if (errs.length) throw new Error('wgsl jit: ' + errs.map((m) => `${m.lineNum}:${m.linePos} ${m.message}`).join('\n'));
      const pipe = await device.createComputePipelineAsync({
        layout: device.createPipelineLayout({ bindGroupLayouts: [formulaLayout, viewLayout] }),
        compute: { module, entryPoint: 'march' },
      });
      if (J.building !== key) return false;  // the formula moved on while it compiled
      J.pipe = pipe; J.key = key;
      return true;
    } finally { if (J.building === key) J.building = null; }
  }
  const compileJit = (f) => buildJit(f, 'literal');
  const compileStructureJit = (f) => buildJit(f, 'structure');
  // the fastest pipeline that is valid for f: literal (when allowed) → structure → interpreter
  function pipeFor(f, allowLiteral) {
    if (f && allowLiteral && jits.literal.pipe && jits.literal.key === canonical(f)) return jits.literal.pipe;
    if (f && jits.structure.pipe && jits.structure.key === structureKey(f)) return jits.structure.pipe;
    if (f && drives(f)) return variant(...driveMarch()) || marchPipe;
    return marchPipe;
  }
  const jitFor = (f) => (f && jits.literal.pipe && jits.literal.key === canonical(f) ? jits.literal.pipe : null);

  function frame(v) {
    packView(viewData, v, w, h);
    device.queue.writeBuffer(viewBuf, 0, viewData);
    lastExposure = v.exposure;

    const pipe = packed && packed.collage ? collagePipe(packed) : pipeFor(packed && packed.formula, v.quality > 0);
    if (!pipe) { present(); return; }
    const enc = device.createCommandEncoder();
    const cp = enc.beginComputePass(timing.on ? { timestampWrites: { querySet: timing.set, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } } : undefined);
    cp.setPipeline(pipe);
    cp.setBindGroup(0, formulaGroup);
    cp.setBindGroup(1, viewGroups[cur]);
    cp.dispatchWorkgroups(Math.ceil(w / 8), Math.ceil(h / 8));
    cp.end();
    if (timing.on) { enc.resolveQuerySet(timing.set, 0, 2, timing.buf, 0); enc.copyBufferToBuffer(timing.buf, 0, timing.read, 0, 16); }
    cur = 1 - cur;
    present(enc);
  }

  // The benchmark rig's instruments (test/run-bench.mjs): the march pass's GPU time from timestamps,
  // and the accumulation read back as floats. Nothing here runs unless the rig turns it on.
  const timing = { on: false, set: null, buf: null, read: null };
  function setTiming(on) {
    if (on && !device.features.has('timestamp-query')) return false;
    if (on && !timing.set) {
      timing.set = device.createQuerySet({ type: 'timestamp', count: 2 });
      timing.buf = device.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
      timing.read = device.createBuffer({ size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    }
    timing.on = on;
    return true;
  }
  // ms of the last frame's march (call after the frame's work is done)
  async function marchMs() {
    if (!timing.on) return null;
    await timing.read.mapAsync(GPUMapMode.READ);
    const t = new BigUint64Array(timing.read.getMappedRange().slice(0));
    timing.read.unmap();
    return Number(t[1] - t[0]) / 1e6;
  }
  async function readAccum() {
    if (!tex.length) return null;
    const bpr = Math.ceil((w * 16) / 256) * 256;
    const rb = device.createBuffer({ size: bpr * h, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const enc = device.createCommandEncoder();
    enc.copyTextureToBuffer({ texture: tex[cur] }, { buffer: rb, bytesPerRow: bpr }, [w, h]);
    device.queue.submit([enc.finish()]);
    await rb.mapAsync(GPUMapMode.READ);
    const src = new Float32Array(rb.getMappedRange()), out = new Float32Array(w * h * 4), row = bpr / 4;
    for (let y = 0; y < h; y++) out.set(src.subarray(y * row, y * row + w * 4), y * w * 4);
    rb.unmap(); rb.destroy();
    return { w, h, data: out };
  }

  let lastExposure = 1;
  function present(enc = device.createCommandEncoder()) {
    device.queue.writeBuffer(dispBuf, 0, new Float32Array([canvas.width, canvas.height, w, h,
      lastExposure, lensState.on ? 1 : 0, 0, 0, ...lensState.inset, 0]));
    const rp = enc.beginRenderPass({
      colorAttachments: [{ view: ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
    });
    rp.setPipeline(dispPipe);
    rp.setBindGroup(0, dispGroups[cur]);
    rp.draw(3);
    rp.end();
    device.queue.submit([enc.finish()]);
  }

  // A thumbnail of another formula (or collage): its own small accumulation, the shared formula buffers borrowed
  // for the length of one synchronous submission and given back before anything else can run, then a
  // readback. Returns a data URL. v is a frame view (see frame()); the view is rendered as a moving
  // frame (no shadows) for speed.
  const thumbViewBuf = device.createBuffer({ size: VIEW_FLOATS * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const thumbDispBuf = device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  async function renderThumb(f, v, tw, th, samples = 8) {
    // a collage draws in its own march (compiled once per drive-ness, shared with the live view)
    const tp = isCollage(f) ? packCollage(f) : pack(f);
    const thumbPipe = tp.collage ? await variant.ready(...collageMarch(tp)) : drives(tp.formula) ? (await variant.ready(...driveMarch())) || marchPipe : marchPipe;
    if (!thumbPipe) return null;
    const ttex = [0, 1].map(() => device.createTexture({ size: [tw, th], format: 'rgba32float', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING }));
    const groups = [0, 1].map((i) => device.createBindGroup({
      layout: viewLayout,
      entries: [{ binding: 0, resource: { buffer: thumbViewBuf } }, { binding: 1, resource: ttex[i].createView() }, { binding: 2, resource: ttex[1 - i].createView() }],
    }));
    const out = device.createTexture({ size: [tw, th], format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    const bpr = Math.ceil((tw * 4) / 256) * 256;
    const rb = device.createBuffer({ size: bpr * th, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(headBuf, 0, tp.head);
    device.queue.writeBuffer(opsBuf, 0, tp.ops);
    const vd = new Float32Array(VIEW_FLOATS);
    let c = 0;
    for (let i = 0; i < samples; i++) {
      packView(vd, { ...v, blend: 1 / (i + 1), frame: 9973 + i, quality: 0 }, tw, th);
      device.queue.writeBuffer(thumbViewBuf, 0, vd);
      const enc = device.createCommandEncoder();
      const cp = enc.beginComputePass();
      cp.setPipeline(thumbPipe);
      cp.setBindGroup(0, formulaGroup);
      cp.setBindGroup(1, groups[c]);
      cp.dispatchWorkgroups(Math.ceil(tw / 8), Math.ceil(th / 8));
      cp.end();
      device.queue.submit([enc.finish()]);
      c = 1 - c;
    }
    device.queue.writeBuffer(thumbDispBuf, 0, new Float32Array([tw, th, tw, th, v.exposure, 0, 0, 0, 0, 0, 0, 0]));
    const dg = device.createBindGroup({
      layout: dispLayout,
      entries: [{ binding: 0, resource: { buffer: thumbDispBuf } }, { binding: 1, resource: ttex[c].createView() }, { binding: 2, resource: lensTex.createView() }],
    });
    const enc = device.createCommandEncoder();
    const rp = enc.beginRenderPass({ colorAttachments: [{ view: out.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
    rp.setPipeline(dispPipe);
    rp.setBindGroup(0, dg);
    rp.draw(3);
    rp.end();
    enc.copyTextureToBuffer({ texture: out }, { buffer: rb, bytesPerRow: bpr }, [tw, th]);
    device.queue.submit([enc.finish()]);
    // give the formula buffers back
    if (packed) { device.queue.writeBuffer(headBuf, 0, packed.head); device.queue.writeBuffer(opsBuf, 0, packed.ops); }
    await rb.mapAsync(GPUMapMode.READ);
    const src = new Uint8Array(rb.getMappedRange());
    const img = new ImageData(tw, th);
    const bgra = format.startsWith('bgra');
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
      const i = y * bpr + x * 4, o = (y * tw + x) * 4;
      img.data[o] = src[i + (bgra ? 2 : 0)]; img.data[o + 1] = src[i + 1]; img.data[o + 2] = src[i + (bgra ? 0 : 2)]; img.data[o + 3] = 255;
    }
    rb.unmap();
    [rb, out, ...ttex].forEach((t) => t.destroy());
    const cv = document.createElement('canvas');
    cv.width = tw; cv.height = th;
    cv.getContext('2d').putImageData(img, 0, 0);
    return cv.toDataURL('image/jpeg', 0.8);
  }

  // A still of any size, in off-axis tiles so no buffer is ever larger than a tile: each tile
  // accumulates its samples (with the JIT when it is ready), is tonemapped and read back, and lands in
  // its place in an OffscreenCanvas. The queue is drained after every few samples so the page stays
  // responsive and nothing piles up. onProgress(fraction); returns the canvas.
  async function renderStill(v, W, H, { tile = 512, samples = 64, onProgress = () => {}, cancelled = () => false } = {}) {
    const outCanvas = new OffscreenCanvas(W, H);
    const g2 = outCanvas.getContext('2d');
    if (packed && drives(packed.formula)) await variant.ready(...driveMarch());
    const pipe = packed && packed.collage ? collagePipe(packed) || await collageReady() : pipeFor(packed && packed.formula, true);
    if (!pipe) throw new Error('the collage march did not compile');
    const vb = device.createBuffer({ size: VIEW_FLOATS * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const db = device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const vd = new Float32Array(VIEW_FLOATS);
    const tiles = [];
    for (let y = 0; y < H; y += tile) for (let x = 0; x < W; x += tile) tiles.push([x, y, Math.min(tile, W - x), Math.min(tile, H - y)]);
    let done = 0;
    for (const [ox, oy, tw, th] of tiles) {
      if (cancelled()) break;
      const tt = [0, 1].map(() => device.createTexture({ size: [tw, th], format: 'rgba32float', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING }));
      const groups = [0, 1].map((i) => device.createBindGroup({
        layout: viewLayout,
        entries: [{ binding: 0, resource: { buffer: vb } }, { binding: 1, resource: tt[i].createView() }, { binding: 2, resource: tt[1 - i].createView() }],
      }));
      let c = 0;
      for (let s = 0; s < samples; s++) {
        packView(vd, { ...v, blend: 1 / (s + 1), frame: 7919 + s * 131, quality: 1, tile: [ox, oy, W, H] }, tw, th);
        device.queue.writeBuffer(vb, 0, vd);
        const enc = device.createCommandEncoder();
        const cp = enc.beginComputePass();
        cp.setPipeline(pipe);
        cp.setBindGroup(0, formulaGroup);
        cp.setBindGroup(1, groups[c]);
        cp.dispatchWorkgroups(Math.ceil(tw / 8), Math.ceil(th / 8));
        cp.end();
        device.queue.submit([enc.finish()]);
        c = 1 - c;
        if (s % 4 === 3) await device.queue.onSubmittedWorkDone();
      }
      const out = device.createTexture({ size: [tw, th], format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
      const bpr = Math.ceil((tw * 4) / 256) * 256;
      const rb = device.createBuffer({ size: bpr * th, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
      device.queue.writeBuffer(db, 0, new Float32Array([tw, th, tw, th, v.exposure, 0, 0, 0, 0, 0, 0, 0]));
      const dg = device.createBindGroup({
        layout: dispLayout,
        entries: [{ binding: 0, resource: { buffer: db } }, { binding: 1, resource: tt[c].createView() }, { binding: 2, resource: lensTex.createView() }],
      });
      const enc = device.createCommandEncoder();
      const rp = enc.beginRenderPass({ colorAttachments: [{ view: out.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
      rp.setPipeline(dispPipe);
      rp.setBindGroup(0, dg);
      rp.draw(3);
      rp.end();
      enc.copyTextureToBuffer({ texture: out }, { buffer: rb, bytesPerRow: bpr }, [tw, th]);
      device.queue.submit([enc.finish()]);
      await rb.mapAsync(GPUMapMode.READ);
      const src = new Uint8Array(rb.getMappedRange());
      const img = new ImageData(tw, th);
      const bgra = format.startsWith('bgra');
      for (let yy = 0; yy < th; yy++) for (let xx = 0; xx < tw; xx++) {
        const i = yy * bpr + xx * 4, o = (yy * tw + xx) * 4;
        img.data[o] = src[i + (bgra ? 2 : 0)]; img.data[o + 1] = src[i + 1]; img.data[o + 2] = src[i + (bgra ? 0 : 2)]; img.data[o + 3] = 255;
      }
      rb.unmap();
      g2.putImageData(img, ox, oy);
      [rb, out, ...tt].forEach((t) => t.destroy());
      done++;
      onProgress(done / tiles.length);
    }
    vb.destroy(); db.destroy();
    return outCanvas;
  }

  // The distance estimate on an n³ grid over [lo, hi] (the mesh export), in slabs so no buffer is huge.
  const GRID = MARCH.slice(0, MARCH.indexOf('struct View')) + /* wgsl */ `
struct G { lo: vec4f, step: vec4f, n: vec4u };
@group(1) @binding(0) var<uniform> gv: G;
@group(1) @binding(1) var<storage, read_write> gout: array<f32>;
@compute @workgroup_size(4, 4, 4)
fn grid(@builtin(global_invocation_id) gid: vec3u) {
  let n = gv.n.x;
  let zs = gv.n.y;   // slab depth
  if (gid.x >= n || gid.y >= n || gid.z >= zs) { return; }
  let z = gid.z + gv.n.z;
  let p = gv.lo.xyz + vec3f(f32(gid.x), f32(gid.y), f32(z)) * gv.step.xyz;
  gout[(gid.z * n + gid.y) * n + gid.x] = de(p);
}`;
  const gridLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  });
  let gridPipe = null;
  // a collage's grid: its estimate in place of the formula's
  const COLLAGE_GRID = withCollage(INTERP + DUAL) + COLLAGE + 'fn clFallback(i: u32, col: f32, facing: f32) -> vec4f { return vec4f(1.0); }\n' + GRID.slice(GRID.indexOf('struct G {'));
  async function deGrid(lo, hi, n) {
    const drivenGrid = packed && packed.collage
      ? await variant.ready(packed.drives ? 'cgrid+drive' : 'cgrid', packed.drives ? withDrive(COLLAGE_GRID) : COLLAGE_GRID, [formulaLayout, gridLayout], 'grid')
      : packed && packed.formula && shapes(packed.formula) ? await variant.ready('grid', withDrive(GRID), [formulaLayout, gridLayout], 'grid') : null;
    if (packed && packed.collage && !drivenGrid) throw new Error('the collage grid did not compile');
    if (!gridPipe) {
      const module = device.createShaderModule({ code: GRID });
      const errs = (await module.getCompilationInfo()).messages.filter((m) => m.type === 'error');
      if (errs.length) throw new Error('wgsl grid: ' + errs.map((m) => `${m.lineNum}:${m.linePos} ${m.message}`).join('\n'));
      gridPipe = await device.createComputePipelineAsync({ layout: device.createPipelineLayout({ bindGroupLayouts: [formulaLayout, gridLayout] }), compute: { module, entryPoint: 'grid' } });
    }
    const field = new Float32Array(n * n * n);
    const slab = Math.max(1, Math.floor((1 << 22) / (n * n)));
    const step = [0, 1, 2].map((k) => (hi[k] - lo[k]) / (n - 1));
    const ub = device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    for (let z0 = 0; z0 < n; z0 += slab) {
      const zs = Math.min(slab, n - z0), bytes = n * n * zs * 4;
      const ob = device.createBuffer({ size: bytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
      const rb = device.createBuffer({ size: bytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
      const ud = new ArrayBuffer(48), uf = new Float32Array(ud), uu = new Uint32Array(ud);
      uf.set([...lo, 0, ...step, 0]); uu[8] = n; uu[9] = zs; uu[10] = z0;
      device.queue.writeBuffer(ub, 0, ud);
      const bg = device.createBindGroup({ layout: gridLayout, entries: [{ binding: 0, resource: { buffer: ub } }, { binding: 1, resource: { buffer: ob } }] });
      const enc = device.createCommandEncoder();
      const cp = enc.beginComputePass();
      cp.setPipeline(drivenGrid || gridPipe);
      cp.setBindGroup(0, formulaGroup);
      cp.setBindGroup(1, bg);
      cp.dispatchWorkgroups(Math.ceil(n / 4), Math.ceil(n / 4), Math.ceil(zs / 4));
      cp.end();
      enc.copyBufferToBuffer(ob, 0, rb, 0, bytes);
      device.queue.submit([enc.finish()]);
      await rb.mapAsync(GPUMapMode.READ);
      field.set(new Float32Array(rb.getMappedRange()), z0 * n * n);
      rb.unmap();
      ob.destroy(); rb.destroy();
    }
    ub.destroy();
    return field;
  }

  // The collage's step factor L (gpu/wgsl.js clSteep): at world points on or near its surface (the
  // caller's: sensed hits, a mesh's vertices), how much steeper the driven estimate is than the same
  // estimate with its drive held — the 90th percentile, at least 1, as gpu/sense.js measures a formula's.
  // Returns { step, ratios, de } (null for a formula); the caller hands step to setStep.
  const stepLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  });
  async function collageStep(points, h = 1e-4) {
    if (!packed || !packed.collage) return null;
    const pipe = await variant.ready(packed.drives ? 'cstep+drive' : 'cstep', packed.drives ? withDrive(COLLAGE_STEP) : COLLAGE_STEP, [formulaLayout, stepLayout], 'steep');
    if (!pipe) throw new Error('the collage step pass did not compile');
    const n = points.length;
    const pts = new Float32Array(Math.max(1, n) * 4);
    points.forEach((p, i) => pts.set(p, i * 4));
    const mk = (size, usage) => device.createBuffer({ size, usage });
    const ub = mk(32, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST), pb = mk(pts.byteLength, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    const ob = mk(pts.byteLength, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC), rb = mk(pts.byteLength, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST);
    const ud = new ArrayBuffer(32);
    new Uint32Array(ud)[0] = n; new Float32Array(ud)[4] = h;
    device.queue.writeBuffer(ub, 0, ud);
    device.queue.writeBuffer(pb, 0, pts);
    const bg = device.createBindGroup({ layout: stepLayout, entries: [ub, pb, ob].map((b, i) => ({ binding: i, resource: { buffer: b } })) });
    const enc = device.createCommandEncoder();
    const cp = enc.beginComputePass();
    cp.setPipeline(pipe); cp.setBindGroup(0, formulaGroup); cp.setBindGroup(1, bg); cp.dispatchWorkgroups(Math.ceil(n / 64)); cp.end();
    enc.copyBufferToBuffer(ob, 0, rb, 0, pts.byteLength);
    device.queue.submit([enc.finish()]);
    await rb.mapAsync(GPUMapMode.READ);
    const o = new Float32Array(rb.getMappedRange().slice(0));
    rb.unmap();
    [ub, pb, ob, rb].forEach((b) => b.destroy());
    const ratios = [], de = [];
    for (let i = 0; i < n; i++) {
      de.push(o[i * 4 + 2]);
      if (o[i * 4] > 0 && o[i * 4 + 1] > 0) ratios.push(Math.max(1, o[i * 4] / o[i * 4 + 1]));
    }
    const sorted = [...ratios].sort((a, b) => a - b);
    return { step: Math.min(16, sorted.length ? sorted[Math.floor(sorted.length * 0.9)] : 1), ratios, de };
  }

  // the push engine shares the device, the canvas and the formula buffers
  return {
    device, ctx, format, headBuf, opsBuf, formulaLayout, resize, setFormula, setCollage, collageReady, collageJitReady, collageStep, frame, present, lens, setLens, renderThumb, variant,
    compileJit, compileStructureJit, renderStill, deGrid, setTiming, marchMs, readAccum,
    get jitReady() { return !!(packed && jitFor(packed.formula)); },
    // which pipeline a frame of the current formula would use
    get pipelineKind() {
      if (packed && packed.collage) return variant(...collageJitMarch(packed)) ? 'collage jit' : 'collage';
      const f = packed && packed.formula, p = pipeFor(f, true);
      // the drivers' variant of the interpreter is the interpreter too
      return p === jits.literal.pipe ? 'literal' : p === jits.structure.pipe ? 'structure' : 'interpreter';
    },
    // the latest pull image, for the loop engine to start from
    accumView: () => (tex.length ? tex[cur].createView() : null),
    get size() { return [w, h]; }, get packed() { return packed; }, setClock, setStep, get clock() { return drive.clock; },
  };
}
