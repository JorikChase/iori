// Iris Engine — explicit strands (study/08 Phase S, S1): a deterministic grower.
// Evenly-spaced streamlines (Jobard & Lefer 1997) over the engine's own flow and spacing fields, in the polar
// tissue domain: u = angle / 2π (periodic), v = 0 at the pupil edge … 1 at the root, r = 2 + 4·v mm, so one step
// of (across, along) mm is (Δu · 2π·r, Δv · 4). Same fields as the LIC strands — but the output is curves with
// identity: a strand is { pts: [[u, v], …] (u unwrapped across the seam), w (mm), b (brightness), id }.
//
// Priors from S0 (study/08 §4): centre-to-centre spacing ≈ 0.10 mm, width ≈ 0.53 × spacing, three in four strands
// end beside another strand (that is d_test: a streamline stops when it comes closer than dTest × d_sep to a
// neighbour), short runs, a median ≈ 15° off the flow with a gentle wave (amplitude ≈ 5 % of a ≈ 0.3 mm wavelength).
// Pure function of (seed, fields, genes): no DOM, no GL.
(function () {
    'use strict';
    const TAU = 6.283185307179586;
    function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
    const rMM = v => 2.0 + 4.0 * v;

    // bilinear sampler with GL's texel-centre convention, wrapped in u, clamped in v
    function sampler(data, w, h) {
        return (u, v) => {
            const x = u * w - 0.5, y = Math.min(h - 1, Math.max(0, v * h - 0.5));
            const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, y1 = Math.min(h - 1, y0 + 1);
            const xa = ((x0 % w) + w) % w, xb = (xa + 1) % w;
            return (1 - fy) * ((1 - fx) * data[y0 * w + xa] + fx * data[y0 * w + xb]) + fy * ((1 - fx) * data[y1 * w + xa] + fx * data[y1 * w + xb]);
        };
    }
    // seeded smooth noise in [-1, 1], periodic in u (the wander of a strand off the flow field)
    function wanderNoise(R, nu, nv) {
        const d = new Float32Array(nu * nv); for (let i = 0; i < d.length; i++) d[i] = R() * 2 - 1;
        const s = t => t * t * (3 - 2 * t);
        return (u, v) => {
            const x = u * nu, y = Math.min(nv - 1.001, Math.max(0, v * (nv - 1)));
            const x0 = Math.floor(x), y0 = Math.floor(y), fx = s(x - x0), fy = s(y - y0);
            const xa = ((x0 % nu) + nu) % nu, xb = (xa + 1) % nu, y1 = y0 + 1;
            return (1 - fy) * ((1 - fx) * d[y0 * nu + xa] + fx * d[y0 * nu + xb]) + fy * ((1 - fx) * d[y1 * nu + xa] + fx * d[y1 * nu + xb]);
        };
    }

    // opts: { seed, flow(u,v) → angle from radial (rad), spacing(u,v) → mm, sep, dTest, run, wander, wave, waveLen,
    //         width, step, vMin, vMax, maxStrands }
    function grow(opts) {
        const R = mulberry32((opts.seed | 0) * 2654435761 + 97);
        const sepMul = opts.sep === undefined ? 1.6 : opts.sep, dTest = opts.dTest === undefined ? 0.8 : opts.dTest;
        const runMean = opts.run === undefined ? 0.7 : opts.run, wander = opts.wander === undefined ? 0.25 : opts.wander;
        const waveAmp = opts.wave === undefined ? 0.014 : opts.wave, waveLen = opts.waveLen || 0.3, widthK = opts.width === undefined ? 0.53 : opts.width;
        const vMin = opts.vMin === undefined ? 0.015 : opts.vMin, vMax = opts.vMax === undefined ? 0.985 : opts.vMax;
        const maxStrands = opts.maxStrands || 20000;
        const noise = wanderNoise(R, 96, 9);
        const dSep = (u, v) => Math.min(0.30, Math.max(0.03, sepMul * opts.spacing(u, v)));
        const dirAt = (u, v) => opts.flow(u, v) + wander * noise(u, v);

        // spatial hash in (u, v); cells sized for the largest separation at the pupil edge (wider in mm further out)
        const CELL = 0.30, NV = Math.ceil(4 / CELL), NU = Math.floor(TAU * rMM(0) / CELL);
        const grid = new Map();
        const key = (iu, iv) => iv * NU + ((iu % NU) + NU) % NU;
        const wrap = u => u - Math.floor(u);
        function add(u, v, sid) { const k = key(Math.floor(wrap(u) * NU), Math.floor(v * NV)); let c = grid.get(k); if (!c) grid.set(k, c = []); c.push(u, v, sid); }
        // is any stored point (of another strand) closer than d mm?
        function tooClose(u, v, d, self) {
            const iu = Math.floor(wrap(u) * NU), iv = Math.floor(v * NV), r = rMM(v), d2 = d * d;
            for (let dj = -1; dj <= 1; dj++) { const jv = iv + dj; if (jv < 0 || jv >= NV) continue;
                for (let di = -1; di <= 1; di++) { const c = grid.get(key(iu + di, jv)); if (!c) continue;
                    for (let i = 0; i < c.length; i += 3) { if (c[i + 2] === self) continue;
                        let du = c[i] - u; du -= Math.round(du); const a = du * TAU * r, b = (c[i + 1] - v) * 4;
                        if (a * a + b * b < d2) return true; } } }
            return false;
        }
        const step = opts.step || 0.03;
        function integrate(u0, v0, sid) {
            const want = Math.max(0.15, -Math.log(1 - R() * 0.999) * runMean);      // run length ~ exponential (S0: short runs)
            const halves = [];
            for (const sgn of [1, -1]) {
                const pts = []; let u = u0, v = v0, len = 0;
                while (len < want / 2) {
                    // midpoint step along the (wandering) flow
                    const t0 = dirAt(u, v), r0 = rMM(v);
                    const um = u + sgn * 0.5 * step * Math.sin(t0) / (TAU * r0), vm = v + sgn * 0.5 * step * Math.cos(t0) / 4;
                    const t1 = dirAt(um, vm), r1 = rMM(vm);
                    const un = u + sgn * step * Math.sin(t1) / (TAU * r1), vn = v + sgn * step * Math.cos(t1) / 4;
                    if (vn < vMin || vn > vMax) break;
                    if (tooClose(un, vn, dTest * dSep(un, vn), sid)) break;
                    u = un; v = vn; len += step; pts.push([u, v]);
                }
                halves.push(pts);
            }
            return halves[1].reverse().concat([[u0, v0]], halves[0]);
        }
        const strands = [], queue = [];
        function tryStrand(u, v) {
            if (v < vMin || v > vMax || strands.length >= maxStrands) return;
            if (tooClose(u, v, dSep(u, v), -1)) return;
            const sid = strands.length, pts = integrate(u, v, sid);
            if (pts.length < 4) return;
            for (const p of pts) add(p[0], p[1], sid);
            strands.push({ id: sid, pts }); queue.push(sid);
        }
        // first seeds: a jittered ring in the mid ciliary zone, then every strand offers seeds d_sep to both sides
        for (let i = 0; i < 48; i++) tryStrand((i + R()) / 48, 0.35 + 0.3 * R());
        while (queue.length) {
            const s = strands[queue.shift()], P = s.pts;
            for (let k = 0; k < P.length; k += 2) {
                const [u, v] = P[k], t = dirAt(u, v), r = rMM(v), d = dSep(u, v) * 1.02;
                for (const sgn of [1, -1]) tryStrand(u + sgn * d * Math.cos(t) / (TAU * r), v - sgn * d * Math.sin(t) / 4);
            }
        }
        // finish: a gentle wave across each strand, its width and brightness
        for (const s of strands) {
            const P = s.pts, ph = R() * TAU, amp = waveAmp * (0.5 + R()), wl = waveLen * (0.7 + 0.6 * R());
            let arc = 0; const out = [];
            for (let k = 0; k < P.length; k++) {
                const a = P[Math.max(0, k - 1)], b = P[Math.min(P.length - 1, k + 1)], r = rMM(P[k][1]);
                let tx = (b[0] - a[0]) * TAU * r, ty = (b[1] - a[1]) * 4; const L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L;
                const ends = Math.min(1, Math.min(k, P.length - 1 - k) / 3);           // no wave at the very ends (they sit beside a neighbour)
                const off = amp * ends * Math.sin(TAU * arc / wl + ph);
                out.push([P[k][0] - ty * off / (TAU * r), P[k][1] + tx * off / 4]);
                if (k < P.length - 1) arc += step;
            }
            s.pts = out;
            const mid = P[P.length >> 1];
            s.w = widthK * dSep(mid[0], mid[1]) * (0.75 + 0.5 * R());
            s.b = 0.7 + 0.3 * R();
            s.len = (P.length - 1) * step;
        }
        return strands;
    }
    window.IrisStrands = { grow, sampler };
})();
