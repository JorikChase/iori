// nodes/warp.js — backward block warp: out(p) = prev(p - mv(block(p))). Twin of engine-ref.js warp().
// mv = quantise(field * scale, pel), zeroed on a detected cut when asked. nearest: floor(p - mv + 0.5);
// bilinear: four taps, edge rule per tap. The field is read with a stride (2 = vec2 per block, 4 = vec4).
// One parameter set per node per submit: the uniform is a queue write.
import { pipeline, computePipeline, dispatch, uniformBuffer, storageBuffer, L, EDGE_WGSL, HALF_WGSL, HASH_WGSL, F16 } from '../gpu.js';
import { FIXED_WGSL } from '../fixed.js';

const WGSL = (fmt) => /* wgsl */`
struct P { size: vec2u, blocks: vec2u, block: u32, edge: u32, sampling: u32, pel: u32, scale: f32, zeroOnCut: u32, cutThresh: u32, stride: u32, interp: u32, pad0: u32, pad1: u32, pad2: u32 };
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var dst: texture_storage_2d<${fmt}, write>;
@group(0) @binding(2) var<storage, read> field: array<f32>;
@group(0) @binding(3) var<storage, read> cut: array<u32>;
@group(0) @binding(4) var<uniform> p: P;
${EDGE_WGSL}
${HALF_WGSL(fmt)}
${HASH_WGSL}
${FIXED_WGSL}
// D45: motion in 1/64 px (integers), the smooth field interpolated in integers, bilinear taps with 1/64 weights (exact
// products), so every browser warps to the same bits
fn fq(x: u32, y: u32) -> vec2i { let o = (y * p.blocks.x + x) * p.stride; return vec2i(vq(field[o]), vq(field[o + 1u])); }
fn tap(x: i32, y: i32) -> vec4f { return textureLoad(src, vec2i(edgeIndex(x, i32(p.size.x), p.edge), edgeIndex(y, i32(p.size.y), p.edge)), 0); }
fn mvq(m: f32) -> i32 { if (p.pel == 0u) { return vq(m); } let k = f32(p.pel); return i32(floor(m * k + 0.5)) * (64 / i32(p.pel)); }

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= p.size.x || id.y >= p.size.y) { return; }
  let b = min(id.xy / vec2u(p.block), p.blocks - vec2u(1u));
  var fv = fq(b.x, b.y);
  if (p.interp == 1u) {     // bilinear between block centres, in units of 1 / (2 block): a per-pixel field
    let B2 = 2 * i32(p.block); let gx = 2 * i32(id.x) + 1 - i32(p.block); let gy = 2 * i32(id.y) + 1 - i32(p.block);
    let x0 = fdiv(gx, B2); let y0 = fdiv(gy, B2); let ax = gx - x0 * B2; let ay = gy - y0 * B2; let mx = vec2i(p.blocks) - vec2i(1);
    let X0 = u32(clamp(x0, 0, mx.x)); let X1 = u32(clamp(x0 + 1, 0, mx.x)); let Y0 = u32(clamp(y0, 0, mx.y)); let Y1 = u32(clamp(y0 + 1, 0, mx.y));
    let s = (fq(X0, Y0) * (B2 - ax) + fq(X1, Y0) * ax) * (B2 - ay) + (fq(X0, Y1) * (B2 - ax) + fq(X1, Y1) * ax) * ay; let D = B2 * B2;
    fv = vec2i(fdiv(s.x + D / 2, D), fdiv(s.y + D / 2, D));
  }
  var mv = vec2i(0);
  if (!(p.zeroOnCut != 0u && cut[0] > p.cutThresh)) { let f = vec2f(fv) * (1.0 / 64.0); mv = vec2i(mvq(f.x * p.scale), mvq(f.y * p.scale)); }
  var c: vec4f;
  let sx = i32(id.x) * 64 - mv.x; let sy = i32(id.y) * 64 - mv.y;
  if (p.sampling == 1u) {
    let x0 = sx >> 6u; let y0 = sy >> 6u; let fx = sx & 63; let fy = sy & 63; let gx = 64 - fx; let gy = 64 - fy;
    let w00 = f32(gx * gy) / 4096.0; let w10 = f32(fx * gy) / 4096.0; let w01 = f32(gx * fy) / 4096.0; let w11 = f32(fx * fy) / 4096.0;
    c = (tap(x0, y0) * w00 + tap(x0 + 1, y0) * w10) + (tap(x0, y0 + 1) * w01 + tap(x0 + 1, y0 + 1) * w11);
  } else {
    c = tap((sx + 32) >> 6u, (sy + 32) >> 6u);
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
