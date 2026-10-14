/* The timeline editor: timeline.html?edit.

   Logs in against the API (the dash cookie where the browser sends it, else a timeline-only bearer
   token), hands the core every entry including private ones, and adds the gestures:

     select       click / tap an item; the amber frame and its handles appear
     open         double-click, Enter or E; the sheet slides in, every field autosaves
     resize       drag the right handle: the width snaps to ⅓ ½ ⅔ 1 and bleed; 1–5 on the keyboard
     aspect       drag the bottom handle (video, sound, embeds): snaps to common ratios
     move         drag an item (touch: hold, then drag): a card follows, a line shows where it lands,
                  the page scrolls when the hand nears an edge; drop on the drafts tray to undate it
     drafts       D opens the undated drafts; drag a card onto the timeline to date it
     insert       hover the gap between days and press +, or N for a note at the reading position
     files        drop photos, video or sound anywhere: dated by the camera, else by the day under the hand
     delete       Delete, or hold the button in the sheet; Undo in the toast for six seconds
     undo         ⌘Z reverts the last change
     publish      Shift P or the button; ? shows all of this */

const PARAMS = new URLSearchParams(location.search);
const LOCAL = /^(localhost|127\.|\[::1\])/.test(location.hostname);
const API = PARAMS.get('api') || (LOCAL ? 'http://127.0.0.1:8796' : 'https://api.3die.fr');
const STOPS = [1 / 3, 1 / 2, 2 / 3, 1, 2];
const STOP_LABEL = ['⅓', '½', '⅔', '1', 'bleed'];
const RATIOS = [[21 / 9, '21:9'], [16 / 9, '16:9'], [3 / 2, '3:2'], [4 / 3, '4:3'], [1, '1:1'], [4 / 5, '4:5'], [2 / 3, '2:3'], [9 / 16, '9:16'], [4, '4:1']];
const KINDS = [['text', 'Note'], ['image', 'Photo'], ['video', 'Video'], ['audio', 'Sound'], ['link', 'Link'], ['chapter', 'Chapter'],
  ['embed', 'Embed'], ['page', 'Page'], ['module', 'Snippet'], ['mention', 'Mention']];
const VIS = ['private', 'unlisted', 'public'];
const $ = (sel, root = document) => root.querySelector(sel);
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtDate = (d, prec = 'day') => {
  if (!d) return 'undated';
  const [y, m, dd] = d.split('-').map(Number);
  return prec === 'year' ? `${y}` : prec === 'month' ? `${MONTHS[m - 1]} ${y}` : `${dd} ${MONTHS[m - 1]} ${y}`;
};

let TL, S, MONTHS, FONTS;
const M = {
  byId: new Map(), token: null, user: null, selected: null, dirty: 0, pendingDeletes: new Map(),
  undo: [], saving: 0, uploads: [], tray: [],
};

/* ================================================================ api */
function headers(json) {
  const hd = {};
  if (json) hd['Content-Type'] = 'application/json';
  if (M.token) hd.Authorization = 'Bearer ' + M.token;
  return hd;
}
async function api(path, { method = 'GET', body, keepalive } = {}) {
  busy(+1);
  try {
    const r = await fetch(API + path, { method, headers: headers(body !== undefined), credentials: 'include', keepalive,
      body: body !== undefined ? JSON.stringify(body) : undefined });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { const err = new Error(data.detail || ('HTTP ' + r.status)); err.status = r.status; throw err; }
    return data;
  } finally { busy(-1); }
}
function upload(path, form, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', API + path);
    x.withCredentials = true;
    if (M.token) x.setRequestHeader('Authorization', 'Bearer ' + M.token);
    x.upload.onprogress = e => e.lengthComputable && onProgress(e.loaded / e.total);
    x.onload = () => { let d = {}; try { d = JSON.parse(x.responseText); } catch (e) { } x.status < 300 ? resolve(d) : reject(new Error(d.detail || 'HTTP ' + x.status)); };
    x.onerror = () => reject(new Error('network'));
    x.send(form);
  });
}
function busy(d) {
  M.saving = Math.max(0, M.saving + d);
  const s = $('#ed-bar .sync');
  if (s) { s.classList.toggle('busy', M.saving > 0); if (M.saving > 0) s.classList.remove('err'); }
}
function failed(e) {
  const s = $('#ed-bar .sync'); if (s) s.classList.add('err');
  toast(e.status === 401 ? 'Signed out — sign in again' : `Not saved: ${e.message}`);
  if (e.status === 401) login();
}

/* ================================================================ auth */
async function whoami() {
  try { M.token = localStorage.getItem('tl-token'); } catch (e) { }
  try {
    const me = await api('/auth/me');
    if (me.role === 'admin') return me;
  } catch (e) { }
  if (M.token) { M.token = null; try { localStorage.removeItem('tl-token'); } catch (e) { } }
  return null;
}

function login() {
  return new Promise(resolve => {
    if ($('#ed-login')) return;
    const wrap = h('div', '', `<form class="ed-glass" autocomplete="on">
      <span class="meta">Timeline · edit</span><h3>Sign in</h3>
      <label class="ed-f"><span class="meta">Name</span><input class="ed-in" name="username" autocomplete="username" required></label>
      <label class="ed-f"><span class="meta">Password</span><input class="ed-in" name="password" type="password" autocomplete="current-password" required></label>
      <span class="meta err"></span>
      <div style="display:flex;gap:.4rem;justify-content:space-between"><button type="button" class="ed-btn" data-a="leave">Just read</button><button class="ed-btn primary">Enter</button></div>
    </form>`);
    wrap.id = 'ed-login';
    document.body.appendChild(wrap);
    $('input', wrap).focus();
    $('[data-a=leave]', wrap).onclick = () => { wrap.remove(); leave(); };
    $('form', wrap).onsubmit = async e => {
      e.preventDefault();
      const f = e.target;
      try {
        const r = await api('/auth/login', { method: 'POST', body: { username: f.username.value, password: f.password.value, scope: 'timeline' } });
        if (r.role !== 'admin') throw new Error('this account cannot edit the timeline');
        M.token = r.token;
        try { localStorage.setItem('tl-token', r.token); } catch (err) { }
        wrap.remove();
        resolve(r);
      } catch (err) {
        $('.err', wrap).textContent = err.status === 401 ? 'Wrong name or password' : err.message;
        wrap.classList.remove('shake'); void wrap.offsetWidth; wrap.classList.add('shake');
        f.password.select();
      }
    };
  });
}
function leave() {
  const u = new URL(location.href); u.searchParams.delete('edit'); u.searchParams.delete('api');
  location.href = u.pathname + (u.search || '') + u.hash;
}
async function signOut() {
  try { await api('/auth/logout', { method: 'POST' }); } catch (e) { }
  try { localStorage.removeItem('tl-token'); } catch (e) { }
  leave();
}

/* ================================================================ the model */
function aspect(e) {
  if (e.frame && e.frame.a) return +e.frame.a;
  const m = (e.media || [])[0];
  if (m && m.w && m.h) return m.w / m.h;
  return { audio: 4, video: 16 / 9, embed: 16 / 9, module: 16 / 9, page: 1.6 }[e.kind] || 1;
}
const dated = e => e.precision !== 'none' && e.date;

