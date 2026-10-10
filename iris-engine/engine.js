// The Iris Engine — the renderer, its fitter hooks, the ID v2 export and the page's render loop. Moved verbatim out of
// index.html on 2026-10-10 (study/14 phase 1 step 4: the module boundary; study/15 §5). A classic script: its top-level
// bindings are the page's, exactly as the inline block's were; the shaders stay in index.html as <script type="x-shader">
// tags read by id. The public surface is window.__irisEngine (unchanged) and, through engine-api.js, window.IrisEngine.
// Still coupled to the page's DOM in ≈ 56 places (the #gl canvas, the buttons and sliders it syncs) — the 1b worklist.
const ENGINE_VERSION = '0.9.5-yellow';
const canvas = document.getElementById('gl');
const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
if (!gl) document.body.innerHTML = "WEBGL 2.0 REQUIRED";

function createProgram(vsSource, fsSource, name) {
    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, vsSource); gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) console.error(name, gl.getShaderInfoLog(vs));
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, fsSource); gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) console.error(name, gl.getShaderInfoLog(fs));
    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) console.error(name, gl.getProgramInfoLog(prog));
    return prog;
}
// ---- control fields (study/07 §1): coarse polar grids of generator parameters ----
// grid 'c' = 128×32 (material / presence), 'f' = 256×64 (strand flow). `def` is the value the
// field takes while it is not custom (it follows the global gene); ranges quantise to u8 in the ID.
const FIELD_DEFS = {
    melanin:      { grid: 'c', pack: ['c0', 0], range: [0, 6],       def: g => g.melanin },
    yellow:       { grid: 'c', pack: ['c0', 1], range: [0, 2.5],     def: g => g.yellow || 0 },
    pheo:         { grid: 'c', pack: ['c0', 2], range: [0, 1],       def: g => g.pheo },
    stroma:       { grid: 'c', pack: ['c0', 3], range: [0, 0.5],     def: g => g.stroma },
    gapMelanin:   { grid: 'c', pack: ['c1', 0], range: [0, 6],       def: g => Math.min(6, g.melanin * (g.gapMelMul === undefined ? 1.2 : g.gapMelMul) + 0.05) },
    gapStroma:    { grid: 'c', pack: ['c1', 1], range: [0, 0.5],     def: g => g.stroma * (g.gapStromaMul === undefined ? 0.35 : g.gapStromaMul) },
    height:       { grid: 'c', pack: ['c1', 2], range: [-0.1, 0.1],  def: () => 0 },
    crypt:        { grid: 'c', pack: ['c1', 3], range: [0, 1],       def: () => 1 },
    furrow:       { grid: 'c', pack: ['c2', 0], range: [0, 1],       def: () => 1 },
    radialFurrow: { grid: 'c', pack: ['c2', 1], range: [0, 1],       def: () => 1 },
    collarette:   { grid: 'c', pack: ['c2', 2], range: [0, 1],       def: () => 1 },
    flowDir:      { grid: 'f', pack: ['f0', 0], range: [-1.05, 1.05], def: () => 0 },
    warpU:        { grid: 'f', pack: ['f0', 1], range: [-0.5, 0.5],  def: () => 0 },
    warpV:        { grid: 'f', pack: ['f0', 2], range: [-0.5, 0.5],  def: () => 0 },
    spacing:      { grid: 'f', pack: ['f0', 3], range: [0.02, 0.15], def: () => 0.055 },
    // F2 (spec §24): phase as (cos, sin). The ranges put 1 and 0 exactly on u8 steps (254 and 127), so the
    // defaults quantise without error and unplaced irises render bit for bit as before.
    // §25 (v81): the four placement fields live on their own grid 'p', fixed in mm at every quality — phases are
    // relative to their cell's centre, so a grid that changed with the quality scrambled them on resampling
    phaseC:       { grid: 'p', pack: ['f2', 2], range: [-1, 1.007874], def: () => 1 },
    phaseS:       { grid: 'p', pack: ['f2', 3], range: [-1, 1.007874], def: () => 0 },
    place:        { grid: 'p', pack: ['f2', 0], range: [0, 1],       def: () => 0 },
    placeSpacing: { grid: 'p', pack: ['f2', 1], range: [0.02, 0.15], def: () => 0.055 },
    coherence:    { grid: 'f', pack: ['f1', 1], range: [0, 1],       def: () => 1 },
    strandBright: { grid: 'f', pack: ['f1', 2], range: [0, 2],       def: () => 1 },
};
// c, f reassigned by setQuality (the object identity is shared with the fitter); p, the F2 placement grid, never
// changes (§25): 512 × 128 ≈ 0.05 mm cells — v81's 256 × 64 lost 3.8 MATCH2 at CAPTURE (the finer phase is real)
const GRIDS = { c: [128, 32], f: [256, 64], p: [512, 128] };
const PACKS = ['c0', 'c1', 'c2', 'f0', 'f1', 'f2'];
const PACK_GRID = { c0: 'c', c1: 'c', c2: 'c', f0: 'f', f1: 'f', f2: 'p' };
const PACK_UNIT = { c0: 7, c1: 8, c2: 9, f0: 10, f1: 11, f2: 14 };   // 12 and 13 are the splat and paint textures
function fieldDecodeGLSL() {   // injected into the bake shader so the ranges live in one place
    let out = '#define FD(q, rr) ((rr).x + (q) * ((rr).y - (rr).x))\n';   // no param may be named x or y: they are member accesses in the body
    for (const [n, d] of Object.entries(FIELD_DEFS)) out += `const vec2 R_${n} = vec2(${d.range[0].toFixed(5)}, ${d.range[1].toFixed(5)});\n`;
    return out;
}
// a field is { data: Float32Array(w*h), custom: false } ; non-custom fields are refilled from the globals at upload
function makeFields() { const f = {}; for (const n in FIELD_DEFS) { const [w, h] = GRIDS[FIELD_DEFS[n].grid]; f[n] = { data: new Float32Array(w * h), custom: false }; } return f; }
function fieldSize(n) { return GRIDS[FIELD_DEFS[n].grid]; }
function fillField(n, v) { const f = genome.fields[n]; f.data.fill(v); }
const packTex = {};
for (const pk of PACKS) { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); packTex[pk] = t; }
function uploadFields(g) {
    if (!g.fields) g.fields = makeFields();
    for (const n in FIELD_DEFS) if (!g.fields[n].custom) g.fields[n].data.fill(FIELD_DEFS[n].def(g.globals));
    // fitted fields (§19.9): the global gene is a modifier relative to its fitted value (gain for the
    // absorbers and the stroma, offset for pheo), and each layer blends toward the seeded default
    const F = g.fitted || {}, B = g.blend || { colour: 1, relief: 1, flow: 1 }, G = g.globals;
    const gainOf = (cur, fit) => (fit !== undefined && fit > 0.02) ? cur / fit : 1;
    const LAYER = { melanin: 'colour', yellow: 'colour', pheo: 'colour', stroma: 'colour', gapMelanin: 'colour', gapStroma: 'colour', height: 'relief', flowDir: 'flow', warpU: 'flow', warpV: 'flow', spacing: 'flow', phaseC: 'flow', phaseS: 'flow', place: 'flow', placeSpacing: 'flow', coherence: 'flow', strandBright: 'flow' };
    const melMod = v => (F.melanin !== undefined && F.melanin > 0.05) ? v * G.melanin / F.melanin : v + (G.melanin - (F.melanin || 0));   // near-zero fits (green eyes): offset, not gain
    const MOD = { melanin: melMod, gapMelanin: melMod, stroma: v => v * gainOf(G.stroma, F.stroma), gapStroma: v => v * gainOf(G.stroma, F.stroma), yellow: v => (F.yellow !== undefined && F.yellow > 0.05) ? v * G.yellow / F.yellow : v + (G.yellow - (F.yellow || 0)), pheo: v => v + (G.pheo - (F.pheo === undefined ? G.pheo : F.pheo)) };
    for (const pk of PACKS) {
        const [w, h] = GRIDS[PACK_GRID[pk]];
        const buf = new Uint8Array(w * h * 4);
        for (const [n, d] of Object.entries(FIELD_DEFS)) {
            if (d.pack[0] !== pk) continue;
            const ch = d.pack[1], [lo, hi] = d.range; let data = g.fields[n].data;
            if (g.fields[n].custom) { const bl = B[LAYER[n]] === undefined ? 1 : B[LAYER[n]], def = d.def(G), mod = MOD[n] || (v => v); const eff = new Float32Array(w * h); for (let i = 0; i < w * h; i++) eff[i] = def + (mod(data[i]) - def) * bl; data = eff; }
            for (let i = 0; i < w * h; i++) buf[i * 4 + ch] = Math.max(0, Math.min(255, Math.round((data[i] - lo) / (hi - lo) * 255)));
        }
        gl.bindTexture(gl.TEXTURE_2D, packTex[pk]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    }
}
// ID serialisation: only custom fields are written, quantised to u8 and base64-encoded
function encodeFields(g) {
    const out = {};
    for (const [n, d] of Object.entries(FIELD_DEFS)) {
        const f = g.fields && g.fields[n]; if (!f || !f.custom) continue;
        const [w, h] = GRIDS[d.grid], [lo, hi] = d.range, u = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) u[i] = Math.max(0, Math.min(255, Math.round((f.data[i] - lo) / (hi - lo) * 255)));
        let bin = ''; for (let i = 0; i < u.length; i++) bin += String.fromCharCode(u[i]);
        out[n] = { w, h, type: 'u8', range: [lo, hi], data: btoa(bin) };
    }
    return out;
}
function decodeFields(g, enc) {
    g.fields = makeFields();
    if (!enc) return;
    for (const n in enc) {
        const d = FIELD_DEFS[n]; if (!d) continue;
        const e = enc[n], [w, h] = GRIDS[d.grid];
        const bin = atob(e.data), [lo, hi] = e.range, src = new Float32Array(e.w * e.h);
        for (let i = 0; i < e.w * e.h; i++) src[i] = lo + (bin.charCodeAt(i) / 255) * (hi - lo);
        g.fields[n].data = resampleField(src, e.w, e.h, w, h);   // IDs carry their own grid; resampled to the current quality
        g.fields[n].custom = true;
    }
}

const vsSrc = document.getElementById('vs').text.trim();
const programs = {
    photo: createProgram(vsSrc, document.getElementById('fs-photo').text.trim(), 'photo'),
    bake: createProgram(vsSrc, document.getElementById('fs-bake').text.trim().replace('//FIELD_DECODE//', fieldDecodeGLSL()), 'bake'),
    blit: createProgram(vsSrc, document.getElementById('fs-blit').text.trim(), 'blit'),
    post: createProgram(vsSrc, document.getElementById('fs-post').text.trim(), 'post'),
    bundle: createProgram(document.getElementById('vs-bundle').text.trim(), document.getElementById('fs-bundle').text.trim(), 'bundle'),
    strand: createProgram(document.getElementById('vs-strand').text.trim(), document.getElementById('fs-strand').text.trim(), 'strand'),
    splat: createProgram(document.getElementById('vs-splat').text.trim(), document.getElementById('fs-splat').text.trim(), 'splat'),
    splat4: createProgram(document.getElementById('vs-splat4').text.trim(), document.getElementById('fs-splat4').text.trim(), 'splat4'),
};
const uniformCache = new Map();
function loc(prog, name) {
    let m = uniformCache.get(prog);
    if (!m) { m = new Map(); uniformCache.set(prog, m); }
    if (!m.has(name)) m.set(name, gl.getUniformLocation(prog, name));
    return m.get(name);
}
function u1f(prog, n, v) { const l = loc(prog, n); if (l) gl.uniform1f(l, v); }
function u1i(prog, n, v) { const l = loc(prog, n); if (l) gl.uniform1i(l, v); }
function u2f(prog, n, a, b) { const l = loc(prog, n); if (l) gl.uniform2f(l, a, b); }
function u4f(prog, n, a, b, c, d) { const l = loc(prog, n); if (l) gl.uniform4f(l, a, b, c, d); }

const buffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
for (const p of Object.values(programs)) {
    const posLoc = gl.getAttribLocation(p, "position");
    if (posLoc < 0) continue;                                // the atlas passes (bundle, strand, splat, splat4) have their own VAOs, no "position"
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
}

