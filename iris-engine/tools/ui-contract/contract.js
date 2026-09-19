// UI contract test (study/09 §7): what the fitter and our automation need from the page, recorded as one JSON
// so that a UI change can be proved harmless — run it before and after, the two results must be identical
// (compare.py). It never saves: runBench runs with { save: false } and nothing is POSTed.
//
// Run it in the page (Browser pane console / javascript_tool), on a dev server of your own:
//     await import('/iris-engine/tools/ui-contract/contract.js'); __uiContract.start({ iters: 20 });
//     __uiContract.stage      // progress        __uiContract.result   // the JSON when stage === 'done'
// It reports: (1) every element id fit.js / design.js / index.html look up, (2) the __irisEngine and .fit API
// surface, (3) the photo fit driven through the PANEL like a user (reference select → AUTO ALIGN → SOLVE POSE →
// score), (4) the photo fit driven through the API like a bench (runBench, canonical start), with the row, the
// genome fingerprint and a hash of the scored render.
(() => {
    const IDS = {
        'fit.js': 'casebook cb-close cb-grid cb-stat fit-alignout fit-auto fit-bench fit-benchiso fit-casebook fit-cases fit-close fit-detect fit-diag fit-files fit-global fit-load fit-log fit-open fit-panel fit-ref fit-refine fit-save fit-score fit-solve fit-stop fit-study fit-view fitcv',
        'design.js': 'accum-bar brush-cursor design-clear design-colour design-flow design-hud design-layer design-repeat design-size design-size-v design-swatch design-toggle design-undo design-value design-value-v',
        'index.html': 'gl quality-sel idout-btn idin-btn shot-btn cam-btn seed-btn atlas-btn maps-btn debug-btn refr-btn anim2-btn tone-btn ref-btn fieldw-btn strand-btn ' +
            ['relief', 'light', 'pupil', 'elev', 'seed', 'warp', 'collr', 'blcol', 'blrel', 'blflow', 'crypt', 'furrow', 'pigment', 'stroma', 'pheo', 'mie', 'ring', 'yellow', 'srcsize', 'ambient', 'lid', 'ev', 'fstop', 'kelvin', 'grain', 'bloom', 'focus'].map(k => `param-${k} val-${k}`).join(' '),
    };
    const hash = x => { let a = 2166136261; const s = typeof x === 'string' ? x : JSON.stringify(x); for (let i = 0; i < s.length; i++) { a ^= s.charCodeAt(i); a = Math.imul(a, 16777619); } return (a >>> 0).toString(16); };
    const hashBytes = b => { let a = 2166136261; for (let i = 0; i < b.length; i++) { a ^= b[i]; a = Math.imul(a, 16777619); } return (a >>> 0).toString(16); };
    const tick = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });   // not throttled in a hidden pane
    const until = async (f, ms = 60000) => { const t0 = performance.now(); while (!f()) { if (performance.now() - t0 > ms) throw new Error('timeout'); await tick(); } };
    const num = o => JSON.parse(JSON.stringify(o, (k, v) => k === 'ms' || k === 'secs' ? undefined : typeof v === 'number' && !Number.isInteger(v) ? +v.toPrecision(12) : v));   // timings are not part of the contract
    const T = window.__uiContract = { stage: 'idle', result: null, error: null };

    // diff a finished run against the stored baseline (tools/ui-contract/baseline.json): [] = the UI change is harmless
    T.compare = async (url = '/iris-engine/tools/ui-contract/baseline.json') => {
        const base = await fetch(url, { cache: 'no-store' }).then(r => r.json()), cur = JSON.parse(JSON.stringify(T.result)), diffs = [];
        const SKIP = new Set(['hash', 'mouseX', 'mouseY', 'frameCount']);   // runtime keys (viewport- and time-dependent) and the summary hashes, which the field-wise diff makes redundant
        const walk = (a, b, path) => { if (a && b && typeof a === 'object' && typeof b === 'object') { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (!SKIP.has(k)) walk(a[k], b[k], path + '.' + k); } else if (JSON.stringify(a) !== JSON.stringify(b)) diffs.push([path, a, b]); };
        for (const k of ['dom', 'panel', 'bench', 'after']) walk(base[k], cur[k], k); if (base.api.hash !== cur.api.hash) diffs.push(['api.hash', base.api.hash, cur.api.hash]);
        return diffs;
    };
    // ---- full fit equality between shells: every isolated reference at bench settings, nothing saved. Run once per
    // shell (?ui=98, ?ui=31); each run is kept in localStorage under its shell's name; T.benchCompare() diffs them.
    T.bench = async (opts = {}) => {
        const E = window.__irisEngine, F = E.fit, fit = F.fit, files = opts.files || [...F.ISOLATED], iters = opts.iters || 120, shell = document.body.classList.contains('w31-shell') ? '31' : '98', out = { shell, quality: E.quality, iters, cases: {} };
        T.stage = 'bench 0/' + files.length; T.error = null;
        try { for (let i = 0; i < files.length; i++) { const file = files[i]; await F.runBench([file], { save: false, iters, tag: 'ui-contract-full' });
                const row = Object.assign({}, JSON.parse(localStorage.getItem('irisBench') || '[]').filter(r => r.tag === 'ui-contract-full').pop());
                out.cases[file] = { row: num(row), fingerprint: F.fingerprint(), render: fit.render ? hashBytes(fit.render) : null, id: hash([Object.assign({}, E.genome, { fields: undefined }), E.encodeFields(E.genome)]) }; delete out.cases[file].row.tag;
                T.stage = `bench ${i + 1}/${files.length}`; }
            localStorage.setItem('uiContractFull:' + shell + ':' + E.quality, JSON.stringify(out)); T.benchResult = out; T.stage = 'bench done';
        } catch (e) { T.error = String(e && e.stack || e); T.stage = 'error'; }
        return out;
    };
    T.benchCompare = (quality = 'normal') => { const a = JSON.parse(localStorage.getItem('uiContractFull:98:' + quality) || 'null'), b = JSON.parse(localStorage.getItem('uiContractFull:31:' + quality) || 'null'); if (!a || !b) return { error: 'need both runs', have: [!!a, !!b] };
        const diffs = [], walk = (x, y, path) => { if (x && y && typeof x === 'object' && typeof y === 'object') { for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], path + '.' + k); } else if (JSON.stringify(x) !== JSON.stringify(y)) diffs.push([path, x, y]); };
        walk(a.cases, b.cases, 'cases'); return { iters: [a.iters, b.iters], files: Object.keys(a.cases).length, diffs, summary: Object.fromEntries(Object.entries(b.cases).map(([f, c]) => [f.slice(0, 2), [c.row.match2, c.row.match, c.render]])) }; };

    // ---- overlay registration: is the photo layer exactly where the engine draws the same frame? The iris outline
    // (outermost non-white pixel of every row, so the catchlight cannot bias it) is circle-fitted on the scored
    // off-screen render and on the LIVE canvas mapped back through the overlay's rectangle; both in fit pixels.
    const circleFit = pts => { let sx = 0, sy = 0, n = pts.length; for (const [x, y] of pts) { sx += x; sy += y; } const mx = sx / n, my = sy / n; let suu = 0, svv = 0, suv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
        for (const [x, y] of pts) { const u = x - mx, v = y - my; suu += u * u; svv += v * v; suv += u * v; suuu += u * u * u; svvv += v * v * v; suvv += u * v * v; svuu += v * u * u; }
        const d = suu * svv - suv * suv, uc = ((suuu + suvv) / 2 * svv - (svvv + svuu) / 2 * suv) / d, vc = ((svvv + svuu) / 2 * suu - (suuu + suvv) / 2 * suv) / d; return { x: mx + uc, y: my + vc, r: Math.sqrt(uc * uc + vc * vc + (suu + svv) / n), n }; };
    const outline = (px, w, hh, toXY, thr = 215) => { const pts = []; for (let y = 0; y < hh; y++) { let l = -1, r = -1; for (let x = 0; x < w; x++) { const o = (y * w + x) * 4; if ((px[o] + px[o + 1] + px[o + 2]) / 3 < thr) { if (l < 0) l = x; r = x; } } if (l > 0 && r < w - 1 && r - l > 8) { pts.push(toXY(l, y), toXY(r + 1, y)); } } return pts; };
    T.registration = async (label = '') => {
        const E = window.__irisEngine, F = E.fit, fit = F.fit, gl = E.gl, cv = E.canvas, O = window.__irisOverlay, box = document.getElementById('w31-ov');
        const wait = async ms => { const t0 = performance.now(); while (performance.now() - t0 < ms) await new Promise(r => requestAnimationFrame(r)); };
        await wait(900);                                                                                         // let the engine redraw the current view
        const W = cv.width, H = cv.height, px = new Uint8Array(W * H * 4); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const L = parseFloat(box.style.left), Tp = parseFloat(box.style.top), bw = parseFloat(box.style.width), bh = parseFloat(box.style.height), kx = innerWidth / W, ky = innerHeight / H;
        const live = circleFit(outline(px, W, H, (x, y) => [((x * kx) - L) / bw * fit.W, (((H - y - 0.5) * ky) - Tp) / bh * fit.H]));      // GL rows run bottom-up; rows by their centres, columns by their edges
        const view = E.state.view.slice(); O.restoreView(); F.renderFit(); const ref = circleFit(outline(fit.render, fit.W, fit.H, (x, y) => [x, y + 0.5])); E.state.view = view; E.resetAccumulation();
        const cssPerFit = bw / fit.W; return { label, viewport: [innerWidth, innerHeight], s: +O.s.toFixed(3), dx: +(live.x - ref.x).toFixed(3), dy: +(live.y - ref.y).toFixed(3), dCentreFitPx: +Math.hypot(live.x - ref.x, live.y - ref.y).toFixed(3), dCentreCssPx: +(Math.hypot(live.x - ref.x, live.y - ref.y) * cssPerFit).toFixed(3), dRadiusPct: +((live.r / ref.r - 1) * 100).toFixed(2), pts: [live.n, ref.n] };
    };
    T.start = async (opts = {}) => {
        const E = window.__irisEngine, F = E.fit, fit = F.fit, file = opts.file || '26-green-crypts-isolated.jpg', out = {};
        try {
            T.stage = 'dom'; T.result = null; T.error = null;
            out.meta = { engine: E.ENGINE_VERSION, quality: E.quality, file, iters: opts.iters || 20, shell: [...document.body.classList].filter(c => /shell|w98|w31/.test(c)), scripts: [...document.scripts].map(s => s.src.split('/').pop()).filter(Boolean) };
            out.dom = { missing: Object.fromEntries(Object.entries(IDS).map(([src, ids]) => [src, ids.split(' ').filter(id => !document.getElementById(id))])), fitcvIs2d: !!document.getElementById('fitcv').getContext('2d') };
            out.api = { engine: Object.keys(E).sort(), fit: Object.keys(F).sort() }; out.api.hash = hash(out.api);

            // (3) the panel, as a user drives it
            T.stage = 'panel';
            F.resetForFreshFit();
            document.getElementById('fit-open').click();
            const panel = document.getElementById('fit-panel'), sel = document.getElementById('fit-ref');
            out.panel = { opens: !panel.classList.contains('hidden') && panel.getBoundingClientRect().width > 0, refOptions: sel.options.length };
            fit.photo = null; sel.value = [...sel.options].map(o => o.value).find(v => v.endsWith(file)) || ''; sel.dispatchEvent(new Event('change', { bubbles: true }));
            await until(() => fit.photo && fit.W > 0);
            document.getElementById('fit-auto').click(); document.getElementById('fit-solve').click();
            const s = F.score();
            out.panel = Object.assign(out.panel, num({ W: fit.W, H: fit.H, photo: hashBytes(fit.photo), pupil: fit.pupil, limbus: fit.limbus, catch: fit.catch, pose: fit.pose && { zoom: fit.pose.zoom, rot: fit.pose.rot, pupil: fit.pose.pupil }, score: { match: s.match, match2: s.match2, ssim: s.ssim, dL: s.dL, dab: s.dab }, render: fit.render ? hashBytes(fit.render) : null, log: document.getElementById('fit-log').textContent.length > 0 }));
            // the view button cycles and the 2-D canvas draws (the display path the overlay will replace)
            const view = document.getElementById('fit-view'), labels = []; for (let i = 0; i < 6; i++) { view.click(); labels.push(view.textContent); } out.panel.viewCycle = labels;

            // (4) the API, as a bench drives it
            T.stage = 'bench';
            await F.runBench([file], { save: false, iters: opts.iters || 20, tag: 'ui-contract' });   // returns nothing; the row lands in localStorage (this origin only)
            const row = Object.assign({}, JSON.parse(localStorage.getItem('irisBench') || '[]').filter(r => r.tag === 'ui-contract').pop()); delete row.secs; delete row.tag;
            out.meta.canvas = [E.canvas.width, E.canvas.height, innerWidth, innerHeight, devicePixelRatio];
            out.bench = { row: num(row), state: num(Object.fromEntries(Object.entries(E.state).filter(([k, v]) => typeof v !== 'object' || Array.isArray(v)))), fingerprint: F.fingerprint(), render: fit.render ? hashBytes(fit.render) : null, id: hash([Object.assign({}, E.genome, { fields: undefined }), E.encodeFields(E.genome)]) };   // NOT E.exportID(): that one sets location.hash, writes the clipboard and downloads a file
            // keys the interactive loop will still move after the fit (state ≠ target): the exported ID changes once frames run
            out.bench.drift = Object.keys(E.target).filter(k => k in E.state && !['mouseX', 'mouseY', 'frameCount'].includes(k) && JSON.stringify(E.target[k]) !== JSON.stringify(E.state[k])).map(k => [k, E.state[k], E.target[k]]);
            out.bench.hash = hash(out.bench);

            // the interactive loop is released again and the page still renders
            out.after = { fitting: !!E.state.fitting, capturing: !!E.state.capturing };
            out.hash = hash([out.dom, out.api.hash, out.panel, out.bench.hash]);
            T.result = out; T.stage = 'done';
        } catch (e) { T.error = String(e && e.stack || e); T.result = out; T.stage = 'error'; }
        return out;
    };
})();
