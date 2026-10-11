// nodes/fx.js — the image effects (config.js FX) on the GPU and the chain that runs a list of them. Twins of
// fx-ref.js. Every effect shares one binding layout: input, output, field (vec4 per block), aux (the effect's
// previous output for stateful effects), uniform { size, blocks, block, t, seed, flags, a, b, c, d }.
import { pipeline, computePipeline, dispatch, uniformBuffer, storageBuffer, createImage, L, HASH_WGSL, HALF_WGSL, LUMA_WGSL, F16 } from '../gpu.js';
import { FX } from '../config.js';
import { JPEG_Y, JPEG_C, ZIGZAG } from '../fx-ref.js';
import { FIXED_WGSL, fxQ, DCT_T13 } from '../fixed.js';

const HEAD = (fmt) => /* wgsl */`
struct P { size: vec2u, blocks: vec2u, block: u32, t: u32, seed: u32, flags: u32, a: vec4f, b: vec4f, c: vec4f, d: vec4f };
@group(0) @binding(0) var inT: texture_2d<f32>;
@group(0) @binding(1) var dst: texture_storage_2d<${fmt}, write>;
@group(0) @binding(2) var<storage, read> field: array<vec4f>;
@group(0) @binding(3) var auxT: texture_2d<f32>;
@group(0) @binding(4) var<uniform> p: P;
@group(0) @binding(5) var<storage, read> tab: array<f32>;   // per-effect table (fixed.js fxQ): small integers
${HASH_WGSL}
${HALF_WGSL(fmt)}
${LUMA_WGSL}
${FIXED_WGSL}
fn ti(k: i32) -> i32 { return i32(tab[k]); }
const PI = 3.141592653589793;
fn ld(q: vec2i) -> vec4f { return textureLoad(inT, clamp(q, vec2i(0), vec2i(p.size) - vec2i(1)), 0); }
fn ldA(q: vec2i) -> vec4f { return textureLoad(auxT, clamp(q, vec2i(0), vec2i(p.size) - vec2i(1)), 0); }
fn Y601(c: vec4f) -> f32 { return (0.299 * c.r + 0.587 * c.g) + 0.114 * c.b; }
fn bxy(q: vec2i) -> vec2u { return vec2u(min(u32(q.x) / p.block, p.blocks.x - 1u), min(u32(q.y) / p.block, p.blocks.y - 1u)); }
fn mvAt(q: vec2i) -> vec2f { if ((p.flags & 1u) == 0u) { return vec2f(0.0); } let b = bxy(q); return field[b.y * p.blocks.x + b.x].xy; }
// contraction-proof bilinear at q - d / 4096 (d integer): integer floor and fraction, 1/64 weights, exact products
fn bilQ(q: vec2i, d: vec2i) -> vec4f {
  let ux = q.x * 4096 - d.x; let uy = q.y * 4096 - d.y; let x0 = ux >> 12u; let y0 = uy >> 12u;
  let fx = (ux & 4095) >> 6u; let fy = (uy & 4095) >> 6u; let gx = 64 - fx; let gy = 64 - fy;
  let w00 = f32(gx * gy) / 4096.0; let w10 = f32(fx * gy) / 4096.0; let w01 = f32(gx * fy) / 4096.0; let w11 = f32(fx * fy) / 4096.0;
  return (ld(vec2i(x0, y0)) * w00 + ld(vec2i(x0 + 1, y0)) * w10) + (ld(vec2i(x0, y0 + 1)) * w01 + ld(vec2i(x0 + 1, y0 + 1)) * w11); }
/** A motion vector times a gain in 1/4096 px, as integers (both quantized to 1/64 first). */
fn dispQ(mv: vec2f, g: f32) -> vec2i { let gi = i32(floor(g * 64.0 + 0.5)); return vec2i(i32(floor(mv.x * 64.0 + 0.5)) * gi, i32(floor(mv.y * 64.0 + 0.5)) * gi); }
// Y (q15) and chroma (q15, signed) back to RGB in q15 (BT.601 with integer coefficients), clamped
fn ycc(Y: i32, cbi: i32, cri: i32) -> vec3i {
  let cb = clamp(cbi, -18000, 18000); let cr = clamp(cri, -18000, 18000);
  return clamp(vec3i(Y + fdiv(91881 * cr + 32768, 65536), Y - fdiv(22554 * cb + 46802 * cr + 32768, 65536), Y + fdiv(116130 * cb + 32768, 65536)), vec3i(0), vec3i(32768));
}
fn bil(s: vec2f) -> vec4f { let f0 = floor(s); let a = s - f0; let i = vec2i(f0);
  return (ld(i) * (1.0 - a.x) + ld(i + vec2i(1, 0)) * a.x) * (1.0 - a.y) + (ld(i + vec2i(0, 1)) * (1.0 - a.x) + ld(i + vec2i(1, 1)) * a.x) * a.y; }
`;
const MAIN = /* wgsl */`
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= p.size.x || id.y >= p.size.y) { return; }
  textureStore(dst, vec2i(id.xy), Q(fx(vec2i(id.xy))));
}`;

