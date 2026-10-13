/*
 * silviculture-impostors.js — plants far from the camera as impostors made from the real module skeletons.
 * Every reference individual of every species (VARIANTS per species, six sizes each, silviculture-focus.js
 * buildRefs) is rendered from the side into a tile of a sprite atlas, once per palette (the natural palette on first
 * use). Instances are cylindrical billboards (they turn about the vertical to face the camera); each picks a variant
 * from a hash of its id and carries its own mirror flip, height and crown-width scale (±15 %), lean and tint (value
 * and hue within a few per cent), so neighbours never share a silhouette.
 * Ours: tile 128 × 192 px rendered through a 4× MSAA tile target and copied into a mipmapped atlas (16 columns);
 * alpha test 0.35; focus-plot billboards cast shadows (in the depth pass each turns to face the light); a minimum
 * on-screen height for the far field.
 */
import * as THREE from 'three';
import { PlantMeshes, BARK } from './silviculture-draw.js';
import { PLANTS } from './silviculture-plants.js';

const TW = 128, TH = 192, COLS = 16;

/** layout of all tiles: { list: [{k, v, j, sn}], tiles: {key: [variant][size] → tile}, cols, rows } (no rendering) */
export function atlasLayout(refs) {
  const keys = PLANTS.map((d) => d.key).filter((k) => refs[k]), list = [], tiles = {};
  for (const k of keys) {
    const vars = refs[k].variants || [refs[k].snaps];
    tiles[k] = vars.map(() => []);
    vars.forEach((snaps, v) => snaps.forEach((sn, j) => { const t = { i: list.length, w: 1, h: 1, H: sn.H, N: sn.N }; tiles[k][v][j] = t; list.push({ k, v, j, sn, t }); }));
  }
  return { list, tiles, cols: COLS, rows: Math.ceil(list.length / COLS), tex: {} };
}

const COPY_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const COPY_FS = 'uniform sampler2D uT; varying vec2 vUv; void main() { gl_FragColor = texture2D(uT, vUv); }';

/** render the atlas for one palette (synchronous) */
export function renderAtlas(renderer, atlas, pal, leafScale) { const it = atlasJob(renderer, atlas, pal, leafScale); while (!it.next().done); return atlas.tex[pal]; }
/** render the atlas for one palette as a generator (yields every few tiles, so it can be spread across frames);
 *  atlas.tex[pal] is set at once and fills as tiles are drawn; leafScale(d) gives the leaf size per catalogue entry */
export function* atlasJob(renderer, atlas, pal, leafScale = (d) => d.leafSize, per = 16) {
  if (atlas.tex[pal]) return atlas.tex[pal];
  const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -200, 200);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xdcdcd0, 2.0));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(-0.5, 1, 0.8); scene.add(sun);
  const pm = new PlantMeshes(scene, 20000);
  const tileRT = new THREE.WebGLRenderTarget(TW, TH, { samples: 4 });
  const rt = new THREE.WebGLRenderTarget(TW * COLS, TH * atlas.rows, { depthBuffer: false });
  rt.texture.colorSpace = THREE.SRGBColorSpace; rt.texture.generateMipmaps = true; rt.texture.minFilter = THREE.LinearMipmapLinearFilter;
  const copyMat = new THREE.ShaderMaterial({ vertexShader: COPY_VS, fragmentShader: COPY_FS, uniforms: { uT: { value: tileRT.texture } }, depthTest: false, depthWrite: false });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), copyMat), qScene = new THREE.Scene(); qScene.add(quad);
  const qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  atlas.tex[pal] = rt.texture; atlas.tex[pal + 'RT'] = rt;
  let prev = null;
  const save = () => { prev = { t: renderer.getRenderTarget(), c: renderer.getClearColor(new THREE.Color()), a: renderer.getClearAlpha(), vp: renderer.getViewport(new THREE.Vector4()), sc: renderer.getScissor(new THREE.Vector4()), st: renderer.getScissorTest(), au: renderer.autoClear }; renderer.setClearColor(0x000000, 0); renderer.setScissorTest(false); };
  const restore = () => { renderer.setRenderTarget(prev.t); renderer.autoClear = prev.au; renderer.setClearColor(prev.c, prev.a); renderer.setViewport(prev.vp); renderer.setScissor(prev.sc); renderer.setScissorTest(prev.st); };
  save(); renderer.setRenderTarget(rt); renderer.clear(); restore();
  let count = 0;
  save();
  for (const { k, sn, t } of atlas.list) {
    if (++count % per === 0) { restore(); yield count / atlas.list.length; save(); }
    const d = PLANTS.find((p) => p.key === k), plant = sn.plant;
    let x0 = Infinity, x1 = -Infinity, y1 = 0;
    for (const m of plant.mods) for (let q = 0; q < m.nw.length; q += 3) { x0 = Math.min(x0, m.nw[q]); x1 = Math.max(x1, m.nw[q]); y1 = Math.max(y1, m.nw[q + 1]); }
    const ls = leafScale(d), pad = 0.6 + ls * (d.leaf === 'frond' ? 3.2 : 1);
    let w = Math.max(x1 - x0, -x0 * 2, x1 * 2) + pad * 2, h = y1 + pad;
    if (w / h > TW / TH) h = w * TH / TW; else w = h * TW / TH;          // the tile's aspect
    cam.left = -w / 2; cam.right = w / 2; cam.bottom = 0; cam.top = h; cam.position.set(0, 0, 50); cam.lookAt(0, 0, 0); cam.updateProjectionMatrix();
    pm.setBark(BARK[pal]);
    const col = new THREE.Color(pal === 'natural' ? d.nat : d.draw);
    pm.write([{ ...plant, mods: plant.mods, minR: 0.02 }], () => col, () => ls, null, () => d.leaf);
    renderer.setRenderTarget(tileRT); renderer.setViewport(0, 0, TW, TH); renderer.autoClear = true; renderer.clear(); renderer.render(scene, cam);
    renderer.setRenderTarget(rt); renderer.autoClear = false;
    const cx = (t.i % COLS) * TW, cy = Math.floor(t.i / COLS) * TH;
    renderer.setViewport(cx, cy, TW, TH); renderer.render(qScene, qCam);
    t.w = w; t.h = h;
  }
  restore();
  pm.branch.geometry.dispose(); pm.leaf.geometry.dispose(); pm.branch.material.dispose(); pm.leaf.material.dispose();
  tileRT.dispose(); copyMat.dispose(); quad.geometry.dispose();
  atlas.ready = atlas.ready || {}; atlas.ready[pal] = true;
  return rt.texture;
}

