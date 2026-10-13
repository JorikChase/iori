/*
 * silviculture-impostors.js — far plants as impostors made from the real module skeletons.
 * Once per palette, every reference skeleton of every species (six sizes, silviculture-focus.js buildRefs) is rendered
 * from the side into a tile of a sprite atlas; far plants are then cylindrical billboards (they turn about the
 * vertical to face the camera) that sample their species' tile. Ours: tile size 192 × 288 px, side view from the
 * south, alpha test 0.35, no mipmaps (a multisampled target does not build them), a 3 px minimum height for the far field, 4× MSAA in the atlas pass, the ground's soft daylight for the natural palette, the ink
 * branches and pale tints for the drawing palette. Focus-plot billboards cast shadows (turned to face the light in the depth pass); region billboards do not.
 */
import * as THREE from 'three';
import { PlantMeshes, BARK } from './silviculture-draw.js';
import { PLANTS } from './silviculture-plants.js';

const TW = 192, TH = 288, COLS = 8;

/**
 * Render every reference skeleton of every species (six sizes each) into an atlas per palette.
 * Returns { tex: {drawing, natural}, tiles: {key: largest tile}, sizes: {key: [tile per snapshot]}, cols, rows };
 * a tile is { i, w, h, H, N } (w, h: the tile's extent in metres at the snapshot's size; H: its height; N: its
 * leaf-bearing modules).
 */
export function buildAtlas(renderer, refs, leafScale = (d) => d.leafSize) {
  const keys = PLANTS.map((d) => d.key).filter((k) => refs[k]);
  const list = []; for (const k of keys) refs[k].snaps.forEach((sn, j) => list.push({ k, sn, j }));
  const rows = Math.ceil(list.length / COLS);
  const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -200, 200);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xdcdcd0, 2.0));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(-0.5, 1, 0.8); scene.add(sun);
  const pm = new PlantMeshes(scene, 20000), tiles = {}, sizes = {}, tex = {};
  const prevTarget = renderer.getRenderTarget(), prevClear = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
  const prevVp = renderer.getViewport(new THREE.Vector4()), prevSc = renderer.getScissor(new THREE.Vector4()), prevScT = renderer.getScissorTest();
  for (const pal of ['drawing', 'natural']) {
    const rt = new THREE.WebGLRenderTarget(TW * COLS, TH * rows, { samples: 4 });
    rt.texture.colorSpace = THREE.SRGBColorSpace; rt.texture.minFilter = THREE.LinearFilter; rt.texture.generateMipmaps = false; // MSAA targets do not build mips
    renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.setScissorTest(false); renderer.clear();
    list.forEach(({ k, sn, j }, i) => {
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
      const cx = (i % COLS) * TW, cy = Math.floor(i / COLS) * TH;
      renderer.setViewport(cx, cy, TW, TH); renderer.setScissor(cx, cy, TW, TH); renderer.setScissorTest(true);
      renderer.render(scene, cam);
      const tl = { i, w, h, H: sn.H, N: sn.N };
      (sizes[k] ||= [])[j] = tl; tiles[k] = tl;
    });
    tex[pal] = rt.texture; tex[pal + 'RT'] = rt;
  }
  renderer.setRenderTarget(prevTarget); renderer.setClearColor(prevClear, prevAlpha); renderer.setViewport(prevVp); renderer.setScissor(prevSc); renderer.setScissorTest(prevScT);
  pm.branch.geometry.dispose(); pm.leaf.geometry.dispose();
  return { tex, tiles, sizes, cols: COLS, rows };
}
/** the tile for a plant of N leaf-bearing modules and height H */
export function tileFor(atlas, key, N, H = 0) {
  const a = atlas.sizes[key]; if (!a) return null;
  // nearest in leaf-bearing modules among the snapshots at least 60 % of the plant's height (no stretched saplings)
  let best = null, bd = Infinity;
  for (const t of a) { if (t.H < 0.6 * H) continue; const d = Math.abs(t.N - N); if (d < bd) { bd = d; best = t; } }
  return best || a[a.length - 1];
}

