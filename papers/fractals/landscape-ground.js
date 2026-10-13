/*
 * landscape-ground.js — buildGround(terrain, { palette, detail }) → { group, setPalette, dispose, update }.
 * three.js (importmap 'three' = three@0.164.1, WebGL2). Draws a Terrain or a crop() of one from
 * landscape-terrain.js: the ground with one material shader, lakes and sea, river ribbons, and (focus) rocks.
 *
 * MAPPING: terrain (x east, y north, h up, metres from the SW corner of the terrain or crop) → three.js
 * (x, h, −y). The group is not moved; for a crop, group.userData.origin = [x0, y0] in region metres.
 *
 * THE GROUND SHADER
 *  - Material blending: the four nearest grid cells' material ids (nearest-texel fetches), bilinear
 *    weights plus a per-material height function (texture splatting with height-based blending, report §3),
 *    so the boundaries are crisp and drawn-looking; each distinct id is shaded once.
 *  - Signature details per material, in world metres, faded out by the pixel footprint (fwidth):
 *      bedrock/cliff: strata bands from the terrain's own hardness function at ζ = h − strataOffset
 *        (the same function that set erodibility and repose in the erosion), weak beds recessed and darker;
 *        granite: feldspar speckle and sheeting shells; sandstone: cross-bed laminae inside beds;
 *        limestone: clints and grikes (Worley F2−F1 < w on flat pavement, cells 1–3 m, report §3: Burren
 *        clints 1–5 m², grikes ≤ 0.8 m) and solution flutes on steep faces; basalt: columnar jointing
 *        (Worley cells ~0.9 m, dark joints, vertical on faces); schist: foliation (stretched noise).
 *      scree: angular clasts (Worley 0.45 m) with downslope streaks; boulder field: rounded blobs;
 *      sand: asymmetric ripples across the wind (λ 0.6 m, lee side 30 % of the wavelength);
 *      snow: wind-aligned sastrugi; wet meadow: tussocks; soil: grass by wetness, temperature, rain.
 *  - Drawing palette: paper, pale Swiss-style relief shading from a north-west key light, light
 *    hypsometric tints, contours (fwidth lines, index every fifth), ink hachures along the fall line on
 *    cliffs, ink lines at strata contacts, cartographic symbols (scree and sand stipple, boulder circles,
 *    marsh dashes), waterlines parallel to shores.
 *  - Natural palette: rock, soil, grass, sand and snow colours, sun + sky light with a baked cast shadow
 *    and sky-view factor (CPU horizon march at build time), aerial perspective.
 * WATER: lakes and sea as one surface mesh at their levels, faded by depth (level − ground, per vertex)
 *  with waterlines from a shore-distance field; rivers as ribbons from the Strahler polylines, widened to a
 *  minimum pixel width in the vertex shader, animated with a two-phase flow along the ribbon (Vlachos 2010:
 *  two scrolls half a period apart, cross-faded), foam where segments start (confluences) and on steep reaches.
 * ROCKS (focus): Arches-style eroded Voronoi blocks (Peytavie et al. 2009): a convex cell from random
 *  half-spaces, rounded by a soft-min of the plane distances (rounder on top, far from the contact), a few
 *  prototypes per kind (boulder, scree block, granite tor block, basalt prism, limestone slab), instanced.
 *
 * API: { group, setPalette(p), update(dt), dispose(), applyHeightDelta(fn | [{x, y, r, dh}]),
 *  setClippingPlanes(planes, intersection), setCanopy(rgba, m, drawTint), background(), uniforms }; opts.clippingPlanes honoured by every material
 *  (clipping chunks in all shaders). Region grids above 600² are meshed at half resolution.
 * CONSTANTS CHOSEN HERE (look, not physics): palettes below; contour interval 20 m (region) / 5 m (focus), doubled until ≥ ~5 px apart;
 * river minimum width 1.4 + 0.45·order px; sun azimuth 235°, elevation 38° (natural); key light NW 45°
 * (drawing, the cartographic convention); aerial perspective e-folding 3 × region side (10 × for a crop);
 * ambient = sky 1.05 × sky-view + a constant ground bounce 0.15; shadow floor 0.55; detail bump tilt ≤ 31°;
 * material lookup warped by ±1.5 cells of noise.
 * LIBERTIES: every colour and symbol; detail amplitudes; rock prototype shapes and counts.
 */
import * as THREE from 'three';
import { bakeLight, SUN_DIR3 } from './landscape-terrain.js';

export const PALETTE_BG = { drawing: 0xffffff, natural: 0xcfd9e2 };

// ------------------------------------------------------------------------------------------------ GLSL
const GLSL_NOISE = /* glsl */`
uvec2 pcg2d(uvec2 v) {
  v = v * 1664525u + 1013904223u; v.x += v.y * 1664525u; v.y += v.x * 1664525u;
  v = v ^ (v >> 16u); v.x += v.y * 1664525u; v.y += v.x * 1664525u; v = v ^ (v >> 16u); return v;
}
vec2 h22(vec2 c) { uvec2 u = pcg2d(uvec2(ivec2(floor(c)) + ivec2(65536))); return vec2(u) * (1.0 / 4294967295.0); }
float h21(vec2 c) { return h22(c).x; }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = h21(i), b = h21(i + vec2(1, 0)), c = h21(i + vec2(0, 1)), d = h21(i + vec2(1, 1));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm3(vec2 p) { return 0.5 * vnoise(p) + 0.3 * vnoise(p * 2.03 + 7.1) + 0.2 * vnoise(p * 4.07 + 3.3); }
// Worley: x = F1, y = F2, z = cell hash
vec3 worley(vec2 p, float jit) {
  vec2 i = floor(p), f = fract(p); float f1 = 9.0, f2 = 9.0, id = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y)), o = h22(i + g), r = g + 0.5 + jit * (o - 0.5) - f;
    float d = dot(r, r);
    if (d < f1) { f2 = f1; f1 = d; id = o.y; } else if (d < f2) f2 = d;
  }
  return vec3(sqrt(f1), sqrt(f2), id);
}
float fadeFor(float scale, float fw) { return 1.0 - smoothstep(0.2 * scale, 0.9 * scale, fw); }
// lineFW: the same line, its width measured with the pixel footprint fw (metres per pixel, computed once in uniform
// control flow) and the line period in metres; fwidth inside branches and loops is undefined on some GPUs
float lineFW(float v, float period, float fw, float w) { float d = abs(fract(v - 0.5) - 0.5) * period / max(fw, 1e-4); return 1.0 - smoothstep(w * 0.5, w * 0.5 + 1.0, d); }
float lineAA(float v, float w) { float d = abs(fract(v - 0.5) - 0.5) / max(fwidth(v), 1e-5); return 1.0 - smoothstep(w * 0.5, w * 0.5 + 1.0, d); }
`;

const GROUND_VS = /* glsl */`
attribute vec4 aInfo;     // soil m, wetness (TWI), T °C, strataOffset
attribute vec2 aLight;    // cast shadow (1 lit), sky-view factor
#include <clipping_planes_pars_vertex>
varying vec3 vW; varying vec3 vNrm; varying vec2 vUV; varying vec4 vInfo; varying vec2 vLight; varying float vDist;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz; vNrm = normalize(mat3(modelMatrix) * normal); vUV = uv; vInfo = aInfo; vLight = aLight;
  vec4 mv = viewMatrix * wp; vDist = -mv.z;
  vec4 mvPosition = mv;
  #include <clipping_planes_vertex>
  gl_Position = projectionMatrix * mv;
}`;