/** the tile for a plant of N leaf-bearing modules and height H, of variant v: nearest in N among the snapshots at
 *  least 60 % of the plant's height (no stretched saplings) */
export function tileFor(atlas, key, N, H = 0, v = 0) {
  const vars = atlas.tiles[key]; if (!vars) return null;
  const a = vars[v % vars.length];
  let best = null, bd = Infinity;
  for (const t of a) { if (t.H < 0.6 * H) continue; const d = Math.abs(t.N - N); if (d < bd) { bd = d; best = t; } }
  return best || a[a.length - 1];
}
/** the largest tile of variant v */
export function largestTile(atlas, key, v = 0) { const vars = atlas.tiles[key]; if (!vars) return null; const a = vars[v % vars.length]; return a[a.length - 1]; }

/** per-instance individuality from an integer id: variant, mirror, height and width scale, lean, tint (value, hue) */
export function individual(id) {
  let h = (id * 2654435761) >>> 0;
  const r = () => { h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12; h = Math.imul(h, 0x297a2d39) >>> 0; h ^= h >>> 15; return (h >>> 0) / 4294967296; };
  return { v: (r() * 1024) | 0, flip: r() < 0.5 ? -1 : 1, hs: 0.85 + 0.3 * r(), ws: 0.85 + 0.3 * r(), lean: (r() - 0.5) * 0.12, val: 0.92 + 0.16 * r(), hue: (r() - 0.5) * 0.06 };
}

