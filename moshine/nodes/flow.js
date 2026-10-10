// nodes/flow.js — pyramidal Lucas–Kanade per cell, one dispatch per level. Twin of engine-ref.js flowCells().
// Output vec4 per cell [dx, dy, mad, 0]; the final level counts cells with mad > cutMad.
import { pipeline, computePipeline, dispatch, uniformBuffer, storageBuffer, L } from '../gpu.js';

const WGSL = /* wgsl */`
struct P { dims: vec2u, blocks: vec2u, bs: u32, flags: u32, cutMad: f32, pad: f32 };
@group(0) @binding(0) var curT: texture_2d<f32>;
@group(0) @binding(1) var refT: texture_2d<f32>;
@group(0) @binding(2) var<storage, read> coarse: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> outF: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> cut: array<atomic<u32>>;
@group(0) @binding(5) var<uniform> p: P;
fn tap(x: i32, y: i32) -> f32 { return textureLoad(refT, clamp(vec2i(x, y), vec2i(0), vec2i(p.dims) - vec2i(1)), 0).r; }
fn J(x: i32, y: i32) -> f32 { return textureLoad(curT, clamp(vec2i(x, y), vec2i(0), vec2i(p.dims) - vec2i(1)), 0).r; }
fn bil(s: vec2f) -> f32 { let f0 = floor(s); let a = s - f0; let i = vec2i(f0);
  return (tap(i.x, i.y) * (1.0 - a.x) + tap(i.x + 1, i.y) * a.x) * (1.0 - a.y) + (tap(i.x, i.y + 1) * (1.0 - a.x) + tap(i.x + 1, i.y + 1) * a.x) * a.y; }
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= p.blocks.x || id.y >= p.blocks.y) { return; }
  let bi = id.y * p.blocks.x + id.x; let bs = i32(p.bs); let W = i32(p.dims.x); let H = i32(p.dims.y);
  let x0 = i32(id.x) * bs; let y0 = i32(id.y) * bs; let x1 = min(x0 + bs, W); let y1 = min(y0 + bs, H);
  var d = vec2f(0.0); if ((p.flags & 1u) != 0u) { d = 2.0 * coarse[bi].xy; }
  if (x0 < W && y0 < H) {
    for (var it = 0; it < 4; it++) {
      var gxx = 0.0; var gxy = 0.0; var gyy = 0.0; var ex = 0.0; var ey = 0.0; var n = 0;
      for (var y = y0 - 2; y < y1 + 2; y++) { for (var x = x0 - 2; x < x1 + 2; x++) {
        let s = vec2f(f32(x), f32(y)) - d; let I = bil(s);
        let Ix = (bil(vec2f(s.x + 1.0, s.y)) - bil(vec2f(s.x - 1.0, s.y))) * 0.5; let Iy = (bil(vec2f(s.x, s.y + 1.0)) - bil(vec2f(s.x, s.y - 1.0))) * 0.5;
        let e = J(x, y) - I;
        gxx = gxx + Ix * Ix; gxy = gxy + Ix * Iy; gyy = gyy + Iy * Iy; ex = ex + Ix * e; ey = ey + Iy * e; n++;
      } }
      let reg = 1e-4 * f32(n); let a = gxx + reg; let c = gyy + reg; let det = a * c - gxy * gxy;
      d = d + vec2f(clamp(-((c * ex - gxy * ey) / det), -2.0, 2.0), clamp(-((a * ey - gxy * ex) / det), -2.0, 2.0));
    }
  }
  var mad = 0.0;
  if ((p.flags & 2u) != 0u) {
    var acc = 0.0; for (var y = y0; y < y1; y++) { for (var x = x0; x < x1; x++) { acc = acc + abs(J(x, y) - bil(vec2f(f32(x), f32(y)) - d)); } }
    mad = acc / f32((x1 - x0) * (y1 - y0)); if (mad > p.cutMad) { atomicAdd(&cut[0], 1u); }
  }
  outF[bi] = vec4f(d, mad, 0.0);
}`;

export function createFlow(gpu, { w, h, block, levels }) {
  const P = pipeline(gpu, 'flow', () => computePipeline(gpu, 'flow', WGSL, [L.tex(0), L.tex(1), L.ro(2), L.rw(3), L.rw(4), L.uni(5)]));
  const bw = Math.ceil(w / block), bh = Math.ceil(h / block), nb = bw * bh;
  const coarse = Array.from({ length: levels }, (_, l) => (l === 0 ? null : storageBuffer(gpu, nb * 16, `flow L${l}`)));
  const uni = Array.from({ length: levels }, () => uniformBuffer(gpu, 32, 'flow uniform')), dummy = storageBuffer(gpu, 16, 'flow dummy');
  return {
    encode(enc, cur, ref, out, cut, { cutMad }) {
      for (let l = levels - 1; l >= 0; l--) {
        const pl = cur.levels[l], top = l === levels - 1, u = new ArrayBuffer(32), U32 = new Uint32Array(u), F32 = new Float32Array(u);
        U32.set([pl.width, pl.height, bw, bh, Math.max(1, block >> l), (top ? 0 : 1) | (l === 0 ? 2 : 0)]); F32[6] = cutMad;
        gpu.device.queue.writeBuffer(uni[l], 0, u);
        dispatch(gpu, enc, P, [pl, ref.levels[l], top ? dummy : coarse[l + 1], l === 0 ? out : coarse[l], cut, uni[l]], Math.ceil(bw / 8), Math.ceil(bh / 8), `flow L${l}`);
      }
    },
    destroy() { coarse.forEach((b) => b && b.destroy()); uni.forEach((b) => b.destroy()); dummy.destroy(); },
  };
}
