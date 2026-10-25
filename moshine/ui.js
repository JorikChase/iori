// ui.js — the MOSHINE editor (M5): a project of sequences edited through the command bus (timeline.js), previewed
// through the sequence renderer (render.js) at a governed resolution, autosaved to OPFS. Docked desk: preview, stack
// (inspector.js) and the canvas timeline (tlview.js); tablet floats the stack, phone puts timeline and stack in the
// bottom sheet (D19). With no saved project it opens a demo on the 'cut' fixture. window.__moshine exposes the GPU and
// the probe to the harness; window.__app exposes the editor to the bench runner.
import { createShell, h, $ } from './shell.js';
import { createGPU, createPresenter } from './gpu.js';
import { probe, measure, TIER_LIMITS } from './platform.js';
import { fixture } from './fixtures.js';
import { PRESETS, LEGACY, normalize } from './config.js';
import { deviceWindow, testsWindow } from './panels.js';
import { openLibrary, openVideo, analyseAudio, createAudioDecoder } from './media.js';
import { createAudioPlayer } from './audioplay.js';
import { importLimits, fitSize, SCALES, createGovernor, AUDIO_OK } from './governor.js';
import { exportSequence, openTarget, encodableCodecs, audioPlan, mixCodec, QUALITIES } from './export.js';
import { openSequenceTarget } from './frames.js';
import { createTour } from './help.js';
import { createAudioClip, createProject, fromConfig, mediaFromLibrary, createMediaClip, createEffectClip, createEffect, openProjectStore, createAutosave, saveFile, readFile, newId, sequenceEnd, toMoshID, fromMoshID, EFFECTS } from './project.js';
import { createTimeline, indexProject } from './timeline.js';
import { createSequenceRenderer, videoReader } from './render.js';
import { createTimelineView, timecode } from './tlview.js';
import { openDiskCache } from './cache.js';
import { createThumbs } from './thumbs.js';
import { mediaIndex, clockOf, audioFeatures, setClockProject } from './sequence.js';
import { resolveMasks, rasterMasks, maskSize } from './masks.js';
import { paintField } from './vectors.js';
import { resolveAll } from './params.js';
import { createInspector } from './inspector.js';

const S = createShell({ key: 'moshine', title: 'MOSHINE', state: { pin: null, last: null } });
const play = { on: false, t: 0, want: 0, shown: -1, dirty: true, busy: false, from: 0, ms: 0, dir: 1 };   // declared first: window.__moshine reads it during start-up
const U = S.U, qs = new URLSearchParams(location.search), ALL = { ...PRESETS, ...LEGACY };
let gpu, P;
try { gpu = await createGPU(); P = await probe(gpu.adapter); }
catch (err) { S.fail('MOSHINE needs WebGPU (Chrome or Edge, Safari 26+, Firefox 141+ on Windows and macOS). ' + err.message); throw err; }
let PM = null;
window.__moshine = { gpu, probe: P, get measured() { return PM; }, get playing() { return play.on; }, set playing(v) { play.on = !!v; } };
const present = createPresenter(gpu, S.view), note = (s) => { S.hint.textContent = s; };
const tierOf = () => (PM ? PM.tier : P.tier), caps = () => TIER_LIMITS[tierOf()];

// ------------------------------------------------------------------------------------------------ storage
let lib = null, store = null;
try { lib = await openLibrary(); } catch (e) { console.warn('moshine: no OPFS media library', e); }
try { store = await openProjectStore(); } catch (e) { console.warn('moshine: no OPFS project store', e); }
// checkpoint spill (M6): memory up to a quarter of the device's RAM (1 GiB at most), then a session-scoped OPFS cache
let ckDisk = null, ckDiskBudget = 0;
const ckCpuBudget = Math.min(2 ** 30, ((navigator.deviceMemory || 4) * 2 ** 30) / 4);
try { ckDisk = await openDiskCache(); const est = await navigator.storage.estimate(); ckDiskBudget = Math.min(8 * 2 ** 30, Math.max(0, ((est.quota || 0) - (est.usage || 0)) * 0.3)); } catch (e) { console.warn('moshine: no OPFS checkpoint cache', e); }
const autosave = createAutosave((p, text) => store?.saveText(p, text), { onError: (e) => note('autosave failed: ' + e.message) });

// ------------------------------------------------------------------------------------------------ media sources
// the demo clip moves from frame 0 (fixtures.js 'demo'); projects saved with the older 'cut' demo show it too
const DEMO = fixture('demo', { count: 120 });
function demoProject() {
  const media = { id: newId('m'), name: 'demo clip', hash: 'fixture:demo', kind: 'video', width: DEMO.w, height: DEMO.h, fps: { num: 30, den: 1 }, durationFrames: DEMO.count, hasAudio: false, storage: 'url' };
  const p = fromConfig(PRESETS['Xvid classic'], { media, name: 'Demo', width: DEMO.w, height: DEMO.h, timebase: { num: 30, den: 1 } });
  p.sequences[0].markers.push({ id: newId('m'), frame: 52, color: 'yellow', note: 'try H for a mosh hit', hit: false });
  p.sequences[0].channels[1].clips[0].label = 'Xvid classic';
  return p;
}
async function sources(m) {
  if (m.hash === 'fixture:demo' || m.hash === 'fixture:cut') return { w: DEMO.w, h: DEMO.h, frame: async (i) => DEMO.frame(Math.min(i, DEMO.count - 1)) };
  const entry = lib?.list().find((e) => e.id === m.hash) || session.get(m.hash);
  if (!entry) throw new Error(`media "${m.name}" is not in this browser's library (import it again)`);
  const file = entry.file || (await lib.file(entry));
  if (m.kind === 'image') {                                          // a still: the same picture for every frame
    const bm = await createImageBitmap(file);
    return { w: bm.width, h: bm.height, frame: async () => ({ image: bm }), close: () => bm.close() };   // copied as an ImageBitmap: a VideoFrame drops alpha in WebKit
  }
  return videoReader(await openVideo(file, entry.name));
}
const isImage = (f) => /^image\//.test(f.type) || /\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(f.name);
const session = new Map();                                              // imports that could not be stored in OPFS

// ------------------------------------------------------------------------------------------------ audio features (M7)
// Per-frame loudness, bands and onsets for audio modulators, keyed by the media's content hash (the same file always
// gives the same table). Loaded from the library, or analysed in the background the first time a file is used.
const featureTables = new Map(), analysing = new Map();
audioFeatures.get = (hash) => featureTables.get(hash);                // the clock reads audio modulators' features from here
function ensureFeatures(hash) {
  if (featureTables.has(hash) || analysing.has(hash) || hash.startsWith('fixture:')) return analysing.get(hash) || null;
  const entry = lib?.list().find((e) => e.id === hash) || session.get(hash); if (!entry || entry.info?.kind === 'image') return null;
  const job = (async () => {
    try {
      let t = lib && !entry.file ? await lib.features(entry) : null; const r = entry.info?.rate;
      if (t && r && t.fps.num * r.den !== r.num * t.fps.den) t = null;           // analysed at a wrong rate (before 2026-10-22)
      if (!t) {
        const v = await openVideo(entry.file || (await lib.file(entry)), entry.name);
        try { if (!v.audio) return; note(`analysing the audio of ${entry.name}…`); t = await analyseAudio(v, v.rate, { onProgress: (a, b) => note(`analysing the audio of ${entry.name}: ${Math.round((100 * a) / b)} %`) }); } finally { v.close(); }
        if (t && lib && !entry.file) await lib.setFeatures(entry, t);
      }
      if (t) { featureTables.set(hash, t); note(`audio features ready for ${entry.name}`); renderer?.invalidate(); play.dirty = true; pump(); }
    } catch (e) { console.warn('moshine: audio analysis', e); } finally { analysing.delete(hash); }
  })();
  analysing.set(hash, job); return job;
}

// ------------------------------------------------------------------------------------------------ the project
let project = null, tl = null, renderer = null, rsize = null;
const seq = () => project.sequences.find((s) => s.id === project.activeSequence);
const fpsOf = () => seq().timebase.num / seq().timebase.den;
const gov = createGovernor({ budgetMs: 1000 / 30 });
if (U.pin !== null) gov.pin(U.pin);

function useProject(p) {
  project = p; setClockProject(p); U.last = p.id; S.save();
  tl = createTimeline(project, { onChange });
  play.t = play.want = 0; play.shown = -1; play.dirty = true;
  rebuildRenderer();
  for (const m of p.media) ensureFeatures(m.hash);
  view?.showParam(null); view?.fit(); inspector?.refresh(); title(); pump(); if (typeof refreshLooks === 'function') { thumbReaders.forEach((r) => r.close?.()); thumbReaders.clear(); syncEmpty(); refreshLooks(0); } if (typeof refreshExport === 'function' && U.open?.export) refreshExport();
}
function rebuildRenderer() {
  const s = seq(), cap = caps().preview, [bw, bh] = fitSize(s.width, s.height, cap[0], cap[1]), [w, h2] = fitSize(bw, bh, Math.round(bw * gov.scale()), Math.round(bh * gov.scale()));
  covDirty = true; renderer?.destroy(); renderer = createSequenceRenderer(gpu, project, { w, h: h2, sources, K: 8, budget: Math.round(caps().gpuBudget / 2), cpuBudget: ckCpuBudget, ...(ckDisk && ckDiskBudget > 0 ? { disk: ckDisk, diskBudget: ckDiskBudget } : {}) }); rsize = [w, h2];   // checkpoints: half the tier's GPU budget
  S.setAspect(s.width / s.height); gov.setBudget(1000 / Math.min(60, fpsOf())); play.dirty = true; requestAnimationFrame(densify);
}
function onChange(what) {
  tour?.notify(what, tl.undoLabel);
  if (what !== 'selection' && sound.playing) { sound.clearCache(); sound.start(play.t); }   // the mix changed
  if (typeof refreshLooks === 'function') { syncEmpty(); refreshLooks(); drawMaskOverlay(); }
  if (what !== 'selection') { autosave.touch(project); renderer.invalidate(); covDirty = true; touchActivity(); play.dirty = true; pump(); title(); if (U.open.export && !exporting) refreshExport(); }
  view.draw(); inspector.refresh(); if (what !== 'selection') requestAnimationFrame(densify);
}
function title() {
  const s = seq(); S.setPaneTitle(`Preview — ${project.name} · ${s.width}×${s.height} · ${+fpsOf().toFixed(3)} fps`);
  document.title = `MOSHINE — ${project.name}`;
  $('ms-ptl').textContent = `Timeline — ${s.name} · ${timecode(sequenceEnd(s), fpsOf(), true)}${s.exportRange ? ` · range ${s.exportRange.in}–${s.exportRange.out}` : ''}`;
}

