// nodes/match.js — hierarchical block matching, one dispatch per pyramid level. Twin of engine-ref.js
// matchBlocks(): same candidates in the same order, strict-less comparisons, data-only sub-pel.
// Output: vec4 per block [mvx, mvy, mad, 0]; the final level also counts blocks with mad > cutMad.
import { pipeline, computePipeline, dispatch, uniformBuffer, storageBuffer, L } from '../gpu.js';

const WGSL = /* wgsl */`
struct P { dims: vec2u, blocks: vec2u, bs: u32, radius: u32, pel: u32, flags: u32, lambda: f32, unit: f32, cutMad: f32, pad: f32 };
@group(0) @binding(0) var curT: texture_2d<f32>;
@group(0) @binding(1) var refT: texture_2d<f32>;
@group(0) @binding(2) var<storage, read> coarse: array<vec4f>;
@group(0) @binding(3) var<storage, read> temporal: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> outF: array<vec4f>;
@group(0) @binding(5) var<storage, read_write> cut: array<atomic<u32>>;
@group(0) @binding(6) var<uniform> p: P;
const HAS_COARSE = 1u; const HAS_TEMPORAL = 2u; const FINAL = 4u;

fn tap(q: vec2i) -> f32 { return textureLoad(refT, clamp(q, vec2i(0), vec2i(p.dims) - vec2i(1)), 0).r; }
fn madAt(b: vec2u, v: vec2f) -> f32 {
  let bs = i32(p.bs); let x0 = i32(b.x) * bs; let y0 = i32(b.y) * bs;
  let x1 = min(x0 + bs, i32(p.dims.x)); let y1 = min(y0 + bs, i32(p.dims.y));
  var acc = 0.0;
  for (var y = y0; y < y1; y++) {
    for (var x = x0; x < x1; x++) {
      let s = vec2f(f32(x), f32(y)) - v; let f0 = floor(s); let a = s - f0; let i = vec2i(f0);
      var r: f32;
      if (a.x == 0.0 && a.y == 0.0) { r = tap(i); }
      else { r = (tap(i) * (1.0 - a.x) + tap(i + vec2i(1, 0)) * a.x) * (1.0 - a.y) + (tap(i + vec2i(0, 1)) * (1.0 - a.x) + tap(i + vec2i(1, 1)) * a.x) * a.y; }
      acc += abs(textureLoad(curT, vec2i(x, y), 0).r - r);
    }
  }
  return acc / f32((x1 - x0) * (y1 - y0));
}
fn med3(a: vec2f, b: vec2f, c: vec2f) -> vec2f { return max(min(a, b), min(max(a, b), c)); }
fn consider(b: vec2u, v: vec2f, pr: vec2f, best: ptr<function, vec2f>, bv: ptr<function, vec2f>) {
  let m = madAt(b, v);
  let c = m + p.lambda * p.unit * (abs(v.x - pr.x) + abs(v.y - pr.y));
  if (c < (*best).x) { *best = vec2f(c, m); *bv = v; }
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= p.blocks.x || id.y >= p.blocks.y) { return; }
  let b = id.xy; let bi = b.y * p.blocks.x + b.x;
  var c = vec2f(0.0); var pr = vec2f(0.0);
  let hasCoarse = (p.flags & HAS_COARSE) != 0u; let fin = (p.flags & FINAL) != 0u;
  if (hasCoarse) {
    c = 2.0 * coarse[bi].xy;
    let li = b.y * p.blocks.x + select(b.x - 1u, b.x, b.x == 0u);
    let ti = select(b.y - 1u, b.y, b.y == 0u) * p.blocks.x + b.x;
    pr = med3(c, 2.0 * coarse[li].xy, 2.0 * coarse[ti].xy);
  }
  let m0 = madAt(b, c);
  var best = vec2f(m0 + p.lambda * p.unit * (abs(c.x - pr.x) + abs(c.y - pr.y)), m0); var bv = c;
  let r = i32(p.radius);
  for (var dy = -r; dy <= r; dy++) { for (var dx = -r; dx <= r; dx++) {
    if (dx != 0 || dy != 0) { consider(b, c + vec2f(f32(dx), f32(dy)), pr, &best, &bv); }
  } }
  consider(b, vec2f(0.0), pr, &best, &bv);
  if (hasCoarse) { consider(b, pr, pr, &best, &bv); }
  if (fin && (p.flags & HAS_TEMPORAL) != 0u) { consider(b, floor(temporal[bi].xy + vec2f(0.5)), pr, &best, &bv); }
  if (fin && p.pel >= 2u) {
    var bm = best.y;
    var s = 0.5;
    for (var k = 0u; k < select(1u, 2u, p.pel >= 4u); k++) {
      let o = bv;
      for (var dy = -1; dy <= 1; dy++) { for (var dx = -1; dx <= 1; dx++) {
        if (dx != 0 || dy != 0) { let v = o + vec2f(f32(dx), f32(dy)) * s; let m = madAt(b, v); if (m < bm) { bm = m; bv = v; } }
      } }
      s = 0.25;
    }
    best.y = bm;
  }
  outF[bi] = vec4f(bv, best.y, 0.0);
  if (fin && best.y > p.cutMad) { atomicAdd(&cut[0], 1u); }
}`;

/** A matcher for one geometry. encode() runs every level from coarse to fine. */
export function createMatcher(gpu, { w, h, block, levels }) {
  const P = pipeline(gpu, 'match', () => computePipeline(gpu, 'match', WGSL, [L.tex(0), L.tex(1), L.ro(2), L.ro(3), L.rw(4), L.rw(5), L.uni(6)]));
  const bw = Math.ceil(w / block), bh = Math.ceil(h / block), nb = bw * bh;
  const coarse = Array.from({ length: levels }, (_, l) => (l === 0 ? null : storageBuffer(gpu, nb * 16, `match L${l}`)));
  const uni = Array.from({ length: levels }, (_, l) => uniformBuffer(gpu, 48, `match L${l} uniform`));
  const dummy = storageBuffer(gpu, 16, 'match dummy');
  return {
    bw, bh, nb,
    /** cur/ref: pyramids (levels[] planes); out: vec4 buffer; cut: counter buffer; temporal: previous vec4 field or null. */
    encode(enc, cur, ref, out, cut, { search, lambda, pel, cutMad, temporal = null }) {
      for (let l = levels - 1; l >= 0; l--) {
        const pl = cur.levels[l], top = l === levels - 1, fin = l === 0;
        const u = new ArrayBuffer(48), U32 = new Uint32Array(u), F32 = new Float32Array(u);
        U32.set([pl.width, pl.height, bw, bh, block >> l, top ? Math.ceil(search / 2 ** (levels - 1)) : fin ? 1 : 2, pel | 0, (top ? 0 : 1) | (fin && temporal ? 2 : 0) | (fin ? 4 : 0)]);
        F32[8] = lambda; F32[9] = 2 ** -l; F32[10] = cutMad;
        gpu.device.queue.writeBuffer(uni[l], 0, u);
        dispatch(gpu, enc, P, [pl, ref.levels[l], top ? dummy : coarse[l + 1], fin && temporal ? temporal : dummy, fin ? out : coarse[l], cut, uni[l]], Math.ceil(bw / 8), Math.ceil(bh / 8), `match L${l}`);
      }
    },
    destroy() { coarse.forEach((b) => b && b.destroy()); uni.forEach((b) => b.destroy()); dummy.destroy(); },
  };
}
