// help.js — the 1-minute tour (study/TUTORIAL-PLAN.md, decisions 2026-10-25). Eight steps over the real UI: a dimmed
// ring around one control, a small window in the shell's own style with a sentence and a looping drawing. It never
// blocks: the dim lets every click through, × / Esc / STOP TOUR end it at once and undo nothing, and it never starts
// by itself — a first visit only gets a corner offer that fades. Doing a step (applying a look, pressing H, painting a
// lock) moves on; NEXT is always there. Steps are data, so the harness can check that every target still exists.

const KEY = 'moshine.tour';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
const keep = (v) => { try { localStorage.setItem(KEY, JSON.stringify({ ...load(), ...v })); } catch (e) {} };
const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

// ------------------------------------------------------------------------------------------------ the steps
/**
 * Each step: { id, title, text, target() -> Element | Element[] | null, prepare?(app), on?(what, label) -> done,
 * poll?(app, base) -> done, start?(app) -> base, art(ctx, t, w, h) }. app = the hooks ui.js passes (S, play, project,
 * openWin). `what` is the timeline command that just ran, `label` the undo label.
 */
export const STEPS = [
  { id: 'import', title: 'Bring a video',
    text: 'Drop a video file anywhere on this window, or press <b>IMPORT…</b>. It stays in this browser; nothing is uploaded. The demo clip is already loaded if you just want to try.',
    prepare: (a) => a.openWin('media'), target: () => $('.ms[data-key=media].open') ? [...$('.ms[data-key=media]').querySelectorAll('.ms-b')].find((b) => /^IMPORT/.test(b.textContent)) : $('#ms-empty:not([hidden]) .em-box'),
    start: (a) => a.project.media.length, poll: (a, n) => a.project.media.length > n, art: artImport },
  { id: 'timeline', title: 'Your clip, and the mosh above it',
    text: 'The grey bar is your clip. The <b>orange bar</b> above it is the mosh: it only happens where the orange bar is. Drag its ends to choose where.',
    prepare: (a) => a.closeWin('media'), target: () => $('#ms-tlpane'), art: artTimeline },
  { id: 'looks', title: 'Pick a look',
    text: 'Each card shows your clip with that style. <b>Click one</b> and the preview changes.',
    target: () => $('#ms-looks'), on: (w, label) => /^Look:|mosh/i.test(label || ''), art: artLooks },
  { id: 'play', title: 'Play it',
    text: 'Press <b>▶</b> or the space bar. The arrow keys step one frame at a time.',
    target: () => [$('#ms-home'), $('#ms-loop')], poll: (a) => a.play.on, art: artPlay },
  { id: 'hit', title: 'Add hits',
    text: 'Press <b>H</b> (or HIT) on a beat: the picture breaks apart right there. Each hit shows as a marker on the timeline.',
    target: () => $('#ms-hit'), on: (w) => w === 'addMarker', art: artHit },
  { id: 'lock', title: 'Keep things clean',
    text: 'Choose <b>LOCK</b> and paint over a face: the mosh never touches it. <b>MASK</b> does the opposite (mosh only here). <b>SHOW</b> shows where it reaches.',
    target: () => [$('#mk-inc'), $('#mk-lock')], on: (w) => w === 'addMaskStroke', art: artLock },
  { id: 'vector', title: 'Steer the melt (optional)',
    text: 'Choose <b>VECTOR</b> and drag on the picture: the pixels flow the way you drag. The slider sets how hard they push.',
    target: () => [$('#mk-vec'), $('#mk-vmode')], on: (w) => w === 'addVectorStroke', art: artVector },
  { id: 'export', title: 'Export',
    text: 'For your edit, press <b>FOR EDITING</b>: you get lossless PNG frames and a WAV to drop into Premiere, Resolve or Final Cut. <b>FOR SHARING</b> gives one MP4. Then press EXPORT.',
    prepare: (a) => a.openWin('export'), target: () => $('.exp-presets'), art: artExport },
];
const DONE = { id: 'done', title: 'That’s it', text: 'Help ▸ Tour starts this again any time. Help ▸ Keyboard map lists every key.', target: () => null, art: artDone };