// ------------------------------------------------------------------------------------------------ preview
/** Render the wanted frame (and keep going while it moves). One render at a time; scrubbing renders the latest. */
async function pump() {
  if (play.busy || !renderer) return; play.busy = true;
  try {
    while (play.dirty || play.shown !== play.want) {
      const t = play.want; play.dirty = false;
      const t0 = performance.now(), r = await renderer.render(t);
      present.draw(r.image); play.shown = play.t = t; play.from = r.from; play.ckpt = r.checkpoint; play.ms = performance.now() - t0;
      if (r.from === t && play.on && gov.feed(play.ms)) { rebuildRenderer(); note(`preview ${rsize.join('×')} (${Math.round(gov.scale() * 100)} %)`); }
      covDirty = true; overlay(); view.draw(); inspector.refresh(); if (mk.show || mk.tool) drawMaskOverlay();
    }
  } catch (e) { note('render failed: ' + e.message); console.error(e); play.on = false; }
  finally { play.busy = false; }
}
function seek(f, final = true) { touchActivity(); if (final && typeof refreshLooks === 'function') refreshLooks(600); play.want = Math.max(0, Math.min(Math.max(0, sequenceEnd(seq()) - 1), Math.round(f))); if (final) play.on = false; pump(); refresh(); }
function overlay() {
  const s = seq(), n = sequenceEnd(s);
  S.ov.textContent = `f ${String(play.t).padStart(5, '0')} / ${Math.max(0, n - 1)}   ${timecode(play.t, fpsOf(), true)}` +
    `   preview ${rsize[0]}×${rsize[1]} (${Math.round(gov.scale() * 100)} %${U.pin !== null ? ', pinned' : ''})` + (play.from < play.t ? `   replayed ${play.t - play.from + 1} frames from ${play.ckpt !== null && play.ckpt !== undefined ? 'checkpoint ' : ''}${play.from}` : '') + (renderer ? (() => { const c = renderer.cache(); return `   cache ${c.tiers.gpu.length} gpu · ${c.tiers.cpu.length} mem · ${c.tiers.disk.length} disk (K ${c.K})`; })() : '') + `   ${play.ms.toFixed(1)} ms`;
}
let lastTick = 0;
function tick(now) {
  if (play.on && !play.busy && !exporting && now - lastTick >= 1000 / Math.min(60, fpsOf()) - 2) {
    lastTick = now; const s = seq(), lo = s.exportRange && loopRange ? s.exportRange.in : 0, hi = s.exportRange && loopRange ? s.exportRange.out : sequenceEnd(s);
    let n = play.t + play.dir; if (n >= hi) n = lo; if (n < lo) n = hi - 1;
    play.want = Math.max(0, n); pump(); view.follow();
  }
  syncSound();
  if (!play.on && !play.busy) { fillStep(); if (covDirty && now - covAt > 300) view.draw(); }
  requestAnimationFrame(tick);
}
let loopRange = false, exporting = false;

// ------------------------------------------------------------------------------------------------ sound (M7)
// The audio clips' mix plays while the picture plays forward; the picture drives, and the sound restarts at the shown
// frame when they drift more than 3 frames apart. Scrubbing and reverse are silent.
const decoders = new Map();
async function decodeAudio(m, t0, t1) {
  let d = decoders.get(m.hash);
  if (!d) {
    d = (async () => { const entry = lib?.list().find((e) => e.id === m.hash) || session.get(m.hash); if (!entry) return null; return createAudioDecoder(await openVideo(entry.file || (await lib.file(entry)), entry.name)); })();
    decoders.set(m.hash, d);
  }
  const dec = await d; if (!dec) return { sampleRate: 48000, first: 0, channels: [new Float32Array(0)] };
  return dec.decode(t0, t1);
}
U.sound = U.sound ?? true;
const sound = createAudioPlayer({ project: () => project, seq: () => seq(), decode: decodeAudio, onError: (e) => note('sound: ' + e.message) });
function syncSound() {
  const want = play.on && play.dir === 1 && U.sound && !exporting;
  if (want && !sound.playing) sound.start(play.t);
  else if (!want && sound.playing) sound.stop();
  else if (want) { const e = sound.expectedFrame(); if (e !== null && Math.abs(e - play.t) > 3) sound.start(play.t); }
}

// ------------------------------------------------------------------------------------------------ cache view + background fill (M6)
let cov = null, covAt = 0, covDirty = true, lastActivity = performance.now(), filling = false;
const touchActivity = () => { lastActivity = performance.now(); };
addEventListener('pointerdown', touchActivity, true); addEventListener('keydown', touchActivity, true); addEventListener('wheel', touchActivity, true);
/** The ruler's coverage, recomputed at most ~3 times a second when something changed. */
function coverageNow() {
  const now = performance.now();
  if (renderer && (covDirty || !cov) && now - covAt > 300) { cov = renderer.coverage(); covAt = now; covDirty = false; }
  return cov;
}
/**
 * Background fill (spec §7): after 500 ms idle, render toward the first red frame — the export range first, then ahead of
 * the playhead, then behind — within the span the budgets can hold, so checkpoints appear without presenting anything.
 * A step renders at most 4 K frames and gives way at once to playback, a seek or an edit.
 */
async function fillStep() {
  if (filling || play.busy || play.on || exporting || !renderer || performance.now() - lastActivity < 500) return;
  const s = seq(), end = sequenceEnd(s), c = renderer.cache(), per = c.frames.length ? (c.bytes + c.cpuBytes + c.diskBytes) / c.frames.length : 0;
  const cap = per > 0 ? Math.floor((c.budget + c.cpuBudget + (Number.isFinite(c.diskBudget) ? c.diskBudget : 0)) / per) * c.K : end;
  const ph = play.want, ahead = [ph, Math.min(end, ph + Math.ceil(cap * 0.75))], behind = [Math.max(0, ph - Math.floor(cap * 0.25)), ph];
  const ranges = [...(s.exportRange ? [[Math.max(s.exportRange.in, behind[0]), Math.min(s.exportRange.out, ahead[1])]] : []), ahead, behind];
  const cv = renderer.coverage(); let target = null;
  for (const [a, b] of ranges) { const sp = cv.spans.find((x) => x.kind === 'red' && x.b > a && x.a < b); if (sp) { const f0 = Math.max(a, sp.a), from = renderer.seekCost(f0).from; target = Math.min(f0 + c.K - 1, from + 4 * c.K - 1, end - 1); break; } }
  if (target === null) return;
  filling = true; play.busy = true; const act = lastActivity;
  try { await renderer.render(target, { stop: () => play.on || exporting || lastActivity !== act || play.want !== play.shown }); covDirty = true; }
  catch (e) { console.warn('moshine: background fill', e); }
  finally { play.busy = false; filling = false; if (play.want !== play.shown) pump(); overlay(); view.draw(); }
}

// ------------------------------------------------------------------------------------------------ desk: preview, stack, timeline
$('ms-desk').classList.add('ed');
const stackPane = h('div', 'ms-pane', '<div class="ms-in"><div class="ms-wcap"><div class="ms-capt">Stack</div></div><div class="ms-body ins"></div></div>'); stackPane.id = 'ms-stackpane';
const tlPane = h('div', 'ms-pane', '<div class="ms-in"><div class="ms-wcap"><div class="ms-capt" id="ms-ptl">Timeline</div></div><div class="tlhost"></div></div>'); tlPane.id = 'ms-tlpane';
$('ms-desk').append(stackPane, tlPane);
const insBody = stackPane.querySelector('.ins'), tlBody = tlPane.querySelector('.tlhost');
S.transport.innerHTML = `<button class="ms-b" id="ms-home" title="to start (Home)">⏮</button><button class="ms-b" id="ms-back" title="reverse (J)">◀</button><button class="ms-b" id="ms-play" title="play / pause (space, K)">▶</button>
  <button class="ms-b" id="ms-step" title="one frame (→)">|▶</button><button class="ms-b" id="ms-end" title="to end (End)">⏭</button><button class="ms-b" id="ms-loop" title="loop the export range">LOOP</button>
  <span class="ms-sp"></span><span class="mk-tools"><button class="ms-b" id="mk-inc" title="mask brush: paint where the mosh applies (G)">MASK</button><button class="ms-b" id="mk-lock" title="lock brush: paint where the mosh never goes (Shift+G)">LOCK</button>
  <button class="ms-b" id="mk-vec" title="vector brush: paint motion along your drag (V)">VECTOR</button>
  <label class="mk-l" title="brush size: also the mouse wheel over the picture, or [ and ] while a brush is on">SIZE<input type="range" id="mk-size" min="0" max="1000" step="1"></label>
  <span class="mk-vonly" hidden><label class="mk-l" title="how hard the painted vectors push (per frame)">PUSH<input type="range" id="mk-push" min="0.002" max="0.08" step="0.001"></label><select id="mk-vmode" title="vectors add to the motion, or replace it"><option value="add">add</option><option value="replace">replace</option></select></span><button class="ms-b" id="mk-show" title="show the mask (dims where the mosh does not reach)">SHOW</button><button class="ms-b" id="mk-clear" title="clear the active brush's mask">CLEAR</button></span>
  <button class="ms-b" id="ms-sound" title="sound on / off while playing">SOUND</button><button class="ms-b" id="ms-hit" title="mosh hit at the playhead (H)">HIT</button><button class="ms-b" id="ms-split" title="split at the playhead (⌘B)">SPLIT</button>`;
// ------------------------------------------------------------------------------------------------ R4: Looks strip + empty state
// Every preset as a card with a live thumbnail of the clip at the playhead; one click applies it (lookTarget). The
// thumbnails refresh, debounced, when the selection, the media or the paused playhead changes, never while playing.
const looksEl = h('div'); looksEl.id = 'ms-looks'; S.transport.after(looksEl);
const thumbs = createThumbs(gpu), thumbReaders = new Map(), cards = new Map();
for (const [group, names] of [['STYLES', Object.keys(PRESETS)], ['LEGACY', Object.keys(LEGACY)]]) {
  looksEl.append(h('div', 'look-group', group));
  for (const n of names) {
    const card = h('button', 'look'), cv = document.createElement('canvas'); cv.width = 128; cv.height = 72;
    card.title = `${n} — apply to the selection (or the clip under the playhead)`; card.append(cv, h('span', '', n.replace(/^\d\d /, '')));
    card.onclick = () => applyPreset(n); looksEl.append(card); cards.set(n, { card, cv });
  }
}
function markLooks() { const T = lookTarget(), cur = T && T.clip.label; for (const [n, c] of cards) c.card.classList.toggle('on', n === cur); }
let looksJob = 0, looksTimer = null;
function refreshLooks(delay = 350) { clearTimeout(looksTimer); looksTimer = setTimeout(drawLooks, delay); markLooks(); }
/** The media clip the thumbnails show: the selected one, else the one under the look target, else the lowest at the playhead. */
function looksSource() {
  const ix = indexProject(project), s = seq(), k = sel().map((id) => ix.get(id)?.obj).find((x) => x && x.kind === 'media');
  if (k) return k;
  const T = lookTarget(), at = T ? Math.max(T.clip.range.in, Math.min(play.want, T.clip.range.out - 1)) : play.want;
  for (const c of s.channels) if (c.kind === 'video' && !c.bypassed) { const x = c.clips.find((q) => q.range.in <= at && at < q.range.out); if (x) return x; }
  return s.channels.filter((c) => c.kind === 'video').flatMap((c) => c.clips)[0] || null;
}
async function drawLooks() {
  const job = ++looksJob, stale = () => job !== looksJob || play.on || exporting, k = looksSource();
  looksEl.classList.toggle('empty', !k); if (!k || stale()) return;
  const m = project.media.find((x) => x.id === k.mediaId); if (!m) return;
  try {
    let r = thumbReaders.get(m.id); if (!r) { r = await sources(m); thumbReaders.set(m.id, r); }
    // 24 frames ending at the playhead (later when it sits near the clip's start), so the looks have motion to show
    const len = k.range.out - k.range.in, end = Math.max(0, Math.min(len - 1, Math.max(play.want - k.range.in, 23))), first = Math.max(0, end - 23);
    const idx = []; for (let l = first; l <= end; l++) idx.push(mediaIndex(k, l, m, seq().timebase));
    if (!(await thumbs.load(r, idx, { mw: m.width, mh: m.height, stale }))) return;
    for (const [n, c] of cards) { if (stale()) return; thumbs.draw(ALL[n], c.cv); await new Promise((res) => setTimeout(res, 0)); }
  } catch (e) { console.warn('moshine: look thumbnails', e); }
}
const emptyEl = h('div', '', `<div class="em-box"><b>Drop a video anywhere</b><span>MP4, MOV, WebM or MKV. It is copied into this browser once and stays here.</span>
  <div class="ms-brow"><button class="ms-b" data-k="imp">IMPORT VIDEO…</button><button class="ms-b" data-k="demo">TRY THE DEMO</button></div>
  <span>Then pick a look below, scrub, and press H for mosh hits.</span></div>`); emptyEl.id = 'ms-empty';
