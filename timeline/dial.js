/* The dial: the timeline's only navigation, on the right edge.

   Laid out like Google Photos' scrubber (every year on the full height, in proportion to how much
   there is of it) and drawn like a lens barrel: a knurled grip strip that turns as the page scrolls,
   an engraved scale of months and years beside it, and an amber index for where the reader is.

   A loupe magnifies the scale around the hand (or the index while scrolling): ticks spread apart and
   month names appear there, the rest of the scale compresses. The warp keeps its centre fixed, so the
   pointer always maps to the same point of time it would map to unmagnified — dragging stays linear.

   Drawn on one canvas; the date beside the hand is a DOM label (sharp text, glass behind it). */

const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const PAD = 64;               // scale margins, px
const BARREL = 14;            // grip strip width, px
const EDGE = 8;               // grip strip distance from the window edge, px
const LOUPE = 7;              // magnification at the loupe centre

/* the loupe: monotonic, centre-preserving, identity when b = 0 */
function W(u, b) { return b < 1e-3 ? u : (1 - Math.exp(-u * b)) / (1 - Math.exp(-b)); }
export function warp(f, c, b) {
  if (f >= c) return c + (1 - c) * W((f - c) / Math.max(1e-6, 1 - c), b * (1 - c) * 2.5);
  return c - c * W((c - f) / Math.max(1e-6, c), b * c * 2.5);
}

export function themeColors(el = document.documentElement) {
  const cs = getComputedStyle(el);
  const v = n => cs.getPropertyValue(n).trim();
  return { ink: v('--ink'), ink2: v('--ink-2'), muted: v('--muted'), amber: v('--amber'), paper: v('--paper'), teal: v('--teal'),
    family: v('--family') || 'system-ui', wm: parseInt(v('--wm')) || 600 };
}

/* Paint one frame. Exported so the catalog can draw still states with the real thing.
   model: { marks: [{f, y: 'YYYY', m: 0-11, year: bool}], chapters: [{f, title}] }
   s: { w, h, pos, hover (f or null), c (loupe centre), b (loupe strength), turn (px), alpha } */
