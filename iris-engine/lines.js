// lines.js — the Strands layer of the photo overlay (study/11 §5.6 P1, iori 2026-09-28: "we are going to work on the traced
// lines with colourful bolder lines"). Every curve the fitter traced in the loaded eye, drawn bold over the photograph, by
// CLASS (default) or one hue per strand, at any overlay zoom — the view iori judges detection in, today's first (the baseline
// the new 2-D detector is compared against), the new detector's later. Loaded by ui31.js after overlay.js.
//
// Geometry: the eye file's curves live in its own export frame (T.src.fit, 1280 × 925 for the four eyes); the overlay's
// #w31-ov box is exactly the photo's frame on screen at the current zoom and pan, so a point maps as
//   screen = box.left + x / fit[0] · box.width,  box.top + y / fit[1] · box.height.
// The canvas is the viewport's size (the box itself is 30 000 px wide at full zoom), redrawn when the box moves, the eye
// changes or a setting does; only curves whose bounds meet the screen are drawn. Nothing here touches the render or a score.
(() => {
    const E = window.__irisEngine, U = window.__irisUI, T = window.IrisTissue, O = window.__irisOverlay;
    if (!E || !U || !T || !O || window.__irisLines) return;
    const F = E.fit, fit = F.fit, state = E.state, $ = id => document.getElementById(id);
    const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

    // the classes of today's detection (tools/layer_proof.py): which set, and how it reads. Furrows are not detected yet — the
    // legend says so rather than hiding the class.
    const CLASSES = [
        { key: 'edge',    label: 'Crypt edge',      col: '#ffffff', sets: ['outlines'], pick: c => !c.island, dash: [] },
        { key: 'septum',  label: 'Septum / island', col: '#b9c4d0', sets: ['outlines'], pick: c => !!c.island, dash: [6, 4] },
        { key: 'deck',    label: 'Crypt strand',    col: '#1fe3ff', sets: ['fibres'] },
        { key: 'valley',  label: 'Crypt valley',    col: '#a066ff', sets: ['veins'] },
        { key: 'guide',   label: 'Plateau strand',  col: '#35f06a', sets: ['guides'] },
        { key: 'fine',    label: 'Fine strand',     col: '#d4ff3a', sets: ['sfib'] },
        { key: 'pvalley', label: 'Plateau valley',  col: '#ff4fd2', sets: ['svein'] },
        { key: 'ruff',    label: 'Ruff / margin',   col: '#ff8a1f', sets: ['beads', 'margin'] },
        { key: 'bridge',  label: 'Bridge (rule)',   col: '#fff23a', sets: [] },
        { key: 'join',    label: 'Root joins',      col: '#ffffff', sets: [] },
        { key: 'free',    label: 'Free ends',       col: '#ff3030', sets: [] },
        { key: 'furrow',  label: 'Furrow',          col: '#ff5a3c', sets: [] },
    ];
    const L = window.__irisLines = { on: false, terrain: false, fill: 0.45, tshow: {}, mode: 'class', width: 'uniform', weight: 1, alpha: 0.9, show: Object.fromEntries(CLASSES.map(c => [c.key, !['fine', 'pvalley', 'join'].includes(c.key)])), CLASSES };

    const cv = h('canvas'); cv.id = 'w31-ov-lines'; cv.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;z-index:41;display:none';
    document.body.appendChild(cv); const g = cv.getContext('2d');
    const box = $('w31-ov');

    // ---- the eye's curves, prepared once per loaded eye: fit-frame points, bounds, width (mm), class, strand id -----------
    let src = null, items = [], counts = {}, marks = [];
    const hue = n => `hsl(${(n * 137.508) % 360} 95% 62%)`;
    function prepare() {
        src = T.src; items = []; counts = Object.fromEntries(CLASSES.map(c => [c.key, 0])); marks = [];
        if (!src || !src.fit) return;
        const med = a => { if (!a || !a.length) return 0; const b = Float32Array.from(a).sort(); return b[b.length >> 1]; };
        const add = (xy, cls, wMm, sid, closed) => {
            if (!xy || xy.length < 2) return; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
            for (const p of xy) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
            items.push({ xy, cls, wMm, sid, closed, b: [x0, y0, x1, y1] }); counts[cls]++; };
        const R = src.roots || {}, rootOf = {};                                   // a fibre's root chain: one hue per chain in the strand view
        (R.roots || []).forEach((r, i) => r.fibres.forEach(f => { rootOf[Array.isArray(f) ? f[0] : f] = 'r' + i; }));
        const bridged = new Set(); (R.bridges || []).forEach(b => (b.fibres || [b.fibre]).forEach(f => bridged.add(f)));
        for (const C of CLASSES) for (const set of C.sets) {
            let list = set === 'margin' ? (src.margin && src.margin.xy ? [{ xy: src.margin.xy, closed: true }] : []) : (src[set] || []);
            if (set === 'fibres' && src.__beadsIn && src.beads) list = list.slice(0, list.length - src.beads.length);   // tissue.js appends the ruff's beads to the fibres on load
            list.forEach((c, i) => { if (C.pick && !C.pick(c)) return;
                const w = set === 'outlines' ? 0.012 : set === 'margin' ? 0.02 : 1.18 * med(c.w);   // a ridge's full width at half maximum is 1.18 w (study/11 §5.2.3)
                add(c.xy, C.key, w, set === 'fibres' ? (rootOf[i] || 'f' + i) : set + i, set === 'outlines' || c.closed); });
        }
        const fib = src.fibres || [];
        for (const f of bridged) if (fib[f]) add(fib[f].xy, 'bridge', 1.18 * med(fib[f].w) + 0.02, rootOf[f] || 'f' + f);
        const endPt = (f, e) => { const q = fib[f] && fib[f].xy; return q ? q[e ? q.length - 1 : 0] : null; };
        for (const k of R.links || []) { const a = endPt(k.a[0], k.a[1]), b = endPt(k.b[0], k.b[1]); if (a && b) { add([a, b], 'join', 0.01, 'j'); } }
        (R.ends || []).forEach((pair, f) => pair.forEach((kind, e) => { if (kind === 'free') { const p = endPt(f, e); if (p) { marks.push({ p, cls: 'free' }); counts.free++; } } }));
        (R.branches || []).forEach(b => { const q = fib[b.into[0]] && fib[b.into[0]].xy; if (q && q[b.into[1]]) marks.push({ p: q[b.into[1]], cls: 'join', ring: true }); });
        L.counts = counts; buildLegend(); timg = null; if (L.terrain) computeTerrain();
    }
    // the terrain (terrain.js): computed per eye when first shown, its fill image rebuilt when a type is shown or hidden
    let timg = null;
    function computeTerrain() { const TR = window.__irisTerrain; if (!TR || !src) return; try { if (!TR.last || TR.last.eye !== src.ref || TR.last.src !== src) { TR.compute(); TR.last.src = src; } timg = TR.image(L.tshow); } catch (e) { U.say('Terrain: ' + e.message); timg = null; } buildTerrainLegend(); }

    // ---- drawing ------------------------------------------------------------------------------------------------------------
    let lastKey = '';
    function draw(force) {
        const show = (L.on || L.terrain) && O.mode !== 'off' && box && box.style.display !== 'none';
        cv.style.display = show ? 'block' : 'none'; if (!show) { lastKey = ''; return; }
        if (T.src !== src) prepare(); if (!src) return;
        const r = box.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1), W = innerWidth, H = innerHeight;
        const key = [r.left, r.top, r.width, r.height, W, H, L.on, L.terrain, L.fill, !!timg, L.mode, L.width, L.weight, L.alpha, JSON.stringify(L.show), JSON.stringify(L.tshow), items.length].join();
        if (!force && key === lastKey) return; lastKey = key;
        if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px'; }
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); g.setTransform(dpr, 0, 0, dpr, 0, 0);
        paint(g, r, W, H);
    }
    // the lines of the loaded eye into context g, the photo's frame at r = { left, top, width, height } in a W × H target
    function paint(g, r, W, H, o = {}) {
        const sx = r.width / src.fit[0], sy = r.height / src.fit[1];
        if ((o.terrain !== undefined ? o.terrain : L.terrain) && timg) { g.save(); g.globalAlpha = L.fill; g.imageSmoothingEnabled = true; g.drawImage(timg, r.left, r.top, r.width, r.height); g.restore(); }
        if (!(o.lines !== undefined ? o.lines : L.on)) return;
        const Lb = fit.limbus, lim = state.limb || [5.85, 5.40];                  // screen px per mm: the limbus in fit px against its size in mm
        const pxPerMm = Lb && fit.W ? (0.5 * (Lb.rx + Lb.ry)) / (0.5 * (lim[0] + lim[1])) * (r.width / fit.W) : sx * 45;
        const vis = it => { const b = it.b; return r.left + b[2] * sx >= -20 && r.left + b[0] * sx <= W + 20 && r.top + b[3] * sy >= -20 && r.top + b[1] * sy <= H + 20; };
        const col = it => L.mode === 'strand' && !['edge', 'septum', 'join'].includes(it.cls) ? hue(hash(it.sid)) : CLASSES.find(c => c.key === it.cls).col;
        // uniform (default): every line the same few pixels, so continuity and coverage read at any zoom; measured: the strand's own
        // width on screen (never under the uniform line), for judging thickness — the bridges' criterion
        const thin = it => it.cls === 'edge' || it.cls === 'septum' || it.cls === 'join' ? 1.6 : 2.4;
        const widthOf = it => (L.width === 'measured' ? Math.max(thin(it), it.wMm * pxPerMm) : thin(it) * (it.cls === 'bridge' ? 1.6 : 1)) * L.weight;
        const order = ['pvalley', 'valley', 'fine', 'guide', 'deck', 'ruff', 'septum', 'edge', 'bridge', 'join'];
        const todo = items.filter(it => L.show[it.cls] && vis(it)).sort((a, b) => order.indexOf(a.cls) - order.indexOf(b.cls));
        const path = it => { g.beginPath(); const q = it.xy; g.moveTo(r.left + q[0][0] * sx, r.top + q[0][1] * sy); for (let i = 1; i < q.length; i++) g.lineTo(r.left + q[i][0] * sx, r.top + q[i][1] * sy); if (it.closed) g.closePath(); };
        g.lineCap = 'round'; g.lineJoin = 'round'; g.globalAlpha = L.alpha;
        for (const pass of [0, 1]) for (const it of todo) {                                   // a dark casing under every line first, then the colours
            const w = widthOf(it), C = CLASSES.find(c => c.key === it.cls); path(it);
            g.setLineDash(pass && C.dash ? C.dash.map(d => d * L.weight) : []);
            g.strokeStyle = pass ? col(it) : 'rgba(0,0,0,0.6)'; g.lineWidth = pass ? w : w + 2.2; g.stroke(); }
        g.setLineDash([]);
        for (const m of marks) { if (!L.show[m.cls]) continue; const x = r.left + m.p[0] * sx, y = r.top + m.p[1] * sy; if (x < -10 || y < -10 || x > W + 10 || y > H + 10) continue;
            const rr = (m.ring ? 2.6 : 3.2) * Math.max(1, L.weight); g.beginPath(); g.arc(x, y, rr, 0, 6.2832);
            if (m.ring) { g.strokeStyle = '#000'; g.lineWidth = 3; g.stroke(); g.strokeStyle = CLASSES.find(c => c.key === 'join').col; g.lineWidth = 1.4; g.stroke(); }
            else { g.fillStyle = CLASSES.find(c => c.key === m.cls).col; g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1; g.stroke(); } }
        g.globalAlpha = 1;
    }
    // a review sheet (the study's record): the photograph and its lines, off-screen at any size. at = the centre in the export
    // frame's units (src.fit), span = how much of the frame's HEIGHT it shows. → a canvas.
    L.sheet = async (o = {}) => {
        if (T.src !== src) prepare(); if (!src || !fit.img) throw new Error('load an eye with its photograph first');
        if (o.terrain && !timg) { const was = L.terrain; L.terrain = true; computeTerrain(); L.terrain = was; }
        const W = o.w || 1600, H = o.h || 1100, fw = src.fit[0], fh = src.fit[1], at = o.at || [fw / 2, fh / 2], span = o.span || 1;
        const k = H / (span * fh), r = { left: W / 2 - at[0] * k, top: H / 2 - at[1] * k, width: fw * k, height: fh * k };
        const c = document.createElement('canvas'); c.width = W; c.height = H; const cx = c.getContext('2d');
        cx.fillStyle = '#000'; cx.fillRect(0, 0, W, H); cx.imageSmoothingQuality = 'high'; cx.drawImage(fit.img, r.left, r.top, r.width, r.height);
        if (o.lines !== false) { const keep = {}; for (const q of ['mode', 'width', 'weight', 'alpha']) if (o[q] !== undefined) { keep[q] = L[q]; L[q] = o[q]; }
            const ks = L.show; if (o.show) L.show = Object.assign({}, L.show, o.show); paint(cx, r, W, H, { lines: true, terrain: !!o.terrain }); L.show = ks; Object.assign(L, keep); }
        else if (o.terrain) paint(cx, r, W, H, { lines: false, terrain: true });
        if (o.label) { cx.font = '600 22px sans-serif'; cx.fillStyle = 'rgba(0,0,0,.65)'; const tw = cx.measureText(o.label).width; cx.fillRect(0, 0, tw + 24, 36); cx.fillStyle = '#fff'; cx.fillText(o.label, 12, 26); }
        return c;
    };
    // a legend strip for sheets: the classes shown, with their counts
    L.legendSheet = (w = 1600) => { const c = document.createElement('canvas'); c.width = w; c.height = 44; const cx = c.getContext('2d'); cx.fillStyle = '#111'; cx.fillRect(0, 0, w, 44); cx.font = '17px sans-serif'; let x = 12;
        for (const C of CLASSES) { if (!L.show[C.key]) continue; cx.fillStyle = C.col; cx.fillRect(x, 16, 26, 8); cx.fillStyle = '#eee'; const t = `${C.label} ${counts[C.key] || 0}`; cx.fillText(t, x + 32, 27); x += 32 + cx.measureText(t).width + 22; } return c; };
    const hash = s => { let a = 2166136261; for (let i = 0; i < s.length; i++) { a ^= s.charCodeAt(i); a = Math.imul(a, 16777619); } return (a >>> 0) % 997; };

    // ---- turning it on: the layer needs the photo's frame, so the overlay comes on with it (the Tissue window's Load brings the
    // eye's photo when the page arrived without one — the start eye ships its measurements and loads no photo)
    async function ensurePhoto(what) {
        const X = window.__irisTissueUI;
        if (!(fit.photo && !fit.photoless)) {
            if (!X || !T.src) { U.say(what + ': load an eye first (Tissue ▸ Load)'); return false; }
            U.say(`${what}: loading eye ${X.eye}'s photograph…`); await X.load();
            if (!(fit.photo && !fit.photoless)) { U.say(what + ': the photograph did not load'); return false; }
        }
        if (O.mode === 'off') O.set('photo'); return true;
    }
    L.set = async on => {
        L.on = !!on; sync();
        if (!L.on) { draw(); return; }
        if (!(await ensurePhoto('Lines'))) { L.on = false; sync(); return; }
        prepare(); draw(true);
    };
    L.setTerrain = async on => {
        L.terrain = !!on; sync();
        if (!L.terrain) { draw(); return; }
        if (!(await ensurePhoto('Terrain'))) { L.terrain = false; sync(); return; }
        U.say('Terrain: partitioning the iris…'); await new Promise(r => setTimeout(r, 30));
        if (T.src !== src) prepare(); else computeTerrain(); draw(true);
        const TR = window.__irisTerrain; if (TR && TR.last) U.say(`Terrain: ${Object.values(TR.last.stats).reduce((a, s) => a + s.sections, 0)} sections in ${TR.last.ms} ms`);
    };

    // ---- the controls, in the Fit window, under the overlay's -----------------------------------------------------------------
    let legend = null, btn = null, modeBtn = null, widthBtn = null, tBtn = null, tlegend = null;
    function sync() { if (tBtn) tBtn.classList.toggle('on', L.terrain); if (btn) btn.classList.toggle('on', L.on); if (modeBtn) modeBtn.textContent = L.mode === 'class' ? 'Colour: class' : 'Colour: strand'; if (widthBtn) widthBtn.textContent = L.width === 'uniform' ? 'Width: even' : 'Width: measured'; }
    function buildTerrainLegend() {
        if (!tlegend) return; tlegend.innerHTML = ''; const TR = window.__irisTerrain; if (!TR) return; const st = TR.last && TR.last.src === src ? TR.last.stats : null;
        for (const t of TR.TYPES) { if (!t) continue; const on = L.tshow[t.key] !== false, b = h('button', 'w31-b' + (on ? ' on' : '')), s_ = st && st[t.key];
            b.style.cssText = `flex:1 0 46%;display:flex;align-items:center;gap:5px;justify-content:flex-start;text-align:left;opacity:${on ? 1 : 0.5}`;
            b.innerHTML = `<i style="display:inline-block;width:14px;height:10px;background:rgb(${t.col.join(',')});outline:1px solid #000;flex:none"></i><span style="flex:1">${t.label}</span><span style="opacity:.7">${s_ ? s_.sections + ' · ' + s_.pct + '%' : '—'}</span>`;
            b.title = { bridge: 'plateau with crypt on both sides within the undercut\'s reach: no base under it (study/11 §5.4)', flank: 'beside a crypt edge and darker than the plateau around it: the shadowed slope', collarette: 'the genome\'s collarette, its half-maximum band' }[t.key] || '';
            b.onclick = () => { L.tshow[t.key] = !on; timg = window.__irisTerrain.image(L.tshow); buildTerrainLegend(); draw(); };
            tlegend.appendChild(b); }
    }
    function buildLegend() {
        if (!legend) return; legend.innerHTML = '';
        for (const C of CLASSES) { const n = counts[C.key] || 0, b = h('button', 'w31-b' + (L.show[C.key] ? ' on' : ''));
            b.style.cssText = 'flex:1 0 46%;display:flex;align-items:center;gap:5px;justify-content:flex-start;text-align:left';
            b.innerHTML = `<i style="display:inline-block;width:14px;height:5px;background:${C.col};outline:1px solid #000;flex:none"></i><span style="flex:1">${C.label}</span><span style="opacity:.7">${n || '—'}</span>`;
            b.title = C.key === 'furrow' ? 'not detected yet — the 2-D detector (study/11 §5.6 P3–P4) adds this class' : C.key === 'bridge' ? 'the separator rule (roots.py): known to pick deck strands, not iori\'s bridges — shown as today\'s baseline' : '';
            const look = () => { b.classList.toggle('on', L.show[C.key]); b.style.opacity = L.show[C.key] ? 1 : 0.5; }; look();
            b.onclick = () => { L.show[C.key] = !L.show[C.key]; look(); draw(); };
            legend.appendChild(b); }
    }
    { const W = U.WINS ? U.WINS.find(w => w.key === 'fit') : null, host = W ? W.body : ($('fit-panel') || document.body);
        const grp = h('div', 'w31-grp', '<b>Traced lines</b>'), row = h('div', 'w31-brow');
        btn = h('button', 'w31-b', 'Lines'); btn.id = 'w31-lines-btn'; btn.onclick = () => L.set(!L.on);
        modeBtn = h('button', 'w31-b'); modeBtn.onclick = () => { L.mode = L.mode === 'class' ? 'strand' : 'class'; sync(); draw(); };
        widthBtn = h('button', 'w31-b'); widthBtn.onclick = () => { L.width = L.width === 'uniform' ? 'measured' : 'uniform'; sync(); draw(); };
        row.appendChild(btn); row.appendChild(modeBtn); row.appendChild(widthBtn); grp.appendChild(row);
        const scrub = (label, key, min, max, step) => { const inp = document.createElement('input'); inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = L[key]; const val = h('span'); val.textContent = (+L[key]).toFixed(2);
            inp.addEventListener('input', () => { L[key] = +inp.value; val.textContent = L[key].toFixed(2); draw(); }); grp.appendChild(U.makeScrubber ? U.makeScrubber(inp, label, val) : inp); };
        scrub('WEIGHT', 'weight', 0.4, 4, 0.05); scrub('OPACITY', 'alpha', 0.1, 1, 0.01);
        legend = h('div', 'w31-brow'); grp.appendChild(legend);
        const trow = h('div', 'w31-brow'); tBtn = h('button', 'w31-b', 'Terrain'); tBtn.id = 'w31-terrain-btn'; tBtn.onclick = () => L.setTerrain(!L.terrain); trow.appendChild(tBtn); grp.appendChild(trow);
        scrub('FILL', 'fill', 0.05, 1, 0.01);
        tlegend = h('div', 'w31-brow'); grp.appendChild(tlegend);
        const ovg = host.querySelector('.w31-grp'); host.insertBefore(grp, ovg ? ovg.nextSibling : host.firstChild);
        sync(); buildLegend(); buildTerrainLegend(); }

    // the box moves with every zoom, pan and resize: follow it (rAF while visible; a timer for a hidden pane)
    (function tick() { draw(); requestAnimationFrame(tick); })();
    setInterval(() => draw(), 250);
    window.addEventListener('resize', () => draw(true));
})();
