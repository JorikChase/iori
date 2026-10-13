/*
 * silviculture-specimens.js — "plant windows": one plant per growth form, grown alone in open light from seed by the
 * module model of silviculture-core.js, each in a window cut to the shape of its plant. The plants loop: when a
 * plant reaches the end of its run it regrows from seed (the same seed each time, so Reset replays exactly).
 *
 * Forms are Table 4 rows of Makowski et al. 2019 with Table 3 plasticity sets (shade tolerance only matters for
 * self-shading here). Chosen here, not in the paper: which rows stand for which plain-word form, the run length
 * (0.9·p_max, at most 160 years), the window aspect per form, module lengths, leaf tints and the turntable speed.
 *
 * Rendering: ONE WebGL renderer on a detached canvas. Each visible window's scene is rendered into the lower-left
 * corner of it and copied with drawImage into the window's own 2-D canvas. Windows off screen are neither stepped
 * nor rendered; rendering stops for the frame once ~4 ms are spent and resumes with the next window next frame.
 */
import * as THREE from 'three';
import { Sim } from './silviculture-core.js';
import { PlantMeshes, fitDistance, el, slider, BARK } from './silviculture-draw.js';
import { PLANT, speciesOf } from './silviculture-plants.js';

// One window per catalogue form (silviculture-plants.js): aspect of the window (w/h) and the final height and crown
// radius at the end of the run (measured once with this model at the given seed; frames the window before the
// plant has grown). Open-grown specimens get v̄_rootmax × OPEN_CAP (ours): the forest's calibration (CAP_SCALE
// in the core) is for trees that compete; alone in open light a capped tree sheds its lower crown.
const OPEN_CAP = 3;
const FORMS = [
  { key: 'fir', aspect: 3 / 5, seed: 5, ext: { h: 31, r: 3 } },
  { key: 'spruce', aspect: 3 / 5, seed: 5, ext: { h: 27, r: 3 } },
  { key: 'pine', aspect: 3 / 5, seed: 3, ext: { h: 27.7, r: 3.3 } },
  { key: 'elm', aspect: 16 / 9, seed: 3, ext: { h: 12.8, r: 12.3 } },
  { key: 'poplar', aspect: 3 / 5, seed: 7, ext: { h: 32.1, r: 4.1 } },
  { key: 'willow', aspect: 16 / 9, seed: 3, ext: { h: 9.5, r: 11 } },
  { key: 'beech', aspect: 1, seed: 5, ext: { h: 18.8, r: 8.9 } },
  { key: 'birch', aspect: 16 / 9, seed: 3, ext: { h: 6.8, r: 8.5 } },
  { key: 'candelabra', aspect: 4 / 3, seed: 3, ext: { h: 14.2, r: 8.2 } },
  { key: 'palm', aspect: 3 / 4, seed: 3, ext: { h: 15.2, r: 3.5 } },
  { key: 'hazel', aspect: 16 / 9, seed: 7, ext: { h: 6.1, r: 4.5 } },
].map((f) => ({ ...f, def: PLANT[f.key] }));
const ARCH_NAME = { makowski: 'paper modules', massart: 'Massart', roux: 'Roux', rauh: 'Rauh', troll: 'Troll', attims: 'Attims', leeuwenberg: 'Leeuwenberg', corner: 'Corner', collar: 'multi-stem' };
const CYCLE_S = 24;     // seconds of growth per cycle at speed 1
const HOLD_S = 3;       // seconds the grown plant is shown before it regrows
const TURN = 0.14;      // turntable, rad/s
const RENDER_BUDGET = 4; // ms of rendering per frame