// M8 (2026-10-11): colour arithmetic in q15 integers (fixed.js), trig and pow tables made in JavaScript (dmath.js);
// displace, blockdrag, slice and freeze only move or pick pixels and were exact already.
const BODY = {
  chroma: `fn fx(q: vec2i) -> vec4f {
  let c0 = ld(q); let cw = i32(p.a.x); let ch = i32(p.a.y);
  let o = vec2i(floor(vec2f(q) - p.a.zw)); let cx = fdiv(o.x, cw) * cw; let cy = fdiv(o.y, ch) * ch;
  var cb = 0; var cr = 0;
  for (var j = 0; j < ch; j++) { for (var i = 0; i < cw; i++) { let s = q15v(ld(vec2i(cx + i, cy + j)).rgb);
    cb = cb + fdiv(-11058 * s.r - 21710 * s.g + 32768 * s.b + 32768, 65536); cr = cr + fdiv(32768 * s.r - 27439 * s.g - 5329 * s.b + 32768, 65536); } }
  return vec4f(fromQ15(ycc(y601q(q15v(c0.rgb)), rdiv(cb, cw * ch), rdiv(cr, cw * ch))), c0.a);
}`,
  deblock: `fn fx(q: vec2i) -> vec4f {
  let c0 = ld(q); let dir = u32(p.b.x); let g = i32(p.a.y);
  let a = select(q.y, q.x, dir == 0u); let n = select(i32(p.size.y), i32(p.size.x), dir == 0u); let m = a % g;
  var p0 = 0; var sgn = 0;
  if (m == 0 && a > 0 && a + 1 < n) { p0 = a - 1; sgn = 1; } else if (m == g - 1 && a + 2 < n && a > 0) { p0 = a; sgn = -1; } else { return c0; }
  let ax = select(vec2i(0, 1), vec2i(1, 0), dir == 0u); let base = select(vec2i(q.x, 0), vec2i(0, q.y), dir == 0u);
  let P1 = q15v(ld(base + ax * (p0 - 1)).rgb); let P0 = q15v(ld(base + ax * p0).rgb); let Q0 = q15v(ld(base + ax * (p0 + 1)).rgb); let Q1 = q15v(ld(base + ax * (p0 + 2)).rgb);
  let al = i32(p.a.z); let be = i32(p.a.w);
  if (!(abs(y601q(P0) - y601q(Q0)) < al && abs(y601q(P1) - y601q(P0)) < be && abs(y601q(Q1) - y601q(Q0)) < be)) { return c0; }
  let d = (Q0 - P0) * 4 + (P1 - Q1); let st = i32(p.a.x);
  let dl = clamp(vec3i(rdiv(d.x, 8), rdiv(d.y, 8), rdiv(d.z, 8)), vec3i(-al), vec3i(al));
  let delta = vec3i(fdiv(dl.x * st + 2048, 4096), fdiv(dl.y * st + 2048, 4096), fdiv(dl.z * st + 2048, 4096));
  return vec4f(fromQ15(clamp(q15v(c0.rgb) - delta * sgn, vec3i(0), vec3i(32768))), c0.a);
}`,
  posterise: `fn fx(q: vec2i) -> vec4f {
  let c0 = ld(q); var L = i32(p.a.x); let mq = i32(p.a.y);
  if (mq > 0) { let mv = mvAt(q); let mx = clamp(vq(mv.x), -16383, 16383); let my = clamp(vq(mv.y), -16383, 16383);
    let f = min(4096, isqrt(mx * mx + my * my) * 8); L = max(2, fdiv(L * (4096 - rdiv(mq * f, 4096)), 4096)); }
  let k = L - 1; let c = q15v(c0.rgb);
  let nq = vec3i(fdiv(c.r * k + 16384, 32768), fdiv(c.g * k + 16384, 32768), fdiv(c.b * k + 16384, 32768));
  return vec4f(fromQ15(vec3i(rdiv(nq.r * 32768, k), rdiv(nq.g * 32768, k), rdiv(nq.b * 32768, k))), c0.a);
}`,
  stripes: `fn fx(q: vec2i) -> vec4f {
  let c0 = ld(q); let B = p.block; let bx = min(u32(q.x) / B, p.blocks.x - 1u); let by = u32(q.y) / B; let bi = by * p.blocks.x + bx;
  let th = p.t / max(1u, u32(p.a.z));
  if (!(hash3(bi, th, p.seed * 4u + 3u) < p.a.x)) { return c0; }
  let u = i32(floor(hash3(bi, th, p.seed * 4u + 1u) * p.a.w)); let v = i32(floor(hash3(bi, th, p.seed * 4u + 2u) * p.a.w));
  let amp = fdiv((2 * h12(bi, th, p.seed * 8u + 5u) + 1 - 4096) * i32(p.a.y), 4096);
  let lx = i32(u32(q.x) - bx * B); let ly = i32(u32(q.y) - by * B);
  let b15 = fdiv(ti(lx * 8 + u) * ti(ly * 8 + v), 32768); let dl = fdiv(amp * b15, 4096);
  return vec4f(fromQ15(clamp(q15v(c0.rgb) + vec3i(dl), vec3i(0), vec3i(32768))), c0.a);
}`,
  echo: `fn fx(q: vec2i) -> vec4f {
  let c0 = ld(q); if (p.b.x < 0.5) { return c0; }
  var sq = q; if (p.a.z > 0.5) { let mv = mvAt(q); sq = vec2i(fdiv(q.x * 64 - vq(mv.x) + 32, 64), fdiv(q.y * 64 - vq(mv.y) + 32, 64)); }
  let pr = q15v(ldA(sq).rgb); let c = q15v(c0.rgb); let d = i32(p.a.x); let mode = u32(p.a.y);
  let pd = vec3i(fdiv(pr.r * d + 2048, 4096), fdiv(pr.g * d + 2048, 4096), fdiv(pr.b * d + 2048, 4096));
  if (mode == 1u) { return vec4f(fromQ15(max(c, pd)), c0.a); }
  if (mode == 2u) { return vec4f(fromQ15(min(c + pd, vec3i(32768))), c0.a); }
  let e = 4096 - d;
  return vec4f(fromQ15(vec3i(fdiv(c.r * e + pr.r * d + 2048, 4096), fdiv(c.g * e + pr.g * d + 2048, 4096), fdiv(c.b * e + pr.b * d + 2048, 4096))), c0.a);
}`,
  displace: `fn fx(q: vec2i) -> vec4f { return bilQ(q, dispQ(mvAt(q), p.a.x)); }`,   // R2 made fractional fields common: contraction-proof
  blockdrag: `fn fx(q: vec2i) -> vec4f {
  let c0 = ld(q); let B = p.block; let bx = min(u32(q.x) / B, p.blocks.x - 1u); let by = u32(q.y) / B; let bi = by * p.blocks.x + bx;
  let th = p.t / max(1u, u32(p.a.z));
  if (!(hash3(bi, th, p.seed * 4u + 3u) < p.a.x)) { return c0; }
  if (p.a.w > 0.5) { let nb = p.blocks.x * p.blocks.y; let j = min(nb - 1u, u32(floor(hash3(bi, th, p.seed * 4u + 1u) * f32(nb))));
    return ld(vec2i(i32((j % p.blocks.x) * B) + (q.x - i32(bx * B)), i32((j / p.blocks.x) * B) + (q.y - i32(by * B)))); }
  let ox = i32(floor((hash3(bi, th, p.seed * 4u) * 2.0 - 1.0) * p.a.y)); let oy = i32(floor((hash3(bi, th, p.seed * 4u + 1u) * 2.0 - 1.0) * p.a.y));
  return ld(q + vec2i(ox, oy));
}`,
  slice: `fn fx(q: vec2i) -> vec4f {
  let H = max(1u, u32(p.a.y)); let band = u32(q.y) / H; let th = p.t / max(1u, u32(p.a.w)); var sh = 0;
  if (hash3(band, th, p.seed * 4u + 3u) < p.a.x) { sh = i32(floor((hash3(band, th, p.seed * 4u) * 2.0 - 1.0) * p.a.z)); }
  if ((q.y & 1) == 1) { sh = sh + i32(p.b.x); }
  let W = i32(p.size.x); return ld(vec2i((((q.x - sh) % W) + W) % W, q.y));
}`,
  rgbsplit: `fn fx(q: vec2i) -> vec4f {
  let c0 = ld(q); let mv = mvAt(q); let mz = i32(p.a.z);
  let vx = i32(p.a.x) + fdiv(clamp(vq(mv.x), -16383, 16383) * mz + 32, 64); let vy = i32(p.a.y) + fdiv(clamp(vq(mv.y), -16383, 16383) * mz + 32, 64);
  let r = ld(vec2i(fdiv(q.x * 64 - vx + 32, 64), fdiv(q.y * 64 - vy + 32, 64))).r; let b = ld(vec2i(fdiv(q.x * 64 + vx + 32, 64), fdiv(q.y * 64 + vy + 32, 64))).b;
  return vec4f(r, c0.g, b, c0.a);
}`,
  colour: `fn lut(x: i32) -> i32 { let i = x >> 3u; let f = x & 7; if (i >= 4096) { return ti(4096); } return (ti(i) * (8 - f) + ti(i + 1) * f + 4) >> 3u; }
fn fx(q: vec2i) -> vec4f {
  let c0 = ld(q); let c = q15v(c0.rgb); let t = vec3i(lut(c.r), lut(c.g), lut(c.b));
  let m0 = vec3i(i32(p.a.x), i32(p.a.y), i32(p.a.z)); let m1 = vec3i(i32(p.a.w), i32(p.b.x), i32(p.b.y)); let m2 = vec3i(i32(p.b.z), i32(p.b.w), i32(p.c.x));
  let off = i32(p.c.y); let thr = i32(p.c.z);
  var o = vec3i(fdiv(dot(m0, t) + 1024, 2048), fdiv(dot(m1, t) + 1024, 2048), fdiv(dot(m2, t) + 1024, 2048)) + vec3i(off);
  if (thr >= 0) { let oc = clamp(o, vec3i(-32768), vec3i(65536)); o = select(vec3i(0), vec3i(32768), 1225 * oc.r + 2404 * oc.g + 467 * oc.b > thr * 4096); }
  return vec4f(fromQ15(clamp(o, vec3i(0), vec3i(32768))), c0.a);
}`,
  freeze: `fn lostAt(bx: u32, by: u32) -> bool {
  let life = max(1u, u32(p.a.z)); let ch = max(1u, u32(p.a.w)); let cw = max(1u, u32(floor(p.a.w * p.b.x)));
  let layers = min(4u, max(1u, u32(p.a.y))); let s = p.seed * 4u + 2u;
  for (var l = 0u; l < layers; l++) {
    let ox = u32(floor(hash3(l, 1u, s) * f32(cw))); let oy = u32(floor(hash3(l, 2u, s) * f32(ch)));
    let cell = ((bx + ox) / cw) * 7919u + (by + oy) / ch;
    let shift = u32(floor(hash3(cell, l, s) * f32(life))); let epoch = (p.t + shift) / life;
    if (hash3(cell, epoch * 4u + l, s) < p.a.x) { return true; }
  }
  return false;
}
fn fx(q: vec2i) -> vec4f {
  if (p.b.y > 0.5 && lostAt(min(u32(q.x) / p.block, p.blocks.x - 1u), u32(q.y) / p.block)) { return ldA(q); }
  return ld(q);
}`,
};

