// study/11 §5.5 — the de-bias measured and published one eye per FRESH page (the measured load is path-dependent, §3.4).
//   await import('/iris-engine/tools/tone/fresh.js'); await __fresh.review('26', true)     // review path, de-bias on / off
//   await __fresh.publish('26')   // the button's load (measured, de-biased) → export the measurements → the arrival gate
(() => {
    const T = window.IrisTissue, F = window.__irisEngine.fit, X = window.__fresh = {};
    X.review = async (r, on) => {
        await import('/iris-engine/tools/t7/eyes.js'); await import('/iris-engine/tools/tone/tone.js');
        T.debiasOn = on; const a = await window.__t7.review(r, { url: `data/tissue-${r}.json` }); T.debiasOn = true;
        return { eye: r, debias: on, scores: [a.layer.match2, a.layer.strandCorr, a.layer.cellDab, a.layer.dab], tone: window.__tone.bins(), stats: on ? T.debiasStats : null };
    };
    X.publish = async r => {
        T.debiasOn = true; window.__irisTissueUI.eye = r; await window.__irisTissueUI.load();
        F.renderFit(); const A = Uint8ClampedArray.from(F.fit.render), s = F.score();
        const ex = await T.exportMeasurements({ lightBits: 10, shadeBits: 11 }), bytes = ex.bytes;
        const saved = await fetch(`/save/data/tissue-${r}.cal.bin`, { method: 'POST', body: bytes }).then(x => x.text());
        await window.__irisTissueUI.load({ arrival: true }); F.renderFit(); const B = F.fit.render; let mx = 0, n = 0;
        for (let i = 0; i < A.length; i++) { const d = Math.abs(A[i] - B[i]); if (d > 1) n++; mx = Math.max(mx, d); }
        return { eye: r, measured: [+s.match2.toFixed(2), s.strandCorr], saved, bytes: bytes.byteLength || bytes.length, gate: { maxDiff: mx, over1: n, pass: mx <= 1 } };
    };
})();
