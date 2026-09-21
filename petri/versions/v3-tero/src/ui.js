// ui.js — petri's shell. The iris-engine Program Manager idiom, reduced: a caption, a menu bar with the
// status at its right, four tool windows that minimise to the shortcut row. Shell state lives here and in
// localStorage 'petri' — never in the engine. Everything the shell does goes through E.op / E.newDish, so
// every action lands in the Dish ID. window.__petri is the engine, for the harness and the console.
import { createEngine, QUALITY, SPAN_MM } from './engine.js';
import { CATALOG, CATEGORIES, byId } from './catalog.js';
import { KPARAMS, KERNELS } from './kernels.js';
import { MODES } from './render.js';

const $ = (id) => document.getElementById(id);
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const qs = new URLSearchParams(location.search);
let U = { tool: 'hand', organism: CATALOG[0].id, radius: 2, snap: false, medium: true, slot: 1, layout: {}, quality: 'normal' };
try { U = Object.assign(U, JSON.parse(localStorage.getItem('petri') || '{}')); } catch (e) {}
if (qs.get('q') && QUALITY[qs.get('q')]) U.quality = qs.get('q');
const save = () => { try { localStorage.setItem('petri', JSON.stringify(U)); } catch (e) {} };
if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('pt-touch');

const TOOLS = [['hand', 'Hand'], ['needle', 'Needle'], ['streak', 'Streak'], ['food', 'Food'], ['antibiotic', 'Antibiotic'], ['salt', 'Salt'], ['attract', 'Attractant'], ['erase', 'Scalpel']];
const OBJECTIVES = [['1×', SPAN_MM], ['4×', 24], ['10×', 9.6], ['40×', 2.4]];

let E;
try { E = await createEngine($('dish'), { quality: U.quality, seed: 2049 }); }
catch (err) { const f = $('pt-fail'); f.hidden = false; f.textContent = 'Petri needs WebGPU (Chrome, Edge, Safari 26+). ' + err.message; throw err; }
window.__petri = E;

// ---------------------------------------------------------------------------------------------- frame
document.body.append(h('div', '', '<div id="pt-cap">Petri</div>'), Object.assign(h('div'), { id: 'pt-menubar' }), Object.assign(h('div'), { id: 'pt-icons' }), Object.assign(h('div'), { id: 'pt-scale' }));
const menubar = $('pt-menubar'), status = Object.assign(h('div'), { id: 'pt-status' });

let openMenu = null;
const closeMenu = () => { if (openMenu) { openMenu.el.remove(); openMenu.top.classList.remove('open'); openMenu = null; } };
function menu(title, items) {
  const top = h('div', 'pt-mtop', title); menubar.append(top);
  top.addEventListener('pointerdown', (e) => {
    e.stopPropagation(); const was = openMenu && openMenu.top === top; closeMenu(); if (was) return;
    const el = h('div', 'pt-menu'); const r = top.getBoundingClientRect(); el.style.left = r.left + 'px'; el.style.top = r.bottom + 'px';
    for (const it of items()) {
      if (it === '-') { el.append(h('div', 'pt-sep')); continue; }
      const mi = h('div', 'pt-mi' + (it.chk ? ' chk' : '') + (it.head ? ' head' : ''), it.label);
      if (it.run) mi.addEventListener('click', () => { closeMenu(); it.run(); refresh(); });
      el.append(mi);
    }
    document.body.append(el); top.classList.add('open'); openMenu = { el, top };
  });
}
addEventListener('pointerdown', (e) => { if (openMenu && !openMenu.el.contains(e.target)) closeMenu(); });

