// lab.js — the algorithm lab (spec §12.3). Load fixtures, image sequences or video (Mediabunny), run them
// through the Mosh Loop, edit the stack live, inspect the motion field (arrows, grid, SAD, flags, truth),
// compare against the CPU reference, export PNGs. The config lives in the URL hash as a Mosh ID.
import { createShell, control, h, $ } from './shell.js';
import { createGPU, createImage, upload, readback, createPresenter, F16 } from './gpu.js';
import { probe } from './platform.js';
import { FIXTURES, fixture } from './fixtures.js';
import { createMoshLoop } from './engine.js';
import { createLoopRef, fieldEPE, FLAG } from './engine-ref.js';
import { SCHEMA, OPS, FX, opDefaults, fxDefaults, normalize, PRESETS, LEGACY, toMoshID, fromMoshID } from './config.js';
import { fromHalfArray, toHalfArray } from './util.js';
import { compare, to8 } from './metrics.js';
import { holdAt } from './params.js';
import { deviceWindow, testsWindow } from './panels.js';

const S = createShell({ key: 'moshine-lab', title: 'MOSHINE — Lab', state: { res: 320, view: 'output', ov: { field: true, grid: false, sad: false, flags: true, truth: true }, fps: 30, loop: true, maxFrames: 300 } });
const U = S.U;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

let gpu, P;
try { gpu = await createGPU(); P = await probe(gpu.adapter); }
catch (err) { S.fail('The MOSHINE lab needs WebGPU (Chrome or Edge, Safari 26+, Firefox 141+ on Windows and macOS). ' + err.message); throw err; }
const present = createPresenter(gpu, S.view);

// ------------------------------------------------------------------------------------------------ config
const hashArgs = new URLSearchParams(location.hash.slice(1));
let cfg = (hashArgs.get('id') && fromMoshID(hashArgs.get('id'))) || normalize(PRESETS['Xvid classic']);
let presetName = hashArgs.get('id') ? 'custom' : 'Xvid classic';

// ------------------------------------------------------------------------------------------------ sources
const evenFit = (w, h, long) => { const k = Math.min(1, long / Math.max(w, h)); return [Math.max(16, Math.round((w * k) / 2) * 2), Math.max(16, Math.round((h * k) / 2) * 2)]; };
function fixtureSource(name, res) {
  const w = res, hh = Math.round((res * 9) / 16 / 2) * 2, f = fixture(name, { w, h: hh });
  return { kind: 'fixture', name: 'fixture ' + name, w, h: hh, count: f.count, fx: f,
    upload(tex, t) { upload(gpu, tex, f.frame(clamp(t, 0, f.count - 1))); }, async f32(t) { return fromHalfArray(toHalfArray(f.frame(clamp(t, 0, f.count - 1)))); } };
}
function bitmapSource(name, frames, w, hh) {
  return { kind: 'bitmaps', name, w, h: hh, count: frames.length, frames,
    upload(tex, t) { gpu.device.queue.copyExternalImageToTexture({ source: frames[clamp(t, 0, frames.length - 1)] }, { texture: tex }, [w, hh]); },
    async f32(t) { const x = createImage(gpu, w, hh, F16); this.upload(x, t); const r = fromHalfArray(await readback(gpu, x)); x.destroy(); return r; } };
}
/** Raw rgb24 frames (the fidelity bench's sets). */
async function rawSource(name, url, w, hh, count) {
  const buf = new Uint8Array(await (await fetch(url)).arrayBuffer()), fb = w * hh * 3, n = Math.min(count, Math.floor(buf.length / fb));
  const rgbaOf = (t) => { const o = new Float32Array(w * hh * 4), b = buf.subarray(t * fb, (t + 1) * fb); for (let i = 0; i < w * hh; i++) { o[i * 4] = b[i * 3] / 255; o[i * 4 + 1] = b[i * 3 + 1] / 255; o[i * 4 + 2] = b[i * 3 + 2] / 255; o[i * 4 + 3] = 1; } return o; };
  return { kind: 'raw', name, w, h: hh, count: n, rgbaOf: (t) => rgbaOf(clamp(t, 0, n - 1)),
    upload(tex, t) { upload(gpu, tex, rgbaOf(clamp(t, 0, n - 1))); }, async f32(t) { return fromHalfArray(toHalfArray(rgbaOf(clamp(t, 0, n - 1)))); } };
}
async function loadImages(files, size) {
  files = [...files].filter((f) => f.type.startsWith('image/')).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (!files.length) throw new Error('no images');
  const first = await createImageBitmap(files[0]); const [w, hh] = size || evenFit(first.width, first.height, U.res); first.close();
  const frames = [];
  for (const f of files) { frames.push(await createImageBitmap(f, { resizeWidth: w, resizeHeight: hh, resizeQuality: 'high' })); note(`loading ${frames.length} / ${files.length}`); }
  return bitmapSource(`${files.length} image${files.length > 1 ? 's' : ''} (${files[0].name}…)`, frames, w, hh);
}
async function loadVideo(file, size) {
  const MB = await import('./vendor/mediabunny-1.61.3.min.mjs');
  const input = new MB.Input({ formats: MB.ALL_FORMATS, source: new MB.BlobSource(file) });
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error('no video track');
  if (!(await track.canDecode())) throw new Error('this browser cannot decode ' + (track.codec || 'the video codec'));
  const [w, hh] = size || evenFit(track.displayWidth, track.displayHeight, U.res);
  const sink = new MB.CanvasSink(track, { width: w, height: hh, fit: 'fill' }), frames = [];
  for await (const wc of sink.canvases()) { frames.push(await createImageBitmap(wc.canvas)); if (frames.length % 10 === 0) note(`decoding ${frames.length} frames…`); if (frames.length >= U.maxFrames) break; }
  return bitmapSource(`${file.name} (${frames.length} f)`, frames, w, hh);
}
const pick = (accept, multiple) => new Promise((res) => { const i = h('input'); i.type = 'file'; i.accept = accept; i.multiple = multiple; i.onchange = () => res(i.files); i.click(); });

