/* iori.me/timeline.html — the core: data, layout, virtual scroll, the dial, type, navigation.

   Visitors: timeline/data/index.json (one compact row per public entry) lays out every row
   before any content arrives, so the scrollbar is right from the first paint; year files come in
   as the reader approaches. About sixty entries are in the DOM at any time.
   ?edit loads editor.js, which logs in and hands the core every entry from the API (setData).
   ?catalog loads catalog.js, the living style catalog.

   The core keeps the reader still through everything: estimates turning into measurements,
   fonts arriving, resizes and edits all re-anchor on the block under the top of the screen. */
import { renderItem, fillItem, markBroken, release, holds, forget } from './kinds.js?v=6';
import { createDial } from './dial.js?v=4';

const DATA = 'timeline/data/';
const BUFFER = 1.5;            // viewports above and below that stay mounted
const PREFETCH = 2.5;          // viewports ahead at which a year file is requested
const TARGET_ROW = 250;        // justified row height aim, px
const DATE_H = 30;             // the day label line, px
const BLOCK_GAP = 56;          // between day blocks, px
const GAP = 8;                 // between items, px
const ROWABLE = new Set(['image', 'video', 'embed', 'page']);   // small ones share justified rows
const TEXTLIKE = new Set(['text', 'link', 'mention']);           // sit on the reading column, measured
// variable faces, so any weight between the steps is available
export const FONTS = {
  manrope: ['Manrope', 'Manrope:wght@200..800'],
  jost: ['Jost', 'Jost:wght@100..900'],
  outfit: ['Outfit', 'Outfit:wght@100..900'],
};
// body / titles / captions, per weight setting
export const WEIGHTS = { light: [400, 300, 500], regular: [500, 400, 600], bold: [600, 500, 700] };
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PARAMS = new URLSearchParams(location.search);
const PERF = PARAMS.has('perf');
const DEFAULTS = { font: 'outfit', weight: 'bold', order: 'asc', start: 'origin', theme: 'system', origin: '2003-12-04' };
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const S = {
  settings: { ...DEFAULTS }, rows: [], chapters: [], blocks: [], total: 0,
  colW: 0, textW: 640, maxH: 720, bleedX: 0, bleedW: 0,
  entries: new Map(),          // slug -> entry data (from year files or the API)
  years: new Map(),            // year -> {state, tries, retryAt, blocks:[]}
  preloaded: false,            // true when every entry is already in `entries` (edit mode)
  hasYear: new Set(),
  mounted: new Map(),          // block index -> element
  bySlug: new Map(),           // slug -> {block, item}
  seen: new Set(),             // media already shown once: a rebuild does not replay the focus pull
  rafId: 0, pendingHit: null, scrubDirty: false, userScrolled: false, programmatic: 0,
  listeners: {}, perf: { updates: 0, worst: 0, total: 0 },
};
const col = document.getElementById('col');
const dialEl = document.getElementById('dial');
let dial = null;

/* ---------------- events (the editor and catalog listen) ---------------- */
function on(name, fn) { (S.listeners[name] ||= []).push(fn); }
function emit(name, arg) { for (const fn of S.listeners[name] || []) fn(arg); }

/* ---------------- data ---------------- */
function normRow(r, i) {
  return { slug: r.slug, date: r.date, prec: r.prec || 'day', kind: r.kind, a: r.a || 1, w: r.w || 1, len: r.len || 0,
    pos: r.pos ?? 0, id: r.id ?? i, vis: r.vis || 'public', flags: r.flags || null };
}
function sortRows() {
  S.rows.sort((p, q) => p.date < q.date ? -1 : p.date > q.date ? 1 : (p.pos - q.pos) || (p.id - q.id));
  if (S.settings.order === 'desc') S.rows.reverse();
  S.hasYear = new Set(S.rows.map(r => r.date.slice(0, 4)));
}

async function loadIndex() {
  const r = await fetch(DATA + 'index.json', { cache: 'no-cache' });
  if (!r.ok) throw new Error('index ' + r.status);
  const d = await r.json();
  S.settings = { ...DEFAULTS, ...(d.settings || {}) };
  S.chapters = (d.chapters || []).filter(c => c.date);
  // index row: [slug, date, precision, kind, aspect, frameW, bodyLength]
  S.rows = (d.entries || []).map((e, i) => normRow({ slug: e[0], date: e[1], prec: e[2], kind: e[3], a: e[4], w: e[5], len: e[6] }, i));
  sortRows();
}