$('ms-stage').append(emptyEl);
emptyEl.querySelector('[data-k=imp]').onclick = () => impBtn.click();
emptyEl.querySelector('[data-k=demo]').onclick = async () => { await autosave.flush(); useProject(demoProject()); };
const syncEmpty = () => { emptyEl.hidden = seq().channels.some((c) => c.clips.length); };

// ------------------------------------------------------------------------------------------------ R3: mask brushes on the preview
// MASK paints where the targeted mosh applies, LOCK where it never goes (lookTarget() picks the mosh). A stroke is drawn
// live on the overlay and committed on release as one undo step. SHOW (and any active brush) dims what the mosh does
// not reach, from the same raster the renderer uses.
const mk = { tool: null, size: U.mkSize || 0.06, push: U.mkPush || 0.015, vmode: 'add', show: false, pts: null };
const fitBox = $('ms-fit'), ovl = S.overlay;
// brush size: 0.5 % to 60 % of the picture height, on a log slider so small brushes keep their resolution
const SZ0 = 0.005, SZ1 = 0.6, toSlider = (v) => Math.round((1000 * Math.log(v / SZ0)) / Math.log(SZ1 / SZ0)), fromSlider = (x) => SZ0 * (SZ1 / SZ0) ** (x / 1000);
const setSize = (v, fromInput = false) => { mk.size = Math.min(SZ1, Math.max(SZ0, v)); if (!fromInput) $('mk-size').value = toSlider(mk.size); U.mkSize = mk.size; S.save(); drawMaskOverlay(); };
$('mk-size').value = toSlider(mk.size); $('mk-size').oninput = () => setSize(fromSlider(+$('mk-size').value), true);
const setTool = (t) => { mk.tool = mk.tool === t ? null : t; syncMaskUi(); drawMaskOverlay(); };
$('mk-inc').onclick = () => setTool('include'); $('mk-lock').onclick = () => setTool('lock'); $('mk-vec').onclick = () => setTool('vector');
$('mk-push').value = mk.push; $('mk-push').oninput = () => { mk.push = +$('mk-push').value; U.mkPush = mk.push; S.save(); };
$('mk-vmode').onchange = () => { mk.vmode = $('mk-vmode').value; };
$('mk-show').onclick = () => { mk.show = !mk.show; syncMaskUi(); drawMaskOverlay(); };
$('mk-clear').onclick = () => {
  const T = lookTarget(), m = T && (T.clip.masks || []).find((x) => x.mode === (mk.tool || 'include'));
  if (m) run('setValue', { id: m.id, path: ['shapes'], value: [] }, `${m.mode} mask cleared`); else note('no mask to clear');
};
function syncMaskUi() {
  $('mk-inc').classList.toggle('on', mk.tool === 'include'); $('mk-lock').classList.toggle('on', mk.tool === 'lock'); $('mk-vec').classList.toggle('on', mk.tool === 'vector'); $('mk-show').classList.toggle('on', mk.show);
  fitBox.classList.toggle('painting', !!mk.tool); ovl.style.pointerEvents = mk.tool ? 'auto' : 'none';
  document.querySelector('.mk-vonly').hidden = mk.tool !== 'vector';
}
const toUV = (e) => { const r = fitBox.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
ovl.addEventListener('pointerdown', (e) => {
  if (!mk.tool) return;
  const T = lookTarget(); if (!T) { note('pick a look first: masks belong to a mosh'); return; }
  try { ovl.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointers (tests) */ } mk.pts = [...toUV(e)]; mk.clip = T.clip.id; mk.eff = T.e.id; drawMaskOverlay();
});
// the brush outline follows the pointer at its real size; the wheel over the picture resizes it
ovl.addEventListener('pointermove', (e) => { if (mk.tool && !mk.pts) { mk.hover = toUV(e); drawMaskOverlay(); } });
ovl.addEventListener('pointerleave', () => { mk.hover = null; drawMaskOverlay(); });
ovl.addEventListener('wheel', (e) => { if (!mk.tool) return; e.preventDefault(); mk.hover = toUV(e); setSize(mk.size * Math.exp(-e.deltaY * 0.002)); }, { passive: false });
ovl.addEventListener('pointermove', (e) => {
  if (!mk.pts) return; const [u, v] = toUV(e), n = mk.pts.length, A = seq().width / seq().height; mk.hover = [u, v];
  if (Math.hypot((u - mk.pts[n - 2]) * A, v - mk.pts[n - 1]) > mk.size / 4) { mk.pts.push(u, v); drawMaskOverlay(); }
});
const endStroke = () => {
  if (!mk.pts) return; const pts = mk.pts.map((x) => Math.round(x * 10000) / 10000); mk.pts = null;
  if (mk.tool === 'vector') { if (pts.length < 4) { note('drag to paint motion: the vectors follow your stroke'); drawMaskOverlay(); return; } run('addVectorStroke', { effectId: mk.eff, mode: mk.vmode, stroke: { pts, r: mk.size, s: mk.push } }); }
  else run('addMaskStroke', { clipId: mk.clip, mode: mk.tool, stroke: { pts, r: mk.size } });
};
ovl.addEventListener('pointerup', endStroke); ovl.addEventListener('pointercancel', endStroke);
/** Dim what the mosh does not reach (and draw the stroke being painted). */
function drawMaskOverlay() {
  const r = fitBox.getBoundingClientRect(), d = devicePixelRatio || 1, ctx = ovl.getContext('2d');
  ovl.width = Math.max(1, Math.round(r.width * d)); ovl.height = Math.max(1, Math.round(r.height * d)); ctx.clearRect(0, 0, ovl.width, ovl.height);
  if (!(mk.show || mk.tool) || !project) return;
  if (mk.tool && mk.hover) {                                            // the brush: radius = size × picture height, as the stroke
    const x = mk.hover[0] * ovl.width, y = mk.hover[1] * ovl.height, rr = Math.max(2, mk.size * ovl.height);
    ctx.lineWidth = 1.5 * d; for (const [c, dash] of [['#000', []], ['#fff', [4 * d, 4 * d]]]) { ctx.strokeStyle = c; ctx.setLineDash(dash); ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.stroke(); }
    ctx.setLineDash([]);
  }
  const T = lookTarget(); if (!T) return;
  const res = mk.tool === 'vector' ? [] : resolveMasks(T.clip.masks, play.want - T.clip.range.in, clockOf(seq(), T.clip));
  if (res.length) {
    const [mw, mh] = maskSize(seq().width, seq().height, 256), cov = rasterMasks(res, mw, mh, seq().width / seq().height), img = new ImageData(mw, mh);
    for (let i = 0; i < mw * mh; i++) { img.data[i * 4 + 3] = Math.round((1 - cov[i * 4]) * 150); }
    const c = new OffscreenCanvas(mw, mh); c.getContext('2d').putImageData(img, 0, 0); ctx.imageSmoothingEnabled = true; ctx.drawImage(c, 0, 0, ovl.width, ovl.height);
  }
  const pop = T.e.params.ops.find((o) => o.op === 'paint');
  if (pop && (mk.tool === 'vector' || mk.show)) {                        // the painted field as arrows (the loop's own math, at overlay size)
    const B = Math.round(28 * d), op = resolveAll(pop, play.want - T.clip.range.in, clockOf(seq(), T.clip, T.e.seed)), P = paintField(op, { w: ovl.width, h: ovl.height, block: B }), bw = Math.ceil(ovl.width / B);
    ctx.strokeStyle = 'rgba(255,220,40,.95)'; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 1.5 * d;
    for (let i = 0; i < P.length; i += 4) {
      const dx = P[i] * 4, dy = P[i + 1] * 4; if (!dx && !dy) continue;            // 4 frames of motion, so short pushes are visible
      const x = ((i / 4) % bw + 0.5) * B, y = (Math.floor(i / 4 / bw) + 0.5) * B, l = Math.hypot(dx, dy);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx, y + dy); ctx.stroke();
      if (l > 3) { const ux = dx / l, uy = dy / l; ctx.beginPath(); ctx.moveTo(x + dx, y + dy); ctx.lineTo(x + dx - 5 * d * ux - 3 * d * uy, y + dy - 5 * d * uy + 3 * d * ux); ctx.lineTo(x + dx - 5 * d * ux + 3 * d * uy, y + dy - 5 * d * uy - 3 * d * ux); ctx.fill(); }
    }
  }
  if (mk.pts) {
    ctx.strokeStyle = mk.tool === 'lock' ? 'rgba(220,40,40,.8)' : mk.tool === 'vector' ? 'rgba(255,220,40,.7)' : 'rgba(40,220,90,.8)'; ctx.lineCap = ctx.lineJoin = 'round'; ctx.lineWidth = mk.size * 2 * ovl.height;
    ctx.beginPath(); for (let i = 0; i < mk.pts.length; i += 2) { const x = mk.pts[i] * ovl.width, y = mk.pts[i + 1] * ovl.height; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } if (mk.pts.length === 2) ctx.lineTo(mk.pts[0] * ovl.width + 0.1, mk.pts[1] * ovl.height); ctx.stroke();
  }
}
new ResizeObserver(() => drawMaskOverlay()).observe(fitBox);

const view0 = createTimelineView(tlBody, { tl: { get project() { return project; }, get selection() { return tl.selection; }, exec: (...a) => tl.exec(...a), select: (...a) => tl.select(...a), selectRange: (...a) => tl.selectRange(...a), marquee: (...a) => tl.marquee(...a), selectedClips: () => tl.selectedClips() },
  playhead: () => play.want, onSeek: (f, final) => { play.on = false; seek(f, final); }, note, onPick: () => inspector.refresh(), coverage: () => coverageNow() });
const showParam0 = view0.showParam, view = Object.assign(view0, { showParam(p) { showParam0(p); requestAnimationFrame(densify); } });   // a keyframe lane changes the rows' height
const inspector = createInspector(insBody, { tl: { get project() { return project; }, exec: (...a) => tl.exec(...a), seal: () => tl.seal(), selectedClips: () => { const s = tl.selectedClips(); if (s.length) return s; const lt = typeof lookTarget === 'function' && lookTarget(); return lt ? [lt.clip.id] : []; }, auto: () => !tl.selectedClips().length }, playhead: () => play.want, view, note, seek: (f) => seek(f) });

