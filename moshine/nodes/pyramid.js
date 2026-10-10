// nodes/pyramid.js — luma plane and 2x2 box pyramid (r32float). Twins of engine-ref.js luma() / downsample().
import { pipeline, computePipeline, dispatch, createPlane, L, LUMA_WGSL } from '../gpu.js';

const LUMA = /* wgsl */`
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var dst: texture_storage_2d<r32float, write>;
${LUMA_WGSL}
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let d = textureDimensions(dst);
  if (id.x >= d.x || id.y >= d.y) { return; }
  textureStore(dst, vec2i(id.xy), vec4f(lumaOf(textureLoad(src, vec2i(id.xy), 0)), 0.0, 0.0, 1.0));
}`;
const DOWN = /* wgsl */`
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var dst: texture_storage_2d<r32float, write>;
fn at(x: u32, y: u32) -> f32 { let s = textureDimensions(src); return textureLoad(src, vec2i(vec2u(min(x, s.x - 1u), min(y, s.y - 1u))), 0).r; }
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let d = textureDimensions(dst);
  if (id.x >= d.x || id.y >= d.y) { return; }
  let x = 2u * id.x; let y = 2u * id.y;
  textureStore(dst, vec2i(id.xy), vec4f((((at(x, y) + at(x + 1u, y)) + at(x, y + 1u)) + at(x + 1u, y + 1u)) * 0.25, 0.0, 0.0, 1.0));
}`;

/** A luma pyramid for one image size: levels[l] is an r32float plane of ceil(w / 2^l) x ceil(h / 2^l). */
export function createPyramid(gpu, { w, h, levels }, label = 'pyramid') {
  const PL = pipeline(gpu, 'luma', () => computePipeline(gpu, 'luma', LUMA, [L.tex(0), L.out(1, 'r32float')]));
  const PD = pipeline(gpu, 'down', () => computePipeline(gpu, 'down', DOWN, [L.tex(0), L.out(1, 'r32float')]));
  const lv = []; let lw = w, lh = h;
  for (let l = 0; l < levels; l++) { lv.push(createPlane(gpu, lw, lh, `${label} L${l}`)); lw = Math.ceil(lw / 2); lh = Math.ceil(lh / 2); }
  return {
    levels: lv,
    encode(enc, srcTex) {
      dispatch(gpu, enc, PL, [srcTex, lv[0]], Math.ceil(w / 8), Math.ceil(h / 8), 'luma');
      for (let l = 1; l < levels; l++) dispatch(gpu, enc, PD, [lv[l - 1], lv[l]], Math.ceil(lv[l].width / 8), Math.ceil(lv[l].height / 8), 'down');
    },
    destroy() { lv.forEach((t) => t.destroy()); },
  };
}
