// P6 (study/10) — the brush liveness test: the Design window's legacy tools (D0–D2), measured in the legacy model
// and in the tissue layer model, the way tools/knob_probe.js measures the knobs.
//
// For each tool (and, for the field tools, each of the 16 layers) it paints the same strokes — dabs on a ring of
// the iris with the brush's radial repeat, so the stroke covers every sector — through design.js's own `dab`, renders
// one fit frame, and measures how far the picture moved inside the iris mask. Then it puts the genome back exactly
// (field data, custom flags, splat and paint-splat lists) and renders the origin again. Touches no engine file, saves
// nothing:
//     const B = await import('./tools/brush_probe.js'); const res = await B.run(); B.markdown(res)
// Needs a fitted photo in `fit` (renderCaseThumb) and, for the tissue column, the layer model's export.

const E = () => window.__irisEngine;
const lum = (a, o) => 0.2126 * a[o] + 0.7152 * a[o + 1] + 0.0722 * a[o + 2];

// the tools as the toolbox has them; smooth and smear only move what is already uneven, so they are measured on the
// two layers where the fitted eye has the most structure
const STAMPS = ['dent', 'bump', 'streak', 'color'];
const FIELD_TOOLS = ['paint', 'add', 'sub'];
const CONTENT_TOOLS = [['smooth', 'melanin'], ['smooth', 'height'], ['smear', 'melanin'], ['smear', 'height']];

function irisMask() {
    const fit = E().fit.fit, W = fit.W, H = fit.H, L = fit.limbus, P = fit.pupil, m = new Uint8Array(W * H), ca = Math.cos(L.ang), sa = Math.sin(L.ang);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const dx = x - L.x, dy = y - L.y, ex = (ca * dx + sa * dy) / L.rx, ey = (-sa * dx + ca * dy) / L.ry;
        m[y * W + x] = (ex * ex + ey * ey < 0.92 * 0.92) && Math.hypot(x - P.x, y - P.y) >= P.r * 1.08 ? 1 : 0;
    }
    return m;
}
function delta(a, b, mask) {
    let s = 0, n = 0, moved = 0;
    for (let i = 0; i < mask.length; i++) { if (!mask[i]) continue; const d = Math.abs(lum(a, i * 4) - lum(b, i * 4)); s += d; n++; if (d > 2) moved++; }
    return { mean: +(s / Math.max(1, n)).toFixed(3), moved: +(moved / Math.max(1, n)).toFixed(4) };   // moved = share of iris pixels that changed by more than 2 code values
}
function snapshot() {
    const g = E().genome, f = {};
    for (const k in g.fields) f[k] = { data: Float32Array.from(g.fields[k].data), custom: g.fields[k].custom };
    return { f, splats: (g.splats || []).length, paint: (g.paintSplats || []).length };
}
function restore(s) {
    const g = E().genome;
    for (const k in s.f) { g.fields[k].data.set(s.f[k].data); g.fields[k].custom = s.f[k].custom; }
    if (g.splats) g.splats.length = s.splats; if (g.paintSplats) g.paintSplats.length = s.paint;
    E().atlas.dirty = true;
}
// a stroke: three rings (v 0.3, 0.5, 0.7), each walked in 24 steps across one sector, repeated round the eye ×8
function stroke(Dz) {
    const dab = Dz.dab;
    for (const v of [0.3, 0.5, 0.7]) { let prev = null; for (let k = 0; k <= 24; k++) { const p = { u: 0.02 + k * (0.1 / 24), v }; dab(p.u, p.v, 1, prev); prev = p; } }
}

