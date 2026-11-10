// Chapter 2's figures: one per method of the lineage, all built the same way so they can be read in a row.
// Same seed, same wall, same camera, same ink look, same instrument underneath (skeleton.js measure()).
// One WebGL context for the whole page (a hidden canvas); each figure renders into it and copies the frame into its
// own 2-D canvas, so five figures cost one context.
//
//   createLineage(el)  el is a <figure class="lineage" data-method="lsystem|colonise|selforg|modules|ecosystem">
//   returns { start(), stop(), advance(n), state() }   advance() is for a test rig in a hidden pane
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { makeBranchMesh, makeLeafMesh, LEAF_ROT, fitDistance, boxPoints, guardWheel, PlantMeshes, INK } from '../fractals/silviculture-draw.js';
import { SPECIES, PLOT } from '../fractals/silviculture-core.js?v=3';
import { WALL, inWall, measure } from './skeleton.js?v=3';
import { createLSystem } from './lsystem.js?v=3';
import { createColonise } from './colonise.js?v=3';
import { createSelfOrg } from './selforg.js?v=3';
import { createModules, createEcosystem } from './modules.js?v=3';
import { createRoots, SOILS } from './roots.js?v=1';
import { createLearned, tokenText } from './learned.js?v=1';

const HOT = 0xe0703a; // a branch inside the wall: the rule the method lacks, made visible
const HOTC = new THREE.Color(HOT), LEAF = new THREE.Color(SPECIES[1].leafHex), LEAF2 = new THREE.Color(SPECIES[0].leafHex);

// ---------------------------------------------------------------- the one renderer
let R = null;
function renderer() {
  if (R) return R;
  R = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, canvas: document.createElement('canvas') });
  R.setClearColor(0xffffff, 1);
  return R;
}

// ---------------------------------------------------------------- the methods, their controls and their camera
const METHODS = {
  lsystem: {
    make: createLSystem, every: 450, label: (g) => `step ${g.t} of 12 · ${g.symbols().toLocaleString('en')} symbols`,
    params: [
      ['Branch angle', 15, 75, 1, 45, (v) => `${v}°`, (v) => ({ a0: v, a2: v })],
      ['Divergence', 60, 180, 0.5, 137.5, (v) => `${v}°`, (v) => ({ d: v })],
      ['Side shoot', 0.4, 0.8, 0.01, 0.6, (v) => `× ${v.toFixed(2)}`, (v) => ({ r2: v })],
    ],
    playTo: 10,
  },
  colonise: {
    make: createColonise, every: 0, label: (g) => `iteration ${g.t}${g.done ? ' · no point left in reach' : ''}`,
    params: [
      ['Points', 500, 4000, 100, 2000, (v) => `${v}`, (v) => ({ N: v })],
      ['Reach d<sub>i</sub>', 3, 12, 0.5, 6, (v) => `${v} D`, (v) => ({ di: v })],
      ['Kill d<sub>k</sub>', 1, 4, 0.25, 2, (v) => `${v} D`, (v) => ({ dk: v })],
    ],
    points: true, sliderMax: 120,
  },
  selforg: {
    make: createSelfOrg, every: 380, label: (g) => `year ${g.t} of 15`,
    params: [
      ['Apical control λ', 0.44, 0.62, 0.005, 0.52, (v) => v.toFixed(3), (v) => ({ lambda: v })],
      ['Light C', 1, 3, 0.05, 2, (v) => v.toFixed(2), (v) => ({ C: v })],
      ['Shedding', 0, 0.4, 0.01, 0.15, (v) => v.toFixed(2), (v) => ({ shed: v })],
      ['Toward light ξ', 0, 0.8, 0.01, 0.25, (v) => v.toFixed(2), (v) => ({ xi: v })],
    ],
    shade: true,
  },
  modules: {
    make: createModules, every: 0, label: (g) => `year ${g.t} of 120 · ${g.sim.plants[0] ? g.sim.plants[0].mods.length : 0} modules`,
    params: [['Species', 0, 1, 1, 1, (v) => (v ? 'tolerant, row i' : 'pioneer, row n'), (v) => ({ species: v })]],
    shade: true, sim: true,
  },
  ecosystem: {
    make: createEcosystem, every: 0, label: (g) => { const s = g.stats(); return `year ${g.t} · ${s.tolerant} tolerant, ${s.pioneer} pioneer`; },
    params: [['Tolerant share', 0, 100, 5, 30, (v) => `${v} %`, (v) => ({ mix: v / 100 })]],
    plot: true,
  },
  roots: {
    make: createRoots, every: 0, label: (g) => `iteration ${g.t}${g.done ? ' · grown' : ''}${g.tilt ? ' · uprooted' : ''}`,
    params: [['Soil', 0, 2, 1, 1, (v) => SOILS[['sand', 'rock', 'clay'][v]].label, (v) => ({ soil: ['sand', 'rock', 'clay'][v] })]],
    points: true, noWall: true, below: 4.4, sliderMax: 60, storm: true, wide: true,
    metrics: (g, f2) => { const s = g.stats(); return [['Rooting depth', `${f2(s.depth, 2)} m`], ['Plate radius', `${f2(s.plateR, 2)} m`], ['Plate depth', `${f2(s.plateD, 2)} m`],
      ['Pit', `${f2(s.pit, 1)} m³`], ['Root length', `${s.rootLen.toFixed(0)} m`], ['Shoot length', `${s.shootLen.toFixed(0)} m`]]; },
  },
  learned: {
    make: createLearned, every: 30, label: (g) => `token ${g.t.toLocaleString('en')} of ${g.tokens().seq.length.toLocaleString('en')} · ${g.model().contexts.toLocaleString('en')} contexts counted`,
    params: [
      ['Order n', 1, 10, 1, 6, (v) => `${v}`, (v) => ({ order: v })],
      ['Teachers', 1, 20, 1, 8, (v) => `${v} trees`, (v) => ({ trees: v })],
      ['Show', 0, 1, 1, 0, (v) => (v ? 'a teacher' : 'a sample'), (v) => ({ show: v ? 'training' : 'sample' })],
    ],
    tokens: true, tmax: (g) => g.tokens().seq.length,
  },
};

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