let pushTimer = 0;
function push(now) {          // model -> core, coalesced
  clearTimeout(pushTimer);
  const go = () => {
    const rows = [], chapters = [], entries = new Map(), tray = [];
    for (const e of M.byId.values()) {
      if (M.pendingDeletes.has(e.id)) continue;
      if (!dated(e)) { tray.push(e); continue; }
      if (e.kind === 'chapter') { chapters.push({ slug: e.slug, title: e.title || 'Untitled chapter', date: e.date, date_end: e.date_end || null, body: e.body, id: e.id, vis: e.visibility }); continue; }
      rows.push({ slug: e.slug, date: e.date, prec: e.precision, kind: e.kind, a: aspect(e), w: (e.frame && e.frame.w) || 1,
        len: (e.title || '').length + (e.body || '').length, pos: e.position, id: e.id, vis: e.visibility, flags: e.flags });
      entries.set(e.slug, { ...e, media: e.view || [] });
    }
    M.tray = tray;
    TL.setData({ settings: M.settings, chapters, rows, entries });
    renderTray();
    document.getElementById('foot-count').textContent = `${rows.length} dated · ${tray.length} drafts · ${chapters.length} chapters`;
  };
  if (now) go(); else pushTimer = setTimeout(go, 16);
}

function put(entry) { M.byId.set(entry.id, entry); }

/* change fields: optimistic, then the server's version replaces ours (slugs can change) */
async function change(id, fields, { undo = true, quiet = false } = {}) {
  const e = M.byId.get(id);
  if (!e) return;
  const before = {};
  for (const k of Object.keys(fields)) before[k] = structuredClone(e[k]);
  if (undo) { M.undo.push({ id, before }); if (M.undo.length > 100) M.undo.shift(); }
  Object.assign(e, structuredClone(fields));
  if (fields.frame) e.frame = { ...e.frame, ...fields.frame };
  push();
  try {
    const r = await api(`/timeline/entries/${id}`, { method: 'PATCH', body: fields });
    put(r); M.dirty++; markDirty(); push();
    if (M.selected === id) { refreshFrame(); if (!quiet) refreshSheet(r); }
  } catch (err) { Object.assign(e, before); push(); failed(err); }
}

async function undoLast() {
  const u = M.undo.pop();
  if (!u) { toast('Nothing to undo'); return; }
  await change(u.id, u.before, { undo: false });
  select(u.id, { scroll: true });
  toast('Undone');
}

async function create(body, { open = true } = {}) {
  try {
    const r = await api('/timeline/entries', { method: 'POST', body });
    put(r); M.dirty++; markDirty(); push(true);
    select(r.id, { scroll: true, fresh: true });
    if (open) openSheet(r.id);
    return r;
  } catch (err) { failed(err); }
}

function remove(id) {
  const e = M.byId.get(id);
  if (!e) return;
  if (M.selected === id) deselect();
  closeSheet();
  const timer = setTimeout(() => flushDelete(id), 6000);
  M.pendingDeletes.set(id, timer);
  push();
  toast(`Deleted ${e.title ? '“' + esc(e.title.slice(0, 40)) + '”' : e.kind}`, { action: 'Undo', run: () => {
    clearTimeout(M.pendingDeletes.get(id)); M.pendingDeletes.delete(id); push(); select(id, { scroll: true });
  }, ms: 6000 });
}
async function flushDelete(id, keepalive) {
  if (!M.pendingDeletes.has(id)) return;
  clearTimeout(M.pendingDeletes.get(id));
  M.pendingDeletes.delete(id);
  try { await api(`/timeline/entries/${id}`, { method: 'DELETE', keepalive }); M.byId.delete(id); M.dirty++; markDirty(); }
  catch (err) { failed(err); push(); }
}

/* ================================================================ chrome */
function bar() {
  const b = h('div', 'ed-glass');
  b.id = 'ed-bar';
  b.innerHTML = `
    <span class="who"><span class="sync"></span><span class="meta">Editing</span></span>
    <span class="ed-sep"></span>
    <button class="ed-btn" data-a="new" title="New (N)">＋ <span class="lbl">New</span></button>
    <button class="ed-btn" data-a="tray" title="Drafts (D)">▤ <span class="lbl">Drafts</span> <span class="n">0</span></button>
    <button class="ed-btn" data-a="settings" title="Settings">⚙ <span class="lbl">Settings</span></button>
    <span class="ups"></span>
    <span class="ed-sep"></span>
    <button class="ed-btn primary" data-a="publish" title="Publish (Shift P)">↑ <span class="lbl">Publish</span><span class="dot ed-hidden"></span></button>
    <button class="ed-btn" data-a="help" title="Gestures (?)">?</button>
    <button class="ed-btn" data-a="exit" title="Leave the editor">✕</button>`;
  b.addEventListener('click', e => {
    const a = e.target.closest('[data-a]'); if (!a) return;
    const act = a.dataset.a;
    if (act === 'new') kindMenu(a.getBoundingClientRect(), readingDate());
    else if (act === 'tray') toggleTray();
    else if (act === 'settings') openSettings();
    else if (act === 'publish') publish();
    else if (act === 'help') help();
    else if (act === 'exit') leave();
  });
  document.body.appendChild(b);
}
function markDirty() { const d = $('#ed-bar [data-a=publish] .dot'); if (d) d.classList.toggle('ed-hidden', !M.dirty); }

function toast(html, { action, run, ms = 3200 } = {}) {
  let wrap = $('#ed-toasts');
  if (!wrap) { wrap = h('div'); wrap.id = 'ed-toasts'; document.body.appendChild(wrap); }
  const t = h('div', 'ed-toast ed-glass', `<span>${html}</span>`);
  if (action) { const b = h('button', 'ed-btn', esc(action)); b.onclick = () => { run(); out(); }; t.appendChild(b); }
  wrap.appendChild(t);
  const out = () => { t.classList.add('out'); setTimeout(() => t.remove(), 320); };
  setTimeout(out, ms);
  while (wrap.children.length > 3) wrap.firstChild.remove();
}

async function publish() {
  for (const id of [...M.pendingDeletes.keys()]) await flushDelete(id);
  try {
    const r = await api('/timeline/publish', { method: 'POST' });
    M.dirty = 0; markDirty();
    toast(`Published · ${r.public} public · ${r.unlisted} unlisted · ${r.chapters} chapters${r.skipped_undated ? ` · ${r.skipped_undated} undated left out` : ''}`, { ms: 5000 });
  } catch (err) { failed(err); }
}

