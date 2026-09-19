// ui.js — the Windows 98 shell (spec §20.2): a top bar with the six mode windows (CAMERA, MATERIAL, RELIEF,
// FLOW, FIT, DESIGN) as floating, draggable, remembered windows; Apple-Photos-style scrubber knobs in place of
// range sliders; presets and fitted cases as menus; icon toolbars for the designer's tools. The old panel's
// elements are moved, not rebuilt, so every binding in index.html / fit.js / design.js keeps working.
(() => {
    const $ = id => document.getElementById(id);
    const I = {   // 16 px monochrome glyphs (Win98 palette: black on grey)
        camera: '<path d="M2 5h3l1-2h4l1 2h3v8H2z" fill="none" stroke="#000"/><circle cx="8" cy="9" r="2.5" fill="none" stroke="#000"/>',
        material: '<path d="M8 2a6 6 0 1 0 0 12c1 0 1-1 .5-1.5S8 11 9 11h1.5A3.5 3.5 0 0 0 14 7.5C14 4.5 11.5 2 8 2z" fill="none" stroke="#000"/><circle cx="5" cy="7" r="1"/><circle cx="8" cy="5" r="1"/><circle cx="11" cy="7" r="1"/>',
        relief: '<path d="M1 13l4-7 3 4 2-3 5 6z" fill="none" stroke="#000"/>',
        flow: '<path d="M1 5c2-2 4 2 6 0s4 2 6 0M1 9c2-2 4 2 6 0s4 2 6 0M1 13c2-2 4 2 6 0s4 2 6 0" fill="none" stroke="#000"/>',
        fit: '<circle cx="8" cy="8" r="6" fill="none" stroke="#000"/><circle cx="8" cy="8" r="2" fill="none" stroke="#000"/><path d="M8 0v3M8 13v3M0 8h3M13 8h3" stroke="#000"/>',
        design: '<path d="M10 2l4 4-7 7H3v-4z" fill="none" stroke="#000"/><path d="M9 3l4 4" stroke="#000"/>',
        paint: '<path d="M2 14c0-3 2-3 3-5l6-6 2 2-6 6c-2 1-2 3-5 3z" fill="none" stroke="#000"/>', add: '<path d="M8 3v10M3 8h10" stroke="#000" stroke-width="2"/>', sub: '<path d="M3 8h10" stroke="#000" stroke-width="2"/>',
        smooth: '<path d="M8 2c3 4 5 6 5 8a5 5 0 0 1-10 0c0-2 2-4 5-8z" fill="none" stroke="#000"/>', smear: '<path d="M6 14V7a2 2 0 0 1 4 0v3l3-1v3l-3 2z" fill="none" stroke="#000"/>',
        dent: '<path d="M2 6c0 6 12 6 12 0" fill="none" stroke="#000"/><path d="M2 6h12" stroke="#000" stroke-dasharray="1 2"/>', bump: '<path d="M2 10c0-6 12-6 12 0" fill="none" stroke="#000"/><path d="M2 10h12" stroke="#000" stroke-dasharray="1 2"/>',
        streak: '<path d="M3 13L13 3" stroke="#000" stroke-width="2"/>', color: '<path d="M8 2c2 3 4 5 4 8a4 4 0 0 1-8 0c0-3 2-5 4-8z" fill="#000"/>', pick: '<path d="M12 2l2 2-3 3-1-1-5 5-2 1 1-2 5-5-1-1z" fill="none" stroke="#000"/>',
        undo: '<path d="M6 4L3 7l3 3M3 7h7a3 3 0 0 1 0 6H6" fill="none" stroke="#000"/>', clear: '<path d="M3 3l10 10M13 3L3 13" stroke="#000" stroke-width="2"/>',
        eye: '<path d="M1 8c3-4 11-4 14 0-3 4-11 4-14 0z" fill="none" stroke="#000"/><circle cx="8" cy="8" r="2"/>', id: '<rect x="2" y="3" width="12" height="10" fill="none" stroke="#000"/><path d="M4 6h5M4 9h8" stroke="#000"/>', cam: '<rect x="1" y="4" width="14" height="9" fill="none" stroke="#000"/><circle cx="8" cy="8.5" r="2.5" fill="none" stroke="#000"/>',
    };
    const svg = (name, size = 16) => `<svg width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true">${I[name] || ''}</svg>`;

    const MODES = [
        { key: 'CAMERA', icon: 'camera', title: 'Camera', sliders: ['pupil', 'elev', 'light', 'srcsize', 'ambient', 'lid', 'ev', 'fstop', 'focus', 'kelvin', 'grain', 'bloom'], buttons: ['debug-btn', 'refr-btn', 'anim2-btn', 'tone-btn', 'ref-btn'], src: true },
        { key: 'MATERIAL', icon: 'material', title: 'Material', sliders: ['pigment', 'stroma', 'pheo', 'yellow', 'mie', 'ring'] },
        { key: 'RELIEF', icon: 'relief', title: 'Relief', sliders: ['crypt', 'furrow', 'relief', 'collr'] },
        { key: 'FLOW', icon: 'flow', title: 'Flow', sliders: ['warp', 'seed'], buttons: ['seed-btn', 'fieldw-btn', 'strand-btn', 'atlas-btn', 'maps-btn'] },
        { key: 'FIT', icon: 'fit', title: 'Fit', sliders: ['blcol', 'blrel', 'blflow'], buttons: ['fit-open'] },
        { key: 'DESIGN', icon: 'design', title: 'Design' },
    ];
    const DEFAULT_POS = { CAMERA: [null, 44, true], MATERIAL: [null, 360, false], RELIEF: [null, 480, false], FLOW: [null, 560, false], FIT: [null, 640, false], DESIGN: [12, 44, false] };
    let layout = {}; try { layout = JSON.parse(localStorage.getItem('irisW98') || '{}'); } catch (e) {}
    const saveLayout = () => { try { localStorage.setItem('irisW98', JSON.stringify(layout)); } catch (e) {} };
    let zTop = 100;

    // ---------------- scrubber knobs (Apple Photos): drag the ruler, the centre marker is the value ----------------
    function makeScrubber(input, labelText) {
        const row = document.createElement('div'); row.className = 'scrub';
        const lbl = document.createElement('span'); lbl.className = 'scrub-lbl'; lbl.textContent = labelText;
        const ruler = document.createElement('div'); ruler.className = 'scrub-ruler'; const cv = document.createElement('canvas'); ruler.appendChild(cv); const mark = document.createElement('div'); mark.className = 'scrub-mark'; ruler.appendChild(mark);
        const val = input.parentElement.querySelector('.val') || document.createElement('span'); val.className = 'scrub-val';
        row.appendChild(lbl); row.appendChild(ruler); row.appendChild(val);
        const min = parseFloat(input.min), max = parseFloat(input.max), step = parseFloat(input.step) || (max - min) / 200, def = parseFloat(input.value);
        const pxPerUnit = () => (ruler.clientWidth || 150) / Math.max(1e-9, max - min);   // one ruler width = the whole range
        function draw() {
            const w = ruler.clientWidth || 150, h = 22, dpr = window.devicePixelRatio || 1;
            if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px'; }
            const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
            const v = parseFloat(input.value), ppu = pxPerUnit(), tick = (max - min) / 40;
            if (!(ppu > 0) || !isFinite(ppu) || !(tick > 0) || !ruler.clientWidth) return;   // hidden window: no width, no ticks (an unbounded loop otherwise)
            ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
            const k0 = Math.ceil((v - w / 2 / ppu) / tick), k1 = Math.min(k0 + 400, Math.floor((v + w / 2 / ppu) / tick));
            for (let k = k0; k <= k1; k++) { const x = Math.round(w / 2 + (k * tick - v) * ppu) + 0.5; const major = k % 5 === 0; ctx.beginPath(); ctx.moveTo(x, major ? 5 : 12); ctx.lineTo(x, h - 3); ctx.strokeStyle = major ? '#000' : '#808080'; ctx.stroke(); }
            // the filled part from the default to the value
            const x0 = w / 2 + (def - v) * ppu; ctx.fillStyle = 'rgba(0,0,128,0.18)'; ctx.fillRect(Math.min(x0, w / 2), 3, Math.abs(x0 - w / 2), h - 6);
        }
        let drag = null;
        ruler.addEventListener('pointerdown', e => { drag = { x: e.clientX, v: parseFloat(input.value) }; try { ruler.setPointerCapture(e.pointerId); } catch (err) {} e.preventDefault(); });
        ruler.addEventListener('pointermove', e => { if (!drag) return; let v = drag.v - (e.clientX - drag.x) / pxPerUnit(); v = Math.round(Math.max(min, Math.min(max, v)) / step) * step; input.value = v; input.dispatchEvent(new Event('input', { bubbles: true })); draw(); });
        ruler.addEventListener('pointerup', () => { drag = null; }); ruler.addEventListener('pointercancel', () => { drag = null; });
        ruler.addEventListener('dblclick', () => { input.value = def; input.dispatchEvent(new Event('input', { bubbles: true })); draw(); });
        ruler.addEventListener('wheel', e => { let v = parseFloat(input.value) + (e.deltaY > 0 ? -1 : 1) * step * 2; v = Math.max(min, Math.min(max, v)); input.value = v; input.dispatchEvent(new Event('input', { bubbles: true })); draw(); e.preventDefault(); }, { passive: false });
        input.addEventListener('input', draw); input.style.display = 'none';
        row._draw = draw; row._input = input;
        return row;
    }
    function scrubberFor(id) {
        const input = $('param-' + id); if (!input) return null;
        const oldRow = input.closest('.slider-row'); const label = oldRow ? oldRow.querySelector('.lbl').textContent : id;
        const row = makeScrubber(input, label); row.appendChild(input); if (oldRow) oldRow.remove();
        return row;
    }
    function scrubberForGeneric(input, label) { const row = makeScrubber(input, label); row.appendChild(input); return row; }

    // ---------------- windows ----------------
    const windows = {};
    function makeWindow(mode) {
        const w = document.createElement('div'); w.className = 'w98'; w.dataset.mode = mode.key; w.style.width = mode.key === 'DESIGN' ? '300px' : '280px';
        w.innerHTML = `<div class="w98-title">${svg(mode.icon, 14)}<span>${mode.title}</span><span class="w98-tbtns"><button class="w98-tb" data-act="min" title="roll up">_</button><button class="w98-tb" data-act="close" title="close">×</button></span></div><div class="w98-body"></div>`;
        const body = w.querySelector('.w98-body');
        const pane = document.createElement('div'); pane.className = 'tab-pane active'; pane.dataset.tab = mode.key; body.appendChild(pane);
        (mode.sliders || []).forEach(id => { const r = scrubberFor(id); if (r) pane.appendChild(r); });
        if (mode.src) { const srcRow = document.querySelector('.src-btn') && document.querySelector('.src-btn').closest('.action-row'); if (srcRow) { srcRow.className = 'w98-row'; srcRow.querySelectorAll('button').forEach(b => b.classList.add('w98-btn')); pane.appendChild(srcRow); } }
        if (mode.buttons) { const row = document.createElement('div'); row.className = 'w98-row'; mode.buttons.forEach(id => { const b = $(id); if (b) { b.classList.add('w98-btn'); row.appendChild(b); } }); pane.appendChild(row); }
        // title bar: drag, front, roll-up, close
        const title = w.querySelector('.w98-title'); let drag = null;
        title.addEventListener('pointerdown', e => { if (e.target.closest('.w98-tb')) return; drag = { x: e.clientX - w.offsetLeft, y: e.clientY - w.offsetTop }; try { title.setPointerCapture(e.pointerId); } catch (err) {} front(w); });
        title.addEventListener('pointermove', e => { if (!drag) return; const x = Math.max(0, Math.min(innerWidth - 60, e.clientX - drag.x)), y = Math.max(32, Math.min(innerHeight - 30, e.clientY - drag.y)); w.style.left = x + 'px'; w.style.top = y + 'px'; w.style.right = 'auto'; layout[mode.key] = Object.assign(layout[mode.key] || {}, { x, y }); saveLayout(); });
        title.addEventListener('pointerup', () => { drag = null; });
        w.addEventListener('pointerdown', () => front(w));
        w.querySelector('[data-act="close"]').onclick = () => showWindow(mode.key, false);
        w.querySelector('[data-act="min"]').onclick = () => { w.classList.toggle('rolled'); layout[mode.key] = Object.assign(layout[mode.key] || {}, { rolled: w.classList.contains('rolled') }); saveLayout(); };
        document.body.appendChild(w); windows[mode.key] = w;
        const L = layout[mode.key] || {}, D = DEFAULT_POS[mode.key];
        if (L.x !== undefined) { w.style.left = L.x + 'px'; w.style.top = L.y + 'px'; } else { if (D[0] === null) { w.style.right = '12px'; } else w.style.left = D[0] + 'px'; w.style.top = D[1] + 'px'; }
        if (L.rolled) w.classList.add('rolled');
        showWindow(mode.key, L.open !== undefined ? L.open : D[2], true);
        return w;
    }
    function front(w) { w.style.zIndex = ++zTop; }
    function showWindow(key, on, silent) {
        const w = windows[key]; if (!w) return; w.style.display = on ? 'block' : 'none'; if (on) front(w);
        const b = document.querySelector(`.w98-mode[data-mode="${key}"]`); if (b) b.classList.toggle('active', on);
        layout[key] = Object.assign(layout[key] || {}, { open: on }); if (!silent) saveLayout();
        if (on) w.querySelectorAll('.scrub').forEach(r => r._draw && r._draw());
    }

    // ---------------- top bar ----------------
    function makeTopBar() {
        const bar = document.createElement('div'); bar.id = 'w98-top';
        bar.innerHTML = `<span class="w98-logo">${svg('eye', 14)} IRIS ENGINE</span>` + MODES.map(m => `<button class="w98-btn w98-mode" data-mode="${m.key}" title="${m.title} (toggle window)">${svg(m.icon)}<span>${m.title}</span></button>`).join('') +
            `<span class="w98-sep"></span><button class="w98-btn" id="w98-presets">Presets ▾</button><button class="w98-btn" id="w98-fitted">Fitted ▾</button><span class="w98-sep"></span><span id="w98-actions"></span><span class="w98-spacer"></span><span id="w98-status"></span>`;
        document.body.appendChild(bar);
        bar.querySelectorAll('.w98-mode').forEach(b => b.onclick = () => { const key = b.dataset.mode; showWindow(key, windows[key].style.display === 'none'); });
        const acts = $('w98-actions');
        for (const id of ['quality-sel', 'idout-btn', 'idin-btn', 'shot-btn', 'cam-btn']) { const el = $(id); if (el) { el.classList.add('w98-btn'); acts.appendChild(el); } }
        // Presets are fitted isolated macros from ref/presets.json (written only by bakePresets / promotion): a
        // whole fitted iris — fields, splats, ridges, materials — not a procedural colour start. The ten
        // procedural EYE_PRESETS stay in the engine because the fitter's bestPresetStart() evaluates them
        // all; reach them with loadEyePreset('green') or put them back in this list.
        const presets = [
            ['09-blue-green-isolated.jpg', 'Blue-green  ·  09'],
            ['25-green-amber-ring-isolated.jpg', 'Green, amber ring  ·  25'],
            ['26-green-crypts-isolated.jpg', 'Green, crypts  ·  26'],
            ['35-grey-green-isolated.jpg', 'Grey-green  ·  35'],
        ];
        menu($('w98-presets'), () => presets.map(([f, l]) => ({ label: l, run: () => window.__irisEngine.loadFittedPreset(f) })));
        menu($('w98-fitted'), async () => {
            let cases = {}; try { cases = await fetch('ref/cases.json').then(r => r.ok ? r.json() : {}); } catch (e) {}
            const items = Object.entries(cases).map(([file, c]) => ({ file, m: c.scores ? c.scores.match : 0, h: c.scores && c.scores.hcorr !== undefined ? c.scores.hcorr : null, tag: c.tag })).sort((a, b) => b.m - a.m);
            return items.map(it => ({ label: `${it.file.replace('.jpg', '')}  —  ${it.m.toFixed(0)} %${it.h !== null ? ' · h ' + it.h.toFixed(2) : ''}  (${it.tag})`, run: () => window.__irisEngine.loadFittedPreset(it.file) }));
        });
        // the old preset grids are retired
        document.querySelectorAll('#ui-panel .preset-grid').forEach(g => g.remove());
    }
    function menu(btn, itemsFn) {
        let open = null;
        btn.onclick = async e => {
            if (open) { open.remove(); open = null; return; }
            const items = await itemsFn();
            const m = document.createElement('div'); m.className = 'w98-menu'; m.style.left = btn.getBoundingClientRect().left + 'px'; m.style.top = (btn.getBoundingClientRect().bottom + 1) + 'px';
            for (const it of items) { const d = document.createElement('div'); d.className = 'w98-item'; d.textContent = it.label; d.onclick = () => { it.run(); m.remove(); open = null; }; m.appendChild(d); }
            document.body.appendChild(m); open = m;
            setTimeout(() => document.addEventListener('pointerdown', function h(ev) { if (!m.contains(ev.target) && ev.target !== btn) { m.remove(); open = null; } document.removeEventListener('pointerdown', h); }), 0);
        };
    }

    // ---------------- the DESIGN window: icon toolbar + scrubbers (after design.js built its pane) ----------------
    function dressDesign() {
        const pane = document.querySelector('.tab-pane[data-tab="DESIGN"]'); if (!pane) return;
        const toolRow = $('tool-row'); if (toolRow) { toolRow.className = 'w98-tools'; toolRow.querySelectorAll('.tool-btn').forEach(b => { const k = b.dataset.tool; b.innerHTML = svg(k); b.title = k.toUpperCase(); b.classList.add('w98-btn'); }); }
        const first = pane.querySelector('.action-row'); if (first) { first.className = 'w98-row'; first.querySelectorAll('button').forEach(b => { b.classList.add('w98-btn'); if (b.id === 'design-undo') { b.innerHTML = svg('undo'); b.title = 'undo (Ctrl-Z)'; } if (b.id === 'design-clear') { b.innerHTML = svg('clear'); b.title = 'remove every painted stamp'; } }); }
        for (const [id, label] of [['design-size', 'SIZE'], ['design-weight', 'WEIGHT'], ['design-hard', 'HARD'], ['design-value', 'VALUE']]) {
            const inp = $(id); if (!inp) continue; const old = inp.closest('.slider-row'); const v = $(id + '-v');
            const row = makeScrubber(inp, label); row.appendChild(inp); if (v) { v.className = 'scrub-val'; row.replaceChild(v, row.querySelector('.scrub-val')); }
            old.parentNode.insertBefore(row, old); old.remove(); row._draw();
        }
        pane.querySelectorAll('.slider-row').forEach(r => r.classList.add('w98-line'));
        pane.querySelectorAll('select, button').forEach(b => b.classList.add('w98-btn'));
    }

    // ---------------- the fit panel in the shell: 98 chrome, one FIT HQ button, grouped rows ----------------
    function dressFit() {
        const fp = $('fit-panel'); if (!fp || fp.classList.contains('w98')) return;
        fp.classList.add('w98', 'w98-fit');
        const head = fp.querySelector('.fit-head'); if (head) { head.className = 'w98-title'; head.insertAdjacentHTML('afterbegin', svg('fit', 14)); const close = $('fit-close'); if (close) { close.className = 'w98-tb'; close.textContent = '×'; const tb = document.createElement('span'); tb.className = 'w98-tbtns'; tb.appendChild(close); head.appendChild(tb); } }
        // regroup: SOURCE / ALIGN / FIT / TEST, with FIT HQ first
        const keep = {}; fp.querySelectorAll('.fit-row button, .fit-row select').forEach(el => { keep[el.id] = el; });   // detach the buttons before the rows go
        fp.querySelectorAll('.fit-row').forEach(r => r.remove());
        const groups = [
            ['FIT', ['fit-hq', 'fit-solve', 'fit-global', 'fit-detect', 'fit-refine', 'fit-stop']],
            ['SOURCE', ['fit-load', 'fit-ref', 'fit-view', 'fit-files']],
            ['ALIGN', ['fit-auto', 'fit-save', 'fit-alignout']],
            ['TEST', ['fit-benchiso', 'fit-bench', 'fit-study', 'fit-cases', 'fit-casebook']],
        ];
        const hq = document.createElement('button'); hq.id = 'fit-hq'; hq.title = 'one button: CAPTURE quality, alignment loop, the whole fit chain and a relief refinement'; hq.innerHTML = '★ FIT HQ'; hq.onclick = () => window.__irisEngine.fit.fitHQ();
        const log = $('fit-log');
        for (const [name, ids] of groups) {
            const row = document.createElement('div'); row.className = 'w98-fitrow'; const lab = document.createElement('span'); lab.className = 'w98-fitlab'; lab.textContent = name; row.appendChild(lab);
            for (const id of ids) { const el = id === 'fit-hq' ? hq : keep[id]; if (!el) continue; el.classList.add('w98-btn'); if (id === 'fit-hq') el.classList.add('w98-hq'); if (id === 'fit-refine') { el.textContent = 'REFINE RELIEF'; el.title = 'warm-start refinement of the relief splats (more iterations)'; } if (id === 'fit-detect') el.textContent = 'DETECT'; if (id === 'fit-files') el.textContent = 'BULK…'; row.appendChild(el); }
            fp.insertBefore(row, log);
        }
        // draggable by the title
        let drag = null; const title = fp.querySelector('.w98-title');
        title.addEventListener('pointerdown', e => { if (e.target.closest('.w98-tb')) return; drag = { x: e.clientX - fp.offsetLeft, y: e.clientY - fp.offsetTop }; try { title.setPointerCapture(e.pointerId); } catch (err) {} });
        title.addEventListener('pointermove', e => { if (!drag) return; fp.style.left = Math.max(0, e.clientX - drag.x) + 'px'; fp.style.top = Math.max(32, e.clientY - drag.y) + 'px'; fp.style.right = 'auto'; fp.style.transform = 'none'; });
        title.addEventListener('pointerup', () => { drag = null; });
    }

    // ---------------- build ----------------
    function build() {
        const panel = $('ui-panel'); if (!panel) return;
        const strip = document.createElement('div'); strip.id = 'tab-strip'; strip.style.display = 'none'; document.body.appendChild(strip);   // tells design.js the layout is ours
        makeTopBar();
        for (const m of MODES) makeWindow(m);
        panel.style.display = 'none'; const ham = document.querySelector('.hamburger, #menu-toggle, #panel-toggle'); if (ham) ham.style.display = 'none';
        document.body.classList.add('w98-shell');
        window.addEventListener('load', () => { dressDesign(); dressFit(); document.querySelectorAll('.scrub').forEach(r => r._draw && r._draw()); });
        window.addEventListener('resize', () => document.querySelectorAll('.scrub').forEach(r => r._draw && r._draw()));
        // status: quality + fps
        let last = performance.now(), frames = 0; (function tick() { frames++; const now = performance.now(); if (now - last > 1000) { const E = window.__irisEngine; $('w98-status').textContent = `${E.quality.toUpperCase()} · ${(frames * 1000 / (now - last)).toFixed(0)} fps · ${E.ATLAS.join('×')}`; frames = 0; last = now; } requestAnimationFrame(tick); })();
    }
    build();
    { const g = document.createElement('script'); g.src = 'gaze.js'; document.head.appendChild(g); }   // study/09 U0: controls never move the eye (loaded from here so index.html stays untouched)
    window.__irisUI = { showWindow, windows, makeScrubber, svg };
})();