// ---------------------------------------------------------------------------------------------- windows
const WINS = []; let zTop = 100;
const phone = () => Math.min(innerWidth, innerHeight) < 600;
function win(key, title, x, y, build, icon) {
  const el = h('div', 'pt'), inner = h('div', 'pt-in'), cap = h('div', 'pt-wcap'), capt = h('div', 'pt-capt', title), min = h('button', 'pt-min'), body = h('div', 'pt-body');
  cap.append(capt, min); inner.append(cap, body); el.append(inner); document.body.append(el);
  const W = { key, el, body, open: phone() ? false : (U.layout[key]?.open ?? true), x: U.layout[key]?.x ?? x, y: U.layout[key]?.y ?? y };
  const place = () => { W.x = clamp(W.x, 0, innerWidth - 80); W.y = clamp(W.y, 40, innerHeight - 60); el.style.left = W.x + 'px'; el.style.top = W.y + 'px'; el.classList.toggle('open', W.open); btn.classList.toggle('on', W.open); U.layout[key] = { open: W.open, x: W.x, y: W.y }; save(); };
  const front = () => { el.style.zIndex = ++zTop; WINS.forEach((o) => o.el.classList.toggle('active', o === W)); };
  el.addEventListener('pointerdown', front);
  capt.addEventListener('pointerdown', (e) => { const sx = e.clientX - W.x, sy = e.clientY - W.y; capt.setPointerCapture(e.pointerId);
    const mv = (m) => { W.x = m.clientX - sx; W.y = m.clientY - sy; place(); }; capt.addEventListener('pointermove', mv);
    capt.addEventListener('pointerup', () => capt.removeEventListener('pointermove', mv), { once: true }); });
  min.addEventListener('click', () => { W.open = false; place(); });
  const btn = h('button', 'pt-dicon'), cv = Object.assign(h('canvas'), { width: 32, height: 32 }); icon(cv.getContext('2d')); btn.append(cv, h('span', '', title));
  btn.addEventListener('click', () => { W.open = !W.open; if (W.open && phone()) WINS.forEach((o) => { if (o !== W && o.open) { o.open = false; o.place(); } });   /* a phone shows one sheet at a time */
    place(); if (W.open) front(); }); $('pt-icons').append(btn);
  W.toggle = () => btn.click(); W.place = place; build(body, W); place(); WINS.push(W); return W;
}
const row = (label, input, val) => { const r = h('div', val ? 'pt-row' : 'pt-row2'); r.append(h('span', '', label), input); if (val) r.append(val); return r; };
function slider(label, min, max, step, get, set, fmt = (v) => (+v).toFixed(step < 0.01 ? 4 : step < 1 ? 2 : 0)) {
  const inp = Object.assign(h('input'), { type: 'range', min, max, step }), val = h('span');
  const show = () => { inp.value = get(); val.textContent = fmt(get()); };
  inp.addEventListener('input', () => { set(parseFloat(inp.value)); val.textContent = fmt(get()); });
  const r = row(label, inp, val); r.show = show; show(); return r;
}
const button = (label, run) => { const b = h('button', 'pt-b', label); b.addEventListener('click', () => { run(); refresh(); }); return b; };
const group = (title, ...kids) => { const g = h('div', 'pt-grp'); g.append(h('b', '', title), ...kids); return g; };
const px = (c, x, y, w, hh, col) => { c.fillStyle = col; c.fillRect(x, y, w, hh); };
const disc = (c, x, y, r, col, line = '#000') => { c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.fillStyle = col; c.fill(); if (line) { c.strokeStyle = line; c.stroke(); } };

const refreshers = []; const refresh = () => refreshers.forEach((f) => f());
let flash = '', flashAt = 0;
const say = (t) => { flash = t; flashAt = performance.now(); };