function help() {
  if ($('#ed-help')) { $('#ed-help').remove(); return; }
  const k = s => s.split(' ').map(x => `<kbd>${x}</kbd>`).join(' ');
  const rows = [
    ['click', 'select · double-click opens the sheet'], [k('E') + ' ' + k('↵'), 'open the selected entry'],
    ['drag', 'move to another place in time; the page scrolls at the edges'], ['hold, drag', 'the same on touch'],
    ['right handle', 'width: ⅓ ½ ⅔ 1 bleed'], [k('1') + '–' + k('5'), 'the same from the keyboard'],
    ['bottom handle', 'shape of video, sound and embeds'], [k('V'), 'private → unlisted → public'],
    ['drop files', 'photos, video, sound; dated by the camera, else by the day under the hand'],
    [k('N'), 'a note at the reading position'], [k('D'), 'drafts: drag one onto the timeline to date it'],
    [k('⌫'), 'delete (undo in the toast)'], [k('⌘') + ' ' + k('Z'), 'undo the last change'],
    [k('⇧') + ' ' + k('P'), 'publish'], [k('J') + ' ' + k('K'), 'next / previous day · shift for years'], [k('Esc'), 'let go of whatever is held'],
  ];
  const d = h('div', 'ed-glass', `<span class="meta">Gestures</span><h3>The hand and the keys</h3><dl>${rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl>`);
  d.id = 'ed-help';
  d.addEventListener('click', () => d.remove());
  document.body.appendChild(d);
}

/* ================================================================ positions in the column */
function readingDate() {
  const top = window.scrollY - TL.colTop() + window.innerHeight * 0.3;
  const b = S.blocks[Math.min(S.blocks.length - 1, TL.firstBlockBelow(top))];
  return b ? b.date : new Date().toISOString().slice(0, 10);
}

/* Where would something dropped at (x, y) land? date, precision, the order inside the day, and a
   line to draw. Gaps between days belong to the nearer day. */
function locate(clientX, clientY) {
  if (!S.blocks.length) return { date: new Date().toISOString().slice(0, 10), prec: 'day', before: null, day: null, lineY: 0, lineX: 0, lineW: S.colW };
  const r = TL.col.getBoundingClientRect();
  const y = clientY - r.top, x = clientX - r.left;
  let bi = Math.min(S.blocks.length - 1, TL.firstBlockBelow(y));
  let b = S.blocks[bi];
  if (y < b.y && bi > 0) { const prev = S.blocks[bi - 1]; if (y - (prev.y + prev.h) < b.y - y) { b = prev; bi--; } }
  if (b.kind === 'chapter') {
    // a chapter's date: land first on that day
    const next = S.blocks[bi + 1];
    const day = next && next.kind === 'day' && next.date === b.date ? next : null;
    return { date: b.date, prec: 'day', day, before: day ? day.items[0] : null, lineY: b.y + b.h, lineX: 0, lineW: S.colW };
  }
  const ly = y - b.y;
  let before = null;
  for (const it of b.items) {
    const sameLine = ly >= it.y && ly <= it.y + it.h;
    if (sameLine ? x < it.x + it.w / 2 : ly < it.y) { before = it; break; }
  }
  let lineY, lineX = 0, lineW = S.colW, vert = false;
  if (before && ly >= before.y && ly <= before.y + before.h && before.w < S.colW * 0.9) {
    vert = true; lineX = before.x - 4; lineY = b.y + before.y; lineW = before.h;
  } else if (before) lineY = b.y + before.y - 6;
  else { const last = b.items[b.items.length - 1]; lineY = b.y + (last ? last.y + last.h + 8 : b.h); }
  const prec = b.items[0] ? b.items[0].row.prec : 'day';
  return { date: b.date, prec, day: b, before, lineY, lineX, lineW, vert };
}

/* the new order of a day once `id` is dropped before `before` (null = at the end) */
function reorder(day, id, before) {
  const ids = day ? day.items.map(it => it.row.id).filter(x => x !== id) : [];
  const at = before ? ids.indexOf(before.row.id) : -1;
  if (at < 0) ids.push(id); else ids.splice(at, 0, id);
  return ids;
}

/* ================================================================ selection frame */
let frame;
function frameEl() {
  if (frame && frame.isConnected) return frame;
  frame = h('div', '', `<div class="tag"><span class="meta"></span><button data-a="vis"></button><button data-a="edit">Edit</button></div><div class="h h-r"></div><div class="h h-b"></div>`);
  frame.id = 'ed-frame';
  TL.col.appendChild(frame);
  frame.querySelector('[data-a=edit]').addEventListener('click', e => { e.stopPropagation(); openSheet(M.selected); });
  frame.querySelector('[data-a=vis]').addEventListener('click', e => { e.stopPropagation(); cycleVis(M.selected); });
  frame.querySelector('.h-r').addEventListener('pointerdown', e => startResize(e, 'w'));
  frame.querySelector('.h-b').addEventListener('pointerdown', e => startResize(e, 'a'));
  return frame;
}
function locateEntry(id) {
  const e = M.byId.get(id);
  if (!e) return null;
  return S.bySlug.get(e.slug) || null;
}
function refreshFrame(instant) {
  const f = frameEl();
  const hit = M.selected != null && locateEntry(M.selected);
  if (!hit) { f.style.display = 'none'; return; }
  const e = M.byId.get(M.selected);
  f.style.display = '';
  f.classList.toggle('instant', !!instant);
  f.className = (instant ? 'instant ' : '') + (hit.item ? e.kind : 'chapter');
  let x, y, w, hh;
  if (hit.item) { x = hit.item.x; y = hit.block.y + hit.item.y; w = hit.item.w; hh = hit.item.h; }
  else { x = 0; y = hit.block.y + 30; w = S.colW; hh = hit.block.h - 30; }
  Object.assign(f.style, { left: x - 4 + 'px', top: y - 4 + 'px', width: w + 8 + 'px', height: hh + 8 + 'px' });
  f.querySelector('.meta').textContent = `${e.kind} · ${fmtDate(e.date, e.precision)}`;
  f.querySelector('[data-a=vis]').textContent = e.visibility;
}
function select(id, { scroll, fresh } = {}) {
  M.selected = id;
  const hit = locateEntry(id);
  if (scroll && hit) {
    const top = TL.colTop() + hit.block.y + (hit.item ? hit.item.y : 0);
    const vh = window.innerHeight;
    if (top < window.scrollY + 60 || top > window.scrollY + vh - 160) window.scrollTo({ top: top - vh * 0.3, behavior: 'smooth' });
  }
  if (fresh && hit && hit.item && hit.item.el) { hit.item.el.classList.add('ed-fresh'); setTimeout(() => hit.item.el && hit.item.el.classList.remove('ed-fresh'), 1600); }
  refreshFrame(true);
}
function deselect() { M.selected = null; refreshFrame(); }
function cycleVis(id) {
  const e = M.byId.get(id); if (!e) return;
  const v = VIS[(VIS.indexOf(e.visibility) + 1) % VIS.length];
  change(id, { visibility: v });
  toast(`Now ${v}`);
}

