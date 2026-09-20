// K0 — the knob liveness test (spec §32).
//
// For each of the 27 UI sliders: drive it the way a hand does (set the DOM value, dispatch `input`, so every side
// effect listener — atlas.dirty, regenerateCrypts, loadSeedIntoSliders — runs), skip the render loop's easing by
// copying target → state, render one fit frame, and measure how far the picture moved. Run in both models, the table
// says which knobs the tissue layer model killed.
//
// Loaded on demand, touches no engine file:
//     const K = await import('./tools/knob_probe.js'); await K.run();
//
// Metric: mean and p95 |ΔY| (sRGB code values, 0–255) inside the iris mask, and the same over the whole frame. The
// mask is the engine's own (limbus 0.92, pupil 1.08, clipped speculars out) so the numbers compare with fit.js's.

const E = () => window.__irisEngine;

// slider id → state key, as index.html binds them (the `bind(...)` block)
export const KNOBS = [
    ['seed', 'seed'], ['pupil', 'pupil'], ['elev', 'lightElev'], ['light', 'lightAngle'],
    ['srcsize', 'srcSize'], ['ambient', 'ambient'], ['lid', 'lid'],
    ['ev', 'ev'], ['fstop', 'fstop'], ['focus', 'focus'], ['kelvin', 'kelvin'], ['grain', 'grain'], ['bloom', 'bloom'],
    ['pigment', 'pigment'], ['stroma', 'stroma'], ['pheo', 'pheo'], ['yellow', 'yellow'], ['mie', 'mie'],
    ['ring', 'ring'], ['warp', 'warp'], ['collr', 'collr'], ['crypt', 'crypt'], ['furrow', 'furrow'],
    ['relief', 'relief'], ['blcol', 'blColour'], ['blrel', 'blRelief'], ['blflow', 'blFlow'],
];
// keys whose effect lives in the baked atlas (index.html BAKE_KEYS, plus the two the loop handles on its own)
const BAKE = new Set(['warp', 'collr', 'furrow', 'pigment', 'stroma', 'pheo', 'yellow', 'blColour', 'blRelief', 'blFlow', 'crypt', 'seed']);
// what each knob is expected to reach, for reading the table
const FAMILY = {
    seed: 'procedural', pigment: 'procedural', stroma: 'procedural', pheo: 'procedural', yellow: 'procedural',
    mie: 'procedural', ring: 'procedural', warp: 'procedural', collr: 'procedural', crypt: 'procedural',
    furrow: 'procedural', relief: 'procedural', blColour: 'procedural', blRelief: 'procedural', blFlow: 'procedural',
    pupil: 'geometry', lightElev: 'light', lightAngle: 'light', srcSize: 'light', ambient: 'light', lid: 'light',
    ev: 'camera', fstop: 'camera', focus: 'camera', kelvin: 'camera', grain: 'camera', bloom: 'camera',
};

function irisMask() {
    const F = E().fit, fit = F.fit, W = fit.W, H = fit.H, L = fit.limbus, P = fit.pupil;
    const m = new Uint8Array(W * H), ca = Math.cos(L.ang), sa = Math.sin(L.ang);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const dx = x - L.x, dy = y - L.y, ex = (ca * dx + sa * dy) / L.rx, ey = (-sa * dx + ca * dy) / L.ry;
        const o = (y * W + x) * 4;
        const spec = fit.photo[o] > 235 && fit.photo[o + 1] > 235 && fit.photo[o + 2] > 225;
        m[y * W + x] = (ex * ex + ey * ey < 0.92 * 0.92) && Math.hypot(x - P.x, y - P.y) >= P.r * 1.08 && !spec ? 1 : 0;
    }
    return m;
}
const lum = (a, o) => 0.2126 * a[o] + 0.7152 * a[o + 1] + 0.0722 * a[o + 2];

