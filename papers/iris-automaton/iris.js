// papers/iris-automaton/iris.js — the iris's stages and rules for the automaton (automaton.js stays generic).
//
// Stages (display sRGB 0..1, each a full picture; the automaton lays down their differences in order):
//   L0  page      the white page
//   L1  strands   graphite ink: the pupil, and the flat render's grey along the strand crests (crest c)
//   L2  stroma    a graphite wash between the strands (the flat render's grey, blurred), crypts still bare paper
//   L3  crypts    the crypt floors drawn in grey
//   L4  pigment   colour: the engine's flat render (layer model, no relief, no fly-down) — the photo's colour, de-lit
//   L5  relief    the engine with its relief on: parallax march, self-shadow, subsurface
//   L6  final     the engine's frame as it ships (fly-down strands where the view resolves them) — the rendering
// L4–L6 are the engine's own renders; L1–L3 are drawn from L4 through the eye file's anatomy only, so any stage
// above them can be replaced by any other rendering of the same eye at the same pose.
import { rule } from './automaton.js';

export const STAGES = ['page', 'strands', 'stroma', 'crypts', 'pigment', 'relief', 'final'];

// a separable Gaussian on one channel (σ in px), edges clamped
function blur1(src, W, H, s) {
    const r = Math.ceil(s * 3), k = new Float32Array(2 * r + 1); let ks = 0;
    for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-i * i / (2 * s * s)); ks += k[i + r]; }
    for (let i = 0; i < k.length; i++) k[i] /= ks;
    const tmp = new Float32Array(W * H), out = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let a = 0; for (let i = -r; i <= r; i++) a += k[i + r] * src[y * W + Math.min(W - 1, Math.max(0, x + i))]; tmp[y * W + x] = a; }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let a = 0; for (let i = -r; i <= r; i++) a += k[i + r] * tmp[Math.min(H - 1, Math.max(0, y + i)) * W + x]; out[y * W + x] = a; }
    return out;
}

// fieldsRGBA: Uint8 RGBA (fields.png); images: { flat, relief, final } as Uint8 RGBA (W × H)
export function decodeFields(f, W, H) {
    const N = W * H, F = { theta: new Float32Array(N), crest: new Float32Array(N), crypt: new Float32Array(N), rho: new Float32Array(N), iris: new Float32Array(N), pupil: new Float32Array(N), region: new Float32Array(N) };
    for (let i = 0; i < N; i++) {
        const a = f[i * 4 + 3];
        F.theta[i] = f[i * 4] / 255 * Math.PI; F.crest[i] = f[i * 4 + 1] / 255; F.crypt[i] = f[i * 4 + 2] / 255;
        F.pupil[i] = a === 255 ? 1 : 0; F.iris[i] = a > 0 && a < 255 ? 1 : 0; F.rho[i] = F.iris[i] ? (a - 1) / 253 : (F.pupil[i] ? 0 : 1);
        F.region[i] = a > 0 ? 1 : 0;                       // on the eye (iris or pupil)
    }
    return F;
}

