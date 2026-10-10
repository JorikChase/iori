// nodes/composite.js — Transform & Blend (spec §11.1): place a source image into a sequence-sized layer by the
// inverse transform (bilinear by hand, clamped taps, transparent outside), and blend a layer onto the composite
// (layer alpha x opacity; normal, add, multiply, screen, difference). Twins of placeRef / blendRef in sequence.js.
// Contraction-proof: geometry is integer fixed point and every float product is exact (half-float pixel x a weight
// of at most 12 bits), so fused multiply-adds cannot change a bit. An identity transform copies exactly, so a
// one-clip sequence shows its media unchanged. One parameter set per node per submit.
import { pipeline, computePipeline, dispatch, uniformBuffer, L, HALF_WGSL, F16 } from '../gpu.js';
import { opacity12 } from '../sequence.js';

const PLACE = (fmt) => /* wgsl */`
struct P { size: vec4u, gx: vec4i, gy: vec4i };    // size: W, H, bw, bh · gx: ax, bx, cx · gy: ay, by, cy (1/1024 px)
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var dst: texture_storage_2d<${fmt}, write>;
@group(0) @binding(2) var<uniform> p: P;
${HALF_WGSL(fmt)}
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= p.size.x || id.y >= p.size.y) { return; }
  let px = i32(id.x); let py = i32(id.y);
  let ux = p.gx.x * px + p.gx.y * py + p.gx.z; let uy = p.gy.x * px + p.gy.y * py + p.gy.z;   // i32, wraps like Math.imul
  var o = vec4f(0.0);
  let bw = i32(p.size.z); let bh = i32(p.size.w);
  if (ux >= -512 && uy >= -512 && ux < bw * 1024 - 512 && uy < bh * 1024 - 512) {
    let x0i = ux >> 10u; let y0i = uy >> 10u; let fx = (ux & 1023) >> 4u; let fy = (uy & 1023) >> 4u; let gx = 64 - fx; let gy = 64 - fy;
    let x0 = clamp(x0i, 0, bw - 1); let x1 = clamp(x0i + 1, 0, bw - 1); let y0 = clamp(y0i, 0, bh - 1); let y1 = clamp(y0i + 1, 0, bh - 1);
    let w00 = f32(gx * gy) / 4096.0; let w10 = f32(fx * gy) / 4096.0; let w01 = f32(gx * fy) / 4096.0; let w11 = f32(fx * fy) / 4096.0;
    o = (textureLoad(src, vec2i(x0, y0), 0) * w00 + textureLoad(src, vec2i(x1, y0), 0) * w10) + (textureLoad(src, vec2i(x0, y1), 0) * w01 + textureLoad(src, vec2i(x1, y1), 0) * w11);
  }
  textureStore(dst, vec2i(id.xy), Q(o));
}`;

const BLEND = (fmt) => /* wgsl */`
struct P { size: vec4u };                            // W, H, mode, opacity in 1/4096
@group(0) @binding(0) var comp: texture_2d<f32>;
@group(0) @binding(1) var layer: texture_2d<f32>;
@group(0) @binding(2) var dst: texture_storage_2d<${fmt}, write>;
@group(0) @binding(3) var<uniform> p: P;
${HALF_WGSL(fmt)}
fn mode(C: f32, L: f32) -> f32 {
  switch p.size.z {
    case 1u: { return C + L; }
    case 2u: { return C * L; }
    case 3u: { return 1.0 - roundHalf1(1.0 - C) * roundHalf1(1.0 - L); }   // half operands: an exact product (contraction-proof)
    case 4u: { return abs(C - L); }
    default: { return L; }
  }
}
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= p.size.x || id.y >= p.size.y) { return; }
  let C = textureLoad(comp, vec2i(id.xy), 0); let Lr = textureLoad(layer, vec2i(id.xy), 0);
  let a = (i32(floor(Lr.a * 4096.0 + 0.5)) * i32(p.size.w) + 2048) >> 12u;
  var o = C.rgb;
  if (a > 0) {
    let B = vec3f(roundHalf1(mode(C.r, Lr.r)), roundHalf1(mode(C.g, Lr.g)), roundHalf1(mode(C.b, Lr.b)));
    if (a >= 4096) { o = B; } else { let af = f32(a) / 4096.0; let gf = f32(4096 - a) / 4096.0; o = C.rgb * gf + B * af; }
  }
  textureStore(dst, vec2i(id.xy), Q(vec4f(o, 1.0)));
}`;