// ---------------------------------------------------------------- the two render paths
// `fit`   = one frame in reference mode — exactly what fit.js's renderFit and every bench measure.
// `accum` = N frames of the interactive path (u_ref = 0), which is the only way the stochastic knobs reach a pixel:
//           the shader gates jitter, depth of field (fstop / focus), CA, bloom and grain behind `hq = u_ref < 0.5`,
//           so in the fit render they are flat zero however far the slider moves. Same ping-pong as render().
let ACC = null;
function accumTargets(w, h) {
    const gl = E().gl;
    if (ACC && ACC.w === w && ACC.h === h) return ACC;
    if (ACC) { ACC.tex.forEach(t => gl.deleteTexture(t)); ACC.fb.forEach(f => gl.deleteFramebuffer(f)); gl.deleteTexture(ACC.outTex); gl.deleteFramebuffer(ACC.outFB); }
    gl.getExtension('EXT_color_buffer_float');
    const tex = [], fb = [];
    for (let i = 0; i < 2; i++) {
        const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
        tex.push(t); fb.push(f);
    }
    const outTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, outTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const outFB = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, outFB);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, outTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return (ACC = { w, h, tex, fb, outTex, outFB });
}
export function renderAccum(frames = 32) {
    const Eng = E(), gl = Eng.gl, S = Eng.state, fit = Eng.fit.fit, w = fit.W, h = fit.H, A = accumTargets(w, h);
    if (Eng.atlas.dirty) Eng.bakeAtlas();
    for (let f = 0; f < frames; f++) {
        const read = f % 2, write = (f + 1) % 2;
        Eng.drawPhotoFrame(A.fb[write], w, h, f, A.tex[read], { ref: 0, rot: S.camRot, zoom: S.zoomPhoto, view: S.view, specular: fit.isolated ? 0 : 1, edgeFade: 0 });
        if (f === frames - 1) Eng.drawPost(A.outFB, A.tex[write], w, h, f, { ref: 0 });
    }
    const px = new Uint8Array(w * h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, A.outFB); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, Eng.canvas.width, Eng.canvas.height);
    const out = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) out.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    return out;
}

function delta(a, b, mask) {
    const n = mask.length, dIn = [], dAll = [];
    for (let i = 0; i < n; i++) {
        const d = Math.abs(lum(a, i * 4) - lum(b, i * 4));
        dAll.push(d); if (mask[i]) dIn.push(d);
    }
    const stat = arr => {
        if (!arr.length) return { mean: 0, p95: 0 };
        const s = Float64Array.from(arr).sort();
        return { mean: +(arr.reduce((x, y) => x + y, 0) / arr.length).toFixed(3), p95: +s[Math.floor(0.95 * (s.length - 1))].toFixed(3) };
    };
    return { iris: stat(dIn), frame: stat(dAll) };
}

// The genome must be part of the snapshot: the seed slider calls reseedProcedural, which *replaces* the genome object
// (the fitted fields survive only by reference), and the crypt slider calls regenerateCrypts, which mutates
// `genome.crypts` in place. Keeping the old object plus those two fields restores the fitted eye exactly.
const snapshot = () => {
    const g = E().genome;
    return { state: { ...E().state }, target: { ...E().target }, genome: g, crypts: g && g.crypts, cryptDensity: g && g.cryptDensityUsed };
};
function restore(snap) {
    const S = E().state, T = E().target;
    for (const k in snap.state) S[k] = snap.state[k];
    for (const k in snap.target) T[k] = snap.target[k];
    if (snap.genome) { snap.genome.crypts = snap.crypts; snap.genome.cryptDensityUsed = snap.cryptDensity; E().genome = snap.genome; }
    E().atlas.dirty = true;
    for (const [id, key] of KNOBS) {                                       // the panel back in step with the state
        const el = document.getElementById('param-' + id), out = document.getElementById('val-' + id);
        if (el && snap.target[key] !== undefined) el.value = snap.target[key];
        if (out && el) out.innerText = el.value;
    }
}

// drive one knob by `frac` of its slider range and measure the move in both render paths
function probe(id, key, base, mask, frac, frames) {
    const el = document.getElementById('param-' + id);
    if (!el) return { id, key, error: 'no slider' };
    const lo = parseFloat(el.min), hi = parseFloat(el.max), origin = parseFloat(el.value);
    const step = (hi - lo) * frac;
    const dir = origin + step <= hi ? 1 : -1;
    const value = Math.max(lo, Math.min(hi, origin + dir * step));
    const snap = snapshot();
    el.value = value; el.dispatchEvent(new Event('input', { bubbles: true }));   // every side-effect listener runs, as by hand
    const S = E().state, T = E().target;
    for (const k in T) if (typeof T[k] === 'number' && S[k] !== T[k]) { S[k] = T[k]; if (BAKE.has(k)) E().atlas.dirty = true; }
    if (BAKE.has(key)) E().atlas.dirty = true;
    if (key === 'seed') E().reseedProcedural(Math.round(S.seed));   // the slider's own handler only loads the sliders
    const fitOut = E().fit.renderFit();
    const dFit = fitOut ? delta(fitOut, base.fit, mask) : null;
    const dAcc = frames ? delta(renderAccum(frames), base.accum, mask) : null;
    restore(snap); E().fit.renderFit();                                          // back to the origin, atlas rebaked
    return { id, key, family: FAMILY[key] || '?', origin: +origin.toFixed(4), to: +value.toFixed(4), fit: dFit, accum: dAcc };
}

