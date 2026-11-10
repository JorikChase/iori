// K2.3 gates (study/16 §5): the material knobs as offsets of each sample's own material.
//
//   1. origin    — knobs at the fit: the picture with K2.3 equals the K1 picture, byte for byte
//   2. knobs     — each material knob moved by `frac` of its slider: how far the iris moves under K2.3 and under K1, bake time
//   3. inherit   — after a knob move, a generated strand's colour against its nearest measured sample's (Δab, Lab a*b*)
//   4. black     — the legacy atlas cleared to zero: which pixels move (pupil + ruff, body, limbus)
//
// Loaded on demand in the page, touches no engine file:
//     const K = await import('./tools/k23_probe.js'); await K.run();

const E = () => window.__irisEngine;
const lum = (a, o) => 0.2126 * a[o] + 0.7152 * a[o + 1] + 0.0722 * a[o + 2];
const MAT = [['pigment', 'pigment'], ['stroma', 'stroma'], ['pheo', 'pheo'], ['yellow', 'yellow'], ['mie', 'mie'], ['ring', 'ring']];

function masks() {                                  // the engine's iris mask (knob_probe's) plus a region label per pixel
    const F = E().fit, fit = F.fit, W = fit.W, H = fit.H, L = fit.limbus, P = fit.pupil;
    const m = new Uint8Array(W * H), region = new Uint8Array(W * H), ca = Math.cos(L.ang), sa = Math.sin(L.ang);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const dx = x - L.x, dy = y - L.y, ex = (ca * dx + sa * dy) / L.rx, ey = (-sa * dx + ca * dy) / L.ry, e = Math.hypot(ex, ey), rp = Math.hypot(x - P.x, y - P.y);
        const o = (y * W + x) * 4, spec = fit.photo[o] > 235 && fit.photo[o + 1] > 235 && fit.photo[o + 2] > 225;
        m[y * W + x] = e < 0.92 && rp >= P.r * 1.08 && !spec ? 1 : 0;
        region[y * W + x] = rp < P.r * 1.35 ? 1 : e > 0.85 ? 3 : e < 1 ? 2 : 0;   // 1 pupil + ruff · 2 body · 3 limbus · 0 outside
    }
    return { m, region };
}
function delta(a, b, mask) {
    let s = 0, n = 0, sab = 0; const lab = (p, o) => window.IrisMaterials.lin2lab(...[0, 1, 2].map(t => Math.pow(p[o + t] / 255, 2.2)));
    for (let i = 0; i < mask.length; i++) { if (!mask[i]) continue; const o = i * 4; s += Math.abs(lum(a, o) - lum(b, o)); n++;
        if ((i & 7) === 0) { const A = lab(a, o), B = lab(b, o); sab += Math.hypot(A[1] - B[1], A[2] - B[2]) * 8; } }
    return { dY: +(s / Math.max(1, n)).toFixed(3), dAB: +(sab / Math.max(1, n)).toFixed(3) };
}
function setKnob(id, key, value) {
    const el = document.getElementById('param-' + id); el.value = value; el.dispatchEvent(new Event('input', { bubbles: true }));
    const S = E().state, T = E().target; S[key] = T[key];
    if (E().atlas.dirty) E().bakeAtlas();
}
function bakeNow() { const T = window.IrisTissue, t0 = performance.now(); T.knobT = 0; if (!T.knobTick()) T.bake(); return performance.now() - t0; }

export function origin() {
    const T = window.IrisTissue, F = E().fit, k2 = T.k2;
    T.k2 = false; T.bake(); const a = Uint8ClampedArray.from(F.renderFit());
    T.k2 = true; T.bake(); const b = F.renderFit(); T.k2 = k2;
    let changed = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) changed++;
    return { changedBytes: changed, pass: changed === 0 };
}

export function knobs({ frac = 0.2 } = {}) {
    const T = window.IrisTissue, F = E().fit, { m } = masks(), rows = [];
    T.bake(); const base = Uint8ClampedArray.from(F.renderFit());
    for (const [id, key] of MAT) {
        const el = document.getElementById('param-' + id), lo = +el.min, hi = +el.max, o = +el.value, to = Math.min(hi, Math.max(lo, o + (o + (hi - lo) * frac <= hi ? 1 : -1) * (hi - lo) * frac));
        setKnob(id, key, to); T.k2 = true; const ms = bakeNow(); const k2 = delta(F.renderFit(), base, m);
        T.k2 = false; T.bake(); const k1 = delta(F.renderFit(), base, m); T.k2 = true;
        setKnob(id, key, o); T.bake();
        rows.push({ knob: id, from: +o.toFixed(4), to: +to.toFixed(4), k2, k1, bakeMs: Math.round(ms) });
    }
    return rows;
}

