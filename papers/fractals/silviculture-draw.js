/*
 * silviculture-draw.js — shared drawing helpers for the silviculture figures (three.js).
 * Instanced branch cylinders and leaf quads written straight from a Sim's module graphs, a camera fit that
 * projects a bounding box for the view's real aspect, and a wheel guard so page scrolling never zooms a figure.
 */
import * as THREE from 'three';
import { makeRng, A_MATURE } from './silviculture-core.js';

export const INK = 0x212529;
export const LEAF_BUD = 4, LEAF_NODE = 2, FRONDS = 12;
export const BARK = { drawing: INK, natural: 0x4e4034 };

// 256 deterministic random rotations for leaf quads
export const LEAF_ROT = (() => {
  const out = new Float32Array(256 * 9), r = makeRng(12345);
  for (let i = 0; i < 256; i++) {
    let x, y, z, w, s;
    do { x = r.next() * 2 - 1; y = r.next() * 2 - 1; z = r.next() * 2 - 1; w = r.next() * 2 - 1; s = x * x + y * y + z * z + w * w; } while (s > 1 || s < 1e-3);
    s = 1 / Math.sqrt(s); x *= s; y *= s; z *= s; w *= s;
    out.set([1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w),
      2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)], i * 9);
  }
  return out;
})();

export function makeBranchMesh(cap, color = INK) {
  const geo = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true); geo.translate(0, 0.5, 0);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color }), cap);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.castShadow = true; mesh.count = 0;
  return mesh;
}
export function makeLeafMesh(cap) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.32, 0.45, 0, 0, 1, 0, -0.32, 0.45, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]); geo.computeVertexNormals();
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), cap);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false; mesh.castShadow = true; mesh.count = 0;
  return mesh;
}

