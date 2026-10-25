// shell.js — the Program Manager shell shared by the app (ui.js) and the lab (lab.js): caption, menu bar
// with the status at its right, the docked preview pane with a fitted stage, tool windows that minimise to
// the dock, phone bottom sheet. Shell state (window layout, toggles) persists in localStorage under `key`.

export const $ = (id) => document.getElementById(id);
export const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

// The 16 VGA colours and a 4x4 Bayer matrix: the site icon is drawn as a Windows 3.1 bitmap (as in the Iris Engine).
const VGA = [[0, 0, 0], [128, 0, 0], [0, 128, 0], [128, 128, 0], [0, 0, 128], [128, 0, 128], [0, 128, 128], [192, 192, 192], [128, 128, 128], [255, 0, 0], [0, 255, 0], [255, 255, 0], [0, 0, 255], [255, 0, 255], [0, 255, 255], [255, 255, 255]];
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function siteIcon(b) {
  if (!b) return;
  const im = new Image();
  im.onload = () => {
    const px = Math.max(8, b.clientHeight || 18), a = document.createElement('canvas'); a.width = a.height = 64;
    const ac = a.getContext('2d'); ac.imageSmoothingQuality = 'high'; ac.drawImage(im, 0, 0, 64, 64);
    const cv = document.createElement('canvas'); cv.width = cv.height = px; const c = cv.getContext('2d'); c.imageSmoothingQuality = 'high'; c.drawImage(a, 0, 0, px, px);
    const d = c.getImageData(0, 0, px, px), p = d.data;
    for (let i = 0; i < px * px; i++) {
      const o = i * 4, l = 0.3 * p[o] + 0.59 * p[o + 1] + 0.11 * p[o + 2], sat = Math.max(p[o], p[o + 1], p[o + 2]) - Math.min(p[o], p[o + 1], p[o + 2]);
      // the logo's muted colours and hatched ground fall between VGA entries: push saturation, crush the ground to black
      if (sat < 38) { if (l < 88) p[o] = p[o + 1] = p[o + 2] = 0; else { p[o] = 40; p[o + 1] = 170; p[o + 2] = 140; } }
      else for (let k = 0; k < 3; k++) p[o + k] = Math.max(0, Math.min(255, l + (p[o + k] - l) * 2.6 + 18));
      const t = (B4[(Math.floor(i / px) & 3) * 4 + ((i % px) & 3)] / 16 - 0.47) * 56; let best = 0, bd = 1e9;
      for (let k = 0; k < 16; k++) { const q = VGA[k], e = (p[o] + t - q[0]) ** 2 + (p[o + 1] + t - q[1]) ** 2 + (p[o + 2] + t - q[2]) ** 2; if (e < bd) { bd = e; best = k; } }
      p[o] = VGA[best][0]; p[o + 1] = VGA[best][1]; p[o + 2] = VGA[best][2]; p[o + 3] = 255;
    }
    c.putImageData(d, 0, 0); b.style.backgroundImage = `url(${cv.toDataURL()})`; b.classList.add('ms-site');
  };
  im.src = new URL('../icon/ios/180.png', location.href).href;
}