// ------------------------------------------------------------------------------------------------ engine state
let src = fixtureSource(hashArgs.get('src') || 'cut', U.res), src2 = null, loop, T = {}, t = 0, last = null, epe = null, frameMs = 0;
function rebuild() {
  if (U.view === 'cpu diff') U.view = 'output';
  if (fid && !(src.kind === 'raw' && src.name === `fidelity ${fid.name}`)) fid = null;
  if (loop) { loop.destroy(); Object.values(T).forEach((x) => x && x.destroy()); }
  loop = createMoshLoop(gpu, { w: src.w, h: src.h }, cfg);
  T = { src: createImage(gpu, src.w, src.h, F16, 'lab src'), src2: createImage(gpu, src.w, src.h, F16, 'lab src2'), view: createImage(gpu, src.w, src.h, F16, 'lab view'), cpu: null };
  S.setAspect(src.w / src.h); t = 0; cpuDiff = null;
}
function stepFrame(k) {
  src.upload(T.src, k); if (src2) src2.upload(T.src2, k);
  return loop.step(k, { src: T.src, src2: src2 ? T.src2 : null });
}
let busy = false, pending = null;
/** Replay from the I-frame to `to` (deterministic; the checkpoint cache arrives in M6). */
async function seek(to) {
  if (busy) { pending = to; return; }
  busy = true; to = clamp(to, 0, src.count - 1); loop.begin(0);
  for (let k = 0; k <= to; k++) { last = stepFrame(k); if (k % 40 === 39) { note(`replaying ${k + 1} / ${to + 1}`); await gpu.device.queue.onSubmittedWorkDone(); } }
  t = to; busy = false; note(''); await shown();
  if (pending !== null) { const p = pending; pending = null; seek(p); }
}
async function advance() {
  if (busy) return;
  if (t + 1 >= src.count) { if (!U.loop) { playing = false; refresh(); return; } return seek(0); }
  busy = true; const t0 = performance.now(); last = stepFrame(++t);
  gpu.device.queue.onSubmittedWorkDone().then(() => { frameMs = frameMs ? frameMs * 0.9 + (performance.now() - t0) * 0.1 : performance.now() - t0; });
  busy = false; await shown();
}