/** Holds a branch and a leaf InstancedMesh in `scene`, regrows them when a plant set outgrows them. */
export class PlantMeshes {
  constructor(scene, cap = 4000) { this.scene = scene; this.branch = makeBranchMesh(cap); this.leaf = makeLeafMesh(cap); scene.add(this.branch, this.leaf); }
  ensure(nb, nl) {
    if (nb > this.branch.instanceMatrix.count) {
      this.scene.remove(this.branch); this.branch.geometry.dispose(); this.branch.material.dispose(); this.branch.dispose();
      this.branch = makeBranchMesh(Math.ceil(nb * 1.5)); this.scene.add(this.branch);
    }
    if (nl > this.leaf.instanceMatrix.count) {
      this.scene.remove(this.leaf); this.leaf.geometry.dispose(); this.leaf.material.dispose(); this.leaf.dispose();
      this.leaf = makeLeafMesh(Math.ceil(nl * 1.5)); this.scene.add(this.leaf);
    }
  }
  /**
   * Write every module segment as a cylinder and every live bud / leafy node as leaf quads.
   * colorOf(plant) -> THREE.Color (linear), sizeOf(plant) -> leaf length in metres.
   * xf (optional, or per plant as p.xf) = { s, c, k, x, y, z }: rotate (c = cos, s = sin) about +Y, scale by k,
   * then translate.
   */
  setBark(hex) { this.branch.material.color.setHex(hex); this.bark = hex; }
  /** leafOf(p) → 'broad' | 'needle' | 'frond' (default broad); leaves: false draws a bare skeleton (snags) */
  write(plants, colorOf, sizeOf, xf, leafOf) {
    let nb = 0, nl = 0;
    for (const p of plants) {
      const lt = leafOf ? leafOf(p) : 'broad';
      for (const m of p.mods) {
        nb += m.proto.n - 1;
        if (m.nLive && lt) nl += lt === 'frond' ? m.nLive * FRONDS : m.nLive * LEAF_BUD + (m.proto.n - 1 - m.proto.nT) * LEAF_NODE;
      }
    }
    this.ensure(nb, nl);
    if (this.bark != null) this.branch.material.color.setHex(this.bark);
    const B = this.branch.instanceMatrix.array, Lm = this.leaf.instanceMatrix.array, LC = this.leaf.instanceColor.array;
    let b = 0, l = 0;
    for (const p of plants) {
      const X = p.xf || xf;
      const cs = X ? X.c : 1, sn = X ? X.s : 0, K = X ? X.k : 1, TX = X ? X.x : 0, TY = X ? X.y || 0 : 0, TZ = X ? X.z : 0;
      // rotation (row-major): X.m if given (e.g. a log lying along its fall direction), else a yaw by (c, s)
      const M = X && X.m ? X.m : null;
      const r00 = M ? M[0] : cs, r01 = M ? M[1] : 0, r02 = M ? M[2] : sn, r10 = M ? M[3] : 0, r11 = M ? M[4] : 1, r12 = M ? M[5] : 0, r20 = M ? M[6] : -sn, r21 = M ? M[7] : 0, r22 = M ? M[8] : cs;
      const col = colorOf(p), ls = sizeOf(p) * (p.capF < 1 ? 0.5 + 0.5 * p.capF : 1) * K, lt = leafOf ? leafOf(p) : 'broad';
      const ax = lt === 'needle' ? 0.3 : 1, ay = lt === 'needle' ? 1.3 : 1, minR = p.minR || 0.012;
      for (const m of p.mods) {
        const pr = m.proto, nw = m.nw, P = pr.P;
        for (let j = 1; j < pr.n; j++) {
          if (m.segL[j] < 0.01) continue;
          const k = j * 3, kp = P[j] * 3;
          const ax0 = nw[kp], ay0 = nw[kp + 1], az0 = nw[kp + 2];
          const dxr = nw[k] - ax0, dyr = nw[k + 1] - ay0, dzr = nw[k + 2] - az0, dl = Math.hypot(dxr, dyr, dzr) || 1;
          const x0 = TX + K * (r00 * ax0 + r01 * ay0 + r02 * az0), y0w = TY + K * (r10 * ax0 + r11 * ay0 + r12 * az0), z0 = TZ + K * (r20 * ax0 + r21 * ay0 + r22 * az0);
          const dx = r00 * dxr + r01 * dyr + r02 * dzr, dy = r10 * dxr + r11 * dyr + r12 * dzr, dz = r20 * dxr + r21 * dyr + r22 * dzr;
          const ux = dx / dl, uy = dy / dl, uz = dz / dl;
          let ax = 0, ay = 1, az = 0; if (Math.abs(uy) > 0.9) { ax = 1; ay = 0; }
          let e1x = uy * az - uz * ay, e1y = uz * ax - ux * az, e1z = ux * ay - uy * ax; const el1 = Math.hypot(e1x, e1y, e1z); e1x /= el1; e1y /= el1; e1z /= el1;
          const e2x = uy * e1z - uz * e1y, e2y = uz * e1x - ux * e1z, e2z = ux * e1y - uy * e1x;
          if (p.prune && m.dMax[j] < p.prune) continue; // snags lose their fine branches first
          const r = Math.max(minR, m.dMax[j] * 0.5) * K, o = b * 16, ext = (dl + r / K) / dl; // overlap joints by r
          B[o] = e1x * r; B[o + 1] = e1y * r; B[o + 2] = e1z * r; B[o + 3] = 0;
          B[o + 4] = dx * ext * K; B[o + 5] = dy * ext * K; B[o + 6] = dz * ext * K; B[o + 7] = 0;
          B[o + 8] = e2x * r; B[o + 9] = e2y * r; B[o + 10] = e2z * r; B[o + 11] = 0;
          B[o + 12] = x0 - ux * r * 0.5; B[o + 13] = y0w - uy * r * 0.5; B[o + 14] = z0 - uz * r * 0.5; B[o + 15] = 1;
          b++;
        }
        if (!m.nLive || !lt) continue;
        const shade = 0.72 + 0.28 * m.Q * m.QG, grow = 0.35 + 0.65 * Math.min(1, m.age / A_MATURE);
        if (lt === 'frond') { // palm: a rosette of long fronds at each live terminal
          for (let t = 0; t < pr.nT; t++) {
            if (!m.bud[t]) continue;
            const k = pr.terms[t] * 3, px = TX + K * (r00 * nw[k] + r01 * nw[k + 1] + r02 * nw[k + 2]), py = TY + K * (r10 * nw[k] + r11 * nw[k + 1] + r12 * nw[k + 2]), pz = TZ + K * (r20 * nw[k] + r21 * nw[k + 1] + r22 * nw[k + 2]);
            for (let q = 0; q < FRONDS; q++) {
              const az = q * 2.39996 + m.id, dip = -0.25 - 0.55 * ((q * 7) % FRONDS) / FRONDS, len = ls * 3.2 * grow, wd = len * 0.22;
              const fx = Math.cos(az) * Math.cos(dip), fy = Math.sin(dip), fz = Math.sin(az) * Math.cos(dip);
              const sx = -Math.sin(az), sz = Math.cos(az), o = l * 16; // side vector (horizontal), normal = side × dir
              const nx = sz * fy, ny = sx * fz - sz * fx, nz = -sx * fy;
              Lm[o] = sx * wd; Lm[o + 1] = 0; Lm[o + 2] = sz * wd; Lm[o + 3] = 0;
              Lm[o + 4] = fx * len; Lm[o + 5] = fy * len; Lm[o + 6] = fz * len; Lm[o + 7] = 0;
              Lm[o + 8] = nx * wd; Lm[o + 9] = ny * wd; Lm[o + 10] = nz * wd; Lm[o + 11] = 0;
              Lm[o + 12] = px; Lm[o + 13] = py; Lm[o + 14] = pz; Lm[o + 15] = 1;
              const c = shade * (0.9 + 0.2 * ((q * 13) % 7) / 7), o3 = l * 3;
              LC[o3] = col.r * c; LC[o3 + 1] = col.g * c; LC[o3 + 2] = col.b * c;
              l++;
            }
          }
          continue;
        }
        for (let j = 1; j < pr.n; j++) {
          const t = pr.termOf[j];
          if (t >= 0 && !m.bud[t]) continue;
          const reps = t >= 0 ? LEAF_BUD : LEAF_NODE, k = j * 3;
          const px = TX + K * (r00 * nw[k] + r01 * nw[k + 1] + r02 * nw[k + 2]), py = TY + K * (r10 * nw[k] + r11 * nw[k + 1] + r12 * nw[k + 2]), pz = TZ + K * (r20 * nw[k] + r21 * nw[k + 1] + r22 * nw[k + 2]);
          for (let q = 0; q < reps; q++) {
            const h = ((m.id * 2654435761 + j * 40503 + q * 9973) >>> 0) & 255, R = h * 9;
            const jit = 0.85 + 0.3 * (((h * 37) & 63) / 63), s = ls * grow * jit * (t >= 0 ? 1 : 0.8), o = l * 16;
            const sa = s * ax, sb = s * ay;
            Lm[o] = LEAF_ROT[R] * sa; Lm[o + 1] = LEAF_ROT[R + 1] * sa; Lm[o + 2] = LEAF_ROT[R + 2] * sa; Lm[o + 3] = 0;
            Lm[o + 4] = LEAF_ROT[R + 3] * sb; Lm[o + 5] = LEAF_ROT[R + 4] * sb; Lm[o + 6] = LEAF_ROT[R + 5] * sb; Lm[o + 7] = 0;
            Lm[o + 8] = LEAF_ROT[R + 6] * s; Lm[o + 9] = LEAF_ROT[R + 7] * s; Lm[o + 10] = LEAF_ROT[R + 8] * s; Lm[o + 11] = 0;
            Lm[o + 12] = px; Lm[o + 13] = py; Lm[o + 14] = pz; Lm[o + 15] = 1;
            const c = shade * (0.92 + 0.16 * (((h * 13) & 31) / 31)), o3 = l * 3;
            LC[o3] = col.r * c; LC[o3 + 1] = col.g * c; LC[o3 + 2] = col.b * c;
            l++;
          }
        }
      }
    }
    this.branch.count = b; this.leaf.count = l;
    this.branch.instanceMatrix.needsUpdate = true; this.leaf.instanceMatrix.needsUpdate = true; this.leaf.instanceColor.needsUpdate = true;
    return { branches: b, leaves: l };
  }
}

