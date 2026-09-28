// Crispness at zoom (iori, 2026-09-27: "the procedural side is dimmer, less saturated, highlights and deep shadows
// missing"). The render at K× zoom through the photo shader — the exact path, or the viewport's own (accumulated, post
// with bloom and grain, defocus as set) — against the ORIGINAL photograph (the fit works on a 640 px copy of a 3840 px
// file), inside the iris: lightness and chroma percentiles and the median local contrast at 3, 7 and 17 px.
//   await import('/iris-engine/tools/crisp/crisp.js'); await __crisp.measure({ zoom: 3 })   // after an eye is loaded
(() => {
    const E = window.__irisEngine, F = E.fit, gl = E.gl, S = E.state, T = window.IrisTissue, X = window.__crisp = {};
    const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const lab = (px, i) => { const r = lin(px[i]), g = lin(px[i + 1]), b = lin(px[i + 2]); const X_ = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
        const h = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; return [116 * h(Y) - 16, 500 * (h(X_) - h(Y)), 200 * (h(Y) - h(Z))]; };
    X.lab = lab;
    X.site = (u, v) => { const c = T.sets.fibres.filter(c => c.inst === undefined && c.uv.some(q => q && Math.abs(q[0] - u) < 0.004 && Math.abs(q[1] - v) < 0.04))[0]; const q = c.xy[c.xy.length >> 1]; return [q[0] * F.fit.W / T.src.fit[0], q[1] * F.fit.H / T.src.fit[1]]; };
    X.render = (at, zoom, o = {}) => {
        const W = F.fit.W, H = F.fit.H, s = 1 / zoom, O_ = window.__irisOverlay, pose = (O_ && O_.mode !== 'off' && O_.pose) ? O_.pose : [S.view[0], S.view[1]];   // the overlay's pose only while it is on: it keeps the pose of the eye it was switched on for
        const V = [pose[0] + at[0] / W - s / 2, pose[1] + (1 - at[1] / H) - s / 2, s, s], keep = {};
        for (const k of ['dof', 'bloom', 'grain']) if (o[k] !== undefined) { keep[k] = S[k]; S[k] = o[k]; }
        gl.activeTexture(gl.TEXTURE31);                                // a new texture binds to the active unit: keep it off the engine's
        const mk = hf => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, hf ? gl.RGBA32F : gl.RGBA8, W, H, 0, gl.RGBA, hf ? gl.FLOAT : gl.UNSIGNED_BYTE, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); return { t, f }; };
        const A = [mk(true), mk(true)], O = mk(false), ref = o.exact ? 1 : 0, frames = ref ? 1 : (o.frames || 64); let w = 0;
        for (let i = 0; i < frames; i++) { const r = i % 2; w = (i + 1) % 2; E.drawPhotoFrame(A[w].f, W, H, i, A[r].t, { ref, rot: S.camRot, zoom: S.zoomPhoto, view: V, specular: F.fit.isolated ? 0 : 1, edgeFade: 0, time: 0 }); }
        E.drawPost(O.f, A[w].t, W, H, frames - 1, ref ? { ref: 1 } : {});
        const px = new Uint8Array(W * H * 4); gl.bindFramebuffer(gl.FRAMEBUFFER, O.f); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, E.canvas.width, E.canvas.height);
        for (const q of [...A, O]) { gl.deleteTexture(q.t); gl.deleteFramebuffer(q.f); } for (const k in keep) S[k] = keep[k];
        const out = new Uint8ClampedArray(W * H * 4); for (let y = 0; y < H; y++) out.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4); return out;
    };
    let photo = null;
    X.photo = async (at, zoom) => {
        const W = F.fit.W, H = F.fit.H, s = 1 / zoom, el = document.getElementById('w31-ov-photo');
        if (!photo || photo.src !== el.src) { photo = new Image(); photo.src = el.src; await photo.decode(); }
        const c = document.createElement('canvas'); c.width = W; c.height = H; const cx = c.getContext('2d'); cx.imageSmoothingQuality = 'high';
        cx.drawImage(photo, (at[0] / W - s / 2) * photo.naturalWidth, (at[1] / H - s / 2) * photo.naturalHeight, s * photo.naturalWidth, s * photo.naturalHeight, 0, 0, W, H); return cx.getImageData(0, 0, W, H).data;
    };
    X.stats = (list) => {                                            // list: [[name, px]]; the mask: iris in the photo AND in every render
        const W = F.fit.W, H = F.fit.H, Ls = list.map(([, px]) => { const L = new Float32Array(W * H); for (let k = 0; k < W * H; k++) L[k] = lab(px, k * 4)[0]; return L; });
        const mask = new Uint8Array(W * H); for (let y = 30; y < H - 30; y++) for (let x = 30; x < W - 30; x++) { let ok = 1; for (let j = -12; j <= 12 && ok; j += 4) for (let i = -12; i <= 12 && ok; i += 4) { const q = (y + j) * W + x + i; if (Ls[0][q] < 2) ok = 0; for (let n = 1; n < Ls.length && ok; n++) if (Ls[n][q] > 98 || Ls[n][q] < 1) ok = 0; } mask[y * W + x] = ok; }
        const pc = (a, ps) => { const b = Float32Array.from(a).sort(); return ps.map(p => +b[Math.floor(p / 100 * (b.length - 1))].toFixed(1)); };
        const band = (L, r) => { const v = []; for (let y = 30; y < H - 30; y += 3) for (let x = 30; x < W - 30; x += 3) { if (!mask[y * W + x]) continue; let s1 = 0, s2 = 0, n = 0; for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) { const q = L[(y + j) * W + x + i]; s1 += q; s2 += q * q; n++; } v.push(Math.sqrt(Math.max(0, s2 / n - (s1 / n) ** 2))); } return pc(v, [50])[0]; };
        const out = {}; list.forEach(([name, px], n) => { const L = [], C = []; for (let k = 0; k < W * H; k++) if (mask[k]) { const q = lab(px, k * 4); L.push(q[0]); C.push(Math.hypot(q[1], q[2])); }
            out[name] = { L: pc(L, [1, 5, 50, 95, 99]), C: pc(C, [50, 95, 99]), band3: band(Ls[n], 1), band7: band(Ls[n], 3), band17: band(Ls[n], 8) }; });
        return out;
    };
    // by region, judged on the PHOTO's local brightness (L* over ±10 px): crypt floors < 35, the sheet > 50 — render / photo per band
    X.regions = (list = X.last) => {
        const W = F.fit.W, H = F.fit.H, Ls = list.map(([, px]) => { const L = new Float32Array(W * H); for (let k = 0; k < W * H; k++) L[k] = lab(px, k * 4)[0]; return L; });
        const r = 10, mean = new Float32Array(W * H); for (let y = r; y < H - r; y++) for (let x = r; x < W - r; x++) { let s = 0; for (let j = -r; j <= r; j += 2) for (let i = -r; i <= r; i += 2) s += Ls[0][(y + j) * W + x + i]; mean[y * W + x] = s / 121; }
        const band = (L, rr, sel) => { const v = []; for (let y = 30; y < H - 30; y += 3) for (let x = 30; x < W - 30; x += 3) { const k = y * W + x; if (!sel(mean[k]) || Ls[0][k] < 2 || Ls[1][k] > 98 || Ls[1][k] < 1) continue; let s1 = 0, s2 = 0, n = 0; for (let j = -rr; j <= rr; j++) for (let i = -rr; i <= rr; i++) { const q = L[(y + j) * W + x + i]; s1 += q; s2 += q * q; n++; } v.push(Math.sqrt(Math.max(0, s2 / n - (s1 / n) ** 2))); } v.sort((a, b) => a - b); return v[v.length >> 1]; };
        const out = {}; for (const [rn, sel] of [['crypt', m => m > 5 && m < 35], ['sheet', m => m > 50]]) { out[rn] = {}; const p = [1, 3, 8].map(rr => band(Ls[0], rr, sel));
            list.forEach(([name], n) => { if (!n) { out[rn][name] = p.map(v => +v.toFixed(2)); return; } out[rn][name] = [1, 3, 8].map((rr, i) => Math.round(100 * band(Ls[n], rr, sel) / p[i]) + ' %'); }); }
        return out;
    };
    // any eye: sites half-way across the iris at five angles, in fit pixels (the limbus and pupil of the loaded case)
    X.sites = () => { const L = F.fit.limbus, P = F.fit.pupil; return [0.3, 1.6, 2.9, 4.2, 5.5].map(a => { const r = 0.5 * (P.r + 0.5 * (L.rx + L.ry)); return [P.x + r * Math.cos(a), P.y + r * Math.sin(a)]; }); };
    // the region table averaged over those sites: render / photo per band, crypts and sheet (renders: exact path)
    X.eye = async (o = {}) => {
        const acc = {}; let n = 0;
        for (const at of X.sites()) { const list = [['photo', await X.photo(at, o.zoom || 3)], ['exact', X.render(at, o.zoom || 3, { exact: true })]]; const R = X.regions(list);
            for (const rn in R) { const v = R[rn].exact.map(x => parseFloat(x)); if (v.some(x => !isFinite(x))) continue; acc[rn] = acc[rn] || { s: [0, 0, 0], n: 0 }; v.forEach((x, i) => acc[rn].s[i] += x); acc[rn].n++; } n++; }
        return Object.fromEntries(Object.entries(acc).map(([k, a]) => [k, a.s.map(x => Math.round(x / a.n) + ' %').join(' · ') + ` (${a.n} sites)`]));
    };
    X.measure = async (o = {}) => {
        const at = o.at || X.site(0.0829, 0.514), z = o.zoom || 3, list = [['photo', await X.photo(at, z)]];
        for (const [name, ro] of (o.renders || [['exact', { exact: true }], ['viewport', {}]])) list.push([name, X.render(at, z, ro)]);
        X.last = list; return X.stats(list);
    };
    X.sheet = async (label, list = X.last) => {
        const W = F.fit.W, H = F.fit.H, cv = document.createElement('canvas'), cols = 2, rows = Math.ceil(list.length / cols); cv.width = cols * (W + 8); cv.height = rows * (H + 18); const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
        list.forEach(([name, px], i) => { const t = document.createElement('canvas'); t.width = W; t.height = H; t.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(px), W, H), 0, 0); const x = (i % cols) * (W + 8), y = Math.floor(i / cols) * (H + 18) + 16; cx.drawImage(t, x, y); cx.fillStyle = '#000'; cx.font = '13px sans-serif'; cx.fillText(name, x + 4, y - 3); });
        return fetch(`/save/crisp-${label}.json`, { method: 'POST', body: JSON.stringify({ png: cv.toDataURL('image/png') }) }).then(r => r.text());
    };
})();