function one(tool, layer, base, mask) {
    const Z = E().design, D = Z.D, keep = { tool: D.tool, layer: D.layer, size: D.size, weight: D.weight, hard: D.hard, value: D.value, repeat: D.repeat, mat: D.mat };
    const snap = snapshot();
    try {
        D.tool = tool; D.layer = layer || D.layer; D.size = 0.6; D.weight = 0.8; D.hard = 0.5; D.repeat = 8;
        if (layer) {   // paint toward the far end of the layer's range from where it sits now; add / sub by a tenth of the range
            const d = E().FIELD_DEFS[layer], f = E().genome.fields[layer], lo = d.range[0], hi = d.range[1];
            let mean = 0; for (const x of f.data) mean += x; mean /= f.data.length;
            D.value = tool === 'paint' ? (mean - lo > hi - mean ? lo : hi) : (hi - lo) * 0.6;
        }
        if (tool === 'color') D.mat = { melanin: 2.5, stroma: 0.1, pheo: 0.25, yellow: 0.2 };   // the brown preset's material: far from a green eye
        stroke(Z);
        const out = E().fit.renderFit();
        return out ? delta(out, base, mask) : null;
    } finally { Object.assign(D, keep); restore(snap); }
}

export function sweep() {
    const F = E().fit; if (!F.fit.photo) throw new Error('P6: no photo loaded — renderCaseThumb first');
    E().atlas.dirty = true; const base0 = F.renderFit(); if (!base0) throw new Error('P6: renderFit returned nothing');
    const base = Uint8ClampedArray.from(base0), mask = irisMask(), rows = [];
    for (const t of STAMPS) rows.push({ tool: t, layer: null, d: one(t, null, base, mask) });
    const layers = Object.keys(E().FIELD_DEFS).filter(k => E().genome.fields[k]);
    for (const t of FIELD_TOOLS) for (const l of layers) rows.push({ tool: t, layer: l, d: one(t, l, base, mask) });
    for (const [t, l] of CONTENT_TOOLS) rows.push({ tool: t, layer: l, d: one(t, l, base, mask) });
    E().fit.renderFit();
    return rows;
}

const CLASS = m => (m < 0.1 ? 'dead' : m < 0.5 ? 'weak' : 'live');

/** legacy and tissue side by side; leaves the model as it found it */
export async function run({ tissue = 'study/proof-layers/tissue-26-whole.json' } = {}) {
    const T = window.IrisTissue, wasOn = !!(T && T.on), hippus = E().state.hippus, t0 = performance.now();
    E().state.hippus = false;
    try {
        if (T) T.on = false;
        const legacy = sweep();
        let layer = null;
        if (tissue && T) { if (!T.albedo) await T.proof(tissue); else T.on = true; layer = sweep(); }
        const rows = legacy.map((L, i) => {
            const M = layer ? layer[i] : null, l = L.d ? L.d.mean : 0, t = M && M.d ? M.d.mean : null;
            return { tool: L.tool, layer: L.layer, legacy: l, legacyMoved: L.d && L.d.moved, tissue: t, tissueMoved: M && M.d && M.d.moved,
                ratio: t === null ? null : +(t / Math.max(l, 1e-6)).toFixed(3),
                verdict: t === null ? CLASS(l) : (CLASS(l) === 'dead' ? (CLASS(t) === 'dead' ? 'dead in both' : 'live only in tissue') : CLASS(t) === 'dead' ? 'KILLED' : t / Math.max(l, 1e-6) < 0.5 ? 'weakened' : 'live') };
        });
        return { rows, tissueLoaded: !!layer, secs: +((performance.now() - t0) / 1000).toFixed(1) };
    } finally { E().state.hippus = hippus; if (T) T.on = wasOn; E().fit.renderFit(); }
}

export function markdown(res) {
    const n = (x, d = 3) => (x === null || x === undefined ? '—' : x.toFixed(d));
    return ['| tool | layer | legacy ΔY | moved | tissue ΔY | moved | ratio | verdict |', '|---|---|---:|---:|---:|---:|---:|---|',
        ...res.rows.map(r => `| ${r.tool} | ${r.layer || '—'} | ${n(r.legacy)} | ${n(r.legacyMoved, 3)} | ${n(r.tissue)} | ${n(r.tissueMoved, 3)} | ${n(r.ratio, 2)} | ${r.verdict} |`)].join('\n');
}