/* Edit mode: every entry at once, already in memory. Keeps the reader where they are. */
function setData({ settings, chapters, rows, entries }) {
  const anchor = captureAnchor();
  if (settings) S.settings = { ...DEFAULTS, ...settings };
  S.chapters = (chapters || []).filter(c => c.date);
  S.rows = rows.map(normRow);
  sortRows();
  S.entries = entries;
  S.preloaded = true;
  for (const Y of S.years.values()) { Y.state = 'ready'; }
  rebuild(anchor);
  // the address may name something only this fuller data has (a private entry, an earlier year)
  if (!S.userScrolled && location.hash) goToHash(location.hash);
}

function yearState(y) {
  let Y = S.years.get(y);
  if (!Y) { Y = { state: 'idle', tries: 0, retryAt: 0, blocks: [] }; S.years.set(y, Y); }
  return Y;
}

function requestYear(y) {
  const Y = yearState(y);
  if (S.preloaded || !S.hasYear.has(y)) { Y.state = 'ready'; return; }
  if (Y.state === 'ready' || Y.state === 'loading') return;
  if (Y.state === 'error' && performance.now() < Y.retryAt) return;
  Y.state = 'loading';
  fetch(DATA + y + '.json').then(r => r.ok ? r.json() : Promise.reject(new Error(r.status))).then(d => {
    for (const [slug, e] of Object.entries(d.entries || {})) S.entries.set(slug, e);
    Y.state = 'ready'; Y.tries = 0;
    fillBlocks(Y.blocks.filter(bi => S.mounted.has(bi)));
  }).catch(() => {
    // three quick retries, then a pause; the next approach tries again
    Y.tries++;
    Y.state = 'error';
    Y.retryAt = performance.now() + (Y.tries <= 3 ? 600 * 2 ** (Y.tries - 1) : 10000);
    if (Y.tries <= 3) setTimeout(() => requestYear(y), 600 * 2 ** (Y.tries - 1) + 20);
    else for (const bi of Y.blocks) { const b = S.blocks[bi]; if (b && S.mounted.has(bi)) for (const it of b.items) markBroken(it); }
  });
}

/* ---------------- layout ---------------- */
// A block is a chapter header or one day. Items inside a day are placed absolutely:
// runs of small images form justified rows, everything else is its own row.
function buildBlocks() {
  const blocks = [];
  const chapterAt = new Map();
  for (const c of S.chapters) {
    if (!chapterAt.has(c.date)) chapterAt.set(c.date, []);
    chapterAt.get(c.date).push(c);
  }
  const placed = new Set();
  let i = 0;
  while (i < S.rows.length) {
    const date = S.rows[i].date;
    for (const c of chapterAt.get(date) || []) if (!placed.has(c.slug)) { placed.add(c.slug); blocks.push(chapterBlock(c)); }
    let j = i;
    while (j < S.rows.length && S.rows[j].date === date) j++;
    blocks.push(layoutDay(S.rows.slice(i, j), date));
    i = j;
  }
  for (const c of S.chapters) if (!placed.has(c.slug)) blocks.push(chapterBlock(c));
  blocks.sort((p, q) => p.date < q.date ? -1 : p.date > q.date ? 1 : (p.kind === 'chapter' ? -1 : 0) - (q.kind === 'chapter' ? -1 : 0));
  if (S.settings.order === 'desc') blocks.reverse();
  S.blocks = blocks;
  S.bySlug.clear();
  for (const Y of S.years.values()) Y.blocks = [];
  blocks.forEach((b, bi) => {
    b.index = bi;
    for (const it of b.items) S.bySlug.set(it.row.slug, { block: b, item: it });
    if (b.chapter) S.bySlug.set(b.chapter.slug, { block: b, item: null });
    yearState(b.date.slice(0, 4)).blocks.push(bi);
  });
  stack();
}

function chapterBlock(c) { return { kind: 'chapter', chapter: c, date: c.date, y: 0, h: 190 + (c.body ? Math.ceil(c.body.length / 64) * 30 : 0), items: [] }; }

function stack() {
  let y = 0;
  for (const b of S.blocks) { b.y = y; y += b.h + BLOCK_GAP; }
  S.total = Math.max(0, y - BLOCK_GAP);
  col.style.height = S.total + 'px';
}

function estimateText(row, w) {
  const cpl = Math.max(20, w / 8.6);
  const lines = Math.max(1, Math.ceil((row.len || 120) / cpl));
  return 46 + Math.min(lines, 80) * 28;
}