const VS = /* glsl */`
attribute vec3 iPos; attribute vec2 iSize; attribute float iTile; attribute vec3 iTint; attribute float iLean;
uniform vec2 uGrid; uniform float uMinPx, uViewH; uniform vec3 uRight; varying vec2 vUv; varying vec3 vTint; varying float vDist;
#include <clipping_planes_pars_vertex>
void main() {
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  right = normalize(vec3(right.x, 0.0, right.z) + 1e-5);
  if (dot(uRight, uRight) > 0.0) right = uRight;   // shadow pass: face the light
  // a minimum on-screen height (far field): a 30 m tree at 10 km is ~2 px, so it is drawn at least uMinPx tall
  float d0 = max(1.0, -(viewMatrix * vec4(iPos, 1.0)).z), pxH = iSize.y / d0 * projectionMatrix[1][1] * 0.5 * uViewH;
  float k = max(1.0, uMinPx / max(pxH, 1e-3));
  // iSize.x < 0 mirrors the sprite; iLean shears the top sideways
  vec3 wp = iPos + right * (position.x * iSize.x + iLean * position.y * iSize.y) * k + vec3(0.0, position.y * iSize.y * k, 0.0);
  float col = mod(iTile, uGrid.x), row = floor(iTile / uGrid.x);
  vUv = vec2((col + position.x * sign(iSize.x) + 0.5) / uGrid.x, (row + position.y) / uGrid.y);
  vTint = iTint;
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  vDist = -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;
  #include <clipping_planes_vertex>
}`;
const DEPTH_FS = /* glsl */`
#include <packing>
uniform sampler2D uAtlas; varying vec2 vUv; varying vec3 vTint; varying float vDist;
#include <clipping_planes_pars_fragment>
void main() {
  #include <clipping_planes_fragment>
  if (texture2D(uAtlas, vUv).a < 0.35) discard;
  gl_FragColor = packDepthToRGBA(gl_FragCoord.z);
}`;
const FS = /* glsl */`
uniform sampler2D uAtlas; uniform vec3 uFogColor; uniform float uFog;
varying vec2 vUv; varying vec3 vTint; varying float vDist;
#include <clipping_planes_pars_fragment>
void main() {
  #include <clipping_planes_fragment>
  vec4 t = texture2D(uAtlas, vUv);
  if (t.a < 0.35) discard;
  vec3 c = t.rgb / max(t.a, 1e-3) * vTint;
  c = mix(c, uFogColor, (1.0 - exp(-vDist / uFog)) * 0.5);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

/** an instanced billboard set; set(i, x, y, z, w, h, tile, ind) (ind from individual(), or a scalar tint) then finish(n) */
export function makeBillboards(atlas, cap, opts = {}) {
  const g = new THREE.InstancedBufferGeometry();
  const base = new THREE.PlaneGeometry(1, 1); base.translate(0, 0.5, 0);
  g.index = base.index; g.setAttribute('position', base.getAttribute('position')); g.setAttribute('uv', base.getAttribute('uv'));
  const pos = new Float32Array(cap * 3), size = new Float32Array(cap * 2), tile = new Float32Array(cap), tint = new Float32Array(cap * 3), lean = new Float32Array(cap);
  g.setAttribute('iPos', new THREE.InstancedBufferAttribute(pos, 3)); g.setAttribute('iSize', new THREE.InstancedBufferAttribute(size, 2));
  g.setAttribute('iTile', new THREE.InstancedBufferAttribute(tile, 1)); g.setAttribute('iTint', new THREE.InstancedBufferAttribute(tint, 3));
  g.setAttribute('iLean', new THREE.InstancedBufferAttribute(lean, 1));
  for (const k of ['iPos', 'iSize', 'iTile', 'iTint', 'iLean']) g.getAttribute(k).setUsage(THREE.DynamicDrawUsage);
  g.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, clipping: true, side: THREE.DoubleSide,
    uniforms: { uRight: { value: new THREE.Vector3() }, uMinPx: { value: 0 }, uViewH: { value: 800 }, uAtlas: { value: atlas.tex.drawing || null }, uGrid: { value: new THREE.Vector2(atlas.cols, atlas.rows) }, uFogColor: { value: new THREE.Color(0xffffff) }, uFog: { value: 30000 } } });
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false;
  if (opts.shadow) {
    mesh.castShadow = true;
    mesh.customDepthMaterial = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: DEPTH_FS, clipping: true, side: THREE.DoubleSide,
      uniforms: { uMinPx: mat.uniforms.uMinPx, uViewH: mat.uniforms.uViewH, uAtlas: mat.uniforms.uAtlas, uGrid: mat.uniforms.uGrid, uRight: { value: new THREE.Vector3() } } });
  }
  return {
    mesh, cap,
    setLight(dir) { if (mesh.customDepthMaterial) { const r = new THREE.Vector3(-dir.z, 0, dir.x); if (r.lengthSq() < 1e-6) r.set(1, 0, 0); mesh.customDepthMaterial.uniforms.uRight.value.copy(r.normalize()); } },
    set(i, x, y, z, w, h, t, ind) {
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; tile[i] = t;
      if (typeof ind === 'number') { size[i * 2] = w; size[i * 2 + 1] = h; tint[i * 3] = tint[i * 3 + 1] = tint[i * 3 + 2] = ind; lean[i] = 0; return; }
      size[i * 2] = w * ind.ws * ind.flip; size[i * 2 + 1] = h * ind.hs; lean[i] = ind.lean;
      const hs = ind.hue; tint[i * 3] = ind.val * (1 + hs); tint[i * 3 + 1] = ind.val; tint[i * 3 + 2] = ind.val * (1 - hs);
    },
    finish(n) { g.instanceCount = n; for (const k of ['iPos', 'iSize', 'iTile', 'iTint', 'iLean']) g.getAttribute(k).needsUpdate = true; },
    setMinPx(px, viewH) { mat.uniforms.uMinPx.value = px; mat.uniforms.uViewH.value = viewH; },
    setPalette(p, bg, fog) { mat.uniforms.uAtlas.value = atlas.tex[p]; mat.uniforms.uFogColor.value.setHex(bg); if (fog) mat.uniforms.uFog.value = fog; },
  };
}