/** One sweep in the current model. `frac` = fraction of each slider's range (default 0.2). */
export function sweep({ frac = 0.2, only = null, frames = 32 } = {}) {
    const F = E().fit;
    if (!F.fit.photo) throw new Error('K0: no photo loaded — run renderCaseThumb for the case first');
    E().atlas.dirty = true;
    const base = F.renderFit();
    if (!base) throw new Error('K0: renderFit returned nothing');
    const baseline = { fit: Uint8ClampedArray.from(base), accum: frames ? renderAccum(frames) : null };
    const mask = irisMask(), inMask = mask.reduce((a, b) => a + b, 0);
    const rows = [];
    for (const [id, key] of KNOBS) {
        if (only && !only.includes(id)) continue;
        rows.push(probe(id, key, baseline, mask, frac, frames));
    }
    return { rows, frac, frames, maskPx: inMask };
}

const CLASS = m => (m < 0.1 ? 'dead' : m < 0.5 ? 'weak' : 'live');

/**
 * The K0 table: the same sweep in the legacy model and in the tissue layer model, side by side.
 * Leaves the model as it found it. `tissue` = url of the extracted primitives, or null to measure the legacy model only.
 */
export async function run({ frac = 0.2, tissue = 'study/proof-layers/tissue-26-whole.json', only = null, frames = 32 } = {}) {
    const T = window.IrisTissue, wasOn = !!(T && T.on), snap = snapshot();
    const hippus = E().state.hippus; E().state.hippus = false;                   // a breathing pupil would move every row
    const t0 = performance.now();
    try {
        if (T) T.on = false;
        const legacy = sweep({ frac, only, frames });
        let layer = null;
        if (tissue && T) {
            if (!T.albedo) await T.proof(tissue); else T.on = true;
            layer = sweep({ frac, only, frames });
            T.on = wasOn;
        }
        // a knob's strength is the larger of the two paths: the fit render is blind to the stochastic ones,
        // the accumulated render is what the eye in the window actually does
        const rows = legacy.rows.map((L, i) => {
            const M = layer ? layer.rows[i] : null;
            const best = r => Math.max(r.fit ? r.fit.iris.mean : 0, r.accum ? r.accum.iris.mean : 0);
            const l = best(L), t = M ? best(M) : null;
            return {
                knob: L.id, key: L.key, family: L.family, origin: L.origin, to: L.to,
                legacy: +l.toFixed(3), legacyFit: L.fit ? L.fit.iris.mean : null, legacyAcc: L.accum ? L.accum.iris.mean : null,
                tissue: t === null ? null : +t.toFixed(3), tissueFit: M && M.fit ? M.fit.iris.mean : null, tissueAcc: M && M.accum ? M.accum.iris.mean : null,
                ratio: t === null ? null : +(t / Math.max(l, 1e-6)).toFixed(3),
                verdict: t === null ? CLASS(l) : (CLASS(l) === 'dead' ? 'dead in both' : CLASS(t) === 'dead' ? 'KILLED' : t / Math.max(l, 1e-6) < 0.5 ? 'weakened' : 'live'),
            };
        });
        return { rows, frac, frames, maskPx: legacy.maskPx, tissueLoaded: !!layer, secs: +((performance.now() - t0) / 1000).toFixed(1) };
    } finally {
        E().state.hippus = hippus; restore(snap); if (T) T.on = wasOn; E().fit.renderFit();
    }
}

/** the table as markdown, for the sealed version folder */
export function markdown(res) {
    const n = (x, d = 3) => (x === null || x === undefined ? '—' : x.toFixed(d));
    const h = '| knob | state key | family | origin → | legacy fit | legacy accum | tissue fit | tissue accum | ratio | verdict |';
    const s = '|---|---|---|---|---:|---:|---:|---:|---:|---|';
    const body = res.rows.map(r => `| ${r.knob} | \`${r.key}\` | ${r.family} | ${r.origin} → ${r.to} | ${n(r.legacyFit)} | ${n(r.legacyAcc)} | ${n(r.tissueFit)} | ${n(r.tissueAcc)} | ${n(r.ratio, 2)} | ${r.verdict} |`);
    return [h, s, ...body].join('\n');
}