// ------------------------------------------------------------------------------------------------ view + overlays + metrics
let cpuDiff = null, reading = false;
async function shown() {
  draw();
  if (reading) return; reading = true;
  const r = await loop.readLast(); reading = false; if (!r) return;
  const f = src.fx; epe = null;
  if (f && r.est && !src2 && t > 0 && (f.cut === null || t !== f.cut)) epe = fieldEPE(r.est, f.field(t), f.exactMask(t), f);
  overlay(r); metrics(r);
  if (fid && src2) fidelityLive();
}
function draw() {
  const v = U.view;
  if (v === 'source' || (v === 'source2' && !src2)) { src.upload(T.view, t); present.draw(T.view); }
  else if (v === 'source2') { src2.upload(T.view, t); present.draw(T.view); }
  else if (v === 'split') { src.upload(T.view, t); present.draw(last.display, { b: T.view, split: 0.5 }); }
  else if (v === 'a/b' && src2) { src2.upload(T.view, t); present.draw(last.display, { b: T.view, split: 0.5 }); }
  else if (v === 'cpu diff' && cpuDiff && cpuDiff.t === t) present.draw(last.display, { b: T.cpu, diff: 8 });
  else present.draw(last.display);
  const hold = holdAt(t, cfg.bloom, 0);
  S.ov.textContent = `f ${String(t).padStart(4, '0')} / ${src.count - 1}   ${v.toUpperCase()}${hold >= 0 ? `   BLOOM k=${hold}` : ''}${busy ? '   replaying…' : ''}`;
  scrubMarks(); refresh();
}
function overlay(r) {
  const c = S.overlay, dpr = devicePixelRatio || 1, W = c.clientWidth, H = c.clientHeight;
  if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
  const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const O = U.ov, fld = r.field; if (!fld || U.view === 'cpu diff') return;
  const B = cfg.block, bw = Math.ceil(src.w / B), bh = Math.ceil(src.h / B), k = W / src.w;
  if (O.sad) for (let i = 0; i < bw * bh; i++) { const a = Math.min(1, fld[i * 4 + 2] / cfg.estimate.cutMad) * 0.55; if (a > 0.02) { g.fillStyle = `rgba(255,40,20,${a})`; g.fillRect((i % bw) * B * k, Math.floor(i / bw) * B * k, B * k, B * k); } }
  if (O.grid) { g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1; g.beginPath(); for (let x = 0; x <= bw; x++) { g.moveTo(x * B * k, 0); g.lineTo(x * B * k, H); } for (let y = 0; y <= bh; y++) { g.moveTo(0, y * B * k); g.lineTo(W, y * B * k); } g.stroke(); }
  if (O.flags) for (let i = 0; i < bw * bh; i++) {
    const x = (i % bw) * B * k, y = Math.floor(i / bw) * B * k, fl = fld[i * 4 + 3];
    if (fl & FLAG.lost) { g.fillStyle = 'rgba(200,0,255,.35)'; g.fillRect(x, y, B * k, B * k); }
    else if (fl & FLAG.skip) { g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(x + B * k / 2 - 1.5, y + B * k / 2 - 1.5, 3, 3); }
    if (cfg.intra.rate > 0 && fld[i * 4 + 2] > cfg.intra.mad) { g.strokeStyle = 'rgba(255,230,0,.8)'; g.strokeRect(x + 1, y + 1, B * k - 2, B * k - 2); }
  }
  if (O.field) {
    g.lineWidth = 1.2; g.strokeStyle = r.hold > 0 ? 'rgba(0,230,255,.9)' : 'rgba(255,170,40,.95)'; g.beginPath();
    const step = bw > 80 ? 2 : 1;
    for (let by = 0; by < bh; by += step) for (let bx = 0; bx < bw; bx += step) {
      const i = by * bw + bx, cx = (bx + 0.5) * B * k, cy = (by + 0.5) * B * k, mx = fld[i * 4] * k, my = fld[i * 4 + 1] * k;
      if (Math.abs(mx) + Math.abs(my) < 0.3) continue;
      g.moveTo(cx - mx, cy - my); g.lineTo(cx, cy);                                    // content moved from p - mv to p
      const a = Math.atan2(my, mx); g.moveTo(cx, cy); g.lineTo(cx - 4 * Math.cos(a - 0.5), cy - 4 * Math.sin(a - 0.5)); g.moveTo(cx, cy); g.lineTo(cx - 4 * Math.cos(a + 0.5), cy - 4 * Math.sin(a + 0.5));
    }
    g.stroke();
  }
  if (O.truth && src.fx && r.est && t > 0) {
    const f = src.fx, tr = f.field(t), m = f.exactMask(t); g.strokeStyle = 'rgba(255,0,0,.95)'; g.lineWidth = 2;
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
      const i = by * bw + bx; if (!m[Math.min(src.h - 1, by * B + (B >> 1)) * src.w + Math.min(src.w - 1, bx * B + (B >> 1))]) continue;
      if (Math.hypot(r.est[i * 4] - tr[i * 2], r.est[i * 4 + 1] - tr[i * 2 + 1]) > 0.5) g.strokeRect(bx * B * k + 1, by * B * k + 1, B * k - 2, B * k - 2);
    }
  }
}

// ------------------------------------------------------------------------------------------------ windows
const note = (s) => { S.hint.textContent = s; };
const kvRows = (rows) => rows.map(([k, v, cls]) => `<span>${k}</span><span${cls ? ` class="${cls}"` : ''}>${v}</span>`).join('');

