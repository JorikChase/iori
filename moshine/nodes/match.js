// nodes/match.js — hierarchical block matching, one dispatch per pyramid level. Twin of engine-ref.js
// matchBlocks(): same candidates in the same order, strict-less comparisons, data-only sub-pel.
// Output: vec4 per block [mvx, mvy, mad, 0]; the final level also counts blocks with mad > cutMad.
import { pipeline, computePipeline, dispatch, uniformBuffer, storageBuffer, L } from '../gpu.js';
import { lambdaQ } from '../engine-ref.js';

// Candidate-parallel (D42, 2026-10-10): one workgroup per block, one lane per candidate vector. Each lane computes a
// candidate's MAD exactly as before (the same sequential sum in the same order, so the CPU twin is unchanged), and the
// choice — the first candidate in list order with the strictly lowest cost — is a (cost, index) minimum over the lanes,
// which equals the sequential scan. The current block and, for sub-pel, a window of the reference sit in workgroup
// memory, sized per block size (one pipeline each: big arrays cost occupancy). Measured by T4 stageCost1080.
const WG = 32;
const WGSL = (block) => /* wgsl */`
struct P { dims: vec2u, blocks: vec2u, bs: u32, radius: u32, pel: u32, flags: u32, lambda: f32, unit: f32, cutMad: f32, pad: f32 };
@group(0) @binding(0) var curT: texture_2d<f32>;
@group(0) @binding(1) var refT: texture_2d<f32>;
@group(0) @binding(2) var<storage, read> coarse: array<vec4f>;
@group(0) @binding(3) var<storage, read> temporal: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> outF: array<vec4f>;
@group(0) @binding(5) var<storage, read_write> cut: array<atomic<u32>>;
@group(0) @binding(6) var<uniform> p: P;
const HAS_COARSE = 1u; const HAS_TEMPORAL = 2u; const FINAL = 4u;
const WG = ${WG}u;
var<workgroup> curS: array<f32, ${block * block}>;
var<workgroup> win: array<f32, ${(block + 4) * (block + 4)}>;   // the reference around the chosen vector, for sub-pel
var<workgroup> wo: vec2i;
var<workgroup> redC: array<f32, ${WG}>;
var<workgroup> redM: array<f32, ${WG}>;
var<workgroup> redI: array<u32, ${WG}>;
var<workgroup> pick: vec4f;                          // the chosen vector and its mad, broadcast by lane 0

fn tap(q: vec2i) -> f32 { return textureLoad(refT, clamp(q, vec2i(0), vec2i(p.dims) - vec2i(1)), 0).r; }
fn madAt(b: vec2u, v: vec2f) -> f32 {
  let bs = i32(p.bs); let x0 = i32(b.x) * bs; let y0 = i32(b.y) * bs;
  let x1 = x0 + bs; let y1 = y0 + bs;      // full block, pixels clamped at the edge (a power-of-two count: exact average)
  var acc = 0.0;
  for (var y = y0; y < y1; y++) {
    for (var x = x0; x < x1; x++) {
      let s = vec2f(f32(x), f32(y)) - v; let f0 = floor(s); let a = s - f0; let i = vec2i(f0);
      var r: f32;
      if (a.x == 0.0 && a.y == 0.0) { r = tap(i); }
      else { r = (tap(i) * (1.0 - a.x) + tap(i + vec2i(1, 0)) * a.x) * (1.0 - a.y) + (tap(i + vec2i(0, 1)) * (1.0 - a.x) + tap(i + vec2i(1, 1)) * a.x) * a.y; }
      acc += abs(curS[(y - y0) * bs + (x - x0)] - r);
    }
  }
  return acc * p.pad;                      // p.pad = 1 / bs^2, exact (a power of two)
}
// madAt with the reference taps from the window (the same clamped texels, so the same value bit for bit)
fn madW(b: vec2u, v: vec2f) -> f32 {
  let bs = i32(p.bs); let x0 = i32(b.x) * bs; let y0 = i32(b.y) * bs; let W = bs + 4;
  let x1 = x0 + bs; let y1 = y0 + bs;      // full block, pixels clamped at the edge (a power-of-two count: exact average)
  var acc = 0.0;
  for (var y = y0; y < y1; y++) {
    for (var x = x0; x < x1; x++) {
      let s = vec2f(f32(x), f32(y)) - v; let f0 = floor(s); let a = s - f0; let i = vec2i(f0) - wo; let k = i.y * W + i.x;
      var r: f32;
      if (a.x == 0.0 && a.y == 0.0) { r = win[k]; }
      else { r = (win[k] * (1.0 - a.x) + win[k + 1] * a.x) * (1.0 - a.y) + (win[k + W] * (1.0 - a.x) + win[k + W + 1] * a.x) * a.y; }
      acc += abs(curS[(y - y0) * bs + (x - x0)] - r);
    }
  }
  return acc * p.pad;                      // p.pad = 1 / bs^2, exact (a power of two)
}
fn med3(a: vec2f, b: vec2f, c: vec2f) -> vec2f { return max(min(a, b), min(max(a, b), c)); }
fn less(c0: f32, i0: u32, c1: f32, i1: u32) -> bool { return c0 < c1 || (c0 == c1 && i0 < i1); }

@compute @workgroup_size(${WG})
fn main(@builtin(workgroup_id) wid: vec3u, @builtin(local_invocation_index) lid: u32) {
  let b = wid.xy; let bi = b.y * p.blocks.x + b.x;
  let hasCoarse = (p.flags & HAS_COARSE) != 0u; let fin = (p.flags & FINAL) != 0u; let hasT = fin && (p.flags & HAS_TEMPORAL) != 0u;
  // the current block into workgroup memory (the same texels every lane reads)
  { let bs = p.bs; let x0 = b.x * bs; let y0 = b.y * bs;
    for (var k = lid; k < bs * bs; k += WG) {
      let x = x0 + k % bs; let y = y0 + k / bs;
      curS[k] = textureLoad(curT, vec2i(i32(min(x, p.dims.x - 1u)), i32(min(y, p.dims.y - 1u))), 0).r;
    } }
  var c = vec2f(0.0); var pr = vec2f(0.0);
  if (hasCoarse) {
    c = 2.0 * coarse[bi].xy;
    let li = b.y * p.blocks.x + select(b.x - 1u, b.x, b.x == 0u);
    let ti = select(b.y - 1u, b.y, b.y == 0u) * p.blocks.x + b.x;
    pr = med3(c, 2.0 * coarse[li].xy, 2.0 * coarse[ti].xy);
  }
  let tv = select(vec2f(0.0), floor(temporal[bi].xy + vec2f(0.5)), hasT);
  workgroupBarrier();
  // candidates in the CPU's order: c, the grid around c without its centre (row by row), zero, the predictor, temporal
  let r = i32(p.radius); let side = u32(2 * r + 1); let ng = side * side; let ctr = u32(r) * side + u32(r);
  let n = ng + 1u + select(0u, 1u, hasCoarse) + select(0u, 1u, hasT);
  var myC = 3.0e38; var myM = 0.0; var myI = 0xffffffffu;
  for (var k = lid; k < n; k += WG) {
    var v: vec2f;
    if (k == 0u) { v = c; }
    else if (k < ng) { let j = select(k, k - 1u, k - 1u < ctr); v = c + vec2f(f32(i32(j % side) - r), f32(i32(j / side) - r)); }
    else if (k == ng) { v = vec2f(0.0); }
    else if (k == ng + 1u && hasCoarse) { v = pr; }
    else { v = tv; }
    let m = madAt(b, v);
    let cost = m + p.lambda * p.unit * (abs(v.x - pr.x) + abs(v.y - pr.y));
    if (cost < myC) { myC = cost; myM = m; myI = k; }
  }
  redC[lid] = myC; redM[lid] = myM; redI[lid] = myI;
  workgroupBarrier();
  if (lid == 0u) {
    var bc = redC[0]; var bm = redM[0]; var bk = redI[0];
    for (var q = 1u; q < WG; q++) { if (less(redC[q], redI[q], bc, bk)) { bc = redC[q]; bm = redM[q]; bk = redI[q]; } }
    var v: vec2f;
    if (bk == 0u) { v = c; }
    else if (bk < ng) { let j = select(bk, bk - 1u, bk - 1u < ctr); v = c + vec2f(f32(i32(j % side) - r), f32(i32(j / side) - r)); }
    else if (bk == ng) { v = vec2f(0.0); }
    else if (bk == ng + 1u && hasCoarse) { v = pr; }
    else { v = tv; }
    pick = vec4f(v, bm, 0.0);
  }
  workgroupBarrier();
  // sub-pel: 8 neighbours at 1/2, then 8 at 1/4, decided by mad alone (strictly lower than the best so far)
  if (fin && p.pel >= 2u) {
    // every sub-pel tap lies within the integer winner -1 .. +bs + 2 (offsets reach +-0.75): load that window once
    { let bs = i32(p.bs); let W = bs + 4; let o = pick.xy;
      let org = vec2i(i32(b.x) * bs, i32(b.y) * bs) + vec2i(floor(-o - vec2f(0.75)));
      for (var k = lid; k < u32(W * W); k += WG) { win[k] = tap(org + vec2i(i32(k % u32(W)), i32(k / u32(W)))); }
      if (lid == 0u) { wo = org; } }
    workgroupBarrier();
    var s = 0.5;
    for (var it = 0u; it < select(1u, 2u, p.pel >= 4u); it++) {
      let o = pick.xy; let bm0 = pick.z;
      var m = 3.0e38; var v = o;
      if (lid < 8u) { let j = select(lid, lid + 1u, lid >= 4u); v = o + vec2f(f32(i32(j % 3u) - 1), f32(i32(j / 3u) - 1)) * s; m = madW(b, v); }
      redM[lid] = m; redI[lid] = lid;
      workgroupBarrier();
      if (lid == 0u) {
        var mm = redM[0]; var mk = 0u;
        for (var q = 1u; q < 8u; q++) { if (redM[q] < mm) { mm = redM[q]; mk = q; } }
        if (mm < bm0) { let j = select(mk, mk + 1u, mk >= 4u); pick = vec4f(o + vec2f(f32(i32(j % 3u) - 1), f32(i32(j / 3u) - 1)) * s, mm, 0.0); }
      }
      workgroupBarrier();
      s = 0.25;
    }
  }
  if (lid == 0u) {
    outF[bi] = vec4f(pick.xy, pick.z, 0.0);
    if (fin && pick.z > p.cutMad) { atomicAdd(&cut[0], 1u); }
  }
}`;

/** A matcher for one geometry. encode() runs every level from coarse to fine. */
export function createMatcher(gpu, { w, h, block, levels }) {
  const P = pipeline(gpu, 'match:' + block, () => computePipeline(gpu, 'match ' + block, WGSL(block), [L.tex(0), L.tex(1), L.ro(2), L.ro(3), L.rw(4), L.rw(5), L.uni(6)]));
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
        F32[8] = lambdaQ(lambda); F32[9] = 2 ** -l; F32[10] = cutMad; F32[11] = 1 / ((block >> l) * (block >> l));   // exact: blocks are powers of two
        gpu.device.queue.writeBuffer(uni[l], 0, u);
        dispatch(gpu, enc, P, [pl, ref.levels[l], top ? dummy : coarse[l + 1], fin && temporal ? temporal : dummy, fin ? out : coarse[l], cut, uni[l]], bw, bh, `match L${l}`);
      }
    },
    destroy() { coarse.forEach((b) => b && b.destroy()); uni.forEach((b) => b.destroy()); dummy.destroy(); },
  };
}
