// tissue-ui.js — the Tissue window (study/10 §7; the layout iori approved: study/tissue-window-mock.html, 2026-09-21).
// Loaded by ui31.js after overlay.js. It fills the shell's `tissue` window and is the only hand on the layer model:
// load (eye 26 only, said so), on / off, Inspect (Point · Section · Contours on the live iris), Probe (a camera standing
// in the tissue; tap the iris to place it, drag its view to look around), Dials (collapsed behind their page button).
// Engine API only — IrisTissue.proof / atUV / sectionUV / heightField / probe; no shader, no fit.js. Its state lives
// here, never in the engine's `state`. The live view is mapped to tissue (u, v) by the engine's own coordinate map
// (debug view 14) rendered at the live camera, so the tools read what is on screen, at any zoom.
(() => {
    const E = window.__irisEngine, U = window.__irisUI, T = window.IrisTissue, O = window.__irisOverlay;
    if (!E || !U || !T || U.shell !== '3.11' || window.__irisTissueUI) return;
    const W = U.WINS.find(w => w.key === 'tissue'); if (!W) return;
    const F = E.fit, fit = F.fit, state = E.state, gl = E.gl, cv = E.canvas, $ = id => document.getElementById(id);
    const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
    const CASE = '26-green-crypts-isolated.jpg', SRC = 'data/tissue-26.json';
    // study/11 S3: the arrival's files — the eye's own case (no photo, not the 5 MB ref/cases.json) and its measurements
    const CASE1 = 'data/case-26.json', CAL = 'data/tissue-26.cal.bin';
    const X = window.__irisTissueUI = { loading: false, st: 'none', page: 'inspect', tool: 'point', probe: { uv: null, heightUm: 150, yaw: 20, pitch: -14, fov: 75, contourUm: 25, mode: 'clay' } };
    let eyeAt = null, avail = null, cases = null, prog = [0, 1, ''];

    // ---------------------------------------------------------------------------------------------------------
    // the window
    // ---------------------------------------------------------------------------------------------------------
    W.body.innerHTML = `
      <div data-st="loaded"><div class="t-row t-top"><button class="t-chk" id="w31t-on"><i></i>Layer model</button><span class="t-score" id="w31t-score"></span></div>
        <div class="t-note">Measured from the photograph of <b>eye 26</b> — the only eye with a layer model so far (09, 25 and 35 follow in T7). <span id="w31t-stats"></span></div></div>
      <div data-st="loading"><div class="t-note">Loading the layer model of <b>eye 26</b>…</div><div class="t-prog"><b id="w31t-bar"></b></div><div class="t-stage" id="w31t-stage"></div></div>
      <div data-st="none"><div class="t-note">The layer model is the measured tissue of one photographed eye: its holes, the fibres with their veins, the sheet's guides, the ruff. <b>Only eye 26 has one so far</b> (09, 25, 35 in T7). Loading it puts eye 26 on the screen.</div>
        <div class="w31-brow" style="margin:0"><button class="w31-b def" id="w31t-load">Load eye 26</button></div></div>
      <div data-st="other"><div class="t-note warn">This eye has no layer model — the one loaded belongs to <b>eye 26</b>, so it is switched off. Only eye 26 has one so far (09, 25, 35 in T7).</div>
        <div class="w31-brow" style="margin:0"><button class="w31-b" id="w31t-switch">Switch to eye 26 and load</button></div></div>
      <div data-st="unavailable"><div class="t-note warn">The layer model of eye 26 is not published on this site yet (its primitives are 4.9 MB, and the reference photograph it is measured on is not public). It runs on the development copy.</div></div>
      <div data-st="error"><div class="t-note warn" id="w31t-err"></div><div class="w31-brow" style="margin:0"><button class="w31-b" id="w31t-retry">Try again</button></div></div>
      <div data-st="loaded" id="w31t-pages">
        <div class="t-pages"><button class="w31-b" data-p="inspect" id="w31t-p-inspect">Inspect</button><button class="w31-b" data-p="probe" id="w31t-p-probe">Probe</button><button class="w31-b" data-p="dials" id="w31t-p-dials">Dials</button></div>
        <div class="t-page" data-p="inspect">
          <div class="w31-brow" style="margin:0"><button class="w31-b" data-tool="point">Point</button><button class="w31-b" data-tool="section">Section</button><button class="w31-b" data-tool="contours">Contours</button></div>
          <div class="t-sunk t-read" id="w31t-read"></div>
          <canvas class="t-sunk" id="w31t-sec"></canvas>
          <div class="t-legend" id="w31t-legend"><span style="--c:#c0c0c0">tissue</span><span style="--c:#fff">fibre</span><span style="--c:#000080">fibre under a fibre</span><span style="--c:#ffff00">here</span></div>
          <div class="t-hint" id="w31t-hint"></div>
        </div>
        <div class="t-page" data-p="probe">
          <canvas class="t-sunk" id="w31t-probe"></canvas>
          <div class="w31-brow"><button class="w31-b" data-m="clay">Clay</button><button class="w31-b" data-m="elevation">Elevation</button><button class="w31-b" data-m="albedo">Albedo</button><button class="w31-b" data-m="height">Height</button></div>
          <div id="w31t-pscrubs"></div>
          <div class="t-hint">Tap the iris to put the camera there · drag the view to look around · HEIGHT below 0 goes down into a canyon.</div>
        </div>
        <div class="t-page" data-p="dials">
          <div class="w31-grp" style="margin-top:4px"><b>Height</b><div id="w31t-dh"></div></div>
          <div class="w31-grp"><b>Shading</b><div class="t-row"><button class="t-chk" data-flag="k1"><i></i>Knobs offset the fit (K1)</button></div><div class="t-row"><button class="t-chk reload" data-flag="delight"><i></i>Measured shading (de-light)</button></div><div id="w31t-ds"></div></div>
          <div class="w31-grp"><b>Pupil margin</b><div class="t-row" style="margin-top:0"><button class="t-chk reload" data-flag="margin"><i></i>Traced margin</button></div><div id="w31t-dm"></div></div>
          <div class="t-hint">&#8635; reaches the coordinate system or the calibration: applied when you stop, by re-loading the model (≈ 6 s).</div>
          <div class="w31-brow"><button class="w31-b" id="w31t-defaults">Defaults</button><button class="w31-b" id="w31t-reload">Re-load</button></div>
        </div>
      </div>`;
    const q = s => W.body.querySelector(s), qa = s => [...W.body.querySelectorAll(s)];

    // dials: every one but K1 is read in load / calibrate / bake, so it applies by a re-load when the hand stops (handoff
    // §4: such a dial "cannot be swept by re-rendering"); K1 is a uniform and applies at once
    const DEF = { deckZ: T.deckZ, sheetZ: T.sheetZ, wallZ: T.wallZ, srelAmt: T.srelAmt, k1: T.k1, delight: T.delight, margin: T.margin, marginKeep: T.marginKeep, marginRound: T.marginRound, margFade: T.margFade };
    let reloadT = null; const soon = () => { clearTimeout(reloadT); reloadT = setTimeout(() => X.reload(), 700); };
    function dial(box, label, key, min, max, step, fmt, def) {
        const inp = document.createElement('input'); inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = T[key] === undefined ? def : T[key];
        const v = h('span'); const show = () => { v.textContent = fmt(+inp.value); }; show();
        inp.addEventListener('input', () => { T[key] = +inp.value; show(); soon(); });
        const row = U.makeScrubber(inp, label, v); row.classList.add('reload'); row._key = key; row._inp = inp; row._show = show; $(box).appendChild(row); return row; }
    const f2 = x => x.toFixed(2);
    const DIALS = [dial('w31t-dh', 'DECK Z', 'deckZ', 0, 2, 0.05, f2), dial('w31t-dh', 'SHEET Z', 'sheetZ', 0, 1, 0.05, f2), dial('w31t-dh', 'WALL Z', 'wallZ', 1, 4, 0.1, x => x.toFixed(1) + '×', 2.5),
        dial('w31t-ds', 'AMOUNT', 'srelAmt', 0, 1, 0.05, f2), dial('w31t-dm', 'KEEP', 'marginKeep', 0, 8, 1, x => x + ' harm.'), dial('w31t-dm', 'ROUND', 'marginRound', 0, 1, 0.05, f2), dial('w31t-dm', 'FADE', 'margFade', 0, 0.2, 0.01, f2)];
    qa('[data-flag]').forEach(b => b.onclick = () => { const k = b.dataset.flag;
        if (k === 'delight') T.delight = T.delight ? 0 : 1; else if (k === 'margin') T.margin = T.margin === false; else T[k] = !T[k];
        sync(); if (k === 'k1') E.resetAccumulation(); else soon(); });
    q('#w31t-defaults').onclick = () => { Object.assign(T, DEF); DIALS.forEach(r => { const k = r._key; r._inp.value = T[k] === undefined ? (k === 'wallZ' ? 2.5 : 0) : T[k]; r._show(); r._draw && r._draw(); }); sync(); X.reload(); };
    q('#w31t-reload').onclick = () => X.reload();

    // probe controls
    const PS = X.probe, pdial = (label, key, min, max, step, fmt) => { const inp = document.createElement('input'); inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = PS[key];
        const v = h('span'); const show = () => { v.textContent = fmt(+inp.value); }; show(); inp.addEventListener('input', () => { PS[key] = +inp.value; show(); probeDraw(); marks(); });
        const row = U.makeScrubber(inp, label, v); row._key = key; row._inp = inp; row._show = show; $('w31t-pscrubs').appendChild(row); return row; };
    const um = x => (x >= 0 ? '+' : '') + Math.round(x) + ' µm', deg = x => Math.round(x) + '°';
    const PDIALS = [pdial('HEIGHT', 'heightUm', -300, 800, 5, um), pdial('YAW', 'yaw', -180, 180, 1, deg), pdial('PITCH', 'pitch', -80, 30, 1, deg), pdial('FOV', 'fov', 30, 110, 1, deg), pdial('LINES', 'contourUm', 0, 100, 5, x => x ? Math.round(x) + ' µm' : 'off')];
    const pset = (key, val) => { PS[key] = val; const r = PDIALS.find(r => r._key === key); if (r) { r._inp.value = val; r._show(); r._draw && r._draw(); } };

    qa('.t-pages [data-p]').forEach(b => b.onclick = () => X.go(b.dataset.p));
    qa('[data-tool]').forEach(b => b.onclick = () => X.go('inspect', b.dataset.tool));
    qa('[data-m]').forEach(b => b.onclick = () => { PS.mode = b.dataset.m; sync(); probeDraw(); });
    q('#w31t-on').onclick = () => X.toggle();
    q('#w31t-load').onclick = () => X.load(); q('#w31t-switch').onclick = () => X.load(); q('#w31t-retry').onclick = () => X.load();

    // ---------------------------------------------------------------------------------------------------------
    // the model: load (eye 26's case → the primitives, staged), on / off, the eye it belongs to
    // ---------------------------------------------------------------------------------------------------------
    async function available() {
        if (avail !== null) return avail;
        try { const [a, b] = await Promise.all([fetch(SRC, { method: 'HEAD' }), fetch('ref/' + CASE, { method: 'HEAD' })]); avail = a.ok && b.ok; } catch (e) { avail = false; }
        return avail; }
    X.ready = () => X.st === 'loaded' && !X.loading;
    X.canLoad = () => !X.loading && avail !== false;
    X.canToggle = () => X.st === 'loaded' && !X.loading;
    X.loadLabel = () => X.st === 'loaded' ? 'Re-load eye &26' : X.st === 'other' ? 'Switch to eye &26 and load' : 'Load eye &26';
    // opts.arrival (the start eye): the eye's case file, its frame without the photograph, the shipped measurements —
    // anything that does not apply falls back to measuring inside proof(). Without it (the Load button, a dial, iori D2):
    // the photograph, and the light and shading measured on this device, as before.
    X.load = async (opts = {}) => {
        if (X.loading) return; if (!(await available())) { X.st = 'unavailable'; sync(); return; }
        X.loading = true; X.st = 'loading'; prog = [0, 7, 'the photograph of eye 26']; if (!X.quietOpen) U.showWindow('tissue', true); sync();
        // study/10 S0: every load records where its time goes (Help ▸ Load timing shows it, on any device)
        const t0 = performance.now(), tm = { at: new Date().toISOString(), steps: [], quality: E.quality }, mark = label => { const now = performance.now(); tm.steps.push([label, Math.round(now - (tm.last || t0))]); tm.last = now; };
        try {
            const arrival = !!opts.arrival; tm.path = arrival ? 'arrival' : 'measured';   // tm.shipped says whether the arrival's measurements applied
            let c1 = null; if (arrival) { try { c1 = await fetch(CASE1).then(r => r.ok ? r.json() : null); } catch (e) {} if (c1) mark('case file (' + CASE1 + ')'); }
            if (!c1 && !cases) { cases = await fetch('ref/cases.json').then(r => r.json()); mark('case file (ref/cases.json)'); }
            T.on = false;
            // the case's pose, genome and photo: the layer model is measured on exactly this frame (calibrate reads it)
            await (O ? O.quietly : (f => f()))(async () => {
                if (c1) { F.frameFromCase(CASE, c1); mark('eye 26: frame + import + first fit render (no photo)'); }
                else { await F.renderCaseThumb(CASE, cases[CASE], document.createElement('canvas')); mark('eye 26: photo + import + first fit render'); }
                let st = null; await T.proof(SRC, { json: T.json, shipped: c1 ? CAL : undefined, onStage: (i, n, label) => { if (st) mark(st); st = label; prog = [i + 1, n + 1, label]; sync(); } });
                tm.shipped = !!(T.shipped && T.shipped.light);
            });
            eyeAt = E.genome; X.st = 'loaded'; state.hippus = false; E.resetAccumulation(); stats(); if (!X.quietOpen) { frame(); U.say('Layer model on — eye 26'); }
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); mark('first frames on screen');
            tm.total = Math.round(performance.now() - t0); delete tm.last;
            tm.bytes = performance.getEntriesByType('resource').filter(e => /cases\.json|case-26|tissue-26|26-green-crypts/.test(e.name)).map(e => [e.name.split('/').pop(), e.transferSize, e.encodedBodySize, e.decodedBodySize, Math.round(e.duration)]);
            X.timing = tm; try { localStorage.setItem('irisLoadTiming', JSON.stringify(tm)); } catch (e) {}
        } catch (e) { X.st = 'error'; q('#w31t-err').textContent = 'The layer model could not be loaded: ' + (e && e.message || e); console.error(e); }
        X.loading = false; mapSig = ''; heights = null; contourKey = ''; sync(); secDraw(); probeDraw(); marks();
    };
    // after a dial: a FULL load — the case re-imported, then the primitives (cached) through load → calibrate → bake. A
    // re-load on the current state is not the same thing: it calibrates on whatever the eye drifted to since, and the
    // same dials then gave a different picture (MATCH2 85.2 against the load's 84.6). Knob offsets go back to the fit.
    X.reload = () => X.load();
    // the case's pose fills the canvas HEIGHT (the photo's frame); on a screen narrower than the photo — a phone, a
    // portrait tablet — that cuts the iris at the sides, so the view crop zooms out to the whole frame, as the photo
    // overlay's home does. The pose itself is handed to the overlay, so its guards put back exactly this pose.
    function frame() {
        if (!fit.W) return; const v = state.view || [0, 0, 1, 1], r = (fit.W / fit.H) / (innerWidth / innerHeight); if (O) O.pose = [v[0], v[1]];
        if (r <= 1) return; const s2 = r * 1.04; state.view = [v[0] + 0.5 - 0.5 * s2, v[1] + 0.5 - 0.5 * s2, s2, s2]; E.resetAccumulation(); }
    // study/10 §11 S1: the start eye's background load. The display holds the stand-in (the engine pauses its interactive
    // loop while state.fitting, so the case import — the legacy preset, lavender — is never seen); the window stays
    // closed; the camera, view and zoom the visitor had are given back, so the eye keeps following the pointer. Skipped
    // without float render targets (the layer model needs them) or when the browser asks to save data.
    X.startEye = async () => {
        const P = window.__irisStartPending; window.__irisStartPending = null; if (!P) return;
        const conn = navigator.connection; if ((conn && conn.saveData) || !gl.getExtension('EXT_color_buffer_float')) return;
        if (!(await available())) return;
        const keep = { useRot: state.useRot, view: (state.view || [0, 0, 1, 1]).slice(), zoom: state.zoomPhoto, camRot: (state.camRot || [0, 0]).slice() };
        X.quietOpen = true; state.fitting = true;
        try { await X.load({ arrival: true }); }
        finally { state.fitting = false; X.quietOpen = false; }
        if (X.st !== 'loaded') return;
        state.useRot = keep.useRot; state.view = keep.view; state.zoomPhoto = E.target.zoomPhoto = keep.zoom; state.camRot = keep.camRot; state.preset = 'fit-26';
        E.resetAccumulation(); sync(); marks(); U.say('Eye 26 — its measured tissue'); };
    // study/11 SAVE: what session.js needs — the eye this window loads, the dial rows redrawn after a restore, sync
    X.eyeFile = () => CASE;
    X.syncDials = () => DIALS.forEach(r => { const k = r._key; r._inp.value = T[k] === undefined ? (k === 'wallZ' ? 2.5 : 0) : T[k]; r._show(); r._draw && r._draw(); });
    X.sync = () => sync();
    X.toggle = () => { if (X.st !== 'loaded') return X.load(); T.on = !T.on; E.resetAccumulation(); sync(); marks(); };
    function stats() {
        const S = T.sets || {}, n = k => (S[k] ? (Array.isArray(S[k]) ? S[k].length : 0) : 0);
        const beads = T.marg && T.marg.beads ? T.marg.beads.length : 67;
        q('#w31t-stats').textContent = `${n('outlines')} holes · ${(n('fibres') + n('sfib')).toLocaleString('en')} fibres · ${(n('veins') + n('svein')).toLocaleString('en')} veins · ${n('guides').toLocaleString('en')} guides · ${beads} ruff beads.`;
        try { F.renderFit(); const s = F.score();   /* score() compares the LAST fit render: render the model first */ q('#w31t-score').textContent = s && isFinite(s.match2) ? `MATCH2 ${s.match2.toFixed(1)} · MATCH ${s.match.toFixed(1)}` : ''; } catch (e) { q('#w31t-score').textContent = ''; }
    }
    // a different eye (a preset, an ID, a new fit) must not wear eye 26's tissue: the model switches itself off
    function watchEye() { if (X.loading) return; if (X.st === 'loaded' && eyeAt && E.genome !== eyeAt) { T.on = false; X.st = 'other'; sync(); marks(); U.say('Layer model off — it belongs to eye 26'); } }

    // ---------------------------------------------------------------------------------------------------------
    // the live view → tissue (u, v): the engine's coordinate map at the live camera (as design.js does for DESIGN)
    // ---------------------------------------------------------------------------------------------------------
    let mapFB = null, mapTex = null, dummy = null, mw = 0, mh = 0, map = null, mapSig = '';
    function ensureMap() {
        const w = Math.max(64, cv.width >> 1), hh = Math.max(64, cv.height >> 1);
        const sig = [w, hh, state.zoomPhoto, (state.view || []).join(), (state.camRot || []).join(), state.useRot, state.pupil, (state.pupilOff || []).join(), (state.limb || []).join(), T.on, T.marginKeep, T.marginRound, T.margin].join('|');
        if (map && sig === mapSig) return map;
        if (!mapFB) { mapFB = gl.createFramebuffer(); mapTex = gl.createTexture(); dummy = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, dummy); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); }
        if (mw !== w || mh !== hh) { gl.bindTexture(gl.TEXTURE_2D, mapTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, hh, 0, gl.RGBA, gl.FLOAT, null); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.bindFramebuffer(gl.FRAMEBUFFER, mapFB); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, mapTex, 0); gl.bindFramebuffer(gl.FRAMEBUFFER, null); mw = w; mh = hh; }
        if (E.atlas.dirty) E.bakeAtlas();
        E.drawPhotoFrame(mapFB, w, hh, 0, dummy, { ref: 1, rot: state.camRot, zoom: state.zoomPhoto, view: state.view, debug: 14, fstop: 64 });
        const px = new Float32Array(w * hh * 4); gl.bindFramebuffer(gl.FRAMEBUFFER, mapFB); gl.readPixels(0, 0, w, hh, gl.RGBA, gl.FLOAT, px); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, cv.width, cv.height);
        map = { w, h: hh, px }; mapSig = sig; return map; }
    const onIris = (m, x, y) => { const o = (y * m.w + x) * 4; return m.px[o + 2] >= 0.5 ? [m.px[o], m.px[o + 1]] : null; };
    function uvAtClient(cx, cy) { const m = ensureMap(), r = cv.getBoundingClientRect(); const x = Math.floor((cx - r.left) / r.width * m.w), y = Math.floor(m.h - 1 - (cy - r.top) / r.height * m.h);
        if (x < 0 || y < 0 || x >= m.w || y >= m.h) return null; return onIris(m, x, y); }
    X.uvAtClient = (x, y) => uvAtClient(x, y);   // for tests and the console
    function clientOf(uv) {   // the screen point showing (u, v): nearest texel of the map (wrap-aware in u)
        const m = ensureMap(), r = cv.getBoundingClientRect(); let best = 1e9, bx = -1, by = -1;
        for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) { const o = (y * m.w + x) * 4; if (m.px[o + 2] < 0.5) continue; let du = m.px[o] - uv[0]; du -= Math.round(du); const d = du * du * 36 + (m.px[o + 1] - uv[1]) ** 2; if (d < best) { best = d; bx = x; by = y; } }
        return bx < 0 ? null : [r.left + (bx + 0.5) / m.w * r.width, r.top + (m.h - 1 - by + 0.5) / m.h * r.height]; }

    // ---------------------------------------------------------------------------------------------------------
    // scene marks: an SVG over the canvas (crosshair, the cut, the probe and its view wedge) + the contour layer
    // ---------------------------------------------------------------------------------------------------------
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.id = 'w31t-ov'; document.body.appendChild(svg);
    const tip = h('div', 't-tip'); tip.id = 'w31t-tip'; document.body.appendChild(tip);
    const cont = h('canvas'); cont.id = 'w31t-contours'; document.body.appendChild(cont);
    let point = null, cut = null, secRes = null, secHot = -1, probeXY = null, probeDir = null;
    const active = () => X.st === 'loaded' && !X.loading && W.open && T.on && !state.design;
    function marks() {
        let s = '';
        const on = active(), P = (x, y) => `${x.toFixed(1)} ${y.toFixed(1)}`;
        if (on && X.page === 'inspect' && X.tool === 'point' && point) { const [x, y] = point.xy; const d = `M${P(x - 12, y)}h8M${P(x + 4, y)}h8M${P(x, y - 12)}v8M${P(x, y + 4)}v8`; s += `<path d="${d}" stroke="#000" stroke-width="3"/><path d="${d}" stroke="#ff0" stroke-width="1.5"/>`; }
        if (on && X.page === 'inspect' && X.tool === 'section' && cut) { const [a, b] = cut; s += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#000" stroke-width="4" opacity=".55"/><line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#ff0" stroke-width="2"/>` + [a, b].map(p => `<rect x="${p[0] - 4}" y="${p[1] - 4}" width="8" height="8" fill="#ff0" stroke="#000"/>`).join('');
            if (secRes && secHot >= 0) { const t = secHot / Math.max(1, secRes.samples.length - 1); s += `<circle cx="${a[0] + t * (b[0] - a[0])}" cy="${a[1] + t * (b[1] - a[1])}" r="4" fill="#ff0" stroke="#000"/>`; } }
        if (on && X.page === 'probe' && probeXY) { const [x, y] = probeXY, R = 46, dir = probeDir === null ? -Math.PI / 2 : probeDir, fv = PS.fov * Math.PI / 360;
            const p1 = [x + R * Math.cos(dir - fv), y + R * Math.sin(dir - fv)], p2 = [x + R * Math.cos(dir + fv), y + R * Math.sin(dir + fv)];
            s += `<path d="M${P(x, y)}L${P(...p1)}A${R} ${R} 0 0 1 ${P(...p2)}Z" fill="rgba(0,255,255,.22)" stroke="#0ff" stroke-width="1.5"/><circle cx="${x}" cy="${y}" r="5" fill="#0ff" stroke="#000"/>`; }
        svg.innerHTML = s;
        if (on && X.page === 'inspect' && X.tool === 'point' && point && point.r) { const r = point.r; tip.textContent = `${Math.round(r.surfaceUm)} µm · ${r.layers} fibre${r.layers === 1 ? '' : 's'}`; tip.style.display = 'block';
            const x = point.xy[0] + 14 + tip.offsetWidth > innerWidth - 4 ? point.xy[0] - 14 - tip.offsetWidth : point.xy[0] + 14; tip.style.left = x + 'px'; tip.style.top = (point.xy[1] + 10) + 'px'; } else tip.style.display = 'none';
        contours(); }
    // contours: every 25 µm of the baked surface, at the map's resolution, over the live canvas
    let heights = null, contourKey = '';
    function contours() {
        const want = active() && X.page === 'inspect' && X.tool === 'contours'; cont.style.display = want ? 'block' : 'none'; if (!want) return;
        const m = ensureMap(), key = mapSig + '|' + (heights ? 1 : 0); const r = cv.getBoundingClientRect(); cont.style.left = r.left + 'px'; cont.style.top = r.top + 'px'; cont.style.width = r.width + 'px'; cont.style.height = r.height + 'px';
        if (key === contourKey && heights) return; if (!heights) heights = T.heightField();
        // the surface per map pixel, then a 5 × 5 box blur (the fibres' own grain would otherwise draw a line around every
        // strand), then lines every 50 µm — faint — and every 200 µm — yellow, the relief you read at a glance
        const H = heights, R = H.rect, iv = 50, major = 4, c = cont.getContext('2d'); cont.width = m.w; cont.height = m.h; const im = c.createImageData(m.w, m.h), d = im.data, N = m.w * m.h;
        const z = new Float32Array(N).fill(NaN);
        for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) { const uv = onIris(m, x, y); if (!uv) continue; let u = uv[0] - R[0]; u -= Math.floor(u); const hx = Math.floor(u / R[2] * H.w), hy = Math.floor((uv[1] - R[1]) / R[3] * H.h); if (hx < 0 || hy < 0 || hx >= H.w || hy >= H.h) continue; z[(m.h - 1 - y) * m.w + x] = H.um[hy * H.w + hx]; }
        const blur = (src, horiz) => { const out = new Float32Array(N).fill(NaN), rr = 2; for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) { const i = y * m.w + x; if (isNaN(src[i])) continue; let sum = 0, n = 0; for (let k = -rr; k <= rr; k++) { const xx = horiz ? x + k : x, yy = horiz ? y : y + k; if (xx < 0 || yy < 0 || xx >= m.w || yy >= m.h) continue; const v = src[yy * m.w + xx]; if (!isNaN(v)) { sum += v; n++; } } out[i] = sum / n; } return out; };
        const zs = blur(blur(z, true), false), band = new Int32Array(N).fill(-99999);
        for (let i = 0; i < N; i++) if (!isNaN(zs[i])) band[i] = Math.floor(zs[i] / iv);
        for (let y = 0; y < m.h - 1; y++) for (let x = 0; x < m.w - 1; x++) { const i = y * m.w + x, b = band[i]; if (b === -99999) continue; const br = band[i + 1], bd = band[i + m.w]; if ((br !== -99999 && br !== b) || (bd !== -99999 && bd !== b)) { const o = i * 4, lvl = Math.max(b, br === -99999 ? b : br, bd === -99999 ? b : bd), mj = lvl % major === 0;
            d[o] = 255; d[o + 1] = 255; d[o + 2] = mj ? 0 : 255; d[o + 3] = mj ? 255 : 90; } }
        c.putImageData(im, 0, 0); contourKey = key; }

    // ---------------------------------------------------------------------------------------------------------
    // Inspect: Point (hover), Section (drag a cut), both drawn from the primitives; the plot and the readout
    // ---------------------------------------------------------------------------------------------------------
    let hoverT = 0;
    function readPoint(cx, cy) { const uv = uvAtClient(cx, cy); if (!uv) { point = { xy: [cx, cy], r: null }; return; } const r = T.atUV(uv[0], uv[1]); point = { xy: [cx, cy], r: r && r.inRegion ? r : null }; }
    function readout() {
        const el = q('#w31t-read'); if (X.tool === 'contours') { el.innerHTML = `Height lines on the iris every <b>50 µm</b>, every <b>200 µm</b> in yellow — the relief of the whole eye at a glance.${secRes ? `<br>Last cut: deepest ${Math.round(Math.min(...secRes.samples.filter(s => s.surfaceUm !== null && s.surfaceUm !== undefined).map(s => s.surfaceUm)))} µm · floor ${Math.round(secRes.floorUm)} µm.` : ''}`; return; }
        let r = null, head = '';
        if (X.tool === 'section') { if (!secRes || !secRes.samples.length) { el.innerHTML = 'Drag a line across the iris.'; return; } const s = secRes.samples[Math.max(0, secHot)]; if (s && !s.off) { r = { surfaceUm: s.surfaceUm, floorUm: secRes.floorUm, deckThicknessUm: secRes.deckThicknessUm, tubes: s.tubes }; head = `At ${s.sMm.toFixed(2)} mm along the cut`; } else { el.innerHTML = 'That part of the cut is off the iris.'; return; } }
        else { if (!point) { el.innerHTML = 'Move over the iris.'; return; } if (!point.r) { el.innerHTML = 'Off the tissue.'; return; } r = point.r; head = 'Under the pointer'; }
        const tubes = (r.tubes || []).slice().sort((a, b) => b.renderedTopUm - a.renderedTopUm);
        el.innerHTML = `<b>${head}</b> · surface <b>${Math.round(r.surfaceUm)} µm</b> · floor ${Math.round(r.floorUm)} µm · deck ${Math.round(r.deckThicknessUm)} µm` +
            (tubes.length ? `<table><tr><th>fibre, top down</th><th>top</th><th>centre</th><th>thickness</th></tr>${tubes.map(t => `<tr><td>#${t.fibre}</td><td>${Math.round(t.renderedTopUm)} µm</td><td>${Math.round(t.renderedZUm)} µm</td><td>${Math.round(2 * t.rUm)} µm</td></tr>`).join('')}</table>` : '<br>No fibre under this point.'); }
    function sectionFrom(a, b) { const n = 240, pts = []; for (let i = 0; i < n; i++) { const t = i / (n - 1), x = a[0] + t * (b[0] - a[0]), y = a[1] + t * (b[1] - a[1]); pts.push({ x, y, uv: uvAtClient(x, y) }); } secRes = T.sectionUV(pts); secHot = Math.floor(n / 2); }
    function secDraw() {
        const c0 = q('#w31t-sec'), show = active() && X.page === 'inspect' && X.tool === 'section'; c0.style.display = show ? 'block' : 'none'; q('#w31t-legend').style.display = show ? '' : 'none';
        q('#w31t-hint').textContent = X.tool === 'point' ? 'The height under the pointer, and every fibre stacked there — also those lying under others.' : X.tool === 'section' ? 'Drag a line across the iris: the cut shows every fibre it passes, also those lying under others. Height ×4 · move over the plot to walk the cut.' : 'Contours are drawn on the iris itself.';
        if (!show) return; const w = c0.clientWidth, hh = c0.clientHeight, dpr = devicePixelRatio || 1; if (!w) return; c0.width = Math.round(w * dpr); c0.height = Math.round(hh * dpr); const c = c0.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = '#fff'; c.fillRect(0, 0, w, hh);
        const font = `400 10px ${getComputedStyle(W.el).fontFamily}`; c.font = font; c.fillStyle = '#000';
        if (!secRes || !secRes.samples.length) { c.textAlign = 'center'; c.fillText('drag a line across the iris', w / 2, hh / 2); return; }
        const S = secRes.samples, mm = Math.max(1e-3, secRes.mm), zTop = Math.max(40, ...S.map(s => s.surfaceUm || -1e9)) + 20, zBot = secRes.floorUm - 20, pad = [36, 8, 16, 16];
        const X_ = s => pad[0] + s / mm * (w - pad[0] - pad[1]), Y_ = z => pad[2] + (zTop - z) / (zTop - zBot) * (hh - pad[2] - pad[3]);
        const pxUmX = (w - pad[0] - pad[1]) / (mm * 1000), pxUmY = (hh - pad[2] - pad[3]) / (zTop - zBot);
        c.fillStyle = '#c0c0c0'; c.beginPath(); c.moveTo(X_(0), Y_(zBot)); S.forEach(s => { if (!s.off && s.surfaceUm !== null) c.lineTo(X_(s.sMm), Y_(s.surfaceUm)); }); c.lineTo(X_(mm), Y_(zBot)); c.closePath(); c.fill();
        c.fillStyle = '#000'; c.fillRect(X_(0), Y_(secRes.floorUm), X_(mm) - X_(0), 1);
        const seen = new Set(); S.forEach((s, i) => { if (s.off || !s.tubes || i % 3) return; const ts = s.tubes.slice().sort((a, b) => b.renderedTopUm - a.renderedTopUm); ts.forEach((t, j) => { const key = t.fibre + ':' + Math.round(s.sMm * 25); if (seen.has(key)) return; seen.add(key);
            c.beginPath(); c.ellipse(X_(s.sMm), Y_(t.renderedZUm), Math.max(1.5, t.rUm * pxUmX), Math.max(1.5, t.rUm * pxUmY), 0, 0, 6.2832); c.fillStyle = j > 0 ? '#000080' : '#fff'; c.fill(); c.strokeStyle = '#000'; c.lineWidth = 1; c.stroke(); }); });
        c.strokeStyle = '#000'; c.lineWidth = 1.5; c.beginPath(); let first = true; S.forEach(s => { if (s.off || s.surfaceUm === null) { first = true; return; } first ? c.moveTo(X_(s.sMm), Y_(s.surfaceUm)) : c.lineTo(X_(s.sMm), Y_(s.surfaceUm)); first = false; }); c.stroke();
        if (secHot >= 0 && S[secHot]) { const x = X_(S[secHot].sMm); c.fillStyle = '#ff0'; c.fillRect(x - 1, pad[2], 3, hh - pad[2] - pad[3]); c.strokeStyle = '#000'; c.lineWidth = 1; c.strokeRect(x - 1.5, pad[2] - 0.5, 3, hh - pad[2] - pad[3]); }
        c.fillStyle = '#000'; c.textAlign = 'right'; const step = zTop - zBot > 500 ? 200 : 100; for (let z = Math.ceil(zBot / step) * step; z <= zTop; z += step) { c.fillText(z + ' µm', pad[0] - 3, Y_(z) + 3); c.fillRect(pad[0] - 2, Y_(z), 2, 1); }
        c.textAlign = 'center'; const ms = mm > 3 ? 1 : 0.5; for (let s = 0; s <= mm + 1e-6; s += ms) { c.fillText(s.toFixed(1), X_(s), hh - 4); c.fillRect(X_(s), hh - pad[3], 1, 3); }
        c.textAlign = 'left'; c.fillText(`mm along the cut · ${secRes.overlapped} samples with fibres under fibres`, pad[0], 11);
        c.strokeStyle = '#000'; c.lineWidth = 1; c.strokeRect(pad[0] + 0.5, pad[2] + 0.5, w - pad[0] - pad[1] - 1, hh - pad[2] - pad[3] - 1);
        c0._x = X_; c0._mm = mm; }
    q('#w31t-sec').addEventListener('pointermove', e => { if (!secRes || !secRes.samples.length) return; const c0 = q('#w31t-sec'), r = c0.getBoundingClientRect(), X_ = c0._x; if (!X_) return;
        const s = (e.clientX - r.left - 36) / (r.width - 44) * c0._mm, S = secRes.samples; let bi = 0, bd = 1e9; S.forEach((q2, i) => { const d = Math.abs(q2.sMm - s); if (d < bd) { bd = d; bi = i; } }); if (bi !== secHot) { secHot = bi; secDraw(); readout(); marks(); } });

    // ---------------------------------------------------------------------------------------------------------
    // Probe: tap the iris to place it; drag the view to look around; the scrubbers
    // ---------------------------------------------------------------------------------------------------------
    function placeProbe(cx, cy) { const uv = uvAtClient(cx, cy); if (!uv) return U.say('The probe stands on the iris — tap the tissue'); PS.uv = uv; probeXY = [cx, cy]; aimWedge(); probeDraw(); marks(); }
    function aimWedge() { if (!PS.uv) return; const r0 = 2 + 4 * PS.uv[1], d = 0.35, a = PS.yaw * Math.PI / 180, uv2 = [PS.uv[0] + Math.cos(a) * d / (6.2831853 * r0), PS.uv[1] + Math.sin(a) * d / 4];
        const p0 = probeXY || clientOf(PS.uv), p1 = clientOf(uv2); if (p0) probeXY = p0; probeDir = p0 && p1 ? Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) : null; }
    function probeDraw() {
        const c0 = q('#w31t-probe'); if (!(active() && X.page === 'probe')) return; const w = c0.clientWidth, hh = c0.clientHeight; if (!w) return;
        const dpr = Math.min(2, devicePixelRatio || 1), pw = Math.round(w * dpr), ph = Math.round(hh * dpr); c0.width = pw; c0.height = ph; const c = c0.getContext('2d');
        if (!PS.uv) { c.fillStyle = '#000'; c.fillRect(0, 0, pw, ph); c.fillStyle = '#fff'; c.font = `400 ${Math.round(12 * dpr)}px ${getComputedStyle(W.el).fontFamily}`; c.textAlign = 'center'; c.fillText('Tap the iris to put the camera there', pw / 2, ph / 2); return; }
        let res; try { res = T.probe({ uv: PS.uv, heightUm: PS.heightUm, yaw: PS.yaw, pitch: PS.pitch, fov: PS.fov, mode: PS.mode, contourUm: PS.contourUm, w: pw, h: ph }); } catch (e) { return; }
        c.putImageData(res.data, 0, 0); c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(0, ph - 18 * dpr, pw, 18 * dpr); c.fillStyle = '#fff'; c.textAlign = 'left'; c.font = `400 ${Math.round(11 * dpr)}px ${getComputedStyle(W.el).fontFamily}`;
        c.fillText(`standing ${res.standingAtUm} µm · ground ${res.groundUm} µm · looking ${Math.round(PS.yaw)}° · ${Math.round(-PS.pitch)}° down`, 6 * dpr, ph - 5 * dpr); }
    { let d = null; const pc = q('#w31t-probe');
        pc.addEventListener('pointerdown', e => { if (!PS.uv) return; d = { x: e.clientX, y: e.clientY, yaw: PS.yaw, pitch: PS.pitch }; try { pc.setPointerCapture(e.pointerId); } catch (err) {} e.preventDefault(); });
        pc.addEventListener('pointermove', e => { if (!d) return; let yaw = d.yaw - (e.clientX - d.x) * 0.4; yaw = ((yaw + 180) % 360 + 360) % 360 - 180; pset('yaw', Math.round(yaw)); pset('pitch', Math.round(Math.max(-80, Math.min(30, d.pitch - (e.clientY - d.y) * 0.3)))); aimWedge(); probeDraw(); marks(); });
        const up = () => { d = null; }; pc.addEventListener('pointerup', up); pc.addEventListener('pointercancel', up); }

    // ---------------------------------------------------------------------------------------------------------
    // the scene's pointer, while a Tissue tool owns it (capture phase: the engine's own press / gaze handlers must not
    // run — a press would constrict the pupil). The photo overlay is switched off first: the tools read the tissue.
    // ---------------------------------------------------------------------------------------------------------
    const owns = e => active() && e.target === cv && ((X.page === 'inspect' && X.tool !== 'contours') || X.page === 'probe');
    function lockCamera() { if (!state.useRot) E.setCamFixed(true); if (O && O.mode !== 'off') O.set('off'); }
    let drag = null;
    document.addEventListener('pointerdown', e => { if (!owns(e) || e.button > 0) return; e.stopPropagation(); lockCamera();
        if (X.page === 'probe') { placeProbe(e.clientX, e.clientY); return; }
        if (X.tool === 'section') { drag = { a: [e.clientX, e.clientY] }; cut = [drag.a, drag.a]; secRes = null; try { cv.setPointerCapture(e.pointerId); } catch (err) {} marks(); } }, true);
    document.addEventListener('pointermove', e => {
        if (drag) { e.stopPropagation(); cut = [drag.a, [e.clientX, e.clientY]]; marks(); return; }
        if (!owns(e)) return; e.stopPropagation();
        if (X.page === 'inspect' && X.tool === 'point') { const now = performance.now(); if (now - hoverT < 33) return; hoverT = now; readPoint(e.clientX, e.clientY); readout(); marks(); } }, true);
    const end = e => { if (!drag) return; e.stopPropagation(); const a = drag.a, b = [e.clientX, e.clientY]; drag = null; if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 6) { marks(); return; } cut = [a, b]; sectionFrom(a, b); secDraw(); readout(); marks(); };
    document.addEventListener('pointerup', end, true); document.addEventListener('pointercancel', end, true);

    // ---------------------------------------------------------------------------------------------------------
    // one place that makes the window match the state
    // ---------------------------------------------------------------------------------------------------------
    function sync() {
        qa('[data-st]').forEach(el => { el.style.display = el.dataset.st === X.st ? '' : 'none'; });
        q('#w31t-bar').style.width = Math.round(100 * prog[0] / Math.max(1, prog[1])) + '%'; q('#w31t-stage').textContent = `${prog[0]} / ${prog[1]} · ${prog[2]} · the eye stays usable`;
        q('#w31t-on').classList.toggle('on', !!T.on);
        qa('.t-pages [data-p]').forEach(b => b.classList.toggle('on', b.dataset.p === X.page)); qa('.t-page').forEach(p => p.classList.toggle('on', p.dataset.p === X.page));
        qa('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === X.tool)); qa('[data-m]').forEach(b => b.classList.toggle('on', b.dataset.m === PS.mode));
        qa('[data-flag]').forEach(b => { const k = b.dataset.flag; b.classList.toggle('on', k === 'delight' ? !!T.delight : k === 'margin' ? T.margin !== false : !!T[k]); });
        if (X.loading && X.st === 'loaded') qa('[data-st="loaded"]').forEach(el => { el.style.opacity = 0.55; }); else qa('[data-st="loaded"]').forEach(el => { el.style.opacity = ''; });
        readout(); }
    X.go = (page, tool) => { if (X.st !== 'loaded') { U.showWindow('tissue', true); return; } X.page = page; if (tool) X.tool = tool; U.showWindow('tissue', true); if (page !== 'dials') lockCamera(); sync(); requestAnimationFrame(() => { secDraw(); probeDraw(); PDIALS.concat(DIALS).forEach(r => r._draw && r._draw()); marks(); }); };

    // follow the page: the eye changing under the model, the window closing, the view moving (zoom, pan, resize)
    let lastSig = '', lastOpen = null;
    function step() {
        watchEye(); if (lastOpen !== W.open) { lastOpen = W.open; marks(); if (W.open) requestAnimationFrame(() => { secDraw(); probeDraw(); }); }
        const r = cv.getBoundingClientRect(), sig = [state.zoomPhoto, (state.view || []).join(), (state.camRot || []).join(), r.left, r.top, r.width, r.height, X.page, X.tool, T.on].join('|');
        if (sig !== lastSig && active()) { lastSig = sig; if (PS.uv && X.page === 'probe') { probeXY = clientOf(PS.uv); aimWedge(); } if (cut && secRes) { const S = secRes.samples.filter(s => s.uv); if (S.length > 1) { const a = clientOf(S[0].uv), b = clientOf(S[S.length - 1].uv); if (a && b) cut = [a, b]; } } marks(); } }
    (function tick() { step(); requestAnimationFrame(tick); })(); setInterval(step, 250);
    addEventListener('resize', () => { lastSig = ''; requestAnimationFrame(() => { secDraw(); probeDraw(); }); });

    for (const k of ['fitHQ', 'fitGlobal', 'routedFit', 'runBench', 'benchAll', 'benchIsolated', 'oracleBench', 'bakePresets', 'studyAll', 'fitSplats', 'fitOpenings', 'refineObjects', 'detectStructures']) {
        const f = F[k]; if (typeof f !== 'function') continue;
        F[k] = function (...a) { if (T.on && !X.loading) { T.on = false; if (X.st === 'loaded') { X.st = 'other'; sync(); marks(); } U.say('Layer model off — fits run on the procedural model'); } return f.apply(this, a); }; }
    X.st = 'none'; sync(); available().then(ok => { if (!ok && X.st === 'none') { X.st = 'unavailable'; sync(); } });
    if (window.__irisStartPending) setTimeout(() => X.startEye(), 0);
})();
