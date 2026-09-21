// render.js — the instrument's image. Reads only what kernels expose through present() (density,
// height, tone) plus the substrate; never a kernel's private state. P1: top-down, four illumination
// modes and debug channel views. The focal stack, spectral bands and the tilted camera are P4 (study/04).
import { LIB, LIB_GRID, PRESENT } from './kernels.js';

export const MODES = ['oblique', 'brightfield', 'darkfield', 'phase', 'nutrient', 'attractant', 'toxin', 'sheath', 'slots', 'state', 'conductivity'];

export const RENDER = LIB + /* wgsl */`
struct View {
  res: vec2f, center: vec2f,
  mmPerPx: f32, mode: u32, exposure: f32, time: f32,
  cursor: vec2f, toolR: f32, flags: u32,
  ramps: array<vec4f, 36>,
};
@group(0) @binding(0) var<uniform> S: Sim;
@group(0) @binding(1) var<uniform> V: View;
@group(0) @binding(2) var<storage, read> cells: array<vec4f>;
@group(0) @binding(3) var<storage, read> sub: array<vec4f>;
@group(0) @binding(4) var<storage, read> cond: array<f32>;
` + LIB_GRID + PRESENT + /* wgsl */`
fn condAt(q: vec2i) -> f32 {
  let gn = u32(S.p2); if (gn == 0u || q.x < 0 || q.y < 0 || q.x >= i32(S.n) || q.y >= i32(S.n)) { return 0.0; }
  let gx = min(u32(q.x) * gn / S.n, gn - 1u); let gy = min(u32(q.y) * gn / S.n, gn - 1u);
  return cond[gy * gn + gx];
}
fn isAdaptive(slot: u32) -> bool { return slot != 0u && f32(slot) == S.p1; }

struct Px { dens: f32, height: f32, col: vec3f, sub: vec4f };
fn rampOf(slot: u32, t: f32) -> vec3f {
  let x = clamp(t, 0.0, 1.0) * 3.0; let k = min(u32(floor(x)), 2u); let b = slot * 4u;
  return mix(V.ramps[b + k].rgb, V.ramps[b + k + 1u].rgb, x - f32(k));
}
fn cellPx(q: vec2i) -> Px {
  var o: Px; o.dens = 0.0; o.height = 0.0; o.col = vec3f(0.0); o.sub = vec4f(0.0);
  if (q.x < 0 || q.y < 0 || q.x >= i32(S.n) || q.y >= i32(S.n) || !inDish(q)) { return o; }
  let i = idx(q); let c = cells[i]; o.sub = sub[i];
  let slot = u32(c.a + 0.5); if (slot == 0u) { return o; }
  let pr = present(S.slotK[slot].x, c);
  o.dens = pr.x; o.height = pr.y; o.col = rampOf(slot, pr.z) * pr.x;      // premultiplied by density
  return o;
}
fn samplePx(g: vec2f) -> Px {
  let f = g - 0.5; let b = vec2i(floor(f)); let w = f - floor(f);
  let a = cellPx(b); let bb = cellPx(b + vec2i(1, 0)); let c = cellPx(b + vec2i(0, 1)); let d = cellPx(b + vec2i(1, 1));
  var o: Px;
  o.dens = mix(mix(a.dens, bb.dens, w.x), mix(c.dens, d.dens, w.x), w.y);
  o.height = mix(mix(a.height, bb.height, w.x), mix(c.height, d.height, w.x), w.y);
  o.col = mix(mix(a.col, bb.col, w.x), mix(c.col, d.col, w.x), w.y);
  o.sub = mix(mix(a.sub, bb.sub, w.x), mix(c.sub, d.sub, w.x), w.y);
  return o;
}
fn heat(t: f32) -> vec3f { let x = clamp(t, 0.0, 1.0); return vec3f(smoothstep(0.35, 0.9, x), smoothstep(0.0, 0.6, x) * (1.0 - 0.6 * smoothstep(0.8, 1.0, x)), 0.12 + 0.5 * smoothstep(0.0, 0.3, x) * (1.0 - smoothstep(0.3, 0.7, x))); }

@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  return vec4f(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1), 0.0, 1.0);
}
@fragment fn fs(@builtin(position) frag: vec4f) -> @location(0) vec4f {
  let mm = V.center + (frag.xy - V.res * 0.5) * V.mmPerPx * vec2f(1.0, -1.0);
  let g = mm / S.cellMm + f32(S.n) * 0.5;
  let rr = length(mm); let px = V.mmPerPx;
  let P = samplePx(g);
  let eps = max(1.0, px / S.cellMm);                                       // gradient step: a cell, or a pixel when zoomed out
  let hx = samplePx(g + vec2f(eps, 0.0)); let hX = samplePx(g - vec2f(eps, 0.0));
  let hy = samplePx(g + vec2f(0.0, eps)); let hY = samplePx(g - vec2f(0.0, eps));
  let gradH = vec2f(hx.height - hX.height, hy.height - hY.height) / (2.0 * eps);
  let gradD = vec2f(hx.dens - hX.dens, hy.dens - hY.dens) / (2.0 * eps);
  let albedo = P.col / max(P.dens, 1e-3);
  let grain = (rnd(u32(i32(mm.x * 400.0) + 40000), u32(i32(mm.y * 400.0) + 40000), S.seed) - 0.5) * 0.08;   // below the finest rung: seeded grain

  var col = vec3f(0.0);
  switch V.mode {
    case 1u: {                                                             // transmitted brightfield: Beer-Lambert
      let bg = vec3f(0.94, 0.92, 0.85) * (1.0 - 0.06 * P.sub.r) * (1.0 - 0.05 * P.sub.a);
      col = bg * exp(-2.6 * P.dens * (1.0 + grain) * (vec3f(1.06) - albedo));
    }
    case 2u: {                                                             // dark-field: edges and particulates scatter
      col = albedo * (0.22 * P.dens + 3.0 * length(gradD)) * (1.0 + grain * 2.0) + vec3f(0.006, 0.007, 0.009) + vec3f(0.02) * P.sub.a;
    }
    case 3u: {                                                             // phase contrast: optical path minus its low-pass, halo for free
      let m = 0.25 * (samplePx(g + vec2f(4.0 * eps, 0.0)).dens + samplePx(g - vec2f(4.0 * eps, 0.0)).dens + samplePx(g + vec2f(0.0, 4.0 * eps)).dens + samplePx(g - vec2f(0.0, 4.0 * eps)).dens);
      col = vec3f(0.46, 0.48, 0.45) - vec3f(1.5 * (P.dens - m) + 0.25 * P.dens) * (1.0 + grain);
    }
    case 4u: { col = heat(P.sub.r * 0.5); }
    case 5u: { col = heat(P.sub.g * 2.0); }
    case 6u: { col = heat(P.sub.b); }
    case 7u: { col = heat(P.sub.a); }
    case 8u: { let c = cells[idx(vec2i(clamp(g, vec2f(0.0), vec2f(f32(S.n) - 1.0))))]; col = select(vec3f(0.02), rampOf(u32(c.a + 0.5), 0.7), c.a > 0.5); }
    case 9u: { let c = cells[idx(vec2i(clamp(g, vec2f(0.0), vec2f(f32(S.n) - 1.0))))]; col = c.rgb * vec3f(0.5, 1.0, 1.0); }
    case 10u: { col = heat(condAt(vec2i(floor(g))) * 0.9) + vec3f(0.06) * P.dens; }
    default: {                                                             // oblique bench light on dark agar
      let agar = vec3f(0.050, 0.046, 0.038) + P.sub.r * vec3f(0.030, 0.026, 0.012) + P.sub.a * vec3f(0.035, 0.034, 0.028) + P.sub.b * vec3f(0.0, 0.02, 0.05);
      let nrm = normalize(vec3f(-gradH * 2.2, 1.0));
      let Ld = normalize(vec3f(-0.55, 0.6, 0.58));
      let diff = clamp(dot(nrm, Ld), 0.0, 1.0);
      let spec = pow(clamp(dot(reflect(-Ld, nrm), vec3f(0.0, 0.0, 1.0)), 0.0, 1.0), 40.0) * 0.35 * smoothstep(0.1, 0.6, P.dens);
      let body = albedo * (0.30 + 0.85 * diff) * (1.0 + grain) + vec3f(spec);
      col = mix(agar, body, clamp(P.dens * 1.15, 0.0, 1.0));
    }
  }
  // the dish: meniscus, glass wall, bench
  let wall = 45.0;
  if (V.mode < 4u) {
    col *= 1.0 - 0.35 * smoothstep(wall - 2.2, wall, rr);
    if (rr > wall) {
      let t = (rr - wall) / 1.6;
      let glass = select(vec3f(0.10, 0.11, 0.12), vec3f(0.80, 0.80, 0.78), V.mode == 1u) * (0.55 + 0.45 * sin(t * 3.14159)) + vec3f(0.35) * smoothstep(0.12, 0.0, abs(t - 0.5)) * (0.4 + 0.6 * clamp(dot(normalize(mm), vec2f(-0.6, 0.8)), 0.0, 1.0));
      let bench = select(vec3f(0.012), vec3f(0.97, 0.96, 0.92), V.mode == 1u);
      col = select(bench, glass, t < 1.0);
    }
  } else if (rr > wall) { col = vec3f(0.0); }
  col *= V.exposure;

  // reticle: engraved on the instrument, not part of the specimen
  if ((V.flags & 1u) != 0u) {
    var m = 0.0;
    let ax = min(abs(mm.x), abs(mm.y));
    m = max(m, smoothstep(px, 0.0, ax) * 0.5);
    let ring = abs(fract(rr / 10.0 + 0.5) - 0.5) * 10.0;
    m = max(m, smoothstep(px, 0.0, ring) * 0.35 * step(rr, 46.0));
    let along = max(abs(mm.x), abs(mm.y)); let tick = abs(fract(along + 0.5) - 0.5);
    let five = abs(fract(along / 5.0 + 0.5) - 0.5) * 5.0;
    let len = select(0.35, 0.8, five < 0.5 * px + 0.02);
    if (px < 0.2) { m = max(m, smoothstep(px, 0.0, tick) * step(ax, len) * 0.6); }
    col += vec3f(0.95, 0.62, 0.22) * m * 0.55;
  }
  if ((V.flags & 2u) != 0u) {                                              // true-scale ghost of the tool footprint
    let d = abs(length(mm - V.cursor) - V.toolR);
    col = mix(col, vec3f(1.0, 0.95, 0.8), smoothstep(1.5 * px, 0.5 * px, d) * 0.85);
    col += vec3f(1.0, 0.9, 0.7) * smoothstep(1.2 * px, 0.0, length(mm - V.cursor)) ;
  }
  return vec4f(pow(clamp(col, vec3f(0.0), vec3f(1.0)), vec3f(1.0 / 2.2)), 1.0);
}
`;
