// gpu.js — the WebGPU backend: device, image textures, upload/readback, and the node kernels.
// Everything stays inside the spec default limits (256 MiB buffers, 128 MiB bindings, 8192 textures);
// optional features are used only when granted. Working images are rgba16float (feedback must not be
// 8-bit: repeated round trips collapse dark values to black); rgba32float is used by parity tests.
import { toHalfArray } from './util.js';

const U = () => GPUTextureUsage, B = () => GPUBufferUsage, S = () => GPUShaderStage;
export const F16 = 'rgba16float', F32 = 'rgba32float';

export async function createGPU({ powerPreference = 'high-performance' } = {}) {
  if (!('gpu' in navigator)) throw new Error('WebGPU is not available in this browser');
  let adapter = await navigator.gpu.requestAdapter({ powerPreference });
  let level = 'core';
  if (!adapter) { adapter = await navigator.gpu.requestAdapter({ featureLevel: 'compatibility' }); level = 'compatibility'; }
  if (!adapter) throw new Error('No WebGPU adapter');
  const want = ['shader-f16', 'timestamp-query'].filter((f) => adapter.features.has(f));
  const device = await adapter.requestDevice({ requiredFeatures: want });
  device.lost.then((i) => console.warn('moshine: GPU device lost:', i.reason, i.message));
  const gpu = { adapter, device, level, features: new Set(want), info: adapter.info || {}, pipelines: new Map() };
  return gpu;
}

/** An image texture usable as compute input, compute output, render input, and copy source/target. */
export function createImage(gpu, w, h, format = F16, label = 'image') {
  return gpu.device.createTexture({ label, size: [w, h], format,
    usage: U().TEXTURE_BINDING | U().STORAGE_BINDING | U().COPY_SRC | U().COPY_DST | U().RENDER_ATTACHMENT });
}

/** Upload a Float32Array RGBA image (converted to half floats for rgba16float, round to nearest even). */
export function upload(gpu, tex, data) {
  const f16 = tex.format === F16, src = f16 ? toHalfArray(data) : data;
  gpu.device.queue.writeTexture({ texture: tex }, src, { bytesPerRow: tex.width * (f16 ? 8 : 16) }, [tex.width, tex.height]);
}

/** Read an image back: Float32Array for rgba32float, Uint16Array of half-float BITS for rgba16float (exact compare). */
export async function readback(gpu, tex) {
  const { device } = gpu, f16 = tex.format === F16, bpp = f16 ? 8 : 16, w = tex.width, h = tex.height;
  const row = Math.ceil((w * bpp) / 256) * 256;
  const buf = device.createBuffer({ size: row * h, usage: B().COPY_DST | B().MAP_READ });
  const enc = device.createCommandEncoder();
  enc.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow: row }, [w, h]);
  device.queue.submit([enc.finish()]);
  await buf.mapAsync(GPUMapMode.READ);
  const raw = new Uint8Array(buf.getMappedRange()), out = new Uint8Array(w * h * bpp);
  for (let y = 0; y < h; y++) out.set(raw.subarray(y * row, y * row + w * bpp), y * w * bpp);
  buf.unmap(); buf.destroy();
  return f16 ? new Uint16Array(out.buffer) : new Float32Array(out.buffer);
}

/** Cache a pipeline (or any per-device object) under a key. */
export function pipeline(gpu, key, make) { if (!gpu.pipelines.has(key)) gpu.pipelines.set(key, make()); return gpu.pipelines.get(key); }