const MASKMIX = (fmt) => /* wgsl */`
struct P { size: vec4u };                            // W, H
@group(0) @binding(0) var clean: texture_2d<f32>;
@group(0) @binding(1) var moshed: texture_2d<f32>;
@group(0) @binding(2) var mask: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<${fmt}, write>;
@group(0) @binding(4) var<uniform> p: P;
${HALF_WGSL(fmt)}
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= p.size.x || id.y >= p.size.y) { return; }
  let C = textureLoad(clean, vec2i(id.xy), 0).rgb; let Mo = textureLoad(moshed, vec2i(id.xy), 0).rgb;
  let a = clamp(i32(floor(textureLoad(mask, vec2i(id.xy), 0).a * 4096.0 + 0.5)), 0, 4096);
  var o = C;
  if (a >= 4096) { o = Mo; } else if (a > 0) { let af = f32(a) / 4096.0; let gf = f32(4096 - a) / 4096.0; o = C * gf + Mo * af; }
  textureStore(dst, vec2i(id.xy), Q(vec4f(o, 1.0)));
}`;

/** maskmix.encode(enc, clean, moshed, mask, dst): the mosh where the mask covers, the clean picture elsewhere (R3). */
export function createMaskMix(gpu, format = F16) {
  const K = pipeline(gpu, 'maskmix:' + format, () => computePipeline(gpu, 'maskmix ' + format, MASKMIX(format), [L.tex(0), L.tex(1), L.tex(2), L.out(3, format), L.uni(4)]));
  const uni = uniformBuffer(gpu, 16, 'maskmix uniform');
  return {
    encode(enc, clean, moshed, mask, dst) {
      gpu.device.queue.writeBuffer(uni, 0, new Uint32Array([dst.width, dst.height, 0, 0]));
      dispatch(gpu, enc, K, [clean, moshed, mask, dst, uni], Math.ceil(dst.width / 8), Math.ceil(dst.height / 8), 'maskmix');
    },
    destroy() { uni.destroy(); },
  };
}

export const BLEND_MODE = { normal: 0, add: 1, multiply: 2, screen: 3, difference: 4 };

/** place.encode(enc, src, dst, P) with P from sequence.js placement(). */
export function createPlace(gpu, format = F16) {
  const K = pipeline(gpu, 'place:' + format, () => computePipeline(gpu, 'place ' + format, PLACE(format), [L.tex(0), L.out(1, format), L.uni(2)]));
  const uni = uniformBuffer(gpu, 48, 'place uniform');
  return {
    encode(enc, src, dst, P) {
      const u = new ArrayBuffer(48), U32 = new Uint32Array(u), I32 = new Int32Array(u);
      U32.set([P.W, P.H, P.bw, P.bh]); I32.set([P.ax, P.bx, P.cx, 0, P.ay, P.by, P.cy, 0], 4);
      gpu.device.queue.writeBuffer(uni, 0, u);
      dispatch(gpu, enc, K, [src, dst, uni], Math.ceil(P.W / 8), Math.ceil(P.H / 8), 'place');
    },
    destroy() { uni.destroy(); },
  };
}

/** blend.encode(enc, comp, layer, dst, opacity, mode). dst must not be comp or layer. */
export function createBlend(gpu, format = F16) {
  const K = pipeline(gpu, 'blend:' + format, () => computePipeline(gpu, 'blend ' + format, BLEND(format), [L.tex(0), L.tex(1), L.out(2, format), L.uni(3)]));
  const uni = uniformBuffer(gpu, 16, 'blend uniform');
  return {
    encode(enc, comp, layer, dst, opacity, mode) {
      const u = new ArrayBuffer(16), U32 = new Uint32Array(u);
      U32.set([dst.width, dst.height, BLEND_MODE[mode] ?? 0, opacity12(opacity)]);
      gpu.device.queue.writeBuffer(uni, 0, u);
      dispatch(gpu, enc, K, [comp, layer, dst, uni], Math.ceil(dst.width / 8), Math.ceil(dst.height / 8), 'blend');
    },
    destroy() { uni.destroy(); },
  };
}