/* ================================================================ resize */
function startResize(ev, mode) {
  ev.preventDefault(); ev.stopPropagation();
  const id = M.selected, e = M.byId.get(id), hit = locateEntry(id);
  if (!hit || !hit.item) return;
  const handle = ev.currentTarget; handle.classList.add('on');
  handle.setPointerCapture(ev.pointerId);
  const colR = TL.col.getBoundingClientRect();
  const isText = e.kind === 'text' || e.kind === 'link';
  const baseW = isText ? Math.min(S.colW, S.textW) : S.colW;
  const center = colR.left + S.colW / 2;
  const snap = h('div'); snap.id = 'ed-snap';
  const ghost = h('div', 'ghost');
  const lines = [];
  if (mode === 'w') {
    STOPS.forEach((s, i) => {
      if (s === 2 && isText) return;
      const px = s === 2 ? document.documentElement.clientWidth - 16 : center + (s * baseW) / 2;
      const l = h('div', 's', `<span class="meta">${STOP_LABEL[i]}</span>`); l.style.left = px + 'px'; l.dataset.i = i;
      snap.appendChild(l); lines.push(l);
    });
  }
  snap.appendChild(ghost);
  document.body.appendChild(snap);
  const itemTop = () => TL.col.getBoundingClientRect().top + hit.block.y + hit.item.y;
  let choice = mode === 'w' ? ((e.frame && e.frame.w) || 1) : aspect(e), label = '';
  const move = mv => {
    if (mode === 'w') {
      let f = (2 * (mv.clientX - center)) / baseW;
      if (hit.item.x + hit.item.w < S.colW * 0.95 && hit.item.x < 2) f = (mv.clientX - colR.left) / baseW;   // left-aligned rows
      let i = STOPS.reduce((bi, s, k) => (s !== 2 && Math.abs(s - f) < Math.abs(STOPS[bi] - f) ? k : bi), 0);
      if (!isText && mv.clientX > colR.left + S.colW + 40) i = 4;
      choice = STOPS[i]; label = STOP_LABEL[i];
      lines.forEach(l => l.classList.toggle('on', +l.dataset.i === i));
      const w = choice === 2 ? S.bleedW : baseW * choice;
      const left = choice === 2 ? 16 : center - w / 2;
      const hh = isText ? hit.item.h : Math.min(w / aspect(e), S.maxH * 1.1);
      Object.assign(ghost.style, { left: left + 'px', width: w + 'px', top: itemTop() + 'px', height: hh + 'px' });
    } else {
      const hh = Math.max(40, mv.clientY - itemTop());
      const raw = hit.item.w / hh;
      const best = RATIOS.reduce((b, r) => Math.abs(Math.log(r[0] / raw)) < Math.abs(Math.log(b[0] / raw)) ? r : b);
      const snapped = Math.abs(Math.log(best[0] / raw)) < 0.06;
      choice = snapped ? best[0] : raw; label = snapped ? best[1] : raw.toFixed(2);
      Object.assign(ghost.style, { left: colR.left + hit.item.x + 'px', width: hit.item.w + 'px', top: itemTop() + 'px', height: hit.item.w / choice + 'px' });
    }
    ghost.innerHTML = `<span class="meta" style="position:absolute;right:.5rem;top:.5rem;color:var(--amber)">${label}</span>`;
  };
  const up = () => {
    handle.classList.remove('on');
    handle.removeEventListener('pointermove', move);
    snap.remove();
    if (mode === 'w' && Math.abs(choice - ((e.frame && e.frame.w) || 1)) > 1e-3) change(id, { frame: { w: choice } });
    if (mode === 'a' && Math.abs(choice - aspect(e)) > 1e-3) change(id, { frame: { a: +choice.toFixed(4) } });
  };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', up, { once: true });
  handle.addEventListener('pointercancel', () => { snap.remove(); handle.classList.remove('on'); }, { once: true });
  move(ev);
}

function setWidth(i) {
  const e = M.byId.get(M.selected); if (!e || e.kind === 'chapter') return;
  if (STOPS[i] === 2 && (e.kind === 'text' || e.kind === 'link')) return;
  change(M.selected, { frame: { w: STOPS[i] } });
}

/* ================================================================ move (items and drafts) */
let drag = null;
function beginMove(id, ev, sourceEl) {
  const e = M.byId.get(id);
  const thumb = (e.view && e.view[0] && (e.view[0].poster || e.view[0].src)) || '';
  const g = h('div', 'ed-glass', `${thumb && e.kind !== 'audio' ? `<div class="th" style="background-image:url('${thumb}')"></div>` : ''}
    <div class="tx">${esc(e.title || (e.body || '').slice(0, 120) || e.kind)}</div><div class="when meta"></div>`);
  g.id = 'ed-ghost';
  document.body.appendChild(g);
  const line = h('div', '', '<span class="meta"></span>'); line.id = 'ed-line';
  TL.col.appendChild(line);
  if (sourceEl) sourceEl.classList.add('ed-lifted');
  drag = { id, g, line, sourceEl, x: ev.clientX, y: ev.clientY, target: null, raf: 0 };
  document.documentElement.style.cursor = 'grabbing';
  document.body.style.userSelect = 'none';
  if (navigator.vibrate) navigator.vibrate(8);
  moveTo(ev.clientX, ev.clientY);
  autoScroll();
}
function moveTo(x, y) {
  if (!drag) return;
  drag.x = x; drag.y = y;
  drag.g.style.transform = `translate(${x + 14}px, ${y + 14}px)`;
  drag.g.style.setProperty('--at', `translate(${x + 14}px, ${y + 14}px)`);
  const tray = $('#ed-tray');
  const overTray = tray && tray.classList.contains('open') && (() => { const r = tray.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; })();
  tray && tray.classList.toggle('target', !!overTray);
  drag.g.classList.toggle('tray-target', !!overTray);
  if (overTray) { drag.target = { tray: true }; drag.line.style.display = 'none'; drag.g.querySelector('.when').textContent = 'to drafts · undated'; return; }
  const t = locate(x, y);
  drag.target = t;
  drag.line.style.display = '';
  drag.line.classList.toggle('vert', !!t.vert);
  if (t.vert) Object.assign(drag.line.style, { top: t.lineY + 'px', left: t.lineX + 'px', height: t.lineW + 'px', width: '2px' });
  else Object.assign(drag.line.style, { top: t.lineY + 'px', left: t.lineX + 'px', width: t.lineW + 'px', height: '2px' });
  const when = fmtDate(t.date, t.prec);
  drag.line.querySelector('.meta').textContent = when;
  drag.g.querySelector('.when').textContent = '→ ' + when;
}
function autoScroll() {
  if (!drag) return;
  const vh = window.innerHeight, edge = Math.min(110, vh * 0.15);
  let v = 0;
  if (drag.y < edge) v = -Math.pow((edge - drag.y) / edge, 2) * 38;
  else if (drag.y > vh - edge) v = Math.pow((drag.y - (vh - edge)) / edge, 2) * 38;
  if (v) { window.scrollBy(0, v); moveTo(drag.x, drag.y); }
  drag.raf = requestAnimationFrame(autoScroll);
}
function endMove(commit) {
  if (!drag) return;
  const { id, g, line, sourceEl, target } = drag;
  cancelAnimationFrame(drag.raf);
  g.remove(); line.remove();
  if (sourceEl) sourceEl.classList.remove('ed-lifted');
  $('#ed-tray') && $('#ed-tray').classList.remove('target');
  document.documentElement.style.cursor = ''; document.body.style.userSelect = '';
  drag = null;
  if (!commit || !target) return;
  const e = M.byId.get(id);
  if (target.tray) { if (dated(e)) { change(id, { precision: 'none', date: '' }); toast('Back in the drafts'); } return; }
  const prec = e.precision !== 'none' && e.precision !== 'day' && target.prec === e.precision ? e.precision : (target.prec || 'day');
  const order = reorder(target.day, id, target.before);
  const fields = {};
  if (e.date !== target.date || e.precision !== prec) Object.assign(fields, { date: target.date, precision: prec });
  const myPos = order.indexOf(id);
  if (e.position !== myPos) fields.position = myPos;
  if (Object.keys(fields).length) change(id, fields);
  // the rest of the day takes positions in the new order
  order.forEach((oid, i) => { const o = M.byId.get(oid); if (oid !== id && o && o.position !== i) change(oid, { position: i }, { undo: false, quiet: true }); });
  select(id);
  if (fields.date) toast(`Moved to ${fmtDate(target.date, prec)}`);
}