/** A luma (or any scalar) plane: r32float, compute in/out, copy source. */
export function createPlane(gpu, w, h, label = 'plane') {
  return gpu.device.createTexture({ label, size: [w, h], format: 'r32float', usage: U().TEXTURE_BINDING | U().STORAGE_BINDING | U().COPY_SRC | U().COPY_DST });
}
export function storageBuffer(gpu, bytes, label = 'storage') {
  return gpu.device.createBuffer({ label, size: Math.max(16, Math.ceil(bytes / 16) * 16), usage: B().STORAGE | B().COPY_SRC | B().COPY_DST });
}
export function uniformBuffer(gpu, bytes, label = 'uniform') {
  return gpu.device.createBuffer({ label, size: Math.ceil(bytes / 16) * 16, usage: B().UNIFORM | B().COPY_DST });
}
/** Read a buffer back as an ArrayBuffer (copy, map, unmap). */
export async function readBuffer(gpu, buf, bytes = buf.size) {
  const { device } = gpu, tmp = device.createBuffer({ size: Math.ceil(bytes / 4) * 4, usage: B().COPY_DST | B().MAP_READ });
  const enc = device.createCommandEncoder(); enc.copyBufferToBuffer(buf, 0, tmp, 0, tmp.size); device.queue.submit([enc.finish()]);
  await tmp.mapAsync(GPUMapMode.READ); const out = tmp.getMappedRange().slice(0, bytes); tmp.unmap(); tmp.destroy(); return out;
}
/** Read an r32float plane back as Float32Array. */
export async function readPlane(gpu, tex) {
  const { device } = gpu, w = tex.width, h = tex.height, row = Math.ceil((w * 4) / 256) * 256;
  const buf = device.createBuffer({ size: row * h, usage: B().COPY_DST | B().MAP_READ }), enc = device.createCommandEncoder();
  enc.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow: row }, [w, h]); device.queue.submit([enc.finish()]);
  await buf.mapAsync(GPUMapMode.READ); const raw = new Float32Array(buf.getMappedRange()), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) out.set(raw.subarray((y * row) / 4, (y * row) / 4 + w), y * w);
  buf.unmap(); buf.destroy(); return out;
}

/** Layout entry shorthands for explicit bind group layouts (texture_2d<f32> is always unfilterable here). */
export const L = {
  tex: (binding) => ({ binding, visibility: S().COMPUTE, texture: { sampleType: 'unfilterable-float' } }),
  out: (binding, format) => ({ binding, visibility: S().COMPUTE, storageTexture: { access: 'write-only', format } }),
  ro: (binding) => ({ binding, visibility: S().COMPUTE, buffer: { type: 'read-only-storage' } }),
  rw: (binding) => ({ binding, visibility: S().COMPUTE, buffer: { type: 'storage' } }),
  uni: (binding) => ({ binding, visibility: S().COMPUTE, buffer: { type: 'uniform' } }),
};
/** Build a compute pipeline with an explicit layout. */
export function computePipeline(gpu, label, code, entries) {
  const { device } = gpu, layout = device.createBindGroupLayout({ label, entries });
  return { layout, pipe: device.createComputePipeline({ label, layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }), compute: { module: device.createShaderModule({ label, code }), entryPoint: 'main' } }) };
}
/** Record one compute dispatch. resources: array of GPUTextureView | GPUBuffer, in binding order. */
export function dispatch(gpu, enc, p, resources, x, y = 1, label) {
  const entries = resources.map((r, binding) => ({ binding, resource: r instanceof GPUBuffer ? { buffer: r } : r.createView ? r.createView() : r }));
  const pass = enc.beginComputePass(label ? { label } : undefined);
  pass.setPipeline(p.pipe); pass.setBindGroup(0, gpu.device.createBindGroup({ layout: p.layout, entries })); pass.dispatchWorkgroups(x, y); pass.end();
}

/** WGSL twins of util.hash3 and engine-ref edgeIndex: bit-identical by construction. */
export const HASH_WGSL = /* wgsl */`
fn hash3(x: u32, y: u32, z: u32) -> f32 {
  var h = (x * 0x27d4eb2du) ^ (y * 0x165667b1u) ^ (z * 0x9e3779b1u);
  h = (h ^ (h >> 15u)) * 0x85ebca6bu;
  h = (h ^ (h >> 13u)) * 0xc2b2ae35u;
  return f32((h ^ (h >> 16u)) >> 8u) / 16777216.0;
}`;
export const EDGE_WGSL = /* wgsl */`
fn edgeIndex(q: i32, n: i32, mode: u32) -> i32 {
  if (mode == 1u) { return ((q % n) + n) % n; }
  if (mode == 2u) { let m = 2 * n; let r = ((q % m) + m) % m; return select(m - 1 - r, r, r < n); }
  return clamp(q, 0, n - 1);
}`;
/** Round to the nearest half float (ties to even) BEFORE a store into an rgba16float texture. GPUs may truncate
 *  on that conversion (Apple Metal does), which drifts a feedback loop darker every frame; a value that is
 *  already representable converts exactly everywhere. Twin of util.toHalf(). Q() is the per-format store hook. */
