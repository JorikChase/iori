// nodes/fx.js — the image effects (config.js FX) on the GPU and the chain that runs a list of them. Twins of
// fx-ref.js. Every effect shares one binding layout: input, output, field (vec4 per block), aux (the effect's
// previous output for stateful effects), uniform { size, blocks, block, t, seed, flags, a, b, c, d }.
import { pipeline, computePipeline, dispatch, uniformBuffer, storageBuffer, createImage, L, HASH_WGSL, HALF_WGSL, LUMA_WGSL, F16 } from '../gpu.js';
import { FX } from '../config.js';
import { DCT_T, JPEG_Y, JPEG_C, ZIGZAG, FX_SCHEMES, jpegScale } from '../fx-ref.js';

const HEAD = (fmt) => /* wgsl */`
struct P { size: vec2u, blocks: vec2u, block: u32, t: u32, seed: u32, flags: u32, a: vec4f, b: vec4f, c: vec4f, d: vec4f };
@group(0) @binding(0) var inT: texture_2d<f32>;
@group(0) @binding(1) var dst: texture_storage_2d<${fmt}, write>;
@group(0) @binding(2) var<storage, read> field: array<vec4f>;
@group(0) @binding(3) var auxT: texture_2d<f32>;
@group(0) @binding(4) var<uniform> p: P;
${HASH_WGSL}
${HALF_WGSL(fmt)}
${LUMA_WGSL}
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
fn bil(s: vec2f) -> vec4f { let f0 = floor(s); let a = s - f0; let i = vec2i(f0);
  return (ld(i) * (1.0 - a.x) + ld(i + vec2i(1, 0)) * a.x) * (1.0 - a.y) + (ld(i + vec2i(0, 1)) * (1.0 - a.x) + ld(i + vec2i(1, 1)) * a.x) * a.y; }
`;
const MAIN = /* wgsl */`
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= p.size.x || id.y >= p.size.y) { return; }
  textureStore(dst, vec2i(id.xy), Q(fx(vec2i(id.xy))));
}`;