const GROUND_FS = /* glsl */`
precision highp float; precision highp int;
uniform sampler2D uMat;      // RGBA8: material, lithology, -, -
uniform sampler2D uStrata;   // R: hardness(ζ), rows = lithology
uniform sampler2D uCanopy;   // RGB natural canopy colour, A cover 0..1 (set by the plant side; empty = none)
uniform vec3 uCanopyDraw; uniform float uCanopyOn;
uniform vec2 uZeta;          // ζ range of the strata texture
uniform float uN, uPal, uTime, uContour, uFog, uSea, uFocus, uCellM;
uniform vec3 uKey, uSun, uSky, uPaper;
uniform vec2 uWind;
varying vec3 vW; varying vec3 vNrm; varying vec2 vUV; varying vec4 vInfo; varying vec2 vLight; varying float vDist;
${GLSL_NOISE}
#include <clipping_planes_pars_fragment>
const vec3 INK = vec3(0.13, 0.145, 0.16);
const vec3 SEPIA = vec3(0.58, 0.47, 0.36);

struct S { vec3 nat; vec3 drw; float bump; float ink; };

float hardAt(float zeta, int L) {
  float u = clamp((zeta - uZeta.x) / (uZeta.y - uZeta.x), 0.0, 1.0);
  return texture2D(uStrata, vec2(u, (float(L) + 0.5) / 5.0)).r;
}
float hfun(int m, vec2 p) {
  if (m == 0) return 0.62 + 0.38 * vnoise(p / 6.0);
  if (m == 1) return 0.5 + 0.3 * vnoise(p / 3.0);
  if (m == 2) return 0.32 + 0.3 * vnoise(p / 5.0);
  if (m == 3) return 0.22 + 0.25 * vnoise(p / 4.0);
  if (m == 4) return 0.12 + 0.25 * vnoise(p / 8.0);
  if (m == 5) return 0.72 + 0.25 * vnoise(p / 10.0);
  if (m == 6) return 0.0;
  return 0.45 + 0.4 * vnoise(p / 2.5);
}

S rock(int L, vec2 p, float zeta, float slope, vec2 fall, float fw) {
  S s; s.bump = 0.0; s.ink = 0.0;
  // granite is massive (no beds): its tone varies in plan, not with the strata coordinate (plant agent, 2026-10-13)
  float hard = L == 0 ? 0.45 + 0.4 * fbm3(p / 35.0) : hardAt(zeta + 1.5 * (vnoise(p / 40.0) - 0.5), L);
  vec3 hardC, weakC;
  if (L == 0) { hardC = vec3(0.68, 0.64, 0.6); weakC = vec3(0.6, 0.57, 0.54); }
  else if (L == 1) { hardC = vec3(0.76, 0.61, 0.46); weakC = vec3(0.62, 0.5, 0.42); }
  else if (L == 2) { hardC = vec3(0.62, 0.6, 0.55); weakC = vec3(0.52, 0.5, 0.45); }
  else if (L == 3) { hardC = vec3(0.3, 0.3, 0.31); weakC = vec3(0.44, 0.32, 0.26); }
  else { hardC = vec3(0.5, 0.52, 0.55); weakC = vec3(0.42, 0.44, 0.47); }
  float hn = smoothstep(0.35, 0.75, hard);
  s.nat = mix(weakC, hardC, mix(0.5, hn, 0.75)) * (0.94 + 0.12 * vnoise(p / 11.0));
  s.drw = mix(vec3(0.86, 0.85, 0.83), vec3(0.97, 0.965, 0.955), hn);
  // ink at bed contacts (the strata function changes fast in ζ), on faces only
  float contact = L == 0 ? 0.0 : smoothstep(0.1, 0.3, abs(hardAt(zeta + 0.8, L) - hardAt(zeta - 0.8, L)));
  s.ink = max(s.ink, contact * 0.6 * fadeFor(8.0, fw) * smoothstep(0.45, 0.75, slope));
  float steep = smoothstep(0.45, 0.8, slope), flatw = 1.0 - smoothstep(0.15, 0.35, slope);
  if (L == 0) {             // granite: feldspar speckle, lichen, two vertical joint sets + sheeting
    float f = fadeFor(0.6, fw);
    float sp = vnoise(p * 3.0);
    s.nat *= 1.0 + (0.12 * step(0.78, sp) - 0.1 * step(sp, 0.15)) * f;
    float li = smoothstep(0.55, 0.75, fbm3(p / 2.5));
    s.nat = mix(s.nat, vec3(0.47, 0.49, 0.4), li * 0.35 * fadeFor(1.5, fw));
    // two joint sets (plant agent, 2026-10-13): rotated 18° and 104° off the grid, spacing 14 m and 11.5 m, each trace
    // broken into segments (about half of each line is present) and wavering, so the face reads as jointed rock and
    // not as a net; sheeting joints parallel to the surface on steep faces, also broken
    vec2 q = p + 2.5 * vec2(vnoise(p / 11.0), vnoise(p / 11.0 + 4.0));
    vec2 d1 = vec2(0.951, 0.309), d2 = vec2(-0.242, 0.970);
    float u1 = dot(q, d1) / 14.0 + 0.25 * vnoise(q / 23.0), u2 = dot(q, d2) / 11.5 + 0.25 * vnoise(q / 19.0 + 3.0);   // constant spacing, wavering traces
    float b1 = step(0.48, vnoise(vec2(floor(u1) * 7.1, dot(q, vec2(-d1.y, d1.x)) / 14.0)));
    float b2 = step(0.52, vnoise(vec2(floor(u2) * 5.3, dot(q, vec2(-d2.y, d2.x)) / 12.0)));
    float uz = (zeta + 0.6 * vnoise(p / 5.0)) / 9.0, b3 = step(0.5, vnoise(vec2(floor(uz) * 3.7, dot(p, vec2(-fall.y, fall.x)) / 10.0)));
    float j1 = lineFW(u1, 14.0, fw, 0.8) * b1, j2 = lineFW(u2, 11.5, fw, 0.7) * b2, j3 = lineFW(uz, 9.0 / max(slope, 0.3), fw, 0.9) * b3 * steep;
    float jf = fadeFor(9.0, fw), joint = max(j1, j2) * jf;
    // natural colour: broad tone patches, water streaks down the fall line, and the two joint sets only (sheeting is
    // drawn in ink; in colour it would trace the height like contours)
    vec2 acr = vec2(-fall.y, fall.x);
    float tone = fbm3(p / 22.0), streak = smoothstep(0.62, 0.92, vnoise(vec2(dot(p, acr) / 2.5, dot(p, fall) / 45.0))) * steep;
    s.nat *= (0.9 + 0.2 * tone) * (1.0 - 0.28 * streak);
    s.nat = mix(s.nat, s.nat * 0.55, joint * 0.45);
    s.ink = max(s.ink, max(joint, j3 * jf * 0.5) * 0.4);
  } else if (L == 1) {      // sandstone: cross-bed sets, each with its own direction and dip
    float setId = floor(zeta / 2.6), a = h21(vec2(setId, 7.0)) * 6.283, dip = 0.25 + 0.5 * h21(vec2(setId, 9.0));
    float u = (zeta + dip * dot(p, vec2(cos(a), sin(a)))) / 0.4;
    float f = fadeFor(0.4, fw) * hn;
    s.nat *= 1.0 - 0.14 * smoothstep(0.6, 1.0, fract(u)) * f;
    s.ink = max(s.ink, lineAA(u, 0.5) * 0.45 * f * steep);
  } else if (L == 2) {      // limestone: clints and grikes on the flat, flutes on faces
    vec3 w = worley(vec2(p.x * 0.8, p.y * 0.45) / 1.6, 0.85);
    float gw = 0.05 + 0.07 * vnoise(p * 0.3);
    float grike = 1.0 - smoothstep(gw, gw + 0.06, w.y - w.x);
    float g = grike * flatw * fadeFor(1.2, fw);
    s.nat = mix(s.nat * (0.97 + 0.05 * w.z), vec3(0.22, 0.23, 0.22), g * 0.85);
    s.bump += -0.8 * g + 0.12 * (1.0 - w.x) * flatw * fadeFor(1.5, fw);
    s.ink = max(s.ink, g * 0.9);
    float flute = 0.5 + 0.5 * sin(dot(p, vec2(-fall.y, fall.x)) * 18.0 + 3.0 * vnoise(p * 0.7));
    s.bump += 0.04 * flute * steep * fadeFor(0.3, fw);
    s.nat *= 1.0 - 0.05 * flute * steep * fadeFor(0.3, fw);
  } else if (L == 3) {      // basalt: columnar jointing; colonnade 1.6 m, entablature 0.8 m in alternate flows
    float ent = step(0.55, h21(vec2(floor(zeta / 9.0), 3.0)));
    vec2 q = p / mix(1.6, 0.8, ent) + ent * 0.6 * vec2(vnoise(p * 0.5), vnoise(p * 0.5 + 9.0));
    vec3 w = worley(q, mix(0.75, 1.0, ent));
    float joint = 1.0 - smoothstep(0.02, 0.07, w.y - w.x);
    float f = fadeFor(mix(1.6, 0.8, ent), fw);
    s.nat = mix(s.nat * (1.0 + (0.12 * w.z - 0.06) * f), vec3(0.1, 0.1, 0.11), joint * f * 0.8);
    s.bump += (-0.3 * (1.0 - smoothstep(0.0, 0.25, w.y - w.x)) + 0.05 * w.z) * f;
    s.ink = max(s.ink, joint * f * 0.8);
  } else {                  // schist: foliation
    vec2 d = vec2(0.6, 0.8);
    float fo = vnoise(vec2(dot(p, d) * 0.4, dot(p, vec2(-d.y, d.x)) * 6.0));
    s.nat *= 0.9 + 0.18 * fo * fadeFor(0.4, fw);
    s.bump += 0.06 * fo * fadeFor(0.4, fw);
    s.ink = max(s.ink, step(0.8, fo) * 0.3 * fadeFor(0.4, fw) * steep);
  }
  return s;
}

S surface(int m, int L, vec2 p, float zeta, float slope, vec2 fall, float fw, float soil, float wet, float T, float alt) {
  S s; s.bump = 0.0; s.ink = 0.0;
  // drawing base: paper with a light hypsometric tint
  float hy = clamp(alt / 1800.0, 0.0, 1.0);
  vec3 tint = mix(vec3(0.93, 0.95, 0.9), vec3(0.975, 0.955, 0.92), smoothstep(0.0, 0.5, hy));
  tint = mix(tint, vec3(0.995, 0.99, 0.985), smoothstep(0.5, 1.0, hy));
  if (m == 0) return rock(L, p, zeta, slope, fall, fw);
  if (m == 1) {             // scree: angular clasts, downslope streaks
    vec3 w = worley(p / 0.45, 0.95);
    float edge = 1.0 - smoothstep(0.03, 0.12, w.y - w.x);
    vec3 base = L == 3 ? vec3(0.3, 0.29, 0.29) : L == 1 ? vec3(0.58, 0.49, 0.41) : L == 2 ? vec3(0.64, 0.63, 0.6) : vec3(0.52, 0.5, 0.49);
    float streak = vnoise(vec2(dot(p, fall) * 0.08, dot(p, vec2(-fall.y, fall.x)) * 0.9));
    float f = fadeFor(0.45, fw);
    s.nat = base * (0.85 + 0.3 * mix(0.5, w.z, f)) * (0.92 + 0.16 * streak) * (1.0 - 0.35 * edge * f);
    s.bump = (0.12 * (1.0 - w.x) - 0.1 * edge) * f;
    s.drw = mix(tint, vec3(0.95, 0.94, 0.92), 0.6);
    vec3 dots = worley(p / max(1.2, fw * 3.5), 1.0);
    s.ink = (1.0 - smoothstep(0.08, 0.16, dots.x)) * 0.8;
    return s;
  }
  if (m == 3) {             // wet meadow: tussocks; marsh dashes
    float tu = vnoise(p * 1.7);
    s.nat = mix(vec3(0.24, 0.36, 0.2), vec3(0.36, 0.44, 0.24), tu * fadeFor(0.6, fw) + 0.3 * vnoise(p / 7.0));
    s.bump = 0.08 * tu * fadeFor(0.6, fw);
    s.drw = mix(tint, vec3(0.88, 0.93, 0.93), 0.6);
    float sp = max(2.0, fw * 7.0);
    vec2 c = p / vec2(sp * 1.6, sp), cf = fract(c), ci = floor(c);
    float on = step(0.45, h21(ci + 5.0));
    s.ink = on * (1.0 - smoothstep(0.0, 0.08, abs(cf.y - 0.5))) * (1.0 - smoothstep(0.25, 0.32, abs(cf.x - 0.5))) * 0.8;
    return s;
  }
  if (m == 4) {             // sand: asymmetric wind ripples (stoss 70 %, lee 30 %)
    vec2 wd = normalize(uWind);
    float ph = dot(p, wd) / 0.6 + 1.5 * vnoise(p / 2.5) + 0.4 * vnoise(p * 1.3);
    float f = fract(ph), r = f < 0.7 ? f / 0.7 : (1.0 - f) / 0.3;
    float fa = fadeFor(0.6, fw);
    s.nat = vec3(0.7, 0.64, 0.5) * (0.94 + 0.1 * vnoise(p / 6.0)) * (1.0 - 0.07 * r * fa);
    s.bump = 0.025 * r * fa;
    s.drw = vec3(0.985, 0.97, 0.93);
    vec3 dots = worley(p / max(0.8, fw * 2.8), 1.0);
    s.ink = (1.0 - smoothstep(0.05, 0.1, dots.x)) * 0.55;
    return s;
  }
  if (m == 5) {             // snow: sastrugi along the wind
    vec2 wd = normalize(uWind);
    float sa = vnoise(vec2(dot(p, wd) * 0.15, dot(p, vec2(-wd.y, wd.x)) * 1.2));
    s.nat = vec3(0.94, 0.955, 0.98) * (0.97 + 0.05 * sa * fadeFor(1.0, fw));
    s.bump = 0.05 * sa * fadeFor(1.0, fw);
    s.drw = vec3(1.0);
    return s;
  }
  if (m == 6) { s.nat = vec3(0.42, 0.4, 0.33); s.drw = vec3(0.9, 0.93, 0.95); return s; }
  if (m == 7) {             // boulder field: rounded blobs on thin soil; boulder circles
    vec3 w = worley(p / 1.6, 0.9);
    float r = 0.3 + 0.25 * w.z, bl = 1.0 - smoothstep(r - 0.06, r, w.x);
    float f = fadeFor(1.6, fw);
    vec3 grass = mix(vec3(0.46, 0.47, 0.32), vec3(0.4, 0.45, 0.27), clamp(wet / 14.0, 0.0, 1.0));
    vec3 rc = L == 3 ? vec3(0.3, 0.3, 0.31) : L == 1 ? vec3(0.66, 0.54, 0.43) : vec3(0.62, 0.6, 0.57);
    s.nat = mix(mix(grass, rc, 0.45), rc * (0.85 + 0.25 * (1.0 - w.x / r)), bl * f);
    s.bump = 0.35 * bl * sqrt(max(0.0, 1.0 - (w.x / r) * (w.x / r))) * f;
    s.drw = tint;
    vec3 c = worley(p / max(3.0, fw * 9.0), 0.9);
    float rr = 0.18 + 0.1 * c.z;
    s.ink = (1.0 - smoothstep(0.0, 0.035 + 0.6 * fwidth(c.x), abs(c.x - rr))) * 0.85;
    return s;
  }
  // soil and grass (m == 2): colour from wetness, temperature, rain
  float dry = clamp(1.0 - (wet - 4.0) / 8.0, 0.0, 1.0);
  vec3 green = vec3(0.33, 0.45, 0.22), dryg = vec3(0.6, 0.57, 0.37), alp = vec3(0.52, 0.5, 0.38), bare = vec3(0.5, 0.42, 0.33);
  vec3 g = mix(green, dryg, dry * 0.7);
  g = mix(g, alp, smoothstep(4.0, -1.0, T));
  g = mix(bare, g, smoothstep(0.05, 0.4, soil));
  float pt = vnoise(p / 9.0), fine = vnoise(p * 2.2);
  s.nat = g * (0.88 + 0.18 * pt) * (0.95 + 0.08 * fine * fadeFor(0.5, fw));
  s.bump = 0.03 * fine * fadeFor(0.5, fw);
  s.drw = tint;
  return s;
}

vec3 perturb(vec3 pos, vec3 n, float hgt) {
  vec3 sx = dFdx(pos), sy = dFdy(pos), r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1);
  vec3 grad = sign(det) * (dFdx(hgt) * r1 + dFdy(hgt) * r2);
  float gl = length(grad), lim = 0.6 * abs(det);          // at most ~31° of tilt from detail
  if (gl > lim) grad *= lim / gl;
  return normalize(abs(det) * n - grad);
}

void main() {
  #include <clipping_planes_fragment>
  vec2 p = vec2(vW.x, -vW.z);
  vec3 n = normalize(vNrm);
  float slope = sqrt(max(0.0, 1.0 - n.y * n.y));                 // sin of the slope angle
  vec2 fall = length(n.xz) > 1e-4 ? normalize(vec2(n.x, -n.z)) : vec2(1.0, 0.0);
  float fw = max(length(fwidth(p)), 1e-4);
  float zeta = vW.y - vInfo.x - vInfo.w;
  // four nearest cells, bilinear + height-based weights
  // material lookup warped by ~1.5 cells of noise so boundaries follow organic contours, not cell edges
  vec2 warp = vec2(vnoise(p / (uCellM * 3.0)), vnoise(p / (uCellM * 3.0) + 17.0)) - 0.5;
  vec2 g = vUV * (uN - 1.0) + warp * 3.0; vec2 g0 = floor(g), fr = g - g0;
  ivec2 i0 = ivec2(g0);
  int ids[4]; int lit[4]; float wts[4];
  ivec2 offs[4] = ivec2[4](ivec2(0, 0), ivec2(1, 0), ivec2(0, 1), ivec2(1, 1));
  float bw[4] = float[4]((1.0 - fr.x) * (1.0 - fr.y), fr.x * (1.0 - fr.y), (1.0 - fr.x) * fr.y, fr.x * fr.y);
  float mx = -1.0;
  int nmax = int(uN) - 1;
  for (int k = 0; k < 4; k++) {
    ivec2 c = clamp(i0 + offs[k], ivec2(0), ivec2(nmax));
    vec4 t = texelFetch(uMat, c, 0);
    ids[k] = int(t.r * 255.0 + 0.5); lit[k] = int(t.g * 255.0 + 0.5);
    wts[k] = bw[k] + 0.55 * hfun(ids[k], p);
    mx = max(mx, wts[k]);
  }
  vec3 nat = vec3(0.0), drw = vec3(0.0); float bump = 0.0, ink = 0.0, wsum = 0.0, rockW = 0.0;
  for (int k = 0; k < 4; k++) {
    float w = max(0.0, wts[k] - (mx - 0.14));
    if (w <= 0.0) continue;
    bool dup = false;
    for (int j = 0; j < k; j++) if (ids[j] == ids[k] && lit[j] == lit[k] && max(0.0, wts[j] - (mx - 0.14)) > 0.0) dup = true;
    if (dup) { // add the weight to the first copy's contribution by re-using it
      continue;
    }
    float wt = 0.0;
    for (int j = k; j < 4; j++) if (ids[j] == ids[k] && lit[j] == lit[k]) wt += max(0.0, wts[j] - (mx - 0.14));
    S s = surface(ids[k], lit[k], p, zeta, slope, fall, fw, vInfo.x, vInfo.y, vInfo.z, vW.y - uSea);
    nat += s.nat * wt; drw += s.drw * wt; bump += s.bump * wt; ink += s.ink * wt; wsum += wt;
    if (ids[k] == 0) rockW += wt;
  }
  nat /= wsum; drw /= wsum; bump /= wsum; ink /= wsum; rockW /= wsum;
  if (uCanopyOn > 0.5) {   // far-field forest as a canopy tint (the plant side's region cover), broken by a crown-sized noise
    vec4 cv = texture2D(uCanopy, vUV);
    float crowns = smoothstep(0.25, 0.75, vnoise(p / 9.0) * 0.6 + vnoise(p / 3.5) * 0.4);
    float a = clamp(cv.a, 0.0, 1.0) * mix(0.75, 1.0, crowns);
    nat = mix(nat, cv.rgb * mix(0.8, 1.08, crowns), a * 0.85);
    drw = mix(drw, uCanopyDraw * mix(0.92, 1.02, crowns), a * 0.55);
    bump += 0.25 * a * crowns;
  }
  vec3 nb = perturb(vW, n, bump);
  float fog = 1.0 - exp(-vDist / uFog);
  vec3 col;
  if (uPal > 0.5) {
    // natural: sun with baked cast shadow, sky with the sky-view factor, aerial perspective
    // soft daylight (plant agent, 2026-10-13): a bright overcast-plus-sun model, so faces turned from the sun stay
    // legible like a photograph in soft light: sky light dominates, the sun adds modelling, the baked cast shadow
    // only halves the sun.
    float sun = max(0.0, dot(nb, uSun)) * mix(0.45, 1.0, vLight.x);
    float sky = (0.78 + 0.22 * nb.y) * mix(0.82, 1.0, vLight.y);
    col = nat * (vec3(1.0, 0.97, 0.9) * 0.62 * sun + vec3(0.8, 0.86, 0.94) * 0.86 * sky + vec3(0.06, 0.055, 0.05));
    col = col * 1.55 / (col + 0.55);           // soft shoulder: no clipped highlights, lifted shadows
    col = mix(col, uSky, fog * 0.55);
  } else {
    // drawing: pale relief shading (NW key), tints, contours, hachures, symbols
    float key = dot(nb, uKey), flatKey = uKey.y;
    float shade = clamp(1.0 + 0.85 * (key - flatKey), 0.5, 1.12);
    shade = mix(shade, 1.0, 0.0) * mix(0.82, 1.0, vLight.y);
    col = drw * shade;
    // contours (not on cliffs, where hachures speak)
    // interval doubles until lines are at least ~5 px apart on a 30° slope
    float ci = uContour * exp2(max(0.0, ceil(log2(fw * 3.0 / uContour)))), cl = vW.y / ci;
    float c1 = lineAA(cl, 0.8), c5 = lineAA(cl / 5.0, 1.4);
    float cOn = (1.0 - rockW * smoothstep(0.55, 0.75, slope));
    vec3 cCol = vInfo.z < -2.0 ? vec3(0.45, 0.58, 0.72) : SEPIA;
    float cAlpha = max(c1 * 0.4, c5 * 0.7) * cOn * mix(1.0, 0.45, uFocus);   // quieter under a forest (plant agent)
    col = mix(col, cCol, cAlpha);
    // hachures along the fall line on steep rock, denser on the shaded side
    float sp = exp2(ceil(log2(max(fw * 5.0, 0.25))));
    vec2 across = vec2(-fall.y, fall.x);
    float u = dot(p, across) / sp, along = dot(p, fall) / sp;
    float brk = step(0.25, vnoise(vec2(floor(u), along * 0.35)));
    float stroke = (1.0 - smoothstep(0.0, 0.2 + 0.15 * (1.0 - shade), abs(fract(u + 0.15 * vnoise(vec2(along * 0.5, floor(u)))) - 0.5) - 0.0)) * brk;
    float hach = 0.6 * stroke * rockW * smoothstep(0.55, 0.85, slope) * clamp(1.3 - shade, 0.2, 1.0);
    ink = max(ink, hach);
    col = mix(col, INK, clamp(ink, 0.0, 1.0) * 0.8);
    col = mix(col, uPaper, fog * 0.55);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

// ---------------------------------------------------------------------------------- water and rivers
const WATER_VS = /* glsl */`
attribute vec3 aWater;   // ground height, shore distance m, kind (2 lake, 3 sea)
#include <clipping_planes_pars_vertex>
varying vec3 vW; varying vec3 vWater; varying float vDist;
void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vWater = aWater; vec4 mv = viewMatrix * wp; vDist = -mv.z; vec4 mvPosition = mv;
  #include <clipping_planes_vertex>
  gl_Position = projectionMatrix * mv; }`;
const WATER_FS = /* glsl */`
precision highp float;
uniform float uPal, uTime, uFog, uLines; uniform vec3 uSun, uSky, uPaper;
varying vec3 vW; varying vec3 vWater; varying float vDist;
${GLSL_NOISE}
#include <clipping_planes_pars_fragment>
void main() {
  #include <clipping_planes_fragment>
  float depth = vW.y - vWater.x;
  if (depth < -0.05) discard;
  vec2 p = vec2(vW.x, -vW.z);
  float fw = max(length(fwidth(p)), 1e-4);
  float fog = 1.0 - exp(-vDist / uFog);
  float edge = smoothstep(0.0, 1.2, depth);
  if (uPal > 0.5) {
    // small waves: a few directional sines warped by noise, damped with distance (no aliasing)
    float damp = 1.0 - smoothstep(0.3, 2.0, fw);
    vec2 wq = p + 2.0 * vec2(fbm3(p / 13.0), fbm3(p / 13.0 + 7.0));
    float gx = 0.0, gz = 0.0;
    for (int k = 0; k < 4; k++) {
      float a = 0.6 + float(k) * 1.37, f = 0.9 / (1.0 + float(k) * 0.7), sp = 0.8 + 0.3 * float(k);
      vec2 d = vec2(cos(a), sin(a));
      float c = cos(dot(wq, d) * f + uTime * sp);
      gx += d.x * c * 0.03 / (1.0 + float(k)); gz += d.y * c * 0.03 / (1.0 + float(k));
    }
    vec3 nrm = normalize(vec3(gx * damp, 1.0, -gz * damp));
    vec3 deep = vWater.z > 2.5 ? vec3(0.08, 0.2, 0.3) : vec3(0.08, 0.22, 0.24);
    vec3 shallow = vec3(0.32, 0.45, 0.4);
    vec3 col = mix(shallow, deep, smoothstep(0.0, 12.0, depth));
    vec3 V = normalize(cameraPosition - vW);
    float fres = 0.04 + 0.96 * pow(1.0 - max(0.0, dot(nrm, V)), 5.0);
    col = mix(col, uSky, fres * 0.8);
    vec3 H = normalize(uSun + V); col += vec3(1.0, 0.95, 0.85) * pow(max(0.0, dot(nrm, H)), 180.0) * 0.6;
    float swash = 0.5 + 0.5 * sin(vWater.y * 1.6 - uTime * 1.2 + 4.0 * fbm3(p / 6.0));
    float foam = (1.0 - smoothstep(0.0, 2.5 + 2.0 * swash, vWater.y)) * smoothstep(0.35, 0.75, fbm3(p / 1.8 + uTime * 0.05)) * (vWater.z > 2.5 ? 1.0 : 0.35) * damp;
    col = mix(col, vec3(0.93, 0.95, 0.95), foam * 0.75);
    col = mix(col, uSky, fog * 0.85);
    gl_FragColor = vec4(col, mix(0.55, 0.92, edge));
  } else {
    vec3 col = vec3(0.86, 0.915, 0.95);
    float d = vWater.y;
    // waterlines parallel to the shore, spacing growing offshore (old-map convention)
    float wl = 0.0;
    for (int k = 1; k <= 4; k++) { float r = uLines * float(k * k); float a = (1.0 - smoothstep(0.0, 1.0, abs(d - r) / max(fwidth(d) * 0.9, 1e-3))) * smoothstep(0.5 * r, r, d + 0.0); wl = max(wl, a * (1.0 - 0.18 * float(k))); }
    col = mix(col, vec3(0.42, 0.56, 0.68), wl * 0.7);
    // the shoreline is the depth-zero isoline: pixel distance = depth / |∇depth| in screen space
    float shore = 1.0 - smoothstep(0.6, 1.6, depth / max(fwidth(depth), 1e-4));
    col = mix(col, vec3(0.2, 0.3, 0.4), shore * 0.85);
    col = mix(col, uPaper, fog * 0.9);
    gl_FragColor = vec4(col, 1.0);
  }
}`;

const RIVER_VS = /* glsl */`
attribute vec3 aDir;      // tangent (three space, horizontal)
attribute vec4 aRiver;    // side −1/+1, width m, s along m, speed m/s
attribute vec2 aExtra;    // foam factor, order
uniform float uPxScale, uLift;
#include <clipping_planes_pars_vertex>
varying vec4 vR; varying vec2 vE; varying vec3 vW; varying float vDist; varying float vHalf;
void main() {
  vec4 wc = modelMatrix * vec4(position, 1.0);
  float dist = length(cameraPosition - wc.xyz);
  float px = dist * uPxScale;                               // metres per pixel at this vertex
  float hw = max(aRiver.y * 0.5, (1.4 + 0.45 * aExtra.y) * px * 0.5);
  vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), aDir));
  wc.xyz += side * aRiver.x * hw;
  wc.y += uLift * px;
  vR = aRiver; vE = aExtra; vW = wc.xyz; vHalf = hw;
  vec4 mv = viewMatrix * wc; vDist = -mv.z;
  vec4 mvPosition = mv;
  #include <clipping_planes_vertex>
  gl_Position = projectionMatrix * mv;
}`;
const RIVER_FS = /* glsl */`
precision highp float;
uniform float uPal, uTime, uFog; uniform vec3 uSky, uSun, uPaper;
varying vec4 vR; varying vec2 vE; varying vec3 vW; varying float vDist; varying float vHalf;
${GLSL_NOISE}
#include <clipping_planes_pars_fragment>
void main() {
  #include <clipping_planes_fragment>
  float across = vR.x;                 // −1 … 1
  float s = vR.z, speed = vR.w;
  float fog = 1.0 - exp(-vDist / uFog);
  // two-phase flow (Vlachos 2010): two scrolls half a period apart, cross-faded
  float T = 2.0, t0 = fract(uTime / T), t1 = fract(uTime / T + 0.5);
  float a = across * vHalf;
  float n0 = fbm3(vec2(s - speed * T * t0, a) * vec2(0.35, 0.9));
  float n1 = fbm3(vec2(s - speed * T * t1 + 17.0, a) * vec2(0.35, 0.9));
  float n = mix(n0, n1, abs(2.0 * t0 - 1.0));
  if (uPal > 0.5) {
    vec3 col = mix(vec3(0.1, 0.24, 0.27), vec3(0.2, 0.36, 0.36), n);
    col = mix(col, uSky, 0.25 + 0.2 * n);
    float px = vDist * 0.0012;
    float foam = smoothstep(0.55, 0.8, n + vE.x * 0.45) * vE.x * (1.0 - smoothstep(0.5, 3.0, px));
    col = mix(col, vec3(0.93, 0.95, 0.95), foam);
    col = mix(col, vec3(0.45, 0.42, 0.33), smoothstep(0.75, 1.0, abs(across)) * 0.5);
    col = mix(col, uSky, fog * 0.6);
    gl_FragColor = vec4(col, 1.0);
  } else {
    vec3 col = vec3(0.55, 0.7, 0.84);
    float bank = smoothstep(0.45, 0.8, abs(across));
    col = mix(col, vec3(0.16, 0.3, 0.48), bank);
    float dash = step(0.62, n) * (1.0 - bank) * step(abs(across), 0.5);
    col = mix(col, vec3(0.45, 0.6, 0.75), dash * 0.6);
    col = mix(col, uPaper, fog * 0.5);
    gl_FragColor = vec4(col, 1.0);
  }
}`;

const ROCK_VS = /* glsl */`
uniform float uInflate;
#include <clipping_planes_pars_vertex>
varying vec3 vN; varying vec3 vW; varying vec3 vC; varying float vDist; varying vec3 vObj;
void main() {
  vec3 pos = position + normal * uInflate;
  vec4 wp = modelMatrix * instanceMatrix * vec4(pos, 1.0);
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vW = wp.xyz; vObj = position;
  #ifdef USE_INSTANCING_COLOR
  vC = instanceColor;
  #else
  vC = vec3(0.6);
  #endif
  vec4 mv = viewMatrix * wp; vDist = -mv.z; vec4 mvPosition = mv;
  #include <clipping_planes_vertex>
  gl_Position = projectionMatrix * mv;
}`;
const ROCK_FS = /* glsl */`
precision highp float;
uniform float uPal, uFog, uOutline; uniform vec3 uSun, uKey, uSky, uPaper;
varying vec3 vN; varying vec3 vW; varying vec3 vC; varying float vDist; varying vec3 vObj;
${GLSL_NOISE}
#include <clipping_planes_pars_fragment>
void main() {
  #include <clipping_planes_fragment>
  if (uOutline > 0.5) { if (uPal > 0.5) discard; gl_FragColor = vec4(0.13, 0.145, 0.16, 1.0); return; }
  vec3 n = normalize(vN);
  float fog = 1.0 - exp(-vDist / uFog);
  float lich = vnoise(vObj.xz * 4.0 + vObj.y * 3.0);
  if (uPal > 0.5) {
    vec3 c = vC * (0.85 + 0.25 * lich);
    float sun = max(0.0, dot(n, uSun)), sky = 0.55 + 0.45 * n.y;
    vec3 col = c * (vec3(1.0, 0.96, 0.88) * sun + vec3(0.62, 0.7, 0.8) * 0.55 * sky);
    col = mix(col, uSky, fog * 0.85);
    gl_FragColor = vec4(pow(col, vec3(0.92)), 1.0);
  } else {
    float k = dot(n, uKey);
    vec3 col = vec3(0.985, 0.98, 0.97) * clamp(0.92 + 0.25 * k, 0.7, 1.05);
    // hatch the shaded side
    vec2 sc = gl_FragCoord.xy / 3.0;
    float hatch = step(0.6, fract(sc.x + sc.y)) * smoothstep(0.1, -0.4, k);
    col = mix(col, vec3(0.3, 0.32, 0.34), hatch * 0.5);
    col = mix(col, uPaper, fog * 0.9);
    gl_FragColor = vec4(col, 1.0);
  }
}`;

// ---------------------------------------------------------------------------------- helpers
function gridNormals(h, n, cell) {
  const nr = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i;
    const xm = i > 0 ? k - 1 : k, xp = i < n - 1 ? k + 1 : k, ym = j > 0 ? k - n : k, yp = j < n - 1 ? k + n : k;
    const gx = (h[xp] - h[xm]) / ((xp - xm) * cell), gy = (h[yp] - h[ym]) / (((yp - ym) / n) * cell);
    // terrain normal (−gx, −gy, 1) in (x, y, up) → three (x, up, −y)
    const L = Math.hypot(gx, gy, 1);
    nr[k * 3] = -gx / L; nr[k * 3 + 1] = 1 / L; nr[k * 3 + 2] = gy / L;
  }
  return nr;
}
/** cast shadow toward the sun and sky-view factor by horizon marching (geometric steps), per vertex */
// bakeLight lives in landscape-terrain.js (pure, so the worker can bake the region; a crop is baked here)
function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Arches-style eroded Voronoi rock: convex cell of random half-spaces, rounded by a soft-min */
export function rockGeometry(kind, seed, detail = 3) {
  const r = mulberry(seed * 7919 + kind * 104729 + 1);
  const planes = [];
  const add = (x, y, z, d) => { const L = Math.hypot(x, y, z); planes.push([x / L, y / L, z / L, d]); };
  if (kind === 3) {                                              // basalt prism: 6 sides + 2 caps
    const a0 = r() * Math.PI;
    for (let k = 0; k < 6; k++) { const a = a0 + k * Math.PI / 3 + (r() - 0.5) * 0.25; add(Math.cos(a), 0, Math.sin(a), 0.75 + 0.15 * r()); }
    add(0.05 * (r() - 0.5), 1, 0.05 * (r() - 0.5), 0.7 + 0.5 * r()); add(0, -1, 0, 0.7 + 0.4 * r());
  } else if (kind === 4) {                                       // limestone slab
    add(0, 1, 0, 0.32 + 0.1 * r()); add(0, -1, 0, 0.3);
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + r() * 0.8; add(Math.cos(a), 0.15 * (r() - 0.5), Math.sin(a), 0.8 + 0.4 * r()); }
  } else {
    const m = kind === 1 ? 9 : 14;
    for (let k = 0; k < m; k++) {
      let x, y, z; do { x = r() * 2 - 1; y = r() * 2 - 1; z = r() * 2 - 1; } while (x * x + y * y + z * z > 1 || x * x + y * y + z * z < 0.05);
      const flat = kind === 2 ? 1.35 : 1.0;                       // tor blocks: sheeted, flatter
      add(x, y * flat, z, (0.7 + 0.35 * r()) * (y < 0 ? 0.85 : 1));
    }
    add(0, -1, 0, 0.55);                                         // a contact face at the bottom
  }
  const kappa = kind === 1 ? 14 : kind === 3 ? 10 : kind === 4 ? 9 : 5;   // larger = sharper
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const pos = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    // ray distance to each plane; soft-min of them (rounded far from the contact = top)
    const top = 0.5 + 0.5 * v.y, kap = kappa * (1.3 - 0.6 * top);
    let s = 0, hard = Infinity;
    for (const [a, b, c, d] of planes) { const dn = a * v.x + b * v.y + c * v.z; if (dn <= 1e-3) continue; const t = d / dn; hard = Math.min(hard, t); }
    for (const [a, b, c, d] of planes) { const dn = a * v.x + b * v.y + c * v.z; if (dn <= 1e-3) continue; const t = d / dn; s += Math.exp(-kap * (t - hard)); }
    const rad = Math.min(hard, hard - Math.log(s) / kap) * (1 + 0.035 * (r() - 0.5));
    pos.setXYZ(i, v.x * rad, v.y * rad, v.z * rad);
  }
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

const ROCK_TINT = [[0.63, 0.6, 0.57], [0.74, 0.6, 0.46], [0.78, 0.77, 0.72], [0.3, 0.3, 0.31], [0.47, 0.49, 0.52]];

// ---------------------------------------------------------------------------------- buildGround
export function buildGround(terrain, opts = {}) {
  const t = terrain, n = t.n, c = t.cell_m, N = n * n;
  const focus = (opts.detail || (t.isCrop ? 'focus' : 'region')) === 'focus';
  const group = new THREE.Group();
  group.userData.origin = [t.x0 || 0, t.y0 || 0];
  group.userData.mapping = 'three (x, y, z) = terrain (x, h, −y), metres from the SW corner';
  const disposables = [];
  const clip = opts.clippingPlanes || null;
  const allMats = [];
  const sun = new THREE.Vector3();
  // sun from the south-west quarter, 32° up (terrain azimuth measured from east, counter-clockwise)
  { const az = 235 * Math.PI / 180, el = 38 * Math.PI / 180; sun.set(Math.cos(az) * Math.cos(el), Math.sin(el), -Math.sin(az) * Math.cos(el)).normalize(); }
  const key = new THREE.Vector3(-1, 1.414, -1).normalize();         // from the north-west, 45° up (x west, −z north)
  const wind = t.opts && t.opts.climate ? t.opts.climate.windDir : 0;
  const sea = t.seaLevel != null ? t.seaLevel : 0;
  const S = t.size_m;
  const common = {
    uPal: { value: opts.palette === 'natural' ? 1 : 0 }, uTime: { value: 0 },
    uSun: { value: sun }, uKey: { value: key }, uSky: { value: new THREE.Color(PALETTE_BG.natural) }, uPaper: { value: new THREE.Color(PALETTE_BG.drawing) },
    uFog: { value: focus ? S * 10 : S * 3 },
  };

  // ------------------------------------------------ ground mesh (region grids above 600² are decimated by 2;
  // the material texture and the water stay at full resolution)
  const H = t.height;
  const st = !focus && n > 600 ? 2 : 1, m = Math.floor((n - 1) / st) + 1, cm = c * st;
  const Hm = st === 1 ? H : new Float32Array(m * m);
  if (st > 1) for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) Hm[j * m + i] = H[(j * st) * n + i * st];
  const pos = new Float32Array(m * m * 3), uv = new Float32Array(m * m * 2), info = new Float32Array(m * m * 4);
  for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) {
    const k = j * m + i, K = (j * st) * n + i * st;
    pos[k * 3] = i * cm; pos[k * 3 + 1] = Hm[k]; pos[k * 3 + 2] = -j * cm;
    uv[k * 2] = (i * st) / (n - 1); uv[k * 2 + 1] = (j * st) / (n - 1);
    info[k * 4] = t.soil[K]; info[k * 4 + 1] = t.wetness[K]; info[k * 4 + 2] = t.T[K]; info[k * 4 + 3] = t.strataOffset[K];
  }
  const idx = new Uint32Array((m - 1) * (m - 1) * 6);
  let q = 0;
  for (let j = 0; j < m - 1; j++) for (let i = 0; i < m - 1; i++) {
    const a = j * m + i, b = a + 1, d = a + m, e = d + 1;
    // split along the shorter diagonal for a truer surface
    if (Math.abs(Hm[a] - Hm[e]) < Math.abs(Hm[b] - Hm[d])) { idx[q++] = a; idx[q++] = b; idx[q++] = e; idx[q++] = a; idx[q++] = e; idx[q++] = d; }
    else { idx[q++] = a; idx[q++] = b; idx[q++] = d; idx[q++] = b; idx[q++] = e; idx[q++] = d; }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(gridNormals(Hm, m, cm), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('aInfo', new THREE.BufferAttribute(info, 4));
  geo.setAttribute('aLight', new THREE.BufferAttribute(t.lightBake && t.lightBake.length === m * m * 2 ? t.lightBake : bakeLight(st === 1 ? t : { n: m, cell_m: cm, height: Hm }, sun, t.parentSample), 2)); // the worker pre-bakes the region
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  // material id texture
  const matData = new Uint8Array(N * 4);
  for (let k = 0; k < N; k++) { matData[k * 4] = t.material[k]; matData[k * 4 + 1] = t.lithology[k]; matData[k * 4 + 3] = 255; }
  const matTex = new THREE.DataTexture(matData, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
  matTex.magFilter = matTex.minFilter = THREE.NearestFilter; matTex.needsUpdate = true;
  // strata texture over the ζ range present
  let zlo = Infinity, zhi = -Infinity;
  for (let k = 0; k < N; k++) { const z = H[k] - t.soil[k] - t.strataOffset[k]; if (z < zlo) zlo = z; if (z > zhi) zhi = z; }
  zlo -= 30; zhi += 30;
  const SW = 4096, strata = t.strata, sData = new Uint8Array(SW * 5 * 4);
  for (let L = 0; L < 5; L++) for (let x = 0; x < SW; x++) {
    const z = zlo + (zhi - zlo) * (x + 0.5) / SW;
    let zi = Math.round(z - strata.zmin); zi = zi < 0 ? 0 : zi >= strata.len ? strata.len - 1 : zi;
    const v = Math.round(Math.min(1, Math.max(0, strata.tables[L][zi])) * 255);
    const o = (L * SW + x) * 4; sData[o] = v; sData[o + 1] = v; sData[o + 2] = v; sData[o + 3] = 255;
  }
  const strataTex = new THREE.DataTexture(sData, SW, 5, THREE.RGBAFormat, THREE.UnsignedByteType);
  strataTex.magFilter = strataTex.minFilter = THREE.LinearFilter; strataTex.needsUpdate = true;
  const groundMat = new THREE.ShaderMaterial({
    clipping: true, clippingPlanes: clip,
    vertexShader: GROUND_VS, fragmentShader: GROUND_FS,
    uniforms: {
      ...common, uMat: { value: matTex }, uStrata: { value: strataTex }, uZeta: { value: new THREE.Vector2(zlo, zhi) },
      uN: { value: n }, uCellM: { value: c }, uContour: { value: focus ? 5 : 20 }, uSea: { value: sea }, uFocus: { value: focus ? 1 : 0 },
      uWind: { value: new THREE.Vector2(-Math.cos(wind), -Math.sin(wind)) },
      uCanopy: { value: null }, uCanopyDraw: { value: new THREE.Color(0xd9e0cf) }, uCanopyOn: { value: 0 },
    },
    extensions: { derivatives: true },
  });
  const ground = new THREE.Mesh(geo, groundMat);
  ground.name = 'ground';
  group.add(ground);
  disposables.push(geo, groundMat, matTex, strataTex);

  // ------------------------------------------------ lakes and sea: one surface at their levels
  {
    const lvl = new Float32Array(N).fill(NaN), kind = new Uint8Array(N);
    for (let k = 0; k < N; k++) if (t.waterKind[k] >= 2) { lvl[k] = H[k] + t.water[k]; kind[k] = t.waterKind[k]; }
    // dilate by one cell so the surface meets the shore inside the ground
    const lv2 = Float32Array.from(lvl), k2 = Uint8Array.from(kind);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i; if (!Number.isNaN(lvl[k])) continue;
      let best = NaN, bk = 0;
      for (let b = -1; b <= 1; b++) for (let e = -1; e <= 1; e++) { const ii = i + e, jj = j + b; if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue; const v = lvl[jj * n + ii]; if (!Number.isNaN(v) && !(v <= best)) { best = v; bk = kind[jj * n + ii]; } }
      if (!Number.isNaN(best)) { lv2[k] = best; k2[k] = bk; }
    }
    // shore distance in water (chamfer, metres)
    const sd = new Float32Array(N).fill(1e6);
    for (let k = 0; k < N; k++) if (!kind[k]) sd[k] = 0;
    for (let pass = 0; pass < 2; pass++) {
      const fw = pass === 0, y0 = fw ? 0 : n - 1, y1 = fw ? n : -1, dy = fw ? 1 : -1;
      for (let y = y0; y !== y1; y += dy) for (let xi = 0; xi < n; xi++) {
        const x = fw ? xi : n - 1 - xi, k = y * n + x;
        for (const [ox, oy, w] of fw ? [[-1, 0, 1], [0, -1, 1], [-1, -1, 1.414], [1, -1, 1.414]] : [[1, 0, 1], [0, 1, 1], [1, 1, 1.414], [-1, 1, 1.414]]) {
          const xx = x + ox, yy = y + oy; if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
          const v = sd[yy * n + xx] + w * c; if (v < sd[k]) sd[k] = v;
        }
      }
    }
    const wpos = [], wattr = [], widx = [], vmap = new Int32Array(N).fill(-1);
    const vert = (k) => {
      if (vmap[k] >= 0) return vmap[k];
      const i = k % n, j = (k - i) / n;
      vmap[k] = wpos.length / 3; wpos.push(i * c, lv2[k], -j * c); wattr.push(H[k], kind[k] ? sd[k] : 0, k2[k]);
      return vmap[k];
    };
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
      const a = j * n + i, b = a + 1, d = a + n, e = d + 1;
      if (Number.isNaN(lv2[a]) || Number.isNaN(lv2[b]) || Number.isNaN(lv2[d]) || Number.isNaN(lv2[e])) continue;
      if (!(kind[a] || kind[b] || kind[d] || kind[e])) continue;
      const A = vert(a), B = vert(b), D = vert(d), E = vert(e);
      // the ground's diagonal, so the interpolated ground under the water matches the ground mesh
      if (Math.abs(H[a] - H[e]) < Math.abs(H[b] - H[d])) widx.push(A, B, E, A, E, D); else widx.push(A, B, D, B, E, D);
    }
    if (widx.length) {
      const wg = new THREE.BufferGeometry();
      wg.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
      wg.setAttribute('aWater', new THREE.Float32BufferAttribute(wattr, 3));
      wg.setIndex(widx);
      const wm = new THREE.ShaderMaterial({ clipping: true, clippingPlanes: clip, vertexShader: WATER_VS, fragmentShader: WATER_FS, uniforms: { ...common, uLines: { value: focus ? 2.5 : 18 } }, transparent: true, depthWrite: false, extensions: { derivatives: true } });
      wm.uniforms.uTime = common.uTime; wm.uniforms.uPal = common.uPal;
      const water = new THREE.Mesh(wg, wm); water.name = 'water'; water.renderOrder = 2;
      group.add(water); disposables.push(wg, wm);
    }
  }

  // ------------------------------------------------ rivers: ribbons
  const riverMats = [];
  {
    const P = [], DIR = [], RIV = [], EXT = [], I = [];
    const lines = (t.rivers || []).concat((t.oxbows || []).map((o) => { const k = o.pts.length / 3; return { pts: o.pts, width: new Float32Array(k).fill(o.width), depth: new Float32Array(k).fill(0.6), order: 1, still: true }; }));
    for (const r of lines) {
      const m = r.width.length; if (m < 2) continue;
      let s = 0;
      for (let p = 0; p < m; p++) {
        const x = r.pts[p * 3], y = r.pts[p * 3 + 1], z = r.pts[p * 3 + 2];
        const pa = Math.max(0, p - 1), pb = Math.min(m - 1, p + 1);
        let dx = r.pts[pb * 3] - r.pts[pa * 3], dy = r.pts[pb * 3 + 1] - r.pts[pa * 3 + 1];
        const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
        if (p > 0) s += Math.hypot(x - r.pts[p * 3 - 3], y - r.pts[p * 3 - 2]);
        const slope = p > 0 ? Math.max(0, (r.pts[p * 3 - 1] - z) / Math.max(1, Math.hypot(x - r.pts[p * 3 - 3], y - r.pts[p * 3 - 2]))) : 0;
        const w = r.width[p], d = r.depth ? r.depth[p] : 0.5;
        const speed = r.still ? 0 : Math.min(4, (1 / 0.035) * Math.pow(Math.max(0.05, d), 2 / 3) * Math.sqrt(Math.max(1e-4, slope || 0.002)));
        const foam = r.still ? 0 : Math.min(1, Math.max(0, 1 - s / (3 * w + 10)) * (p === 0 ? 0 : 0.7) + Math.max(0, Math.min(1, (slope - 0.04) * 8)));
        for (const side of [-1, 1]) {
          P.push(x, z, -y); DIR.push(dx, 0, -dy); RIV.push(side, w, s, speed); EXT.push(foam, r.order || 1);
        }
        if (p > 0) { const b = (P.length / 3) - 4; I.push(b, b + 1, b + 3, b, b + 3, b + 2); }
      }
    }
    if (I.length) {
      const rg = new THREE.BufferGeometry();
      rg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      rg.setAttribute('aDir', new THREE.Float32BufferAttribute(DIR, 3));
      rg.setAttribute('aRiver', new THREE.Float32BufferAttribute(RIV, 4));
      rg.setAttribute('aExtra', new THREE.Float32BufferAttribute(EXT, 2));
      rg.setIndex(I);
      const rm = new THREE.ShaderMaterial({
        clipping: true, clippingPlanes: clip,
        vertexShader: RIVER_VS, fragmentShader: RIVER_FS,
        uniforms: { ...common, uPxScale: { value: 0.001 }, uLift: { value: focus ? 0.6 : 1.2 } },
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide,
      });
      rm.uniforms.uTime = common.uTime; rm.uniforms.uPal = common.uPal;
      const rivers = new THREE.Mesh(rg, rm); rivers.name = 'rivers'; rivers.renderOrder = 1; rivers.frustumCulled = false;
      // metres-per-pixel factor from the camera that renders it
      rivers.onBeforeRender = (renderer, scene, camera) => {
        const hpx = renderer.getDrawingBufferSize(new THREE.Vector2()).y / renderer.getPixelRatio();
        rm.uniforms.uPxScale.value = camera.isPerspectiveCamera ? 2 * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, hpx) / camera.zoom : 1 / Math.max(1, hpx);
      };
      group.add(rivers); disposables.push(rg, rm); riverMats.push(rm);
    }
  }

  // ------------------------------------------------ rocks (focus)
  const rockMats = [];
  if (focus && t.rocks && t.rocks.length && opts.rocks !== false) {
    const R = t.rocks, count = R.length / 8, byKind = [[], [], [], [], []];
    for (let k = 0; k < count; k++) byKind[R[k * 8 + 4] | 0].push(k);
    const mat = new THREE.ShaderMaterial({ clipping: true, clippingPlanes: clip, vertexShader: ROCK_VS, fragmentShader: ROCK_FS, uniforms: { ...common, uInflate: { value: 0 }, uOutline: { value: 0 } } });
    const outl = new THREE.ShaderMaterial({ clipping: true, clippingPlanes: clip, vertexShader: ROCK_VS, fragmentShader: ROCK_FS, side: THREE.BackSide, uniforms: { ...common, uInflate: { value: 0.12 }, uOutline: { value: 1 } } });
    for (const m of [mat, outl]) { m.uniforms.uPal = common.uPal; m.uniforms.uTime = common.uTime; }
    rockMats.push(mat, outl); disposables.push(mat, outl);
    const PROTOS = 4, m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), tr = new THREE.Vector3(), col = new THREE.Color();
    for (let kind = 0; kind < 5; kind++) {
      const list = byKind[kind]; if (!list.length) continue;
      for (let pr = 0; pr < PROTOS; pr++) {
        const mine = list.filter((k) => (R[k * 8 + 7] | 0) % PROTOS === pr); if (!mine.length) continue;
        const g = rockGeometry(kind, pr + 1, kind === 1 ? 2 : 3);
        const im = new THREE.InstancedMesh(g, mat, mine.length), io = new THREE.InstancedMesh(g, outl, mine.length);
        mine.forEach((k, a) => {
          const x = R[k * 8], y = R[k * 8 + 1], z = R[k * 8 + 2], rad = R[k * 8 + 3], yaw = R[k * 8 + 5], tilt = R[k * 8 + 6];
          const L = t.lithology[Math.min(n - 1, Math.round(y / c)) * n + Math.min(n - 1, Math.round(x / c))];
          e.set(tilt, yaw, tilt * 0.5); qq.setFromEuler(e);
          const flat = kind === 4 ? 1 : kind === 3 ? 1.1 : 0.78;
          sc.set(rad, rad * flat, rad * (0.85 + 0.3 * ((k * 7) % 10) / 10)); tr.set(x, z, -y);
          m4.compose(tr, qq, sc); im.setMatrixAt(a, m4); io.setMatrixAt(a, m4);
          const tc = ROCK_TINT[L] || ROCK_TINT[0], v = 0.9 + 0.2 * (((k * 13) % 17) / 17);
          col.setRGB(tc[0] * v, tc[1] * v, tc[2] * v); im.setColorAt(a, col);
        });
        im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; io.instanceMatrix.needsUpdate = true;
        im.name = `rocks-${kind}-${pr}`; io.name = `rock-outlines-${kind}-${pr}`;
        io.visible = common.uPal.value < 0.5;
        group.add(im, io); disposables.push(g);
      }
    }
  }

  // ------------------------------------------------ height edits (focus): pits and mounds written into the ground
  const posAttr = geo.attributes.position, nrmAttr = geo.attributes.normal;
  function renormal(i0, i1, j0, j1) {
    const nr = nrmAttr.array;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * n + i;
      const xm = i > 0 ? k - 1 : k, xp = i < n - 1 ? k + 1 : k, ym = j > 0 ? k - n : k, yp = j < n - 1 ? k + n : k;
      const gx = (H[xp] - H[xm]) / ((xp - xm) * c), gy = (H[yp] - H[ym]) / (((yp - ym) / n) * c), L = Math.hypot(gx, gy, 1);
      nr[k * 3] = -gx / L; nr[k * 3 + 1] = 1 / L; nr[k * 3 + 2] = gy / L;
    }
  }
  /**
   * Add a height change to the ground: fn(x, y) → metres (local coordinates of this terrain/crop), or an
   * array of Gaussian bumps [{ x, y, r, dh }] (dh at the centre, r = 1/e radius; touched out to 2.5 r).
   * Updates terrain.height (so sample() agrees), the mesh positions and normals. Returns the cells changed.
   */
  function applyHeightDelta(arg) {
    if (st !== 1) throw new Error('applyHeightDelta: decimated region mesh; use a focus crop');
    let i0 = n, i1 = -1, j0 = n, j1 = -1, changed = 0, maxAbs = 0;
    const put = (k, d) => { if (!d) return; H[k] += d; posAttr.array[k * 3 + 1] = H[k]; changed++; if (Math.abs(d) > maxAbs) maxAbs = Math.abs(d); };
    if (typeof arg === 'function') {
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const d = +arg(i * c, j * c) || 0; if (d) { put(j * n + i, d); i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j); } }
    } else for (const b of arg || []) {
      const R = 2.5 * b.r, a0 = Math.max(0, Math.floor((b.x - R) / c)), a1 = Math.min(n - 1, Math.ceil((b.x + R) / c));
      const b0 = Math.max(0, Math.floor((b.y - R) / c)), b1 = Math.min(n - 1, Math.ceil((b.y + R) / c));
      for (let j = b0; j <= b1; j++) for (let i = a0; i <= a1; i++) { const d2 = ((i * c - b.x) ** 2 + (j * c - b.y) ** 2) / (b.r * b.r); if (d2 < 6.25) put(j * n + i, b.dh * Math.exp(-d2)); }
      if (a1 >= a0 && b1 >= b0) { i0 = Math.min(i0, a0); i1 = Math.max(i1, a1); j0 = Math.min(j0, b0); j1 = Math.max(j1, b1); }
    }
    if (i1 < 0) return 0;
    renormal(Math.max(0, i0 - 1), Math.min(n - 1, i1 + 1), Math.max(0, j0 - 1), Math.min(n - 1, j1 + 1));
    // upload only the touched rows; grow the bounding sphere instead of recomputing it
    const r0 = Math.max(0, j0 - 1) * n, r1 = (Math.min(n - 1, j1 + 1) + 1) * n;
    posAttr.clearUpdateRanges(); nrmAttr.clearUpdateRanges();
    posAttr.addUpdateRange(r0 * 3, (r1 - r0) * 3); nrmAttr.addUpdateRange(r0 * 3, (r1 - r0) * 3);
    posAttr.needsUpdate = true; nrmAttr.needsUpdate = true;
    if (geo.boundingSphere) geo.boundingSphere.radius += maxAbs;
    return changed;
  }
  // intersection = true clips where ALL planes clip (cuts a hole, e.g. the focus window out of the region)
  function setClippingPlanes(planes, intersection = false) {
    group.traverse((o) => { if (o.material) { o.material.clippingPlanes = planes || null; o.material.clipIntersection = !!intersection; o.material.needsUpdate = true; } });
  }

  function setPalette(p) {
    const v = p === 'natural' ? 1 : 0;
    common.uPal.value = v;
    group.traverse((o) => { if (o.name && o.name.startsWith('rock-outlines')) o.visible = v < 0.5; });
    group.userData.palette = p;
    group.userData.background = PALETTE_BG[p] ?? PALETTE_BG.drawing;
  }
  setPalette(opts.palette === 'natural' ? 'natural' : 'drawing');
  /** canopy tint for the far field (plant side): rgba Uint8Array m×m over the whole terrain (RGB natural colour, A cover),
   *  drawTint the drawing-palette tint; null switches it off */
  let canopyTex = null;
  function setCanopy(rgba, m, drawTint) {
    if (!rgba) { groundMat.uniforms.uCanopyOn.value = 0; return; }
    if (!canopyTex || canopyTex.image.width !== m) { if (canopyTex) canopyTex.dispose(); canopyTex = new THREE.DataTexture(rgba, m, m, THREE.RGBAFormat, THREE.UnsignedByteType); canopyTex.magFilter = canopyTex.minFilter = THREE.LinearFilter; disposables.push(canopyTex); }
    else canopyTex.image.data.set(rgba);
    canopyTex.colorSpace = THREE.SRGBColorSpace; canopyTex.needsUpdate = true;
    groundMat.uniforms.uCanopy.value = canopyTex; groundMat.uniforms.uCanopyOn.value = 1;
    if (drawTint != null) groundMat.uniforms.uCanopyDraw.value.setHex(drawTint);
  }
  return {
    setCanopy,
    group,
    setPalette,
    update(dt) { common.uTime.value += dt; },
    dispose() { for (const d of disposables) d.dispose(); group.clear(); },
    get palette() { return group.userData.palette; },
    applyHeightDelta, setClippingPlanes,
    background: () => group.userData.background,
    uniforms: common,
  };
}