function layoutDay(rows, date) {
  const colW = S.colW;
  const items = [];
  let y = DATE_H + 10, k = 0;
  while (k < rows.length) {
    const r = rows[k];
    if (ROWABLE.has(r.kind) && r.w <= 0.5) {
      // a run of small pictures (photos, artwork, posters), cut into justified rows
      const run = [];
      while (k < rows.length && ROWABLE.has(rows[k].kind) && rows[k].w <= 0.5) run.push(rows[k++]);
      let start = 0;
      while (start < run.length) {
        let sum = 0, n = 0;
        const perRow = r.w <= 0.34 ? 3 : 2;
        while (start + n < run.length && (n === 0 || ((sum + run[start + n].a) * TARGET_ROW < colW && n < perRow + 1))) { sum += run[start + n].a; n++; }
        let h = (colW - GAP * (n - 1)) / sum;
        if (start + n >= run.length && h > TARGET_ROW * 1.4) h = TARGET_ROW * 1.4;
        let x = 0;
        for (let q = 0; q < n; q++) { const row = run[start + q]; const w = h * row.a; items.push({ row, x, y, w, h, line: y }); x += w + GAP; }
        y += h + GAP;
        start += n;
      }
      y += 6;
      continue;
    }
    let w, x, h;
    if (TEXTLIKE.has(r.kind)) {
      const textW = Math.min(colW, S.textW);
      w = r.w >= 1 ? textW : Math.max(220, textW * r.w);
      x = (colW - textW) / 2;
      h = r.kind === 'text' ? estimateText(r, w) : 110;
    } else if (r.w >= 2) {
      // bleed: the frame leaves the column and runs edge to edge (16px gutters)
      w = S.bleedW; h = Math.min(w / r.a, S.maxH * 1.1); x = S.bleedX;
      if (r.kind === 'audio') h = Math.min(h, 110);
    } else {
      w = Math.min(colW, colW * Math.min(1, r.w));
      h = w / r.a;
      if (r.kind === 'audio') h = Math.min(Math.max(h, 72), 110);
      if (h > S.maxH) { h = S.maxH; w = h * r.a; }
      x = (colW - w) / 2;
    }
    // a titled picture standing alone carries its caption underneath: keep room for it
    const cap = r.kind === 'image' || r.kind === 'video' ? (r.len > 0 && w >= 200 ? 26 : 0) : 0;
    items.push({ row: r, x, y, w, h, line: y, cap });
    y += h + GAP + 14 + cap;
    k++;
  }
  return { kind: 'day', date, y: 0, h: y, items };
}

/* ---------------- mount / unmount ---------------- */
function firstBlockBelow(yPx) {           // first block whose bottom is >= yPx
  let lo = 0, hi = S.blocks.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (S.blocks[mid].y + S.blocks[mid].h < yPx) lo = mid + 1; else hi = mid; }
  return lo;
}
const colTop = () => col.getBoundingClientRect().top + window.scrollY;

function update() {
  S.rafId = 0;
  if (!S.blocks.length) { emit('update'); return; }
  const t0 = performance.now();
  const vh = window.innerHeight;
  const top = window.scrollY - colTop();
  const from = top - vh * BUFFER, to = top + vh * (1 + BUFFER);
  const want = new Set();
  for (let bi = firstBlockBelow(from); bi < S.blocks.length && S.blocks[bi].y <= to; bi++) want.add(bi);
  // a day holding a loaded (paused) frame stays mounted: moving a frame in the page would reload it
  for (const [bi, el] of S.mounted) if (!want.has(bi) && !holds(el)) { release(el); el.remove(); S.mounted.delete(bi); emit('unmount', bi); }
  const fresh = [];
  for (const bi of want) if (!S.mounted.has(bi)) { mountBlock(bi); fresh.push(bi); }
  fillBlocks(fresh);
  const ahead = top + vh * (1 + PREFETCH), behind = top - vh * PREFETCH;
  for (let bi = firstBlockBelow(behind); bi < S.blocks.length && S.blocks[bi].y <= ahead; bi++) requestYear(S.blocks[bi].date.slice(0, 4));
  if (S.scrubDirty) { S.scrubDirty = false; buildDial(); }
  if (dial) dial.setPos(Math.max(0, Math.min(1, toDisp(top + vh * 0.3))), window.scrollY * 0.35, !S.programmatic);
  if (S.pendingHit) applyHit();
  syncHash(top + vh * 0.3);
  emit('update');
  const ms = performance.now() - t0;
  S.perf.updates++; S.perf.worst = Math.max(S.perf.worst, ms); S.perf.total += ms;
  if (PERF) col.dataset.perf = JSON.stringify({ ...S.perf, mounted: S.mounted.size, fresh: fresh.length });
}
function schedule() { if (!S.rafId) S.rafId = requestAnimationFrame(update); }