export function buildLayers(img, F, W, H) {
    const N = W * H, toF = u => { const o = new Float32Array(N * 3); for (let i = 0; i < N; i++) for (let c = 0; c < 3; c++) o[i * 3 + c] = u[i * 4 + c] / 255; return o; };
    const flat = toF(img.flat), relief = toF(img.relief), fin = toF(img.final);
    const Y = new Float32Array(N); for (let i = 0; i < N; i++) Y[i] = 0.2126 * flat[i * 3] + 0.7152 * flat[i * 3 + 1] + 0.0722 * flat[i * 3 + 2];
    const Yc = blur1(Y, W, H, 3.0);
    const page = new Float32Array(N * 3).fill(1), L1 = new Float32Array(N * 3), L2 = new Float32Array(N * 3), L3 = new Float32Array(N * 3);
    const mix = (a, b, t) => a + (b - a) * t;
    for (let i = 0; i < N; i++) {
        const c = F.crest[i], q = F.crypt[i], ink = F.pupil[i] ? 1 : F.iris[i] * Math.min(1, c * 1.4);
        const g1 = mix(1, Y[i], ink);
        const wash = F.iris[i] ? mix(Yc[i], Y[i], Math.min(1, c * 1.4)) : 1;
        const g2 = F.pupil[i] ? Y[i] : mix(wash, g1, q);
        const g3 = F.pupil[i] ? Y[i] : (F.iris[i] ? mix(wash, Y[i], Math.max(Math.min(1, c * 1.4), q)) : 1);
        for (let ch = 0; ch < 3; ch++) { L1[i * 3 + ch] = g1; L2[i * 3 + ch] = g2; L3[i * 3 + ch] = g3; }
    }
    return [page, L1, L2, L3, flat, relief, fin];
}

// the rules, one per stage above the page (see automaton.js for the meaning of every number)
export function irisRules(o = {}) {
    const s = o.speed || 1, T = 1 / s;
    const eye = { field: 'region', gt: 0.5 };
    return [
        // strands: from the pupil margin, fast along the crests, 3.5× slower across; the pupil itself at once
        rule({ name: 'strands', start: 0 * T, gate: 0, domain: eye, src: { field: 'pupil', gt: 0.5, or: { field: 'rho', lt: 0.02, and: { field: 'iris', gt: 0.5 } } },
               v0: 1.0 * s, b: 0.06, wc: 1.6, vmin: 0.03, alpha: 3.5, j: 0.45, D: 10, patience: 260, wet: 0.25 }),
        // stroma: the wash spreads sideways from every inked crest (faster across than along: α < 1)
        rule({ name: 'stroma', start: 70 * T, gate: 0.6, domain: { field: 'iris', gt: 0.5 }, src: { field: 'crest', gt: 0.55 },
               v0: 0.45 * s, b: 1, wq: -0.8, vmin: 0.1, alpha: 0.55, j: 0.35, D: 16, patience: 120 }),
        // crypts: the floors fill in from their rims inward
        rule({ name: 'crypts', start: 150 * T, gate: 0.85, domain: { field: 'crypt', gt: 0.04 }, src: { field: 'crypt', lt: 0.25 },
               v0: 0.35 * s, b: 1, vmin: 0.2, alpha: 1, j: 0.3, D: 14, patience: 80, wet: 0.2 }),
        // pigment: colour bleeds out from the pupil margin along the strands, then into the page round the eye
        rule({ name: 'pigment', start: 210 * T, gate: 0.9, src: { field: 'rho', lt: 0.03, and: { field: 'iris', gt: 0.5 } },
               v0: 0.9 * s, b: 1, wc: 0.6, wq: -0.5, vmin: 0.15, alpha: 1.8, j: 0.6, D: 22, patience: 220 }),
        // relief: light rakes across the surface once the colour is down
        rule({ name: 'relief', start: 330 * T, gate: 0.8, src: { field: 'rho', lt: 0.03, and: { field: 'iris', gt: 0.5 } },
               v0: 1.6 * s, b: 1, vmin: 0.3, alpha: 1.2, j: 0.2, D: 26, patience: 200 }),
        // final: the fly-down's fine strands, grown along the crests last
        rule({ name: 'final', start: 420 * T, gate: 0.8, src: { field: 'rho', lt: 0.03, and: { field: 'iris', gt: 0.5 } },
               v0: 1.2 * s, b: 0.35, wc: 1, vmin: 0.2, alpha: 3.0, j: 0.5, D: 18, patience: 200 }),
    ];
}

export function irisSheet({ W, H, fields, images, seed = 7, speed = 1 }) {
    const F = decodeFields(fields, W, H);
    return { W, H, fields: F, layers: buildLayers(images, F, W, H), rules: irisRules({ speed }), seed, names: STAGES };
}