// ------------------------------------------------------------------------------------------------ the tour
/** createTour(app): { start(i), stop(), notify(what, label), offer(), active, step }. */
export function createTour(app) {
  let i = -1, ring = null, win = null, raf = 0, base = null, last = '', moving = 0, advancing = false;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const steps = () => [...STEPS, DONE];
  const rectOf = (t) => {
    const list = (Array.isArray(t) ? t : [t]).filter((e) => e && e.isConnected && e.getClientRects().length);
    if (!list.length) return null;
    const rs = list.map((e) => e.getBoundingClientRect()); if (rs.every((r) => !r.width && !r.height)) return null;
    const l = Math.min(...rs.map((r) => r.left)), tp = Math.min(...rs.map((r) => r.top)), r = Math.max(...rs.map((r) => r.right)), b = Math.max(...rs.map((r) => r.bottom));
    return { left: l - 4, top: tp - 4, width: r - l + 8, height: b - tp + 8 };
  };
  function build() {
    ring = el('div'); ring.id = 'tour-ring';
    win = el('div', 'ms open', `<div class="ms-in"><div class="ms-wcap"><div class="ms-capt"></div><button class="ms-min tour-x" aria-label="stop the tour" title="stop the tour (Esc)"></button></div>
      <div class="ms-body"><canvas width="336" height="152"></canvas><div class="tour-t"></div><div class="tour-p"></div>
      <div class="ms-brow"><button class="ms-b" data-k="back">BACK</button><button class="ms-b" data-k="next">NEXT</button><span class="ms-sp"></span><button class="ms-b" data-k="stop">STOP TOUR</button></div></div></div>`);
    win.id = 'tour-win'; win.classList.add('active');
    win.querySelector('.tour-x').onclick = () => stop();
    win.querySelector('[data-k=stop]').onclick = () => stop();
    win.querySelector('[data-k=back]').onclick = () => show(i - 1);
    win.querySelector('[data-k=next]').onclick = () => (i >= steps().length - 1 ? stop(true) : show(i + 1));
    document.body.append(ring, win);
    addEventListener('keydown', onKey, true); addEventListener('resize', place);
    loop();
  }
  const onKey = (e) => { if (e.key === 'Escape' && !app.mk?.tool) { stop(); } };
  function show(n) {
    const all = steps(); n = Math.max(0, Math.min(all.length - 1, n));
    if (!win) build();
    i = n; advancing = false; last = ''; unfade(); const s = all[i];
    try { s.prepare?.(app); } catch (e) {}
    base = s.start ? s.start(app) : null;
    win.querySelector('.ms-capt').textContent = s.id === 'done' ? 'Tour' : `Tour — ${i + 1} / ${STEPS.length}`;
    win.querySelector('.tour-t').textContent = s.title; win.querySelector('.tour-p').innerHTML = s.text;
    win.querySelector('[data-k=back]').disabled = i === 0;
    win.querySelector('[data-k=next]').textContent = s.id === 'done' ? 'DONE' : s.id === 'vector' ? 'SKIP' : 'NEXT';
    win.querySelector('[data-k=stop]').hidden = s.id === 'done';
    win.classList.remove('tour-ok'); win.classList.add('tour-in'); clearTimeout(moving); moving = setTimeout(() => win?.classList.remove('tour-in'), 160);
    keep({ step: s.id === 'done' ? null : i });
    requestAnimationFrame(place);
  }
  /** Ring around the target, the window beside it (right, left, below, above), kept on screen; docked on a phone. */
  function place() {
    if (!win) return;
    const s = steps()[i], r = rectOf(s.target()), W = innerWidth, H = innerHeight, ww = win.offsetWidth, wh = win.offsetHeight, g = 12;
    const key = r ? [r.left, r.top, r.width, r.height].map(Math.round).join() + ww + 'x' + wh + W + 'x' + H : 'none' + W + H;
    if (key === last) return; last = key;
    ring.hidden = !r;
    if (r) Object.assign(ring.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    // a floating window over the target fades and lets clicks through for this step (the user's layout stays as it is)
    const tg = [s.target()].flat().filter(Boolean);
    for (const w of document.querySelectorAll('.ms.open:not(#tour-win):not(#tour-offer)')) {
      const b = w.getBoundingClientRect(), over = r && !tg.some((t) => w.contains(t)) && b.left < r.left + r.width && b.right > r.left && b.top < r.top + r.height && b.bottom > r.top;
      w.classList.toggle('tour-under', !!over);
    }
    if (document.body.classList.contains('ms-phone')) { win.classList.add('tour-dock'); win.style.left = win.style.top = ''; return; }
    win.classList.remove('tour-dock');
    let x, y;
    if (!r) { x = (W - ww) / 2; y = (H - wh) / 2; }
    else {
      const top = Math.min(Math.max(48, r.top), H - wh - 8), left = Math.min(Math.max(8, r.left), W - ww - 8);
      const opts = [[r.left + r.width + g, top, r.left + r.width + g + ww <= W], [r.left - g - ww, top, r.left - g - ww >= 0],
        [left, r.top + r.height + g, r.top + r.height + g + wh <= H], [left, r.top - g - wh, r.top - g - wh >= 40]];
      const o = opts.find((q) => q[2]) || [W - ww - 8, 48];
      [x, y] = o;
    }
    win.style.left = Math.round(Math.max(8, Math.min(W - ww - 8, x))) + 'px'; win.style.top = Math.round(Math.max(40, Math.min(H - wh - 8, y))) + 'px';
  }
  function loop() {
    const cv = win?.querySelector('canvas'); if (!cv) return;
    const ctx = cv.getContext('2d'), t0 = performance.now();
    const frame = (now) => {
      if (!win) return;
      const s = steps()[i]; place();
      if (s.poll && !advancing && s.poll(app, base)) complete();
      ctx.save(); ctx.clearRect(0, 0, cv.width, cv.height); ctx.scale(2, 2);
      try { s.art(ctx, reduce ? 1.2 : ((now - t0) / 1000) % 3, 168, 76); } catch (e) {}
      ctx.restore();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  }
  /** The user did the step: a tick in the caption, then the next step. */
  function complete() {
    if (advancing || !win) return; advancing = true; const at = i;
    win.classList.add('tour-ok');
    setTimeout(() => { if (win && i === at) show(i + 1); }, 650);
  }
  const unfade = () => document.querySelectorAll('.tour-under').forEach((w) => w.classList.remove('tour-under'));
  function stop(finished = false) {
    unfade(); try { app.closeOpened?.(); } catch (e) {}
    cancelAnimationFrame(raf); removeEventListener('keydown', onKey, true); removeEventListener('resize', place);
    ring?.remove(); win?.remove(); ring = win = null; last = '';
    if (finished || i >= STEPS.length) keep({ step: null, done: true });
    i = -1;
  }
  /** First visit: a small note in the corner that fades by itself; shown once per browser. */
  function offer() {
    const st = load(); if (st.offered) return; keep({ offered: true });
    const o = el('div', 'ms open', `<div class="ms-in"><div class="ms-body"><b>New here?</b> A 1-minute tour of the basics.<div class="ms-brow"><button class="ms-b" data-k="go">TAKE THE TOUR</button><button class="ms-b" data-k="no">NO THANKS</button></div></div></div>`);
    o.id = 'tour-offer'; document.body.append(o);
    let timer = 0; const gone = () => { o.classList.add('tour-fade'); setTimeout(() => o.remove(), 400); };
    const arm = () => { clearTimeout(timer); timer = setTimeout(gone, 9000); };
    o.onpointerenter = () => clearTimeout(timer); o.onpointerleave = arm; arm();
    o.querySelector('[data-k=go]').onclick = () => { o.remove(); show(0); };
    o.querySelector('[data-k=no]').onclick = gone;
  }
  return {
    start: (n = 0) => show(n), stop, offer, place,
    notify(what, label) { const s = i >= 0 && steps()[i]; if (s?.on && !advancing && s.on(what, label)) complete(); },
    get active() { return i >= 0; }, get step() { return i; }, get saved() { const v = load().step; return Number.isInteger(v) && v > 0 && v < STEPS.length ? v : null; },
    rectOf, steps,
  };
}

// ------------------------------------------------------------------------------------------------ the drawings
// Small, looping, in the shell's palette: grey chrome, navy, black outlines, and colour bars standing in for video.
// Each is (ctx, t seconds 0..3, w 168, h 76) in CSS pixels on a 2x canvas.
const NAVY = '#000080', GREY = '#c0c0c0', DK = '#808080', ORANGE = '#f8d8a8', ORANGE2 = '#e0a050', RED = '#c01010';
const BARS = ['#f0f0f0', '#e8e020', '#40e0e0', '#40d040', '#e040e0', '#e04040', '#4040e0', '#404040'];
const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const box = (c, x, y, w, h, fill = GREY) => { c.fillStyle = fill; c.fillRect(x, y, w, h); c.strokeStyle = '#000'; c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); };
/** Colour bars in a rect; mosh 0..1 shifts blocks sideways and down like a broken P-frame. */
function bars(c, x, y, w, h, mosh = 0, seed = 0) {
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
  const bw = w / BARS.length, B = 6;
  for (let by = 0; by < h; by += B) for (let bx = 0; bx < w; bx += B) {
    const r = Math.sin((bx * 12.9898 + by * 78.233 + seed * 3.1) * 0.37) * 43758.5453, f = r - Math.floor(r);
    const dx = mosh * (f > 0.5 ? 1 : -1) * f * 26 * (by / h + 0.3), k = Math.max(0, Math.min(BARS.length - 1, Math.floor((bx + dx) / bw)));
    c.fillStyle = BARS[(k + (mosh > 0.6 && f > 0.85 ? 3 : 0)) % BARS.length]; c.fillRect(x + bx, y + by, B, B);
  }
  c.restore(); c.strokeStyle = '#000'; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}
function cursor(c, x, y, down = false) {
  c.save(); c.translate(x, y); if (down) c.scale(0.9, 0.9);
  c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 12); c.lineTo(3, 9); c.lineTo(6, 14); c.lineTo(8, 13); c.lineTo(5, 8); c.lineTo(9, 8); c.closePath();
  c.fillStyle = '#fff'; c.fill(); c.strokeStyle = '#000'; c.lineWidth = 1; c.stroke(); c.restore();
}
function label(c, text, x, y, color = '#000', size = 7) { c.fillStyle = color; c.font = `700 ${size}px Urbanist, Arial, sans-serif`; c.fillText(text, x, y); }