// Input
const inp = h('div');
function inputUI() {
  inp.innerHTML = '';
  const g1 = h('div', 'ms-grp', '<b>Source</b>'), sel = h('select'); sel.append(new Option('— loaded file —', '', false, src.kind !== 'fixture'));
  for (const n of Object.keys(FIXTURES)) sel.append(new Option('fixture: ' + n, n, false, src.kind === 'fixture' && src.name === 'fixture ' + n));
  sel.addEventListener('change', () => { if (!sel.value) return; src = fixtureSource(sel.value, U.res); setURL(); rebuild(); seek(0); inputUI(); });
  const b1 = h('div', 'ms-brow'), bi = h('button', 'ms-b', 'IMAGES…'), bv = h('button', 'ms-b', 'VIDEO…'); b1.append(bi, bv);
  bi.onclick = async () => { const f = await pick('image/*', true); if (!f || !f.length) return; try { src = await loadImages(f); src2 = null; rebuild(); seek(0); inputUI(); note(src.name); } catch (e) { note('images: ' + e.message); } };
  bv.onclick = async () => { const f = await pick('video/*,.mp4,.mov,.webm,.mkv', false); if (!f || !f.length) return; try { note('opening ' + f[0].name); src = await loadVideo(f[0]); src2 = null; rebuild(); seek(0); inputUI(); note(src.name); } catch (e) { note('video: ' + e.message); } };
  g1.append(control({ v: src.name }, 'v', [[src.name], src.name], () => {}, 'now'), sel, b1);
  const g2 = h('div', 'ms-grp', '<b>Source 2 (motion source, reset image)</b>'), sel2 = h('select'); sel2.append(new Option('none', '', false, !src2));
  for (const n of Object.keys(FIXTURES)) sel2.append(new Option('fixture: ' + n, n, false, !!src2 && src2.name === 'fixture ' + n));
  if (src2 && src2.kind !== 'fixture') sel2.append(new Option(src2.name, '#', false, true));
  sel2.addEventListener('change', () => { if (sel2.value === '#') return; src2 = sel2.value ? fixtureSource(sel2.value, src.w) : null; if (src2 && (src2.w !== src.w || src2.h !== src.h)) { note('fixture size differs from source 1'); src2 = null; } seek(t); inputUI(); });
  const b2 = h('div', 'ms-brow'), bi2 = h('button', 'ms-b', 'IMAGES…'), bv2 = h('button', 'ms-b', 'VIDEO…'); b2.append(bi2, bv2);
  bi2.onclick = async () => { const f = await pick('image/*', true); if (!f || !f.length) return; try { src2 = await loadImages(f, [src.w, src.h]); seek(t); inputUI(); } catch (e) { note('images: ' + e.message); } };
  bv2.onclick = async () => { const f = await pick('video/*,.mp4,.mov,.webm,.mkv', false); if (!f || !f.length) return; try { src2 = await loadVideo(f[0], [src.w, src.h]); seek(t); inputUI(); } catch (e) { note('video: ' + e.message); } };
  g2.append(sel2, b2, h('div', 'ms-note', 'Used when Estimate ▸ source = source2 (Motion Hijack) or Reset ▸ source = source2 (still as I-frame, Echo Projection). Resized to source 1.'));
  const g3 = h('div', 'ms-grp', '<b>Lab resolution</b>');
  g3.append(control(U, 'res', [[320, 480, 640, 960, 1280, 1920], 320], () => { S.save(); if (src.kind === 'fixture') { src = fixtureSource(src.name.replace('fixture ', ''), U.res); rebuild(); seek(0); } else note('applies to the next load'); }, 'long side'),
    control(U, 'maxFrames', [30, 1800, 30, 300], () => S.save(), 'max frames'),
    h('div', 'ms-note', `${src.w}×${src.h} · ${src.count} frames · block ${cfg.block} → ${Math.ceil(src.w / cfg.block)}×${Math.ceil(src.h / cfg.block)} blocks`));
  inp.append(g1, g2, g3);
}

// Stack
const stk = h('div');
function stackUI() {
  stk.innerHTML = '';
  const top = h('div', 'ms-grp', '<b>Mosh Loop</b>'), ps = h('select');
  ps.append(new Option('custom', 'custom', false, presetName === 'custom')); for (const n of [...Object.keys(PRESETS), ...Object.keys(LEGACY)]) ps.append(new Option(n, n, false, n === presetName));
  ps.addEventListener('change', () => { if (ps.value === 'custom') return; presetName = ps.value; cfg = normalize(JSON.parse(JSON.stringify(PRESETS[ps.value] || LEGACY[ps.value]))); applied(true); });
  const br = h('div', 'ms-brow'), cp = h('button', 'ms-b', 'COPY MOSH ID'), rs = h('button', 'ms-b', 'NEW SEED'); br.append(cp, rs);
  cp.onclick = async () => { try { await navigator.clipboard.writeText(location.href); note('Mosh ID link copied'); } catch (e) { note('copy failed: ' + e.message); } };
  rs.onclick = () => { cfg.seed = (Math.random() * 1e6) | 0; changed(true); };
  top.append(control({ p: 0 }, 'p', [[0], 0], () => {}, 'preset'), br, control(cfg, 'block', [[8, 16, 32], 16], () => changed(true), 'block'), control(cfg, 'seed', [0, 999999, 1, 1], () => changed(), 'seed'));
  top.querySelector('.ms-row-sel select').replaceWith(ps);
  stk.append(top, section('estimate'), listBox('ops', 'Field ops (in order)', OPS, 'op', opDefaults, '+ add field op…'),
    section('bloom'), section('warp'), section('residual'), section('intra'), section('reset'),
    listBox('inLoop', 'In-loop effects (accumulate)', FX, 'fx', fxDefaults, '+ add in-loop effect…'),
    listBox('post', 'Post effects (after the loop)', FX, 'fx', fxDefaults, '+ add post effect…'));
}
/** An ordered, reorderable list of entries (field ops or effects) with on/off, ▲ ▼ and ×. */
function listBox(key, title, catalogue, kind, defs, addLabel) {
  const box = h('div', 'ms-grp', `<b>${title}</b>`), list = cfg[key];
  list.forEach((o, i) => {
    const g = h('div', 'ms-grp' + (o.on === false ? ' off' : ''), `<b>${i + 1} ▸ ${catalogue[o[kind]].label}</b>`), tools = h('span', 'ms-tools');
    for (const [lbl, fn] of [['on', () => { o.on = o.on === false; }], ['▲', () => { if (i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]]; }], ['▼', () => { if (i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]]; }], ['×', () => { list.splice(i, 1); }]]) {
      const b = h('button', '', lbl); if (lbl === 'on') b.textContent = o.on === false ? 'off' : 'on'; b.onclick = () => { fn(); changed(true); }; tools.append(b);
    }
    g.append(tools); for (const [k, spec] of Object.entries(catalogue[o[kind]].params)) g.append(control(o, k, spec, () => changed()));
    box.append(g);
  });
  const add = h('select'); add.append(new Option(addLabel, '')); for (const [k, v] of Object.entries(catalogue)) add.append(new Option(v.label, k));
  add.addEventListener('change', () => { if (add.value) { list.push(defs(add.value)); changed(true); } });
  box.append(h('div', 'ms-brow')); box.lastChild.append(add);
  return box;
}
function section(key) {
  const s = SCHEMA[key], g = h('div', 'ms-grp', `<b>${s.label}</b>`);
  for (const [k, spec] of Object.entries(s.params)) g.append(control(cfg[key], k, spec, () => changed()));
  if (key === 'bloom') {
    const hits = h('input'); hits.type = 'text'; hits.placeholder = 'hit frames, e.g. 30, 64, 97'; hits.value = (cfg.bloom.hits || []).join(', ');
    hits.addEventListener('change', () => { cfg.bloom.hits = hits.value.split(/[ ,;]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0); changed(); });
    const row = h('div', 'ms-row ms-row-sel'); row.append(h('span', '', 'hits'), hits); g.append(row);
  }
  return g;
}
let changeTimer = 0;
function changed(rebuildUI = false) { presetName = 'custom'; applied(rebuildUI); }
function applied(rebuildUI) {
  loop.setConfig(cfg); setURL(); cpuDiff = null; if (U.view === 'cpu diff') U.view = 'output';
  if (rebuildUI) { stackUI(); inputUI(); }
  cancelAnimationFrame(changeTimer); changeTimer = requestAnimationFrame(() => seek(t));
}
function setURL() { const a = new URLSearchParams(); a.set('id', toMoshID(cfg)); if (src.kind === 'fixture') a.set('src', src.name.replace('fixture ', '')); history.replaceState(null, '', '#' + a.toString()); }