let textures = [], framebuffers = [];
function initBuffers() {
    if (textures.length > 0) { textures.forEach(t => gl.deleteTexture(t)); framebuffers.forEach(f => gl.deleteFramebuffer(f)); }
    textures = []; framebuffers = [];
    gl.getExtension("EXT_color_buffer_float");
    for (let i = 0; i < 2; i++) {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, canvas.width, canvas.height, 0, gl.RGBA, gl.FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        textures.push(tex);
        const fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        framebuffers.push(fb);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

// ---- spectral colour LUT (02 §4 evaluated at 16 wavelengths, CIE 1931 2° under D65) ----
const LUT_X = 48, LUT_Y = 32, LUT_P = 8, LUT_YL = 8;   // yellow axis 8 steps (was 4: the inversion could not pick the cooler greens between)
const lutTex = gl.createTexture();
let lutData = null, lutLab = null;
// Lab (D65) of a linear-sRGB triple, for the inverse lookup
function linToLab(r, g, b) {
    let X = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047, Y = r * 0.2126 + g * 0.7152 + b * 0.0722, Z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
    const h = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
    X = h(X); Y = h(Y); Z = h(Z);
    return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}
// inverse LUT: the (melanin, stroma, pheo, yellow) whose albedo is closest to a target Lab.
// `scale` lets the caller match a photographed radiance rather than an albedo (exposure).
function invertLut(L, a, b, opts = {}) {
    if (!lutData) return null;
    if (!lutLab) { lutLab = new Float32Array(LUT_X * LUT_Y * LUT_P * LUT_YL * 3); for (let i = 0; i < LUT_X * LUT_Y * LUT_P * LUT_YL; i++) { const lab = linToLab(lutData[i * 4], lutData[i * 4 + 1], lutData[i * 4 + 2]); lutLab[i * 3] = lab[0]; lutLab[i * 3 + 1] = lab[1]; lutLab[i * 3 + 2] = lab[2]; } }
    const wL = opts.wL === undefined ? 1 : opts.wL; let best = Infinity, bi = 0;
    for (let i = 0; i < LUT_X * LUT_Y * LUT_P * LUT_YL; i++) { const dl = lutLab[i * 3] - L, da = lutLab[i * 3 + 1] - a, db = lutLab[i * 3 + 2] - b; const d = wL * dl * dl + da * da + db * db; if (d < best) { best = d; bi = i; } }
    const ix = bi % LUT_X, jy = Math.floor(bi / LUT_X) % LUT_Y, ip = Math.floor(bi / (LUT_X * LUT_Y)) % LUT_P, iy = Math.floor(bi / (LUT_X * LUT_Y * LUT_P));
    return { melanin: 6 * Math.pow((ix + 0.5) / LUT_X, 2), stroma: 0.5 * (jy + 0.5) / LUT_Y, pheo: ip / (LUT_P - 1), yellow: 2.5 * iy / (LUT_YL - 1), dE: Math.sqrt(best), lab: [lutLab[bi * 3], lutLab[bi * 3 + 1], lutLab[bi * 3 + 2]] };
}
// the yellow pigment's absorption edge, nm (engine 0.9.5, study/11 §3.3). At 500 the LUT's blues were violet
// (a* > 0) — the legacy presets' lavender cast and a cyan-blue iris (ref 09) out of reach; 450 fits all four
// reference eyes better and leaves their camera grades ≈ identity. tools/layer_proof.py mirrors it.
const YELLOW_EDGE_NM = 450;
function buildSpectralLut(rayExp = 5.0, mie = 0.15) {
    const lam = [400,420,440,460,480,500,520,540,560,580,600,620,640,660,680,700];
    const xb = [0.0143,0.1344,0.3483,0.2908,0.0956,0.0049,0.0633,0.2904,0.5945,0.9163,1.0622,0.8544,0.4479,0.1649,0.0468,0.0114];
    const yb = [0.0004,0.0040,0.0230,0.0600,0.1390,0.3230,0.7100,0.9540,0.9950,0.8700,0.6310,0.3810,0.1750,0.0610,0.0170,0.0041];
    const zb = [0.0679,0.6456,1.7471,1.6692,0.8130,0.2720,0.0782,0.0203,0.0039,0.0017,0.0008,0.0002,0,0,0,0];
    const d65 = [82.75,93.43,104.86,117.81,115.92,109.35,104.79,104.41,100.0,95.79,90.01,87.70,83.70,80.21,78.28,71.61];
    const interp = (l, pts) => { if (l <= pts[0][0]) return pts[0][1]; if (l >= pts[pts.length - 1][0]) return pts[pts.length - 1][1]; for (let i = 0; i < pts.length - 1; i++) { const [l0, v0] = pts[i], [l1, v1] = pts[i + 1]; if (l >= l0 && l <= l1) return v0 + (v1 - v0) * (l - l0) / (l1 - l0); } return 0; };
    // per-wavelength constants
    const K = lam.map(l => ({ aEu: Math.pow(l / 550, -3.33), aPh: Math.pow(l / 550, -4.75), ray: Math.pow(550 / l, rayExp),
        Ripe: interp(l, [[464, 0.020], [549, 0.030], [611, 0.045]]), rhoEu: interp(l, [[464, 0.022], [549, 0.038], [611, 0.065]]), rhoPh: interp(l, [[464, 0.055], [549, 0.15], [611, 0.26]]),
        yel: 1 - 1 / (1 + Math.exp(-(l - YELLOW_EDGE_NM) / 14)) }));
    let Xw = 0, Yw = 0, Zw = 0; for (let i = 0; i < 16; i++) { Xw += xb[i] * d65[i]; Yw += yb[i] * d65[i]; Zw += zb[i] * d65[i]; }
    const data = new Float32Array(LUT_X * LUT_Y * LUT_P * LUT_YL * 4);
    for (let iy = 0; iy < LUT_YL; iy++) for (let ip = 0; ip < LUT_P; ip++) for (let jy = 0; jy < LUT_Y; jy++) for (let ix = 0; ix < LUT_X; ix++) {
        const Ma = 6 * Math.pow((ix + 0.5) / LUT_X, 2), Ds = 0.5 * (jy + 0.5) / LUT_Y, pheo = ip / (LUT_P - 1), yellow = 2.5 * iy / (LUT_YL - 1);
        let X = 0, Y = 0, Z = 0;
        for (let i = 0; i < 16; i++) {
            const k = K[i]; const melS = k.aEu + (k.aPh - k.aEu) * pheo; const Ms = 0.7 * Ma;
            const sigS = Math.max(Ds, 0.005) * (k.ray + (1 - k.ray) * mie), sigA = Ms * melS + 1e-4;
            const a = 1 + sigA / sigS, b = Math.sqrt(Math.max(a * a - 1, 1e-6)), x = Math.min(b * sigS, 30), coth = Math.cosh(x) / Math.sinh(x);
            const Rs = (1 - k.Ripe * (a - b * coth)) / (a - k.Ripe + b * coth);
            const T = Math.exp(-Ma * melS), rho = k.rhoEu + (k.rhoPh - k.rhoEu) * pheo;
            const Ty = Math.exp(-yellow * k.yel);
            const r = ((1 - T) * rho + T * T * Rs) * Ty * Ty;
            X += r * xb[i] * d65[i]; Y += r * yb[i] * d65[i]; Z += r * zb[i] * d65[i];
        }
        X /= Xw; Y /= Yw; Z /= Zw;
        // XYZ (D65) → linear sRGB
        const R = 3.2406 * X - 1.5372 * Y - 0.4986 * Z, G = -0.9689 * X + 1.8758 * Y + 0.0415 * Z, B = 0.0557 * X - 0.2040 * Y + 1.0570 * Z;
        const o = (((iy * LUT_P + ip) * LUT_Y + jy) * LUT_X + ix) * 4;
        data[o] = Math.max(0, R); data[o + 1] = Math.max(0, G); data[o + 2] = Math.max(0, B); data[o + 3] = 1;
    }
    lutData = data;
    gl.bindTexture(gl.TEXTURE_3D, lutTex);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA16F, LUT_X, LUT_Y, LUT_P * LUT_YL, 0, gl.RGBA, gl.FLOAT, data);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_3D, null);
}
buildSpectralLut(5.0, 0.08);   // low Mie fraction: the green of green irides needs the Rayleigh blue under the yellow film (study/00 v47)

// ---- polar atlas (bake targets) ------------------------------------------------
// ---- quality modes (§19.9): every resolution of the pipeline in one table ----
const QUALITY = {
    draft:   { atlasW: 1024, atlasH: 256,  gridC: [128, 32], gridF: [256, 64],  fitPx: 480,  proxyU: 512,  proxyV: 64,  splats: 800,  licSteps: 8,  marchSteps: 6,  shadowSteps: 4,  frames: 64,  dpr: 1, layers: 1 },
    normal:  { atlasW: 2048, atlasH: 512,  gridC: [128, 32], gridF: [256, 64],  fitPx: 640,  proxyU: 1024, proxyV: 128, splats: 2000, licSteps: 12, marchSteps: 10, shadowSteps: 7,  frames: 256, dpr: 1.5, layers: 2 },
    fine:    { atlasW: 4096, atlasH: 1024, gridC: [256, 64], gridF: [512, 128], fitPx: 960,  proxyU: 1536, proxyV: 192, splats: 4000, licSteps: 20, marchSteps: 14, shadowSteps: 10, frames: 384, dpr: 2, layers: 3 },
    ultra:   { atlasW: 4096, atlasH: 1024, gridC: [256, 64], gridF: [512, 128], fitPx: 1280, proxyU: 2048, proxyV: 256, splats: 8000, licSteps: 24, marchSteps: 20, shadowSteps: 12, frames: 512, dpr: 2, layers: 3 },
    capture: { atlasW: 4096, atlasH: 1024, gridC: [256, 64], gridF: [512, 128], fitPx: 1280, proxyU: 2048, proxyV: 256, splats: 8000, licSteps: 32, marchSteps: 24, shadowSteps: 16, frames: 768, dpr: 2, layers: 3 },
};
const MAX_TEX = gl.getParameter(gl.MAX_TEXTURE_SIZE);
let qualityName = (() => { try { return localStorage.getItem('irisQuality') || 'normal'; } catch (e) { return 'normal'; } })();
if (!QUALITY[qualityName]) qualityName = 'normal';
let Q = QUALITY[qualityName];
let ATLAS_W = Math.min(Q.atlasW, MAX_TEX), ATLAS_H = Math.min(Q.atlasH, MAX_TEX / 4);
GRIDS.c = Q.gridC.slice(); GRIDS.f = Q.gridF.slice();
const atlas = { tex: [], fb: null, dirty: true, sig: '' };
function initAtlas() {
    gl.getExtension('EXT_color_buffer_float');
    for (const t of atlas.tex) gl.deleteTexture(t); atlas.tex.length = 0;
    if (atlas.fb) gl.deleteFramebuffer(atlas.fb);
    atlas.fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, atlas.fb);
    for (let i = 0; i < 4; i++) {
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, ATLAS_W, ATLAS_H, 0, gl.RGBA, gl.HALF_FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0);
        atlas.tex.push(t);
    }
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2, gl.COLOR_ATTACHMENT3]);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) console.error('atlas FBO incomplete');
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}
initAtlas();
// bilinear resample of a polar field (u wraps, v clamps) between grids
function resampleField(data, w0, h0, w1, h1) {
    if (w0 === w1 && h0 === h1) return data;
    const out = new Float32Array(w1 * h1);
    for (let j = 0; j < h1; j++) for (let i = 0; i < w1; i++) {
        const x = (i + 0.5) / w1 * w0 - 0.5, y = Math.min(h0 - 1, Math.max(0, (j + 0.5) / h1 * h0 - 0.5));
        const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, xa = ((x0 % w0) + w0) % w0, xb = (xa + 1) % w0, yb = Math.min(h0 - 1, y0 + 1);
        out[j * w1 + i] = (1 - fy) * ((1 - fx) * data[y0 * w0 + xa] + fx * data[y0 * w0 + xb]) + fy * ((1 - fx) * data[yb * w0 + xa] + fx * data[yb * w0 + xb]);
    }
    return out;
}
function setQuality(name) {
    if (!QUALITY[name] || name === qualityName) return;
    const oldGrids = { c: GRIDS.c.slice(), f: GRIDS.f.slice(), p: GRIDS.p.slice() };
    qualityName = name; Q = QUALITY[name]; try { localStorage.setItem('irisQuality', name); } catch (e) {}
    ATLAS_W = Math.min(Q.atlasW, MAX_TEX); ATLAS_H = Math.min(Q.atlasH, MAX_TEX / 4);
    GRIDS.c = Q.gridC.slice(); GRIDS.f = Q.gridF.slice();
    initAtlas(); resizeAtlasSizedTextures();
    if (genome && genome.fields) for (const n in FIELD_DEFS) { const g = FIELD_DEFS[n].grid, [w0, h0] = oldGrids[g], [w1, h1] = GRIDS[g]; genome.fields[n].data = resampleField(genome.fields[n].data, w0, h0, w1, h1); }
    atlas.dirty = true; resize();
    const sel = document.getElementById('quality-sel'); if (sel) sel.value = name;
}

