// study/11 S3 — shipped measurements against measured ones. In the page (opened with ?start=off):
//   await import('/iris-engine/tools/s3/bench.js');
//   await __s3.measured();                                  // the Load button's path: photo, calibrate, de-light
//   await __s3.sweep([{ lightBits: 16, shadeBits: 16 }, …]); // export each, load it shipped, compare to the measured render
//   await __s3.arrival();                                   // the start eye's path: case file, no photo, shipped
//   __s3.sideBySide()                                       // measured · shipped · |difference| × 16 → PNG data URL
(() => {
    const E = window.__irisEngine, F = E.fit, T = window.IrisTissue, CASE = '26-green-crypts-isolated.jpg', SRC = 'data/tissue-26.json';
    const S3 = window.__s3 = { ref: null, shipped: null };
    let cases = null;
    const score = () => { F.renderFit(); const s = F.score(); return s && { match2: +s.match2.toFixed(3), match: +s.match.toFixed(3), grad: +s.grad.toFixed(4), dab: +s.dab.toFixed(3), strandCorr: s.strandCorr, hcorr: +s.hcorr.toFixed(3) }; };
    const cmp = (a, b) => { let mx = 0, sum = 0, n = 0, over2 = 0; for (let i = 0; i < a.length; i += 4) for (let t = 0; t < 3; t++) { const d = Math.abs(a[i + t] - b[i + t]); mx = Math.max(mx, d); sum += d; n++; if (d > 2) over2++; } return { max: mx, mean: +(sum / n).toFixed(4), over2 }; };
    const photoFrame = async () => { if (!cases) cases = await fetch('ref/cases.json').then(r => r.json()); T.on = false; await F.renderCaseThumb(CASE, cases[CASE], document.createElement('canvas')); };
    S3.measured = async () => {
        await photoFrame(); const t0 = performance.now(); await T.proof(SRC, { json: T.json }); const ms = Math.round(performance.now() - t0);
        const s = score(); S3.ref = { render: Uint8ClampedArray.from(F.fit.render), s, ms, W: F.fit.W, H: F.fit.H }; return { ms, s };
    };
    // shipped in the PHOTO frame: isolates the measurements (the frame is the measured one's)
    S3.shippedIn = async buf => {
        await photoFrame(); const t0 = performance.now(); await T.proof(SRC, { json: T.json, shipped: buf }); const ms = Math.round(performance.now() - t0);
        const s = score(); S3.shipped = { render: Uint8ClampedArray.from(F.fit.render), s, ms }; return { ms, s, px: cmp(S3.ref.render, F.fit.render), shipped: T.shipped };
    };
    S3.sweep = async (variants, opts = {}) => {
        if (!S3.ref) await S3.measured();
        const out = [];
        for (const v of variants) {
            await S3.measured();                                                             // export needs a measured state
            const ex = await T.exportMeasurements(v); const r = await S3.shippedIn(ex.bytes.buffer.slice(0));
            out.push(Object.assign({ variant: JSON.stringify(v), kb: Math.round(ex.bytes.length / 1024) }, r.s, { ms: r.ms, px: r.px }));
            if (opts.save && v === opts.save) await fetch('/save/data/tissue-26.cal.bin', { method: 'POST', body: ex.bytes });
        }
        return out;
    };
    // the arrival path, end to end: data/case-26.json (no photo) → frameFromCase → proof({ shipped }). Rendered in the
    // photoless frame, compared with the measured render (the frames must agree for the pixels to).
    S3.arrival = async (url = 'data/tissue-26.cal.bin') => {
        const t = [], t0 = performance.now(), mark = l => t.push([l, Math.round(performance.now() - (t.last || t0))]) && (t.last = performance.now());
        T.on = false; const c = await fetch('data/case-26.json').then(r => r.json()); mark('case file');
        F.frameFromCase(CASE, c); mark('frame + import + first fit render');
        await T.proof(SRC, { json: T.json, shipped: url, onStage: (i, n, l) => mark(l) });
        const total = Math.round(performance.now() - t0);
        F.renderFit(); const px = cmp(S3.ref.render, F.fit.render), render = Uint8ClampedArray.from(F.fit.render);
        S3.arrivalRender = render; return { total, steps: t.slice(), shipped: T.shipped, px, photoless: F.fit.photoless };
    };
    // measured · shipped · |difference| × 16, cropped to the iris
    S3.sideBySide = (b = S3.arrivalRender || (S3.shipped && S3.shipped.render)) => {
        const W = S3.ref.W, H = S3.ref.H, L = F.fit.limbus, s = Math.round(Math.max(L.rx, L.ry) * 2.3), x0 = Math.round(L.x - s / 2), y0 = Math.round(L.y - s / 2);
        const cv = document.createElement('canvas'); cv.width = s * 3 + 16; cv.height = s + 26; const cx = cv.getContext('2d');
        cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
        const put = (px, slot) => { const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H; tmp.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(px), W, H), 0, 0); cx.drawImage(tmp, x0, y0, s, s, slot * (s + 8), 26, s, s); };
        const d = new Uint8ClampedArray(W * H * 4); for (let i = 0; i < W * H * 4; i += 4) { const v = Math.max(Math.abs(S3.ref.render[i] - b[i]), Math.abs(S3.ref.render[i + 1] - b[i + 1]), Math.abs(S3.ref.render[i + 2] - b[i + 2])) * 16; d[i] = d[i + 1] = d[i + 2] = 255 - Math.min(255, v); d[i + 3] = 255; }
        put(S3.ref.render, 0); put(b, 1); put(d, 2);
        cx.fillStyle = '#222'; cx.font = '14px Urbanist, sans-serif';
        ['measured (the Load button)', 'shipped (the arrival)', '|difference| × 16 (white = identical)'].forEach((l, i) => cx.fillText(l, i * (s + 8) + 4, 18));
        return cv.toDataURL('image/png');
    };
})();
