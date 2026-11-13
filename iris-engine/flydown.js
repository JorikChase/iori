// flydown.js — the fly-down prototype (study/17 D1/D3/D4/D5; iori chose the cascade D, 2026-11-11). Loaded only with
// ?flydown=1. Off, or at any view coarser than ~6 µm per pixel, the engine draws with the tissue variant as before —
// this file's shader is a SEPARATE program, used only while the view is close enough to need it, so the far view is
// the same program and the same bits.
//
//   detail   the refined cascade D (study/flydown/rig.py alg_proposal): a seeded Worley mosaic with soft walls everywhere,
//            erosion gullies weighted by the MEASURED coherence (dense fibres, crypt walls), four octaves from the photo's
//            finest band (2 native px ≈ 9.3 µm) down to the 1 µm floor. Seeded from data/<ref>.seed.png (the photo's
//            finest-band residual in tissue uv) and steered by data/<ref>.steer*.png (tangent, coherence, crypt, slope),
//            built by study/flydown/seedtex.py. The by-example share of D' is not ported (it needs the parent page).
//   pages    a virtual texture over the tissue's own Cartesian plane (r = 2 + 4 v mm, as ablTexture): five levels, texel
//            4 · 2^-ℓ µm (4 … 0.25), 128² pages with a 4-texel gutter, an RGBA16F atlas of 1024 slots (D, grain + birth jitter, strand height) and an
//            RG32F page table (slot + 1, birth time) that covers every level whole — the 1 µm floor bounds the depth, so no
//            clipmap is needed. Pages cache a POINTWISE function: neighbours agree on their gutters by construction.
//   requests a 64 × 48 readback of the same camera through the variant's debug 17 (uv + footprint per sample); the pages
//            under it at the footprint's level and the next, ordered by an anisotropic distance from the view centre
//            (along the strand ×1, across ×3.5): that order is the growth. A page fades in over FADE s, each 12 µm cell
//            with its own delay.
//   walk     the optics zoom's deepest step hands over to a camera on the surface (u_walk): it descends and tilts from
//            straight down toward the horizon; WASD / arrows walk, drag looks, the wheel changes the height, Esc leaves.
(() => {
    if (window.__irisFly) return;
    const E = window.__irisEngine, T = window.IrisTissue; if (!E || !T) return;
    const gl = E.gl, state = E.state;
    const LV = 5, PAGE = 128, GUT = 4, PAY = PAGE - 2 * GUT, ATLAS = 4096, SLOTS_X = ATLAS / PAGE, SLOTS = SLOTS_X * SLOTS_X;
    const EXT = 6500;                                                   // µm: the page grid covers [-EXT, EXT]² of the tissue plane
    const texel = l => 4 / 2 ** l, pageUm = l => PAY * texel(l), cols = l => Math.ceil(2 * EXT / pageUm(l));
    const ROW = []; { let r = 0; for (let l = 0; l < LV; l++) { ROW.push(r); r += cols(l); } ROW.push(r); }
    const TW = 512, TH = ROW[LV];
    const F = {
        on: true, ready: false, subGain: 4.0, keep12: false, ref: null, meta: null, budget: 8, fade: 0.9, spread: 0.6, hk: 0.5, ridge: 2.5, tube: 4.0, bridge: true, smear: true, slim: true, relPx: 6, tubeB: 9, gap: true, sdf: true, rope: true, ropeR: 28, ropeFork: true, rim: false, rimOv: 35, rimUc: 22, rimT: 18, active: false,   // subGain: iori, 2026-11-11 — ×4 the default (×2 on the Camera window's switch)
        stats: { gen: 0, genMs: [], frames: 0, resident: 0, requested: 0, lastReq: 0, firstSharp: null },
        walk: null,                                                     // { pos:[x,y,z] mm, heading, pitch, alt, fov, anim }
    };
    const t0 = performance.now(), now = () => (performance.now() - t0) / 1000;

    // ------------------------------------------------------------------ GL helpers
    function compile(vs, fs, name) {
        const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(name + ': ' + gl.getShaderInfoLog(s)); return s; };
        const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
        gl.bindAttribLocation(p, 0, 'position'); gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(name + ': ' + gl.getProgramInfoLog(p));
        p.u = {}; p.loc = n => (n in p.u ? p.u[n] : (p.u[n] = gl.getUniformLocation(p, n))); return p;
    }
    const VS = '#version 300 es\nin vec4 position; void main() { gl_Position = position; }';
    function tex2D(img, { repeatS = false, mip = false, internal = gl.RGBA8, format = gl.RGBA } = {}) {
        const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        gl.texImage2D(gl.TEXTURE_2D, 0, internal, format, gl.UNSIGNED_BYTE, img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeatS ? gl.REPEAT : gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        if (mip) gl.generateMipmap(gl.TEXTURE_2D);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.BROWSER_DEFAULT_WEBGL);
        return t;
    }
    // revalidated with the server on every load (a 304 when unchanged): a rebuilt per-eye texture must never be served stale from
    // the browser's cache (2026-11-12: rebuilt phasors that did not show)
    const loadImg = url => fetch(url, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error('flydown: ' + url); return r.blob(); })
        .then(b => new Promise((res, rej) => { const u = URL.createObjectURL(b), i = new Image(); i.onload = () => { URL.revokeObjectURL(u); res(i); }; i.onerror = () => rej(new Error('flydown: ' + url)); i.src = u; }));

    // ------------------------------------------------------------------ the generator: one page of D per draw
    const COMMON = `
        uint pcg(uint v) { uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
        float h3(vec2 ij, int k, int salt) { ivec2 i = ivec2(ij); uint h = pcg(uint(i.x) ^ pcg(uint(i.y) ^ pcg(uint(k * 131 + salt))));
            return float(h) * (1.0 / 4294967296.0); }
        vec2 uvOf(vec2 pum) { float r = length(pum) * 1e-3; return vec2(fract(atan(pum.y, pum.x) / 6.2831853), (r - 2.0) / 4.0); }`;
    // the chain iori chose (2026-11-11, paper 0.4 ch 3): at the photo's own scale the photo's grain mixed 0.3 / 0.7 with
    // phasor v2 fibres (measured fibre wavelength, the photo's Gabor phase and amplitude per pivot, data/<ref>.phasor.png);
    // below the photo, fibre octaves at λ/2, λ/4, λ/8 (each the parent's phase doubled — the finer fibre on the coarser one's
    // crest — plus a smooth jitter) at a share of 0.35 over soft cells (the seeded mosaic, soft walls and soft pigment), with
    // no fade: every octave below the photo as strong as the first. Offline twin: study/flydown/fibres.py.
    const GEN_FS = `#version 300 es
        precision highp float; precision highp int;
        uniform sampler2D u_seed, u_steer, u_steer2, u_phasor, u_grainT, u_bridgeT;
        uniform sampler2D u_pts; uniform float u_probe;   // probe: one fragment per point of u_pts (µm), for the section
        uniform vec2 u_org; uniform float u_s; uniform vec2 u_slot; uniform vec4 u_lam, u_oamp; uniform float u_k;
        uniform vec4 u_pv;            // NU, NV, fibre wavelength (µm), amplitude max (seed units)
        uniform float u_c0, u_mean;   // fibre → grain rms factor; the seed's mean envelope (log units)
        uniform float u_subGain;      // the level of everything below the photo (iori tunes it in the engine)
        uniform int u_dbg;            // tests: 1 photo-scale fibres only, 2 grain only, 3 the cascade below only
        out vec4 o;
        ${COMMON}
        float seedR(vec2 pum, float lod) { return (textureLod(u_seed, uvOf(pum), lod).r * 255.0 - 128.0) / 40.0; }
        float fadeO(float lam, float s) { float f = clamp((lam / s - 2.0) / 2.0, 0.0, 1.0); return f * f * (3.0 - 2.0 * f); }
        vec2 cart(vec2 uv) { float r = (2.0 + 4.0 * uv.y) * 1000.0, th = 6.2831853 * uv.x; return r * vec2(cos(th), sin(th)); }
        // the photo-scale fibre field: Σ w·A·e^{i(2π (x−q)·n/λ + φ)} over the polar pivots round p
        vec2 phasorZ(vec2 p, out float wsum, out float lamL) {
            vec2 uv = uvOf(p); float NU = u_pv.x, NV = u_pv.y, lam = u_pv.z, Lc = lam / 1.5;
            float fi = uv.x * NU - 0.5, fj = uv.y * NV - 0.5; int i0 = int(floor(fi)), j0 = int(floor(fj));
            float r = length(p), du = 6.2831853 * r / NU; int K = int(clamp(ceil(2.0 * Lc / max(du, 1e-3)), 2.0, 7.0));
            vec2 Z = vec2(0.0); wsum = 0.0; float wl = 0.0; lamL = 0.0;
            for (int dj = -1; dj <= 2; dj++) {
                int j = j0 + dj; if (j < 0 || j >= int(NV)) continue;
                for (int di = -7; di <= 8; di++) {
                    if (di < -K || di > K + 1) continue;
                    int i = (i0 + di) % int(NU); if (i < 0) i += int(NU);
                    vec4 t = texelFetch(u_phasor, ivec2(i, j), 0); if (t.a < 0.3) continue;   // alpha: the local width factor (0.6 by the pupil – 1)
                    vec2 quv = vec2((float(i) + 0.5) / NU, (float(j) + 0.5) / NV), q = cart(quv), dx = p - q;
                    float w = exp(-dot(dx, dx) / (Lc * Lc)); if (w < 1e-3) continue;
                    float thq = 6.2831853 * quv.x + 6.2831853 * t.b; vec2 n = vec2(cos(thq), sin(thq));
                    float lq = lam * t.a, A = t.g * t.g * u_pv.w, ph = u_dbg == 4 ? 6.2831853 * dot(p, n) / lq : 6.2831853 * dot(dx, n) / lq + 6.2831853 * t.r;   // dbg 4: the direction alone (no photo phase)
                    Z += w * A * vec2(cos(ph), sin(ph)); wsum += w; lamL += w * lq;
                }
            }
            lamL = wsum > 0.0 ? lamL / wsum : lam; return wsum > 0.0 ? Z / wsum : vec2(0.0);
        }
        // a soft cell octave: the seeded mosaic with soft walls (0.35 / 0.25) and soft pigment (τ 0.12); seeded = the cell's pigment
        // is the photo's grain averaged round its seed (the grain smeared into the cell), else hashed
        float softCell(vec2 p, float lamC, int k, vec2 t, vec2 nrm, bool seeded) {
            float c = lamC * 1.3; vec2 c0 = floor(p / c); float F1 = 1e9, F2 = 1e9, Ms = 0.0, Wm = 0.0;
            for (int oy = -2; oy <= 2; oy++) for (int ox = -2; ox <= 2; ox++) {
                vec2 ix = c0 + vec2(float(ox), float(oy));
                vec2 q = (ix + vec2(h3(ix, k, 5), h3(ix, k, 6))) * c, dd = p - q;
                float d = length(vec2(dot(dd, t) / 1.6, dot(dd, nrm))) / c;
                float m = seeded ? seedR(q, 1.5) * 1.6 : (h3(ix, k, 7) - 0.5) * 2.4; float wm = exp(-d / 0.12); Ms += wm * m; Wm += wm;
                if (d < F1) { F2 = F1; F1 = d; } else F2 = min(F2, d);
            }
            float e_ = (F2 - F1) / 0.35, cc = clamp(F1, 0.0, 1.0);
            return (0.55 * clamp(Ms / max(Wm, 1e-9), -2.5, 2.5) + 0.6 * ((1.0 - cc * cc) - 0.55) - 0.25 * (exp(-e_ * e_) - 0.25)) / 0.6;
        }
        float prof(float ph) { float u = clamp(0.5 + 0.5 * cos(ph), 1e-6, 1.0); return (pow(u, 1.6) - 0.4206) / 0.34; }
        float vnoise(vec2 x, int k) { vec2 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(h3(i, k, 31), h3(i + vec2(1, 0), k, 31), f.x), mix(h3(i + vec2(0, 1), k, 31), h3(i + vec2(1, 1), k, 31), f.x), f.y); }
        void main() {
            vec2 ij = gl_FragCoord.xy - u_slot;
            vec2 p = u_probe > 0.5 ? texelFetch(u_pts, ivec2(gl_FragCoord.xy), 0).xy : u_org + (ij - ${GUT}.0) * u_s;
            vec2 uv = uvOf(p);
            vec4 st = textureLod(u_steer, uv, 0.0), st2 = textureLod(u_steer2, uv, 0.0);
            float th = atan(p.y, p.x); vec2 cs = st.rg * 2.0 - 1.0; float phi = 0.5 * atan(cs.y, cs.x);
            vec2 t = vec2(cos(th + phi), sin(th + phi)), nrm = vec2(-t.y, t.x);
            float env = st2.b * 4.2, wall = clamp(st.a, 0.0, 1.0);
            float lamF;
            // ---- the photo's scale: grain 0.3 + fibres 0.7 (the measured sweet spot), wall-damped
            float ws; vec2 Z = phasorZ(p, ws, lamF); float ang = atan(Z.y, Z.x);
            float gA = textureLod(u_grainT, uv, 0.0).r;
            // in grain areas the fibres keep full strength even where the photo barely shows them (by the pupil): the phasor's
            // direction and phase still come from the photo, its amplitude from the eye's typical fibre (iori 2026-11-11)
            // finer is fainter (the pupillary zone's fibres: width 0.6 → 1 by the collarette), and gentler than the eye's typical fibre
            float sF = lamF / u_pv.z, Aref = u_pv.w * 0.35 * sF, A = mix(max(length(Z), 0.45 * Aref), 0.75 * Aref, gA);   // a floor everywhere: lines always cover the grain
            // a band between crypts floats as strands: every strand there at the eye's typical strength, so a tube does not thin, break and
            // reappear along its length with the photo's local amplitude (iori 2026-11-12: "chunky and lossy … discontinuous")
            float gB = textureLod(u_bridgeT, uv, 0.0).r; A = mix(A, Aref, smoothstep(0.25, 0.6, gB));
            float grain = seedR(p, 0.0), fib0 = A * prof(ang) * u_c0;
            float w0 = 0.7 * (1.0 - 0.8 * wall);
            // grain areas (data/<ref>.grain.png: fine energy without direction): the photo's grain gives way fully to the
            // generated structure there — fibres, and cells whose pigment is that grain averaged (iori 2026-11-11)
            float wg = mix(w0, 1.0, gA * (1.0 - wall));
            float cell0 = softCell(p, u_lam[0], 0, t, nrm, true);
            float struct0 = mix(fib0 * fadeO(lamF, u_s), cell0 * fadeO(u_lam[0] * 1.3, u_s), 0.12 * gA);   // lines, not grain-coloured cells
            // each faded by its own wavelength: at the default zoom's 4 µm texels the fibres are whole while the 9 µm grain is gone
            float Hn = prof(ang) / 1.7 * clamp(A / (u_pv.w * 0.35), 0.0, 1.5) * fadeO(lamF, u_s);   // the strands' height: crests up, gaps down
            // FLOATING strands (in crypts and the bands between them) are tubes cut from this crest field: there it must be the crest
            // alone, at one strength and without the finer octaves riding on it — the photo's local amplitude and the octaves made
            // each tube swell, pinch to nothing and reappear along its length: leaves and beads (iori 2026-11-12: "this discontinuous
            // behaviour is what needs patching")
            float wFloat = max(smoothstep(0.3, 0.7, st.b), smoothstep(0.25, 0.6, gB));
            Hn = mix(Hn, prof(ang) / 1.7 * 1.1, wFloat);
            float D = (u_dbg == 1 ? fib0 * fadeO(lamF, u_s) : u_dbg == 2 ? grain * fadeO(u_lam[0], u_s) : u_dbg == 3 ? 0.0 : (1.0 - wg) * grain * fadeO(u_lam[0], u_s) + wg * struct0) * u_mean;
            // ---- below the photo: fibre octaves 0.35 over soft cells 0.65, no fade
            float lev = u_oamp[1] * 0.75 * u_k * env;                     // every octave below as strong as the first
            for (int k = 1; k <= 3; k++) {
                float lamC = u_lam[k], lamK = lamF / exp2(float(k));
                float fC = fadeO(lamC, u_s), fK = fadeO(lamK, u_s); if (fC <= 0.0 && fK <= 0.0) continue;
                // fibres: the parent's phase doubled k times, a smooth per-octave jitter
                float jit = (vnoise(p / (lamK * 1.5), k) - 0.5) * 1.2;
                float fib = prof(exp2(float(k)) * ang + jit) * clamp(A / (u_pv.w * 0.35), 0.0, 1.5);
                // cells: the seeded mosaic's octave, soft walls (0.35 / 0.25) and soft pigment (τ 0.12)
                float cell = softCell(p, lamC, k, t, nrm, false);
                if (u_dbg == 0 || u_dbg == 3) D += (0.35 * fib * fK + 0.65 * cell * fC) * lev * u_subGain;
                Hn += fib / 1.7 * fK * exp2(-float(k)) * (1.0 - wFloat);          // finer fibres ride on the coarser ones, half as high each octave (not on floating strands)
            }
            float jitB = h3(floor(p / 12.0), 0, 11);                         // birth jitter per 12 µm cell (the print)
            o = vec4(isnan(D) || isinf(D) ? 0.0 : D, floor(gA * 15.0 + 0.5) + 16.0 * floor(gB * 15.0 + 0.5) + jitB * 0.9, isnan(Hn) ? 0.0 : Hn, phi);   // G: grain 0–15 + 16 × bridge 0–15 + jitter   // A: the fibre's direction against the radial (the render smears along it)
        }`;

    // ------------------------------------------------------------------ the photo-shader variant (from the tissue variant)
    function variantSource(src) {
        const need = (a, b) => { if (!src.includes(a)) throw new Error('flydown: tissue variant anchor missing: ' + a.slice(0, 50)); src = src.replace(a, b); };
        // the K1 origin textures are never read while the layer model owns the atlas (u_tisK1 0): their two samplers carry the pages
        need('uniform sampler2D u_tisO0, u_tisO1;', `uniform sampler2D u_fdAtlas, u_fdTable;
        uniform float u_fdRim, u_fdRimOk; uniform vec3 u_fdRope; uniform vec3 u_fdRimP; uniform ivec3 u_fdRimSz; uniform float u_fdSdf, u_fdRidge, u_fdTube, u_fdBridge, u_fdSmear, u_fdSlim, u_fdRelPx, u_fdTubeB, u_fdGapOn; float g_fdRel = 1.0, g_fdRT0 = 0.0, g_fdKind = 0.0, g_fdLip = 0.0; vec2 g_fdLipUv = vec2(0.0); vec2 g_fdOff = vec2(0.0); float g_fdBr = 0.0, g_fdFloorW = 0.0, g_fdFloorT = 0.5; vec2 g_fdUvA = vec2(0.0), g_fdUvB = vec2(0.0);
        // one random number per pixel and accumulation sample (the slim path: averages spread over the frames the engine accumulates)
        // stratified over the frames: a per-pixel start, then the golden-ratio sequence — the samples cover the stretch evenly, not at random
        float fdRnd(float salt) { vec3 p3 = fract(vec3(gl_FragCoord.xy, salt) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yxz + 33.33); return fract(fract((p3.x + p3.y) * p3.z) + float(u_frame) * 0.6180339887); } float g_fdCov = 1.0, g_fdSlab = 0.0, g_fdZc = 0.0, g_fdR = 0.0, g_fdHn = 0.0; vec2 g_fdHGrad = vec2(0.0);
        uniform float u_fdOn, u_fdTime, u_fdFade, u_fdSpread, u_fdHK, u_fdPx, u_fdForceF, u_fdKeep12, u_fdFibre, u_fdTisN; vec3 g_fdDbg = vec3(0.0); uniform int u_fdRow[${LV + 1}];
        uniform float u_walk, u_walkPix, u_walkFov; uniform vec3 u_walkPos, u_walkF, u_walkR, u_walkU;
        float g_fdLvH = 0.0, g_fdLvPhi = 0.0, g_fdPhi = 0.0; vec2 g_fdLvHG = vec2(0.0); float g_fdW = 0.0, g_fdM = 1.0, g_fdWet = 0.0, g_fdGrain = 0.0; vec2 g_fdGrad = vec2(0.0);
        // one level: D and its gradient (per µm) at p, or -1e9 when the page is not resident
        float fdLevel(vec2 p, int L, out vec2 grad) {
            float s = 4.0 / exp2(float(L)), ext = ${PAY}.0 * s; vec2 g = (p + ${EXT}.0) / ext; ivec2 pg = ivec2(floor(g));
            int ncol = u_fdRow[L + 1] - u_fdRow[L]; grad = vec2(0.0);
            if (pg.x < 0 || pg.y < 0 || pg.x >= ncol || pg.y >= ncol) return -1e9;
            vec4 e = texelFetch(u_fdTable, ivec2(pg.x, u_fdRow[L] + pg.y), 0);
            if (e.r < 0.5) return -1e9;
            int slot = int(e.r + 0.5) - 1; vec2 so = vec2(float(slot % ${SLOTS_X}), float(slot / ${SLOTS_X})) * ${PAGE}.0;
            vec2 tc = so + ${GUT}.0 + (g - vec2(pg)) * ${PAY}.0;                  // atlas texel coordinates (centres at +0.5)
            const float A = ${ATLAS}.0;
            vec4 a = textureLod(u_fdAtlas, tc / A, 0.0);
            vec4 dX = textureLod(u_fdAtlas, (tc + vec2(1.0, 0.0)) / A, 0.0) - textureLod(u_fdAtlas, (tc - vec2(1.0, 0.0)) / A, 0.0);
            vec4 dY = textureLod(u_fdAtlas, (tc + vec2(0.0, 1.0)) / A, 0.0) - textureLod(u_fdAtlas, (tc - vec2(0.0, 1.0)) / A, 0.0);
            float gx = dX.r, gy = dY.r;
            float gr = smoothstep(0.0, u_fdFade, u_fdTime - e.g - fract(a.g) / 0.9 * u_fdSpread);   // growth: the page, then its cells
            g_fdGrain = max(g_fdGrain, mod(floor(a.g), 16.0) / 15.0);                   // the grain-area weight packed beside the jitter (and the bridge above it)
            g_fdWet = max(g_fdWet, 4.0 * gr * (1.0 - gr));                            // the print's wet front (print.js): darkest mid-way, dry when set
            grad = vec2(gx, gy) / (2.0 * s) * gr;
            g_fdLvPhi = a.a; g_fdLvH = a.b * gr; g_fdLvHG = vec2(dX.b, dY.b) / (2.0 * s) * gr;   // the strand height (units of Hn) and its slope per µm
            return a.r * gr;
        }
        // the strand height alone, for the march: one level, one fetch (no slopes, no side effects)
        float g_fdLvGap = 0.0;
        float fdLevelH(vec2 p, int L) {
            float s = 4.0 / exp2(float(L)), ext = ${PAY}.0 * s; vec2 g = (p + ${EXT}.0) / ext; ivec2 pg = ivec2(floor(g));
            int ncol = u_fdRow[L + 1] - u_fdRow[L];
            if (pg.x < 0 || pg.y < 0 || pg.x >= ncol || pg.y >= ncol) return -1e9;
            vec4 e = texelFetch(u_fdTable, ivec2(pg.x, u_fdRow[L] + pg.y), 0); if (e.r < 0.5) return -1e9;
            int slot = int(e.r + 0.5) - 1; vec2 so = vec2(float(slot % ${SLOTS_X}), float(slot / ${SLOTS_X})) * ${PAGE}.0;
            vec4 a = textureLod(u_fdAtlas, (so + ${GUT}.0 + (g - vec2(pg)) * ${PAY}.0) / ${ATLAS}.0, 0.0);
            float gr = smoothstep(0.0, u_fdFade, u_fdTime - e.g - fract(a.g) / 0.9 * u_fdSpread);
            g_fdLvGap = floor(floor(a.g) / 16.0) / 15.0 * gr; g_fdLvPhi = a.a;           // the band between crypts, the fibre's direction
            return a.b * gr;
        }
        // Hn at uv for a pixel footprint, × how visible the strands are there (0 where they are too small to draw)
        float fdHn(vec2 uv, float pxMm) {
            g_fdLvGap = 0.0; if (u_fdOn < 0.5) return 0.0;
            float fd = u_fdForceF > 0.0 ? u_fdForceF / u_fdPx : pxMm * 1000.0; if (fd > 0.5 * u_fdFibre) return 0.0;
            float lf = log2(4.0 / (fd * u_fdPx)), w0 = lf < 0.0 ? 1.0 - smoothstep(u_fdFibre / 3.0, u_fdFibre / 2.0, fd) : 1.0;
            int L0 = min(int(floor(max(lf, 0.0))), ${LV - 1});
            float rr = 2.0 + 4.0 * uv.y, th = 6.2831853 * uv.x; vec2 p = rr * vec2(cos(th), sin(th)) * 1000.0;
            for (int l = L0; l >= 0; l--) { float h = fdLevelH(p, l); if (h > -1e8) { g_fdLvGap *= w0; return h * w0; } }
            g_fdLvGap = 0.0; return 0.0;
        }
        // a crypt's floating strands (§5.2.3's grammar): a strand where Hn crests, a tube of radius ≤ u_fdTube µm, its centre
        // half-way between the floor (hh, mm) and the sheet's level (0) — so they meet the sheet at the crypt's rim
        bool fdTube(float Hn, float hh, float cov, out float zc, out float rT) {
            zc = 0.5 * hh; rT = u_fdTube * 0.001 * sqrt(clamp((Hn - 0.15) / 0.6, 0.0, 1.0)) * (1.0 - smoothstep(0.3, 0.6, cov));
            return u_fdBridge > 0.5 && rT > 0.0 && -hh > 2.0 * rT + 0.004;
        }
        float fdAt(vec2 p, int L, out vec2 grad) {                                // fall back to coarser levels while the page grows
            for (int l = L; l >= 0; l--) { float d = fdLevel(p, l, grad); if (d > -1e8) return d; }
            grad = vec2(0.0); return 0.0;
        }
        // the multiplier on the tissue's albedo; sets g_fdW (how far the photo's 6 µm statistics are replaced) and the micro slope
        float fdDetail(vec2 uv, float pxMm) {
            g_fdW = 0.0; g_fdGrad = vec2(0.0); g_fdWet = 0.0; g_fdGrain = 0.0; g_fdHn = 0.0; g_fdHGrad = vec2(0.0); g_fdLvH = 0.0; g_fdLvHG = vec2(0.0);
            float f = u_fdForceF > 0.0 ? u_fdForceF : pxMm * 1000.0 * u_fdPx, lf = log2(4.0 / f);             // texels per CSS pixel (study/17 §5.1), not per device pixel
            // iori 2026-11-11: the stranding shows at every zoom, the default one included — only where its fibres are too
            // small to draw (beyond half the fibre wavelength per pixel) is there nothing, exactly
            float fd = u_fdForceF > 0.0 ? u_fdForceF / u_fdPx : pxMm * 1000.0;   // DEVICE px: the fibres are drawn at the screen's own resolution
            if (u_fdOn < 0.5 || fd > 0.5 * u_fdFibre) return 1.0;
            float rr = 2.0 + 4.0 * uv.y, th = 6.2831853 * uv.x; vec2 p = rr * vec2(cos(th), sin(th)) * 1000.0;
            float wF = 1.0 - smoothstep(u_fdFibre / 3.0, u_fdFibre / 2.0, fd);    // the fibres fade with their own size
            float wSub = smoothstep(-0.585, 0.0, lf);                              // below the photo: the statistics give way (decision 2)
            float w0 = lf < 0.0 ? wF : 1.0; lf = max(lf, 0.0);
            int L0 = min(int(floor(lf)), ${LV - 1}); float t = L0 < ${LV - 1} ? lf - float(L0) : 0.0;
            vec2 gA, gB; float dA = fdAt(p, L0, gA), dB = dA; gB = gA; float hA = g_fdLvH, hB = hA; vec2 hgA = g_fdLvHG, hgB = hgA;
            if (t > 0.0) { dB = fdAt(p, L0 + 1, gB); hB = g_fdLvH; hgB = g_fdLvHG; }
            g_fdHn = mix(hA, hB, t) * w0; g_fdHGrad = mix(hgA, hgB, t) * w0; g_fdPhi = g_fdLvPhi;
            { vec2 gg; g_fdDbg = vec3(fdLevel(p, L0, gg) > -1e8 ? 1.0 : 0.0, L0 < ${LV - 1} && fdLevel(p, L0 + 1, gg) > -1e8 ? 1.0 : 0.0, float(L0) + t); }
            // the statistical grain gives way wherever the strands are drawn (iori 2026-11-11: noise near the pupil), not only below the photo
            float D = mix(dA, dB, t) * w0; g_fdGrad = mix(gA, gB, t) * w0; g_fdW = max(wSub, w0);
            return exp(D) * (1.0 - 0.22 * g_fdWet * w0);                             // one grammar with the opening print
        }
        uniform sampler2D u_tisO0x;`);
        src = src.replace(/textureLod\(u_tisO0, uv, lod\)/g, 'vec4(0.0)').replace(/textureLod\(u_tisO1, uv, lod\)/g, 'vec4(0.0)');
        if (/u_tisO[01]\b/.test(src.replace('uniform sampler2D u_tisO0x;', ''))) throw new Error('flydown: a K1 origin read survived');
        src = src.replace('uniform sampler2D u_tisO0x;', '');
        // the footprint: in the walk it is the pixel's angle × the distance to the hit
        need('float mmPerPx = (24.0 * u_view.w / u_resolution.y) / 100.0 * (u_zoom + 3.5) / 1.1;',
             'float mmPerPx = u_walk > 0.5 ? u_walkPix * length(P - pIn) : (24.0 * u_view.w / u_resolution.y) / 100.0 * (u_zoom + 3.5) / 1.1;');
        // the walk sees the relief at grazing angles: four times the march steps (the loop's own limit too), so crypt walls do not stair-step
        need('int nM = int(u_marchSteps + 0.5);', 'int nM = u_walk > 0.5 ? 96 : int(u_marchSteps + 0.5);');
        need('for (int i = 1; i <= 24; i++) {\n                if (i > nM) break;\n                float tt = tStart + dt * float(i);', 'for (int i = 1; i <= 96; i++) {\n                if (i > nM) break;\n                float tt = tStart + dt * float(i);');
        // looking up from the surface: the cornea and the room beyond it, dim, instead of black space
        need('if (t < 0.0) return vec3(0.0);', 'if (t < 0.0) return u_walk > 0.5 ? (0.22 + 0.25 * clamp(-dIn.z, 0.0, 1.0)) * vec3(0.86, 0.9, 0.95) : vec3(0.0);');
        need('float tStart = -(H_MAX) / max(dIn.z, 0.15), tEnd = -(H_MIN) / max(dIn.z, 0.15);',
             'float tStart = -(H_MAX) / max(dIn.z, 0.15), tEnd = -(H_MIN) / max(dIn.z, 0.15); if (u_walk > 0.5) tStart = max(tStart, -t + 1e-4);   // the walk: never behind the camera');
        // the detail, after the layer model's albedo, replacing the 6 µm statistics as it comes in (decision 2)
        // iori 2026-11-12: "the noise block chunks on the base color are not smeared by the advection lines" — the statistics'
        // octaves that stay under the strands (12, 24, 48 µm) are round noise; where the strands are drawn each is averaged along
        // the fibre (5 taps over ~4 of its cells), so it streaks with the lines instead of sitting under them in blobs
        need('float ablHp(vec2 mm, float cell, float rot, vec2 off) {', `float ablHp0(vec2 mm, float cell, float rot, vec2 off);
        float ablHp(vec2 mm, float cell, float rot, vec2 off) {
            if (g_fdW < 0.01 || cell < 0.01 || u_fdSmear < 0.5) return ablHp0(mm, cell, rot, off);
            float tt = atan(mm.y, mm.x) + g_fdPhi; vec2 T2 = vec2(cos(tt), sin(tt)) * cell * 0.9 * g_fdW;
            // slim (2026-11-12): one tap at a random place on the same 5-cell stretch per sample — the accumulation is the average
            if (u_fdSlim > 0.5) return ablHp0(mm + (fdRnd(cell * 1000.0) * 5.0 - 2.5) * T2, cell, rot, off) * mix(1.0, 1.7, g_fdW);
            float acc = 0.0;
            for (int k = -2; k <= 2; k++) acc += ablHp0(mm + float(k) * T2, cell, rot, off);
            return acc / 5.0 * mix(1.0, 1.7, g_fdW);                           // the averaging's lost contrast, given back
        }
        float ablHp0(vec2 mm, float cell, float rot, vec2 off) {`);
        // slim: one tap per sample carries the whole within-stretch variance, so the average of exp() comes out brighter than exp()
        // of the average (Jensen); the stretch's share of each smeared octave's variance (≈ 0.65 over ~4.5 cells, × the contrast
        // given back) comes off the normalisation, so the converged frame keeps the old one's mean
        need('return exp(k * t) / exp(0.5 * k * k * dot(a * a, u_ablOctVar));', `float sm2 = u_fdSlim > 0.5 && u_fdSmear > 0.5 && g_fdW > 0.01 ? 0.65 * pow(mix(1.0, 1.7, g_fdW), 2.0) : 0.0;
            return exp(k * t) / exp(0.5 * k * k * (dot(a * a, u_ablOctVar) + sm2 * dot(a.yzw * a.yzw, u_ablOctVar.yzw)));`);
        need('vec4 tsA = tisAlb(uv, lod);', `vec4 tsA = tisAlb(uv, lod);
            g_fdM = fdDetail(uv, mmPerPx); g_fdCov = g_fdSlab > 0.5 ? 0.0 : fdSheet(uv, lod);
            if (g_fdLip > 0.5) { tsA = tisAlb(g_fdLipUv, lod); g_fdM = fdDetail(g_fdLipUv, mmPerPx); }   // the rim's lip: the sheet it runs on from
            if (g_fdFloorW > 0.01 && g_fdSlab < 0.5) {                        // the healed ground under a band: its two bordering floors carried across
                float mA = fdDetail(g_fdUvA, mmPerPx), mB = fdDetail(g_fdUvB, mmPerPx);
                tsA = mix(tsA, mix(tisAlb(g_fdUvA, lod), tisAlb(g_fdUvB, lod), g_fdFloorT), g_fdFloorW);
                g_fdM = mix(g_fdM, mix(mA, mB, g_fdFloorT), g_fdFloorW); g_fdCov = 0.0; g_fdHGrad *= 1.0 - g_fdFloorW;
            }
            // the layer model's albedo holds the photo's grain at the photo's own sharpness near the pupil, where its texels
            // are ~2 µm apart round the ring (6 µm further out): where the strands are drawn, average it round the ring to the
            // same 6 µm everywhere, so the grain does not read as noise by the pupil (iori 2026-11-11)
            if (g_fdW > 0.0 && u_fdTisN > 0.0) {
                float tu = 6.2831853 * (2.0 + 4.0 * uv.y) * 1000.0 / u_fdTisN, nt = clamp(mix(6.0, 15.0, g_fdGrain) / tu, 1.0, 8.0);   // 6 µm, 15 µm in grain areas
                if (nt > 1.2) {
                    vec4 acc = vec4(0.0);
                    for (int k = -2; k <= 2; k++) acc += tisAlb(uv + vec2(float(k) * 0.25 * (nt - 1.0) / u_fdTisN, 0.0), lod);
                    tsA = mix(tsA, acc / 5.0, g_fdW);
                }
                if (g_fdGrain > 0.02) {                                                // grain areas: smear radially too (≈ 12 µm)
                    vec4 acc = vec4(0.0); float dvT = 0.015 / (4.0 * 0.97);           // ≈ 3.75 µm of tissue v per step (≈ 15 µm)
                    for (int k = -2; k <= 2; k++) acc += tisAlb(uv + vec2(0.0, float(k) * dvT), lod);
                    tsA = mix(tsA, acc / 5.0, g_fdW * g_fdGrain);
                }
            }
            // and the layer model's colour itself, averaged along the fibre (~24 µm) where the strands are drawn
            if (g_fdW > 0.01 && u_fdSmear > 0.5) {
                float rr = 2.0 + 4.0 * uv.y, tt = g_fdPhi; vec2 dd = vec2(sin(tt) / (6.2831853 * rr), cos(tt) / 4.0) * 0.006 * g_fdW;   // 6 µm per tap: (tangential, radial) in uv
                if (u_fdSlim > 0.5) tsA = mix(tsA, tisAlb(uv + (fdRnd(7.0) * 5.0 - 2.5) * dd, lod), g_fdW);   // slim: one random tap per sample
                else { vec4 acc = vec4(0.0); for (int k = -2; k <= 2; k++) acc += tisAlb(uv + float(k) * dd, lod); tsA = mix(tsA, acc / 5.0, g_fdW); }
            }
            if (u_debug > 16.5 && u_debug < 17.5) return vec3(uv, mmPerPx + 1000.0);   // request map: uv and footprint (flagged)
            if (u_debug > 17.5 && u_debug < 18.5) return vec3(g_fdM, g_fdW, mmPerPx * 1000.0);
            if (u_debug > 19.5 && u_debug < 20.5) return g_fdDbg + vec3(0.0, 0.0, 1000.0);
            if (u_debug > 21.5 && u_debug < 22.5) { float hr = tissueH(uv, lod), fw = fdRimFrame(uv, hr, lod); vec2 cq; vec2 mq = tisIn(u_tissueRect, uv, cq) && u_fdRimOk > 0.5 ? fdRimMap(cq) : vec2(1.0); return vec3(fw, clamp(-hr * 4.0, 0.0, 1.0), clamp(0.5 + mq.x * 5.0, 0.0, 1.0)); }   // the rims: frame on, depth (250 µm = 1), the baked distance (0.5 = the edge, ±100 µm)
            if (u_debug > 20.5 && u_debug < 21.5) return vec3(0.5 + 0.5 * g_fdHn, g_fdCov, g_fdSlab);   // the strands' relief: height, sheet coverage, on a floating strand
            if (u_debug > 18.5 && u_debug < 19.5) return vec3(0.18 * pow(g_fdM, 4.0));   // the detail alone, ×4 in log, on grey   // diagnostics: the multiplier, the replacement weight, µm/px
            if (u_debug > 15.5 && u_debug < 16.5) return P + vec3(0.0, 0.0, 1000.0);   // hit point (flagged)`);
        // decision 2: the statistics' 6 µm octave (and half the 12 µm one) give way to the seeded cascade as it comes in; 24 and 48 µm stay
        need('vec4 a = u_ablAmp * fd;', 'vec4 a = u_ablAmp * fd * vec4(1.0 - g_fdW, u_fdKeep12 > 0.5 ? 1.0 : 1.0 - 0.5 * g_fdW, 1.0, 1.0);');   // keep12: the statistics\' 12 µm octave stays under the cascade
        need('float tisRidge0 = t1.a;', 'tsA.rgb *= g_fdM * (g_fdBr > 1.0 ? pow(0.72, g_fdBr - 1.0) : 1.0); if (g_fdSlab > 0.5 && g_fdBr < 0.5 && g_fdLip < 0.5) { float yl = dot(tsA.rgb, vec3(0.2126, 0.7152, 0.0722)); tsA.rgb = clamp(mix(tsA.rgb, vec3(yl), 0.3) * 1.8, 0.0, 1.0); }   /* a floating strand: collagen, paler than the crypt floor it was read from */ float tisRidge0 = t1.a;');
        // micro relief from the detail: brighter = raised (fibre crests), height = hk µm per unit of log luminance.
        // The tissue plane is the eye's xy turned by π (th = ang + π), so the gradient changes sign.
        need('vec3 N = normalize(Ng + (slopeR * radial + slopeT * tangent));',
             'vec3 N = normalize(Ng + (slopeR * radial + slopeT * tangent) * (1.0 - g_fdSlab) * (1.0 - g_fdFloorW) + vec3(-u_fdHK * g_fdGrad - u_fdRidge * (g_fdSlab > 0.5 ? 3.0 : g_fdCov) * g_fdHGrad, 0.0)); if (g_fdKind > 2.5 && g_fdSlab > 0.5) N = fdSdNormal(Pp, rp, lod, mmPerPx);   /* the SDF strand: its own normal */');
        // ---- the strands' own relief (iori 2026-11-11: "ridges on the sheet and floating strands at the crypts"). On the border
        // layer's sheet the strands are low ridges (u_fdRidge µm per unit of Hn): the bump above and the march below. In a crypt
        // (a hole in the sheet) they are bridges: tubes floating half-way up from the floor (fdTube), which the view ray and the
        // light's shadow ray test before the floor, so the floor shows between them and takes their shadows.
        need('float tissueH(vec2 uv, float lod) {', `float fdSheet(vec2 uv, float lod) { vec4 a = tisAux(uv, lod); return a.a > 0.0 ? clamp(a.g, 0.0, 1.0) : 1.0; }
        float tissueH(vec2 uv, float lod);
        // ---- the bands BETWEEN crypts float (iori 2026-11-12: "remove the hill under bridges to form them as strand bridges and heal the
        // terrain underneath by smearing the lines of the bordering tissue around the bridge gap"). Under a band the ground drops to
        // the crypt floors on either side: across the band (perpendicular to its fibres, phi) the floor is looked for at 80 / 200 /
        // 350 µm each way, the deepest each side kept; the ground is their mix by where the point lies between them. uvA / uvB are
        // the two floor points — the healed ground takes its colour and lines from them, carried straight across the gap.
        float fdGround(vec2 uv, float hh, float phi, float lod, out vec2 uvA, out vec2 uvB, out float tAB, out float found) {
            float rr = 2.0 + 4.0 * uv.y; vec2 ac = vec2(cos(phi) / (6.2831853 * rr), -sin(phi) / 4.0);   // across the band, per mm, in uv
            float hA = 1e9, hB = 1e9, dA = 0.2, dB = 0.2;
            for (int k = 0; k < 6; k++) { float d = k == 0 ? 0.06 : k == 1 ? 0.12 : k == 2 ? 0.2 : k == 3 ? 0.3 : k == 4 ? 0.42 : 0.56;   // out to 560 µm (a band can be 500 µm wide)
                float a = tissueH(uv + ac * d, lod), b = tissueH(uv - ac * d, lod);
                if (a < hA) { hA = a; dA = d; } if (b < hB) { hB = b; dB = d; } }
            uvA = uv + ac * dA; uvB = uv - ac * dB; tAB = dA / (dA + dB);
            // a bridge only where a real floor lies on BOTH sides (≥ 20 µm below the band); else the band stays ground (found = 0)
            float drop = min(hh - hA, hh - hB); found = smoothstep(0.02, 0.04, drop);
            return min(hh, mix(hA, hB, tAB));
        }
        // ---- the floating strands as a SIGNED DISTANCE FIELD (iori 2026-11-12: "prototype SDF"; floating strands first, from the strand
        // field, walk and deep zooms). A floating strand's crest field is prof(phase) at one strength, so the phase — and with it the
        // sideways distance to the nearest strand axis, |phase| / 2π × the fibre width — is read back from the height channel. Crypt
        // strands: tubes of u_fdTube µm at half the floor's depth; a band's bundle: up to three layers below its old top, each lower
        // layer half a strand across. Distance in mm (approximate: the phase is not a true distance, so steps are taken at 0.7 ×)
        float g_fdSdK = 0.0;
        float fdRope(vec2 uv, float hp, float hh, float fh, float pxMm, bool fib, out float k);
        float fdSdStrands(vec2 uv, float hp, float hh, float lod, float pxMm) {
            float fh = fdHn(uv, pxMm); if (fh == 0.0 && g_fdLvGap == 0.0) return 1e3;
            float pr = clamp(fh * 1.7 / 1.1, -0.4206 / 0.34 + 1e-4, (1.0 - 0.4206) / 0.34);
            float uc = pow(pr * 0.34 + 0.4206, 1.0 / 1.6), ph = acos(clamp(2.0 * uc - 1.0, -1.0, 1.0));   // |phase| in [0, π]
            float lam = u_fdFibre * 0.001, d0 = ph / 6.2831853 * lam, d1 = (3.14159265 - ph) / 6.2831853 * lam;   // to the nearest axis; to the one half a strand over
            float d = 1e3; g_fdSdK = 0.0;
            float gw = u_fdGapOn > 0.5 ? smoothstep(0.25, 0.6, g_fdLvGap) : 0.0;
            if (gw > 0.05 && u_fdRope.x > 0.5 && u_fdRimOk > 0.5) {               // a band's ROPE (fdRope), topped at its old surface hh
                float k; d = fdRope(uv, hp, hh, fh, pxMm, true, k); if (d < 1e2) g_fdSdK = k;
            } else if (gw > 0.05) {                                                  // a band's bundle, topped at its old surface hh
                float rT = u_fdTubeB * 0.001 * gw;
                for (int k = 0; k < 3; k++) { float rk = rT * (1.0 - 0.15 * float(k)), zk = hh - rT - 1.9 * rT * float(k);
                    float dk = length(vec2(k == 1 ? d1 : d0, hp - zk)) - rk; if (dk < d) { d = dk; g_fdSdK = 2.0 + float(k); } }
            } else {
                // a crypt tube runs half-way up the crypt and, where the crypt shallows or the sheet closes over it, SINKS into the
                // ground before it thins away, so both its ends are rooted (the field probe, 2026-11-13: 145 tubes cut off in mid-air
                // by the old depth test and the coverage fade; iori: "fix the flakes")
                float cov = fdSheet(uv, lod), R = u_fdTube * 0.001 * (1.0 - smoothstep(0.45, 0.6, cov)), zt = mix(0.5 * hh, hh - 0.5 * u_fdTube * 0.001, smoothstep(0.3, 0.45, cov));
                if (u_fdBridge > 0.5 && R > 0.0) { d = length(vec2(d0, hp - min(zt, 0.5 * hh))) - R; g_fdSdK = 1.0; }
            }
            return d;
        }
        // ---- the crypt RIM as a distance field (iori 2026-11-12: "Yes, crypt rims"). A height map can only draw a crypt's wall as a
        // cliff; a real rim is the border layer's sheet running on past the wall as an overhanging lip (rolled round at its edge, a little
        // drooped, its reach varying along the edge) over a wall cut back under it. Where the ground drops steeply by ≥ 50 µm (to 80 µm downhill), the profile
        // across the drop (along the coarse uphill direction n, at −40 … +40 µm) gives the wall's top edge; there
        //   the lip   a capsule in (across, height): from rimOv µm out over the crypt to past the undercut, rimT µm thick, its top the sheet's
        //   the wall  the profile shifted rimUc µm back uphill — the height field the march tests, so the floor runs in under the lip
        float g_fdRimW = 0.0, g_fdRimX = 0.0, g_fdRimHT = 0.0, g_fdRimHU = 0.0, g_fdRimOv = 0.0; vec2 g_fdRimUvT = vec2(0.0);
        // the baked edge map (bakeRim): rows u_fdRimSz.z … of the page table, bilinear by hand (the table is NEAREST); x wraps round the ring
        vec2 fdMapAt(vec2 c, int band) {   // band 0: the crypt map; 1: the band map (rows H below it)
            vec2 q = c * vec2(u_fdRimSz.xy) - 0.5; ivec2 i = ivec2(floor(q)); vec2 f = q - vec2(i); int W = u_fdRimSz.x, H = u_fdRimSz.y, r0 = u_fdRimSz.z + band * u_fdRimSz.y;
            int x0 = (i.x % W + W) % W, x1 = ((i.x + 1) % W + W) % W, y0 = clamp(i.y, 0, H - 1), y1 = clamp(i.y + 1, 0, H - 1);
            vec2 a = texelFetch(u_fdTable, ivec2(x0, r0 + y0), 0).rg, b = texelFetch(u_fdTable, ivec2(x1, r0 + y0), 0).rg;
            vec2 d = texelFetch(u_fdTable, ivec2(x0, r0 + y1), 0).rg, e = texelFetch(u_fdTable, ivec2(x1, r0 + y1), 0).rg;
            return mix(mix(a, b, f.x), mix(d, e, f.x), f.y);
        }
        vec2 fdRimMap(vec2 c) { return fdMapAt(c, 0); }
        // ---- a band between crypts as a ROPE (iori 2026-11-12: "Yes, ropes"; study/flydown/ref: a bridge is a round rope of fibres,
        // 40–60 µm mid-span, flaring into the rim where the band widens). The band's axis and half-width come from the baked edge map:
        // across the band (ac, ⊥ the fibres) the signed distance to the crypt edges is w − |x|, so two samples δ either side give
        // x = (sB − sA) / 2 and w = (sA + sB) / 2 + δ. The section: a capsule, Rv = min(w, ropeR) high (round where the band is
        // narrow, flattening into a slab as it widens at its ends), w wide, its top the old surface hh. Its fibres are the strand
        // lines already there, carried round it: a point at arc length s round the section (from the top's centre line) reads the
        // line pattern at s across the band, so the top is the lines as they were and the sides continue them round. Each line is a
        // tube of u_fdTubeB µm on a core one tube in. k (out): 2 at the top … 3.5 underneath (a little darker: the shading's layer rule)
        // the line pattern's distance to the nearest line's axis (mm) from a crest value (prof inverted, as fdSdStrands)
        float fdLineD(float fw) {
            float pr = clamp(fw * 1.7 / 1.1, -0.4206 / 0.34 + 1e-4, (1.0 - 0.4206) / 0.34);
            float uc = pow(pr * 0.34 + 0.4206, 1.0 / 1.6), ph = acos(clamp(2.0 * uc - 1.0, -1.0, 1.0));
            return ph / 6.2831853 * u_fdFibre * 0.001;
        }
        float fdSmin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
        // FORKS (iori 2026-11-12: "Yes, add forks"; ref crop A: a bridge divides where the gap between its crypts widens; crop C: a wide
        // bridge is several bundles side by side with loose fibres between). By the band's half-width over the rope's height f = w / Rv:
        // below 1.3 one round rope; from 2.2 two ropes of ¾ the height along the band's edges; as it widens further, more ropes come up
        // on a lattice about the band's axis (pitch 3.2 Rv, each growing in as the room for it opens), so the Y opens into a ladder. Between
        // the ropes only the top row of lines stays, finer: loose fibres. Ropes joined with fillets (smooth min, 0.3 Rs)
        // TIERS (iori 2026-11-12: "ropes and strands like these would have multiple layers stacked and bundled together" — "Yes please"):
        // under the ropes, a second tier of thinner ones (0.65), set in the gaps (half a pitch over) and one rope lower; the loose fibres
        // between ropes in three rows down the tier (the lines, the half-over lines, the lines; each finer); every rope its own thickness
        // (0.7–1.1, a slow noise along the band per rope, so a rope keeps its size along its length)
        float fdVn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            vec4 h = fract(sin(vec4(dot(i, vec2(127.1, 311.7)), dot(i + vec2(1.0, 0.0), vec2(127.1, 311.7)), dot(i + vec2(0.0, 1.0), vec2(127.1, 311.7)), dot(i + 1.0, vec2(127.1, 311.7)))) * 43758.5453);
            return mix(mix(h.x, h.y, f.x), mix(h.z, h.w, f.x), f.y); }
        float fdRope(vec2 uv, float hp, float hh, float fh, float pxMm, bool fib, out float k) {
            k = 2.0; float rr = 2.0 + 4.0 * uv.y, phi = g_fdLvPhi, gap = g_fdLvGap; vec2 ac = vec2(cos(phi) / (6.2831853 * rr), -sin(phi) / 4.0);
            const float dl = 0.25; vec2 cA, cB;   // ±250 µm: wider than the widest band's half (the estimate holds while |x| ≤ δ)
            if (!tisIn(u_tissueRect, uv + ac * dl, cA) || !tisIn(u_tissueRect, uv - ac * dl, cB)) return 1e3;
            float sA = fdMapAt(cA, 1).r, sB = fdMapAt(cB, 1).r, x = 0.5 * (sB - sA), w = max(0.5 * (sA + sB) + dl, 0.006);   // the band map: w − |x| inside
            // the TAPER (iori 2026-11-13: "fix the taper"; ref: thinnest mid-span, about 2x at the ends, a fillet into the sheet): within
            // 90 µm of where the band meets the sheet (the band map's G, baked) the rope grows to 1.7 x ropeR and stops forking, so its end
            // is one wide stadium running into the sheet, not a ladder of thin ropes
            vec2 cE; float fl = tisIn(u_tissueRect, uv, cE) ? 1.0 - smoothstep(0.0, 0.09, fdMapAt(cE, 1).g) : 0.0;
            float Rv = min(w, u_fdRope.y * 0.001 * (1.0 + 0.7 * fl)), f = w / Rv, fork = u_fdRope.z * smoothstep(1.3, 2.2, f) * (1.0 - fl);
            float Rs = Rv * (1.0 - 0.25 * fork), a = max(w - Rs, 0.0), tW = mix(2.0 * Rs, 0.3 * Rs, fork), kf = 0.3 * Rs, P = 3.2 * Rv;
            vec2 nz = uv * vec2(40.0, 10.0);                                       // ~0.5 mm cells: each rope's thickness drifts slowly along it
            // the edge rope (its outer side on the band's edge), the nearest upper rope inside, the nearest lower rope (half a pitch over)
            float RE = Rs * mix(1.0, 0.7 + 0.4 * fdVn(nz + (x >= 0.0 ? 11.3 : 23.9)), fork), aE = max(w - RE, 0.0), cx = x >= 0.0 ? aE : -aE;
            float ki = floor(x / P + 0.5), xk = P * ki, rk = Rs * fork * smoothstep(0.6 * P, 1.0 * P, a - abs(xk)) * (0.7 + 0.4 * fdVn(nz + ki * 5.1 + 37.0));
            float kl = floor(x / P) + 0.5, xl = P * kl, rl = 0.65 * Rs * fork * smoothstep(0.1 * P, 0.4 * P, a - abs(xl)) * (0.7 + 0.4 * fdVn(nz + kl * 7.3 + 71.0));
            vec2 q = vec2(x - cx, hp - (hh - RE)), qk = vec2(x - xk, hp - (hh - rk)), ql = vec2(x - xl, hp - (hh - 1.5 * Rs - 0.5 * rl));
            float dC = length(q) - RE, dK = rk > 1e-4 ? length(qk) - rk : 1e3, dL = rl > 1e-4 ? length(ql) - rl : 1e3;
            vec2 pw = vec2(abs(x) - a, abs(hp - (hh - 0.5 * tW)) - 0.5 * tW); float dW = length(max(pw, 0.0)) + min(max(pw.x, pw.y), 0.0);
            float dBase = fdSmin(fdSmin(fdSmin(dC, dK, kf), dL, kf), dW, kf);
            k = 2.0 + 1.5 * clamp((hh - hp) / (2.5 * Rs), 0.0, 1.0);
            float rf = min(u_fdTubeB * 0.001, 0.45 * Rs);
            if (!fib || dBase > 2.0 * rf || fh == 0.0) return dBase;                  // far off, or the lines too fine here: the smooth shape
            // the lines carried round the nearest rope (arc length from its top); the other two stay smooth under them
            int n = dC <= dK && dC <= dL ? 0 : (dK <= dL ? 1 : 2);
            float R0 = n == 0 ? RE : (n == 1 ? rk : rl), c0 = n == 0 ? cx : (n == 1 ? xk : xl); vec2 q0 = n == 0 ? q : (n == 1 ? qk : ql); float rho0 = length(q0);
            float dO = n == 0 ? min(dK, dL) : (n == 1 ? min(dC, dL) : min(dC, dK));
            float arc = c0 + R0 * atan(q0.x, q0.y), sh = arc - x;
            float fw = abs(sh) < 1e-5 ? fh : fdHn(uv + ac * sh, pxMm); g_fdLvPhi = phi; g_fdLvGap = gap;
            float rf0 = min(rf, 0.45 * R0);
            float dF = fw == 0.0 ? rho0 - R0 : min(length(vec2(fdLineD(fw), rho0 - (R0 - rf0))) - rf0, rho0 - (R0 - 0.6 * rf0));
            // the loose fibres between the ropes, three rows down the tier: the lines at the top, the half-over lines, the lines again
            float d0 = fdLineD(fh), d1 = 0.5 * u_fdFibre * 0.001 - d0, rw = rf * (1.0 - 0.3 * fork);
            float dR = min(length(vec2(d0, hp - (hh - rw))) - rw, min(length(vec2(d1, hp - (hh - Rs))) - 0.85 * rw, length(vec2(d0, hp - (hh - 1.8 * Rs))) - 0.7 * rw));
            float dFW = min(max(dR, abs(x) - a), dW + 0.6 * rf * fork);   // the web: whole while one rope, thinned to the rows as it forks
            return fdSmin(fdSmin(dF, dO, kf), dFW, kf);
        }
        float fdRimFrame(vec2 uv, float hh, float lod) {
            g_fdRimW = 0.0; if (u_fdRim < 0.5 || u_fdRimOk < 0.5 || g_fdLvGap > 0.25) return 0.0;   // bands between crypts are strands already
            vec2 c; if (!tisIn(u_tissueRect, uv, c)) return 0.0;
            vec2 m = fdRimMap(c);
            float ov = u_fdRimP.x, uc = u_fdRimP.y, T = u_fdRimP.z, s = m.r * 1000.0;   // µm across the edge: + on the sheet, − over the crypt
            if (s < -2.0 * ov - 10.0 || s > uc + 2.0 * T + 10.0) return 0.0;
            // the uphill direction: the distance's own gradient (mm per uv), turned into uv per µm of distance
            vec2 dc = 1.0 / vec2(u_fdRimSz.xy);
            vec2 gs = vec2(fdRimMap(c + vec2(dc.x, 0.0)).r - fdRimMap(c - vec2(dc.x, 0.0)).r, fdRimMap(c + vec2(0.0, dc.y)).r - fdRimMap(c - vec2(0.0, dc.y)).r) / (2.0 * dc * u_tissueRect.zw);
            float g2 = dot(gs, gs); if (g2 < 1e-4) return 0.0;
            vec2 du = gs / g2 * 0.001;
            float hT = tissueH(uv + du * (uc + 2.0 * T + 6.0 - s), lod);              // the sheet just behind the lip: its top
            float hu = tissueH(uv - du * uc, lod);                                      // the wall cut back uc µm
            // the undercut only in the top 40 µm under the lip: below it the wall is the height map's own (no seam where the frame ends)
            float wc = (1.0 - smoothstep(0.001 * T + 0.01, 0.001 * T + 0.04, hT - hh)) * (1.0 - smoothstep(uc, uc + 0.8 * T, s));   // and only under the lip (it ends at uc + T + 4 µm): no gap behind it
            vec2 mm = (2.0 + 4.0 * uv.y) * vec2(cos(6.2831853 * uv.x), sin(6.2831853 * uv.x)); float nz = ablVn(mm / 0.025 + 7.3);
            g_fdRimW = 1.0; g_fdRimX = s * 0.001; g_fdRimHT = hT; g_fdRimHU = mix(hh, min(hh, hu), wc); g_fdRimOv = ov * (0.7 + 0.6 * nz) * 0.001;
            g_fdRimUvT = uv + du * (uc + 2.0 * T + 4.0 - s);
            return 1.0;
        }
        // the lip's distance (mm) at height hp, in the frame fdRimFrame set
        float fdRimLip(float hp) {
            if (g_fdRimW <= 0.0) return 1e3;
            // a faint rim (weight < 1) is a thinner, shorter lip: it fades by shrinking into the wall, not by switching off
            float r = 0.0005 * u_fdRimP.z * max(g_fdRimW, 0.2), uc = 0.001 * u_fdRimP.y, dr = 0.4 * r;
            vec2 A = vec2(-g_fdRimOv * g_fdRimW, g_fdRimHT - r - dr), B = vec2(uc + 2.0 * r + 0.004, g_fdRimHT - r), P = vec2(g_fdRimX, hp);
            vec2 ab = B - A; float t = clamp(dot(P - A, ab) / dot(ab, ab), 0.0, 1.0);
            return length(P - A - ab * t) - r;
        }
        float tissueH(vec2 uv, float lod) {`);
        need('g_slab = 0.0; g_tisOut = 0.0; float t = hitIris(pIn, dIn, rp);', 'g_slab = 0.0; g_tisOut = 0.0; g_fdSlab = 0.0; g_fdBr = 0.0; g_fdKind = 0.0; g_fdLip = 0.0; g_fdCov = 1.0; g_fdFloorW = 0.0; float t = hitIris(pIn, dIn, rp);');
        need('float hpPrev = 1e9, topPrev = -1e9;', 'float hpPrev = 1e9, topPrev = -1e9, fdPrev = 1e9, sdPrev = 1e3; g_fdRel = u_fdOn > 0.5 && (u_fdSlim < 0.5 || u_walk > 0.5 || mmPerPx * 1000.0 < u_fdRelPx) ? 1.0 : 0.0;   /* slim: the strands\' relief in the march (parallax, floating strands, their shadows) only where it spans a pixel */');
        need(`                hpPrev = hp;
                if (Pp.z > irisZ(vv) - hh) { tB = tt; break; }`, `                hpPrev = hp;
                if (g_fdRel > 0.5 && g_slab < 0.5 && u_fdSdf > 0.5) {
                    // SDF: when this sample or the last was within a step of a floating strand, sphere-trace from the last sample
                    float dS = fdSdStrands(uvS, hp, hh, lod, mmPerPx);
                    if (u_fdRim > 0.5 && fdRimFrame(uvS, hh, lod) > 0.0) { dS = min(dS, fdRimLip(hp)); hh = mix(hh, g_fdRimHU, g_fdRimW); }   // the lip; the wall cut back under it
                    if (min(dS, sdPrev) < 1.5 * dt && tt > tStart + dt * 0.5) {
                        float ts = tt - dt; bool hit = false;
                        for (int j = 0; j < 24; j++) {
                            vec3 Q = P + dIn * ts; float dq = fdSdAt(Q, rp, lod, mmPerPx);
                            if (dq < 0.00015) { hit = true; break; }
                            ts += max(0.7 * dq, 0.0002); if (ts > tt) break;
                        }
                        if (hit) { g_fdSlab = 1.0; g_fdKind = 3.0; g_fdLip = g_fdSdK > 4.5 ? 1.0 : 0.0; g_fdLipUv = g_fdRimUvT; g_fdBr = g_fdSdK >= 2.0 && g_fdSdK < 4.5 ? g_fdSdK - 1.0 : 0.0; g_fdZc = 0.0; g_fdR = 0.0; tB = ts; tA = max(ts - 0.0006, tt - dt); break; }
                    }
                    sdPrev = dS;
                }
                if (g_fdRel > 0.5 && g_slab < 0.5) {
                    float fh = fdHn(uvS, mmPerPx);
                    float gw = u_fdGapOn > 0.5 ? smoothstep(0.25, 0.6, g_fdLvGap) : 0.0;
                    if (gw > 0.0) {                                               // a band between crypts: strands float, the ground drops
                        vec2 ua, ub; float tab, fnd, gnd = fdGround(uvS, hh, g_fdLvPhi, lod, ua, ub, tab, fnd); gw *= fnd;
                        // a BUNDLE (iori 2026-11-12: "thick bundle"): up to three staggered layers of strands filling the band's old volume
                        // from its top down — each lower layer offset across the fibre by half a strand (the strands stack between the ones
                        // above), a little thinner and darker; how many fit is the drop to the floor's. The ray tests each layer where it is,
                        // and where it crossed a layer's centre height between two steps
                        float phiB = g_fdLvPhi, gwB = gw, rr0 = 2.0 + 4.0 * uvS.y; vec2 acr = vec2(cos(phiB) / (6.2831853 * rr0), -sin(phiB) / 4.0) * (0.5 * u_fdFibre * 0.001);
                        float rTop = u_fdTubeB * 0.001 * gwB, sp = min(1.9 * rTop, 0.3 * max(hh - gnd, 0.0)); int nL = int(clamp(floor((hh - gnd) / max(2.6 * rTop, 1e-4)), 1.0, 3.0));
                        bool hitB = false;
                        for (int k = 0; k < 3; k++) {
                            if (k >= nL || u_fdSdf > 0.5) break;   // the SDF owns the strands; the ground drop below stays
                            float fk = k == 0 ? fh : fdHn(uvS + acr * float(k), mmPerPx), sh = 1.0 - 0.15 * float(k);
                            float rB = rTop * sh * sqrt(clamp((fk + 0.25) / 0.9, 0.0, 1.0)), zB = hh - rTop - sp * float(k);
                            if (rB > 0.0 && hp <= zB + rB && hp >= zB - rB) { g_fdKind = 2.0; g_fdRT0 = rTop * sh; g_fdOff = acr * float(k); g_fdSlab = 1.0; g_fdBr = 1.0 + float(k); g_fdZc = zB; g_fdR = rB; tB = tt; hitB = true; break; }
                            if (fdPrev > zB && hp < zB && fdPrev < 1e8) {
                                float tc = tt - dt * (zB - hp) / max(fdPrev - hp, 1e-6); vec3 Pc = P + dIn * tc; float rc, vc, ac, wc; irisCoords(Pc.xy, rp, rc, vc, ac, wc);
                                vec2 uvC = atlasUV(ac, remapV(vc, rpr)) + acr * float(k); float fc = fdHn(uvC, mmPerPx), rBc = rTop * sh * sqrt(clamp((fc + 0.25) / 0.9, 0.0, 1.0));
                                if (rBc > 0.0005) { g_fdKind = 2.0; g_fdRT0 = rTop * sh; g_fdOff = acr * float(k); g_fdSlab = 1.0; g_fdBr = 1.0 + float(k); g_fdZc = zB; g_fdR = rBc; tB = tc; tA = tc - 0.25 * dt; hitB = true; break; }
                            }
                        }
                        if (hitB) break;
                        g_fdLvPhi = phiB;
                        hh = mix(hh, gnd, gw); g_fdFloorW = gw; g_fdUvA = ua; g_fdUvB = ub; g_fdFloorT = tab; fh *= 1.0 - gw;   // the healed ground: no ridges of the band (none dropped: the band's own)
                    } else g_fdFloorW = 0.0;
                    if (fh != 0.0) {
                        float cov = fdSheet(uvS, lod), zc, rT;
                        if (u_fdSdf < 0.5 && fdTube(fh, hh, cov, zc, rT) && hp <= zc + rT && hp >= zc - rT) { g_fdKind = 1.0; g_fdOff = vec2(0.0); g_fdSlab = 1.0; g_fdZc = zc; g_fdR = rT; tB = tt; break; }
                        // stepped through the crypt's strand layer between two samples: test the strand where the ray crossed its centre
                        // height, not here (the old 'passed above it' rule hit wherever the step landed: strands broke into leaves)
                        float zL = 0.5 * hh;
                        if (u_fdSdf < 0.5 && u_fdBridge > 0.5 && cov < 0.6 && fdPrev > zL && hp < zL && fdPrev < 1e8) {
                            float tc = tt - dt * (zL - hp) / max(fdPrev - hp, 1e-6); vec3 Pc = P + dIn * tc; float rc, vc, ac, wc; irisCoords(Pc.xy, rp, rc, vc, ac, wc);
                            vec2 uvC = atlasUV(ac, remapV(vc, rpr)); float fc = fdHn(uvC, mmPerPx), zc2, rT2;
                            if (fdTube(fc, hh, fdSheet(uvC, lod), zc2, rT2)) { g_fdKind = 1.0; g_fdOff = vec2(0.0); g_fdSlab = 1.0; g_fdZc = zc2; g_fdR = rT2; tB = tc; tA = tc - 0.25 * dt; break; }
                        }
                        hh += u_fdRidge * 0.001 * fh * cov;                       // the sheet's ridges
                    }
                }
                fdPrev = hp;
                if (Pp.z > irisZ(vv) - hh) { tB = tt; break; }`);
        need(`                float hh = tissueH(atlasUV(aa, remapV(vv, rpr)), lod);
                if (Pp.z > irisZ(vv) - hh) tB = tm; else tA = tm;`, `                vec2 uvR = atlasUV(aa, remapV(vv, rpr)); float hh = tissueH(uvR, lod); bool under;
                if (g_fdSlab > 0.5 && g_fdKind > 2.5) under = fdSdAt(Pp, rp, lod, mmPerPx) <= 0.0;   // the SDF's own surface
                else if (g_fdSlab > 0.5) {   // the tube's ROUND section where this refined sample is (it was a flat plane at the hit's top: leaves, sheets)
                    float hpR = irisZ(vv) - Pp.z, fl = fdHn(uvR + g_fdOff, mmPerPx), rl;
                    if (g_fdKind > 1.5) rl = g_fdRT0 * sqrt(clamp((fl + 0.25) / 0.9, 0.0, 1.0));
                    else { float zc_, rT_; fdTube(fl, hh, fdSheet(uvR, lod), zc_, rT_); rl = rT_; }
                    under = rl > 0.0 && abs(hpR - g_fdZc) <= rl;
                }
                else {
                    if (g_fdRel > 0.5 && g_slab < 0.5) { float fh = fdHn(uvR, mmPerPx); float gw = u_fdGapOn > 0.5 ? smoothstep(0.25, 0.6, g_fdLvGap) : 0.0;
                        if (gw > 0.0) { vec2 ua, ub; float tab, fnd, gnd = fdGround(uvR, hh, g_fdLvPhi, lod, ua, ub, tab, fnd); gw *= fnd; hh = mix(hh, gnd, gw); g_fdFloorW = gw; g_fdUvA = ua; g_fdUvB = ub; g_fdFloorT = tab; }
                        else { g_fdFloorW = 0.0; if (u_fdSdf > 0.5 && u_fdRim > 0.5 && fdRimFrame(uvR, hh, lod) > 0.0) hh = mix(hh, g_fdRimHU, g_fdRimW); if (fh != 0.0) hh += u_fdRidge * 0.001 * fh * fdSheet(uvR, lod); } }
                    under = Pp.z > irisZ(vv) - hh;
                }
                if (under) tB = tm; else tA = tm;`);
        need('if (u_slabOn > 0.5 && g_slab < 0.5) {         // §5.2.3: a bridge between this point and the light shadows it', `if (g_fdRel > 0.5 && u_fdBridge > 0.5 && g_fdSlab < 0.5) {   // a crypt's floating strand between this point and the light
                        vec2 uq = atlasUV(qa, remapV(qv, rpr)); float fh = fdHn(uq, mmPerPx), hq = irisZ(qv) - Q.z;
                        if (u_fdGapOn > 0.5 && g_fdLvGap > 0.25 && u_fdSdf > 0.5 && u_fdRope.x > 0.5 && u_fdRimOk > 0.5) { float kq; if (fdRope(uq, hq, qh, fh, mmPerPx, false, kq) < 0.0) pen = max(pen, 0.02); }   // a band's rope (its smooth section)
                        else if (u_fdGapOn > 0.5 && g_fdLvGap > 0.25) { float gw = smoothstep(0.25, 0.6, g_fdLvGap), rT = u_fdTubeB * 0.001 * gw, rB = rT * sqrt(clamp((fh + 0.25) / 0.9, 0.0, 1.0));
                            for (int k = 0; k < 3; k++) { float zk = qh - rT - 1.9 * rT * float(k); if (abs(hq - zk) < rB * (1.0 - 0.15 * float(k))) pen = max(pen, 0.02); } }   // any layer of the bundle   // a band's floating strand between this point and the light
                        else if (fh > 0.15) { float zc, rT; if (fdTube(fh, qh, fdSheet(uq, lod), zc, rT) && abs(hq - zc) < rT) pen = max(pen, 0.02); }
                    }
                    if (g_fdRel > 0.5 && u_fdRim > 0.5 && u_fdSdf > 0.5 && g_fdLip < 0.5) {   // a crypt's rim: its lip overhead shadows the wall cut back under it
                        vec2 uq = atlasUV(qa, remapV(qv, rpr)); if (fdRimFrame(uq, qh, lod) > 0.0 && fdRimLip(irisZ(qv) - Q.z) < 0.0) pen = max(pen, 0.02);
                    }
                    if (u_slabOn > 0.5 && g_slab < 0.5) {         // §5.2.3: a bridge between this point and the light shadows it`);
        // the SDF's point lookups need irisCoords / remapV / atlasUV, which come after tissueH: placed just before shadeInterior
        need('vec3 shadeInterior(vec3 pIn', `        float fdSdAt(vec3 Q, float rp, float lod, float pxMm) {
            float r, v, a, w; irisCoords(Q.xy, rp, r, v, a, w); if (v < 0.0) return 1e3;
            vec2 uvq = atlasUV(a, remapV(v, rp / 6.0)); float hq = tissueH(uvq, lod), hp = irisZ(v) - Q.z;
            float d = fdSdStrands(uvq, hp, hq, lod, pxMm), k = g_fdSdK;
            if (u_fdRim > 0.5 && fdRimFrame(uvq, hq, lod) > 0.0) { float dl = fdRimLip(hp); if (dl < d) { d = dl; k = 5.0; } }
            g_fdSdK = k; return d;
        }
        vec3 fdSdNormal(vec3 Q, float rp, float lod, float pxMm) {
            const float e = 0.0006; vec2 k = vec2(1.0, -1.0);   // tetrahedral differences, 0.6 µm
            return normalize(k.xyy * fdSdAt(Q + k.xyy * e, rp, lod, pxMm) + k.yyx * fdSdAt(Q + k.yyx * e, rp, lod, pxMm) + k.yxy * fdSdAt(Q + k.yxy * e, rp, lod, pxMm) + k.xxx * fdSdAt(Q + k.xxx * e, rp, lod, pxMm));
        }
        vec3 shadeInterior(vec3 pIn`);
        need('if (maskView || mapView) return vec4(iris, 1.0);', 'if (maskView || mapView || u_debug > 15.5) return vec4(iris, 1.0);');
        // the walk: a camera inside the anterior chamber, no cornea between it and the tissue
        need('            vec4 col = renderPass(ro, rd, L, hq, rp);', `            vec4 col;
            if (u_walk > 0.5) {
                vec2 sc = (gl_FragCoord.xy + jitter - 0.5 * u_resolution) / u_resolution.y * 2.0 * tan(0.5 * u_walkFov);
                vec3 wd = normalize(u_walkF + sc.x * u_walkR + sc.y * u_walkU);
                vec3 ir = shadeInterior(u_walkPos, wd, vec3(0.0, 0.0, -1.0), wd, L, rp, hq);
                col = vec4(ir, 1.0);
            } else col = renderPass(ro, rd, L, hq, rp);`);
        return src;
    }

    // ------------------------------------------------------------------ state: textures, table, atlas
    let bridgeT = null, grainT = null, phasorT = null, gen = null, prog = null, seedT = null, steerT = null, steer2T = null, atlasT = null, atlasFB = null, tableT = null, steerCPU = null, bridgeCPU = null;
    const table = new Float32Array(TW * TH * 2);
    const slotPage = new Int32Array(SLOTS).fill(-1), slotUsed = new Float64Array(SLOTS); let free = [];
    const pageKey = (l, i, j) => (ROW[l] + j) * TW + i;
    function resetPages() {
        table.fill(0); slotPage.fill(-1); free = []; for (let s = SLOTS - 1; s >= 0; s--) free.push(s);
        if (tableT) { gl.bindTexture(gl.TEXTURE_2D, tableT); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, TW, TH, gl.RG, gl.FLOAT, table); }
        F.stats.resident = 0; F.stats.firstSharp = null;
    }
    function ensureGL() {
        if (gen) return;
        gen = compile(VS, GEN_FS, 'flydown-gen');
        atlasT = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, atlasT);
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, ATLAS, ATLAS);   // R detail, G grain + jitter, B strand height (iori 2026-11-11: ridges and bridges)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        atlasFB = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, atlasFB);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, atlasT, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('flydown: atlas framebuffer incomplete');
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        tableT = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tableT);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, TW, TH, 0, gl.RG, gl.FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        resetPages();
    }
    function ensureVariant() {
        if (prog && prog.forSrc === T.photoSource()) return prog;
        const src = T.photoSource(); prog = compile(VS, variantSource(src), 'photo-flydown'); prog.forSrc = src; return prog;
    }
    async function loadEye(ref) {
        F.ready = false; F.ref = ref;
        const base = `data/${ref}`;
        const [meta, si, ti, t2i, phi, gri, bri] = await Promise.all([fetch(base + '.seed.json').then(r => { if (!r.ok) throw new Error('no seed for eye ' + ref); return r.json(); }),
            loadImg(base + '.seed.png'), loadImg(base + '.steer.png'), loadImg(base + '.steer2.png'), loadImg(base + '.phasor.png'), loadImg(base + '.grain.png'), loadImg(base + '.bridge.png').catch(() => null)]);
        if (F.ref !== ref) return;
        ensureGL();
        for (const t of [seedT, steerT, steer2T, phasorT, grainT, bridgeT]) if (t) gl.deleteTexture(t);
        seedT = tex2D(si, { repeatS: true, mip: true, internal: gl.R8, format: gl.RED });
        steerT = tex2D(ti, { repeatS: true }); steer2T = tex2D(t2i, { repeatS: true }); grainT = tex2D(gri, { repeatS: true, internal: gl.R8, format: gl.RED });
        if (bri) bridgeT = tex2D(bri, { repeatS: true, internal: gl.R8, format: gl.RED }); else { bridgeT = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, bridgeT); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([0])); }
        phasorT = tex2D(phi, {}); gl.bindTexture(gl.TEXTURE_2D, phasorT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);   // read by texelFetch
        { const c = document.createElement('canvas'); c.width = ti.width; c.height = ti.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(ti, 0, 0); steerCPU = { w: c.width, h: c.height, d: g.getImageData(0, 0, c.width, c.height).data }; }
        bridgeCPU = null; bridgeGen++; if (bri) { const c = document.createElement('canvas'); c.width = bri.width; c.height = bri.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bri, 0, 0); bridgeCPU = { w: c.width, h: c.height, d: g.getImageData(0, 0, c.width, c.height).data }; rimBake = null; }   // the bands, for the rope's band map (bakeRim)
        F.meta = meta; resetPages(); F.ready = true;
        F.say && F.say(`fly-down: eye ${ref} seeded (octaves ${meta.octaves_um.join(', ')} µm)`);
    }

    // ------------------------------------------------------------------ the crypt edges (iori 2026-11-12: "Yes, bake edge map")
    // Once per tissue bake, from the layer model's height (one read of the whole aux): the SHEET LEVEL — the height's local upper
    // envelope (max over 80 µm, then a box mean over 80 µm, anisotropic: a texel is 2π r / W mm round the ring); the CRYPTS — ground
    // ≥ 25 µm below that level, kept only where the hole reaches ≥ 60 µm deep (rucks and floor ridges are not crypts); the EDGE — the
    // mask's border, the shoulder where the wall leaves the sheet. Stored: the signed distance to the edge (mm, + on the sheet, exact
    // Euclidean, Felzenszwalb, in mm per axis) and the sheet level. The rim shader reads these two numbers instead of hunting for the
    // edge round every point (the per-point search put lips on summit steps, ragged, with seams: study/flydown/proto-rim-cut.jpg).
    // which tissue bake the map belongs to: the aux texture object and the knobs (tissue.js has no bake counter); a map with no crypts
    // (the tissue not baked yet) is retried every 2 s
    let rimT = null, rimBake = null, rimAux = null, rimRetry = 0; F.rimInfo = null;
    let bridgeGen = 0;   // bumped when the eye's band image (bridgeCPU) changes: a bake begun before it loaded is stale (it had no bands, and the ropes vanished)
    const rimKey = () => (T.knobSig || '') + '|' + JSON.stringify(T.primKey || null) + '|' + (T.size || []).join('x') + '|' + bridgeGen;
    const rimFresh = () => rimAux === T.aux && rimBake === rimKey();
    // THE BAKE IN A WORKER (iori 2026-11-12: "do 2, background bake"): the readback (one readPixels of the whole aux, ~30 ms) stays on the
    // main thread; everything after it — sheet level, crypt components, islands, the bands, four exact distance transforms (~0.75 s on
    // eye 26) — is rimCompute, a pure function that runs in a worker built from its own source (no extra file), and the maps are
    // uploaded when it answers. While it runs the rims and ropes stay off (u_fdRimOk 0): the old bundle draws the bands meanwhile
    function rimCompute(inp) {
        const { buf, bw, W, H, R, bridge } = inp;
        function edt1(f, n, sc, out, v, z) {                                  // 1-D squared distance transform, sample spacing sc (mm)
            let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
            const S_ = (q, p) => ((f[q] + (q * sc) ** 2) - (f[p] + (p * sc) ** 2)) / (2 * sc * (q - p));
            for (let q = 1; q < n; q++) {
                let s = S_(q, v[k]); while (s <= z[k]) { k--; s = S_(q, v[k]); }
                k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
            }
            k = 0; for (let q = 0; q < n; q++) { while (z[k + 1] < q * sc) k++; out[q] = (q * sc - v[k] * sc) ** 2 + f[v[k]]; }
        }
        function edt(mask, W, H, su, sv) {                                    // distance (mm) from every texel to the nearest mask texel
            const INF = 1e20, D = new Float32Array(W * H), n = Math.max(W, H), f = new Float64Array(n), o = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
            for (let y = 0; y < H; y++) { for (let x = 0; x < W; x++) f[x] = mask[y * W + x] ? 0 : INF; edt1(f, W, su[y], o, v, z); for (let x = 0; x < W; x++) D[y * W + x] = o[x]; }
            for (let x = 0; x < W; x++) { for (let y = 0; y < H; y++) f[y] = D[y * W + x]; edt1(f, H, sv, o, v, z); for (let y = 0; y < H; y++) D[y * W + x] = Math.sqrt(o[y]); }
            return D;
        }
        const h = new Float32Array(W * H), ok = new Uint8Array(W * H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = (y * bw + 2 * x) * 4, a = buf[o + 3] > 0 && buf[o + 7] > 0; ok[y * W + x] = a ? 1 : 0; h[y * W + x] = a ? 0.5 * (buf[o] + buf[o + 4]) : 0; }
        const su = new Float64Array(H), sv = 4 * R[3] / H, wrap = R[2] > 0.999;
        for (let y = 0; y < H; y++) su[y] = 2 * Math.PI * (2 + 4 * (R[1] + (y + 0.5) / H * R[3])) * R[2] / W;
        const RAD = 0.08, rowPass = (src, op) => { const out = new Float32Array(W * H);
            for (let y = 0; y < H; y++) { const r = Math.max(1, Math.round(RAD / su[y])), b = y * W;
                for (let x = 0; x < W; x++) { let m = op === 'max' ? -1e9 : 0, c = 0; for (let d = -r; d <= r; d += Math.max(1, r >> 3)) { let xx = x + d; if (wrap) xx = (xx + W) % W; else if (xx < 0 || xx >= W) continue; const q = src[b + xx]; if (op === 'max') m = Math.max(m, q); else { m += q; c++; } } out[b + x] = op === 'max' ? m : m / c; } }
            return out; };
        const colPass = (src, op) => { const out = new Float32Array(W * H), r = Math.max(1, Math.round(RAD / sv));
            for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) { let m = op === 'max' ? -1e9 : 0, c = 0; for (let d = -r; d <= r; d += Math.max(1, r >> 3)) { const yy = y + d; if (yy < 0 || yy >= H) continue; const q = src[yy * W + x]; if (op === 'max') m = Math.max(m, q); else { m += q; c++; } } out[y * W + x] = op === 'max' ? m : m / c; }
            return out; };
        const L = colPass(rowPass(colPass(rowPass(h, 'max'), 'max'), 'mean'), 'mean');
        // the crypts: ≥ 25 µm under the sheet level, components (4-neighbour, round the ring) kept when ≥ 60 µm deep somewhere
        const C = new Uint8Array(W * H), lab = new Int32Array(W * H).fill(-1), keep = [];
        for (let i = 0; i < W * H; i++) C[i] = ok[i] && h[i] < L[i] - 0.025 ? 1 : 0;
        const st = new Int32Array(W * H);
        for (let i = 0; i < W * H; i++) { if (!C[i] || lab[i] >= 0) continue; const id = keep.length; let sp = 0, deep = 0; st[sp++] = i; lab[i] = id;
            while (sp) { const j = st[--sp], y = (j / W) | 0, x = j - y * W; deep = Math.max(deep, L[j] - h[j]);
                for (const [xx, yy] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) { let X = xx; if (wrap) X = (X + W) % W; else if (X < 0 || X >= W) continue; if (yy < 0 || yy >= H) continue; const q = yy * W + X; if (C[q] && lab[q] < 0) { lab[q] = id; st[sp++] = q; } } }
            keep.push(deep >= 0.06); }
        for (let i = 0; i < W * H; i++) if (C[i] && !keep[lab[i]]) C[i] = 0;
        // islands: the floor's bumps that reach the sheet level are not sheet — every non-crypt patch under 0.015 mm² becomes crypt
        // (else each grows a ring of rim inside the crypt)
        { const lb = new Int32Array(W * H).fill(-1); let id = 0;
          for (let i = 0; i < W * H; i++) { if (C[i] || !ok[i] || lb[i] >= 0) continue; let sp = 0, area = 0; const mem = []; st[sp++] = i; lb[i] = id;
            while (sp) { const j = st[--sp], y = (j / W) | 0, x = j - y * W; area += su[y] * sv; if (area < 0.015) mem.push(j);
                for (const [xx, yy] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) { let X = xx; if (wrap) X = (X + W) % W; else if (X < 0 || X >= W) continue; if (yy < 0 || yy >= H) continue; const q = yy * W + X; if (!C[q] && ok[q] && lb[q] < 0) { lb[q] = id; st[sp++] = q; } } }
            if (area < 0.015) for (const j of mem) C[j] = 1;
            id++; } }
        const notC = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) notC[i] = C[i] ? 0 : 1;
        const dOut = edt(C, W, H, su, sv), dIn = edt(notC, W, H, su, sv);
        // stored in the page table's texture, in rows below the table (the variant is at the 16-sampler limit): RG = distance, level;
        // off the tissue the distance is a large positive (no rim)
        const px = new Float32Array(W * H * 2);
        for (let i = 0; i < W * H; i++) { const sd = C[i] ? -(dIn[i]) : dOut[i]; px[i * 2] = ok[i] ? Math.max(-0.2, Math.min(0.2, sd)) : 0.2; px[i * 2 + 1] = L[i]; }
        // the BANDS between crypts (the ropes, fdRope): their own signed distance (mm, + inside), from the band weight (data/<eye>.bridge.png,
        // the level model's gap: a band where it passes 0.42, mid-way up the renderer's 0.25–0.6 ramp). The crypt map cannot give a band's
        // width: a band lies inside its crypt (its ground is under the sheet level), so there the crypt distance measures to the rim
        const pb = new Float32Array(W * H * 2);
        if (bridge) { const B = new Uint8Array(W * H), nB = new Uint8Array(W * H), bw = bridge.w, bh = bridge.h, bd = bridge.d;
            for (let y = 0; y < H; y++) { const vv = R[1] + (y + 0.5) / H * R[3], by = Math.min(bh - 1, Math.max(0, vv * bh - 0.5)), y0 = Math.floor(by), y1 = Math.min(bh - 1, y0 + 1), fy = by - y0;
                for (let x = 0; x < W; x++) { const uu = R[0] + (x + 0.5) / W * R[2], bx = ((uu % 1) + 1) % 1 * bw - 0.5, x0 = Math.floor(bx), fx = bx - x0, X0 = (x0 + bw) % bw, X1 = (x0 + 1) % bw;
                    const g = ((bd[(y0 * bw + X0) * 4] * (1 - fx) + bd[(y0 * bw + X1) * 4] * fx) * (1 - fy) + (bd[(y1 * bw + X0) * 4] * (1 - fx) + bd[(y1 * bw + X1) * 4] * fx) * fy) / 255;
                    const i = y * W + x; B[i] = g > 0.42 ? 1 : 0; nB[i] = 1 - B[i]; } }
            const bOut = edt(B, W, H, su, sv), bIn = edt(nB, W, H, su, sv);
            for (let i = 0; i < W * H; i++) pb[i * 2] = Math.max(-0.4, Math.min(0.4, B[i] ? bIn[i] : -bOut[i]));
            // G: how far a band texel is from the band's END, where it meets the sheet (not crypt, not band): the rope's taper (fdRope)
            const Sh = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) Sh[i] = ok[i] && !C[i] && !B[i] ? 1 : 0;
            const dS = edt(Sh, W, H, su, sv); for (let i = 0; i < W * H; i++) pb[i * 2 + 1] = B[i] ? Math.min(0.4, dS[i]) : 0.4;
        } else for (let i = 0; i < W * H; i++) { pb[i * 2] = -0.4; pb[i * 2 + 1] = 0.4; }
        let nC = 0; for (let i = 0; i < W * H; i++) nC += C[i];
        return { px, pb, crypts: keep.filter(Boolean).length, dropped: keep.filter(k => !k).length, nC };
    }
    let rimWorker = null, rimJob = 0;
    function rimWorkerGet() {
        if (rimWorker !== null) return rimWorker;
        try {
            const src = 'const rimCompute = ' + rimCompute.toString() + ';\nself.onmessage = e => { const o = rimCompute(e.data); o.job = e.data.job; self.postMessage(o, [o.px.buffer, o.pb.buffer]); };';
            rimWorker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
            rimWorker.onerror = e => { console.warn('flydown rim worker', e.message); rimWorker = false; rimBake = null; };   // no worker: bake inline next time
        } catch (e) { rimWorker = false; }
        return rimWorker;
    }
    let rimPending = false; F._rebakeRim = () => { rimBake = null; };   // tests
    function bakeRim() {
        if (rimPending || !T.size || !T.rect || !T._auxRead || !T.aux || rimFresh() || performance.now() < rimRetry) return;
        const key = rimKey(), aux = T.aux, t0 = performance.now(), R = T.rect.slice(), [w0, H] = T.size, W = w0 >> 1;
        const A = T._auxRead(R[0], R[1], R[0] + R[2], R[1] + R[3]); if (A.bw < w0 || A.bh < H) return;
        const bridge = bridgeCPU ? { w: bridgeCPU.w, h: bridgeCPU.h, d: bridgeCPU.d } : null;
        const done = o => {
            rimPending = false;
            if (key !== rimKey() || aux !== T.aux) return;                 // the tissue changed meanwhile: the next tick bakes again
            rimBake = key; rimAux = aux;
            const { px, pb } = o, wrap = R[2] > 0.999;
            ensureGL(); gl.bindTexture(gl.TEXTURE_2D, tableT);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, Math.max(TW, W), TH + 2 * H, 0, gl.RG, gl.FLOAT, null);
            gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, TW, TH, gl.RG, gl.FLOAT, table); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, TH, W, H, gl.RG, gl.FLOAT, px); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, TH + H, W, H, gl.RG, gl.FLOAT, pb);
            rimT = { W, H, wrap };
            F._rimAt = (u, v) => { const x = ((u - R[0]) / R[2] * W - 0.5), y = Math.max(0, Math.min(H - 1, (v - R[1]) / R[3] * H - 0.5)), x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;   // tests: the map, bilinear
                const at = (X, Y, k) => px[(Math.min(H - 1, Y) * W + ((X % W) + W) % W) * 2 + k], b = k => (at(x0, y0, k) * (1 - fx) + at(x0 + 1, y0, k) * fx) * (1 - fy) + (at(x0, y0 + 1, k) * (1 - fx) + at(x0 + 1, y0 + 1, k) * fx) * fy;
                return [b(0), b(1)]; };
            F._bandAt = (u, v) => { const x = ((u - R[0]) / R[2] * W - 0.5), y = Math.max(0, Math.min(H - 1, (v - R[1]) / R[3] * H - 0.5)), x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;   // tests: the band map
                const at = (X, Y) => pb[(Math.min(H - 1, Y) * W + ((X % W) + W) % W) * 2 + (F._bandCh || 0)]; return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy; };
                if (!o.crypts) { rimBake = null; rimRetry = performance.now() + 2000; }   // nothing found: the tissue is not there yet
            F.rimInfo = { W, H, crypts: o.crypts, dropped: o.dropped, cryptShare: +(o.nC / (W * H)).toFixed(3), ms: Math.round(performance.now() - t0), worker: !!o.job };
        };
        const inp = { buf: A.buf, bw: A.bw, W, H, R, bridge }, wk = F.rimInline ? false : rimWorkerGet();
        if (wk) { rimPending = true; const job = ++rimJob; inp.job = job;
            wk.onmessage = e => { if (e.data.job === rimJob) { try { done(e.data); } catch (err) { console.error('flydown rim upload', err); } } };
            wk.postMessage(inp, [A.buf.buffer]); }
        else done(rimCompute(inp));                                       // no worker (or F.rimInline, for tests): on this thread, as before
    }

    // ------------------------------------------------------------------ generation
    const timerExt = gl.getExtension('EXT_disjoint_timer_query_webgl2'); const queries = [];
    function genBind() {
        gl.useProgram(gen);
        gl.activeTexture(gl.TEXTURE21); gl.bindTexture(gl.TEXTURE_2D, seedT); gl.uniform1i(gen.loc('u_seed'), 21);
        gl.activeTexture(gl.TEXTURE22); gl.bindTexture(gl.TEXTURE_2D, steerT); gl.uniform1i(gen.loc('u_steer'), 22);
        gl.activeTexture(gl.TEXTURE23); gl.bindTexture(gl.TEXTURE_2D, steer2T); gl.uniform1i(gen.loc('u_steer2'), 23);
        gl.activeTexture(gl.TEXTURE29); gl.bindTexture(gl.TEXTURE_2D, phasorT); gl.uniform1i(gen.loc('u_phasor'), 29);
        gl.activeTexture(gl.TEXTURE30); gl.bindTexture(gl.TEXTURE_2D, grainT); gl.uniform1i(gen.loc('u_grainT'), 30);
        gl.activeTexture(gl.TEXTURE26); gl.bindTexture(gl.TEXTURE_2D, bridgeT); gl.uniform1i(gen.loc('u_bridgeT'), 26);
        gl.uniform1f(gen.loc('u_probe'), 0);
    }
    function genUniforms(l, org, slot) {
        const m = F.meta, lam = m.octaves_um.slice(0, 4), oamp = m.oamp.slice(0, 4);
        while (lam.length < 4) { lam.push(lam[lam.length - 1] / 2); oamp.push(0); }
        gl.uniform2f(gen.loc('u_org'), org[0], org[1]); gl.uniform1f(gen.loc('u_s'), texel(l)); gl.uniform2f(gen.loc('u_slot'), slot[0], slot[1]);
        gl.uniform4f(gen.loc('u_lam'), ...lam); gl.uniform4f(gen.loc('u_oamp'), ...oamp); gl.uniform1f(gen.loc('u_k'), m.held / 0.8);
        gl.uniform4f(gen.loc('u_pv'), m.phasor[0], m.phasor[1], m.fibreLambdaUm, m.phasorAmpMax); gl.uniform1f(gen.loc('u_c0'), m.phasorC0); gl.uniform1f(gen.loc('u_mean'), m.held / (m.gain * 0.8)); gl.uniform1i(gen.loc('u_dbg'), F.genDbg || 0); gl.uniform1f(gen.loc('u_subGain'), F.subGain);
    }
    function genPage(l, i, j) {
        if (!free.length) evict();
        const slot = free.pop(), key = pageKey(l, i, j);
        const sx = (slot % SLOTS_X) * PAGE, sy = Math.floor(slot / SLOTS_X) * PAGE;
        genUniforms(l, [-EXT + i * pageUm(l), -EXT + j * pageUm(l)], [sx, sy]);
        gl.viewport(sx, sy, PAGE, PAGE); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        slotPage[slot] = key; slotUsed[slot] = F.stats.frames;
        table[2 * key] = slot + 1; table[2 * key + 1] = now();
        gl.activeTexture(gl.TEXTURE24);                                  // a unit no program samples: the generator's inputs sit on 21–23
        gl.bindTexture(gl.TEXTURE_2D, tableT); gl.texSubImage2D(gl.TEXTURE_2D, 0, i, ROW[l] + j, 1, 1, gl.RG, gl.FLOAT, table, 2 * key);
        F.stats.gen++; F.stats.resident++; F.stats.lastBornT = now();
    }
    function evict() {                                                   // LRU over pages the current view did not ask for
        let best = -1, bu = Infinity;
        for (let s = 0; s < SLOTS; s++) if (slotPage[s] >= 0 && slotUsed[s] < bu && !wanted.has(slotPage[s])) { bu = slotUsed[s]; best = s; }
        if (best < 0) for (let s = 0; s < SLOTS; s++) if (slotPage[s] >= 0 && slotUsed[s] < bu) { bu = slotUsed[s]; best = s; }
        const key = slotPage[best]; table[2 * key] = 0; table[2 * key + 1] = 0; slotPage[best] = -1;
        const i = key % TW, rowAbs = Math.floor(key / TW);
        gl.activeTexture(gl.TEXTURE24);
        gl.bindTexture(gl.TEXTURE_2D, tableT); gl.texSubImage2D(gl.TEXTURE_2D, 0, i, rowAbs, 1, 1, gl.RG, gl.FLOAT, table, 2 * key);
        free.push(best); F.stats.resident--;
    }

    // ------------------------------------------------------------------ requests: a small readback of the same camera
    // the readback keeps the canvas's aspect: the shader's field of view follows its target's aspect, so a 4:3 readback of a
    // tall canvas looked at a wider strip and requested pages beside the visible ones
    let RW = 64, RH = 48, reqFB = null, reqTex = null, reqDummy = null, reqPx = new Float32Array(RW * RH * 4);
    let queue = [], wanted = new Set(), centre = null;
    function cameraOpts() {
        const c = E.canvas, o = { view: state.view, zoom: state.zoomPhoto, ref: state.ref, fstop: 64 };   // the live camera, exactly (the reference pose framed the eye a little differently: at ×16 every requested page missed), no lens jitter
        if (!state.useRot) o.rot = [(0.5 - state.mouseY / c.height) * 0.75, (state.mouseX / c.width - 0.5) * 1.0];
        return o;
    }
    function readMap(debug) {
        { const a = E.canvas.width / Math.max(1, E.canvas.height), rw = a >= 1 ? 64 : Math.max(16, Math.round(64 * a)), rh = a >= 1 ? Math.max(16, Math.round(64 / a)) : 64;
          if (rw !== RW || rh !== RH) { RW = rw; RH = rh; reqPx = new Float32Array(RW * RH * 4); if (reqFB) { gl.deleteFramebuffer(reqFB); gl.deleteTexture(reqTex); gl.deleteTexture(reqDummy); reqFB = null; } } }
        if (!reqFB) {
            reqTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, reqTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, RW, RH, 0, gl.RGBA, gl.FLOAT, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            reqDummy = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, reqDummy); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, RW, RH, 0, gl.RGBA, gl.FLOAT, null);
            reqFB = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, reqFB); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, reqTex, 0);
        }
        const was = F.forceActive; F.forceActive = true;                 // the request pass always goes through the variant
        try { E.drawPhotoFrame(reqFB, RW, RH, 0, reqDummy, Object.assign(cameraOpts(), { debug })); }
        finally { F.forceActive = was; }
        gl.bindFramebuffer(gl.FRAMEBUFFER, reqFB); gl.readPixels(0, 0, RW, RH, gl.RGBA, gl.FLOAT, reqPx);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, E.canvas.width, E.canvas.height);
        return reqPx;
    }
    const tangentAt = (u, v) => {                                        // the steering tangent (relative to the radial) on the CPU
        if (!steerCPU) return 0; const x = Math.min(steerCPU.w - 1, Math.max(0, Math.floor(((u % 1) + 1) % 1 * steerCPU.w))), y = Math.min(steerCPU.h - 1, Math.max(0, Math.floor(v * steerCPU.h)));
        const o = (y * steerCPU.w + x) * 4; return 0.5 * Math.atan2(steerCPU.d[o + 1] / 127.5 - 1, steerCPU.d[o] / 127.5 - 1);
    };
    function plan() {
        const px = readMap(17); const req = new Map(); let cx = null;
        const mid = ((RH >> 1) * RW + (RW >> 1)) * 4;
        for (let k = 0; k < RW * RH; k++) {
            const o = k * 4; if (px[o + 3] < 0.5 || px[o + 2] < 999) continue;
            const u = px[o], v = px[o + 1], f = (px[o + 2] - 1000) * 1000 * RH / E.canvas.height * F.pxScale();   // µm per CANVAS px (the readback's pixels are bigger)
            const lf = Math.log2(4 / f); if (f / F.pxScale() > 0.5 * (F.meta.fibreLambdaUm || 23)) continue;   // the fibres show down to half their wavelength per DEVICE pixel
            const rr = 2 + 4 * v, th = 2 * Math.PI * u, p = [rr * Math.cos(th) * 1000, rr * Math.sin(th) * 1000];
            const L0 = Math.min(LV - 1, Math.max(0, Math.floor(lf))), Ls = lf - L0 > 0 && L0 < LV - 1 ? [L0, L0 + 1] : [L0];
            for (const l of Ls) {
                const pu = pageUm(l), i = Math.floor((p[0] + EXT) / pu), j = Math.floor((p[1] + EXT) / pu);
                if (i < 0 || j < 0 || i >= cols(l) || j >= cols(l)) continue;
                const key = pageKey(l, i, j); if (!req.has(key)) req.set(key, { l, i, j, p, u, v });
            }
            if (cx === null || k === mid) cx = { p, u, v };
        }
        centre = cx; wanted = new Set(req.keys());
        // growth order: an anisotropic distance from the view centre — along the strand ×1, across ×3.5 — coarse levels first
        const list = [];
        for (const [key, r] of req) {
            const s = table[2 * key]; if (s > 0) { slotUsed[s - 1] = F.stats.frames; continue; }
            let d = 0;
            if (centre) { const pu = pageUm(r.l), q = [-EXT + (r.i + 0.5) * pu, -EXT + (r.j + 0.5) * pu], dx = q[0] - centre.p[0], dy = q[1] - centre.p[1];
                const th = Math.atan2(centre.p[1], centre.p[0]) + tangentAt(centre.u, centre.v), t = [Math.cos(th), Math.sin(th)];
                const al = dx * t[0] + dy * t[1], ac = -dx * t[1] + dy * t[0]; d = Math.hypot(al, 3.5 * ac); }
            list.push({ key, ...r, d: d + r.l * 40 });
        }
        list.sort((a, b) => a.d - b.d); queue = list;
        F.stats.requested = req.size; F.stats.lastReq = list.length;
    }

    // ------------------------------------------------------------------ per frame: plan, generate, keep the growth moving
    let lastPlan = -1, sig = '';
    function camSig() { const w = F.walk; return [state.zoomPhoto.toFixed(3), state.view.map(x => x.toFixed(4)).join(','), Math.round(state.mouseX / 4), Math.round(state.mouseY / 4), state.useRot, w ? w.pos.map(x => x.toFixed(4)).join(',') + w.heading.toFixed(3) + w.pitch.toFixed(3) : ''].join('|'); }
    F.pxScale = () => Math.max(1, E.canvas.width / (E.canvas.getBoundingClientRect().width || E.canvas.width));   // device px per CSS px
    function footprintMm() { return (24 * state.view[3] / E.canvas.height) / 100 * (state.zoomPhoto + 3.5) / 1.1; }
    F._readMap = readMap; F._variantSrc = () => variantSource(T.photoSource());   // tests: the variant's source
    // ---- the FIELD PROBE (IORI MASTER 2026-11-13, landscape-analysis step 1: "a 3D export of the field the renderer actually draws, so we
    // stop porting shader rules to Python by hand"). The walk variant's own source with its main swapped for a probe main: the same
    // tissueH, fdHn, fdGround, fdSdStrands / fdRope, fdRimFrame / fdRimLip and the same uniforms (T.bind), so every flag and setting
    // is the renderer's. Local frame, mm: x radial (out), y tangential (th up), z = hp, the height above the sheet's level (the march's
    // hp = irisZ(v) − z: solid where hp < the ground, or where the strands' SDF < 0). Two outputs:
    //   ground  N×N: the march's ground (rim cut-back, the healed ground under bands, the sheet's ridges), the raw height, band weight, gap
    //   sdf     N×N×NZ: fdSdStrands (+ the rim's lip) at each layer's hp, four layers per pass
    // tools/flydown/fieldprobe.js drives it and saves to study/shots; study/flydown/field/mesh.py meshes it (marching cubes)
    const PROBE_MAIN = `
        uniform vec2 u_pbC; uniform vec4 u_pbG; uniform vec4 u_pbZ; uniform float u_pbMode;   // centre uv; (N, step mm, pxMm, lod); (z0, dz, layer0, 0)
        void main() {
            vec2 ij = floor(gl_FragCoord.xy), xy = (ij - 0.5 * u_pbG.x + 0.5) * u_pbG.y;   // x radial, y tangential, mm
            float rr = 2.0 + 4.0 * u_pbC.y; vec2 uv = u_pbC + vec2(xy.y / (6.2831853 * rr), xy.x / 4.0);
            float lod = u_pbG.w, px = u_pbG.z, hh = tissueH(uv, lod);
            if (u_pbMode < 0.5) {   // the ground, in the march's order (shadeInterior's step loop)
                float h = hh; g_fdRimW = 0.0;
                if (u_fdSdf > 0.5 && u_fdRim > 0.5 && fdRimFrame(uv, h, lod) > 0.0) h = mix(h, g_fdRimHU, g_fdRimW);
                float fh = fdHn(uv, px), gw = u_fdGapOn > 0.5 ? smoothstep(0.25, 0.6, g_fdLvGap) : 0.0, gap = g_fdLvGap;
                if (gw > 0.0) { vec2 ua, ub; float tab, fnd, gnd = fdGround(uv, h, g_fdLvPhi, lod, ua, ub, tab, fnd); gw *= fnd; h = mix(h, gnd, gw); fh *= 1.0 - gw; }
                if (fh != 0.0) h += u_fdRidge * 0.001 * fh * fdSheet(uv, lod);
                fragColor = vec4(h, hh, gw, gap + 2.0 * g_fdRimW);
                return;
            }
            if (u_pbMode > 2.5) {   // mode 3, per column: distance to the band's end (the band map's G), the sheet's coverage, the strand height, the band value
                vec2 cE; float e = tisIn(u_tissueRect, uv, cE) ? fdMapAt(cE, 1).g : 1.0; float fh = fdHn(uv, px);
                fragColor = vec4(e, fdSheet(uv, lod), fh, g_fdLvGap); return;
            }
            vec4 o;
            for (int k = 0; k < 4; k++) {
                float hp = u_pbZ.x + u_pbZ.y * (u_pbZ.z + float(k));
                float d = fdSdStrands(uv, hp, hh, lod, px);
                float kk = g_fdSdK; if (u_fdRim > 0.5 && fdRimFrame(uv, hh, lod) > 0.0) { float dl = fdRimLip(hp); if (dl < d) { d = dl; kk = 5.0; } }
                o[k] = u_pbMode > 1.5 ? kk : d;   // mode 2: which rule made the nearest surface (g_fdSdK: 1 crypt tube, 2–3.5 rope, 5 rim lip)
            }
            fragColor = o;
        }`;
    let probeProg = null;
    function ensureProbe() {
        const src = T.photoSource(); if (probeProg && probeProg.forSrc === src) return probeProg;
        let v = variantSource(src); const at = v.indexOf('void main() {'); if (at < 0) throw new Error('probe: no main');
        v = v.slice(0, at) + 'void fdMainUnused() {' + v.slice(at + 'void main() {'.length) + PROBE_MAIN;
        if (probeProg) gl.deleteProgram(probeProg); probeProg = compile(VS, v, 'flydown-probe'); probeProg.forSrc = src; return probeProg;
    }
    // F.probeField({ uv: [u, v], half: 0.5 mm, step: 0.002 mm, level: 2, z: [z0, z1] | null, depth: 0.3, kind: false }) → { meta, ground (N·N·4), sdf (N·N·NZ), kind (N·N·NZ, with o.kind) }
    // level: the page level the strands are read at (texel 4 / 2^level µm). The pages under the box are grown first and the planner held
    // (F.hold) until the probe is done, so nothing evicts them; z null: from the ground's range, at most depth mm
    F.probeField = async (o = {}) => {
        if (!F.ready || !T.on) throw new Error('probe: fly-down or tissue not ready');
        ensureGL(); const c = o.uv, half = o.half || 0.5, step = o.step || 0.002, lv = o.level === undefined ? 2 : o.level, N = Math.round(2 * half / step);
        F.hold = true;
        try {
            const pc = P_(c), pu = pageUm(lv), m = half * 1000 * 1.5 + pu, keys = [];   // the pages under the box (+ margin) at the chosen level
            for (let i = Math.floor((pc[0] - m + EXT) / pu); i <= Math.floor((pc[0] + m + EXT) / pu); i++)
                for (let j = Math.floor((pc[1] - m + EXT) / pu); j <= Math.floor((pc[1] + m + EXT) / pu); j++) if (i >= 0 && j >= 0 && i < cols(lv) && j < cols(lv)) keys.push([lv, i, j]);
            wanted = new Set(keys.map(k => pageKey(...k))); queue = [];
            gl.bindFramebuffer(gl.FRAMEBUFFER, atlasFB); genBind(); let made = 0;
            for (const [l, i, j] of keys) if (!(table[2 * pageKey(l, i, j)] > 0)) { genPage(l, i, j); made++; }
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            if (made) await new Promise(r => setTimeout(r, (F.fade + F.spread + 0.3) * 1000));   // fully grown (the fade-in)
            const p = ensureProbe(); gl.useProgram(p); T.bind(p);
            const fb = gl.createFramebuffer(), tx = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tx); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, N, N, 0, gl.RGBA, gl.FLOAT, null);
            gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tx, 0); gl.viewport(0, 0, N, N);
            const pxMm = o.pxMm || 4 / Math.pow(2, lv) / F.pxScale() / 1000;   // the footprint at which fdHn reads level lv first
            gl.uniform2f(p.loc('u_pbC'), c[0], c[1]); gl.uniform4f(p.loc('u_pbG'), N, step, pxMm, o.lod || 0);
            const draw = (mode, z0, dz, k0) => { gl.uniform1f(p.loc('u_pbMode'), mode); gl.uniform4f(p.loc('u_pbZ'), z0, dz, k0, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); const b = new Float32Array(N * N * 4); gl.readPixels(0, 0, N, N, gl.RGBA, gl.FLOAT, b); return b; };
            const t0 = performance.now(), ground = draw(0, 0, 0, 0);
            let zl = o.z; if (!zl) { let lo = 1e9, hi = -1e9; for (let k = 0; k < N * N; k++) { lo = Math.min(lo, ground[4 * k]); hi = Math.max(hi, ground[4 * k], ground[4 * k + 1]); } zl = [Math.max(lo - 0.01, hi + 0.03 - (o.depth || 0.3)), hi + 0.03]; }
            const NZ = Math.ceil((zl[1] - zl[0]) / step / 4) * 4, sdf = new Float32Array(N * N * NZ);
            for (let k0 = 0; k0 < NZ; k0 += 4) { const b = draw(1, zl[0], step, k0); for (let q = 0; q < 4; q++) for (let k = 0; k < N * N; k++) sdf[(k0 + q) * N * N + k] = b[4 * k + q]; }
            let kind = null; if (o.kind) { kind = new Float32Array(N * N * NZ); for (let k0 = 0; k0 < NZ; k0 += 4) { const b = draw(2, zl[0], step, k0); for (let q = 0; q < 4; q++) for (let k = 0; k < N * N; k++) kind[(k0 + q) * N * N + k] = b[4 * k + q]; } }
            const col = o.kind ? draw(3, 0, 0, 0) : null;   // per column: band-end distance, sheet coverage, strand height, band value
            const ms = performance.now() - t0;
            gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(fb); gl.deleteTexture(tx); gl.viewport(0, 0, E.canvas.width, E.canvas.height); gl.activeTexture(gl.TEXTURE0);
            const flags = {}; for (const k of ['sdf', 'rope', 'ropeR', 'ropeFork', 'rim', 'rimOv', 'rimUc', 'rimT', 'gap', 'ridge', 'tube', 'tubeB', 'bridge', 'subGain']) flags[k] = F[k];
            return { meta: { eye: F.ref, uv: c, half, step, N, NZ, z0: zl[0], level: lv, pxMm, lod: o.lod || 0, pages: keys.length, grown: made, rimOk: !!(rimT && rimFresh()), ms: Math.round(ms), flags,
                             frame: 'x radial out (mm), y tangential (mm, th up), z = hp height above the sheet level (mm); ground[(iy*N + ix)*4 + c] = (march ground h, raw h, band weight, gap + 2 rimW); sdf[(iz*N + iy)*N + ix] mm; kind (o.kind) the same layout; col (o.kind) [(iy*N + ix)*4 + c] = (band-end distance mm, sheet coverage, strand height Hn, band value)' }, ground, sdf, kind, col };
        } finally { F.hold = false; }
    };
    // ---- the section (iori 2026-11-12: "a depth side view … inspect all height and bridging real height"). The generator
    // itself, run at the cut's points (no atlas, no residency: the strands exactly as they are made, fully grown), and the
    // layer model's floor / sheet / coverage under them; ridges and floating strands by the renderer's own rules (fdTube).
    let probe = null;
    const P_ = uv => { const r = (2 + 4 * uv[1]) * 1000, th = 2 * Math.PI * uv[0]; return [r * Math.cos(th), r * Math.sin(th)]; };
    const UV_ = p => { let u = Math.atan2(p[1], p[0]) / (2 * Math.PI); if (u < 0) u += 1; return [u, (Math.hypot(p[0], p[1]) / 1000 - 2) / 4]; };
    F.sectionFly = (uv0, uv1, o = {}) => {
        if (!F.ready || !uv0 || !uv1) return null; ensureGL();
        // the path: the chord uv0 → uv1, or o.path (the section's own uv samples: the screen line through the cornea is not a
        // chord of the tissue plane) smoothed over 9 samples — its uv come from a screen map quantised to its texels
        let poly = (o.path && o.path.length > 1 ? o.path : [uv0, uv1]).map(P_);
        if (poly.length > 9) { const sm = []; for (let i = 0; i < poly.length; i++) { let x = 0, y = 0, n = 0; for (let k = -4; k <= 4; k++) { const j = Math.min(poly.length - 1, Math.max(0, i + k)); x += poly[j][0]; y += poly[j][1]; n++; } sm.push([x / n, y / n]); } sm[0] = poly[0]; sm[sm.length - 1] = poly[poly.length - 1]; poly = sm; }
        const cum = [0]; for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]));
        const len = cum[cum.length - 1];
        const N = Math.min(8192, Math.max(2, Math.ceil(len / (o.stepUm || 0.5)) + 1)), step = len / (N - 1), lev = o.level === undefined ? 3 : o.level;
        const along = sU => { let j = 1; while (j < cum.length - 1 && cum[j] < sU) j++; const t = (sU - cum[j - 1]) / Math.max(1e-9, cum[j] - cum[j - 1]), A = poly[j - 1], B = poly[j], L2 = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1;
            return [A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1]), -(B[1] - A[1]) / L2, (B[0] - A[0]) / L2]; };
        // an optional band: offsets across the cut (µm), for the area view
        const offs = o.band ? o.band : [0], NB = offs.length;
        const pts = new Float32Array(N * NB * 2);
        for (let i = 0; i < N; i++) { const [x, y, nx, ny] = along(i * step); for (let k = 0; k < NB; k++) { const q = (k * N + i) * 2; pts[q] = x + offs[k] * nx; pts[q + 1] = y + offs[k] * ny; } }
        const W_ = Math.min(N * NB, 8192), H_ = Math.ceil(N * NB / W_);
        if (!probe || probe.w !== W_ || probe.h !== H_) {
            if (probe) { gl.deleteTexture(probe.pts); gl.deleteTexture(probe.out); gl.deleteFramebuffer(probe.fb); }
            const mk = (int, fmt) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, int, W_, H_, 0, fmt, gl.FLOAT, null);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); return t; };
            probe = { w: W_, h: H_, pts: mk(gl.RG32F, gl.RG), out: mk(gl.RGBA32F, gl.RGBA), fb: gl.createFramebuffer() };
            gl.bindFramebuffer(gl.FRAMEBUFFER, probe.fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, probe.out, 0);
        }
        const full = new Float32Array(W_ * H_ * 2); full.set(pts);
        gl.activeTexture(gl.TEXTURE24); gl.bindTexture(gl.TEXTURE_2D, probe.pts); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W_, H_, gl.RG, gl.FLOAT, full);
        gl.bindFramebuffer(gl.FRAMEBUFFER, probe.fb); genBind(); genUniforms(lev, [0, 0], [0, 0]);
        gl.activeTexture(gl.TEXTURE25); gl.bindTexture(gl.TEXTURE_2D, probe.pts); gl.uniform1i(gen.loc('u_pts'), 25); gl.uniform1f(gen.loc('u_probe'), 1);
        gl.viewport(0, 0, W_, H_); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        const px = new Float32Array(W_ * H_ * 4); gl.readPixels(0, 0, W_, H_, gl.RGBA, gl.FLOAT, px);
        gl.uniform1f(gen.loc('u_probe'), 0); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, E.canvas.width, E.canvas.height); gl.activeTexture(gl.TEXTURE0);
        // the layer model under the points: floor / sheet height (mm) and the sheet's coverage, in the renderer's units
        let K = 1; try { if (prog) { gl.useProgram(prog); const v = gl.getUniform(prog, prog.loc('u_tisReliefK')); if (v) K = v; } } catch (e) {}
        const uvs = []; for (let i = 0; i < N * NB; i++) uvs.push(UV_([pts[2 * i], pts[2 * i + 1]]));
        const aux = T.auxAtUVs ? T.auxAtUVs(uvs) : null;
        const sm = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
        // the bands between crypts (the renderer's fdGround / bridge tubes): across the band at 60–560 µm each way the floor is looked
        // for in the layer model; where both sides drop ≥ 20 µm the ground falls to them and the band's strands float, topped at the old surface
        const gapOf = q => Math.floor(Math.floor(px[4 * q + 1]) / 16) / 15, DS = [60, 120, 200, 300, 420, 560];
        const across = [], acrossIdx = [];
        for (let q = 0; q < N * NB; q++) { if (!F.gap || gapOf(q) <= 0.25) continue; const x = pts[2 * q], y = pts[2 * q + 1], th = Math.atan2(y, x) + px[4 * q + 3] + Math.PI / 2, cx_ = Math.cos(th), cy_ = Math.sin(th);
            acrossIdx.push(q); for (const d of DS) { across.push(UV_([x + cx_ * d, y + cy_ * d])); across.push(UV_([x - cx_ * d, y - cy_ * d])); } }
        const auxA = across.length && T.auxAtUVs ? T.auxAtUVs(across) : null, gapAt = new Map();
        acrossIdx.forEach((q, i) => { let hA = 1e9, hB = 1e9, dA = 200, dB = 200;
            DS.forEach((d, j) => { const a = auxA[(i * DS.length + j) * 2], b = auxA[(i * DS.length + j) * 2 + 1]; const ha = a && a.inside ? a.hMm * K * 1000 : 1e9, hb = b && b.inside ? b.hMm * K * 1000 : 1e9;
                if (ha < hA) { hA = ha; dA = d; } if (hb < hB) { hB = hb; dB = d; } });
            gapAt.set(q, { hA, hB, t: dA / (dA + dB) }); });
        const sm2 = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
        const rows = [];
        for (let k = 0; k < NB; k++) { const S = [];
            for (let i = 0; i < N; i++) { const q = k * N + i, Hn = px[4 * q + 2], A = aux ? aux[q] : null;
                const base = A ? A.hMm * K * 1000 : 0, cov = A ? A.cover : 1;      // µm, the sheet at 0, floors negative
                const ridge = F.ridge * Hn * cov;
                const rT = F.tube * Math.sqrt(Math.min(1, Math.max(0, (Hn - 0.15) / 0.6))) * (1 - sm(0.3, 0.6, cov)), zc = 0.5 * base;
                let tube = F.bridge && rT > 0 && -base > 2 * rT + 4 ? { zUm: zc, rUm: rT } : null, ground = base, surf = base + ridge, band = 0, layers = null;
                const G_ = gapAt.get(q);
                if (G_) { const fnd = sm2(20, 40, Math.min(base - G_.hA, base - G_.hB)), gw = sm2(0.25, 0.6, gapOf(q)) * fnd;
                    if (gw > 0) { const fl = Math.min(base, G_.hA * (1 - G_.t) + G_.hB * G_.t); ground = base + (fl - base) * gw; surf = ground; band = gw;
                        const rT = F.tubeB * gw, sp = Math.min(1.9 * rT, 0.3 * Math.max(base - fl, 0)), nL = Math.max(1, Math.min(3, Math.floor((base - fl) / Math.max(2.6 * rT, 1e-3))));
                        const rB = rT * Math.sqrt(Math.min(1, Math.max(0, (Hn + 0.25) / 0.9))); if (rB > 0) tube = { zUm: base - rT, rUm: rB, bridge: true };
                        // the bundle's lower layers (staggered: their strands lie between the ones above — drawn at their mean thickness)
                        layers = []; for (let k = 1; k < nL; k++) layers.push({ zUm: base - rT - sp * k, rUm: rT * (1 - 0.15 * k) * 0.75, bridge: true }); } }
                S.push({ sUm: i * step, uv: uvs[q], Hn, cov, floorUm: ground, surfaceUm: surf, tube, layers, band, inside: !!(A && A.inside) });
            }
            rows.push(S); }
        return { lenUm: len, stepUm: step, level: lev, texelUm: texel(lev), ridgeUm: F.ridge, tubeUm: F.tube, band: offs, rows, samples: rows[Math.floor(NB / 2)] };
    };
    /** one strand from a point: the fibre direction (the steering tangent) followed both ways, uv list */
    F.traceStrand = (uv, o = {}) => {
        const step = o.stepUm || 2, half = (o.maxUm || 2400) / 2, out = [P_(uv)];
        for (const sgn of [1, -1]) { let p = P_(uv), prev = null; const pts = [];
            for (let n = 0; n * step < half; n++) { const q = UV_(p); if (q[1] < 0.003 || q[1] > 0.997) break;
                const th = Math.atan2(p[1], p[0]) + tangentAt(q[0], q[1]); let t = [Math.cos(th), Math.sin(th)];
                if (!prev) { if (sgn < 0) t = [-t[0], -t[1]]; } else if (t[0] * prev[0] + t[1] * prev[1] < 0) t = [-t[0], -t[1]];
                p = [p[0] + step * t[0], p[1] + step * t[1]]; prev = t; pts.push(p); }
            if (sgn > 0) out.push(...pts); else out.unshift(...pts.reverse()); }
        return out.map(UV_);
    };
    /** the section ALONG one strand (iori: "a singular … strands splice view"): the trace, then a band across it, and in each
     *  of its samples the crest — the band row of the highest strand, kept continuous (a Viterbi pick: a step across costs) —
     *  so the cut rides the strand's own top, where it lies on the sheet and where it lifts over a crypt */
    F.sectionStrand = (uv, o = {}) => {
        if (!F.ready || !uv) return null;
        const path = F.traceStrand(uv, o), lam = (F.meta && F.meta.fibreLambdaUm) || 23, NBk = 15, offs = [];
        for (let k = 0; k < NBk; k++) offs.push((k / (NBk - 1) - 0.5) * 1.2 * lam);
        const r = F.sectionFly(path[0], path[path.length - 1], { path, band: offs, stepUm: o.stepUm || 1 }); if (!r) return null;
        const N = r.rows[0].length, cost = new Float32Array(N * NBk), back = new Int8Array(N * NBk), jump = 0.12;
        for (let k = 0; k < NBk; k++) cost[k] = -(r.rows[k][0].Hn);
        for (let i = 1; i < N; i++) for (let k = 0; k < NBk; k++) { let best = 1e9, bk = k;
            for (let d = -2; d <= 2; d++) { const j = k + d; if (j < 0 || j >= NBk) continue; const c = cost[(i - 1) * NBk + j] + jump * Math.abs(d); if (c < best) { best = c; bk = j; } }
            cost[i * NBk + k] = best - r.rows[k][i].Hn; back[i * NBk + k] = bk; }
        let k = 0, bc = 1e9; for (let j = 0; j < NBk; j++) if (cost[(N - 1) * NBk + j] < bc) { bc = cost[(N - 1) * NBk + j]; k = j; }
        const pick = new Int8Array(N); for (let i = N - 1; i >= 0; i--) { pick[i] = k; k = back[i * NBk + k]; }
        const samples = []; for (let i = 0; i < N; i++) samples.push(Object.assign({ offUm: offs[pick[i]] }, r.rows[pick[i]][i]));
        return Object.assign(r, { samples, strand: true, pathUV: samples.map(q => q.uv) });
    };   // tests: a 64-px float readback through the variant with a debug mode
    F.wantsVariant = () => F.on && F.ready && T.on && (F.forceActive || !!F.walk || footprintMm() * 1000 < 0.5 * ((F.meta && F.meta.fibreLambdaUm) || 23));   // the default zoom too (iori), per device pixel
    function tick(dt) {
        F.stats.frames++;
        if ((F.rim || F.rope) && F.sdf) { try { bakeRim(); } catch (e) { console.error('flydown rim bake', e); rimBake = rimKey(); rimAux = T.aux; } }
        stepWalk(dt);
        F.active = F.wantsVariant();
        if (!F.active || F.hold) return;   // F.hold: the field probe owns the pages
        const s = camSig(); if (s !== sig || F.stats.frames - lastPlan > 30) { sig = s; lastPlan = F.stats.frames; plan(); }
        if (queue.length) {
            const tq = performance.now();
            gl.bindFramebuffer(gl.FRAMEBUFFER, atlasFB); genBind();
            let q = null; if (timerExt && F.measure) { q = gl.createQuery(); gl.beginQuery(timerExt.TIME_ELAPSED_EXT, q); }
            let n = 0; while (queue.length && n < F.budget) { const r = queue.shift(); if (table[2 * r.key] > 0) continue; genPage(r.l, r.i, r.j); n++; }
            if (q) { gl.endQuery(timerExt.TIME_ELAPSED_EXT); queries.push({ q, n }); }
            if (F.measure) { gl.finish(); F.stats.genMs.push({ ms: performance.now() - tq, n }); }
            gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, E.canvas.width, E.canvas.height); gl.activeTexture(gl.TEXTURE0);
            if (!queue.length && F.stats.firstSharp === null && F.sharpT0) F.stats.firstSharp = performance.now() - F.sharpT0;
        }
        for (let k = queries.length - 1; k >= 0; k--) { const { q, n } = queries[k]; if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) { F.stats.gpuMs = (F.stats.gpuMs || []).concat([{ ms: gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6, n }]); gl.deleteQuery(q); queries.splice(k, 1); } }
        // keep re-rendering while anything is still fading in
        if (queue.length || now() - (F.stats.lastBornT || 0) < F.fade + F.spread + 0.1) E.resetAccumulation();
    }

    // ------------------------------------------------------------------ the walk (D4, minimal): a camera on the surface
    const UP = [0, 0, -1];                                               // away from the tissue, toward the cornea
    const norm = v => { const n = Math.hypot(...v) || 1; return v.map(x => x / n); };
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const keys = new Set();
    function walkBasis(w) {
        const cp = Math.cos(w.pitch), f = norm([cp * Math.cos(w.heading), cp * Math.sin(w.heading), Math.sin(w.pitch)]);   // pitch > 0 looks down (+z)
        // the orbit camera's handedness: right = up × forward. Straight down with heading π/2 is the orbit's own frame (+x right, +y up)
        let r = cross(UP, f); if (Math.hypot(...r) < 1e-4) r = [Math.sin(w.heading), -Math.cos(w.heading), 0]; r = norm(r);
        const u = norm(cross(f, r)); return { f, r, u };
    }
    function hitUnder(sx, sy) {                                          // the tissue point under a canvas position (debug 16 readback)
        const px = readMap(16), x = Math.min(RW - 1, Math.max(0, Math.round(sx * (RW - 1)))), y = Math.min(RH - 1, Math.max(0, Math.round(sy * (RH - 1))));   // sy runs up, as the readback's rows
        for (let r = 0; r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
            const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= RW || yy >= RH) continue; const o = (yy * RW + xx) * 4;
            if (px[o + 3] > 0.5 && px[o + 2] > 900) return [px[o], px[o + 1], px[o + 2] - 1000];
        }
        return null;
    }
    F.enterWalk = (sx = 0.5, sy = 0.5, maxAlt = 2.0) => {                               // from the current view: start straight down, matching its footprint
        if (!F.ready || F.walk) return false;
        const P = hitUnder(sx, sy); if (!P) return false; F._lastEnter = { sx, sy };
        const fov = 0.9, pix = 2 * Math.tan(fov / 2) / E.canvas.height, foot = footprintMm();
        const alt = Math.min(maxAlt, Math.max(0.02, foot / pix));
        F.walk = { pos: [P[0], P[1], P[2] - alt], ground: P, heading: Math.PI / 2, pitch: Math.PI / 2 - 1e-3, alt, fov, base: { view: state.view.slice(), zoom: state.zoomPhoto },
                   anim: { t: 0, dur: 0.8 + 0.45 * Math.log(alt / 0.045), from: { alt, pitch: Math.PI / 2 - 1e-3 }, to: { alt: 0.045, pitch: 0.42 } } };
        F.sharpT0 = performance.now(); F.stats.firstSharp = null; E.resetAccumulation(); return true;
    };
    F.flyDown = () => F.walk ? false : F.enterWalk(0.5, 0.5);
    F.leaveWalk = () => { if (!F.walk) return; const w = F.walk; w.anim = { t: 0, dur: 1.2, from: { alt: w.alt, pitch: w.pitch }, to: { alt: w.anim0alt || Math.max(0.3, w.alt), pitch: Math.PI / 2 - 1e-3 }, leave: true }; };
    function stepWalk(dt) {
        const w = F.walk; if (!w) return;
        if (w.anim) {
            const a = w.anim; a.t = Math.min(1, a.t + dt / a.dur); const k = a.t * a.t * (3 - 2 * a.t);
            w.alt = Math.exp(Math.log(a.from.alt) + (Math.log(a.to.alt) - Math.log(a.from.alt)) * k); w.pitch = a.from.pitch + (a.to.pitch - a.from.pitch) * k;
            if (a.t >= 1) { if (a.leave) { F.walk = null; E.resetAccumulation(); return; } if (!w.anim0alt) w.anim0alt = a.from.alt; w.anim = null; }
        }
        if (!w.anim && w.altT && Math.abs(Math.log(w.altT / w.alt)) > 1e-4) {   // the wheel's height, eased like the zoom (≈ 0.15 a frame at 60 fps)
            w.alt = Math.exp(Math.log(w.alt) + (Math.log(w.altT) - Math.log(w.alt)) * (1 - Math.exp(-dt * 9.75))); E.resetAccumulation(); }
        if (w.wheel && !w.anim && !w.userPitch) w.pitch = walkPitch(w);   // fly-in by wheel: the tilt follows the height
        if (w.wheel && w.anchor) { const k = w.alt / w.alt0; w.ground[0] = w.anchor[0] - w.off0[0] * k; w.ground[1] = w.anchor[1] - w.off0[1] * k; }   // and the camera closes in over the pointed spot
        // keys: walk along the heading at a speed proportional to the height; Q/E or Shift/Space change the height
        const sp = w.alt * 1.5 * dt; let mv = false;
        const fw = [Math.cos(w.heading), Math.sin(w.heading)], rt = [Math.sin(w.heading), -Math.cos(w.heading)];
        const mvBy = (a, b) => { w.ground[0] += a * fw[0] + b * rt[0]; w.ground[1] += a * fw[1] + b * rt[1]; mv = true; w.anchor = null; };
        if (keys.has('w') || keys.has('arrowup')) mvBy(sp, 0); if (keys.has('s') || keys.has('arrowdown')) mvBy(-sp, 0);
        if (keys.has('d')) mvBy(0, sp); if (keys.has('a')) mvBy(0, -sp);
        if (keys.has('arrowleft')) { w.heading -= dt * 0.9; mv = true; } if (keys.has('arrowright')) { w.heading += dt * 0.9; mv = true; }
        if (keys.has('q')) { w.alt = Math.min(2, w.alt * Math.exp(dt)); w.altT = w.alt; mv = true; } if (keys.has('e')) { w.alt = Math.max(0.004, w.alt * Math.exp(-dt)); w.altT = w.alt; mv = true; }
        // the ground under the walker follows the bow (keep the same height above the tissue's geometric surface)
        if (mv && F.stats.frames % 6 === 0) { const g = groundZ(w.ground); if (g !== null) w.ground[2] = g; }
        w.pos = [w.ground[0], w.ground[1], w.ground[2] - w.alt];
        if (mv || w.anim) E.resetAccumulation();
    }
    function groundZ(xy) {                                               // the surface depth under a point: one walk ray straight down
        const save = { p: F.walk.pos, pitch: F.walk.pitch }; F.walk.pos = [xy[0], xy[1], F.walk.ground[2] - 0.5]; F.walk.pitch = Math.PI / 2 - 1e-3;
        const P = hitUnder(0.5, 0.5); F.walk.pos = save.p; F.walk.pitch = save.pitch; return P ? P[2] : null;
    }
    addEventListener('keydown', e => { if (!F.walk) return; const k = e.key.toLowerCase(); if (k === 'escape') { F.leaveWalk(); return; } if (['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { keys.add(k); e.preventDefault(); } });
    addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => keys.clear());
    // drag looks around; the wheel changes the height (both only on the canvas, only while walking)
    let drag = null;
    window.addEventListener('pointerdown', e => { if (!F.walk || e.target !== E.canvas || e.button !== 0) return; drag = { x: e.clientX, y: e.clientY, h: F.walk.heading, p: F.walk.pitch }; if (e.pointerType !== 'touch') e.stopImmediatePropagation(); }, true);   // a touch goes on to ui31 too (its pinch)
    window.addEventListener('pointermove', e => { if (!F.walk || !drag) return; F.walk.userPitch = true; F.walk.heading = drag.h + (e.clientX - drag.x) * 0.004; F.walk.pitch = Math.min(Math.PI / 2 - 1e-3, Math.max(-0.3, drag.p - (e.clientY - drag.y) * 0.004));   /* drag down = look down (iori 2026-11-12: it was inverted) */ E.resetAccumulation(); e.stopImmediatePropagation(); }, true);
    window.addEventListener('pointerup', () => { drag = null; }, true);
    // ZOOM AND FLY-IN AS ONE MOTION (iori 2026-11-12: "can we make the fly in and zoom in as the same motion"). The wheel zooms the photo
    // as before; at the closest zoom, scrolling on in drops into the walk straight down over the point under the pointer (else the centre) at the height that matches the
    // view (enterWalk's footprint), with no animation. Scrolling on lowers the camera at the zoom's own rate (smoothed like the zoom) and
    // tilts it toward the horizon as it comes down (straight down at the entry height, the walk's 0.42 rad by 45 µm: walkPitch), until a
    // drag takes the look over. Scrolling back out climbs and turns back down; past the entry height the walk hands back to the zoom
    const ZMIN = 20.0;
    function walkPitch(w) { const t = Math.min(1, Math.max(0, Math.log(w.alt0 / w.alt) / Math.log(w.alt0 / 0.045))); return Math.PI / 2 - 1e-3 + (0.42 - (Math.PI / 2 - 1e-3)) * t * t * (3 - 2 * t); }
    // enter by zooming past the closest zoom at canvas point (sx, sy; sy runs up). False when there is no tissue there (nor at the centre)
    function enterByZoom(sx, sy) {
        if (!F.enterWalk(sx, sy, 12) && !F.enterWalk(0.5, 0.5, 12)) return false;   // the height that matches the view, however high
        const n = F.walk; n.anim = null; n.wheel = true; n.alt0 = n.alt; n.altT = n.alt; n.pitch = walkPitch(n);
        // keep the point under the pointer where it was on screen: the camera goes over the screen's centre instead (straight down,
        // heading up the screen: fw is screen-up, rt screen-right; mm per pixel = 2 tan(fov/2) / H × the height)
        const hit = F._lastEnter, mm = 2 * Math.tan(n.fov / 2) / E.canvas.height * n.alt, dx = (hit.sx - 0.5) * E.canvas.width * mm, dy = (hit.sy - 0.5) * E.canvas.height * mm;
        const fw = [Math.cos(n.heading), Math.sin(n.heading)], rt = [Math.sin(n.heading), -Math.cos(n.heading)];
        n.anchor = n.ground.slice(); n.off0 = [dx * rt[0] + dy * fw[0], dx * rt[1] + dy * fw[1]];   // the descent closes this offset (stepWalk): it zooms toward the pointer
        n.ground = [n.ground[0] - n.off0[0], n.ground[1] - n.off0[1], n.ground[2]]; n.pos = [n.ground[0], n.ground[1], n.ground[2] - n.alt];
        return true;
    }
    function handBack(w) { F.walk = null; E.target.zoomPhoto = state.zoomPhoto = Math.max(ZMIN, w.base.zoom); state.view = w.base.view.slice(); E.resetAccumulation(); }
    const canHand = () => F.on && F.ready && !state.design && !state.ref;
    const canvasPt = (cx, cy) => { const rc = E.canvas.getBoundingClientRect(); return [(cx - rc.left) / rc.width, 1 - (cy - rc.top) / rc.height]; };
    window.addEventListener('wheel', e => {
        if (e.target !== E.canvas || state.design || state.ref) return;
        const w = F.walk;
        if (!w) {                                                        // zooming: hand over to the walk at the closest zoom, scrolling in
            if (!canHand() || e.deltaY >= 0 || (E.target.zoomPhoto || state.zoomPhoto) > ZMIN * 1.001 || state.zoomPhoto > ZMIN * 1.03) return;
            if (!enterByZoom(...canvasPt(e.clientX, e.clientY))) return;
            e.preventDefault(); e.stopImmediatePropagation(); return;
        }
        e.preventDefault(); e.stopImmediatePropagation();
        if (w.anim && w.anim.leave) return;
        const base = w.altT || w.alt; w.altT = Math.min(w.wheel ? w.alt0 * 1.01 : 2, Math.max(0.004, base * Math.exp(e.deltaY * 0.001)));
        if (w.wheel && w.altT >= w.alt0 * 0.999 && e.deltaY > 0) { handBack(w); return; }   // back up at the entry height: the zoom takes over again
        if (w.wheel) w.altT = Math.min(w.altT, w.alt0);
        E.resetAccumulation();
    }, { capture: true, passive: false });
    // PINCH (iori 2026-11-12: "Yes, pinch too"): ui31's two-finger pinch asks here first. One continuous scale Z for the gesture: the zoom
    // above ZMIN, the walk's height below it (height = alt0 × Z / ZMIN), Z = Z0 × (start spread / spread). Returns true when it handled
    // the move (ui31 then leaves the zoom alone). g: ui31's per-gesture object; (cx, cy): the fingers' midpoint in client pixels
    F.pinch = (g, r, cx, cy) => {
        const w = F.walk;
        if (!g.fd) g.fd = { Z0: w ? (w.wheel ? ZMIN * (w.altT || w.alt) / w.alt0 : null) : (E.target.zoomPhoto || state.zoomPhoto), a0: w ? (w.altT || w.alt) : 0 };
        if (w && !w.wheel) { w.altT = Math.min(2, Math.max(0.004, g.fd.a0 * r)); E.resetAccumulation(); return true; }   // a walk the button started: the height only
        const Z = g.fd.Z0 * r;
        if (!w) {
            if (Z >= ZMIN) { E.target.zoomPhoto = Math.min(400, Z); return true; }   // the zoom, on the gesture's own scale (continuous after a hand-back)
            if (!canHand() || state.zoomPhoto > ZMIN * 1.03) { E.target.zoomPhoto = ZMIN; return true; }
            if (!enterByZoom(...canvasPt(cx, cy))) return false;
            g.fd.Z0 = ZMIN / r; return true;   // rebased: the walk starts at its entry height, however far the fingers ran while the zoom eased in
        }
        const n = F.walk; if (n.anim && n.anim.leave) return true;
        if (Z >= ZMIN) { handBack(n); E.target.zoomPhoto = Math.min(400, Z); return true; }   // pinched back out past the entry height
        n.altT = Math.max(0.004, n.alt0 * Z / ZMIN); E.resetAccumulation(); return true;
    };
    // touch in the walk: one finger looks; a second finger hands the gesture to the pinch (ui31 sees every touch)
    const touches = new Set();
    window.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') { touches.add(e.pointerId); if (touches.size >= 2) drag = null; } }, true);
    const untouch = e => touches.delete(e.pointerId); window.addEventListener('pointerup', untouch, true); window.addEventListener('pointercancel', untouch, true);

    // ------------------------------------------------------------------ hooks into the engine
    const origProgram = T.photoProgram, origBind = T.bind;
    T.photoProgram = () => (F.forceActive || F.active) && F.wantsVariant() ? ensureVariant() : origProgram();
    T.bind = p => {
        origBind(p);
        if (p !== prog && p !== probeProg) return;
        gl.activeTexture(gl.TEXTURE21); gl.bindTexture(gl.TEXTURE_2D, atlasT); gl.uniform1i(p.loc('u_fdAtlas'), 21);
        gl.activeTexture(gl.TEXTURE22); gl.bindTexture(gl.TEXTURE_2D, tableT); gl.uniform1i(p.loc('u_fdTable'), 22);
        gl.uniform1f(p.loc('u_fdRimOk'), rimT && rimFresh() ? 1 : 0); if (rimT) gl.uniform3i(p.loc('u_fdRimSz'), rimT.W, rimT.H, TH);
        gl.activeTexture(gl.TEXTURE0);
        gl.uniform1f(p.loc('u_fdOn'), F.on && F.ready ? 1 : 0); gl.uniform1f(p.loc('u_fdTime'), now());
        gl.uniform1f(p.loc('u_fdFade'), F.fade); gl.uniform1f(p.loc('u_fdSpread'), F.spread); gl.uniform1f(p.loc('u_fdHK'), F.hk); gl.uniform1f(p.loc('u_fdRidge'), F.ridge); gl.uniform1f(p.loc('u_fdTube'), F.tube); gl.uniform1f(p.loc('u_fdBridge'), F.bridge ? 1 : 0); gl.uniform1f(p.loc('u_fdSmear'), F.smear ? 1 : 0); gl.uniform1f(p.loc('u_fdSlim'), F.slim ? 1 : 0); gl.uniform1f(p.loc('u_fdRelPx'), F.relPx); gl.uniform1f(p.loc('u_fdTubeB'), F.tubeB); gl.uniform1f(p.loc('u_fdGapOn'), F.gap ? 1 : 0); gl.uniform1f(p.loc('u_fdSdf'), F.sdf ? 1 : 0); gl.uniform1f(p.loc('u_fdRim'), F.rim && F.sdf ? 1 : 0); gl.uniform3f(p.loc('u_fdRimP'), F.rimOv, F.rimUc, F.rimT); gl.uniform3f(p.loc('u_fdRope'), F.rope && F.sdf ? 1 : 0, F.ropeR, F.ropeFork ? 1 : 0); gl.uniform1f(p.loc('u_fdPx'), F.pxScale()); gl.uniform1f(p.loc('u_fdForceF'), F.forceF || 0); gl.uniform1f(p.loc('u_fdKeep12'), F.keep12 ? 1 : 0); gl.uniform1f(p.loc('u_fdFibre'), F.meta ? F.meta.fibreLambdaUm || 23 : 23); gl.uniform1f(p.loc('u_fdTisN'), T.size && T.rect ? T.size[0] / T.rect[2] : 0);
        gl.uniform1iv(p.loc('u_fdRow'), new Int32Array(ROW));
        const w = F.walk;
        gl.uniform1f(p.loc('u_walk'), w ? 1 : 0);
        if (w) {
            const b = walkBasis(w), H = gl.getParameter(gl.VIEWPORT)[3];
            gl.uniform3f(p.loc('u_walkPos'), ...w.pos); gl.uniform3f(p.loc('u_walkF'), ...b.f); gl.uniform3f(p.loc('u_walkR'), ...b.r); gl.uniform3f(p.loc('u_walkU'), ...b.u);
            gl.uniform1f(p.loc('u_walkFov'), w.fov); gl.uniform1f(p.loc('u_walkPix'), 2 * Math.tan(w.fov / 2) / H);
        }
    };
    Object.assign(F, { tick, plan, readMap, loadEye, resetPages, footprintMm, stats: F.stats, ROW, LV, texel, pageUm });
    Object.defineProperty(F, 'queue', { get: () => queue }); Object.defineProperty(F, '_table', { get: () => table }); F._pageKey = pageKey;   // tests Object.defineProperty(F, 'centre', { get: () => centre });   // live, not copied

    // eye changes: reload the seed (eyes without one keep the engine as it is)
    let lastSrc = null;
    setInterval(() => { const r = T.src && T.src.ref ? T.src.ref.slice(0, 2) : null; if (r && r !== lastSrc) { lastSrc = r; loadEye(r).catch(e => { F.ready = false; console.warn(e.message); F.say && F.say(e.message); }); } }, 500);
    let last = performance.now();
    (function frame(t) { const dt = Math.min(0.1, (t - last) / 1000); last = t; try { tick(dt); } catch (e) { console.error(e); F.on = false; } requestAnimationFrame(frame); })(last);
    window.__irisFly = F;
})();
