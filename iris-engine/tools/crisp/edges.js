// study/11 §5.5 fix 2: how sharp are the crypts' edges and lips, photo against render? At K× zoom crops (tools/crisp/crisp.js), the
// lightness profile across the model's own hole outlines (perpendicular, ±80 µm), each profile aligned at its own steepest point
// (the photo's edge need not sit exactly on the fitted outline), averaged; then the 10–90 % width of the mean profile and the lip —
// the peak on the sheet side over the sheet's plateau.
//   await import('/iris-engine/tools/crisp/edges.js'); await __edges.measure({ zoom: 6 })
(() => {
    const E = window.__irisEngine, F = E.fit, T = window.IrisTissue, X = window.__edges = {};
    const Lof = px => { const W = F.fit.W, H = F.fit.H, L = new Float32Array(W * H); for (let k = 0; k < W * H; k++) L[k] = window.__crisp.lab(px, k * 4)[0]; return L; };
    const bil = (L, W, H, x, y) => { const x0 = Math.floor(x), y0 = Math.floor(y); if (x0 < 0 || y0 < 0 || x0 >= W - 1 || y0 >= H - 1) return NaN; const fx = x - x0, fy = y - y0;
        return (L[y0 * W + x0] * (1 - fx) + L[y0 * W + x0 + 1] * fx) * (1 - fy) + (L[(y0 + 1) * W + x0] * (1 - fx) + L[(y0 + 1) * W + x0 + 1] * fx) * fy; };
    X.profiles = (Ls, at, zoom) => {
        const W = F.fit.W, H = F.fit.H, k = [W / T.src.fit[0], H / T.src.fit[1]], umPx = (1000 * 5.85 / (F.fit.limbus.rx)) / zoom;   // µm per crop pixel
        const n = 121, step = 2.0, acc = Ls.map(() => new Float64Array(n)); let cnt = 0;
        for (const o of T.sets.outlines) { const q = o.xy; if (!q || q.length < 8) continue;
            for (let i = 2; i < q.length - 2; i += 3) {
                const p = [q[i][0] * k[0], q[i][1] * k[1]], a = [q[i - 2][0] * k[0], q[i - 2][1] * k[1]], b = [q[i + 2][0] * k[0], q[i + 2][1] * k[1]];
                let tx = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl; const nx = -ty, ny = tx;
                const cx = (p[0] - at[0]) * zoom + W / 2, cy = (p[1] - at[1]) * zoom + H / 2; if (cx < 40 || cy < 40 || cx > W - 40 || cy > H - 40) continue;
                // five neighbouring profiles along the edge averaged first (±2 outline samples on each side): speckle cancels, the edge does not
                const prof = Ls.map(L => { const v = new Float64Array(n); for (const off of [-6, -3, 0, 3, 6]) { const ii = Math.min(q.length - 1, Math.max(0, i + off)), ox = (q[ii][0] * k[0] - at[0]) * zoom + W / 2, oy = (q[ii][1] * k[1] - at[1]) * zoom + H / 2;
                    for (let j = 0; j < n; j++) { const d = (j - (n >> 1)) * step / umPx; v[j] += bil(L, W, H, ox + nx * d, oy + ny * d) / 5; } } return v; });
                if (prof.some(v => v.some(x => !isFinite(x)))) continue;
                // orient: the sheet (brighter) on the + side, the hole on the − side; align each at its steepest point within ±30 µm
                const s0 = prof[0].slice(n - 10).reduce((x, y) => x + y) - prof[0].slice(0, 10).reduce((x, y) => x + y); const sg = s0 >= 0 ? 1 : -1;
                prof.forEach((v, m) => { const w = sg > 0 ? v : Float64Array.from(v).reverse(); let best = 0, bj = n >> 1;
                    for (let j = (n >> 1) - 15; j <= (n >> 1) + 15; j++) { const g = w[j + 1] - w[j - 1]; if (g > best) { best = g; bj = j; } }
                    for (let j = 0; j < n; j++) { const jj = j + bj - (n >> 1); acc[m][j] += w[Math.min(n - 1, Math.max(0, jj))]; } });
                cnt++; } }
        return { cnt, mean: acc.map(a => Array.from(a, x => x / Math.max(1, cnt))), step };
    };
    X.width = (v, step) => { const n = v.length, lo = v.slice(0, 10).reduce((a, b) => a + b) / 10, hiP = v.slice(n - 10).reduce((a, b) => a + b) / 10;
        const at = f => { const t = lo + f * (hiP - lo); for (let j = 1; j < n; j++) if (v[j] >= t && v[j - 1] < t) return j - 1 + (t - v[j - 1]) / (v[j] - v[j - 1]); return NaN; };
        const peak = Math.max(...v.slice(n >> 1, (n >> 1) + 30));   // the lip: within 60 µm on the sheet side; the plateau: the last 20 µm (100–120 µm out)
        return { width10_90um: +((at(0.9) - at(0.1)) * step).toFixed(1), lipOverSheet: +((peak - hiP) / Math.max(1e-3, hiP - lo)).toFixed(3), holeL: +lo.toFixed(1), sheetL: +hiP.toFixed(1) }; };
    X.measure = async (o = {}) => {
        const z = o.zoom || 6, sites = window.__crisp.sites(), out = []; let accP = null, accR = null, tot = 0;
        for (const at of sites) {
            const P = await window.__crisp.photo(at, z), R = window.__crisp.render(at, z, o.render || { exact: true });
            const pr = X.profiles([Lof(P), Lof(R)], at, z); if (!pr.cnt) continue; tot += pr.cnt;
            if (!accP) { accP = pr.mean[0].map(x => x * pr.cnt); accR = pr.mean[1].map(x => x * pr.cnt); } else { pr.mean[0].forEach((x, j) => accP[j] += x * pr.cnt); pr.mean[1].forEach((x, j) => accR[j] += x * pr.cnt); } }
        const mp = accP.map(x => x / tot), mr = accR.map(x => x / tot);
        X.last = { photo: mp, render: mr };
        return { profiles: tot, photo: X.width(mp, 2.0), render: X.width(mr, 2.0) };
    };
})();
