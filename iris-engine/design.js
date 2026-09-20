// design.js — the iris designer (spec §20, D0–D2): DESIGN mode with a fixed frontal camera on the main canvas,
// a tabbed panel, field brushes (paint / add / sub / smooth / smear) on every coarse field, stamp brushes that
// become splats (relief) or paint splats (colour as a material tuple), picker + eyedropper through the LUT,
// undo, radial repeat, shortcuts.
(() => {
    const E = window.__irisEngine, state = E.state, target = E.target, gl = E.gl, canvas = E.canvas;
    const $ = id => document.getElementById(id);

    // ---------------- panel → tabs ----------------
    const TABS = ['VIEW', 'LIGHT', 'MATERIAL', 'RELIEF', 'FLOW', 'FIT', 'DESIGN'], TAB_LABEL = { VIEW: 'VIEW', LIGHT: 'LIGHT', MATERIAL: 'MATER', RELIEF: 'RELIEF', FLOW: 'FLOW', FIT: 'FIT', DESIGN: 'DESIGN' };
    const SLIDER_TAB = { pupil: 'VIEW', elev: 'LIGHT', light: 'LIGHT', srcsize: 'LIGHT', ambient: 'LIGHT', lid: 'LIGHT', ev: 'LIGHT', fstop: 'LIGHT', focus: 'LIGHT', kelvin: 'LIGHT', grain: 'LIGHT', bloom: 'LIGHT',
        pigment: 'MATERIAL', stroma: 'MATERIAL', pheo: 'MATERIAL', yellow: 'MATERIAL', mie: 'MATERIAL', ring: 'MATERIAL',
        crypt: 'RELIEF', furrow: 'RELIEF', relief: 'RELIEF', collr: 'RELIEF', warp: 'FLOW', seed: 'FLOW', blcol: 'FIT', blrel: 'FIT', blflow: 'FIT' };
    const BUTTON_TAB = { 'debug-btn': 'VIEW', 'refr-btn': 'VIEW', 'anim2-btn': 'VIEW', 'quality-sel': 'VIEW', 'idout-btn': 'VIEW', 'idin-btn': 'VIEW', 'tone-btn': 'VIEW', 'ref-btn': 'VIEW', 'shot-btn': 'VIEW',
        'atlas-btn': 'FLOW', 'seed-btn': 'FLOW', 'maps-btn': 'FLOW', 'fieldw-btn': 'FLOW', 'fit-open': 'FIT' };
    function layoutTabs() {
        const panel = $('ui-panel'); if (!panel || $('tab-strip')) return;
        const strip = document.createElement('div'); strip.className = 'tab-strip'; strip.id = 'tab-strip';
        const panes = {};
        for (const t of TABS) { const b = document.createElement('button'); b.className = 'tab-btn'; b.textContent = TAB_LABEL[t]; b.title = t; b.dataset.tab = t; strip.appendChild(b); const p = document.createElement('div'); p.className = 'tab-pane'; p.dataset.tab = t; panes[t] = p; }
        // sliders
        for (const [id, tab] of Object.entries(SLIDER_TAB)) { const inp = $('param-' + id); if (inp) panes[tab].appendChild(inp.closest('.slider-row')); }
        // the source-shape row (SUN / SOFT / RING / TWIN)
        const srcRow = document.querySelector('.src-btn') && document.querySelector('.src-btn').closest('.action-row'); if (srcRow) panes.LIGHT.insertBefore(srcRow, panes.LIGHT.querySelector('#param-ev') ? panes.LIGHT.querySelector('#param-ev').closest('.slider-row') : null);
        // buttons regrouped into rows of three
        const rows = {};
        for (const [id, tab] of Object.entries(BUTTON_TAB)) { const el = $(id); if (!el) continue; if (!rows[tab] || rows[tab].children.length >= 3) { rows[tab] = document.createElement('div'); rows[tab].className = 'action-row'; panes[tab].appendChild(rows[tab]); } rows[tab].appendChild(el); }
        for (const id of ['fit-blank1', 'fit-blank2']) { const el = $(id); if (el) el.remove(); }
        // remove the emptied containers
        panel.querySelectorAll('.control-group, .action-row').forEach(el => { if (!el.querySelector('input, button, select') && !el.closest('.tab-pane')) el.remove(); });
        const anchor = $('accum-bar');
        panel.insertBefore(strip, anchor); for (const t of TABS) panel.insertBefore(panes[t], anchor);
        strip.onclick = e => { const b = e.target.closest('.tab-btn'); if (b) showTab(b.dataset.tab); };
        showTab(localStorage.getItem('irisTab') || 'VIEW');
    }
    function showTab(t) { document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === t)); document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.dataset.tab === t)); try { localStorage.setItem('irisTab', t); } catch (e) {} }

    // ---------------- DESIGN tab UI ----------------
    const TOOLS = [['PAINT', 'paint'], ['ADD', 'add'], ['SUB', 'sub'], ['SMOOTH', 'smooth'], ['SMEAR', 'smear'], ['DENT', 'dent'], ['BUMP', 'bump'], ['STREAK', 'streak'], ['COLOR', 'color'], ['PICK', 'pick']];
    const LAYERS = [['melanin', 'MELANIN'], ['stroma', 'STROMA'], ['yellow', 'YELLOW'], ['pheo', 'PHEO'], ['gapMelanin', 'GAP MEL'], ['gapStroma', 'GAP STROMA'], ['height', 'HEIGHT'], ['strandBright', 'BRIGHT'], ['flowDir', 'FLOW DIR'], ['warpU', 'WARP U'], ['warpV', 'WARP V'], ['spacing', 'SPACING'], ['coherence', 'COHERENCE'], ['crypt', 'CRYPT W'], ['furrow', 'FURROW W'], ['collarette', 'COLLAR W']];
    const D = { on: false, tool: 'paint', layer: 'melanin', size: 0.5, weight: 0.6, hard: 0.5, value: 1.0, repeat: 1, alongFlow: false, mat: { melanin: 0.5, stroma: 0.3, pheo: 0.2, yellow: 0.5 }, undo: [], stroke: null, saved: null, space: false, pan: null };
    function buildDesignTab() {
        const pane = document.querySelector('.tab-pane[data-tab="DESIGN"]'); if (!pane) return;
        pane.innerHTML = `
            <div class="action-row"><button class="action-btn" id="design-toggle" title="fixed frontal camera, paint on the iris (D)">DESIGN OFF</button><button class="action-btn" id="design-undo" title="undo the last stroke (Ctrl-Z)">UNDO</button><button class="action-btn" id="design-clear" title="remove every painted stamp">CLEAR</button></div>
            <div class="action-row" id="tool-row" style="grid-template-columns:repeat(5,1fr)">${TOOLS.map(([l, k]) => `<button class="action-btn tool-btn" data-tool="${k}">${l}</button>`).join('')}</div>
            <div class="slider-row"><span class="lbl">LAYER</span><select id="design-layer" class="action-btn" style="grid-column:2/4">${LAYERS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
            <div class="slider-row"><span class="lbl">SIZE</span><input type="range" id="design-size" min="0.05" max="2.5" step="0.01"><span class="val" id="design-size-v"></span></div>
            <div class="slider-row"><span class="lbl">WEIGHT</span><input type="range" id="design-weight" min="0.02" max="1" step="0.01"><span class="val" id="design-weight-v"></span></div>
            <div class="slider-row"><span class="lbl">HARD</span><input type="range" id="design-hard" min="0" max="1" step="0.01"><span class="val" id="design-hard-v"></span></div>
            <div class="slider-row"><span class="lbl">VALUE</span><input type="range" id="design-value" min="-1" max="6" step="0.01"><span class="val" id="design-value-v"></span></div>
            <div class="slider-row"><span class="lbl">REPEAT</span><select id="design-repeat" class="action-btn"><option>1</option><option>2</option><option>3</option><option>4</option><option>6</option><option>8</option><option>12</option></select><button class="action-btn" id="design-flow" title="elongate stamps along the local strand direction">FLOW</button></div>
            <div class="slider-row"><span class="lbl">COLOUR</span><input type="color" id="design-colour" value="#7a8a3c" style="width:100%;height:22px;border:1px solid var(--border);background:transparent"><span class="val" id="design-swatch" style="display:inline-block;width:22px;height:18px;border:1px solid var(--border)"></span></div>
            <div id="design-hud"></div>`;
        $('design-toggle').onclick = () => setDesign(!D.on);
        $('design-undo').onclick = undo;
        $('design-clear').onclick = () => { pushUndo({ type: 'all' }); E.genome.splats = (E.genome.splats || []).filter(s => s.tag !== 'paint'); E.genome.paintSplats = []; E.atlas.dirty = true; E.resetAccumulation(); hud('painted stamps removed'); };
        pane.querySelectorAll('.tool-btn').forEach(b => b.onclick = () => setTool(b.dataset.tool));
        $('design-layer').onchange = e => { D.layer = e.target.value; refreshValueRange(); };
        const bindD = (id, key, fmt) => { const el = $(id), v = $(id + '-v'); el.value = D[key]; v.textContent = fmt(D[key]); el.oninput = () => { D[key] = parseFloat(el.value); v.textContent = fmt(D[key]); }; };
        bindD('design-size', 'size', x => x.toFixed(2) + 'mm'); bindD('design-weight', 'weight', x => x.toFixed(2)); bindD('design-hard', 'hard', x => x.toFixed(2)); bindD('design-value', 'value', x => x.toFixed(2));
        $('design-repeat').onchange = e => { D.repeat = parseInt(e.target.value, 10); };
        $('design-flow').onclick = () => { D.alongFlow = !D.alongFlow; $('design-flow').classList.toggle('active', D.alongFlow); };
        $('design-colour').oninput = e => setBrushColour(e.target.value);
        setTool('paint'); refreshValueRange(); setBrushColour('#7a8a3c');
    }
    function setTool(t) { D.tool = t; document.querySelectorAll('.tool-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === t)); hud('tool ' + t.toUpperCase()); }
    function refreshValueRange() { const d = E.FIELD_DEFS[D.layer]; if (!d) return; const el = $('design-value'); el.min = d.range[0]; el.max = d.range[1]; el.step = (d.range[1] - d.range[0]) / 200; if (D.value < d.range[0] || D.value > d.range[1]) { D.value = (d.range[0] + d.range[1]) / 2; el.value = D.value; $('design-value-v').textContent = D.value.toFixed(2); } }
    function hud(t) { const h = $('design-hud'); if (h) h.textContent = t; }

    // colour ↔ material: the picker's sRGB → linear → Lab → nearest LUT material; the swatch shows the reachable colour
    function setBrushColour(hex) {
        const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
        const lab = E.linToLab(E.srgbToLinear(r), E.srgbToLinear(g), E.srgbToLinear(b));
        const m = E.invertLut(lab[0], lab[1], lab[2], { wL: 0.8 }); if (!m) return;
        D.mat = { melanin: m.melanin, stroma: m.stroma, pheo: m.pheo, yellow: m.yellow };
        const sw = $('design-swatch'); if (sw) sw.style.background = labToCss(m.lab);
        hud(`brush material: mel ${m.melanin.toFixed(2)} stroma ${m.stroma.toFixed(2)} pheo ${m.pheo.toFixed(2)} yellow ${m.yellow.toFixed(2)} · ΔE to picked ${m.dE.toFixed(1)}`);
    }
    function labToCss(lab) {
        const fy = (lab[0] + 16) / 116, fx = fy + lab[1] / 500, fz = fy - lab[2] / 200, fi = t => t > 0.2069 ? t * t * t : (t - 16 / 116) / 7.787;
        const X = 0.9505 * fi(fx), Y = fi(fy), Z = 1.089 * fi(fz);
        const lin = [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.2040 * Y + 1.0570 * Z];
        const s = lin.map(c => { c = Math.max(0, Math.min(1, c)); return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)); });
        return `rgb(${s[0]},${s[1]},${s[2]})`;
    }

    // ---------------- DESIGN mode: fixed frontal camera, view-crop zoom + pan ----------------
    function setDesign(on) {
        D.on = on; state.design = on;
        const btn = $('design-toggle'); if (btn) { btn.textContent = on ? 'DESIGN ON' : 'DESIGN OFF'; btn.classList.toggle('active', on); }
        if (on) {
            D.saved = { zoom: state.zoomPhoto, view: state.view.slice(), useRot: state.useRot, rot: state.camRot.slice(), hippus: state.hippus };
            state.zoomPhoto = target.zoomPhoto = 70; state.view = [0, 0, 1, 1]; state.useRot = true; state.camRot = [0, 0]; state.hippus = false;
            canvas.style.cursor = 'none'; cursorEl().style.display = 'block'; if (window.__irisUI) window.__irisUI.showWindow('DESIGN', true); else showTab('DESIGN');
        } else {
            if (D.saved) { state.zoomPhoto = target.zoomPhoto = D.saved.zoom; state.view = D.saved.view; state.useRot = D.saved.useRot; state.camRot = D.saved.rot; state.hippus = D.saved.hippus; }
            canvas.style.cursor = ''; cursorEl().style.display = 'none'; D.map = null;
        }
        E.resetAccumulation();
    }
    function cursorEl() { let c = $('brush-cursor'); if (!c) { c = document.createElement('div'); c.id = 'brush-cursor'; document.body.appendChild(c); } return c; }
    // mm on the iris per canvas pixel at the current camera and view crop (the same formula the shader's mip level uses)
    function mmPerPx() { return (24 * state.view[3] / canvas.height) / 100 * (state.zoomPhoto + 3.5) / 1.1; }
    function zoomView(factor, cx, cy) {   // scale the view crop about a canvas point (fractions), clamped to 8×
        const v = state.view, s0 = v[2], s1 = Math.max(0.01, Math.min(1, s0 * factor));   // T2a (§32): one continuous zoom — 0.01 of the frame is ≈ 0.8 µm per screen pixel
        const fx = v[0] + cx * s0, fy = v[1] + cy * s0;              // image point under the cursor
        state.view = [fx - cx * s1, fy - cy * s1, s1, s1]; D.map = null; E.resetAccumulation();
    }

    // ---------------- the coordinate map of the main canvas (half resolution, cached per camera) ----------------
    let mapFB = null, mapTex = null, mapW = 0, mapH = 0, dummyTex = null;   // the read texture must never be the target (feedback loop → blank)
    function ensureMap() {
        const w = Math.max(64, Math.floor(canvas.width / 2)), h = Math.max(64, Math.floor(canvas.height / 2));
        const sig = [w, h, state.zoomPhoto, state.view.join(','), state.pupil, (state.pupilOff || []).join(','), (state.limb || []).join(',')].join('|');
        if (D.map && D.map.sig === sig) return D.map;
        if (!mapFB) { mapFB = gl.createFramebuffer(); mapTex = gl.createTexture(); dummyTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, dummyTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0])); }
        if (mapW !== w || mapH !== h) { gl.bindTexture(gl.TEXTURE_2D, mapTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, null); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); gl.bindFramebuffer(gl.FRAMEBUFFER, mapFB); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, mapTex, 0); gl.bindFramebuffer(gl.FRAMEBUFFER, null); mapW = w; mapH = h; }
        if (E.atlas.dirty) E.bakeAtlas();
        E.drawPhotoFrame(mapFB, w, h, 0, dummyTex, { ref: 1, rot: [0, 0], zoom: state.zoomPhoto, view: state.view, debug: 14, fstop: 64 });
        const px = new Float32Array(w * h * 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, mapFB); gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, px); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        D.map = { sig, w, h, px }; return D.map;
    }
    function hit(clientX, clientY) {   // canvas css point → (u, v) on the iris, or null
        const m = ensureMap(), r = canvas.getBoundingClientRect();
        const x = Math.floor((clientX - r.left) / r.width * m.w), yTop = (clientY - r.top) / r.height * m.h, y = Math.floor(m.h - 1 - yTop);
        if (x < 0 || y < 0 || x >= m.w || y >= m.h) return null;
        const o = (y * m.w + x) * 4; if (m.px[o + 2] < 0.5) return null;
        return { u: m.px[o], v: m.px[o + 1] };
    }

    // ---------------- brushes ----------------
    const rMM = v => 2 + 4 * v;
    const wrap = d => d - Math.round(d);
    function falloff(d, hard) { const e0 = Math.max(0, hard * 0.98); return d >= 1 ? 0 : (d <= e0 ? 1 : 1 - (d - e0) / (1 - e0)); }
    function pushUndo(entry) { D.undo.push(entry); if (D.undo.length > 40) D.undo.shift(); }
    function undo() {
        const e = D.undo.pop(); if (!e) { hud('nothing to undo'); return; }
        const g = E.genome;
        if (e.type === 'field') { g.fields[e.name].data.set(e.data); g.fields[e.name].custom = e.custom; }
        else if (e.type === 'splats') { if (!g.splats) g.splats = []; g.splats.length = Math.min(g.splats.length, e.len); }
        else if (e.type === 'paint') { if (!g.paintSplats) g.paintSplats = []; g.paintSplats.length = Math.min(g.paintSplats.length, e.len); }
        else if (e.type === 'all') { /* clear: nothing to restore beyond what later entries hold */ }
        E.atlas.dirty = true; E.resetAccumulation(); hud('undo (' + D.undo.length + ' left)');
    }
    // one dab of a field brush at (u, v) in field coords with pressure p
    function dabField(u, v, p, prev) {
        const g = E.genome, name = D.layer, f = g.fields[name]; if (!f) return;
        const [w, h] = E.GRIDS[E.FIELD_DEFS[name].grid], data = f.data, r = D.size / 2, hard = D.hard, k = D.weight * p;
        if (!f.custom) { const def = E.FIELD_DEFS[name].def(g.globals); data.fill(def); f.custom = true; }
        const rm = rMM(v), du = r / (6.2831853 * rm), dv = r / 4;
        const i0 = Math.floor((u - du) * w), i1 = Math.ceil((u + du) * w), j0 = Math.max(0, Math.floor((v - dv) * h)), j1 = Math.min(h - 1, Math.ceil((v + dv) * h));
        const sampleAt = (uu, vv) => { const x = ((uu * w - 0.5) % w + w) % w, y = Math.min(h - 1, Math.max(0, vv * h - 0.5)), x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, x1 = (x0 + 1) % w, y1 = Math.min(h - 1, y0 + 1); return (1 - fy) * ((1 - fx) * data[y0 * w + x0] + fx * data[y0 * w + x1]) + fy * ((1 - fx) * data[y1 * w + x0] + fx * data[y1 * w + x1]); };
        const snapshot = (D.tool === 'smear' || D.tool === 'smooth') ? Float32Array.from(data) : null;
        for (let j = j0; j <= j1; j++) for (let ii = i0; ii <= i1; ii++) {
            const i = ((ii % w) + w) % w, cu = (i + 0.5) / w, cv = (j + 0.5) / h;
            const dx = wrap(cu - u) * 6.2831853 * rm, dy = (cv - v) * 4, d = Math.hypot(dx, dy) / r; if (d >= 1) continue;
            const wgt = k * falloff(d, hard), c = j * w + i;
            if (D.tool === 'paint') data[c] += (D.value - data[c]) * wgt;
            else if (D.tool === 'add') data[c] += D.value * 0.15 * wgt;
            else if (D.tool === 'sub') data[c] -= D.value * 0.15 * wgt;
            else if (D.tool === 'smooth') { let s2 = 0, n = 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const jj = Math.min(h - 1, Math.max(0, j + dj)), iii = (i + di + w) % w; s2 += snapshot[jj * w + iii]; n++; } data[c] += (s2 / n - data[c]) * wgt; }
            else if (D.tool === 'smear' && prev) { const su = cu - (u - prev.u), sv = cv - (v - prev.v); const src = (() => { const x = ((su * w - 0.5) % w + w) % w, y = Math.min(h - 1, Math.max(0, sv * h - 0.5)), x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, x1 = (x0 + 1) % w, y1 = Math.min(h - 1, y0 + 1); return (1 - fy) * ((1 - fx) * snapshot[y0 * w + x0] + fx * snapshot[y0 * w + x1]) + fy * ((1 - fx) * snapshot[y1 * w + x0] + fx * snapshot[y1 * w + x1]); })(); data[c] += (src - data[c]) * wgt; }
            const [lo, hi] = E.FIELD_DEFS[name].range; data[c] = Math.max(lo, Math.min(hi, data[c]));
        }
    }
    // stamp brushes: a dab becomes a Gaussian (relief splat or paint splat)
    function dabStamp(u, v, p, prev) {
        const g = E.genome, sig = D.size / 2 / 1.5;   // the brush circle is ≈ ±1.5σ
        let th = 0, sa = sig, sb = sig;
        if (D.tool === 'streak' || D.alongFlow) {
            let dir = 0;   // angle from radial, rad
            if (D.alongFlow) { const f = g.fields.flowDir; const [w, h] = E.GRIDS.f; dir = f.data[Math.min(h - 1, Math.floor(v * h)) * w + (Math.floor(u * w) % w)]; }
            else if (prev) { const dx = wrap(u - prev.u) * 6.2831853 * rMM(v), dy = (v - prev.v) * 4; dir = Math.atan2(dx, dy); }
            th = dir; sa = sig * 0.5; sb = sig * 2.0;   // σa across, σb along the direction (θ rotates the local frame)
        }
        if (D.tool === 'color') {
            if (!g.paintSplats) g.paintSplats = [];
            // delta toward the brush material from the field's current value at this cell
            const [w, h] = E.GRIDS.c, c = Math.min(h - 1, Math.floor(v * h)) * w + (Math.floor(u * w) % w), k = D.weight * p * 0.5;
            const cur = { melanin: g.fields.melanin.data[c], stroma: g.fields.stroma.data[c], yellow: g.fields.yellow.data[c], pheo: g.fields.pheo.data[c] };
            g.paintSplats.push({ u: +u.toFixed(5), v: +v.toFixed(4), sa: +sa.toFixed(4), sb: +sb.toFixed(4), th: +th.toFixed(3), d: [(D.mat.melanin - cur.melanin) * k, (D.mat.stroma - cur.stroma) * k, (D.mat.yellow - cur.yellow) * k, (D.mat.pheo - cur.pheo) * k].map(x => +x.toFixed(4)) });
        } else {
            if (!g.splats) g.splats = [];
            const amp = (D.tool === 'bump' ? 0.03 : -0.04) * D.weight * p;   // mm of field; openings deepen 3× in the bake
            g.splats.push({ u: +u.toFixed(5), v: +v.toFixed(4), sa: +sa.toFixed(4), sb: +sb.toFixed(4), th: +th.toFixed(3), a: +amp.toFixed(4), tag: 'paint' });
        }
    }
    function dab(u, v, p, prev) {
        const isStamp = ['dent', 'bump', 'streak', 'color'].includes(D.tool);
        for (let k = 0; k < D.repeat; k++) { const uu = (u + k / D.repeat) % 1, pv = prev ? { u: (prev.u + k / D.repeat) % 1, v: prev.v } : null; if (isStamp) dabStamp(uu, v, p, pv); else dabField(uu, v, p, pv); }
        E.atlas.dirty = true; E.resetAccumulation();
    }
    // eyedropper: the render pixel under the cursor → Lab → nearest LUT material
    function pick(clientX, clientY) {
        const r = canvas.getBoundingClientRect(), x = Math.floor((clientX - r.left) / r.width * canvas.width), y = Math.floor((1 - (clientY - r.top) / r.height) * canvas.height);
        const px = new Uint8Array(4); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const lab = E.linToLab(E.srgbToLinear(px[0] / 255), E.srgbToLinear(px[1] / 255), E.srgbToLinear(px[2] / 255));
        const m = E.invertLut(lab[0], lab[1], lab[2], { wL: 0.8 }); if (!m) return;
        D.mat = { melanin: m.melanin, stroma: m.stroma, pheo: m.pheo, yellow: m.yellow };
        const sw = $('design-swatch'); if (sw) sw.style.background = labToCss(m.lab);
        const hex = '#' + [px[0], px[1], px[2]].map(c => c.toString(16).padStart(2, '0')).join(''); const ci = $('design-colour'); if (ci) ci.value = hex;
        hud(`picked Lab ${lab.map(x => x.toFixed(0)).join(',')} → mel ${m.melanin.toFixed(2)} stroma ${m.stroma.toFixed(2)} pheo ${m.pheo.toFixed(2)} yellow ${m.yellow.toFixed(2)}`);
    }

    // ---------------- pointer / keyboard ----------------
    const onUI = e => !!(e.target.closest && e.target.closest('#ui-panel, .w98, #w98-top, .w98-menu, .w31, [data-ui], #site-menu, #casebook'));   // the shell's windows live on body, not in #ui-panel (study/09 U0)
    function beginStroke(e) {
        const g = E.genome;
        if (['dent', 'bump', 'streak'].includes(D.tool)) pushUndo({ type: 'splats', len: (g.splats || []).length });
        else if (D.tool === 'color') pushUndo({ type: 'paint', len: (g.paintSplats || []).length });
        else { const f = g.fields[D.layer]; pushUndo({ type: 'field', name: D.layer, data: Float32Array.from(f.data), custom: f.custom }); }
        state.painting = true; E.atlas.draftBake = true; D.stroke = { last: null, lastPt: null };
        strokeMove(e);
    }
    function strokeMove(e) {
        if (!D.stroke) return;
        const h = hit(e.clientX, e.clientY); if (!h) return;
        const p = e.pressure && e.pointerType === 'pen' ? e.pressure : 1;
        const spacing = Math.max(0.02, D.size * 0.2);
        if (D.stroke.last) { const dx = wrap(h.u - D.stroke.last.u) * 6.2831853 * rMM(h.v), dy = (h.v - D.stroke.last.v) * 4; if (Math.hypot(dx, dy) < spacing) return; }
        dab(h.u, h.v, p, D.stroke.last); D.stroke.last = h;
        hud(`${D.tool.toUpperCase()} ${D.layer} · u ${h.u.toFixed(3)} v ${h.v.toFixed(3)} · r ${rMM(h.v).toFixed(2)} mm`);
    }
    function endStroke() { if (!D.stroke) return; D.stroke = null; state.painting = false; E.atlas.draftBake = false; E.atlas.dirty = true; E.resetAccumulation(); }
    window.addEventListener('pointerdown', e => {
        if (!D.on || e.button !== 0 || onUI(e)) return;
        if (D.space) { D.pan = { x: e.clientX, y: e.clientY, view: state.view.slice() }; return; }
        if (D.tool === 'pick' || e.altKey) { pick(e.clientX, e.clientY); return; }
        beginStroke(e);
    }, true);
    window.addEventListener('pointermove', e => {
        if (!D.on) return;
        const c = cursorEl(), r = canvas.getBoundingClientRect(), pxR = D.size / 2 / mmPerPx() / E.dpr;
        c.style.left = (e.clientX - pxR) + 'px'; c.style.top = (e.clientY - pxR) + 'px'; c.style.width = c.style.height = (2 * pxR) + 'px';
        if (D.pan) { const v = D.pan.view, s = v[2]; state.view = [v[0] - (e.clientX - D.pan.x) / r.width * s, v[1] + (e.clientY - D.pan.y) / r.height * s, s, s]; D.map = null; E.resetAccumulation(); return; }
        if (D.stroke) strokeMove(e); else if (!onUI(e)) { const h = hit(e.clientX, e.clientY); if (h) { const v = E.genome.fields[D.layer]; const [w, hh] = E.GRIDS[E.FIELD_DEFS[D.layer].grid]; const val = v ? v.data[Math.min(hh - 1, Math.floor(h.v * hh)) * w + (Math.floor(h.u * w) % w)] : 0; hud(`${D.layer} ${val.toFixed(3)} · u ${h.u.toFixed(3)} v ${h.v.toFixed(3)} · r ${rMM(h.v).toFixed(2)} mm · size ${D.size.toFixed(2)} mm`); } }
    }, true);
    window.addEventListener('pointerup', e => { if (D.pan) { D.pan = null; return; } endStroke(); }, true);
    window.addEventListener('wheel', e => { if (!D.on || onUI(e)) return; const r = canvas.getBoundingClientRect(); zoomView(1 + e.deltaY * 0.0015, (e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height); }, { passive: true });
    window.addEventListener('keydown', e => {
        if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) && e.key !== 'Escape') return;
        if (e.code === 'Space') { D.space = true; if (D.on) e.preventDefault(); }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { if (D.on) { undo(); e.preventDefault(); } return; }
        if (e.key === 'd' || e.key === 'D') setDesign(!D.on);
        if (!D.on) return;
        const map = { b: 'paint', a: 'add', x: 'sub', s: 'smooth', m: 'smear', n: 'dent', u: 'bump', k: 'streak', c: 'color', i: 'pick' };
        if (map[e.key]) setTool(map[e.key]);
        if (e.key === '[') { D.size = Math.max(0.05, D.size / 1.25); $('design-size').value = D.size; $('design-size-v').textContent = D.size.toFixed(2) + 'mm'; }
        if (e.key === ']') { D.size = Math.min(2.5, D.size * 1.25); $('design-size').value = D.size; $('design-size-v').textContent = D.size.toFixed(2) + 'mm'; }
        if (e.key === 'Escape') { state.view = [0, 0, 1, 1]; D.map = null; E.resetAccumulation(); }
    });

    layoutTabs(); buildDesignTab();
    E.design = { D, setDesign, setTool, hit, dab, undo, ensureMap, setBrushColour, pick, zoomView, showTab };
})();