function mountBlock(bi) {
  const b = S.blocks[bi];
  const el = document.createElement('div');
  el.className = 'block ' + b.kind;
  el.style.top = b.y + 'px';
  el.style.height = b.h + 'px';
  el.dataset.bi = bi;
  if (b.kind === 'chapter') {
    const c = b.chapter;
    el.id = c.slug;
    el.dataset.slug = c.slug;
    if (c.vis && c.vis !== 'public') el.dataset.vis = c.vis;
    el.innerHTML = `<div class="ch"><div class="meta"></div><h2></h2>${c.body ? '<p></p>' : ''}</div>`;
    el.querySelector('.meta').innerHTML = spanText(c);
    el.querySelector('h2').textContent = c.title;
    if (c.body) el.querySelector('p').textContent = c.body;
  } else {
    const d = document.createElement('div');
    d.className = 'date meta';
    d.innerHTML = dateLabel(b.date, b.items[0].row.prec);
    el.appendChild(d);
    for (const it of b.items) {
      const node = renderItem(it, S.seen);
      place(node, it);
      it.el = node; it.filled = !!node._filled;     // a kept static item arrives filled
      el.appendChild(node);
    }
  }
  col.appendChild(el);
  S.mounted.set(bi, el);
  emit('mount', { bi, block: b, el });
}
function place(node, it) { node.style.left = it.x + 'px'; node.style.top = it.y + 'px'; node.style.width = it.w + 'px'; node.style.height = it.h + 'px'; }

// Pour data into freshly mounted blocks in passes — writes, all measurements, writes —
// so the browser lays the column out once, not once per item.
function fillBlocks(indices) {
  const todo = [];
  for (const bi of indices) {
    const b = S.blocks[bi], el = S.mounted.get(bi);
    if (!el) continue;
    if (b.kind === 'chapter') { todo.push({ bi, chapter: true, el }); continue; }
    const Y = yearState(b.date.slice(0, 4));
    if (Y.state !== 'ready') requestYear(b.date.slice(0, 4));     // may become ready right here (edit mode, empty years)
    if (Y.state !== 'ready') continue;
    const measured = [];
    for (const it of b.items) {
      if (it.filled) continue;
      fillItem(it, S.entries.get(it.row.slug), S.seen);
      it.filled = true;
      if (TEXTLIKE.has(it.row.kind)) { measured.push(it); it.el.style.height = 'auto'; }
    }
    if (measured.length) todo.push({ bi, measured });
  }
  for (const t of todo) {
    if (t.chapter) t.h = t.el.querySelector('.ch').offsetHeight + 10;
    else for (const it of t.measured) it.hReal = it.el.offsetHeight;
  }
  todo.sort((p, q) => p.bi - q.bi);
  for (const t of todo) {
    if (t.chapter) { settle(t.bi, t.h); continue; }
    let changed = false;
    for (const it of t.measured) { if (Math.abs(it.hReal - it.h) > 2) { it.h = it.hReal; changed = true; } it.el.style.height = it.h + 'px'; it.measured = true; }
    if (changed) restack(t.bi);
  }
}

// re-stack a day's rows after real heights arrived; rows keep their order
function restack(bi) {
  const b = S.blocks[bi];
  let y = DATE_H + 10, lastLine = null, rowBottom = y;
  for (const it of b.items) {
    if (it.line !== lastLine) { y = rowBottom; lastLine = it.line; }
    it.y2 = y;
    rowBottom = Math.max(rowBottom, y + it.h + (ROWABLE.has(it.row.kind) && it.row.w <= 0.5 ? GAP : GAP + 14 + (it.cap || 0)));
  }
  for (const it of b.items) { it.y = it.y2; it.line = it.y2; delete it.y2; if (it.el) place(it.el, it); }
  settle(bi, rowBottom);
}