export function paint(ctx, model, s, col) {
  const { w, h } = s;
  ctx.clearRect(0, 0, w, h);
  const top = PAD, span = Math.max(10, h - PAD * 2);
  const Y = f => top + warp(f, s.c, s.b) * span;
  const bx = w - EDGE - BARREL;            // grip strip left edge
  const sx = bx - 5;                       // scale baseline

  // a shade of the page behind the scale, so it reads over pictures too
  const sh = ctx.createLinearGradient(Math.max(0, sx - 70), 0, sx - 20, 0);
  sh.addColorStop(0, hexA(col.paper, 0)); sh.addColorStop(1, hexA(col.paper, 0.72));
  ctx.fillStyle = sh;
  ctx.fillRect(0, 0, w, h);

  // --- the grip: a short knurled segment riding with the index, turning as the page scrolls.
  // It is the handle: it brightens under the hand and while scrolling, and fades at both ends
  // like ridges curving away on a lens ring.
  const iy0 = Y(s.pos), half = 46 + 20 * (s.grip || 0);
  const g = ctx.createLinearGradient(bx, 0, bx + BARREL, 0);
  g.addColorStop(0, hexA(col.ink, 0.02)); g.addColorStop(0.5, hexA(col.ink, 0.12)); g.addColorStop(1, hexA(col.ink, 0.02));
  const fadeV = ctx.createLinearGradient(0, iy0 - half, 0, iy0 + half);
  ctx.save();
  ctx.beginPath(); ctx.rect(bx, iy0 - half, BARREL, half * 2); ctx.clip();
  ctx.fillStyle = g; ctx.fillRect(bx, iy0 - half, BARREL, half * 2);
  const pitch = 3.2;
  const off = ((s.turn % pitch) + pitch) % pitch;
  for (let y = iy0 - half - pitch + off; y < iy0 + half; y += pitch) {
    const d = Math.abs(y - iy0) / half;                       // 0 at the index, 1 at the ends
    const curve = Math.cos(Math.min(1, d) * Math.PI / 2);
    ctx.fillStyle = hexA(col.ink, (0.08 + 0.3 * (s.grip || 0)) * curve);
    ctx.fillRect(bx + 1, y, BARREL - 2, 1);
  }
  ctx.restore();

  // --- the engraved scale, hanging from one hairline
  ctx.fillStyle = hexA(col.ink, 0.14);
  ctx.fillRect(sx, top - 8, 1, span + 16);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  let lastMonth = -1e9;
  const yearLabels = [];
  const marks = model.marks;
  for (let i = 0; i < marks.length; i++) {
    const m = marks[i];
    const y = Y(m.f);
    const next = marks[i + 1] ? Y(marks[i + 1].f) : y + 40;
    const gap = next - y;
    if (m.year) {
      const decade = +m.y % 10 === 0;
      ctx.fillStyle = hexA(col.ink, decade ? 0.95 : 0.7);
      ctx.fillRect(sx - (decade ? 16 : 11), Math.round(y), decade ? 16 : 11, 1);
      yearLabels.push({ y, text: m.y, prio: (i === 0 || i === marks.length - 1) ? 3 : decade ? 2 : +m.y % 5 === 0 ? 1 : 0 });
      lastMonth = y;
      continue;
    }
    if (y - lastMonth < 2.2) continue;     // months closer than 2 px merge into the line
    lastMonth = y;
    ctx.fillStyle = hexA(col.ink, 0.32);
    ctx.fillRect(sx - 5, Math.round(y), 5, 1);
    // inside the loupe the months get their names
    if (gap > 12 && s.b > 0.5) {
      ctx.font = `${col.wm - 100} 8.5px ${col.family}`;
      ctx.fillStyle = hexA(col.ink2, Math.min(1, (gap - 12) / 8) * 0.85);
      setTracking(ctx, '1.2px');
      ctx.fillText(MON[m.m], sx - 9, y + 0.5);
    }
  }
  // year labels by priority, never closer than 15 px, never under the index or the hand
  const busy = [Y(s.pos)];
  if (s.hover != null) busy.push(Y(s.hover));
  const taken = [];
  ctx.font = `${col.wm} 10px ${col.family}`;
  setTracking(ctx, '1.6px');
  for (const L of yearLabels.sort((a, b) => b.prio - a.prio)) {
    if (taken.some(t => Math.abs(t - L.y) < 15)) continue;
    taken.push(L.y);
    const near = busy.some(b => Math.abs(b - L.y) < 11);
    ctx.fillStyle = hexA(L.prio >= 2 ? col.ink : col.ink2, near ? 0.15 : L.prio >= 2 ? 0.95 : 0.75);
    ctx.fillText(L.text, sx - 21, L.y + 0.5);
  }

  // --- chapters: small amber notches on the strip
  ctx.fillStyle = col.amber;
  for (const c of model.chapters) {
    const y = Y(c.f);
    ctx.beginPath(); ctx.moveTo(bx - 1, y - 3.5); ctx.lineTo(bx + 4, y); ctx.lineTo(bx - 1, y + 3.5); ctx.fill();
  }

  // --- the hand: a hairline across the scale
  if (s.hover != null) {
    const y = Math.round(Y(s.hover));
    ctx.fillStyle = hexA(col.ink, 0.55);
    ctx.fillRect(sx - 26, y, w - (sx - 26) - EDGE, 1);
  }
  // --- the index: where the reader is
  const iy = Math.round(Y(s.pos));
  ctx.save();
  ctx.shadowColor = col.amber; ctx.shadowBlur = 10;
  ctx.fillStyle = col.amber;
  ctx.fillRect(sx - 14, iy - 1, w - (sx - 14) - EDGE + 3, 2);
  ctx.restore();
  ctx.fillStyle = col.amber;
  ctx.beginPath(); ctx.moveTo(w - 2, iy - 4); ctx.lineTo(w - 6, iy); ctx.lineTo(w - 2, iy + 4); ctx.fill();
}

