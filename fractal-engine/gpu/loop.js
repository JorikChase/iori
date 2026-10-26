// The loop engine: the Light Herder's optical feedback machine, with the formula as the optics.
//
// A camera filming a monitor makes each frame I'(y) = T(blur(I(A·y))) — Crutchfield's map (1984), A
// the camera's warp, T the monitor's tone knobs. Here A is the formula's own forward map F: every pixel
// y stands for the point x(y) on the focus plane, and shows last frame's image where F(x) appears through
// the camera. That is the Hutchinson operator of F's inverse branches acting on images, so the
// escape-time picture is not computed but grows, frame by frame, out of whatever the loop was seeded
// with. A formula with two slots sums both pull-backs: two cameras on one screen, the beam splitter.
//
// The screen is the focus plane, sampled orthographically: F(x) is read back at its coordinates along
// the plane's two axes. Exact for planar maps (complex powers, flames); for 3-D formulas it is the
// shadow of the dynamics on that plane. (Seen through the camera's perspective instead, an expanding
// 3-D map sends almost every pull-back off-screen and the loop dies to noise — measured 2026-10-26.)
//
// Tone, per pass (the monitor knobs): hue rotation, saturation, gain, contrast about mid-grey, decay;
// a few-tap blur (the lens); seeds — noise ("turn the brightness up until it ignites") and the field.

import { INTERP } from './wgsl.js';