const VS = /* glsl */`
attribute vec3 iPos; attribute vec2 iSize; attribute float iTile; attribute float iTint;
uniform vec2 uGrid; uniform float uMinPx, uViewH; uniform vec3 uRight; varying vec2 vUv; varying float vTint; varying float vDist;
#include <clipping_planes_pars_vertex>
void main() {
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  right = normalize(vec3(right.x, 0.0, right.z) + 1e-5);
  if (dot(uRight, uRight) > 0.0) right = uRight;   // shadow pass: face the light
  // a minimum on-screen height (far field): a 30 m tree at 10 km is ~2 px, so it is drawn at least uMinPx tall
  float d0 = max(1.0, -(viewMatrix * vec4(iPos, 1.0)).z), pxH = iSize.y / d0 * projectionMatrix[1][1] * 0.5 * uViewH;
  float k = max(1.0, uMinPx / max(pxH, 1e-3));
  vec3 wp = iPos + right * position.x * iSize.x * k + vec3(0.0, position.y * iSize.y * k, 0.0);
  float col = mod(iTile, uGrid.x), row = floor(iTile / uGrid.x);
  vUv = vec2((col + position.x + 0.5) / uGrid.x, (row + position.y) / uGrid.y);
  vTint = iTint;
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  vDist = -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;
  #include <clipping_planes_vertex>
}`;
const DEPTH_FS = /* glsl */`
#include <packing>
uniform sampler2D uAtlas; varying vec2 vUv; varying float vTint; varying float vDist;
#include <clipping_planes_pars_fragment>
void main() {
  #include <clipping_planes_fragment>
  if (texture2D(uAtlas, vUv).a < 0.35) discard;
  gl_FragColor = packDepthToRGBA(gl_FragCoord.z);
}`;
const FS = /* glsl */`
uniform sampler2D uAtlas; uniform vec3 uFogColor; uniform float uFog;
varying vec2 vUv; varying float vTint; varying float vDist;
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

/** an instanced billboard set; set(i, x, y, z, w, h, tile, tint) then finish(n) */
export function makeBillboards(atlas, cap, opts = {}) {
  const g = new THREE.InstancedBufferGeometry();
  const base = new THREE.PlaneGeometry(1, 1); base.translate(0, 0.5, 0);
  g.index = base.index; g.setAttribute('position', base.getAttribute('position')); g.setAttribute('uv', base.getAttribute('uv'));
  const pos = new Float32Array(cap * 3), size = new Float32Array(cap * 2), tile = new Float32Array(cap), tint = new Float32Array(cap);
  g.setAttribute('iPos', new THREE.InstancedBufferAttribute(pos, 3)); g.setAttribute('iSize', new THREE.InstancedBufferAttribute(size, 2));
  g.setAttribute('iTile', new THREE.InstancedBufferAttribute(tile, 1)); g.setAttribute('iTint', new THREE.InstancedBufferAttribute(tint, 1));
  for (const k of ['iPos', 'iSize', 'iTile', 'iTint']) g.getAttribute(k).setUsage(THREE.DynamicDrawUsage);
  g.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, clipping: true, side: THREE.DoubleSide,
    uniforms: { uRight: { value: new THREE.Vector3() }, uMinPx: { value: 0 }, uViewH: { value: 800 }, uAtlas: { value: atlas.tex.drawing }, uGrid: { value: new THREE.Vector2(atlas.cols, atlas.rows) }, uFogColor: { value: new THREE.Color(0xffffff) }, uFog: { value: 30000 } } });
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false;
  if (opts.shadow) { // cast shadows: in the depth pass each billboard turns to face the light
    mesh.castShadow = true;
    mesh.customDepthMaterial = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: DEPTH_FS, clipping: true, side: THREE.DoubleSide,
      uniforms: { uMinPx: mat.uniforms.uMinPx, uViewH: mat.uniforms.uViewH, uAtlas: mat.uniforms.uAtlas, uGrid: mat.uniforms.uGrid, uRight: { value: new THREE.Vector3() } } });
  }
  return {
    setLight(dir) { if (mesh.customDepthMaterial) { const r = new THREE.Vector3(-dir.z, 0, dir.x); if (r.lengthSq() < 1e-6) r.set(1, 0, 0); mesh.customDepthMaterial.uniforms.uRight.value.copy(r.normalize()); } },
    mesh, cap,
    set(i, x, y, z, w, h, t, c) { pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; size[i * 2] = w; size[i * 2 + 1] = h; tile[i] = t; tint[i] = c; },
    finish(n) { g.instanceCount = n; for (const k of ['iPos', 'iSize', 'iTile', 'iTint']) g.getAttribute(k).needsUpdate = true; },
    setMinPx(px, viewH) { mat.uniforms.uMinPx.value = px; mat.uniforms.uViewH.value = viewH; },
    setPalette(p, bg, fog) { mat.uniforms.uAtlas.value = atlas.tex[p]; mat.uniforms.uFogColor.value.setHex(bg); if (fog) mat.uniforms.uFog.value = fog; },
  };
}
