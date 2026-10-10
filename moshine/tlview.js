// tlview.js — the canvas timeline (spec §11.1, §11.2): DOM channel headers on the left, one canvas for the ruler and
// the lanes on the right. The ruler shows time codes, the render-status bar, markers and mosh hits, the export range
// and the playhead. Lanes hold clips. The parameter shown by the inspector gets a keyframe lane, with diamonds and the
// modulated value as a ghost curve over its base curve. Every edit goes through the command bus (timeline.js) on
// pointer up, so a drag is one undo step. Geometry (rows, frame <-> x, hit testing) is pure and node-tested.
import { snapPoints, snap, snapDelta, indexProject } from './timeline.js';
import { EFFECTS } from './project.js';
import { curve, resolve } from './params.js';
import { clockOf } from './sequence.js';

export const RULER = 30;
const isAnim = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && ('value' in v || 'keys' in v);

// ------------------------------------------------------------------------------------------------ geometry (pure)
/** Rows top-down: channels in reverse (the top channel composites last), plus a keyframe row under the channel that
 *  owns the shown parameter. shown: { clipId, channelId } | null. y is in lane space (0 = first row). */
export function layoutRows(seq, shown, { laneH = 44, kfH = 26 } = {}) {
  const rows = []; let y = 0;
  for (let ci = seq.channels.length - 1; ci >= 0; ci--) {
    const ch = seq.channels[ci];
    rows.push({ kind: 'channel', ch, ci, y, h: laneH }); y += laneH;
    if (shown && shown.channelId === ch.id) { rows.push({ kind: 'kf', ch, ci, y, h: kfH }); y += kfH; }
  }
  return rows;
}
export const frameToX = (f, v) => (f - v.x0) * v.ppf;
export const xToFrame = (x, v) => x / v.ppf + v.x0;
export const rowAt = (rows, y) => rows.find((r) => y >= r.y && y < r.y + r.h) || null;
/**
 * What is under lane-space point (x, y): { type: 'clip', row, clip, edge: 'in' | 'out' | null } on a clip (edges
 * within `edge` px), { type: 'key', row, frame } on a diamond, { type: 'kf', row } or { type: 'lane', row } on empty
 * space, { type: 'none' } below the rows. keys: absolute key frames of the keyframe row.
 */
export function hitTest(rows, v, x, y, { edge = 6, keys = [] } = {}) {
  const row = rowAt(rows, y); if (!row) return { type: 'none' };
  if (row.kind === 'kf') {
    const k = keys.find((f) => Math.abs(frameToX(f, v) - x) <= 6);
    return k !== undefined ? { type: 'key', row, frame: k } : { type: 'kf', row };
  }
  const f = xToFrame(x, v);
  for (const clip of row.ch.clips) {
    const a = frameToX(clip.range.in, v), b = frameToX(clip.range.out, v);
    if (x < a - 1 || x > b + 1) continue;
    const e = Math.min(edge, (b - a) / 3);
    return { type: 'clip', row, clip, edge: x - a <= e ? 'in' : b - x <= e ? 'out' : null, frame: f };
  }
  return { type: 'lane', row, frame: f };
}
/** A ruler step (frames) whose labels sit at least `minPx` apart. */
export function rulerStep(ppf, fps, minPx = 70) {
  const s = [1, 2, 5, 10, Math.round(fps / 2), Math.round(fps), 2 * fps, 5 * fps, 10 * fps, 15 * fps, 30 * fps, 60 * fps, 120 * fps, 300 * fps, 600 * fps].map(Math.round);
  return s.find((k) => k * ppf >= minPx) || s[s.length - 1];
}
export function timecode(f, fps, withFrames = false) {
  const s = Math.floor(f / fps), m = Math.floor(s / 60), r = f - Math.round(s * fps);
  return `${m}:${String(s % 60).padStart(2, '0')}${withFrames ? '.' + String(Math.max(0, r)).padStart(2, '0') : ''}`;
}

// ------------------------------------------------------------------------------------------------ the view
const COL = { media: '#e4e4e4', hold: '#d8e8ff', effect: '#ffe6c0', audio: '#d8f0d8', navy: '#000080', red: '#c01010', yellow: '#e0c000', green: '#20a040', dk: '#808080' };