export function createSpecimens(root, opts = {}) {
  const FORMS_USED = opts.forms || FORMS; // opts.forms: test-harness override
  const grid = el('div', 'specimens');
  Object.assign(grid.style, { display: 'flex', flexWrap: 'wrap', gap: '12px 10px', alignItems: 'flex-start', justifyContent: 'center', width: '100%' });
  const row = el('div', 'controls');
  const playBtn = el('button', null, 'Pause'), resetBtn = el('button', null, 'Regrow all'), palBtn = el('button', null, 'Natural colour');
  playBtn.type = resetBtn.type = palBtn.type = 'button';
  let palette = 'drawing';
  const speed = slider('Speed', 0.5, 4, 0.5, 1, (v) => `×${v}`);
  row.append(playBtn, resetBtn, palBtn, speed.lab);
  const status = el('p', 'status');
  root.append(grid, row, status);

  const BASE_H = 200;
  const wins = FORMS_USED.map((f, i) => {
    if (!f.def) f.def = PLANT[f.key];
    const d = f.def, sp = speciesOf(d, f.extra || {});
    sp.vRootMax *= OPEN_CAP;
    const end = Math.min(Math.round(sp.pmax * 0.9), 160);
    const item = el('div');
    Object.assign(item.style, { flex: `${f.aspect} 1 ${Math.round(f.aspect * BASE_H)}px`, minWidth: '0', maxWidth: `${Math.round(f.aspect * BASE_H * 1.6)}px` });
    f.name = d.name; f.row = d.row;
    const cv = el('canvas');
    cv.style.width = '100%'; cv.style.aspectRatio = `${f.aspect}`;
    cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', `${d.name}, ${d.arch} architecture, Table 4 row ${d.row}, grown alone from seed`);
    const lab1 = el('p', 'status'), lab2 = el('p', 'status');
    lab1.style.margin = '0.35rem 0 0'; lab2.style.margin = '0';
    for (const l of [lab1, lab2]) { l.style.fontSize = '0.76rem'; l.style.lineHeight = '1.35'; }
    const b = el('b', null, d.name); lab1.append(b, el('br'), `${ARCH_NAME[d.arch]} · Table 4 ${d.row} · λ ${sp.lam.toFixed(2)} · D ${sp.D.toFixed(2)}`);
    item.append(cv, lab1, lab2);
    grid.append(item);
    return { f, sp, end, item, cv, ctx: cv.getContext('2d'), lab2, seed: f.seed != null ? f.seed : 101 + i * 17, sim: null, visible: false, acc: 0, hold: 0,
      scene: null, camera: null, meshes: null, sun: null, dirty: true, shadowDirty: true, ext: { ...f.ext }, az: 0.6 + i * 0.9, lastLabel: '' };
  });
  const filler = el('div'); filler.style.flex = '1000 1 0px'; filler.style.height = '0';
  grid.append(filler);

  let renderer = null, running = false, raf = 0, last = 0, playing = true, rr = 0, io = null, ro = null;
  let msRender = 0, msStep = 0;

  const newSim = (w) => {
    w.sim = new Sim({ seed: w.seed, mode: 'single', speciesList: [w.sp], single: 0 });
    w.acc = 0; w.hold = 0; w.dirty = true; w.shadowDirty = true;
  };
  wins.forEach(newSim);

  function initWin(w) {
    const s = new THREE.Scene();
    s.add(new THREE.HemisphereLight(0xffffff, 0xdfe3dc, 1.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(14, 30, 8); sun.castShadow = true;
    const sc = sun.shadow.camera; sc.left = sc.bottom = -16; sc.right = sc.top = 16; sc.near = 1; sc.far = 90;
    sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
    s.add(sun, sun.target);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(14, 48), new THREE.MeshLambertMaterial({ color: 0xf2f3ef }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; s.add(ground);
    w.scene = s; w.sun = sun;
    w.camera = new THREE.PerspectiveCamera(30, w.f.aspect, 0.1, 400);
    w.meshes = new PlantMeshes(s, 3000);
    w.ground = ground;
  }

  function init() {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(1);
    renderer.setClearColor(0xffffff, 1);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
    renderer.autoClear = true;
    wins.forEach(initWin);
    io = new IntersectionObserver((es) => { for (const e of es) { const w = wins.find((x) => x.cv === e.target); if (w) w.visible = e.isIntersecting; } }, { threshold: 0 });
    ro = new ResizeObserver(resize);
  }

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let mw = 1, mh = 1;
    for (const w of wins) {
      const cw = Math.max(1, Math.round(w.cv.clientWidth * dpr)), ch = Math.max(1, Math.round(cw / w.f.aspect));
      if (w.cv.width !== cw || w.cv.height !== ch) { w.cv.width = cw; w.cv.height = ch; }
      mw = Math.max(mw, cw); mh = Math.max(mh, ch);
      w.camera.aspect = cw / ch; w.camera.updateProjectionMatrix();
      w.dirty = true;
    }
    const sz = renderer.getSize(new THREE.Vector2());
    if (sz.x < mw || sz.y < mh) renderer.setSize(Math.max(sz.x, mw), Math.max(sz.y, mh), false);
  }

  // the plant's extent, never shrinking within a cycle; the frame covers the plant at every turntable angle
  function frame(w) {
    const p = w.sim.plants[0];
    if (p) {
      let r = 0.5;
      for (const m of p.mods) r = Math.max(r, Math.hypot(m.cx - p.x, m.cz - p.z) + m.r * 0.6);
      w.ext.h = Math.max(w.ext.h, p.height, 1.5); w.ext.r = Math.max(w.ext.r, r);
    }
    const { h, r } = w.ext, pts = [];
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; pts.push(new THREE.Vector3(r * Math.cos(a), 0, r * Math.sin(a)), new THREE.Vector3(r * Math.cos(a), h, r * Math.sin(a))); }
    const target = new THREE.Vector3(0, h * 0.48, 0);
    const dir = new THREE.Vector3(Math.cos(w.az), 0.32, Math.sin(w.az)).normalize();
    fitDistance(w.camera, target, dir, pts, 0.92);
  }

  function step(w, years) {
    const p = w.sim.plants[0];
    if (w.hold > 0 || !p) return;
    const t0 = performance.now();
    for (let i = 0; i < years && w.sim.year < w.end && w.sim.plants.length; i++) w.sim.step();
    msStep += performance.now() - t0;
    w.dirty = true; w.shadowDirty = true;
    if (w.sim.year >= w.end || !w.sim.plants.length) w.hold = HOLD_S;
  }

  function label(w) {
    const p = w.sim.plants[0], t = p ? `${w.sim.year} yr · ${p.height.toFixed(1)} m` : `${w.sim.year} yr · died`;
    if (t !== w.lastLabel) { w.lab2.textContent = t; w.lastLabel = t; }
  }

  function draw(w) {
    if (w.dirty) {
      const col = new THREE.Color(palette === 'natural' ? w.f.def.nat : w.f.def.draw);
      w.meshes.setBark(BARK[palette]); w.ground.material.color.setHex(palette === 'natural' ? 0xe4dcc6 : 0xf2f3ef);
      w.meshes.write(w.sim.plants, () => col, (p) => p.sp.leafSize, null, () => w.f.def.leaf);
      w.dirty = false;
    }
    frame(w);
    const cw = w.cv.width, ch = w.cv.height, H = renderer.domElement.height;
    renderer.setViewport(0, 0, cw, ch); renderer.setScissor(0, 0, cw, ch); renderer.setScissorTest(true);
    renderer.shadowMap.needsUpdate = w.shadowDirty; w.shadowDirty = false;
    renderer.render(w.scene, w.camera);
    w.ctx.drawImage(renderer.domElement, 0, H - ch, cw, ch, 0, 0, cw, ch);
  }

  function tick(t) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.1, Math.max(0, (t - last) / 1000)); last = t;
    msStep = 0;
    const vis = wins.filter((w) => w.visible);
    if (playing) {
      for (const w of vis) {
        w.az += dt * TURN;
        if (w.hold > 0) { w.hold -= dt; if (w.hold <= 0) newSim(w); continue; }
        w.acc += dt * +speed.input.value * w.end / CYCLE_S;
        const n = Math.floor(w.acc);
        if (n > 0) { w.acc -= n; step(w, n); }
      }
    }
    // render visible windows round-robin within the budget
    const t0 = performance.now();
    for (let k = 0; k < vis.length; k++) {
      const w = vis[(rr + k) % vis.length];
      draw(w); label(w);
      if (performance.now() - t0 > RENDER_BUDGET && k < vis.length - 1) { rr = (rr + k + 1) % vis.length; break; }
    }
    msRender = 0.9 * msRender + 0.1 * (performance.now() - t0);
    status.textContent = `${wins.length} plants, each alone in open light · one WebGL context · ${msRender.toFixed(1)} ms render, ${msStep.toFixed(1)} ms growth per frame`;
  }

  function setPlaying(v) { playing = v; playBtn.textContent = v ? 'Pause' : 'Play'; }
  playBtn.addEventListener('click', () => setPlaying(!playing));
  resetBtn.addEventListener('click', () => api.reset());
  palBtn.addEventListener('click', () => { palette = palette === 'drawing' ? 'natural' : 'drawing'; palBtn.textContent = palette === 'drawing' ? 'Natural colour' : 'Drawing'; for (const w of wins) { w.dirty = true; } });

  const api = {
    start() {
      if (running) return;
      running = true;
      if (!renderer) init();
      for (const w of wins) io.observe(w.cv);
      ro.observe(grid);
      resize();
      last = performance.now();
      raf = requestAnimationFrame(tick);
    },
    stop() {
      if (!running) return;
      running = false;
      cancelAnimationFrame(raf); raf = 0;
      io.disconnect(); ro.disconnect();
      for (const w of wins) w.visible = false;
    },
    reset() {
      for (const w of wins) { newSim(w); w.ext = { ...w.f.ext }; label(w); }
      if (renderer && !running) for (const w of wins) draw(w);
    },
  };
  Object.defineProperty(api, 'debug', {
    enumerable: false,
    value: {
      advance(years) {
        if (!renderer) { init(); }
        resize();
        for (const w of wins) { for (let i = 0; i < years && w.sim.year < w.end && w.sim.plants.length; i++) w.sim.step(); w.dirty = true; w.shadowDirty = true; draw(w); label(w); }
        return this.counts();
      },
      counts() {
        return wins.map((w) => { const p = w.sim.plants[0]; return { form: w.f.key, row: w.f.row, year: w.sim.year, end: w.end, height: p ? +p.height.toFixed(2) : 0, modules: p ? p.mods.length : 0, stemCm: p ? +(p.stemD * 100).toFixed(1) : 0 }; });
      },
      contexts() { return renderer ? 1 : 0; },
      get running() { return running; },
      get rafId() { return raf; },
      get msRender() { return msRender; },
      setPlaying,
      setPalette(p) { palette = p; palBtn.textContent = p === 'drawing' ? 'Natural colour' : 'Drawing'; for (const w of wins) w.dirty = true; if (renderer) for (const w of wins) draw(w); },
    },
  });
  wins.forEach(label);
  return api;
}
