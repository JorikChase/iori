// nodes/code.js — the code stage: residual paint-in, intra refresh, random block refresh, sweep, hard reset.
// Twin of engine-ref.js code(). Writes the next history.
import { pipeline, computePipeline, dispatch, uniformBuffer, L, HASH_WGSL, LUMA_WGSL, HALF_WGSL, F16 } from '../gpu.js';
import { FIXED_WGSL, qs } from '../fixed.js';

const WGSL = (fmt) => /* wgsl */`
struct P { size: vec2u, blocks: vec2u, block: u32, t: u32, seed: u32, hard: u32, cutThresh: u32, sweepBand: u32, resMode: u32, allowCode: u32,
           honourCut: f32, intraMad: f32, intraRate: f32, blocksFrac: f32, sweepSpeed: f32, resGain: f32, resSteps: f32, dead: f32,
           dropCut: u32, pad0: u32, pad1: u32, pad2: u32 };
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var rsrc: texture_2d<f32>;
@group(0) @binding(2) var pred: texture_2d<f32>;
@group(0) @binding(3) var mcT: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<${fmt}, write>;
@group(0) @binding(5) var<storage, read> field: array<vec4f>;
@group(0) @binding(6) var<storage, read> cut: array<u32>;
@group(0) @binding(7) var<uniform> p: P;
@group(0) @binding(8) var resT: texture_2d<f32>;
${HASH_WGSL}
${LUMA_WGSL}
${HALF_WGSL(fmt)}
${FIXED_WGSL}
// M8: integer residuals (luma in 1/32768, no division, no multiply-add): identical in every browser
fn Ys(x: i32, y: i32) -> i32 { return i32(lumaOf(textureLoad(src, clamp(vec2i(x, y), vec2i(0), vec2i(p.size) - vec2i(1)), 0)) * 32768.0); }
fn Yp(x: i32, y: i32) -> i32 { return i32(lumaOf(textureLoad(pred, clamp(vec2i(x, y), vec2i(0), vec2i(p.size) - vec2i(1)), 0)) * 32768.0); }
fn boxS(x: i32, y: i32) -> i32 { var s = 0; for (var dy = -1; dy <= 1; dy++) { for (var dx = -1; dx <= 1; dx++) { s = s + Ys(x + dx, y + dy); } } return s; }
fn boxP(x: i32, y: i32) -> i32 { var s = 0; for (var dy = -1; dy <= 1; dy++) { for (var dx = -1; dx <= 1; dx++) { s = s + Yp(x + dx, y + dy); } } return s; }
/** The quantised residual n = round(r x steps) (r = num / den) as a colour offset gain x n / steps, exact in f32. */
fn resOff(num: i32, den: i32) -> f32 { let st = i32(p.resSteps); let n = fdiv(2 * num * st + den, 2 * den); return f32(rdiv(i32(p.resGain) * n * 8, st)) * (1.0 / 32768.0); }

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= p.size.x || id.y >= p.size.y) { return; }
  let q = vec2i(id.xy); let x = q.x; let y = q.y;
  let bx = min(id.x / p.block, p.blocks.x - 1u); let by = id.y / p.block; let bi = by * p.blocks.x + bx;
  let isCut = cut[0] > p.cutThresh;
  if (p.hard != 0u || (isCut && hash3(p.t, 3u, p.seed * 4u + 1u) < p.honourCut)) { textureStore(dst, q, Q(textureLoad(rsrc, q, 0))); return; }
  var out = textureLoad(pred, q, 0);
  let allow = p.allowCode != 0u && !(isCut && p.dropCut != 0u);    // a dropped I-frame carries no residual, no intra
  let f = field[bi];
  if ((u32(f.w) & 4u) != 0u) { textureStore(dst, q, Q(out)); return; }
  if (allow && p.resGain > 0.0 && p.resMode == 2u) {
    let r = textureLoad(resT, q, 0).rgb - textureLoad(mcT, q, 0).rgb;                      // differences of halves: exact
    let R = vec3i(r * 16777216.0); let st = i32(p.resSteps); let gq = i32(p.resGain);          // r in 2^-24: integers
    var g = vec3f(0.0);
    for (var k = 0; k < 3; k++) { if (!(abs(r[k]) < p.dead)) { let n = fdiv(R[k] * st + 8388608, 16777216); g[k] = f32(rdiv(gq * n * 8, st)) * (1.0 / 32768.0); } }
    out = vec4f(clamp(out.rgb + g, vec3f(0.0), vec3f(1.0)), out.a);
  } else if (allow && p.resGain > 0.0) {
    var g = 0.0;
    if (p.resMode == 1u) { g = resOff(Ys(x, y) - Yp(x, y), 32768); }
    else { let hs = 9 * Ys(x, y) - boxS(x, y); let hp = 9 * Yp(x, y) - boxP(x, y); if (abs(hs) > abs(hp)) { g = resOff(hs - hp, 9 * 32768); } }
    out = vec4f(clamp(out.rgb + vec3f(g), vec3f(0.0), vec3f(1.0)), out.a);
  }
  if (allow && f.z > p.intraMad && hash3(bi, p.t, p.seed * 4u + 1u) < p.intraRate) { textureStore(dst, q, Q(textureLoad(src, q, 0))); return; }
  if (hash3(bi, p.t, p.seed * 4u + 2u) < p.blocksFrac) { textureStore(dst, q, Q(textureLoad(rsrc, q, 0))); return; }
  if (p.sweepBand > 0u) {
    let y0 = u32(floor(f32(p.t) * p.sweepSpeed)) % p.size.y;
    if ((id.y + p.size.y - y0) % p.size.y < p.sweepBand) { textureStore(dst, q, Q(textureLoad(rsrc, q, 0))); return; }
  }
  textureStore(dst, q, Q(out));
}`;

export function createCodeNode(gpu, { w, h, block, format = F16 }) {
  const P = pipeline(gpu, 'code:' + format, () => computePipeline(gpu, 'code ' + format, WGSL(format), [L.tex(0), L.tex(1), L.tex(2), L.tex(3), L.out(4, format), L.ro(5), L.ro(6), L.uni(7), L.tex(8)]));
  const bw = Math.ceil(w / block), bh = Math.ceil(h / block), uni = uniformBuffer(gpu, 96, 'code uniform');
  return {
    /** u: same fields as engine-ref code(); cutThresh replaces the boolean cut (the GPU reads the counter). mc: codec residual's reference. */
    encode(enc, { src, resetSrc, pred, mc = null, res = null, dst, field, cut }, u) {
      const b = new ArrayBuffer(96), U32 = new Uint32Array(b), F32 = new Float32Array(b);
      U32.set([w, h, bw, bh, block, u.t, u.seed, u.hard ? 1 : 0, u.cutThresh, u.sweepBand | 0, { detail: 0, full: 1, codec: 2 }[u.resMode] ?? 0, u.allowCode ? 1 : 0]);
      // the residual's gain in 1/4096 and its steps as integers (the kernel's integer residual, M8)
      F32.set([u.honourCut, u.intraMad, u.intraRate, u.blocks, u.sweepSpeed, qs(Math.min(1, Math.max(0, Math.fround(u.resGain))), 4096), Math.round(Math.fround(u.resSteps)), u.resDead ?? 0], 12); U32[20] = u.dropCut ? 1 : 0;
      gpu.device.queue.writeBuffer(uni, 0, b);
      dispatch(gpu, enc, P, [src, resetSrc, pred, mc || src, dst, field, cut, uni, res || src], Math.ceil(w / 8), Math.ceil(h / 8), 'code');
    },
    destroy() { uni.destroy(); },
  };
}