const LOOP = INTERP + /* wgsl */ `
struct LV {
  pos: vec4f,    // xyz the window's centre (on the plane), w unused
  right: vec4f,  // xyz the window's horizontal axis, w aspect
  up: vec4f,     // xyz the window's vertical axis, w half-height (world units)
  fwd: vec4f,    // xyz the plane's normal, w how many slots to sum (1 or 2)
  tone: vec4f,   // x hue rotation per pass (rad), y saturation, z gain, w contrast
  tone2: vec4f,  // x decay, y blur radius (texels), z noise seed, w frame
  res: vec4f,    // xy size, z field seed (1 replaces the image with the field), w contrast pivot
  key: vec4f,    // rgb seed colour
  slots: vec4u,  // the slots to sum
};
@group(1) @binding(0) var<uniform> lv: LV;
@group(1) @binding(1) var prevTex: texture_2d<f32>;
@group(1) @binding(2) var outTex: texture_storage_2d<rgba16float, write>;
@group(1) @binding(3) var fieldTex: texture_2d<f32>;

fn hash(p: vec2u) -> f32 {
  var h = p.x * 374761393u + p.y * 668265263u + u32(lv.tone2.w) * 2246822519u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  return f32(h ^ (h >> 16u)) / 4294967296.0;
}

fn load(t: texture_2d<f32>, q: vec2f) -> vec3f {
  let sz = vec2i(textureDimensions(t));
  let p = q - 0.5;
  let i = vec2i(floor(p));
  let f = fract(p);
  let a = textureLoad(t, clamp(i, vec2i(0), sz - 1), 0).rgb;
  let b = textureLoad(t, clamp(i + vec2i(1, 0), vec2i(0), sz - 1), 0).rgb;
  let c = textureLoad(t, clamp(i + vec2i(0, 1), vec2i(0), sz - 1), 0).rgb;
  let d = textureLoad(t, clamp(i + vec2i(1, 1), vec2i(0), sz - 1), 0).rgb;
  var o = mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  // the screen has an edge: beyond it there is nothing to film
  if (any(q < vec2f(0.0)) || any(q > vec2f(sz))) { o = vec3f(0.0); }
  return o;
}

fn applySlot(slot: u32, x0: vec4f, c: vec4f) -> vec4f {
  var x = x0;
  // one step from the window's point: it is the orbit's start (a chimera's fields read it)
  fP0 = x0; fTrap = dot(x0, x0); fIter = 0.0; fIters = 1.0;
  let start = slotStart(slot);
  for (var j = 0u; j < slotLen(slot); j++) { x = fwdAt(start + j, x, c, 1.0).p; }
  return x;
}

@compute @workgroup_size(8, 8)
fn loopStep(@builtin(global_invocation_id) gid: vec3u) {
  let W = lv.res.x;
  let H = lv.res.y;
  if (f32(gid.x) >= W || f32(gid.y) >= H) { return; }
  let uv = (vec2f(gid.xy) + 0.5) / vec2f(W, H) * 2.0 - 1.0;
  // the window on the plane: the loop's own camera (pan, zoom, roll), set where the view was focused
  let o = lv.pos.xyz;
  let hh = lv.up.w;
  let hw = hh * lv.right.w;
  let x = o + lv.right.xyz * uv.x * hw - lv.up.xyz * uv.y * hh;
  // into the orbit's 4-D space through the slice, and back along it
  let x4 = embed(x);
  let c = cFor(x4);
  var acc = vec3f(0.0);
  let n = u32(lv.fwd.w);
  for (var s = 0u; s < n; s++) {
    let y4 = applySlot(lv.slots[s], x4, c);
    if (any(y4 != y4)) { continue; }
    let y = unembed(y4).xyz;
    let d = y - o;
    let q = (vec2f(dot(d, lv.right.xyz) / hw, -dot(d, lv.up.xyz) / hh) * 0.5 + 0.5) * vec2f(W, H);
    // the lens: a small cross of taps
    let b = lv.tone2.y;
    acc = acc + (load(prevTex, q) * 2.0 + load(prevTex, q + vec2f(b, 0.0)) + load(prevTex, q - vec2f(b, 0.0))
               + load(prevTex, q + vec2f(0.0, b)) + load(prevTex, q - vec2f(0.0, b))) / 6.0;
  }
  acc = acc / f32(max(n, 1u));
  // the monitor's knobs
  let yiq = mat3x3f(vec3f(0.299, 0.596, 0.211), vec3f(0.587, -0.274, -0.523), vec3f(0.114, -0.322, 0.312));
  let rgb = mat3x3f(vec3f(1.0, 1.0, 1.0), vec3f(0.956, -0.272, -1.106), vec3f(0.621, -0.647, 1.703));
  var q3 = yiq * acc;
  let a = lv.tone.x;
  q3 = vec3f(q3.x, cos(a) * q3.y - sin(a) * q3.z, sin(a) * q3.y + cos(a) * q3.z);
  q3 = vec3f(q3.x, q3.yz * lv.tone.y);
  var v = max(rgb * q3, vec3f(0.0)) * lv.tone.z;
  // contrast about a pivot in the dark: with gain just over 1 the loop sits at criticality — what stays
  // in the window brightens to the clamp, what leaves it falls to black (a dark image under contrast
  // about mid-grey only decays: its steady state is below zero)
  v = clamp((v - lv.res.w) * lv.tone.w + lv.res.w, vec3f(0.0), vec3f(1.2)) * lv.tone2.x;
  // seeds
  v = v + lv.key.rgb * lv.tone2.z * max(hash(gid.xy) - 0.6, 0.0);
  if (lv.res.z > 0.0) {
    let fsz = vec2f(textureDimensions(fieldTex));
    let fq = (vec2f(gid.xy) + 0.5) / vec2f(W, H) * fsz;
    let fc = load(fieldTex, fq);
    v = mix(v, fc / (1.0 + fc), lv.res.z);
  }
  textureStore(outTex, vec2i(gid.xy), vec4f(v, 1.0));
}
`;

const SHOW = /* wgsl */ `
@group(0) @binding(0) var img: texture_2d<f32>;
@group(0) @binding(1) var<uniform> sz: vec4f;  // canvas wh
@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}
fn toSrgb(c: vec3f) -> vec3f {
  return select(1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055, c * 12.92, c <= vec3f(0.0031308));
}
@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let s = vec2f(textureDimensions(img));
  let q = vec2i(clamp(fc.xy / sz.xy * s, vec2f(0.0), s - 1.0));
  let c = textureLoad(img, q, 0).rgb;
  let n = fract(sin(dot(fc.xy, vec2f(12.9898, 78.233))) * 43758.5453);
  return vec4f(toSrgb(clamp(c, vec3f(0.0), vec3f(1.0))) + (n - 0.5) / 255.0, 1.0);
}
`;

