// Pull renderer. One compute pass marches one jittered sample per pixel through the distance field
// and blends it into a float accumulation texture (ping-pong); a display pass tonemaps it to the
// canvas. Formula changes rewrite two buffers; nothing recompiles.
//
// The field is read as a radiance field: the surface is where the density steps (de < pixel cone),
// near-misses emit (the glow), depth absorbs (the fog). One key light, soft shadows, AO, thin-lens DOF.

import { INTERP, DUAL } from './wgsl.js';
import { pack, MAX_OPS, REC, HEAD_BYTES } from './pack.js';

const VIEW_FLOATS = 48;

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
    let d = de(ro + rd * t) * view.tune.x;
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
    tr = iterate(p, cFor(p));
    let d = deOf(tr) * view.tune.x * unsafeScale;
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
    let dd = iterateDual(p, cFor(p), (head.flags & FLAG_JULIA) == 0u);
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
  let gl = tint(glowCol, 0.0) * glow * view.light.w;
  return c * absorb + gl * mix(1.0, absorb, 0.6);
}

@compute @workgroup_size(8, 8)
fn march(@builtin(global_invocation_id) gid: vec3u) {
  let res = vec2u(view.res.xy);
  if (gid.x >= res.x || gid.y >= res.y) { return; }
  seed = pcg(gid.x + pcg(gid.y + pcg(u32(view.tune.w))));
  let aspect = f32(res.x) / f32(res.y);
  let jitter = vec2f(rnd(), rnd());
  let uv = ((vec2f(gid.xy) + jitter) / vec2f(res)) * 2.0 - 1.0;
  let th = view.pos.w;
  let dir = normalize(view.fwd.xyz + view.right.xyz * uv.x * th * aspect - view.up.xyz * uv.y * th);
  // thin lens
  let a = rnd() * 6.2831853;
  let r = sqrt(rnd()) * view.right.w;
  let lens = (view.right.xyz * cos(a) + view.up.xyz * sin(a)) * r;
  let focal = view.pos.xyz + dir * (view.up.w / dot(dir, view.fwd.xyz));
  let ro = view.pos.xyz + lens;
  let rd = normalize(focal - ro);
  let pixelAngle = 2.0 * th / f32(res.y);
  var c = shade(ro, rd, pixelAngle);
  if (!(c.x == c.x && c.y == c.y && c.z == c.z)) { c = vec3f(0.0); }
  c = min(c, vec3f(64.0));
  let prev = textureLoad(prevTex, vec2i(gid.xy), 0);
  let w = view.fwd.w;
  textureStore(outTex, vec2i(gid.xy), vec4f(mix(prev.rgb, c, w), 1.0));
}
`;

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
@group(1) @binding(1) var<storage, read> drecs: array<vec4f, 8>;
@group(1) @binding(2) var lensOut: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8)
fn lensMap(@builtin(global_invocation_id) gid: vec3u) {
  if (f32(gid.x) >= lv.span.z || f32(gid.y) >= lv.span.w) { return; }
  ov0 = lv.ov.x;
  ov1 = select(0xffffffffu, lv.ov.y, lv.ov.z > 1u);
  for (var k = 0u; k < 4u; k++) { ovRec0[k] = drecs[k]; ovRec1[k] = drecs[4u + k]; }
  let u = (f32(gid.x) + 0.5) / lv.span.z - 0.5;
  let v = 0.5 - (f32(gid.y) + 0.5) / lv.span.w;
  ovD = vec2f(u * lv.span.x, v * lv.span.y);
  let x = lv.x.xyz;
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
  const device = await adapter.requestDevice();
  const ctx = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: 'opaque' });

  const headBuf = device.createBuffer({ size: HEAD_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const opsBuf = device.createBuffer({ size: MAX_OPS * REC * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
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
  const drecBuf = device.createBuffer({ size: 128, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
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
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
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
  //      drecs [Float64Array(16), …] (one per parameter), size [lw, lh], key }
  function lens(L) {
    if (lensTex.width !== L.size[0] || lensTex.height !== L.size[1]) { lensTex.destroy(); lensTex = mkLensTex(...L.size); makeDispGroups(); }
    const lvd = new ArrayBuffer(64), f = new Float32Array(lvd), u = new Uint32Array(lvd);
    f.set([...L.x, L.foot, L.spans[0], L.spans[1] || 0, L.size[0], L.size[1]]);
    u[8] = L.ops[0]; u[9] = L.ops[1] ?? 0xffffffff; u[10] = L.drecs.length;
    f.set([...L.key, 0], 12);
    device.queue.writeBuffer(lvBuf, 0, lvd);
    const d = new Float32Array(32);
    L.drecs.forEach((r, i) => d.set(r, i * 16));
    device.queue.writeBuffer(drecBuf, 0, d);
    const group = device.createBindGroup({
      layout: lensLayout,
      entries: [{ binding: 0, resource: { buffer: lvBuf } }, { binding: 1, resource: { buffer: drecBuf } }, { binding: 2, resource: lensTex.createView() }],
    });
    const enc = device.createCommandEncoder();
    const cp = enc.beginComputePass();
    cp.setPipeline(lensPipe);
    cp.setBindGroup(0, formulaGroup);
    cp.setBindGroup(1, group);
    cp.dispatchWorkgroups(Math.ceil(L.size[0] / 8), Math.ceil(L.size[1] / 8));
    cp.end();
    device.queue.submit([enc.finish()]);
  }
  function setLens(on, inset = [0, 0, 0]) { lensState.on = on; lensState.inset = inset; }

  let packed = null;
  function setFormula(f) {
    packed = pack(f);
    device.queue.writeBuffer(headBuf, 0, packed.head);
    device.queue.writeBuffer(opsBuf, 0, packed.ops);
  }

  const viewData = new Float32Array(VIEW_FLOATS);
  // v: { pos, right, up, fwd, tanHalfFov, aperture, focus, blend, light, glow, hue, fog, exposure,
  //      terrace, stepScale, maxDist, epsScale, frame, key, ambient, maxSteps, glowWidth,
  //      iridescence, spread, shadowK }
  function frame(v) {
    viewData.set([...v.pos, v.tanHalfFov, ...v.right, v.aperture, ...v.up, v.focus, ...v.fwd, v.blend,
      ...v.light, v.glow, v.hue, v.fog, v.exposure, v.terrace, v.stepScale, v.maxDist, v.epsScale, v.frame,
      ...v.key, v.ambient, w, h, v.maxSteps, v.glowWidth, v.iridescence, v.spread, v.shadowK, v.quality, v.lampRange, v.lampPower, v.lyapMix || 0, 0,
      v.lyapCentre || 0, v.lyapScale || 1, 0, 0]);
    device.queue.writeBuffer(viewBuf, 0, viewData);
    lastExposure = v.exposure;

    const enc = device.createCommandEncoder();
    const cp = enc.beginComputePass();
    cp.setPipeline(marchPipe);
    cp.setBindGroup(0, formulaGroup);
    cp.setBindGroup(1, viewGroups[cur]);
    cp.dispatchWorkgroups(Math.ceil(w / 8), Math.ceil(h / 8));
    cp.end();
    cur = 1 - cur;
    present(enc);
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

  // the push engine shares the device, the canvas and the formula buffers
  return {
    device, ctx, format, headBuf, opsBuf, formulaLayout, resize, setFormula, frame, present, lens, setLens,
    get size() { return [w, h]; }, get packed() { return packed; },
  };
}
