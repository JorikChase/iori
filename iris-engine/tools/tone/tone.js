// study/11 §5.5 — the render's brightness against the photo's, by the photo's own local brightness (8 bins, 0.25 mm average),
// and lightness / chroma percentiles. The fit frame, after any load:  await import('/iris-engine/tools/tone/tone.js'); __tone.bins()
(() => {
    const E = window.__irisEngine, F = E.fit, X = window.__tone = {};
    const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    X.bins = (r = 4) => {
        const W = F.fit.W, H = F.fit.H, m = F.fit.mask;
        const Y = px => { const o = new Float32Array(W * H); for (let k = 0; k < W * H; k++) o[k] = 0.2126 * lin(px[k * 4]) + 0.7152 * lin(px[k * 4 + 1]) + 0.0722 * lin(px[k * 4 + 2]); return o; };
        const box = src => { const t = new Float32Array(W * H), o = new Float32Array(W * H);
            for (let y = 0; y < H; y++) { let s = 0; for (let x = -r; x < W + r; x++) { if (x + r < W) s += src[y * W + x + r] || 0; if (x - r - 1 >= 0 && x - r - 1 < W) s -= src[y * W + x - r - 1]; if (x >= 0 && x < W) t[y * W + x] = s; } }
            for (let x = 0; x < W; x++) { let s = 0; for (let y = -r; y < H + r; y++) { if (y + r < H) s += t[(y + r) * W + x] || 0; if (y - r - 1 >= 0 && y - r - 1 < H) s -= t[(y - r - 1) * W + x]; if (y >= 0 && y < H) o[y * W + x] = s; } } return o; };
        const blur = img => { const a = new Float32Array(W * H), w = new Float32Array(W * H); for (let k = 0; k < W * H; k++) if (m[k]) { a[k] = img[k]; w[k] = 1; } const A = box(a), B = box(w), o = new Float32Array(W * H); for (let k = 0; k < W * H; k++) o[k] = B[k] > 0.5 ? A[k] / B[k] : 0; return o; };
        const Yp = Y(F.fit.photo), Yr = Y(F.fit.render), Pb = blur(Yp), Rb = blur(Yr), idx = [];
        for (let k = 0; k < W * H; k++) if (m[k] && Pb[k] > 0) idx.push(k);
        idx.sort((i, j) => Pb[i] - Pb[j]); const bins = [];
        for (let b = 0; b < 8; b++) { const sl = idx.slice(Math.floor(b * idx.length / 8), Math.floor((b + 1) * idx.length / 8)); let sp = 0, sr = 0; for (const k of sl) { sp += Pb[k]; sr += Rb[k]; } bins.push(+(sr / sp).toFixed(3)); }
        let tp = 0, tr = 0; for (const k of idx) { tp += Yp[k]; tr += Yr[k]; }
        return { mean: +(tr / tp).toFixed(3), bins: bins.join(' · ') };
    };
})();