/* pointer gestures on the column */
function gestures() {
  const col = TL.col;
  let press = null;
  col.addEventListener('pointerdown', ev => {
    if (ev.button !== 0 || drag) return;
    if (ev.target.closest('#ed-frame .h, #ed-frame .tag, #ed-insert, button, a, input, video[controls], .line')) return;
    const item = ev.target.closest('.item'), chapter = ev.target.closest('.block.chapter');
    if (!item && !chapter) { deselect(); return; }
    const slug = item ? item.dataset.slug : chapter.dataset.slug;
    const hit = S.bySlug.get(slug);
    const id = hit && (hit.item ? hit.item.row.id : hit.block.chapter.id);
    if (id == null) return;
    press = { id, el: item, x: ev.clientX, y: ev.clientY, touch: ev.pointerType !== 'mouse', t: performance.now(), moved: false, timer: 0, chapter: !item };
    if (press.touch && item) press.timer = setTimeout(() => { if (press && !press.moved) { press.lifted = true; select(id); beginMove(id, ev, item); } }, 380);
  });
  window.addEventListener('pointermove', ev => {
    if (drag) { moveTo(ev.clientX, ev.clientY); return; }
    if (!press) return;
    const d = Math.hypot(ev.clientX - press.x, ev.clientY - press.y);
    if (press.touch) { if (d > 8) { press.moved = true; clearTimeout(press.timer); } return; }
    if (d > 6 && !press.chapter) { select(press.id); beginMove(press.id, ev, press.el); press = null; }
  });
  window.addEventListener('pointerup', ev => {
    if (drag) { endMove(true); press = null; return; }
    if (!press) return;
    clearTimeout(press.timer);
    if (!press.moved) {
      const now = performance.now();
      if (M.selected === press.id && now - (M.lastTap || 0) < 380) openSheet(press.id);
      else select(press.id);
      M.lastTap = now;
    }
    press = null;
  });
  window.addEventListener('pointercancel', () => { if (press) clearTimeout(press.timer); press = null; if (drag) endMove(false); });
  // once a touch drag has begun, the page must not scroll under it
  document.addEventListener('touchmove', e => { if (drag) e.preventDefault(); }, { passive: false });
  col.addEventListener('dblclick', ev => { const it = ev.target.closest('.item, .block.chapter'); if (it && M.selected != null) openSheet(M.selected); });

  // the gap between days offers a +
  const ins = h('div', '', '<span class="meta"></span><button type="button" title="Add here">+</button>');
  ins.id = 'ed-insert';
  col.appendChild(ins);
  let insDate = null;
  col.addEventListener('pointermove', ev => {
    if (drag || ev.pointerType !== 'mouse') return;
    if (ev.target.closest('.item, #ed-frame, .block.chapter .ch')) { if (!ev.target.closest('#ed-insert')) ins.classList.remove('on'); return; }
    const r = col.getBoundingClientRect(), y = ev.clientY - r.top;
    const bi = Math.min(S.blocks.length - 1, TL.firstBlockBelow(y));
    const b = S.blocks[bi];
    if (!b) return;
    const inGap = y < b.y || y > b.y + b.h;
    if (!inGap) { ins.classList.remove('on'); return; }
    const prev = y < b.y ? S.blocks[bi - 1] : b;
    insDate = (prev || b).date;
    ins.style.top = (y < b.y ? (b.y - (b.y - ((prev ? prev.y + prev.h : 0))) / 2) : b.y + b.h + TL.BLOCK_GAP / 2) + 'px';
    ins.querySelector('.meta').textContent = fmtDate(insDate);
    ins.classList.add('on');
  });
  col.addEventListener('pointerleave', () => ins.classList.remove('on'));
  ins.querySelector('button').addEventListener('click', ev => { ev.stopPropagation(); kindMenu(ev.currentTarget.getBoundingClientRect(), insDate); });
}

/* ================================================================ new entries */
function kindMenu(rect, date) {
  $('#ed-menu') && $('#ed-menu').remove();
  const m = h('div', 'ed-glass', `<span class="meta">New · ${fmtDate(date)}</span>` + KINDS.map(([k, l]) => `<button class="ed-btn" data-k="${k}">${l}</button>`).join(''));
  m.id = 'ed-menu';
  document.body.appendChild(m);
  const mw = m.offsetWidth, mh = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(window.innerWidth - mw - 8, rect.left)) + 'px';
  m.style.top = (rect.top - mh - 8 > 8 ? rect.top - mh - 8 : rect.bottom + 8) + 'px';
  const close = e => { if (!m.contains(e.target)) { m.remove(); window.removeEventListener('pointerdown', close, true); } };
  setTimeout(() => window.addEventListener('pointerdown', close, true));
  m.addEventListener('click', e => {
    const b = e.target.closest('[data-k]'); if (!b) return;
    m.remove(); window.removeEventListener('pointerdown', close, true);
    const kind = b.dataset.k;
    if (kind === 'image' || kind === 'video' || kind === 'audio') return pickFiles(kind, date);
    const body = { kind, date, precision: 'day', visibility: 'private' };
    if (kind === 'chapter') body.title = 'New chapter';
    if (kind !== 'text' && kind !== 'chapter') body.frame = { w: 1 };
    create(body);
  });
}
function pickFiles(kind, date) {
  const inp = h('input'); inp.type = 'file'; inp.multiple = true;
  inp.accept = kind === 'image' ? 'image/*' : kind === 'video' ? 'video/*' : 'audio/*';
  inp.onchange = () => uploadFiles([...inp.files], date);
  inp.click();
}