// ---- Inoculate
win('inoc', 'Inoculate', 12, 60, (body) => {
  const tools = h('div', 'pt-brow'); const tb = {};
  for (const [k, label] of TOOLS) { tb[k] = button(label, () => { U.tool = k; save(); }); tb[k].style.flex = '1 0 30%'; tools.append(tb[k]); }
  const sel = h('select'); for (const cat of CATEGORIES) { const og = Object.assign(h('optgroup'), { label: cat }); CATALOG.filter((o) => o.category === cat).forEach((o) => og.append(Object.assign(h('option'), { value: o.id, textContent: o.name }))); sel.append(og); }
  sel.addEventListener('change', () => { U.organism = sel.value; U.radius = byId(sel.value).radius; if (U.tool === 'hand') U.tool = 'needle'; save(); refresh(); });
  const rad = slider('radius mm', 0.1, 8, 0.05, () => U.radius, (v) => { U.radius = v; save(); });
  const xin = Object.assign(h('input'), { type: 'number', step: 0.05, value: 0 }), yin = Object.assign(h('input'), { type: 'number', step: 0.05, value: 0 });
  const xy = h('div', 'pt-brow'); xy.append(xin, yin, button('Place', () => act([+xin.value || 0, +yin.value || 0], null, U.tool === 'hand' ? 'needle' : U.tool)));
  const snap = h('label', 'chk', '<input type="checkbox"> snap to 0.5 mm'), med = h('label', 'chk', '<input type="checkbox"> pour this organism\'s medium on a fresh dish');
  snap.firstChild.addEventListener('change', (e) => { U.snap = e.target.checked; save(); }); med.firstChild.addEventListener('change', (e) => { U.medium = e.target.checked; save(); });
  const note = h('div', 'pt-note');
  body.append(tools, group('Organism', sel, note), rad, group('Place at x, y (mm from the centre)', xy), snap, med);
  refreshers.push(() => { for (const k in tb) tb[k].classList.toggle('on', U.tool === k); sel.value = U.organism; rad.show(); snap.firstChild.checked = U.snap; med.firstChild.checked = U.medium;
    const o = byId(U.organism); note.textContent = `${KERNELS[o.kernel]} kernel · medium: nutrient ${o.dish.nutrient}, agar ${o.dish.agar}`; $('dish').classList.toggle('hand', U.tool === 'hand'); });
}, (c) => { px(c, 15, 2, 2, 20, '#808080'); px(c, 14, 2, 4, 8, '#000080'); c.strokeStyle = '#000'; c.beginPath(); c.arc(16, 25, 4, 0, 6.2832); c.stroke(); disc(c, 16, 25, 1.5, '#ff0', null); });

// ---- Organism (slots + the selected slot's kernel parameters)
win('org', 'Organism', 12, 430, (body) => {
  const list = h('div'), pane = h('div'); body.append(list, pane); let sig = '';
  refreshers.push(() => {
    const slots = E.sim.slots, s2 = slots.map((s) => (s ? s.org : '')).join('|') + '#' + U.slot; if (s2 === sig) return; sig = s2;
    list.innerHTML = ''; pane.innerHTML = '';
    if (!slots.some(Boolean)) { list.append(h('div', 'pt-note', 'No organisms on this dish yet. Pick one in Inoculate and place it with the needle.')); return; }
    slots.forEach((sl, i) => { if (!sl) return; const r = h('div', 'pt-slot' + (i === U.slot ? ' on' : ''), `<i style="background:${sl.ramp[2]}"></i><span>${sl.name}</span><small>${KERNELS[sl.kernel]}</small>`); r.addEventListener('click', () => { U.slot = i; refresh(); }); list.append(r); });
    const sl = slots[U.slot]; if (!sl) return;
    const g = group(KERNELS[sl.kernel].toLowerCase() + ' parameters');
    for (const [label, pq, idx, min, max, step] of KPARAMS[sl.kernel] || []) g.append(slider(label, min, max, step, () => sl[pq][idx], (v) => { const P = [...sl.P], Q = [...sl.Q]; (pq === 'P' ? P : Q)[idx] = v; E.op({ tool: 'param', slot: U.slot, P, Q }); }));
    pane.append(g);
  });
}, (c) => { c.strokeStyle = '#808000'; c.lineWidth = 2; c.beginPath(); c.moveTo(16, 30); c.lineTo(16, 16); c.lineTo(7, 6); c.moveTo(16, 16); c.lineTo(25, 7); c.moveTo(16, 22); c.lineTo(24, 18); c.moveTo(11, 10); c.lineTo(5, 12); c.stroke(); disc(c, 16, 30, 2, '#ff0'); });

