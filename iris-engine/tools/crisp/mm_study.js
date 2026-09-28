// study/11 §5.5 fix 2: an eye through the review path with some of its colour-chain widths scaled (mm.wall, mm.rimW, …) — the light
// measured on each variant; whole-eye scores and the crypt / sheet band contrast at 6×.
//   await import('/iris-engine/tools/crisp/mm_study.js'); await __mmStudy.run('09', { rimW: 0.2 })
(() => {
    const T = window.IrisTissue, F = window.__irisEngine.fit, X = window.__mmStudy = {};
    X.run = async (r, scale = {}) => {
        await import('/iris-engine/tools/crisp/crisp.js');
        const cases = await fetch('ref/cases.json').then(x => x.json()), file = Object.keys(cases).find(f => f.startsWith(r + '-'));
        T.on = false; await F.renderCaseThumb(file, cases[file], document.createElement('canvas'));
        const json = await fetch(`data/tissue-${r}.json`).then(x => x.json()); for (const k in scale) json.mm[k] *= scale[k];
        await T.proof(`data/tissue-${r}.json`, { json }); F.renderFit(); const s = F.score(), d = F.diagnostics() || {};
        const z6 = await window.__crisp.eye({ zoom: 6 });
        return { eye: r, scale, whole: [+s.match2.toFixed(2), +s.strandCorr.toFixed(3), d.cellDab], crypt6: z6.crypt, sheet6: z6.sheet };
    };
})();
