// nodes/warp.js — backward block warp: out(p) = prev(p - mv(block(p))). Twin of engine-ref.js warp().
// mv = quantise(field * scale, pel), zeroed on a detected cut when asked. nearest: floor(p - mv + 0.5);
// bilinear: four taps, edge rule per tap. The field is read with a stride (2 = vec2 per block, 4 = vec4).
// One parameter set per node per submit: the uniform is a queue write.
import { pipeline, computePipeline, dispatch, uniformBuffer, storageBuffer, L, EDGE_WGSL, HALF_WGSL, F16 } from '../gpu.js';

const WGSL = (fmt) => /* wgsl */`
struct P { size: vec2u, blocks: vec2u, block: u32, edge: u32, sampling: u32, pel: u32, scale: f32, zeroOnCut: u32, cutThresh: u32, stride: u32, interp: u32, pad0: u32, pad1: u32, pad2: u32 };
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var dst: texture_storage_2d<${fmt}, write>;
@group(0) @binding(2) var<storage, read> field: array<f32>;
@group(0) @binding(3) var<storage, read> cut: array<u32>;
@group(0) @binding(4) var<uniform> p: P;
${EDGE_WGSL}
${HALF_WGSL(fmt)}
fn fieldAt(x: u32, y: u32) -> vec2f { let o = (y * p.blocks.x + x) * p.stride; return vec2f(field[o], field[o + 1u]); }
fn quant(m: f32) -> f32 { if (p.pel == 0u) { return m; } let k = f32(p.pel); return floor(m * k + 0.5) / k; }
fn tap(x: i32, y: i32) -> vec4f { return textureLoad(src, vec2i(edgeIndex(x, i32(p.size.x), p.edge), edgeIndex(y, i32(p.size.y), p.edge)), 0); }

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= p.size.x || id.y >= p.size.y) { return; }
  let b = min(id.xy / vec2u(p.block), p.blocks - vec2u(1u));
  let o = (b.y * p.blocks.x + b.x) * p.stride;
  var fv = vec2f(field[o], field[o + 1u]);
  if (p.interp == 1u) {     // bilinear between block centres: a per-pixel field
    let g = (vec2f(id.xy) + vec2f(0.5)) / f32(p.block) - vec2f(0.5); let g0 = floor(g); let a = g - g0; let i0 = vec2i(g0); let mx = vec2i(p.blocks) - vec2i(1);
    let X0 = u32(clamp(i0.x, 0, mx.x)); let X1 = u32(clamp(i0.x + 1, 0, mx.x)); let Y0 = u32(clamp(i0.y, 0, mx.y)); let Y1 = u32(clamp(i0.y + 1, 0, mx.y));
    fv = (fieldAt(X0, Y0) * (1.0 - a.x) + fieldAt(X1, Y0) * a.x) * (1.0 - a.y) + (fieldAt(X0, Y1) * (1.0 - a.x) + fieldAt(X1, Y1) * a.x) * a.y;
  }
  var mv = vec2f(0.0);
  if (!(p.zeroOnCut != 0u && cut[0] > p.cutThresh)) { mv = vec2f(quant(fv.x * p.scale), quant(fv.y * p.scale)); }
  var c: vec4f;
  if (p.sampling == 1u) {
    let s = vec2f(id.xy) - mv; let f = floor(s); let a = s - f; let i = vec2i(f);
    c = (tap(i.x, i.y) * (1.0 - a.x) + tap(i.x + 1, i.y) * a.x) * (1.0 - a.y) + (tap(i.x, i.y + 1) * (1.0 - a.x) + tap(i.x + 1, i.y + 1) * a.x) * a.y;
  } else {
    let q = vec2i(floor(vec2f(id.xy) - mv + vec2f(0.5)));
    c = tap(q.x, q.y);
  }
  textureStore(dst, vec2i(id.xy), Q(c));
}`;

export const SAMPLING = { nearest: 0, bilinear: 1 };

/** A warp node for one image size and format. */
export function createWarpNode(gpu, { w, h, block = 16, format = F16 }) {
  const bw = Math.ceil(w / block), bh = Math.ceil(h / block);
  const P = pipeline(gpu, 'warp:' + format, () => computePipeline(gpu, 'warp ' + format, WGSL(format), [L.tex(0), L.out(1, format), L.ro(2), L.ro(3), L.uni(4)]));
  const uni = uniformBuffer(gpu, 64, 'warp uniform'), zeroCut = storageBuffer(gpu, 16, 'no cut');
  return {
    w, h, block, bw, bh, format,
    /** o: { field: GPUBuffer, stride = 4, cut?: GPUBuffer, edge = 0, sampling = 'nearest', pel = 0, scale = 1, zeroOnCut = false, cutThresh = 0, interp = 'block' } */
    encode(enc, srcTex, dstTex, o) {
      const u = new ArrayBuffer(64), U32 = new Uint32Array(u), F32 = new Float32Array(u);
      U32.set([w, h, bw, bh, block, o.edge | 0, SAMPLING[o.sampling || 'nearest'], o.pel | 0]); F32[8] = o.scale ?? 1;
      U32[9] = o.zeroOnCut ? 1 : 0; U32[10] = o.cutThresh | 0; U32[11] = o.stride || 4; U32[12] = o.interp === 'smooth' ? 1 : 0;
      gpu.device.queue.writeBuffer(uni, 0, u);
      dispatch(gpu, enc, P, [srcTex, dstTex, o.field, o.cut || zeroCut, uni], Math.ceil(w / 8), Math.ceil(h / 8), 'warp');
    },
    destroy() { uni.destroy(); zeroCut.destroy(); },
  };
}

/** The M0 API: a warp with its own vec2 field buffer. setField(Float32Array [mvx, mvy] per block). */
export function createWarp(gpu, { w, h, block = 16, format = F16, edge = 0 }) {
  const node = createWarpNode(gpu, { w, h, block, format }), field = storageBuffer(gpu, node.bw * node.bh * 8, 'warp field');
  const api = {
    ...node, edge,
    setField(f) { gpu.device.queue.writeBuffer(field, 0, f); },
    setEdge(e) { api.edge = e; },
    encode(enc, srcTex, dstTex) { node.encode(enc, srcTex, dstTex, { field, stride: 2, edge: api.edge }); },
    destroy() { node.destroy(); field.destroy(); },
  };
  return api;
}