const _v = new THREE.Vector3();
/**
 * Smallest camera distance along `dir` (unit, from target towards the camera) at which every point of `pts`
 * projects inside ±margin of the view. Uses the camera's current fov and aspect; leaves the camera there.
 */
export function fitDistance(camera, target, dir, pts, margin = 0.88, maxD = 200000) {
  let lo = 0.5, hi = maxD;
  for (let i = 0; i < 40; i++) {
    const d = 0.5 * (lo + hi);
    camera.position.copy(target).addScaledVector(dir, d); camera.lookAt(target); camera.updateMatrixWorld();
    let ok = true;
    for (const p of pts) {
      _v.copy(p).applyMatrix4(camera.matrixWorldInverse);
      if (_v.z > -camera.near) { ok = false; break; }
      _v.applyMatrix4(camera.projectionMatrix);
      if (Math.abs(_v.x) > margin || Math.abs(_v.y) > margin) { ok = false; break; }
    }
    if (ok) hi = d; else lo = d;
  }
  return hi;
}
/** Corners of an axis-aligned box. */
export function boxPoints(x0, x1, y0, y1, z0, z1) {
  const out = [];
  for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) out.push(new THREE.Vector3(x, y, z));
  return out;
}

/** Plain wheel scrolls the page; pinch (ctrl+wheel) or cmd/alt+wheel still zooms the OrbitControls inside `el`. */
export function guardWheel(el) {
  el.addEventListener('wheel', (e) => { if (!e.ctrlKey && !e.metaKey && !e.altKey) e.stopImmediatePropagation(); }, { capture: true });
}