// tablet: the stack floats; phone: timeline and stack are bottom sheets (petri idiom)
const stackWin = S.win('stack', 'Stack', h('div'), { x: -16, y: 70, w: 340, dock: 'STACK' });
const tlWin = S.win('timeline', 'Timeline', h('div'), { x: 16, y: 300, w: 640, dock: 'TIMELINE' });
let layout = '';
function relayout() {
  const m = innerWidth < 640 ? 'phone' : innerWidth < 1100 ? 'tablet' : 'desktop'; if (m === layout) return; layout = m;
  document.body.classList.toggle('ms-tablet', m === 'tablet');
  const stackHome = m === 'desktop' ? stackPane.querySelector('.ms-in') : stackWin.querySelector('.ms-body'), tlHome = m === 'phone' ? tlWin.querySelector('.ms-body') : tlPane.querySelector('.ms-in');
  stackHome.append(insBody); tlHome.append(tlBody);
  for (const [k, on] of [['stack', m !== 'desktop'], ['timeline', m === 'phone']]) { S.wins[k].btn.style.display = on ? '' : 'none'; if (!on) S.toggleWin(k, false); }
  if (m === 'phone') S.toggleWin('timeline', true);
}
addEventListener('resize', () => { relayout(); densify(); });

// Dividers: drag between the preview and the Stack column, or above the timeline, to size them (remembered; a
// double-click gives the automatic fit of D41 back).
const splitV = h('div', 'ms-split ms-split-v'), splitH = h('div', 'ms-split ms-split-h');
splitV.title = splitH.title = 'drag to resize · double-click: automatic';
$('ms-desk').append(splitV, splitH);
function placeSplits() {
  const desk = $('ms-desk'), D = desk.getBoundingClientRect(), P = $('ms-preview').getBoundingClientRect(), T = tlPane.getBoundingClientRect();
  splitV.hidden = layout !== 'desktop'; splitH.hidden = layout === 'phone';
  Object.assign(splitV.style, { left: P.right - D.left - 1 + 'px', top: P.top - D.top + 'px', height: P.height + 'px' });
  Object.assign(splitH.style, { top: T.top - D.top - 5 + 'px' });
}
for (const [el, key] of [[splitV, 'stackw'], [splitH, 'tlh']]) {
  let on = false;
  el.addEventListener('pointerdown', (e) => { on = true; el.setPointerCapture(e.pointerId); el.classList.add('on'); });
  el.addEventListener('pointermove', (e) => {
    if (!on) return; const D = $('ms-desk').getBoundingClientRect();
    U.split = { ...(U.split || {}), [key]: key === 'stackw' ? D.right - 4 - e.clientX - 2 : D.bottom - 4 - e.clientY - 2 };
    densify(); placeSplits();
  });
  el.addEventListener('pointerup', () => { if (!on) return; on = false; el.classList.remove('on'); S.save(); });
  el.addEventListener('dblclick', () => { if (U.split) delete U.split[key]; S.save(); densify(); placeSplits(); });
}
new ResizeObserver(() => placeSplits()).observe($('ms-desk'));
new ResizeObserver(() => placeSplits()).observe(tlPane); new ResizeObserver(() => placeSplits()).observe($('ms-preview'));

/**
 * D41 (owner, 2026-10-10): no empty space. The timeline pane is as tall as its rows (at most 45 % of the desk), the
 * preview and stack get the rest, and on desktop the stack column takes the width the picture would otherwise
 * letterbox (330 px at least, 480 px at most: owner, 2026-10-10, capped at full HD). Runs on resize, edits, and a new sequence size.
 */
let dense = { tlh: 0, stackw: 0 };
function densify() {
  const desk = $('ms-desk'); if (!desk || layout === 'phone' || !view) return;
  const D = desk.getBoundingClientRect(); if (!D.height) return;
  const cap = tlPane.querySelector('.ms-wcap')?.offsetHeight || 18;
  const tlh = U.split?.tlh ? Math.round(Math.max(90, Math.min(D.height - 160, U.split.tlh))) : Math.round(Math.min(D.height * 0.45, Math.max(118, cap + view.contentH + 12)));
  if (Math.abs(tlh - dense.tlh) > 1) { dense.tlh = tlh; desk.style.setProperty('--tlh', tlh + 'px'); }
  if (layout !== 'desktop') return;
  const stage = $('ms-stage'), s = seq(), A = s.width / s.height, sh = stage.clientHeight; if (!sh) return;
  const want = U.split?.stackw ? Math.round(Math.max(240, Math.min(D.width - 320, U.split.stackw))) : Math.round(Math.min(480, D.width * 0.5, Math.max(330, D.width - sh * A - 10)));
  if (Math.abs(want - dense.stackw) > 2) { dense.stackw = want; desk.style.setProperty('--stackw', want + 'px'); }
}

// ------------------------------------------------------------------------------------------------ media window + import
const mediaBox = h('div'), mediaList = h('div', 'ms-res'), mrow = h('div', 'ms-brow');
const impBtn = h('button', 'ms-b', 'IMPORT…'), persistBtn = h('button', 'ms-b', 'KEEP STORAGE');
mrow.append(impBtn, persistBtn); mediaBox.append(mrow, mediaList, h('div', 'ms-note', 'ADD puts a clip at the playhead on the selected video channel (or V1), overwriting what is there.'));
const fmtBytes = (b) => (b > 2 ** 30 ? (b / 2 ** 30).toFixed(1) + ' GB' : (b / 2 ** 20).toFixed(1) + ' MB'), fmtDur = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
async function refreshMedia() {
  mediaList.innerHTML = '';
  const items = [...(lib ? lib.list() : []), ...session.values()];
  if (!items.length) mediaList.innerHTML = '<div><span>No media yet. IMPORT… a video (MP4, MOV, WebM, MKV) or drop one on the window.</span><span></span></div>';
  for (const e of items) {
    const row = h('div'), i = e.info, add = h('button', 'ms-b', 'ADD'), del = h('button', 'ms-b', '×');
    add.style.height = del.style.height = '18px'; add.onclick = () => addToTimeline(e);
    del.onclick = async () => { if (lib && !e.file) await lib.remove(e); session.delete(e.id); refreshMedia(); };
    const tools = h('span'); tools.append(add, del);
    row.append(h('span', '', `<b>${e.name}</b><br>${i?.kind === 'image' ? `${i.w}×${i.h} · image · ` : i ? `${i.w}×${i.h} · ${fmtDur(i.duration)} · ${Math.round(i.fps)} fps · ${i.codec}${i.audio ? ' · ' + i.audio.split(' ')[0] : ''} · ` : ''}${fmtBytes(e.size)}`), tools);
    mediaList.append(row);
  }
  if (lib) { const u = await lib.usage(); persistBtn.disabled = u.persisted; }
}
persistBtn.onclick = async () => { const ok = await lib?.persist(); note(ok ? 'storage is now persistent' : 'the browser declined persistent storage'); refreshMedia(); };
impBtn.onclick = () => { const i = h('input'); i.type = 'file'; i.accept = 'video/*,image/*,.mp4,.mov,.webm,.mkv,.m4v,.png,.jpg,.jpeg,.webp,.gif,.avif'; i.onchange = () => i.files[0] && importFile(i.files[0]); i.click(); };
async function importFile(file, { auto = false, add = true } = {}) {
  if (isImage(file)) return importImage(file, { add });
  play.on = false; note('reading ' + file.name);
  let video; try { video = await openVideo(file, file.name); } catch (e) { note('cannot open ' + file.name + ': ' + e.message); return null; }
  const info = video.info(), lim = importLimits({ w: video.w, h: video.h, seconds: video.duration, fps: video.fps }, tierOf(), caps(), PM || {}); video.close();
  const choice = auto ? 'import' : await gate(file, info, lim); if (!choice) { note('import cancelled'); return null; }
  let entry;
  if (lib && lib.canWrite) { entry = await lib.import(file, (n, t) => note(`importing ${file.name}: ${Math.round((100 * n) / t)} %`)); await lib.setInfo(entry, info); entry = lib.list().find((x) => x.id === entry.id); }
  else { entry = { id: 'session-' + newId(), name: file.name, size: file.size, info, file }; session.set(entry.id, entry); }
  refreshMedia();
  if (add) addToTimeline(entry, { maxSeconds: choice === 'trim' ? lim.maxSeconds : Infinity });
  return entry;
}
/** A still image (PNG, JPG, WebP, GIF, AVIF): kept in the library like a video, placed as a 5 s clip on its own layer. */
async function importImage(file, { add = true } = {}) {
  play.on = false; note('reading ' + file.name);
  let bm; try { bm = await createImageBitmap(file); } catch (e) { note('cannot open ' + file.name + ': ' + e.message); return null; }
  const info = { kind: 'image', w: bm.width, h: bm.height, codec: (file.type || 'image').replace('image/', '') }; bm.close();
  let entry;
  if (lib && lib.canWrite) { entry = await lib.import(file); await lib.setInfo(entry, info); entry = lib.list().find((x) => x.id === entry.id); }
  else { entry = { id: 'session-' + newId(), name: file.name, size: file.size, info, file }; session.set(entry.id, entry); }
  refreshMedia();
  if (add) addToTimeline(entry);
  return entry;
}
function gate(file, info, lim) {
  return new Promise((resolve) => {
    const veil = h('div'); veil.id = 'ms-veil'; veil.className = 'on';
    const w = h('div', 'ms open'); w.style.cssText = 'position:static;display:block;width:420px';
    w.innerHTML = `<div class="ms-in"><div class="ms-wcap"><div class="ms-capt">Import — ${file.name}</div></div><div class="ms-body"></div></div>`;
    const b = w.querySelector('.ms-body');
    b.append(h('div', 'ms-kv', [['video', `${info.w}×${info.h} · ${info.fps} fps · ${info.codec}`], ['duration', `${fmtDur(info.duration)} (${info.frames} frames)`], ['audio', info.audio || 'none'], ['size', fmtBytes(file.size)],
      ['this device', `tier ${tierOf()} · preview ≤ ${lim.preview.join('×')} · export ≤ ${lim.export.join('×')}`]].map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('')));
    for (const x of lim.warnings) b.append(h('div', 'ms-note', '⚠ ' + x));
    if (!lim.warnings.length) b.append(h('div', 'ms-note', 'Fits this device. It is copied once into the browser’s private storage (OPFS), so it stays available after a reload.'));
    const row = h('div', 'ms-brow'), ok = h('button', 'ms-b', 'IMPORT'), cancel = h('button', 'ms-b', 'CANCEL');
    const done = (v) => { veil.remove(); resolve(v); };
    row.append(ok); if (Number.isFinite(lim.maxSeconds) && info.duration > lim.maxSeconds) { const tr = h('button', 'ms-b', `USE FIRST ${Math.round(lim.maxSeconds / 60)} MIN`); tr.onclick = () => done('trim'); row.append(tr); }
    row.append(cancel); b.append(row);
    ok.onclick = () => done('import'); cancel.onclick = () => done(null);
    veil.append(w); document.body.append(veil);
  });
}
/** Add a library entry to the timeline at the playhead: media ref, then a clip. The first clip of an empty project
 *  also gives the sequence its size and frame rate. One undo step. */