// A generated strand (instance, bridge, braid) carries copied rgb; under a knob it must follow its source: child after the knob
// against child before × (source after / source before), ΔE76 in Lab. A bridge BLENDS its two ends, so its colour is not compared
// with one source at the origin — only its change is. `pale`: generated samples still on the [1, 1, 1] fallback colour.
export function inherit({ knob = ['pigment', 'pigment', 1.0] } = {}) {
    const T = window.IrisTissue, M = window.IrisMaterials;
    if (!T.parents.length && T.parentsFromRoots) T.parentsFromRoots();
    if (!T.parents.length) return { error: 'no parents to generate from' };
    T.commit(); T.bake();
    const fib = T.sets.fibres, gen = fib.filter(c => c.inst !== undefined), cell = 6, grid = new Map();
    for (const c of fib) { if (c.inst !== undefined || !c.mat) continue; const xy = (c.l0 || c).xy; if (xy.length !== c.mat.length) continue;
        xy.forEach((p, i) => { const k = Math.floor(p[0] / cell) + ',' + Math.floor(p[1] / cell); if (!grid.has(k)) grid.set(k, []); grid.get(k).push([p, c, i]); }); }
    const nearest = p => { const cx = Math.floor(p[0] / cell), cy = Math.floor(p[1] / cell); let best = null, bd = 1e18;
        for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) for (const e of (grid.get((cx + dx) + ',' + (cy + dy)) || [])) { const d = (e[0][0] - p[0]) ** 2 + (e[0][1] - p[1]) ** 2; if (d < bd) { bd = d; best = e; } }
        return best; };
    const before = new Map(), src = new Map(); let pale = 0;
    for (const c of gen) c.xy.forEach((p, i) => { const e = nearest(p); if (!e) return; const s = (e[1].l0 || e[1]);
        if (c.rgb[i].every(v => v === 1)) pale++;
        if (!before.has(c)) before.set(c, []); before.get(c)[i] = T.knobColour(c, i).slice(); src.set(c.xy[i], [e[1], e[2], s.rgb[e[2]].slice()]); });
    const [id, key, to] = knob, el = document.getElementById('param-' + id), o = +el.value; setKnob(id, key, to); T.bake();
    const lab = v => M.lin2lab(v[0], v[1], v[2]), d = [];
    for (const c of gen) c.xy.forEach((p, i) => { const q = src.get(p), b0 = before.get(c) && before.get(c)[i]; if (!q || !b0) return;
        const [sc, si, s0] = q, s1 = T.knobColour(sc, si) || s0, want = b0.map((v, t) => v * (s1[t] + 2e-4) / (s0[t] + 2e-4)), got = T.knobColour(c, i);
        const A = lab(got), B = lab(want); d.push(Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2])); });
    setKnob(id, key, o); T.bake();
    d.sort((a, b) => a - b); const p95 = d[Math.floor(0.95 * (d.length - 1))] || 0;
    return { generated: gen.length, samples: d.length, pale, median: +(d[d.length >> 1] || 0).toFixed(3), p95: +p95.toFixed(3), max: +(d[d.length - 1] || 0).toFixed(3), pass: d.length > 0 && p95 <= 2 && pale === 0 };
}

export function black() {
    const Eng = E(), gl = Eng.gl, T = window.IrisTissue, F = Eng.fit, { region } = masks();
    T.bake(); const a = Uint8ClampedArray.from(F.renderFit());
    const fb = gl.createFramebuffer(), prev = gl.getParameter(gl.FRAMEBUFFER_BINDING); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    for (const t of Eng.atlas.tex) { gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.bindTexture(gl.TEXTURE_2D, t); gl.generateMipmap(gl.TEXTURE_2D); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, prev); gl.deleteFramebuffer(fb);
    const b = F.renderFit();
    const n = [0, 0, 0, 0], ch = [0, 0, 0, 0];
    for (let i = 0; i < region.length; i++) { const r = region[i]; n[r]++; const o = i * 4; if (Math.abs(lum(a, o) - lum(b, o)) > 2) ch[r]++; }
    Eng.atlas.dirty = true; Eng.bakeAtlas(); T.bake(); F.renderFit();
    const pct = r => +(100 * ch[r] / Math.max(1, n[r])).toFixed(2);
    return { pupilRuff: pct(1), body: pct(2), limbus: pct(3), outside: pct(0), pass: pct(2) < 1 };
}

export async function run(o = {}) {
    const hippus = E().state.hippus; E().state.hippus = false;
    try { return { origin: origin(), knobs: knobs(o), inherit: inherit(o), black: black() }; }
    finally { E().state.hippus = hippus; }
}