export function createLineage(fig) {
  const kind = fig.dataset.method, M = METHODS[kind];
  const view = fig.querySelector('.lin-view'), cap = fig.querySelector('figcaption');
  const canvas = el('canvas'); canvas.setAttribute('aria-label', `${kind} figure: drag to orbit`); view.append(canvas);
  const ctx2d = canvas.getContext('2d');

  // ---- controls
  const bar = el('div', 'controls lin-controls');
  const play = el('button', null, 'Pause'); play.type = 'button';
  const time = el('input'); Object.assign(time, { type: 'range', min: 0, step: 1, value: 0 }); time.setAttribute('aria-label', 'Time');
  const tlab = el('label', 'lin-time'); tlab.append(time);
  const wallCb = el('input'); wallCb.type = 'checkbox'; wallCb.checked = true;
  const wlab = el('label', null, ''); wlab.append(wallCb, document.createTextNode(' Wall'));
  const seedB = el('button', null, 'New seed'); seedB.type = 'button';
  const extra = [];
  const opts = {};
  for (const [name, mn, mx, st, val, fmt, map] of M.params) {
    const inp = el('input'); Object.assign(inp, { type: 'range', min: mn, max: mx, step: st, value: val });
    const out = el('span', 'value', fmt(val)), lab = el('label', null, name + ' ');
    lab.append(inp, out); extra.push(lab);
    Object.assign(opts, map(val));
    inp.addEventListener('input', () => { out.textContent = fmt(+inp.value); Object.assign(opts, map(+inp.value)); restart(true); });
  }
  let shadeCb = null;
  if (M.shade) { shadeCb = el('input'); shadeCb.type = 'checkbox'; const l = el('label'); l.append(shadeCb, document.createTextNode(' Shade')); extra.push(l); shadeCb.addEventListener('change', () => { dirty = true; }); }
  if (M.noWall) { wallCb.checked = false; wlab.hidden = true; }
  let stormB = null, storm = null;
  if (M.storm) { stormB = el('button', null, 'Storm'); stormB.type = 'button'; extra.push(stormB); stormB.addEventListener('click', () => { if (!g.done) while (g.step()); setPlaying(false); storm = { t0: performance.now() }; }); }
  bar.append(play, tlab, wlab, seedB);
  const bar2 = el('div', 'controls lin-controls'); bar2.append(...extra);
  const status = el('p', 'status');
  const strip = el('dl', 'lin-metrics');
  const tokensEl = M.tokens ? el('p', 'lin-tokens') : null;
  fig.insertBefore(bar, cap); fig.insertBefore(bar2, cap); fig.insertBefore(status, cap); if (tokensEl) fig.insertBefore(tokensEl, cap); fig.insertBefore(strip, cap);

  // ---- scene
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xdfe3dc, 2.0));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2); sun.position.set(-6, 20, 8); scene.add(sun);
  const groundR = M.plot ? PLOT / 2 : 9;
  const ground = M.plot ? new THREE.Mesh(new THREE.PlaneGeometry(PLOT, PLOT), new THREE.MeshLambertMaterial({ color: 0xf2f3ef }))
    : new THREE.Mesh(new THREE.CircleGeometry(groundR, 64), new THREE.MeshLambertMaterial({ color: 0xf2f3ef }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);
  if (M.below) { ground.material.transparent = true; ground.material.opacity = 0.35; ground.material.depthWrite = false; ground.renderOrder = 4; }
  const wallG = new THREE.BoxGeometry(WALL.x1 - WALL.x0, WALL.y1 - WALL.y0, WALL.z1 - WALL.z0);
  const wall = new THREE.Group();
  wall.add(new THREE.Mesh(wallG, new THREE.MeshLambertMaterial({ color: 0xd9dcd6, transparent: true, opacity: 0.45, depthWrite: false })));
  wall.add(new THREE.LineSegments(new THREE.EdgesGeometry(wallG), new THREE.LineBasicMaterial({ color: 0x9aa0a6 })));
  wall.position.set((WALL.x0 + WALL.x1) / 2, (WALL.y0 + WALL.y1) / 2, (WALL.z0 + WALL.z1) / 2);
  wall.renderOrder = 2; scene.add(wall);
  let branch = makeBranchMesh(4096), hot = makeBranchMesh(1024, HOT), leaf = makeLeafMesh(8192);
  const hotTop = (h) => { h.material.depthTest = false; h.renderOrder = 3; return h; }; // seen through the wall
  hotTop(hot);
  scene.add(branch, hot, leaf);
  let plants = M.plot || M.sim ? new PlantMeshes(scene, M.plot ? 30000 : 4000) : null;
  // attraction points (space colonisation) and shade samples (self-organising tree, modules)
  const dots = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: 0.09, color: 0x74797f, transparent: true, opacity: 0.7 }));
  const shadeDots = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: 0.22, vertexColors: true, transparent: true, opacity: 0.45, depthWrite: false }));
  scene.add(dots, shadeDots);

  const camera = new THREE.PerspectiveCamera(32, 16 / 10, 0.1, 500);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.1; controls.maxPolarAngle = Math.PI * 0.495; controls.minDistance = 3; controls.maxDistance = 140;
  guardWheel(view);
  let userCam = false;
  controls.addEventListener('start', () => { userCam = true; });
  controls.addEventListener('change', () => { dirty = true; });
  const DIR = new THREE.Vector3(-0.72, 0.36, 0.6).normalize(); // looking past the tree at the wall's face
  function frame() {
    if (userCam) return;
    let top = 15; // frame the tree as it grows: at least 15 m (the wall and a grown tree), more if it is taller
    if (M.plot || M.sim) { for (const p of g.sim.plants) top = Math.max(top, p.height + 1); }
    else if (m) top = Math.max(top, m.height + 0.5);
    const y0 = M.below ? -M.below : 0;
    const pts = M.plot ? boxPoints(-PLOT / 2, PLOT / 2, 0, top, -PLOT / 2, PLOT / 2) : M.wide ? boxPoints(-6, 6, y0, top, -6, 6) : boxPoints(-5, WALL.x1, 0, top, -4.5, 4.5);
    const target = new THREE.Vector3(M.plot || M.wide ? 0 : -1.2, M.plot ? top * 0.3 : y0 + (top - y0) * 0.49, 0);
    const d = fitDistance(camera, target, DIR, pts, 0.96);
    camera.position.copy(target).addScaledVector(DIR, d); controls.target.copy(target); camera.lookAt(target);
  }

  // ---- the method
  let g = M.make(), seed = 1, playing = true, running = false, raf = 0, last = 0, dirty = true, m = null, lastBox = 0, stepMs = 0;
  time.max = M.sliderMax || M.playTo || g.max;
  function restart(keepT) {
    const target = keepT ? g.t : 0;
    g = M.make(); g.reset(seed, { ...opts, wall: wallCb.checked });
    wall.visible = wallCb.checked;
    if (M.tmax) time.max = M.tmax(g);
    while (g.t < target && g.step());
    after(true);
  }
  function after(full) {
    if (!M.plot) {
      const S = g.skeleton();
      m = measure(S, { box: full || performance.now() - lastBox > 600 });
      if (Number.isFinite(m.box)) lastBox = performance.now(); else if (prevBox != null) m.box = prevBox;
      prevBox = m.box;
    }
    time.value = g.t; dirty = true; write(); report(); frame();
  }
  let prevBox = null;

  function write() {
    if (M.plot || M.sim) {
      plants.write(g.sim.plants, (p) => (p.sp.key === 'pioneer' ? LEAF2 : LEAF), (p) => p.sp.leafSize);
      writeShade();
      return;
    }
    const S = g.skeleton(), n = S.n;
    if (n > branch.instanceMatrix.count) { scene.remove(branch); branch = makeBranchMesh(Math.ceil(n * 1.5)); scene.add(branch); }
    if (n > hot.instanceMatrix.count) { scene.remove(hot); hot = hotTop(makeBranchMesh(Math.ceil(n * 1.5), HOT)); scene.add(hot); }
    let nl = 0; for (let i = 0; i < n; i++) if (S.leaf[i] > 0) nl += 3;
    if (nl > leaf.instanceMatrix.count) { scene.remove(leaf); leaf = makeLeafMesh(Math.ceil(nl * 1.5)); scene.add(leaf); }
    const B = branch.instanceMatrix.array, H = hot.instanceMatrix.array, Lm = leaf.instanceMatrix.array, LC = leaf.instanceColor.array;
    let b = 0, h = 0, l = 0;
    const ls = kind === 'modules' ? 0.75 : 0.42;
    for (let i = 0; i < n; i++) {
      const p = S.par[i];
      if (p >= 0) {
        const ax = S.x[p], ay = S.y[p], az = S.z[p], dx = S.x[i] - ax, dy = S.y[i] - ay, dz = S.z[i] - az, dl = Math.hypot(dx, dy, dz);
        if (dl > 1e-4) {
          const ux = dx / dl, uy = dy / dl, uz = dz / dl;
          let rx = 0, ry = 1, rz = 0; if (Math.abs(uy) > 0.9) { rx = 1; ry = 0; }
          let e1x = uy * rz - uz * ry, e1y = uz * rx - ux * rz, e1z = ux * ry - uy * rx; const el1 = Math.hypot(e1x, e1y, e1z); e1x /= el1; e1y /= el1; e1z /= el1;
          const e2x = uy * e1z - uz * e1y, e2y = uz * e1x - ux * e1z, e2z = ux * e1y - uy * e1x;
          const isHot = wallCb.checked && inWall((S.x[i] + ax) / 2, (S.y[i] + ay) / 2, (S.z[i] + az) / 2);
          const r = Math.max(isHot ? 0.03 : 0.008, S.d[i] * 0.5), ext = (dl + r) / dl; // in-wall twigs drawn thicker
          const A = isHot ? H : B, o = (isHot ? h++ : b++) * 16;
          A[o] = e1x * r; A[o + 1] = e1y * r; A[o + 2] = e1z * r; A[o + 3] = 0;
          A[o + 4] = dx * ext; A[o + 5] = dy * ext; A[o + 6] = dz * ext; A[o + 7] = 0;
          A[o + 8] = e2x * r; A[o + 9] = e2y * r; A[o + 10] = e2z * r; A[o + 11] = 0;
          A[o + 12] = ax - ux * r * 0.5; A[o + 13] = ay - uy * r * 0.5; A[o + 14] = az - uz * r * 0.5; A[o + 15] = 1;
        }
      }
      if (S.leaf[i] > 0) {
        const lc = wallCb.checked && inWall(S.x[i], S.y[i], S.z[i]) ? HOTC : LEAF;
        for (let q = 0; q < 3; q++) {
          const hh = ((i * 2654435761 + q * 9973) >>> 0) & 255, Rr = hh * 9, s = ls * S.leaf[i] * (0.85 + 0.3 * (((hh * 37) & 63) / 63)), o = l * 16;
          Lm[o] = LEAF_ROT[Rr] * s; Lm[o + 1] = LEAF_ROT[Rr + 1] * s; Lm[o + 2] = LEAF_ROT[Rr + 2] * s; Lm[o + 3] = 0;
          Lm[o + 4] = LEAF_ROT[Rr + 3] * s; Lm[o + 5] = LEAF_ROT[Rr + 4] * s; Lm[o + 6] = LEAF_ROT[Rr + 5] * s; Lm[o + 7] = 0;
          Lm[o + 8] = LEAF_ROT[Rr + 6] * s; Lm[o + 9] = LEAF_ROT[Rr + 7] * s; Lm[o + 10] = LEAF_ROT[Rr + 8] * s; Lm[o + 11] = 0;
          Lm[o + 12] = S.x[i]; Lm[o + 13] = S.y[i]; Lm[o + 14] = S.z[i]; Lm[o + 15] = 1;
          const c = 0.9 + 0.2 * (((hh * 13) & 31) / 31), o3 = l * 3;
          LC[o3] = lc.r * c; LC[o3 + 1] = lc.g * c; LC[o3 + 2] = lc.b * c;
          l++;
        }
      }
    }
    branch.count = b; hot.count = h; leaf.count = l;
    branch.instanceMatrix.needsUpdate = hot.instanceMatrix.needsUpdate = leaf.instanceMatrix.needsUpdate = leaf.instanceColor.needsUpdate = true;
    if (M.points) {
      const { pts, alive } = g.points(), arr = [];
      for (let a = 0; a < alive.length; a++) if (alive[a]) arr.push(pts[a * 3], pts[a * 3 + 1], pts[a * 3 + 2]);
      dots.geometry.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); dots.geometry.computeBoundingSphere();
    }
    writeShade();
  }
  // shade as dots: voxels in the tree's shadow (self-organising tree: s > a; modules: light below 50 %)
  function writeShade() {
    shadeDots.visible = !!(shadeCb && shadeCb.checked);
    if (!shadeDots.visible) return;
    const pos = [], col = [], c = new THREE.Color(0x2d6fd2);
    if (kind === 'selforg') {
      const { s, GX, GY, GZ, VOX, OX, OZ } = g.shadow();
      for (let i = 0; i < GX; i += 2) for (let j = 0; j < GY; j += 2) for (let k = 0; k < GZ; k += 2) {
        const v = s[(i * GY + j) * GZ + k]; if (v < 0.6 || v > 500) continue;
        pos.push(OX + (i + 0.5) * VOX, (j + 0.5) * VOX, OZ + (k + 0.5) * VOX); const t = Math.min(1, v / 3); col.push(c.r, c.g, c.b * (0.6 + 0.4 * t));
      }
    } else {
      const sim = g.sim, NX = PLOT, NY = sim.dep.length / (NX * NX);
      for (let ix = 0; ix < NX; ix++) for (let iz = 0; iz < NX; iz++) for (let y = 0; y < NY; y++) {
        const q = Math.exp(-sim.qg[(ix * NX + iz) * NY + y]); if (q > 0.5) continue;
        const x = ix - NX / 2 + 0.5, z = iz - NX / 2 + 0.5;
        if (!M.plot && (Math.abs(x) > 9 || Math.abs(z) > 9)) continue;
        if (wallCb.checked && inWall(x, y + 0.5, z)) continue;
        pos.push(x, y + 0.5, z); col.push(c.r, c.g, c.b);
      }
    }
    shadeDots.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    shadeDots.geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    shadeDots.geometry.computeBoundingSphere();
  }

  const f2 = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '–');
  function report() {
    status.textContent = `${M.label(g)} · ${stepMs.toFixed(1)} ms per ${g.unit}`;
    let rows;
    if (M.metrics) rows = M.metrics(g, f2);
    else if (M.plot) {
      const s = g.stats();
      rows = [['Plants', s.tolerant + s.pioneer], ['Tallest', `${f2(s.height, 1)} m`], ['Mean height ≤ 6 m from wall', `${f2(s.nearH, 1)} m`], ['Further away', `${f2(s.farH, 1)} m`]];
    } else {
      rows = [['Segments', m.segments.toLocaleString('en')], ['Height', `${f2(m.height, 1)} m`], ['Horton R<sub>n</sub>', f2(m.Rn)], ['Box dimension', f2(m.box)],
        ['Crown lean', `${f2(m.lean)} m`], ['In the wall', m.inWall]];
    }
    if (M.learned || M.tokens) rows.push(['Tokens', g.t.toLocaleString('en')]);
    strip.innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    if (tokensEl) {
      const { seq, k } = g.tokens(), a = Math.max(0, k - 40);
      tokensEl.innerHTML = seq.slice(a, k).map((t, i) => (a + i === k - 1 ? `<b>${tokenText(t)}</b>` : tokenText(t))).join(' ') || '&nbsp;';
    }
  }

  // ---- loop
  function render() {
    const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight), dpr = Math.min(2, devicePixelRatio || 1);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); camera.aspect = w / h; camera.updateProjectionMatrix(); frame(); }
    const r = renderer();
    r.setPixelRatio(dpr); r.setSize(w, h, false);
    r.render(scene, camera);
    ctx2d.drawImage(r.domElement, 0, 0, canvas.width, canvas.height);
    dirty = false;
  }
  function tick(now) {
    if (!running) return;
    raf = requestAnimationFrame(tick);
    controls.update();
    if (storm) { const t = Math.min(1, (performance.now() - storm.t0) / 1600), e = t * t * (3 - 2 * t); g.storm(e); after(t >= 1); if (t >= 1) storm = null; }
    else if (playing && now - last >= M.every) {
      last = now;
      const a = performance.now();
      const grew = (M.playTo && g.t >= M.playTo) ? false : g.step();
      stepMs = 0.8 * stepMs + 0.2 * (performance.now() - a);
      if (grew) after(false); else { setPlaying(false); after(true); }
    }
    if (dirty) render();
  }
  function setPlaying(v) { playing = v; play.textContent = v ? 'Pause' : 'Play'; }
  play.addEventListener('click', () => { if (!playing && (g.t >= (M.playTo || g.max) || g.done)) restart(false); setPlaying(!playing); });
  time.addEventListener('input', () => {
    const t = +time.value; setPlaying(false);
    if (t < g.t) { g = M.make(); g.reset(seed, { ...opts, wall: wallCb.checked }); }
    while (g.t < t && g.step());
    after(true);
  });
  wallCb.addEventListener('change', () => restart(true));
  seedB.addEventListener('click', () => { seed++; restart(false); setPlaying(true); });
  addEventListener('resize', () => { dirty = true; });

  restart(false);
  frame();
  return {
    start() { if (running) return; running = true; raf = requestAnimationFrame(tick); },
    stop() { running = false; cancelAnimationFrame(raf); },
    advance(n) { for (let i = 0; i < n && g.step(); i++); after(true); render(); },
    storm(t = 1) { if (g.storm) { g.storm(t); after(true); render(); } },
    state: () => ({ t: g.t, m, kind }),
  };
}