// ---- genome (00 §9.1): globals + explicit object lists. The seed only initialises them. ----
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const OBJ_W = 256, OBJ_ROWS = 5 + 16, RIDGE_N = 128, MAX_RIDGES = 16;   // rows 5.. = ridge list (§19.3 C2): 128 (v, weight) samples + header at texel 128
// closed Catmull-Rom through N values at uniform u (k / N), sampled n times around the ring
function sampleClosed(vals, n) {
    const N = vals.length, out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const x = i / n * N, k = Math.floor(x), t = x - k;
        const p0 = vals[(k - 1 + N) % N], p1 = vals[k % N], p2 = vals[(k + 1) % N], p3 = vals[(k + 2) % N];
        out[i] = 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
    }
    return out;
}
// the collarette as ridge 0 of the ridge list (§19.3): 48 points from the Fourier curve, weight 1
function collaretteRidge(g) {
    const pts = []; for (let k = 0; k < 48; k++) pts.push([k / 48, collaretteAt(g.coll, k / 48)]);
    return { tag: 'collarette', pts, w: pts.map(() => 1), height: g.coll.height, width: g.coll.width, asym: g.coll.asym || 0 };
}
function collaretteAt(coll, u) {   // radius (tissue v) of the collarette at angle u (turns)
    let vc = coll.r;
    for (let k = 0; k < coll.harm.length / 2; k++) { const a = 6.2831853 * (k + 1) * u; vc += coll.harm[2 * k] * Math.cos(a) + coll.harm[2 * k + 1] * Math.sin(a); }
    return vc;
}
function genomeFromSeed(seed, opts = {}) {
    const R = mulberry32(seed * 7919 + 13); const u = (a, b) => a + (b - a) * R();
    const g = {
        seed,
        globals: {
            cellsCoarse: Math.round(u(80, 120)), cellsMed: Math.round(u(180, 260)),
            stretchCoarse: u(4.5, 7.5), stretchMed: u(2.8, 4.2), warpAmp: u(0.015, 0.045),
            fieldWeight: 0.0, strandGain: 3.2, gapMelMul: 1.2, gapStromaMul: 0.35, radialFurrows: u(0.4, 1.0), furrowDepth: u(0.5, 1.2),
            // §22 F0 strand contrast: the v62 values, so a fresh genome renders as it did
            strandMed: 0.28, strandFine: 0.17, strandSharp: 0.0, gapShadow: 0.8,
            melanin: u(0.0, 3.0), stroma: u(0.1, 0.32), fibreContrast: u(0.6, 1.0), cloud: u(0.3, 0.8),
            limbalWidth: u(0.08, 0.15), limbalDark: u(0.4, 0.9), limbalMilk: 0.6, pupZoneMel: u(1.2, 1.6),
            pheo: u(0.1, 0.9), mie: u(0.1, 0.4), rayExp: 4.5, yellow: u(0.0, 1.2),
            ringStrength: R() < 0.35 ? u(0.4, 1.5) : 0.0, ringR: u(0.3, 0.45), ringPheo: 0.8,
        },
        coll: { r: u(0.28, 0.40), height: u(0.06, 0.14), width: 0.045, harm: [] },
        crypts: [], furrows: [], spots: [], nodules: [], bundles: [],
        fields: null,
    };
    g.fields = makeFields();
    // collarette: slow wander + zigzag energy around 20–35 lobes
    const amp = u(0.03, 0.08);
    for (let k = 1; k <= 40; k++) {
        const w = k <= 6 ? amp * 0.6 / Math.pow(k, 0.6) : (k >= 18 && k <= 36 ? amp * 0.09 : amp * 0.03);
        g.coll.harm.push(w * (R() - 0.5) * 2, w * (R() - 0.5) * 2);
    }
    // crypts: 9 % of eyes have none; two bands (outside the collarette, near the root)
    const cryptDensity = opts.cryptDensity !== undefined ? opts.cryptDensity : u(0.0, 0.9) * (R() < 0.12 ? 0 : 1);
    g.cryptDensityUsed = cryptDensity;
    const nC = Math.round(cryptDensity * u(8, 14));
    for (let i = 0; i < nC; i++) {
        const th = R(); const inner = R() < 0.72;
        const v = inner ? collaretteAt(g.coll, th) + u(0.04, 0.22) : u(0.82, 0.93);
        g.crypts.push({ th, v: Math.min(v, 0.93), size: u(0.3, 0.75), aspect: u(1.6, 3.2), angle: u(-0.35, 0.35), depth: u(0.15, 0.28), soft: u(0.5, 0.8) });
    }
    // contraction furrows: 2–5 arcs, 40–200°, outer third
    const nF = Math.round(u(2, 5));
    for (let i = 0; i < nF; i++) {
        const th0 = R(), len = u(0.11, 0.55);
        g.furrows.push({ th0, th1: th0 + len, v0: 0.64 + 0.075 * i + u(-0.02, 0.02), dv1: u(-0.03, 0.03), dv2: u(-0.02, 0.02), width: u(0.010, 0.018), depth: u(0.6, 1.0) });
    }
    // spots: 58 % have some, lower half favoured
    const nS = R() < 0.58 ? Math.round(u(1, 6)) : 0;
    for (let i = 0; i < nS; i++) {
        const lower = R() < 0.78; const th = lower ? u(0.5, 1.0) : u(0.0, 0.5);
        g.spots.push({ th, v: u(0.2, 0.85), size: u(0.15, 0.45), mel: u(1.2, 2.0), height: 0.0, seed: R() });
    }
    // Wölfflin nodules: 37 % of light eyes, a ring at v ≈ 0.9
    if (R() < 0.37 && g.globals.melanin < 0.6) {
        const n = Math.round(u(10, 28)); const phase = R();
        for (let i = 0; i < n; i++) g.nodules.push({ th: (phase + i / n + u(-0.3, 0.3) / n) % 1, v: u(0.88, 0.95), size: u(0.08, 0.16) });
    }
    // fibre bundles: root → collarette (coarse) and collarette → pupil (fine), wandering, some branching
    const nB = Math.round(u(110, 160));
    for (let i = 0; i < nB; i++) {
        const th = i / nB + u(-0.3, 0.3) / nB;
        const pts = []; const vc = collaretteAt(g.coll, th);
        const nP = 7; let uu = th;
        for (let k = 0; k <= nP; k++) { const t = k / nP; uu += u(-0.0035, 0.0035); pts.push([uu, 1.0 - t * (1.0 - (vc + 0.02))]); }
        g.bundles.push({ pts, width: u(0.08, 0.22), bright: u(0.55, 1.0), height: u(0.02, 0.05) });
        if (R() < 0.2) {   // branch from the middle
            const k0 = 2 + Math.floor(R() * 3); const p0 = pts[k0]; const bp = [p0]; let bu = p0[0];
            for (let k = 1; k <= 4; k++) { bu += u(-0.004, 0.004) + (R() < 0.5 ? 0.003 : -0.003); bp.push([bu, p0[1] - k * (p0[1] - vc - 0.02) / 4]); }
            g.bundles.push({ pts: bp, width: u(0.06, 0.14), bright: u(0.4, 0.8), height: u(0.015, 0.035) });
        }
    }
    const nP2 = Math.round(u(180, 260));
    for (let i = 0; i < nP2; i++) {
        const th = i / nP2 + u(-0.3, 0.3) / nP2; const vc = collaretteAt(g.coll, th);
        const pts = []; let uu = th;
        for (let k = 0; k <= 4; k++) { uu += u(-0.002, 0.002); pts.push([uu, vc - 0.01 - (k / 4) * (vc - 0.03)]); }
        g.bundles.push({ pts, width: u(0.04, 0.09), bright: u(0.35, 0.7), height: u(0.01, 0.025) });
    }
    return g;
}
let genome = null;   // the live genome (the iris ID)
function currentGenome() { return genome; }
function applySlidersToGenome() {
    const G = genome.globals;
    genome.blend = { colour: state.blColour, relief: state.blRelief, flow: state.blFlow };
    if (genome.fitted) G.openDepth = 3.0 * state.crypt / Math.max(0.05, genome.fitted.crypt || 0.26);   // CRYPT on a fitted iris = opening depth relative to the fit
    G.warpAmp = state.warp; G.furrowDepth = state.furrow; G.melanin = state.pigment; G.stroma = state.stroma;
    G.pheo = state.pheo; G.mie = state.mie; G.ringStrength = state.ring; G.ringR = state.ringR; G.yellow = state.yellow;
    if (state.limbalDark !== undefined) G.limbalDark = state.limbalDark;
    genome.coll.r = state.collr;
}
function setSlider(id, key, val, digits) { target[key] = val; state[key] = val; const el = document.getElementById('param-' + id); if (el) { el.value = val; document.getElementById('val-' + id).innerText = (+val).toFixed(digits === undefined ? 2 : digits); } }
// NEW SEED on a fitted iris re-rolls only the procedural share (seeded objects, bundles, noise seeds):
// the fitted fields, splats, ridges, collarette, materials and the fit references stay
function reseedProcedural(seed) {
    if (!genome || !genome.fitted) { loadSeedIntoSliders(seed); return; }
    const keep = genome, fresh = genomeFromSeed(seed, { cryptDensity: keep.cryptDensityUsed });
    fresh.fields = keep.fields; fresh.splats = keep.splats; fresh.ridges = keep.ridges; fresh.coll = keep.coll; fresh.fitted = keep.fitted; fresh.blend = keep.blend; fresh.provenance = keep.provenance; fresh.cryptDensityUsed = keep.cryptDensityUsed;
    for (const k of ['melanin', 'stroma', 'pheo', 'yellow', 'mie', 'rimSharp', 'openDepth', 'openWarp', 'limbalDark', 'limbalWidth', 'limbalMilk', 'gapMelMul', 'gapStromaMul', 'strandGain', 'fibreContrast', 'pupZoneMel', 'furrowDepth', 'warpAmp']) if (keep.globals[k] !== undefined) fresh.globals[k] = keep.globals[k];
    genome = fresh; state.seed = target.seed = seed; setSlider('seed', 'seed', seed, 0);
    atlas.dirty = true; resetAccumulation();
}
// fitted presets (§19.10): a whole fitted iris from the casebook, in the interactive view
let fittedCases = null;
async function loadFittedPreset(file) {
    // presets live in ref/presets.json, which only an explicit bake or promotion writes; ref/cases.json is
    // the casebook, and every bench rewrites it (a worse bench would otherwise become the presets)
    if (!fittedCases) {
        const get = u => fetch(u).then(r => r.ok ? r.json() : {}).catch(() => ({}));
        fittedCases = Object.assign({}, await get('ref/cases.json'), await get('ref/presets.json'));
    }
    const c = fittedCases[file]; if (!c) { console.warn('no fitted case', file); return; }
    importID({ v: 2, genome: c.genome, fields: c.fieldsEnc, view: c.view });
    state.useRot = false; state.view = [0, 0, 1, 1]; state.preset = 'fit-' + file.slice(0, 2);
    state.zoomPhoto = target.zoomPhoto = Math.max(state.zoomPhoto, 60);   // the fit pose is a macro distance; keep a little room around the iris
    document.querySelectorAll('.p-btn').forEach(b => b.classList.toggle('active', b.textContent === 'FIT·' + file.slice(0, 2)));
    atlas.dirty = true; resetAccumulation();
}
function loadSeedIntoSliders(seed) {
    genome = genomeFromSeed(seed);
    const G = genome.globals;
    setSlider('seed', 'seed', seed, 0); setSlider('warp', 'warp', G.warpAmp, 3); setSlider('collr', 'collr', genome.coll.r);
    setSlider('crypt', 'crypt', genome.cryptDensityUsed); setSlider('furrow', 'furrow', G.furrowDepth);
    setSlider('pigment', 'pigment', G.melanin); setSlider('stroma', 'stroma', G.stroma, 3);
    setSlider('pheo', 'pheo', G.pheo); setSlider('mie', 'mie', G.mie); setSlider('ring', 'ring', G.ringStrength); setSlider('yellow', 'yellow', G.yellow || 0);
    state.ringR = target.ringR = G.ringR; state.limbalDark = G.limbalDark; state.presetSpots = undefined; state.preset = undefined;
    atlas.dirty = true; resetAccumulation();
}
// CRYPT slider regenerates the crypt list from the seed at the requested density (deterministic)
function regenerateCrypts(density) { const g2 = genomeFromSeed(genome.seed, { cryptDensity: density }); genome.crypts = g2.crypts; genome.cryptDensityUsed = density; }

