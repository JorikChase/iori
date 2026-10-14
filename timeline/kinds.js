/* One renderer per entry kind. renderItem() builds the frame from the index row alone, so it can
   be placed before the year file arrives; fillItem() pours the entry in. `seen` holds media shown
   once already, so a rebuild does not replay the focus pull. Kinds without a renderer yet
   (embed, page, module, mention) show a labelled frame until P3. */

const STUB = new Set(['module']);
const TEXTLIKE = new Set(['text', 'link', 'mention']);
/* Live sources.
   Dynamic (players, pages): wake once at least 60 % on screen for a moment (flicking past loads nothing),
   within a running budget; out of view they pause and hide but stay loaded, and the two most recently
   paused are kept so scrolling back is instant (the core keeps their days mounted, because moving a frame
   in the page would reload it). Static (photos, video, sound, and the posters of sleeping players and
   pages): the last ten that leave the view stay decoded and ready; video and sound pause the moment they
   leave the viewport. */
const COARSE = matchMedia('(pointer: coarse)').matches;
const BUDGET = { embed: COARSE ? 1 : 2, page: COARSE ? 0 : 1 };   // running at once, in view
const PARKED = 2;                                                 // paused but loaded, out of view
const STATIC_KEEP = 10;                                           // static items kept after they leave
const DWELL = { embed: 500, page: 900 };
const saveData = () => !!(navigator.connection && navigator.connection.saveData);
let live = [];            // [{el, kind, auto, state: 'running' | 'paused', at}]
const wakers = new WeakMap();
const statics = new Map();  // slug -> item element, oldest first
const waiting = new Set();  // in view and ready to wake, but the running budget is full
const io = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  for (const en of entries) {
    const el = en.target;
    if (el._media) {                                              // static: pause when it leaves the view
      if (!en.isIntersecting) el._media.pause && !el._media.paused && el._media.pause();
      continue;
    }
    const w = wakers.get(el);
    if (!w) continue;
    clearTimeout(w.t);
    const rec = live.find(l => l.el === el);
    if (!en.isIntersecting) { waiting.delete(el); if (rec && rec.state === 'running') pause(rec); continue; }
    if (rec && rec.state === 'paused') { resume(rec); continue; }  // back in view: instant
    if (en.intersectionRatio >= 0.6 && !document.documentElement.classList.contains('ed-on') && !saveData()) {
      w.t = setTimeout(() => { if (el.isConnected) w.wake(true); }, DWELL[w.kind]);
    }
  }
}, { threshold: [0, 0.6] }) : null;

/* players obey their own APIs; pages simply stop drawing once hidden */
function command(f, what) {
  try {
    if (/soundcloud\.com/.test(f.src)) f.contentWindow.postMessage(JSON.stringify({ method: what }), 'https://w.soundcloud.com');
    else if (/youtube/.test(f.src)) f.contentWindow.postMessage(JSON.stringify({ event: 'command', func: what === 'pause' ? 'pauseVideo' : 'playVideo', args: [] }), '*');
  } catch (e) { }
}
function pause(rec) {
  const f = rec.el.querySelector('iframe');
  if (!f) return;
  command(f, 'pause');
  f.style.display = 'none';
  rec.state = 'paused'; rec.at = performance.now();
  const paused = live.filter(l => l.state === 'paused').sort((a, b) => a.at - b.at);
  while (paused.length > PARKED) sleep(paused.shift().el);
  // a slot came free: the frame that has waited in view longest takes it
  for (const el of waiting) {
    waiting.delete(el);
    const r = el.getBoundingClientRect();
    if (el.isConnected && Math.min(r.bottom, innerHeight) - Math.max(r.top, 0) >= r.height * 0.6) { wakers.get(el).wake(true); break; }
  }
}
function resume(rec) {
  const f = rec.el.querySelector('iframe');
  if (!f) return;
  f.style.display = '';
  rec.state = 'running';
  if (!rec.auto) command(f, 'play');                              // it was playing because the reader pressed it
}
// does this block hold a frame that should outlive its unmount?
export function holds(root) { return !!root.querySelector('.item iframe'); }

