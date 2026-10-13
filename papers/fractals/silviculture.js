/*
 * silviculture.js — interactive figures after Makowski et al., "Synthetic Silviculture" (SIGGRAPH 2019).
 *
 *   createSilviculture(root)  the 32 m forest plot: two species, succession, self-thinning (this file)
 *   createSpecimens(root)     plant windows: one plant per growth form in open light (silviculture-specimens.js)
 *   createEnvironment(root)   two levels: a 10 km region and a 256 m focus plot with deadwood (silviculture-env.js)
 *
 * Modules: silviculture-core.js (module model + architectures), silviculture-plants.js (species catalogue),
 * silviculture-draw.js (instanced drawing), silviculture-specimens.js, silviculture-region.js (region layers),
 * silviculture-focus.js (plant-scale ecosystem with mortality and deadwood), silviculture-env.js (the view),
 * silviculture-impostors.js (far plants as sprites of the module skeletons), landscape-*.js (terrain and ground),
 * silviculture-terrain.js + silviculture-ground.js (fallback stand-ins if the landscape modules fail to load).
 *
 * Each returns { start(), stop(), reset() } (plus a non-enumerable `debug` for test harnesses). The model, its
 * faithful parts, substitutions and every chosen constant are documented in silviculture-core.js and
 * silviculture-env.js.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sim, SPECIES, PLOT, HALF, TAU2 } from './silviculture-core.js';
import { PlantMeshes, fitDistance, boxPoints, guardWheel, el, slider, makeOverlay, makeSettings } from './silviculture-draw.js';
export { createSpecimens } from './silviculture-specimens.js';
export { createEnvironment } from './silviculture-env.js';

// ------------------------------------------------------------------------------------------- figure
export function createSilviculture(root) {
  const mq = window.matchMedia('(max-width: 700px)');

  const view = el('div', 'fig-view');
  view.style.position = 'relative'; view.style.width = '100%'; view.style.overflow = 'hidden';
  const setAspect = () => { view.style.aspectRatio = mq.matches ? '4 / 5' : '16 / 10'; };
  setAspect();

  const resetBtn = el('button', null, 'Reset'), seedBtn = el('button', null, 'New seed');
  resetBtn.type = seedBtn.type = 'button';
  const modeSel = el('select');
  for (const [v, t] of [['forest', 'Forest'], ['single', 'Single tree']]) { const o = el('option', null, t); o.value = v; modeSel.append(o); }
  modeSel.setAttribute('aria-label', 'Mode');
  const treeSel = el('select');
  for (const [v, t] of [['1', 'tolerant (Table 4 i)'], ['0', 'pioneer (Table 4 n)']]) { const o = el('option', null, t); o.value = v; treeSel.append(o); }
  treeSel.setAttribute('aria-label', 'Species');
  const speed = slider('Speed', 1, 40, 1, 8, (v) => `${v} yr/s`);
  const mix = slider('Tolerant share', 0, 100, 5, 30, (v) => `${v}%`);
  const stol = slider('Shade tolerance', 0, 100, 5, 45, (v) => (v / 100).toFixed(2));
  // the paper's figure family: a quiet overlay bar (play/pause, settings) and a collapsed settings panel
  const settings = makeSettings([['Stand', modeSel, treeSel], ['Species', mix.lab, stol.lab], ['Time', speed.lab, resetBtn, seedBtn]]);
  const overlay = makeOverlay(view, { onPlay: () => setPlaying(!playing), onSettings: () => overlay.setSettings(settings.toggle()) });
  const chart = el('canvas', 'chart sv-chart');
  chart.style.width = '100%'; chart.style.display = 'block';
  chart.setAttribute('role', 'img');
  chart.setAttribute('aria-label', 'Plants and biomass per species over time, and log mean tree mass against log density');
  const status = el('p', 'status sv-status');
  root.append(view, status, settings.panel, chart);

  // ---- state
  let seed = 1, sim = null, playing = true, running = false, raf = 0, last = 0, acc = 0;
  let renderer, scene, camera, controls, meshes, sun, ro, autoFrame = true;
  let dirty = true, chartDirty = true, lastChart = 0;
  const leafLin = SPECIES.map((s) => new THREE.Color(s.leafHex)); // linear components
  const mode = () => modeSel.value;
  const syncVisibility = () => { treeSel.style.display = mode() === 'single' ? '' : 'none'; mix.lab.style.display = mode() === 'single' ? 'none' : ''; };
  syncVisibility();

  const newSim = () => {
    sim = new Sim({ seed, mode: mode(), mix: +mix.input.value / 100, sTolT: +stol.input.value / 100, single: +treeSel.value });
    acc = 0; dirty = true; chartDirty = true; autoFrame = true;
    if (camera) frameCamera(true);
  };

  function init() {
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0xffffff, 1);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
    const cv = renderer.domElement; cv.style.width = '100%'; cv.style.height = '100%'; cv.style.display = 'block'; cv.style.touchAction = 'none';
    view.append(cv);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(35, 16 / 10, 0.1, 600);
    controls = new OrbitControls(camera, cv);
    controls.enableDamping = true; controls.dampingFactor = 0.08; controls.maxPolarAngle = Math.PI * 0.495; controls.minDistance = 2; controls.maxDistance = 200;
    controls.addEventListener('start', () => { autoFrame = false; });
    scene.add(new THREE.HemisphereLight(0xffffff, 0xdfe3dc, 1.9));
    sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(18, 40, 10); sun.castShadow = true;
    const sc = sun.shadow.camera; sc.left = sc.bottom = -26; sc.right = sc.top = 26; sc.near = 1; sc.far = 120;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
    scene.add(sun, sun.target);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(PLOT, PLOT), new THREE.MeshLambertMaterial({ color: 0xf2f3ef }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    const edge = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-HALF, 0.01, -HALF), new THREE.Vector3(HALF, 0.01, -HALF), new THREE.Vector3(HALF, 0.01, HALF), new THREE.Vector3(-HALF, 0.01, HALF)]),
    new THREE.LineBasicMaterial({ color: 0xced4da }));
    scene.add(edge);
    meshes = new PlantMeshes(scene, 30000);
    guardWheel(view);
    ro = new ResizeObserver(resize);
    if (!sim) newSim();
    frameCamera(true);
    resize();
  }

  function resize() {
    if (!renderer) return;
    setAspect();
    const w = Math.max(1, view.clientWidth), h = Math.max(1, view.clientHeight || Math.round(w * (mq.matches ? 1.25 : 0.625)));
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    if (autoFrame) frameCamera(true);
    chartDirty = true;
  }

  // Three-quarter elevated view that fits the plot (or the one tree) for the view's real aspect, then follows
  // canopy height gently until the reader takes the camera.
  const VIEW_DIR = new THREE.Vector3(0.6, 0.52, 0.62).normalize(), VIEW_STEEP = new THREE.Vector3(0.5, 0.9, 0.5).normalize();
  function frameCamera(snap) {
    if (!camera || (!snap && !autoFrame)) return;
    let pts, target;
    if (sim && sim.mode === 'single') {
      const p = sim.plants[0], h = p ? Math.max(3, p.height) : 3;
      let rx = 1.5; if (p) for (const m of p.mods) rx = Math.max(rx, Math.hypot(m.cx, m.cz) + m.r);
      rx = Math.min(rx, h * 0.8);
      pts = boxPoints(-rx, rx, 0, h, -rx, rx); target = new THREE.Vector3(0, h * 0.45, 0);
    } else {
      let h = 4; for (const p of sim.plants) if (p.height > h) h = p.height;
      pts = boxPoints(-HALF, HALF, 0, h, -HALF, HALF); target = new THREE.Vector3(0, h * 0.3, 0);
    }
    const keepPos = camera.position.clone(), keepQ = camera.quaternion.clone();
    const dir = camera.aspect < 1 && !(sim && sim.mode === 'single') ? VIEW_STEEP : VIEW_DIR;
    const d = fitDistance(camera, target, dir, pts, 0.9);
    const pos = target.clone().addScaledVector(dir, d);
    if (snap) { controls.target.copy(target); camera.position.copy(pos); camera.lookAt(target); }
    else { camera.position.copy(keepPos); camera.quaternion.copy(keepQ); controls.target.lerp(target, 0.04); camera.position.lerp(pos, 0.04); }
  }

  function updateInstances() {
    meshes.write(sim.plants, (p) => leafLin[p.sp.key === 'pioneer' ? 0 : 1], (p) => p.sp.leafSize);
    renderer.shadowMap.needsUpdate = true;
  }

  // ---- chart: (a) plants (solid) and biomass (dashed) per species against years; (b) self-thinning
  function drawChart() {
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.max(1, chart.clientWidth), stack = W < 560;
    const Hc = stack ? 350 : 180;
    chart.style.height = Hc + 'px';
    if (chart.width !== Math.round(W * dpr) || chart.height !== Math.round(Hc * dpr)) { chart.width = Math.round(W * dpr); chart.height = Math.round(Hc * dpr); }
    const g = chart.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, Hc);
    g.font = '11px Inter, system-ui, sans-serif'; g.textBaseline = 'middle';
    const H = sim.hist, n = H.n;
    const pw = stack ? W : (W - 24) / 2, ph = stack ? (Hc - 10) / 2 : Hc;
    const boxA = { x: 0, y: 0, w: pw, h: ph }, boxB = stack ? { x: 0, y: ph + 10, w: pw, h: ph } : { x: pw + 24, y: 0, w: pw, h: ph };
    const ink = '#212529', mute = '#6c757d', rule = '#dee2e6';
    // Title on the left, a legend (or note) on the right of the same line when both fit, else on a second line;
    // returns the plot box below them.
    const frame = (bx, title, xl, yl, items) => {
      const gap = 10, tw = g.measureText(title).width;
      const iw = items.reduce((a, [t]) => a + g.measureText(t).width, 0) + gap * Math.max(0, items.length - 1);
      const two = 34 + tw + 16 + iw > bx.w - 10;
      const top = two ? 33 : 19, x0 = bx.x + 35, y0 = bx.y + top, w = bx.w - 71, h = bx.h - top - 30;
      g.strokeStyle = rule; g.lineWidth = 1; g.strokeRect(x0 - 0.5, y0 - 0.5, w + 1, h + 1);
      g.fillStyle = ink; g.textAlign = 'left'; g.fillText(title, bx.x + 34, bx.y + 8);
      let ix = two ? bx.x + 34 : bx.x + bx.w - 10 - iw;
      const iy = two ? bx.y + 22 : bx.y + 8;
      for (const [t, c] of items) { g.fillStyle = c; g.fillText(t, ix, iy); ix += g.measureText(t).width + gap; }
      g.fillStyle = mute; g.textAlign = 'center'; g.fillText(xl, x0 + w / 2, bx.y + bx.h - 8);
      g.save(); g.translate(bx.x + 8, y0 + h / 2); g.rotate(-Math.PI / 2); g.fillText(yl, 0, 0); g.restore();
      return { x0, y0, w, h };
    };
    // (a)
    {
      const bx = boxA;
      const { x0, y0, w, h } = frame(bx, 'a  plants (solid), biomass (dashed, t)', 'years', 'plants',
        [['pioneer', SPECIES[0].chartHex], ['tolerant', SPECIES[1].chartHex]]);
      const xmax = Math.max(100, Math.ceil((n ? H.year[n - 1] : 0) / 100) * 100);
      let cmax = 10, bmax = 1;
      for (let i = 0; i < n; i++) { cmax = Math.max(cmax, H.c0[i], H.c1[i]); bmax = Math.max(bmax, H.b0[i], H.b1[i]); }
      cmax = Math.ceil(cmax / 10) * 10;
      g.fillStyle = mute; g.textAlign = 'right';
      g.fillText(String(cmax), x0 - 4, y0); g.fillText('0', x0 - 4, y0 + h);
      g.textAlign = 'left'; g.fillText(bmax >= 10 ? bmax.toFixed(0) + ' t' : bmax.toFixed(1) + ' t', x0 + w + 4, y0);
      g.textAlign = 'center'; g.fillText('0', x0, y0 + h + 9); g.fillText(String(xmax), x0 + w, y0 + h + 9);
      const line = (arr, max, color, dash) => {
        g.strokeStyle = color; g.lineWidth = 1.5; g.setLineDash(dash ? [4, 3] : []); g.beginPath();
        for (let i = 0; i < n; i++) { const X = x0 + w * H.year[i] / xmax, Y = y0 + h * (1 - arr[i] / max); i ? g.lineTo(X, Y) : g.moveTo(X, Y); }
        g.stroke(); g.setLineDash([]);
      };
      line(H.c0, cmax, SPECIES[0].chartHex, false); line(H.c1, cmax, SPECIES[1].chartHex, false);
      line(H.b0, bmax, SPECIES[0].chartHex, true); line(H.b1, bmax, SPECIES[1].chartHex, true);
    }
    // (b)
    {
      const bx = boxB, fit = sim.thinningSlope();
      const { x0, y0, w, h } = frame(bx, 'b  self-thinning, stems ≥ 5 cm', 'log₁₀ density (trees/ha)', 'log₁₀ mean mass (kg)',
        [[Number.isFinite(fit.slope) ? `fit ${fit.slope.toFixed(2)}` : 'fit —', ink], ['dashed −3/2', mute]]);
      let xa = Infinity, xb = -Infinity, ya = Infinity, yb = -Infinity, k = 0;
      for (let i = 0; i < n; i++) if (H.den[i] > 0 && H.mass[i] > 0) {
        const x = Math.log10(H.den[i]), y = Math.log10(H.mass[i]); xa = Math.min(xa, x); xb = Math.max(xb, x); ya = Math.min(ya, y); yb = Math.max(yb, y); k++;
      }
      if (k < 2) { g.fillStyle = mute; g.textAlign = 'center'; g.fillText('waiting for trees ≥ 5 cm', x0 + w / 2, y0 + h / 2); }
      else {
        xa = Math.floor(xa * 4) / 4; xb = Math.ceil(xb * 4) / 4 + 0.001; ya = Math.floor(ya * 2) / 2; yb = Math.ceil(yb * 2) / 2 + 0.001;
        if (xb - xa < 0.5) { const c = (xa + xb) / 2; xa = c - 0.25; xb = c + 0.25; }
        if (yb - ya < 1) { const c = (ya + yb) / 2; ya = c - 0.5; yb = c + 0.5; }
        const X = (x) => x0 + w * (x - xa) / (xb - xa), Y = (y) => y0 + h * (1 - (y - ya) / (yb - ya));
        g.fillStyle = mute; g.textAlign = 'right'; g.fillText(yb.toFixed(1), x0 - 4, y0); g.fillText(ya.toFixed(1), x0 - 4, y0 + h);
        g.textAlign = 'center'; g.fillText(xa.toFixed(2), x0, y0 + h + 9); g.fillText(xb.toFixed(2), x0 + w, y0 + h + 9);
        // −3/2 reference through the last point
        let li = n - 1; while (li > 0 && !(H.den[li] > 0 && H.mass[li] > 0)) li--;
        const lx = Math.log10(H.den[li]), ly = Math.log10(H.mass[li]);
        g.save(); g.beginPath(); g.rect(x0, y0, w, h); g.clip();
        g.strokeStyle = '#adb5bd'; g.setLineDash([3, 3]); g.lineWidth = 1; g.beginPath();
        g.moveTo(X(xa), Y(ly - 1.5 * (xa - lx))); g.lineTo(X(xb), Y(ly - 1.5 * (xb - lx))); g.stroke(); g.setLineDash([]);
        g.strokeStyle = ink; g.lineWidth = 1.2; g.beginPath();
        let first = true;
        for (let i = 0; i < n; i++) {
          if (!(H.den[i] > 0 && H.mass[i] > 0)) continue;
          const px = X(Math.log10(H.den[i])), py = Y(Math.log10(H.mass[i]));
          first ? g.moveTo(px, py) : g.lineTo(px, py); first = false;
        }
        g.stroke();
        g.fillStyle = ink; g.beginPath(); g.arc(X(lx), Y(ly), 2.5, 0, TAU2); g.fill();
        g.restore();
      }
    }
  }

  function drawStatus() {
    const st = sim.stats, p = sim.plants;
    const fmt = (v) => v.toLocaleString('en-US').replace(/,/g, ' ');
    if (sim.mode === 'single') {
      const t = p[0];
      status.textContent = t
        ? `year ${sim.year} · ${t.sp.label} · height ${t.height.toFixed(1)} m · stem ${(t.stemD * 100).toFixed(0)} cm · modules ${fmt(st.modules)} · ${sim.msStep.toFixed(2)} ms/step · seed ${seed}`
        : `year ${sim.year} · the tree has died · seed ${seed}`;
    } else {
      status.textContent = `year ${sim.year} · pioneer ${st.count[0]} · tolerant ${st.count[1]} · modules ${fmt(st.modules)} · ${sim.msStep.toFixed(2)} ms/step · seed ${seed}`;
    }
  }

  function frame(t) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, Math.max(0, (t - last) / 1000)); last = t;
    if (playing) {
      acc += dt * +speed.input.value;
      const n = Math.floor(acc);
      if (n > 0) {
        const t0 = performance.now(); let done = 0;
        while (done < n && performance.now() - t0 < 24) { sim.step(); done++; }
        acc = done < n ? 0 : acc - n;
        dirty = true;
        if (sim.mode === 'single' && sim.year >= 250) setPlaying(false);
      }
    }
    if (dirty) { updateInstances(); dirty = false; chartDirty = true; }
    frameCamera(false);
    if (chartDirty && t - lastChart > 200) { drawChart(); drawStatus(); lastChart = t; chartDirty = false; }
    controls.update();
    renderer.render(scene, camera);
  }

  function setPlaying(v) { playing = v; overlay.setPlaying(v); }
  resetBtn.addEventListener('click', () => api.reset());
  seedBtn.addEventListener('click', () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0 || 1; seed %= 100000; api.reset(); });
  modeSel.addEventListener('change', () => { syncVisibility(); speed.input.value = mode() === 'single' ? 4 : 8; speed.input.dispatchEvent(new Event('input')); api.reset(); });
  treeSel.addEventListener('change', () => api.reset());
  mix.input.addEventListener('change', () => api.reset());
  stol.input.addEventListener('input', () => { if (sim) sim.species[1].sTol = +stol.input.value / 100; });
  mq.addEventListener('change', () => { setAspect(); resize(); frameCamera(true); });

  const api = {
    start() {
      if (running) return;
      running = true;
      if (!renderer) init();
      ro.observe(view);
      resize();
      last = performance.now();
      raf = requestAnimationFrame(frame);
    },
    stop() {
      if (!running) return;
      running = false;
      cancelAnimationFrame(raf); raf = 0;
      if (ro) ro.disconnect();
    },
    reset() {
      newSim();
      if (sim.mode === 'single' && !playing) setPlaying(true);
      if (renderer) { updateInstances(); drawChart(); drawStatus(); if (!running) renderer.render(scene, camera); }
    },
  };
  Object.defineProperty(api, 'debug', {
    enumerable: false,
    value: {
      advance(years) {
        if (!renderer) init();
        for (let i = 0; i < years; i++) sim.step();
        updateInstances(); frameCamera(true); drawChart(); drawStatus(); controls.update(); renderer.render(scene, camera);
        return this.counts();
      },
      counts() {
        const st = sim.stats, f = sim.thinningSlope();
        const tallest = sim.plants.reduce((m, p) => Math.max(m, p.height), 0);
        return { year: sim.year, pioneer: st.count[0], tolerant: st.count[1], modules: st.modules, msPerStep: +sim.msStep.toFixed(3),
          biomass_t: st.bio.map((b) => +b.toFixed(2)), trees5cm: st.trees, slope: f.slope, slopeN: f.n, tallest: +tallest.toFixed(2),
          branches: meshes ? meshes.branch.count : 0, leaves: meshes ? meshes.leaf.count : 0 };
      },
      setMode(m, species) { modeSel.value = m; if (species != null) treeSel.value = String(species); syncVisibility(); api.reset(); },
      setPlaying, setSeed(s) { seed = s; api.reset(); },
      setMix(v) { mix.input.value = v; mix.input.dispatchEvent(new Event('input')); api.reset(); },
      setShadeTolerance(v) { stol.input.value = v; stol.input.dispatchEvent(new Event('input')); },
      get sim() { return sim; },
      get running() { return running; },
      get rafId() { return raf; },
      render() { if (!renderer) init(); updateInstances(); drawChart(); drawStatus(); controls.update(); renderer.render(scene, camera); },
      history() { const H = sim.hist; return Array.from({ length: H.n }, (_, i) => [H.year[i], H.c0[i], H.c1[i], +H.b0[i].toFixed(2), +H.b1[i].toFixed(2), +H.den[i].toFixed(1), +H.mass[i].toFixed(1)]); },
    },
  });
  newSim();
  drawStatus();
  return api;
}