// ---- eye-colour presets (study/02 §4.4 and §6.2): the casebook's starting genomes ----
const EYE_PRESETS = {
    ice:        { Ma: 0.00, Ds: 0.32, mie: 0.15, pheo: 0.10, yellow: 0.0, ring: 0.0, ringR: 0.35, limbal: 0.8, spots: 0, nodules: 0.15 },
    blue:       { Ma: 0.02, Ds: 0.24, mie: 0.15, pheo: 0.10, yellow: 0.0, ring: 0.25, ringR: 0.28, limbal: 0.8, spots: 1, nodules: 0.10 },
    grey:       { Ma: 0.03, Ds: 0.30, mie: 0.85, pheo: 0.10, yellow: 0.1, ring: 0.15, ringR: 0.26, limbal: 0.7, spots: 1, nodules: 0.10 },
    bluegreen:  { Ma: 0.10, Ds: 0.26, mie: 0.10, pheo: 0.70, yellow: 0.5, ring: 0.35, ringR: 0.30, limbal: 0.7, spots: 2, nodules: 0.05 },
    green:      { Ma: 0.15, Ds: 0.35, mie: 0.05, pheo: 0.85, yellow: 0.9, ring: 0.5, ringR: 0.34, limbal: 0.7, spots: 3, nodules: 0.03 },
    hazel:      { Ma: 0.50, Ds: 0.20, mie: 0.25, pheo: 0.60, yellow: 0.7, ring: 1.2, ringR: 0.42, limbal: 0.6, spots: 3, nodules: 0.0 },
    amber:      { Ma: 0.50, Ds: 0.25, mie: 0.20, pheo: 1.00, yellow: 1.2, ring: 0.0, ringR: 0.40, limbal: 0.5, spots: 1, nodules: 0.0 },
    lightbrown: { Ma: 1.20, Ds: 0.12, mie: 0.30, pheo: 0.45, yellow: 0.4, ring: 0.0, ringR: 0.40, limbal: 0.5, spots: 1, nodules: 0.0 },
    brown:      { Ma: 2.50, Ds: 0.10, mie: 0.30, pheo: 0.25, yellow: 0.2, ring: 0.0, ringR: 0.40, limbal: 0.6, spots: 1, nodules: 0.0 },
    darkbrown:  { Ma: 5.00, Ds: 0.08, mie: 0.30, pheo: 0.10, yellow: 0.1, ring: 0.0, ringR: 0.40, limbal: 0.7, spots: 0, nodules: 0.0 },
};
window.loadEyePreset = (name) => {
    const p = EYE_PRESETS[name]; if (!p) return;
    setSlider('pigment', 'pigment', p.Ma); setSlider('stroma', 'stroma', p.Ds, 3); setSlider('pheo', 'pheo', p.pheo); setSlider('mie', 'mie', p.mie); setSlider('ring', 'ring', p.ring); setSlider('yellow', 'yellow', p.yellow || 0);
    state.ringR = target.ringR = p.ringR; state.limbalDark = p.limbal; state.preset = name;
    // spots / nodules: re-roll the lists from the seed with the preset's counts
    const R = mulberry32(genome.seed * 31 + 7); const u = (a, b) => a + (b - a) * R();
    genome.spots = []; for (let i = 0; i < p.spots; i++) { const lower = R() < 0.78; genome.spots.push({ th: lower ? u(0.5, 1.0) : u(0.0, 0.5), v: u(0.2, 0.85), size: u(0.15, 0.45), mel: u(1.2, 2.0), height: 0, seed: R() }); }
    genome.nodules = []; if (p.nodules > 0) { const n = Math.round(p.nodules * 180); const ph = R(); for (let i = 0; i < n; i++) genome.nodules.push({ th: (ph + i / n + u(-0.3, 0.3) / n) % 1, v: u(0.88, 0.95), size: u(0.08, 0.16) }); }
    atlas.dirty = true; resetAccumulation();
};

// ---- object texture + bundle geometry ----
const objTex = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, objTex);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
function uploadObjects(g) {
    const d = new Float32Array(OBJ_W * OBJ_ROWS * 4);
    const put = (row, i, a, b, c, e) => { const o = (row * OBJ_W + i) * 4; d[o] = a; d[o + 1] = b; d[o + 2] = c; d[o + 3] = e; };
    const nC = Math.min(g.crypts.length, 128), nF = Math.min(g.furrows.length, 64), nS = Math.min(g.spots.length, 64), nN = Math.min(g.nodules.length, 128), nH = Math.min(g.coll.harm.length / 2, 40);
    put(0, 0, nC, nF, nS, nN); put(0, 1, nH, g.coll.r, g.coll.height, g.coll.width);
    // ridge list: the collarette is always ridge 0, derived from `coll`; fitted extra ridges follow
    const ridges = [collaretteRidge(g)].concat(g.ridges || []).slice(0, MAX_RIDGES);
    put(0, 30, ridges.length, 0, 0, 0);
    ridges.forEach((rd, i) => {
        const vs = sampleClosed(rd.pts.map(q => q[1]), RIDGE_N), ws = sampleClosed(rd.w || rd.pts.map(() => 1), RIDGE_N);
        for (let k = 0; k < RIDGE_N; k++) put(5 + i, k, vs[k], Math.max(0, ws[k]), 0, 0);
        const fitShare = (i > 0 && g.fitted) ? ((g.blend || { relief: 1 }).relief) * (rd.height < 0 ? g.globals.furrowDepth / Math.max(0.05, g.fitted.furrowDepth || g.globals.furrowDepth) : 1) : 1;
        put(5 + i, RIDGE_N, rd.height * fitShare, rd.width, rd.asym || 0, 0);
    });
    for (let k = 0; k < nH; k += 2) put(0, 2 + k / 2, g.coll.harm[2 * k], g.coll.harm[2 * k + 1], g.coll.harm[2 * k + 2] || 0, g.coll.harm[2 * k + 3] || 0);
    const procShare = g.fitted ? 1 - ((g.blend || { relief: 1 }).relief) : 1;     // seeded relief objects fade as the fitted share grows
    g.crypts.slice(0, nC).forEach((c, i) => { put(1, 2 * i, c.th, c.v, c.size, c.aspect); put(1, 2 * i + 1, c.angle, c.depth * procShare, c.soft, 0); });
    g.furrows.slice(0, nF).forEach((f, i) => { put(2, 2 * i, f.th0, f.th1, f.v0, f.dv1); put(2, 2 * i + 1, f.dv2, f.width, f.depth * procShare, 0); });
    g.spots.slice(0, nS).forEach((p, i) => { put(3, 2 * i, p.th, p.v, p.size, p.mel); put(3, 2 * i + 1, p.height, p.seed, 0, 0); });
    g.nodules.slice(0, nN).forEach((n, i) => put(4, i, n.th, n.v, n.size, 0));
    gl.bindTexture(gl.TEXTURE_2D, objTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, OBJ_W, OBJ_ROWS, 0, gl.RGBA, gl.FLOAT, d);
}
const bundleTex = gl.createTexture(), bundleFB = gl.createFramebuffer();
function resizeAtlasSizedTextures() { for (const t of [bundleTex, typeof strandTex !== 'undefined' ? strandTex : null, typeof splatTex !== 'undefined' ? splatTex : null, typeof paintTex !== 'undefined' ? paintTex : null]) { if (!t) continue; gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, ATLAS_W, ATLAS_H, 0, gl.RGBA, gl.HALF_FLOAT, null); } }
gl.bindTexture(gl.TEXTURE_2D, bundleTex);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, ATLAS_W, ATLAS_H, 0, gl.RGBA, gl.HALF_FLOAT, null);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.bindFramebuffer(gl.FRAMEBUFFER, bundleFB);
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, bundleTex, 0);
gl.bindFramebuffer(gl.FRAMEBUFFER, null);
const bundleVAO = gl.createVertexArray(), bundleVBO = gl.createBuffer(); let bundleVerts = 0;
function buildBundleGeometry(g) {
    const verts = [];
    const push = (p, side, br, h) => verts.push(p[0], p[1], side, br, h);
    for (const b of g.bundles) {
        const pts = b.pts; if (pts.length < 2) continue;
        for (const shift of [-1, 0, 1]) {
            const strip = [];
            for (let k = 0; k < pts.length; k++) {
                const p = pts[k], q = pts[Math.min(k + 1, pts.length - 1)], o = pts[Math.max(k - 1, 0)];
                const r = 2.0 + 4.0 * p[1];
                // direction in mm, perpendicular in mm, back to uv
                const dmm = [(q[0] - o[0]) * 6.2831853 * r, (q[1] - o[1]) * 4.0];
                const L = Math.hypot(dmm[0], dmm[1]) || 1; const nmm = [-dmm[1] / L, dmm[0] / L];
                const half = 0.5 * b.width;
                const off = [nmm[0] * half / (6.2831853 * r), nmm[1] * half / 4.0];
                strip.push([[p[0] + shift + off[0], p[1] + off[1]], [p[0] + shift - off[0], p[1] - off[1]]]);
            }
            for (let k = 0; k < strip.length - 1; k++) {
                const a0 = strip[k][0], a1 = strip[k][1], b0 = strip[k + 1][0], b1 = strip[k + 1][1];
                push(a0, 1, b.bright, b.height); push(a1, -1, b.bright, b.height); push(b0, 1, b.bright, b.height);
                push(a1, -1, b.bright, b.height); push(b1, -1, b.bright, b.height); push(b0, 1, b.bright, b.height);
            }
        }
    }
    gl.bindVertexArray(bundleVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, bundleVBO);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    const prog = programs.bundle, stride = 5 * 4;
    const aPos = gl.getAttribLocation(prog, 'a_pos'), aSide = gl.getAttribLocation(prog, 'a_side'), aBh = gl.getAttribLocation(prog, 'a_bh');
    gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(aSide); gl.vertexAttribPointer(aSide, 1, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(aBh); gl.vertexAttribPointer(aBh, 2, gl.FLOAT, false, stride, 12);
    gl.bindVertexArray(null);
    bundleVerts = verts.length / 5;
}
function drawBundles() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, bundleFB);
    gl.viewport(0, 0, ATLAS_W, ATLAS_H);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(programs.bundle);
    gl.enable(gl.BLEND); gl.blendEquation(gl.MAX); gl.blendFunc(gl.ONE, gl.ONE);
    gl.bindVertexArray(bundleVAO);
    gl.drawArrays(gl.TRIANGLES, 0, bundleVerts);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // restore the full-screen quad attribute state for the other programs
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    for (const p of [programs.photo, programs.bake, programs.blit, programs.post]) {
        const posLoc = gl.getAttribLocation(p, 'position'); if (posLoc >= 0) { gl.enableVertexAttribArray(posLoc); gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0); }
    }
}