export function renderItem(it, seen) {
  const r = it.row;
  const kept = statics.get(r.slug);
  if (kept && kept.dataset.kind === r.kind) {
    statics.delete(r.slug); kept._filled = true; kept.classList.remove('hit');
    if (io && (wakers.has(kept) || kept._media)) io.observe(kept);    // watching again: it can wake or pause
    return kept;
  }
  const el = document.createElement('div');
  el.dataset.kind = r.kind;
  el.dataset.slug = r.slug;
  el.id = r.slug;
  if (TEXTLIKE.has(r.kind)) {
    el.className = 'item ' + r.kind + (r.kind === 'mention' ? ' link' : '');
    el.innerHTML = '<div class="ph"></div>';
  } else {
    el.className = 'item media ' + r.kind;
    el.innerHTML = `<div class="box${STUB.has(r.kind) ? ' stub' : ''}"></div>`;
    if (STUB.has(r.kind)) el.firstChild.innerHTML = `<span class="meta">${r.kind}</span>`;
  }
  // edit mode carries visibility and flags on the row; the page never sees private rows
  if (r.vis && r.vis !== 'public') el.dataset.vis = r.vis;
  if (r.flags && r.flags.length) el.dataset.flags = r.flags.join(' ');
  return el;
}

export function markBroken(it) {
  const box = it.el && it.el.querySelector('.box');
  if (box) box.classList.add('broken');
  else if (it.el) it.el.classList.add('on');
}

function reveal(el, key, seen) {
  if (seen.has(key)) { el.classList.add('seen', 'on'); return; }
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on')));
  seen.add(key);
}

export function fillItem(it, data, seen) {
  const el = it.el;
  if (!el) return;
  if (!data) { markBroken(it); return; }
  const r = it.row;
  const m = (data.media || [])[0];
  if (r.kind === 'image') {
    const box = el.querySelector('.box');
    if (!m || !m.src) { box.classList.add('broken'); return; }
    const img = new Image();
    img.alt = data.title || '';
    img.decoding = 'async';
    img.loading = 'lazy';
    img.draggable = false;
    if (m.srcset) { img.srcset = m.srcset; img.sizes = Math.round(it.w) + 'px'; }
    img.src = m.src;
    const show = () => reveal(img, m.src, seen);
    if (seen.has(m.src)) show(); else { img.onload = show; }
    img.onerror = () => box.classList.add('broken');
    box.appendChild(img);
    caption(el, data, it);
    return;
  }
  if (r.kind === 'video') {
    const box = el.querySelector('.box');
    const v = document.createElement('video');
    v.preload = 'none'; v.playsInline = true; v.muted = false; v.controls = false;
    if (m && m.poster) v.poster = m.poster;
    if (m && m.src) v.src = m.src; else box.classList.add('broken');
    v.className = 'on seen';
    const play = document.createElement('button');
    play.className = 'play'; play.type = 'button'; play.setAttribute('aria-label', 'Play');
    play.addEventListener('click', e => { e.stopPropagation(); v.controls = true; v.play(); el.classList.add('playing'); });
    v.addEventListener('pause', () => { if (v.ended) el.classList.remove('playing'); });
    box.append(v, play);
    el._media = v; if (io) io.observe(el);
    caption(el, data, it);
    return;
  }
  if (r.kind === 'audio') {
    const box = el.querySelector('.box');
    const a = new Audio(); a.preload = 'none';
    if (m && m.src) a.src = m.src;
    box.innerHTML = '<button class="pbtn" type="button" aria-label="Play"></button><div class="line"><i></i></div><span class="t meta"></span>';
    el._media = a; if (io) io.observe(el);
    const bar = box.querySelector('.line i'), t = box.querySelector('.t');
    const fmt = s => isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '';
    t.textContent = (data.title ? data.title + ' · ' : '') + fmt(m && m.dur);
    box.querySelector('.pbtn').addEventListener('click', e => { e.stopPropagation(); a.paused ? a.play() : a.pause(); });
    a.addEventListener('play', () => el.classList.add('playing'));
    a.addEventListener('pause', () => el.classList.remove('playing'));
    a.addEventListener('timeupdate', () => { bar.style.width = (100 * a.currentTime / (a.duration || 1)) + '%'; });
    box.querySelector('.line').addEventListener('click', e => {
      e.stopPropagation();
      const rc = e.currentTarget.getBoundingClientRect();
      if (a.duration) a.currentTime = a.duration * (e.clientX - rc.left) / rc.width;
    });
    return;
  }
  if (r.kind === 'text') {
    el.innerHTML = '';
    if (data.title) { const h = document.createElement('h3'); h.textContent = data.title; el.appendChild(h); }
    for (const para of String(data.body || '').split(/\n{2,}/)) {
      if (!para.trim()) continue;
      const p = document.createElement('p');
      p.innerHTML = inline(para.trim());
      el.appendChild(p);
    }
    reveal(el, 'text:' + r.slug, seen);
    return;
  }
  if (r.kind === 'link' || r.kind === 'mention') {
    const url = data.src || '#';
    let host = '';
    try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (e) { }
    el.innerHTML = `<a class="card" rel="noopener" target="_blank"><span class="meta"></span><h3></h3>${data.body ? '<p></p>' : ''}</a>`;
    const a = el.querySelector('a'); a.href = url;
    a.querySelector('.meta').textContent = (r.kind === 'mention' ? 'mentioned · ' : '') + host;
    a.querySelector('h3').textContent = data.title || host;
    if (data.body) a.querySelector('p').textContent = data.body;
    reveal(el, 'link:' + r.slug, seen);
    return;
  }
  if (r.kind === 'embed' || r.kind === 'page') { sleeper(it, data, seen); return; }
  const box = el.querySelector('.box');
  if (box && data.title) box.innerHTML = `<span class="meta">${r.kind} · ${esc(data.title)}</span>`;
}