// Metrics
const met = h('div'), metKV = h('div', 'ms-kv'), cpuRes = h('div', 'ms-note');
const cpuBtn = h('button', 'ms-b', 'COMPARE WITH CPU'), benchBtn = h('button', 'ms-b', 'SAVE BENCH'), mb = h('div', 'ms-brow'); mb.append(cpuBtn, benchBtn);
met.append(metKV, mb, cpuRes);
let lastStats = null;
function metrics(r) {
  const nb = Math.ceil(src.w / cfg.block) * Math.ceil(src.h / cfg.block), F = r.field; let sum = 0, mx = 0, lost = 0, skip = 0, intra = 0;
  if (F) for (let i = 0; i < nb; i++) { const m = Math.hypot(F[i * 4], F[i * 4 + 1]); sum += m; mx = Math.max(mx, m); if (F[i * 4 + 3] & FLAG.lost) lost++; if (F[i * 4 + 3] & FLAG.skip) skip++; if (F[i * 4 + 2] > cfg.intra.mad) intra++; }
  const pct = (n) => ((100 * n) / nb).toFixed(1) + ' %', isCut = r.cut > r.cutThresh;
  lastStats = { t, hold: r.hold, cut: r.cut, cutThresh: r.cutThresh, meanMv: F ? +(sum / nb).toFixed(3) : null, maxMv: +mx.toFixed(2), lost: lost / nb, skip: skip / nb, intraCandidates: intra / nb, epe, frameMs: +frameMs.toFixed(2) };
  metKV.innerHTML = kvRows([['frame', `${t} / ${src.count - 1}`], ['bloom hold', r.hold >= 0 ? 'k = ' + r.hold : '—'], ['scene cut', `${r.cut} / ${r.cutThresh} blocks${isCut ? ' · CUT' : ''}`, isCut ? 'bad' : ''],
    ['|mv| mean / max', F ? `${(sum / nb).toFixed(2)} / ${mx.toFixed(2)} px` : '—'], ['lost · skip · intra?', F ? `${pct(lost)} · ${pct(skip)} · ${pct(intra)}` : '—'],
    ['EPE vs truth', epe ? `median ${epe.median.toFixed(2)} · p90 ${epe.p90.toFixed(2)} · ${epe.exact}/${epe.blocks} exact` : src.fx ? '— (I-frame, cut or source2)' : 'fixtures only', epe ? (epe.p90 <= 0.5 ? 'good' : 'bad') : ''],
    ['GPU frame', frameMs ? frameMs.toFixed(2) + ' ms (playing)' : '—'], ['blocks', `${Math.ceil(src.w / cfg.block)}×${Math.ceil(src.h / cfg.block)} = ${nb}`]]);
}
cpuBtn.onclick = async () => {
  cpuBtn.disabled = true; cpuRes.textContent = `CPU reference: running ${t + 1} frames…`; await new Promise((r) => setTimeout(r, 20));
  const C = createLoopRef({ w: src.w, h: src.h }, cfg); C.begin(0); let c;
  for (let k = 0; k <= t; k++) { c = C.step(k, { src: await src.f32(k), src2: src2 ? await src2.f32(k) : undefined }); if (k % 10 === 9) { cpuRes.textContent = `CPU reference: ${k + 1} / ${t + 1}`; await new Promise((r) => setTimeout(r, 0)); } }
  const got = await readback(gpu, last.display), want = toHalfArray(c.display); let same = 0, md = 0;
  for (let i = 0; i < got.length; i++) { if (got[i] === want[i]) same++; }
  const gf = fromHalfArray(got); for (let i = 0; i < gf.length; i++) md = Math.max(md, Math.abs(gf[i] - c.display[i]));
  if (!T.cpu) T.cpu = createImage(gpu, src.w, src.h, F16, 'cpu'); upload(gpu, T.cpu, c.display); cpuDiff = { t };
  cpuRes.innerHTML = `CPU vs GPU at frame ${t}: <b>${((100 * same) / got.length).toFixed(3)} %</b> identical half floats, max diff ${md.toFixed(4)}. View ▸ CPU diff shows |GPU − CPU| × 8.`;
  cpuBtn.disabled = false; U.view = 'cpu diff'; draw();
};
benchBtn.onclick = async () => {
  const tag = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19), body = { tag, source: src.name, size: [src.w, src.h], cfg, moshID: toMoshID(cfg), stats: lastStats, ua: navigator.userAgent };
  try { const r = await fetch(`/save/lab-${tag}.json`, { method: 'POST', body: JSON.stringify(body, null, 1) }); note(r.ok ? `saved moshine/ref/lab-${tag}.json` : 'save needs the dev server (serve.py)'); } catch (e) { note('save needs the dev server (serve.py)'); }
};

