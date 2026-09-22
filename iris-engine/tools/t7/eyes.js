// study/11 T7 — an eye's layer model against its photograph and its legacy fit. In the page (?start=off, dev server):
//   await import('/iris-engine/tools/t7/eyes.js');
//   await __t7.review('25')        // → { legacy, layer, png }  scores of both, and photo · legacy · layer model
//   await __t7.save('25')          // the review image → study/proof-layers/t7-review-25.json (decode with t7/decode.py)
// The layer model comes from tools/layer_proof.py --ref NN --whole --export (study/proof-layers/tissue-NN-whole.json).
(() => {
    const E = window.__irisEngine, F = E.fit, T = window.IrisTissue;
    const X7 = window.__t7 = { last: {} };
    let cases = null;
    const fileOf = ref => Object.keys(cases).find(f => f.startsWith(ref + '-'));
    const score = () => { F.renderFit(); const s = F.score(), d = F.diagnostics() || {};
        return { match2: +s.match2.toFixed(2), match: +s.match.toFixed(2), grad: +s.grad.toFixed(3), dab: +s.dab.toFixed(2), cellDab: d.cellDab, strandCorr: s.strandCorr, hcorr: +s.hcorr.toFixed(3) }; };
    X7.review = async (ref, opts = {}) => {
        if (!cases) cases = await fetch('ref/cases.json').then(r => r.json());
        const file = fileOf(ref), c = cases[file]; T.on = false;
        await F.renderCaseThumb(file, c, document.createElement('canvas'));
        const legacy = score(), legacyPx = Uint8ClampedArray.from(F.fit.render), photo = Uint8ClampedArray.from(F.fit.photo);
        const t0 = performance.now();
        await T.proof(opts.url || `study/proof-layers/tissue-${ref}-whole.json`, {});
        const ms = Math.round(performance.now() - t0), layer = score(), layerPx = Uint8ClampedArray.from(F.fit.render);
        const W = F.fit.W, H = F.fit.H, L = F.fit.limbus, s = Math.round(Math.max(L.rx, L.ry) * 2.3), x0 = Math.round(L.x - s / 2), y0 = Math.round(L.y - s / 2);
        const cv = document.createElement('canvas'); cv.width = s * 3 + 16; cv.height = s + 26; const cx = cv.getContext('2d');
        cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
        const put = (px, slot) => { const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H; tmp.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(px), W, H), 0, 0); cx.drawImage(tmp, x0, y0, s, s, slot * (s + 8), 26, s, s); };
        put(photo, 0); put(legacyPx, 1); put(layerPx, 2);
        cx.fillStyle = '#222'; cx.font = '14px Urbanist, sans-serif';
        [`eye ${ref} · the photograph`, `legacy fit · MATCH2 ${legacy.match2} · cellΔab ${legacy.cellDab}`, `layer model · MATCH2 ${layer.match2} · cellΔab ${layer.cellDab}`].forEach((l, i) => cx.fillText(l, i * (s + 8) + 4, 18));
        const out = { ref, file, legacy, layer, loadMs: ms, stats: T.srelStats, png: cv.toDataURL('image/png') };
        X7.last[ref] = out; return Object.assign({}, out, { png: out.png.length + ' chars' });
    };
    X7.save = async ref => fetch(`/save/t7-review-${ref}.json`, { method: 'POST', body: JSON.stringify({ png: X7.last[ref].png, legacy: X7.last[ref].legacy, layer: X7.last[ref].layer }) }).then(r => r.text());
})();