export function createShell({ key, title, state = {} }) {
  let U = { layout: {}, open: {}, ...state };
  try { U = Object.assign(U, JSON.parse(localStorage.getItem(key) || '{}')); } catch (e) {}
  const save = () => { try { localStorage.setItem(key, JSON.stringify(U)); } catch (e) {} };
  if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('ms-touch');
  const phone = () => document.body.classList.toggle('ms-phone', innerWidth < 640);
  phone(); addEventListener('resize', phone);

  document.body.append(
    h('div', '', `<div id="ms-cap"><button class="ms-ctl" aria-label="Site menu" title="iori.me · 3die · site menu"></button><span class="ms-capt0">${title}</span></div>`),
    Object.assign(h('div'), { id: 'ms-menubar' }),
    h('div', '', `<div id="ms-desk"><div class="ms-pane active" id="ms-preview"><div class="ms-in">
      <div class="ms-wcap"><div class="ms-capt" id="ms-ptitle">Preview</div></div>
      <div id="ms-stage"><div id="ms-fit"><canvas id="ms-view" width="320" height="180"></canvas><canvas id="ms-overlay"></canvas></div><div id="ms-ov"></div></div>
      <div id="ms-transport"></div></div></div></div>`),
    Object.assign(h('div'), { id: 'ms-dock' }));
  const menubar = $('ms-menubar'), status = Object.assign(h('div'), { id: 'ms-status' });

  // ---- menus
  let openMenu = null;
  const closeMenu = () => { if (openMenu) { openMenu.el.remove(); openMenu.top.classList.remove('open'); openMenu = null; } };
  let onAction = () => {};
  function menu(label, items, top = null) {
    if (!top) { top = h('div', 'ms-mtop', label); menubar.insertBefore(top, status.parentNode === menubar ? status : null); }
    top.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); const was = openMenu && openMenu.top === top; closeMenu(); if (was) return;
      const el = h('div', 'ms-menu'); const r = top.getBoundingClientRect(); el.style.left = r.left + 'px'; el.style.top = r.bottom + 'px';
      for (const it of items()) {
        if (it === '-') { el.append(h('div', 'ms-sep')); continue; }
        if (it.head) { el.append(h('div', 'ms-mi head', it.head)); continue; }
        const mi = h('div', 'ms-mi' + (it.chk ? ' chk' : '') + (it.run || it.href ? '' : ' dis'), it.label + (it.key ? `<small>${it.key}</small>` : ''));
        if (it.href) mi.addEventListener('click', () => { closeMenu(); location.href = it.href; });
        if (it.run) mi.addEventListener('click', () => { closeMenu(); it.run(); onAction(); });
        el.append(mi);
      }
      document.body.append(el); top.classList.add('open'); openMenu = { el, top };
      const mr = el.getBoundingClientRect();                         // kept on screen: opens upwards near the bottom
      if (mr.bottom > innerHeight - 4) el.style.top = Math.max(4, r.top - mr.height) + 'px';
      if (mr.right > innerWidth - 4) el.style.left = Math.max(4, innerWidth - mr.width - 4) + 'px';
    });
  }
  addEventListener('pointerdown', (e) => { if (openMenu && !openMenu.el.contains(e.target)) closeMenu(); });
  menubar.append(status);

  // ---- the site menu lives in the caption's corner box, as in the Iris Engine: the site icon (the three 3die
  // triangles) as a 16-colour bitmap at the box's pixel size, and the site's links as a menu. The links are read from
  // the generated #site-menu markup (site.py menu stays the single source); the floating burger is hidden in ui.css.
  const ctl = document.querySelector('#ms-cap .ms-ctl');
  const siteItems = () => {
    const out = [];
    document.querySelectorAll('#site-menu-panel > li').forEach((li) => {
      const a = li.querySelector('a');
      if (!a) { out.push('-', { head: li.textContent.trim() }); return; }
      const sm = a.querySelector('small'), name = sm ? a.textContent.replace(sm.textContent, '').trim() : a.textContent.trim();
      out.push({ label: (sm ? sm.textContent.trim() + ':  ' : '') + name, chk: a.getAttribute('aria-current') === 'page', href: a.href });
    });
    return out.length ? out : [{ label: 'iori.me', href: 'https://iori.me/' }, { label: '3die.fr', href: 'https://3die.fr/' }];
  };
  menu(null, siteItems, ctl);
  siteIcon(ctl);

  // ---- tool windows (their dock buttons sit left of the hint text)
  const wins = {}, hint = h('span', 'hint'); $('ms-dock').append(hint);
  function win(wkey, wtitle, body, { x = 16, y = 70, w = 360, open = false, dock } = {}) {
    const el = h('div', 'ms'); el.dataset.key = wkey;
    el.innerHTML = `<div class="ms-in"><div class="ms-wcap"><div class="ms-capt">${wtitle}</div><button class="ms-min" aria-label="minimise"></button></div><div class="ms-body"></div></div>`;
    el.querySelector('.ms-body').append(body); document.body.append(el);
    const Lo = U.layout[wkey] || { x: x < 0 ? innerWidth + x - w : x, y }; el.style.left = Math.max(0, Math.min(innerWidth - 60, Lo.x)) + 'px'; el.style.top = Math.max(40, Lo.y) + 'px'; el.style.width = w + 'px';
    const capt = el.querySelector('.ms-capt'); let d = null;
    capt.addEventListener('pointerdown', (e) => { if (document.body.classList.contains('ms-phone')) return; d = { sx: e.clientX, sy: e.clientY, ox: el.offsetLeft, oy: el.offsetTop }; capt.setPointerCapture(e.pointerId); });
    capt.addEventListener('pointermove', (e) => { if (!d) return; el.style.left = d.ox + e.clientX - d.sx + 'px'; el.style.top = Math.max(40, d.oy + e.clientY - d.sy) + 'px'; });
    capt.addEventListener('pointerup', () => { if (!d) return; d = null; U.layout[wkey] = { ...(U.layout[wkey] || {}), x: el.offsetLeft, y: el.offsetTop }; save(); });
    el.addEventListener('pointerdown', () => focusWin(el));
    el.querySelector('.ms-min').addEventListener('click', () => toggleWin(wkey, false));
    // the corner grip resizes the window (width and height, remembered); double-click gives back the natural size
    const grip = h('div', 'ms-grip'); grip.title = 'drag to resize · double-click: natural size'; el.append(grip);
    const sized = (sw, sh) => { el.style.width = sw + 'px'; el.style.height = sh ? sh + 'px' : ''; el.classList.toggle('ms-sized', !!sh); };
    if (Lo.w) sized(Lo.w, Lo.h);
    let g = null;
    grip.addEventListener('pointerdown', (e) => { e.stopPropagation(); g = { sx: e.clientX, sy: e.clientY, w: el.offsetWidth, h: el.offsetHeight }; grip.setPointerCapture(e.pointerId); focusWin(el); });
    grip.addEventListener('pointermove', (e) => { if (!g) return; sized(Math.max(200, Math.min(innerWidth - el.offsetLeft - 4, g.w + e.clientX - g.sx)), Math.max(90, Math.min(innerHeight - el.offsetTop - 4, g.h + e.clientY - g.sy))); });
    grip.addEventListener('pointerup', () => { if (!g) return; g = null; U.layout[wkey] = { ...(U.layout[wkey] || { x: el.offsetLeft, y: el.offsetTop }), w: el.offsetWidth, h: el.offsetHeight }; save(); });
    grip.addEventListener('dblclick', () => { const L = U.layout[wkey]; if (L) { delete L.w; delete L.h; save(); } sized(w, 0); });
    const btn = h('button', 'ms-b', dock || wtitle.split(' ')[0]); btn.addEventListener('click', () => toggleWin(wkey)); $('ms-dock').insertBefore(btn, hint);
    wins[wkey] = { el, btn };
    if (U.open[wkey] ?? open) toggleWin(wkey, true);
    return el;
  }
  function focusWin(el) { for (const w of Object.values(wins)) { w.el.classList.remove('active'); w.el.style.zIndex = 100; } el.classList.add('active'); el.style.zIndex = 150; }
  function toggleWin(wkey, on) {
    const w = wins[wkey]; on = on ?? !w.el.classList.contains('open');
    if (on && document.body.classList.contains('ms-phone')) for (const k of Object.keys(wins)) if (k !== wkey && wins[k].el.classList.contains('open')) toggleWin(k, false);
    const was = w.el.classList.contains('open');
    w.el.classList.toggle('open', on); w.btn.classList.toggle('on', on); if (on) focusWin(w.el);
    U.open[wkey] = on; save();
    if (on && !was) w.el.dispatchEvent(new CustomEvent('ms-open'));        // a window can fill itself however it was opened
  }

  // ---- the stage: fit the image rect so the overlay canvas lines up with the picture
  let aspect = 16 / 9;
  function fit() {
    const st = $('ms-stage'), box = $('ms-fit'), W = st.clientWidth, H = st.clientHeight;
    let w = W, hh = W / aspect; if (hh > H) { hh = H; w = H * aspect; }
    Object.assign(box.style, { left: (W - w) / 2 + 'px', top: (H - hh) / 2 + 'px', width: w + 'px', height: hh + 'px' });
  }
  new ResizeObserver(fit).observe($('ms-stage'));

  return {
    U, save, menu, win, toggleWin, wins, status, hint,
    view: $('ms-view'), overlay: $('ms-overlay'), ov: $('ms-ov'), transport: $('ms-transport'),
    setPaneTitle: (s) => { $('ms-ptitle').textContent = s; },
    setAspect: (a) => { aspect = a; fit(); },
    onAction: (fn) => { onAction = fn; },
    fail(msg) { const f = h('div'); f.id = 'ms-fail'; f.textContent = msg; document.body.append(f); },
  };
}