/* ================================================================ files */
async function prepare(file) {
  const out = { file, fields: {} };
  const t = file.type || '';
  if (/hei[cf]/i.test(t) || /\.hei[cf]$/i.test(file.name)) {
    // browsers other than Safari cannot show HEIC: re-encode as JPEG (the date then comes from the drop)
    const bmp = await createImageBitmap(file).catch(() => null);
    if (!bmp) throw new Error(`${file.name}: this browser cannot read HEIC; export it as JPEG`);
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
    c.getContext('2d').drawImage(bmp, 0, 0);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92));
    out.file = new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
  } else if (t.startsWith('video/')) {
    const url = URL.createObjectURL(file);
    try {
      const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.src = url;
      await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = rej; });
      out.fields = { w: v.videoWidth, h: v.videoHeight, dur: v.duration.toFixed(2) };
      v.currentTime = Math.min(1, v.duration / 3);
      await new Promise(res => { v.onseeked = res; setTimeout(res, 2500); });
      const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext('2d').drawImage(v, 0, 0);
      out.poster = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.88));
    } catch (e) { } finally { URL.revokeObjectURL(url); }
  } else if (t.startsWith('audio/')) {
    const url = URL.createObjectURL(file);
    try {
      const a = new Audio(); a.preload = 'metadata'; a.src = url;
      await new Promise((res, rej) => { a.onloadedmetadata = res; a.onerror = rej; });
      out.fields = { dur: a.duration.toFixed(2) };
    } catch (e) { } finally { URL.revokeObjectURL(url); }
  } else if (!t.startsWith('image/')) throw new Error(`${file.name}: not a photo, video or sound`);
  return out;
}
async function uploadFiles(files, date) {
  const ups = $('#ed-bar .ups');
  let last = null;
  for (const file of files) {
    const chip = h('span', 'up', '<i></i>'); ups.appendChild(chip);
    try {
      const p = await prepare(file);
      const fd = new FormData();
      fd.append('file', p.file);
      if (p.poster) fd.append('poster', p.poster, 'poster.jpg');
      if (date) fd.append('date_hint', date);
      for (const [k, v] of Object.entries(p.fields)) fd.append(k, v);
      const r = await upload('/timeline/upload', fd, f => { chip.firstChild.style.width = f * 100 + '%'; });
      put(r); last = r; M.dirty++; markDirty();
      push(true);
      select(r.id, { fresh: true });
    } catch (err) { toast(esc(err.message)); }
    chip.remove();
  }
  if (last) toast(files.length > 1 ? `${files.length} added · private until you publish them` : `Added to ${fmtDate(last.date, last.precision)} · private`);
}
function fileDrops() {
  const ov = h('div', '', '<div class="say ed-glass meta">Drop to add<b></b></div>'); ov.id = 'ed-drop';
  document.body.appendChild(ov);
  let depth = 0, line = null, target = null;
  const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
  window.addEventListener('dragenter', e => { if (!hasFiles(e)) return; depth++; ov.classList.add('on'); });
  window.addEventListener('dragleave', e => { if (!hasFiles(e)) return; if (--depth <= 0) { depth = 0; ov.classList.remove('on'); line && line.remove(); line = null; } });
  window.addEventListener('dragover', e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    target = locate(e.clientX, e.clientY);
    if (!line) { line = h('div', '', '<span class="meta"></span>'); line.id = 'ed-line'; TL.col.appendChild(line); }
    Object.assign(line.style, { top: target.lineY + 'px', left: '0px', width: S.colW + 'px', height: '2px' });
    line.querySelector('.meta').textContent = fmtDate(target.date);
    $('b', ov).textContent = `the camera's date, else ${fmtDate(target.date)}`;
    // near an edge, the page scrolls under the dragged files too
    const vh = window.innerHeight;
    if (e.clientY < 90) window.scrollBy(0, -24); else if (e.clientY > vh - 90) window.scrollBy(0, 24);
  });
  window.addEventListener('drop', e => {
    if (!hasFiles(e)) return;
    e.preventDefault(); depth = 0; ov.classList.remove('on'); line && line.remove(); line = null;
    uploadFiles([...e.dataTransfer.files], target ? target.date : readingDate());
  });
}

/* ================================================================ drafts tray */
function trayEl() {
  let t = $('#ed-tray');
  if (t) return t;
  t = h('aside', 'ed-glass', `<div class="grab"></div><header><h3>Drafts</h3><span class="meta n"></span></header>
    <input class="ed-in q" placeholder="Search drafts" type="search"><div class="list"></div>`);
  t.id = 'ed-tray';
  document.body.appendChild(t);
  $('.q', t).addEventListener('input', renderTray);
  sheetDrag(t, () => t.classList.remove('open'));
  $('.list', t).addEventListener('pointerdown', ev => {
    const card = ev.target.closest('.card'); if (!card || ev.button !== 0) return;
    const id = +card.dataset.id, x0 = ev.clientX, y0 = ev.clientY, touch = ev.pointerType !== 'mouse';
    let started = false, timer = 0;
    const startDrag = e2 => { started = true; beginMove(id, e2 || ev, null); };
    if (touch) timer = setTimeout(() => startDrag(), 380);
    const mv = e2 => {
      if (started) return;
      const d = Math.hypot(e2.clientX - x0, e2.clientY - y0);
      if (touch) { if (d > 8) clearTimeout(timer); return; }
      if (d > 6) startDrag(e2);
    };
    const upH = () => { clearTimeout(timer); window.removeEventListener('pointermove', mv); if (!started) openSheet(id); };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', upH, { once: true });
  });
  return t;
}
function toggleTray(force) {
  const t = trayEl();
  const open = force ?? !t.classList.contains('open');
  t.classList.toggle('open', open);
  if (open) renderTray();
}
function renderTray() {
  const n = $('#ed-bar [data-a=tray] .n'); if (n) n.textContent = M.tray.length;
  const t = $('#ed-tray'); if (!t || !t.classList.contains('open')) return;
  const q = $('.q', t).value.trim().toLowerCase();
  const items = M.tray.filter(e => !q || `${e.title} ${e.body}`.toLowerCase().includes(q))
    .sort((a, b) => (a.kind === 'chapter') - (b.kind === 'chapter') || (+a.chapter || 0) - (+b.chapter || 0) || a.position - b.position || a.id - b.id);
  $('.n', t).textContent = `${M.tray.length} undated`;
  const list = $('.list', t);
  if (!items.length) { list.innerHTML = `<p class="meta empty">${q ? 'Nothing matches' : 'No drafts: everything has a date'}</p>`; return; }
  const chapterName = id => { const c = M.byId.get(+id); return c ? c.title : ''; };
  let html = '', grp = null;
  for (const e of items) {
    const g = e.kind === 'chapter' ? 'Chapters' : (chapterName(e.chapter) || 'Loose');
    if (g !== grp) { html += `<div class="grp meta">${esc(g)}</div>`; grp = g; }
    const fl = (e.flags || []).length ? ` · <span class="fl">${esc(e.flags.join(' '))}</span>` : '';
    html += `<button class="card" data-id="${e.id}" type="button"><span class="k meta">${e.kind} · ${e.visibility}${fl}</span>
      <span class="tx">${esc(e.title || (e.body || '').slice(0, 220) || 'empty')}</span></button>`;
  }
  list.innerHTML = html;
}