const lit = (arr, type = 'f32') => `array<${type}, ${arr.length}>(${Array.from(arr, (v) => (type === 'f32' ? (Number.isInteger(v) ? v.toFixed(1) : v.toPrecision(9)) : type === 'i32' ? String(v) : v + 'u')).join(', ')})`;
// the integer DCT: samples in 1/16 level (JPEG's 0..255 x 16, centred), the basis in 1/8192, quantisers from the table
const DCT_WGSL = (fmt) => HEAD(fmt) + /* wgsl */`
var<private> T: array<i32, 64> = ${lit(DCT_T13, 'i32')};
var<private> ZZ: array<u32, 64> = ${lit(ZIGZAG, 'u32')};
var<workgroup> F: array<vec3i, 64>;
var<workgroup> R: array<vec3i, 64>;
fn r13(v: vec3i) -> vec3i { return vec3i(rdiv(v.x, 8192), rdiv(v.y, 8192), rdiv(v.z, 8192)); }
@compute @workgroup_size(8, 8)
fn main(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_id) li: vec3u) {
  let x = li.x; let y = li.y; let k = y * 8u + x;
  let q = vec2i(i32(wg.x * 8u + x), i32(wg.y * 8u + y)); let c = ld(q); let s = q15v(c.rgb);
  let cb = fdiv(-11058 * s.r - 21710 * s.g + 32768 * s.b + 32768, 65536); let cr = fdiv(32768 * s.r - 27439 * s.g - 5329 * s.b + 32768, 65536);
  F[k] = vec3i(rdiv(y601q(s) * 4080, 32768) - 2048, rdiv(cb * 4080, 32768), rdiv(cr * 4080, 32768));
  workgroupBarrier();
  var acc = vec3i(0);
  for (var yy = 0u; yy < 8u; yy++) { var row = vec3i(0); for (var xx = 0u; xx < 8u; xx++) { row = row + T[x * 8u + xx] * F[yy * 8u + xx]; } acc = acc + T[y * 8u + yy] * r13(row); }
  let co = r13(acc); let qy = ti(i32(k)); let qc = ti(64 + i32(k));
  var Fq = vec3i(rdiv(co.x, qy) * qy, rdiv(co.y, qc) * qc, rdiv(co.z, qc) * qc);
  if ((p.a.w > 0.5 && k != 0u) || (p.a.w <= 0.5 && f32(ZZ[k]) >= p.a.z)) { Fq = vec3i(0); }
  R[k] = Fq;
  workgroupBarrier();
  var r = vec3i(0);
  for (var vv = 0u; vv < 8u; vv++) { var row = vec3i(0); for (var uu = 0u; uu < 8u; uu++) { row = row + T[uu * 8u + x] * R[vv * 8u + uu]; } r = r + T[vv * 8u + y] * r13(row); }
  let rr = r13(r);
  if (u32(q.x) < p.size.x && u32(q.y) < p.size.y) {
    textureStore(dst, q, Q(vec4f(fromQ15(ycc(rdiv((rr.x + 2048) * 32768, 4080), rdiv(rr.y * 32768, 4080), rdiv(rr.z * 32768, 4080))), c.a)));
  }
}`;