function addToTimeline(entry, { maxSeconds = Infinity } = {}) {
  const s = seq(), m = mediaFromLibrary(entry), empty = s.channels.every((c) => !c.clips.length);
  try {
    return tl.transaction('Add clip', () => {
      if (empty && (m.fps || m.kind === 'image')) {
        if (m.fps) tl.exec('setValue', { id: s.id, path: ['timebase'], value: m.fps });
        const [w, h2] = fitSize(m.width, m.height, 7680, 4320); tl.exec('setValue', { id: s.id, path: ['width'], value: w }); tl.exec('setValue', { id: s.id, path: ['height'], value: h2 });
      }
      const mediaId = tl.exec('addMedia', { media: m });
      const ref = project.media.find((x) => x.id === mediaId), tb = s.timebase;
      let n = ref.kind === 'image' ? 5 * Math.round(fpsOf()) : ref.durationFrames && ref.fps ? Math.floor((ref.durationFrames * tb.num * ref.fps.den) / (tb.den * ref.fps.num)) : 10 * Math.round(fpsOf());
      if (Number.isFinite(maxSeconds)) n = Math.min(n, Math.round(maxSeconds * fpsOf()));
      const sel = indexProject(project).get(tl.selectedClips()[0]);
      // a still goes on a new layer above the picture (an overlay) unless a video clip is selected; a video on the selected channel or V1
      let ch = sel && sel.ch.kind === 'video' ? sel.ch : null;
      if (!ch && ref.kind === 'image' && !empty) { const id = tl.exec('addChannel', { kind: 'video', index: topVisual() + 1 }); ch = s.channels.find((c) => c.id === id); }
      ch ??= s.channels.find((c) => c.kind === 'video' && !c.locked);
      if (!ch) throw new Error('no unlocked video channel');
      const at = empty ? 0 : play.want, id = tl.exec('addClip', { channelId: ch.id, clip: createMediaClip(mediaId, { in: at, out: at + Math.max(1, n) }) });
      const ach = ref.hasAudio && s.channels.find((c) => c.kind === 'audio' && !c.locked);          // its sound, linked by position on A1 (M7)
      if (ach) tl.exec('addClip', { channelId: ach.id, clip: createAudioClip(mediaId, { in: at, out: at + Math.max(1, n) }) });
      ensureFeatures(ref.hash);
      tl.select(id); note(`${entry.name} added at frame ${at}`);
      if (empty) { rebuildRenderer(); view.fit(); }
      return id;
    });
  } catch (e) { note('cannot add: ' + e.message); return null; }
}

// ------------------------------------------------------------------------------------------------ edit actions
const run = (name, args, ok) => { try { const r = tl.exec(name, args); if (ok) note(ok); return r; } catch (e) { note(e.message); return null; } };
const sel = () => tl.selectedClips();
const A = {
  undo: () => { const l = tl.undoLabel; if (tl.undo()) note('undo: ' + l); },
  redo: () => { const l = tl.redoLabel; if (tl.redo()) note('redo: ' + l); },
  split: () => run('splitClips', { frame: play.want, ids: sel().length ? sel() : undefined }, `split at ${play.want}`),
  del: () => sel().length && run('deleteClips', { ids: sel() }),
  dup: () => { try { const ids = tl.duplicate(sel()); if (ids.length) tl.select(ids[0]); } catch (e) { note(e.message); } },
  copy: () => { clip = tl.copyClips(sel()); note(`${clip.length} clip${clip.length === 1 ? '' : 's'} copied`); },
  paste: () => { if (clip.length) { const ids = run('pasteClips', { items: clip, frame: play.want }); if (ids?.length) tl.select(ids[0]); } },
  marker: () => run('addMarker', { frame: play.want }, `marker at ${play.want}`),
  hit: () => run('addMarker', { frame: play.want, hit: true, color: 'navy' }, `mosh hit at ${play.want}`),
  bloomInsert: () => {
    const ix = indexProject(project), k = sel().map((id) => ix.get(id)).find((o) => o?.obj.kind === 'media') || seq().channels.filter((c) => c.kind === 'video').flatMap((c) => c.clips.map((obj) => ({ obj }))).find((o) => o.obj.range.in <= play.want && play.want < o.obj.range.out);
    if (!k) { note('Bloom Insert needs a media clip under the playhead'); return; }
    run('bloomInsert', { clipId: k.obj.id, frame: play.want, length: Math.round(fpsOf()) }, `Bloom Insert: ${Math.round(fpsOf())} held frames at ${play.want}`);
  },
  moshCut: () => {
    const f = play.want, ch = seq().channels.find((c) => c.kind === 'video' && c.clips.some((k) => k.range.out === f) && c.clips.some((k) => k.range.in === f))
      || seq().channels.filter((c) => c.kind === 'video').map((c) => ({ c, j: c.clips.map((k) => k.range.out).filter((o) => c.clips.some((k) => k.range.in === o)).sort((a, b) => Math.abs(a - f) - Math.abs(b - f))[0] })).filter((x) => x.j !== undefined).sort((a, b) => Math.abs(a.j - f) - Math.abs(b.j - f)).map((x) => { play.want = x.j; return x.c; })[0];
    if (!ch) { note('Mosh Cut needs a join between two clips on a video channel'); return; }
    const id = run('moshCut', { channelId: ch.id, frame: play.want }, `Mosh Cut at ${play.want}`); if (id) tl.select(id);
  },
  /** An effect clip with a Mosh Loop over the selection (or the clip under the playhead). */
  moshSelection: (preset = 'Xvid classic') => { const params = normalize(ALL[preset]); delete params.seed; A.effectClip('moshLoop', params, preset, preset); },
  /** An effect clip with one effect over the selected media clips (or the clip under the playhead, else 2 s from the
   *  playhead), on the first free effect channel above them or a new one. One undo step. */
  effectClip: (type, params = {}, what = EFFECTS[type]?.label, label = null) => {
    const ix = indexProject(project), ks = sel().map((id) => ix.get(id)?.obj).filter((k) => k && k.kind === 'media'), s = seq();
    const k0 = ks.length ? ks : s.channels.filter((c) => c.kind === 'video').flatMap((c) => c.clips).filter((k) => k.range.in <= play.want && play.want < k.range.out).slice(0, 1);
    const range = k0.length ? { in: Math.min(...k0.map((k) => k.range.in)), out: Math.max(...k0.map((k) => k.range.out)) } : { in: play.want, out: play.want + Math.round(2 * fpsOf()) };
    const vi = k0.length ? Math.max(...k0.map((k) => s.channels.findIndex((c) => c.clips.includes(k)))) : Math.max(0, s.channels.findIndex((c) => c.kind === 'video'));
    try {
      tl.transaction(`${what} clip`, () => {
        let fx = s.channels.slice(vi + 1).find((c) => c.kind === 'effect' && !c.locked && !c.clips.some((x) => x.range.in < range.out && x.range.out > range.in));
        if (!fx) { const id = tl.exec('addChannel', { kind: 'effect', index: vi + 1 }); fx = s.channels.find((c) => c.id === id); }
        const ec = createEffectClip(range, { stack: [createEffect(type, { params, seed: 1 + Math.floor(Math.random() * 9999) })] }); if (label) ec.label = label;
        const id = tl.exec('addClip', { channelId: fx.id, clip: ec });
        tl.select(id); note(`${what} over ${range.in}–${range.out}`);
      });
    } catch (e) { note(e.message); }
  },
  /** Add an effect to the selected clip's stack. */
  addEffect: (type) => {
    const id = sel()[0]; if (!id) { note('select a clip first (or use CLIP for a new effect clip)'); return; }
    const k = indexProject(project).get(id)?.obj; if (k?.kind === 'audio') { note('audio clips take no effects'); return; }
    if (run('addEffect', { ownerId: id, type }, `${EFFECTS[type].label} added`)) inspector.refresh();
  },
  /** Jump the playhead to the previous / next key of the parameter shown in the keyframe lane. */
  key: (dir) => {
    const sh = view.shown; if (!sh) { note('show a parameter first (click its name in the stack)'); return; }
    const ix = indexProject(project), o = ix.get(sh.id); if (!o) return;
    let v = o.obj; for (const k of sh.path) v = v?.[k];
    const off = (o.kind === 'clip' ? o.obj : o.clip)?.range.in || 0, keys = (v?.keys || []).map((k) => k.frame + off);
    const f = dir < 0 ? [...keys].reverse().find((x) => x < play.want) : keys.find((x) => x > play.want);
    if (f !== undefined) seek(f); else note(dir < 0 ? 'no earlier key' : 'no later key');
  },
  setIn: () => { const r = seq().exportRange; run('setExportRange', { range: { in: play.want, out: r && r.out > play.want ? r.out : Math.max(play.want + 1, sequenceEnd(seq())) } }); },
  setOut: () => { const r = seq().exportRange; run('setExportRange', { range: { in: r && r.in < play.want ? r.in : 0, out: Math.max(1, play.want) } }); },
  clearRange: () => run('setExportRange', { range: null }),
  play: () => { play.dir = 1; play.on = !play.on; if (play.on && U.sound) sound.prime(); refresh(); },
};
let clip = [];
/**
 * The mosh a look applies to: the selected effect clip's Mosh Loop; for a selected media clip, the mosh on a channel
 * above that covers it; with nothing selected, the topmost mosh at the playhead. Null when there is none (a look then
 * creates one over the clip).
 */
function lookTarget() {
  const ix = indexProject(project), s = seq(), k = sel().map((id) => ix.get(id)).find((o) => o && o.obj.stack);
  const loopOf = (c) => c && c.stack.find((x) => x.type === 'moshLoop' && x.enabled);
  if (k && k.obj.kind === 'effect') { const e = loopOf(k.obj); return e ? { clip: k.obj, e } : null; }
  const ci = k ? s.channels.indexOf(k.ch) : -1, at = k ? k.obj.range.in : play.want;
  for (let i = s.channels.length - 1; i > ci; i--) {
    const c = s.channels[i]; if (c.kind !== 'effect' || c.bypassed) continue;
    const x = c.clips.find((q) => q.range.in <= at && at < q.range.out && q.role !== 'moshCut'), e = loopOf(x); if (e) return { clip: x, e };
  }
  return null;
}
/** Apply a look: swap the style of the targeted mosh (keeping its own hit-marker setting), or mosh the selection. */
const applyPreset = (name) => {
  const T = lookTarget();
  if (!T) { A.moshSelection(name); refreshLooks(); return; }
  const params = normalize(ALL[name]); delete params.seed;
  try {
    tl.transaction(`Look: ${name}`, () => {
      tl.exec('setValue', { id: T.e.id, path: ['params'], value: { ...params, bloom: { ...params.bloom, markers: T.e.params.bloom.markers } } });
      if (T.clip.label !== name) tl.exec('setValue', { id: T.clip.id, path: ['label'], value: name });
    });
    note(`${name} applied`);
  } catch (e) { note(e.message); }
  markLooks();
};

