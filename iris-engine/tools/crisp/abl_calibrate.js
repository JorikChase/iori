// study/11 §5.5 (a), per pixel (2026-09-28): the ABL texture's octave amplitudes calibrated END TO END — each octave against the band it
// dominates at 6× (6 µm → the finest, 12 µm → the middle, 24 µm → the coarse), in quadrature over the render without texture, the
// sheet at 5 sites; then the 6 µm octave trimmed so the finest band sits at 100 %. The coarse band is left short on purpose: above
// ≈ 20 µm the sheet's structure is partly directional (strands), which a random texture must not fill.
//   await import('/iris-engine/tools/crisp/abl_calibrate.js'); await __ablCal.step('09', 'base' | 'first' | 'iterate' | 'trim')
(() => {
    // (2026-09-28) measured on the VIEWPORT's accumulated path: its jittered frames average each pixel over its area as the photo's pixels do;
    // the exact path point-samples, and a texture calibrated there came out at 60 % of the photo's finest band in the viewport
    const T = window.IrisTissue, X = window.__ablCal = { runs: {}, render: { frames: 16 } };
    const pct = s => s.split(' (')[0].split(' · ').map(x => parseFloat(x));
    X.run = async (r, amp) => {
        await import('/iris-engine/tools/t7/eyes.js'); await import('/iris-engine/tools/crisp/crisp.js');
        const spec = await fetch(`/iris-engine/study/proof-layers/sheet/abltex-${r}.json?` + Date.now()).then(x => x.json());
        T.ablTexOverride = amp ? Object.assign({}, spec, { amp: [...amp, 0], gain: 1 }) : null;
        const a = await window.__t7.review(r, { url: `data/tissue-${r}.json` });
        const out = { amp: amp ? amp.map(x => +x.toFixed(3)) : null, whole: [a.layer.match2, a.layer.strandCorr, a.layer.cellDab], z6: (await window.__crisp.eye({ zoom: 6, render: X.render })).sheet, z3: (await window.__crisp.eye({ zoom: 3, render: X.render })).sheet };
        (X.runs[r] = X.runs[r] || []).push(out); return out;
    };
    X.step = async (r, mode) => {
        const R = X.runs[r] || [], spec = await fetch(`/iris-engine/study/proof-layers/sheet/abltex-${r}.json?` + Date.now()).then(x => x.json());
        if (mode === 'base') return X.run(r, null);
        if (mode === 'first') return X.run(r, spec.amp.slice(0, 3).map(a => a * 0.35));
        if (mode === 'current') return X.run(r, spec.amp.slice(0, 3));
        const base = pct(R[0].z6), last = R[R.length - 1], meas = pct(last.z6), f = k => Math.sqrt((1e4 - base[k] ** 2) / Math.max(1, meas[k] ** 2 - base[k] ** 2));
        if (mode === 'iterate') return X.run(r, last.amp.map((a, k) => a * f(k)));
        if (mode === 'trim') { const e = last.amp.slice(); e[0] *= f(0); return X.run(r, e); }
    };
})();
// the same in three short calls (the javascript tool stops at 45 s): __ablCal.review(r, amp) → __ablCal.measure(r, 6) → __ablCal.measure(r, 3, true)
(() => {
    const T = window.IrisTissue, X = window.__ablCal;
    X.review = async (r, amp) => {
        await import('/iris-engine/tools/t7/eyes.js'); await import('/iris-engine/tools/crisp/crisp.js');
        const spec = await fetch(`/iris-engine/study/proof-layers/sheet/abltex-${r}.json?` + Date.now()).then(x => x.json());
        T.ablTexOverride = amp ? Object.assign({}, spec, { amp: [...amp, 0], gain: 1 }) : null;
        const a = await window.__t7.review(r, { url: `data/tissue-${r}.json` });
        X.cur = { amp: amp ? amp.map(x => +x.toFixed(3)) : null, whole: [a.layer.match2, a.layer.strandCorr, a.layer.cellDab] }; return X.cur;
    };
    X.measure = async (r, zoom, done) => { X.cur['z' + zoom] = (await window.__crisp.eye({ zoom, render: X.render })).sheet; if (done) (X.runs[r] = X.runs[r] || []).push(X.cur); return X.cur; };
    X.next = (r, mode) => { const R = X.runs[r], pct = s => s.split(' (')[0].split(' · ').map(x => parseFloat(x)), base = pct(R[0].z6), last = R[R.length - 1], meas = pct(last.z6), f = k => Math.sqrt((1e4 - base[k] ** 2) / Math.max(1, meas[k] ** 2 - base[k] ** 2));
        if (mode === 'trim') { const e = last.amp.slice(); e[0] *= f(0); return e; } return last.amp.map((a, k) => a * f(k)); };
})();