// a block turned out taller or shorter than estimated: shift everything below, keep the reader still
function settle(bi, newH) {
  const b = S.blocks[bi];
  const delta = newH - b.h;
  if (Math.abs(delta) < 1) return;
  b.h = newH;
  const el = S.mounted.get(bi);
  if (el) el.style.height = newH + 'px';
  for (let k = bi + 1; k < S.blocks.length; k++) {
    S.blocks[k].y += delta;
    const m = S.mounted.get(k);
    if (m) m.style.top = S.blocks[k].y + 'px';
  }
  S.total += delta;
  col.style.height = S.total + 'px';
  if (b.y + colTop() < window.scrollY - 1) { S.programmatic++; window.scrollBy(0, delta); }
  S.scrubDirty = true;
}

/* ---------------- anchors: the reader stays put through every rebuild ---------------- */
function captureAnchor() {
  if (!S.blocks.length) return null;
  const top = window.scrollY - colTop();
  const b = S.blocks[Math.min(S.blocks.length - 1, firstBlockBelow(top + 1))];
  const key = b.chapter ? b.chapter.slug : (b.items[0] && b.items[0].row.slug);
  return { key, date: b.date, offset: top - b.y };
}
function restoreAnchor(a) {
  if (!a) return;
  let hit = a.key && S.bySlug.get(a.key);
  let y;
  if (hit) y = hit.block.y + Math.min(a.offset, hit.block.h);
  else { const b = blockForDate(a.date); y = b ? b.y : 0; }
  S.programmatic++;
  window.scrollTo(0, colTop() + y);
}
function rebuild(anchor = captureAnchor()) {
  for (const [bi, el] of S.mounted) { release(el, true); el.remove(); emit('unmount', bi); }
  forget();
  S.mounted.clear();
  measureFrame();
  buildBlocks(); buildDial();
  restoreAnchor(anchor);
  update();
  emit('rebuilt');
}

/* ---------------- labels ---------------- */
function dateLabel(date, prec) {
  const [y, m, d] = date.split('-').map(Number);
  if (prec === 'year') return `<b>${y}</b>`;
  if (prec === 'month') return `<b>${MONTHS[m - 1]}</b> ${y}`;
  return `<b>${d} ${MONTHS[m - 1]}</b> ${y}`;
}
function spanText(c) {
  const f = s => { const [y, m] = s.split('-'); return `${MONTHS[+m - 1]} ${y}`; };
  return `<b>${f(c.date)}</b>` + (c.date_end ? ` — ${f(c.date_end)}` : ' —');
}

/* ---------------- navigation ---------------- */
function blockForDate(prefix) {
  if (!S.blocks.length) return null;
  const asc = S.settings.order !== 'desc';
  let best = null;
  for (const b of S.blocks) {
    if (b.date.startsWith(prefix)) return b;
    if (asc ? b.date > prefix : b.date < prefix) { best = best || b; if (asc) break; }
  }
  return best || S.blocks[S.blocks.length - 1];
}