export const HALF_WGSL = (fmt) => /* wgsl */`
fn roundHalf1(x: f32) -> f32 {
  if (abs(x) < 6.103515625e-05) { return round(x * 16777216.0) / 16777216.0; }
  let b = bitcast<u32>(x);
  return bitcast<f32>((b + 0x0fffu + ((b >> 13u) & 1u)) & 0xffffe000u);
}
fn Q(v: vec4f) -> vec4f { ${fmt === 'rgba16float' ? 'return vec4f(roundHalf1(v.x), roundHalf1(v.y), roundHalf1(v.z), roundHalf1(v.w));' : 'return v;'} }`;
/**
 * Luma (BT.709) in exact integer arithmetic, twin of engine-ref.js lumaPx (M8, 2026-10-10). The float dot product
 * rounded differently per compiler (Chrome and WebKit, and both against the CPU), and a near tie in the matcher then
 * picked another vector and the loops drifted apart. Channels clamp to [0, 1] and quantize to 1/32768 (a power of two:
 * exact), the weights are integers summing to 65536, and the result is a multiple of 1/32768, so the pyramid's 2 x 2
 * means stay exact too.
 */
export const LUMA_WGSL = /* wgsl */`
fn lumaOf(c: vec4f) -> f32 {
  let q = vec3u(floor(clamp(c.rgb, vec3f(0.0), vec3f(1.0)) * 32768.0 + vec3f(0.5)));
  return f32((13933u * q.x + 46871u * q.y + 4732u * q.z + 32768u) >> 16u) * (1.0 / 32768.0);
}`;

// ------------------------------------------------------------------------------------------------ present
const PRESENT_WGSL = /* wgsl */`
@group(0) @binding(0) var a: texture_2d<f32>;
@group(0) @binding(1) var b: texture_2d<f32>;
@group(0) @binding(2) var<uniform> split: vec4f;     // x: uv.x where b starts (>= 1: only a), y: gain, z: 1 = |a - b| * gain
struct VO { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VO {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  var o: VO; o.pos = vec4f(p * 2.0 - 1.0, 0.0, 1.0); o.uv = vec2f(p.x, 1.0 - p.y); return o;
}
fn at(t: texture_2d<f32>, uv: vec2f) -> vec4f { let d = vec2f(textureDimensions(t)); return textureLoad(t, vec2i(min(uv * d, d - vec2f(1.0))), 0); }
@fragment fn fs(v: VO) -> @location(0) vec4f {
  var c = at(a, v.uv);
  if (split.z > 0.5) { c = vec4f(abs(c.rgb - at(b, v.uv).rgb) * split.y, 1.0); }
  else if (v.uv.x >= split.x) { c = at(b, v.uv); }
  return vec4f(clamp(c.rgb, vec3f(0.0), vec3f(1.0)), 1.0);
}`;

/** Bind a canvas. draw(a) shows an image nearest-neighbour; draw(a, { b, split }) shows b right of split;
 *  draw(a, { b, diff: gain }) shows |a - b| * gain. Letterboxing is the shell's job. */
export function createPresenter(gpu, canvas) {
  const { device } = gpu, ctx = canvas.getContext('webgpu'), format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: 'opaque' });
  const layout = device.createBindGroupLayout({ entries: [0, 1].map((binding) => ({ binding, visibility: S().FRAGMENT, texture: { sampleType: 'unfilterable-float' } })).concat([{ binding: 2, visibility: S().FRAGMENT, buffer: { type: 'uniform' } }]) });
  const module = device.createShaderModule({ label: 'present', code: PRESENT_WGSL }), uni = device.createBuffer({ size: 16, usage: B().UNIFORM | B().COPY_DST });
  const pipe = device.createRenderPipeline({ layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
    vertex: { module, entryPoint: 'vs' }, fragment: { module, entryPoint: 'fs', targets: [{ format }] }, primitive: { topology: 'triangle-list' } });
  return {
    draw(tex, o = {}) {
      if (canvas.width !== tex.width || canvas.height !== tex.height) { canvas.width = tex.width; canvas.height = tex.height; }
      device.queue.writeBuffer(uni, 0, new Float32Array([o.b && o.split !== undefined ? o.split : 2, o.diff || 1, o.b && o.diff ? 1 : 0, 0]));
      const enc = device.createCommandEncoder();
      const pass = enc.beginRenderPass({ colorAttachments: [{ view: ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
      pass.setPipeline(pipe);
      pass.setBindGroup(0, device.createBindGroup({ layout, entries: [{ binding: 0, resource: tex.createView() }, { binding: 1, resource: (o.b || tex).createView() }, { binding: 2, resource: { buffer: uni } }] }));
      pass.draw(3); pass.end(); device.queue.submit([enc.finish()]);
    },
  };
}