/** An effect's params and table (fixed.js fxQ: integers where the kernel computes). */
const packs = (o, block) => fxQ(o, block, { Y: JPEG_Y, C: JPEG_C });

function fxPipeline(gpu, fx, format) {
  return pipeline(gpu, `fx:${fx}:${format}`, () => computePipeline(gpu, `fx ${fx}`, fx === 'dct' ? DCT_WGSL(format) : HEAD(format) + BODY[fx] + MAIN,
    [L.tex(0), L.out(1, format), L.ro(2), L.tex(3), L.uni(4), L.ro(5)]));
}

/**
 * An effect chain for one geometry. encode(enc, input, dst, list, { t, seed, field }) writes the result into
 * dst (never read and written in one pass: intermediates ping-pong through two internal images). Stateful
 * effects keep their output per list position; reset() forgets it (the loop's begin()).
 */
export function createFxChain(gpu, { w, h, block }, format = F16, label = 'fx') {
  const bw = Math.ceil(w / block), bh = Math.ceil(h / block), unis = [], states = [], has = [];
  const dummy = storageBuffer(gpu, 16, label + ' no field'), tabs = []; let pp = null;
  /** Effect i's params and table (uploaded only when its values change). */
  const prep = (i, o) => {
    const key = JSON.stringify(o); let T = tabs[i];
    if (T && T.key === key) return T;
    const q = packs(o, block);
    if (q.table) { if (!T?.buf || T.buf.size < q.table.byteLength) { T?.buf?.destroy(); T = { buf: storageBuffer(gpu, q.table.byteLength, `${label} table ${i}`) }; } gpu.device.queue.writeBuffer(T.buf, 0, q.table); }
    else if (!T) T = {};
    T.key = key; T.passes = q.passes; T.has = !!q.table; return (tabs[i] = T);
  };
  const uni = (k) => { while (unis.length <= k) unis.push(uniformBuffer(gpu, 96, `${label} uniform ${unis.length}`)); return unis[k]; };
  return {
    reset() { has.length = 0; },
    encode(enc, input, dst, list, { t, seed, field = null }) {
      const act = list.map((o, i) => [o, i]).filter(([o]) => o.on !== false && FX[o.fx]);
      if (!act.length) { enc.copyTextureToTexture({ texture: input }, { texture: dst }, [w, h]); return; }
      if (!pp) pp = [createImage(gpu, w, h, format, label + ' a'), createImage(gpu, w, h, format, label + ' b')];
      const passes = act.flatMap(([o, i]) => { const T = prep(i, o); return T.passes.map((pk) => ({ o, i, pk, T })); });
      let cur = input, slot = 0;
      passes.forEach(({ o, i, pk, T }, n) => {
        const last = n === passes.length - 1, target = last ? dst : pp[n % 2];
        const stateful = !!FX[o.fx].stateful;
        if (stateful && !states[i]) states[i] = createImage(gpu, w, h, format, `${label} state ${i}`);
        const u = new ArrayBuffer(96), U32 = new Uint32Array(u), F32 = new Float32Array(u);
        U32.set([w, h, bw, bh, block, t, seed, field ? 1 : 0]); F32.set(pk, 8);
        if (stateful) F32[o.fx === 'freeze' ? 13 : 12] = has[i] ? 1 : 0;           // b.y (freeze) / b.x (echo): "the previous output exists"
        gpu.device.queue.writeBuffer(uni(slot), 0, u);
        dispatch(gpu, enc, fxPipeline(gpu, o.fx, format), [cur, target, field || dummy, stateful ? states[i] : cur, uni(slot), T.has ? T.buf : dummy], Math.ceil(w / 8), Math.ceil(h / 8), 'fx ' + o.fx);
        slot++;
        if (stateful) { enc.copyTextureToTexture({ texture: target }, { texture: states[i] }, [w, h]); has[i] = true; }
        cur = target;
      });
    },
    /** Copies of the stateful effects' previous outputs (M6 checkpoints): { has: [bool], tex: [GPUTexture|null] }. */
    snapshot(enc) {
      const tex = states.map((x, i) => {
        if (!x || !has[i]) return null;
        const c = createImage(gpu, w, h, format, `${label} snapshot ${i}`); enc.copyTextureToTexture({ texture: x }, { texture: c }, [w, h]); return c;
      });
      return { has: [...has], tex };
    },
    restore(enc, snap) {
      has.length = 0;
      snap.has.forEach((v, i) => {
        has[i] = v; if (!v || !snap.tex[i]) return;
        if (!states[i]) states[i] = createImage(gpu, w, h, format, `${label} state ${i}`);
        enc.copyTextureToTexture({ texture: snap.tex[i] }, { texture: states[i] }, [w, h]);
      });
    },
    destroy() { unis.forEach((b) => b.destroy()); states.forEach((x) => x && x.destroy()); tabs.forEach((T) => T?.buf?.destroy()); if (pp) pp.forEach((x) => x.destroy()); dummy.destroy(); },
  };
}
