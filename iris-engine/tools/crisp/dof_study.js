// Depth of field by radius (iori, 2026-09-28: "zoom in and have the corners of the iris disk still be blurred without the
// whole iris zoomed in blurred"; study/11 §5.6 P0). The viewport's accumulated path at K× crop, depth of field on against
// off, at sites from the pupil to the limbus: the band contrast kept (on / off) says where the lens blurs.
//   await import('/iris-engine/tools/crisp/crisp.js'); await import('/iris-engine/tools/crisp/dof_study.js');
//   __dof.ring(0.5, { zoom: 6 })  →  { t, kept: [3 px, 7 px] }  (one call per radius: each is 2 × 3 renders)
(() => {
    const E = window.__irisEngine, F = E.fit, S = E.state, C = window.__crisp, X = window.__dof = {};
    // t = 0 at the pupil margin, 1 at the limbus (fit pixels, the loaded case's own circles)
    X.site = (t, a) => { const L = F.fit.limbus, P = F.fit.pupil, rl = 0.5 * (L.rx + L.ry), r = P.r + t * (rl - P.r);
        return [P.x + r * Math.cos(a), P.y + r * Math.sin(a)]; };
    const lstar = px => { const n = px.length >> 2, L = new Float32Array(n); for (let k = 0; k < n; k++) L[k] = C.lab(px, k * 4)[0]; return L; };
    // median local std of L* in a (2r+1)² box, over the crop's pixels that are iris in both renders (not page white)
    const band = (L, keep, W, H, r) => { const v = []; for (let y = 20; y < H - 20; y += 3) for (let x = 20; x < W - 20; x += 3) { if (!keep[y * W + x]) continue;
        let s1 = 0, s2 = 0, n = 0; for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) { const q = L[(y + j) * W + x + i]; s1 += q; s2 += q * q; n++; }
        v.push(Math.sqrt(Math.max(0, s2 / n - (s1 / n) ** 2))); } v.sort((a, b) => a - b); return v.length ? v[v.length >> 1] : NaN; };
    X.ring = (t, o = {}) => {
        const zoom = o.zoom || 6, frames = o.frames || 48, angs = o.angs || [0.3, 2.4, 4.5], W = F.fit.W, H = F.fit.H, out = [];
        for (const a of angs) {
            const at = X.site(t, a), on = lstar(C.render(at, zoom, { dof: 1, frames, bloom: 0, grain: 0 })), off = lstar(C.render(at, zoom, { dof: 0, frames, bloom: 0, grain: 0 }));
            const keep = new Uint8Array(W * H); let nk = 0; for (let k = 0; k < W * H; k++) if (off[k] > 1 && off[k] < 97 && on[k] < 97) { keep[k] = 1; nk++; }
            if (nk < 2000) continue;
            out.push([1, 3].map(r => band(on, keep, W, H, r) / band(off, keep, W, H, r)));
        }
        const m = i => out.length ? +(out.reduce((s, q) => s + q[i], 0) / out.length).toFixed(3) : NaN;
        return { t, zoom, sites: out.length, kept: [m(0), m(1)] };
    };
    // the PHOTO's own sharpness by radius: its band contrast over the render's without depth of field (the texture is calibrated
    // on the whole eye, so a ratio that falls toward the limbus is the photograph's own lens blur there)
    X.photoRing = async (t, o = {}) => {
        const zoom = o.zoom || 6, frames = o.frames || 64, angs = o.angs || [0.3, 1.9, 3.5, 5.0], W = F.fit.W, H = F.fit.H, out = [];
        for (const a of angs) {
            const at = X.site(t, a), ph = lstar(await C.photo(at, zoom)), off = lstar(C.render(at, zoom, { dof: o.dof || 0, frames, bloom: 0, grain: 0 }));
            const keep = new Uint8Array(W * H); let nk = 0; for (let k = 0; k < W * H; k++) if (off[k] > 1 && off[k] < 97 && ph[k] > 1 && ph[k] < 97) { keep[k] = 1; nk++; }
            if (nk < 2000) continue;
            out.push([1, 3].map(r => band(ph, keep, W, H, r) / band(off, keep, W, H, r)));
        }
        const m = i => out.length ? +(out.reduce((s, q) => s + q[i], 0) / out.length).toFixed(3) : NaN;
        return { t, zoom, sites: out.length, photoOverRender: [m(0), m(1)] };
    };
    // the disc's EDGE: L* along the radius through the limbus (crops at K×, centred at t0), iris level → background (the
    // photo's cutout is black, the render's page white): each angle normalised (1 = iris, 0 = background), aligned on its
    // own last half-way crossing, averaged over the angles; the 10–90 % rise of the average, µm, and its slope's shape.
    X.edge = async (src = 'photo', o = {}) => {
        const zoom = o.zoom || 8, t0 = o.t0 || 0.97, W = F.fit.W, H = F.fit.H, n = o.n || 24, L = F.fit.limbus, rl = 0.5 * (L.rx + L.ry);
        const umPerPx = 11700 / (2 * rl) / zoom, R = 200, rows = [], mids = [];
        for (let k = 0; k < n; k++) {
            const a = (k + 0.5) / n * 2 * Math.PI, at = X.site(t0, a);
            const px = src === 'photo' ? await C.photo(at, zoom) : C.render(at, zoom, Object.assign({ frames: 32, bloom: 0, grain: 0 }, src));
            const P = F.fit.pupil, d = [at[0] - P.x, at[1] - P.y], dl = Math.hypot(d[0], d[1]), u = [d[0] / dl, d[1] / dl], prof = [];
            for (let s = -R; s <= R; s++) { const x = Math.round(W / 2 + s * u[0]), y = Math.round(H / 2 + s * u[1]); prof.push(x < 0 || y < 0 || x >= W || y >= H ? NaN : C.lab(px, (y * W + x) * 4)[0]); }
            const med = v => { v = v.filter(isFinite).sort((p, q) => p - q); return v.length > 10 ? v[v.length >> 1] : NaN; };
            const inner = med(prof.slice(0, 80)), bg = med(prof.slice(-30));
            if (!isFinite(inner) || !isFinite(bg) || Math.abs(inner - bg) < 20) continue;             // a lid, lashes or the frame
            const q = prof.map(v => (v - bg) / (inner - bg));
            let e = -1; for (let s = q.length - 2; s > 0; s--) if (q[s] >= 0.5 && q[s + 1] < 0.5) { e = s; break; }
            if (e < 60 || e > q.length - 40) continue; mids.push((e - R) * umPerPx); rows.push(q.map((_, s) => q[Math.min(q.length - 1, Math.max(0, s - R + e))]));
        }
        if (rows.length < 4) return { src: String(src), angles: rows.length };
        const avg = rows[0].map((_, s) => { const v = rows.map(r => r[s]).filter(isFinite).sort((p, q) => p - q); return v[v.length >> 1]; });
        const sm = avg.map((_, s) => { let a = 0, m = 0; for (let j = -3; j <= 3; j++) if (isFinite(avg[s + j])) { a += avg[s + j]; m++; } return a / m; });
        const at_ = f => { for (let s = R; s > 0; s--) if (sm[s] >= f) return s; return 0; }, at2 = f => { for (let s = R; s < sm.length; s++) if (sm[s] <= f) return s; return sm.length; };
        const w = (at2(0.1) - at_(0.9)) * umPerPx;
        return { src: src === 'photo' ? 'photo' : JSON.stringify(src), angles: rows.length, rise10_90um: Math.round(w), mid50um: Math.round(mids.sort((p, q) => p - q)[mids.length >> 1]), inner90um: Math.round((R - at_(0.9)) * umPerPx), outer10um: Math.round((at2(0.1) - R) * umPerPx),
                 profile: [-300, -200, -100, -50, -25, 0, 25, 50, 100, 200].map(um => +(sm[Math.round(R + um / umPerPx)] ?? NaN).toFixed(2)) };
    };
    // the eye's edge width (state.edgeMm) whose rendered rise matches a target rise, µm (bisection on the viewport path)
    X.fitEdge = async (targetUm, o = {}) => {
        const S = E.state, keep = S.dof; S.dof = 0; let lo = o.lo || 0.03, hi = o.hi || 0.5, last = null;
        for (let i = 0; i < (o.iters || 6); i++) { const w = 0.5 * (lo + hi); S.edgeMm = w; last = await X.edge({ edgeFade: 1, dof: 0 }, o); if ((o.by === 'outer' ? last.outer10um : last.rise10_90um) < targetUm) lo = w; else hi = w; }
        S.dof = keep; S.edgeMm = +(0.5 * (lo + hi)).toFixed(4); const fin = await X.edge({ edgeFade: 1, dof: 0 }, o); delete fin.profile;
        return { edgeMm: S.edgeMm, targetUm, got: fin };
    };
})();