/* ================================================================ the sheet */
let sheetId = null, saveTimers = {};
function sheetEl() {
  let s = $('#ed-sheet');
  if (s) return s;
  s = h('aside', 'ed-glass', '<div class="grab"></div><header><span class="meta"></span><span class="st meta"></span><button class="ed-btn" data-a="close">✕</button></header><div class="body"></div>');
  s.id = 'ed-sheet';
  document.body.appendChild(s);
  $('[data-a=close]', s).onclick = closeSheet;
  sheetDrag(s, closeSheet);
  return s;
}
function closeSheet() { const s = $('#ed-sheet'); if (s) s.classList.remove('open'); sheetId = null; }

function openSheet(id) {
  const e = M.byId.get(id);
  if (!e) return;
  sheetId = id;
  const s = sheetEl();
  s.classList.add('open');
  $('header .meta', s).textContent = e.kind + (e.published_at ? ' · published' : '');
  const linkable = ['link', 'embed', 'page', 'mention'].includes(e.kind);
  const media = ['image', 'video', 'audio'].includes(e.kind);
  const vis = VIS.map(v => `<button data-v="${v}" class="${e.visibility === v ? 'on' : ''}">${v}</button>`).join('');
  const precs = ['day', 'month', 'year', 'none'].map(p => `<button data-p="${p}" class="${e.precision === p ? 'on' : ''}">${p === 'none' ? 'undated' : p}</button>`).join('');
  const shareUrl = `https://iori.me/timeline.html#${e.slug}`;
  $('.body', s).innerHTML = `
    <div class="ed-seg vis">${vis}</div>
    <label class="ed-f"><span class="meta">Title</span><input class="ed-in title" data-f="title" value="${esc(e.title)}" placeholder="Untitled"></label>
    ${e.kind !== 'image' && e.kind !== 'video' && e.kind !== 'audio' || e.body ? `<label class="ed-f"><span class="meta">${e.kind === 'text' ? 'Text' : 'Words'}<span>*em* **strong** [link](url)</span></span><textarea class="ed-in" data-f="body" rows="4">${esc(e.body)}</textarea></label>` : ''}
    <div class="ed-f"><span class="meta">When</span><div class="ed-seg prec">${precs}</div>
      <div class="ed-row2"><input class="ed-in" data-f="date" type="date" value="${e.date || ''}" ${e.precision === 'none' ? 'disabled' : ''}>
      ${e.kind === 'chapter' ? `<input class="ed-in" data-f="date_end" type="date" value="${e.date_end || ''}" title="Until">` : ''}</div></div>
    ${linkable ? `<label class="ed-f"><span class="meta">Address</span><input class="ed-in" data-f="src" value="${esc(e.src)}" placeholder="https://"></label>` : ''}
    ${e.kind === 'module' ? `<label class="ed-f"><span class="meta">Snippet name<span>timeline/snippets/&lt;name&gt;.js</span></span><input class="ed-in" data-f="src" value="${esc(e.src)}"></label>` : ''}
    ${media ? `<div class="ed-f"><span class="meta">Media</span><div class="ed-media">${(e.view || []).map((m, i) => `<div class="m" style="background-image:url('${esc(m.poster || (m.type === 'image' ? m.src : ''))}')"><button data-rm="${esc(e.media[i] && e.media[i].id)}" title="Remove">✕</button></div>`).join('')}<button class="add" data-a="add">+</button></div></div>` : ''}
    <label class="ed-f"><span class="meta">Tags</span><input class="ed-in" data-f="tags" value="${esc((e.tags || []).join(', '))}" placeholder="comma, separated"></label>
    ${(e.flags || []).length ? `<div class="ed-f"><span class="meta">Flags<span>clear when checked</span></span><div class="ed-chips">${e.flags.map(f => `<button class="ed-chip" data-flag="${esc(f)}">${esc(f)} ✕</button>`).join('')}</div></div>` : ''}
    <div class="ed-f"><span class="meta">Link${e.published_at ? '<span>locked: published</span>' : ''}</span><div class="ed-link"><code>${esc(shareUrl)}</code><button class="ed-btn" data-a="copy">Copy</button></div></div>
    <button class="ed-btn ed-hold" data-a="delete"><i></i><span>Hold to delete</span></button>
    <p class="ed-hint">Changes save as you type. Visitors see only public entries, after Publish.</p>`;
  const body = $('.body', s);
  const auto = el => { el.style.height = 'auto'; el.style.height = el.scrollHeight + 2 + 'px'; };
  body.querySelectorAll('textarea').forEach(auto);
  body.addEventListener('input', ev => {
    const el = ev.target.closest('[data-f]'); if (!el) return;
    if (el.tagName === 'TEXTAREA') auto(el);
    const f = el.dataset.f;
    clearTimeout(saveTimers[f]);
    $('.st', s).textContent = 'editing';
    saveTimers[f] = setTimeout(() => {
      let v = el.value;
      if (f === 'tags') v = v.split(',').map(x => x.trim()).filter(Boolean);
      if (f === 'date') { if (!v) return; change(id, { date: v, precision: M.byId.get(id).precision === 'none' ? 'day' : M.byId.get(id).precision }, { quiet: true }); }
      else change(id, { [f]: v }, { quiet: true });
      $('.st', s).textContent = 'saved';
    }, f === 'date' ? 250 : 650);
  });
  body.addEventListener('click', ev => {
    const v = ev.target.closest('.vis [data-v]');
    if (v) { change(id, { visibility: v.dataset.v }); body.querySelectorAll('.vis button').forEach(b => b.classList.toggle('on', b === v)); return; }
    const p = ev.target.closest('.prec [data-p]');
    if (p) {
      const cur = M.byId.get(id), prec = p.dataset.p;
      const date = prec === 'none' ? '' : (cur.date || readingDate());
      change(id, { precision: prec, date });
      body.querySelectorAll('.prec button').forEach(b => b.classList.toggle('on', b === p));
      const di = body.querySelector('[data-f=date]'); di.disabled = prec === 'none'; di.value = date;
      return;
    }
    const fl = ev.target.closest('[data-flag]');
    if (fl) { change(id, { flags: (M.byId.get(id).flags || []).filter(x => x !== fl.dataset.flag) }); fl.remove(); return; }
    const rm = ev.target.closest('[data-rm]');
    if (rm) { removeMedia(id, rm.dataset.rm); return; }
    const a = ev.target.closest('[data-a]'); if (!a) return;
    if (a.dataset.a === 'copy') { navigator.clipboard.writeText(shareUrl).then(() => toast('Link copied')); }
    if (a.dataset.a === 'add') { const inp = h('input'); inp.type = 'file'; inp.onchange = () => addMedia(id, inp.files[0]); inp.click(); }
  });
  // delete is a held press: the bar fills over 700 ms, letting go cancels
  const del = $('[data-a=delete]', body);
  let holdT = 0;
  const hold = on => { del.classList.toggle('holding', on); clearTimeout(holdT); if (on) holdT = setTimeout(() => remove(id), 700); };
  del.addEventListener('pointerdown', () => hold(true));
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => del.addEventListener(t, () => hold(false)));
  const first = $('[data-f=title]', body);
  if (!e.title && !matchMedia('(pointer: coarse)').matches) first.focus();
}
function refreshSheet(e) { if (sheetId === e.id) { const s = $('#ed-sheet'); $('header .meta', s).textContent = e.kind + (e.published_at ? ' · published' : ''); } }

