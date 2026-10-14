// nodes/flow.js — pyramidal Lucas–Kanade per cell, one dispatch per level. Twin of engine-ref.js flowCells().
// Output vec4 per cell [dx, dy, mad, 0]; the final level counts cells with mad > cutMad.
import { pipeline, computePipeline, dispatch, uniformBuffer, storageBuffer, L } from '../gpu.js';

// Integer Lucas–Kanade (2026-10-13, D45): displacement in 1/64 px, bilinear taps of the exact luma in integers, gradient
// sums from 10-bit luma (they fit 32 bits), the 2 x 2 solve on the sums shifted to 11 bits with an integer division and
// remainder. No float division, sqrt or multiply-add: every browser gives the same field.
const WGSL = /* wgsl */`
struct P { dims: vec2u, blocks: vec2u, bs: u32, flags: u32, cutMad: f32, pad: f32 };
@group(0) @binding(0) var curT: texture_2d<f32>;
@group(0) @binding(1) var refT: texture_2d<f32>;
@group(0) @binding(2) var<storage, read> coarse: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> outF: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> cut: array<atomic<u32>>;
@group(0) @binding(5) var<uniform> p: P;
fn T15(x: i32, y: i32) -> i32 { return i32(textureLoad(refT, clamp(vec2i(x, y), vec2i(0), vec2i(p.dims) - vec2i(1)), 0).r * 32768.0); }
fn J15(x: i32, y: i32) -> i32 { return i32(textureLoad(curT, clamp(vec2i(x, y), vec2i(0), vec2i(p.dims) - vec2i(1)), 0).r * 32768.0); }
// reference luma at (sx, sy) / 64 px, bilinear with 1/64 weights: luma x 2^27
fn bil27(sx: i32, sy: i32) -> i32 { let x0 = sx >> 6u; let y0 = sy >> 6u; let fx = sx & 63; let fy = sy & 63; let gx = 64 - fx; let gy = 64 - fy;
  return (T15(x0, y0) * gx + T15(x0 + 1, y0) * fx) * gy + (T15(x0, y0 + 1) * gx + T15(x0 + 1, y0 + 1) * fx) * fy; }
fn i10(v: i32) -> i32 { return (v + 65536) >> 17u; }
fn tdiv(a: i32, b: i32) -> i32 { return a / b; }
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= p.blocks.x || id.y >= p.blocks.y) { return; }
  let bi = id.y * p.blocks.x + id.x; let bs = i32(p.bs); let W = i32(p.dims.x); let H = i32(p.dims.y);
  let x0 = i32(id.x) * bs; let y0 = i32(id.y) * bs; let x1 = min(x0 + bs, W); let y1 = min(y0 + bs, H);
  var d = vec2i(0); if ((p.flags & 1u) != 0u) { d = 2 * vec2i(coarse[bi].xy * 64.0); }
  if (x0 < W && y0 < H) {
    for (var it = 0; it < 4; it++) {
      var gxx = 0; var gxy = 0; var gyy = 0; var ex = 0; var ey = 0; var n = 0;
      for (var y = y0 - 2; y < y1 + 2; y++) { for (var x = x0 - 2; x < x1 + 2; x++) {
        let sx = x * 64 - d.x; let sy = y * 64 - d.y; let I = i10(bil27(sx, sy));
        let Ix = i10(bil27(sx + 64, sy)) - i10(bil27(sx - 64, sy)); let Iy = i10(bil27(sx, sy + 64)) - i10(bil27(sx, sy - 64));
        let e = ((J15(x, y) + 16) >> 5u) - I;
        gxx = gxx + Ix * Ix; gxy = gxy + Ix * Iy; gyy = gyy + Iy * Iy; ex = ex + Ix * e; ey = ey + Iy * e; n++;
      } }
      let a = gxx + 419 * n; let c = gyy + 419 * n;
      let mx = max(max(abs(a), abs(c)), max(abs(gxy), max(abs(ex), abs(ey)))); var sh = 0u;
      loop { if ((mx >> sh) < 2048) { break; } sh = sh + 1u; }
      let A = a >> sh; let C = c >> sh; let G = gxy >> sh; let EX = ex >> sh; let EY = ey >> sh; let det = A * C - G * G;
      if (det > 0) {
        let nx = C * EX - G * EY; let ny = A * EY - G * EX;
        let qx = tdiv(nx, det); let qy = tdiv(ny, det);
        let sx = qx * 128 + tdiv((nx - qx * det) * 128, det); let sy = qy * 128 + tdiv((ny - qy * det) * 128, det);
        d = d + vec2i(clamp(-sx, -128, 128), clamp(-sy, -128, 128));
      }
    }
  }
  var mad = 0.0;
  if ((p.flags & 2u) != 0u) {
    var acc = 0; for (var y = y0; y < y1; y++) { for (var x = x0; x < x1; x++) { acc = acc + abs(J15(x, y) - ((bil27(x * 64 - d.x, y * 64 - d.y) + 2048) >> 12u)); } }
    let n = max(1, (x1 - x0) * (y1 - y0)); mad = f32(acc / n) * (1.0 / 32768.0); if (mad > p.cutMad) { atomicAdd(&cut[0], 1u); }
  }
  outF[bi] = vec4f(vec2f(d) * (1.0 / 64.0), mad, 0.0);
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