/**
 * createTimelineView(host, { tl, playhead(), onSeek(f, final), note(msg), onPick(clipId) }) builds the timeline inside
 * `host`. Methods: draw(), fit(), zoom(factor, atFrame?), showParam({ id, path, spec, label } | null), tool, snap.
 */
export function createTimelineView(host, { tl, playhead, onSeek, note = () => {}, onPick = () => {}, coverage = null }) {
  const touch = () => document.body.classList.contains('ms-touch');
  const v = { x0: -2, ppf: 4, y0: 0 }, st = { tool: 'select', snap: true, shown: null };
  host.classList.add('tl');
  host.innerHTML = `<div class="tl-corner"><button class="ms-b" data-k="snap" title="snapping (N)">N</button><button class="ms-b" data-k="blade" title="blade tool (B)">B</button>
    <button class="ms-b" data-k="fit" title="fit the sequence (Shift+Z)">FIT</button><span class="tl-info"></span></div>
    <div class="tl-heads"><div class="tl-hin"></div></div><canvas class="tl-cv"></canvas>`;
  const cv = host.querySelector('.tl-cv'), ctx = cv.getContext('2d'), heads = host.querySelector('.tl-hin'), info = host.querySelector('.tl-info');
  const btn = (k) => host.querySelector(`[data-k="${k}"]`);
  btn('snap').onclick = () => { st.snap = !st.snap; draw(); };
  btn('blade').onclick = () => { st.tool = st.tool === 'blade' ? 'select' : 'blade'; draw(); };
  btn('fit').onclick = () => fit();
  const seq = () => tl.project.sequences.find((s) => s.id === tl.project.activeSequence);
  const fps = () => seq().timebase.num / seq().timebase.den;
  const dims = () => ({ laneH: touch() ? 52 : 34, kfH: touch() ? 34 : 24 });     // dense on desktop (D41)
  let W = 0, H = 0, rows = [], drag = null, headSig = '';
  const pointers = new Map();

  let needFit = false;
  new ResizeObserver(() => { const r = cv.getBoundingClientRect(), d = devicePixelRatio || 1; W = r.width; H = r.height; cv.width = Math.round(W * d); cv.height = Math.round(H * d); if (needFit && W > 0) { needFit = false; fit(); } else draw(); }).observe(cv);

  // ---- the shown parameter (keyframe lane)
  function shownInfo() {
    if (!st.shown) return null;
    const ix = indexProject(tl.project), o = ix.get(st.shown.id); if (!o) return null;
    const clip = o.kind === 'clip' ? o.obj : o.clip, ch = o.ch || (clip && ix.get(clip.id)?.ch); if (!ch) return null;
    let val = o.obj; for (const k of st.shown.path) val = val?.[k];
    return { ...st.shown, clip, ch, val, off: clip ? clip.range.in : 0, clock: clockOf(seq(), clip, o.kind === 'effect' ? o.obj.seed : 0) };
  }
  const keyFrames = (S) => (S && isAnim(S.val) && S.val.keys ? S.val.keys.map((k) => k.frame + S.off) : []);

  // ---- drawing
  function draw() {
    if (!W || !tl.project) return;                                     // the canvas can be measured before the first project loads
    const s = seq(), S = shownInfo(), d = devicePixelRatio || 1, { laneH, kfH } = dims(), fp = fps();
    rows = layoutRows(s, S && { channelId: S.ch.id }, { laneH, kfH });
    btn('snap').classList.toggle('on', st.snap); btn('blade').classList.toggle('on', st.tool === 'blade');
    info.textContent = timecode(playhead(), fp, true); info.title = `${Math.round(v.ppf * 100) / 100} px per frame`;
    syncHeads(s, S);
    ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, W, H); ctx.textBaseline = 'top';
    const step = rulerStep(v.ppf, fp), f0 = Math.floor(xToFrame(0, v) / step) * step, f1 = xToFrame(W, v);
    // lanes
    ctx.save(); ctx.beginPath(); ctx.rect(0, RULER, W, H - RULER); ctx.clip(); ctx.translate(0, RULER - v.y0);
    for (const r of rows) {
      ctx.fillStyle = r.kind === 'kf' ? '#f4f4f4' : r.ci % 2 ? '#fff' : '#fafafa'; ctx.fillRect(0, r.y, W, r.h);
      ctx.fillStyle = COL.dk; ctx.fillRect(0, r.y + r.h - 1, W, 1);
    }
    ctx.fillStyle = '#eee'; for (let f = f0; f <= f1; f += step) ctx.fillRect(Math.round(frameToX(f, v)), 0, 1, rows.length ? rows[rows.length - 1].y + rows[rows.length - 1].h : 0);
    const sel = tl.selection, moved = drag && drag.kind === 'move' && drag.active ? drag : null;
    for (const r of rows) if (r.kind === 'channel') for (const k of r.ch.clips) drawClip(k, r, sel.has(k.id), r.ch.bypassed);
    if (moved) for (const it of moved.items) {
      const r = rows.find((x) => x.kind === 'channel' && x.ci === it.ci + moved.channelDelta); if (!r) continue;
      ghost(frameToX(it.clip.range.in + moved.delta, v), r.y, (it.clip.range.out - it.clip.range.in) * v.ppf, r.h);
    }
    if (drag && drag.kind === 'trim' && drag.active) { const k = drag.clip, a = drag.edge === 'in' ? drag.frame : k.range.in, b = drag.edge === 'out' ? drag.frame : k.range.out; ghost(frameToX(a, v), drag.row.y, (b - a) * v.ppf, drag.row.h); }
    if (S) drawKeys(S, rows.find((r) => r.kind === 'kf'));
    if (drag && drag.kind === 'marquee' && drag.active) { ctx.strokeStyle = COL.navy; ctx.setLineDash([3, 3]); ctx.strokeRect(Math.min(drag.x, drag.x1) + 0.5, Math.min(drag.y, drag.y1) + 0.5, Math.abs(drag.x1 - drag.x), Math.abs(drag.y1 - drag.y)); ctx.setLineDash([]); }
    ctx.restore();
    // ruler
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, RULER); ctx.fillStyle = '#000'; ctx.fillRect(0, RULER - 1, W, 1);
    statusBar(s);
    ctx.font = '400 10px Urbanist, Arial, sans-serif'; ctx.textBaseline = 'top';
    for (let f = f0; f <= f1; f += step) { const x = Math.round(frameToX(f, v)) + 0.5; if (f < 0) continue; ctx.fillStyle = '#000'; ctx.fillRect(x - 0.5, 12, 1, 18); ctx.fillText(timecode(f, fp, step < fp), x + 2, 13); }
    if (s.exportRange) { const a = frameToX(s.exportRange.in, v), b = frameToX(s.exportRange.out, v); ctx.fillStyle = '#000'; for (let x = a; x < b; x += 8) ctx.fillRect(x, 24, Math.min(4, b - x), 5); }
    for (const m of s.markers) {
      const x = frameToX(m.frame, v); if (x < -10 || x > W + 10) continue;
      if (m.hold) { ctx.fillStyle = 'rgba(0,0,128,.25)'; ctx.fillRect(x, 8, m.hold * v.ppf, 4); }
      ctx.fillStyle = m.hit ? COL.navy : m.color === 'red' || !m.color ? COL.red : m.color === 'yellow' ? COL.yellow : m.color;
      ctx.beginPath(); ctx.moveTo(x - 6, 14); ctx.lineTo(x + 6, 14); ctx.lineTo(x, 23); ctx.fill();
    }
    // playhead
    const px = Math.round(frameToX(playhead(), v)) + 0.5;
    ctx.fillStyle = COL.red; ctx.fillRect(px - 1, RULER, 2, H - RULER);
    ctx.beginPath(); ctx.moveTo(px - 7, 0); ctx.lineTo(px + 7, 0); ctx.lineTo(px, 10); ctx.fill();
  }
  function statusBar(s) {
    // green: a seek renders at most K frames (cached or near an in-point); red: a longer sequential replay; yellow:
    // stateless, always live. Ticks below the bar: checkpoints by tier (black GPU, grey memory, blue disk, hollow void).
    const cov = coverage?.();
    if (cov) {
      for (const sp of cov.spans) { const a = frameToX(sp.a, v), b = frameToX(sp.b, v); if (b < 0 || a > W) continue; ctx.fillStyle = COL[sp.kind]; ctx.fillRect(a, 0, Math.max(1, b - a), 6); }
      for (const tk of cov.ticks) {
        const x = Math.round(frameToX(tk.g, v)) + 0.5; if (x < 0 || x > W) continue;
        ctx.strokeStyle = ctx.fillStyle = !tk.ok ? '#b0b0b0' : tk.tier === 'gpu' ? '#000' : tk.tier === 'cpu' ? COL.dk : '#3050c0';
        if (tk.ok) ctx.fillRect(x - 1, 7, 2, 4); else ctx.strokeRect(x - 1.5, 7.5, 2, 3);
      }
      return;
    }
    for (const pass of [false, true]) for (const ch of s.channels) {
      if (ch.kind === 'audio' || ch.bypassed) continue;
      for (const k of ch.clips) {
        const stateful = (k.stack || []).some((e) => e.enabled && (e.type === 'moshLoop' || EFFECTS[e.type]?.stateful));
        if (stateful !== pass) continue;
        const a = frameToX(k.range.in - (k.warmup | 0), v), b = frameToX(k.range.out, v); if (b < 0 || a > W) continue;
        ctx.fillStyle = stateful ? COL.red : COL.yellow; ctx.fillRect(a, 0, b - a, 6);
      }
    }
  }
  function drawClip(k, r, selected, dim) {
    const x = frameToX(k.range.in, v), w = (k.range.out - k.range.in) * v.ppf, y = r.y + 2, h = r.h - 4;
    if (x > W || x + w < 0) return;
    ctx.globalAlpha = dim ? 0.45 : 1;
    ctx.fillStyle = k.kind === 'effect' ? COL.effect : k.kind === 'audio' ? COL.audio : k.hold ? COL.hold : COL.media; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = k.role === 'moshCut' ? COL.red : '#000'; ctx.lineWidth = k.role === 'moshCut' ? 2 : 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); ctx.lineWidth = 1;
    if (k.kind === 'effect' && k.reset !== 'continue') { ctx.fillStyle = COL.navy; ctx.fillRect(x, y, 4, h); }
    if (k.kind === 'effect' && k.warmup > 0) { ctx.fillStyle = 'rgba(0,0,128,.15)'; ctx.fillRect(x - k.warmup * v.ppf, y + h - 4, k.warmup * v.ppf, 4); }
    ctx.save(); ctx.beginPath(); ctx.rect(x + 6, y, Math.max(0, w - 8), h); ctx.clip(); ctx.fillStyle = '#000';
    ctx.font = '700 11px Urbanist, Arial, sans-serif'; ctx.fillText(clipTitle(k), x + 7, y + 3);
    ctx.font = '400 10px Urbanist, Arial, sans-serif'; ctx.fillText(clipSub(k), x + 7, y + 17);
    ctx.restore();
    if (selected) { ctx.strokeStyle = COL.navy; ctx.lineWidth = 2; ctx.strokeRect(x - 1, y - 1, w + 2, h + 2); ctx.lineWidth = 1; }
    ctx.globalAlpha = 1;
  }
  const mediaName = (id) => tl.project.media.find((m) => m.id === id)?.name || id;
  function clipTitle(k) {
    if (k.label) return k.label.toUpperCase();
    if (k.kind === 'effect') return (k.stack.length ? EFFECTS[k.stack[0].type]?.label || k.stack[0].type : 'empty effect clip').toUpperCase();
    return mediaName(k.mediaId);
  }
  function clipSub(k) {
    const fp = fps(), dur = timecode(k.range.out - k.range.in, fp, true);
    if (k.kind === 'effect') return `${dur} · ${k.stack.length} effect${k.stack.length === 1 ? '' : 's'}${k.warmup ? ' · warm-up ' + k.warmup : ''}`;
    if (k.hold) return `hold ×${k.range.out - k.range.in}`;
    return `${dur} · from ${timecode(k.sourceIn, fp, true)}${k.stack?.length ? ' · ' + k.stack.length + ' fx' : ''}`;
  }
  function ghost(x, y, w, h) { ctx.strokeStyle = COL.navy; ctx.setLineDash([4, 3]); ctx.lineWidth = 2; ctx.strokeRect(x, y + 3, w, h - 6); ctx.setLineDash([]); ctx.lineWidth = 1; }
  function drawKeys(S, r) {
    if (!r) return;
    const [lo, hi] = S.spec && S.spec.length === 4 ? [S.spec[0], S.spec[1]] : [0, 1], yOf = (val) => r.y + r.h - 4 - ((val - lo) / (hi - lo || 1)) * (r.h - 8);
    const a = Math.max(Math.floor(xToFrame(0, v)), S.clip ? S.clip.range.in : 0), b = Math.min(Math.ceil(xToFrame(W, v)) + 1, S.clip ? S.clip.range.out : Infinity);
    if (b > a && typeof (isAnim(S.val) ? resolve(S.val, a - S.off, S.clock) : S.val) === 'number') {
      const c = curve(S.val, a - S.off, b - S.off, S.clock), n = c.base.length, dx = Math.max(1, Math.floor(n / Math.max(1, W)));
      for (const [arr, style] of [[c.value, 'rgba(0,0,128,.45)'], [c.base, '#000']]) {
        ctx.strokeStyle = style; ctx.beginPath();
        for (let i = 0; i < n; i += dx) { const X = frameToX(a + i, v), Y = yOf(arr[i]); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
        ctx.stroke();
      }
    }
    for (const f of keyFrames(S)) {
      const x = frameToX(f, v), k = S.val.keys.find((q) => q.frame + S.off === f);
      const moving = drag && drag.kind === 'key' && drag.frame === f && drag.active;
      ctx.save(); ctx.translate(moving ? frameToX(drag.to, v) : x, r.y + r.h / 2); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = k.interp === 'hold' ? '#000' : COL.navy; ctx.fillRect(-4, -4, 8, 8); ctx.restore();
    }
  }
  function syncHeads(s, S) {
    const sig = rows.map((r) => r.kind + r.ch.id + r.ch.name + r.ch.locked + r.ch.bypassed + r.ch.solo + r.h).join('|') + (S ? S.label : '');
    heads.style.transform = `translateY(${-v.y0}px)`;
    if (sig === headSig) return; headSig = sig; heads.innerHTML = '';
    for (const r of rows) {
      const d = document.createElement('div'); d.className = 'tl-head' + (r.kind === 'kf' ? ' kf' : ''); d.style.height = r.h + 'px';
      if (r.kind === 'kf') { d.textContent = '↳ ' + (S?.label || 'parameter'); heads.append(d); continue; }
      const nm = document.createElement('span'); nm.textContent = `${r.ch.name} · ${r.ch.kind}`; d.append(nm);
      const tb = document.createElement('div'); tb.className = 'tl-tb';
      for (const [key, lab, title] of [['locked', 'L', 'lock'], ['bypassed', r.ch.kind === 'audio' ? 'M' : 'B', r.ch.kind === 'audio' ? 'mute' : 'bypass'], ['solo', 'S', 'solo']]) {
        const b = document.createElement('button'); b.textContent = lab; b.title = title; b.classList.toggle('on', !!r.ch[key]);
        b.onclick = () => run('setValue', { id: r.ch.id, path: [key], value: !r.ch[key] }); tb.append(b);
      }
      d.append(tb); heads.append(d);
    }
  }

  // ---- commands with feedback
  function run(name, args) { try { return tl.exec(name, args); } catch (e) { note(e.message); return null; } }

  // ---- pointer handling
  const local = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const tol = () => 8 / v.ppf;
  const snapF = (f, exclude = []) => (st.snap ? snap(f, snapPoints(seq(), { playhead: playhead(), exclude }), tol()).frame : f);
  cv.addEventListener('pointerdown', (e) => {
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointers (tests) cannot be captured */ } pointers.set(e.pointerId, local(e));
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; drag = { kind: 'pinch', d0: Math.abs(a.x - b.x) || 1, ppf0: v.ppf, f: xToFrame((a.x + b.x) / 2, v) }; return; }
    const p = local(e), f = xToFrame(p.x, v);
    if (p.y < RULER) {
      const m = seq().markers.find((q) => Math.abs(frameToX(q.frame, v) - p.x) <= 6 && p.y > 12);
      drag = m ? { kind: 'marker', m, x: p.x, frame: m.frame, active: false } : { kind: 'scrub' };
      if (!m) onSeek(Math.max(0, Math.round(snapF(f))), false);
      return;
    }
    const ly = p.y - RULER + v.y0, S = shownInfo(), hit = hitTest(rows, v, p.x, ly, { keys: keyFrames(S) });
    if (hit.type === 'key') { drag = { kind: 'key', S, frame: hit.frame, to: hit.frame, x: p.x, active: false }; return; }
    if (hit.type === 'clip') {
      const k = hit.clip;
      if (st.tool === 'blade') { const at = Math.round(snapF(f)); if (at > k.range.in && at < k.range.out) run('splitClips', { frame: at, ids: [k.id] }); return; }
      if (e.shiftKey && tl.selection.size) { tl.selectRange([...tl.selection][0], k.id, 'add'); }
      else if (e.metaKey || e.ctrlKey) tl.select(k.id, 'toggle');
      else if (!tl.selection.has(k.id)) tl.select(k.id);
      onPick(k.id);
      if (hit.edge) { drag = { kind: 'trim', clip: k, edge: hit.edge, row: hit.row, x: p.x, frame: k.range[hit.edge], active: false }; return; }
      const ids = tl.selectedClips(), ix = indexProject(tl.project);
      drag = { kind: 'move', x: p.x, y: ly, row: hit.row, delta: 0, channelDelta: 0, active: false,
        items: ids.map((id) => { const o = ix.get(id); return { clip: o.obj, ci: seq().channels.indexOf(o.ch) }; }) };
      return;
    }
    if (hit.type === 'kf' && e.detail >= 2) { addKeyAt(S, Math.round(f)); return; }
    if (e.pointerType === 'touch') { drag = { kind: 'pan', x: p.x, y: p.y, x0: v.x0, y0: v.y0 }; return; }
    if (!e.shiftKey && !e.metaKey) tl.select(null);
    drag = { kind: 'marquee', x: p.x, y: ly, x1: p.x, y1: ly, active: false, add: e.shiftKey || e.metaKey };
    draw();
  });
  cv.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return; pointers.set(e.pointerId, local(e));
    if (!drag) return;
    const p = local(e), f = xToFrame(p.x, v), ly = p.y - RULER + v.y0;
    if (drag.kind === 'pinch') { if (pointers.size < 2) return; const [a, b] = [...pointers.values()]; const d = Math.abs(a.x - b.x) || 1; zoomTo(drag.ppf0 * (d / drag.d0), drag.f, (a.x + b.x) / 2); return; }
    if (drag.kind === 'scrub') { onSeek(Math.max(0, Math.round(snapF(f))), false); return; }
    if (drag.kind === 'pan') { v.x0 = drag.x0 - (p.x - drag.x) / v.ppf; v.y0 = Math.max(0, drag.y0 - (p.y - drag.y)); draw(); return; }
    if (!drag.active && Math.abs(p.x - drag.x) < 3 && Math.abs((drag.y ?? ly) - ly) < 3) return;
    drag.active = true;
    if (drag.kind === 'marker') drag.frame = Math.max(0, Math.round(snapF(f)));
    else if (drag.kind === 'key') drag.to = Math.round(snapF(f));
    else if (drag.kind === 'trim') drag.frame = Math.round(snapF(f, [drag.clip.id]));
    else if (drag.kind === 'move') {
      let delta = Math.round((p.x - drag.x) / v.ppf);
      if (st.snap) delta = snapDelta(drag.items.map((it) => it.clip.range), delta, snapPoints(seq(), { playhead: playhead(), exclude: drag.items.map((it) => it.clip.id) }), tol()).delta;
      const r0 = rows.filter((r) => r.kind === 'channel'), here = rowAt(rows, ly);
      const at = (ch) => r0.findIndex((r) => r.ch === ch);                // rows are rebuilt on every draw: compare channels, not row objects
      drag.delta = delta; drag.channelDelta = here && here.kind === 'channel' ? -(at(here.ch) - at(drag.row.ch)) : drag.channelDelta;
    } else if (drag.kind === 'marquee') { drag.x1 = p.x; drag.y1 = ly; }
    draw();
  });
  const end = (e) => {
    pointers.delete(e.pointerId);
    const d = drag; if (!d) return; if (d.kind === 'pinch') { if (pointers.size < 2) drag = null; return; }
    drag = null;
    if (d.kind === 'scrub') { onSeek(Math.max(0, Math.round(snapF(xToFrame(local(e).x, v)))), true); return; }
    if (!d.active) { draw(); return; }
    if (d.kind === 'move' && (d.delta || d.channelDelta)) run('moveClips', { ids: d.items.map((it) => it.clip.id), delta: d.delta, channelDelta: d.channelDelta });
    else if (d.kind === 'trim') run('trimClip', { id: d.clip.id, edge: d.edge, frame: d.frame });
    else if (d.kind === 'marker' && d.frame !== d.m.frame) run('moveMarker', { id: d.m.id, frame: d.frame });
    else if (d.kind === 'key' && d.to !== d.frame) run('moveKey', { id: d.S.id, path: d.S.path, from: d.frame, to: d.to });
    else if (d.kind === 'marquee') {
      const ch = rows.filter((r) => r.kind === 'channel' && r.y < Math.max(d.y, d.y1) && r.y + r.h > Math.min(d.y, d.y1)).map((r) => r.ci);
      if (ch.length) tl.marquee({ channels: [Math.min(...ch), Math.max(...ch)], in: Math.floor(xToFrame(Math.min(d.x, d.x1), v)), out: Math.ceil(xToFrame(Math.max(d.x, d.x1), v)) }, d.add ? 'add' : 'replace');
    }
    draw();
  };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) { const p = local(e); zoomTo(v.ppf * Math.exp(-e.deltaY * 0.01), xToFrame(p.x, v), p.x); return; }
    const dx = e.shiftKey ? e.deltaY : e.deltaX, dy = e.shiftKey ? 0 : e.deltaY;
    v.x0 += dx / v.ppf; const maxY = Math.max(0, (rows.length ? rows[rows.length - 1].y + rows[rows.length - 1].h : 0) - (H - RULER) + 20);
    v.y0 = Math.max(0, Math.min(maxY, v.y0 + dy)); draw();
  }, { passive: false });
  function addKeyAt(S, f) {
    if (!S) return;
    if (isAnim(S.val) && S.val.keys) run('setKey', { id: S.id, path: S.path, at: f });
    else run('animate', { id: S.id, path: S.path, at: f });
  }

  function zoomTo(ppf, atFrame, atX) { v.ppf = Math.max(0.02, Math.min(40, ppf)); v.x0 = atFrame - atX / v.ppf; draw(); }
  function fit() { if (!(W > 0)) { needFit = true; return; } const end = Math.max(30, seq().durationFrames); v.ppf = Math.max(0.02, Math.min(40, (W - 30) / end)); v.x0 = -10 / v.ppf; draw(); }
  return {
    draw, fit, view: v,
    zoom(factor, at = playhead()) { zoomTo(v.ppf * factor, at, frameToX(at, v)); },
    /** Keep the playhead in view while playing. */
    follow() { const x = frameToX(playhead(), v); if (x > W - 40 || x < 0) { v.x0 = playhead() - 40 / v.ppf; } },
    showParam(p) { st.shown = p; draw(); },
    get shown() { return st.shown; },
    get laneH() { return dims().laneH; },
    /** Height the ruler and every row need (the editor sizes the timeline pane to it, D41). */
    get contentH() { const s = seq(), S = shownInfo(), last = layoutRows(s, S && { channelId: S.ch.id }, dims()).at(-1); return RULER + (last ? last.y + last.h : 0); },
    get tool() { return st.tool; }, set tool(t) { st.tool = t; draw(); },
    get snap() { return st.snap; }, set snap(s) { st.snap = s; draw(); },
  };
}