async function removeMedia(id, mid) {
  try { const r = await api(`/timeline/entries/${id}/media/${mid}`, { method: 'DELETE' }); put(r); push(); openSheet(id); }
  catch (err) { failed(err); }
}
async function addMedia(id, file) {
  if (!file) return;
  try {
    const p = await prepare(file);
    const fd = new FormData(); fd.append('file', p.file);
    if (p.poster) fd.append('poster', p.poster, 'poster.jpg');
    for (const [k, v] of Object.entries(p.fields)) fd.append(k, v);
    const r = await upload(`/timeline/entries/${id}/media`, fd, () => { });
    put(r); push(); openSheet(id);
  } catch (err) { failed(err); }
}

/* settings share the sheet */
function openSettings() {
  sheetId = null;
  const s = sheetEl();
  s.classList.add('open');
  $('header .meta', s).textContent = 'Settings';
  $('.st', s).textContent = '';
  // all three faces, so each option can be set in itself
  if (!$('#ed-faces')) { const l = h('link'); l.id = 'ed-faces'; l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Manrope:wght@200..800&family=Jost:wght@100..900&family=Outfit:wght@100..900&display=swap'; document.head.appendChild(l); }
  const st = M.settings;
  const seg = (k, opts) => `<div class="ed-seg" data-k="${k}">${opts.map(([v, l]) => `<button data-v="${v}" class="${st[k] === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  $('.body', s).innerHTML = `
    <div class="ed-f"><span class="meta">Typeface<span>everyone sees this</span></span><div class="ed-faces">
      ${Object.entries(FONTS).map(([k, f]) => `<button class="ed-face ${st.font === k ? 'on' : ''}" data-font="${k}" style="font-family:'${f[0]}';font-weight:var(--wt)"><span>Timeline 2003</span><span class="meta">${f[0]}</span></button>`).join('')}
    </div></div>
    <div class="ed-f"><span class="meta">Weight</span>${seg('weight', [['light', 'Light'], ['regular', 'Regular'], ['bold', 'Bold']])}</div>
    <div class="ed-f"><span class="meta">Order</span>${seg('order', [['asc', 'Oldest first'], ['desc', 'Newest first']])}</div>
    <div class="ed-f"><span class="meta">Opens at</span>${seg('start', [['origin', '4.12.2003'], ['now', 'Today']])}</div>
    <div class="ed-f"><span class="meta">Theme for new visitors</span>${seg('theme', [['system', 'Their system'], ['light', 'Dust'], ['dark', 'Night']])}</div>
    <p class="ed-hint">Settings reach visitors with the next Publish. A visitor who picks their own face or weight in the Aa panel keeps it on their device.</p>
    <button class="ed-btn" data-a="signout">Sign out of the editor</button>`;
  const body = $('.body', s);
  body.onclick = async ev => {
    const f = ev.target.closest('[data-font]');
    const sg = ev.target.closest('.ed-seg[data-k] [data-v]');
    let patch = null;
    if (f) { patch = { font: f.dataset.font }; body.querySelectorAll('.ed-face').forEach(b => b.classList.toggle('on', b === f)); }
    if (sg) { patch = { [sg.parentElement.dataset.k]: sg.dataset.v }; sg.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === sg)); }
    if (ev.target.closest('[data-a=signout]')) return signOut();
    if (!patch) return;
    try {
      M.settings = await api('/timeline/settings', { method: 'PUT', body: patch });
      M.dirty++; markDirty();
      if (patch.font) TL.setFont(patch.font);
      if (patch.weight) { TL.setWeight(patch.weight); TL.rebuild(); }
      if (patch.order) push(true);
    } catch (err) { failed(err); }
  };
}

/* phones: sheets follow the finger down and close past a third */
function sheetDrag(el, close) {
  const grab = $('.grab', el);
  let y0 = null;
  grab.addEventListener('pointerdown', e => { y0 = e.clientY; el.classList.add('dragging'); grab.setPointerCapture(e.pointerId); });
  grab.addEventListener('pointermove', e => { if (y0 == null) return; el.style.setProperty('--drag', Math.max(0, e.clientY - y0) + 'px'); });
  const end = e => {
    if (y0 == null) return;
    const d = e.clientY - y0; y0 = null;
    el.classList.remove('dragging'); el.style.setProperty('--drag', '0px');
    if (d > el.offsetHeight / 3) close();
  };
  grab.addEventListener('pointerup', end); grab.addEventListener('pointercancel', end);
}

/* ================================================================ keys */
function keys(e) {
  const t = e.target;
  const typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); undoLast(); return; }
  if (e.key === 'Escape') {
    if (drag) { endMove(false); return; }
    if ($('#ed-help')) { $('#ed-help').remove(); return; }
    if ($('#ed-menu')) { $('#ed-menu').remove(); return; }
    if (typing) { t.blur(); return; }
    if ($('#ed-sheet.open')) { closeSheet(); return; }
    if ($('#ed-tray.open')) { toggleTray(false); return; }
    deselect(); return;
  }
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  const sel = M.selected;
  const k = e.key;
  if (k === '?') help();
  else if (k === 'P') publish();
  else if (k === 'd') toggleTray();
  else if (k === 'n') create({ kind: 'text', date: readingDate(), precision: 'day', visibility: 'private' });
  else if (sel != null && (k === 'e' || k === 'Enter')) openSheet(sel);
  else if (sel != null && (k === 'Delete' || k === 'Backspace')) remove(sel);
  else if (sel != null && k === 'v') cycleVis(sel);
  else if (sel != null && /^[1-5]$/.test(k)) setWidth(+k - 1);
  else return;
  e.preventDefault();
  e.stopImmediatePropagation();
}

/* ================================================================ start */
export async function start(core) {
  TL = core; S = core.S; MONTHS = core.MONTHS; FONTS = core.FONTS;
  const css = h('link'); css.rel = 'stylesheet'; css.href = 'timeline/editor.css?v=10'; document.head.appendChild(css);
  M.user = await whoami() || await login();
  document.documentElement.classList.add('ed-on');
  bar();
  try {
    const [list, settings] = await Promise.all([api('/timeline/entries'), api('/timeline/settings')]);
    M.settings = settings;
    for (const e of list.entries) put(e);
  } catch (err) { failed(err); return; }
  push(true);
  TL.S.settings = { ...TL.S.settings, ...M.settings };
  TL.applyType();
  TL.on('rebuilt', () => refreshFrame(true));
  TL.on('update', () => { if (M.selected != null) refreshFrame(true); });
  gestures();
  fileDrops();
  window.addEventListener('keydown', keys, true);
  window.addEventListener('pagehide', () => { for (const id of [...M.pendingDeletes.keys()]) flushDelete(id, true); });
  toast(`Editing as ${esc(M.user.username)} · ${M.byId.size} entries · press ? for gestures`);
}