const BODY = {
  chroma: `fn fx(q: vec2i) -> vec4f {
  let c0 = ld(q); let Y = Y601(c0); let cw = i32(p.a.x); let ch = i32(p.a.y);
  let o = vec2i(floor(vec2f(q) - p.a.zw));
  let cx = i32(floor(f32(o.x) / f32(cw))) * cw; let cy = i32(floor(f32(o.y) / f32(ch))) * ch;
  var cb = 0.0; var cr = 0.0;
  for (var j = 0; j < ch; j++) { for (var i = 0; i < cw; i++) { let s = ld(vec2i(cx + i, cy + j));
    cb = cb + ((-0.168736 * s.r + -0.331264 * s.g) + 0.5 * s.b); cr = cr + ((0.5 * s.r + -0.418688 * s.g) + -0.081312 * s.b); } }
  cb = cb / f32(cw * ch); cr = cr / f32(cw * ch);
  return vec4f(clamp(vec3f(Y + 1.402 * cr, (Y - 0.344136 * cb) - 0.714136 * cr, Y + 1.772 * cb), vec3f(0.0), vec3f(1.0)), c0.a);
}`,
  deblock: `fn fx(q: vec2i) -> vec4f {
  let c0 = ld(q); let dir = u32(p.b.x); let g = i32(p.a.y);
  let a = select(q.y, q.x, dir == 0u); let n = select(i32(p.size.y), i32(p.size.x), dir == 0u); let m = a % g;
  var p0 = 0; var sgn = 0.0;
  if (m == 0 && a > 0 && a + 1 < n) { p0 = a - 1; sgn = 1.0; } else if (m == g - 1 && a + 2 < n && a > 0) { p0 = a; sgn = -1.0; } else { return c0; }
  let ax = select(vec2i(0, 1), vec2i(1, 0), dir == 0u); let base = select(vec2i(q.x, 0), vec2i(0, q.y), dir == 0u);
  let P1 = ld(base + ax * (p0 - 1)); let P0 = ld(base + ax * p0); let Q0 = ld(base + ax * (p0 + 1)); let Q1 = ld(base + ax * (p0 + 2));
  let al = p.a.z; let be = p.a.w;
  if (!(abs(Y601(P0) - Y601(Q0)) < al && abs(Y601(P1) - Y601(P0)) < be && abs(Y601(Q1) - Y601(Q0)) < be)) { return c0; }
  let delta = clamp(((Q0.rgb - P0.rgb) * 4.0 + (P1.rgb - Q1.rgb)) / 8.0, vec3f(-al), vec3f(al)) * p.a.x;
  return vec4f(clamp(c0.rgb - sgn * delta, vec3f(0.0), vec3f(1.0)), c0.a);
}`,
  posterise: `fn fx(q: vec2i) -> vec4f {
  let c0 = ld(q); var Lv = p.a.x;
  if (p.a.y > 0.0) { let mv = mvAt(q); let m = sqrt(mv.x * mv.x + mv.y * mv.y); Lv = max(2.0, floor(Lv * (1.0 - p.a.y * min(1.0, m / 8.0)))); }
  let k = Lv - 1.0; return vec4f(floor(c0.rgb * k + 0.5) / k, c0.a);
}`,
  stripes: `fn fx(q: vec2i) -> vec4f {
  let c0 = ld(q); let B = p.block; let bx = min(u32(q.x) / B, p.blocks.x - 1u); let by = u32(q.y) / B; let bi = by * p.blocks.x + bx;
  let th = p.t / max(1u, u32(p.a.z));
  if (!(hash3(bi, th, p.seed * 4u + 3u) < p.a.x)) { return c0; }
  let u = floor(hash3(bi, th, p.seed * 4u + 1u) * p.a.w); let v = floor(hash3(bi, th, p.seed * 4u + 2u) * p.a.w);
  let amp = p.a.y * ((hash3(bi, th, p.seed * 8u + 5u) - 0.5) * 2.0);
  let lx = f32(u32(q.x) - bx * B); let ly = f32(u32(q.y) - by * B);
  let basis = cos(PI * ((2.0 * lx + 1.0) * u) / f32(2u * B)) * cos(PI * ((2.0 * ly + 1.0) * v) / f32(2u * B));
  return vec4f(clamp(c0.rgb + amp * basis, vec3f(0.0), vec3f(1.0)), c0.a);
}`,
  echo: `fn fx(q: vec2i) -> vec4f {
  let c0 = ld(q); if (p.b.x < 0.5) { return c0; }
  var sq = q; if (p.a.z > 0.5) { let mv = mvAt(q); sq = vec2i(floor(vec2f(q) - mv + vec2f(0.5))); }
  let pr = ldA(sq).rgb; let d = p.a.x; let mode = u32(p.a.y);
  if (mode == 1u) { return vec4f(max(c0.rgb, pr * d), c0.a); }
  if (mode == 2u) { return vec4f(clamp(c0.rgb + pr * d, vec3f(0.0), vec3f(1.0)), c0.a); }
  return vec4f(c0.rgb * (1.0 - d) + pr * d, c0.a);
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
  let c0 = ld(q); let mv = mvAt(q); let v = vec2f(p.a.x + mv.x * p.a.z, p.a.y + mv.y * p.a.z);
  return vec4f(ld(vec2i(floor(vec2f(q) - v + vec2f(0.5)))).r, c0.g, ld(vec2i(floor(vec2f(q) + v + vec2f(0.5)))).b, c0.a);
}`,
  colour: `fn pw(v: f32, e: f32) -> f32 { return select(0.0, pow(v, e), v > 0.0); }
fn fx(q: vec2i) -> vec4f {
  let c0 = ld(q); let span = max(1e-4, p.a.y - p.a.x); let ig = 1.0 / p.a.z; let an = (p.b.x * PI) / 180.0; let ca = cos(an); let sa = sin(an);
  var c = vec3f(pw(clamp((c0.r - p.a.x) / span, 0.0, 1.0), ig), pw(clamp((c0.g - p.a.x) / span, 0.0, 1.0), ig), pw(clamp((c0.b - p.a.x) / span, 0.0, 1.0), ig));
  let l = (0.299 * c.r + 0.587 * c.g) + 0.114 * c.b;
  c = vec3f(l) + (c - vec3f(l)) * p.a.w;
  let I = (0.596 * c.r - 0.274 * c.g) - 0.322 * c.b; let Qq = (0.211 * c.r - 0.523 * c.g) + 0.312 * c.b;
  let I2 = I * ca - Qq * sa; let Q2 = I * sa + Qq * ca;
  c = vec3f((l + 0.956 * I2) + 0.621 * Q2, (l - 0.272 * I2) - 0.647 * Q2, (l - 1.106 * I2) + 1.703 * Q2);
  c = c + (vec3f(1.0) - 2.0 * c) * p.b.y;
  if (p.b.z > 0.0) { let l2 = (0.299 * c.r + 0.587 * c.g) + 0.114 * c.b; c = vec3f(select(0.0, 1.0, l2 > p.b.z)); }
  return vec4f(clamp(c, vec3f(0.0), vec3f(1.0)), c0.a);
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

const lit = (arr, type = 'f32') => `array<${type}, ${arr.length}>(${Array.from(arr, (v) => (type === 'f32' ? (Number.isInteger(v) ? v.toFixed(1) : v.toPrecision(9)) : v + 'u')).join(', ')})`;
const DCT_WGSL = (fmt) => HEAD(fmt) + /* wgsl */`
var<private> T: array<f32, 64> = ${lit(DCT_T)};
var<private> QY: array<f32, 64> = ${lit(JPEG_Y)};
var<private> QC: array<f32, 64> = ${lit(JPEG_C)};
var<private> ZZ: array<u32, 64> = ${lit(ZIGZAG, 'u32')};
var<workgroup> F: array<vec3f, 64>;
var<workgroup> R: array<vec3f, 64>;
@compute @workgroup_size(8, 8)
fn main(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_id) li: vec3u) {
  let x = li.x; let y = li.y; let k = y * 8u + x;
  let q = vec2i(i32(wg.x * 8u + x), i32(wg.y * 8u + y)); let c = ld(q);
  F[k] = vec3f((((0.299 * c.r + 0.587 * c.g) + 0.114 * c.b) * 255.0) - 128.0, ((-0.168736 * c.r + -0.331264 * c.g) + 0.5 * c.b) * 255.0, ((0.5 * c.r + -0.418688 * c.g) + -0.081312 * c.b) * 255.0);
  workgroupBarrier();
  var acc = vec3f(0.0);
  for (var yy = 0u; yy < 8u; yy++) { var row = vec3f(0.0); for (var xx = 0u; xx < 8u; xx++) { row = row + T[x * 8u + xx] * F[yy * 8u + xx]; } acc = acc + T[y * 8u + yy] * row; }
  let S = p.a.x; let qy = max(1.0, floor((QY[k] * S + 50.0) / 100.0)); let qc = max(1.0, floor((QC[k] * S + 50.0) / 100.0)) * p.a.y;
  var Fq = vec3f(round(acc.x / qy) * qy, round(acc.y / qc) * qc, round(acc.z / qc) * qc);
  if ((p.a.w > 0.5 && k != 0u) || (p.a.w <= 0.5 && f32(ZZ[k]) >= p.a.z)) { Fq = vec3f(0.0); }
  R[k] = Fq;
  workgroupBarrier();
  var r = vec3f(0.0);
  for (var vv = 0u; vv < 8u; vv++) { var row = vec3f(0.0); for (var uu = 0u; uu < 8u; uu++) { row = row + T[uu * 8u + x] * R[vv * 8u + uu]; } r = r + T[vv * 8u + y] * row; }
  if (u32(q.x) < p.size.x && u32(q.y) < p.size.y) {
    let Y = (r.x + 128.0) / 255.0; let Cb = r.y / 255.0; let Cr = r.z / 255.0;
    textureStore(dst, q, Q(vec4f(clamp(vec3f(Y + 1.402 * Cr, (Y - 0.344136 * Cb) - 0.714136 * Cr, Y + 1.772 * Cb), vec3f(0.0), vec3f(1.0)), c.a)));
  }
}`;

/** Pack an effect's params into the shader's a, b vec4s; deblock returns one pack per pass. */
function packs(o) {
  switch (o.fx) {
    case 'dct': return [[jpegScale(o.quality), o.chroma, Math.round(o.cutoff), o.dcOnly ? 1 : 0, 0, 0, 0, 0]];
    case 'chroma': { const [cw, ch] = FX_SCHEMES[o.scheme] || [2, 2]; return [[cw, ch, o.dx, o.dy, 0, 0, 0, 0]]; }
    case 'deblock': return [0, 1].map((dir) => [o.strength, o.grid, o.alpha, o.beta, dir, 0, 0, 0]);
    case 'posterise': return [[o.levels, o.motion, 0, 0, 0, 0, 0, 0]];
    case 'stripes': return [[o.amount, o.contrast, o.hold, o.freq, 0, 0, 0, 0]];
    case 'echo': return [[o.decay, { mix: 0, max: 1, add: 2 }[o.mode] ?? 0, o.warp ? 1 : 0, 0, 0, 0, 0, 0]];
    case 'displace': return [[o.gain, 0, 0, 0, 0, 0, 0, 0]];
    case 'blockdrag': return [[o.prob, o.offset, o.hold, o.mode === 'shuffle' ? 1 : 0, 0, 0, 0, 0]];
    case 'slice': return [[o.prob, o.height, o.shift, o.hold, Math.round(o.field), 0, 0, 0]];
    case 'rgbsplit': return [[o.dx, o.dy, o.motion, 0, 0, 0, 0, 0]];
    case 'colour': return [[o.black, o.white, o.gamma, o.sat, o.hue, o.invert, o.threshold, 0]];
    case 'freeze': return [[o.density, o.layers, o.life, o.scale, o.aspect, 0, 0, 0]];
  }
  return [[0, 0, 0, 0, 0, 0, 0, 0]];
}

function fxPipeline(gpu, fx, format) {
  return pipeline(gpu, `fx:${fx}:${format}`, () => computePipeline(gpu, `fx ${fx}`, fx === 'dct' ? DCT_WGSL(format) : HEAD(format) + BODY[fx] + MAIN,
    [L.tex(0), L.out(1, format), L.ro(2), L.tex(3), L.uni(4)]));
}

/**
 * An effect chain for one geometry. encode(enc, input, dst, list, { t, seed, field }) writes the result into
 * dst (never read and written in one pass: intermediates ping-pong through two internal images). Stateful
 * effects keep their output per list position; reset() forgets it (the loop's begin()).
 */
export function createFxChain(gpu, { w, h, block }, format = F16, label = 'fx') {
  const bw = Math.ceil(w / block), bh = Math.ceil(h / block), unis = [], states = [], has = [];
  const dummy = storageBuffer(gpu, 16, label + ' no field'); let pp = null;
  const uni = (k) => { while (unis.length <= k) unis.push(uniformBuffer(gpu, 96, `${label} uniform ${unis.length}`)); return unis[k]; };
  return {
    reset() { has.length = 0; },
    encode(enc, input, dst, list, { t, seed, field = null }) {
      const act = list.map((o, i) => [o, i]).filter(([o]) => o.on !== false && FX[o.fx]);
      if (!act.length) { enc.copyTextureToTexture({ texture: input }, { texture: dst }, [w, h]); return; }
      if (!pp) pp = [createImage(gpu, w, h, format, label + ' a'), createImage(gpu, w, h, format, label + ' b')];
      const passes = act.flatMap(([o, i]) => packs(o).map((pk) => ({ o, i, pk })));
      let cur = input, slot = 0;
      passes.forEach(({ o, i, pk }, n) => {
        const last = n === passes.length - 1, target = last ? dst : pp[n % 2];
        const stateful = !!FX[o.fx].stateful;
        if (stateful && !states[i]) states[i] = createImage(gpu, w, h, format, `${label} state ${i}`);
        const u = new ArrayBuffer(96), U32 = new Uint32Array(u), F32 = new Float32Array(u);
        U32.set([w, h, bw, bh, block, t, seed, field ? 1 : 0]); F32.set(pk, 8);
        if (stateful) F32[o.fx === 'freeze' ? 13 : 12] = has[i] ? 1 : 0;           // b.y (freeze) / b.x (echo): "the previous output exists"
        gpu.device.queue.writeBuffer(uni(slot), 0, u);
        dispatch(gpu, enc, fxPipeline(gpu, o.fx, format), [cur, target, field || dummy, stateful ? states[i] : cur, uni(slot)], Math.ceil(w / 8), Math.ceil(h / 8), 'fx ' + o.fx);
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
    destroy() { unis.forEach((b) => b.destroy()); states.forEach((x) => x && x.destroy()); if (pp) pp.forEach((x) => x.destroy()); dummy.destroy(); },
  };
}