// ---- strand pass (study/08 S1): explicit strands grown by strands.js over the flow and spacing fields ----
// genome.globals.strandModel 1 switches the top layer's fine scale from LIC to these curves; 0 (default) never
// runs any of this. Growth is cached on (seed, grower genes, the two effective fields).
const strandTex = gl.createTexture(), strandFB = gl.createFramebuffer();
gl.bindTexture(gl.TEXTURE_2D, strandTex);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, ATLAS_W, ATLAS_H, 0, gl.RGBA, gl.HALF_FLOAT, null);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.bindFramebuffer(gl.FRAMEBUFFER, strandFB);
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, strandTex, 0);
gl.bindFramebuffer(gl.FRAMEBUFFER, null);
const strandVAO = gl.createVertexArray(), strandVBO = gl.createBuffer(); let strandVerts = 0, strandCache = { key: null, strands: [] }, strandModelOverride = null, strandGeomKey = null, growOverride = {};   // growOverride: grower genes forced for A/B benches (like strandModelOverride)
// the curves variant of the bake shader, compiled on first use: the top layer's fine scale reads the strand texture
function bakeCurvesProgram() {
    if (!programs.bakeCurves) programs.bakeCurves = createProgram(vsSrc, document.getElementById('fs-bake').text.trim().replace('//FIELD_DECODE//', fieldDecodeGLSL())
        .replace('//STRAND_DECL//', 'uniform sampler2D u_strands;')
        .replace('//STRAND_FINE//', 'if (L == 0) { vec4 sc = texture(u_strands, uv); cF = sc.r * mix(0.8, 1.0, sc.b / max(sc.r, 1e-3)); }'), 'bakeCurves');
    return programs.bakeCurves;
}
const GROW_DEFAULTS = { growSep: 1.6, growTest: 0.8, growRun: 0.7, growWander: 0.25, growWave: 0.014, growWidth: 0.53, growPlace: 1 };   // growPlace 0 ignores the F2 placement (ablation)
function effectiveField(g, n) {                       // what uploadFields sends for this field (blend included), as a sampler
    const d = FIELD_DEFS[n], [w, h] = GRIDS[d.grid], f = g.fields[n], def = d.def(g.globals);
    const bl = f.custom ? ((g.blend || {}).flow === undefined ? 1 : g.blend.flow) : 0;
    const data = new Float32Array(w * h); let sum = 0;
    for (let i = 0; i < w * h; i++) { data[i] = f.custom ? def + (f.data[i] - def) * bl : def; sum += data[i] * (1 + (i % 97)); }
    return { at: IrisStrands.sampler(data, w, h), sum, data, w, h };
}
function growStrands(g) {
    const G = g.globals, P = {}; for (const k in GROW_DEFAULTS) P[k] = growOverride[k] !== undefined ? growOverride[k] : (G[k] === undefined ? GROW_DEFAULTS[k] : G[k]);
    const flow = effectiveField(g, 'flowDir'), spacing = effectiveField(g, 'spacing');
    // S6-lite: the F2 placement fields as the grower sees them — the same per-cell plane waves strandCarrier blends
    // (cell-local frames, the flow angle at the cell centre), reduced to the phase of the blended wave at a point
    const pl = effectiveField(g, 'place'), pc = effectiveField(g, 'phaseC'), ps = effectiveField(g, 'phaseS'), psp = effectiveField(g, 'placeSpacing');
    let placed = false; if (P.growPlace > 0) for (let i = 0; i < pl.data.length; i++) if (pl.data[i] > 0.02) { placed = true; break; }
    const key = [g.seed, JSON.stringify(P), flow.sum.toFixed(4), spacing.sum.toFixed(4), placed ? [pl.sum, pc.sum, ps.sum, psp.sum].map(x => x.toFixed(4)).join(',') : '-'].join('|');
    if (strandCache.key === key) return strandCache.strands;
    const TAU = 6.2831853, W = pl.w, H = pl.h;
    const cellWave = (ci, cj, u, v, r) => {             // phase of cell (ci, cj)'s wave at (u, v)
        const k = cj * W + ci, cu = (ci + 0.5) / W, cv = (cj + 0.5) / H, th = flow.at(cu, cv);
        let du = u - cu; du -= Math.round(du);
        return TAU * (du * TAU * r * Math.cos(th) - (v - cv) * 4.0 * Math.sin(th)) / psp.data[k] + Math.atan2(ps.data[k], pc.data[k]);
    };
    const place = !placed ? undefined : (u, v) => {
        const gx = u * W - 0.5, gy = v * H - 0.5, x0 = Math.floor(gx), y0 = Math.floor(gy), tx = gx - x0, ty = gy - y0, r = 2.0 + 4.0 * v;
        let re = 0, im = 0, sp = 0, w = 0;
        for (let dj = 0; dj <= 1; dj++) for (let di = 0; di <= 1; di++) {
            const wg = (di ? tx : 1 - tx) * (dj ? ty : 1 - ty); if (wg <= 0) continue;
            const ci = ((x0 + di) % W + W) % W, cj = Math.min(H - 1, Math.max(0, y0 + dj)), k = cj * W + ci, a = cellWave(ci, cj, u, v, r);
            re += wg * Math.cos(a); im += wg * Math.sin(a); sp += wg * psp.data[k]; w += wg * pl.data[k];
        }
        return { w: w * Math.hypot(re, im), off: -Math.atan2(im, re) / TAU * sp, sp };
    };
    let placeSeeds = [];
    if (placed) {                                        // one seed per confident cell, on the crest nearest its centre
        for (let cj = 0; cj < H; cj++) for (let ci = 0; ci < W; ci++) { const k = cj * W + ci; if (pl.data[k] > 0.12) placeSeeds.push([(ci + 0.5) / W, (cj + 0.5) / H, pl.data[k]]); }
        placeSeeds.sort((a, b) => b[2] - a[2] || a[1] - b[1] || a[0] - b[0]);
    }
    strandCache = { key, strands: IrisStrands.grow({ seed: g.seed, flow: flow.at, spacing: spacing.at, sep: P.growSep, dTest: P.growTest, run: P.growRun, wander: P.growWander, wave: P.growWave, width: P.growWidth, place, placeSeeds }) };
    return strandCache.strands;
}
function buildStrandGeometry(strands) {
    const verts = [], margin = 1.5 * 4.0 / ATLAS_H;                          // antialiasing margin, mm
    for (const s of strands) {
        const pts = s.pts, n = pts.length; if (n < 2) continue;
        let uMin = 1e9, uMax = -1e9; for (const p of pts) { if (p[0] < uMin) uMin = p[0]; if (p[0] > uMax) uMax = p[0]; }
        const base = -Math.floor((uMin + uMax) / 2), shifts = [base]; if (uMin + base < 0.01) shifts.push(base + 1); if (uMax + base > 0.99) shifts.push(base - 1);
        const L = [], Rr = [];
        for (let k = 0; k < n; k++) {
            const p = pts[k], q = pts[Math.min(k + 1, n - 1)], o = pts[Math.max(k - 1, 0)], r = 2.0 + 4.0 * p[1];
            const dx = (q[0] - o[0]) * 6.2831853 * r, dy = (q[1] - o[1]) * 4.0, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
            const t = Math.min(k, n - 1 - k) / 3, hw = 0.5 * s.w * (0.35 + 0.65 * Math.min(1, t)), ext = hw + margin;   // strands taper into their neighbours
            L.push([p[0] + nx * ext / (6.2831853 * r), p[1] + ny * ext / 4.0, ext, hw]); Rr.push([p[0] - nx * ext / (6.2831853 * r), p[1] - ny * ext / 4.0, -ext, hw]);
        }
        for (const sh of shifts) for (let k = 0; k < n - 1; k++) {
            const a0 = L[k], a1 = Rr[k], b0 = L[k + 1], b1 = Rr[k + 1];
            for (const c of [a0, a1, b0, a1, b1, b0]) verts.push(c[0] + sh, c[1], c[2], c[3], s.b);
        }
    }
    gl.bindVertexArray(strandVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, strandVBO);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    const prog = programs.strand, stride = 5 * 4;
    const aPos = gl.getAttribLocation(prog, 'a_pos'), aSide = gl.getAttribLocation(prog, 'a_side'), aPar = gl.getAttribLocation(prog, 'a_par');
    gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(aSide); gl.vertexAttribPointer(aSide, 1, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(aPar); gl.vertexAttribPointer(aPar, 2, gl.FLOAT, false, stride, 12);
    gl.bindVertexArray(null);
    strandVerts = verts.length / 5;
}
function drawStrands() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, strandFB);
    gl.viewport(0, 0, ATLAS_W, ATLAS_H);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    if (strandVerts) {
        gl.useProgram(programs.strand);
        u1f(programs.strand, 'u_texelMM', 4.0 / ATLAS_H);
        gl.enable(gl.BLEND); gl.blendEquation(gl.MAX); gl.blendFunc(gl.ONE, gl.ONE);
        gl.bindVertexArray(strandVAO);
        gl.drawArrays(gl.TRIANGLES, 0, strandVerts);
        gl.bindVertexArray(null);
        gl.disable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    for (const p of [programs.photo, programs.bake, programs.blit, programs.post]) {
        const posLoc = gl.getAttribLocation(p, 'position'); if (posLoc >= 0) { gl.enableVertexAttribArray(posLoc); gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0); }
    }
}