function setTracking(ctx, v) { if ('letterSpacing' in ctx) ctx.letterSpacing = v; }
function hexA(color, a) {
  // tokens are hex; rgba() strings pass through with their alpha scaled
  if (color.startsWith('#')) {
    let c = color.slice(1); if (c.length === 3) c = [...c].map(x => x + x).join('');
    const n = parseInt(c, 16);
    return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
  }
  return color;
}

/* the live dial on the page */
export function createDial(host, { onSeek, label }) {
  host.innerHTML = '<canvas></canvas><div class="hand meta"></div><div class="bubble"></div><div class="grip"></div>';
  const cv = host.querySelector('canvas'), ctx = cv.getContext('2d');
  const hand = host.querySelector('.hand'), bubble = host.querySelector('.bubble'), grip = host.querySelector('.grip');
  const st = { w: 0, h: 0, pos: 0, hover: null, c: 0, b: 0, turn: 0, tb: 0, tc: 0, grip: 0 };
  let model = { marks: [], chapters: [] }, col = themeColors(), raf = 0, dragging = false, scrolling = 0, dpr = 1;
  const coarse = matchMedia('(pointer: coarse)').matches;

  function size() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    st.w = host.clientWidth; st.h = host.clientHeight;
    cv.width = st.w * dpr; cv.height = st.h * dpr;
    cv.style.width = st.w + 'px'; cv.style.height = st.h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    kick();
  }
  const span = () => Math.max(10, st.h - PAD * 2);
  const fAt = clientY => Math.max(0, Math.min(1, (clientY - host.getBoundingClientRect().top - PAD) / span()));
  const yOf = f => PAD + warp(f, st.c, st.b) * span();

  function frame() {
    raf = 0;
    // the loupe eases in and out; its centre follows the hand, or the index while scrolling
    const active = dragging || st.hover != null || scrolling > performance.now();
    // full loupe under a hand; a gentler one on the index while the page scrolls, so the overview stays
    st.tb = dragging || st.hover != null ? LOUPE : active ? LOUPE * 0.45 : 0;
    st.tc = st.hover != null ? st.hover : st.pos;
    st.b += (st.tb - st.b) * 0.2;
    st.grip += ((dragging ? 1 : active ? 0.7 : 0) - st.grip) * 0.2;
    st.c += (st.tc - st.c) * (dragging ? 1 : 0.35);
    paint(ctx, model, st, col);
    const iy = yOf(st.pos);
    grip.style.top = iy + 'px';
    bubble.style.top = iy + 'px';
    if (st.hover != null) hand.style.top = yOf(st.hover) + 'px';
    if (Math.abs(st.tb - st.b) > 0.01 || Math.abs(st.tc - st.c) > 1e-4 || Math.abs(st.grip - (dragging ? 1 : active ? 0.7 : 0)) > 0.01) kick();
    host.classList.toggle('on', active);
  }
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }

  host.addEventListener('pointermove', e => {
    if (coarse && !dragging) return;
    st.hover = fAt(e.clientY);
    hand.textContent = label(st.hover);
    if (dragging) onSeek(st.hover);
    kick();
  });
  host.addEventListener('pointerleave', () => { if (!dragging) { st.hover = null; kick(); } });
  host.addEventListener('pointerdown', e => {
    if (coarse && e.target !== grip) return;
    dragging = true; host.classList.add('drag');
    host.setPointerCapture(e.pointerId);
    st.hover = fAt(e.clientY); st.c = st.hover;
    hand.textContent = label(st.hover);
    onSeek(st.hover); kick(); e.preventDefault();
  });
  const end = () => { if (!dragging) return; dragging = false; host.classList.remove('drag'); if (coarse) st.hover = null; kick(); };
  host.addEventListener('pointerup', end); host.addEventListener('pointercancel', end);
  window.addEventListener('resize', size);
  new MutationObserver(() => { col = themeColors(); kick(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { col = themeColors(); kick(); });
  size();

  return {
    setModel(m) { model = m; kick(); },
    setPos(f, turn, fromScroll) {
      st.pos = f; st.turn = turn;
      if (fromScroll) { scrolling = performance.now() + 900; setTimeout(kick, 920); }
      bubble.innerHTML = label(f, true);
      kick();
    },
    refresh() { col = themeColors(); size(); },
  };
}