// Fidelity: the bench's sets (node moshine/tools/fidelity.mjs). Source 1 = the simulation's input sequence,
// source 2 = the real MPEG-4 decode aligned frame for frame; A/B shows ours (left) beside the real mosh (right).
let fid = null, fidBusy = false;
const fidBox = h('div'), fidSel = h('select'), fidKV = h('div', 'ms-kv'), fidBtn = h('button', 'ms-b', 'LOAD SET'), fidRow = h('div', 'ms-brow');
fidRow.append(fidBtn); fidBox.append(fidSel, fidRow, fidKV, h('div', 'ms-note', 'SSIM-8 on luma against the real decode of this frame, next to the two baselines a simulation must beat: frozen (the last A frame) and clean (B decoded normally). Change any parameter and watch it move. Run <b>node moshine/tools/fidelity.mjs</b> to (re)build the sets.'));
let fidSets = [];
async function fidList() {
  try { const r = await fetch('./tests/media/fidelity/index.json', { cache: 'no-store' }); if (!r.ok) throw 0; fidSets = (await r.json()).sets || []; } catch (e) { fidSets = []; }
  fidSel.innerHTML = ''; if (!fidSets.length) fidSel.append(new Option('no sets — run tools/fidelity.mjs', ''));
  fidSets.forEach((x, i) => fidSel.append(new Option(x.name, String(i))));
}
fidBtn.onclick = async () => {
  const set = fidSets[+fidSel.value]; if (!set) return;
  note('loading ' + set.name);
  src = await rawSource(`fidelity ${set.name}`, './tests/media/fidelity/' + set.src, set.w, set.h, set.count);
  src2 = await rawSource(`real ${set.name}`, './tests/media/fidelity/' + set.real, set.w, set.h, set.count);
  fid = set; cfg = normalize(set.cfg); presetName = 'fidelity'; U.view = 'a/b';
  rebuild(); loop.setConfig(cfg); setURL(); stackUI(); inputUI(); await seek(Math.min(12, src.count - 1)); note(set.name);
};
async function fidelityLive() {
  if (fidBusy || !last || !last.out) return; fidBusy = true;
  const out = fromHalfArray(await readback(gpu, last.display)), real = src2.rgbaOf(t), m = compare(to8(out), real, src.w, src.h), c = fid.curve && fid.curve[t];
  fidBusy = false;
  const win = c ? m.ssim > Math.max(c[1], c[2]) : null;
  fidKV.innerHTML = kvRows([['set', fid.name], ['frame', t < 2 ? `${t} (I-frame / dropped cut)` : `${t} · ${t - 2} after the cut`],
    ['SSIM ours → real', m.ssim.toFixed(4), win === null ? '' : win ? 'good' : 'bad'], ['PSNR ours → real', m.psnr.toFixed(2) + ' dB'],
    ['baselines', c ? `frozen ${c[1].toFixed(3)} · clean ${c[2].toFixed(3)}` : '—'], ['bench config', c ? `SSIM ${c[0].toFixed(4)}` : '—']]);
}