// ---- splat pass (§19.5): genome.splats = [{ u, v, sa, sb, th, a }] in field coords / mm ----
const splatTex = gl.createTexture(), splatFB = gl.createFramebuffer();
gl.bindTexture(gl.TEXTURE_2D, splatTex);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, ATLAS_W, ATLAS_H, 0, gl.RGBA, gl.HALF_FLOAT, null);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.bindFramebuffer(gl.FRAMEBUFFER, splatFB);
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, splatTex, 0);
gl.bindFramebuffer(gl.FRAMEBUFFER, null);
const splatVAO = gl.createVertexArray(), splatVBO = gl.createBuffer(); let splatVerts = 0;
function buildSplatGeometry(g) {
    const verts = [], list = g.splats || [], share = g.fitted ? ((g.blend || { relief: 1 }).relief) : 1;
    for (const sp of list) {
        const r = 2.0 + 4.0 * sp.v, ext = 3.0 * Math.max(sp.sa, sp.sb);           // ±3σ, mm
        const eu = ext / (6.2831853 * r), ev = ext / 4.0;                         // in uv
        for (const shift of [-1, 0, 1]) {
            if (Math.abs(sp.u + shift - 0.5) > 0.5 + eu) continue;
            const cx = sp.u + shift, cy = sp.v;
            const corner = (dx, dy) => verts.push(cx + dx * eu, cy + dy * ev, dx * ext, dy * ext, sp.sa, sp.sb, sp.th, sp.a * share);
            corner(-1, -1); corner(1, -1); corner(1, 1); corner(-1, -1); corner(1, 1); corner(-1, 1);
        }
    }
    gl.bindVertexArray(splatVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, splatVBO);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    const prog = programs.splat, stride = 8 * 4;
    const aPos = gl.getAttribLocation(prog, 'a_pos'), aLoc = gl.getAttribLocation(prog, 'a_local'), aPar = gl.getAttribLocation(prog, 'a_par');
    gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(aLoc); gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(aPar); gl.vertexAttribPointer(aPar, 4, gl.FLOAT, false, stride, 16);
    gl.bindVertexArray(null);
    splatVerts = verts.length / 8;
}
function drawSplats() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, splatFB);
    gl.viewport(0, 0, ATLAS_W, ATLAS_H);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    if (splatVerts) {
        gl.useProgram(programs.splat);
        gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE);
        gl.bindVertexArray(splatVAO);
        gl.drawArrays(gl.TRIANGLES, 0, splatVerts);
        gl.bindVertexArray(null);
        gl.disable(gl.BLEND);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    for (const p of [programs.photo, programs.bake, programs.blit, programs.post]) {
        const posLoc = gl.getAttribLocation(p, 'position'); if (posLoc >= 0) { gl.enableVertexAttribArray(posLoc); gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0); }
    }
}
// ---- paint pass (§20 D2): genome.paintSplats = [{ u, v, sa, sb, th, d: [Δmel, Δstroma, Δyellow, Δpheo] }] ----
const paintTex = gl.createTexture(), paintFB = gl.createFramebuffer();
gl.bindTexture(gl.TEXTURE_2D, paintTex);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, ATLAS_W, ATLAS_H, 0, gl.RGBA, gl.HALF_FLOAT, null);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.bindFramebuffer(gl.FRAMEBUFFER, paintFB);
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, paintTex, 0);
gl.bindFramebuffer(gl.FRAMEBUFFER, null);
const paintVAO = gl.createVertexArray(), paintVBO = gl.createBuffer(); let paintVerts = 0;
function buildPaintGeometry(g) {
    const verts = [], list = g.paintSplats || [];
    for (const sp of list) {
        const r = 2.0 + 4.0 * sp.v, ext = 3.0 * Math.max(sp.sa, sp.sb), eu = ext / (6.2831853 * r), ev = ext / 4.0;
        for (const shift of [-1, 0, 1]) {
            if (Math.abs(sp.u + shift - 0.5) > 0.5 + eu) continue;
            const cx = sp.u + shift, cy = sp.v, d = sp.d;
            const corner = (dx, dy) => verts.push(cx + dx * eu, cy + dy * ev, dx * ext, dy * ext, sp.sa, sp.sb, sp.th, 0, d[0], d[1], d[2], d[3]);
            corner(-1, -1); corner(1, -1); corner(1, 1); corner(-1, -1); corner(1, 1); corner(-1, 1);
        }
    }
    gl.bindVertexArray(paintVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, paintVBO);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    const prog = programs.splat4, stride = 12 * 4;
    const aPos = gl.getAttribLocation(prog, 'a_pos'), aLoc = gl.getAttribLocation(prog, 'a_local'), aPar = gl.getAttribLocation(prog, 'a_par'), aAmp = gl.getAttribLocation(prog, 'a_amp');
    gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(aLoc); gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(aPar); gl.vertexAttribPointer(aPar, 4, gl.FLOAT, false, stride, 16);
    gl.enableVertexAttribArray(aAmp); gl.vertexAttribPointer(aAmp, 4, gl.FLOAT, false, stride, 32);
    gl.bindVertexArray(null);
    paintVerts = verts.length / 12;
}
function drawPaint() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, paintFB);
    gl.viewport(0, 0, ATLAS_W, ATLAS_H);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    if (paintVerts) {
        gl.useProgram(programs.splat4);
        gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE);
        gl.bindVertexArray(paintVAO);
        gl.drawArrays(gl.TRIANGLES, 0, paintVerts);
        gl.bindVertexArray(null);
        gl.disable(gl.BLEND);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    for (const p of [programs.photo, programs.bake, programs.blit, programs.post]) {
        const posLoc = gl.getAttribLocation(p, 'position'); if (posLoc >= 0) { gl.enableVertexAttribArray(posLoc); gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0); }
    }
}
function bakeAtlas() {
    applySlidersToGenome();
    const g = genome, G = g.globals;
    uploadObjects(g); uploadFields(g); buildBundleGeometry(g); drawBundles();
    // E.strandModelOverride (0 | 1 | null) forces the model whatever the genome says — for A/B benches, where every case
    // starts from a fresh genome and a fresh state (resetForFreshFit deletes unknown state keys)
    const curves = (strandModelOverride === null ? G.strandModel : strandModelOverride) === 1 && typeof IrisStrands !== 'undefined';
    if (curves) { const st = growStrands(g), gk = strandCache.key + '|' + ATLAS_H; if (strandGeomKey !== gk) { buildStrandGeometry(st); strandGeomKey = gk; } drawStrands(); }   // a fit re-bakes on every evaluation: grow and mesh only when the strands change
    buildSplatGeometry(g); drawSplats(); buildPaintGeometry(g); drawPaint();
    const prog = curves ? bakeCurvesProgram() : programs.bake;
    gl.bindFramebuffer(gl.FRAMEBUFFER, atlas.fb);
    gl.viewport(0, 0, ATLAS_W, ATLAS_H);
    gl.useProgram(prog);
    u2f(prog, 'u_size', ATLAS_W, ATLAS_H);
    u1f(prog, 'u_seed', (g.seed % 1000) * 0.731);
    for (const k of ['cellsCoarse','cellsMed','stretchCoarse','stretchMed','warpAmp','fieldWeight','strandGain','radialFurrows','furrowDepth','melanin','stroma','fibreContrast','cloud','limbalWidth','limbalDark','pupZoneMel']) u1f(prog, 'g_' + k, G[k] === undefined ? (k === 'strandGain' ? 2.6 : 0) : G[k]);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, objTex); u1i(prog, 'u_objs', 3);
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, bundleTex); u1i(prog, 'u_bundles', 4);
    gl.activeTexture(gl.TEXTURE12); gl.bindTexture(gl.TEXTURE_2D, splatTex); u1i(prog, 'u_splats', 12);
    if (curves) { gl.activeTexture(gl.TEXTURE15); gl.bindTexture(gl.TEXTURE_2D, strandTex); u1i(prog, 'u_strands', 15); }
    gl.activeTexture(gl.TEXTURE13); gl.bindTexture(gl.TEXTURE_2D, paintTex); u1i(prog, 'u_paint', 13);
    u1f(prog, 'g_rimSharp', G.rimSharp === undefined ? 0.6 : G.rimSharp);
    u1f(prog, 'g_openWarp', G.openWarp === undefined ? 0.3 : G.openWarp);
    u1f(prog, 'g_openDepth', G.openDepth === undefined ? 3.0 : G.openDepth);
    u1f(prog, 'g_strandMed', G.strandMed === undefined ? 0.28 : G.strandMed);
    u1f(prog, 'g_strandFine', G.strandFine === undefined ? 0.17 : G.strandFine);
    u1f(prog, 'g_strandSharp', G.strandSharp === undefined ? 0.0 : G.strandSharp);
    u1f(prog, 'u_licSteps', atlas.draftBake ? Math.min(Q.licSteps, 6) : Q.licSteps);   // draft steps while a brush stroke is down
    u1f(prog, 'u_layers', atlas.draftBake ? 1 : (Q.layers || 2));
    PACKS.forEach(pk => { gl.activeTexture(gl.TEXTURE0 + PACK_UNIT[pk]); gl.bindTexture(gl.TEXTURE_2D, packTex[pk]); u1i(prog, 'u_' + pk, PACK_UNIT[pk]); });
    gl.activeTexture(gl.TEXTURE0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    for (const t of atlas.tex) { gl.bindTexture(gl.TEXTURE_2D, t); gl.generateMipmap(gl.TEXTURE_2D); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    atlas.dirty = false; atlas.genome = G;
}

// ---- iris ID: the genome as JSON (export / import / URL hash) ----
function roundDeep(o, d = 3) { if (Array.isArray(o)) return o.map(x => roundDeep(x, d)); if (o && typeof o === 'object') { const r = {}; for (const k in o) r[k] = roundDeep(o[k], d); return r; } return typeof o === 'number' ? +o.toFixed(d) : o; }
// the ID object alone — no download, no clipboard, no URL (study/11 SAVE: a session file wraps it)
function makeID() {
    applySlidersToGenome();
    const gcopy = Object.assign({}, genome); delete gcopy.fields;
    return roundDeep({ v: 2, engine: ENGINE_VERSION, genome: gcopy, fields: encodeFields(genome), provenance: genome.provenance || null, view: { pupil: state.pupil, lightAngle: state.lightAngle, lightElev: state.lightElev, srcType: state.srcType, srcSize: state.srcSize, ambient: state.ambient, lid: state.lid, ev: state.ev, fstop: state.fstop, focus: state.focus, kelvin: state.kelvin, zoom: state.zoomPhoto, capZoom: state.captureZoom || state.zoomPhoto, pupilOff: state.pupilOff.slice(), limb: (state.limb || [5.85, 5.40, 0]).slice(), sat: state.sat } });
}
function exportID() {
    const id = makeID();
    const json = JSON.stringify(id);
    // the URL carries the full ID only when it is short enough to share; otherwise seed + preset
    try {
        const b64 = btoa(unescape(encodeURIComponent(json)));
        location.hash = b64.length < 8192 ? 'id=' + b64 : 'seed=' + genome.seed + (state.preset ? '&preset=' + state.preset : '');
    } catch (e) {}
    try { navigator.clipboard && navigator.clipboard.writeText(json); } catch (e) {}
    const a = document.createElement('a'); a.download = `iris-id-${genome.seed}${state.preset ? '-' + state.preset : ''}.json`;
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.click();
    return json;
}
function importID(json) {
    const id = typeof json === 'string' ? JSON.parse(json) : json;
    if (!id || !id.genome) throw new Error('not an iris ID');
    genome = id.genome; const G = genome.globals;
    decodeFields(genome, id.fields); genome.provenance = id.provenance || null;
    setSlider('seed', 'seed', genome.seed, 0); setSlider('warp', 'warp', G.warpAmp, 3); setSlider('collr', 'collr', genome.coll.r);
    setSlider('crypt', 'crypt', genome.cryptDensityUsed || 0); setSlider('furrow', 'furrow', G.furrowDepth);
    setSlider('pigment', 'pigment', G.melanin); setSlider('stroma', 'stroma', G.stroma, 3);
    setSlider('pheo', 'pheo', G.pheo); setSlider('mie', 'mie', G.mie); setSlider('ring', 'ring', G.ringStrength); setSlider('yellow', 'yellow', G.yellow || 0);
    state.ringR = target.ringR = G.ringR; state.limbalDark = G.limbalDark;   // target too: ringR is a SMOOTH_KEY, the loop eased it back to 0.4
    if (id.view) { const v = id.view; setSlider('pupil', 'pupil', v.pupil); setSlider('light', 'lightAngle', v.lightAngle); setSlider('elev', 'lightElev', v.lightElev); state.srcType = v.srcType; setSlider('srcsize', 'srcSize', v.srcSize, 3); setSlider('ambient', 'ambient', v.ambient); setSlider('lid', 'lid', v.lid, 1); setSlider('ev', 'ev', v.ev, 1); setSlider('fstop', 'fstop', v.fstop, 1); setSlider('focus', 'focus', v.focus); setSlider('kelvin', 'kelvin', v.kelvin, 0); state.zoomPhoto = target.zoomPhoto = v.zoom; state.captureZoom = v.capZoom || v.zoom; state.pupilOff = v.pupilOff ? v.pupilOff.slice() : [0.25, 0.15]; state.limb = v.limb ? v.limb.slice() : [5.85, 5.40, 0]; state.sat = v.sat === undefined ? 1.0 : v.sat; document.querySelectorAll('.src-btn').forEach(x => x.classList.toggle('active', +x.dataset.src === v.srcType)); }
    atlas.dirty = true; resetAccumulation();
}
function loadIDFromHash() {
    const m = location.hash.match(/id=([^&]+)/);
    if (m) { try { importID(decodeURIComponent(escape(atob(m[1])))); return true; } catch (e) { console.warn('bad iris ID in URL', e); } }
    const sm = location.hash.match(/seed=(\d+)/), pm = location.hash.match(/preset=(\w+)/);
    if (sm) { loadSeedIntoSliders(parseInt(sm[1])); if (pm && EYE_PRESETS[pm[1]]) loadEyePreset(pm[1]); return true; }
    return false;
}

function drawAtlasViewer() {
    const prog = programs.blit;
    gl.useProgram(prog);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const stripH = Math.floor(Math.min(90, canvas.height / 6)), W = canvas.width;
    const rows = [[0, 0], [0, 1], [0, 2], [0, 3], [1, 4]];   // [texture, channel]
    gl.enable(gl.SCISSOR_TEST);
    rows.forEach((rw, i) => {
        const y = i * stripH;
        gl.viewport(0, y, W, stripH); gl.scissor(0, y, W, stripH);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, atlas.tex[rw[0]]);
        u1i(prog, 'u_tex', 0); u4f(prog, 'u_rect', 0, y, W, stripH); u1i(prog, 'u_channel', rw[1]);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    });
    gl.disable(gl.SCISSOR_TEST);
    gl.viewport(0, 0, canvas.width, canvas.height);
}

// ---- state ---------------------------------------------------------------
const state = {
    relief: 1.0, lightAngle: 1.0,
    // mm / rad
    pupil: 4.0, pupilOff: [0.25, 0.15], limb: [5.85, 5.40, 0], lightElev: 1.4312, zoomPhoto: 110.0, debug: 0, refract: 1, specular: 0, atlasView: false,   // specular 0: the cornea does not mirror the scene light unless asked (iori, 2026-09-20)
    seed: 42, warp: 0.03, collr: 0.33, crypt: 0.5, furrow: 0.8, pigment: 0.3, stroma: 0.24,
    pheo: 0.5, mie: 0.2, ring: 0.0, ringR: 0.4, yellow: 0.3,
    srcType: 1, srcSize: 0.18, ambient: 0.35, lid: 5.0, hippus: false,
    mouseX: 0, mouseY: 0, paused: false, frameCount: 0,
    ev: 0.0, sat: 1.0, fstop: 11.0, dof: 0, edgeMm: 0.085, focus: 0.0, kelvin: 5600, grain: 0.02, bloom: 0.35, tone: 1, ref: 0,
    blColour: 1.0, blRelief: 1.0, blFlow: 1.0,   // fitted ↔ procedural share per layer (§19.9)
    view: [0, 0, 1, 1], capturing: false, fitting: false, useRot: false, camRot: [0, 0],
};
const target = { ...state };
let isPointerDown = false, autoAnimate = true;