/* embeds and pages sleep behind a poster (or a typographic card) and wake on a press */
function provider(src) {
  const u = String(src || '');
  const yt = u.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (yt) return { name: 'youtube', frame: `https://www.youtube-nocookie.com/embed/${yt[1]}?autoplay=1&rel=0&enablejsapi=1`, quiet: `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0&enablejsapi=1` };
  if (/^https:\/\/(www\.)?soundcloud\.com\//.test(u))
    return { name: 'soundcloud', frame: `https://w.soundcloud.com/player/?url=${encodeURIComponent(u)}&color=%23e8913f&auto_play=true&visual=true&hide_related=true&show_comments=false&show_reposts=false&show_teaser=false`,
      quiet: `https://w.soundcloud.com/player/?url=${encodeURIComponent(u)}&color=%23e8913f&auto_play=false&visual=true&hide_related=true&show_comments=false&show_reposts=false&show_teaser=false` };
  if (/^https:\/\/(iori\.me|3die\.fr)\//.test(u)) return { name: new URL(u).hostname, frame: u };
  try { return { name: new URL(u).hostname.replace(/^www\./, ''), frame: null }; } catch (e) { return { name: '', frame: null }; }
}
function sleeper(it, data, seen) {
  const el = it.el, box = el.querySelector('.box');
  const m = (data.media || [])[0];
  const p = provider(data.src);
  box.classList.remove('stub');
  box.innerHTML = '';
  if (m && (m.poster || m.src)) {
    const img = new Image(); img.alt = data.title || ''; img.decoding = 'async'; img.loading = 'lazy'; img.draggable = false;
    if (m.srcset) { img.srcset = m.srcset; img.sizes = Math.round(it.w) + 'px'; }
    img.src = m.poster || m.src;
    const key = img.src;
    if (seen.has(key)) reveal(img, key, seen); else img.onload = () => reveal(img, key, seen);
    box.appendChild(img);
  } else box.classList.add('card');
  const cap = document.createElement('div');
  cap.className = 'over';
  cap.innerHTML = `<span class="meta"></span><b></b>${!m && data.body ? '<p></p>' : ''}`;
  cap.querySelector('.meta').textContent = r2label(it.row.kind, p.name);
  cap.querySelector('b').textContent = data.title || '';
  if (!m && data.body) cap.querySelector('p').textContent = data.body;
  box.appendChild(cap);
  const go = document.createElement(p.frame ? 'button' : 'a');
  go.className = 'wake';
  if (p.frame) { go.type = 'button'; go.setAttribute('aria-label', it.row.kind === 'page' ? 'Run here' : 'Play'); }
  else { go.href = data.src || '#'; go.target = '_blank'; go.rel = 'noopener'; go.setAttribute('aria-label', 'Open'); }
  box.appendChild(go);
  if (data.src) {
    const out = document.createElement('a');
    out.className = 'out meta'; out.href = data.src; out.target = '_blank'; out.rel = 'noopener'; out.textContent = 'open ↗';
    box.appendChild(out);
  }
  if (!p.frame) return;
  const kind = it.row.kind === 'page' ? 'page' : 'embed';
  const wake = auto => {
    const cur = box.querySelector('iframe');
    const rec = live.find(l => l.el === el);
    if (cur && auto) { if (rec && rec.state === 'paused') resume(rec); return; }
    if (cur && !auto && cur.dataset.auto) { cur.remove(); live = live.filter(l => l.el !== el); }   // a press on a quiet one: reload it playing
    else if (cur) { if (rec) { rec.auto = false; resume(rec); } return; }
    live = live.filter(l => l.el.isConnected && l.el.querySelector('iframe'));
    if (!auto) live.filter(l => l.el !== el && l.state === 'running').forEach(l => pause(l));      // a press: this one, alone
    else {
      // running frames are all in view: a newcomer never takes a slot from one, it waits for a free slot
      if (live.filter(l => l.kind === kind && l.state === 'running').length >= BUDGET[kind]) { if (BUDGET[kind] > 0) waiting.add(el); return; }
      waiting.delete(el);
    }
    const f = document.createElement('iframe');
    f.src = auto ? (p.quiet || p.frame) : p.frame;
    f.allow = 'autoplay; encrypted-media; fullscreen; xr-spatial-tracking'; f.loading = 'eager';
    f.title = data.title || p.name;
    if (auto) f.dataset.auto = '1';
    // the poster stays until the frame has drawn, then the frame fades in over it
    f.addEventListener('load', () => setTimeout(() => f.classList.add('ready'), 120), { once: true });
    box.appendChild(f);
    el.classList.add('awake');
    if (!auto) el.classList.add('pressed');
    live.push({ el, kind, auto, state: 'running', at: performance.now() });
  };
  go.addEventListener('click', e => { e.stopPropagation(); wake(false); });
  if (io) { wakers.set(el, { kind, wake, t: 0 }); io.observe(el); }
}
// The core unmounts a far-away block: frames go to sleep (unless the core kept the block for them),
// static items pause and join the kept ten.
export function release(root, all) {
  for (const el of root.querySelectorAll('.item')) {
    const k = el.dataset.kind;
    if (k === 'embed' || k === 'page') {
      const w = wakers.get(el);
      if (w) clearTimeout(w.t);
      waiting.delete(el);
      sleep(el);                                   // its frame goes; its poster is a static picture now
    }
    if (io) io.unobserve(el);
    if (all) continue;
    if (k === 'image' || k === 'video' || k === 'audio' || k === 'embed' || k === 'page') {
      if (el._media && !el._media.paused) el._media.pause();
      statics.delete(el.dataset.slug);
      statics.set(el.dataset.slug, el);
      while (statics.size > STATIC_KEEP) {
        const [slug, old] = statics.entries().next().value;
        statics.delete(slug);
        if (old._media) { if (io) io.unobserve(old); old._media.removeAttribute('src'); old._media.load(); }
      }
    }
  }
}
export function forget() { statics.clear(); }      // a rebuild may change entries: drop what is kept

function sleep(el) {
  const f = el.querySelector('iframe'); if (f) { command(f, 'pause'); f.remove(); }
  el.classList.remove('awake', 'pressed');
  live = live.filter(l => l.el !== el);
}
function r2label(kind, name) { return kind === 'page' ? `${name || 'page'} · runs here` : name || kind; }

function caption(el, data, it) {
  if (!data.title || !it.cap) return;     // pictures in a shared row stay uncaptioned; the layout kept no room
  const cap = document.createElement('div');
  cap.className = 'cap meta';
  cap.textContent = data.title;
  el.appendChild(cap);
}

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// a tiny inline markdown: *em*, **strong**, [text](url), bare urls
export function inline(s) {
  s = esc(s);
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" rel="noopener">$1</a>');
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (m, pre, url) => `${pre}<a href="${url}" rel="noopener">${url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a>`);
  return s.replace(/\n/g, '<br>');
}
