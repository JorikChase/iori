// Iris Engine — fitter (study/00 §9.2)
// Align a photograph (pupil, limbus, catchlight), solve the camera / eye / light pose, render the
// engine in reference mode at the photo's resolution, score it, and fit the genome to the photo:
// global genes against radial profiles, then explicit objects against pixels.
(() => {
    const E = window.__irisEngine; if (!E) return;
    const { gl, state, target } = E;
    const $ = id => document.getElementById(id);
    const panel = $('fit-panel'), cv = $('fitcv'), ctx = cv.getContext('2d'), log = $('fit-log'), scoreEl = $('fit-score');
    const say = (m) => { log.textContent = (m + '\n' + log.textContent).split('\n').slice(0, 8).join('\n'); };

    // ---------------- photo + markers ----------------
    const fit = {
        img: null, W: 0, H: 0, photo: null,            // photo pixels (Uint8ClampedArray, sRGB), at fit resolution
        pupil: { x: 320, y: 240, r: 40 }, limbus: { x: 320, y: 240, rx: 120, ry: 112, ang: 0 }, catch: { x: 360, y: 200 },
        mode: 0,                                        // 0 photo, 1 render, 2 diff, 3 split
        render: null, mask: null, running: false, drag: null,
    };
    // The fit image must not depend on history. canvas.drawImage picks its resampling path from the canvas's
    // state (first draw vs cached image, CPU vs GPU acceleration, which Chrome switches heuristically), and the
    // fit panel canvas is repainted constantly — the same photo came out slightly different depending on what ran
    // before (pupil x 320.298 vs 320.326, §24.1). So decode at native size (an exact copy) and area-average in JS.
    function decodeNative(im) {
        const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
        const x = c.getContext('2d', { willReadFrequently: true });
        x.drawImage(im, 0, 0);
        return { px: x.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height };
    }
    function areaWeights(sn, dn) {                  // per destination index: [source index, weight] pairs, weights sum to 1
        const sc = sn / dn, out = [];
        for (let d = 0; d < dn; d++) {
            const a = d * sc, b = (d + 1) * sc, list = [];
            for (let s = Math.floor(a); s < Math.min(sn, Math.ceil(b)); s++) { const w = Math.min(b, s + 1) - Math.max(a, s); if (w > 0) list.push([s, w / sc]); }
            out.push(list);
        }
        return out;
    }
    function areaResize(src, sw, sh, dw, dh) {
        const wx = areaWeights(sw, dw), wy = areaWeights(sh, dh), tmp = new Float32Array(dw * sh * 4), out = new Uint8ClampedArray(dw * dh * 4);
        for (let y = 0; y < sh; y++) for (let x = 0; x < dw; x++) {
            const o = (y * dw + x) * 4; let r = 0, g = 0, b = 0, a = 0;
            for (const [s, w] of wx[x]) { const i = (y * sw + s) * 4; r += w * src[i]; g += w * src[i + 1]; b += w * src[i + 2]; a += w * src[i + 3]; }
            tmp[o] = r; tmp[o + 1] = g; tmp[o + 2] = b; tmp[o + 3] = a;
        }
        for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
            const o = (y * dw + x) * 4; let r = 0, g = 0, b = 0, a = 0;
            for (const [s, w] of wy[y]) { const i = (s * dw + x) * 4; r += w * tmp[i]; g += w * tmp[i + 1]; b += w * tmp[i + 2]; a += w * tmp[i + 3]; }
            out[o] = Math.round(r); out[o + 1] = Math.round(g); out[o + 2] = Math.round(b); out[o + 3] = Math.round(a);
        }
        return out;
    }
    function loadImage(src, name) { return new Promise((resolve, reject) => {
        const im = new Image(); im.crossOrigin = 'anonymous';
        im.onload = () => {
            const long = Math.max(im.width, im.height), sc = Math.min(1, (E.Q ? E.Q.fitPx : 640) / long);
            fit.W = Math.round(im.width * sc); fit.H = Math.round(im.height * sc);
            const nat = decodeNative(im); fit.native = nat;
            fit.photo = (nat.w === fit.W && nat.h === fit.H) ? Uint8ClampedArray.from(nat.px) : areaResize(nat.px, nat.w, nat.h, fit.W, fit.H);
            cv.width = fit.W; cv.height = fit.H;
            ctx.putImageData(new ImageData(new Uint8ClampedArray(fit.photo), fit.W, fit.H), 0, 0);
            fit.img = im; fit.render = null; fit.map = null;
            // default markers: centre, iris 40 % of the height
            fit.limbus = { x: fit.W / 2, y: fit.H / 2, rx: 0.4 * fit.H / 2 * 1.08, ry: 0.4 * fit.H / 2, ang: 0 };
            fit.pupil = { x: fit.W / 2, y: fit.H / 2, r: 0.4 * fit.H / 2 * 0.36 };
            fit.catch = { x: fit.W / 2 + 0.15 * fit.H, y: fit.H / 2 - 0.15 * fit.H };
            fit.name = name; fit.pose = null; fit.mask = null; fit.route = null;
            say('loaded ' + name + ' ' + im.width + '×' + im.height + ' (fit at ' + fit.W + '×' + fit.H + ')');
            fit.isolated = isIsolated();
            // isolated-on-black macros are aligned by construction on every load (boundary fits, §19);
            // stored / manual alignments only serve whole-eye photos
            if (!(fit.isolated && alignIsolated()) && !applyStoredAlignment(name)) autoAlign();
            draw(); resolve();
        };
        im.onerror = () => { say('could not load ' + name); reject(new Error('load ' + name)); };
        im.src = src;
    }); }

    // ---------------- automatic alignment ----------------
    function lumImage(blur = 2) {
        const W = fit.W, H = fit.H, p = fit.photo, l = new Float32Array(W * H);
        for (let i = 0; i < W * H; i++) l[i] = (0.299 * p[i * 4] + 0.587 * p[i * 4 + 1] + 0.114 * p[i * 4 + 2]) / 255;
        if (!blur) return l;
        const t = new Float32Array(W * H), o = new Float32Array(W * H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0, n = 0; for (let k = -blur; k <= blur; k++) { const xx = Math.min(W - 1, Math.max(0, x + k)); s += l[y * W + xx]; n++; } t[y * W + x] = s / n; }
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0, n = 0; for (let k = -blur; k <= blur; k++) { const yy = Math.min(H - 1, Math.max(0, y + k)); s += t[yy * W + x]; n++; } o[y * W + x] = s / n; }
        return o;
    }
    // pupil: the largest dark component not touching the border and not too elongated; limbus: the
    // strongest radial luminance edge per direction beyond 1.4 pupil radii, robustly fitted to an
    // ellipse; catchlight: the brightest blob inside the limbus.
    // is the photo an iris isolated on black? (the border is dark)
    function isIsolated() {
        const W = fit.W, H = fit.H, p = fit.photo; let dark = 0, n = 0;
        for (let x = 0; x < W; x += 4) for (const y of [0, 1, H - 2, H - 1]) { const o = (y * W + x) * 4; if (p[o] + p[o + 1] + p[o + 2] < 60) dark++; n++; }
        for (let y = 0; y < H; y += 4) for (const x of [0, 1, W - 2, W - 1]) { const o = (y * W + x) * 4; if (p[o] + p[o + 1] + p[o + 2] < 60) dark++; n++; }
        return dark / n > 0.9;
    }
    // ---------------- boundary fits (spec §19, Phase A) ----------------
    const median = arr => { const a = arr.slice().sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : 0; };
    function solveLinear(A, b) {          // Gaussian elimination with partial pivoting; null if singular
        const n = b.length, M = A.map((row, i) => row.concat([b[i]]));
        for (let c = 0; c < n; c++) {
            let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
            if (Math.abs(M[p][c]) < 1e-12) return null; [M[c], M[p]] = [M[p], M[c]];
            for (let r = 0; r < n; r++) { if (r === c) continue; const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
        }
        return M.map((row, i) => row[n] / row[i]);
    }
    // circle through boundary points: algebraic least squares with residual trimming (3× the median, ≥ 0.75 px)
    function fitCircle(pts, passes = 3) {
        let use = pts.slice(), out = null;
        for (let p = 0; p < passes; p++) {
            if (use.length < 6) return out;
            const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], b = [0, 0, 0];
            for (const [x, y] of use) { const row = [x, y, 1], q = -(x * x + y * y); for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) A[i][j] += row[i] * row[j]; b[i] += row[i] * q; } }
            const sol = solveLinear(A, b); if (!sol) return out;
            const cx = -sol[0] / 2, cy = -sol[1] / 2, r = Math.sqrt(Math.max(0, cx * cx + cy * cy - sol[2]));
            const res = use.map(([x, y]) => Math.abs(Math.hypot(x - cx, y - cy) - r));
            out = { x: cx, y: cy, r, n: use.length, rms: Math.sqrt(res.reduce((s2, v) => s2 + v * v, 0) / use.length) };
            const thr = Math.max(0.75, 3 * median(res)); const keep = use.filter((_, i) => res[i] <= thr);
            if (keep.length === use.length) break; use = keep;
        }
        return out;
    }
    // ellipse through boundary points: conic A x² + B xy + C y² + D x + E y = 1, Sampson-distance trimming;
    // returns the marker convention { x, y, rx, ry, ang } (ang = direction of the rx axis)
    function fitEllipse(pts, passes = 3) {
        let use = pts.slice(), out = null;
        for (let p = 0; p < passes; p++) {
            if (use.length < 8) return out;
            const A = Array.from({ length: 5 }, () => [0, 0, 0, 0, 0]), b = [0, 0, 0, 0, 0];
            for (const [x, y] of use) { const row = [x * x, x * y, y * y, x, y]; for (let i = 0; i < 5; i++) { for (let j = 0; j < 5; j++) A[i][j] += row[i] * row[j]; b[i] += row[i]; } }
            const q = solveLinear(A, b); if (!q) return out;
            const [qa, qb, qc, qd, qe] = q;
            const cen = solveLinear([[2 * qa, qb], [qb, 2 * qc]], [-qd, -qe]); if (!cen) return out;
            const [x0, y0] = cen; const F = qa * x0 * x0 + qb * x0 * y0 + qc * y0 * y0 + qd * x0 + qe * y0 - 1;
            const th = 0.5 * Math.atan2(qb, qa - qc), ct = Math.cos(th), st = Math.sin(th);
            const Ar = qa * ct * ct + qb * ct * st + qc * st * st, Cr = qa * st * st - qb * ct * st + qc * ct * ct;
            if (!(-F / Ar > 0 && -F / Cr > 0)) return out;             // the sign of the conic depends on whether the origin is inside
            const rx = Math.sqrt(-F / Ar), ry = Math.sqrt(-F / Cr);
            const res = use.map(([x, y]) => { const Q = qa * x * x + qb * x * y + qc * y * y + qd * x + qe * y - 1; const gx = 2 * qa * x + qb * y + qd, gy = qb * x + 2 * qc * y + qe; return Math.abs(Q) / Math.max(1e-9, Math.hypot(gx, gy)); });
            out = { x: x0, y: y0, rx, ry, ang: th, n: use.length, rms: Math.sqrt(res.reduce((s2, v) => s2 + v * v, 0) / use.length) };
            const thr = Math.max(0.75, 3 * median(res)); const keep = use.filter((_, i) => res[i] <= thr);
            if (keep.length === use.length) break; use = keep;
        }
        return out;
    }
    // boundary samples from a class image (0 pupil / dark hole, 1 iris, 2 outside): the pupil edge is
    // the first non-dark pixel outward from a seed inside the pupil; the limbus is the outermost
    // non-outside pixel per ray. Both are exact boundaries, unbiased by holes or dark crypts.
    function edgePoints(cls, W, H, c, which, N = 360, rStart = 0, rMax = 1e9) {
        const pts = [];
        for (let k = 0; k < N; k++) {
            const a = 2 * Math.PI * k / N, ca = Math.cos(a), sa = Math.sin(a); let found = -1, seen = false;
            for (let r = rStart; r < rMax; r += 0.5) {
                const x = Math.round(c.x + ca * r), y = Math.round(c.y + sa * r); if (x < 0 || y < 0 || x >= W || y >= H) break;
                const v = cls[y * W + x];
                if (which === 'pupil') { if (v === 0) seen = true; else if (seen) { found = r - 0.25; break; } else break; }
                else if (v !== 2) found = r + 0.25;
            }
            if (found > 0) pts.push([c.x + ca * found, c.y + sa * found]);
        }
        return pts;
    }
    // pupil circle + limbus ellipse from a class image; the pupil seed is the centroid of the dark
    // pixels inside the inner 60 % of the limbus estimate
    function boundariesFromClasses(cls, W, H, L) {
        const ca = Math.cos(L.ang), sa = Math.sin(L.ang); let pn = 0, px = 0, py = 0;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (cls[y * W + x] !== 0) continue; const dx = x - L.x, dy = y - L.y; const ex = (ca * dx + sa * dy) / L.rx, ey = (-sa * dx + ca * dy) / L.ry; if (ex * ex + ey * ey < 0.36) { pn++; px += x; py += y; } }
        const limbus = fitEllipse(edgePoints(cls, W, H, L, 'limbus', 360, 0.5 * Math.min(L.rx, L.ry), Math.hypot(W, H)));
        let pupil = null;
        if (pn > 30) pupil = fitCircle(edgePoints(cls, W, H, { x: px / pn, y: py / pn }, 'pupil', 360, 0, 0.8 * Math.min(L.rx, L.ry)));
        return { pupil, limbus };
    }
    // exact alignment for isolated irides (§19): background = dark pixels connected to the border,
    // dark hole = the rest below 10 % luminance; limbus and pupil from boundary fits
    function alignIsolated() {
        const W = fit.W, H = fit.H, l = lumImage(1);
        const cls = new Uint8Array(W * H).fill(1); const st = [];
        for (let x = 0; x < W; x++) { st.push(x, (H - 1) * W + x); } for (let y = 0; y < H; y++) { st.push(y * W, y * W + W - 1); }
        for (const k of st) if (cls[k] !== 2 && l[k] < 0.08) { cls[k] = 2; const q = [k]; while (q.length) { const c = q.pop(); const cy = Math.floor(c / W), cx = c % W; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const nk = ny * W + nx; if (cls[nk] !== 2 && l[nk] < 0.08) { cls[nk] = 2; q.push(nk); } } } }
        let n = 0, sx = 0, sy = 0; for (let k = 0; k < W * H; k++) if (cls[k] !== 2) { n++; sx += k % W; sy += Math.floor(k / W); if (l[k] < 0.10) cls[k] = 0; }
        if (n < 500) return false;
        const r0 = Math.sqrt(n / Math.PI);
        const { pupil, limbus } = boundariesFromClasses(cls, W, H, { x: sx / n, y: sy / n, rx: r0, ry: r0, ang: 0 });
        if (!limbus) return false;
        fit.limbus = { x: limbus.x, y: limbus.y, rx: limbus.rx, ry: limbus.ry, ang: limbus.ang };
        if (pupil) fit.pupil = { x: pupil.x, y: pupil.y, r: pupil.r };
        fit.catch = { x: limbus.x, y: limbus.y - 0.02 * limbus.ry };      // ring-flash macro: key on the axis
        say(`isolated iris: ellipse ${limbus.rx.toFixed(1)}×${limbus.ry.toFixed(1)} px at ${(limbus.ang * 57.3).toFixed(1)}° (rms ${limbus.rms.toFixed(2)} px, ${limbus.n} pts) · pupil r ${fit.pupil.r.toFixed(1)} px${pupil ? ' (rms ' + pupil.rms.toFixed(2) + ' px, ' + pupil.n + ' pts)' : ' (dark hole not found)'}`);
        fit.isolated = true; fit.mask = null; return true;
    }
    // the alignment mask (photo shader debug view 13): pupil 0, iris 0.5, outside 1, through the same
    // refraction as the render; read back as a class image in photo orientation
    function renderMask() {
        ensureFitTargets(fit.W, fit.H);
        if (E.atlas.dirty) E.bakeAtlas();
        E.drawPhotoFrame(fitFB, fit.W, fit.H, 0, fitTex2, { ref: 1, rot: state.camRot, zoom: state.zoomPhoto, view: state.view, debug: 13 });
        const px = new Float32Array(fit.W * fit.H * 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fitFB); gl.readPixels(0, 0, fit.W, fit.H, gl.RGBA, gl.FLOAT, px); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, E.canvas.width, E.canvas.height);
        const cls = new Uint8Array(fit.W * fit.H);
        for (let y = 0; y < fit.H; y++) for (let x = 0; x < fit.W; x++) { const v = px[((fit.H - 1 - y) * fit.W + x) * 4]; cls[y * fit.W + x] = v < 0.25 ? 0 : (v < 0.75 ? 1 : 2); }
        return cls;
    }
    // close the alignment loop through the renderer (§19): detect pupil and limbus on the mask render
    // with the same boundary fits as the photo, correct camera distance, view offset and pupil mm,
    // repeat until the render's markers sit on the photo's. Tilt is left to the pose model.
    function alignLoop(maxIt = 4, tol = 0.5) {
        if (!fit.photo) return null;
        const W = fit.W, H = fit.H, P = fit.pupil, L = fit.limbus, zL = 2.5;   // limbus plane ≈ 2.5 mm behind the apex
        let last = null;
        for (let it = 0; it <= maxIt; it++) {
            const det = boundariesFromClasses(renderMask(), W, H, L);
            if (!det.limbus || !det.pupil) { say('align loop: render markers not found'); break; }
            const rl = det.limbus, rp = det.pupil;
            const eC = Math.hypot(rl.x - L.x, rl.y - L.y), eR = (rl.rx + rl.ry) / 2 - (L.rx + L.ry) / 2, ePr = rp.r - P.r, ePc = Math.hypot(rp.x - P.x, rp.y - P.y);
            last = { it, limbusCentre: +eC.toFixed(2), limbusRadius: +eR.toFixed(2), pupilRadius: +ePr.toFixed(2), pupilCentre: +ePc.toFixed(2), max: +Math.max(eC, Math.abs(eR), Math.abs(ePr), ePc).toFixed(2) };
            if (last.max < tol || it === maxIt) break;
            // distance: the limbus radius on the sensor ∝ 1 / (distance to the limbus plane)
            const sc = ((L.rx + L.ry) / 2) / ((rl.rx + rl.ry) / 2);
            state.zoomPhoto = target.zoomPhoto = (state.zoomPhoto + zL) / sc - zL;
            // offset: a world point lands at pixel 0.5 + projection − u_view, so the view moves with the error
            state.view = [state.view[0] + (rl.x - L.x) / W, state.view[1] - (rl.y - L.y) / H, 1, 1];
            // pupil mm: through whatever magnification the renderer applies at this distance
            const pm = Math.max(1.5, Math.min(8.5, state.pupil * (P.r / rp.r))); state.pupil = target.pupil = pm; E.setSlider('pupil', 'pupil', +pm.toFixed(2));
            // pupil decentration (mm, x right, y up): the pupil is seen through the cornea, so its image offset is magnified ≈ 1.1×
            const ppm = ((L.rx + L.ry) / 2) / 5.625 * 1.1;
            state.pupilOff = [state.pupilOff[0] + (P.x - rp.x) / ppm, state.pupilOff[1] - (P.y - rp.y) / ppm];
        }
        if (fit.pose) fit.pose.align = last;
        if (last) say(`align loop ${last.it} it: limbus centre ${last.limbusCentre} px · radius ${last.limbusRadius} px · pupil r ${last.pupilRadius} px, centre ${last.pupilCentre} px · distance ${state.zoomPhoto.toFixed(1)} mm · pupil ${state.pupil.toFixed(2)} mm at (${state.pupilOff[0].toFixed(2)}, ${state.pupilOff[1].toFixed(2)}) mm`);
        E.resetAccumulation();
        return last;
    }
    function autoAlign() {
        fit.isolated = false;
        if (isIsolated() && alignIsolated()) return;
        const W = fit.W, H = fit.H, l = lumImage(2);
        let best = null;
        // the pupil is the darkest round blob: try several thresholds (dark-brown irides need a low
        // one, isolated-on-black macros a higher one) and keep the roundest plausible component
        for (const thr of [0.06, 0.09, 0.12, 0.16, 0.22]) {
        const seen = new Uint8Array(W * H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const k = y * W + x; if (seen[k] || l[k] > thr) continue;
            const st = [k]; seen[k] = 1; let n = 0, sx = 0, sy = 0, border = false, x0 = x, x1 = x, y0 = y, y1 = y;
            while (st.length) { const q = st.pop(); const qy = Math.floor(q / W), qx = q % W; n++; sx += qx; sy += qy; if (qx === 0 || qy === 0 || qx === W - 1 || qy === H - 1) border = true; x0 = Math.min(x0, qx); x1 = Math.max(x1, qx); y0 = Math.min(y0, qy); y1 = Math.max(y1, qy);
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = qx + dx, ny = qy + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const nk = ny * W + nx; if (!seen[nk] && l[nk] <= thr) { seen[nk] = 1; st.push(nk); } } }
            if (border || n < 60) continue;
            const bw = x1 - x0 + 1, bh = y1 - y0 + 1, asp = bw / bh; if (asp < 0.6 || asp > 1.7) continue;
            const fill = n / (Math.PI * bw * bh / 4); if (fill < 0.6) continue;
            const r = Math.sqrt(n / Math.PI); if (r < 0.015 * H || r > 0.35 * H) continue;
            const cx = sx / n, cy = sy / n; const central = Math.hypot(cx - W / 2, cy - H / 2) / Math.max(W, H);
            const round = fill * Math.min(asp, 1 / asp);
            const scoreB = Math.sqrt(n) * round * (1 - 0.6 * central);
            if (!best || scoreB > best.score) best = { score: scoreB, cx, cy, r };
        }
        }
        if (best) fit.pupil = { x: best.cx, y: best.cy, r: best.r };
        const P = fit.pupil;
        // limbus: per direction, the strongest edge of the coarse profile between 1.4 rp and the frame
        const pts = [];
        for (let a = 0; a < 6.2832; a += 6.2832 / 96) {
            const ca = Math.cos(a), sa = Math.sin(a); const rMax = Math.min(8 * P.r, Math.min(W, H) * 0.5);
            let prev = null, bestG = 0, bestR = 0; const win = [];
            for (let r = 1.2 * P.r; r < rMax; r += 2) {
                const x = Math.round(P.x + ca * r), y = Math.round(P.y + sa * r); if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) break;
                const v = l[y * W + x]; win.push(v); if (win.length > 8) win.shift();
                if (win.length === 8) { const g = Math.abs((win[7] + win[6] + win[5] + win[4]) - (win[3] + win[2] + win[1] + win[0])) / 4; if (r > 1.4 * P.r && g > bestG) { bestG = g; bestR = r - 8; } }
            }
            if (bestR > 0) pts.push([a, bestR, bestG]);
        }
        if (pts.length > 24) {
            // RANSAC circle on the edge samples (robust to lids and lashes): three samples define a
            // circle, inliers within 3 % of the radius; a strong winner overrides the estimate below
            const xy = pts.map(p => [P.x + Math.cos(p[0]) * p[1], P.y + Math.sin(p[0]) * p[1]]);
            let bestC = null, bestIn = 0;
            let rs = 0x9e3779b9 ^ Math.round(P.x * 131 + P.y * 17 + P.r);   // seeded from the pupil: fits must be reproducible
            const rnd = () => { rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5; return ((rs >>> 0) % 1000000) / 1000000; };
            for (let it = 0; it < 300; it++) {
                const a = xy[Math.floor(rnd() * xy.length)], b = xy[Math.floor(rnd() * xy.length)], c = xy[Math.floor(rnd() * xy.length)];
                const A = b[0] - a[0], B = b[1] - a[1], C = c[0] - a[0], D = c[1] - a[1], E2 = A * (a[0] + b[0]) + B * (a[1] + b[1]), F = C * (a[0] + c[0]) + D * (a[1] + c[1]), G = 2 * (A * (c[1] - b[1]) - B * (c[0] - b[0]));
                if (Math.abs(G) < 1e-6) continue;
                const ccx = (D * E2 - B * F) / G, ccy = (A * F - C * E2) / G, r = Math.hypot(a[0] - ccx, a[1] - ccy);
                if (r < 1.3 * P.r || r > 8 * P.r) continue;
                let inl = 0; for (const q of xy) if (Math.abs(Math.hypot(q[0] - ccx, q[1] - ccy) - r) < 0.03 * r) inl++;
                if (inl > bestIn) { bestIn = inl; bestC = { x: ccx, y: ccy, r }; }
            }
            if (bestC && bestIn >= 12) {
                let sx = 0, sy = 0, sr = 0, n = 0; for (const q of xy) { const d = Math.hypot(q[0] - bestC.x, q[1] - bestC.y); if (Math.abs(d - bestC.r) < 0.03 * bestC.r) { sx += q[0]; sy += q[1]; sr += d; n++; } }
                pts.ransac = { x: sx / n, y: sy / n, r: sr / n, inliers: n };
            }
            // the lids cut the iris top and bottom, so the horizontal radius is the trustworthy one:
            // median of the near-horizontal samples (|cos| > 0.75), with the centre x from their
            // left/right pairing; the vertical radius follows the anatomical 5.40 : 5.85 unless the
            // near-vertical samples agree with it within 12 %
            const hor = pts.filter(p => Math.abs(Math.cos(p[0])) > 0.75), ver = pts.filter(p => Math.abs(Math.sin(p[0])) > 0.75);
            const medOf = arr => { const r = arr.map(p => p[1]).sort((a, b) => a - b); return r.length ? r[Math.floor(r.length / 2)] : 0; };
            const rH = medOf(hor) || medOf(pts);
            const left = hor.filter(p => Math.cos(p[0]) < 0), right = hor.filter(p => Math.cos(p[0]) > 0);
            const cx = (left.length && right.length) ? P.x + (medOf(right) - medOf(left)) / 2 : P.x;
            const rx = ((left.length && right.length) ? (medOf(right) + medOf(left)) / 2 : rH) / 0.98;
            const natural = 5.40 / 5.85; const rV = medOf(ver);
            const ry = (rV && Math.abs(rV - rx * natural) < 0.12 * rx * natural) ? rV / 0.98 : rx * natural;
            const up = ver.filter(p => Math.sin(p[0]) < 0), down = ver.filter(p => Math.sin(p[0]) > 0);
            const cyRaw = (up.length && down.length) ? P.y + (medOf(down) - medOf(up)) / 2 : P.y;
            const cy = Math.abs(cyRaw - P.y) < 0.25 * rx ? cyRaw : P.y - 0.02 * rx;     // the pupil sits ~0.15 mm above the limbus centre
            fit.limbus = { x: cx, y: cy, rx, ry, ang: 0 };
            if (pts.ransac && pts.ransac.inliers >= 0.4 * pts.length) { const R = pts.ransac; fit.limbus = { x: R.x, y: R.y, rx: R.r / 0.98, ry: R.r / 0.98 * natural, ang: 0 }; }
        }
        // catchlight: brightest blob inside the limbus (blurred), excluding the pupil
        const L = fit.limbus; let mx = 0, mxk = -1;
        for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) { const ex = (x - L.x) / L.rx, ey = (y - L.y) / L.ry; if (ex * ex + ey * ey > 0.5) continue; const k = y * W + x; if (l[k] > mx) { mx = l[k]; mxk = k; } }
        if (mxk >= 0) { let sx = 0, sy = 0, n = 0; for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) { const ex = (x - L.x) / L.rx, ey = (y - L.y) / L.ry; if (ex * ex + ey * ey > 0.5) continue; if (l[y * W + x] > 0.92 * mx) { sx += x; sy += y; n++; } } fit.catch = { x: sx / n, y: sy / n }; }
        say(`auto-align: pupil r ${P.r.toFixed(0)} px · limbus ${fit.limbus.rx.toFixed(0)}×${fit.limbus.ry.toFixed(0)} px · ${pts.length} edge samples`);
        fit.mask = null;
    }
    // Yield to the event loop without a timer. A hidden tab clamps setTimeout, and after five minutes hidden
    // Chrome's intensive throttling runs chained timers about once a minute — a 120-iteration fit then takes
    // two hours (that was the eleven-hour CAPTURE bake). MessageChannel callbacks are not throttled.
    const yieldNow = (() => {
        const ch = new MessageChannel(), queue = [];
        ch.port1.onmessage = () => { const r = queue.shift(); if (r) r(); };
        return () => new Promise(r => { queue.push(r); ch.port2.postMessage(0); });
    })();
    // save a JSON into iris-engine/ref/ through the dev server (serve.py); falls back to a download
    async function saveRef(name, obj) {
        const body = JSON.stringify(obj);
        try { const r = await fetch('/save/' + name, { method: 'POST', body }); if (r.ok) { say('saved ' + (name.startsWith('versions/') ? name : 'ref/' + name)); return true; } } catch (e) {}
        const a = document.createElement('a'); a.download = name.replace(/\//g, '-'); a.href = URL.createObjectURL(new Blob([body], { type: 'application/json' })); a.click();
        return false;
    }
    // ---------------- alignment store (per photo, normalised) ----------------
    const alignStore = (() => { try { return JSON.parse(localStorage.getItem('irisAlign') || '{}'); } catch (e) { return {}; } })();
    let bundledAlign = {};
    fetch('ref/align.json').then(r => r.ok ? r.json() : {}).then(j => { bundledAlign = j || {}; }).catch(() => {});
    function alignmentOf(name) { return alignStore[name] || bundledAlign[name] || null; }
    function applyStoredAlignment(name) {
        const a = alignmentOf(name); if (!a) return false;
        const W = fit.W, H = fit.H;
        fit.pupil = { x: a.pupil[0] * W, y: a.pupil[1] * H, r: a.pupil[2] * H };
        fit.limbus = { x: a.limbus[0] * W, y: a.limbus[1] * H, rx: a.limbus[2] * H, ry: a.limbus[3] * H, ang: a.limbus[4] || 0 };
        fit.catch = { x: a.catch[0] * W, y: a.catch[1] * H };
        say('alignment restored for ' + name); return true;
    }
    function saveAlignment() {
        if (!fit.name) return;
        const W = fit.W, H = fit.H, P = fit.pupil, L = fit.limbus, C = fit.catch;
        alignStore[fit.name] = { pupil: [P.x / W, P.y / H, P.r / H], limbus: [L.x / W, L.y / H, L.rx / H, L.ry / H, L.ang], catch: [C.x / W, C.y / H] };
        try { localStorage.setItem('irisAlign', JSON.stringify(alignStore)); } catch (e) {}
        say('alignment saved for ' + fit.name + ' (' + Object.keys(alignStore).length + ' stored)');
    }
    function exportAlignments() {
        // bundled ← bench auto-alignments ← manual saves (manual wins)
        const fromCases = {}; for (const f in cases) if (cases[f].align) fromCases[f] = cases[f].align;
        return saveRef('align.json', Object.assign({}, bundledAlign, fromCases, alignStore));
    }
    function drawPolar() {
        const W = fit.W, H = fit.H, U = W, V = Math.floor(H / 2);
        const a = unwrapRGB(fit.photo, U, V), b = fit.render ? unwrapRGB(fit.render, U, V) : null;
        const show = ctx.createImageData(W, H);
        for (let j = 0; j < V; j++) for (let i = 0; i < U; i++) {
            const src = a, o = ((V - 1 - j) * W + i) * 4, q = (j * U + i) * 3, ok = a.valid[j * U + i];
            // cells beyond the visible limbus at this angle (the 5.85 × 5.40 limbus against the 6 mm root) are not sampled: shown grey
            show.data[o] = ok ? src[q] : 40; show.data[o + 1] = ok ? src[q + 1] : 40; show.data[o + 2] = ok ? src[q + 2] : 40; show.data[o + 3] = 255;
            const o2 = ((H - 1 - j) * W + i) * 4;
            if (b) { show.data[o2] = ok ? b[q] : 40; show.data[o2 + 1] = ok ? b[q + 1] : 40; show.data[o2 + 2] = ok ? b[q + 2] : 40; } show.data[o2 + 3] = 255;
        }
        ctx.putImageData(show, 0, 0);
        ctx.strokeStyle = 'rgba(0,240,255,0.8)'; ctx.beginPath(); ctx.moveTo(0, V); ctx.lineTo(W, V); ctx.stroke();
        ctx.fillStyle = 'rgba(0,240,255,0.9)'; ctx.font = '10px monospace'; ctx.fillText('PHOTO polar (tissue u, v through the engine map · pupil ↓ root ↑)', 6, 12); ctx.fillText('RENDER polar', 6, V + 12);
    }
    // polar unwrap in RGB (u turns, v 0 at the pupil edge, 1 at the limbus), rows bottom = pupil
    // ---- the engine's coordinate map (§19 Phase B): field (u, tissue v) of every photo pixel, rendered by
    // the photo shader (debug view 14) at the current pose — refraction, dilation remap, decentration and
    // tilt included. Every unwrap goes through it, so photo and render are compared in the same tissue
    // coordinates that the fields live in. Cached per pose.
    function getMap() {
        const W = fit.W, H = fit.H;
        const sig = [W, H, state.zoomPhoto, state.view.join(','), state.pupil, (state.pupilOff || []).join(','), state.camRot.join(','), state.refract].join('|');
        if (fit.map && fit.map.sig === sig) return fit.map;
        ensureFitTargets(W, H);
        if (E.atlas.dirty) E.bakeAtlas();
        E.drawPhotoFrame(fitFB, W, H, 0, fitTex2, { ref: 1, rot: state.camRot, zoom: state.zoomPhoto, view: state.view, debug: 14 });
        const px = new Float32Array(W * H * 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fitFB); gl.readPixels(0, 0, W, H, gl.RGBA, gl.FLOAT, px); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, E.canvas.width, E.canvas.height);
        const u = new Float32Array(W * H), v = new Float32Array(W * H), inside = new Uint8Array(W * H); let n = 0;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = ((H - 1 - y) * W + x) * 4, k = y * W + x; if (px[o + 2] > 0.5) { u[k] = px[o]; v[k] = px[o + 1]; inside[k] = 1; n++; } }
        // the visible limbus per angle: the largest tissue v among the iris pixels in each of 256 u bins (the
        // 5.85 × 5.40 limbus hides the 6 mm root unevenly); cells beyond it are unsampled in every unwrap
        const vmax = new Float32Array(256);
        for (let k = 0; k < W * H; k++) if (inside[k]) { const b = Math.min(255, Math.floor(u[k] * 256)); if (v[k] > vmax[b]) vmax[b] = v[k]; }
        for (let b = 0; b < 256; b++) if (vmax[b] === 0) vmax[b] = Math.max(vmax[(b + 255) % 256], vmax[(b + 1) % 256]);
        fit.map = { sig, u, v, inside, n, vmax };
        return fit.map;
    }
    // ---------------- strand-band energy (§22 F0): the cheap term the optimiser can afford ----------------
    // The FFT diagnostic (diagnostics → hfRatio) is the honest measure of strand detail but costs ≈ 130 ms.
    // For the objective we need the same quantity per render: a Laplacian along the *tangential* direction
    // with a ± half-strand offset, which is a band-pass centred on the strand spacing. The offsets depend
    // only on the coordinate map, so they are computed once per alignment and cached on it.
    const STRAND_MM = 0.055;                       // 06: 35–70 µm; the Laplacian peaks at ≈ 2 × this offset
    function strandTaps() {
        const map = getMap();
        if (map.taps) return map.taps;
        const W = fit.W, H = fit.H, u = map.u, v = map.v, inside = map.inside;
        const dx = new Float32Array(W * H), dy = new Float32Array(W * H), use = new Uint8Array(W * H);
        const wrap = d => d - Math.round(d);        // u is in turns: the shortest way round
        let nUse = 0;
        for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
            const k = y * W + x;
            if (!inside[k] || !inside[k - 1] || !inside[k + 1] || !inside[k - W] || !inside[k + W]) continue;
            const ux = 0.5 * wrap(u[k + 1] - u[k - 1]), uy = 0.5 * wrap(u[k + W] - u[k - W]);
            const g2 = ux * ux + uy * uy;
            if (g2 < 1e-12) continue;
            const g = Math.sqrt(g2);
            // 1 px along ĝ advances the angle by g turns = 2πr·g mm of arc; step half a strand spacing
            const mmPerPx = 6.2831853 * (2 + 4 * v[k]) * g;
            if (mmPerPx < 1e-6) continue;
            const px = 0.5 * STRAND_MM / mmPerPx;
            if (px < 0.5 || px > 12) continue;      // below a pixel the photo cannot resolve it; above, it is a different band
            dx[k] = px * ux / g; dy[k] = px * uy / g; use[k] = 1; nUse++;
        }
        map.taps = { dx, dy, use, nUse };
        return map.taps;
    }
    // The band-pass response itself, sampled at the same pixels for any image: 2L(p) − L(p+d) − L(p−d)
    // along the tangential direction. Signed, so two images can be correlated rather than only compared
    // in magnitude — v65 showed why that matters: an energy *ratio* is phase-blind, so the optimiser
    // satisfied it with high-frequency noise in the wrong places and lost SSIM₂ and grad doing it.
    function strandBand(pix, step = 2) {
        const t = strandTaps(), mask = fit.mask || (fit.mask = irisMask()), W = fit.W, H = fit.H;
        const lum = (x, y) => {
            const xi = Math.min(W - 2, Math.max(0, Math.floor(x))), yi = Math.min(H - 2, Math.max(0, Math.floor(y)));
            const fx = Math.min(1, Math.max(0, x - xi)), fy = Math.min(1, Math.max(0, y - yi));
            let a = 0;
            for (let j = 0; j <= 1; j++) for (let i = 0; i <= 1; i++) {
                const o = ((yi + j) * W + xi + i) * 4, w2 = (i ? fx : 1 - fx) * (j ? fy : 1 - fy);
                a += w2 * (0.299 * pix[o] + 0.587 * pix[o + 1] + 0.114 * pix[o + 2]);
            }
            return a;
        };
        const out = [];
        for (let y = 1; y < H - 1; y += step) for (let x = 1; x < W - 1; x += step) {
            const k = y * W + x;
            if (!t.use[k] || !mask[k]) continue;
            const o = k * 4, c = 0.299 * pix[o] + 0.587 * pix[o + 1] + 0.114 * pix[o + 2];
            out.push(2 * c - lum(x + t.dx[k], y + t.dy[k]) - lum(x - t.dx[k], y - t.dy[k]));
        }
        return Float32Array.from(out);
    }
    // normalised cross-correlation of the two band-pass responses, −1..1. This is `gradAgree` moved from
    // half resolution down to the strand scale: it rises only when the render puts strands where the
    // photograph's are, which noise cannot do. The acceptance number for F2 (fitted spacing and phase).
    function strandCorr(a, b) {
        const n = Math.min(a.length, b.length);
        let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
        for (let i = 0; i < n; i++) { const x = a[i], y = b[i]; sa += x; sb += y; saa += x * x; sbb += y * y; sab += x * y; }
        if (!n) return 0;
        const ca = saa - sa * sa / n, cb = sbb - sb * sb / n, cab = sab - sa * sb / n;
        return (ca > 1e-9 && cb > 1e-9) ? cab / Math.sqrt(ca * cb) : 0;
    }
    // mean |2L(p) − L(p+d) − L(p−d)| over the masked pixels, in 0..255 luminance. Photo and render use the
    // same offsets, so the ratio is a pure statement about how much strand-scale structure each carries.
    function strandEnergy(pix, step = 2) {
        const t = strandTaps(), mask = fit.mask || (fit.mask = irisMask()), W = fit.W, H = fit.H;
        const lum = (x, y) => {                     // bilinear, clamped
            const xi = Math.min(W - 2, Math.max(0, Math.floor(x))), yi = Math.min(H - 2, Math.max(0, Math.floor(y)));
            const fx = Math.min(1, Math.max(0, x - xi)), fy = Math.min(1, Math.max(0, y - yi));
            let a = 0;
            for (let j = 0; j <= 1; j++) for (let i = 0; i <= 1; i++) {
                const o = ((yi + j) * W + xi + i) * 4, w2 = (i ? fx : 1 - fx) * (j ? fy : 1 - fy);
                a += w2 * (0.299 * pix[o] + 0.587 * pix[o + 1] + 0.114 * pix[o + 2]);
            }
            return a;
        };
        let acc = 0, n = 0;
        for (let y = 1; y < H - 1; y += step) for (let x = 1; x < W - 1; x += step) {
            const k = y * W + x;
            if (!t.use[k] || !mask[k]) continue;
            const o = k * 4, c = 0.299 * pix[o] + 0.587 * pix[o + 1] + 0.114 * pix[o + 2];
            acc += Math.abs(2 * c - lum(x + t.dx[k], y + t.dy[k]) - lum(x - t.dx[k], y - t.dy[k]));
            n++;
        }
        return n ? acc / n : 0;
    }
    // polar unwrap through the map: bilinear splat of every iris pixel into the U × V grid (u wraps),
    // then the empty cells (beyond the visible limbus, or between samples near the pupil) are filled
    // from their neighbours. Returns RGB bytes, U × V × 3, row j = tissue v (j + 0.5) / V.
    function unwrapRGB(pix, U, V) {
        const map = getMap(), W = fit.W, H = fit.H;
        const acc = new Float32Array(U * V * 3), cnt = new Float32Array(U * V);
        for (let k = 0; k < W * H; k++) {
            if (!map.inside[k]) continue;
            const fu = map.u[k] * U - 0.5, fv = Math.min(V - 1.001, Math.max(0, map.v[k] * V - 0.5));
            const i0 = Math.floor(fu), j0 = Math.floor(fv), tu = fu - i0, tv = fv - j0, o = k * 4;
            for (let dj = 0; dj <= 1; dj++) for (let di = 0; di <= 1; di++) {
                const ii = ((i0 + di) % U + U) % U, jj = Math.min(V - 1, j0 + dj), wgt = (di ? tu : 1 - tu) * (dj ? tv : 1 - tv); if (wgt <= 0) continue;
                const c = jj * U + ii; acc[c * 3] += wgt * pix[o]; acc[c * 3 + 1] += wgt * pix[o + 1]; acc[c * 3 + 2] += wgt * pix[o + 2]; cnt[c] += wgt;
            }
        }
        const out = new Float32Array(U * V * 3), filled = new Uint8Array(U * V); let empty = 0;
        for (let c = 0; c < U * V; c++) { if (cnt[c] > 1e-4) { filled[c] = 1; for (let t = 0; t < 3; t++) out[c * 3 + t] = acc[c * 3 + t] / cnt[c]; } else empty++; }
        for (let pass = 0; pass < 256 && empty > 0; pass++) {
            const nf = new Uint8Array(filled);
            for (let j = 0; j < V; j++) for (let i = 0; i < U; i++) {
                const c = j * U + i; if (filled[c]) continue;
                let s0 = 0, s1 = 0, s2 = 0, n = 0;
                for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = (i + di + U) % U, jj = j + dj; if (jj < 0 || jj >= V) continue; const q = jj * U + ii; if (filled[q]) { s0 += out[q * 3]; s1 += out[q * 3 + 1]; s2 += out[q * 3 + 2]; n++; } }
                if (n) { out[c * 3] = s0 / n; out[c * 3 + 1] = s1 / n; out[c * 3 + 2] = s2 / n; nf[c] = 1; empty--; }
            }
            filled.set(nf);
        }
        const bytes = new Uint8ClampedArray(U * V * 3); for (let q = 0; q < U * V * 3; q++) bytes[q] = out[q];
        bytes.valid = new Uint8Array(U * V); for (let j = 0; j < V; j++) for (let i = 0; i < U; i++) bytes.valid[j * U + i] = (j + 0.5) / V <= map.vmax[Math.floor((i + 0.5) / U * 256)] ? 1 : 0;   // inside the visible limbus at this angle
        return bytes;
    }
    function draw() {
        if (!fit.photo) return;
        if (fit.mode === 4) { drawPolar(); return; }
        if (fit.mode === 5) { drawHeightAB(); return; }
        const W = fit.W, H = fit.H;
        const show = new ImageData(W, H);
        const p = fit.photo, r = fit.render;
        for (let i = 0; i < W * H; i++) {
            const o = i * 4; let c;
            const x = i % W;
            const m = fit.mode === 3 ? (x < W / 2 ? 0 : 1) : fit.mode;
            if (m === 0 || !r) c = [p[o], p[o + 1], p[o + 2]];
            else if (m === 1) c = [r[o], r[o + 1], r[o + 2]];
            else { const d = Math.abs(p[o] - r[o]) + Math.abs(p[o + 1] - r[o + 1]) + Math.abs(p[o + 2] - r[o + 2]); c = [Math.min(255, d), Math.min(255, d * 0.5), 0]; }
            show.data[o] = c[0]; show.data[o + 1] = c[1]; show.data[o + 2] = c[2]; show.data[o + 3] = 255;
        }
        ctx.putImageData(show, 0, 0);
        // markers
        ctx.lineWidth = 1.5;
        const L = fit.limbus; ctx.strokeStyle = 'rgba(255,170,0,0.9)'; ctx.beginPath(); ctx.ellipse(L.x, L.y, L.rx, L.ry, L.ang, 0, 6.2832); ctx.stroke();
        const P = fit.pupil; ctx.strokeStyle = 'rgba(0,240,255,0.9)'; ctx.beginPath(); ctx.arc(P.x, P.y, P.r, 0, 6.2832); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(P.x - 6, P.y); ctx.lineTo(P.x + 6, P.y); ctx.moveTo(P.x, P.y - 6); ctx.lineTo(P.x, P.y + 6); ctx.stroke();
        const C = fit.catch; ctx.strokeStyle = 'rgba(255,255,0,0.9)'; ctx.beginPath(); ctx.arc(C.x, C.y, 5, 0, 6.2832); ctx.stroke();
    }
    // drag: nearest marker (centre) or ring (radius); wheel resizes
    function canvasPos(ev) { const b = cv.getBoundingClientRect(); return [(ev.clientX - b.left) * cv.width / b.width, (ev.clientY - b.top) * cv.height / b.height]; }
    cv.addEventListener('pointerdown', ev => {
        const [x, y] = canvasPos(ev); const P = fit.pupil, L = fit.limbus, C = fit.catch;
        const dC = Math.hypot(x - C.x, y - C.y), dP = Math.hypot(x - P.x, y - P.y), dL = Math.hypot(x - L.x, y - L.y);
        if (dC < 12) fit.drag = { what: 'catch' };
        else if (Math.abs(dP - P.r) < 10) fit.drag = { what: 'pupilR' };
        else if (dP < P.r) fit.drag = { what: 'pupil', dx: P.x - x, dy: P.y - y };
        else if (Math.abs(Math.hypot((x - L.x) / L.rx, (y - L.y) / L.ry) - 1) < 0.08) fit.drag = { what: 'limbusR', axis: Math.abs(x - L.x) > Math.abs(y - L.y) ? 'x' : 'y' };
        else fit.drag = { what: 'limbus', dx: L.x - x, dy: L.y - y };
        cv.setPointerCapture(ev.pointerId); ev.preventDefault();
    });
    cv.addEventListener('pointermove', ev => {
        if (!fit.drag) return; const [x, y] = canvasPos(ev); const d = fit.drag;
        if (d.what === 'catch') { fit.catch.x = x; fit.catch.y = y; }
        else if (d.what === 'pupil') { fit.pupil.x = x + d.dx; fit.pupil.y = y + d.dy; }
        else if (d.what === 'pupilR') fit.pupil.r = Math.max(4, Math.hypot(x - fit.pupil.x, y - fit.pupil.y));
        else if (d.what === 'limbus') { fit.limbus.x = x + d.dx; fit.limbus.y = y + d.dy; }
        else if (d.what === 'limbusR') { if (d.axis === 'x') fit.limbus.rx = Math.max(8, Math.abs(x - fit.limbus.x)); else fit.limbus.ry = Math.max(8, Math.abs(y - fit.limbus.y)); }
        draw();
    });
    cv.addEventListener('pointerup', () => { fit.drag = null; });
    cv.addEventListener('wheel', ev => {
        const [x, y] = canvasPos(ev); const f = ev.deltaY > 0 ? 1.03 : 0.97;
        if (Math.hypot(x - fit.pupil.x, y - fit.pupil.y) < fit.pupil.r * 1.3) fit.pupil.r *= f; else { fit.limbus.rx *= f; fit.limbus.ry *= f; }
        draw(); ev.preventDefault();
    }, { passive: false });

    // ---------------- pose solve (01 §2, 04 §B) ----------------
    // The engine looks along +z at the eye; the limbus (5.85 × 5.40 mm) is at z ≈ 2.5; a 100 mm lens
    // on a 24 mm-tall sensor. Photo pixels → mm on the limbus plane → camera distance; the ellipse
    // ratio → eye rotation; pupil px → pupil mm through the 1.13× corneal magnification; the
    // catchlight → key direction by mirroring on the 7.8 mm corneal sphere.
    // project a world point (mm, apex frame) through the engine's camera: orbit about the pivot
    // (0, 0, 13) by rot = [rotX, rotY] exactly as the photo shader does, 100 mm lens, 24 mm sensor.
    // Returns the image-fraction offset from the frame centre (x right, y up).
    function projectPoint(p, rot, zoom, aspect) {
        const rx = rot[0], ry = rot[1], cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry);
        const rotv = v => { // v.yz *= mat2(cx, sx, -sx, cx); v.xz *= mat2(cy, sy, -sy, cy)  (GLSL row-vector products)
            let [x, y, z] = v; let y2 = y * cx - z * sx, z2 = y * sx + z * cx; y = y2; z = z2;
            let x2 = x * cy - z * sy, z3 = x * sy + z * cy; x = x2; z = z3; return [x, y, z]; };
        const pivot = [0, 0, 13];
        let ro = [0, 0, -zoom]; ro = rotv([ro[0] - pivot[0], ro[1] - pivot[1], ro[2] - pivot[2]]); ro = [ro[0] + pivot[0], ro[1] + pivot[1], ro[2] + pivot[2]];
        const right = rotv([1, 0, 0]), up = rotv([0, 1, 0]), fwd = rotv([0, 0, 1]);
        const d = [p[0] - ro[0], p[1] - ro[1], p[2] - ro[2]];
        const xc = d[0] * right[0] + d[1] * right[1] + d[2] * right[2], yc = d[0] * up[0] + d[1] * up[1] + d[2] * up[2], zc = d[0] * fwd[0] + d[1] * fwd[1] + d[2] * fwd[2];
        const sxm = 100 * xc / zc, sym = 100 * yc / zc;               // mm on the sensor
        return [sxm / (24 * aspect), sym / 24];
    }
    function solvePose() {
        const L = fit.limbus, P = fit.pupil, C = fit.catch, H = fit.H, W = fit.W;
        const pxPerMm = (L.rx + L.ry) / 2 / ((5.85 + 5.40) / 2);
        // distance so that the limbus radius projects to the same fraction of the image height
        const fracLimbus = ((L.rx + L.ry) / 2) / H;           // limbus radius as a fraction of the frame height
        const sensorMm = fracLimbus * 24.0;                   // on the sensor
        const D = 5.6 * 100.0 / sensorMm;                     // apex-plane distance, mm
        const zoom = D - 2.5;
        // rotation from the ellipse ratio (corrected for the natural 5.85/5.40 ellipse)
        const natural = 5.40 / 5.85;
        const ratio = Math.min(1, (L.ry / L.rx) / natural);
        // a limbus within 6 % of round is treated as frontal: moments and lids cannot resolve smaller tilts
        const tilt = ratio > 0.94 ? 0 : Math.acos(Math.max(0.2, ratio));
        // the pupil sits 0.25 mm nasal / 0.15 mm up at rest; extra offset = perspective of the tilt
        const offx = (P.x - L.x) / pxPerMm, offy = -(P.y - L.y) / pxPerMm;   // mm, y up
        // the ellipse ratio gives the tilt magnitude; the pupil offset (minus its resting 0.25 / 0.15 mm)
        // only gives the direction. A centred pupil in a round limbus means no rotation.
        const dxo = offx - 0.25, dyo = offy - 0.15, dn = Math.hypot(dxo, dyo);
        const dirx = dn > 0.05 ? dxo / dn : 0, diry = dn > 0.05 ? dyo / dn : 0;
        const yaw = tilt * dirx, pitch = -tilt * diry;
        state.camRot = [pitch, yaw]; state.useRot = true;
        // pupil in mm through the corneal magnification
        const pupilMm = 2 * P.r / pxPerMm / 1.13;
        // image offset: the render's pupil (world point 0.25 mm nasal, 0.15 mm up, 3.5 mm deep) must
        // land on the photo's pupil marker — projected through the same camera and orbit the shader
        // uses, so a tilted pose shifts the iris exactly as the render will
        state.pupilOff = [0.25, 0.15];                          // anatomical rest; the alignment loop corrects it
        const proj = projectPoint([0.25, 0.15, 3.5], [pitch, yaw], zoom, W / H);
        const cxf = P.x / W, cyf = 1 - P.y / H;
        state.view = [cxf - 0.5 - proj[0], cyf - 0.5 - proj[1], 1, 1];
        // catchlight → key direction
        const hx = (C.x - L.x) / pxPerMm, hy = -(C.y - L.y) / pxPerMm;
        const nz = -Math.sqrt(Math.max(0, 1 - (hx * hx + hy * hy) / (7.8 * 7.8)));
        const n = [hx / 7.8, hy / 7.8, nz];                    // corneal normal at the highlight (toward the camera = −z)
        const V = [0, 0, -1];                                  // toward the camera
        const nv = n[0] * V[0] + n[1] * V[1] + n[2] * V[2];
        const Ld = [2 * nv * n[0] - V[0], 2 * nv * n[1] - V[1], 2 * nv * n[2] - V[2]];   // toward the light
        const az = Math.atan2(Ld[1], Ld[0]); const el = Math.asin(Math.max(0.05, Math.min(0.99, -Ld[2])));
        E.setSlider('pupil', 'pupil', +pupilMm.toFixed(2)); state.pupil = pupilMm; target.pupil = pupilMm;
        E.setSlider('light', 'lightAngle', +((az + 6.2832) % 6.2832).toFixed(2)); state.lightAngle = target.lightAngle = (az + 6.2832) % 6.2832;
        E.setSlider('elev', 'lightElev', +el.toFixed(2)); state.lightElev = target.lightElev = el;
        if (fit.isolated) { state.srcType = 2; state.srcSize = target.srcSize = 0.12; document.querySelectorAll('.src-btn').forEach(x => x.classList.toggle('active', x.dataset.src === '2')); }
        state.zoomPhoto = target.zoomPhoto = zoom;
        fit.pose = { zoom, pxPerMm, pupilMm, yaw, pitch, az, el };
        say(`pose: distance ${zoom.toFixed(0)} mm · pupil ${pupilMm.toFixed(2)} mm · yaw ${(yaw * 57.3).toFixed(1)}° pitch ${(pitch * 57.3).toFixed(1)}° · key az ${(az * 57.3).toFixed(0)}° el ${(el * 57.3).toFixed(0)}°`);
        alignLoop();
        E.resetAccumulation();
        renderFit(); score(); draw();
    }

    // ---------------- reference render at the photo's resolution ----------------
    let fitFB = null, fitTex = null, fitFB2 = null, fitTex2 = null, fitW = 0, fitH = 0;
    function ensureFitTargets(w, h) {
        if (fitW === w && fitH === h) return;
        fitW = w; fitH = h;
        if (!fitFB) { fitFB = gl.createFramebuffer(); fitTex = gl.createTexture(); fitFB2 = gl.createFramebuffer(); fitTex2 = gl.createTexture(); }
        gl.bindTexture(gl.TEXTURE_2D, fitTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fitFB); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fitTex, 0);
        gl.bindTexture(gl.TEXTURE_2D, fitTex2);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fitFB2); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fitTex2, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    function renderFit() {
        if (!fit.photo) return null;
        ensureFitTargets(fit.W, fit.H);
        if (E.atlas.dirty) E.bakeAtlas();
        // frame 0 never reads the accumulation source, but binding the target itself would be a feedback loop
        E.drawPhotoFrame(fitFB, fit.W, fit.H, 0, fitTex2, { ref: 1, rot: state.camRot, zoom: state.zoomPhoto, view: state.view, specular: fit.isolated ? 0 : 1, edgeFade: 0 });
        E.drawPost(fitFB2, fitTex, fit.W, fit.H, 0, { ref: 1 });
        const px = new Uint8Array(fit.W * fit.H * 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fitFB2);
        gl.readPixels(0, 0, fit.W, fit.H, gl.RGBA, gl.UNSIGNED_BYTE, px);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, E.canvas.width, E.canvas.height);
        // flip to image orientation
        const out = new Uint8ClampedArray(fit.W * fit.H * 4);
        for (let y = 0; y < fit.H; y++) out.set(px.subarray((fit.H - 1 - y) * fit.W * 4, (fit.H - y) * fit.W * 4), y * fit.W * 4);
        fit.render = out;
        return out;
    }

    // ---------------- scoring ----------------
    function irisMask() {
        const W = fit.W, H = fit.H, L = fit.limbus, P = fit.pupil, m = new Uint8Array(W * H);
        const ca = Math.cos(L.ang), sa = Math.sin(L.ang);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const dx = x - L.x, dy = y - L.y; const ex = (ca * dx + sa * dy) / L.rx, ey = (-sa * dx + ca * dy) / L.ry;
            const inL = ex * ex + ey * ey < 0.92 * 0.92;
            const inP = Math.hypot(x - P.x, y - P.y) < P.r * 1.08;
            const o = (y * W + x) * 4; const spec = fit.photo[o] > 235 && fit.photo[o + 1] > 235 && fit.photo[o + 2] > 225;   // clipped speculars are not iris
            m[y * W + x] = inL && !inP && !spec ? 1 : 0;
        }
        return m;
    }
    // SSIM of luminance at quarter resolution inside the mask (7×7 windows), 0..1
    function ssimQuarter(a, b, mask) { return ssimAt(a, b, mask, 4); }
    // SSIM of luminance at 1/f resolution inside the mask (7×7 windows), 0..1
    function ssimAt(a, b, mask, f) {
        const W = fit.W, H = fit.H, w = Math.floor(W / f), h = Math.floor(H / f);
        const ga = new Float32Array(w * h), gb = new Float32Array(w * h), gm = new Float32Array(w * h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let sa = 0, sb = 0, sm = 0; for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) { const k = (y * f + j) * W + x * f + i, o = k * 4; if (!mask[k]) continue; sa += 0.299 * a[o] + 0.587 * a[o + 1] + 0.114 * a[o + 2]; sb += 0.299 * b[o] + 0.587 * b[o + 1] + 0.114 * b[o + 2]; sm++; } ga[y * w + x] = sm ? sa / sm : 0; gb[y * w + x] = sm ? sb / sm : 0; gm[y * w + x] = sm >= f * f * 0.75 ? 1 : 0; }
        const C1 = 6.5025, C2 = 58.5225; let tot = 0, n = 0;
        for (let y = 3; y < h - 3; y++) for (let x = 3; x < w - 3; x++) {
            if (!gm[y * w + x]) continue;
            let ma = 0, mb = 0, cnt = 0; for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) { const k = (y + j) * w + x + i; if (!gm[k]) continue; ma += ga[k]; mb += gb[k]; cnt++; }
            if (cnt < 20) continue; ma /= cnt; mb /= cnt;
            let va = 0, vb = 0, cov = 0; for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) { const k = (y + j) * w + x + i; if (!gm[k]) continue; va += (ga[k] - ma) ** 2; vb += (gb[k] - mb) ** 2; cov += (ga[k] - ma) * (gb[k] - mb); }
            va /= cnt - 1; vb /= cnt - 1; cov /= cnt - 1;
            tot += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2)); n++;
        }
        return n ? tot / n : 0;
    }
    // MATCH % (00 §9.3): structure (SSIM at quarter resolution) and colour (mean ΔE*ab of the radial
    // profiles, 0 error → 1, 40 → 0) in equal parts
    function matchPercent(ssim, dE) { return 100 * (0.5 * Math.max(0, ssim) + 0.5 * Math.max(0, 1 - dE / 40)); }
    // gradient-domain agreement at half resolution (§21 E2): normalised correlation of the luminance gradient
    // vectors inside the mask — it rewards edges in the same places with the same orientation (rims, bundles),
    // which SSIM at a quarter of the image cannot see
    function gradAgree(a, b, mask) {
        const W = fit.W, H = fit.H, f = 2, w = Math.floor(W / f), h = Math.floor(H / f);
        const la = new Float32Array(w * h), lb = new Float32Array(w * h), lm = new Uint8Array(w * h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let sa = 0, sb = 0, sm = 0; for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) { const k = (y * f + j) * W + x * f + i, o = k * 4; if (!mask[k]) continue; sa += 0.299 * a[o] + 0.587 * a[o + 1] + 0.114 * a[o + 2]; sb += 0.299 * b[o] + 0.587 * b[o + 1] + 0.114 * b[o + 2]; sm++; } la[y * w + x] = sm ? sa / sm : 0; lb[y * w + x] = sm ? sb / sm : 0; lm[y * w + x] = sm === f * f ? 1 : 0; }
        let dot = 0, na = 0, nb = 0;
        for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const k = y * w + x; if (!lm[k] || !lm[k - 1] || !lm[k + 1] || !lm[k - w] || !lm[k + w]) continue; const ax = la[k + 1] - la[k - 1], ay = la[k + w] - la[k - w], bx = lb[k + 1] - lb[k - 1], by = lb[k + w] - lb[k - w]; dot += ax * bx + ay * by; na += ax * ax + ay * ay; nb += bx * bx + by * by; }
        return na > 0 && nb > 0 ? Math.max(0, dot / Math.sqrt(na * nb)) : 0;
    }
    // MATCH2 (§21 E2): quarter-res SSIM, half-res SSIM, gradient agreement, colour — a quarter each
    function match2Percent(ss4, ss2, gr, dE) { return 100 * (0.25 * Math.max(0, ss4) + 0.25 * Math.max(0, ss2) + 0.25 * gr + 0.25 * Math.max(0, 1 - dE / 40)); }
    function srgbToLab(r, g, b) {
        const f = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
        const R = f(r), G = f(g), B = f(b);
        let X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
        const h = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
        X = h(X); Y = h(Y); Z = h(Z);
        return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
    }
    // radial profiles of L*, a*, b* in 24 bins from pupil edge to limbus, in the photo's own geometry
    function profiles(pix) {
        const W = fit.W, H = fit.H, L = fit.limbus, P = fit.pupil, N = 24;
        const acc = Array.from({ length: N }, () => [0, 0, 0, 0]);
        const ca = Math.cos(L.ang), sa = Math.sin(L.ang);
        for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
            const dx = x - L.x, dy = y - L.y; const ex = (ca * dx + sa * dy) / L.rx, ey = (-sa * dx + ca * dy) / L.ry;
            const rl = Math.sqrt(ex * ex + ey * ey);                       // 1 at the limbus
            const rp = Math.hypot(x - P.x, y - P.y) / P.r;                 // 1 at the pupil edge
            if (rp <= 1.05 || rl >= 0.95) continue;
            { const o = (y * W + x) * 4; if (fit.photo[o] > 235 && fit.photo[o + 1] > 235 && fit.photo[o + 2] > 225) continue; }
            const v = Math.min(N - 1, Math.max(0, Math.floor(((rl * ((L.rx + L.ry) / 2) - P.r) / (((L.rx + L.ry) / 2) * 0.95 - P.r)) * N)));
            const o = (y * W + x) * 4; const lab = srgbToLab(pix[o], pix[o + 1], pix[o + 2]);
            const a = acc[v]; a[0] += lab[0]; a[1] += lab[1]; a[2] += lab[2]; a[3]++;
        }
        return acc.map(a => a[3] ? [a[0] / a[3], a[1] / a[3], a[2] / a[3]] : [0, 0, 0]);
    }
    function psnr(a, b, mask, step = 1) {
        let se = 0, n = 0; const W = fit.W, H = fit.H;
        for (let i = 0; i < W * H; i += step) { if (!mask[i]) continue; const o = i * 4; for (let c = 0; c < 3; c++) { const d = a[o + c] - b[o + c]; se += d * d; } n += 3; }
        return n ? 10 * Math.log10(255 * 255 / (se / n)) : 0;
    }
    function score() {
        if (!fit.photo || !fit.render) return null;
        fit.mask = fit.mask || irisMask();
        const pp = profiles(fit.photo), pr = profiles(fit.render);
        let dL = 0, dab = 0, n = 0;
        for (let i = 0; i < pp.length; i++) { dL += Math.abs(pp[i][0] - pr[i][0]); dab += Math.hypot(pp[i][1] - pr[i][1], pp[i][2] - pr[i][2]); n++; }
        let dE = 0; for (let i = 0; i < pp.length; i++) dE += Math.hypot(pp[i][0] - pr[i][0], pp[i][1] - pr[i][1], pp[i][2] - pr[i][2]); dE /= n;
        const ss = ssimQuarter(fit.photo, fit.render, fit.mask), ss2 = ssimAt(fit.photo, fit.render, fit.mask, 2), gr = gradAgree(fit.photo, fit.render, fit.mask);
        // texture targets (06): local contrast and ridge/gap in the ciliary zone, photo vs render
        const tp = textureStats(fit.photo)[1], tr = textureStats(fit.render)[1];
        const hfP = strandEnergy(fit.photo), hfR = strandEnergy(fit.render);
        const sCorr = strandCorr(strandBand(fit.photo), strandBand(fit.render));
        const bs = bandScores(fit.render), rtN = fit.route;
        const s = { psnr: psnr(fit.photo, fit.render, fit.mask), dL: dL / n, dab: dab / n, dE, ssim: ss, ssim2: ss2, grad: gr, match: matchPercent(ss, dE), match2: match2Percent(ss, ss2, gr, dE), hcorr: heightCorrelation(),
            hfLapPhoto: +hfP.toFixed(2), hfLapRender: +hfR.toFixed(2), hfLap: +(hfR / Math.max(1e-6, hfP)).toFixed(3), strandCorr: +sCorr.toFixed(3),
            bandCorr: ['B1', 'B2', 'B3'].map(n => +bs[n].corr.toFixed(3)), bandRatio: ['B1', 'B2', 'B3'].map(n => +bs[n].ratio.toFixed(3)),
            evidence: rtN ? ['B1', 'B2', 'B3'].map(n => rtN.evidence[n]) : null,
            contrastPhoto: tp.contrast, contrastRender: tr.contrast, ridgeGapPhoto: +(tp.ridge[0] / Math.max(1, tp.gap[0])).toFixed(2), ridgeGapRender: +(tr.ridge[0] / Math.max(1, tr.gap[0])).toFixed(2) };
        scoreEl.textContent = `MATCH2 ${s.match2.toFixed(0)} % (M1 ${s.match.toFixed(0)}) · SSIM ${ss.toFixed(2)}/${ss2.toFixed(2)} · grad ${gr.toFixed(2)} · height r ${s.hcorr.toFixed(2)} · PSNR ${s.psnr.toFixed(1)} dB · ΔL* ${s.dL.toFixed(1)} · Δab ${s.dab.toFixed(1)} · strand E R/P ${s.hfLap.toFixed(2)} r ${s.strandCorr.toFixed(2)} · contrast P ${tp.contrast.toFixed(2)} / R ${tr.contrast.toFixed(2)} · ridge/gap P ${s.ridgeGapPhoto} / R ${s.ridgeGapRender}`;
        fit.score = s; return s;
    }
    // the score line plus the §22 diagnostics, on demand (DIAG button / console): the numbers the
    // version archive tracks, for the eye currently loaded
    function sayDiagnostics() {
        const s = score(), d = diagnostics();
        if (!d) { say('load a photo and render first'); return null; }
        say(`σ render/photo ${d.sigmaRender}/${d.sigmaPhoto} = ${d.sigmaRatio} · floors ${d.darkErr > 0 ? '+' : ''}${d.darkErr} L* (photo's darkest 15 %, below L* ${d.darkThr}) · bands ΔL* [${d.bandDL.join(', ')}]`);
        say(`spectrum agree ${d.specAgree} · strand energy R/P ${d.hfRatio} (${d.hfRender}/${d.hfPhoto}) · spacing mm P/R ` + d.zones.map(z => `${z.spacingPhotoMm.toFixed(3)}/${z.spacingRenderMm.toFixed(3)}`).join(' · '));
        return { score: s, diag: d };
    }

    // ---------------- F2 (spec §24): strand placement from the photograph ----------------
    // The generator's fine carrier is 0.5 + 0.5·cos(2π·x'/spacing + phase), x' the across-flow coordinate in mm
    // (bake: strandCarrier). This demodulates the photograph with the same x', so the fitted (spacing, phase)
    // put each rendered strand where the photo's is. Works on the full-resolution photo (the fit image is too
    // coarse: at NORMAL a 50 µm strand is under two pixels), unwrapped into tissue coordinates through an
    // upsampled coordinate map.
    const F2 = { U: 4096, V: 512, cands: [0.028, 0.032, 0.036, 0.041, 0.046, 0.052, 0.058, 0.065, 0.073, 0.082, 0.092], sigmaHP: 0.021 };
    function hiResPolar(maxLong = 4096) {
        const nat = fit.native; if (!nat) return null;
        const sc = Math.min(1, maxLong / Math.max(nat.w, nat.h));
        const Wh = Math.round(nat.w * sc), Hh = Math.round(nat.h * sc);
        const px = sc === 1 ? nat.px : areaResize(nat.px, nat.w, nat.h, Wh, Hh);   // deterministic, like loadImage
        const map = getMap(), W = fit.W, H = fit.H, L = fit.limbus;
        const { U, V } = F2, acc = new Float32Array(U * V), wt = new Float32Array(U * V);
        const kx = W / Wh, ky = H / Hh;
        const x0 = Math.max(0, Math.floor((L.x - 1.05 * L.rx) / kx)), x1 = Math.min(Wh - 1, Math.ceil((L.x + 1.05 * L.rx) / kx));
        const y0 = Math.max(0, Math.floor((L.y - 1.05 * L.rx) / ky)), y1 = Math.min(Hh - 1, Math.ceil((L.y + 1.05 * L.rx) / ky));
        for (let Y = y0; Y <= y1; Y++) {
            const fy = (Y + 0.5) * ky - 0.5, iy = Math.floor(fy), ty = fy - iy;
            if (iy < 0 || iy >= H - 1) continue;
            for (let X = x0; X <= x1; X++) {
                const fx = (X + 0.5) * kx - 0.5, ix = Math.floor(fx), tx = fx - ix;
                if (ix < 0 || ix >= W - 1) continue;
                const k00 = iy * W + ix, k10 = k00 + 1, k01 = k00 + W, k11 = k01 + 1;
                if (!(map.inside[k00] && map.inside[k10] && map.inside[k01] && map.inside[k11])) continue;
                const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
                const T = 6.2831853;
                const cu = w00 * Math.cos(T * map.u[k00]) + w10 * Math.cos(T * map.u[k10]) + w01 * Math.cos(T * map.u[k01]) + w11 * Math.cos(T * map.u[k11]);
                const su = w00 * Math.sin(T * map.u[k00]) + w10 * Math.sin(T * map.u[k10]) + w01 * Math.sin(T * map.u[k01]) + w11 * Math.sin(T * map.u[k11]);
                const u = (Math.atan2(su, cu) / T + 1) % 1;
                const v = w00 * map.v[k00] + w10 * map.v[k10] + w01 * map.v[k01] + w11 * map.v[k11];
                const fu = u * U - 0.5, fv = v * V - 0.5, iu = Math.floor(fu), jv = Math.floor(fv), tu = fu - iu, tv = fv - jv;
                if (jv < 0 || jv >= V - 1) continue;
                const o = (Y * Wh + X) * 4, lum = (0.299 * px[o] + 0.587 * px[o + 1] + 0.114 * px[o + 2]) / 255;
                for (let dj = 0; dj <= 1; dj++) for (let di = 0; di <= 1; di++) {
                    const ww = (di ? tu : 1 - tu) * (dj ? tv : 1 - tv), cidx = (jv + dj) * U + (((iu + di) % U) + U) % U;
                    acc[cidx] += ww * lum; wt[cidx] += ww;
                }
            }
        }
        return { acc, wt, U, V, umPerPx: 12000 / (2 * L.rx / kx), size: [Wh, Hh] };
    }
    // normalised (weight-aware) box blur in polar space, the angular radius adapted to each row's circumference
    function blurPolarNC(acc, wt, U, V, sigmaMM) {
        const a = Float32Array.from(acc), w = Float32Array.from(wt), ta = new Float32Array(U * V), tw = new Float32Array(U * V);
        const rv = Math.max(1, Math.round(Math.sqrt(4 * (sigmaMM / (4 / V)) ** 2 + 1) / 2));
        for (let pass = 0; pass < 3; pass++) {
            for (let j = 0; j < V; j++) {
                const r = 2 + 4 * (j + 0.5) / V, su = sigmaMM / (6.2831853 * r / U);
                const ru = Math.max(1, Math.round(Math.sqrt(4 * su * su + 1) / 2)), o = j * U;
                let sa = 0, sw = 0;
                for (let k = -ru; k <= ru; k++) { const i = ((k % U) + U) % U; sa += a[o + i]; sw += w[o + i]; }
                for (let i = 0; i < U; i++) {
                    ta[o + i] = sa; tw[o + i] = sw;
                    const add = (i + ru + 1) % U, sub = ((i - ru) % U + U) % U;
                    sa += a[o + add] - a[o + sub]; sw += w[o + add] - w[o + sub];
                }
            }
            for (let i = 0; i < U; i++) {
                let sa = 0, sw = 0;
                for (let k = -rv; k <= rv; k++) { const jj = Math.min(V - 1, Math.max(0, k)); sa += ta[jj * U + i]; sw += tw[jj * U + i]; }
                for (let j = 0; j < V; j++) {
                    a[j * U + i] = sa; w[j * U + i] = sw;
                    sa += ta[Math.min(V - 1, j + rv + 1) * U + i] - ta[Math.max(0, j - rv) * U + i];
                    sw += tw[Math.min(V - 1, j + rv + 1) * U + i] - tw[Math.max(0, j - rv) * U + i];
                }
            }
        }
        const out = new Float32Array(U * V);
        for (let k = 0; k < U * V; k++) out[k] = w[k] > 1e-6 ? a[k] / w[k] : 0;
        return out;
    }
    // the bake's strandCarrier in JS (breakup noise left out): cos-sum of the four nearest cells' plane waves
    function carrierPredict(u, v) {
        const g = E.genome, [w, h] = E.GRIDS.f, FD = (n, x) => x, gx = u * w - 0.5, gy = v * h - 0.5, i0 = Math.floor(gx), j0 = Math.floor(gy), tx = gx - i0, ty = gy - j0, r = 2 + 4 * v;
        let acc = 0;
        for (let dj = 0; dj <= 1; dj++) for (let di = 0; di <= 1; di++) {
            const wgt = (di ? tx : 1 - tx) * (dj ? ty : 1 - ty); if (wgt <= 0) continue;
            const ci = ((i0 + di) % w + w) % w, cj = Math.min(h - 1, Math.max(0, j0 + dj)), c = cj * w + ci;
            const th = g.fields.flowDir.data[c], sp = g.fields.placeSpacing.data[c], ph = Math.atan2(g.fields.phaseS.data[c], g.fields.phaseC.data[c]);
            const uc = (ci + 0.5) / w, vc = (cj + 0.5) / h, d = u - uc, da = (d - Math.round(d)) * 6.2831853 * r, dv = (v - vc) * 4;
            acc += wgt * Math.cos(6.2831853 * (da * Math.cos(th) - dv * Math.sin(th)) / sp + ph);
        }
        return acc;
    }
    function clearPlacement() {                          // a fit without F2 must not inherit the previous photo's placement
        const g = E.genome; if (!g.fields || !g.fields.place) return;
        for (const n of ['place', 'placeSpacing', 'phaseC', 'phaseS']) g.fields[n].custom = false;
        E.atlas.dirty = true;
    }
    function placementFromPhoto() {
        const t0 = performance.now();
        const P = hiResPolar(); if (!P) { say('F2: no photo'); return null; }
        const { U, V, acc, wt } = P, g = E.genome, [w, h] = E.GRIDS.f;
        // high-pass at ≈ 110 µm, normalised by the local mean: strands in, zones and tone out
        const mean = blurPolarNC(acc, wt, U, V, F2.sigmaHP);
        const Lb = new Float32Array(U * V), Wm = new Float32Array(U * V);
        for (let k = 0; k < U * V; k++) if (wt[k] > 0.05) { Lb[k] = (acc[k] / wt[k] - mean[k]) / (mean[k] + 0.03); Wm[k] = Math.min(1, wt[k]); }
        // Every demodulation happens in a local frame: x' = Δa·cos θ − Δv·sin θ, with Δa, Δv the mm offsets from the
        // frame centre and θ that frame's (u8-quantised) flow angle — exactly what strandCarrier does per cell.
        const fd = g.fields.flowDir.data, [lo, hi] = E.FIELD_DEFS.flowDir.range;
        const qTh = x => lo + Math.round((Math.max(lo, Math.min(hi, x)) - lo) / (hi - lo) * 255) / 255 * (hi - lo);
        const [slo, shi] = E.FIELD_DEFS.placeSpacing.range;
        const qSp = x => slo + Math.round((Math.max(slo, Math.min(shi, x)) - slo) / (shi - slo) * 255) / 255 * (shi - slo);
        const bil = (arr, u, v) => { const fu = u * w - 0.5, fv = Math.min(h - 1.001, Math.max(0, v * h - 0.5)), i = Math.floor(fu), j = Math.floor(fv), a = fu - i, b = fv - j, i0 = ((i % w) + w) % w, i1 = (i0 + 1) % w;
            return (1 - a) * (1 - b) * arr[j * w + i0] + a * (1 - b) * arr[j * w + i1] + (1 - a) * b * arr[(j + 1) * w + i0] + a * b * arr[(j + 1) * w + i1]; };
        const wrapT = d => d - Math.round(d);
        // demodulate the window around a frame centre (uc, vc) for a list of spacings; returns [re, im] per spacing and Σw|L|
        function demod(uc, vc, th, spacings, halfU, halfV, stride) {
            const C = spacings.length, re = new Float64Array(C), im2 = new Float64Array(C), ct = Math.cos(th), st = Math.sin(th);
            const ic = uc * U - 0.5, jc = vc * V - 0.5;
            let sAbs = 0;
            for (let dj = -halfV; dj <= halfV; dj += stride) {
                const j = Math.round(jc + dj); if (j < 0 || j >= V) continue;
                const hv = 0.5 + 0.5 * Math.cos(Math.PI * dj / (halfV + 1)), v = (j + 0.5) / V, r = 2 + 4 * v, dv = (v - vc) * 4;
                for (let di = -halfU; di <= halfU; di += stride) {
                    const i = ((Math.round(ic + di) % U) + U) % U, k = j * U + i, m = Wm[k]; if (!m) continue;
                    const ww = m * hv * (0.5 + 0.5 * Math.cos(Math.PI * di / (halfU + 1))), l = Lb[k];
                    const da = wrapT((i + 0.5) / U - uc) * 6.2831853 * r, xp = da * ct - dv * st;
                    sAbs += ww * Math.abs(l);
                    for (let c = 0; c < C; c++) { const ph = 6.2831853 * xp / spacings[c]; re[c] += ww * l * Math.cos(ph); im2[c] += ww * l * Math.sin(ph); }
                }
            }
            return { re, im: im2, sAbs };
        }
        // spacing per block (4 × 4 flow cells) by a matched filter over candidate spacings; each candidate's
        // response is divided by its mean over all blocks, which removes the spectral tilt of photo and filter
        const bw = Math.max(1, Math.floor(w / 4)), bh = Math.max(1, Math.floor(h / 4)), C = F2.cands.length;
        const Rb = new Float32Array(bw * bh * C), cover = new Float32Array(bw * bh);
        const su = Math.round(U / bw), sv = Math.round(V / bh);
        for (let bj = 0; bj < bh; bj++) for (let bi = 0; bi < bw; bi++) {
            const uc = (bi + 0.5) / bw, vc = (bj + 0.5) / bh;
            const d = demod(uc, vc, qTh(bil(fd, uc, vc)), F2.cands, su, sv, 2);
            const b = bj * bw + bi; cover[b] = d.sAbs;
            for (let c = 0; c < C; c++) Rb[b * C + c] = d.sAbs > 1e-9 ? Math.hypot(d.re[c], d.im[c]) / d.sAbs : 0;
        }
        const meanR = new Float32Array(C); let nb = 0;
        for (let b = 0; b < bw * bh; b++) if (cover[b] > 0) { nb++; for (let c = 0; c < C; c++) meanR[c] += Rb[b * C + c]; }
        for (let c = 0; c < C; c++) meanR[c] = meanR[c] / Math.max(1, nb) + 1e-9;
        const spB = new Float32Array(bw * bh), confB = new Float32Array(bw * bh);
        for (let b = 0; b < bw * bh; b++) {
            let best = 5, bv = -1, sum = 0;
            for (let c = 0; c < C; c++) { const rn = Rb[b * C + c] / meanR[c]; sum += rn; if (rn > bv) { bv = rn; best = c; } }
            spB[b] = cover[b] > 0 ? F2.cands[best] : 0.055;
            confB[b] = cover[b] > 0 ? Math.max(0, Math.min(1, (bv / (sum / C) - 1) / 0.6)) : 0;   // peak prominence
        }
        const spS = new Float32Array(bw * bh);                  // 3 × 3 median in block space (u wraps)
        for (let bj = 0; bj < bh; bj++) for (let bi = 0; bi < bw; bi++) {
            const vals = [];
            for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const jj = bj + dj; if (jj < 0 || jj >= bh) continue; const b = jj * bw + ((bi + di + bw) % bw); if (cover[b] > 0) vals.push(spB[b]); }
            vals.sort((a, b) => a - b); spS[bj * bw + bi] = vals.length ? vals[vals.length >> 1] : 0.055;
        }
        const blk = (arr, i, j) => { const fu = (i + 0.5) / w * bw - 0.5, fv = Math.min(bh - 1.001, Math.max(0, (j + 0.5) / h * bh - 0.5)), a0 = Math.floor(fu), b0 = Math.floor(fv), ta = fu - a0, tb = fv - b0, i0 = ((a0 % bw) + bw) % bw, i1 = (i0 + 1) % bw;
            return (1 - ta) * (1 - tb) * arr[b0 * bw + i0] + ta * (1 - tb) * arr[b0 * bw + i1] + (1 - ta) * tb * arr[(b0 + 1) * bw + i0] + ta * tb * arr[(b0 + 1) * bw + i1]; };
        // phase and placement weight per flow cell, in that cell's own frame (the cell ± one cell, Hann-weighted)
        const fS = g.fields.placeSpacing, fC = g.fields.phaseC, fSn = g.fields.phaseS, fP = g.fields.place;
        const cu = Math.round(U / w), cv = Math.round(V / h);
        let placed = 0, sumPlace = 0;
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
            const c = j * w + i, sp = qSp(blk(spS, i, j)), conf = blk(confB, i, j);
            const d = demod((i + 0.5) / w, (j + 0.5) / h, qTh(fd[c]), [sp], cu, cv, 1);
            const coh = d.sAbs > 1e-9 ? Math.hypot(d.re[0], d.im[0]) / d.sAbs : 0;   // 0 noise … π/4 a pure stripe pattern
            const place = d.sAbs > 1e-9 ? Math.min(1, Math.max(0, (coh - 0.12) / 0.3)) * (0.4 + 0.6 * conf) : 0;
            // demod() sums L·e^{+iΦ}; for L = cos(Φ + φ) that is (N/2)·e^{−iφ}, so the phase is the negated argument
            const phase = Math.atan2(-d.im[0], d.re[0]);
            fS.data[c] = sp; fC.data[c] = Math.cos(phase); fSn.data[c] = Math.sin(phase); fP.data[c] = place;
            if (place > 0.05) placed++; sumPlace += place;
        }
        fit.f2debug = { U, V, Lb, Wm };                     // for self-consistency checks in the console
        fS.custom = fC.custom = fSn.custom = fP.custom = true;
        E.atlas.dirty = true;
        const stats = { ms: Math.round(performance.now() - t0), umPerPx: +P.umPerPx.toFixed(2), size: P.size, placedFrac: +(placed / (w * h)).toFixed(3), meanPlace: +(sumPlace / (w * h)).toFixed(3),
            spacingMedian: +[...spS].sort((a, b) => a - b)[spS.length >> 1].toFixed(4) };
        fit.f2 = stats;
        say(`F2 placement: ${stats.umPerPx} µm/px source, spacing median ${(stats.spacingMedian * 1000).toFixed(0)} µm, ${(100 * stats.placedFrac).toFixed(0)} % of cells placed, ${stats.ms} ms`);
        return stats;
    }

    // ---------------- routed fitting (spec §23): band pyramid, gates, experts ----------------
    // Image-space Laplacian bands (photo and render share the pixel grid, as SSIM and grad do); zone gates come
    // from the coordinate map. σ = λ / 5.3 puts a Gaussian's 50 % point at wavelength λ.
    const BANDS = { B1: [0.30, 1.00], B2: [0.09, 0.30], B3: [0.03, 0.09] };   // mm of wavelength
    const LOW_MM = 1.0;
    function blurF(src, W, H, sigma) {                   // three box passes ≈ Gaussian
        if (sigma < 0.5) return Float32Array.from(src);
        const r = Math.max(1, Math.round(Math.sqrt(4 * sigma * sigma + 1) / 2));   // box radius for 3 passes
        let a = Float32Array.from(src), b = new Float32Array(W * H);
        const n = 2 * r + 1;
        for (let pass = 0; pass < 3; pass++) {
            for (let y = 0; y < H; y++) {                 // horizontal, clamped edges
                const o = y * W; let acc = 0;
                for (let k = -r; k <= r; k++) acc += a[o + Math.min(W - 1, Math.max(0, k))];
                for (let x = 0; x < W; x++) { b[o + x] = acc / n; acc += a[o + Math.min(W - 1, x + r + 1)] - a[o + Math.max(0, x - r)]; }
            }
            for (let x = 0; x < W; x++) {                 // vertical
                let acc = 0;
                for (let k = -r; k <= r; k++) acc += b[Math.min(H - 1, Math.max(0, k)) * W + x];
                for (let y = 0; y < H; y++) { a[y * W + x] = acc / n; acc += b[Math.min(H - 1, y + r + 1) * W + x] - b[Math.max(0, y - r) * W + x]; }
            }
        }
        return a;
    }
    function lumOf(pix) {
        const n = fit.W * fit.H, L = new Float32Array(n);
        for (let k = 0; k < n; k++) { const o = k * 4; L[k] = (0.299 * pix[o] + 0.587 * pix[o + 1] + 0.114 * pix[o + 2]) / 255; }
        return L;
    }
    const pxPerMmNow = () => (fit.limbus ? fit.limbus.rx / 5.85 : 40);
    // the band limits this sample can actually resolve: nothing finer than 2.5 px per cycle
    function bandSpec(name, ppm) {
        const [lo, hi] = BANDS[name], loEff = Math.max(lo, 2.5 / ppm);
        const open = loEff >= hi ? 0 : Math.min(1, Math.log(hi / loEff) / Math.log(hi / lo));
        return { lo: loEff, hi, open, sLo: loEff * ppm / 5.3, sHi: hi * ppm / 5.3 };
    }
    // one image's bands, each divided by the local low-pass so tone changes do not read as band energy
    function bandsOf(pix, names, ppm) {
        const W = fit.W, H = fit.H, L = lumOf(pix);
        const low = blurF(L, W, H, LOW_MM * ppm / 5.3);
        const cache = {}, G = sg => (cache[sg.toFixed(3)] = cache[sg.toFixed(3)] || blurF(L, W, H, sg));
        const out = { low };
        for (const nm of names) {
            const sp = bandSpec(nm, ppm);
            if (sp.open <= 0) { out[nm] = null; continue; }
            const a = G(sp.sLo), b = G(sp.sHi), B = new Float32Array(W * H);
            for (let k = 0; k < W * H; k++) B[k] = (a[k] - b[k]) / (low[k] + 0.02);
            out[nm] = B;
        }
        return out;
    }
    // photo side, computed once per alignment: bands, focus maps and gates
    function photoRoute() {
        const ppm = pxPerMmNow(), L = fit.limbus || {}, key = [fit.name, fit.W, fit.H, ppm.toFixed(3), L.x, L.y, L.ry].join('|');
        if (fit.route && fit.route.key === key) return fit.route;
        const W = fit.W, H = fit.H, mask = fit.mask || (fit.mask = irisMask());
        const names = ['B1', 'B2', 'B3'];
        const bands = bandsOf(fit.photo, names, ppm);
        const trust = fit.photoTrust === undefined ? 1 : fit.photoTrust;   // 0 for unverified samples (§23)
        const gates = {}, evidence = {}, focusMed = {};
        let nMask = 0; for (let k = 0; k < W * H; k++) nMask += mask[k] ? 1 : 0;
        const sS = 0.25 * ppm;                                            // σ ≈ 0.25 mm smoothing of the local energies
        let prevE = null;
        for (const nm of names) {
            const B = bands[nm], sp = bandSpec(nm, ppm), g = new Float32Array(W * H);
            if (!B) { gates[nm] = g; evidence[nm] = 0; focusMed[nm] = 0; prevE = null; continue; }
            const sq = new Float32Array(W * H); for (let k = 0; k < W * H; k++) sq[k] = B[k] * B[k];
            const E = blurF(sq, W, H, sS);
            let focus = null;
            if (prevE) {                                                   // B1 is treated as always in focus
                const rho = new Float32Array(W * H), vals = [];
                for (let k = 0; k < W * H; k++) { rho[k] = E[k] / (prevE[k] + 1e-6); if (mask[k]) vals.push(rho[k]); }
                vals.sort((x, y) => x - y);
                const p90 = vals.length ? vals[Math.floor(0.9 * (vals.length - 1))] : 1;
                focusMed[nm] = vals.length ? +vals[Math.floor(0.5 * (vals.length - 1))].toFixed(3) : 0;
                focus = rho.map(x => Math.min(1, x / Math.max(1e-6, p90)));
            } else focusMed[nm] = 1;
            let sum = 0;
            for (let k = 0; k < W * H; k++) { if (!mask[k]) continue; g[k] = sp.open * (focus ? focus[k] : 1) * trust; sum += g[k]; }
            gates[nm] = g; evidence[nm] = +(sum / Math.max(1, nMask)).toFixed(3);
            prevE = E;
        }
        fit.route = { key, ppm, bands, gates, evidence, focusMed, open: Object.fromEntries(names.map(nm => [nm, +bandSpec(nm, ppm).open.toFixed(3)])) };
        return fit.route;
    }
    // weighted normalised cross-correlation and RMS ratio of one band, photo vs render
    function bandCompare(P, R, g) {
        let sw = 0, sp = 0, sr = 0, spp = 0, srr = 0, spr = 0;
        for (let k = 0; k < g.length; k++) { const w = g[k]; if (!w) continue; const a = P[k], b = R[k]; sw += w; sp += w * a; sr += w * b; spp += w * a * a; srr += w * b * b; spr += w * a * b; }
        if (sw < 1e-6) return { corr: 0, ratio: 1, w: 0 };
        const mp = sp / sw, mr = sr / sw, vp = spp / sw - mp * mp, vr = srr / sw - mr * mr, cv = spr / sw - mp * mr;
        return { corr: (vp > 1e-12 && vr > 1e-12) ? cv / Math.sqrt(vp * vr) : 0, ratio: Math.sqrt(Math.max(vr, 1e-12) / Math.max(vp, 1e-12)), w: sw };
    }
    function bandScores(pix) {
        const rt = photoRoute(), R = bandsOf(pix, ['B1', 'B2', 'B3'], rt.ppm), out = {};
        for (const nm of ['B1', 'B2', 'B3']) out[nm] = rt.bands[nm] && R[nm] ? bandCompare(rt.bands[nm], R[nm], rt.gates[nm]) : { corr: 0, ratio: 1, w: 0 };
        return out;
    }
    // the experts. E0 takes every NM gene no other expert claims (tone, light, limbal tone, and the material
    // genes when the photo inversion was not used); E1 / E2 are the pose solver and the material inversion.
    // v70: an expert is either *fitted* (its layout comes from the photo — pixel losses are meaningful) or
    // *seeded* (its layout is procedural noise — only statistics can be matched; any pixel-wise term prefers less
    // of a texture sitting in the wrong places, which pinned these genes to their bounds in v68 and v69). F2 moves
    // the strands from seeded to fitted. Seeded genes are matched jointly by moments: global contrast and the
    // energy of every open band, each band weighted by its evidence (Portilla–Simoncelli, in spirit).
    //
    // The two treatments of seeded texture sit on the perception–distortion trade-off (Blau & Michaeli 2018):
    //   'pixel' (v69) — per-band correlation + amplitude; best MATCH2, but the render is flatter than reality
    //   'stats' (v70) — moments only; realistic contrast and band energy, lower MATCH2 / SSIM / grad
    // Until F2 fits the placement, neither is "right"; fit.seededLoss picks the purpose (fidelity or look).
    const EXPERTS_BY_MODE = {
        pixel: [
            { key: 'E3', band: 'B1', layout: 'fitted', genes: ['collr', 'fibreContrast'], iters: 20 },
            { key: 'E4', band: 'B2', layout: 'fitted', genes: ['strandGain', 'strandMed'], iters: 30, grad: true },
            { key: 'E5', band: 'B3', layout: 'fitted', genes: ['strandFine', 'strandSharp'], iters: 20, minEvidence: 0.2 },
        ],
        stats: [
            { key: 'E3', band: 'B1', layout: 'fitted', genes: ['collr'], iters: 20 },
            { key: 'S', layout: 'seeded', genes: ['gapShadow', 'fibreContrast', 'strandGain', 'strandMed', 'strandFine', 'strandSharp'], iters: 50 },
        ],
    };
    function lumSigma(pix) {                            // spread of luminance inside the iris mask
        const m = fit.mask || (fit.mask = irisMask());
        let s1 = 0, s2 = 0, n = 0;
        for (let k = 0; k < m.length; k += 2) { if (!m[k]) continue; const o = k * 4, l = 0.299 * pix[o] + 0.587 * pix[o + 1] + 0.114 * pix[o + 2]; s1 += l; s2 += l * l; n++; }
        return n ? Math.sqrt(Math.max(1e-6, s2 / n - (s1 / n) ** 2)) : 1;
    }
    async function routedFit(ps, pp, iters) {
        const rt = photoRoute(), log = [], sigP = lumSigma(fit.photo);
        const EXPERTS = EXPERTS_BY_MODE[fit.seededLoss] || EXPERTS_BY_MODE.pixel;
        const claimed = new Set(EXPERTS.flatMap(e => e.genes));
        const blocks = [{ key: 'E0', genes: ps.filter(p => !claimed.has(p.key)).map(p => p.key), iters: Math.round(iters * 40 / 110) }]
            .concat(EXPERTS.map(e => Object.assign({}, e, { genes: e.genes.filter(k => ps.some(p => p.key === k)), iters: Math.round(iters * e.iters / 110) })));
        let evals = 0;
        for (const blk of blocks) {
            const bp = ps.filter(p => blk.genes.includes(p.key));
            const ev = blk.band ? rt.evidence[blk.band] : 1;
            if (!bp.length || (blk.minEvidence && ev < blk.minEvidence)) { log.push({ key: blk.key, evidence: ev, skipped: true, genes: blk.genes }); say(`route ${blk.key}: skipped (evidence ${ev})`); continue; }
            const f = async (x) => {
                bp.forEach((p, i) => p.set(x[i]));
                renderFit(); evals++;
                if (blk.key === 'E0') {
                    // v68: mean profiles alone cannot see contrast, so gapShadow drifted to 1 and exposure fell to
                    // compensate. The global luminance spread inside the mask anchors it.
                    const sr = lumSigma(fit.render);
                    return profileError(pp, profiles(fit.render)) + 4 * (40 - psnr(fit.photo, fit.render, fit.mask, 3)) + 30 * Math.abs(Math.log(sr / sigP));
                }
                if (blk.layout === 'seeded') {
                    const R = bandsOf(fit.render, ['B1', 'B2', 'B3'], rt.ppm);
                    let loss = 40 * Math.abs(Math.log(lumSigma(fit.render) / sigP));
                    for (const nm of ['B1', 'B2', 'B3']) {
                        if (!rt.bands[nm] || !R[nm] || !rt.evidence[nm]) continue;
                        loss += 40 * rt.evidence[nm] * Math.abs(Math.log(bandCompare(rt.bands[nm], R[nm], rt.gates[nm]).ratio));
                    }
                    return loss;
                }
                const R = bandsOf(fit.render, [blk.band], rt.ppm)[blk.band];
                const c = R ? bandCompare(rt.bands[blk.band], R, rt.gates[blk.band]) : { corr: 0, ratio: 1 };
                // v68: correlation alone is maximised by suppressing the uncorrelated (seeded) share of a band. A
                // two-sided amplitude anchor of equal weight holds the band's energy at the photo's level, so the
                // only way left to raise the correlation is to put structure in the right place.
                const band = 40 * (1 - Math.max(0, c.corr)) + 40 * Math.abs(Math.log(c.ratio));
                if (blk.key === 'E3') return 60 * (1 - Math.max(0, heightCorrelation())) + band;
                if (blk.grad) return 60 * (1 - gradAgree(fit.photo, fit.render, fit.mask)) + band;
                return band;
            };
            const x0 = bp.map(p => p.get()), f0 = await f(x0);
            const res = await nelderMead(x0, bp.map(p => p.lo), bp.map(p => p.hi), f, blk.iters, (it, best) => { if (it % 5 === 0) say(`route ${blk.key} it ${it} · ${best.toFixed(1)} · ${evals} renders`); });
            bp.forEach((p, i) => p.set(res.x[i]));
            // a gene that ends on its bound is a symptom (v68): the loss wanted to go further than the model allows
            const atBound = bp.filter((p, i) => Math.abs(res.x[i] - p.lo) < 1e-3 * (p.hi - p.lo) || Math.abs(res.x[i] - p.hi) < 1e-3 * (p.hi - p.lo)).map(p => p.key);
            log.push({ key: blk.key, evidence: ev, loss0: +f0.toFixed(2), loss1: +res.f.toFixed(2), genes: Object.fromEntries(bp.map((p, i) => [p.key, +res.x[i].toFixed(4)])), atBound });
            say(`route ${blk.key}: ${f0.toFixed(1)} → ${res.f.toFixed(1)} (evidence ${ev})`);
        }
        fit.routeLog = log;
        return evals;
    }

    // ---------------- diagnostics (spec §22): the numbers the version archive compares ----------------
    // Everything here goes through the engine's coordinate map (unwrapRGB → getMap), so the photo and
    // the render are compared in tissue coordinates. Called once per bench case after the final score,
    // never inside the optimiser loop: the spectra cost ≈ 100 ms.
    function fftInPlace(re, im) {            // iterative radix-2, n a power of two
        const n = re.length;
        for (let i = 1, j = 0; i < n; i++) {
            let bit = n >> 1;
            for (; j & bit; bit >>= 1) j ^= bit;
            j ^= bit;
            if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
        }
        for (let len = 2; len <= n; len <<= 1) {
            const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
            for (let i = 0; i < n; i += len) {
                let cr = 1, ci = 0;
                for (let k = 0; k < len / 2; k++) {
                    const ur = re[i + k], ui = im[i + k];
                    const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
                    const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
                    re[i + k] = ur + vr; im[i + k] = ui + vi;
                    re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
                    const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
                }
            }
        }
    }
    // mean angular power spectrum of the rows in [j0, j1): row mean removed, Hann-free (the row is
    // periodic in u by construction), power normalised to unit sum over f ∈ [fLo, U/2)
    function angularSpectrum(lum, U, V, j0, j1, fLo = 8) {
        const half = U >> 1, acc = new Float64Array(half);
        const re = new Float64Array(U), im = new Float64Array(U);
        const ja = Math.max(0, Math.round(j0)), jb = Math.min(V, Math.round(j1));   // integer rows: a fractional index reads undefined
        for (let j = ja; j < jb; j++) {
            let m = 0; for (let i = 0; i < U; i++) m += lum[j * U + i]; m /= U;
            for (let i = 0; i < U; i++) { re[i] = lum[j * U + i] - m; im[i] = 0; }
            fftInPlace(re, im);
            for (let f = 0; f < half; f++) acc[f] += re[f] * re[f] + im[f] * im[f];
        }
        let sum = 0; for (let f = fLo; f < half; f++) sum += acc[f];
        const out = new Float64Array(half);
        if (sum > 0) for (let f = fLo; f < half; f++) out[f] = acc[f] / sum;
        return out;
    }
    // Natural image spectra fall as ≈ 1/f², so a plain argmax always lands on the lowest frequency
    // (that is why 06's spacing estimate only resolved the sharpest macros). Whiten first: divide the
    // power by its own ±½-octave geometric mean, which leaves local prominence, then take the peak
    // inside the band where strands can live. Parabolic refinement on the whitened curve.
    function whiten(p, fLo = 8) {
        const out = new Float64Array(p.length);
        for (let f = fLo; f < p.length; f++) {
            const a = Math.max(fLo, Math.round(f / 1.41)), b = Math.min(p.length - 1, Math.round(f * 1.41));
            let ls = 0, n = 0;
            for (let g = a; g <= b; g++) { ls += Math.log(Math.max(p[g], 1e-12)); n++; }
            out[f] = p[f] / Math.exp(ls / Math.max(1, n));
        }
        return out;
    }
    function peakIn(p, fA, fB) {              // peak of a whitened spectrum in [fA, fB], parabolic-refined
        fA = Math.max(1, Math.round(fA)); fB = Math.min(p.length - 2, Math.round(fB));
        let best = fA, bv = -1;
        for (let f = fA; f <= fB; f++) if (p[f] > bv) { bv = p[f]; best = f; }
        if (best > fA && best < fB) {
            const a = p[best - 1], b = p[best], c = p[best + 1], d = a - 2 * b + c;
            if (Math.abs(d) > 1e-12) best += Math.max(-0.5, Math.min(0.5, -0.5 * (c - a) / d));
        }
        return best;
    }
    function bandPower(p, fA, fB) {           // share of the normalised power inside [fA, fB]
        let s = 0;
        for (let f = Math.max(1, Math.round(fA)); f <= Math.min(p.length - 1, Math.round(fB)); f++) s += p[f];
        return s;
    }
    const DIAG_ZONES = [[0.05, 0.35], [0.35, 0.80], [0.80, 0.95]];   // the 06 zones: pupillary, ciliary, peripheral
    function diagnostics() {
        if (!fit.photo || !fit.render) return null;
        // U fixed and a power of two so spectra are comparable across quality modes; 2048 puts the
        // ciliary strand frequency (≈ 470 cycles/turn at 54 µm) well inside the Nyquist limit of 1024
        const U = 2048, V = Math.max(64, E.Q.proxyV);
        const rp = unwrapRGB(fit.photo, U, V), rr = unwrapRGB(fit.render, U, V);
        const Lp = new Float32Array(U * V), Lr = new Float32Array(U * V);
        for (let k = 0; k < U * V; k++) {
            const q = k * 3;
            Lp[k] = srgbToLab(rp[q], rp[q + 1], rp[q + 2])[0];
            Lr[k] = srgbToLab(rr[q], rr[q + 1], rr[q + 2])[0];
        }
        // The window must stop where the *photograph* stops. map.vmax is the largest tissue v actually
        // sampled at each angle; beyond it every unwrap is neighbour fill, and comparing fill against the
        // render's real tissue put a phantom +20…+50 L* in the outer bands (ref 35 is only photographed
        // out to v 0.74–0.88). Scalar statistics use the per-angle limit; spectra need whole rows, so they
        // use the smallest limit over all angles.
        const vmax = getMap().vmax;
        const vlim = new Float32Array(U);
        for (let i = 0; i < U; i++) vlim[i] = 0.97 * vmax[Math.min(255, Math.floor((i + 0.5) / U * 256))];
        const v0 = 0.04, v1 = Math.min(0.92, 0.97 * Math.min(...vmax));
        const jA = Math.floor(v0 * V), jB = Math.max(jA + 2, Math.ceil(v1 * V));
        const ok = (i, j) => (j + 0.5) / V <= vlim[i];        // is this cell inside the photographed tissue
        // 1. contrast deficit: σ(L*) of the render over the photo's, the largest residual term (§21.1)
        const jS = Math.floor(v0 * V), jE = Math.ceil(Math.min(0.98, Math.max(...vmax)) * V);   // scalar stats may use every photographed cell
        let mp = 0, mr = 0, n = 0;
        for (let j = jS; j < jE; j++) for (let i = 0; i < U; i++) { if (!ok(i, j)) continue; mp += Lp[j * U + i]; mr += Lr[j * U + i]; n++; }
        mp /= Math.max(1, n); mr /= Math.max(1, n);
        let sp = 0, sr = 0;
        for (let j = jS; j < jE; j++) for (let i = 0; i < U; i++) { if (!ok(i, j)) continue; const k = j * U + i; sp += (Lp[k] - mp) ** 2; sr += (Lr[k] - mr) ** 2; }
        sp = Math.sqrt(sp / Math.max(1, n)); sr = Math.sqrt(sr / Math.max(1, n));
        // 2. floors: over the photo's darkest 15 % (crypt floors, deep gaps), how much brighter the
        // render is. A percentile, not an absolute L*, so a dark brown iris and a blue one compare.
        const vals = [];
        for (let j = jS; j < jE; j++) for (let i = 0; i < U; i++) if (ok(i, j)) vals.push(Lp[j * U + i]);
        vals.sort((a, b) => a - b);
        const thrDark = vals.length ? vals[Math.floor(0.15 * vals.length)] : 25;
        let de = 0, dn = 0, dabs = 0;
        for (let j = jS; j < jE; j++) for (let i = 0; i < U; i++) { if (!ok(i, j)) continue; const k = j * U + i; if (Lp[k] <= thrDark) { de += Lr[k] - Lp[k]; dn++; } if (Lp[k] < 25) dabs++; }
        // 3. radial profile: mean ΔL* in six bands (the residual study's table, automated)
        const NB = 6, bandDL = [], bandN = [], vTop = Math.min(0.98, Math.max(...vmax));
        for (let b = 0; b < NB; b++) {
            const ja = Math.floor((v0 + (vTop - v0) * b / NB) * V), jb = Math.floor((v0 + (vTop - v0) * (b + 1) / NB) * V);
            let s = 0, c = 0;
            for (let j = ja; j < jb; j++) for (let i = 0; i < U; i++) { if (!ok(i, j)) continue; const k = j * U + i; s += Lr[k] - Lp[k]; c++; }
            bandDL.push(c ? +(s / c).toFixed(2) : null); bandN.push(c);
        }
        // 4. strand detail: agreement of the angular power spectrum per zone (histogram intersection,
        // 0..1) and the ratio of dominant strand frequencies. This is the only score that sees whether
        // the strands are the photo's *size*; SSIM at quarter/half res cannot.
        const zones = DIAG_ZONES.map(([a0, b0]) => {
            // clip the zone to the photographed rows; a zone with fewer than 4 whole rows is unresolved
            const a = a0, b = Math.min(b0, v1);
            if ((b - a) * V < 4) return { zone: [a0, b0], unphotographed: true, agree: null, hfRatio: null, spacingPhotoMm: null, spacingRenderMm: null, resolvedMm: null };
            const pp = angularSpectrum(Lp, U, V, a * V, b * V), pr2 = angularSpectrum(Lr, U, V, a * V, b * V);
            let inter = 0; for (let f = 8; f < pp.length; f++) inter += Math.min(pp[f], pr2[f]);   // 0..1 over all scales
            const rMid = 2 + 4 * (a + b) / 2, circ = 6.2831853 * rMid;           // mm at the zone's middle radius
            // The strand band is 30–90 µm (06 measured 35–70) — but only as far as the *photograph*
            // resolves. At NORMAL the fit image is 640 px wide, ≈ 27 µm per pixel, so anything finer than
            // ≈ 68 µm is past its Nyquist limit and would score aliasing as detail. Clamp the band to
            // 2.5 px per cycle and report what was resolvable, so the number means the same at every quality.
            const pxPerMm = fit.limbus ? fit.limbus.rx / 5.85 : 40;
            const fNyq = 6.2831853 * rMid * pxPerMm / 2.5;
            const fA = circ / 0.090, fB = Math.min((U >> 1) - 2, circ / 0.030, fNyq);
            const wp = whiten(pp), wr = whiten(pr2);
            const fp = peakIn(wp, fA, fB), fr = peakIn(wr, fA, fB);
            const hp = bandPower(pp, fA, fB), hr = bandPower(pr2, fA, fB);
            return { zone: [a, b], agree: +inter.toFixed(3), resolvedMm: +(circ / Math.max(1, fB)).toFixed(4), resolved: fB > fA,
                fPhoto: +fp.toFixed(1), fRender: +fr.toFixed(1),
                spacingPhotoMm: +(circ / Math.max(1, fp)).toFixed(4), spacingRenderMm: +(circ / Math.max(1, fr)).toFixed(4),
                hfPhoto: +hp.toFixed(4), hfRender: +hr.toFixed(4), hfRatio: +(hr / Math.max(1e-6, hp)).toFixed(3) };
        });
        const zOK = zones.filter(z => !z.unphotographed);
        const mean = (f2) => zOK.length ? zOK.reduce((s2, z) => s2 + f2(z), 0) / zOK.length : null;
        const d = {
            sigmaPhoto: +sp.toFixed(2), sigmaRender: +sr.toFixed(2), sigmaRatio: +(sr / Math.max(1e-6, sp)).toFixed(3),
            darkErr: dn ? +(de / dn).toFixed(2) : 0, darkThr: +thrDark.toFixed(1), darkFrac: +(dabs / n).toFixed(3),
            bandDL, bandN, bandWorst: +Math.max(...bandDL.filter(x => x !== null).map(Math.abs)).toFixed(2),
            // how much of the tissue the photograph actually shows (1.0 = out to the limbus everywhere)
            vmaxMin: +Math.min(...vmax).toFixed(3), vmaxMax: +Math.max(...vmax).toFixed(3), coverage: +(n / (U * (jE - jS))).toFixed(3),
            specAgree: zOK.length ? +mean(z => z.agree).toFixed(3) : null,
            spacingRatio: zOK.length ? +mean(z => z.spacingRenderMm / Math.max(1e-6, z.spacingPhotoMm)).toFixed(3) : null,
            // strand-scale energy: the share of angular power at 30–90 µm, render over photo. 1.0 = the
            // render carries as much strand detail as the photograph; < 1 = smooth, > 1 = noisy.
            hfRatio: zOK.length ? +mean(z => z.hfRatio).toFixed(3) : null,
            resolvedMm: zOK.length ? +mean(z => z.resolvedMm).toFixed(4) : null,
            hfPhoto: zOK.length ? +mean(z => z.hfPhoto).toFixed(4) : null,
            hfRender: zOK.length ? +mean(z => z.hfRender).toFixed(4) : null,
            zones,
        };
        fit.diag = d; return d;
    }

    // ---------------- optimiser: Nelder–Mead with bounds, async ----------------
    async function nelderMead(x0, lo, hi, f, iters, onStep) {
        const n = x0.length; const clampv = v => v.map((x, i) => Math.min(hi[i], Math.max(lo[i], x)));
        let simplex = [clampv(x0)];
        for (let i = 0; i < n; i++) { const v = x0.slice(); v[i] = Math.min(hi[i], v[i] + 0.15 * (hi[i] - lo[i])); simplex.push(clampv(v)); }
        let vals = []; for (const v of simplex) vals.push(await f(v));
        for (let it = 0; it < iters && fit.running; it++) {
            const idx = vals.map((v, i) => i).sort((a, b) => vals[a] - vals[b]);
            simplex = idx.map(i => simplex[i]); vals = idx.map(i => vals[i]);
            const c = new Array(n).fill(0); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += simplex[i][j] / n;
            const w = simplex[n];
            const xr = clampv(c.map((cj, j) => cj + (cj - w[j]))); const fr = await f(xr);
            if (fr < vals[0]) { const xe = clampv(c.map((cj, j) => cj + 2 * (cj - w[j]))); const fe = await f(xe); if (fe < fr) { simplex[n] = xe; vals[n] = fe; } else { simplex[n] = xr; vals[n] = fr; } }
            else if (fr < vals[n - 1]) { simplex[n] = xr; vals[n] = fr; }
            else { const xc = clampv(c.map((cj, j) => cj + 0.5 * (w[j] - cj))); const fc = await f(xc); if (fc < vals[n]) { simplex[n] = xc; vals[n] = fc; } else { for (let i = 1; i <= n; i++) { simplex[i] = clampv(simplex[i].map((x, j) => simplex[0][j] + 0.5 * (x - simplex[0][j]))); vals[i] = await f(simplex[i]); } } }
            if (onStep) onStep(it, Math.min(...vals));
            await yieldNow();
        }
        const best = vals.indexOf(Math.min(...vals)); return { x: simplex[best], f: vals[best] };
    }

    // global genes: colour and zones, fitted to the radial L*a*b* profiles + a weak pixel term
    const GLOBAL_PARAMS = [
        { key: 'pigment', lo: 0, hi: 5, get: () => state.pigment, set: v => { state.pigment = target.pigment = v; E.atlas.dirty = true; } },
        { key: 'stroma', lo: 0.05, hi: 0.4, get: () => state.stroma, set: v => { state.stroma = target.stroma = v; E.atlas.dirty = true; } },
        { key: 'pheo', lo: 0, hi: 1, get: () => state.pheo, set: v => { state.pheo = target.pheo = v; E.atlas.dirty = true; } },
        { key: 'mie', lo: 0, hi: 1, get: () => state.mie, set: v => { state.mie = target.mie = v; } },
        { key: 'yellow', lo: 0, hi: 2.5, get: () => state.yellow, set: v => { state.yellow = target.yellow = v; E.atlas.dirty = true; } },
        { key: 'ring', lo: 0, hi: 2.5, get: () => state.ring, set: v => { state.ring = target.ring = v; } },
        { key: 'ringR', lo: 0.2, hi: 0.6, get: () => state.ringR, set: v => { state.ringR = v; } },
        { key: 'limbalDark', lo: 0, hi: 1, get: () => E.genome.globals.limbalDark, set: v => { E.genome.globals.limbalDark = v; state.limbalDark = v; E.atlas.dirty = true; } },
        { key: 'limbalWidth', lo: 0.04, hi: 0.35, get: () => E.genome.globals.limbalWidth, set: v => { E.genome.globals.limbalWidth = v; E.atlas.dirty = true; } },
        { key: 'gapMelMul', lo: 0.5, hi: 3.0, get: () => (E.genome.globals.gapMelMul === undefined ? 1.2 : E.genome.globals.gapMelMul), set: v => { E.genome.globals.gapMelMul = v; E.atlas.dirty = true; } },
        { key: 'gapStromaMul', lo: 0.05, hi: 0.9, get: () => (E.genome.globals.gapStromaMul === undefined ? 0.35 : E.genome.globals.gapStromaMul), set: v => { E.genome.globals.gapStromaMul = v; E.atlas.dirty = true; } },
        { key: 'strandGain', lo: 1.5, hi: 5.0, get: () => (E.genome.globals.strandGain === undefined ? 3.2 : E.genome.globals.strandGain), set: v => { E.genome.globals.strandGain = v; E.atlas.dirty = true; } },
        { key: 'limbalMilk', lo: 0, hi: 1, get: () => (E.genome.globals.limbalMilk === undefined ? 0.6 : E.genome.globals.limbalMilk), set: v => { E.genome.globals.limbalMilk = v; } },
        { key: 'pupZoneMel', lo: 0.6, hi: 2.0, get: () => E.genome.globals.pupZoneMel, set: v => { E.genome.globals.pupZoneMel = v; E.atlas.dirty = true; } },
        { key: 'collr', lo: 0.15, hi: 0.6, get: () => state.collr, set: v => { state.collr = target.collr = v; E.atlas.dirty = true; } },
        { key: 'fibreContrast', lo: 0.2, hi: 1.0, get: () => E.genome.globals.fibreContrast, set: v => { E.genome.globals.fibreContrast = v; E.atlas.dirty = true; } },
        // §22 F0: the strand-contrast genes the spectrum diagnostic measures. strandFine / strandMed move
        // energy between the 0.5 / 0.16 / 0.055 mm scales, strandSharp narrows the coverage transfer,
        // gapShadow is the contact shadow in the gaps (a shading gene, so no rebake).
        { key: 'strandMed', lo: 0.05, hi: 0.55, get: () => (E.genome.globals.strandMed === undefined ? 0.28 : E.genome.globals.strandMed), set: v => { E.genome.globals.strandMed = v; E.atlas.dirty = true; } },
        { key: 'strandFine', lo: 0.05, hi: 0.60, get: () => (E.genome.globals.strandFine === undefined ? 0.17 : E.genome.globals.strandFine), set: v => { E.genome.globals.strandFine = v; E.atlas.dirty = true; } },
        { key: 'strandSharp', lo: 0, hi: 1, get: () => (E.genome.globals.strandSharp === undefined ? 0 : E.genome.globals.strandSharp), set: v => { E.genome.globals.strandSharp = v; E.atlas.dirty = true; } },
        { key: 'gapShadow', lo: 0.35, hi: 1.0, get: () => (E.genome.globals.gapShadow === undefined ? 0.8 : E.genome.globals.gapShadow), set: v => { E.genome.globals.gapShadow = v; } },
        { key: 'rimSharp', lo: 0, hi: 1, get: () => (E.genome.globals.rimSharp === undefined ? 0.6 : E.genome.globals.rimSharp), set: v => { E.genome.globals.rimSharp = v; E.atlas.dirty = true; } },
        { key: 'ev', lo: -2, hi: 2, get: () => state.ev, set: v => { state.ev = target.ev = v; } },
        { key: 'ambient', lo: 0, hi: 1, get: () => state.ambient, set: v => { state.ambient = target.ambient = v; } },
        { key: 'lid', lo: 2, hi: 8, get: () => state.lid, set: v => { state.lid = target.lid = v; } },
    ];
    // robust (Huber-like) profile error with luminance and chroma weighted equally, so a few bad bins
    // (the limbus, a crypt-heavy band) cannot drive the fit into the dark-brown corner
    function profileError(pp, pr) {
        const hub = d => { const a = Math.abs(d); return a < 8 ? d * d : 16 * a - 64; };
        let e = 0; for (let i = 0; i < pp.length; i++) { const w = 1 + (i < 6 ? 0.5 : 0); e += w * (hub(pp[i][0] - pr[i][0]) + hub(pp[i][1] - pr[i][1]) + hub(pp[i][2] - pr[i][2])); }
        return e / pp.length;
    }
    // evaluate the ten presets (and the current genes) at the solved pose and keep the best as the start
    // A fresh fit must not depend on what ran before it (v74 rerun: the same bench after a different previous
    // bench moved one eye by 4 MATCH2). So every fresh fit starts from one canonical genome — seed 42, the page's
    // default — and one canonical set of gene values; 'current' is a start candidate only when asked for.
    const FIT_START = { ev: 0, ambient: 0.35, lid: 6, mie: 0.25, ring: 0, ringR: 0.38, limbalDark: 0.65, limbalWidth: 0.12,
        limbalMilk: 0.6, gapMelMul: 1.2, gapStromaMul: 0.35, strandGain: 3.2, pupZoneMel: 1.4, collr: 0.33, fibreContrast: 0.8,
        rimSharp: 0.6, strandMed: 0.28, strandFine: 0.17, strandSharp: 0, gapShadow: 0.8 };
    // ... and state must not leak either (v76 reversed: 25 moved 3.8 MATCH2 with only the genome reset). The
    // page-load state is the canonical one; every bench case restores it before loading its photo. Runtime flags
    // and the pointer are not part of it.
    // v76 leak hunt (§24.1): the reset must be complete and atomic — every key, including ones that were null at
    // page load (state.preset), deleting keys added since (a leftover target.ringR pulled state.ringR through the
    // smoothing loop while the next photo loaded), and genes synced into genome.globals at once (state and genome
    // hold two copies, and which one won depended on whether a bake had happened yet).
    const RUNTIME_KEYS = new Set(['fitting', 'capturing', 'design', 'paused', 'frameCount', 'mouseX', 'mouseY']);
    const clone = v => (v === null || typeof v !== 'object') ? v : JSON.parse(JSON.stringify(v));
    const snapKeys = obj => Object.fromEntries(Object.keys(obj).filter(k => !RUNTIME_KEYS.has(k) && typeof obj[k] !== 'function').map(k => [k, clone(obj[k])]));
    const STATE0 = snapKeys(state), TARGET0 = snapKeys(target);
    function restoreInto(obj, snap) {
        for (const k of Object.keys(obj)) if (!RUNTIME_KEYS.has(k) && typeof obj[k] !== 'function' && !(k in snap)) delete obj[k];
        for (const [k, v] of Object.entries(snap)) obj[k] = clone(v);
    }
    function resetForFreshFit() {
        restoreInto(state, STATE0); restoreInto(target, TARGET0);
        canonicalStart();
        for (const k of Object.keys(target)) if (k in state && !RUNTIME_KEYS.has(k)) target[k] = clone(state[k]);   // nothing left to smooth toward
        E.applySlidersToGenome();                                                                                  // one source of truth for the genes
        fit.map = null; fit.proxy = null; fit.route = null; fit.mask = null; fit.pose = null;
    }
    function canonicalStart() {
        E.genome = E.genomeFromSeed(42);
        state.seed = target.seed = 42;
        for (const p of GLOBAL_PARAMS) if (FIT_START[p.key] !== undefined) p.set(FIT_START[p.key]);
        E.atlas.dirty = true;
    }
    function bestPresetStart(pp, fromCurrent = false) {
        const snapshot = GLOBAL_PARAMS.map(p => p.get());
        let best = { err: Infinity, name: 'current', x: snapshot };
        const evalNow = (name) => { renderFit(); const err = profileError(pp, profiles(fit.render)); if (err < best.err) best = { err, name, x: GLOBAL_PARAMS.map(p => p.get()) }; };
        if (fromCurrent) evalNow('current'); else canonicalStart();
        for (const name of Object.keys(E.EYE_PRESETS)) { E.loadEyePreset(name); state.ev = target.ev = 0; state.lid = target.lid = 6; evalNow(name); }
        GLOBAL_PARAMS.forEach((p, i) => p.set(best.x[i]));
        say('start from ' + best.name + ' (profile err ' + best.err.toFixed(1) + ')');
        return best;
    }
    // Photo → material fields (07 §3, zone level): the ridge and gap Lab of each zone (06 method) are
    // inverted through the spectral LUT into strand and gap materials and written as radial custom
    // fields. Deterministic: no optimiser can wander into the wrong hue from here.
    // The photo is a radiance, the LUT an albedo: the ring-flash macros are close to albedo × 1, and
    // EV in the global fit absorbs the rest.
    function materialFromPhoto(iterations = 6) {
        const NB = 8; const stats = bandStats(fit.photo, NB);   // 8 radial bands: the radial colour layout
        const g = E.genome, [w, h] = E.GRIDS.c;
        const zonesV = stats.map(z => z.v);
        const lerpZone = (arr, key, v) => {   // piecewise-linear across the band centres
            if (v <= zonesV[0]) return arr[0][key]; if (v >= zonesV[NB - 1]) return arr[NB - 1][key];
            let k = 0; while (k < NB - 2 && v > zonesV[k + 1]) k++;
            const t = (v - zonesV[k]) / (zonesV[k + 1] - zonesV[k]);
            return arr[k][key] + (arr[k + 1][key] - arr[k][key]) * t;
        };
        // targets start as the photo's ridge / gap Lab per zone; each pass renders with the inverted
        // materials, measures the render the same way, and moves the target by the residual — so the
        // exposure, the ambient term and the filmic curve are absorbed by the loop, not modelled
        const tS = stats.map(z => z.ridge.slice()), tG = stats.map(z => z.gap.slice());
        let strand = null, gap = null, last = null;
        // a defined lighting state: the loop absorbs it, the global fit may move it afterwards
        state.ev = target.ev = 0; state.ambient = target.ambient = 0.35; state.lid = target.lid = 6; state.bloom = target.bloom = 0; state.sat = 1.0;
        // the limbal darkening gene reaches inward to 1 − limbalWidth (up to 65 % radius): with the
        // material fitted per cell the periphery colour lives in the fields, so the gene starts at 0
        g.globals.limbalDark = 0; state.limbalDark = 0;
        const yOf = L => Math.pow((L + 16) / 116, 3);   // relative luminance from L*
        for (let it = 0; it < iterations; it++) {
            strand = tS.map(t => E.invertLut(t[0], t[1], t[2], { wL: 0.6 }));
            gap = tG.map(t => E.invertLut(t[0], t[1], t[2], { wL: 0.6 }));
            if (strand.some(x => !x) || gap.some(x => !x)) { say('LUT not ready'); return false; }
            // a target the LUT cannot reach (ΔE > 8 to its nearest entry) stops moving in that direction
            for (let z = 0; z < NB; z++) { if (strand[z].dE > 8) tS[z] = strand[z].lab.slice(); if (gap[z].dE > 8) tG[z] = gap[z].lab.slice(); }
            for (const [name, src, key] of [['melanin', strand, 'melanin'], ['stroma', strand, 'stroma'], ['pheo', strand, 'pheo'], ['yellow', strand, 'yellow'], ['gapMelanin', gap, 'melanin'], ['gapStroma', gap, 'stroma']]) {
                const f = g.fields[name]; f.custom = true;
                for (let j = 0; j < h; j++) { const v = (j + 0.5) / h, val = lerpZone(src, key, v); for (let i = 0; i < w; i++) f.data[j * w + i] = val; }
            }
            E.atlas.dirty = true; renderFit();
            let rs = bandStats(fit.render, NB);
            // luminance gain first: one EV step so the mid-band ridge luminance matches, then re-render
            const gain = yOf(stats[4].ridge[0]) / Math.max(1e-4, yOf(rs[4].ridge[0]));
            state.ev = target.ev = Math.max(-3, Math.min(3, state.ev + Math.log2(Math.max(0.25, Math.min(4, gain)))));
            renderFit(); rs = bandStats(fit.render, NB);
            // chroma gain: processed photos carry more saturation than the physical model can reach; the
            // ratio of the photo's to the render's mean chroma over the mid bands (ridges and gaps) sets a
            // camera-side gain, like EV for the exposure — hue stays with the material
            { let cp = 0, cr = 0; for (let z = 1; z < NB - 1; z++) { cp += Math.hypot(stats[z].ridge[1], stats[z].ridge[2]) + Math.hypot(stats[z].gap[1], stats[z].gap[2]); cr += Math.hypot(rs[z].ridge[1], rs[z].ridge[2]) + Math.hypot(rs[z].gap[1], rs[z].gap[2]); }
              const ratio = Math.max(0.5, Math.min(2, cp / Math.max(1, cr))); state.sat = Math.max(0.8, Math.min(2.2, state.sat * Math.pow(ratio, 0.7))); }
            renderFit(); rs = bandStats(fit.render, NB); last = rs;
            for (let z = 0; z < NB; z++) for (let c = 0; c < 3; c++) {
                tS[z][c] += 0.6 * (stats[z].ridge[c] - rs[z].ridge[c]);
                tG[z][c] += 0.6 * (stats[z].gap[c] - rs[z].gap[c]);
            }
        }
        // ---- per cell (§19 Phase B): the band targets become per-cell targets, so colour and level vary
        // around the ring (amber-ring boundary, sectoral patches, crypt clusters). Each pass inverts every
        // cell (cached by Lab rounded to 1 unit), renders, measures the render per cell and moves the
        // targets by the residual; the EV from the band loop stays.
        const cache = new Map();
        const inv = (L, a, b2) => { const key = ((Math.round(L) + 300) * 1000 + (Math.round(a) + 300)) * 1000 + (Math.round(b2) + 300); let r = cache.get(key); if (!r) { r = E.invertLut(L, a, b2, { wL: 0.6 }); cache.set(key, r); } return r; };
        const pc = cellStats(fit.photo), n = w * h, photoRidge = stats.map(z => z.ridge), photoGap = stats.map(z => z.gap);
        const tCS = new Float32Array(n * 3), tCG = new Float32Array(n * 3);
        for (let j = 0; j < h; j++) { const v = (j + 0.5) / h; for (let i = 0; i < w; i++) { const c = j * w + i; for (let t = 0; t < 3; t++) { tCS[c * 3 + t] = pc.ridge[c * 3 + t] + lerpZone(tS, t, v) - lerpZone(photoRidge, t, v); tCG[c * 3 + t] = pc.gap[c * 3 + t] + lerpZone(tG, t, v) - lerpZone(photoGap, t, v); } } }
        // rows inside the ruff (v < 0.05) and beyond the unwrap (v > 0.95) are shaded by their own terms
        // (ruff colour, limbal milk), so the loop leaves them out and copies the nearest row
        const jLo = Math.ceil(0.05 * h), jHi = Math.floor(0.95 * h) - 1;
        const rowOf = j => Math.min(jHi, Math.max(jLo, j));
        const smoothField = f => { const d = f.data, t = new Float32Array(n); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { let s2 = 0, cnt = 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const jj = Math.min(h - 1, Math.max(0, j + dj)), ii = (i + di + w) % w, wgt = (di === 0 && dj === 0) ? 2 : 1; s2 += wgt * d[jj * w + ii]; cnt += wgt; } t[j * w + i] = s2 / cnt; } d.set(t); };
        let cellRes = 0;
        for (let pass = 0; pass < 3; pass++) {
            for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
                const c = j * w + i, cs = rowOf(j) * w + i;
                const sM = inv(tCS[cs * 3], tCS[cs * 3 + 1], tCS[cs * 3 + 2]), gM = inv(tCG[cs * 3], tCG[cs * 3 + 1], tCG[cs * 3 + 2]);
                if (sM.dE > 8) tCS.set(sM.lab, cs * 3); if (gM.dE > 8) tCG.set(gM.lab, cs * 3);
                g.fields.melanin.data[c] = sM.melanin; g.fields.stroma.data[c] = sM.stroma; g.fields.pheo.data[c] = sM.pheo; g.fields.yellow.data[c] = sM.yellow;
                g.fields.gapMelanin.data[c] = gM.melanin; g.fields.gapStroma.data[c] = gM.stroma;
            }
            // the inversion is nearest-entry (discrete): a centre-weighted 3×3 smooth removes the cell steps
            for (const name of ['melanin', 'stroma', 'pheo', 'yellow', 'gapMelanin', 'gapStroma']) smoothField(g.fields[name]);
            E.atlas.dirty = true; renderFit();
            const rc = cellStats(fit.render); cellRes = 0; let cnt = 0;
            for (let j = jLo; j <= jHi; j++) for (let i = 0; i < w; i++) { const c = j * w + i; cellRes += Math.hypot(pc.ridge[c * 3] - rc.ridge[c * 3], pc.ridge[c * 3 + 1] - rc.ridge[c * 3 + 1], pc.ridge[c * 3 + 2] - rc.ridge[c * 3 + 2]); cnt++; }
            cellRes /= Math.max(1, cnt);
            if (pass === 2) break;
            const step = d => Math.max(-8, Math.min(8, 0.6 * d));   // bounded moves: a cell with few samples cannot run away
            for (let c = 0; c < n * 3; c++) { tCS[c] += step(pc.ridge[c] - rc.ridge[c]); tCG[c] += step(pc.gap[c] - rc.gap[c]); }
        }
        say(`material per cell: ${cache.size} unique inversions · mean strand ΔE per cell ${cellRes.toFixed(1)}`);
        // the sliders mirror the ciliary strand values so the panel stays truthful
        const m = 4;
        E.setSlider('pigment', 'pigment', strand[m].melanin); E.setSlider('stroma', 'stroma', strand[m].stroma, 3); E.setSlider('pheo', 'pheo', strand[m].pheo); E.setSlider('yellow', 'yellow', strand[m].yellow);
        g.globals.melanin = strand[m].melanin; g.globals.stroma = strand[m].stroma; g.globals.pheo = strand[m].pheo; g.globals.yellow = strand[m].yellow;
        // the fit references the global sliders modify against (§19.9); the layer blends start fully fitted
        g.fitted = Object.assign(g.fitted || {}, { melanin: strand[m].melanin, stroma: strand[m].stroma, pheo: strand[m].pheo, yellow: strand[m].yellow, crypt: state.crypt, furrowDepth: g.globals.furrowDepth });
        g.blend = { colour: 1, relief: 1, flow: 1 }; state.blColour = target.blColour = 1; state.blRelief = target.blRelief = 1; state.blFlow = target.blFlow = 1; E.setSlider('blcol', 'blColour', 1); E.setSlider('blrel', 'blRelief', 1); E.setSlider('blflow', 'blFlow', 1);
        E.atlas.dirty = true;
        say(`material from photo (8 bands): mid strand Lab ${stats[m].ridge.map(x => x.toFixed(0))} rendered ${last[m].ridge.map(x => x.toFixed(0))} → mel ${strand[m].melanin.toFixed(2)} stroma ${strand[m].stroma.toFixed(2)} pheo ${strand[m].pheo.toFixed(2)} yellow ${strand[m].yellow.toFixed(2)} · gap Lab ${stats[m].gap.map(x => x.toFixed(0))} rendered ${last[m].gap.map(x => x.toFixed(0))} · EV ${state.ev.toFixed(2)} sat ${state.sat.toFixed(2)}`);
        return true;
    }
    // Height field from the photo (07 §3, amended: the relief is one topology — collarette frill,
    // bundle ridges, crypt pits, furrow grooves). Under a frontal ring flash the low-frequency
    // luminance, with the radial albedo trend divided out, follows the surface orientation:
    // brighter = raised, darker = recessed. Written to the `height` control field (±0.1 mm).
    function heightFromPhoto(amplitude = 0.08) {
        const { data, U, V } = unwrap(fit.photo, E.Q.proxyU, E.Q.proxyV);
        const [w, h] = E.GRIDS.c, g = E.genome;
        // 2-D band-pass in mm (§19 Phase B): the ≈ 0.1 mm local mean against a ≈ 1 mm neighbourhood that
        // is isotropic in both axes, so concentric features (collarette lip, furrow ridges, dark rings)
        // become relief as much as radial bundles do. Scales above 1 mm are zone brightness, not height.
        const small = blurPolar(data, U, V, 4, 1), large = blurPolar(data, U, V, 40, 24);
        const f = g.fields.height; f.custom = true;
        const cu = U / w, cv = V / h;                                              // texels per cell (any grid / proxy pair)
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
            let s2 = 0, n = 0;
            for (let jj = Math.floor(j * cv); jj < Math.min(V, Math.floor((j + 1) * cv)); jj++) for (let ii = Math.floor(i * cu); ii < Math.min(U, Math.floor((i + 1) * cu)); ii++) { const k = jj * U + ii; s2 += small[k] / Math.max(0.03, large[k]); n++; }
            f.data[j * w + i] = Math.max(-1, Math.min(1, (s2 / Math.max(1, n) - 1.0) * 1.2)) * amplitude;
        }
        // smooth once (3×3) so the relief has no cell edges
        const tmp = new Float32Array(w * h);
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { let s2 = 0, n = 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const jj = Math.min(h - 1, Math.max(0, j + dj)), ii = (i + di + w) % w; s2 += f.data[jj * w + ii]; n++; } tmp[j * w + i] = s2 / n; }
        f.data.set(tmp);
        E.atlas.dirty = true;
        say('height field from photo: ±' + amplitude.toFixed(2) + ' mm relief, 2-D band-pass 0.1 / 1 mm');
        return true;
    }
    // Flow fields from the photo (07 §3): on the 256×64 flow grid —
    //   strandBright: band-scale luminance with the radial trend divided out (where the bright bundles are),
    //   flowDir / coherence: structure tensor orientation and anisotropy of the fine gradients.
    function flowFromPhoto() {
        const { data, U, V } = unwrap(fit.photo, E.Q.proxyU, E.Q.proxyV);
        const [w, h] = E.GRIDS.f, g = E.genome;
        const trend = new Float32Array(V); let gmean = 0; for (let j = 0; j < V; j++) { let s2 = 0; for (let i = 0; i < U; i++) s2 += data[j * U + i]; trend[j] = s2 / U; gmean += trend[j] / V; }
        // keep half of the radial trend in the brightness field: the zones' brightness layout is
        // structure too (the material zones carry the colour, this carries where it is bright)
        for (let j = 0; j < V; j++) trend[j] = Math.sqrt(Math.max(0.03, trend[j]) * Math.max(0.03, gmean));
        // gradients in mm units (u step = 2π r / U, v step = 4 / V)
        const gx = new Float32Array(U * V), gy = new Float32Array(U * V);
        for (let j = 1; j < V - 1; j++) { const r = 2 + 4 * (j + 0.5) / V, du = 6.2831853 * r / U, dv = 4 / V; for (let i = 0; i < U; i++) { const ip = (i + 1) % U, im = (i - 1 + U) % U; gx[j * U + i] = (data[j * U + ip] - data[j * U + im]) / (2 * du); gy[j * U + i] = (data[(j + 1) * U + i] - data[(j - 1) * U + i]) / (2 * dv); } }
        const fb = g.fields.strandBright, fd = g.fields.flowDir, fc = g.fields.coherence;
        fb.custom = true; fd.custom = true; fc.custom = true;
        const cu = U / w, cv = V / h;   // 4 × 2 texels per flow cell
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
            let sL = 0, n = 0, jxx = 0, jyy = 0, jxy = 0;
            for (let jj = Math.floor(j * cv) - 2; jj < Math.floor(j * cv) + cv + 2; jj++) for (let ii = Math.floor(i * cu) - 4; ii < Math.floor(i * cu) + cu + 4; ii++) {
                const jc = Math.min(V - 1, Math.max(0, jj)), ic = (ii + U) % U, k = jc * U + ic;
                if (jj >= Math.floor(j * cv) && jj < Math.floor(j * cv) + cv && ii >= Math.floor(i * cu) && ii < Math.floor(i * cu) + cu) { sL += data[k] / Math.max(0.03, trend[jc]); n++; }
                jxx += gx[k] * gx[k]; jyy += gy[k] * gy[k]; jxy += gx[k] * gy[k];
            }
            const rel = sL / n;                                  // 1 = the row mean
            fb.data[j * w + i] = Math.max(0.15, Math.min(2.0, 0.35 + 0.65 * rel * rel));   // normalised per material cell below
            // structure tensor: dominant orientation of the *gradient* is across the strands, so the
            // strand direction is perpendicular; measure the angle from the radial (+v) direction
            const ang = 0.5 * Math.atan2(2 * jxy, jxx - jyy);   // gradient orientation
            let dir = ang + Math.PI / 2 - Math.PI / 2;           // gradient ⟂ strand; radial = +v = +y axis in (gx, gy)
            // strand direction angle from +v: gradient along +u (x) means strands along v → dir 0
            let dev = Math.atan2(Math.sin(ang), Math.cos(ang));  // gradient angle from +x
            dev = dev;                                           // strands ⟂ gradient: deviation from radial = gradient angle from +x
            while (dev > Math.PI / 2) dev -= Math.PI; while (dev < -Math.PI / 2) dev += Math.PI;
            const l1 = 0.5 * (jxx + jyy + Math.hypot(jxx - jyy, 2 * jxy)), l2 = 0.5 * (jxx + jyy - Math.hypot(jxx - jyy, 2 * jxy));
            const coh = (l1 + l2) > 1e-9 ? (l1 - l2) / (l1 + l2) : 0;
            fd.data[j * w + i] = Math.max(-1.05, Math.min(1.05, -dev * Math.min(1, coh * 2)));   // uncertain cells fall back to radial
            fc.data[j * w + i] = Math.max(0.3, Math.min(1, 0.4 + 0.6 * coh));
        }
        // the brightness field carries sub-cell lightness only (§19 Phase B): the per-cell material
        // carries the level, so each 2×2 block of flow cells is normalised to mean 1 — no degeneracy
        // between the two, and the material loop cannot be pushed to the LUT's bright edge
        { const [cw, ch] = E.GRIDS.c, bu = w / cw, bv = h / ch;
          for (let cj = 0; cj < ch; cj++) for (let ci = 0; ci < cw; ci++) { let s2 = 0, cnt = 0; for (let jj = cj * bv; jj < (cj + 1) * bv; jj++) for (let ii = ci * bu; ii < (ci + 1) * bu; ii++) { s2 += fb.data[jj * w + ii]; cnt++; } const m = Math.max(0.05, s2 / cnt); for (let jj = cj * bv; jj < (cj + 1) * bv; jj++) for (let ii = ci * bu; ii < (ci + 1) * bu; ii++) fb.data[jj * w + ii] = Math.max(0.4, Math.min(1.6, fb.data[jj * w + ii] / m)); } }
        E.atlas.dirty = true;
        say('flow fields from photo: strand brightness (sub-cell, mean 1 per material cell), direction and coherence on the 256×64 grid');
        return true;
    }
    // per-cell ridge / gap Lab on the 128×32 material grid (§19 Phase B): local maxima / minima along u
    // against a local mean (≈ 0.4 mm), so the classification holds inside dark rings and bright zones;
    // empty cells take their row's mean; a centre-weighted 3×3 smooth (circular in u) removes cell noise
    function cellStats(pix) {
        const U = E.Q.proxyU, V = E.Q.proxyV, [w, h] = E.GRIDS.c, cu = U / w, cv = V / h;
        const rgb = unwrapRGB(pix, U, V);
        const lum = new Float32Array(U * V), lab = new Float32Array(U * V * 3);
        for (let k = 0; k < U * V; k++) { const q = k * 3; lum[k] = (0.299 * rgb[q] + 0.587 * rgb[q + 1] + 0.114 * rgb[q + 2]) / 255; const l = srgbToLab(rgb[q], rgb[q + 1], rgb[q + 2]); lab[q] = l[0]; lab[q + 1] = l[1]; lab[q + 2] = l[2]; }
        const loc = blurPolar(lum, U, V, Math.round(12 * U / 1024), Math.max(1, Math.round(2 * V / 128)));
        const ridge = new Float32Array(w * h * 3), gap = new Float32Array(w * h * 3), nr = new Uint16Array(w * h), ng = new Uint16Array(w * h);
        for (let j = 0; j < V; j++) {
            const cj = Math.min(h - 1, Math.floor(j / cv));
            for (let i = 0; i < U; i++) {
                const k = j * U + i, v = lum[k], m = loc[k], vl = lum[j * U + ((i - 1 + U) % U)], vr = lum[j * U + ((i + 1) % U)], c = cj * w + Math.floor(i / cu), q = k * 3;
                if (v > vl && v > vr && v > m) { ridge[c * 3] += lab[q]; ridge[c * 3 + 1] += lab[q + 1]; ridge[c * 3 + 2] += lab[q + 2]; nr[c]++; }
                if (v < vl && v < vr && v < m) { gap[c * 3] += lab[q]; gap[c * 3 + 1] += lab[q + 1]; gap[c * 3 + 2] += lab[q + 2]; ng[c]++; }
            }
        }
        const fin = (acc, n) => {
            const out = new Float32Array(w * h * 3);
            for (let j = 0; j < h; j++) {
                const rowS = [0, 0, 0]; let rn = 0;
                for (let i = 0; i < w; i++) { const c = j * w + i; if (n[c]) { for (let t = 0; t < 3; t++) rowS[t] += acc[c * 3 + t] / n[c]; rn++; } }
                for (let i = 0; i < w; i++) { const c = j * w + i; for (let t = 0; t < 3; t++) out[c * 3 + t] = n[c] ? acc[c * 3 + t] / n[c] : (rn ? rowS[t] / rn : 50); }
            }
            const sm = new Float32Array(w * h * 3);
            for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) for (let t = 0; t < 3; t++) { let s2 = 0, cnt = 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const jj = Math.min(h - 1, Math.max(0, j + dj)), ii = (i + di + w) % w, wgt = (di === 0 && dj === 0) ? 2 : 1; s2 += wgt * out[(jj * w + ii) * 3 + t]; cnt += wgt; } sm[(j * w + i) * 3 + t] = s2 / cnt; }
            return sm;
        };
        return { ridge: fin(ridge, nr), gap: fin(gap, ng), w, h };
    }
    // ridge / gap Lab per radial band (N bands from v 0.05 to 0.95), the 06 method
    function bandStats(pix, N = 8) {
        const U = 1024, V = 128; const rgb = unwrapRGB(pix, U, V);
        const lum = new Float32Array(U * V), lab = new Float32Array(U * V * 3);
        for (let k = 0; k < U * V; k++) { const q = k * 3; lum[k] = (0.299 * rgb[q] + 0.587 * rgb[q + 1] + 0.114 * rgb[q + 2]) / 255; const l = srgbToLab(rgb[q], rgb[q + 1], rgb[q + 2]); lab[q] = l[0]; lab[q + 1] = l[1]; lab[q + 2] = l[2]; }
        const out = [];
        for (let b = 0; b < N; b++) {
            const v0 = 0.05 + 0.9 * b / N, v1 = 0.05 + 0.9 * (b + 1) / N, j0 = Math.floor(v0 * V), j1 = Math.max(j0 + 1, Math.floor(v1 * V));
            let ridge = [0, 0, 0], gap = [0, 0, 0], nr = 0, ng = 0;
            for (let j = j0; j < j1; j++) { let m = 0; for (let i = 0; i < U; i++) m += lum[j * U + i]; m /= U;
                for (let i = 1; i < U - 1; i++) { const v = lum[j * U + i], q = (j * U + i) * 3; if (v > lum[j * U + i - 1] && v > lum[j * U + i + 1] && v > m) { ridge[0] += lab[q]; ridge[1] += lab[q + 1]; ridge[2] += lab[q + 2]; nr++; } if (v < lum[j * U + i - 1] && v < lum[j * U + i + 1] && v < m) { gap[0] += lab[q]; gap[1] += lab[q + 1]; gap[2] += lab[q + 2]; ng++; } } }
            out.push({ v: (v0 + v1) / 2, ridge: ridge.map(x => x / Math.max(1, nr)), gap: gap.map(x => x / Math.max(1, ng)) });
        }
        return out;
    }
    // ---------------- ridge list (§19.3 C2) ----------------
    // minimal-cost closed path over u through a strength map (U × V): DP over two turns for closure,
    // smoothness λ per row step; returns v per column (cell centres) and the strength along the path
    function dpClosedPath(str, U, V, jmin, jmax, lam) {
        const span = 2 * U, cost = new Float32Array(span * V).fill(1e9), from = new Int16Array(span * V);
        for (let j = jmin; j < jmax; j++) cost[j] = -str[j * U];
        for (let ii = 1; ii < span; ii++) { const i = ii % U; for (let j = jmin; j < jmax; j++) { let best = 1e9, bj = j; for (let dj = -2; dj <= 2; dj++) { const pj = j + dj; if (pj < jmin || pj >= jmax) continue; const c = cost[(ii - 1) * V + pj] + lam * dj * dj; if (c < best) { best = c; bj = pj; } } cost[ii * V + j] = best - str[j * U + i]; from[ii * V + j] = bj; } }
        let endJ = jmin, endC = 1e9; for (let j = jmin; j < jmax; j++) if (cost[(span - 1) * V + j] < endC) { endC = cost[(span - 1) * V + j]; endJ = j; }
        const path = new Float32Array(U), along = new Float32Array(U); let j = endJ;
        for (let ii = span - 1; ii >= U; ii--) { if (ii < 2 * U) { path[ii % U] = (j + 0.5) / V; along[ii % U] = str[j * U + (ii % U)]; } j = from[ii * V + j]; }
        return { path, along };
    }
    // successive DP ridge paths on the height proxy: find the strongest closed ridge, suppress it, search
    // again; then the same on the negated proxy for troughs (contraction furrows). Each ridge: 36 spline
    // points (u, v), per-point weight (local strength / mean, so a ridge that exists only over part of the
    // ring fades out there), height (mm, signed), width (v units, 1/e of the Gaussian profile), asym 0.
    function ridgesFromProxy(maxRidges = 6, maxTroughs = 3) {
        const P = heightProxy(), U = 512, V = 64, raw = new Float32Array(U * V), bu = P.U / U, bv = P.V / V;
        for (let j = 0; j < V; j++) for (let i = 0; i < U; i++) { let s2 = 0, n = 0; for (let jj = Math.floor(j * bv); jj < Math.max(Math.floor(j * bv) + 1, Math.floor((j + 1) * bv)); jj++) for (let ii = Math.floor(i * bu); ii < Math.max(Math.floor(i * bu) + 1, Math.floor((i + 1) * bu)); ii++) { s2 += P.data[Math.min(P.V - 1, jj) * P.U + Math.min(P.U - 1, ii)]; n++; } raw[j * U + i] = s2 / n; }   // block average, any proxy size
        // a ridge is concentric: smooth along u (≈ 0.3 mm) so narrow radial fibres and single crypts do not pull the path
        const str = blurPolar(raw, U, V, 6, 1);
        // search window: above the ruff, below the limbal band (v > 0.85 is the limbus and, at the vertical
        // angles, the filled region beyond the visible iris); the DP runs on a unit-scaled map so the
        // smoothness penalty is comparable to the strength, heights stay in mm
        const found = [], jmin = Math.floor(0.06 * V), jmax = Math.floor(0.85 * V);
        const mags = []; for (let j = jmin; j < jmax; j++) for (let i = 0; i < U; i += 4) mags.push(Math.abs(str[j * U + i]));
        mags.sort((a, b) => a - b); const scale = Math.max(1e-4, mags[Math.floor(0.9 * mags.length)]);
        const extract = (sign, count, tag) => {
            const work = new Float32Array(U * V); for (let k = 0; k < U * V; k++) work[k] = sign * str[k] / scale;
            let first = 0;
            for (let n = 0; n < count; n++) {
                const { path, along: alongN } = dpClosedPath(work, U, V, jmin, jmax, 1.5);
                const along = new Float32Array(U); for (let i = 0; i < U; i++) along[i] = sign * str[Math.min(V - 1, Math.floor(path[i] * V)) * U + i];
                let mean = 0; for (let i = 0; i < U; i++) mean += along[i]; mean /= U;
                if (n === 0) first = mean;
                if (mean < 0.006 || mean < 0.3 * first) break;
                // width: half-maximum half-width across v, median over u → Gaussian 1/e width
                const hw = [];
                for (let i = 0; i < U; i += 4) { if (alongN[i] <= 0) continue; const j0 = path[i] * V - 0.5, th = 0.5 * alongN[i]; let d = 0.5; while (d < 6) { const jp = Math.round(j0 + d), jm = Math.round(j0 - d); const vp = jp < V ? work[jp * U + i] : -1, vm = jm >= 0 ? work[jm * U + i] : -1; if (vp < th && vm < th) break; d += 0.5; } hw.push(d / V); }
                if (hw.length < 8) break;
                const width = Math.max(0.012, Math.min(0.08, median(hw) / 0.8326));
                const pts = [], w = [];
                for (let k = 0; k < 36; k++) { const i = Math.floor(k / 36 * U); pts.push([k / 36, path[i]]); let a = 0, c = 0; for (let di = -8; di <= 8; di++) { a += along[(i + di + U) % U]; c++; } w.push(Math.max(0, Math.min(1.5, a / c / mean))); }
                found.push({ tag, pts, w, height: sign * Math.max(0.01, Math.min(0.15, 2 * mean)), width, asym: 0, strength: +mean.toFixed(4) });   // crest mean → peak ≈ 2×
                // suppress this ridge (wider than itself) before the next search
                const sig = Math.max(2, width * V * 1.5);
                for (let i = 0; i < U; i++) { const jc = path[i] * V - 0.5; for (let j = jmin; j < jmax; j++) { const d = (j - jc) / sig; work[j * U + i] -= Math.max(0, alongN[i]) * Math.exp(-0.5 * d * d); } }
            }
        };
        extract(1, maxRidges, 'ridge'); extract(-1, maxTroughs, 'furrow');
        return found;
    }
    // subtract the ridge list's profiles from the residual height field, so the bake (field + ridges) does
    // not carry each range twice
    function subtractRidges(g) {
        const [w, h] = E.GRIDS.c, H = g.fields.height.data, list = [E.collaretteRidge(g)].concat(g.ridges || []);
        for (const rd of list) {
            const vs = E.sampleClosed(rd.pts.map(q => q[1]), 128), ws = E.sampleClosed(rd.w || rd.pts.map(() => 1), 128);
            for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
                const fu = (i + 0.5) / w * 128, i0 = Math.floor(fu) % 128, t = fu - Math.floor(fu), vr = vs[i0] * (1 - t) + vs[(i0 + 1) % 128] * t, wr = ws[i0] * (1 - t) + ws[(i0 + 1) % 128] * t;
                const d = ((j + 0.5) / h - vr) / Math.max(0.005, rd.width), kk = d < 0 ? 1 + (rd.asym || 0) : 1 - (rd.asym || 0);
                H[j * w + i] -= rd.height * wr * Math.exp(-d * d * kk);
            }
        }
    }
    // ---- structures from the photo (07 §3, §19.3): the ridge list (collarette = strongest closed ridge in
    // v 0.12–0.6, the rest as extra ridges / furrow troughs), crypts as pits of the residual height field,
    // then the ridges are removed from the residual so the topology is carried once
    function structuresFromHeight() {
        const g = E.genome; const [w, h] = E.GRIDS.c; const H = g.fields.height.data;
        const found = ridgesFromProxy();
        let ci = -1;
        for (let k = 0; k < found.length; k++) { const r = found[k]; if (r.tag !== 'ridge') continue; let vm = 0; for (const q of r.pts) vm += q[1] / r.pts.length; if (vm >= 0.12 && vm <= 0.6) { ci = k; break; } }
        if (ci >= 0) {
            const R = found[ci], U = 512, path = E.sampleClosed(R.pts.map(q => q[1]), U);
            const pts = []; for (let k = 0; k < 36; k++) pts.push([k / 36, path[Math.floor(k / 36 * U)]]);
            let r0 = 0; for (let i = 0; i < U; i++) r0 += path[i]; r0 /= U;
            const harm = []; for (let k = 1; k <= 40; k++) { let a = 0, b = 0; for (let i = 0; i < U; i++) { const ang = 6.2831853 * k * i / U; a += (path[i] - r0) * Math.cos(ang); b += (path[i] - r0) * Math.sin(ang); } harm.push(2 * a / U, 2 * b / U); }
            g.coll.r = r0; g.coll.harm = harm; g.coll.points = pts; g.coll.height = R.height; g.coll.width = R.width; state.collr = target.collr = r0; E.setSlider('collr', 'collr', r0);
        }
        g.ridges = found.filter((_, k) => k !== ci);
        // crypts: connected pits of the height field deeper than −0.025 mm, between the collarette and the root
        const seen = new Uint8Array(w * h), crypts = [];
        for (let jj = 0; jj < h; jj++) for (let i = 0; i < w; i++) {
            const k = jj * w + i; if (seen[k] || H[k] > -0.025) continue;
            const st = [k]; seen[k] = 1; let n = 0, su = 0, sv = 0, minH = 0, x0 = i, x1 = i, y0 = jj, y1 = jj; const us = [];
            while (st.length) { const q = st.pop(); const qy = Math.floor(q / w), qx = q % w; n++; sv += qy; minH = Math.min(minH, H[q]); us.push(qx); y0 = Math.min(y0, qy); y1 = Math.max(y1, qy);
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = (qx + dx + w) % w, ny = qy + dy; if (ny < 0 || ny >= h) continue; const nk = ny * w + nx; if (!seen[nk] && H[nk] <= -0.025) { seen[nk] = 1; st.push(nk); } } }
            if (n < 4) continue;
            const u0 = us[0]; let sdu = 0; for (const uu of us) { let d = uu - u0; if (d > w / 2) d -= w; if (d < -w / 2) d += w; sdu += d; }
            const uc = ((u0 + sdu / n) / w + 1) % 1, vc = (sv / n + 0.5) / h;
            const vcoll = E.collaretteAt(g.coll, uc); if (vc < vcoll + 0.03 || vc > 0.93) continue;
            const hv = (y1 - y0 + 1) / h * 4.0, wu = n / (y1 - y0 + 1) / w * 6.2831853 * (2 + 4 * vc);
            crypts.push({ th: uc, v: vc, size: Math.max(0.25, Math.min(1.2, 0.5 * hv)), aspect: Math.max(1.2, Math.min(4, hv / Math.max(0.05, wu))), angle: 0, depth: Math.min(0.3, 0.1 + 3 * (-minH)), soft: 0.6 });
        }
        crypts.sort((a, b) => b.size - a.size); g.crypts = crypts.slice(0, 14);
        subtractRidges(g);
        E.atlas.dirty = true;
        const desc = found.map(r => `${r.tag} v ${(r.pts.reduce((s2, q) => s2 + q[1], 0) / r.pts.length).toFixed(2)} h ${(r.height * 1000).toFixed(0)} µm w ${r.width.toFixed(3)}`).join(' · ');
        say(`structures: ${found.length} ridges (${desc})${ci >= 0 ? ' · collarette = ridge ' + ci : ' · no collarette ridge in 0.12–0.6'} · ${g.crypts.length} crypt pits`);
    }
    // ---------------- relief splats (§19.5): 2-D Gaussians fitted to the height proxy ----------------
    // The coarse model (residual field + ridge list) evaluated on the proxy grid; the splats fit what it
    // leaves: proxy − coarse. Each splat: u (turns), v, σa, σb (mm), θ (rad from radial), a (mm, signed).
    function coarseModelOnGrid(U, V) {
        const g = E.genome, [w, h] = E.GRIDS.c, F = g.fields.height.data, out = new Float32Array(U * V);
        const list = [E.collaretteRidge(g)].concat(g.ridges || []).map(rd => ({ rd, vs: E.sampleClosed(rd.pts.map(q => q[1]), 128), ws: E.sampleClosed(rd.w || rd.pts.map(() => 1), 128) }));
        for (let j = 0; j < V; j++) for (let i = 0; i < U; i++) {
            const u = (i + 0.5) / U, v = (j + 0.5) / V;
            const x = u * w - 0.5, y = v * h - 0.5, x0 = Math.floor(x), y0 = Math.min(h - 1, Math.max(0, Math.floor(y))), x1 = (x0 + 1 + w) % w, y1 = Math.min(h - 1, y0 + 1), fx = x - x0, fy = Math.max(0, y - y0);
            let val = (1 - fy) * ((1 - fx) * F[y0 * w + ((x0 + w) % w)] + fx * F[y0 * w + x1]) + fy * ((1 - fx) * F[y1 * w + ((x0 + w) % w)] + fx * F[y1 * w + x1]);
            for (const { rd, vs, ws } of list) { const fu = u * 128, i0 = Math.floor(fu) % 128, t = fu - Math.floor(fu), vr = vs[i0] * (1 - t) + vs[(i0 + 1) % 128] * t, wr = ws[i0] * (1 - t) + ws[(i0 + 1) % 128] * t; const d = (v - vr) / Math.max(0.005, rd.width), kk = d < 0 ? 1 + (rd.asym || 0) : 1 - (rd.asym || 0); val += rd.height * wr * Math.exp(-d * d * kk); }
            out[j * U + i] = val;
        }
        return out;
    }
    // initial splats at scale-space extrema of the target (DoG over 4 scales, non-max in 3×3), isotropic in mm
    function initSplats(T, valid, U, V, N) {
        const cands = [];
        const texV = 4 / V;                                                   // mm per row
        for (const sc0 of [1.5, 3, 6, 12]) {
            const sc = sc0 * U / 1024, ru = Math.max(1, Math.round(sc)), rv = Math.max(1, Math.round(sc * 0.7));
            const a = blurPolar(T, U, V, ru, rv), b = blurPolar(T, U, V, 2 * ru, 2 * rv);
            const d = new Float32Array(U * V); for (let k = 0; k < U * V; k++) d[k] = a[k] - b[k];
            for (let j = 1; j < V - 1; j++) for (let i = 0; i < U; i++) {
                const k = j * U + i; if (!valid[k]) continue; const x = d[k]; if (Math.abs(x) < 0.004) continue;
                let ext = true;
                for (let dj = -1; dj <= 1 && ext; dj++) for (let di = -1; di <= 1; di++) { if (!di && !dj) continue; const q = (j + dj) * U + ((i + di + U) % U); if (x > 0 ? d[q] >= x : d[q] <= x) { ext = false; break; } }
                if (!ext) continue;
                const v = (j + 0.5) / V, r = 2 + 4 * v, sig = sc * (6.2831853 * r / U);      // σ in mm from the u texel size
                cands.push({ score: Math.abs(x) * Math.sqrt(sc), u: (i + 0.5) / U, v, sa: Math.max(0.03, sig), sb: Math.max(0.03, sig), th: 0, a: x * 1.5 });
            }
        }
        cands.sort((p, q) => q.score - p.score);
        return cands.slice(0, N).map(c => ({ u: c.u, v: c.v, sa: c.sa, sb: c.sb, th: c.th, a: c.a }));
    }
    // gradient fit (Adam) of N splats to proxy − coarse; each splat touches ±2.5σ; loss = MSE on sampled cells
    function fitSplats(N = 2000, iters = 120, warm = false) {
        if (!fit.photo) return null;
        const P = heightProxy(), U = P.U, V = P.V, g = E.genome;
        const coarse = coarseModelOnGrid(U, V), T = new Float32Array(U * V);
        for (let k = 0; k < U * V; k++) T[k] = P.valid[k] ? P.data[k] - coarse[k] : 0;
        const painted = (g.splats || []).filter(sp => sp.tag === 'paint');                       // hand-painted stamps are never refitted
        const S = warm && (g.splats || []).some(sp => sp.tag !== 'paint') ? g.splats.filter(sp => sp.tag !== 'paint').map(sp => Object.assign({}, sp)) : initSplats(T, P.valid, U, V, N), n = S.length;
        const keys = ['u', 'v', 'sa', 'sb', 'th', 'a'], lr = { u: 0.3 / U, v: 0.3 / V, sa: 0.004, sb: 0.004, th: 0.04, a: 0.002 };
        const m = keys.map(() => new Float32Array(n)), vv = keys.map(() => new Float32Array(n)), grad = keys.map(() => new Float32Array(n));
        const pred = new Float32Array(U * V), t0 = performance.now();
        let loss = 0;
        for (let it = 0; it < iters; it++) {
            pred.fill(0);
            // forward
            for (const sp of S) {
                const r = 2 + 4 * sp.v, ext = 2.5 * Math.max(sp.sa, sp.sb), ru = Math.ceil(ext / (6.2831853 * r) * U), rv = Math.ceil(ext / 4 * V);
                const ci = Math.round(sp.u * U - 0.5), cj = Math.round(sp.v * V - 0.5), c = Math.cos(sp.th), sn = Math.sin(sp.th);
                for (let j = Math.max(0, cj - rv); j <= Math.min(V - 1, cj + rv); j++) { const dy = ((j + 0.5) / V - sp.v) * 4; for (let ii = ci - ru; ii <= ci + ru; ii++) { const i = ((ii % U) + U) % U; const dx = ((ii + 0.5) / U - sp.u) * 6.2831853 * r; const xa = c * dx + sn * dy, yb = -sn * dx + c * dy; pred[j * U + i] += sp.a * Math.exp(-0.5 * (xa * xa / (sp.sa * sp.sa) + yb * yb / (sp.sb * sp.sb))); } }
            }
            // error and gradients
            loss = 0; let cnt = 0; const err = new Float32Array(U * V);
            for (let k = 0; k < U * V; k++) if (P.valid[k]) { const e = pred[k] - T[k]; err[k] = 2 * e; loss += e * e; cnt++; }
            loss /= Math.max(1, cnt);
            for (const gr of grad) gr.fill(0);
            S.forEach((sp, si) => {
                const r = 2 + 4 * sp.v, ext = 2.5 * Math.max(sp.sa, sp.sb), ru = Math.ceil(ext / (6.2831853 * r) * U), rv = Math.ceil(ext / 4 * V);
                const ci = Math.round(sp.u * U - 0.5), cj = Math.round(sp.v * V - 0.5), c = Math.cos(sp.th), sn = Math.sin(sp.th);
                let gu = 0, gv = 0, gsa = 0, gsb = 0, gth = 0, ga = 0;
                for (let j = Math.max(0, cj - rv); j <= Math.min(V - 1, cj + rv); j++) { const dy = ((j + 0.5) / V - sp.v) * 4; for (let ii = ci - ru; ii <= ci + ru; ii++) { const i = ((ii % U) + U) % U, k = j * U + i; const e = err[k]; if (!e) continue; const dx = ((ii + 0.5) / U - sp.u) * 6.2831853 * r; const xa = c * dx + sn * dy, yb = -sn * dx + c * dy; const gg = Math.exp(-0.5 * (xa * xa / (sp.sa * sp.sa) + yb * yb / (sp.sb * sp.sb))); const w = e * sp.a * gg;
                    const dgx = -xa / (sp.sa * sp.sa), dgy = -yb / (sp.sb * sp.sb);                 // ∂ln g / ∂xa, ∂yb
                    ga += e * gg; gu += w * (dgx * c - dgy * sn) * (-6.2831853 * r); gv += w * (dgx * sn + dgy * c) * (-4);
                    gsa += w * xa * xa / (sp.sa * sp.sa * sp.sa); gsb += w * yb * yb / (sp.sb * sp.sb * sp.sb); gth += w * (dgx * yb - dgy * xa); } }
                grad[0][si] = gu; grad[1][si] = gv; grad[2][si] = gsa; grad[3][si] = gsb; grad[4][si] = gth; grad[5][si] = ga;
            });
            // Adam step
            const b1 = 0.9, b2 = 0.999, t = it + 1;
            keys.forEach((key, ki) => { const gr = grad[ki], mm = m[ki], vk = vv[ki], step = lr[key]; for (let si = 0; si < n; si++) { mm[si] = b1 * mm[si] + (1 - b1) * gr[si]; vk[si] = b2 * vk[si] + (1 - b2) * gr[si] * gr[si]; const mh = mm[si] / (1 - Math.pow(b1, t)), vh = vk[si] / (1 - Math.pow(b2, t)); S[si][key] -= step * mh / (Math.sqrt(vh) + 1e-8); } });
            for (const sp of S) { sp.u = ((sp.u % 1) + 1) % 1; sp.v = Math.max(0.03, Math.min(0.97, sp.v)); sp.sa = Math.max(0.02, Math.min(0.8, sp.sa)); sp.sb = Math.max(0.02, Math.min(0.8, sp.sb)); sp.a = Math.max(-0.2, Math.min(0.2, sp.a)); }
        }
        g.splats = S.map(sp => ({ u: +sp.u.toFixed(5), v: +sp.v.toFixed(4), sa: +sp.sa.toFixed(4), sb: +sp.sb.toFixed(4), th: +sp.th.toFixed(3), a: +sp.a.toFixed(4) })).concat(painted);
        g.crypts = [];                                                          // the field carries the openings now
        g.fitted = Object.assign(g.fitted || {}, { crypt: state.crypt, furrowDepth: g.globals.furrowDepth });
        E.atlas.dirty = true;
        const secs = (performance.now() - t0) / 1000;
        say(`relief splats: ${n} fitted in ${secs.toFixed(1)} s (${iters} it) · rms residual ${(Math.sqrt(loss) * 1000).toFixed(1)} µm`);
        return { n, loss, secs };
    }
    // ---------------- rim sharpness from the photo (§19.6 open item a) ----------------
    // The rim band = proxy cells just outside an opening (−0.03 … −0.008 mm); the statistic is the mean
    // luminance gradient there relative to the mean luminance. The photo sets the target and rimSharp is
    // corrected through the renderer (4 renders), then held out of the optimiser like the material.
    function rimStat(pix) {
        const P = heightProxy(), U = P.U, V = P.V, { data: lum } = unwrap(pix, U, V);
        let g = 0, n = 0, m = 0, nm = 0;
        for (let j = 1; j < V - 1; j++) for (let i = 0; i < U; i++) {
            const k = j * U + i; if (!P.valid[k]) continue; m += lum[k]; nm++;
            const f = P.data[k]; if (f > -0.008 || f < -0.03) continue;
            g += Math.abs(lum[k + 1 - (i === U - 1 ? U : 0)] - lum[k - 1 + (i === 0 ? U : 0)]) * 0.5 + Math.abs(lum[k + U] - lum[k - U]) * 0.5; n++;
        }
        return n > 50 ? (g / n) / Math.max(0.02, m / nm) : 0;
    }
    function rimFromPhoto() {
        const g = E.genome, sP = rimStat(fit.photo); if (!sP) { say('rim: no openings in the proxy'); return; }
        let x = g.globals.rimSharp === undefined ? 0.6 : g.globals.rimSharp, step = 0.3, sR = 0;
        for (let it = 0; it < 4; it++) {
            g.globals.rimSharp = x; E.atlas.dirty = true; renderFit(); sR = rimStat(fit.render);
            x = Math.max(0, Math.min(1, x + (sR < sP ? step : -step))); step *= 0.5;
        }
        g.globals.rimSharp = x; E.atlas.dirty = true;
        say(`rim sharpness from photo: gradient at the rims photo ${sP.toFixed(3)} / render ${sR.toFixed(3)} → rimSharp ${x.toFixed(2)}`);
    }
    const MATERIAL_KEYS = ['pigment', 'stroma', 'pheo', 'yellow', 'gapMelMul', 'gapStromaMul', 'ring', 'ringR', 'pupZoneMel', 'rimSharp'];   // photo-derived colour: the optimiser must not repaint it
    // §22 F0: the strand-contrast genes and the strand-energy term. Both default on; set
    // fit.strandGenes = false / fit.strandTerm = false for a baseline run of the same source, so
    // "before" and "after" differ only in these two switches (benchIsolated({ f0: false })).
    const F0_KEYS = ['strandMed', 'strandFine', 'strandSharp', 'gapShadow'];
    // The v66 ablation settled the split: the four genes fitted are the best version so far
    // (MATCH 69.3 / MATCH2 59.2 against v64-mapfix's 65.0 / 57.3), while the strand-energy term
    // costs 10 MATCH2 points because it is phase-blind and the optimiser pays for band energy with
    // misaligned noise. So: genes on, term off, until F2 gives the fitter a layout to align.
    fit.strandGenes = true; fit.strandTerm = false;
    // §23: routed (mixture-of-experts) fitting — the default since v71 (MATCH2 59.7 against the joint fit's 59.2).
    // benchIsolated({ routed: false }) reproduces v66.
    fit.routed = true;
    fit.seededLoss = 'pixel';   // §23: 'pixel' (fidelity, v69) or 'stats' (look, v70)
    fit.placement = true;       // §24 F2: strand placement from the photo — default since v72/v74; benchIsolated({ f2: false }) turns it off
    // debug: fit.trace = true records a checksum of state, genes, fields and splats after each stage of a fit,
    // so two runs of the same eye can be compared stage by stage (fit.traceLog)
    function fingerprint() {
        const h = x => { let a = 0; const str = typeof x === 'string' ? x : JSON.stringify(x); for (let i = 0; i < str.length; i++) a = (a * 31 + str.charCodeAt(i)) | 0; return a; };
        const g = E.genome, fsum = {};
        for (const [n, f] of Object.entries(g.fields || {})) { let t = 0; for (let i = 0; i < f.data.length; i += 7) t += f.data[i] * (i % 13 + 1); fsum[n] = [f.custom, +t.toFixed(4)]; }
        const st = Object.fromEntries(Object.keys(state).filter(k => !RUNTIME_KEYS.has(k)).map(k => [k, state[k]]).filter(([, v]) => typeof v !== 'object' || Array.isArray(v)));
        return { state: h(st), globals: h(g.globals), fields: h(fsum), splats: h((g.splats || []).map(q => [q.u, q.v, q.a])), objects: h([g.coll, g.crypts, g.ridges, g.bundles]), extra: h([fit.sat, state.sat, state.ev]) };
    }
    const trace = stage => {
        if (!fit.trace) return;
        const rec = Object.assign({ stage }, fingerprint());
        if (fit.traceFull) { rec.stateRaw = Object.fromEntries(Object.keys(state).filter(k => !RUNTIME_KEYS.has(k)).map(k => [k, state[k]]).filter(([, v]) => typeof v !== 'object' || Array.isArray(v))); rec.globalsRaw = JSON.parse(JSON.stringify(E.genome.globals)); }
        (fit.traceLog = fit.traceLog || []).push(rec);
    };
    async function fitGlobal(iters = 120, opts = {}) {
        if (!fit.photo) { say('load a photo first'); return; }
        if (!fit.pose) solvePose();
        fit.running = true; state.fitting = true;
        const pp = profiles(fit.photo); let evals = 0;
        fit.mask = irisMask();
        trace('enter');
        bestPresetStart(pp, !!opts.fromCurrent); trace('preset');
        heightFromPhoto(); trace('height'); flowFromPhoto(); trace('flow'); structuresFromHeight(); trace('structures'); fitSplats(fit.splatBudget || E.Q.splats); trace('splats');
        if (fit.placement) placementFromPhoto(); else clearPlacement();
        trace('placement');
        E.genome.globals.pupZoneMel = 1.0; state.ring = target.ring = 0;
        const usedPhotoMaterial = materialFromPhoto(); trace('material');
        rimFromPhoto(); trace('rim');
        // §22 F0: the photo's strand-band energy is the target the new contrast genes are judged against.
        // Measured once; the render's is measured per evaluation and the symmetric ratio enters the error.
        const hfPhoto = strandEnergy(fit.photo), bandPhoto = strandBand(fit.photo);
        say(`photo strand energy ${hfPhoto.toFixed(2)} (tangential Laplacian at ${(STRAND_MM * 1000).toFixed(0)} µm), ${bandPhoto.length} samples`);
        // with the material taken from the photo, the optimiser only refines exposure, light, limbus, zones and structure
        let ps = usedPhotoMaterial ? GLOBAL_PARAMS.filter(p => !MATERIAL_KEYS.includes(p.key)) : GLOBAL_PARAMS;
        if (fit.strandGenes === false) { ps = ps.filter(p => !F0_KEYS.includes(p.key)); for (const [k, v] of Object.entries({ strandMed: 0.28, strandFine: 0.17, strandSharp: 0, gapShadow: 0.8 })) E.genome.globals[k] = v; E.atlas.dirty = true; }
        const x0 = ps.map(p => p.get()), lo = ps.map(p => p.lo), hi = ps.map(p => p.hi);
        const f = async (x) => {
            ps.forEach((p, i) => p.set(x[i]));
            renderFit(); evals++;
            const e = profileError(pp, profiles(fit.render));
            const pix = 40 - psnr(fit.photo, fit.render, fit.mask, 3);   // weak pixel term
            // §21 E2: structure terms so the optimiser stops preferring flat fills — edges in the same places, relief like the photo's
            const gr = gradAgree(fit.photo, fit.render, fit.mask), hc = heightCorrelation();
            // §22 F0: strand-scale energy. SSIM and grad are blind below ≈ 0.16 mm, so without this term
            // nothing rewards the strand band and the fitter leaves the detail genes where they started.
            const hfW = fit.strandWeight === undefined ? 60 : fit.strandWeight;
            let strandPen = 0;
            if (fit.strandTerm !== false) {
                // correlation first (phase-aware: noise cannot satisfy it), plus a *deficit-only* energy
                // nudge at a quarter weight so a render that is simply too smooth still feels a pull
                const sc = strandCorr(bandPhoto, strandBand(fit.render));
                const hfR = strandEnergy(fit.render);
                const deficit = hfPhoto > 1e-6 ? Math.max(0, 1 - hfR / hfPhoto) : 0;
                strandPen = hfW * (1 - Math.max(0, sc)) + 0.25 * hfW * deficit;
            }
            return e + 4 * pix + 60 * (1 - gr) + 60 * (1 - Math.max(0, hc)) + strandPen;
        };
        trace('pre-nm');
        if (fit.routed) {
            say(`routed fit (${fit.seededLoss}): E0 tone → experts coarse to fine (§23)`);
            fit.route = null; photoRoute();
            say(`route evidence ${JSON.stringify(fit.route.evidence)} · band open ${JSON.stringify(fit.route.open)}`);
            evals += await routedFit(ps, pp, iters);
        } else {
            say('fitting global genes…');
            const res = await nelderMead(x0, lo, hi, f, iters, (it, best) => { if (it % 5 === 0) { score(); draw(); say(`global fit it ${it} · err ${best.toFixed(1)} · ${evals} renders`); } });
            ps.forEach((p, i) => p.set(res.x[i]));
        }
        for (const id of ['pigment', 'stroma', 'pheo', 'mie', 'ring', 'collr', 'ev', 'ambient', 'lid']) { const el = $('param-' + id); if (el) { el.value = state[id === 'pigment' ? 'pigment' : id]; } }
        E.setSlider('pigment', 'pigment', state.pigment); E.setSlider('stroma', 'stroma', state.stroma, 3); E.setSlider('pheo', 'pheo', state.pheo); E.setSlider('mie', 'mie', state.mie); E.setSlider('yellow', 'yellow', state.yellow); E.setSlider('ring', 'ring', state.ring); E.setSlider('collr', 'collr', state.collr); E.setSlider('ev', 'ev', state.ev, 1); E.setSlider('ambient', 'ambient', state.ambient); E.setSlider('lid', 'lid', state.lid, 1);
        trace('done');
        renderFit(); score(); draw();
        fit.running = false; state.fitting = false; E.resetAccumulation();
        say(`global fit done · ${evals} renders · ${scoreEl.textContent}`);
    }

    // FIT HQ (§20.3): one button — CAPTURE quality, pose + alignment loop, the whole chain, a warm relief
    // refinement, then the result stays loaded at that quality
    async function fitHQ() {
        if (!fit.photo) { say('load a photo first (PHOTO… or a reference)'); return; }
        const q0 = E.quality; if (q0 !== 'capture') { E.setQuality('capture'); fit.map = null; fit.proxy = null; }
        const t0 = performance.now();
        say('FIT HQ: capture quality · pose → structures → relief → material → global fit → relief refinement');
        solvePose();
        await fitGlobal(160); if (!fit.running && !state.fitting && fit.benchRunning) return;
        fit.running = true; state.fitting = true; fitSplats(E.Q.splats, 120, true); renderFit(); score(); draw(); fit.running = false; state.fitting = false; E.resetAccumulation();
        say(`FIT HQ done in ${((performance.now() - t0) / 1000).toFixed(0)} s · ${scoreEl.textContent}`);
    }
    // ---------------- structure detection in the unwrapped photo ----------------
    // ---------------- height harness (§19.3 C1) ----------------
    // scalar unwrap through the map: same splat and neighbour fill as unwrapRGB, one value per photo pixel
    function unwrapScalar(vals, U, V) {
        const map = getMap(), W = fit.W, H = fit.H;
        const acc = new Float32Array(U * V), cnt = new Float32Array(U * V);
        for (let k = 0; k < W * H; k++) {
            if (!map.inside[k]) continue;
            const fu = map.u[k] * U - 0.5, fv = Math.min(V - 1.001, Math.max(0, map.v[k] * V - 0.5));
            const i0 = Math.floor(fu), j0 = Math.floor(fv), tu = fu - i0, tv = fv - j0;
            for (let dj = 0; dj <= 1; dj++) for (let di = 0; di <= 1; di++) { const ii = ((i0 + di) % U + U) % U, jj = Math.min(V - 1, j0 + dj), wgt = (di ? tu : 1 - tu) * (dj ? tv : 1 - tv); if (wgt <= 0) continue; const c = jj * U + ii; acc[c] += wgt * vals[k]; cnt[c] += wgt; }
        }
        const out = new Float32Array(U * V), filled = new Uint8Array(U * V); let empty = 0;
        for (let c = 0; c < U * V; c++) { if (cnt[c] > 1e-4) { filled[c] = 1; out[c] = acc[c] / cnt[c]; } else empty++; }
        for (let pass = 0; pass < 256 && empty > 0; pass++) {
            const nf = new Uint8Array(filled);
            for (let j = 0; j < V; j++) for (let i = 0; i < U; i++) { const c = j * U + i; if (filled[c]) continue; let s0 = 0, n = 0; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = (i + di + U) % U, jj = j + dj; if (jj < 0 || jj >= V) continue; const q = jj * U + ii; if (filled[q]) { s0 += out[q]; n++; } } if (n) { out[c] = s0 / n; nf[c] = 1; empty--; } }
            filled.set(nf);
        }
        out.valid = new Uint8Array(U * V); for (let j = 0; j < V; j++) for (let i = 0; i < U; i++) out.valid[j * U + i] = (j + 0.5) / V <= map.vmax[Math.floor((i + 0.5) / U * 256)] ? 1 : 0;
        return out;
    }
    // the photo's height proxy: luminance through the map at 1024 × 128 (≈ 0.025 × 0.035 mm at mid radius),
    // band-passed at three scales — brighter than its neighbourhood = raised (ring-flash macro). Units ≈ mm
    // (0.08 mm per unit of relative brightness, the amplitude heightFromPhoto uses). Cached per photo + pose.
    function heightProxy() {
        const map = getMap(), sig = map.sig + '|' + fit.name + '|' + E.Q.proxyU;
        if (fit.proxy && fit.proxy.sig === sig) return fit.proxy;
        const U = E.Q.proxyU, V = E.Q.proxyV, rgb = unwrapRGB(fit.photo, U, V), lum = new Float32Array(U * V), out = new Float32Array(U * V);
        for (let k = 0; k < U * V; k++) lum[k] = (rgb[k * 3] * 0.299 + rgb[k * 3 + 1] * 0.587 + rgb[k * 3 + 2] * 0.114) / 255;
        const bp = (rs, rl, wgt) => { const a = blurPolar(lum, U, V, rs[0], rs[1]), b = blurPolar(lum, U, V, rl[0], rl[1]); for (let k = 0; k < U * V; k++) out[k] += wgt * (a[k] - b[k]) / Math.max(0.03, b[k]); };
        const q = U / 1024;                                                             // texel radii scale with the proxy resolution
        const R = x => Math.max(1, Math.round(x * q));
        bp([R(1), R(1)], [R(6), R(4)], 0.3); bp([R(3), R(2)], [R(16), R(10)], 0.4); bp([R(6), R(4)], [R(40), R(24)], 0.3);     // ≈ 0.15 / 0.4 / 1 mm neighbourhoods
        for (let k = 0; k < U * V; k++) out[k] = Math.max(-1, Math.min(1, out[k] * 1.2)) * 0.08;
        fit.proxy = { sig, data: out, U, V, valid: rgb.valid };
        return fit.proxy;
    }
    // the engine's baked relief per photo pixel (photo-shader view 15), unwrapped through the map; mm
    function renderHeight(U = E.Q.proxyU, V = E.Q.proxyV) {
        const W = fit.W, H = fit.H; ensureFitTargets(W, H);
        if (E.atlas.dirty) E.bakeAtlas();
        E.drawPhotoFrame(fitFB, W, H, 0, fitTex2, { ref: 1, rot: state.camRot, zoom: state.zoomPhoto, view: state.view, debug: 15 });
        const px = new Float32Array(W * H * 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fitFB); gl.readPixels(0, 0, W, H, gl.RGBA, gl.FLOAT, px); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, E.canvas.width, E.canvas.height);
        const vals = new Float32Array(W * H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) vals[y * W + x] = px[((H - 1 - y) * W + x) * 4];
        return unwrapScalar(vals, U, V);
    }
    // Pearson correlation of the photo's height proxy with the engine's relief over the sampled cells (v < 0.93)
    function heightCorrelation() {
        if (!fit.photo) return 0;
        const P = heightProxy(), R = renderHeight(P.U, P.V), U = P.U, V = P.V;
        let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
        for (let j = 0; j < Math.floor(0.93 * V); j += 2) for (let i = 0; i < U; i += 4) { const c = j * U + i; if (!P.valid[c]) continue; const a = P.data[c], b = R[c]; n++; sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b; }
        if (n < 10) return 0;
        const cov = sab / n - (sa / n) * (sb / n), va = saa / n - (sa / n) ** 2, vb = sbb / n - (sb / n) ** 2;
        return va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : 0;
    }
    // HEIGHT A/B: the photo's height proxy over the engine's relief, both ±0.1 mm → grey, unsampled cells dark
    function drawHeightAB() {
        const W = fit.W, H = fit.H, V = Math.floor(H / 2), P = heightProxy(), R = renderHeight(P.U, P.V);
        const show = ctx.createImageData(W, H); const g8 = v => Math.max(0, Math.min(255, Math.round(128 + v / 0.1 * 127)));
        for (let j = 0; j < V; j++) for (let i = 0; i < W; i++) {
            const c = Math.floor(j / V * P.V) * P.U + Math.floor(i / W * P.U), ok = P.valid[c];
            const o = ((V - 1 - j) * W + i) * 4, o2 = ((H - 1 - j) * W + i) * 4, a = ok ? g8(P.data[c]) : 30, b = ok ? g8(R[c]) : 30;
            show.data[o] = a; show.data[o + 1] = a; show.data[o + 2] = ok ? a : 50; show.data[o + 3] = 255;
            show.data[o2] = b; show.data[o2 + 1] = b; show.data[o2 + 2] = ok ? b : 50; show.data[o2 + 3] = 255;
        }
        ctx.putImageData(show, 0, 0);
        ctx.strokeStyle = 'rgba(0,240,255,0.8)'; ctx.beginPath(); ctx.moveTo(0, V); ctx.lineTo(W, V); ctx.stroke();
        ctx.fillStyle = 'rgba(0,240,255,0.9)'; ctx.font = '10px monospace'; ctx.fillText('PHOTO height proxy (±0.1 mm · pupil ↓ root ↑)', 6, 12); ctx.fillText('RENDER relief · correlation ' + heightCorrelation().toFixed(2), 6, V + 12);
    }
    // polar unwrap (luminance) through the engine map: u = turns, v = tissue coordinate (0 pupil margin, 1 root)
    function unwrap(pix, U = 720, V = 96) {
        const rgb = unwrapRGB(pix, U, V), out = new Float32Array(U * V);
        for (let k = 0; k < U * V; k++) out[k] = (rgb[k * 3] * 0.299 + rgb[k * 3 + 1] * 0.587 + rgb[k * 3 + 2] * 0.114) / 255;
        return { data: out, U, V };
    }
    function blurPolar(src, U, V, ru, rv) {
        const tmp = new Float32Array(U * V), out = new Float32Array(U * V);
        for (let j = 0; j < V; j++) for (let i = 0; i < U; i++) { let s = 0, n = 0; for (let k = -ru; k <= ru; k++) { s += src[j * U + ((i + k + U) % U)]; n++; } tmp[j * U + i] = s / n; }
        for (let j = 0; j < V; j++) for (let i = 0; i < U; i++) { let s = 0, n = 0; for (let k = -rv; k <= rv; k++) { const jj = Math.min(V - 1, Math.max(0, j + k)); s += tmp[jj * U + i]; n++; } out[j * U + i] = s / n; }
        return out;
    }
    function detectStructures() {
        if (!fit.photo) { say('load a photo first'); return; }
        if (!fit.pose) solvePose();
        const g = E.genome; const { data, U, V } = unwrap(fit.photo);
        const fine = blurPolar(data, U, V, 2, 1), coarse = blurPolar(data, U, V, 14, 8);
        // crypts: dark blobs (fine − coarse below a threshold), lens-shaped, grouped by connected components
        const dog = new Float32Array(U * V); let mean = 0; for (let i = 0; i < U * V; i++) { dog[i] = fine[i] - coarse[i]; mean += Math.abs(dog[i]); } mean /= U * V;
        const thr = -2.8 * mean; const seen = new Uint8Array(U * V); const blobs = [];
        for (let j = 2; j < V - 2; j++) for (let i = 0; i < U; i++) {
            const k = j * U + i; if (seen[k] || dog[k] > thr) continue;
            const stack = [k]; seen[k] = 1; let n = 0, su = 0, sv = 0, minv = 1e9, maxv = -1e9, sumd = 0; const us = [];
            while (stack.length) { const q = stack.pop(); const qj = Math.floor(q / U), qi = q % U; n++; su += qi; sv += qj; sumd += dog[q]; minv = Math.min(minv, qj); maxv = Math.max(maxv, qj); us.push(qi);
                for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ni = (qi + di + U) % U, nj = qj + dj; if (nj < 0 || nj >= V) continue; const nk = nj * U + ni; if (!seen[nk] && dog[nk] <= thr) { seen[nk] = 1; stack.push(nk); } } }
            if (n < 40) continue;
            const u0 = us[0]; let sdu = 0; for (const uu of us) { let d = uu - u0; if (d > U / 2) d -= U; if (d < -U / 2) d += U; sdu += d; }
            const uc = ((u0 + sdu / n) / U + 1) % 1, vc = sv / n / V;
            const heightV = (maxv - minv + 1) / V, widthU = n / (maxv - minv + 1) / U;
            // the thresholded blob is the dark core; the lens itself extends ~1.6× further (soft rim)
            blobs.push({ th: uc, v: vc, n, sizeMm: 0.5 * heightV * 4.0 * 1.6, aspect: Math.max(1.2, Math.min(4, (heightV * 4.0) / Math.max(0.05, widthU * 6.2831853 * (2 + 4 * vc)))), strength: -sumd / n });
        }
        blobs.sort((a, b) => b.n - a.n);
        const crypts = blobs.filter(b => b.v > 0.08 && b.v < 0.95 && b.sizeMm >= 0.3 && b.aspect >= 1.3).slice(0, 12).map(b => ({ th: b.th, v: b.v, size: Math.max(0.2, Math.min(1.2, b.sizeMm)), aspect: b.aspect, angle: 0, depth: 0.15 + 0.4 * Math.min(0.3, b.strength), soft: 0.6 }));
        // collarette: the brightest ridge per angle between v 0.15 and 0.6 (coarse-smoothed), then Fourier
        const ridge = new Float32Array(U);
        for (let i = 0; i < U; i++) { let best = -1, bv = 0.33; for (let j = Math.floor(0.15 * V); j < Math.floor(0.6 * V); j++) { const val = blurPolar ? fine[j * U + i] - 0.5 * coarse[j * U + i] : 0; if (val > best) { best = val; bv = (j + 0.5) / V; } } ridge[i] = bv; }
        // smooth the ridge track angularly, then project onto 40 harmonics
        const rs = new Float32Array(U); for (let i = 0; i < U; i++) { let s = 0; for (let k = -6; k <= 6; k++) s += ridge[(i + k + U) % U]; rs[i] = s / 13; }
        let r0 = 0; for (let i = 0; i < U; i++) r0 += rs[i]; r0 /= U;
        const harm = [];
        for (let k = 1; k <= 40; k++) { let a = 0, b = 0; for (let i = 0; i < U; i++) { const ang = 6.2831853 * k * i / U; a += (rs[i] - r0) * Math.cos(ang); b += (rs[i] - r0) * Math.sin(ang); } harm.push(2 * a / U, 2 * b / U); }
        g.crypts = crypts; g.coll.r = r0; g.coll.harm = harm; state.collr = target.collr = r0; E.setSlider('collr', 'collr', r0);
        E.atlas.dirty = true; renderFit(); score(); draw();
        say(`detected ${crypts.length} crypts · collarette at v ${r0.toFixed(2)} (${(harm.reduce((s, x) => s + Math.abs(x), 0) / harm.length).toFixed(3)} mean |harm|)`);
    }

    // ---------------- object refinement against pixels ----------------
    async function refineObjects() {
        if (!fit.photo || !fit.pose) { say('solve the pose first'); return; }
        const g = E.genome;
        if (!g.crypts.length) {   // photo fits carry the openings in the splat field: refine that (warm start, more iterations)
            if (!(g.splats || []).length) { say('nothing to refine: run FIT HQ or DETECT first'); return; }
            fit.running = true; state.fitting = true;
            const r = fitSplats(E.Q.splats, 160, true); renderFit(); score(); draw();
            fit.running = false; state.fitting = false; E.resetAccumulation();
            say(`relief refined (warm start): ${r ? r.n : 0} splats · rms ${r ? (Math.sqrt(r.loss) * 1000).toFixed(1) : '?'} µm · ${scoreEl.textContent}`);
            return;
        }
        fit.running = true; state.fitting = true; fit.mask = irisMask();
        let evals = 0;
        const f = async (x, obj) => { obj.th = x[0]; obj.v = x[1]; obj.size = x[2]; obj.aspect = x[3]; obj.angle = x[4]; obj.depth = x[5]; E.atlas.dirty = true; renderFit(); evals++; return 40 - psnr(fit.photo, fit.render, fit.mask, 2); };
        for (let i = 0; i < g.crypts.length && fit.running; i++) {
            const c = g.crypts[i];
            const x0 = [c.th, c.v, c.size, c.aspect, c.angle, c.depth];
            const lo = [c.th - 0.02, c.v - 0.06, 0.15, 1.0, -0.6, 0.08], hi = [c.th + 0.02, c.v + 0.06, 1.3, 4.0, 0.6, 0.35];
            const res = await nelderMead(x0, lo, hi, x => f(x, c), 30);
            f(res.x, c); score(); draw(); say(`crypt ${i + 1}/${g.crypts.length} · ${scoreEl.textContent}`);
        }
        fit.running = false; state.fitting = false; E.resetAccumulation();
        say(`object refinement done · ${evals} renders`);
    }

    // ---------------- texture study (00 §14 step 1): what the generator must reproduce ----------------
    // Statistics of the unwrapped iris, per zone (pupillary v<0.35, ciliary 0.35–0.8, peripheral >0.8):
    // angular power spectrum → dominant fibre spacing (mm) and contrast, ridge/gap luminance ratio,
    // fraction of dark pixels (crypts/gaps), mean Lab, and the colour of ridges vs gaps.
    function textureStats(pix) {
        const U = 1024, V = 128; const rgb = unwrapRGB(pix, U, V);
        const lum = new Float32Array(U * V), lab = new Float32Array(U * V * 3);
        for (let k = 0; k < U * V; k++) { const q = k * 3; lum[k] = (0.299 * rgb[q] + 0.587 * rgb[q + 1] + 0.114 * rgb[q + 2]) / 255; const l = srgbToLab(rgb[q], rgb[q + 1], rgb[q + 2]); lab[q] = l[0]; lab[q + 1] = l[1]; lab[q + 2] = l[2]; }
        const zones = [[0.05, 0.35], [0.35, 0.8], [0.8, 0.95]]; const out = [];
        for (const [v0, v1] of zones) {
            const j0 = Math.floor(v0 * V), j1 = Math.floor(v1 * V); let n = 0;
            // angular spectrum via a 64-point DFT of detrended rows (cheap, enough for the dominant band)
            const spec = new Float32Array(64); let contrast = 0, ridgeL = [0, 0, 0], gapL = [0, 0, 0], nr = 0, ng = 0, dark = 0, meanL = [0, 0, 0];
            for (let j = j0; j < j1; j += 2) {
                const row = new Float32Array(U); let m = 0; for (let i = 0; i < U; i++) { row[i] = lum[j * U + i]; m += row[i]; } m /= U;
                let sd = 0; for (let i = 0; i < U; i++) sd += (row[i] - m) ** 2; sd = Math.sqrt(sd / U); contrast += sd / Math.max(m, 0.02);
                for (let f = 1; f <= 64; f++) { let re = 0, im = 0; const k = f * 8; for (let i = 0; i < U; i += 2) { const ph = 6.2831853 * k * i / U; re += (row[i] - m) * Math.cos(ph); im += (row[i] - m) * Math.sin(ph); } spec[f - 1] += (re * re + im * im); }
                // ridges = local maxima above the row mean; gaps = local minima below
                for (let i = 1; i < U - 1; i++) { const q = (j * U + i) * 3; const v = row[i]; if (v > row[i - 1] && v > row[i + 1] && v > m) { ridgeL[0] += lab[q]; ridgeL[1] += lab[q + 1]; ridgeL[2] += lab[q + 2]; nr++; } if (v < row[i - 1] && v < row[i + 1] && v < m) { gapL[0] += lab[q]; gapL[1] += lab[q + 1]; gapL[2] += lab[q + 2]; ng++; } if (v < 0.6 * m) dark++; meanL[0] += lab[q]; meanL[1] += lab[q + 1]; meanL[2] += lab[q + 2]; }
                n++;
            }
            let best = 0, bestF = 1; for (let f = 0; f < 64; f++) if (spec[f] > best) { best = spec[f]; bestF = (f + 1) * 8; }
            const rMid = 2 + 4 * (v0 + v1) / 2;                       // mm at the zone's middle radius
            const spacingMm = 6.2831853 * rMid / bestF;
            const cnt = n * (U - 2);
            out.push({ zone: [v0, v1], contrast: +(contrast / n).toFixed(3), fibreSpacingMm: +spacingMm.toFixed(3), fibresAround: bestF,
                ridge: ridgeL.map(x => +(x / Math.max(nr, 1)).toFixed(1)), gap: gapL.map(x => +(x / Math.max(ng, 1)).toFixed(1)), darkFrac: +(dark / cnt).toFixed(3), mean: meanL.map(x => +(x / cnt).toFixed(1)) });
        }
        return out;
    }
    async function studyAll(files, opts = {}) {
        const results = [];
        for (const file of files) {
            try { await loadImage('ref/' + file, file); results.push({ file, photo: textureStats(fit.photo) }); say('study ' + results.length + '/' + files.length + ' ' + file); }
            catch (e) { results.push({ file, error: String(e) }); }
            await yieldNow();
        }
        if (opts.download !== false) await saveRef('texture-study.json', results);
        return results;
    }

    // ---------------- benchmark: every reference with its stored alignment ----------------
    const benchResults = (() => { try { return JSON.parse(localStorage.getItem('irisBench') || '[]'); } catch (e) { return []; } })();
    const cases = {};   // file → { align, id, scores } for the casebook
    async function runBench(files, opts = {}) {
        const iters = opts.iters || 60, doRefine = !!opts.refine;
        // f0 sets both halves; f0term overrides the objective term alone, so the genes can be ablated
        // against the term (v65 lost structure and we need to know which half did it)
        if (opts.f0 !== undefined) { fit.strandGenes = !!opts.f0; fit.strandTerm = !!opts.f0; }
        if (opts.f0term !== undefined) fit.strandTerm = !!opts.f0term;
        if (opts.f0weight !== undefined) fit.strandWeight = opts.f0weight;
        if (opts.routed !== undefined) fit.routed = !!opts.routed;
        if (opts.seededLoss !== undefined) fit.seededLoss = opts.seededLoss;
        if (opts.f2 !== undefined) fit.placement = !!opts.f2;
        const tag = opts.tag || new Date().toISOString().slice(0, 16);
        const rows = [];
        fit.benchRunning = true; state.fitting = true;
        for (const entry of files) {
            if (!fit.benchRunning) break;
            const file = typeof entry === 'string' ? entry : entry.name;
            const src = typeof entry === 'string' ? 'ref/' + entry : entry.src;
            const t0 = performance.now();
            try {
                resetForFreshFit();                          // every case starts from the same place, whatever ran before
                await loadImage(src, file);
                solvePose();
                const s0 = score();
                await fitGlobal(iters); if (!fit.benchRunning) break;
                if (doRefine) await refineObjects();
                const s1 = score();
                const dg = diagnostics() || {};
                rows.push({ tag, file, quality: E.quality, match2: +s1.match2.toFixed(1), grad: +s1.grad.toFixed(3), match0: +s0.match.toFixed(1), match: +s1.match.toFixed(1), ssim: +s1.ssim.toFixed(3), ssim2: +s1.ssim2.toFixed(3), psnr: +s1.psnr.toFixed(2), dL: +s1.dL.toFixed(1), dab: +s1.dab.toFixed(1), crypts: E.genome.crypts.length, ridges: 1 + (E.genome.ridges || []).length, splats: (E.genome.splats || []).length, hcorr: +s1.hcorr.toFixed(3),
                    // §22 diagnostics: contrast deficit, floor error, radial profile, strand-scale spectrum
                    sigmaRatio: dg.sigmaRatio, sigmaPhoto: dg.sigmaPhoto, sigmaRender: dg.sigmaRender, vmaxMin: dg.vmaxMin, coverage: dg.coverage, darkErr: dg.darkErr, darkThr: dg.darkThr, darkFrac: dg.darkFrac, hfRatio: dg.hfRatio, hfPhoto: dg.hfPhoto, hfRender: dg.hfRender, resolvedMm: dg.resolvedMm, hfLap: s1.hfLap, hfLapPhoto: s1.hfLapPhoto, hfLapRender: s1.hfLapRender, strandCorr: s1.strandCorr, bandCorr: s1.bandCorr, bandRatio: s1.bandRatio, evidence: s1.evidence, placement: fit.placement ? fit.f2 : null, routed: !!fit.routed, seededLoss: fit.routed ? fit.seededLoss : null, route: fit.routed ? fit.routeLog : null, bandDL: dg.bandDL, bandWorst: dg.bandWorst, specAgree: dg.specAgree, spacingRatio: dg.spacingRatio, zones: dg.zones,
                    contrastPhoto: s1.contrastPhoto, contrastRender: s1.contrastRender, ridgeGapPhoto: s1.ridgeGapPhoto, ridgeGapRender: s1.ridgeGapRender,
                    engine: E.ENGINE_VERSION, alignPx: fit.pose && fit.pose.align ? fit.pose.align.max : null, secs: +((performance.now() - t0) / 1000).toFixed(1) });
                cases[file] = makeCase(file, tag, s1);
                say(`bench ${rows.length}/${files.length} · ${file} · MATCH ${s1.match.toFixed(0)} %`);
            } catch (e) { rows.push({ tag, file, error: String(e) }); say('bench error ' + file + ': ' + e); }
            await yieldNow();
        }
        fit.benchRunning = false; fit.running = false; state.fitting = false;
        benchResults.push(...rows);
        try { localStorage.setItem('irisBench', JSON.stringify(benchResults.slice(-500))); } catch (e) {}
        const ok = rows.filter(r => !r.error); const mean = ok.length ? ok.reduce((s, r) => s + r.match, 0) / ok.length : 0;
        const above = ok.filter(r => r.match >= 80).length;
        const mean2 = ok.length ? ok.reduce((s2, r) => s2 + (r.match2 || 0), 0) / ok.length : 0;
        say(`bench done · ${ok.length} photos · mean MATCH2 ${mean2.toFixed(1)} % (MATCH ${mean.toFixed(1)}) · ${above} ≥ 80 %`);
        { const mn = k => { const v = ok.map(r => r[k]).filter(x => typeof x === 'number'); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN; };
          say(`diagnostics · σ R/P ${mn('sigmaRatio').toFixed(3)} · floors ${mn('darkErr').toFixed(1)} L* · spectrum agree ${mn('specAgree').toFixed(3)} · strand energy R/P ${mn('hfRatio').toFixed(2)} · spacing R/P ${mn('spacingRatio').toFixed(2)} · worst band ${mn('bandWorst').toFixed(1)} L*`); }
        const at60 = ok.filter(r => r.match >= 60).length;
        say(`success rate: ${ok.length ? Math.round(100 * above / ok.length) : 0} % at MATCH ≥ 80, ${ok.length ? Math.round(100 * at60 / ok.length) : 0} % at ≥ 60`);
        const CSVC = ['tag', 'file', 'match2', 'match', 'ssim', 'ssim2', 'grad', 'hcorr', 'sigmaRatio', 'specAgree', 'hfRatio', 'hfLap', 'strandCorr', 'spacingRatio', 'darkErr', 'coverage', 'vmaxMin', 'bandWorst', 'contrastRender', 'contrastPhoto', 'psnr', 'dL', 'dab', 'crypts', 'ridges', 'splats', 'alignPx', 'secs'];
        const csv = CSVC.join(',') + '\n' + rows.map(r => r.error ? `${r.tag},${r.file},` + ','.repeat(CSVC.length - 3) + 'ERROR' : CSVC.map(c => r[c] === undefined || r[c] === null ? '' : r[c]).join(',')).join('\n');
        if (opts.save !== false) { await saveRef('cases.json', Object.assign({}, bundledCases || {}, cases)); await saveRef('bench-' + tag.replace(/[: ]/g, '-') + '.json', rows); }
        // §22: the version archive. benchIsolated({ ver: 'v63-…' }) writes the rows straight into
        // versions/<ver>/bench/, then `python3 versions/snapshot.py <ver>` seals the source with them.
        const ver = opts.ver || (() => { try { return localStorage.getItem('irisVersion') || ''; } catch (e) { return ''; } })();
        if (ver && opts.save !== false) {
            await saveRef(`versions/${ver}/bench-${(opts.tag || 'run')}.json`, rows);
            await saveRef(`versions/${ver}/cases.json`, cases);   // this run's fits, not whatever ref/cases.json holds later
        }
        if (opts.download) { const a = document.createElement('a'); a.download = `iris-bench-${tag.replace(/[: ]/g, '-')}.csv`; a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.click(); }
        return { rows, mean, above, csv, cases };
    }
    // one fitted eye as a stored case: alignment, view, genome, fields, scores and texture statistics
    function makeCase(file, tag, scores) {
        const W = fit.W, H = fit.H, P = fit.pupil, L = fit.limbus, C = fit.catch;
        E.applySlidersToGenome();
        return { tag, align: { pupil: [P.x / W, P.y / H, P.r / H], limbus: [L.x / W, L.y / H, L.rx / H, L.ry / H, L.ang], catch: [C.x / W, C.y / H] },
            view: { pupil: state.pupil, lightAngle: state.lightAngle, lightElev: state.lightElev, srcType: state.srcType, srcSize: state.srcSize, ambient: state.ambient, lid: state.lid, ev: state.ev, fstop: state.fstop, focus: state.focus, kelvin: state.kelvin, sat: state.sat, zoom: state.zoomPhoto, rot: state.camRot.slice(), viewRect: state.view.slice(), pupilOff: state.pupilOff.slice(), align: fit.pose && fit.pose.align || null },
            genome: (() => { const g = JSON.parse(JSON.stringify(Object.assign({}, E.genome, { fields: undefined }))); delete g.fields; return g; })(),
            fieldsEnc: E.encodeFields(E.genome), scores, texture: textureStats(fit.photo), quality: E.quality };
    }
    // Bake the isolated macros as the shipped presets: FIT HQ (CAPTURE quality — 4096×1024 atlas, 8000
    // splats, 32 LIC steps, 3 strand layers, 1280 px fit) on each, stored in ref/presets.json so the
    // Presets menu loads a whole fitted iris rather than a procedural colour start.
    async function bakePresets(files = ISOLATED) {
        const t0 = performance.now(), tag = 'preset-' + new Date().toISOString().slice(0, 10);
        // CAPTURE *before* the first loadImage: loadImage scales the photo to the current Q.fitPx, and
        // fitHQ only switches quality afterwards — so the first eye would be fitted at 640 px while the
        // rest got 1280. (Found the hard way: 22 097 strand samples on eye 1 against 97 138 on eye 2.)
        if (E.quality !== 'capture') { E.setQuality('capture'); fit.map = null; fit.proxy = null; }
        fit.benchRunning = true;
        for (const file of files) {
            if (!fit.benchRunning) break;
            try {
                resetForFreshFit();
                await loadImage('ref/' + file, file);
                await fitHQ();
                const s1 = score(); diagnostics();
                cases[file] = makeCase(file, tag, s1);
                say(`baked ${file} · MATCH2 ${s1.match2.toFixed(0)} % (M1 ${s1.match.toFixed(0)}) at ${E.quality}`);
            } catch (e) { say('bake failed ' + file + ': ' + e); }
            await yieldNow();
        }
        fit.benchRunning = false;
        await saveRef('cases.json', Object.assign({}, bundledCases || {}, cases));
        await saveRef('presets.json', Object.fromEntries(files.filter(f => cases[f]).map(f => [f, cases[f]])));
        say(`presets baked · ${files.length} eyes in ${((performance.now() - t0) / 1000).toFixed(0)} s → ref/presets.json`);
        return cases;
    }
    function exportCases() { return saveRef('cases.json', Object.assign({}, bundledCases || {}, cases)); }
    // bulk test of the user's own photos: pick many files, fit each, report the success rate
    function benchFiles() {
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
        inp.onchange = () => { const list = Array.from(inp.files).map(f => ({ name: f.name, src: URL.createObjectURL(f) })); if (list.length) runBench(list, { iters: 60, tag: 'upload' }); };
        inp.click();
    }
    async function benchAll(opts) {
        const list = await fetch('ref/refs.json').then(r => r.json());
        return runBench(list.map(r => r.file).filter(f => !/coloboma|kayser|arcus|complete-heterochromia|brown-pair/.test(f)), opts);
    }
    // the isolated-on-black macros: no lids, no sclera, no perspective — the engine's own errors only
    const ISOLATED = ['09-blue-green-isolated.jpg', '25-green-amber-ring-isolated.jpg', '26-green-crypts-isolated.jpg', '35-grey-green-isolated.jpg'];
    async function benchIsolated(opts) { return runBench(ISOLATED, Object.assign({ tag: 'iso' }, opts || {})); }

    // ---------------- casebook: every case rendered live from its stored alignment + ID ----------------
    let bundledCases = null;
    async function openCasebook() {
        if (!bundledCases) { try { bundledCases = await fetch('ref/cases.json').then(r => r.ok ? r.json() : {}); } catch (e) { bundledCases = {}; } }
        const all = Object.assign({}, bundledCases, cases);
        const files = Object.keys(all).sort(); if (!files.length) { say('no cases yet: run BENCH ALL first'); return; }
        let cb = $('casebook'); if (!cb) { cb = document.createElement('div'); cb.id = 'casebook'; document.body.appendChild(cb); }
        cb.innerHTML = '<div class="cb-head"><span>CASEBOOK · ' + files.length + ' cases</span><span id="cb-stat"></span><button class="action-btn" id="cb-close">×</button></div><div class="cb-grid" id="cb-grid"></div>';
        cb.classList.remove('hidden');
        $('cb-close').onclick = () => cb.classList.add('hidden');
        const grid = $('cb-grid'); let sum = 0, n = 0, above = 0;
        for (const file of files) {
            const c = all[file]; const card = document.createElement('div'); card.className = 'cb-card';
            const m = c.scores ? c.scores.match : 0; sum += m; n++; if (m >= 80) above++;
            card.innerHTML = `<canvas width="300" height="110"></canvas><div class="cb-cap"><b>${file.replace('.jpg', '')}</b><br>MATCH2 ${(c.scores && c.scores.match2 !== undefined ? c.scores.match2 : m).toFixed(0)} % · M1 ${m.toFixed(0)} · SSIM ${(c.scores ? c.scores.ssim : 0).toFixed(2)} · grad ${(c.scores && c.scores.grad !== undefined ? c.scores.grad : 0).toFixed(2)} · Δab ${(c.scores ? c.scores.dab : 0).toFixed(1)}<br><span class="cb-issues">${caseIssues(c)}</span></div>`;
            grid.appendChild(card);
            card.querySelector('canvas').onclick = () => { openCase(file, c); cb.classList.add('hidden'); };
            // thumbnail: photo | render | diff, rendered live from the stored case
            renderCaseThumb(file, c, card.querySelector('canvas'));
            await yieldNow();
        }
        $('cb-stat').textContent = `mean MATCH ${(n ? sum / n : 0).toFixed(1)} % · ${above}/${n} ≥ 80 %`;
    }
    // the case's own diagnosis: which half fails and what the texture stats say
    function caseIssues(c) {
        if (!c.scores) return '';
        const s = c.scores, t = c.texture || [], ci = t[1] || {};
        const issues = [];
        if (s.dab > 8) issues.push('colour: chroma off ' + s.dab.toFixed(0));
        if (s.dL > 6) issues.push('tone: L* off ' + s.dL.toFixed(0));
        if (s.ssim < 0.3) issues.push('structure: fibre layout unmatched');
        if (s.hcorr !== undefined && s.hcorr < 0.3) issues.push('relief: height r ' + s.hcorr.toFixed(2));
        if (ci.contrast > 0.25) issues.push('photo fibres high-contrast (' + ci.contrast + ')');
        if (ci.darkFrac > 0.12) issues.push('many crypts/gaps (' + Math.round(ci.darkFrac * 100) + ' %)');
        return issues.join(' · ') || 'no flagged issue';
    }
    async function renderCaseThumb(file, c, cvs) {
        const octx = cvs.getContext('2d');
        try {
            await loadImage(c.src || ('ref/' + file), file);
            const a = c.align, W = fit.W, H = fit.H;
            fit.pupil = { x: a.pupil[0] * W, y: a.pupil[1] * H, r: a.pupil[2] * H };
            fit.limbus = { x: a.limbus[0] * W, y: a.limbus[1] * H, rx: a.limbus[2] * H, ry: a.limbus[3] * H, ang: a.limbus[4] || 0 };
            fit.catch = { x: a.catch[0] * W, y: a.catch[1] * H };
            E.importID({ v: 2, genome: c.genome, fields: c.fieldsEnc || {}, view: c.view });
            state.camRot = c.view.rot || [0, 0]; state.useRot = true; state.view = c.view.viewRect || [0, 0, 1, 1]; state.zoomPhoto = target.zoomPhoto = c.view.zoom; state.pupilOff = c.view.pupilOff ? c.view.pupilOff.slice() : [0.25, 0.15];
            state.sat = 1.0;
            for (const k of ['pupil', 'lightAngle', 'lightElev', 'srcSize', 'ambient', 'lid', 'ev', 'fstop', 'focus', 'kelvin', 'sat']) if (c.view[k] !== undefined) { state[k] = c.view[k]; target[k] = c.view[k]; }
            state.srcType = c.view.srcType;
            fit.mask = null; fit.pose = { restored: true };
            alignLoop();
            renderFit();
            const w = 100, h = 110; const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H; const tctx = tmp.getContext('2d');
            const put = (pix, slot) => { const im = new ImageData(new Uint8ClampedArray(pix), W, H); tctx.putImageData(im, 0, 0); const L = fit.limbus; const s = Math.max(2 * L.rx, 2 * L.ry) * 1.15; octx.drawImage(tmp, L.x - s / 2, L.y - s / 2, s, s, slot * w, 0, w, h); };
            put(fit.photo, 0); put(fit.render, 1);
            const d = new Uint8ClampedArray(W * H * 4); for (let i = 0; i < W * H; i++) { const o = i * 4; const dd = Math.abs(fit.photo[o] - fit.render[o]) + Math.abs(fit.photo[o + 1] - fit.render[o + 1]) + Math.abs(fit.photo[o + 2] - fit.render[o + 2]); d[o] = Math.min(255, dd); d[o + 1] = Math.min(255, dd * 0.5); d[o + 2] = 0; d[o + 3] = 255; }
            put(d, 2);
        } catch (e) { octx.fillStyle = '#400'; octx.fillRect(0, 0, 300, 110); }
    }
    function openCase(file, c) { panel.classList.remove('hidden'); renderCaseThumb(file, c, document.createElement('canvas')).then(() => { score(); fit.mode = 3; $('fit-view').textContent = 'SPLIT'; draw(); }); }

    // ---------------- wiring ----------------
    $('fit-open').onclick = () => { panel.classList.remove('hidden'); if (!fit.photo) say('load a photo (PHOTO… or a reference)'); };
    $('fit-close').onclick = () => { panel.classList.add('hidden'); fit.running = false; fit.benchRunning = false; state.fitting = false; state.useRot = false; state.view = [0, 0, 1, 1]; E.resetAccumulation(); };
    $('fit-load').onclick = () => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.onchange = () => { const fl = inp.files[0]; if (fl) loadImage(URL.createObjectURL(fl), fl.name); }; inp.click(); };
    $('fit-view').onclick = () => { fit.mode = (fit.mode + 1) % 6; $('fit-view').textContent = ['PHOTO', 'RENDER', 'DIFF', 'SPLIT', 'POLAR', 'HEIGHT'][fit.mode]; draw(); };
    $('fit-solve').onclick = solvePose;
    $('fit-auto').onclick = () => { autoAlign(); draw(); };
    $('fit-save').onclick = saveAlignment;
    $('fit-alignout').onclick = exportAlignments;
    $('fit-bench').onclick = () => benchAll({ iters: 60 });
    $('fit-benchiso').onclick = () => benchIsolated({ iters: 120 });
    $('fit-diag').onclick = () => { renderFit(); sayDiagnostics(); };
    $('fit-files').onclick = benchFiles;
    $('fit-study').onclick = async () => { const list = await fetch('ref/refs.json').then(r => r.json()); studyAll(list.map(r => r.file)); };
    $('fit-cases').onclick = exportCases;
    $('fit-casebook').onclick = openCasebook;
    $('fit-global').onclick = () => fitGlobal(120, { fromCurrent: true });   // the button refines what is loaded; benches start canonical
    $('fit-detect').onclick = () => { if (!fit.pose) solvePose(); heightFromPhoto(); structuresFromHeight(); fitSplats(fit.splatBudget || E.Q.splats); renderFit(); score(); draw(); };
    $('fit-refine').onclick = refineObjects;
    $('fit-stop').onclick = () => { fit.running = false; fit.benchRunning = false; };
    fetch('ref/refs.json').then(r => r.json()).then(list => {
        const sel = $('fit-ref');
        for (const r of list) { const o = document.createElement('option'); o.value = r.file; o.textContent = r.file.replace('.jpg', ''); sel.appendChild(o); }
        sel.onchange = () => { if (sel.value) loadImage('ref/' + sel.value, sel.value).catch(() => {}); };
    }).catch(() => {});
    E.fit = { fit, solvePose, renderFit, score, diagnostics, sayDiagnostics, angularSpectrum, whiten, peakIn, bandPower, fftInPlace, strandEnergy, strandBand, strandCorr, strandTaps, placementFromPhoto, clearPlacement, carrierPredict, canonicalStart, resetForFreshFit, fingerprint, hiResPolar, photoRoute, bandScores, bandsOf, routedFit, blurF, fitGlobal, detectStructures, refineObjects, unwrap, profiles, loadImage, autoAlign, saveAlignment, exportAlignments, runBench, benchAll, benchIsolated, ISOLATED, alignStore, ssimQuarter, draw, textureStats, studyAll, cases, exportCases, bakePresets, makeCase, renderCaseThumb, openCasebook, unwrapRGB, isIsolated, alignIsolated, materialFromPhoto, heightFromPhoto, flowFromPhoto, structuresFromHeight, fitHQ, ssimAt, gradAgree, bandStats, cellStats, projectPoint, alignLoop, getMap, heightProxy, renderHeight, heightCorrelation, ridgesFromProxy, dpClosedPath, fitSplats, initSplats, coarseModelOnGrid, rimFromPhoto, rimStat, renderMask, fitCircle, fitEllipse, boundariesFromClasses };
})();