/** A labelled control row bound to an object field. spec: [min, max, step, default] | [options, default] | [bool]. */
export function control(obj, key, spec, onChange, label = key) {
  const row = h('div', 'ms-row');
  const lab = h('span', '', label); row.append(lab);
  if (spec.length === 1 || typeof spec[0] === 'boolean') {
    const c = h('input'); c.type = 'checkbox'; c.checked = !!obj[key]; c.addEventListener('change', () => { obj[key] = c.checked; onChange(); });
    row.classList.add('ms-row-chk'); row.append(c); return row;
  }
  if (Array.isArray(spec[0])) {
    const s = h('select'); for (const o of spec[0]) s.append(new Option(String(o), String(o)));
    s.value = String(obj[key]); s.addEventListener('change', () => { obj[key] = typeof spec[0][0] === 'number' ? +s.value : s.value; onChange(); });
    row.classList.add('ms-row-sel'); row.append(s); return row;
  }
  const [min, max, step] = spec, r = h('input'), v = h('input');
  r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = obj[key];
  v.type = 'text'; v.value = obj[key]; v.className = 'ms-val';
  r.addEventListener('input', () => { obj[key] = +r.value; v.value = r.value; onChange(); });
  v.addEventListener('change', () => { const n = Number(v.value); if (Number.isFinite(n)) { obj[key] = n; r.value = n; onChange(); } else v.value = obj[key]; });
  r.addEventListener('dblclick', () => { obj[key] = spec[3]; r.value = spec[3]; v.value = spec[3]; onChange(); });
  row.append(r, v); return row;
}
