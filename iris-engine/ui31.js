// ui31.js — the Windows 3.11 Program Manager shell (study/09, phase U2). Loaded instead of ui.js's Win98 shell when
// the page is opened with ?ui=31 (remembered; ?ui=98 goes back). ui.js document.writes this script so it runs
// exactly where ui.js would — after fit.js (its handlers are bound by id) and before design.js (which fills the
// DESIGN pane built here). Like the old shell it MOVES the page's controls, it never rebuilds them, so every
// element id and every binding in index.html / fit.js / design.js keeps working (tools/ui-contract proves it).
// Shell state (layout, font, snapping) lives here and in localStorage 'irisW31' — never in the engine's `state`.
(() => {
    const E = window.__irisEngine; if (!E) return;
    const $ = id => document.getElementById(id);
    const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const tri = d => `<svg width="5" height="9"><path d="${d < 0 ? 'M5 0v9L0 4.5z' : 'M0 0v9L5 4.5z'}"/></svg>`;
    const DOWN = '<svg width="9" height="5"><path d="M0 0h9L4.5 5z"/></svg>', UP = '<svg width="9" height="5"><path d="M0 5h9L4.5 0z"/></svg>';
    let S = { layout: {}, font: 'urbanist', touch: 'auto', snapMode: 'pull', snapK: 22, hold: 1.0, ret: 3.5 };
    try { S = Object.assign(S, JSON.parse(localStorage.getItem('irisW31') || '{}')); } catch (e) {}
    const save = () => { try { for (const W of WINS) S.layout[W.key] = { open: !!W.open, x: W.tx, y: W.ty }; localStorage.setItem('irisW31', JSON.stringify(S)); } catch (e) {} };
    let phone = false, zTop = 100, active = null, flash = '', flashT = 0;
    const say = t => { flash = t; flashT = 2.5; };

    // ---------------------------------------------------------------------------------------------------------
    // icons: drawn on a 32 × 32 grid, quantised to the 16-colour VGA palette with a 4 × 4 Bayer dither. Our own.
    // ---------------------------------------------------------------------------------------------------------
    const VGA = [[0,0,0],[128,0,0],[0,128,0],[128,128,0],[0,0,128],[128,0,128],[0,128,128],[192,192,192],[128,128,128],[255,0,0],[0,255,0],[255,255,0],[0,0,255],[255,0,255],[0,255,255],[255,255,255]];
    const B4 = [0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
    function box(c, x, y, w, hh, col) { c.fillStyle = col; c.fillRect(x, y, w, hh); c.strokeRect(x + .5, y + .5, w - 1, hh - 1); }
    function disc(c, x, y, r, col, line = 1) { c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.fillStyle = col; c.fill(); if (line) c.stroke(); }
    const ICON = {
        eye(c) { c.beginPath(); c.moveTo(1.5, 16.5); c.quadraticCurveTo(16, 1, 30.5, 16.5); c.quadraticCurveTo(16, 32, 1.5, 16.5); c.fillStyle = '#fff'; c.fill(); c.stroke();
            const g = c.createRadialGradient(16, 16.5, 3, 16, 16.5, 8); g.addColorStop(0, '#0ff'); g.addColorStop(1, '#008080'); disc(c, 16, 16.5, 7.5, g); disc(c, 16, 16.5, 3, '#000', 0); c.fillStyle = '#fff'; c.fillRect(18, 12, 2, 2); },
        camera(c) { box(c, 11, 5, 10, 5, '#808080'); box(c, 2, 9, 28, 18, '#c0c0c0'); c.fillStyle = '#fff'; c.fillRect(3, 10, 26, 1); c.fillRect(3, 10, 1, 16); c.fillStyle = '#808080'; c.fillRect(3, 25, 26, 1); c.fillRect(28, 10, 1, 16);
            const g = c.createRadialGradient(14, 16, 1, 16, 18, 7); g.addColorStop(0, '#0ff'); g.addColorStop(.5, '#00f'); g.addColorStop(1, '#000080'); disc(c, 16, 18, 6.5, g); box(c, 4, 12, 5, 3, '#ff0'); c.fillStyle = '#f00'; c.fillRect(25, 12, 2, 2); },
        material(c) { c.beginPath(); c.ellipse(16, 16.5, 14, 11, -0.2, 0, 6.2832); const g = c.createLinearGradient(4, 6, 28, 28); g.addColorStop(0, '#fff'); g.addColorStop(1, '#c0c0c0'); c.fillStyle = g; c.fill(); c.stroke();
            disc(c, 23, 21, 2.6, '#808080'); [[8, 15, '#f00'], [12, 10, '#ff0'], [18, 8, '#0f0'], [24, 11, '#00f'], [9, 21, '#f0f'], [15, 24, '#808000']].forEach(([x, y, col]) => disc(c, x, y, 2.4, col, 0)); },
        relief(c) { box(c, 2, 26, 28, 4, '#008000'); c.beginPath(); c.moveTo(2.5, 26.5); c.lineTo(11.5, 7.5); c.lineTo(16.5, 17.5); c.lineTo(21.5, 11.5); c.lineTo(29.5, 26.5); c.closePath(); const g = c.createLinearGradient(4, 0, 28, 0); g.addColorStop(0, '#fff'); g.addColorStop(.45, '#c0c0c0'); g.addColorStop(1, '#404040'); c.fillStyle = g; c.fill(); c.stroke();
            c.beginPath(); c.moveTo(11.5, 7.5); c.lineTo(9, 14); c.lineTo(11.5, 12.5); c.lineTo(13, 15); c.lineTo(14.5, 13.5); c.closePath(); c.fillStyle = '#fff'; c.fill(); },
        flow(c) { for (const [y, col] of [[8, '#00f'], [16, '#008080'], [24, '#00f']]) { c.beginPath(); for (let x = 2; x <= 26; x++) { const yy = y + Math.sin(x * 0.55) * 2.6; x === 2 ? c.moveTo(x, yy) : c.lineTo(x, yy); } c.lineWidth = 4; c.strokeStyle = '#000'; c.stroke(); c.lineWidth = 2; c.strokeStyle = col; c.stroke(); c.lineWidth = 1; c.strokeStyle = '#000';
                const ye = y + Math.sin(26 * 0.55) * 2.6; c.beginPath(); c.moveTo(25, ye - 4); c.lineTo(31, ye); c.lineTo(25, ye + 4); c.closePath(); c.fillStyle = col; c.fill(); c.stroke(); } },
        fit(c) { disc(c, 16, 16, 13.5, '#fff'); disc(c, 16, 16, 9.5, '#f00'); disc(c, 16, 16, 5.5, '#fff'); disc(c, 16, 16, 2, '#f00'); c.beginPath(); c.moveTo(16, 0); c.lineTo(16, 9); c.moveTo(16, 23); c.lineTo(16, 32); c.moveTo(0, 16); c.lineTo(9, 16); c.moveTo(23, 16); c.lineTo(32, 16); c.stroke(); },
        photo(c) { box(c, 2, 4, 28, 24, '#fff'); c.fillStyle = '#000'; c.fillRect(4, 6, 24, 20); disc(c, 16, 16, 7.5, '#808000', 0); disc(c, 16, 16, 2.8, '#000', 0);
            c.strokeStyle = '#ff0'; c.beginPath(); c.arc(16, 16, 8.5, 0, 6.2832); c.stroke(); c.strokeStyle = '#0ff'; c.beginPath(); c.arc(16, 16, 3.5, 0, 6.2832); c.moveTo(16, 11); c.lineTo(16, 21); c.moveTo(11, 16); c.lineTo(21, 16); c.stroke(); c.strokeStyle = '#000'; },
        design(c) { c.save(); c.translate(16, 16); c.rotate(Math.PI / 4); box(c, -4, -15, 7, 5, '#f00'); box(c, -4, -10, 7, 3, '#c0c0c0'); box(c, -4, -7, 7, 14, '#ff0'); c.fillStyle = '#808000'; c.fillRect(0, -6, 2, 13);
            c.beginPath(); c.moveTo(-3.5, 7.5); c.lineTo(3.5, 7.5); c.lineTo(0, 15); c.closePath(); c.fillStyle = '#fff'; c.fill(); c.stroke(); c.beginPath(); c.moveTo(-1.5, 12); c.lineTo(1.5, 12); c.lineTo(0, 15); c.closePath(); c.fillStyle = '#000'; c.fill(); c.restore(); },
        control(c) { box(c, 2, 5, 28, 22, '#c0c0c0'); c.fillStyle = '#fff'; c.fillRect(3, 6, 26, 1); c.fillRect(3, 6, 1, 20); for (const [y, x, col] of [[10, 9, '#f00'], [16, 19, '#00f'], [22, 13, '#008000']]) { c.fillStyle = '#000'; c.fillRect(6, y, 20, 2); box(c, x, y - 3, 5, 8, col); } },
    };
    function icon(name) {
        const cv = document.createElement('canvas'); cv.width = cv.height = 32; const c = cv.getContext('2d'); c.lineWidth = 1; c.strokeStyle = '#000'; ICON[name](c);
        quantise(c, 32); return cv.toDataURL();
    }
    function quantise(c, n) { const im = c.getImageData(0, 0, n, n), d = im.data;
        for (let i = 0; i < n * n; i++) { const o = i * 4; if (d[o + 3] < 128) { d[o + 3] = 0; continue; } const t = (B4[(Math.floor(i / n) & 3) * 4 + ((i % n) & 3)] / 16 - 0.47) * 56; let best = 0, bd = 1e9;
            for (let k = 0; k < 16; k++) { const p = VGA[k], e = (d[o] + t - p[0]) ** 2 + (d[o + 1] + t - p[1]) ** 2 + (d[o + 2] + t - p[2]) ** 2; if (e < bd) { bd = e; best = k; } }
            d[o] = VGA[best][0]; d[o + 1] = VGA[best][1]; d[o + 2] = VGA[best][2]; d[o + 3] = 255; }
        c.putImageData(im, 0, 0); }
    // The site burger lives in the frame: the application's control-menu box shows the site favicon (the three
    // 3die triangles) as a 16-colour bitmap at exactly the box's pixel size, and opens the site's links as a menu.
    // The links are read from the generated #site-menu markup, so `site.py menu` stays the single source.
    let siteImg = null;
    function siteIcon() { const b = $('w31-ctl'); if (!b) return; const px = Math.max(8, b.clientHeight || 18);
        const paint = () => { const a = document.createElement('canvas'); a.width = a.height = 64; const ac = a.getContext('2d'); ac.imageSmoothingQuality = 'high'; ac.drawImage(siteImg, 0, 0, 64, 64);
            const cv = document.createElement('canvas'); cv.width = cv.height = px; const c = cv.getContext('2d'); c.imageSmoothingQuality = 'high'; c.drawImage(a, 0, 0, px, px);
            { const im = c.getImageData(0, 0, px, px), d = im.data;   // the logo's muted colours and hatched ground fall between VGA entries: push saturation, crush the ground to black
                for (let o = 0; o < d.length; o += 4) { const l = 0.3 * d[o] + 0.59 * d[o + 1] + 0.11 * d[o + 2], sat = Math.max(d[o], d[o + 1], d[o + 2]) - Math.min(d[o], d[o + 1], d[o + 2]);
                    if (sat < 38) { if (l < 88) d[o] = d[o + 1] = d[o + 2] = 0; else { d[o] = 40; d[o + 1] = 170; d[o + 2] = 140; } }   /* the large triangle is a grey-green: give it the palette's teal */ else for (let k = 0; k < 3; k++) d[o + k] = Math.max(0, Math.min(255, l + (d[o + k] - l) * 2.6 + 18)); }
                c.putImageData(im, 0, 0); }
            quantise(c, px); b.style.backgroundImage = `url(${cv.toDataURL()})`; b.classList.add('w31-site'); };
        if (siteImg) return paint(); const im = new Image(); im.onload = () => { siteImg = im; paint(); }; im.src = '../icon/ios/180.png'; }
    function siteItems() { const out = []; document.querySelectorAll('#site-menu-panel > li').forEach(li => { const a = li.querySelector('a'); if (!a) { out.push('-', { text: li.textContent.trim(), dis: 1 }); return; }
            const sm = a.querySelector('small'), name = sm ? a.textContent.replace(sm.textContent, '').trim() : a.textContent.trim(); out.push({ text: (sm ? sm.textContent.trim() + ':  ' : '') + name, chk: () => a.getAttribute('aria-current') === 'page', run: () => { location.href = a.href; } }); }); return out; }
    const GLYPH = {   // 16 px monochrome tool-box glyphs
        paint: '<path d="M2 14c0-3 2-3 3-5l6-6 2 2-6 6c-2 1-2 3-5 3z" fill="none" stroke="#000"/>', add: '<path d="M8 3v10M3 8h10" stroke="#000" stroke-width="2"/>', sub: '<path d="M3 8h10" stroke="#000" stroke-width="2"/>',
        smooth: '<path d="M8 2c3 4 5 6 5 8a5 5 0 0 1-10 0c0-2 2-4 5-8z" fill="none" stroke="#000"/>', smear: '<path d="M6 14V7a2 2 0 0 1 4 0v3l3-1v3l-3 2z" fill="none" stroke="#000"/>',
        dent: '<path d="M2 6c0 6 12 6 12 0" fill="none" stroke="#000"/><path d="M2 6h12" stroke="#000" stroke-dasharray="1 2"/>', bump: '<path d="M2 10c0-6 12-6 12 0" fill="none" stroke="#000"/><path d="M2 10h12" stroke="#000" stroke-dasharray="1 2"/>',
        streak: '<path d="M3 13L13 3" stroke="#000" stroke-width="2"/>', color: '<path d="M8 2c2 3 4 5 4 8a4 4 0 0 1-8 0c0-3 2-5 4-8z" fill="#000"/>', pick: '<path d="M12 2l2 2-3 3-1-1-5 5-2 1 1-2 5-5-1-1z" fill="none" stroke="#000"/>',
    };

    // ---------------------------------------------------------------------------------------------------------
    // scrubber around a real <input type=range>: drag the ruler (one ruler width = the whole range), end arrows
    // step, double-click = the ORIGIN, tap the number to type. The input stays in the DOM, hidden.
    // The origin is the last value the ENGINE wrote (spec §32 K1: knobs offset the fit, the tick sits at the fit):
    // a preset, an imported ID, a new seed, the end of a fit all write sliders without an input event, and every such
    // write becomes the new origin; only the hand's own moves are offsets from it. sync() notices those writes (the
    // ruler used to stay stale until touched), so no engine code has to call the shell.
    // ---------------------------------------------------------------------------------------------------------
    const scrubs = [];
    function scrubber(input, label, valEl) {
        const row = h('div', 'w31-scrub', `<span>${label}</span><span class="w31-sbar"><button class="w31-sa" data-d="-1" tabindex="-1">${tri(-1)}</button><span class="w31-sr"><canvas></canvas><i></i></span><button class="w31-sa" data-d="1" tabindex="-1">${tri(1)}</button></span>`);
        const val = valEl || h('span'); val.classList.add('w31-sv'); row.appendChild(val);
        const ruler = row.querySelector('.w31-sr'), cv = row.querySelector('canvas');
        const min = parseFloat(input.min), max = parseFloat(input.max), step = parseFloat(input.step) || (max - min) / 200; let origin = parseFloat(input.value), seen = input.value;
        const ppu = () => (ruler.clientWidth || 150) / Math.max(1e-9, max - min), get = () => parseFloat(input.value);
        const set = x => { input.value = clamp(Math.round(x / step) * step, min, max); seen = input.value; input.dispatchEvent(new Event('input', { bubbles: true })); draw(); };
        const sync = () => { if (input.value === seen) return; seen = input.value; origin = parseFloat(seen); draw(); };   // written by the engine, not by this scrubber → the new origin
        function draw() { const w = ruler.clientWidth, hh = ruler.clientHeight, dpr = window.devicePixelRatio || 1; if (!w || !hh) return;   // hidden window: nothing to draw
            if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(hh * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(hh * dpr); cv.style.width = w + 'px'; cv.style.height = hh + 'px'; }
            const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, hh); const v = get(), p = ppu(), tick = (max - min) / 40; if (!(p > 0) || !isFinite(p) || !isFinite(v)) return;
            const x0 = w / 2 + (origin - v) * p; c.fillStyle = 'rgba(0,0,128,.2)'; c.fillRect(Math.min(x0, w / 2), 0, Math.abs(x0 - w / 2), hh);
            const k0 = Math.ceil((Math.max(min, v - w / 2 / p) - min) / tick - 1e-9), k1 = Math.floor((Math.min(max, v + w / 2 / p) - min) / tick + 1e-9);
            for (let k = k0; k <= k1; k++) { const x = Math.round(w / 2 + (min + k * tick - v) * p); c.fillStyle = k % 5 === 0 ? '#000' : '#808080'; c.fillRect(x, k % 5 === 0 ? 3 : hh * 0.5, 1, hh); }
            if (x0 > -3 && x0 < w + 3) { const xo = Math.round(x0); c.fillStyle = '#000080'; c.beginPath(); c.moveTo(xo - 3, 0); c.lineTo(xo + 4, 0); c.lineTo(xo + 0.5, 4); c.closePath(); c.fill(); c.fillRect(xo, 0, 1, hh); } }   // the origin: a navy notch and line
        let drag = null;
        ruler.addEventListener('pointerdown', e => { sync(); drag = { x: e.clientX, v: get() }; try { ruler.setPointerCapture(e.pointerId); } catch (err) {} e.preventDefault(); });
        ruler.addEventListener('pointermove', e => { if (drag) set(drag.v - (e.clientX - drag.x) / ppu()); });
        ruler.addEventListener('pointerup', () => drag = null); ruler.addEventListener('pointercancel', () => drag = null);
        ruler.addEventListener('dblclick', () => { sync(); set(origin); });
        ruler.addEventListener('wheel', e => { sync(); set(get() + (e.deltaY > 0 ? -2 : 2) * step); e.preventDefault(); }, { passive: false });
        row.querySelectorAll('.w31-sa').forEach(b => { let t = null; const go = () => set(get() + step * +b.dataset.d), stop = () => { clearTimeout(t); clearInterval(t); };
            b.addEventListener('pointerdown', e => { e.preventDefault(); sync(); go(); t = setTimeout(() => { t = setInterval(go, 40); }, 350); }); for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, stop); });
        val.addEventListener('click', () => { if (row.querySelector('.w31-type')) return; sync(); const inp = h('input', 'w31-type'); inp.value = +get().toFixed(4); row.appendChild(inp); inp.focus(); inp.select();   // an overlay: the page rewrites the value span every frame
            const done = ok => { const x = parseFloat(inp.value); inp.remove(); if (ok && isFinite(x)) set(x); }; inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); }); inp.addEventListener('blur', () => done(true)); });
        input.addEventListener('input', draw); input.style.display = 'none'; row.appendChild(input);
        row._draw = draw; row._sync = sync; Object.defineProperty(row, 'origin', { get: () => origin }); if (input.id) row.dataset.for = input.id; scrubs.push(row); return row;
    }
    function scrubberFor(id) { const input = $('param-' + id); if (!input) return null; const old = input.closest('.slider-row'), label = old ? old.querySelector('.lbl').textContent : id.toUpperCase(), val = old ? old.querySelector('.val') : null;
        const row = scrubber(input, label, val); if (old) { if (old.title) row.title = old.title; old.remove(); } return row; }
    const drawScrubs = () => scrubs.forEach(r => r._draw()), syncScrubs = () => { for (const r of scrubs) r._sync(); };
    const btnRow = ids => { const row = h('div', 'w31-brow'); ids.forEach(id => { const b = typeof id === 'string' ? $(id) : id; if (b) { b.classList.add('w31-b'); b.removeAttribute('style'); row.appendChild(b); } }); return row; };

    // ---------------------------------------------------------------------------------------------------------
    // windows
    // ---------------------------------------------------------------------------------------------------------
    const WINS = [
        { key: 'camera', title: 'Camera', sliders: ['pupil', 'elev', 'light', 'srcsize', 'ambient', 'lid', 'ev', 'fstop', 'focus', 'kelvin', 'grain', 'bloom'], src: true, buttons: ['debug-btn', 'refr-btn', 'spec-btn'], buttons2: ['anim2-btn', 'tone-btn', 'ref-btn'] },
        { key: 'material', title: 'Material', sliders: ['pigment', 'stroma', 'pheo', 'yellow', 'mie', 'ring'] },
        { key: 'relief', title: 'Relief', sliders: ['crypt', 'furrow', 'relief', 'collr'] },
        { key: 'flow', title: 'Flow', sliders: ['warp', 'seed'], buttons: ['seed-btn', 'fieldw-btn', 'strand-btn'], buttons2: ['atlas-btn', 'maps-btn'] },
        { key: 'fit', title: 'Fit', width: 340 },   // the photo itself lies on the iris (overlay.js); this is the palette
        { key: 'design', title: 'Design', pane: 'DESIGN' },
        { key: 'control', title: 'Control Panel' },
    ];
    const byKey = k => WINS.find(W => W.key === k);
    function makeWin(W) {
        const el = h('div', 'w31', `<div class="w31-in"><div class="w31-cap"><button class="w31-ctl" aria-label="Control menu"></button><span class="w31-capt">${W.title}</span><button class="w31-capb" aria-label="Minimize">${DOWN}</button></div><div class="w31-body"></div></div>`);
        el.dataset.key = W.key; el.dataset.ui = '1'; W.el = el; W.body = el.querySelector('.w31-body'); W.ico = icon(W.key);
        (W.sliders || []).forEach(id => { const r = scrubberFor(id); if (r) W.body.appendChild(r); });
        if (W.src) { const g = h('div', 'w31-grp', '<b>Source</b>'); g.appendChild(btnRow([...document.querySelectorAll('.src-btn')])); W.body.appendChild(g); }
        if (W.buttons) W.body.appendChild(btnRow(W.buttons)); if (W.buttons2) W.body.appendChild(btnRow(W.buttons2));
        if (W.pane) { const p = h('div', 'tab-pane active'); p.dataset.tab = W.pane; W.body.appendChild(p); }   // design.js fills it when it loads
        document.body.appendChild(el);
        el.addEventListener('pointerdown', () => activate(W), true);
        el.querySelector('.w31-capb').onclick = () => show(W, false);
        const ctl = el.querySelector('.w31-ctl'); ctl.ondblclick = () => show(W, false);
        ctl.onclick = () => { const r = ctl.getBoundingClientRect(); showMenu([{ l: '&Restore', dis: 1 }, { l: '&Move', dis: 1 }, { l: 'Mi&nimize', run: () => show(W, false) }, '-', { l: '&Close', run: () => show(W, false) }, '-', { l: 'Ne&xt window', run: nextWin }], r.left, r.bottom, 0); };
        const cap = el.querySelector('.w31-capt'); let drag = null;
        cap.addEventListener('pointerdown', e => { if (phone) return; drag = { x: e.clientX - W.x, y: e.clientY - W.y }; W.drag = { rx: W.x, ry: W.y, ox: 0, oy: 0 }; try { cap.setPointerCapture(e.pointerId); } catch (err) {} });
        cap.addEventListener('pointermove', e => { if (!drag || !W.drag) return; const [mx, my] = bounds(el); W.drag.rx = clamp(e.clientX - drag.x, 0, mx); W.drag.ry = clamp(e.clientY - drag.y, top0(), my); });
        const drop = () => { if (W.drag) { const [sx, sy] = snap(W, W.drag.rx, W.drag.ry); W.drag = null; place(W, sx, sy, true); } drag = null; save(); };
        cap.addEventListener('pointerup', drop); cap.addEventListener('pointercancel', drop);
        const L = S.layout[W.key]; if (L) { W.wantOpen = !!L.open; if (typeof L.x === 'number') { W.tx = L.x; W.ty = L.y; } }
    }
    // Windows live between the menu bar and the shortcut row, fully inside the viewport (study/09 §10).
    const DOCK = 62, SNAP = 8, cssN = () => parseFloat(getComputedStyle(document.body).getPropertyValue('--n')) || 23;
    const top0 = () => { const m = $('w31-menubar'), c = $('w31-cap'); return Math.round((phone ? c : m).getBoundingClientRect().bottom) + 1; };
    const bounds = el => [Math.max(0, innerWidth - el.offsetWidth), Math.max(top0(), innerHeight - DOCK - el.offsetHeight)];
    const put = W => { W.el.style.left = Math.round(W.x) + 'px'; W.el.style.top = Math.round(W.y) + 'px'; };
    function place(W, x, y, glide) { const [mx, my] = bounds(W.el); W.tx = clamp(x, 0, mx); W.ty = clamp(y, top0(), my); if (!glide || W.x === undefined) { W.x = W.tx; W.y = W.ty; } put(W); }
    function spawnPos(W) { const [mx, my] = bounds(W.el), n = cssN(); let x = W.tx === undefined ? mx - 6 : W.tx, y = W.ty === undefined ? top0() + 6 : W.ty;   // a window that would open on another steps one cascade unit left and down
        for (let i = 0; i < 60; i++) { if (!WINS.some(O => O !== W && O.open && O.tx !== undefined && Math.abs(O.tx - x) < n && Math.abs(O.ty - y) < n)) break; x -= n; y += n; if (y > my) y = top0() + 6; if (x < 0) x = mx - 6; }
        return [x, y]; }
    function snap(W, x, y) { const el = W.el, w = el.offsetWidth, hh = el.offsetHeight, xs = [0, innerWidth - w], ys = [top0(), innerHeight - DOCK - hh];
        for (const O of WINS) if (O !== W && O.open) { const o = O.el, l = o.offsetLeft, t = o.offsetTop, r = l + o.offsetWidth, b = t + o.offsetHeight; xs.push(l - w + 1, r - 1, l, r - w); ys.push(t - hh + 1, b - 1, t, b - hh); }
        for (const c of xs) if (Math.abs(x - c) < SNAP) { x = c; break; } for (const c of ys) if (Math.abs(y - c) < SNAP) { y = c; break; } return [x, y]; }
    function stepWins(dt) { if (phone) return; for (const W of WINS) { if (!W.open || W.tx === undefined) continue;
            if (W.drag) { const d = W.drag, [sx, sy] = snap(W, d.rx, d.ry);
                if (S.snapMode === 'hard') { W.x = sx; W.y = sy; }
                else if (S.snapMode === 'pull') { const a = 1 - Math.exp(-dt * S.snapK); d.ox += (sx - d.rx - d.ox) * a; d.oy += (sy - d.ry - d.oy) * a; W.x = d.rx + d.ox; W.y = d.ry + d.oy; }   // the drag stays 1:1, only the magnet eases
                else { const a = 1 - Math.exp(-dt * S.snapK * 1.3); W.x += (sx - W.x) * a; W.y += (sy - W.y) * a; }
                W.tx = sx; W.ty = sy; put(W); }
            else if (Math.abs(W.tx - W.x) > 0.4 || Math.abs(W.ty - W.y) > 0.4) { const a = 1 - Math.exp(-dt * 16); W.x += (W.tx - W.x) * a; W.y += (W.ty - W.y) * a; put(W); }
            else if (W.x !== W.tx || W.y !== W.ty) { W.x = W.tx; W.y = W.ty; put(W); } } }
    function activate(W) { if (active && active !== W) active.el.classList.remove('active'); active = W; W.el.classList.add('active'); W.el.style.zIndex = ++zTop; }
    function show(W, on, quiet) {
        if (on && phone) WINS.forEach(O => { if (O !== W && O.open) show(O, false, true); });
        W.open = on; W.el.classList.toggle('open', on);
        if (on) { activate(W); if (W.width && !phone) W.el.style.width = Math.min(W.width, innerWidth - 12) + 'px'; if (!phone) place(W, ...spawnPos(W)); W.el.querySelectorAll('.w31-scrub').forEach(r => r._draw()); }
        else if (active === W) { W.el.classList.remove('active'); active = null; const n = WINS.filter(O => O.open).sort((a, b) => b.el.style.zIndex - a.el.style.zIndex)[0]; if (n) activate(n); }
        if (!quiet) { icons(); layoutScene(); save(); }
    }
    const nextWin = () => { const o = WINS.filter(W => W.open); if (o.length) activate(o[(o.indexOf(active) + 1) % o.length]); };
    function icons() { const box = $('w31-icons'); box.innerHTML = '';
        for (const W of WINS) { const b = h('button', 'w31-dicon' + (W.open ? ' on' : ''), `<img src="${W.ico}" alt=""><span>${W.title.replace(' Panel', '')}</span>`); b.title = W.title;
            b.onclick = () => { if (!W.open) show(W, true); else if (!phone && active !== W) activate(W); else show(W, false); }; box.appendChild(b); } }   // closed → open · open behind → front · front → minimise
    function tile() { let x = innerWidth - 6, y = top0() + 6, colW = 0; for (const W of WINS.filter(W => W.open)) { const el = W.el; if (y + el.offsetHeight > innerHeight - DOCK && y > top0() + 6) { x -= colW + 6; y = top0() + 6; colW = 0; } place(W, x - el.offsetWidth, y, true); y += el.offsetHeight + 6; colW = Math.max(colW, el.offsetWidth); } save(); }
    function cascade() { const n = cssN(); WINS.filter(W => W.open).forEach((W, i) => { place(W, 6 + i * n, top0() + 6 + i * n, true); activate(W); }); save(); }

    // ---------------------------------------------------------------------------------------------------------
    // menus
    // ---------------------------------------------------------------------------------------------------------
    const lab = l => l.replace(/&(.)/, '<u>$1</u>'); let menus = [];
    function closeMenus(from = 0, keepTop) { while (menus.length > from) menus.pop().remove(); if (!from && !keepTop) document.querySelectorAll('.w31-mtop.open').forEach(e => e.classList.remove('open')); }
    async function showMenu(items, x, y, level) {
        closeMenus(level, true); if (typeof items === 'function') items = await items();
        const m = h('div', 'w31-menu'); m.dataset.ui = '1';
        for (const it of items) { if (it === '-') { m.appendChild(h('div', 'w31-sep')); continue; }
            const d = h('div', 'w31-mi' + (it.dis ? ' dis' : '') + (it.sub ? ' sub' : '') + (it.chk && it.chk() ? ' chk' : ''), it.text !== undefined ? '' : lab(typeof it.l === 'function' ? it.l() : it.l)); if (it.text !== undefined) d.textContent = it.text;
            const openSub = () => { const r = d.getBoundingClientRect(); m.querySelectorAll('.hot').forEach(e => e.classList.remove('hot')); d.classList.add('hot'); showMenu(it.sub, phone ? r.left + 24 : r.right - 2, phone ? r.bottom : r.top - 1, level + 1); };
            d.addEventListener('click', e => { e.stopPropagation(); if (it.dis) return; if (it.sub) return openSub(); closeMenus(); if (it.run) it.run(); });
            d.addEventListener('pointerenter', e => { if (e.pointerType !== 'mouse') return; if (it.sub && !it.dis) openSub(); else { closeMenus(level + 1, true); m.querySelectorAll('.hot').forEach(e => e.classList.remove('hot')); } });
            m.appendChild(d); }
        document.body.appendChild(m); menus.push(m);
        const r = m.getBoundingClientRect(); m.style.left = clamp(x, 0, Math.max(0, innerWidth - r.width)) + 'px'; m.style.top = clamp(y, 0, Math.max(0, innerHeight - r.height)) + 'px';
    }
    document.addEventListener('pointerdown', e => { if (!e.target.closest('.w31-menu, .w31-mtop, .w31-ctl')) closeMenus(); }, true);
    const click = id => Object.assign(() => { const el = $(id); if (el) el.click(); }, { ctl: id }), isOn = id => () => { const el = $(id); return !!el && el.classList.contains('active'); };
    const tog = (l, id) => ({ l, chk: isOn(id), run: click(id) });
    const FITTED = [['09-blue-green-isolated.jpg', 'Blue-green  ·  09'], ['25-green-amber-ring-isolated.jpg', 'Green, amber ring  ·  25'], ['26-green-crypts-isolated.jpg', 'Green, crypts  ·  26'], ['35-grey-green-isolated.jpg', 'Grey-green  ·  35']];
    const MENUS = [
        ['&File', () => [{ l: '&Open ID…', run: click('idin-btn') }, { l: '&Save ID', run: click('idout-btn') }, '-', { l: 'Capture &4K', run: click('shot-btn') }, '-', { l: '&META IRIS', run: () => { location.href = '../meta-iris.html'; } }]],
        ['&View', () => [{ l: '&Quality', ctl: 'quality-sel', sub: [...$('quality-sel').options].map(o => ({ l: o.textContent, chk: () => E.quality === o.value, run: () => { const s = $('quality-sel'); s.value = o.value; s.dispatchEvent(new Event('change')); } })) },
            { l: '&Camera follows the pointer', ctl: 'cam-btn', chk: () => !E.state.useRot, run: () => E.setCamFixed(!E.state.useRot) }, '-', tog('&Grid', 'debug-btn'), tog('&Refraction', 'refr-btn'), tog('Corneal re&flection', 'spec-btn'), tog('F&ilmic', 'tone-btn'), tog('R&EF pose', 'ref-btn'), tog('&Hippus', 'anim2-btn'), '-',
            tog('&Atlas', 'atlas-btn'), tog('&Maps', 'maps-btn'), { l: () => 'Strands: ' + ($('strand-btn') ? $('strand-btn').textContent : ''), run: click('strand-btn') }, '-', { l: 'Control &Panel…', run: () => show(byKey('control'), true) }]],
        ['&Eye', () => [{ l: '&Presets', sub: FITTED.map(([f, l]) => ({ l, run: () => E.loadFittedPreset(f) })) }, { l: 'P&rocedural', sub: Object.keys(E.EYE_PRESETS || {}).map(k => ({ l: k, run: () => window.loadEyePreset(k) })) },
            { l: '&Fitted', sub: async () => { let cases = {}; try { cases = await fetch('ref/cases.json').then(r => r.ok ? r.json() : {}); } catch (e) {}
                const its = Object.entries(cases).map(([file, c]) => ({ file, m: c.scores ? c.scores.match : 0, m2: c.scores && c.scores.match2, h: c.scores && c.scores.hcorr, tag: c.tag })).sort((a, b) => b.m - a.m); return its.length ? its.map(it => ({ text: `${it.file.replace('.jpg', '')}  —  ${it.m.toFixed(0)} %${it.m2 !== undefined ? ' · M2 ' + it.m2.toFixed(0) : ''}${it.h !== undefined && it.h !== null ? ' · h ' + it.h.toFixed(2) : ''}  (${it.tag})`, run: () => E.loadFittedPreset(it.file) })) : [{ l: '(no cases)', dis: 1 }]; } }, '-', { l: '&New seed', run: click('seed-btn') }]],
        ['Fi&t', () => [{ l: '&Photo…', run: () => { show(byKey('fit'), true); $('fit-load').click(); } }, { l: '&Reference', sub: () => [...$('fit-ref').options].filter(o => o.value).map(o => ({ text: o.textContent, run: () => { show(byKey('fit'), true); const r = $('fit-ref'); r.value = o.value; r.dispatchEvent(new Event('change', { bubbles: true })); } })) }, { l: '&Close photo', run: click('fit-close') }, '-', { l: '★ Fit &HQ', run: () => { show(byKey('fit'), true); $('fit-hq').click(); } }, { l: '&Auto align', run: click('fit-auto') }, { l: '&Solve pose', run: click('fit-solve') }, { l: 'Fit &global', run: click('fit-global') }, { l: 'S&top', run: click('fit-stop') }, '-', { l: '&Overlay on the iris', sub: () => { const ov = window.__irisOverlay; return ov ? ov.MODES.map(m => ({ l: m[0].toUpperCase() + m.slice(1), chk: () => ov.mode === m, run: () => ov.set(m) })) : [{ l: '(loading)', dis: 1 }]; } }, '-', { l: '&Diagnostics', run: click('fit-diag') }, { l: '&Casebook', run: click('fit-casebook') }]],
        ['&Window', () => [{ l: '&Cascade', run: cascade, dis: phone }, { l: '&Tile', run: tile, dis: phone }, '-', ...WINS.map((W, i) => ({ l: `&${i + 1} ${W.title}`, chk: () => W.open, run: () => show(W, true) }))]],
        ['&Help', () => [{ l: '&About Iris Engine…', run: () => $('w31-veil').classList.add('on') }]],
    ];
    function buildChrome() {
        const cap = h('div', '', `<button class="w31-ctl" id="w31-ctl" aria-label="Site menu" title="iori.me · site menu"></button><span class="w31-capt">Iris Engine</span><button class="w31-capb" tabindex="-1" aria-label="Minimize">${DOWN}</button><button class="w31-capb" tabindex="-1" aria-label="Maximize">${UP}</button>`); cap.id = 'w31-cap'; cap.dataset.ui = '1'; document.body.appendChild(cap);
        const bar = h('div'); bar.id = 'w31-menubar'; bar.dataset.ui = '1'; document.body.appendChild(bar);
        for (const [l, items] of MENUS) { const t = h('div', 'w31-mtop', lab(l)); const open = () => { const r = t.getBoundingClientRect(); closeMenus(); t.classList.add('open'); showMenu(items, r.left, r.bottom, 0); };
            t.addEventListener('click', () => t.classList.contains('open') ? closeMenus() : open()); t.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse' && menus.length && !t.classList.contains('open')) open(); }); bar.appendChild(t); }
        const st = h('span'); st.id = 'w31-status'; bar.appendChild(st);
        $('w31-ctl').onclick = () => { const r = $('w31-ctl').getBoundingClientRect(); showMenu([...(phone ? MENUS.map(([l, items]) => ({ l, sub: items })).concat(['-']) : []), ...siteItems(), '-', { l: '&Windows 98 shell', run: () => { location.search = '?ui=98'; } }], r.left, r.bottom, 0); };
        const ic = h('div'); ic.id = 'w31-icons'; ic.dataset.ui = '1'; document.body.appendChild(ic);
        const veil = h('div', '', `<div class="w31 active" id="w31-about"><div class="w31-in"><div class="w31-cap"><button class="w31-ctl" data-close></button><span class="w31-capt">About Iris Engine</span></div><div class="w31-body"><img width="32" height="32" style="image-rendering:pixelated" alt="" src="${icon('eye')}"><div><b>Iris Engine</b> ${E.ENGINE_VERSION || ''}<br>A photoreal, fully procedural human iris.<br>Shell drawn in the Windows 3.11 idiom — own icons, nothing copied.<br>Reference photographs: see ref/ATTRIBUTION.md.</div><span></span><div style="text-align:right"><button class="w31-b def" data-close style="min-width:70px">OK</button></div></div></div></div>`);
        veil.id = 'w31-veil'; veil.dataset.ui = '1'; document.body.appendChild(veil); veil.addEventListener('click', e => { if (e.target.closest('[data-close]') || e.target === veil) veil.classList.remove('on'); });
        const hold = h('div'); hold.id = 'w31-holder'; hold.style.display = 'none'; document.body.appendChild(hold);   // controls that now live in the menus keep their place in the DOM
        for (const id of ['quality-sel', 'idout-btn', 'idin-btn', 'shot-btn', 'cam-btn', 'fit-open']) { const el = $(id); if (el) hold.appendChild(el); }
        for (const id of ['fit-blank1', 'fit-blank2']) { const el = $(id); if (el) el.remove(); }
        const strip = h('div'); strip.id = 'tab-strip'; strip.style.display = 'none'; document.body.appendChild(strip);   // tells design.js the layout is ours
        const bar2 = $('accum-bar'); if (bar2) document.body.appendChild(bar2);
    }

    // ---------------------------------------------------------------------------------------------------------
    // fonts (a user setting; Urbanist is iori's default) and the Control Panel
    // ---------------------------------------------------------------------------------------------------------
    const FONTS = [   // [key, label, family, Google Fonts spec | null = installed or self-hosted (Urbanist: ui.css + fonts/), weight of the bold role, smoothed, px]
        ['3.11 idiom', [['system', 'System stack, aliased', 'Arial, Helvetica, sans-serif', null, 700, false, 12], ['pixelify', 'Pixelify Sans', '"Pixelify Sans"', 'Pixelify+Sans:wght@400;600', 600, false, 13], ['vt323', 'VT323', 'VT323', 'VT323', 400, false, 16]]],
        ['Geometric, circular', [['urbanist', 'Urbanist', 'Urbanist', null, 700, true, 13], ['jost', 'Jost', 'Jost', 'Jost:wght@400;600', 600, true, 13], ['poppins', 'Poppins', 'Poppins', 'Poppins:wght@400;600', 600, true, 12], ['outfit', 'Outfit', 'Outfit', 'Outfit:wght@400;600', 600, true, 13], ['questrial', 'Questrial', 'Questrial', 'Questrial', 400, true, 13],
            ['quicksand', 'Quicksand', 'Quicksand', 'Quicksand:wght@500;700', 700, true, 13], ['comfortaa', 'Comfortaa', 'Comfortaa', 'Comfortaa:wght@400;700', 700, true, 12], ['varela', 'Varela Round', '"Varela Round"', 'Varela+Round', 400, true, 13], ['nunito', 'Nunito', 'Nunito', 'Nunito:wght@400;700', 700, true, 13]]],
        ['DIN and Roboto', [['barlow', 'Barlow', 'Barlow', 'Barlow:wght@400;600', 600, true, 13], ['barlowsc', 'Barlow Semi Condensed', '"Barlow Semi Condensed"', 'Barlow+Semi+Condensed:wght@400;600', 600, true, 13], ['dinsys', 'DIN Alternate / Bahnschrift (installed)', '"DIN Alternate", Bahnschrift, Barlow, sans-serif', null, 700, true, 13],
            ['roboto', 'Roboto', 'Roboto', 'Roboto:wght@400;500;700', 500, true, 12], ['robotoc', 'Roboto Condensed', '"Roboto Condensed"', 'Roboto+Condensed:wght@400;600', 600, true, 13], ['robotoflex', 'Roboto Flex', '"Roboto Flex"', 'Roboto+Flex:wght@400;600', 600, true, 12], ['robotomono', 'Roboto Mono', '"Roboto Mono"', 'Roboto+Mono:wght@400;600', 600, true, 11], ['robotoslab', 'Roboto Slab', '"Roboto Slab"', 'Roboto+Slab:wght@400;600', 600, true, 12]]],
    ];
    function applyFont(key) { const f = FONTS.flatMap(g => g[1]).find(f => f[0] === key) || FONTS[1][1][0]; S.font = f[0];
        if (f[3] && !$('w31-gf-' + f[0])) { const l = document.createElement('link'); l.id = 'w31-gf-' + f[0]; l.rel = 'stylesheet'; l.href = `https://fonts.googleapis.com/css2?family=${f[3]}&display=swap`; document.head.appendChild(l); }
        const b = document.body.style, touch = document.body.classList.contains('w31-touch'); b.setProperty('--font', f[2] + ', Arial, sans-serif'); b.setProperty('--fw', f[4]); b.setProperty('--fs', Math.round(f[6] * (touch ? 1.25 : 1)) + 'px');
        document.body.classList.toggle('w31-aliased', !f[5]); if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { drawScrubs(); layoutScene(); }); }
    const radio = (label, opts, get, set) => { const g = h('div', 'w31-grp', `<b>${label}</b>`), row = h('div', 'w31-brow'); const sync = () => row.querySelectorAll('.w31-b').forEach(b => b.classList.toggle('on', b.dataset.v === String(get())));
        opts.forEach(([v, l]) => { const b = h('button', 'w31-b', l); b.dataset.v = v; b.onclick = () => { set(v); sync(); save(); }; row.appendChild(b); }); g.appendChild(row); sync(); return g; };
    const fakeRange = (min, max, step, v) => { const i = document.createElement('input'); i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = v; return i; };
    const gaze = f => { const G = window.__irisGaze; if (G) f(G); };
    function buildControl(W) {
        const line = h('div', 'w31-line', '<span>FONT</span>'), sel = h('select'); FONTS.forEach(([g, list]) => { const og = h('optgroup'); og.label = g; list.forEach(f => { const o = h('option', '', f[1]); o.value = f[0]; og.appendChild(o); }); sel.appendChild(og); });
        sel.value = S.font; sel.onchange = () => { applyFont(sel.value); save(); }; line.appendChild(sel); W.body.appendChild(line);
        W.body.appendChild(radio('Touch sizing', [['auto', 'Auto'], ['on', 'On'], ['off', 'Off']], () => S.touch, v => { S.touch = v; relayout(); }));
        W.body.appendChild(radio('Magnetic snap', [['hard', 'Hard'], ['pull', 'Eased pull'], ['window', 'Eased window']], () => S.snapMode, v => { S.snapMode = v; }));
        W.body.appendChild(radio('Snap speed', [[10, 'Slow'], [22, 'Medium'], [40, 'Fast']], () => S.snapK, v => { S.snapK = +v; }));
        const g = h('div', 'w31-grp', '<b>Gaze, when the pointer is on a window</b>');
        const a = fakeRange(0, 4, 0.1, S.hold), b = fakeRange(0.5, 10, 0.1, S.ret), av = h('span'), bv = h('span');
        a.addEventListener('input', () => { S.hold = +a.value; av.textContent = S.hold.toFixed(1) + ' s'; gaze(G => G.hold = S.hold); save(); }); b.addEventListener('input', () => { S.ret = +b.value; bv.textContent = S.ret.toFixed(1) + ' s'; gaze(G => G.ret = S.ret); save(); });
        g.appendChild(scrubber(a, 'HOLD', av)); g.appendChild(scrubber(b, 'RETURN', bv)); av.textContent = S.hold.toFixed(1) + ' s'; bv.textContent = S.ret.toFixed(1) + ' s'; W.body.appendChild(g);
        const back = h('button', 'w31-b', 'Windows 98 shell'); back.onclick = () => { location.search = '?ui=98'; }; const row = h('div', 'w31-brow'); row.appendChild(back); W.body.appendChild(row);
    }

    // ---------------------------------------------------------------------------------------------------------
    // after design.js and the page have loaded: dress the DESIGN pane as Paintbrush, put the fit panel into the
    // Photo window (every id stays; DIAG, which the Win98 shell dropped, is back)
    // ---------------------------------------------------------------------------------------------------------
    function dressDesign() {
        const W = byKey('design'), pane = W.body.querySelector('.tab-pane'); if (!pane || !$('tool-row')) return;
        const first = pane.querySelector('.action-row'); if (first) { first.className = 'w31-brow'; first.style.marginTop = '0'; first.querySelectorAll('button').forEach(b => b.classList.add('w31-b')); }
        const tools = $('tool-row'); tools.className = 'w31-tools'; tools.removeAttribute('style'); tools.querySelectorAll('.tool-btn').forEach(b => { const k = b.dataset.tool; b.title = b.textContent + ' · ' + k; b.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16">${GLYPH[k] || ''}</svg>`; b.classList.add('w31-tool'); });
        const pb = h('div', 'w31-pb'), right = h('div'); pane.insertBefore(pb, tools); pb.appendChild(tools); pb.appendChild(right);
        const layerRow = $('design-layer').closest('.slider-row'); right.appendChild(layerRow);
        for (const [id, label] of [['design-size', 'SIZE'], ['design-weight', 'WEIGHT'], ['design-hard', 'HARD'], ['design-value', 'VALUE']]) { const inp = $(id); if (!inp) continue; const old = inp.closest('.slider-row'), v = $(id + '-v'); right.appendChild(scrubber(inp, label, v)); if (old) old.remove(); }
        const fl = $('design-flow'); if (fl) fl.classList.add('w31-b'); pane.querySelectorAll('select').forEach(s => s.classList.remove('action-btn'));
    }
    function dressFit() {
        const W = byKey('fit'), fp = $('fit-panel'); if (!fp) return; W.body.appendChild(fp); fp.classList.remove('hidden');
        const score = $('fit-score'); if (score) { score.className = 'w31-score'; fp.insertBefore(score, $('fitcv').nextSibling); }
        const keep = {}; fp.querySelectorAll('.fit-row button, .fit-row select').forEach(el => { keep[el.id] = el; }); fp.querySelectorAll('.fit-row').forEach(r => r.remove());
        const hq = h('button', '', '★ Fit HQ'); hq.id = 'fit-hq'; hq.title = 'one button: CAPTURE quality, alignment loop, the whole fit chain and a relief refinement'; hq.onclick = () => E.fit.fitHQ(); keep['fit-hq'] = hq; keep['fit-close'] = $('fit-close');
        const names = { 'fit-refine': 'Refine relief', 'fit-detect': 'Detect', 'fit-files': 'Bulk…', 'fit-solve': 'Solve pose', 'fit-global': 'Fit global', 'fit-stop': 'Stop', 'fit-load': 'Photo…', 'fit-auto': 'Auto align', 'fit-save': 'Save align', 'fit-alignout': 'Align ↓', 'fit-benchiso': 'Bench ISO', 'fit-bench': 'Bench all', 'fit-study': 'Study', 'fit-cases': 'Cases ↓', 'fit-casebook': 'Casebook', 'fit-diag': 'Diag', 'fit-close': 'Close photo' };
        for (const [name, ids] of [['FIT', ['fit-hq', 'fit-solve', 'fit-global', 'fit-detect', 'fit-refine', 'fit-stop']], ['SOURCE', ['fit-load', 'fit-ref', 'fit-view', 'fit-files', 'fit-close']], ['ALIGN', ['fit-auto', 'fit-save', 'fit-alignout']], ['TEST', ['fit-diag', 'fit-benchiso', 'fit-bench', 'fit-study', 'fit-cases', 'fit-casebook']]]) {
            const row = h('div', 'w31-fitrow', `<span>${name}</span>`), br = h('div', 'w31-brow');
            for (const id of ids) { const el = keep[id]; if (!el) continue; if (el.tagName === 'SELECT') { el.classList.remove('action-btn'); el.style.flex = '1 0 100%'; } else { el.className = 'w31-b'; el.removeAttribute('style'); el.style.flex = '1 0 30%'; if (id === 'fit-hq') el.classList.add('def'); if (names[id]) el.textContent = names[id]; } br.appendChild(el); }
            row.appendChild(br); fp.insertBefore(row, $('fit-log')); }
        const g = h('div', 'w31-grp', '<b>Fitted ↔ procedural</b>'); for (const id of ['blcol', 'blrel', 'blflow']) { const r = scrubberFor(id); if (r) g.appendChild(r); } W.body.appendChild(g);
        // fit.js shows and hides the panel through its `hidden` class. In this shell the panel is the Fit window's
        // body and stays; FIT PHOTO and the casebook bring the window up, "Close photo" (fit-close) ends the session.
        $('fit-open').addEventListener('click', () => show(W, true));
        new MutationObserver(() => { if (fp.classList.contains('hidden')) fp.classList.remove('hidden'); }).observe(fp, { attributes: true, attributeFilter: ['class'] });
    }

    // ---------------------------------------------------------------------------------------------------------
    // layout: phone = short side < 600 px → one bottom sheet + icon strip; everything else (tablets in portrait
    // too) = MDI. Touch sizing follows the pointer type. The eye is re-centred above a phone sheet by moving the
    // canvas element: the page and the render's surround are both white, so the seam is invisible and the
    // engine's `state.view` is never touched (study/09 §7.1).
    // ---------------------------------------------------------------------------------------------------------
    const q = location.search;
    function sceneShift() { if (!phone) return 0; const sheet = WINS.find(W => W.open), capB = $('w31-cap').getBoundingClientRect().bottom; return Math.round((capB + (innerHeight - 69 - (sheet ? sheet.el.offsetHeight : 0))) / 2 - innerHeight / 2); }
    function layoutScene() { const cv = $('gl'); if (!cv) return; const ov = window.__irisOverlay; if (ov && ov.layout) return ov.layout();   // overlay.js owns the canvas transform (shift + its zoom / pan)
        const s = sceneShift(); cv.style.transform = s ? `translateY(${s}px)` : ''; }
    function relayout() { const was = phone; phone = /[?&]phone\b/.test(q) || Math.min(innerWidth, innerHeight) < 600; const touch = S.touch === 'on' || (S.touch === 'auto' && (phone || matchMedia('(pointer: coarse)').matches));
        document.body.classList.toggle('w31-phone', phone); document.body.classList.toggle('w31-touch', touch); applyFont(S.font);
        if (phone) { const o = WINS.filter(W => W.open); o.slice(0, -1).forEach(W => show(W, false, true)); WINS.forEach(W => { W.el.style.width = ''; }); }
        else WINS.forEach(W => { if (W.open) { if (W.width) W.el.style.width = Math.min(W.width, innerWidth - 12) + 'px'; place(W, W.tx === undefined ? innerWidth : W.tx, W.ty === undefined ? top0() + 6 : W.ty); } });
        if (was && !phone) tile(); icons(); layoutScene(); drawScrubs(); siteIcon(); }

    // ---------------------------------------------------------------------------------------------------------
    // build (synchronously, where ui.js used to), then finish on load
    // ---------------------------------------------------------------------------------------------------------
    document.body.classList.add('w31-shell');
    buildChrome(); WINS.forEach(makeWin); buildControl(byKey('control'));
    const panel = $('ui-panel'); if (panel) panel.style.display = 'none';
    { const l = document.createElement('link'); l.rel = 'icon'; l.href = icon('eye'); document.head.appendChild(l); }
    window.addEventListener('load', () => {
        dressDesign(); dressFit(); relayout();
        const first = !Object.keys(S.layout).length; WINS.forEach(W => { if (first ? W.key === 'camera' : W.wantOpen) show(W, true, true); }); if (first && !phone) tile(); icons(); layoutScene(); drawScrubs();
        const g = document.createElement('script'); g.src = 'gaze.js'; g.onload = () => gaze(G => { G.hold = S.hold; G.ret = S.ret; }); document.head.appendChild(g);   // study/09 U0: controls never move the eye
        const o = document.createElement('script'); o.src = 'overlay.js'; document.head.appendChild(o);   // study/09 U3: the fit photo lies on the iris
    });
    window.addEventListener('resize', relayout);
    let last = performance.now(), fT = last, fN = 0, fps = 0;
    (function frame(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; stepWins(dt); syncScrubs(); fN++; if (now - fT > 1000) { fps = fN * 1000 / (now - fT); fN = 0; fT = now; } if (flashT > 0) flashT -= dt;
        const st = $('w31-status'); if (st) { const t = flashT > 0 ? flash : `${String(E.quality).toUpperCase()} · ${fps.toFixed(0)} fps · ${E.ATLAS.join('×')}`; if (st.textContent !== t) st.textContent = t; } requestAnimationFrame(frame); })(last);
    // study/10 §9: the control ids the menus reach — items built with click(id) carry it, others name it in `ctl`
    async function menuIds() { const out = new Set(), walk = async items => { if (typeof items === 'function') { try { items = await items(); } catch (e) { items = []; } } for (const it of items || []) { if (it === '-' || !it) continue; const id = it.ctl || (it.run && it.run.ctl); if (id) out.add(id); if (it.sub) await walk(it.sub); } };
        for (const [, items] of MENUS) await walk(items); return [...out]; }
    const up = k => byKey(String(k).toLowerCase());
    window.__irisUI = { shell: '3.11', showWindow: (k, on) => { const W = up(k); if (W) show(W, on !== false); }, get windows() { return Object.fromEntries(WINS.map(W => [W.key.toUpperCase(), W.el])); }, makeScrubber: (input, label, valEl) => scrubber(input, label, valEl), origins: () => (syncScrubs(), Object.fromEntries(scrubs.filter(r => r.dataset.for).map(r => [r.dataset.for, r.origin]))), sceneShift, WINS, show, tile, cascade, say, menuIds, settings: S };
})();