// Overlays
const ovBox = h('div');
for (const [k, label] of [['field', 'field arrows'], ['grid', 'block grid'], ['sad', 'SAD heatmap'], ['flags', 'lost · skip · intra?'], ['truth', 'truth errors (fixtures)']]) ovBox.append(control(U.ov, k, [true], () => { S.save(); shown(); }, label));
ovBox.append(h('div', 'ms-note', 'Arrows run from where a block’s content came from to where it is now (orange; cyan while bloom holds). Red boxes: estimate off the fixture’s true motion by more than half a pixel.'));

S.win('input', 'Input', inp, { x: 12, y: 60, w: 300, open: true });
S.win('stack', 'Stack', stk, { x: -12, y: 60, w: 330, open: true });
S.win('metrics', 'Metrics', met, { x: 12, y: 420, w: 300, open: true });
S.win('overlays', 'Overlays', ovBox, { x: 330, y: 60, w: 250 });
S.win('fidelity', 'Fidelity — vs real MPEG-4', fidBox, { x: 330, y: 300, w: 320, dock: 'Fidelity' });
fidList();
deviceWindow(S, P, gpu);
testsWindow(S, { pause: () => { playing = false; }, x: 380, y: 90 });

// ------------------------------------------------------------------------------------------------ transport, menus, keys
let playing = false;
S.transport.innerHTML = `<button class="ms-b" id="lb-home" title="I-frame (Home)">⏮</button><button class="ms-b" id="lb-back" title="one frame back (←)">◀|</button><button class="ms-b" id="lb-play" title="play / pause (space)">▶</button>
  <button class="ms-b" id="lb-step" title="one frame (→)">|▶</button><div id="ms-scrub" title="scrub"><i></i></div><span class="ms-lbl" id="lb-lbl"></span><button class="ms-b" id="lb-view" title="cycle view (V)">OUTPUT</button>`;
$('lb-home').onclick = () => { playing = false; seek(0); };
$('lb-back').onclick = () => { playing = false; seek(t - 1); };
$('lb-step').onclick = () => { playing = false; advance(); };
$('lb-play').onclick = () => { playing = !playing; refresh(); };
const VIEWS = ['output', 'source', 'source2', 'split', 'a/b', 'cpu diff'];
const setView = (v) => { U.view = v; S.save(); draw(); shown(); };
$('lb-view').onclick = () => setView(VIEWS[(VIEWS.indexOf(U.view) + 1) % VIEWS.length]);
const scrub = $('ms-scrub'); let scrubbing = false;
const scrubTo = (e) => { const r = scrub.getBoundingClientRect(); seek(Math.round(clamp((e.clientX - r.left) / r.width, 0, 1) * (src.count - 1))); };
scrub.addEventListener('pointerdown', (e) => { scrubbing = true; playing = false; scrub.setPointerCapture(e.pointerId); scrubTo(e); });
scrub.addEventListener('pointermove', (e) => { if (scrubbing) scrubTo(e); });
scrub.addEventListener('pointerup', () => { scrubbing = false; });
function scrubMarks() {
  scrub.querySelectorAll('u, s').forEach((x) => x.remove());
  const n = Math.max(1, src.count - 1);
  if (src.fx && src.fx.cut !== null) { const u = h('u'); u.style.left = (src.fx.cut / n) * 100 + '%'; u.title = 'scene cut'; scrub.append(u); }
  if (cfg.bloom.repeat > 0) for (let k = 1; k < src.count; k++) if (holdAt(k, cfg.bloom, 0) === 0) { const s = h('s'); s.style.left = (k / n) * 100 + '%'; s.style.width = (Math.min(cfg.bloom.repeat, src.count - k) / n) * 100 + '%'; scrub.append(s); }
  scrub.querySelector('i').style.left = (t / n) * 100 + '%';
}

S.menu('File', () => [
  { label: 'Fixture ▸', head: 'Load' }, ...Object.keys(FIXTURES).map((n) => ({ label: 'Fixture: ' + n, run: () => { src = fixtureSource(n, U.res); src2 = null; setURL(); rebuild(); seek(0); inputUI(); } })),
  { label: 'Image sequence…', key: '⌘O', run: () => S.wins.input.el.querySelector('.ms-brow .ms-b').click() },
  { label: 'Video…', run: () => S.wins.input.el.querySelectorAll('.ms-brow')[0].children[1].click() }, '-',
  { label: 'Export frame PNG', key: '⌘⇧S', run: exportFrame }, { label: 'Export PNG sequence…', run: exportSequence }, '-',
  { label: 'Copy Mosh ID link', run: () => navigator.clipboard.writeText(location.href).then(() => note('Mosh ID link copied')) },
  { label: 'Open the app', run: () => { location.href = './'; } }]);
const usePreset = (n, P) => { presetName = n; cfg = normalize(JSON.parse(JSON.stringify(P[n]))); applied(true); };
S.menu('Presets', () => [{ head: 'Styles' }, ...Object.keys(PRESETS).map((n) => ({ label: n, chk: n === presetName, run: () => usePreset(n, PRESETS) })),
  '-', { head: 'Legacy DATAMOSHINE' }, ...Object.keys(LEGACY).map((n) => ({ label: n, chk: n === presetName, run: () => usePreset(n, LEGACY) }))]);
