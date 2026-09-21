// overlay.js — the fit photo lies on the iris in the scene (study/09 §6, phase U3). Loaded by ui31.js.
//
// The photo is not rendered anywhere else: the live engine canvas is the render, and the photograph is a layer
// exactly over it. Registration needs no warping — solvePose makes the engine's frame the photo's frame, and the
// engine's image space is  sensor = (view.xy + frag / res - 0.5) · (aspect, 1) · 24 mm,  so for the same pose the
// photo spans the full canvas height and  width = height · photoAspect,  left = (0.5 - view.x) · (1 - r) · W  with
// r = photoAspect / canvasAspect. The camera is the fitted pose (state.useRot, set by solvePose); gaze.js leaves a
// fixed camera alone. The layer is DOM over the canvas and the blends are CSS (opacity, clip-path,
// mix-blend-mode: difference); no shader and no part of the scored off-screen render is touched.
// Zoom and pan (wheel, pinch, drag; double-click resets) go through the engine's own view crop, `state.view` =
// [x, y, s, s] — the mechanism DESIGN and the tiled capture use — so the render is re-rendered at true resolution
// at any zoom, and zooming OUT works (a portrait window would otherwise cut the sides off: the pose fills the
// height). The pose's own view is [x, y, 1, 1]; it is put back, synchronously, before any fit control is
// clicked, when the overlay goes off, and never written while a fit or a capture runs.
(() => {
    const E = window.__irisEngine, U = window.__irisUI; if (!E || !E.fit || !U || U.shell !== '3.11' || window.__irisOverlay) return;
    const F = E.fit, fit = F.fit, state = E.state, cv = E.canvas, $ = id => document.getElementById(id);
    const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const MODES = ['off', 'photo', 'render', 'diff', 'wipe', 'onion', 'blink'];
    const O = window.__irisOverlay = { mode: 'off', onion: 0.5, wipe: 0.5, marks: true, s: 1, cx: 0.5, cy: 0.5, pose: [0, 0], MODES };   // s = view scale (< 1 in, > 1 out), (cx, cy) = the view's centre in the pose's image space

    const box = h('div'); box.id = 'w31-ov'; box.innerHTML = '<canvas id="w31-ov-render"></canvas><img id="w31-ov-photo" alt="" draggable="false"><svg id="w31-ov-marks" preserveAspectRatio="none"></svg><div id="w31-ov-wipe" data-ui="1"></div>';
    document.body.appendChild(box);
    const img = $('w31-ov-photo'), svg = $('w31-ov-marks'), wipe = $('w31-ov-wipe'), live = $('w31-ov-render');

    // ---- geometry: where the photo's frame lies on the canvas, and the shared zoom / pan transform -------------
    let rect = null;
    const busy = () => state.fitting || state.capturing || state.design;
    const ratio = () => (fit.W / fit.H) / (innerWidth / innerHeight);
    const viewOf = () => [O.pose[0] + O.cx - 0.5 * O.s, O.pose[1] + O.cy - 0.5 * O.s, O.s, O.s];
    function writeView() { if (busy()) return; const v = viewOf(), c = state.view || []; if (c[0] !== v[0] || c[1] !== v[1] || c[2] !== v[2] || c[3] !== v[3]) { state.view = v; E.resetAccumulation(); } }
    O.restoreView = () => { const c = state.view; if (c && (c[2] !== 1 || c[3] !== 1)) { state.view = [O.pose[0], O.pose[1], 1, 1]; E.resetAccumulation(); } };
    function home() { const r = fit.W ? ratio() : 1; O.s = r > 1 ? r * 1.04 : 1; O.cx = O.cy = 0.5; }   // the whole photo frame in view
    function layout() {
        const shift = U.sceneShift ? U.sceneShift() : 0, on = O.mode !== 'off', tf = shift ? `translateY(${shift}px)` : '';
        cv.style.transform = tf;
        if (!on || !fit.photo || !fit.W) { box.style.display = 'none'; return; }
        const W = innerWidth, H = innerHeight, r = ratio(), v = viewOf(), p = O.pose;
        const left = ((p[0] - 0.5) * r + 0.5 - v[0]) / v[2] * W, w = r / v[2] * W, top = (1 - (p[1] + 1 - v[1]) / v[3]) * H, hh = H / v[3];
        rect = { left, w, h: hh };
        box.style.cssText = `display:block;left:${left}px;top:${top}px;width:${w}px;height:${hh}px;transform:${tf}`;
    }
    function apply() {
        const m = O.mode, on = m !== 'off'; document.body.classList.toggle('w31-overlay', on);
        img.style.display = on && m !== 'render' ? 'block' : 'none'; img.style.mixBlendMode = m === 'diff' ? 'difference' : 'normal';
        img.style.clipPath = m === 'wipe' ? `inset(0 ${(1 - O.wipe) * 100}% 0 0)` : 'none'; img.style.opacity = m === 'onion' ? O.onion : 1;
        wipe.style.display = m === 'wipe' ? 'block' : 'none'; wipe.style.left = O.wipe * 100 + '%'; svg.style.display = on && O.marks ? 'block' : 'none';
        document.querySelectorAll('[data-ov]').forEach(b => b.classList.toggle('on', b.dataset.ov === m)); const mk = $('w31-ov-mk'); if (mk) mk.classList.toggle('on', O.marks);
        layout(); marksKey = '';
    }
    O.set = mode => {
        if (!MODES.includes(mode)) return;
        if (mode !== 'off') {
            if (!fit.photo) { U.say('Overlay: load a photo first (Fit ▸ Photo… or a reference)'); U.showWindow('fit', true); mode = 'off'; }
            else if (!state.useRot) $('fit-solve').click();          // lock the camera to the fitted pose: that is what makes the two frames one
        }
        const was = O.mode; O.mode = mode;
        if (mode === 'off') O.restoreView(); else if (was === 'off') { const c = state.view || [0, 0, 1, 1]; O.pose = [c[0], c[1]]; home(); writeView(); }
        apply();
    };
    O.layout = layout;

    // ---- markers: pupil (cyan), limbus (orange), catchlight (yellow) as handles on the scene --------------------
    let marksKey = '';
    const COL = { pupil: '#00e8ff', limbus: '#ff9a00', catch: '#ffe600' };
    function drawMarks() {
        if (O.mode === 'off' || !O.marks || !fit.pupil || !rect) return;
        const P = fit.pupil, L = fit.limbus, C = fit.catch, key = [fit.W, fit.H, P.x, P.y, P.r, L.x, L.y, L.rx, L.ry, L.ang, C.x, C.y, rect.w].join(); if (key === marksKey) return; marksKey = key;
        const k = fit.W / rect.w, hs = 7 * k, hit = 22 * k, sw = 1.5 * k, ca = Math.cos(L.ang || 0), sa = Math.sin(L.ang || 0);
        svg.setAttribute('viewBox', `0 0 ${fit.W} ${fit.H}`);
        const ring = (shape, col) => shape.replace('/>', ` fill="none" stroke="#000" stroke-width="${sw * 2.2}" opacity=".5"/>`) + shape.replace('/>', ` fill="none" stroke="${col}" stroke-width="${sw}"/>`);
        const hnd = (what, x, y, col) => `<g data-ui="1" data-w="${what}"><circle cx="${x}" cy="${y}" r="${hit}" fill="transparent"/><rect x="${x - hs / 2}" y="${y - hs / 2}" width="${hs}" height="${hs}" fill="${col}" stroke="#000" stroke-width="${k}"/></g>`;
        svg.innerHTML = ring(`<ellipse cx="${L.x}" cy="${L.y}" rx="${L.rx}" ry="${L.ry}" transform="rotate(${(L.ang || 0) * 57.29578} ${L.x} ${L.y})"/>`, COL.limbus) + ring(`<circle cx="${P.x}" cy="${P.y}" r="${P.r}"/>`, COL.pupil) +
            hnd('limbus', L.x, L.y, COL.limbus) + hnd('limbusRx', L.x + L.rx * ca, L.y + L.rx * sa, COL.limbus) + hnd('limbusRy', L.x - L.ry * sa, L.y + L.ry * ca, COL.limbus) +
            hnd('pupil', P.x, P.y, COL.pupil) + hnd('pupilR', P.x + P.r, P.y, COL.pupil) + hnd('catch', C.x, C.y, COL.catch);
    }
    { let d = null; const pos = e => { const r = svg.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * fit.W, (e.clientY - r.top) / r.height * fit.H]; };
        svg.addEventListener('pointerdown', e => { const g = e.target.closest('g'); if (!g) return; const [x, y] = pos(e), w = g.dataset.w, o = w.startsWith('limbus') ? fit.limbus : w.startsWith('pupil') ? fit.pupil : fit.catch; d = { w, dx: o.x - x, dy: o.y - y }; try { svg.setPointerCapture(e.pointerId); } catch (err) {} e.preventDefault(); });
        svg.addEventListener('pointermove', e => { if (!d) return; const [x, y] = pos(e), P = fit.pupil, L = fit.limbus;
            if (d.w === 'catch') { fit.catch.x = x; fit.catch.y = y; } else if (d.w === 'pupil') { P.x = x + d.dx; P.y = y + d.dy; } else if (d.w === 'pupilR') P.r = Math.max(4, Math.hypot(x - P.x, y - P.y));
            else if (d.w === 'limbus') { L.x = x + d.dx; L.y = y + d.dy; } else if (d.w === 'limbusRx') { L.rx = Math.max(8, Math.hypot(x - L.x, y - L.y)); L.ang = Math.atan2(y - L.y, x - L.x); } else if (d.w === 'limbusRy') L.ry = Math.max(8, Math.hypot(x - L.x, y - L.y));
            drawMarks(); });
        const end = () => { if (d) { d = null; F.draw(); if (!busy()) $('fit-solve').click(); } };   /* moved markers re-solve the pose at once: the render follows the handles */ svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end); }
    { let d = false; wipe.addEventListener('pointerdown', e => { d = true; try { wipe.setPointerCapture(e.pointerId); } catch (err) {} e.preventDefault(); });
        wipe.addEventListener('pointermove', e => { if (!d) return; const r = box.getBoundingClientRect(); O.wipe = clamp((e.clientX - r.left) / r.width, 0, 1); apply(); }); const end = () => { d = false; }; wipe.addEventListener('pointerup', end); wipe.addEventListener('pointercancel', end); }

    // ---- zoom and pan on the scene while the overlay is on. Capture phase on document: the engine's own wheel
    // (camera distance) and press (pupil constriction) handlers must not run — they would break the locked pose.
    const pts = new Map(); let pinch = null;
    const onScene = e => O.mode !== 'off' && e.target === cv;
    function zoomAt(f, sx, sy) { if (state.design || state.capturing) return; const shift = U.sceneShift ? U.sceneShift() : 0, fx = sx / innerWidth, fy = 1 - (sy - shift) / innerHeight, v = viewOf(), ix = v[0] + fx * v[2], iy = v[1] + fy * v[2];   // f > 1 zooms in; the image point under the pointer stays put
        const nat = fit.img && fit.img.naturalHeight ? fit.img.naturalHeight : fit.H, s2 = clamp(O.s / f, clamp(innerHeight / (nat * 3), 0.04, 1), Math.max(1, ratio() * 1.04));   /* in: to 3 screen px per photo px · out: the whole frame */ O.cx = ix - fx * s2 + 0.5 * s2 - O.pose[0]; O.cy = iy - fy * s2 + 0.5 * s2 - O.pose[1]; O.s = s2; writeView(); layout(); }
    function panBy(dx, dy) { if (state.design || state.capturing) return; O.cx = clamp(O.cx - dx / innerWidth * O.s, -0.5, 1.5); O.cy = clamp(O.cy + dy / innerHeight * O.s, -0.5, 1.5); writeView(); layout(); }
    document.addEventListener('wheel', e => { if (!onScene(e)) return; e.stopPropagation(); e.preventDefault(); zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY); }, { capture: true, passive: false });
    document.addEventListener('pointerdown', e => { if (!onScene(e)) return; e.stopPropagation(); pts.set(e.pointerId, [e.clientX, e.clientY]); try { cv.setPointerCapture(e.pointerId); } catch (err) {}
        if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) }; } }, true);
    document.addEventListener('pointermove', e => { if (!pts.has(e.pointerId)) { if (onScene(e)) e.stopPropagation(); return; } e.stopPropagation(); const p = pts.get(e.pointerId), q = [e.clientX, e.clientY];
        if (pts.size === 1) { panBy(q[0] - p[0], q[1] - p[1]); pts.set(e.pointerId, q); return; }
        pts.set(e.pointerId, q); const [a, b] = [...pts.values()], dd = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch && pinch.d > 0) zoomAt(dd / pinch.d, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); pinch = { d: dd }; }, true);
    const up = e => { if (!pts.delete(e.pointerId)) return; e.stopPropagation(); pinch = null; }; document.addEventListener('pointerup', up, true); document.addEventListener('pointercancel', up, true);
    document.addEventListener('dblclick', e => { if (!onScene(e)) return; home(); writeView(); layout(); }, true);
    // any fit control (a button in the panel, or the menu clicking one) sees the pose's own view, not the zoomed one
    document.addEventListener('click', e => { if (O.mode !== 'off' && e.target.closest && e.target.closest('#fit-panel button, #fit-panel select, #idout-btn, #shot-btn')) O.restoreView(); }, true);
    // … and so does anything driven through the API (benches, the console, other scripts): every function of
    // __irisEngine.fit, and the two engine calls that read the view, put the pose's view back before they run.
    const guard = f => function (...a) { O.restoreView(); return f.apply(this, a); };
    for (const k of Object.keys(F)) if (typeof F[k] === 'function') F[k] = guard(F[k]);
    for (const k of ['exportID', 'captureTiled']) if (typeof E[k] === 'function') E[k] = guard(E[k]);
    $('fit-close').addEventListener('click', () => O.set('off'));

    // ---- the controls, in the Fit window --------------------------------------------------------------------
    { const W = U.WINS.find(w => w.key === 'fit'), g = h('div', 'w31-grp', '<b>Overlay on the iris</b>'), row = h('div', 'w31-brow');
        for (const m of MODES) { const b = h('button', 'w31-b', m[0].toUpperCase() + m.slice(1)); b.dataset.ov = m; b.style.flex = '1 0 22%'; b.onclick = () => O.set(m); row.appendChild(b); } g.appendChild(row);
        const inp = document.createElement('input'); inp.type = 'range'; inp.min = 0; inp.max = 1; inp.step = 0.01; inp.value = O.onion; const val = h('span'); val.textContent = O.onion.toFixed(2);
        inp.addEventListener('input', () => { O.onion = +inp.value; val.textContent = O.onion.toFixed(2); if (O.mode === 'onion') apply(); }); g.appendChild(U.makeScrubber(inp, 'ONION', val));
        const r2 = h('div', 'w31-brow'), mk = h('button', 'w31-b on', 'Markers'), one = h('button', 'w31-b', 'Reset zoom'); mk.id = 'w31-ov-mk'; mk.onclick = () => { O.marks = !O.marks; apply(); }; one.onclick = () => { home(); writeView(); layout(); }; r2.appendChild(mk); r2.appendChild(one); g.appendChild(r2);
        W.body.insertBefore(g, W.body.firstChild); }

    // ---- follow the fitter: a new photo, moved markers (AUTO ALIGN), a closed panel, a resized window -----------
    // A photo the user loads appears on the iris by itself (not during a fit or a bench: those load photos too), and
    // the panel's PHOTO | RENDER | DIFF | SPLIT button drives the layer. POLAR and HEIGHT are strip views, not
    // images of the eye: only they bring the panel's own 2-D canvas back, inside the Fit window.
    // While a fit runs the engine's interactive loop is paused (and FIT HQ's switch to CAPTURE clears the canvas), so
    // the workspace would show no render at all. The fitter's own scored render — the very image the score is
    // computed from, in the photo's frame by construction — is painted under the photo for as long as it runs.
    let lastRender = null, lastPaint = 0;
    function paintFitRender(now) { const on = O.mode !== 'off' && (state.fitting || fit.running) && fit.render && fit.W; live.style.display = on ? 'block' : 'none'; if (!on || fit.render === lastRender || now - lastPaint < 150) return;
        lastRender = fit.render; lastPaint = now; if (live.width !== fit.W || live.height !== fit.H) { live.width = fit.W; live.height = fit.H; }
        if (fit.render.length === fit.W * fit.H * 4) live.getContext('2d').putImageData(new ImageData(fit.render, fit.W, fit.H), 0, 0); }
    const FROM_FIT = ['photo', 'render', 'diff', 'wipe'];
    let lastImg = null, lastKey = '', lastFitMode = fit.mode || 0, t0 = performance.now();
    (function tick(now) {
        if (O.mode !== 'off' && state.design) { O.mode = 'off'; apply(); }   // DESIGN owns the view while it is on (its own photo layer is phase D3)
        if (fit.img !== lastImg && !busy() && !fit.benchRunning) { lastImg = fit.img; img.src = fit.img ? fit.img.src : ''; lastFitMode = fit.mode || 0; if (fit.photo && !state.design) { U.showWindow('fit', true); O.set(O.mode === 'off' ? 'wipe' : O.mode); } }
        if ((fit.mode || 0) !== lastFitMode) { lastFitMode = fit.mode || 0; if (O.mode !== 'off' && lastFitMode < 4) O.set(FROM_FIT[lastFitMode]); }
        if (O.mode !== 'off') {
            if (!fit.photo) O.set('off');
            else { const c = state.view || [0, 0, 1, 1]; if (!busy() && c[2] === 1 && c[3] === 1 && (c[0] !== O.pose[0] || c[1] !== O.pose[1])) O.pose = [c[0], c[1]];   // the fitter moved the pose (SOLVE POSE, the alignment loop)
                if (!busy() && !state.useRot) $('fit-solve').click();                                                    // something freed the camera (a preset, CAM FREE): lock it to the pose again
                writeView(); const key = [innerWidth, innerHeight, fit.W, fit.H, O.pose[0], O.pose[1], O.s, O.cx, O.cy].join(); if (key !== lastKey) { lastKey = key; layout(); }
                if (O.mode === 'blink') img.style.opacity = Math.floor((now - t0) / 260) % 2 ? 0 : 1;
                drawMarks(); }
        }
        paintFitRender(now);
        document.body.classList.toggle('w31-ovhide', (fit.mode || 0) < 4);   // the panel's 2-D canvas is only for the strip views (POLAR, HEIGHT): photo / render / diff live on the iris, and with no photo it was an empty black box
        requestAnimationFrame(tick);
    })(t0);
    window.addEventListener('resize', () => { lastKey = ''; layout(); });
    apply();
})();