// ------------------------------------------------------------------------------------------------ export window
// Renders the sequence (or its I-O range) sequentially on a fresh renderer, never the preview (D37), and streams it to
// a file. Audio is passed through when the range is one untouched clip; otherwise the reason is shown (mix in M7).
const EXPORT_PRESETS = { editing: { container: 'png', size: 'sequence', range: 'auto', audio: true }, sharing: { container: 'mp4', size: 'sequence', codec: 'auto', quality: 'high', range: 'auto', audio: true } };
U.exp = { container: 'mp4', quality: 'high', size: 'sequence', codec: 'auto', range: 'auto', audio: true, ...(U.exp || {}) };
const expBox = h('div'), expForm = h('div'), expBar = h('div', 'ms-bar'), expTxt = h('div', 'ms-note'), expRow = h('div', 'ms-brow');
const expGo = h('button', 'ms-b', 'EXPORT'), expStop = h('button', 'ms-b', 'CANCEL'); expStop.disabled = true;
expBar.innerHTML = '<i style="width:0%"></i>'; expRow.append(expGo, expStop); expBox.append(expForm, expRow, expBar, expTxt);
let expAbort = null, expPlan = null;
const sel1 = (label, key, opts, after = refreshExport) => { const r = h('div', 'ms-row ms-row-sel'), x = h('select'); for (const [v, t] of opts) x.append(new Option(t, v)); x.value = U.exp[key]; x.onchange = () => { U.exp[key] = x.value; S.save(); after(); }; r.append(h('span', '', label), x); return r; };
/** The codec "auto" picks: H.264 up to 1080p (plays everywhere); above it HEVC or AV1 (H.264 at 4K encodes several
 *  times slower, measured 2026-10-12); WebM: VP9. */
function autoCodec(container, codecs, w, h) {
  const order = container === 'webm' ? ['vp9', 'av1', 'vp8'] : w * h > 1920 * 1088 ? ['hevc', 'av1', 'avc'] : ['avc', 'hevc', 'av1'];
  return order.find((c) => codecs.includes(c)) || codecs[0] || null;
}
async function refreshExport() {
  if (!tl) return;
  const s = seq(), E = U.exp, A = s.width / s.height, maxTex = gpu.device.limits.maxTextureDimension2D || 8192, cap = caps().export;
  const even = (v) => Math.max(16, Math.round(v / 2) * 2), at = (hh) => [even(hh * A), even(hh)];
  // any size: the sequence's, half, standard heights at the sequence's aspect (upscaling too), or custom; the mosh keeps
  // its look at every size (scale.js)
  const sizes = { sequence: [even(s.width), even(s.height)], half: [even(s.width / 2), even(s.height / 2)] };
  for (const hh of [720, 1080, 1440, 2160, 4320]) sizes[hh + 'p'] = at(hh);
  sizes.custom = [even(E.cw || s.width), even(E.ch || s.height)];
  for (const k of Object.keys(sizes)) if (k !== 'custom' && Math.max(...sizes[k]) > maxTex) delete sizes[k];
  let [w, h2] = sizes[E.size] || sizes.sequence; w = Math.min(w, maxTex - (maxTex % 2)); h2 = Math.min(h2, maxTex - (maxTex % 2));
  const end = sequenceEnd(s), useRange = E.range === 'range' || (E.range === 'auto' && !!s.exportRange);
  const png = E.container === 'png', range = useRange && s.exportRange ? { ...s.exportRange } : { in: 0, out: end }, codecs = png ? ['png'] : await encodableCodecs(E.container, w, h2);
  const auto = png ? 'png' : autoCodec(E.container, codecs, w, h2), codec = !png && E.codec && E.codec !== 'auto' && codecs.includes(E.codec) ? E.codec : auto;
  const a = audioPlan(project, range), m = a.mediaId && project.media.find((x) => x.id === a.mediaId), ac = png ? 'wav' : a.mode === 'mix' ? await mixCodec(E.container) : null;
  expPlan = { w, h: h2, range, codec };
  const label = (k, [x, y]) => `${k === 'sequence' ? 'sequence' : k} · ${x}×${y}${y > s.height ? ' (up)' : ''}`;
  expForm.innerHTML = '';
  const presets = h('div', 'ms-brow exp-presets');
  for (const [k, label, tip] of [['editing', 'FOR EDITING', 'lossless PNG frames + WAV at the sequence size, to bring back into Premiere, Resolve or Final Cut'], ['sharing', 'FOR SHARING', 'one MP4 (H.264, high quality) that plays everywhere']]) {
    const b = h('button', 'ms-b', label); b.title = tip; b.dataset.preset = k;
    b.classList.toggle('on', k === 'editing' ? png && E.size === 'sequence' : E.container === 'mp4' && E.codec === 'auto' && E.quality === 'high');
    b.onclick = () => { Object.assign(U.exp, EXPORT_PRESETS[k]); S.save(); refreshExport(); };
    presets.append(b);
  }
  expForm.append(presets, sel1('container', 'container', [['mp4', 'MP4'], ['webm', 'WebM'], ['png', 'PNG sequence (lossless)']]), sel1('size', 'size', Object.entries(sizes).map(([k, v]) => [k, k === 'custom' ? 'custom…' : label(k, v)])));
  if (E.size === 'custom') {                                         // width and height; the aspect follows the sequence unless unlocked
    const r = h('div', 'ms-row ms-row-sel'), box = h('span'), iw = h('input'), ih = h('input'), lock = h('input');
    for (const [x, v] of [[iw, w], [ih, h2]]) { x.type = 'number'; x.min = 16; x.max = maxTex; x.step = 2; x.value = v; x.style.width = '70px'; }
    lock.type = 'checkbox'; lock.checked = E.lock !== false; lock.title = 'keep the sequence aspect';
    const set = (nw, nh) => { U.exp.cw = Math.min(maxTex, even(nw)); U.exp.ch = Math.min(maxTex, even(nh)); S.save(); refreshExport(); };
    iw.onchange = () => set(+iw.value, lock.checked ? +iw.value / A : +ih.value); ih.onchange = () => set(lock.checked ? +ih.value * A : +iw.value, +ih.value);
    lock.onchange = () => { U.exp.lock = lock.checked; S.save(); if (lock.checked) set(+iw.value, +iw.value / A); };
    box.append(iw, ' × ', ih, ' ', lock, ' aspect'); r.append(h('span', '', 'pixels'), box); expForm.append(r);
  }
  if (!png) expForm.append(sel1('codec', 'codec', [['auto', `auto · ${auto ? auto.toUpperCase() : 'none'}`], ...codecs.map((c) => [c, c.toUpperCase()])]), sel1('quality', 'quality', QUALITIES.map((q) => [q, q])));
  expForm.append(sel1('range', 'range', [['auto', s.exportRange ? 'I–O range' : 'whole sequence'], ['whole', 'whole sequence'], ['range', 'I–O range']]),
    sel1('audio', 'audio', [['true', 'the sequence mix'], ['false', 'none']], () => { U.exp.audio = U.exp.audio === true || U.exp.audio === 'true'; S.save(); refreshExport(); }));
  const notes = [];
  if (w * h2 > cap[0] * cap[1]) notes.push(`above this device's comfortable size (${cap[0]}×${cap[1]}): slow, and it may run out of memory`);
  if (codec === 'avc' && w * h2 > 1920 * 1088 && E.quality !== 'low' && E.quality !== 'very-low') notes.push('H.264 above 1080p encodes slowly at this quality (HEVC or AV1 are several times faster)');
  if (E.codec && E.codec !== 'auto' && !codecs.includes(E.codec)) notes.push(`${E.codec.toUpperCase()} cannot encode ${w}×${h2} here: using ${(codec || 'none').toUpperCase()}`);
  const fpsTxt = +fpsOf().toFixed(3);
  expForm.append(h('div', 'ms-kv', [['output', png ? `${w}×${h2} · PNG frames${U.exp.audio && U.exp.audio !== 'false' && a.mode ? ' + WAV (24-bit, 48 kHz)' : ''} · ${fpsTxt} fps` : `${w}×${h2} · ${codec ? codec.toUpperCase() : 'no encoder'} · ${fpsTxt} fps`], ...(notes.length ? [['note', notes.join('; ')]] : []), ['range', `${range.in} – ${range.out} (${range.out - range.in} frames, ${timecode(range.out - range.in, fpsOf(), true)})`],
      ['audio', !U.exp.audio || U.exp.audio === 'false' ? 'none' : !a.mode ? `none: ${a.reason}` : png && a.mode ? 'the sequence mix as a WAV beside the frames' : a.mode === 'pass' ? `${m?.name}: passed through (one untouched clip)` : ac ? `mixed (${a.clips} clip${a.clips > 1 ? 's' : ''}) → ${ac.toUpperCase()} 48 kHz stereo` : `dropped: this browser cannot encode audio for ${E.container.toUpperCase()}`], ['saved to', png ? (window.showDirectoryPicker ? 'a folder you choose' : 'one ZIP, then downloaded') : window.showSaveFilePicker ? 'a file you choose' : 'browser storage, then downloaded'],
      ...(png ? [['in your edit', `import the first frame as an image sequence at ${fpsTxt} fps (Premiere: tick Image Sequence; Resolve and Final Cut read the numbered frames as one clip), then add the WAV`]] : []),
      ['render', 'same look at any size (pixel settings scale); in order from the range start']].map(([k, x]) => `<span>${k}</span><span>${x}</span>`).join('')));
  expGo.disabled = !!expAbort || !codec || range.out <= range.in;
}
async function openMedia(m) {
  if (!m || m.hash.startsWith('fixture:')) return null;
  const entry = lib?.list().find((e) => e.id === m.hash) || session.get(m.hash); if (!entry) return null;
  return openVideo(entry.file || (await lib.file(entry)), entry.name);
}
async function runExport({ where = 'auto' } = {}) {
  await refreshExport(); if (!expPlan) return null;
  play.on = false; refresh();
  const E = U.exp, base = `${project.name.replace(/[^\w .-]+/g, '_')}-moshine`, png = E.container === 'png', name = png ? base : `${base}.${E.container}`;
  let target; try { target = png ? await openSequenceTarget(base, where) : await openTarget(name, E.container, where); } catch (e) { if (e.name !== 'AbortError') note('cannot open the output ' + (png ? 'folder' : 'file') + ': ' + e.message); return null; }
  expAbort = new AbortController(); exporting = true; expGo.disabled = true; expStop.disabled = false;
  try {
    const r = await exportSequence({ gpu, project, w: expPlan.w, h: expPlan.h, range: expPlan.range, container: E.container, codec: expPlan.codec, quality: E.quality, audio: E.audio === true || E.audio === 'true',
      sources, openMedia, target, signal: expAbort.signal,
      onProgress: (p) => { expBar.firstChild.style.width = (100 * p.frame) / p.frames + '%'; expTxt.textContent = `${p.frame} / ${p.frames} frames · ${p.fps.toFixed(1)} fps · ${timecode(Math.round(p.eta * fpsOf()), fpsOf())} left`; } });
    const head = `Done: ${r.frames} frames in ${r.seconds.toFixed(1)} s · ${r.codec.toUpperCase()}${r.audio ? ' + ' + r.audio.toUpperCase() : ''}${r.audioNote ? ' · audio ' + r.audioNote : ''}`;
    if (target.kind === 'folder') { expTxt.textContent = `${head} · in ${target.name}`; return { ...r, target }; }
    const file = await r.file();
    expTxt.innerHTML = `${head} · ${fmtBytes(file.size)}`;
    if (target.kind === 'opfs' || target.storage === 'opfs') { const a = h('a', 'ms-b', 'DOWNLOAD'); a.style.cssText = 'display:inline-grid;text-decoration:none;margin-left:8px;padding:0 8px'; a.href = URL.createObjectURL(file); a.download = file.name; expTxt.append(a); }
    return { ...r, size: file.size, target };
  } catch (e) { expTxt.textContent = e.name === 'AbortError' ? 'Export cancelled.' : 'Export failed: ' + e.message; return null; }
  finally { expAbort = null; exporting = false; expStop.disabled = true; refreshExport(); }
}
expGo.onclick = () => runExport();
expStop.onclick = () => expAbort?.abort();