// ---- Dish
let nextNutrient = E.sim.dish.nutrient;
win('dish', 'Dish', innerWidth - 290, 60, (body) => {
  const play = button('Play', () => { E.playing = !E.playing; }), stepB = button('Step', () => { E.playing = false; E.step(1); });
  const spd = h('select'); [1, 2, 4, 8, 16].forEach((k) => spd.append(Object.assign(h('option'), { value: k, textContent: k + ' step' + (k > 1 ? 's' : '') + ' / frame' }))); spd.addEventListener('change', () => { E.spf = +spd.value; });
  const tr = h('div', 'pt-brow'); tr.append(play, stepB);
  const nut = slider('nutrient', 0.05, 1.5, 0.01, () => nextNutrient, (v) => { nextNutrient = v; });
  const agar = slider('agar hardness', 0, 1, 0.01, () => E.sim.dish.agar, (v) => E.op({ tool: 'dish', agar: v }));
  const temp = slider('temperature', 0.2, 1.5, 0.01, () => E.sim.dish.temp, (v) => E.op({ tool: 'dish', temp: v }), (v) => (16 + 8 * v).toFixed(1) + ' °C');
  const seed = Object.assign(h('input'), { type: 'number', value: E.sim.seed });
  const qual = h('select'); Object.keys(QUALITY).forEach((k) => qual.append(Object.assign(h('option'), { value: k, textContent: `${k} — ${QUALITY[k].n}², ${(SPAN_MM / QUALITY[k].n * 1000).toFixed(0)} µm cells` }))); qual.value = E.quality;
  qual.addEventListener('change', () => { U.quality = qual.value; save(); location.search = '?q=' + qual.value; });
  const pour = h('div', 'pt-brow'); pour.append(button('Pour a new dish', () => { E.playing = false; E.newDish({ seed: +seed.value || 1, nutrient: nextNutrient }); }));
  const out = h('div', 'pt-note'); const meas = h('div', 'pt-brow'); meas.append(button('Measure', async () => { const st = await E.stats(); out.innerHTML = `agents ${st.agents.toLocaleString()} · ${E.agentBlocksFree().toLocaleString()} blocks free<br>` + st.slots.map((s) => `${s.name}: ${s.area_mm2} mm²`).join('<br>'); }));
  body.append(tr, row('speed', spd), group('Medium', nut, agar, temp, h('div', 'pt-note', 'Nutrient is set when the dish is poured; agar hardness and temperature act at once.')), group('Plate', row('seed', seed), row('quality', qual), pour), group('Telemetry', meas, out));
  refreshers.push(() => { play.textContent = E.playing ? 'Pause' : 'Play'; play.classList.toggle('on', E.playing); nut.show(); agar.show(); temp.show(); });
}, (c) => { c.lineWidth = 1; disc(c, 16, 16, 13, '#c0c0c0'); disc(c, 16, 16, 11, '#808000'); disc(c, 12, 13, 3, '#ff0', null); disc(c, 20, 19, 2, '#fff', null); disc(c, 19, 11, 1.5, '#0ff', null); });

// ---- View
win('view', 'View', innerWidth - 290, 470, (body) => {
  const mode = h('select'); MODES.forEach((m, i) => mode.append(Object.assign(h('option'), { value: i, textContent: (i < 4 ? '' : 'debug · ') + m }))); mode.addEventListener('change', () => { E.view.mode = +mode.value; });
  const obj = h('div', 'pt-brow'); OBJECTIVES.forEach(([label, mm]) => obj.append(button(label, () => E.fieldWidth(mm))));
  const exp = slider('exposure', 0.3, 3, 0.01, () => E.view.exposure, (v) => { E.view.exposure = v; });
  const ret = h('label', 'chk', '<input type="checkbox"> reticle'); ret.firstChild.addEventListener('change', (e) => { E.view.reticle = e.target.checked; });
  const cen = h('div', 'pt-brow'); cen.append(button('Whole dish', () => { E.view.center = [0, 0]; E.fieldWidth(SPAN_MM); }));
  body.append(row('light', mode), group('Objective', obj), exp, ret, cen);
  refreshers.push(() => { mode.value = E.view.mode; exp.show(); ret.firstChild.checked = E.view.reticle; });
}, (c) => { px(c, 13, 2, 6, 6, '#808080'); px(c, 11, 8, 10, 12, '#c0c0c0'); c.strokeStyle = '#000'; c.strokeRect(11.5, 8.5, 9, 11); px(c, 13, 20, 6, 4, '#000080'); px(c, 6, 27, 20, 3, '#808080'); c.strokeRect(6.5, 27.5, 19, 2); });