export async function createLoop(R) {
  const { device, ctx, format, headBuf, opsBuf, formulaLayout } = R;
  const compile = async (code) => {
    const m = device.createShaderModule({ code });
    const errs = (await m.getCompilationInfo()).messages.filter((x) => x.type === 'error');
    if (errs.length) throw new Error('wgsl loop: ' + errs.map((x) => `${x.lineNum}:${x.linePos} ${x.message}`).join('\n'));
    return m;
  };
  const layout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'unfilterable-float' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba16float' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'unfilterable-float' } },
    ],
  });
  const stepPipe = device.createComputePipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [formulaLayout, layout] }),
    compute: { module: await compile(LOOP), entryPoint: 'loopStep' },
  });
  const showLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
    ],
  });
  const showModule = await compile(SHOW);
  const showPipe = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [showLayout] }),
    vertex: { module: showModule, entryPoint: 'vs' },
    fragment: { module: showModule, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });
  const formulaGroup = device.createBindGroup({
    layout: formulaLayout,
    entries: [{ binding: 0, resource: { buffer: headBuf } }, { binding: 1, resource: { buffer: opsBuf } }],
  });
  const lvBuf = device.createBuffer({ size: 144, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const szBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

  let w = 0, h = 0, tex = [], cur = 0;
  function resize(iw, ih) {
    iw = Math.max(8, iw | 0); ih = Math.max(8, ih | 0);
    if (iw === w && ih === h) return false;
    w = iw; h = ih;
    tex.forEach((t) => t.destroy());
    tex = [0, 1].map(() => device.createTexture({
      size: [w, h], format: 'rgba16float', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
    }));
    cur = 0;
    return true;
  }

  // v: window { o, e1, e2, n, hh, aspect }, slots [a, b?], hue, saturation, gain, contrast, decay, blur, noise,
  //    fieldSeed (0..1), key, frame, field (a texture view of the pull field, or null)
  function frame(v, canvas) {
    const d = new ArrayBuffer(144), f = new Float32Array(d), u = new Uint32Array(d);
    f.set([...v.o, 0, ...v.e1, v.aspect, ...v.e2, v.hh, ...v.n, v.slots.length,
      v.hue, v.saturation, v.gain, v.contrast, v.decay, v.blur, v.noise, v.frame,
      w, h, v.field ? v.fieldSeed : 0, v.pivot, ...v.key, 0]);
    u[32] = v.slots[0]; u[33] = v.slots[1] ?? 0;
    device.queue.writeBuffer(lvBuf, 0, d);
    device.queue.writeBuffer(szBuf, 0, new Float32Array([canvas.width, canvas.height, 0, 0]));
    const group = device.createBindGroup({
      layout,
      entries: [
        { binding: 0, resource: { buffer: lvBuf } }, { binding: 1, resource: tex[cur].createView() },
        { binding: 2, resource: tex[1 - cur].createView() }, { binding: 3, resource: v.field || tex[cur].createView() },
      ],
    });
    const enc = device.createCommandEncoder();
    const cp = enc.beginComputePass();
    cp.setPipeline(stepPipe);
    cp.setBindGroup(0, formulaGroup);
    cp.setBindGroup(1, group);
    cp.dispatchWorkgroups(Math.ceil(w / 8), Math.ceil(h / 8));
    cp.end();
    cur = 1 - cur;
    const show = device.createBindGroup({
      layout: showLayout,
      entries: [{ binding: 0, resource: tex[cur].createView() }, { binding: 1, resource: { buffer: szBuf } }],
    });
    const rp = enc.beginRenderPass({
      colorAttachments: [{ view: ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
    });
    rp.setPipeline(showPipe);
    rp.setBindGroup(0, show);
    rp.draw(3);
    rp.end();
    device.queue.submit([enc.finish()]);
  }

  return { resize, frame, get size() { return [w, h]; } };
}