// ------------------------------------------------------------------------------------------------ project files
async function newProject() { await autosave.flush(); useProject(createProject({ name: 'Untitled', width: 1920, height: 1080, timebase: { num: 30, den: 1 } })); note('new project: ADD media from the Media window or drop a video'); }
async function openMosh() {
  const i = h('input'); i.type = 'file'; i.accept = '.mosh,application/json';
  i.onchange = async () => { if (!i.files[0]) return; try { await autosave.flush(); const p = await readFile(i.files[0]); useProject(p); autosave.touch(p); note(`opened ${i.files[0].name}`); } catch (e) { note('cannot open: ' + e.message); } };
  i.click();
}
async function openStored(id) { try { await autosave.flush(); useProject(await store.load(id)); note('opened ' + project.name); } catch (e) { note('cannot open: ' + e.message); } }
async function saveMosh() { try { await autosave.flush(); const n = await saveFile(project); if (n) note('saved ' + n); } catch (e) { note('save failed: ' + e.message); } }
/** The project as a link: it replays the same pixels anywhere the same media is in the library (matched by content). */
async function copyMoshID() {
  try {
    const id = await toMoshID(project), url = `${location.origin}${location.pathname}#${id}`;
    try { await navigator.clipboard.writeText(url); note(`Mosh ID link copied (${url.length} characters)`); } catch (e) { prompt('Mosh ID link', url); }
  } catch (e) { note('cannot make a Mosh ID: ' + e.message); }
}
async function openMoshID(id) {
  try {
    const p = await fromMoshID(id); await autosave.flush(); useProject(p); autosave.touch(p);
    const have = new Set([...(lib ? lib.list().map((e) => e.id) : []), ...session.keys()]), missing = p.media.filter((m) => !m.hash.startsWith('fixture:') && !have.has(m.hash)).map((m) => m.name);
    note(missing.length ? `opened from a Mosh ID; missing media: ${missing.join(', ')} — import the same files to see them` : `opened ${p.name} from a Mosh ID`);
  } catch (e) { note('cannot open the Mosh ID: ' + e.message); }
}
function rename() { const n = prompt('Project name', project.name); if (n && n !== project.name) run('setValue', { id: project.id, path: ['name'], value: n }); }

// ------------------------------------------------------------------------------------------------ layers
// Video and image layers stack upwards (a higher layer covers the ones below, through its opacity and blend mode); a
// mosh layer is an effect channel whose clip moshes everything below it; audio layers sit at the top of the list.
function topVisual() { const cs = seq().channels; let i = -1; cs.forEach((c, k) => { if (c.kind !== 'audio') i = k; }); return i; }
Object.assign(A, {
  addLayer: (kind) => {
    const s = seq();
    try {
      tl.transaction(`Add ${kind === 'effect' ? 'mosh' : kind} layer`, () => {
        const id = tl.exec('addChannel', { kind, index: kind === 'audio' ? s.channels.length : topVisual() + 1 }), ch = s.channels.find((c) => c.id === id);
        if (kind === 'effect') {                                     // useful at once: a mosh over the whole sequence
          const params = normalize(ALL['Xvid classic']); delete params.seed;
          const ec = createEffectClip({ in: 0, out: Math.max(1, sequenceEnd(s)) }, { stack: [createEffect('moshLoop', { params, seed: 1 + Math.floor(Math.random() * 9999) })] }); ec.label = 'Xvid classic';
          tl.select(tl.exec('addClip', { channelId: id, clip: ec }));
        }
        note(`${ch.name} added${kind === 'video' ? ': ADD media from the Media window, or import an image' : kind === 'effect' ? ': it moshes every layer below it; pick a look' : ''}`);
      });
    } catch (e) { note(e.message); }
  },
  /** Delete the layer of the selected clip, else the topmost empty layer. */
  deleteLayer: () => {
    const s = seq(), v = indexProject(project).get(tl.selectedClips()[0]), ch = v?.ch || [...s.channels].reverse().find((c) => !c.clips.length);
    if (!ch) { note('select a clip on the layer to delete'); return; }
    if (s.channels.filter((c) => c.kind === 'video').length === 1 && ch.kind === 'video') { note('the last video layer stays'); return; }
    run('deleteChannel', { id: ch.id }, `layer ${ch.name} deleted`);
  },
  importImage: () => { const i = h('input'); i.type = 'file'; i.accept = 'image/*,.png,.jpg,.jpeg,.webp,.gif,.avif'; i.onchange = () => i.files[0] && importFile(i.files[0]); i.click(); },
});
const layerItems = () => [
  { label: 'Add video layer', run: () => A.addLayer('video') }, { label: 'Add mosh layer (moshes the layers below)', run: () => A.addLayer('effect') }, { label: 'Add audio layer', run: () => A.addLayer('audio') }, '-',
  { label: 'Import video…', run: () => impBtn.click() }, { label: 'Import image…', run: A.importImage }, '-',
  { label: 'Delete layer', run: A.deleteLayer },
];
const tlAdd = h('button', 'ms-b tl-add', '+ LAYER'); tlAdd.title = 'add a video, image, mosh or audio layer'; tlPane.querySelector('.ms-wcap').append(tlAdd);
S.menu(null, layerItems, tlAdd);

// ------------------------------------------------------------------------------------------------ the tour (help.js)
// Windows the tour opens it also closes again; ones the user had open stay open.
const tourOpened = new Set();
const tour = createTour({ S, mk, get play() { return play; }, get project() { return project; },
  openWin: (k) => { if (!U.open[k]) { tourOpened.add(k); S.toggleWin(k, true); } },
  closeWin: (k) => { if (tourOpened.delete(k)) S.toggleWin(k, false); },
  closeOpened: () => { for (const k of tourOpened) if (k !== 'export') S.toggleWin(k, false); tourOpened.clear(); } });   // Export stays: the tour ends there
const tourBtn = h('button', 'ms-b', '?'); tourBtn.title = 'the 1-minute tour'; tourBtn.id = 'ms-tourbtn';
tourBtn.onclick = () => (tour.active ? tour.stop() : tour.start(0));

// ------------------------------------------------------------------------------------------------ menus, windows, keys
const scaleItems = () => [{ label: 'Preview: auto (governor)', chk: U.pin === null, run: () => { U.pin = null; S.save(); gov.pin(null); rebuildRenderer(); pump(); } },
  ...SCALES.map((sc, i) => ({ label: `Preview: ${Math.round(sc * 100)} %`, chk: U.pin === i, run: () => { U.pin = i; S.save(); gov.pin(i); rebuildRenderer(); pump(); } }))];
S.menu('File', () => [{ label: 'New project', run: newProject }, { label: 'Open .mosh…', key: '⌘O', run: openMosh }, { label: 'Save .mosh…', key: '⌘S', run: saveMosh }, { label: 'Rename project…', run: rename }, '-',
  { head: 'Recent (this browser)' }, ...(store ? store.list().slice(0, 8).map((e) => ({ label: `${e.name} · ${e.modified.slice(0, 16).replace('T', ' ')}`, chk: project && e.id === project.id, run: () => openStored(e.id) })) : []),
  { label: 'Demo project', run: async () => { await autosave.flush(); useProject(demoProject()); } }, '-',
  { label: 'Import media…', key: '⌘I', run: () => impBtn.click() }, { label: 'Media library', run: () => S.toggleWin('media', true) }, '-',
  { label: 'Copy Mosh ID link', run: copyMoshID }, { label: 'Open a Mosh ID…', run: () => { const s2 = prompt('Paste a Mosh ID link or ID'); if (s2) openMoshID(s2.slice(s2.indexOf('P1.'))); } }]);
S.menu('Edit', () => [{ label: tl.undoLabel ? `Undo ${tl.undoLabel}` : 'Undo', key: '⌘Z', run: tl.canUndo ? A.undo : null }, { label: tl.redoLabel ? `Redo ${tl.redoLabel}` : 'Redo', key: '⇧⌘Z', run: tl.canRedo ? A.redo : null }, '-',
  { label: 'Copy', key: '⌘C', run: A.copy }, { label: 'Paste at playhead', key: '⌘V', run: A.paste }, { label: 'Duplicate', key: '⌘D', run: A.dup }, { label: 'Delete', key: '⌫', run: A.del }, '-',
  { label: 'Split at playhead', key: '⌘B', run: A.split }, { label: 'Blade tool', key: 'B', chk: view.tool === 'blade', run: () => { view.tool = view.tool === 'blade' ? 'select' : 'blade'; } }, { label: 'Snapping', key: 'N', chk: view.snap, run: () => { view.snap = !view.snap; } }, '-',
  { label: 'Add marker', key: 'M', run: A.marker }, { label: 'Add mosh hit', key: 'H', run: A.hit }, { label: 'Bloom Insert (1 s)', key: '⇧B', run: A.bloomInsert }, { label: 'Mosh Cut at the nearest join', key: '⇧C', run: A.moshCut }, '-',
  { label: 'Range in', key: 'I', run: A.setIn }, { label: 'Range out', key: 'O', run: A.setOut }, { label: 'Clear range', run: A.clearRange }]);
S.menu('Layer', layerItems);
S.menu('Effects', () => [{ label: 'Effects browser…', key: '⌘E', run: () => S.toggleWin('effects', true) }, { label: 'Mosh the selection (Xvid classic)', key: 'E', run: () => A.moshSelection() }, '-', { head: 'Styles → selection' }, ...Object.keys(PRESETS).map((n) => ({ label: n, run: () => applyPreset(n) })), '-', { head: 'Legacy DATAMOSHINE' }, ...Object.keys(LEGACY).map((n) => ({ label: n, run: () => applyPreset(n) }))]);
S.menu('View', () => [...scaleItems(), '-', { label: 'Fit the sequence', key: '⇧Z', run: () => view.fit() }, { label: 'Zoom in', key: '⌘+', run: () => view.zoom(1.5) }, { label: 'Zoom out', key: '⌘−', run: () => view.zoom(1 / 1.5) }, { label: 'Loop the range', chk: loopRange, run: () => { loopRange = !loopRange; refresh(); } }]);
S.menu('Export', () => [{ label: 'Export video…', key: '⌘⇧E', run: () => { S.toggleWin('export', true); refreshExport(); } }]);
S.menu('Lab', () => [{ label: 'Open the algorithm lab', run: () => { location.href = 'lab.html'; } }, { label: 'Run tests', run: () => S.toggleWin('tests', true) }, { label: 'Device', run: () => S.toggleWin('device', true) }]);
S.menu('Help', () => [{ label: 'Tour (1 minute)', run: () => tour.start(0) }, ...(tour.saved ? [{ label: `Resume the tour (step ${tour.saved + 1})`, run: () => tour.start(tour.saved) }] : []), '-', { label: 'Keyboard map', run: () => S.toggleWin('keys', true) }, { label: 'About MOSHINE', run: () => S.toggleWin('about', true) }]);
S.onAction(refresh);
function refresh() {
  if (!tl) return;
  S.status.textContent = `${seq().width}×${seq().height} · ${+fpsOf().toFixed(3)} fps · preview ${rsize ? rsize.join('×') : '—'} · tier ${tierOf()}${tl.canUndo ? ' · undo: ' + tl.undoLabel : ''}`;
  $('ms-play').textContent = play.on ? '❚❚' : '▶'; $('ms-sound').classList.toggle('on', !!U.sound); $('ms-loop').classList.toggle('on', loopRange);
}
S.win('media', 'Media', mediaBox, { x: 16, y: 70, w: 380 });
// the Effects browser: every effect type, searchable; ADD to the selected clip's stack, CLIP = a new effect clip over the
// selection (adjustment-clip semantics: it processes everything below it)
const fxBox = h('div'), fxFind = h('input'), fxList = h('div', 'ms-res fx-list');
fxFind.type = 'text'; fxFind.placeholder = 'search effects…'; fxFind.className = 'fx-find';
const FX_NOTES = { moshLoop: 'the recurrent core: motion estimate, field ops, bloom hold, warp, residual, reset; in-loop and post effects inside', dct: 'block DCT quantisation (macroblock look)', chroma: 'chroma subsampling and offset', deblock: 'codec deblocking filter',
  posterise: 'quantise levels, optionally by motion', stripes: 'DCT basis stripes in blocks', echo: 'trails: mix / max / add with the previous output', displace: 'shift pixels by the motion field', blockdrag: 'drag or shuffle random blocks',
  slice: 'horizontal slice tearing', rgbsplit: 'offset the colour channels (by motion too)', colour: 'levels, gamma, saturation, hue, invert, threshold', freeze: 'freeze random blocks for a while' };