// ---------------------------------------------------------------------------------------------- menus
const download = (name, text) => { const a = Object.assign(h('a'), { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: name }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
menu('Dish', () => [
  { label: E.playing ? 'Pause	Space' : 'Play	Space', run: () => { E.playing = !E.playing; } }, { label: 'Step	.', run: () => { E.playing = false; E.step(1); } }, '-',
  { label: 'Pour a new dish', run: () => { E.playing = false; E.newDish({ nutrient: nextNutrient }); } }, '-',
  { label: 'Save Dish ID…', run: () => download(`dish-${E.sim.seed}-${E.sim.step}.json`, JSON.stringify(E.exportID(), null, 1)) },
  { label: 'Open Dish ID…', run: () => { const f = Object.assign(h('input'), { type: 'file', accept: '.json,application/json' }); f.addEventListener('change', async () => { try { E.playing = false; E.importID(JSON.parse(await f.files[0].text())); refresh(); } catch (e) { alert('Not a Dish ID: ' + e.message); } }); f.click(); } },
]);
menu('Organism', () => CATEGORIES.flatMap((cat) => [{ label: cat, head: true }, ...CATALOG.filter((o) => o.category === cat).map((o) => ({ label: o.name, chk: o.id === U.organism, run: () => { U.organism = o.id; U.radius = o.radius; U.tool = 'needle'; save(); } }))]));
menu('View', () => [...MODES.map((m, i) => ({ label: (i < 4 ? '' : 'Debug: ') + m, chk: E.view.mode === i, run: () => { E.view.mode = i; } })).flatMap((it, i) => (i === 4 ? ['-', it] : [it])), '-',
  { label: 'Reticle', chk: E.view.reticle, run: () => { E.view.reticle = !E.view.reticle; } }, '-', ...OBJECTIVES.map(([label, mm]) => ({ label: 'Objective ' + label, run: () => E.fieldWidth(mm) }))]);
menu('Window', () => WINS.map((W) => ({ label: W.el.querySelector('.pt-capt').textContent, chk: W.open, run: W.toggle })));
menu('Help', () => [{ label: 'Study and specification', run: () => open('study/00-summary-and-spec.md') }, { label: `${CATALOG.length} organisms on ${KERNELS.length - 1} kernels`, head: true }]);
menubar.append(status);

// ---------------------------------------------------------------------------------------------- acting on the dish
const snapMm = (mm) => (U.snap ? mm.map((v) => Math.round(v * 2) / 2) : mm);
function act(mm, path, tool = U.tool) {
  const r = U.radius, at = snapMm(mm);
  if (Math.hypot(at[0], at[1]) > 45) return;
  switch (tool) {
    case 'needle': case 'streak': {
      const o = byId(U.organism);
      if (U.medium && E.sim.ops.length === 0 && o.dish) { E.newDish({ nutrient: o.dish.nutrient, agar: o.dish.agar }); nextNutrient = o.dish.nutrient; }
      const ok = E.op(path ? { tool: 'inoculate', organism: o.id, path, r } : { tool: 'inoculate', organism: o.id, at, r });
      if (!ok) { say(E.lastRefusal || 'nothing placed'); } else { U.slot = E.sim.slots.findIndex((s) => s && s.org === o.id); if (!E.playing && E.sim.step === 0) E.playing = true; }
      break;
    }
    case 'food': E.op({ tool: 'nutrient', at, r, amount: 3 }); break;
    case 'antibiotic': E.op({ tool: 'toxin', at, r, amount: 1 }); break;
    case 'salt': E.op({ tool: 'toxin', at, r, amount: 0.5 }); break;
    case 'attract': E.op({ tool: 'attract', at, r, amount: 1 }); break;
    case 'erase': E.op(path ? { tool: 'erase', path, r } : { tool: 'erase', at, r }); break;
  }
  refresh();
}
const cv = $('dish'), ptrs = new Map(); let drag = null;
cv.addEventListener('contextmenu', (e) => e.preventDefault());
cv.addEventListener('wheel', (e) => { e.preventDefault(); E.zoomAt(e.clientX, e.clientY, Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))); }, { passive: false });
cv.addEventListener('pointerdown', (e) => {
  cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; drag = { pinch: Math.hypot(a[0] - b[0], a[1] - b[1]) }; return; }
  const pan = U.tool === 'hand' || e.button !== 0 || e.shiftKey;
  if (pan) { drag = { pan: [e.clientX, e.clientY] }; cv.classList.add('drag'); }
  else if (U.tool === 'streak' || U.tool === 'erase') drag = { path: [snapMm(E.screenToMm(e.clientX, e.clientY))] };
  else act(E.screenToMm(e.clientX, e.clientY));
});
cv.addEventListener('pointermove', (e) => {
  const mm = E.screenToMm(e.clientX, e.clientY); E.view.cursor = snapMm(mm); E.view.toolR = U.radius; E.view.ghost = U.tool !== 'hand' && e.pointerType !== 'touch';
  if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  if (!drag) return;
  if (drag.pinch && ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); E.zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, drag.pinch / Math.max(d, 1)); drag.pinch = d; }
  else if (drag.pan) { E.view.center[0] -= (e.clientX - drag.pan[0]) * E.view.mmPerPx; E.view.center[1] += (e.clientY - drag.pan[1]) * E.view.mmPerPx; drag.pan = [e.clientX, e.clientY]; }
  else if (drag.path) { const p = snapMm(mm), q = drag.path[drag.path.length - 1]; if (Math.hypot(p[0] - q[0], p[1] - q[1]) >= Math.max(U.radius * 0.6, E.cellMm)) drag.path.push(p); }
});
const up = (e) => { ptrs.delete(e.pointerId); cv.classList.remove('drag'); if (drag && drag.path) act(drag.path[0], drag.path.length > 1 ? drag.path : null); drag = null; };
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
cv.addEventListener('pointerleave', () => { E.view.ghost = false; });
addEventListener('keydown', (e) => {
  if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  if (e.code === 'Space') { e.preventDefault(); E.playing = !E.playing; } else if (e.key === '.') { E.playing = false; E.step(1); }
  else if (e.key >= '1' && e.key <= '4') E.fieldWidth(OBJECTIVES[+e.key - 1][1]); else if (e.key === 'h') U.tool = 'hand'; else if (e.key === 'n') U.tool = 'needle'; else return;
  refresh();
});

