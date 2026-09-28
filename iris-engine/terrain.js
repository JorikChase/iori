// terrain.js — the iris partitioned into terrain, automatically, from what the fitter already detected (study/11 §5.6 P1b,
// iori 2026-09-28: "fill the whole sections of the detected features with their corresponding colour"; "most areas are
// correctly identified even now programmatically — why do we need manual input?" — so no labelling: every section's type
// comes from detection and anatomy). Drawn by lines.js under the traced lines. Nothing here touches the render or a score.
//
// A label raster in the eye file's export frame (T.src.fit) × SCALE:
//   · zones — rings about the pupil, traced through the engine's own coordinate map (fit px → tissue u, v), so they follow
//     the refraction and the pose: the pupil margin (the map's first tissue), the RUFF (as wide as the margin's beads reach),
//     the PUPILLARY ZONE, the COLLARETTE ridge (the genome's collarette, vc(u) ± 0.83 w: the half-maximum of the engine's
//     exp(−((v − vc)/w)²)), the CILIARY PLATEAU out to the data's own edge (T.dataV1) or the limbus;
//   · CRYPTS — the fitter's outlines (not islands), filled; SEPTA / ISLANDS — its island outlines inside them;
//   · BRIDGE SPAN — plateau (or septum) narrower than 2 D between crypts (a morphological opening, radius D = T.underMm[0] +
//     ½ T.underMm[1]): a band that narrow has no base under it in the layered stroma (study/11 §5.4, the undercut) — it spans a hollow;
//   · CRYPT FLANK — plateau beside a crypt edge (within FLANK_MM) darker than the plateau around it (under FLANK_K of its
//     local level), connected to the edge: the shadowed slope today's tracers leave untraced (P1 sheets).
(() => {
    const E = window.__irisEngine, T = window.IrisTissue; if (!E || !T || window.__irisTerrain) return;
    const F = E.fit, fit = F.fit, state = E.state;
    const TYPES = [                                 // index = label value (0 = not tissue)
        null,
        { key: 'crypt',      label: 'Crypt',            col: [31, 107, 255] },
        { key: 'flank',      label: 'Crypt flank',      col: [138, 43, 226] },
        { key: 'septum',     label: 'Septum / island',  col: [159, 179, 200] },
        { key: 'bridge',     label: 'Bridge span',      col: [255, 242, 58] },
        { key: 'plateau',    label: 'Ciliary plateau',  col: [47, 214, 92] },
        { key: 'collarette', label: 'Collarette ridge', col: [255, 74, 61] },
        { key: 'pupillary',  label: 'Pupillary zone',   col: [255, 165, 31] },
        { key: 'ruff',       label: 'Ruff',             col: [255, 95, 210] },
    ];
    const K = Object.fromEntries(TYPES.map((t, i) => t && [t.key, i]).filter(Boolean));
    const X = window.__irisTerrain = { TYPES, K, SCALE: 1.5, FLANK_MM: 0.15, FLANK_K: 0.82, FLANK_SMOOTH_UM: 15, MIN_MM2: 0.002, last: null };

    // bilinear (u, v) from the engine's coordinate map, fit px; null off the iris (tissue.js uvAt, the same read)
    function uvAt(map, W, H, x, y) {
        const ix = Math.floor(x), iy = Math.floor(y); if (ix < 0 || iy < 0 || ix >= W - 1 || iy >= H - 1) return null;
        const k = iy * W + ix, ks = [k, k + 1, k + W, k + W + 1]; for (const q of ks) if (!map.inside[q]) return null;
        const tx = x - ix, ty = y - iy, ws = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty]; let c = 0, s = 0, v = 0;
        for (let i = 0; i < 4; i++) { c += ws[i] * Math.cos(6.2831853 * map.u[ks[i]]); s += ws[i] * Math.sin(6.2831853 * map.u[ks[i]]); v += ws[i] * map.v[ks[i]]; }
        return [(Math.atan2(s, c) / 6.2831853 + 1) % 1, v];
    }
    const smoothRing = (a, n) => { const N = a.length, o = new Float32Array(N); for (let i = 0; i < N; i++) { let s = 0, m = 0; for (let j = -n; j <= n; j++) { const q = a[(i + j + N) % N]; if (isFinite(q)) { s += q; m++; } } o[i] = m ? s / m : NaN; } return o; };

    // the zone rings, radius (fit px) per angle about the pupil's centre
    function rings(src, NA) {
        const map = F.getMap(), W = fit.W, H = fit.H, P = fit.pupil, Lb = fit.limbus, g = E.genome, coll = g && g.coll;
        const vmax = T.dataV1 !== undefined ? T.dataV1 : 0.99, rMax = 1.15 * Math.max(Lb.rx, Lb.ry) + Math.hypot(Lb.x - P.x, Lb.y - P.y);
        const rin = new Float32Array(NA).fill(NaN), rc0 = new Float32Array(NA).fill(NaN), rc1 = new Float32Array(NA).fill(NaN), rout = new Float32Array(NA).fill(NaN);
        const NU = 4096, vcLUT = new Float32Array(NU); for (let i = 0; i < NU; i++) vcLUT[i] = coll ? E.collaretteAt(coll, i / NU) : NaN;   // the collarette's 40-harmonic sum, once per u bin
        for (let a = 0; a < NA; a++) {
            const th = (a + 0.5) / NA * 6.2831853, cx = Math.cos(th), cy = Math.sin(th);
            for (let r = 0.5 * P.r; r < rMax; r += 0.5) {
                const uv = uvAt(map, W, H, P.x + r * cx, P.y + r * cy); if (!uv) { if (isFinite(rin[a]) && !isFinite(rout[a])) rout[a] = r; if (isFinite(rout[a])) break; continue; }
                if (!isFinite(rin[a])) rin[a] = r;
                const vc = vcLUT[Math.min(NU - 1, Math.floor(uv[0] * NU))], hw = coll ? 0.83 * coll.width : 0;
                if (!isFinite(rc0[a]) && uv[1] >= vc - hw) rc0[a] = r;
                if (!isFinite(rc1[a]) && uv[1] >= vc + hw) rc1[a] = r;
                if (uv[1] > vmax) { rout[a] = r; break; }
            }
        }
        return { rin: smoothRing(rin, 2), rc0: smoothRing(rc0, 3), rc1: smoothRing(rc1, 3), rout: smoothRing(rout, 2) };
    }

    // the ruff's band: how far outside the margin the beads reach (median over the beads), fit px
    function ruffWidth(src, R, NA) {
        const P = fit.pupil, k = fit.W / src.fit[0], mmPx = pxPerMm(), out = [];
        for (const b of src.beads || []) { let far = 0, ang = 0; for (const [i, q] of b.xy.entries()) { const x = q[0] * k - P.x, y = q[1] * k - P.y, r = Math.hypot(x, y) + 0.5 * (b.w[i] || 0) * mmPx; if (r > far) { far = r; ang = Math.atan2(y, x); } }
            const a = Math.floor(((ang / 6.2831853 + 1) % 1) * NA), rin = R.rin[a]; if (isFinite(rin)) out.push(far - rin); }
        out.sort((p, q) => p - q); return out.length ? Math.max(1, out[out.length >> 1]) : 0.08 * pxPerMm();
    }
    const pxPerMm = () => { const Lb = fit.limbus, lim = state.limb || [5.85, 5.40]; return (0.5 * (Lb.rx + Lb.ry)) / (0.5 * (lim[0] + lim[1])); };   // fit px per mm

    // nearest-feature transform (two-pass 8-neighbour propagation of the nearest seed's coordinates): distance² and the seed
    function nearest(mask, W, H) {
        const N = W * H, sx = new Int32Array(N).fill(-1), sy = new Int32Array(N).fill(-1), d2 = new Float32Array(N).fill(1e20);
        for (let i = 0; i < N; i++) if (mask[i]) { sx[i] = i % W; sy[i] = (i / W) | 0; d2[i] = 0; }
        const relax = (i, j) => { if (sx[j] < 0) return; const x = i % W, y = (i / W) | 0, dx = x - sx[j], dy = y - sy[j], d = dx * dx + dy * dy; if (d < d2[i]) { d2[i] = d; sx[i] = sx[j]; sy[i] = sy[j]; } };
        for (let y = 0; y < H; y++) { for (let x = 0; x < W; x++) { const i = y * W + x; if (x > 0) relax(i, i - 1); if (y > 0) { relax(i, i - W); if (x > 0) relax(i, i - W - 1); if (x < W - 1) relax(i, i - W + 1); } } for (let x = W - 1; x >= 0; x--) { const i = y * W + x; if (x < W - 1) relax(i, i + 1); } }
        for (let y = H - 1; y >= 0; y--) { for (let x = W - 1; x >= 0; x--) { const i = y * W + x; if (x < W - 1) relax(i, i + 1); if (y < H - 1) { relax(i, i + W); if (x < W - 1) relax(i, i + W + 1); if (x > 0) relax(i, i + W - 1); } } for (let x = 0; x < W; x++) { const i = y * W + x; if (x > 0) relax(i, i - 1); } }
        return { sx, sy, d2 };
    }
    // box mean of `a` over `w` (weights), radius r px — integral images
    function maskedMean(a, w, W, H, r) {
        const S = new Float64Array((W + 1) * (H + 1)), M = new Float64Array((W + 1) * (H + 1)), o = new Float32Array(W * H);
        for (let y = 0; y < H; y++) { let s = 0, m = 0; for (let x = 0; x < W; x++) { const i = y * W + x; s += a[i] * w[i]; m += w[i]; const k = (y + 1) * (W + 1) + x + 1; S[k] = S[k - W - 1] + s; M[k] = M[k - W - 1] + m; } }
        for (let y = 0; y < H; y++) { const y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1); for (let x = 0; x < W; x++) { const x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1);
            const q = (A) => A[y1 * (W + 1) + x1] - A[y0 * (W + 1) + x1] - A[y1 * (W + 1) + x0] + A[y0 * (W + 1) + x0], m = q(M); o[y * W + x] = m > 0 ? q(S) / m : NaN; } }
        return o;
    }

    X.compute = function () {
        const src = T.src; if (!src || !src.fit || !fit.W || !fit.pupil) throw new Error('terrain: load an eye first');
        if (!fit.img) throw new Error('terrain: the photograph is needed (the flank is measured on it)');
        const t0 = performance.now(), tm = {}, S = X.SCALE, RW = Math.round(src.fit[0] * S), RH = Math.round(src.fit[1] * S), N = RW * RH;
        const kf = fit.W / RW, NA = 1440, R = rings(src, NA), P = fit.pupil, ruffW = ruffWidth(src, R, NA);
        const lab = new Uint8Array(N);
        tm.rings = Math.round(performance.now() - t0);
        // zones
        for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
            const fx = (x + 0.5) * kf - P.x, fy = (y + 0.5) * kf - P.y, r = Math.hypot(fx, fy); let a = Math.floor(((Math.atan2(fy, fx) / 6.2831853 + 1) % 1) * NA); if (a >= NA) a = 0;
            const rin = R.rin[a], rout = R.rout[a]; if (!(r >= rin && r < rout)) continue;
            lab[y * RW + x] = r < rin + ruffW ? K.ruff : r < R.rc0[a] ? K.pupillary : r < R.rc1[a] ? K.collarette : K.plateau;
        }
        tm.zones = Math.round(performance.now() - t0);
        // crypts and islands: filled outlines (a 2-D canvas at the raster's size; antialiased edges thresholded at half)
        const cv = document.createElement('canvas'); cv.width = RW; cv.height = RH; const g = cv.getContext('2d');
        const poly = q => { g.beginPath(); g.moveTo(q[0][0] * S, q[0][1] * S); for (let i = 1; i < q.length; i++) g.lineTo(q[i][0] * S, q[i][1] * S); g.closePath(); g.fill(); };
        g.fillStyle = '#f00'; for (const c of src.outlines || []) if (!c.island) poly(c.xy);
        g.globalCompositeOperation = 'lighter'; g.fillStyle = '#0f0'; for (const c of src.outlines || []) if (c.island) poly(c.xy);
        const px = g.getImageData(0, 0, RW, RH).data, crypt = new Uint8Array(N);
        for (let i = 0; i < N; i++) { if (!lab[i]) continue; if (px[i * 4 + 1] > 127) lab[i] = K.septum; else if (px[i * 4] > 127) { lab[i] = K.crypt; crypt[i] = 1; } }
        tm.crypts = Math.round(performance.now() - t0);
        // bridge span — morphological: plateau (or septum) that an OPENING with a disc of radius D removes, crypts the only outside.
        // Erode: farther than D from every crypt; dilate that back by D; what tissue it does not reach is narrower than 2 D
        // between crypts — a band with no base under it (study/11 §5.4). Smooth by construction, one rule.
        const umPx = 1000 / (pxPerMm() / kf), D = (T.underMm[0] + 0.5 * T.underMm[1]) * 1000 / umPx, NF = nearest(crypt, RW, RH);
        const core = new Uint8Array(N); for (let i = 0; i < N; i++) core[i] = !crypt[i] && NF.d2[i] > D * D ? 1 : 0;
        const NC = nearest(core, RW, RH), open = l => l === K.plateau || l === K.collarette || l === K.pupillary || l === K.septum;
        for (let i = 0; i < N; i++) if (open(lab[i]) && NF.d2[i] <= D * D && NC.d2[i] > D * D) lab[i] = K.bridge;
        tm.bridge = Math.round(performance.now() - t0);
        const photoY = (() => { const c = document.createElement('canvas'); c.width = RW; c.height = RH; const cx = c.getContext('2d'); cx.imageSmoothingQuality = 'high'; cx.drawImage(fit.img, 0, 0, RW, RH);
            const d = cx.getImageData(0, 0, RW, RH).data, Y = new Float32Array(N); const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
            const LUT = new Float32Array(256).map((_, i) => lin(i)); for (let i = 0; i < N; i++) Y[i] = 0.2126 * LUT[d[i * 4]] + 0.7152 * LUT[d[i * 4 + 1]] + 0.0722 * LUT[d[i * 4 + 2]]; return Y; })();
        tm.photo = Math.round(performance.now() - t0);
        // crypt flank: beside an edge, darker than the plateau's local level (the photo read over ±FLANK_SMOOTH_UM, not per pixel:
        // the sheet's speckle is not slope), connected to the edge
        const zone = l => l === K.plateau || l === K.collarette || l === K.pupillary;
        const Fpx = X.FLANK_MM * 1000 / umPx, far = new Uint8Array(N), Ys = maskedMean(photoY, new Float32Array(N).fill(1), RW, RH, Math.max(1, Math.round(X.FLANK_SMOOTH_UM / umPx)));
        for (let i = 0; i < N; i++) far[i] = zone(lab[i]) && NF.d2[i] > Fpx * Fpx ? 1 : 0;
        const level = maskedMean(photoY, far, RW, RH, Math.round(0.25 * 1000 / umPx));
        const cand = new Uint8Array(N); for (let i = 0; i < N; i++) if (zone(lab[i]) && NF.d2[i] <= Fpx * Fpx && isFinite(level[i]) && Ys[i] < X.FLANK_K * level[i]) cand[i] = 1;
        const nb4 = (p, f) => { const x = p % RW; if (x > 0) f(p - 1); if (x < RW - 1) f(p + 1); if (p >= RW) f(p - RW); if (p < N - RW) f(p + RW); };
        const stack = []; for (let i = 0; i < N; i++) if (cand[i] && NF.d2[i] <= 2.5) { lab[i] = K.flank; stack.push(i); }
        while (stack.length) nb4(stack.pop(), j => { if (cand[j] && lab[j] !== K.flank) { lab[j] = K.flank; stack.push(j); } });
        tm.flank = Math.round(performance.now() - t0);
        // specks: a section under MIN_MM2 is noise at the edge of a threshold, not terrain — it joins the type that borders it most
        // (two passes: a speck inside a speck)
        const minPx = X.MIN_MM2 * 1e6 / (umPx * umPx), id = new Int32Array(N), comp = new Int32Array(N), nbc = new Float64Array(TYPES.length);
        for (let pass = 0; pass < 2; pass++) { id.fill(-1); let nid = 0;
            for (let i = 0; i < N; i++) { if (!lab[i] || id[i] >= 0) continue; const l = lab[i]; let n = 0; comp[n++] = i; id[i] = nid; nbc.fill(0);
                for (let h = 0; h < n; h++) nb4(comp[h], j => { const lj = lab[j]; if (lj === l) { if (id[j] < 0) { id[j] = nid; comp[n++] = j; } } else if (lj) nbc[lj]++; });
                nid++; if (n >= minPx) continue; let best = 0; for (let k = 1; k < TYPES.length; k++) if (nbc[k] > nbc[best]) best = k; if (best && nbc[best] > 0) for (let h = 0; h < n; h++) lab[comp[h]] = best; } }
        tm.specks = Math.round(performance.now() - t0);
        // sections: connected components per type, and each type's share of the tissue
        const sections = {}, area = {}; let tissue = 0; id.fill(-1);
        for (let i = 0; i < N; i++) { const l = lab[i]; if (!l) continue; tissue++; area[l] = (area[l] || 0) + 1; if (id[i] >= 0) continue; sections[l] = (sections[l] || 0) + 1;
            let n = 0; comp[n++] = i; id[i] = 1; for (let h = 0; h < n; h++) nb4(comp[h], j => { if (id[j] < 0 && lab[j] === l) { id[j] = 1; comp[n++] = j; } }); }
        const stats = Object.fromEntries(TYPES.map((t, i) => t && [t.key, { sections: sections[i] || 0, pct: +(100 * (area[i] || 0) / Math.max(1, tissue)).toFixed(1) }]).filter(Boolean));
        X.last = { eye: src.ref, RW, RH, S, lab, stats, ruffUm: Math.round(ruffW / pxPerMm() * 1000), bridgeMaxUm: Math.round(2 * D * umPx), ms: Math.round(performance.now() - t0), tm };
        return X.last;
    };
    // the fill as an image (only the shown types), one texel per raster cell
    X.image = (show) => {
        const L = X.last; if (!L) return null; const c = document.createElement('canvas'); c.width = L.RW; c.height = L.RH; const g = c.getContext('2d'), im = g.createImageData(L.RW, L.RH), d = im.data;
        const on = TYPES.map(t => t && show[t.key] !== false);
        for (let i = 0; i < L.lab.length; i++) { const l = L.lab[i]; if (!l || !on[l]) continue; const c3 = TYPES[l].col; d[i * 4] = c3[0]; d[i * 4 + 1] = c3[1]; d[i * 4 + 2] = c3[2]; d[i * 4 + 3] = 255; }
        g.putImageData(im, 0, 0); return c;
    };
    // what is at a point of the export frame (for a readout)
    X.at = (x, y) => { const L = X.last; if (!L) return null; const i = Math.floor(y * L.S) * L.RW + Math.floor(x * L.S), l = L.lab[i]; return l ? TYPES[l].key : null; };
})();