function resetAccumulation() { state.frameCount = 0; document.getElementById('accum-bar').style.width = '0%'; }

window.addEventListener('pointerdown', e => {
    if (e.target.closest && e.target.closest('#ui-panel')) return;
    if (e.button !== 0 || state.design) return;
    isPointerDown = true; resetAccumulation();
});
window.addEventListener('pointermove', e => {
    if (state.ref || state.design) return;                   // reference pose / designer: the camera is frozen
    target.mouseX = e.clientX * dprCur; target.mouseY = e.clientY * dprCur;
});
window.addEventListener('pointerup', e => { if (e.button === 0) { isPointerDown = false; resetAccumulation(); } });
window.addEventListener('wheel', e => {
    if (state.design) return;                                // the designer zooms through the view crop
    target.zoomPhoto = Math.max(20.0, Math.min(400.0, (target.zoomPhoto || state.zoomPhoto) * (1.0 + e.deltaY * 0.001)));   // T2a: the camera may come twice as close as it could
});

function bind(id, key, fmt) {
    const el = document.getElementById('param-' + id);
    const disp = document.getElementById('val-' + id);
    const f = fmt || (x => x.toFixed(2));
    el.addEventListener('input', e => {
        target[key] = parseFloat(e.target.value);
        disp.innerText = f(target[key]);
        if (key !== 'pupil') autoAnimate = false;
        resetAccumulation();
    });
    disp.innerText = f(target[key]); el.value = target[key];
}
bind('relief', 'relief'); bind('light', 'lightAngle');
bind('pupil', 'pupil', x => x.toFixed(2) + 'mm'); bind('elev', 'lightElev', x => (x * 57.3).toFixed(0) + '°');
bind('seed', 'seed', x => x.toFixed(0)); bind('warp', 'warp', x => x.toFixed(3)); bind('collr', 'collr');
bind('blcol', 'blColour'); bind('blrel', 'blRelief'); bind('blflow', 'blFlow');
bind('crypt', 'crypt'); bind('furrow', 'furrow'); bind('pigment', 'pigment'); bind('stroma', 'stroma', x => x.toFixed(3));
bind('pheo', 'pheo'); bind('mie', 'mie'); bind('ring', 'ring'); bind('yellow', 'yellow');
bind('srcsize', 'srcSize', x => (x * 114.6).toFixed(0) + '°'); bind('ambient', 'ambient'); bind('lid', 'lid', x => x.toFixed(1) + 'mm');
bind('ev', 'ev', x => (x >= 0 ? '+' : '') + x.toFixed(1)); bind('fstop', 'fstop', x => 'f/' + x.toFixed(1)); bind('kelvin', 'kelvin', x => x.toFixed(0) + 'K');
bind('grain', 'grain', x => x.toFixed(3)); bind('bloom', 'bloom'); bind('focus', 'focus', x => (x >= 0 ? '+' : '') + x.toFixed(2) + 'mm');
// (all of these are smoothed toward their targets in render(), see SMOOTH_KEYS)
// key colour: blackbody at `kelvin`, balanced to a 5600 K camera (Tanner Helland's fit)
function blackbody(K) {
    const t = K / 100; let r, g, b;
    r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = t >= 66 ? 255 : (t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307);
    const c = [r, g, b].map(v => Math.pow(Math.max(0, Math.min(255, v)) / 255, 2.2));
    return c;
}
function keyColor() { const a = blackbody(state.kelvin), w = blackbody(5600); return [a[0] / w[0], a[1] / w[1], a[2] / w[2]]; }
document.querySelectorAll('.src-btn').forEach(b => b.onclick = () => { state.srcType = parseInt(b.dataset.src); document.querySelectorAll('.src-btn').forEach(x => x.classList.toggle('active', x === b)); resetAccumulation(); });
document.getElementById('param-seed').addEventListener('input', e => loadSeedIntoSliders(parseInt(e.target.value)));
for (const id of ['warp', 'collr', 'furrow', 'pigment', 'stroma']) document.getElementById('param-' + id).addEventListener('input', () => { atlas.dirty = true; });
document.getElementById('param-crypt').addEventListener('input', e => { regenerateCrypts(parseFloat(e.target.value)); atlas.dirty = true; });
// pheo / mie / ring are smoothed too (SMOOTH_KEYS)
document.getElementById('seed-btn').onclick = () => reseedProcedural(Math.floor(Math.random() * 1000));
{ const sel = document.getElementById('quality-sel'); sel.value = qualityName; sel.onchange = () => setQuality(sel.value); }
document.getElementById('atlas-btn').onclick = (e) => { state.atlasView = !state.atlasView; e.target.classList.toggle('active'); resetAccumulation(); };
document.getElementById('maps-btn').onclick = (e) => { state.debug = state.debug >= 5 ? 0 : (state.debug === 5 ? 6 : 5); e.target.classList.toggle('active', state.debug >= 5); resetAccumulation(); };
loadSeedIntoSliders(state.seed);
loadIDFromHash();
document.getElementById('idout-btn').onclick = exportID;
document.getElementById('idin-btn').onclick = () => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json'; inp.onchange = () => { const f = inp.files[0]; if (!f) return; f.text().then(t => { try { importID(t); } catch (e) { alert('Not an iris ID: ' + e.message); } }); }; inp.click(); };

window.toggleUI = () => document.getElementById('ui-panel').classList.toggle('collapsed');

document.getElementById('debug-btn').onclick = (e) => { state.debug = 1 - state.debug; e.target.classList.toggle('active'); resetAccumulation(); };
document.getElementById('refr-btn').onclick = (e) => { state.refract = 1 - state.refract; e.target.classList.toggle('active'); resetAccumulation(); };
document.getElementById('spec-btn').onclick = (e) => { state.specular = 1 - state.specular; e.target.classList.toggle('active', !!state.specular); resetAccumulation(); };
document.getElementById('dof-btn').onclick = (e) => { state.dof = state.dof ? 0 : 1; e.target.classList.toggle('active', !!state.dof); if (window.IrisTissue) window.IrisTissue.dirty = true; resetAccumulation(); };   // PHOTO SOFTNESS (iori, 2026-09-28): depth of field + the soft limbus edge + the layer model's soft mask; off by default — zooming stays sharp
// camera: FREE = the eye turns toward the cursor (u_useRot 0), FIXED = locked to state.camRot.
// solvePose() locks it and only closing the fit panel used to unlock it, so the eye would stop
// tracking with no way back; this is that way back. Switching to FREE seeds the cursor position
// from the fixed pose, so the eye eases out of it instead of snapping.
function setCamFixed(v) {
    v = !!v;
    if (!v && state.useRot) {
        const W = canvas.width, H = canvas.height;
        target.mouseX = state.mouseX = W * (state.camRot[1] + 0.5);
        target.mouseY = state.mouseY = H * (0.5 - state.camRot[0] / 0.75);
    }
    state.useRot = v; syncCamBtn(); resetAccumulation();
}
function syncCamBtn() {
    const b = document.getElementById('cam-btn'); if (!b) return;
    b.textContent = state.useRot ? 'CAM FIXED' : 'CAM FREE';
    b.classList.toggle('active', !!state.useRot);
}
document.getElementById('cam-btn').onclick = () => setCamFixed(!state.useRot);
function syncStrandBtn() { const b = document.getElementById('strand-btn'); if (!b) return; const on = genome.globals.strandModel === 1; b.textContent = on ? 'CURVES' : 'LIC'; b.classList.toggle('active', on); }
function setStrandModel(m) { genome.globals.strandModel = (m === 'curves' || m === 1) ? 1 : 0; syncStrandBtn(); atlas.dirty = true; resetAccumulation(); }
document.getElementById('strand-btn').onclick = () => setStrandModel(genome.globals.strandModel === 1 ? 0 : 1);
syncCamBtn();
document.getElementById('anim2-btn').onclick = (e) => { state.hippus = !state.hippus; e.target.classList.toggle('active'); resetAccumulation(); };
document.getElementById('tone-btn').onclick = (e) => { state.tone = 1 - state.tone; e.target.classList.toggle('active'); };
document.getElementById('fieldw-btn').classList.add('active');
document.getElementById('fieldw-btn').classList.remove('active');
document.getElementById('fieldw-btn').onclick = (e) => { genome.globals.fieldWeight = genome.globals.fieldWeight > 0 ? 0 : 0.55; e.target.classList.toggle('active', genome.globals.fieldWeight > 0); atlas.dirty = true; resetAccumulation(); };
document.getElementById('ref-btn').onclick = (e) => { state.ref = 1 - state.ref; e.target.classList.toggle('active'); resetAccumulation(); };
// tiled capture: render the image as K×K tiles at canvas size (≥ 4096 px on the long side),
// accumulate each, and stitch to one PNG
async function captureTiled(targetPx = 4096) {
    if (state.capturing) return;
    const W = canvas.width, H = canvas.height;
    const K = Math.max(1, Math.ceil(targetPx / Math.max(W, H)));
    const frames = state.ref ? 1 : 48;
    const out = document.createElement('canvas'); out.width = W * K; out.height = H * K;
    const ctx = out.getContext('2d');
    const px = new Uint8Array(W * H * 4), img = ctx.createImageData(W, H);
    const bar = document.getElementById('accum-bar');
    state.capturing = true;
    try {
        for (let j = 0; j < K; j++) for (let i = 0; i < K; i++) {
            state.view = [i / K, j / K, 1 / K, 1 / K]; state.frameCount = 0;
            for (let f = 0; f < frames; f++) render(performance.now(), true);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
            for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
            ctx.putImageData(img, i * W, (K - 1 - j) * H);
            bar.style.width = Math.round((j * K + i + 1) / (K * K) * 100) + '%';
            await new Promise(r => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });   // not a timer: hidden tabs throttle those
        }
        await new Promise(res => out.toBlob(b => {
            const a = document.createElement('a');
            a.download = `IRIS_ENGINE_${state.preset || 'seed' + state.seed}_${out.width}x${out.height}.png`;
            a.href = URL.createObjectURL(b); a.click(); res();
        }, 'image/png'));
    } finally {
        state.view = [0, 0, 1, 1]; state.capturing = false; resetAccumulation();
    }
}
document.getElementById('shot-btn').onclick = () => captureTiled(4096);
window.__irisEngine && (window.__irisEngine.captureTiled = captureTiled);

// the canvas backing store follows the device pixel ratio up to the quality mode's cap (§19.10):
// at 1× on a retina display the interactive view rendered at half resolution and looked soft
let dprCur = 1;
function resize() {
    dprCur = Math.min(window.devicePixelRatio || 1, Q.dpr || 2);
    canvas.width = Math.round(window.innerWidth * dprCur); canvas.height = Math.round(window.innerHeight * dprCur);
    gl.viewport(0, 0, canvas.width, canvas.height);
    initBuffers(); resetAccumulation();
}
window.addEventListener('resize', resize);
resize();

function lerp(a, b, t) { return (1 - t) * a + t * b; }
const SMOOTH_KEYS = ['relief', 'lightAngle', 'lightElev', 'srcSize', 'ambient', 'lid', 'pheo', 'mie', 'ring', 'ringR', 'yellow',
    'warp', 'collr', 'furrow', 'pigment', 'stroma', 'ev', 'fstop', 'focus', 'kelvin', 'grain', 'bloom', 'zoomPhoto', 'blColour', 'blRelief', 'blFlow'];