function artImport(c, t, w, h) {
  box(c, 52, 20, 100, 52); c.fillStyle = NAVY; c.fillRect(53, 21, 98, 8); label(c, 'MOSHINE', 88, 27.5, '#fff', 6);
  const p = ease(t / 1.4), fx = 14 + p * 70, fy = 4 + p * 28, inside = t > 1.4;
  if (inside) bars(c, 60, 34, 84, 32, 0);
  else { c.save(); c.translate(fx, fy); box(c, 0, 0, 20, 26, '#fff'); c.beginPath(); c.moveTo(13, 0.5); c.lineTo(19.5, 7); c.lineTo(13, 7); c.closePath(); c.fillStyle = GREY; c.fill(); c.stroke(); label(c, 'MP4', 3, 20, NAVY, 6); c.restore(); }
  if (!inside) cursor(c, fx + 12, fy + 14);
}
function artTimeline(c, t, w, h) {
  const edge = 120 + 30 * Math.sin(t * Math.PI * 2 / 3);
  label(c, 'FX1', 4, 25); label(c, 'V1', 4, 49);
  box(c, 24, 16, edge - 24, 14, ORANGE); label(c, 'MOSH', 30, 26, '#000', 6);
  c.fillStyle = ORANGE2; c.fillRect(edge - 4, 17, 3, 12);
  box(c, 24, 40, 136, 14, '#e0e0e0'); label(c, 'your clip', 30, 50, '#000', 6);
  c.fillStyle = 'rgba(224,160,80,.25)'; c.fillRect(24, 40, edge - 24, 14);
  cursor(c, edge - 2, 22);
}
function artLooks(c, t, w, h) {
  const on = t > 1.1;
  bars(c, 44, 2, 80, 36, on ? 0.6 + 0.2 * Math.sin(t * 4) : 0, Math.floor(t * 6));
  for (let k = 0; k < 3; k++) { const x = 30 + k * 38; box(c, x, 46, 34, 22, on && k === 1 ? NAVY : GREY); bars(c, x + 3, 49, 28, 13, k * 0.4, k); }
  const p = ease(t / 1.0); cursor(c, 20 + p * 30, 70 - p * 10, t > 0.95 && t < 1.25);
}
function artPlay(c, t, w, h) {
  bars(c, 24, 2, 120, 44, 0.25, Math.floor(t * 8));
  box(c, 66, 52, 36, 18, t > 0.3 && t < 0.55 ? '#dcdcdc' : GREY);
  c.fillStyle = '#000'; c.beginPath(); c.moveTo(80, 56); c.lineTo(80, 66); c.lineTo(89, 61); c.closePath(); c.fill();
  const x = 24 + ((t * 40) % 120); c.fillStyle = RED; c.fillRect(x, 2, 2, 44);
}
function artHit(c, t, w, h) {
  const beat = t % 1.5, hit = beat < 0.45, m = hit ? 1 - beat / 0.45 : 0;
  bars(c, 52, 2, 112, 50, m, Math.floor(t / 1.5) * 7);
  box(c, 8, 18 + (beat < 0.15 ? 3 : 0), 30, 28, beat < 0.15 ? '#dcdcdc' : GREY); label(c, 'H', 18, 37 + (beat < 0.15 ? 3 : 0), '#000', 13);
  c.fillStyle = '#000'; c.fillRect(52, 64, 112, 1);
  for (let k = 0; k <= Math.floor(t / 1.5); k++) { const x = 70 + k * 46; c.fillStyle = RED; c.beginPath(); c.moveTo(x, 58); c.lineTo(x + 4, 64); c.lineTo(x - 4, 64); c.closePath(); c.fill(); }
}
function artLock(c, t, w, h) {
  bars(c, 24, 2, 120, 72, 0.9, Math.floor(t * 5));
  const p = ease(t / 1.8), cx = 84, cy = 36;
  c.save(); c.beginPath(); c.arc(cx, cy, 22 * p + 0.01, 0, Math.PI * 2); c.clip(); bars(c, 24, 2, 120, 72, 0); c.restore();
  c.strokeStyle = '#000'; c.fillStyle = '#f2d2b0'; c.beginPath(); c.arc(cx, cy, 13, 0, Math.PI * 2); c.globalAlpha = p; c.fill(); c.stroke(); c.globalAlpha = 1;
  if (p > 0.5) { c.fillStyle = '#000'; c.fillRect(cx - 5, cy - 3, 2, 2); c.fillRect(cx + 3, cy - 3, 2, 2); c.fillRect(cx - 4, cy + 5, 8, 1); }
  const a = t * 5; cursor(c, cx + Math.cos(a) * 18 * (1 - p * 0.3), cy + Math.sin(a) * 14 * (1 - p * 0.3));
  label(c, 'LOCK', 4, 70, NAVY);
}
function artVector(c, t, w, h) {
  bars(c, 24, 2, 120, 72, 0.35, 2);
  const path = (u) => [36 + u * 96, 58 - Math.sin(u * Math.PI) * 40];
  c.strokeStyle = NAVY; c.lineWidth = 2; c.beginPath();
  const p = Math.min(1, t / 2); for (let k = 0; k <= 20 * p; k++) { const [x, y] = path(k / 20); k ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); c.lineWidth = 1;
  for (let k = 0; k < 6; k++) { const u = ((t * 0.4 + k / 6) % 1) * p, [x, y] = path(u); c.fillStyle = BARS[k + 1]; c.fillRect(x - 3, y - 3, 6, 6); c.strokeStyle = '#000'; c.strokeRect(x - 2.5, y - 2.5, 5, 5); }
  const [cx, cy] = path(p); cursor(c, cx, cy);
}
function artExport(c, t, w, h) {
  for (let k = 0; k < 4; k++) {
    const u = ((t / 3 + k / 4) % 1), x = 10 + u * 100, y = 18 + Math.sin(u * Math.PI) * -10;
    c.globalAlpha = u > 0.85 ? (1 - u) / 0.15 : 1; bars(c, x, y, 26, 16, 0.5, k); c.globalAlpha = 1;
  }
  box(c, 120, 22, 40, 30, '#e8d070'); c.fillStyle = '#d8b850'; c.fillRect(121, 18, 16, 5); c.strokeRect(120.5, 18.5, 16, 5);
  label(c, 'PNG', 129, 41, '#000', 8);
  c.strokeStyle = NAVY; c.beginPath(); for (let x = 0; x < 40; x++) { const y = 64 + Math.sin(x * 0.7 + t * 6) * 4 * Math.sin(x / 40 * Math.PI); x ? c.lineTo(120 + x, y) : c.moveTo(120, y); } c.stroke();
  label(c, 'WAV', 98, 67, NAVY, 7);
}
function artDone(c, t, w, h) {
  const p = ease(t / 0.8); c.strokeStyle = NAVY; c.lineWidth = 6; c.lineCap = 'square';
  c.beginPath(); c.moveTo(64, 38); c.lineTo(64 + 12 * Math.min(1, p * 2), 38 + 12 * Math.min(1, p * 2));
  if (p > 0.5) c.lineTo(76 + 26 * (p - 0.5) * 2, 50 - 32 * (p - 0.5) * 2); c.stroke(); c.lineWidth = 1;
}