// ---------------------------------------------------------------------------------------------- status + scale bar
const fmtT = (s) => [s / 3600, (s / 60) % 60, s % 60].map((v) => String(Math.floor(v)).padStart(2, '0')).join(':');
let tick = 0;
E.onFrame = () => {
  if (++tick % 6) return;
  const c = E.view.cursor, r = Math.hypot(c[0], c[1]), th = (Math.atan2(c[1], c[0]) * 180 / Math.PI + 360) % 360, fw = E.view.mmPerPx * cv.clientWidth;
  if (flash && performance.now() - flashAt > 4000) flash = '';
  status.textContent = (flash ? flash + '   ·   ' : '') + `${fmtT(E.sim.step)}  ·  step ${E.sim.step}  ·  x ${c[0].toFixed(2)}  y ${c[1].toFixed(2)} mm  ·  r ${r.toFixed(2)}  θ ${th.toFixed(0)}°  ·  field ${fw >= 1 ? fw.toFixed(1) + ' mm' : (fw * 1000).toFixed(0) + ' µm'}  ·  ${E.frameMs.toFixed(0)} ms`;
  const target = E.view.mmPerPx * 120, nice = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20].reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a));
  $('pt-scale').innerHTML = `${nice >= 1 ? nice + ' mm' : nice * 1000 + ' µm'}<i style="width:${(nice / E.view.mmPerPx).toFixed(0)}px"></i>`;
  if (E.sim.slots.some(Boolean)) refreshers[1]();
};
addEventListener('resize', () => WINS.forEach((W) => W.place()));
E.fieldWidth(SPAN_MM * Math.max(1, cv.clientWidth / Math.max(cv.clientHeight, 1)));
refresh(); E.start();
if (qs.has('harness')) { const H = await import('./harness.js'); window.__petriHarness = H; }