S.menu('View', () => [...VIEWS.map((v) => ({ label: v[0].toUpperCase() + v.slice(1), chk: U.view === v, run: () => setView(v) })), '-',
  ...Object.keys(U.ov).map((k) => ({ label: 'Overlay: ' + k, chk: U.ov[k], run: () => { U.ov[k] = !U.ov[k]; S.save(); shown(); } })), '-',
  { label: 'Loop playback', chk: U.loop, run: () => { U.loop = !U.loop; S.save(); } },
  ...[24, 30, 60].map((f) => ({ label: `Play at ${f} fps`, chk: U.fps === f, run: () => { U.fps = f; S.save(); } }))]);
S.menu('Lab', () => [{ label: 'Compare with CPU', run: () => cpuBtn.click() }, { label: 'Save bench', run: () => benchBtn.click() }, { label: 'Run tests', run: () => S.toggleWin('tests', true) }, { label: 'Device', run: () => S.toggleWin('device', true) }]);
S.onAction(refresh);

function refresh() {
  S.status.textContent = `${src.name} · ${src.w}×${src.h} · ${presetName} · tier ${P.tier}${P.coi ? ' · isolated' : ''}`;
  $('lb-play').textContent = playing ? '❚❚' : '▶'; $('lb-view').textContent = U.view.toUpperCase(); $('lb-lbl').textContent = `${t} / ${src.count - 1}`;
  S.setPaneTitle(`Lab — ${src.name} · ${presetName}`);
}
addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input, select, textarea')) return;
  if (e.key === ' ' || e.key === 'k') { playing = !playing; e.preventDefault(); refresh(); }
  else if (e.key === 'ArrowRight') { playing = false; advance(); } else if (e.key === 'ArrowLeft') { playing = false; seek(t - 1); }
  else if (e.key === 'Home') seek(0); else if (e.key === 'End') seek(src.count - 1);
  else if (e.key === 'v') $('lb-view').click();
  else if (e.key === 'f') { U.ov.field = !U.ov.field; S.save(); shown(); } else if (e.key === 'g') { U.ov.grid = !U.ov.grid; S.save(); shown(); }
});

// ------------------------------------------------------------------------------------------------ export
async function pngOf(tex) {
  const px = fromHalfArray(await readback(gpu, tex)), c = h('canvas'); c.width = tex.width; c.height = tex.height;
  const g = c.getContext('2d'), im = g.createImageData(c.width, c.height);
  for (let i = 0; i < px.length; i++) im.data[i] = Math.round(clamp(px[i], 0, 1) * 255);
  g.putImageData(im, 0, 0); return new Promise((r) => c.toBlob(r, 'image/png'));
}
async function exportFrame() {
  const a = h('a'); a.href = URL.createObjectURL(await pngOf(last.display)); a.download = `moshine-f${String(t).padStart(4, '0')}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
async function exportSequence() {
  if (!window.showDirectoryPicker) { note('PNG sequences need the File System Access API (Chrome or Edge); use Export frame elsewhere'); return; }
  let dir; try { dir = await window.showDirectoryPicker({ mode: 'readwrite' }); } catch (e) { return; }
  playing = false; busy = true; loop.begin(0);
  for (let k = 0; k < src.count; k++) {
    last = stepFrame(k); const fh = await dir.getFileHandle(`moshine-${String(k).padStart(5, '0')}.png`, { create: true }), w = await fh.createWritable();
    await w.write(await pngOf(last.display)); await w.close(); note(`exported ${k + 1} / ${src.count}`);
  }
  t = src.count - 1; busy = false; await shown(); note(`exported ${src.count} PNGs`);
}

// ------------------------------------------------------------------------------------------------ go
let lastTick = 0;
function tick(now) {
  if (playing && !busy && now - lastTick >= 1000 / U.fps) { lastTick = now; advance(); }
  requestAnimationFrame(tick);
}
window.__moshine = { gpu, probe: P, get playing() { return playing; }, set playing(v) { playing = !!v; } };
window.__lab = { get cfg() { return cfg; }, get t() { return t; }, seek, get loop() { return loop; }, get stats() { return lastStats; }, get src() { return src; },
  /** Test hook: load a File / Blob as source 1 or 2 through the same paths as the buttons. */
  async load(file, which = 1) { const isVid = /^video\//.test(file.type) || /\.(mp4|mov|webm|mkv)$/i.test(file.name || '');
    const s = isVid ? await loadVideo(file, which === 2 ? [src.w, src.h] : undefined) : await loadImages([file], which === 2 ? [src.w, src.h] : undefined);
    if (which === 2) src2 = s; else { src = s; src2 = null; rebuild(); } inputUI(); await seek(0); return { name: s.name, w: s.w, h: s.h, count: s.count }; },
  setConfig(c) { cfg = normalize(c); presetName = 'custom'; applied(true); } };
rebuild(); stackUI(); inputUI(); await seek(0); requestAnimationFrame(tick);