function scrollToY(target, smooth) {
  const far = Math.abs(target - window.scrollY) > window.innerHeight * 3;
  S.programmatic++;
  if (far && !reduced()) {
    // a long jump fades through instead of streaking past years of pictures
    col.classList.remove('jump'); void col.offsetWidth; col.classList.add('jump');
    setTimeout(() => { S.programmatic++; window.scrollTo(0, target); }, 90);
    setTimeout(() => col.classList.remove('jump'), 300);
  } else window.scrollTo({ top: target, behavior: smooth && !reduced() ? 'smooth' : 'auto' });
}
function goTo(block, highlightSlug) {
  if (!block) return;
  scrollToY(colTop() + block.y - 32, true);
  S.pendingHit = highlightSlug || null;
  schedule();
}
function applyHit() {
  const hit = S.bySlug.get(S.pendingHit);
  if (!hit) { S.pendingHit = null; return; }
  const el = hit.item ? hit.item.el : S.mounted.get(hit.block.index);
  if (!el || !el.isConnected) return;          // not mounted yet; the next update tries again
  el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit');
  S.pendingHit = null;
}
function goToHash(hash) {
  const h = decodeURIComponent(hash.replace(/^#/, ''));
  if (!h) return false;
  const hit = S.bySlug.get(h);
  if (hit) { goTo(hit.block, h); return true; }
  if (/^\d{4}(-\d{2}){0,2}$/.test(h)) { goTo(blockForDate(h)); return true; }
  return false;
}

// the address follows the reader as a month (#2004-05), so any position is a link worth sharing
let hashKey = '', hashTimer = 0;
function syncHash(yPx) {
  if (!S.userScrolled || !S.blocks.length) return;
  const b = S.blocks[Math.min(S.blocks.length - 1, firstBlockBelow(yPx))];
  const key = b.date.slice(0, 7);
  if (key === hashKey) return;
  hashKey = key;
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => history.replaceState(null, '', location.pathname + location.search + '#' + key), 250);
}

function step(dir, unit) {          // keyboard travel: a day, or a year
  const top = window.scrollY - colTop() + 40;
  let bi = Math.min(S.blocks.length - 1, firstBlockBelow(top));
  const cur = S.blocks[bi];
  if (!cur) return;
  const same = b => unit === 'year' ? b.date.slice(0, 4) === cur.date.slice(0, 4) : b === cur;
  if (dir > 0) { while (bi < S.blocks.length - 1 && same(S.blocks[bi])) bi++; }
  else {
    if (S.blocks[bi].y < top - 80 && unit !== 'year') { goTo(S.blocks[bi]); return; }
    bi = Math.max(0, bi - 1);
    if (unit === 'year') { const y = S.blocks[bi].date.slice(0, 4); while (bi > 0 && S.blocks[bi - 1].date.slice(0, 4) === y) bi--; }
  }
  goTo(S.blocks[bi]);
}

/* ---------------- the dial ---------------- */
/* The dial's scale is 60 % content (Google Photos: busy years are tall) and 40 % time (quiet years
   still get room, so a life's first twenty years are not a sliver above three busy ones). dispF[i] is
   block i's start on that scale; toDisp / fromDisp convert between it and the column. */
const CONTENT_SHARE = 0.6;
const dayNum = d => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 864e5;
function buildScale() {
  const n = S.blocks.length;
  S.dispF = new Float64Array(n + 1);
  if (!n) return;
  const t0 = dayNum(S.blocks[0].date), t1 = dayNum(S.blocks[n - 1].date), dt = t1 - t0 || 1;
  for (let i = 0; i < n; i++) {
    const b = S.blocks[i];
    S.dispF[i] = CONTENT_SHARE * (b.y / Math.max(1, S.total)) + (1 - CONTENT_SHARE) * Math.max(0, Math.min(1, (dayNum(b.date) - t0) / dt));
  }
  S.dispF[n] = 1;
  for (let i = 1; i <= n; i++) if (S.dispF[i] < S.dispF[i - 1]) S.dispF[i] = S.dispF[i - 1];   // stays monotonic
}
function toDisp(y) {
  const n = S.blocks.length;
  if (!n) return 0;
  const i = Math.min(n - 1, firstBlockBelow(y));
  const b = S.blocks[i], b1 = i + 1 < n ? S.blocks[i + 1].y : S.total;
  const t = Math.max(0, Math.min(1, (y - b.y) / Math.max(1, b1 - b.y)));
  return S.dispF[i] + (S.dispF[i + 1] - S.dispF[i]) * t;
}
function fromDisp(f) {
  const n = S.blocks.length;
  if (!n) return 0;
  let lo = 0, hi = n - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (S.dispF[mid] <= f) lo = mid; else hi = mid - 1; }
  const b = S.blocks[lo], b1 = lo + 1 < n ? S.blocks[lo + 1].y : S.total;
  const t = (f - S.dispF[lo]) / Math.max(1e-9, S.dispF[lo + 1] - S.dispF[lo]);
  return b.y + Math.max(0, Math.min(1, t)) * (b1 - b.y);
}
function blockAtF(f) { return S.blocks[Math.min(S.blocks.length - 1, firstBlockBelow(fromDisp(f)))]; }
function chapterAt(date) {
  let c = null;
  for (const ch of S.chapters) if (ch.date <= date && (!c || ch.date >= c.date)) c = ch;
  return c;
}
function dialLabel(f, big) {
  const b = blockAtF(f);
  if (!b) return '';
  const m = MONTHS[+b.date.slice(5, 7) - 1], y = b.date.slice(0, 4);
  if (!big) return `${m} ${y}`;
  const c = chapterAt(b.date);
  return `<span class="m">${m}</span><span class="y">${y}</span>${c ? `<span class="c">${esc(c.title)}</span>` : ''}`;
}
function buildDial() {
  if (!dial) return;
  buildScale();
  const marks = [], chapters = [];
  let lastY = '', lastM = '';
  for (let i = 0; i < S.blocks.length; i++) {
    const b = S.blocks[i];
    const f = S.dispF[i];
    if (b.kind === 'chapter') { chapters.push({ f, title: b.chapter.title }); continue; }
    const y = b.date.slice(0, 4), m = b.date.slice(5, 7);
    if (y !== lastY) { marks.push({ f, y, m: +m - 1, year: true }); lastY = y; lastM = m; }
    else if (m !== lastM) { marks.push({ f, y, m: +m - 1, year: false }); lastM = m; }
  }
  dial.setModel({ marks, chapters });
}
function seek(f) {
  S.programmatic++;
  S.userScrolled = true;
  window.scrollTo(0, colTop() + fromDisp(f) - window.innerHeight * 0.3);
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------------- theme + type ---------------- */
// The author's choice (settings) unless this visitor picked their own (stored on their device only).
function pref(k) { try { return localStorage.getItem('tl-' + k); } catch (e) { return null; } }
function setPref(k, v) { try { v ? localStorage.setItem('tl-' + k, v) : localStorage.removeItem('tl-' + k); } catch (e) { } }
function applyType() {
  const font = pref('font') || S.settings.font, weight = pref('weight') || S.settings.weight;
  setWeight(weight);
  return setFont(font);
}
function setWeight(name) {
  const w = WEIGHTS[name] || WEIGHTS.bold;
  const r = document.documentElement.style;
  r.setProperty('--wb', w[0]); r.setProperty('--wt', w[1]); r.setProperty('--wm', w[2]);
  document.documentElement.dataset.weight = name;
}
function setFont(name) {
  const f = FONTS[name] || FONTS.outfit;
  const linkEl = document.getElementById('tl-font');
  const href = 'https://fonts.googleapis.com/css2?family=' + f[1] + '&display=swap';
  document.documentElement.style.setProperty('--family', `'${f[0]}', system-ui, -apple-system, sans-serif`);
  document.documentElement.dataset.font = name;
  if (linkEl.getAttribute('href') === href) return Promise.resolve();
  linkEl.setAttribute('href', href);
  // text was measured in the old face: once the new one is in, measure again
  return new Promise(res => linkEl.addEventListener('load', () => document.fonts.load(`400 1rem '${f[0]}'`).then(() => { rebuild(); res(); }), { once: true }));
}

/* the Aa panel: face, weight and theme, for whoever is reading */
function typeInit() {
  const btn = document.getElementById('type');
  if (!btn) return;
  const panel = document.createElement('div');
  panel.id = 'type-panel';
  panel.innerHTML = `<p class="meta">Type</p><div class="faces">${Object.entries(FONTS).map(([k, f]) =>
    `<button data-font="${k}" style="font-family:'${f[0]}'"><span>Aa</span><span class="meta">${f[0]}</span></button>`).join('')}</div>
    <p class="meta">Weight</p><div class="seg" data-k="weight">${Object.keys(WEIGHTS).map(k => `<button data-weight="${k}">${k}</button>`).join('')}</div>
    <p class="meta">Theme</p><div class="seg" data-k="theme"><button data-theme="system">system</button><button data-theme="light">dust</button><button data-theme="dark">night</button></div>
    <button class="reset meta">Use the author's choice</button>`;
  document.body.appendChild(panel);
  // every face loads once the panel opens, so each button is set in itself
  let faces = false;
  const mark = () => {
    const font = document.documentElement.dataset.font, weight = document.documentElement.dataset.weight, theme = pref('theme') || 'system';
    panel.querySelectorAll('[data-font]').forEach(b => b.classList.toggle('on', b.dataset.font === font));
    panel.querySelectorAll('[data-weight]').forEach(b => b.classList.toggle('on', b.dataset.weight === weight));
    panel.querySelectorAll('[data-theme]').forEach(b => b.classList.toggle('on', b.dataset.theme === theme));
  };
  const open = on => {
    panel.classList.toggle('open', on); btn.setAttribute('aria-expanded', on);
    if (on && !faces) { faces = true; const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Manrope:wght@500&family=Jost:wght@500&family=Outfit:wght@500&display=swap'; document.head.appendChild(l); }
    if (on) mark();
  };
  btn.addEventListener('click', e => { e.stopPropagation(); open(!panel.classList.contains('open')); });
  document.addEventListener('pointerdown', e => { if (!panel.contains(e.target) && e.target !== btn) open(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') open(false); });
  panel.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.font) { setPref('font', b.dataset.font); setFont(b.dataset.font); }
    if (b.dataset.weight) { setPref('weight', b.dataset.weight); setWeight(b.dataset.weight); rebuild(); }
    if (b.dataset.theme) { setPref('theme', b.dataset.theme === 'system' ? null : b.dataset.theme); applyTheme(); }
    if (b.classList.contains('reset')) { setPref('font', null); setPref('weight', null); applyType().then(() => rebuild()); }
    mark();
  });
}
function applyTheme() {
  const t = pref('theme') || (S.settings.theme !== 'system' ? S.settings.theme : null);
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  else document.documentElement.removeAttribute('data-theme');
}

/* ---------------- boot ---------------- */
function measureFrame() {
  const fs = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  S.textW = fs * 40;
  S.maxH = Math.round(window.innerHeight * 0.82);
  S.colW = col.clientWidth;
  const left = col.getBoundingClientRect().left;
  S.bleedX = 16 - left;
  S.bleedW = document.documentElement.clientWidth - 32;
}

function keys(e) {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  const k = e.key;
  if (k === 'j') step(1, 'day'); else if (k === 'k') step(-1, 'day');
  else if (k === 'J') step(1, 'year'); else if (k === 'K') step(-1, 'year');
  else if (k === 'g') goTo(S.blocks[0]); else if (k === 'G') goTo(S.blocks[S.blocks.length - 1]);
  else return;
  S.userScrolled = true;
  e.preventDefault();
}

function saveSpot() {
  try { sessionStorage.setItem('tl-spot:' + location.pathname + location.search, JSON.stringify(captureAnchor())); } catch (e) { }
}
function savedSpot() {
  try { return JSON.parse(sessionStorage.getItem('tl-spot:' + location.pathname + location.search) || 'null'); } catch (e) { return null; }
}

async function boot() {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  typeInit();
  if (dialEl) dial = createDial(dialEl, { onSeek: seek, label: dialLabel });
  measureFrame();
  window.addEventListener('scroll', () => { if (S.programmatic > 0) S.programmatic--; else S.userScrolled = true; schedule(); }, { passive: true });
  window.addEventListener('wheel', () => { S.userScrolled = true; S.programmatic = 0; }, { passive: true });
  window.addEventListener('touchstart', () => { S.userScrolled = true; S.programmatic = 0; }, { passive: true });
  window.addEventListener('keydown', keys);
  window.addEventListener('pagehide', saveSpot);
  let rt = 0, lastW = window.innerWidth, lastH = window.innerHeight;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      // phones resize the viewport height when the address bar slides: only rebuild when it matters
      if (window.innerWidth === lastW && Math.abs(window.innerHeight - lastH) < 120) { schedule(); return; }
      lastW = window.innerWidth; lastH = window.innerHeight;
      rebuild();
    }, 120);
  });
  window.addEventListener('hashchange', () => goToHash(location.hash));
  if (PERF) document.addEventListener('tl:update', update);

  if (PARAMS.has('catalog')) { (await import('./catalog.js?v=8')).start(TL); return; }
  const editing = PARAMS.has('edit');
  try { await loadIndex(); } catch (e) { if (!editing) { col.innerHTML = '<p class="meta foot">The timeline is empty.</p>'; } }
  applyType();
  applyTheme();
  document.getElementById('foot-count').textContent = `${S.rows.length} entries · ${S.chapters.length} chapters`;
  buildBlocks(); buildDial();
  const spot = savedSpot();
  const hashMonth = location.hash.slice(1);
  if (spot && (!hashMonth || (spot.date || '').startsWith(hashMonth))) restoreAnchor(spot);
  else if (!goToHash(location.hash) && S.settings.start === 'now') goTo(S.blocks[S.settings.order === 'desc' ? 0 : S.blocks.length - 1]);
  update();
  document.fonts && document.fonts.ready.then(() => { if (S.blocks.some(b => b.items.some(it => it.measured))) rebuild(); });
  if (editing) (await import('./editor.js?v=10')).start(TL);
}

/* the surface the editor and the catalog use */
export const TL = {
  S, col, on, emit, setData, rebuild, schedule, goTo, goToHash, blockForDate, setFont, firstBlockBelow, colTop,
  captureAnchor, restoreAnchor, dateLabel, place, measureFrame, layoutDay, DATE_H, BLOCK_GAP,
  update, buildDial, MONTHS, FONTS, WEIGHTS, setWeight, applyType,
};

boot();
