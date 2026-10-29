// The engine's paper: the reading layer (contents rail, progress) and the live figures.
//
// Every figure is the engine itself in an iframe (figures.js says how each is set up). A figure exists
// only while it is on screen: it is created once it has stayed in view for a moment (a fast scroll past
// starts nothing) and removed as soon as it leaves, so its GPU device, its pipelines and its JIT go with
// it. At most two run at once, the two nearest the middle of the screen. Each compiles its shaders the
// first time it runs (Chrome keeps compiled shaders, so a second visit starts faster).
//
// A figure is covered until it is entered — a click or a tap — so the wheel and the finger scroll the
// page, not the engine, until the reader means the engine. A press outside, the pointer leaving or the
// figure leaving the screen covers it again. Nothing a reader does is stored (app.js EMBED).
import { FIGURES, figureSrc } from './figures.js?v=3';

const MAX_LIVE = 2, DWELL_MS = 350, LINE_MS = 500;
const COARSE = matchMedia('(pointer: coarse)').matches;
const figs = new Map();   // id → { el, frame, cover, line, visible, ratio, timer, iframe, doc }

function cover(F) {
  F.el.classList.remove('entered');
  F.cover.hidden = false;
}

function start(F) {
  if (F.iframe) return;
  const live = [...figs.values()].filter((G) => G.iframe);
  if (live.length >= MAX_LIVE) {
    // the live figure farthest from the middle of the screen gives way
    const far = live.sort((a, b) => distance(b) - distance(a))[0];
    if (distance(far) <= distance(F)) return;
    stop(far);
  }
  const f = document.createElement('iframe');
  f.src = figureSrc(F.id, F.doc);
  f.title = F.el.querySelector('figcaption').textContent.trim();
  f.allow = 'fullscreen';
  F.frame.insertBefore(f, F.cover);
  F.iframe = f;
  F.el.classList.add('live');
  cover(F);
}

function stop(F) {
  clearTimeout(F.timer);
  if (!F.iframe) return;
  F.iframe.remove();
  F.iframe = null;
  F.el.classList.remove('live');
  cover(F);
}

const distance = (F) => { const r = F.el.getBoundingClientRect(); return Math.abs(r.top + r.height / 2 - innerHeight / 2); };

const observer = new IntersectionObserver((entries) => {
  for (const e of entries) {
    const F = figs.get(e.target.dataset.fig);
    F.visible = e.isIntersecting;
    clearTimeout(F.timer);
    if (F.visible) F.timer = setTimeout(() => { if (F.visible) start(F); }, DWELL_MS);
    else stop(F);
  }
}, { threshold: 0.15 });

function enter(F) {
  if (!F.iframe) start(F);
  if (!F.iframe) return;
  F.el.classList.add('entered');
  F.cover.hidden = true;
  try { F.iframe.contentWindow.focus(); } catch { /* not loaded yet */ }
}

document.querySelectorAll('figure.engine[data-fig]').forEach((el) => {
  const id = el.dataset.fig;
  if (!FIGURES[id]) { console.warn('no figure', id); return; }
  const frame = el.querySelector('.fe-frame');
  const btn = document.createElement('button');
  btn.className = 'fe-cover';
  btn.type = 'button';
  btn.innerHTML = `<span>${COARSE ? 'tap' : 'click'} to enter</span>`;
  frame.appendChild(btn);
  const line = document.createElement('p');
  line.className = 'fe-line';
  frame.after(line);
  const F = { id, el, frame, cover: btn, line, visible: false, timer: 0, iframe: null, doc: null };
  figs.set(id, F);
  btn.addEventListener('click', () => enter(F));
  // a mouse leaving gives the wheel back to the page (a finger leaves by pressing outside)
  frame.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !e.buttons) cover(F); });
  observer.observe(el);
});
addEventListener('pointerdown', (e) => {
  for (const F of figs.values()) if (F.el.classList.contains('entered') && !F.frame.contains(e.target)) cover(F);
}, true);

// under every live figure: its document as a line of notation, as the engine has it now (the grab, the
// graph and the Metasurface all rewrite it), and which shader draws it
setInterval(() => {
  for (const F of figs.values()) {
    let fe = null;
    try { fe = F.iframe && F.iframe.contentWindow.__fe; } catch { /* another origin: no line */ }
    const text = fe && fe.state ? fe.state.text + (fe.state.mode !== 'pull' ? `   · ${fe.state.mode}` : '') : '';
    if (F.line.textContent !== text) F.line.textContent = text;
    F.line.title = fe && fe.pipeline ? `drawn by the ${fe.pipeline}` : '';
  }
}, LINE_MS);

// the notation figure: type a formula, the figure draws it
const form = document.querySelector('form.fe-try');
if (form) {
  const F = figs.get(form.dataset.fig);
  const input = form.querySelector('input');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    F.doc = input.value.trim() || null;
    stop(F);
    start(F);
  });
  form.querySelectorAll('[data-try]').forEach((b) => b.addEventListener('click', () => { input.value = b.dataset.try; form.requestSubmit(); }));
}

// for tests: which figures run; start one without the dwell (a background tab's timers are throttled)
window.__paper = { live: () => [...figs.values()].filter((F) => F.iframe).map((F) => F.id), figs, start: (id) => start(figs.get(id)) };

// ---------- the reading layer: contents rail and progress (as paper 0) ----------
const toc = document.querySelector('nav.toc'), main = document.querySelector('main');
const items = [];
if (toc) {
  const title = document.createElement('div'); title.className = 'toc-title'; title.textContent = 'Contents'; toc.appendChild(title);
  main.querySelectorAll('section[id] > h2, section[id] > h3[id]').forEach((h) => {
    const id = h.tagName === 'H2' ? h.parentElement.id : h.id;
    const a = document.createElement('a'); a.href = '#' + id; a.textContent = h.textContent;
    if (h.tagName === 'H3') a.className = 'sub';
    toc.appendChild(a); items.push({ a, h });
  });
}
const bar = document.getElementById('progress');
let ticking = false;
function onScroll() {
  ticking = false;
  const max = document.documentElement.scrollHeight - innerHeight;
  if (bar) bar.style.width = `${Math.max(0, Math.min(1, scrollY / (max || 1))) * 100}%`;
  let cur = null;
  for (const it of items) { if (it.h.getBoundingClientRect().top < innerHeight * 0.3) cur = it; else break; }
  for (const it of items) it.a.classList.toggle('active', it === cur);
  if (cur && toc && cur.a.offsetTop) {
    const top = cur.a.offsetTop - toc.clientHeight / 2;
    if (Math.abs(toc.scrollTop - top) > toc.clientHeight / 3) toc.scrollTop = top;
  }
}
addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
onScroll();