// ---- test hook: expose a paraxial magnification check for the harness ----
// debug: a window of the strand texture (r coverage, g tube, b brightness) as floats, rows bottom-up
function readStrandTex(x, y, w, h) { const px = new Float32Array(w * h * 4); gl.bindFramebuffer(gl.FRAMEBUFFER, strandFB); gl.readPixels(x, y, w, h, gl.RGBA, gl.FLOAT, px); gl.bindFramebuffer(gl.FRAMEBUFFER, null); return px; }
window.__irisEngine = { setStrandModel, readStrandTex, get strands() { return strandCache.strands; }, get strandModelOverride() { return strandModelOverride; }, set strandModelOverride(v) { strandModelOverride = (v === 0 || v === 1) ? v : null; atlas.dirty = true; }, get growOverride() { return growOverride; }, set growOverride(o) { growOverride = o || {}; atlas.dirty = true; }, state, target, programs, gl, canvas, captureTiled, exportID, importID, genomeFromSeed, get genome() { return genome; }, set genome(g) { genome = g; if (!genome.fields) genome.fields = makeFields(); },
    FIELD_DEFS, GRIDS, makeFields, fillField, encodeFields, decodeFields, ENGINE_VERSION, invertLut, linToLab,
    drawPhotoFrame, drawPost, edgeBlendMm, bakeAtlas, atlas, setSlider, resetAccumulation, EYE_PRESETS, loadEyePreset, applySlidersToGenome,
    setCamFixed, syncCamBtn, makeID, sampleClosed, collaretteRidge, uploadObjects, u1f, u2f, loc, collaretteAt, get ATLAS() { return [ATLAS_W, ATLAS_H]; }, get Q() { return Q; }, get quality() { return qualityName; }, QUALITY, setQuality, reseedProcedural, resampleField, loadFittedPreset, get dpr() { return dprCur; }, srgbToLinear: c => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) };

// draw one frame of the photo shader into `fb` (w×h), accumulating from `readTex` when frame > 0
// the disc's edge (study/11 §5.6, iori 2026-09-28): the limbus is soft in the photographs while the tissue beside it is sharp,
// so its softness is anatomy, measured per eye in mm (state.edgeMm, the 10–90 % rise) and always on — never the lens's.
// A smoothstep's 10–90 % rise is 0.61 of its width.
function edgeBlendMm() { return Math.max(0.005, state.edgeMm || 0.085) / 0.61; }
function drawPhotoFrame(fb, w, h, frame, readTex, opts = {}) {
    const prog = (window.IrisTissue && window.IrisTissue.on) ? window.IrisTissue.photoProgram() : programs.photo;   // §30: the tissue layer model is a separately compiled variant
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.viewport(0, 0, w, h);
    gl.useProgram(prog);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, readTex); u1i(prog, 'u_accum', 0);
    u2f(prog, 'u_resolution', w, h);
    u1f(prog, 'u_time', opts.time || 0);
    u1i(prog, 'u_frame', frame);
    u2f(prog, 'u_mouse', state.mouseX, state.mouseY);
    u1f(prog, 'u_zoom', opts.zoom !== undefined ? opts.zoom : state.zoomPhoto);
    const view = opts.view || state.view;
    u4f(prog, 'u_view', view[0], view[1], view[2], view[3]);
    // depth of field off by default (iori, 2026-09-27): f/64 is the shader's own 'no DOF', the f-stop slider keeps its value
    u1f(prog, 'u_fstop', opts.fstop !== undefined ? opts.fstop : ((opts.dof !== undefined ? opts.dof : state.dof) ? state.fstop : 64.0)); u1f(prog, 'u_focus', state.focus); u1f(prog, 'u_ref', opts.ref !== undefined ? opts.ref : state.ref);
    u1f(prog, 'u_capZoom', opts.capZoom !== undefined ? opts.capZoom : (state.captureZoom || (opts.zoom !== undefined ? opts.zoom : state.zoomPhoto)));
    u1f(prog, 'u_useRot', opts.rot ? 1.0 : (state.useRot ? 1.0 : 0.0));
    { const r = opts.rot || state.camRot; u2f(prog, 'u_rot', r[0], r[1]); }
    { const kc = keyColor(); const l = loc(prog, 'u_keyColor'); if (l) gl.uniform3f(l, kc[0], kc[1], kc[2]); }
    u1f(prog, 'u_pupil', opts.pupil !== undefined ? opts.pupil : state.pupil);
    u1f(prog, 'u_relief', state.relief);
    u1f(prog, 'u_lightAngle', state.lightAngle);
    u1f(prog, 'u_lightElev', state.lightElev);
    u1f(prog, 'u_srcType', state.srcType); u1f(prog, 'u_srcSize', state.srcSize);
    u1f(prog, 'u_ambient', state.ambient); u1f(prog, 'u_lid', state.lid);
    u1f(prog, 'u_debug', opts.debug !== undefined ? opts.debug : state.debug);
    u1f(prog, 'u_refract', state.refract);
    u1f(prog, 'u_specular', opts.specular !== undefined ? opts.specular : state.specular);
    u1f(prog, 'u_edgeFade', opts.edgeFade !== undefined ? opts.edgeFade : 1.0); u1f(prog, 'u_edgeFadeW', edgeBlendMm() / Math.max(0.5 * ((opts.limb || state.limb || [5.85, 5.40])[0] + (opts.limb || state.limb || [5.85, 5.40])[1]), 1.0));
    u1f(prog, 'u_marchSteps', Q.marchSteps); u1f(prog, 'u_shadowSteps', Q.shadowSteps);
    { const po = opts.pupilOff || state.pupilOff || [0.25, 0.15]; u2f(prog, 'u_pupilOff', po[0], po[1]); }
    { const lb = opts.limb || state.limb || [5.85, 5.40, 0]; gl.uniform3f(loc(prog, 'u_limb'), lb[0], lb[1], lb[2] || 0); }
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, atlas.tex[0]); u1i(prog, 'u_atlas0', 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, atlas.tex[1]); u1i(prog, 'u_atlas1', 2);
    gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, atlas.tex[2]); u1i(prog, 'u_atlas2', 6);
    gl.activeTexture(gl.TEXTURE9); gl.bindTexture(gl.TEXTURE_2D, atlas.tex[3]); u1i(prog, 'u_atlas3', 9);
    gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, packTex.f0); u1i(prog, 'u_f0', 7);
    gl.activeTexture(gl.TEXTURE8); gl.bindTexture(gl.TEXTURE_2D, packTex.f1); u1i(prog, 'u_f1', 8);
    u2f(prog, 'u_atlasSize', ATLAS_W, ATLAS_H);
    u1f(prog, 'u_rp0', 0.33);
    const g = genome.globals;
    u1f(prog, 'u_pheo', state.pheo); u1f(prog, 'u_mie', state.mie); u1f(prog, 'u_rayExp', g.rayExp);
    u1f(prog, 'u_melScale', 1.0);
    u1f(prog, 'u_gapShadow', genome.globals.gapShadow === undefined ? 0.8 : genome.globals.gapShadow);
    u1f(prog, 'u_ringStrength', state.ring); u1f(prog, 'u_ringR', state.ringR); u1f(prog, 'u_ringPheo', g.ringPheo);
    u1f(prog, 'u_ruffScallop', 0.25 + 0.5 * Math.max(0, Math.min(1, ((opts.pupil !== undefined ? opts.pupil : state.pupil) - 3.0) / 4.0)));
    u1f(prog, 'u_stromaMax', g.stroma);
    gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_3D, lutTex); u1i(prog, 'u_lut', 5);
    u1f(prog, 'u_useLut', 1.0); u1f(prog, 'u_yellow', state.yellow); u1f(prog, 'u_limbalMilk', genome.globals.limbalMilk === undefined ? 0.6 : genome.globals.limbalMilk);
    if (prog !== programs.photo) window.IrisTissue.bind(prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}
// post pass from `srcTex` (w×h) into `fb` (null = screen)
function drawPost(fb, srcTex, w, h, frame, opts = {}) {
    const pp = programs.post;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.viewport(0, 0, w, h);
    gl.useProgram(pp);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, srcTex);
    u1i(pp, 'u_src', 0); u2f(pp, 'u_resolution', w, h);
    u1f(pp, 'u_ev', state.ev); u1f(pp, 'u_grain', state.grain); u1f(pp, 'u_tone', state.tone); u1f(pp, 'u_sat', state.sat === undefined ? 1.0 : state.sat);
    { const v = opts.view || state.view || [0, 0, 1, 1]; u4f(pp, 'u_view', v[0], v[1], v[2], v[3]); }
    // the lateral aberration, MEASURED on the four photographs (red against blue, 2026-09-28): ≤ 0.1 native px, 0.4 µm — the old 1.0 put
    // ≈ 18 µm between red and blue near the limbus, doubled edges at close range. With the layer model: the frame's formula, amount 0
    { const lm = !!(window.IrisTissue && window.IrisTissue.on); u1f(pp, 'u_caFrame', lm ? 1.0 : 0.0); u1f(pp, 'u_ca', lm ? 0.0 : 1.0); } u1f(pp, 'u_bloom', state.bloom); u1f(pp, 'u_ref', opts.ref !== undefined ? opts.ref : state.ref); u1i(pp, 'u_frame', frame);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

let camBtnState = null;
function render(time, forceCapture = false) {
    if (camBtnState !== state.useRot) { camBtnState = state.useRot; syncCamBtn(); }
    // while the fitter or a capture drives the engine, the interactive loop must not touch state
    if ((state.capturing || state.fitting) && !forceCapture) { requestAnimationFrame(render); return; }
    let t = time * 0.001;
    let isMoving = false;
    let dx = target.mouseX - state.mouseX, dy = target.mouseY - state.mouseY;
    if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) { state.mouseX += dx * 0.08; state.mouseY += dy * 0.08; isMoving = true; }

    // pupil: hippus (0.05-0.3 Hz, 2-4 %) + click constricts to 2.5 mm
    let targetPupil = target.pupil;
    if (state.hippus && !isPointerDown && !state.design) targetPupil = target.pupil * (1.0 + 0.03 * Math.sin(t * 0.9) + 0.015 * Math.sin(t * 1.9 + 1.0));
    if (isPointerDown && !state.design) targetPupil = 2.5;

    // exponential transitions for every UI-driven value; bake-affecting keys re-bake while moving
    const BAKE_KEYS = ['warp', 'collr', 'furrow', 'pigment', 'stroma', 'pheo', 'yellow', 'blColour', 'blRelief', 'blFlow'];   // pheo / yellow now live in the baked fields
    for (const k of SMOOTH_KEYS) {
        if (target[k] === undefined) continue;
        const d = target[k] - state[k];
        const eps = k === 'kelvin' ? 1 : (k === 'zoomPhoto' ? 0.02 : 0.0008);
        if (Math.abs(d) > eps) { state[k] = lerp(state[k], target[k], k === 'zoomPhoto' ? 0.15 : 0.12); isMoving = true; if (BAKE_KEYS.includes(k)) atlas.dirty = true; }
        else if (state[k] !== target[k]) { state[k] = target[k]; if (BAKE_KEYS.includes(k)) atlas.dirty = true; }
    }
    if (state.crypt !== target.crypt) { state.crypt = target.crypt; atlas.dirty = true; }
    if (state.seed !== target.seed && !state.fitting) { state.seed = target.seed; reseedProcedural(Math.round(state.seed)); }
    if (atlas.dirty) { bakeAtlas(); isMoving = true; }
    if (Math.abs(targetPupil - state.pupil) > 0.0005) { state.pupil = lerp(state.pupil, targetPupil, isPointerDown ? 0.15 : 0.04); isMoving = true; }
    else state.pupil = targetPupil;
    if (!state.paused) document.getElementById('val-pupil').innerText = state.pupil.toFixed(2) + 'mm';

    if (isMoving) resetAccumulation();
    const maxFrames = (state.ref || state.painting) ? 1 : Q.frames;
    if (state.frameCount >= maxFrames && !forceCapture) { requestAnimationFrame(render); return; }

    const readIdx = state.frameCount % 2, writeIdx = (state.frameCount + 1) % 2;
    const dOpts = state.design ? { time: t, rot: [0, 0], fstop: 64, ref: state.painting ? 1 : undefined } : { time: t };
    drawPhotoFrame(framebuffers[writeIdx], canvas.width, canvas.height, state.frameCount, textures[readIdx], dOpts);
    drawPost(null, textures[writeIdx], canvas.width, canvas.height, state.frameCount, state.painting ? { ref: 1 } : {});
    if (state.atlasView) drawAtlasViewer();

    state.frameCount++;
    if (!state.capturing) document.getElementById('accum-bar').style.width = (state.ref ? 0 : Math.min(100, state.frameCount / Q.frames * 100)) + '%';
    if (!forceCapture) requestAnimationFrame(render);
}
requestAnimationFrame(render);