export const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
export function slider(label, min, max, step, value, fmt) {
  const lab = el('label'), input = el('input'), span = el('span', 'value');
  input.type = 'range'; input.min = min; input.max = max; input.step = step; input.value = value;
  lab.append(label, input, span);
  const upd = () => { span.textContent = fmt(+input.value); };
  upd(); input.addEventListener('input', upd);
  return { lab, input, upd };
}

// ------------------------------------------------------------------------------------------- figure UI
// A quiet overlay bar in the view's top-left corner, a fading hint, and a collapsed settings panel under the view
// styled like the paper's details.math box. Colours come from the paper's tokens (paper.css :root), with fallbacks.
const UI_CSS = `
.sv-bar { position: absolute; top: 10px; left: 10px; z-index: 3; display: flex; gap: 4px; align-items: center; padding: 3px;
  background: color-mix(in srgb, var(--paper, #fff) 82%, transparent); border: 1px solid var(--rule, #e7e9eb); border-radius: 999px;
  opacity: 0.7; transition: opacity 0.18s; backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); }
.fig-view:hover .sv-bar, .sv-bar:focus-within { opacity: 1; }
@media (hover: none) { .sv-bar { opacity: 1; } }
.sv-bar button { all: unset; box-sizing: border-box; height: 26px; min-width: 26px; padding: 0 7px; display: inline-flex; align-items: center; justify-content: center; gap: 4px;
  border-radius: 999px; cursor: pointer; color: var(--ink, #1d2024); font: 500 0.74rem var(--sans, system-ui, sans-serif); }
.sv-bar button[hidden] { display: none; }
.sv-bar button:hover { background: var(--wash, #f6f7f8); }
.sv-bar button:focus-visible { outline: 1.5px solid var(--ink, #1d2024); outline-offset: 1px; }
.sv-bar button[aria-pressed="true"] { background: var(--ink, #1d2024); color: var(--paper, #fff); }
.sv-bar svg { width: 14px; height: 14px; display: block; }
.sv-bar .sv-seg { display: inline-flex; border: 1px solid var(--rule, #e7e9eb); border-radius: 999px; padding: 1px; }
.sv-bar .sv-seg button { height: 22px; padding: 0 8px; }
.sv-bar .sv-sep { width: 1px; height: 16px; background: var(--rule, #e7e9eb); margin: 0 2px; }
.sv-hint { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); z-index: 3; pointer-events: none;
  font: 0.78rem var(--sans, system-ui, sans-serif); color: var(--ink-2, #4a4f55); background: color-mix(in srgb, var(--paper, #fff) 85%, transparent);
  border: 1px solid var(--rule, #e7e9eb); border-radius: 999px; padding: 0.3rem 0.8rem; transition: opacity 0.6s; white-space: nowrap; }
.sv-hint.off { opacity: 0; }
p.status.sv-status { text-align: center; margin: 0.45rem auto 0; font-size: 0.78rem; }
.sv-settings { border: 1px solid var(--rule, #e7e9eb); border-radius: 10px; background: var(--wash, #f6f7f8); padding: 0.7rem 1rem 0.8rem; margin: 0.6rem auto 0;
  display: grid; grid-template-columns: max-content 1fr; gap: 0.45rem 1rem; align-items: center; font-size: 0.8rem; color: var(--ink-2, #4a4f55); }
.sv-settings[hidden] { display: none; }
.sv-settings .sv-k { font-size: 0.72rem; font-weight: 600; letter-spacing: 0.04em; color: var(--muted, #74797f); text-transform: uppercase; }
.sv-settings .sv-v { display: flex; flex-wrap: wrap; gap: 0.35rem 1rem; align-items: center; }
.sv-settings label { display: inline-flex; align-items: center; gap: 0.4rem; white-space: nowrap; }
.sv-settings input[type="range"] { width: 7.5rem; accent-color: var(--ink, #1d2024); }
.sv-settings .value { font-variant-numeric: tabular-nums; color: var(--muted, #74797f); min-width: 3.2rem; }
.sv-settings button, .sv-settings select { font: 500 0.76rem var(--sans, system-ui, sans-serif); color: var(--ink, #1d2024); background: var(--paper, #fff);
  border: 1px solid #d5d8db; border-radius: 999px; padding: 0.22rem 0.7rem; cursor: pointer; }
.sv-settings select { border-radius: 6px; }
.sv-chip { font: 0.74rem var(--sans, system-ui, sans-serif) !important; padding: 0.18rem 0.6rem !important; color: var(--muted, #74797f) !important; background: transparent !important; border: 1px solid var(--rule, #e7e9eb) !important; }
.sv-chip[aria-pressed="true"] { color: var(--ink, #1d2024) !important; background: var(--paper, #fff) !important; border-color: #c9cdd1 !important; }
.sv-chip .n { color: var(--muted, #74797f); font-variant-numeric: tabular-nums; margin-left: 0.3rem; }
canvas.chart.sv-chart { margin-top: 0.6rem; }
@media (max-width: 640px) { .sv-settings { grid-template-columns: 1fr; gap: 0.25rem; } .sv-settings .sv-k { margin-top: 0.35rem; } }
`;
export function injectUiStyle() {
  if (typeof document === 'undefined' || document.getElementById('sv-ui-style')) return;
  const st = document.createElement('style'); st.id = 'sv-ui-style'; st.textContent = UI_CSS; document.head.append(st);
}
const ICON = {
  play: '<svg viewBox="0 0 16 16"><path d="M4.5 3v10l8-5z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 16 16"><path d="M4.5 3h2.5v10H4.5zM9 3h2.5v10H9z" fill="currentColor"/></svg>',
  back: '<svg viewBox="0 0 16 16"><path d="M9.5 3.5 5 8l4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  gear: '<svg viewBox="0 0 16 16"><path d="M3 4.5h10M3 8h10M3 11.5h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="6" cy="4.5" r="1.6" fill="var(--paper,#fff)" stroke="currentColor" stroke-width="1.3"/><circle cx="10.5" cy="8" r="1.6" fill="var(--paper,#fff)" stroke="currentColor" stroke-width="1.3"/><circle cx="5" cy="11.5" r="1.6" fill="var(--paper,#fff)" stroke="currentColor" stroke-width="1.3"/></svg>',
};
const btn = (html, label) => { const b = document.createElement('button'); b.type = 'button'; b.innerHTML = html; b.setAttribute('aria-label', label); b.title = label; return b; };
/**
 * The overlay bar. opts: { onPlay, onBack (optional), palettes: ['drawing', 'natural'] (optional), onPalette, onSettings }.
 * Returns { bar, setPlaying(v), showBack(v), setPalette(p), setSettings(open) }.
 */
export function makeOverlay(view, opts) {
  injectUiStyle();
  const bar = el('div', 'sv-bar'); bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Figure controls');
  const play = btn(ICON.pause, 'Pause'); play.addEventListener('click', () => opts.onPlay());
  bar.append(play);
  let back = null;
  if (opts.onBack) { back = btn(ICON.back + '<span>Region</span>', 'Back to the region'); back.hidden = true; back.addEventListener('click', () => opts.onBack()); bar.append(back); }
  const pal = {};
  if (opts.palettes) {
    const seg = el('div', 'sv-seg');
    for (const p of opts.palettes) { const b = btn(p[0].toUpperCase() + p.slice(1), `${p} palette`); b.setAttribute('aria-pressed', 'false'); b.addEventListener('click', () => opts.onPalette(p)); seg.append(b); pal[p] = b; }
    bar.append(el('span', 'sv-sep'), seg);
  }
  const gear = btn(ICON.gear, 'Settings'); gear.setAttribute('aria-expanded', 'false'); gear.addEventListener('click', () => opts.onSettings());
  bar.append(el('span', 'sv-sep'), gear);
  view.append(bar);
  return {
    bar,
    setPlaying(v) { play.innerHTML = v ? ICON.pause : ICON.play; play.setAttribute('aria-label', v ? 'Pause' : 'Play'); play.title = v ? 'Pause' : 'Play'; },
    showBack(v) { if (back) back.hidden = !v; },
    setPalette(p) { for (const k in pal) pal[k].setAttribute('aria-pressed', String(k === p)); },
    setSettings(open) { gear.setAttribute('aria-expanded', String(open)); gear.setAttribute('aria-pressed', String(open)); },
  };
}
/** a hint that fades after the first click on the view or after ms */
export function makeHint(view, text, ms = 6000) {
  injectUiStyle();
  const h = el('div', 'sv-hint off', text); view.append(h);
  let shown = false, done = false, timer = 0;
  const hide = () => { done = true; h.classList.add('off'); clearTimeout(timer); };
  view.addEventListener('pointerup', () => { if (shown) hide(); });
  return { show() { if (shown || done) return; shown = true; h.classList.remove('off'); timer = setTimeout(hide, ms); }, hide, stop() { clearTimeout(timer); } };
}
/** the settings panel: rows of [label, ...nodes]; returns { panel, toggle(), open } */
export function makeSettings(rows) {
  injectUiStyle();
  const panel = el('div', 'sv-settings'); panel.hidden = true;
  for (const [k, ...nodes] of rows) { const kk = el('div', 'sv-k', k), vv = el('div', 'sv-v'); vv.append(...nodes); panel.append(kk, vv); }
  const api = { panel, get open() { return !panel.hidden; }, toggle() { panel.hidden = !panel.hidden; return !panel.hidden; } };
  return api;
}
/** a toggle chip; onChange(on) */
export function chip(text, on, onChange) {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'sv-chip'; b.setAttribute('aria-pressed', String(on));
  const t = el('span', null, text), n = el('span', 'n', ''); b.append(t, n);
  b.addEventListener('click', () => { const v = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(v)); onChange(v); });
  return { b, setCount(c) { n.textContent = c ? String(c) : ''; } };
}
