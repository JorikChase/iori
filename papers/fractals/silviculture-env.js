/*
 * silviculture-env.js — createEnvironment(root): the two-level environment (papers/fractals/LANDSCAPE.md).
 *   Region   the whole terrain (landscape-terrain.js when present, else the stand-in silviculture-terrain.js) with
 *            the coarse vegetation + deadwood + humus layer model (silviculture-region.js) drawn as instanced
 *            crown marks, one per ~tree group, coloured by plant type.
 *   Focus    a 256 m window the reader places by clicking the region: the individual-plant ecosystem
 *            (silviculture-focus.js) seeded from the region's layers there, with snags, fallen logs in five decay
 *            classes, root plates, pit-and-mound, ground cover and nurse-log seedlings.
 * Both palettes: 'drawing' (ink and pale tints, default) and 'natural'. One WebGL context.
 *
 * Terrain: landscape-terrain.js (10 km, 512², sea at the 8 % height quantile, generated in landscape-worker.js, which
 * also bakes the region's light) and landscape-ground.js; the stand-ins silviculture-terrain.js / -ground.js only if
 * those fail to load. The focus window is terrain.crop(x0, y0, 256 m, 256 cells), placed in the region by its
 * origin; its outer SEAM_M = 14 m is blended onto the region surface with applyHeightDelta, and the region ground is
 * cut out under it with clipping planes (setClippingPlanes(planes, true)). Pits and mounds of uprooted trees are
 * written into the focus ground with applyHeightDelta (pit 0.35 r deep, mound 0.3 r high, ours).
 *
 * Defaults (ours): terrain seed 5 (the most relief of seeds 1–8), 7 °C at sea level, 900 mm; the plot is placed on the
 * most mixed well-forested land cell below the median height (Shannon diversity of tree-type cover × cover).
 * Focus view: a three-quarter elevated view (≈ 31° down) over the middle 75 m of the plot, eye level only on zoom.
 * Living focus plants are sprites of the reference skeleton nearest in size (a tile per snapshot, at least 60 % of
 * the plant's height, scale 0.35–1.6), casting shadows; the 60 nearest are skeletons (scale 0.75–1.35, leaves not
 * scaled). Snags at the stem diameter, tapered, bark weathering to grey, stubs shortening over ~25 yr, a splintered
 * top; snags under 10 cm and soft logs under 12 cm are not drawn. Logs at their real radius (0.5·D), sunk 0.12–0.6 r
 * with decay class, one fragment missing from class 4. Root plates stand at the base to class 4. Pits carry an ink
 * rim ring and a contact shadow. Ground cover: grass tufts, ferns and low herb / bilberry clumps.
 * Drawing choices (ours): far vegetation is impostors of the real module skeletons (silviculture-impostors.js):
 * marks at 2× true size everywhere beyond R_NEAR = 1 km of the plot, at least 3 px tall, plus a canopy tint on the
 * region ground (cover-weighted plant-type colour, fading out within ~1 km of the plot); true-size impostors in the
 * ring within R_NEAR; far focus plants are clouds of the module leaf quads, the 50 nearest the camera are module
 * skeletons from their species' reference run (snags and 14 logs too: the skeleton without leaves, pruned by decay,
 * lying along the fall direction); other logs are tapered cylinders that follow the ground, sag into it and break
 * into pieces with decay; class 5 is a low mound; root plates are upturned discs; the ground's rocks and boulders
 * come with the crop. The camera frames the inner 70 % of the plot from its downhill side.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PlantMeshes, makeLeafMesh, LEAF_ROT, fitDistance, boxPoints, guardWheel, el, slider, INK, BARK } from './silviculture-draw.js';
import { makeRng } from './silviculture-core.js';
import { PLANTS } from './silviculture-plants.js';
import { RegionSim, PFT, BIOMES } from './silviculture-region.js';
import { FocusSim, buildRefs } from './silviculture-focus.js';
import { buildAtlas, makeBillboards, tileFor } from './silviculture-impostors.js';
import * as standInTerrain from './silviculture-terrain.js';
import * as standInGround from './silviculture-ground.js';

const REGION = { size_m: 10000, cells: 512, seaQuantile: 0.08 }, R_NEAR = 1000, PLOT_M = 256, PLOT_CELLS = 256, SEAM_M = 14, N_DETAIL = 60, N_DETAIL_DEAD = 14;
const FAR_K = 2;
// leaf quads in the focus plot and its sprites, relative to the catalogue's leaf size (which the plant windows use):
// needles small, broad leaves about a hand at this drawing scale (ours)
const FOCUS_LEAF = { needle: 0.5, broad: 0.65, frond: 1 };   // skeletons near the camera; the sprites keep the full size
// defaults chosen so the region shows its altitude bands and a treeline, and the plot sits in a mixed stand:
// terrain seed 5 has the most relief of seeds 1–8 (1,580 m above the sea, ~10 °C of lapse); at 7 °C at sea level
// broadleaf and conifer mix below ~300 m, conifer runs to ~600 m, birch and shrubs above, the treeline ~750 m
const DEFAULTS = { terrainSeed: 5, T0: 7 };
const BALL = (() => { const r = makeRng(777), a = new Float32Array(512 * 3); for (let i = 0; i < 512; i++) { let x, y, z; do { x = r.next() * 2 - 1; y = r.next() * 2 - 1; z = r.next() * 2 - 1; } while (x * x + y * y + z * z > 1); a.set([x, y, z], i * 3); } return a; })();
const LOG_PAL = {
  drawing: [0x2b3035, 0x464b51, 0x75806c, 0x9a9d88, 0xc9c6b6], // ink → grey → moss-grey → pale → mound
  natural: [0x4e3d2f, 0x8a7258, 0x6c7a44, 0x7e5a3a, 0x5f6338], // bark, bark loss (pale wood), moss, soft rot, mossy mound
};
const GC_PAL = { drawing: { grass: 0xd2d4b6, herb: 0xbfc6a8, fern: 0xaeba9c }, natural: { grass: 0x8f9d55, herb: 0x56804a, fern: 0x4d7a3c } };
const GC_SCALE = { drawing: 0.8, natural: 1 };   // small and quiet in the drawing palette (ours)

// ground-cover geometries (ours): a tuft of 9 arching blades 0.35 m; a fern of 7 arching fronds 0.6 m with paired
// pinnae; a low herb / bilberry clump of 14 small oval leaves 0.06 m on a 0.2 m dome
function bladeStrip(v, ax, az, len, w, rise, droop, segs = 3) {
  const sx = -az, sz = ax; let px = 0, py = 0, pz = 0;
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs, t1 = (i + 1) / segs, w0 = w * (1 - t0), w1 = w * (1 - t1);
    const f = (t) => [ax * len * t, rise * len * t - droop * len * t * t, az * len * t];
    const [x0, y0, z0] = f(t0), [x1, y1, z1] = f(t1);
    v.push(x0 - sx * w0, y0, z0 - sz * w0, x0 + sx * w0, y0, z0 + sz * w0, x1 + sx * w1, y1, z1 + sz * w1);
    v.push(x0 - sx * w0, y0, z0 - sz * w0, x1 + sx * w1, y1, z1 + sz * w1, x1 - sx * w1, y1, z1 - sz * w1);
  }
}
function geo(v) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals(); return g; }
function tuftGeometry() { const v = []; for (let i = 0; i < 9; i++) { const a = i * 2.39996, o = 0.25 + 0.2 * ((i * 5) % 3); bladeStrip(v, Math.cos(a) * o, Math.sin(a) * o, 0.36, 0.012, 1.0, 0.45 + 0.1 * (i % 3)); } return geo(v); }
function fernGeometry() {
  const v = [];
  for (let i = 0; i < 7; i++) {
    const a = i * 0.8976 + 0.2, ax = Math.cos(a), az = Math.sin(a), L = 0.55 + 0.08 * (i % 2);
    bladeStrip(v, ax, az, L, 0.012, 0.85, 0.6, 4);                                      // rachis
    for (let k = 1; k <= 6; k++) { const t = k / 7, px = ax * L * t, py = 0.85 * L * t - 0.6 * L * t * t, pz = az * L * t, pl = 0.13 * (1 - t * 0.7);
      for (const sgn of [-1, 1]) { const qx = -az * sgn, qz = ax * sgn, ex = px + qx * pl + ax * pl * 0.3, ez = pz + qz * pl + az * pl * 0.3, w = 0.025 * (1 - t * 0.5);
        v.push(px, py, pz, ex + ax * w, py - 0.02, ez + az * w, ex - ax * w, py - 0.02, ez - az * w); } }
  }
  return geo(v);
}
function herbGeometry() {
  const v = [];
  for (let i = 0; i < 14; i++) { const a = i * 2.39996, r = 0.06 + 0.12 * Math.sqrt((i + 0.5) / 14), y = 0.04 + 0.16 * (1 - r / 0.18) + 0.02 * (i % 3);
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r, l = 0.06, w = 0.035, ax = Math.cos(a + 0.6), az = Math.sin(a + 0.6);
    v.push(cx - ax * l, y, cz - az * l, cx - az * w, y + 0.01, cz + ax * w, cx + ax * l, y, cz + az * l, cx - ax * l, y, cz - az * l, cx + ax * l, y, cz + az * l, cx + az * w, y + 0.01, cz - ax * w);
    v.push(0, 0, 0, cx * 0.9, y - 0.005, cz * 0.9, cx * 0.9 + 0.004, y - 0.005, cz * 0.9); }  // stems
  return geo(v);
}
const CHART = { pft: PFT.map((f) => '#' + new THREE.Color(f.draw).multiplyScalar(0.8).getHexString()), cls: ['#3a3f45', '#6b6f75', '#8a9670', '#b3a77a', '#d2c9a6'] };

export function createEnvironment(root) {
  const mq = window.matchMedia('(max-width: 700px)');
  const view = el('div', 'fig-view');
  Object.assign(view.style, { position: 'relative', width: '100%', overflow: 'hidden' });
  const setAspect = () => { view.style.aspectRatio = mq.matches ? '4 / 5' : '16 / 10'; };
  setAspect();
  const row1 = el('div', 'controls'), row2 = el('div', 'controls'), row3 = el('div', 'controls');
  const playBtn = el('button', null, 'Pause'), levelBtn = el('button', null, 'Back to region'), palBtn = el('button', null, 'Natural colour'), terrBtn = el('button', null, 'New terrain'), resetBtn = el('button', null, 'Reset');
  for (const b of [playBtn, levelBtn, palBtn, terrBtn, resetBtn]) b.type = 'button';
  const speed = slider('Speed', 1, 20, 1, 4, (v) => `${v} yr/s`);
  const temp = slider('Sea-level temperature', 2, 26, 1, DEFAULTS.T0, (v) => `${v} °C`);
  const prec = slider('Precipitation', 300, 2500, 50, 900, (v) => `${v} mm`);
  const rough = slider('Roughness H', 0.4, 0.9, 0.05, 0.6, (v) => v.toFixed(2));
  row1.append(playBtn, levelBtn, palBtn, terrBtn, resetBtn, speed.lab);
  row2.append(temp.lab, prec.lab, rough.lab);
  const toggles = PLANTS.map((d) => { const lab = el('label'), cb = el('input'); cb.type = 'checkbox'; cb.checked = true; lab.append(cb, d.name); row3.append(lab); return cb; });
  const chart = el('canvas', 'chart');
  chart.setAttribute('role', 'img'); chart.setAttribute('aria-label', 'Plant types by altitude in the region, and dead wood in the focus plot over time');
  const status = el('p', 'status');
  root.append(view, row1, row2, row3, chart, status);
  levelBtn.disabled = true;

  // ---------------------------------------------------------------- state
  let renderer, scene, camera, controls, sun, ro, mods = null, snagMesh, pitRing, pitShade, plotBB = null;
  let terrain = null, ground = null, region = null, refs = null, focus = null, plot = null, plotGround = null;
  let gen = null, phase = 'idle', progress = 0, palette = 'drawing', level = 'region', focusAt = null;
  let running = false, raf = 0, last = 0, acc = 0, playing = true, dirtyFocus = true, dirtyRegion = true, chartDirty = true, lastChart = 0, lastDetail = 0, camKey = '';
  let canopyBuf = null, cropWorker = null, fly = null, detail = null, deadDetail = null, atlas = null, farBB = null, nearBB = null, pitsDone = 0, stage = '', logMesh, moundMesh, plateMesh, gcMesh = {}, outline;
  let frameMs = 0, seed = 1, terrainSeed = DEFAULTS.terrainSeed, regionMs = 0;
  let detailIds = new Set(), deadIds = new Set();
  const timing = { start: 0 }, counts = { far: 0, near: 0 };
  const plantCol = PLANTS.map((d) => ({ drawing: new THREE.Color(d.draw), natural: new THREE.Color(d.nat) }));

  async function loadModules() {
    let T = standInTerrain, G = standInGround, real = false;
    try { const t = await import('./landscape-terrain.js'), g = await import('./landscape-ground.js'); if (t.generateTerrainAsync && g.buildGround) { T = t; G = g; real = true; } } catch (e) { /* stand-in */ }
    return { T, G, real };
  }

  // ---------------------------------------------------------------- scene
  function init() {
    renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0xffffff, 1); renderer.localClippingEnabled = true;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
    const cv = renderer.domElement; Object.assign(cv.style, { width: '100%', height: '100%', display: 'block', touchAction: 'none' });
    view.append(cv);
    guardWheel(view);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(34, 16 / 10, 1, 60000);
    controls = new OrbitControls(camera, cv);
    controls.enableDamping = true; controls.dampingFactor = 0.08; controls.maxPolarAngle = Math.PI * 0.47; controls.minDistance = 5; controls.maxDistance = 40000;
    scene.add(new THREE.HemisphereLight(0xffffff, 0xe4e6df, 1.8));
    sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.05;
    scene.add(sun, sun.target);
    // focus deadwood and ground layers (living focus plants are billboards of their skeletons + skeletons near the camera)
    const lambert = (cap, geo, opt = {}) => { const m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff, ...opt }), cap);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.count = 0; return m; };
    const taper = new THREE.CylinderGeometry(0.62, 1, 1, 8, 1, false); taper.translate(0, 0.5, 0);
    snagMesh = lambert(20000, taper); snagMesh.castShadow = true; snagMesh.receiveShadow = true;
    const lg = new THREE.CylinderGeometry(0.8, 1, 1, 9, 1, false); lg.translate(0, 0.5, 0);
    logMesh = lambert(40000, lg); logMesh.castShadow = true; logMesh.receiveShadow = true;
    moundMesh = lambert(8000, new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)); moundMesh.receiveShadow = true;
    plateMesh = lambert(3000, new THREE.CylinderGeometry(1, 0.9, 1, 14, 1, false)); plateMesh.castShadow = true; // root plate: a squat disc of soil and roots
    // pit-and-mound legibility: an ink rim ring and a soft contact shadow inside the pit (true size; ours)
    const ring = new THREE.RingGeometry(0.86, 1, 28); ring.rotateX(-Math.PI / 2);
    pitRing = new THREE.InstancedMesh(ring, new THREE.MeshBasicMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -3 }), 4000);
    pitRing.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(4000 * 3), 3); pitRing.frustumCulled = false; pitRing.count = 0;
    const disc = new THREE.CircleGeometry(1, 24); disc.rotateX(-Math.PI / 2);
    pitShade = new THREE.InstancedMesh(disc, new THREE.MeshBasicMaterial({ color: 0x1d2024, transparent: true, opacity: 0.18, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), 4000);
    pitShade.frustumCulled = false; pitShade.count = 0;
    scene.add(snagMesh, logMesh, moundMesh, plateMesh, pitRing, pitShade);
    // ground cover: temperate forms (ours): a grass tuft of arching blades, a fern of arching fronds, a low herb /
    // bilberry clump of small round leaves
    const gcGeo = { grass: tuftGeometry(), fern: fernGeometry(), herb: herbGeometry() };
    for (const k of ['grass', 'herb', 'fern']) { const m = lambert(30000, gcGeo[k], { side: THREE.DoubleSide }); scene.add(m); gcMesh[k] = m; }
    detail = new PlantMeshes(scene, 30000); deadDetail = new PlantMeshes(scene, 20000);
    ro = new ResizeObserver(resize);
    view.addEventListener('pointerdown', (e) => { view._down = [e.clientX, e.clientY]; });
    view.addEventListener('pointerup', (e) => { if (view._down && Math.hypot(e.clientX - view._down[0], e.clientY - view._down[1]) < 5) pick(e); });
  }

  // ---------------------------------------------------------------- loading (sliced across frames)
  async function* loader() {
    phase = 'terrain'; progress = 0; stage = 'loading'; yield;
    mods = mods || await loadModules();
    const opts = { seed: terrainSeed, size_m: REGION.size_m, cells: mods.real ? REGION.cells : 257, seaQuantile: REGION.seaQuantile, roughness: +rough.input.value,
      climate: { T0: +temp.input.value, P0: +prec.input.value, windDir: 0.4 }, geology: { seed: terrainSeed } };
    const t0 = performance.now();
    terrain = await mods.T.generateTerrainAsync(opts, (f, st) => { progress = f; if (st) stage = st; });
    timing.terrain = performance.now() - t0;
    terrain.climate = (terrain.opts && terrain.opts.climate) || terrain.climate || opts.climate;
    if (ground) { scene.remove(ground.group); ground.dispose(); } canopyBuf = null; if (cropWorker) { cropWorker.terminate(); cropWorker = null; }
    const g0 = performance.now();
    ground = mods.G.buildGround(terrain, { palette, detail: 'region' });
    timing.ground = performance.now() - g0;
    scene.add(ground.group);
    ground.group.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    renderer.setClearColor(ground.background ? ground.background() : 0xffffff, 1);
    frameRegion(true);
    phase = 'region'; yield;
    region = new RegionSim(terrain, { seed });
    for (let y = 0; y < 150; y++) { region.step(); if (y % 10 === 0) { progress = y / 150; yield; } }
    dirtyRegion = true;
    if (!refs) {
      phase = 'plants'; const it = buildRefs(); let r = it.next(), k = 0;
      while (!r.done) { if (++k % 3 === 0) { stage = r.value; yield; } r = it.next(); }
      refs = r.value;
    }
    stage = 'impostor atlas'; yield;
    if (!atlas) { atlas = buildAtlas(renderer, refs, (d) => d.leafSize); farBB = makeBillboards(atlas, 120000); nearBB = makeBillboards(atlas, 60000, { shadow: true }); plotBB = makeBillboards(atlas, 8000, { shadow: true }); scene.add(farBB.mesh, nearBB.mesh, plotBB.mesh); applyBBPalette(); resize(); }
    phase = 'ready';
    if (!focusAt) focusAt = defaultFocus();
    yield* placeFocus(focusAt.x, focusAt.y, false);
    timing.firstFrame = performance.now() - timing.start;
  }
  // the default plot: the most mixed well-forested land cell (Shannon diversity of tree-type cover × cover), away
  // from the region's edges, below the median land height
  function defaultFocus() {
    const t = region.t, n = t.n; let best = -1, bi = 0;
    const land = []; for (let i = 0; i < n * n; i++) if (!t.waterKind[i]) land.push(t.height[i]); land.sort((a, b) => a - b);
    const hmed = land[land.length >> 1], m = Math.ceil(PLOT_M / t.cell_m) + 2;
    for (let i = 0; i < n * n; i++) {
      const x = i % n, y = (i / n) | 0;
      if (t.waterKind[i] || t.height[i] > hmed || x < m || y < m || x > n - 1 - m || y > n - 1 - m) continue;
      let tot = 0, H = 0;
      for (let k = 0; k < PFT.length; k++) if (PFT[k].tree) tot += region.V[k][i];
      if (tot < 0.45) continue;
      for (let k = 0; k < PFT.length; k++) if (PFT[k].tree) { const p = region.V[k][i] / tot; if (p > 0) H -= p * Math.log(p); }
      const sc = H * Math.min(1, tot) + 0.15 * (t.shore[i] || 0);
      if (sc > best) { best = sc; bi = i; }
    }
    return { x: (bi % n) * t.cell_m, y: ((bi / n) | 0) * t.cell_m };
  }
  async function* placeFocus(cx, cy, flyDown = true) {
    phase = 'focus';
    const x0 = Math.min(terrain.size_m - PLOT_M, Math.max(0, cx - PLOT_M / 2)), y0 = Math.min(terrain.size_m - PLOT_M, Math.max(0, cy - PLOT_M / 2));
    focusAt = { x: x0 + PLOT_M / 2, y: y0 + PLOT_M / 2, x0, y0 };
    // the crop and its light bake run in a worker that holds the region (no main-thread stall); fallback: here
    if (!cropWorker && mods.T.makeCropWorker) cropWorker = mods.T.makeCropWorker(terrain);
    const t0c = performance.now();
    plot = cropWorker ? await cropWorker.crop(x0, y0, PLOT_M, PLOT_CELLS) : terrain.crop(x0, y0, PLOT_M, PLOT_CELLS);
    timing.crop = performance.now() - t0c;
    if (!plot.origin) plot.origin = { x: x0, y: y0 };
    yield;
    if (plotGround) { scene.remove(plotGround.group); plotGround.dispose(); }
    plotGround = mods.G.buildGround(plot, { palette, detail: 'focus' });
    yield;
    // the ground is built in crop-local coordinates (group.userData.origin = [x0, y0]); place it in the region
    if (plotGround.group.userData.origin || mods.real) plotGround.group.position.set(x0, 0, -y0);
    else { const bb = new THREE.Box3().setFromObject(plotGround.group); if (bb.min.x < x0 - PLOT_M * 0.5) plotGround.group.position.set(x0, 0, -y0); }
    // seam: blend the crop's outer SEAM_M metres onto the region surface, so the window has no step at its edge
    if (plotGround.applyHeightDelta) {
      const n = plot.n, c = plot.cell_m;
      plotGround.applyHeightDelta((x, y) => {
        const d = Math.min(x, y, PLOT_M - x, PLOT_M - y); if (d >= SEAM_M) return 0;
        const w = 1 - (d / SEAM_M) * (d / SEAM_M) * (3 - 2 * d / SEAM_M), i = Math.min(n - 1, Math.round(x / c)), j = Math.min(n - 1, Math.round(y / c));
        return w * (terrain.sample(x0 + x, y0 + y).h - plot.height[j * n + i]);
      });
    }
    pitsDone = 0;
    yield;
    plotGround.group.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    scene.add(plotGround.group);
    clipRegion();
    if (outline) { scene.remove(outline); outline.geometry.dispose(); }
    const op = [];
    for (let k = 0; k <= 256; k++) {
      const t = k / 64, side = Math.floor(t) % 4, f = t - Math.floor(t);
      const lx = side === 0 ? f : side === 1 ? 1 : side === 2 ? 1 - f : 0, ly = side === 0 ? 0 : side === 1 ? f : side === 2 ? 1 : 1 - f;
      const x = x0 + lx * PLOT_M, y = y0 + ly * PLOT_M;
      op.push(new THREE.Vector3(x, plot.heightAt ? plot.heightAt(x - x0, y - y0) + 1.5 : terrain.sample(x, y).h + 1.5, -y));
    }
    outline = new THREE.Line(new THREE.BufferGeometry().setFromPoints(op), new THREE.LineBasicMaterial({ color: INK }));
    scene.add(outline);
    const at = region.at(focusAt.x, focusAt.y);
    focus = new FocusSim({ seed, plot, refs, region: at, windDir: terrain.climate.windDir || 0.4, dT: 0, Pmul: 1 });
    focus.enabled = toggles.map((t, i) => t.checked);
    yield;
    for (let y = 0; y < 60; y++) { focus.step(); if (y % 6 === 0) { progress = y / 60; yield; } }
    dirtyFocus = true; dirtyRegion = true; detailIds = new Set(); deadIds = new Set();
    phase = 'run';
    if (flyDown) flyTo('focus'); else if (level === 'focus') frameFocus(true);
  }
  function clipRegion() {
    if (!ground || !focusAt) return;
    const { x0, y0 } = focusAt, e = 0.5;
    // clipped where all four hold: x0 < x < x0 + W and −(y0 + W) < z < −y0 (three.js z = −y)
    const planes = [new THREE.Plane(new THREE.Vector3(-1, 0, 0), x0 + e), new THREE.Plane(new THREE.Vector3(1, 0, 0), -(x0 + PLOT_M - e)),
      new THREE.Plane(new THREE.Vector3(0, 0, -1), -(y0 + PLOT_M - e)), new THREE.Plane(new THREE.Vector3(0, 0, 1), y0 + e)];
    if (ground.setClippingPlanes) ground.setClippingPlanes(planes, true);
    else ground.group.traverse((o) => { if (o.isMesh) { o.material.clippingPlanes = planes; o.material.clipIntersection = true; o.material.needsUpdate = true; } });
  }
  function pick(e) {
    if (!terrain || phase !== 'run' || level !== 'region' || fly) return;
    const r = view.getBoundingClientRect(), ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(ground.group, true)[0];
    if (!hit) return;
    gen = (async function* () { yield* placeFocus(hit.point.x, -hit.point.z, true); })();
  }

  // ---------------------------------------------------------------- camera
  function regionBox() { let hmax = 0; for (const v of terrain.height) hmax = Math.max(hmax, v); return boxPoints(0, terrain.size_m, 0, hmax, -terrain.size_m, 0); }
  function regionView() {
    const dir = camera.aspect < 1 ? new THREE.Vector3(0.45, 0.9, 0.45).normalize() : new THREE.Vector3(0.55, 0.55, 0.62).normalize();
    const t = new THREE.Vector3(terrain.size_m / 2, 300, -terrain.size_m / 2), d = fitDistance(camera, t, dir, regionBox(), 0.95);
    return { target: t, pos: t.clone().addScaledVector(dir, d) };
  }
  // the 2.6 framing: a three-quarter elevated view (≈ 31° down) over the middle 75 m of the plot, from its downhill
  // side, so crowns read as crowns; eye level only when the reader zooms in
  function focusView() {
    const { x0, y0 } = focusAt, n = plot.n, W = 75, i0 = x0 + (PLOT_M - W) / 2, j0 = y0 + (PLOT_M - W) / 2;
    let hmin = Infinity, hmax = -Infinity, tmax = 0;
    for (let j = Math.floor(n * 0.35); j < n * 0.65; j++) for (let i = Math.floor(n * 0.35); i < n * 0.65; i++) { const v = plot.height[j * n + i]; hmin = Math.min(hmin, v); hmax = Math.max(hmax, v); }
    if (focus) for (const p of focus.plants) if (p.H > tmax) tmax = p.H;
    let gx = 0, gy = 0; for (let j = 0; j < n; j += 8) for (let i = 0; i < n; i += 8) { const h = plot.height[j * n + i]; gx += h * (i / (n - 1) - 0.5); gy += h * (j / (n - 1) - 0.5); }
    const az = Math.hypot(gx, gy) > 1e-6 ? Math.atan2(-gy, -gx) : 0.8, el = camera.aspect < 1 ? 0.75 : 0.55;
    const dir = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), -Math.sin(az) * Math.cos(el)).normalize();
    const t = new THREE.Vector3(x0 + PLOT_M / 2, hmin + (hmax - hmin) * 0.4 + Math.min(tmax, 25) * 0.3, -(y0 + PLOT_M / 2));
    const d = fitDistance(camera, t, dir, boxPoints(i0, i0 + W, hmin, hmax + Math.min(tmax, 25), -(j0 + W), -j0), 1.0);
    return { target: t, pos: t.clone().addScaledVector(dir, d) };
  }
  function frameRegion(snap) { const v = regionView(); if (snap) { controls.target.copy(v.target); camera.position.copy(v.pos); camera.lookAt(v.target); } return v; }
  function frameFocus(snap) { const v = focusView(); if (snap) { controls.target.copy(v.target); camera.position.copy(v.pos); camera.lookAt(v.target); } return v; }
  function flyTo(where) {
    level = where; levelBtn.disabled = where === 'region'; levelBtn.textContent = 'Back to region';
    const keep = camera.position.clone(), q = camera.quaternion.clone();
    const v = where === 'focus' ? focusView() : regionView();
    camera.position.copy(keep); camera.quaternion.copy(q);
    fly = { t: 0, p0: keep, t0: controls.target.clone(), p1: v.pos, t1: v.target };
    setShadowFrame();
  }
  function setShadowFrame() {
    const sc = sun.shadow.camera;
    if (level === 'focus' && focusAt) {
      const c = new THREE.Vector3(focusAt.x, plot ? plot.height[plot.height.length >> 1] : 0, -focusAt.y);
      sun.target.position.copy(c); sun.position.copy(c).add(new THREE.Vector3(120, 260, 90));
      sc.left = sc.bottom = -190; sc.right = sc.top = 190; sc.near = 10; sc.far = 900;
    } else {
      const c = new THREE.Vector3(terrain.size_m / 2, 0, -terrain.size_m / 2);
      sun.target.position.copy(c); sun.position.copy(c).add(new THREE.Vector3(4000, 9000, 3000));
      sc.left = sc.bottom = -8000; sc.right = sc.top = 8000; sc.near = 100; sc.far = 30000;
    }
    sc.updateProjectionMatrix(); renderer.shadowMap.needsUpdate = true;
    const ld = sun.position.clone().sub(sun.target.position).normalize();
    for (const bb of [plotBB, nearBB]) if (bb) bb.setLight(ld);
  }
  function resize() {
    if (!renderer) return;
    setAspect();
    const w = Math.max(1, view.clientWidth), h = Math.max(1, view.clientHeight || Math.round(w * (mq.matches ? 1.25 : 0.625)));
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    if (farBB) { farBB.setMinPx(3, h * renderer.getPixelRatio()); nearBB.setMinPx(0, h * renderer.getPixelRatio()); }
    chartDirty = true;
  }

  // ---------------------------------------------------------------- drawing: region
  const _c = new THREE.Color();
  // region vegetation as impostors of the real module skeletons: far marks (×FAR_K the true size, so the forest reads
  // at 10 km) everywhere outside R_NEAR, true-size trees in the ring around the plot; species drawn per plant type
  const PFT_SPECIES = { conifer: ['fir', 'spruce', 'pine'], broadleaf: ['beech', 'elm'], pioneer: ['birch'], riparian: ['poplar', 'willow'], palm: ['palm'], arid: ['candelabra'], shrub: ['hazel'] };
  function updateRegion() {
    if (!farBB) return;
    const t = region.t, n = t.n, cm = t.cell_m, rng = makeRng(99);
    let nf = 0, nn = 0;
    const fx0 = focusAt ? focusAt.x0 : -1e9, fy0 = focusAt ? focusAt.y0 : -1e9, fx1 = fx0 + PLOT_M, fy1 = fy0 + PLOT_M;
    if (!atlas.dbg) atlas.dbg = 0;
    const place = (bb, i, k, x, y, h, K) => {
      const list = PFT_SPECIES[PFT[k].key]; if (!list) return false;
      const key = list[Math.floor(rng.next() * list.length)], tl = atlas.tiles[key]; if (!tl) return false;
      const f = (0.55 + 0.45 * rng.next()) * K, sc = f * (refs[key].H[refs[key].Y] / tl.H);
      bb.set(i, x, h - 0.3, -y, tl.w * sc, tl.h * sc, tl.i, 0.88 + 0.24 * rng.next());
      return true;
    };
    for (let i = 0; i < n * n; i++) {
      if (t.waterKind[i]) continue;
      const cx = (i % n) * cm, cy = ((i / n) | 0) * cm, near = focusAt && Math.hypot(cx - focusAt.x, cy - focusAt.y) < R_NEAR + cm;
      for (let k = 0; k < PFT.length; k++) {
        const v = region.V[k][i]; if (v < 0.04 || PFT[k].key === 'grass') continue;
        if (!near) {
          const marks = Math.min(3, Math.floor(v * 3.4 + rng.next()));
          for (let m = 0; m < marks && nf < farBB.cap; m++) {
            const x = cx + (rng.next() - 0.5) * cm, y = cy + (rng.next() - 0.5) * cm;
            if (place(farBB, nf, k, x, y, sampleH(x, y), FAR_K)) nf++;
          }
        } else {
          const cnt = Math.floor(v * cm * cm / 70 * 0.35 + rng.next());
          for (let m = 0; m < cnt && nn < nearBB.cap; m++) {
            const x = cx + (rng.next() - 0.5) * cm, y = cy + (rng.next() - 0.5) * cm;
            if (Math.hypot(x - focusAt.x, y - focusAt.y) > R_NEAR) continue;
            if (x > fx0 + 4 && x < fx1 - 4 && y > fy0 + 4 && y < fy1 - 4) continue;
            const smp = terrain.sample(x, y); if (smp.waterKind || smp.material === 0 || smp.material === 5) continue;
            if (place(nearBB, nn, k, x, y, smp.h, 1)) nn++;
          }
        }
      }
    }
    farBB.finish(nf); nearBB.finish(nn); counts.far = nf; counts.near = nn;
    // the far field also as a canopy tint on the region ground: cover-weighted plant-type colour, cover as alpha
    if (ground && ground.setCanopy) {
      const rgba = canopyBuf || (canopyBuf = new Uint8Array(n * n * 4)), cc = new THREE.Color();
      for (let i = 0; i < n * n; i++) {
        let r = 0, g = 0, b = 0, w = 0;
        for (let k = 0; k < PFT.length; k++) { const v = region.V[k][i] * (PFT[k].tree ? 1 : 0.4); if (v <= 0) continue; cc.setHex(PFT[k].nat); r += cc.r * v; g += cc.g * v; b += cc.b * v; w += v; }
        const o = i * 4; if (w > 0) { cc.setRGB(r / w, g / w, b / w).convertLinearToSRGB(); rgba[o] = cc.r * 255; rgba[o + 1] = cc.g * 255; rgba[o + 2] = cc.b * 255; }
        const dd = focusAt ? Math.hypot((i % n) * cm - focusAt.x, ((i / n) | 0) * cm - focusAt.y) : 1e9, fade = Math.min(1, Math.max(0, (dd - R_NEAR * 0.55) / (R_NEAR * 0.5)));
        rgba[o + 3] = Math.min(1, w) * 255 * (t.waterKind[i] ? 0 : 1) * fade; // fades out where the true-size ring and the plot take over
      }
      ground.setCanopy(rgba, n, 0xd5ddca);
    }
  }
  const sampleH = (x, y) => (terrain.heightAt ? terrain.heightAt(x, y) : terrain.sample(x, y).h);
  function applyBBPalette() { if (!farBB) return; const bg = ground && ground.background ? ground.background() : (palette === 'natural' ? 0xcfd9e2 : 0xffffff); farBB.setPalette(palette, bg, 30000); nearBB.setPalette(palette, bg, 30000); plotBB.setPalette(palette, bg, 30000); }

  // ---------------------------------------------------------------- drawing: focus
  const W2R = (lx, ly) => [focusAt.x0 + lx, -(focusAt.y0 + ly)];
  // living plants: billboards of the reference skeleton nearest in size (scaled to the plant's height; a suppressed
  // tree keeps the small sparse crown of a small skeleton), the N_DETAIL nearest the camera as skeletons
  function updateFocus() {
    let nb = 0;
    for (const p of focus.plants) {
      if (detailIds.has(p.id) || nb >= plotBB.cap) continue;
      const sp = focus.species[p.s], tl = tileFor(atlas, sp.key, p.N, p.H); if (!tl) continue;
      const sc = Math.min(1.6, Math.max(0.35, p.H / Math.max(0.3, tl.H))), [wx, wz] = W2R(p.x, p.y);
      plotBB.set(nb++, wx, p.gy - 0.2, wz, tl.w * sc, tl.h * sc, tl.i, 0.9 + 0.2 * p.jit);
    }
    plotBB.finish(nb);
    writeSnags(); writeLogs(); writeGroundCover(); writeDetail();
    renderer.shadowMap.needsUpdate = true;
  }
  // snags at the dead tree's stem diameter, tapered; bark weathers from brown / ink to silver-grey with age, branch
  // stubs shorten and drop out over the snag's first ~25 years; an old or snapped snag has a splintered top (ours)
  const SNAG_PAL = { drawing: [0x2b3035, 0x5d6267], natural: [0x4f3e30, 0x9a9388] };
  function writeSnags() {
    const A = snagMesh.instanceMatrix.array, C = snagMesh.instanceColor.array, pal = SNAG_PAL[palette], c0 = new THREE.Color(pal[0]), c1 = new THREE.Color(pal[1]);
    let n = 0;
    const put = () => { C[n * 3] = _c.r; C[n * 3 + 1] = _c.g; C[n * 3 + 2] = _c.b; n++; };
    for (const sn of focus.snags) {
      if (deadIds.has('s' + sn.id) || n > 19980 || sn.D < 0.1) continue; // poles under 10 cm are not drawn (ours)
      const [wx, wz] = W2R(sn.x, sn.y), r = Math.max(0.05, 0.5 * sn.D), wt = Math.min(1, sn.age / (sn.half * 1.2));
      _c.copy(c0).lerp(c1, wt);
      writeSeg(A, n, wx, sn.gy - 0.3, wz, wx, sn.gy + sn.H, wz, r); put();
      const h = ((sn.id * 2654435761) >>> 0);
      if (sn.snapped || sn.age > 6) {
        const a = sn.rot + (h & 7), len = Math.min(1.6, 0.6 + 3 * r);
        writeSeg(A, n, wx, sn.gy + sn.H - 0.05, wz, wx + Math.cos(a) * len * 0.35, sn.gy + sn.H + len, wz - Math.sin(a) * len * 0.35, r * 0.4); put();
      }
      const stubs = Math.max(0, Math.round(7 - sn.age / 3.5));
      for (let k = 0; k < stubs && n < 19990; k++) {
        const a = sn.rot + k * 2.39996, hh = sn.gy + sn.H * (0.4 + 0.55 * ((k * 0.618034 + (h & 15) / 15) % 1));
        const len = Math.max(0.25, Math.min(sn.R * 0.6, 2.2) * (1 - sn.age / 28)) * (0.6 + 0.4 * ((k * 7) % 3) / 2);
        writeSeg(A, n, wx, hh, wz, wx + Math.cos(a) * len, hh + len * 0.35, wz - Math.sin(a) * len, Math.max(0.025, r * 0.22)); put();
      }
    }
    snagMesh.count = n; snagMesh.instanceMatrix.needsUpdate = true; snagMesh.instanceColor.needsUpdate = true;
  }
  function writeTrunk(T, i, x, y, z, r, h) { const o = i * 16; T.fill(0, o, o + 16); T[o] = r; T[o + 5] = h + 0.3; T[o + 10] = r; T[o + 12] = x; T[o + 13] = y - 0.3; T[o + 14] = z; T[o + 15] = 1; }
  function writeSeg(T, i, x0, y0, z0, x1, y1, z1, r) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, l = Math.hypot(dx, dy, dz) || 1, ux = dx / l, uy = dy / l, uz = dz / l;
    let ax = 0, ay = 1, az = 0; if (Math.abs(uy) > 0.9) { ax = 1; ay = 0; }
    let e1x = uy * az - uz * ay, e1y = uz * ax - ux * az, e1z = ux * ay - uy * ax; const n1 = Math.hypot(e1x, e1y, e1z); e1x /= n1; e1y /= n1; e1z /= n1;
    const e2x = uy * e1z - uz * e1y, e2y = uz * e1x - ux * e1z, e2z = ux * e1y - uy * e1x, o = i * 16;
    T[o] = e1x * r; T[o + 1] = e1y * r; T[o + 2] = e1z * r; T[o + 3] = 0; T[o + 4] = dx; T[o + 5] = dy; T[o + 6] = dz; T[o + 7] = 0;
    T[o + 8] = e2x * r; T[o + 9] = e2y * r; T[o + 10] = e2z * r; T[o + 11] = 0; T[o + 12] = x0; T[o + 13] = y0; T[o + 14] = z0; T[o + 15] = 1;
  }
  // logs lie on the ground along their fall direction, sag into it and break into pieces as they decay
  function writeLogs() {
    const A = logMesh.instanceMatrix.array, C = logMesh.instanceColor.array, MA = moundMesh.instanceMatrix.array, MC = moundMesh.instanceColor.array;
    const PA = plateMesh.instanceMatrix.array, PC = plateMesh.instanceColor.array;
    const pal = LOG_PAL[palette]; let nl = 0, nm = 0, np = 0;
    for (const L of focus.logs) {
      if (deadIds.has('l' + L.id)) continue;
      if (L.D < 0.12 && L.cls > 2) continue; // thin logs vanish into the litter and the ground cover once soft (drawing; ours)
      const cls = L.cls, segs = cls >= 4 ? 4 : 3, f = L.M / L.M0, r0 = Math.max(0.05, L.D * 0.5) * (cls >= 3 ? 0.92 : 1), sag = r0 * [0.12, 0.2, 0.35, 0.5, 0.6][cls - 1]; // partly sunk, more with decay
      if (cls === 5) { // a low mound along the log line
        const mx = L.x + Math.cos(L.dir) * L.L * 0.4, my = L.y + Math.sin(L.dir) * L.L * 0.4, [wx, wz] = W2R(mx, my), gy = focus.groundAt(mx, my);
        if (nm < 8000) { const o = nm * 16, len = L.L * 0.45, wd = Math.max(0.3, r0 * 1.6), c = Math.cos(L.dir), s = Math.sin(L.dir);
          MA.fill(0, o, o + 16); MA[o] = c * len; MA[o + 2] = -s * len; MA[o + 5] = Math.max(0.12, r0 * 0.6); MA[o + 8] = s * wd; MA[o + 10] = c * wd; MA[o + 12] = wx; MA[o + 13] = gy - 0.05; MA[o + 14] = wz; MA[o + 15] = 1;
          _c.setHex(pal[4]); MC[nm * 3] = _c.r; MC[nm * 3 + 1] = _c.g; MC[nm * 3 + 2] = _c.b; nm++; }
        continue;
      }
      for (let k = 0; k < segs && nl < 40000; k++) {
        if (cls >= 4 && k === 1 + (L.id % 2)) continue;  // one fragment gone: the log has broken
        const t0 = k / segs, t1 = (k + 1) / segs - (cls >= 4 ? 0.02 : 0);
        const ax = L.x + Math.cos(L.dir) * L.L * t0, ay = L.y + Math.sin(L.dir) * L.L * t0, bx = L.x + Math.cos(L.dir) * L.L * t1, by = L.y + Math.sin(L.dir) * L.L * t1;
        const ra = r0 * (1 - 0.55 * t0), rb = r0 * (1 - 0.55 * t1);
        const [wa, za] = W2R(ax, ay), [wb, zb] = W2R(bx, by);
        const gm = focus.groundAt(0.5 * (ax + bx), 0.5 * (ay + by)), ga = Math.max(focus.groundAt(ax, ay), gm - 0.15), gb = Math.max(focus.groundAt(bx, by), gm - 0.15); // rest on the highest ground under the segment
        const ya = ga + ra - sag + (L.plate && cls <= 2 && k === 0 ? L.plate * 0.3 : 0), yb = gb + rb - sag + (L.z0 || 0) * (1 - t1);
        writeSeg(A, nl, wa, ya, za, wb, yb, zb, ra);
        const shade = 0.9 + 0.2 * ((L.id * 7 + k) % 5) / 5;
        _c.setHex(pal[cls - 1]).multiplyScalar(shade); C[nl * 3] = _c.r; C[nl * 3 + 1] = _c.g; C[nl * 3 + 2] = _c.b; nl++;
      }
      if (L.plate && cls <= 4 && np < 3000) { // the root plate stands at the base, beside its pit, disc facing along the log
        const R = L.plate * (cls >= 3 ? 0.55 : 0.75), th = Math.max(0.2, 0.25 * R), c = Math.cos(L.dir), s2 = Math.sin(L.dir);
        const [wx, wz] = W2R(L.x, L.y), gy = focus.groundAt(L.x, L.y), o = np * 16;
        // columns: X = horizontal across the log × R, Y = along the log × thickness (the cylinder axis), Z = up × R
        PA.fill(0, o, o + 16); PA[o] = s2 * R; PA[o + 2] = c * R; PA[o + 4] = -c * th; PA[o + 6] = s2 * th; PA[o + 9] = R; PA[o + 12] = wx; PA[o + 13] = gy + R * 0.55; PA[o + 14] = wz; PA[o + 15] = 1;
        _c.setHex(palette === 'natural' ? 0x7a6a52 : 0xc4beb2).multiplyScalar(cls >= 3 ? 1.05 : 1); PC[np * 3] = _c.r; PC[np * 3 + 1] = _c.g; PC[np * 3 + 2] = _c.b; np++;
      }
    }
    // pit-and-mound written into the focus ground (ground.applyHeightDelta): a pit where the root plate tore out,
    // a mound where the plate's soil falls, beyond the pit in the fall direction (depth 0.35 r, mound 0.3 r; ours)
    if (plotGround && plotGround.applyHeightDelta && pitsDone < focus.pits.length) {
      const bumps = [];
      for (; pitsDone < focus.pits.length; pitsDone++) {
        const P = focus.pits[pitsDone];
        bumps.push({ x: P.x, y: P.y, r: 0.55 * P.r, dh: -0.35 * P.r }, { x: P.x + Math.cos(P.dir) * P.r * 1.1, y: P.y + Math.sin(P.dir) * P.r * 1.1, r: 0.5 * P.r, dh: 0.3 * P.r });
      }
      plotGround.applyHeightDelta(bumps);
    }
    // pit rim ring (ink in the drawing, a dark soil line in colour) + a soft contact shadow in the pit, and a ring at
    // the foot of the mound; the shadow sits at the pit floor so the slopes around it hide its edge
    const RA = pitRing.instanceMatrix.array, RC = pitRing.instanceColor.array, SA = pitShade.instanceMatrix.array; let nr = 0, ns = 0;
    _c.setHex(palette === 'natural' ? 0x3b3026 : 0x3a3f45);
    for (const P of focus.pits) {
      if (nr > 3996) break;
      const fl = Math.exp(-P.age / 600), rp = 0.55 * P.r * 1.35, [wx, wz] = W2R(P.x, P.y);
      const mx = P.x + Math.cos(P.dir) * P.r * 1.1, my = P.y + Math.sin(P.dir) * P.r * 1.1, [mwx, mwz] = W2R(mx, my);
      for (const [x, y, z, r] of [[wx, P.gy + 0.03, wz, rp], [mwx, focus.groundAt(mx, my) - 0.3 * P.r * fl + 0.03, mwz, 0.5 * P.r * 1.25]]) {
        const o = nr * 16; RA.fill(0, o, o + 16); RA[o] = r; RA[o + 5] = 1; RA[o + 10] = r; RA[o + 12] = x; RA[o + 13] = y; RA[o + 14] = z; RA[o + 15] = 1;
        RC[nr * 3] = _c.r; RC[nr * 3 + 1] = _c.g; RC[nr * 3 + 2] = _c.b; nr++;
      }
      const o = ns * 16; SA.fill(0, o, o + 16); SA[o] = rp * 0.85; SA[o + 5] = 1; SA[o + 10] = rp * 0.85; SA[o + 12] = wx; SA[o + 13] = P.gy - 0.3 * P.r * fl; SA[o + 14] = wz; SA[o + 15] = 1; ns++;
    }
    pitRing.count = nr; pitRing.instanceMatrix.needsUpdate = true; pitRing.instanceColor.needsUpdate = true; pitShade.count = ns; pitShade.instanceMatrix.needsUpdate = true;
    for (const [m, n] of [[logMesh, nl], [moundMesh, nm], [plateMesh, np]]) { m.count = n; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
  }
  function writeGroundCover() {
    const G = focus.GC, cov = focus.cover, rng = makeRng(4242 + focus.year), pal = GC_PAL[palette];
    for (const k of ['grass', 'herb', 'fern']) {
      const m = gcMesh[k], A = m.instanceMatrix.array, C = m.instanceColor.array, dens = cov[k], cap = m.instanceMatrix.count; let n = 0;
      _c.setHex(pal[k]);
      const base = _c.clone();
      for (let iy = 0; iy < G && n < cap; iy++) for (let ix = 0; ix < G && n < cap; ix++) {
        const d = dens[iy * G + ix], cnt = Math.floor(d * (k === 'grass' ? 9 : k === 'herb' ? 6 : 3) + rng.next());
        for (let j = 0; j < cnt && n < cap; j++) {
          const x = (ix + rng.next()) * 4, y = (iy + rng.next()) * 4, [wx, wz] = W2R(x, y), gy = focus.groundAt(x, y), s = (0.7 + 0.6 * rng.next()) * GC_SCALE[palette], a = rng.next() * 6.283, o = n * 16;
          A.fill(0, o, o + 16); A[o] = Math.cos(a) * s; A[o + 2] = -Math.sin(a) * s; A[o + 5] = s; A[o + 8] = Math.sin(a) * s; A[o + 10] = Math.cos(a) * s; A[o + 12] = wx; A[o + 13] = gy - 0.02; A[o + 14] = wz; A[o + 15] = 1;
          const v = 0.85 + 0.3 * rng.next(); C[n * 3] = base.r * v; C[n * 3 + 1] = base.g * v; C[n * 3 + 2] = base.b * v; n++;
        }
      }
      m.count = n; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true;
    }
  }
  // the nearest plants, snags and logs as module skeletons from their species' reference run
  function chooseDetail() {
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    const near = (list, n, posOf) => { const best = []; for (const o of list) { const [x, y, z] = posOf(o), d = (x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2; if (best.length < n) { best.push([d, o]); best.sort((a, b) => b[0] - a[0]); } else if (d < best[0][0]) { best[0] = [d, o]; best.sort((a, b) => b[0] - a[0]); } } return best.map((b) => b[1]); };
    const fp = (p) => { const [x, z] = W2R(p.x, p.y); return [x, p.gy + (p.H || 2) * 0.5, z]; };
    const dist = camera.position.distanceTo(controls.target);
    if (level !== 'focus' || dist > 600) { detailIds = new Set(); deadIds = new Set(); return; }
    detailIds = new Set(near(focus.plants.filter((p) => p.H > 1.2), N_DETAIL, fp).map((p) => p.id));
    deadIds = new Set([...near(focus.snags, 4, fp).map((s) => 's' + s.id), ...near(focus.logs.filter((l) => l.cls <= 2 && l.D >= 0.12), N_DETAIL_DEAD, (l) => { const [x, z] = W2R(l.x, l.y); return [x, focus.groundAt(l.x, l.y), z]; }).map((l) => 'l' + l.id)]);
  }
  function snapFor(key, N, H = 0) { const sn = refs[key].snaps; let k = sn.length - 1, bd = Infinity; for (let i = 0; i < sn.length; i++) { if (sn[i].H < 0.6 * H) continue; const d = Math.abs(sn[i].N - N); if (d < bd) { bd = d; k = i; } } return sn[k]; }
  function writeDetail() {
    const live = [], dead = [];
    for (const p of focus.plants) {
      if (!detailIds.has(p.id)) continue;
      const sp = focus.species[p.s], sn = snapFor(sp.key, p.N, p.H), k = Math.min(1.35, Math.max(0.75, p.H / Math.max(0.5, sn.H))), [wx, wz] = W2R(p.x, p.y);
      live.push({ mods: sn.plant.mods, sp: sn.plant.sp, capF: 1, d: sp.def, xf: { c: Math.cos(p.rot), s: Math.sin(p.rot), k, x: wx, y: p.gy - 0.05, z: wz } });
    }
    for (const s of focus.snags) {
      if (!deadIds.has('s' + s.id)) continue;
      const sp = focus.species[s.s], sn = snapFor(sp.key, s.N), k = Math.min(2, Math.max(0.5, s.fullH / Math.max(0.5, sn.H))), [wx, wz] = W2R(s.x, s.y);
      dead.push({ mods: sn.plant.mods, sp: sn.plant.sp, capF: 1, d: sp.def, prune: 0.01 + s.age * 0.004, minR: 0.02, xf: { c: Math.cos(s.rot), s: Math.sin(s.rot), k, x: wx, y: s.gy - 0.05, z: wz } });
    }
    for (const L of focus.logs) {
      if (!deadIds.has('l' + L.id)) continue;
      const sp = focus.species[L.s], sn = snapFor(sp.key, L.N), k = Math.min(2, Math.max(0.4, L.L / Math.max(0.5, sn.H))), [wx, wz] = W2R(L.x, L.y);
      // rotation: tree up (0,1,0) → fall direction (cos d, 0, −sin d) in three.js; a roll about the trunk by rot
      const c = Math.cos(L.dir), s = Math.sin(L.dir), ux = c, uz = -s, sx = -uz, sz = ux, rc = Math.cos(L.rot), rs = Math.sin(L.rot);
      // columns: X = side·rc + up·rs, Y = fall direction, Z = side × fall …
      const X0 = [sx * rc, rs, sz * rc], Y0 = [ux, 0, uz], Z0 = [X0[1] * Y0[2] - X0[2] * Y0[1], X0[2] * Y0[0] - X0[0] * Y0[2], X0[0] * Y0[1] - X0[1] * Y0[0]];
      const m = [X0[0], Y0[0], Z0[0], X0[1], Y0[1], Z0[1], X0[2], Y0[2], Z0[2]];
      const gy = focus.groundAt(L.x, L.y) + Math.max(0.1, L.D * 0.5);
      dead.push({ mods: sn.plant.mods, sp: sn.plant.sp, capF: 1, d: sp.def, prune: [0.045, 0.09][L.cls - 1] || 0.2, minR: 0.02, logCls: L.cls, xf: { m, k, x: wx, y: gy, z: wz } });
    }
    detail.setBark(BARK[palette]);
    detail.write(live, (e) => plantCol[PLANTS.indexOf(e.d)][palette], (e) => e.d.leafSize * FOCUS_LEAF[e.d.leaf] / e.xf.k, null, (e) => e.d.leaf); // leaves keep their size when a skeleton is scaled
    deadDetail.setBark(palette === 'natural' ? 0x6b5a48 : 0x4a4f55);
    deadDetail.write(dead, () => _c, () => 0, null, () => null);
  }

  // ---------------------------------------------------------------- chart
  function drawChart() {
    const dpr = Math.min(2, window.devicePixelRatio || 1), Wd = Math.max(1, chart.clientWidth), stack = Wd < 560, Hc = stack ? 380 : 200;
    chart.style.height = Hc + 'px';
    if (chart.width !== Math.round(Wd * dpr) || chart.height !== Math.round(Hc * dpr)) { chart.width = Math.round(Wd * dpr); chart.height = Math.round(Hc * dpr); }
    const g = chart.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, Wd, Hc);
    g.font = '11px Inter, system-ui, sans-serif'; g.textBaseline = 'middle';
    const ink = '#212529', mute = '#6c757d', rule = '#dee2e6';
    const pw = stack ? Wd : (Wd - 24) / 2, ph = stack ? (Hc - 10) / 2 : Hc;
    const boxA = { x: 0, y: 0, w: pw, h: ph }, boxB = stack ? { x: 0, y: ph + 10, w: pw, h: ph } : { x: pw + 24, y: 0, w: pw, h: ph };
    const frame = (bx, title, xl, items) => {
      const gap = 7, tw = g.measureText(title).width, iw = items.reduce((a, [t]) => a + g.measureText(t).width, 0) + gap * Math.max(0, items.length - 1);
      const two = 40 + tw + 16 + iw > bx.w - 10, lines = two ? (40 + iw > bx.w - 10 ? 2 : 1) : 0;
      const top = 19 + 14 * lines, x0 = bx.x + 41, y0 = bx.y + top, w = bx.w - 52, h = bx.h - top - 30;
      g.strokeStyle = rule; g.lineWidth = 1; g.strokeRect(x0 - 0.5, y0 - 0.5, w + 1, h + 1);
      g.fillStyle = ink; g.textAlign = 'left'; g.fillText(title, bx.x + 40, bx.y + 8);
      let ix = two ? bx.x + 40 : bx.x + bx.w - 10 - iw, iy = two ? bx.y + 22 : bx.y + 8;
      for (const [t, c] of items) { const tw2 = g.measureText(t).width; if (two && ix + tw2 > bx.x + bx.w - 6) { ix = bx.x + 40; iy += 14; } g.fillStyle = c; g.fillText(t, ix, iy); ix += tw2 + gap; }
      g.fillStyle = mute; g.textAlign = 'center'; g.fillText(xl, x0 + w / 2, bx.y + bx.h - 8);
      return { x0, y0, w, h };
    };
    if (!region) return;
    // (a) region: share of each plant type by altitude (now), treeline dashed
    {
      const t = region.t, n = t.n, NB = 24; let hmax = 0; for (const v of t.height) hmax = Math.max(hmax, v);
      const bins = PFT.map(() => new Float32Array(NB)), land = new Float32Array(NB);
      for (let i = 0; i < n * n; i++) { if (t.waterKind[i]) continue; const b = Math.min(NB - 1, Math.floor(t.height[i] / hmax * NB)); land[b]++; for (let k = 0; k < PFT.length; k++) bins[k][b] += region.V[k][i]; }
      const items = PFT.map((f, k) => [f.key, CHART.pft[k]]).filter((_, k) => bins[k].some((v) => v > 1));
      const box = frame(boxA, 'a  region: plant cover by altitude', 'cover in each 1/24 of the relief', items);
      g.fillStyle = mute; g.textAlign = 'right'; g.fillText(`${Math.round(hmax)} m`, box.x0 - 4, box.y0 + 4); g.fillText('0', box.x0 - 4, box.y0 + box.h);
      const Y = (b) => box.y0 + box.h * (1 - (b + 0.5) / NB);
      for (let k = 0; k < PFT.length; k++) {
        if (!items.find((it) => it[0] === PFT[k].key)) continue;
        g.beginPath(); for (let b = 0; b < NB; b++) { const v = land[b] ? bins[k][b] / land[b] : 0, px = box.x0 + box.w * Math.min(1, v); b ? g.lineTo(px, Y(b)) : g.moveTo(px, Y(b)); }
        g.strokeStyle = CHART.pft[k]; g.lineWidth = 1.6; g.stroke();
      }
      const tl = treeline();
      if (Number.isFinite(tl)) { const py = box.y0 + box.h * (1 - (tl + (terrain.seaLevel || 0)) / hmax); g.setLineDash([4, 3]); g.strokeStyle = ink; g.beginPath(); g.moveTo(box.x0, py); g.lineTo(box.x0 + box.w, py); g.stroke(); g.setLineDash([]); g.fillStyle = ink; g.textAlign = 'right'; g.fillText(`treeline ${Math.round(tl)} m above the sea`, box.x0 + box.w - 4, py - 7); }
    }
    // (b) focus: logs by decay class (stacked), snags, humus
    {
      const items = [['class 1', CHART.cls[0]], ['2', CHART.cls[1]], ['3', CHART.cls[2]], ['4', CHART.cls[3]], ['5', CHART.cls[4]], ['snags', ink], ['humus', '#8a6d3b']];
      const box = frame(boxB, 'b  focus plot: dead wood', 'years', items);
      const H = focus ? focus.hist : [], n = H.length;
      if (n > 1) {
        const xmax = Math.max(100, Math.ceil(H[n - 1].year / 100) * 100), X = (yr) => box.x0 + box.w * yr / xmax;
        let ymax = 10; for (const r of H) ymax = Math.max(ymax, r.cls.reduce((a, b) => a + b, 0), r.snags);
        let hmax = 0.5; for (const r of H) hmax = Math.max(hmax, r.humus);
        const Y = (v) => box.y0 + box.h * (1 - v / ymax);
        g.fillStyle = mute; g.textAlign = 'right'; g.fillText(String(Math.round(ymax)), box.x0 - 4, box.y0 + 4); g.fillText('0', box.x0 - 4, box.y0 + box.h);
        g.textAlign = 'center'; g.fillText('0', box.x0, box.y0 + box.h + 9); g.fillText(String(xmax), box.x0 + box.w, box.y0 + box.h + 9);
        for (let c = 4; c >= 0; c--) {
          g.beginPath();
          for (let i = 0; i < n; i++) { const r = H[i]; let s = 0; for (let j = 0; j <= c; j++) s += r.cls[j]; const px = X(r.year), py = Y(s); i ? g.lineTo(px, py) : g.moveTo(px, py); }
          g.lineTo(X(H[n - 1].year), Y(0)); g.lineTo(X(H[0].year), Y(0)); g.closePath(); g.fillStyle = CHART.cls[c]; g.globalAlpha = 0.85; g.fill(); g.globalAlpha = 1;
        }
        g.beginPath(); H.forEach((r, i) => { const px = X(r.year), py = Y(r.snags); i ? g.lineTo(px, py) : g.moveTo(px, py); }); g.strokeStyle = ink; g.lineWidth = 1.4; g.stroke();
        g.beginPath(); H.forEach((r, i) => { const px = X(r.year), py = box.y0 + box.h * (1 - r.humus / hmax); i ? g.lineTo(px, py) : g.moveTo(px, py); }); g.strokeStyle = '#8a6d3b'; g.setLineDash([4, 3]); g.stroke(); g.setLineDash([]);
        g.fillStyle = '#8a6d3b'; g.textAlign = 'left'; g.fillText(`humus max ${hmax.toFixed(1)} kg/m²`, box.x0 + 4, box.y0 + 9);
      }
    }
  }
  /** region treeline: top of the highest 100 m band (≥ 30 cells) whose tree cover is at least half the forested bands' median */
  function treeline() {
    const t = region.t, n = t.n, NB = 40, cov = new Float32Array(NB), land = new Float32Array(NB);
    const sea = terrain.seaLevel || 0; // treeline in metres above the sea
    for (let i = 0; i < n * n; i++) { if (t.waterKind[i]) continue; const b = Math.min(NB - 1, Math.max(0, Math.floor((t.height[i] - sea) / 100))); land[b]++; for (let k = 0; k < PFT.length; k++) if (PFT[k].tree) cov[b] += region.V[k][i]; }
    const ok = []; for (let b = 0; b < NB; b++) if (land[b] >= 30) { cov[b] /= land[b]; ok.push(b); }
    const f = ok.map((b) => cov[b]).filter((c) => c > 0.05).sort((a, b) => a - b), med = f.length ? f[f.length >> 1] : 0;
    for (let k = ok.length - 1; k >= 0; k--) if (med > 0 && cov[ok[k]] >= 0.5 * med) return k === ok.length - 1 ? NaN : (ok[k] + 1) * 100;
    return NaN;
  }
  function drawStatus() {
    if (phase !== 'run') {
      const pc = Math.round(progress * 100);
      status.textContent = { terrain: `1/4 forming the terrain (uplift, erosion, rivers) — ${stage} ${pc}%`, region: `2/4 growing the region's vegetation ${pc}%`,
        plants: `3/4 growing one plant of each species with the module model — ${stage}`, focus: `4/4 growing the focus plot ${pc}%`, ready: '4/4 drawing', idle: '' }[phase] || '';
      return;
    }
    const st = focus.stats, top = focus.species.map((sp, i) => [sp.def.name, st.count[i]]).filter((a) => a[1]).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const tl = treeline(), biome = BIOMES[region.at(focusAt.x, focusAt.y).biome]?.name || '';
    status.textContent = `year ${focus.year} · ${level === 'region' ? 'click the region to move the plot · ' : ''}${top.map(([n, c]) => `${n} ${c}`).join(' · ')} · snags ${st.snags} · logs ${st.logs} · ${biome} · treeline ${Number.isFinite(tl) ? Math.round(tl) + ' m above the sea' : 'above the summit'} · ${+temp.input.value} °C at sea level, ${+prec.input.value} mm, terrain ${terrainSeed}, plot ${Math.round(focusAt.x)}, ${Math.round(focusAt.y)} m · ${(regionMs + focus.msStep).toFixed(1)} ms/step`;
  }

  // ---------------------------------------------------------------- loop
  function pump(budget) {
    if (!gen) return;
    const t0 = performance.now();
    const go = () => gen.next().then((r) => { if (r.done) { gen = null; dirtyRegion = true; dirtyFocus = true; chartDirty = true; } else if (performance.now() - t0 < budget) return go(); });
    if (!pump.busy) { pump.busy = true; go().finally(() => { pump.busy = false; }); }
  }
  function frame(t) {
    raf = requestAnimationFrame(frame);
    const f0 = performance.now(), dt = Math.min(0.1, Math.max(0, (t - last) / 1000)); last = t;
    if (gen) pump(10);
    if (phase === 'run' && playing && !fly) {
      acc += dt * +speed.input.value; const n = Math.floor(acc);
      if (n > 0) {
        const t0 = performance.now(); let done = 0;
        while (done < n && performance.now() - t0 < 12) { const r0 = performance.now(); region.step(); regionMs = 0.9 * regionMs + 0.1 * (performance.now() - r0); focus.step(); done++; }
        acc = done < n ? 0 : acc - n; dirtyFocus = true; if (focus.year % 5 === 0) dirtyRegion = true; chartDirty = true;
      }
    }
    if (outline) outline.visible = level === 'region';
    if (fly) {
      fly.t = Math.min(1, fly.t + dt / 1.6); const e = fly.t * fly.t * (3 - 2 * fly.t);
      camera.position.lerpVectors(fly.p0, fly.p1, e); controls.target.lerpVectors(fly.t0, fly.t1, e);
      if (fly.t >= 1) { fly = null; dirtyFocus = true; }
    }
    if (phase === 'run' || (phase === 'focus' && region)) {
      if (dirtyRegion && region) { updateRegion(); dirtyRegion = false; }
      const key = camera.position.toArray().map((v) => Math.round(v / 4)).join(',');
      if (focus && phase === 'run' && key !== camKey && t - lastDetail > 300 && !fly) { camKey = key; lastDetail = t; chooseDetail(); dirtyFocus = true; }
      if (dirtyFocus && focus && phase === 'run') { updateFocus(); dirtyFocus = false; }
    }
    if (chartDirty && t - lastChart > 300) { drawChart(); lastChart = t; chartDirty = false; }
    if (t - (frame.ls || 0) > 250) { drawStatus(); frame.ls = t; }
    controls.update();
    renderer.render(scene, camera);
    frameMs = 0.9 * frameMs + 0.1 * (performance.now() - f0);
  }

  function setPlaying(v) { playing = v; playBtn.textContent = v ? 'Pause' : 'Play'; }
  function setPalette(p) {
    palette = p; palBtn.textContent = p === 'drawing' ? 'Natural colour' : 'Drawing';
    if (ground) ground.setPalette(p); if (plotGround) plotGround.setPalette(p);
    renderer.setClearColor(ground && ground.background ? ground.background() : (p === 'natural' ? 0xcfd9e2 : 0xffffff), 1);
    applyBBPalette();
    dirtyRegion = true; dirtyFocus = true;
  }
  playBtn.addEventListener('click', () => setPlaying(!playing));
  palBtn.addEventListener('click', () => setPalette(palette === 'drawing' ? 'natural' : 'drawing'));
  levelBtn.addEventListener('click', () => { if (level === 'focus') flyTo('region'); });
  resetBtn.addEventListener('click', () => api.reset());
  terrBtn.addEventListener('click', () => { terrainSeed = (Math.imul(terrainSeed, 1664525) + 1013904223) >>> 0; terrainSeed %= 100000; focusAt = null; restart(); });
  rough.input.addEventListener('change', () => { focusAt = null; restart(); });
  const climate = () => { if (!region) return; const dT = +temp.input.value - (terrain.climate.T0 ?? 13), Pm = +prec.input.value / (terrain.climate.P0 ?? 900); region.climate(dT, Pm); if (focus) focus.setClimate(dT, Pm); };
  temp.input.addEventListener('input', climate); prec.input.addEventListener('input', climate);
  toggles.forEach((cb, i) => cb.addEventListener('change', () => { if (focus) focus.enabled[i] = cb.checked; }));
  mq.addEventListener('change', () => { setAspect(); resize(); });
  function restart() { if (!renderer) return; level = 'region'; levelBtn.disabled = true; focus = null; gen = loader(); }

  const api = {
    start() {
      if (running) return;
      running = true;
      if (!renderer) { timing.start = performance.now(); init(); gen = loader(); }
      ro.observe(view); resize();
      last = performance.now();
      raf = requestAnimationFrame(frame);
    },
    stop() { if (!running) return; running = false; cancelAnimationFrame(raf); raf = 0; ro.disconnect(); },
    reset() {
      if (!renderer || !refs) return;
      gen = (async function* () { region = new RegionSim(terrain, { seed }); for (let y = 0; y < 150; y++) { region.step(); if (y % 10 === 0) yield; } yield* placeFocus(focusAt.x, focusAt.y, false); })();
    },
  };
  Object.defineProperty(api, 'debug', {
    enumerable: false,
    value: {
      async ready() { if (!renderer) { timing.start = performance.now(); init(); resize(); gen = loader(); } while (gen) { const r = await gen.next(); if (r.done) gen = null; } dirtyRegion = dirtyFocus = true; renderOnce(); return true; },
      async focusAt(fx, fy) { await this.ready(); gen = (async function* () { yield* placeFocus(fx * terrain.size_m, fy * terrain.size_m, false); })(); while (gen) { const r = await gen.next(); if (r.done) gen = null; } level = 'focus'; levelBtn.disabled = false; frameFocus(true); setShadowFrame(); chooseDetail(); dirtyFocus = true; renderOnce(); return this.counts(); },
      async advance(years) { await this.ready(); for (let i = 0; i < years; i++) { const r0 = performance.now(); region.step(); regionMs = 0.9 * regionMs + 0.1 * (performance.now() - r0); focus.step(); } dirtyRegion = dirtyFocus = true; chooseDetail(); renderOnce(); return this.counts(); },
      view(which) { if (which === 'region') { level = 'region'; frameRegion(true); } else { level = 'focus'; frameFocus(true); } levelBtn.disabled = level === 'region'; setShadowFrame(); chooseDetail(); dirtyFocus = true; renderOnce(); },
      orbit(az, elv, distK = 1) { const tg = controls.target, d = camera.position.distanceTo(tg) * distK; camera.position.set(tg.x + d * Math.cos(elv) * Math.cos(az), tg.y + d * Math.sin(elv), tg.z + d * Math.cos(elv) * Math.sin(az)); camera.lookAt(tg); controls.update(); chooseDetail(); dirtyFocus = true; renderOnce(); },
      setPalette(p) { setPalette(p); renderOnce(); },
      setClimate(T0, P) { temp.input.value = T0; temp.upd(); if (P) { prec.input.value = P; prec.upd(); } climate(); },
      counts() {
        if (!focus) return { phase };
        const st = focus.stats;
        return { phase, year: focus.year, plants: focus.plants.length, species: Object.fromEntries(focus.species.map((sp, i) => [sp.key, st.count[i]]).filter((a) => a[1])), snags: st.snags, logs: st.logs, cls: st.cls, pits: st.pits,
          humus: +st.humus_kg_m2.toFixed(2), deaths: st.deaths, nurse: focus.nurseCount || 0, focusMs: +focus.msStep.toFixed(2), regionMs: +regionMs.toFixed(2), frameMs: +frameMs.toFixed(2), treeline: treeline(),
          region: { cover: Object.fromEntries(PFT.map((f, k) => [f.key, +region.stats.cover[k].toFixed(3)])), D: +region.stats.D.toFixed(1), Hu: +region.stats.Hu.toFixed(1) }, terrain: mods && mods.real ? 'landscape-terrain.js' : 'stand-in', timing: Object.fromEntries(Object.entries(timing).map(([k, v]) => [k, Math.round(v)])),
          instances: { plotBillboards: plotBB ? plotBB.mesh.geometry.instanceCount : 0, snagParts: snagMesh.count, logs: logMesh.count, mounds: moundMesh.count, plates: plateMesh.count, pitRings: pitRing.count, grass: gcMesh.grass.count, fern: gcMesh.fern.count, herb: gcMesh.herb.count, farImpostors: counts.far, nearImpostors: counts.near, rocks: plot && plot.rocks ? plot.rocks.length / 8 : 0, detail: detailIds.size, dead: deadIds.size } };
      },
      timing(n = 20) { const gl = renderer.getContext(), px = new Uint8Array(4); for (let i = 0; i < 20; i++) { renderer.render(scene, camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } let t0 = performance.now(); for (let i = 0; i < n; i++) { controls.update(); renderer.render(scene, camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } const fr = (performance.now() - t0) / n; t0 = performance.now(); for (let i = 0; i < n; i++) updateFocus(); const up = (performance.now() - t0) / n; t0 = performance.now(); for (let i = 0; i < n; i++) renderer.shadowMap.needsUpdate = true, renderer.render(scene, camera), gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return { frameMs: +fr.toFixed(2), updateFocusMs: +up.toFixed(2), frameWithShadowMs: +((performance.now() - t0) / n).toFixed(2) }; },
      contexts() { return renderer ? 1 : 0; },
      get terrain() { return terrain; },
      moveTo(fx, fy) { level = "region"; gen = (async function* () { yield* placeFocus(fx * terrain.size_m, fy * terrain.size_m, true); })(); },
      hide(name) { const m = { grass: gcMesh.grass, fern: gcMesh.fern, herb: gcMesh.herb, ground: ground && ground.group, plotGround: plotGround && plotGround.group, snags: snagMesh, plot: plotBB && plotBB.mesh, logs: logMesh, plates: plateMesh, mounds: moundMesh, detail: detail.branch, dead: deadDetail.branch, deadLeaf: deadDetail.leaf, outline, far: farBB && farBB.mesh, near: nearBB && nearBB.mesh }[name]; if (m) m.visible = false; renderOnce(); },
      bbInfo() { const g = farBB.mesh.geometry; const p = g.getAttribute('iPos').array, z = g.getAttribute('iSize').array; return { n: g.instanceCount, p0: Array.from(p.slice(0, 6)), s0: Array.from(z.slice(0, 4)), tiles: atlas.tiles, cam: camera.position.toArray().map(Math.round), visible: farBB.mesh.visible, minpx: farBB.mesh.material.uniforms.uMinPx.value, vh: farBB.mesh.material.uniforms.uViewH.value }; },
      inspect() {
        const out = []; const b = new THREE.Box3();
        plotGround.group.children.forEach((o) => { b.setFromObject(o); out.push([o.type, o.name, o.position.toArray().map(Math.round).join(','), b.min.toArray().map(Math.round).join(','), b.max.toArray().map(Math.round).join(',')].join(' ')); });
        const n = plot.n, mesh = plotGround.group.children.find((o) => o.isMesh); let dmax = 0;
        if (mesh) { const P = mesh.geometry.attributes.position; for (let k = 0; k < Math.min(P.count, n * n); k += 997) dmax = Math.max(dmax, Math.abs(P.getY(k) - plot.height[k])); }
        return { children: out, origin: plotGround.group.userData.origin, groupPos: plotGround.group.position.toArray(), meshVsHeight: dmax, focusAt };
      },
      get running() { return running; }, get rafId() { return raf; }, setPlaying,
    },
  });
  function renderOnce() { if (!renderer) return; if (outline) outline.visible = level === 'region'; if (region && dirtyRegion) { updateRegion(); dirtyRegion = false; } if (focus && dirtyFocus && phase === 'run') { updateFocus(); dirtyFocus = false; } drawChart(); drawStatus(); controls.update(); renderer.render(scene, camera); }
  drawStatus();
  return api;
}