function refreshFx() {
  const q = fxFind.value.trim().toLowerCase(); fxList.innerHTML = '';
  for (const [k, T] of Object.entries(EFFECTS)) {
    if (q && !`${T.label} ${k} ${FX_NOTES[k] || ''}`.toLowerCase().includes(q)) continue;
    const row = h('div'), add = h('button', 'ms-b', 'ADD'), clip = h('button', 'ms-b', 'CLIP'), tools = h('span');
    add.title = 'add to the selected clip'; clip.title = 'new effect clip over the selection'; add.onclick = () => A.addEffect(k); clip.onclick = () => (k === 'moshLoop' ? A.moshSelection() : A.effectClip(k));
    row.ondblclick = () => A.addEffect(k);
    tools.append(add, clip); row.append(h('span', '', `<b>${T.label}</b>${T.group ? ' <small>group</small>' : ''}${T.stateful ? ' <small>stateful</small>' : ''}<br>${FX_NOTES[k] || ''}`), tools); fxList.append(row);
  }
}
fxFind.oninput = refreshFx; fxBox.append(fxFind, fxList, h('div', 'ms-note', 'Double-click or ADD puts the effect on the selected clip. CLIP makes an effect clip over the selected media (or 2 s at the playhead) that processes every channel below it. Field ops, in-loop and post effects live inside a Mosh Loop (its stack panel).'));
S.win('effects', 'Effects', fxBox, { x: 400, y: 70, w: 360 }); refreshFx();
S.win('export', 'Export', expBox, { x: -16, y: 70, w: 360 }).addEventListener('ms-open', () => refreshExport());
deviceWindow(S, P, gpu);
testsWindow(S, { pause: () => { play.on = false; } });
S.win('keys', 'Keyboard map', h('div', 'ms-kv', [['space / K', 'play · pause'], ['J / L', 'reverse · forward'], ['← →', 'frame step'], ['Home / End', 'start · end'], ['⌘B', 'split at playhead'], ['B', 'blade tool'], ['N', 'snapping'],
  ['M / H', 'marker · mosh hit'], ['⇧B', 'Bloom Insert'], ['⇧C', 'Mosh Cut'], ['E', 'mosh the selection'], ['I / O', 'range in · out'], ['⌘Z / ⇧⌘Z', 'undo · redo'], ['⌘C ⌘V ⌘D ⌫', 'copy · paste · duplicate · delete'],
  ['[ / ]', 'previous · next key of the shown parameter'], ['G / ⇧G', 'mask brush · lock brush (Esc ends)'], ['[ / ] or wheel', 'with a brush on: brush size'], ['V', 'vector brush: paint motion along the drag'], ['⇧Z', 'fit'], ['⌘+ / ⌘−', 'zoom'], ['wheel', 'scroll (⇧ horizontal, ⌘/pinch zoom)']].map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('')), { x: 120, y: 90, w: 360 });
S.win('about', 'About MOSHINE', (() => { const d = h('div'); d.append(
  h('div', 'ms-note', '<b>MOSHINE</b> — state-of-the-art datamoshing in the browser: a simulated codec on WebGPU, scored against real MPEG-4 and H.264 moshes, every parameter keyframeable and modulatable, deterministic.'),
  h('div', 'ms-note', 'Milestone 5: the timeline. Channels composite bottom-up; an effect clip moshes everything below it. Seeking replays from the effect clip’s in-point until the checkpoint cache (M6); the red bar on the ruler marks where that happens.'),
  h('div', 'ms-note', 'Fonts: Urbanist (SIL OFL 1.1). Mediabunny (MPL-2.0).')); return d; })(), { x: 120, y: 120, w: 340 });

$('ms-play').onclick = A.play; $('ms-back').onclick = () => { play.dir = -1; play.on = true; refresh(); };
$('ms-step').onclick = () => seek(play.want + 1); $('ms-home').onclick = () => seek(0); $('ms-end').onclick = () => seek(sequenceEnd(seq()) - 1);
$('ms-loop').onclick = () => { loopRange = !loopRange; refresh(); };
$('ms-sound').onclick = () => { U.sound = !U.sound; S.save(); refresh(); }; $('ms-hit').onclick = A.hit; $('ms-split').onclick = A.split;
addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input, select, textarea')) return;
  const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase(); let hit = true;
  if (mod && k === 'z') (e.shiftKey ? A.redo : A.undo)();
  else if (mod && k === 'y') A.redo();
  else if (mod && k === 'b') A.split();
  else if (mod && k === 'd') A.dup();
  else if (mod && k === 'c') A.copy();
  else if (mod && k === 'v') A.paste();
  else if (mod && k === 's') saveMosh();
  else if (mod && k === 'o') openMosh();
  else if (mod && k === 'i') impBtn.click();
  else if (mod && k === 'e' && e.shiftKey) { S.toggleWin('export', true); refreshExport(); }
  else if (mod && k === 'e') S.toggleWin('effects', true);
  else if (mod && (k === '=' || k === '+')) view.zoom(1.5);
  else if (mod && k === '-') view.zoom(1 / 1.5);
  else if (mod) hit = false;
  else if (k === ' ' || k === 'k') { play.dir = 1; play.on = k === ' ' ? !play.on : false; if (play.on && U.sound) sound.prime(); }
  else if (k === 'l') { play.dir = 1; play.on = true; if (U.sound) sound.prime(); }
  else if (k === 'j') { play.dir = -1; play.on = true; }
  else if (e.key === 'ArrowRight') seek(play.want + (e.shiftKey ? 10 : 1));
  else if (e.key === 'ArrowLeft') seek(play.want - (e.shiftKey ? 10 : 1));
  else if (e.key === 'Home') seek(0);
  else if (e.key === 'End') seek(sequenceEnd(seq()) - 1);
  else if (e.key === 'Delete' || e.key === 'Backspace') A.del();
  else if (k === 'b' && e.shiftKey) A.bloomInsert();
  else if (k === 'b') view.tool = view.tool === 'blade' ? 'select' : 'blade';
  else if (k === 'c' && e.shiftKey) A.moshCut();
  else if (k === 'n') view.snap = !view.snap;
  else if (k === 'm') A.marker();
  else if (k === 'h') A.hit();
  else if (k === 'e') A.moshSelection();
  else if (k === 'g') setTool(e.shiftKey ? 'lock' : 'include');
  else if (k === 'v') setTool('vector');
  else if (k === 'i') A.setIn();
  else if (k === 'o') A.setOut();
  else if (k === 'z' && e.shiftKey) view.fit();
  else if (e.key === '[') { if (mk.tool) setSize(mk.size / 1.25); else A.key(-1); }      // with a brush on: its size (paint-app keys)
  else if (e.key === ']') { if (mk.tool) setSize(mk.size * 1.25); else A.key(1); }
  else if (e.key === 'Escape') { if (mk.tool) setTool(mk.tool); else { tl.select(null); view.tool = 'select'; } }
  else hit = false;
  if (hit) { e.preventDefault(); refresh(); }
});
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', (e) => {
  e.preventDefault(); const files = [...(e.dataTransfer?.files || [])];
  const m = files.find((x) => /\.mosh$/i.test(x.name)); if (m) { readFile(m).then((p) => { useProject(p); autosave.touch(p); }).catch((err) => note('cannot open: ' + err.message)); return; }
  const f = files.find((x) => /^video\//.test(x.type) || /\.(mp4|mov|webm|mkv|m4v)$/i.test(x.name) || isImage(x)); if (f) importFile(f);
});
addEventListener('pagehide', () => { autosave.flush(); });

// ------------------------------------------------------------------------------------------------ go
if (qs.has('harness')) window.__moshineHarness = await import('./harness.js');
let start = null;
if (store && !qs.has('demo') && !qs.has('bench')) { const id = U.last && store.list().some((e) => e.id === U.last) ? U.last : store.list()[0]?.id; if (id) { try { start = await store.load(id); } catch (e) { note('could not reopen the last project: ' + e.message); } } }
relayout(); requestAnimationFrame(() => { densify(); requestAnimationFrame(densify); });   // twice: the stage height settles after the rows
useProject(start || demoProject());
if (location.hash.startsWith('#P1.')) await openMoshID(location.hash.slice(1));
refreshMedia(); refresh();
// library entries imported before 2026-10-22 were probed at 30 fps whatever their rate (no info.rate): probe them again
if (lib) (async () => { let n = 0; for (const e of lib.list().filter((x) => x.info && !x.info.rate && x.info.kind !== 'image')) { try { const v = await openVideo(await lib.file(e), e.name); await lib.setInfo(e, v.info()); v.close(); n++; } catch (err) {} } if (n) refreshMedia(); })();
window.__app = { tour, sources, openMedia, sound, decodeAudio, featureTables, ensureFeatures, mk, setTool, drawMaskOverlay, lookTarget, refreshLooks, fillStep, coverageNow, runExport, refreshExport, get project() { return project; }, get tl() { return tl; }, get play() { return play; }, get view() { return view; }, get renderer() { return renderer; }, importFile, addToTimeline, seek, pump, A, applyPreset, useProject, demoProject, refresh, inspector };
requestAnimationFrame(tick);
$('ms-dock').insertBefore(tourBtn, $('ms-dock').querySelector('.hint'));   // last in the dock, after every window's button
if (!qs.has('bench') && !qs.has('harness')) { if (qs.has('tour')) tour.start(0); else setTimeout(() => tour.offer(), 1500); }
if (!qs.has('bench')) setTimeout(async () => { PM = await measure(gpu, P); note(`probe: Mosh Loop ~${PM.loop1080Ms} ms per 1080p frame · H.264 encode ${PM.encFps} / decode ${PM.decFps} fps · tier ${PM.tier}`); rebuildRenderer(); pump(); refresh(); }, 800);
