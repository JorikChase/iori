// tissue.js — spec §30 P1: the tissue LAYER model as a separately compiled engine variant (`tissueModel`).
//
//   cornea · border-layer SHEET with holes (+ rim pigment) · DECK of explicit fibre curves with veins · dark ground
//
// The primitives (curves with 1-D payloads, outlines, material cells) are rasterised on the GPU into a REGION of the
// atlas: every curve set is drawn as quads around its segments with gl_FragDepth = distance, so the depth test keeps the
// NEAREST curve per texel (a Voronoi diagram of the curves, with the payload interpolated along the segment) — the
// distance-field bake of the P0 mock (tools/layer_proof.py), exact within the radius. A compose pass builds the region's
// albedo (linear RGB) and relief; a variant of fs-photo, built by string replacement on the untouched source, reads them.
// Nothing here runs unless IrisTissue.on — the default programs, atlas and fits are bit-identical.
//
// Colours arrive in PHOTO space (graded spectral-LUT colours × payload). The engine owns illumination and the camera, so
// they are converted to ALBEDO here: the post pass is inverted analytically (gamma, ACES, sat, EV) and the smooth
// irradiance E(x) is measured once by rendering the region in flat grey through the real renderer.
(function () {
    const T = window.IrisTissue = { on: false, log: [] };
    let E, gl, F, P = null;                       // engine, context, fitter, programs
    const say = m => { T.log.push(m); if (T.verbose) console.log('[tissue]', m); };

    // ---------------------------------------------------------------- GL helpers
    function program(vsSrc, fsSrc, name, bind) {
        const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const e = name + ': ' + gl.getShaderInfoLog(s); say(e); throw new Error(e); } return s; };
        const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vsSrc)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fsSrc));
        for (const k in (bind || {})) gl.bindAttribLocation(p, bind[k], k);
        gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { const e = name + ': ' + gl.getProgramInfoLog(p); say(e); throw new Error(e); }
        p.u = {}; p.loc = n => (n in p.u ? p.u[n] : (p.u[n] = gl.getUniformLocation(p, n))); return p;
    }
    function texture(w, h, mip, data, wrapU) {
        const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, data ? gl.FLOAT : gl.HALF_FLOAT, data || null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, (wrapU === undefined ? T.full : wrapU) ? gl.REPEAT : gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        return t;
    }
    const QUAD_VS = `#version 300 es
        layout(location = 0) in vec2 position; out vec2 v_c; void main() { v_c = position * 0.5 + 0.5; gl_Position = vec4(position, 0.0, 1.0); }`;
    const CURVE_VS = `#version 300 es
        precision highp float;
        layout(location = 0) in vec2 a_p0; layout(location = 1) in vec2 a_p1; layout(location = 2) in vec2 a_corner;
        layout(location = 3) in vec4 a_v0; layout(location = 4) in vec4 a_v1; layout(location = 5) in vec2 a_w;
        uniform vec4 u_rect; uniform float u_R;
        out vec2 v_q; flat out vec2 v_a; flat out vec2 v_b; flat out vec4 v_v0; flat out vec4 v_v1; flat out vec2 v_w;
        void main() {
            vec2 m = 0.5 * (a_p0 + a_p1);
            vec2 S = vec2(6.2831853 * (2.0 + 4.0 * m.y), 4.0);              // mm per unit (u, v): tissue at the reference dilation, r = 2 + 4 v
            vec2 A = (a_p0 - m) * S, B = (a_p1 - m) * S, t = B - A; float L = max(length(t), 1e-7); t /= L; vec2 n = vec2(-t.y, t.x);
            vec2 q = (a_corner.x < 0.0 ? A - t * u_R : B + t * u_R) + n * a_corner.y * u_R;
            v_q = q; v_a = A; v_b = B; v_v0 = a_v0; v_v1 = a_v1; v_w = a_w;
            vec2 c = (m + q / S - u_rect.xy) / u_rect.zw;
            gl_Position = vec4(c * 2.0 - 1.0, 0.0, 1.0);
        }`;
    const CURVE_FS = `#version 300 es
        precision highp float;
        in vec2 v_q; flat in vec2 v_a; flat in vec2 v_b; flat in vec4 v_v0; flat in vec4 v_v1; flat in vec2 v_w;
        uniform float u_R;
        layout(location = 0) out vec4 o0; layout(location = 1) out vec4 o1;
        void main() {
            vec2 ab = v_b - v_a; float t = clamp(dot(v_q - v_a, ab) / max(dot(ab, ab), 1e-12), 0.0, 1.0);
            float d = length(v_q - (v_a + ab * t)); if (d > u_R) discard;
            gl_FragDepth = d / u_R;                                          // the nearest curve wins the texel
            o0 = mix(v_v0, v_v1, t);
            o1 = vec4(d, mix(v_w.x, v_w.y, t), (ab.x * (v_q.y - v_a.y) - ab.y * (v_q.x - v_a.x)) >= 0.0 ? 1.0 : -1.0, 1.0);
        }`;
    // inside / outside of the outlines by WINDING: every outline as a triangle fan, +1 for a front-facing triangle, −1 for a
    // back-facing one, added up — the sum is the winding number whatever the shape (holes wound one way, islands the other)
    const FILL_VS = `#version 300 es
        layout(location = 0) in vec2 a_uv; uniform vec4 u_rect; uniform float u_shift;
        void main() { vec2 c = (a_uv + vec2(u_shift, 0.0) - u_rect.xy) / u_rect.zw; gl_Position = vec4(c * 2.0 - 1.0, 0.0, 1.0); }`;
    const FILL_FS = `#version 300 es
        precision highp float; out vec4 o; void main() { o = vec4(gl_FrontFacing ? 1.0 : -1.0, 0.0, 0.0, 0.0); }`;
    const COMPOSE_FS = `#version 300 es
        precision highp float;
        in vec2 v_c;
        uniform sampler2D u_fibA, u_fibB, u_veinA, u_veinB, u_guideA, u_guideB, u_sfA, u_sfB, u_svA, u_svB, u_outA, u_outB, u_cellS, u_cellG, u_fill;
        uniform vec4 u_rect; uniform vec2 u_size; uniform vec3 u_rimRGB; uniform float u_grey;
        uniform float u_wall, u_rimW, u_rimOff, u_pit0, u_pit1, u_depth, u_deckZ, u_deckH, u_fibRK, u_delight, u_wallZ;
        layout(location = 0) out vec4 o_alb; layout(location = 1) out vec4 o_aux;
        const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
        float sstep(float a, float b, float x) { float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
        float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
        void main() {
            vec2 c = v_c, px = 1.0 / u_size;
            vec4 cs = texture(u_cellS, c), cg = texture(u_cellG, c);
            float mask = smoothstep(0.05, 0.6, cs.a);
            // sheet coverage and rim from the outlines (signed distance, + inside a hole)
            vec4 oB = texture(u_outB, c); float sd = (texture(u_fill, c).r > 0.5 ? 1.0 : -1.0) * oB.r;   // distance from the nearest outline, sign from the winding fill
            float cover = 1.0 - sstep(-u_wall, u_wall, sd);
            float rim = texture(u_outA, c).r * exp(-pow((sd + u_rimOff) / u_rimW, 2.0)) * step(sd, 0.0093);
            // deck: every floor point takes its nearest fibre's colour (body brightness included), a little roundness, the veins cut the gaps
            vec3 fib = vec3(0.0); float wsum = 0.0;
            for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { float w = (i == 0 ? 2.0 : 1.0) * (j == 0 ? 2.0 : 1.0); fib += w * texture(u_fibA, c + vec2(float(i), float(j)) * px * 2.5).rgb; wsum += w; }
            fib /= wsum;
            vec4 fB = texture(u_fibB, c), vB = texture(u_veinB, c);
            // Z3 (§32) de-lighting. The roundness term is SYNTHETIC cross-fibre shading: the payload is 1-D, read along the
            // centreline, so the fall-off across a tube was never measured and the old model painted it on. Now that
            // the deck has real height the renderer shades the dome itself, from the normals of the baked surface —
            // two copies of the same cosine. u_delight fades the painted one out so the geometric one is the only
            // one left: the same picture head-on, but one that re-lights, because it is geometry and not paint.
            // Dividing by the dome's ANALYTIC cosine as well — the textbook de-lighting — was tried and is badly
            // wrong here: −6.2 MATCH2 at deckZ 0.35, strandCorr halved. The renderer's real response to this relief
            // is far weaker than the analytic cosine (a coaxial key hardly cares about tilt, §30.1, and the normal is
            // taken from a mipped height field), so the division over-brightens every tube edge into a halo. Measuring
            // that response instead of assuming it needs the region and the render at one scale — that is T2a.
            float roundness = mix(0.78 + 0.22 * sqrt(clamp(1.0 - pow(fB.r / max(u_fibRK * fB.g, 0.014), 2.0), 0.0, 1.0)), 1.0, u_delight);
            float vein = (1.0 - texture(u_veinA, c).r) * exp(-0.5 * pow(vB.r / max(vB.g, 0.0056), 2.0)) * vB.a;
            float prof = (1.0 - sstep(u_pit0, u_pit1, fB.r)) * fB.a;        // no fibre within ≈ 0.1 mm: a true pit, the ground shows
            vec3 hole = mix(cg.rgb, fib * roundness * (1.0 - vein), prof);
            // sheet: material cells × guides (relative brightness, own colour) × fine streaks and veins × seeded matte grain
            vec4 gA = texture(u_guideA, c), gB = texture(u_guideB, c), sfB = texture(u_sfB, c), svB = texture(u_svB, c);
            float mod_ = 1.0 + (gA.a - 1.0) * exp(-0.5 * pow(gB.r / max(0.55 * gB.g, 0.0093), 2.0)) * gB.a;
            mod_ *= 1.0 + (max(texture(u_sfA, c).r, 1.0) - 1.0) * exp(-0.5 * pow(sfB.r / max(sfB.g, 0.0056), 2.0)) * sfB.a;
            mod_ *= 1.0 - (1.0 - min(texture(u_svA, c).r, 1.0)) * exp(-0.5 * pow(svB.r / max(svB.g, 0.0056), 2.0)) * svB.a;
            float gmix = 0.85 * exp(-0.5 * pow(gB.r / max(0.9 * gB.g, 0.014), 2.0)) * gB.a;
            float sY = dot(cs.rgb, LUMA);
            vec3 sheetC = (cs.rgb / max(sY, 1e-5) * (1.0 - gmix) + gA.rgb / max(dot(gA.rgb, LUMA), 1e-5) * gmix) * sY;
            vec2 mm = (u_rect.xy + c * u_rect.zw) * vec2(6.2831853 * (2.0 + 4.0 * (u_rect.y + c.y * u_rect.w)), 4.0);
            float grain = 1.0 + 0.055 * 3.4 * (0.5 * vnoise(mm / 0.008) + 0.5 * vnoise(mm / 0.017 + 7.3) - 0.5);
            vec3 sheet = mix(sheetC, u_rimRGB, rim) * mod_ * grain;
            vec3 lin = mix(hole, sheet, cover);
            if (u_grey > 0.0) lin = vec3(u_grey);                           // calibration: flat grey albedo, the relief stays
            o_alb = vec4(lin, mask);
            // Z1 (§32): the deck has height. Every fibre is a tube of radius rK·w whose centre sits z above the floor
            // of its hole (radius measured, weave inferred — tools/layer_proof.py), so the surface inside a hole is
            // the floor plus the dome of the nearest tube. The floor drops by the deck's own thickness so the tallest
            // tubes come up level with the underside of the sheet instead of standing proud of it.
            float rr = u_fibRK * fB.g;
            float dome = sqrt(max(0.0, rr * rr - fB.r * fB.r));
            float zDeck = (texture(u_fibA, c).a + dome) * u_deckZ * prof;
            // the RELIEF's wall may be wider than the colour's: the colour edge of a hole is sharp in the photo, but
            // a 100 µm drop over a 23 µm wall is an 80° cliff, and §30.1 warns what a cliff does under a coaxial key
            float coverZ = 1.0 - sstep(-u_wallZ, u_wallZ, sd);
            o_aux = vec4(mix(-u_depth - u_deckH + zDeck, 0.0, coverZ), 0.0, 0.0, mask);
        }`;

    // K1 (§32): the origin — the fitted atlas's material, packed the moment the layer model is switched on. The knobs
    // move the *current* atlas (index.html `uploadFields` already applies every colour gene as a gain or offset on
    // `genome.fitted`); the ratio of the two materials through the same spectral LUT is what the layer model's albedo
    // is scaled by. At the origin the two are the same texel values, so the ratio is exactly 1 and nothing moves.
    const ORIGIN_FS = `#version 300 es
        precision highp float;
        in vec2 v_c; uniform sampler2D u_a0, u_a1, u_a2, u_a3;
        layout(location = 0) out vec4 o0; layout(location = 1) out vec4 o1;
        void main() {
            vec4 t0 = texture(u_a0, v_c), t1 = texture(u_a1, v_c), t2 = texture(u_a2, v_c), t3 = texture(u_a3, v_c);
            o0 = vec4(t0.b, t0.g, t2.r, t2.g);        // melanin | stroma | pheo | yellow
            o1 = vec4(t2.b, t2.a, t3.g, t1.g);        // gap melanin | gap stroma | stroma thickness | furrow
        }`;

    function programs() {
        if (P) return P;
        P = { curve: program(CURVE_VS, CURVE_FS, 'tissue-curve'), compose: program(QUAD_VS, COMPOSE_FS, 'tissue-compose'), fill: program(FILL_VS, FILL_FS, 'tissue-fill'), origin: program(QUAD_VS, ORIGIN_FS, 'tissue-origin') };
        // the photo shader variant: string replacement on the untouched fs-photo source
        let src = document.getElementById('fs-photo').text.trim(); const need = (a, b) => { if (!src.includes(a)) throw new Error('tissue: fs-photo anchor missing: ' + a.slice(0, 40)); src = src.replace(a, b); };
        // every height read goes through tissueH (done first, so the helper below keeps its own raw read)
        src = src.replace(/textureLod\(u_atlas0, (.+?), lod\)\.r \* u_relief/g, (m, uv) => `tissueH(${uv}, lod)`);
        need('uniform sampler2D u_atlas0;', `uniform sampler2D u_atlas0;
        uniform sampler2D u_tissue, u_tissueAux; uniform vec4 u_tissueRect; uniform float u_tissueLod;
        uniform sampler2D u_tisW, u_tisWAux; uniform vec4 u_tisWRect; uniform float u_tisWLod, u_tisWOn;   // T2a: the re-baked window, finer than the base
        uniform sampler2D u_tisO0, u_tisO1;                                          // K1: the material of the fitted eye at the knob origin
        uniform float u_tisReliefK, u_oRingStr, u_oRingR, u_oRingPheo, u_oStromaMax, u_tisK1;
        bool tisIn(vec4 R, vec2 uv, out vec2 c) { c = (vec2(fract(uv.x), uv.y) - R.xy) / R.zw; return c.x > 0.0 && c.x < 1.0 && c.y > 0.0 && c.y < 1.0; }
        vec4 tissueAt(sampler2D s, vec2 uv, float lod) { vec2 c; if (!tisIn(u_tissueRect, uv, c)) return vec4(0.0); return textureLod(s, c, max(0.0, lod + u_tissueLod)); }
        // T2a: inside the window the finer bake wins; everywhere else the base region answers, so the eye stays whole
        vec4 tisAlb(vec2 uv, float lod) { vec2 c; if (u_tisWOn > 0.5 && tisIn(u_tisWRect, uv, c)) return textureLod(u_tisW, c, max(0.0, lod + u_tisWLod)); return tissueAt(u_tissue, uv, lod); }
        vec4 tisAux(vec2 uv, float lod) { vec2 c; if (u_tisWOn > 0.5 && tisIn(u_tisWRect, uv, c)) return textureLod(u_tisWAux, c, max(0.0, lod + u_tisWLod)); return tissueAt(u_tissueAux, uv, lod); }
        float tissueH(vec2 uv, float lod) { vec4 a = tisAux(uv, lod); return mix(textureLod(u_atlas0, uv, lod).r * u_relief, a.r * u_tisReliefK, a.a); }`);
        need('float occ = t3.r;', `vec4 tsA = tisAlb(uv, lod);
            float tisRidge0 = t1.a;                                                                // K1: the fitted strand coverage, before the line below zeroes it
            t0.r = mix(t0.r, tisAux(uv, lod).r * u_tisReliefK / max(u_relief, 1e-4), tsA.a); t0.a *= 1.0 - tsA.a;   // the layer model owns relief and darkness here:
            t1 = mix(t1, vec4(0.0), tsA.a); t3.r = mix(t3.r, 1.0, tsA.a);                          // no crypt / furrow / spot / strand-sheen / occlusion terms of the old model
            float occ = t3.r;`);
        need('lit += 0.05 * pow(clamp(dot(N, hv), 0.0, 1.0), 24.0);', 'lit += 0.05 * (1.0 - tsA.a) * pow(clamp(dot(N, hv), 0.0, 1.0), 24.0);   // the coaxial flash glints off every texel: a constant the tissue cannot go below — the payloads own it here');
        need('col *= clamp(mix(0.0, 2.0, texture(u_f1, uv).b), 0.4, 1.6);', `col *= clamp(mix(0.0, 2.0, texture(u_f1, uv).b), 0.4, 1.6);
            // K1 (§32): the knobs offset the fit. The material this texel has now (\`mel\`, \`stroma\`, \`pheo\`, ring and all,
            // after the knobs moved the fitted fields) against the material it had at the origin, both through the same
            // spectral LUT: their ratio scales the layer model's measured albedo. Origin = origin ⇒ ratio = 1, exactly.
            vec3 tint = vec3(1.0);
            if (tsA.a > 0.0 && u_tisK1 > 0.5) {
                vec4 oA = textureLod(u_tisO0, uv, lod), oB = textureLod(u_tisO1, uv, lod);
                float oFurrow = mix(oB.a * mix(0.4, 1.3, dil), 0.0, tsA.a);       // \`furrow\` above is read from t1, which the layer model has already zeroed here — the origin has to be zeroed the same way
                float oThick = mix(0.6, 1.0, smoothstep(0.0, 0.35, vt)) * (1.0 - 0.5 * oFurrow) * (0.5 + 0.6 * oB.b);
                float oMel = oA.r * u_melScale, oStroma = oA.g;
                float oEdge = u_oRingR * (0.7 + 0.6 * clamp(oStroma / max(u_oStromaMax, 1e-3), 0.0, 1.0));
                float oRing = (1.0 - smoothstep(oEdge - 0.08, oEdge + 0.06, vt)) * (1.0 - crypt);
                oMel += u_oRingStr * oRing;
                float oPheo = mix(oA.b, u_oRingPheo, oRing * clamp(u_oRingStr, 0.0, 1.0));
                vec3 oS = u_useLut > 0.5 ? irisAlbedoLut(oMel, oStroma, oThick, oPheo, oA.a) : irisAlbedoAnalytic(oMel, oStroma, oThick, oPheo);
                vec3 oG = u_useLut > 0.5 ? irisAlbedoLut(oB.r + u_oRingStr * oRing, oB.g, oThick, oPheo, oA.a * 0.85) : irisAlbedoAnalytic(oB.r, oB.g, oThick, oPheo);
                vec3 oCol = mix(oG, oS, tisRidge0), nCol = mix(albG, albS, tisRidge0);
                // the SAME small offset on both sides: where the origin material is black (the limbal rim clamps the LUT
                // to zero) a bare ratio would read 0/eps = 0 and paint the rim black, while 0 → 0 must mean "unchanged"
                const vec3 EPS = vec3(2e-3);
                tint = clamp((nCol + EPS) / (oCol + EPS), vec3(0.0), vec3(8.0));
            }
            col = mix(col, tsA.rgb * tint, tsA.a);`);
        P.photo = program(document.getElementById('vs').text.trim(), src, 'photo-tissue', { position: 0 });
        return P;
    }
    T.k1 = true;                                  // K1 (§32): the knobs offset the fit. Set false for the v0.8 ablation.
    T.photoProgram = () => programs().photo;

    // K1: snapshot the fitted eye's material — call it while the sliders stand where the fit left them. The picture at
    // these values is the one the fit produced; every knob then reads as a move away from here.
    T.setOrigin = function () {
        const pr = programs(), [aw, ah] = E.ATLAS, S = E.state, g = E.genome.globals;
        if (E.atlas.dirty) E.bakeAtlas();
        // bind() may reach this in the middle of drawPhotoFrame, between its useProgram and its draw: leave the
        // program, the target and the viewport exactly as they were, or that frame is drawn with this pass's state
        const prevProg = gl.getParameter(gl.CURRENT_PROGRAM), prevFB = gl.getParameter(gl.FRAMEBUFFER_BINDING), prevVP = gl.getParameter(gl.VIEWPORT);
        if (T.o0) { gl.deleteTexture(T.o0); gl.deleteTexture(T.o1); }
        T.o0 = texture(aw, ah, true, null, true); T.o1 = texture(aw, ah, true, null, true);
        if (!T.ofb) T.ofb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, T.ofb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, T.o0, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, T.o1, 0);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
        gl.viewport(0, 0, aw, ah); gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
        const p = pr.origin; gl.useProgram(p);
        for (let i = 0; i < 4; i++) { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, E.atlas.tex[i]); gl.uniform1i(p.loc('u_a' + i), i); }
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        for (const t of [T.o0, T.o1]) { gl.bindTexture(gl.TEXTURE_2D, t); gl.generateMipmap(gl.TEXTURE_2D); }   // the atlas is read through mips; the origin must be too, or the ratio drifts when zoomed out
        gl.activeTexture(gl.TEXTURE0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, prevFB); gl.drawBuffers([prevFB ? gl.COLOR_ATTACHMENT0 : gl.BACK]);
        gl.viewport(prevVP[0], prevVP[1], prevVP[2], prevVP[3]); gl.useProgram(prevProg);
        T.origin = { relief: S.relief, blRelief: S.blRelief === undefined ? 1 : S.blRelief, ring: S.ring, ringR: S.ringR, ringPheo: g.ringPheo, stromaMax: g.stroma, atlas: [aw, ah] };
        E.resetAccumulation && E.resetAccumulation();
        return T.origin;
    };
    T.bind = prog => {                            // called by drawPhotoFrame after its own uniforms, before the draw
        gl.activeTexture(gl.TEXTURE10); gl.bindTexture(gl.TEXTURE_2D, T.albedo); gl.uniform1i(gl.getUniformLocation(prog, 'u_tissue'), 10);
        gl.activeTexture(gl.TEXTURE11); gl.bindTexture(gl.TEXTURE_2D, T.aux); gl.uniform1i(gl.getUniformLocation(prog, 'u_tissueAux'), 11);
        gl.uniform4f(gl.getUniformLocation(prog, 'u_tissueRect'), T.rect[0], T.rect[1], T.rect[2], T.rect[3]);
        gl.uniform1f(gl.getUniformLocation(prog, 'u_tissueLod'), T.lodBias);
        const Wn = T.win;                                   // T2a: the finer window, if one is baked
        gl.activeTexture(gl.TEXTURE17); gl.bindTexture(gl.TEXTURE_2D, (Wn && Wn.albedo) || T.albedo); gl.uniform1i(gl.getUniformLocation(prog, 'u_tisW'), 17);
        gl.activeTexture(gl.TEXTURE18); gl.bindTexture(gl.TEXTURE_2D, (Wn && Wn.aux) || T.aux); gl.uniform1i(gl.getUniformLocation(prog, 'u_tisWAux'), 18);
        gl.uniform4f(gl.getUniformLocation(prog, 'u_tisWRect'), Wn ? Wn.rect[0] : 0, Wn ? Wn.rect[1] : 0, Wn ? Wn.rect[2] : 1, Wn ? Wn.rect[3] : 1);
        gl.uniform1f(gl.getUniformLocation(prog, 'u_tisWLod'), Wn ? Wn.lodBias : 0);
        gl.uniform1f(gl.getUniformLocation(prog, 'u_tisWOn'), Wn ? 1 : 0);
        // K1: the origin and the knobs' distance from it. NEVER capture it here — bind() runs inside drawPhotoFrame,
        // between its useProgram and its draw, and setOrigin bakes the atlas, which walks over far more GL state than
        // a caller can save. Doing it here quietly corrupted the FIRST render after every load, and since calibrate()
        // measures the light from exactly that render, the whole eye came out mis-lit: 79.65 MATCH2 against 82.92 for
        // the same configuration baked a second time. The capture belongs to bake()/calibrate(), outside any draw.
        const [aw, ah] = E.ATLAS;
        const haveOrigin = !!(T.origin && T.origin.atlas[0] === aw && T.origin.atlas[1] === ah);
        if (!haveOrigin) T.origin = null;                 // bake() picks this up and captures it properly
        const o = T.origin || { relief: 1, blRelief: 1, ring: 0, ringR: 0, ringPheo: 0, stromaMax: 1 };
        const S = E.state, u = n => gl.getUniformLocation(prog, n), q = (a, b) => a / Math.max(b, 1e-4);
        gl.activeTexture(gl.TEXTURE15); gl.bindTexture(gl.TEXTURE_2D, T.o0 || T.albedo); gl.uniform1i(u('u_tisO0'), 15);
        gl.activeTexture(gl.TEXTURE16); gl.bindTexture(gl.TEXTURE_2D, T.o1 || T.albedo); gl.uniform1i(u('u_tisO1'), 16);
        gl.uniform1f(u('u_tisReliefK'), q(S.relief, o.relief) * q(S.blRelief === undefined ? 1 : S.blRelief, o.blRelief));
        gl.uniform1f(u('u_oRingStr'), o.ring); gl.uniform1f(u('u_oRingR'), o.ringR);
        gl.uniform1f(u('u_oRingPheo'), o.ringPheo); gl.uniform1f(u('u_oStromaMax'), o.stromaMax);
        gl.uniform1f(u('u_tisK1'), (T.k1 === false || !haveOrigin) ? 0 : 1);   // ablation: K1 off = the v0.8 behaviour, the fit as fixed pixels
        if (T.full) gl.uniform1f(gl.getUniformLocation(prog, 'u_limbalMilk'), 0.0);   // the old fit's milky limbus answered a rim this model draws itself gl.activeTexture(gl.TEXTURE0);
    };

    // ---------------------------------------------------------------- photo space → albedo
    const ACES = { a: 2.51, b: 0.03, c: 2.43, d: 0.59, e: 0.14 }, ACES1 = (2.51 + 0.03) / (2.43 + 0.59 + 0.14);
    const acesInv = y => { const { a, b, c, d, e } = ACES, A = a - c * y, B = b - d * y; return (-B + Math.sqrt(Math.max(0, B * B + 4 * A * e * y))) / (2 * A); };
    const srgbEnc = x => x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
    // display value (0..1, as encoded in the 8-bit image) → linear scene radiance before the post pass
    function unpost(v) {
        const st = E.state, sat = st.sat === undefined ? 1 : st.sat, k = Math.pow(2, -st.ev); const x = [0, 0, 0];
        for (let i = 0; i < 3; i++) { const D = Math.pow(Math.min(0.999, Math.max(0, v[i])), 2.2); x[i] = st.tone > 0.5 ? acesInv(D * ACES1) : D; }
        const lum = 0.2126 * x[0] + 0.7152 * x[1] + 0.0722 * x[2];
        return x.map(q => Math.max(0, lum + (q - lum) / Math.max(sat, 1e-3)) * k);
    }
    // a PHOTO-space linear sRGB colour at fit pixel (x, y) → the albedo that renders as that colour
    function toAlbedo(rgb, x, y) {
        const r = unpost(rgb.map(srgbEnc)), e = T.irr ? T.irrAt(x, y) : [1, 1, 1, 0, 0, 0];
        const a = [0, 1, 2].map(t => (r[t] - e[3 + t]) / Math.max(0.05, e[t]));
        if (Math.min(a[0], a[1], a[2]) < 0.004) {                  // darker than the light's additive floor: keep the hue, take what luminance is left
            const Yr = 0.2126 * r[0] + 0.7152 * r[1] + 0.0722 * r[2], Ys = 0.2126 * e[3] + 0.7152 * e[4] + 0.0722 * e[5], g = Math.max(0.03, (Yr - Ys) / Math.max(Yr, 1e-5));
            return [0, 1, 2].map(t => Math.max(0.002, r[t] * g / Math.max(0.05, e[t])));
        }
        return a;
    }

    // ---------------------------------------------------------------- primitives → tissue coordinates → vertex buffers
    function uvAt(map, W, H, x, y) {              // bilinear read of the engine's coordinate map; null off the iris
        const ix = Math.floor(x), iy = Math.floor(y); if (ix < 0 || iy < 0 || ix >= W - 1 || iy >= H - 1) return null;
        const k = iy * W + ix, ks = [k, k + 1, k + W, k + W + 1]; for (const q of ks) if (!map.inside[q]) return null;
        const tx = x - ix, ty = y - iy, ws = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty]; let c = 0, s = 0, v = 0;
        for (let i = 0; i < 4; i++) { c += ws[i] * Math.cos(6.2831853 * map.u[ks[i]]); s += ws[i] * Math.sin(6.2831853 * map.u[ks[i]]); v += ws[i] * map.v[ks[i]]; }
        return [(Math.atan2(s, c) / 6.2831853 + 1) % 1, v];
    }
    function buildSet(curves, valueOf, closed, R) {
        // one quad (two triangles) per segment; per vertex: p0, p1, corner, v0, v1, w  = 2+2+2+4+4+2 = 16 floats. On a full circle a
        // segment within reach of the u seam is drawn again one turn over, so both sides of the seam see it.
        const corners = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]; let nseg = 0;
        for (const c of curves) nseg += closed ? c.uv.length : c.uv.length - 1;
        const data = new Float32Array(nseg * 2 * 96); let o = 0;
        for (const c of curves) {
            const n = c.uv.length, m = closed ? n : n - 1;
            for (let i = 0; i < m; i++) {
                const j = (i + 1) % n, a = c.uv[i], b = c.uv[j]; if (!a || !b) continue;
                let bu = b[0]; if (bu - a[0] > 0.5) bu -= 1; else if (a[0] - bu > 0.5) bu += 1;                 // the shortest way round the seam
                const v0 = valueOf(c, i), v1 = valueOf(c, j), w0 = c.w ? c.w[i] : 0, w1 = c.w ? c.w[j] : 0;
                const reach = 1.5 * R / (6.2831853 * (2 + 4 * Math.min(a[1], b[1]))), shifts = [0];
                if (T.full) { if (Math.min(a[0], bu) < reach) shifts.push(1); if (Math.max(a[0], bu) > 1 - reach) shifts.push(-1); }
                for (const sh of shifts) for (const k of corners) { data.set([a[0] + sh, a[1], bu + sh, b[1], k[0], k[1], v0[0], v0[1], v0[2], v0[3], v1[0], v1[1], v1[2], v1[3], w0, w1], o); o += 16; }
            }
        }
        const vao = gl.createVertexArray(), buf = gl.createBuffer();
        gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, o), gl.STATIC_DRAW);
        const sizes = [2, 2, 2, 4, 4, 2]; let off = 0;
        sizes.forEach((sz, i) => { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, sz, gl.FLOAT, false, 64, off); off += 4 * sz; });
        gl.bindVertexArray(null); gl.bindBuffer(gl.ARRAY_BUFFER, null);
        return { vao, buf, count: o / 16 };
    }
    const mmArea = uv => {                          // signed area in tissue mm, u unwrapped along the outline (an outline may cross the seam)
        const p = []; let prev = null; for (const q of uv) { if (!q) continue; let u = q[0]; if (prev !== null) { while (u - prev > 0.5) u -= 1; while (prev - u > 0.5) u += 1; } prev = u; p.push([u, q[1]]); }
        let a = 0; for (let i = 0; i < p.length; i++) { const A = p[i], B = p[(i + 1) % p.length], S = 6.2831853 * (2 + 4 * 0.5 * (A[1] + B[1])); a += (A[0] * S) * (B[1] * 4) - (B[0] * S) * (A[1] * 4); } return a / 2; };

    // ---------------------------------------------------------------- load
    // `json`: tools/layer_proof.py --export. The fit photo of json.ref must be loaded and posed (fit.renderCaseThumb / solvePose).
    T.load = function (json) {
        E = window.__irisEngine; gl = E.gl; F = E.fit; T.src = json;
        const fit = F.fit, W = fit.W, H = fit.H, map = F.getMap(), sx = W / json.fit[0], sy = H / json.fit[1];
        const conv = xy => xy.map(p => uvAt(map, W, H, p[0] * sx, p[1] * sy));
        const sets = {}; let u0 = 1, u1 = 0, v0 = 1, v1 = 0, lost = 0, tot = 0;
        for (const k of ['outlines', 'fibres', 'veins', 'guides', 'sfib', 'svein']) sets[k] = json[k].map(c => { const uv = conv(c.xy); for (const p of uv) { tot++; if (!p) { lost++; continue; } u0 = Math.min(u0, p[0]); u1 = Math.max(u1, p[0]); v0 = Math.min(v0, p[1]); v1 = Math.max(v1, p[1]); } return Object.assign({}, c, { uv }); });
        T.full = u1 - u0 > 0.5;                                          // the whole iris: the region is the full circle, u wraps
        const cells = { xy: json.cells.xy, uv: conv(json.cells.xy), sheet: json.cells.sheet, ground: json.cells.ground };
        for (const p of cells.uv) if (p) { u0 = Math.min(u0, p[0]); u1 = Math.max(u1, p[0]); v0 = Math.min(v0, p[1]); v1 = Math.max(v1, p[1]); }
        const padV = 0.3 / 4, padU = 0.3 / (6.2831853 * (2 + 4 * 0.5 * (v0 + v1)));
        T.rect = [Math.max(0, u0 - padU), Math.max(0, v0 - padV), 0, 0]; T.rect[2] = Math.min(1, u1 + padU) - T.rect[0]; T.rect[3] = Math.min(1, v1 + padV) - T.rect[1];
        if (T.full) { T.rect[0] = 0; T.rect[2] = 1; }
        // region texels are SQUARE in tissue mm (τ = 3 µm): the atlas' own texels are ≈ 8 × 4 µm out here, and an isotropic mip
        // chain on anisotropic texels blurs twice as much across the radial fibres as along them
        const [AW, AH] = E.ATLAS, rOut = 2 + 4 * (T.rect[1] + T.rect[3]), maxW = T.maxW || 6144;
        const tau = Math.max(T.tau || 0.003, T.rect[2] * 6.2831853 * rOut / maxW);      // a full circle at 3 µm would be 12 k texels wide: τ grows to fit (≈ 6 µm); zoom = a windowed re-bake
        T.size = [Math.ceil(T.rect[2] * 6.2831853 * rOut / tau), Math.ceil(T.rect[3] * 4 / tau)]; T.tauUsed = tau;
        T.lodBias = Math.log2((4 / AH) / tau);                     // the photo shader's lod counts atlas texels (4 mm / ATLAS_H out here)
        // outlines: counter-clockwise in tissue mm = hole on the left; islands the other way round
        for (const o of sets.outlines) { const ccw = mmArea(o.uv) > 0; if (ccw === !!o.island) { o.uv.reverse(); o.rim = o.rim.slice().reverse(); o.xy = o.xy.slice().reverse(); } }
        T.sets = sets; T.cells = cells; T.deckH = undefined; T.origin = null;   // a new eye is a new origin
        say(`loaded ${json.ref}: ${tot - lost}/${tot} points on the iris · region u ${T.rect[0].toFixed(4)}+${T.rect[2].toFixed(4)} v ${T.rect[1].toFixed(3)}+${T.rect[3].toFixed(3)} → ${T.size[0]}×${T.size[1]} texels (τ ${(T.tauUsed * 1000).toFixed(1)} µm${T.full ? ', full circle' : ''})`);
        return T;
    };

    function cellTexture(key, withAlbedo) {
        // scatter the 0.1 mm material cells into a small grid over the region (bilinear splat, normalised, holes filled from neighbours)
        const mmW = T.rect[2] * 6.2831853 * (2 + 4 * (T.rect[1] + 0.5 * T.rect[3])), mmH = T.rect[3] * 4;
        const gw = Math.max(4, Math.round(mmW / 0.1)), gh = Math.max(4, Math.round(mmH / 0.1)), acc = new Float32Array(gw * gh * 4);
        T.cells.uv.forEach((p, i) => {
            if (!p) return; const col = withAlbedo ? toAlbedo(T.cells[key][i], T.cells.xy[i][0], T.cells.xy[i][1]) : T.cells[key][i];
            const fx = (p[0] - T.rect[0]) / T.rect[2] * gw - 0.5, fy = (p[1] - T.rect[1]) / T.rect[3] * gh - 0.5, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
            for (let dj = 0; dj <= 1; dj++) for (let di = 0; di <= 1; di++) { let x = ix + di; const y = iy + dj; if (T.full) x = (x + gw) % gw; if (x < 0 || y < 0 || x >= gw || y >= gh) continue; const w = (di ? tx : 1 - tx) * (dj ? ty : 1 - ty), o = (y * gw + x) * 4; acc[o] += w * col[0]; acc[o + 1] += w * col[1]; acc[o + 2] += w * col[2]; acc[o + 3] += w; }
        });
        const out = new Float32Array(gw * gh * 4), known = new Uint8Array(gw * gh);
        for (let c = 0; c < gw * gh; c++) if (acc[c * 4 + 3] > 0.15) { known[c] = 1; for (let t = 0; t < 3; t++) out[c * 4 + t] = acc[c * 4 + t] / acc[c * 4 + 3]; out[c * 4 + 3] = 1; }
        for (let pass = 0; pass < gw + gh; pass++) {      // colour flows outward so the mask edge has material under it; alpha stays 0 there
            const nk = new Uint8Array(known); let any = false;
            for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { const c = y * gw + x; if (known[c]) continue; let n = 0; const s = [0, 0, 0];
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { let xx = x + dx; const yy = y + dy; if (T.full) xx = (xx + gw) % gw; if (xx < 0 || yy < 0 || xx >= gw || yy >= gh) continue; const q = yy * gw + xx; if (known[q]) { n++; for (let t = 0; t < 3; t++) s[t] += out[q * 4 + t]; } }
                if (n) { for (let t = 0; t < 3; t++) out[c * 4 + t] = s[t] / n; nk[c] = 1; any = true; } }
            known.set(nk); if (!any) break;
        }
        return texture(gw, gh, false, out);
    }

    // the deck's thickness: how far the tallest tubes stand above the floor (p98 of centre + radius over every fibre
    // sample). The hole's floor is dropped by this, so the deck fills the hole instead of standing out of it.
    // Z1/Z3 (§32). The deck's height is anatomical and fully rendered, its cross-fibre shading comes from that
    // geometry rather than from paint, and the RELIEF's hole wall is 2.5× the colour's. The three go together.
    // Whole iris of ref 26 at NORMAL, each row calibrated with its own geometry — MATCH2 / MATCH / grad / cellDab / strandCorr:
    //   deckZ 0                     (v0.8 flat)  82.92 / 89.72 / 0.717 / 2.83 / 0.527
    //   deckZ 0.5, geometric, 2.5×               84.63 / 90.68 / 0.748 / 2.75 / 0.484
    //   deckZ 1,   geometric, 1×    (sharp wall) 83.72 / 90.98 / 0.722 / 2.65 / 0.358
    //   deckZ 1,   geometric, 2.5×               85.34 / 91.58 / 0.753 / 2.65 / 0.414   ← here
    //   deckZ 1,   painted,   2.5×               85.69 / 91.80 / 0.759 / 2.63 / 0.429
    //   deckZ 1.5, geometric, 2.5×               84.55 / 91.72 / 0.729 / 2.60 / 0.365
    // Full anatomical height is the best setting, but only once the wall is soft: a 278 µm drop over a 37 µm wall is
    // an 82° cliff, and §30.1 says what a cliff does under a coaxial key (1× costs 1.6 MATCH2). Keeping the PAINTED
    // cross-fibre shading is worth a further 0.35 MATCH2, and it is deliberately not taken: paint does not re-light,
    // and a probe looking along the surface would carry a cosine baked for a camera that is no longer there.
    // strandCorr is what relief costs (0.527 → 0.414) and it is still open. Dials: deckZ 0 is exactly v0.8 (calibrate
    // with it set, not after), delight 0 restores the paint, wallZ overrides the relief wall.
    T.deckZ = 1;                                  // 0 = the flat v0.8 relief · 1 = the anatomy as inferred
    T.delight = 1;                                // 1 = the geometry's own cross-fibre shading · 0 = the painted one
    T.wallZ = undefined;                          // the relief's hole wall; default 2.5 × the colour wall (set in bake)
    function deckThickness() {
        if (T.deckH !== undefined) return T.deckH;
        const rK = (T.src.z || {}).rK || 1.4, top = [];
        for (const c of (T.sets.fibres || [])) if (c.z) for (let i = 0; i < c.z.length; i++) top.push(c.z[i] + rK * c.w[i]);
        top.sort((a, b) => a - b);
        return (T.deckH = top.length ? top[Math.floor(0.98 * (top.length - 1))] : 0);
    }

    // ---------------------------------------------------------------- bake the region
    T.bake = function (opts = {}) {
        const pr = programs(), [w, h] = T.size, mm = T.src.mm, grey = opts.grey || 0;
        const [AW0, AH0] = E.ATLAS;
        if (!T.origin || T.origin.atlas[0] !== AW0 || T.origin.atlas[1] !== AH0) T.setOrigin();   // outside any draw, where it is safe
        const alb = (c, i) => { const a = grey ? c.rgb[i] : toAlbedo(c.rgb[i], c.xy[i][0], c.xy[i][1]); return [a[0], a[1], a[2], c.z ? c.z[i] : 0]; };   // .a = Z1: the tube's centre height above its floor, mm
        const chroma = (c, i) => { const a = grey ? c.rgb[i] : toAlbedo(c.rgb[i].map(q => q * 0.25), c.xy[i][0], c.xy[i][1]); return [a[0], a[1], a[2], rel(c, i)]; };
        // a relative payload is converted through the camera: albedo(base × ratio) / albedo(base), in luminance
        const lumA = (Y, c, i) => { const a = toAlbedo([Y, Y, Y], c.xy[i][0], c.xy[i][1]); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; };
        const rel = (c, i) => (grey || !c.base) ? c.val[i] : Math.min(4, Math.max(0.05, lumA(c.base[i] * c.val[i], c, i) / Math.max(1e-4, lumA(c.base[i], c, i))));
        const val = (c, i) => [rel(c, i), 0, 0, 1], rimv = (c, i) => [c.rim[i], 0, 0, 1];
        const spec = { fibres: [alb, 0.20, false], veins: [val, 0.05, false], guides: [chroma, 0.12, false], sfib: [val, 0.05, false], svein: [val, 0.05, false], outlines: [rimv, 0.55, true] };
        if (!T.fb) { T.fb = gl.createFramebuffer(); T.depth = gl.createRenderbuffer(); }
        gl.bindRenderbuffer(gl.RENDERBUFFER, T.depth); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
        for (const k in (T.tex || {})) { gl.deleteTexture(T.tex[k][0]); gl.deleteTexture(T.tex[k][1]); } T.tex = {};
        gl.bindFramebuffer(gl.FRAMEBUFFER, T.fb); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, T.depth);
        gl.viewport(0, 0, w, h); gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true);
        gl.useProgram(pr.curve); gl.uniform4f(pr.curve.loc('u_rect'), T.rect[0], T.rect[1], T.rect[2], T.rect[3]);
        for (const k in spec) {
            const [valueOf, R, closed] = spec[k], a = texture(w, h), b = texture(w, h); T.tex[k] = [a, b];
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, a, 0); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, b, 0);
            gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
            gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]); gl.clearBufferfv(gl.COLOR, 1, [R, 0, -1, 0]); gl.clearBufferfv(gl.DEPTH, 0, [1]);
            const g = buildSet(T.sets[k], valueOf, closed, R); gl.uniform1f(pr.curve.loc('u_R'), R); T.segs = (T.segs || 0) + g.count / 6;
            gl.bindVertexArray(g.vao); gl.drawArrays(gl.TRIANGLES, 0, g.count); gl.bindVertexArray(null);
            gl.deleteBuffer(g.buf); gl.deleteVertexArray(g.vao);
        }
        gl.disable(gl.DEPTH_TEST);
        {   // winding fill of the outlines
            const tris = [];
            for (const o of T.sets.outlines) {
                const pts = []; let prev = null;
                for (const q of o.uv) { if (!q) continue; let u = q[0]; if (prev !== null) { while (u - prev > 0.5) u -= 1; while (prev - u > 0.5) u += 1; } prev = u; pts.push([u, q[1]]); }
                if (pts.length < 3) continue; let cu = 0, cv = 0; for (const q of pts) { cu += q[0]; cv += q[1]; } cu /= pts.length; cv /= pts.length;
                for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; tris.push(cu, cv, a[0], a[1], b[0], b[1]); }
            }
            if (T.fill) gl.deleteTexture(T.fill); T.fill = texture(w, h, false);
            gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, null);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, T.fill, 0); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, null, 0);
            gl.drawBuffers([gl.COLOR_ATTACHMENT0]); gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]);
            const vao = gl.createVertexArray(), buf = gl.createBuffer(); gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(tris), gl.STATIC_DRAW);
            gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
            gl.useProgram(pr.fill); gl.uniform4f(pr.fill.loc('u_rect'), T.rect[0], T.rect[1], T.rect[2], T.rect[3]);
            gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE); gl.disable(gl.CULL_FACE);
            for (const sh of (T.full ? [-1, 0, 1] : [0])) { gl.uniform1f(pr.fill.loc('u_shift'), sh); gl.drawArrays(gl.TRIANGLES, 0, tris.length / 2); }
            gl.disable(gl.BLEND); gl.bindVertexArray(null); gl.bindBuffer(gl.ARRAY_BUFFER, null); gl.deleteBuffer(buf); gl.deleteVertexArray(vao);
        }
        // compose → the region's albedo and relief
        for (const t of [T.albedo, T.aux, T.cellS, T.cellG]) if (t) gl.deleteTexture(t);
        T.albedo = texture(w, h, true); T.aux = texture(w, h, true); T.cellS = cellTexture('sheet', !grey); T.cellG = cellTexture('ground', !grey);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, null);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, T.albedo, 0); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, T.aux, 0);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]); gl.viewport(0, 0, w, h);
        const c = pr.compose; gl.useProgram(c); let unit = 0;
        const bindT = (name, t) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(c.loc(name), unit); unit++; };
        bindT('u_fibA', T.tex.fibres[0]); bindT('u_fibB', T.tex.fibres[1]); bindT('u_veinA', T.tex.veins[0]); bindT('u_veinB', T.tex.veins[1]);
        bindT('u_guideA', T.tex.guides[0]); bindT('u_guideB', T.tex.guides[1]); bindT('u_sfA', T.tex.sfib[0]); bindT('u_sfB', T.tex.sfib[1]);
        bindT('u_svA', T.tex.svein[0]); bindT('u_svB', T.tex.svein[1]); bindT('u_outA', T.tex.outlines[0]); bindT('u_outB', T.tex.outlines[1]);
        bindT('u_cellS', T.cellS); bindT('u_cellG', T.cellG); bindT('u_fill', T.fill);
        gl.uniform4f(c.loc('u_rect'), T.rect[0], T.rect[1], T.rect[2], T.rect[3]); gl.uniform2f(c.loc('u_size'), w, h);
        const rim = grey ? [grey, grey, grey] : toAlbedo(T.src.rimRGB, T.cells.xy[0][0], T.cells.xy[0][1]); gl.uniform3f(c.loc('u_rimRGB'), rim[0], rim[1], rim[2]);
        gl.uniform1f(c.loc('u_grey'), grey); gl.uniform1f(c.loc('u_wall'), mm.wall); gl.uniform1f(c.loc('u_rimW'), mm.rimW); gl.uniform1f(c.loc('u_rimOff'), mm.rimOff);
        gl.uniform1f(c.loc('u_pit0'), mm.pit[0]); gl.uniform1f(c.loc('u_pit1'), mm.pit[1]); gl.uniform1f(c.loc('u_depth'), opts.depth === undefined ? mm.depth : opts.depth);
        const zm = T.src.z || {}, dz = T.deckZ === undefined ? 1 : T.deckZ;
        gl.uniform1f(c.loc('u_fibRK'), zm.rK || 1.4); gl.uniform1f(c.loc('u_deckZ'), dz); gl.uniform1f(c.loc('u_deckH'), deckThickness() * dz);
        gl.uniform1f(c.loc('u_delight'), T.delight === undefined ? 0 : T.delight);
        gl.uniform1f(c.loc('u_wallZ'), T.wallZ === undefined ? 2.5 * mm.wall : T.wallZ);
        // the engine's fullscreen quad lives on attribute 0 of the default vertex array
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        for (const t of [T.albedo, T.aux]) { gl.bindTexture(gl.TEXTURE_2D, t); gl.generateMipmap(gl.TEXTURE_2D); }
        for (const k in T.tex) { gl.deleteTexture(T.tex[k][0]); gl.deleteTexture(T.tex[k][1]); } T.tex = {};       // twelve region-sized targets: keep only the result
        gl.activeTexture(gl.TEXTURE0); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.drawBuffers([gl.BACK]); gl.viewport(0, 0, E.canvas.width, E.canvas.height);
        T.depthUsed = opts.depth === undefined ? mm.depth : opts.depth;
        E.resetAccumulation && E.resetAccumulation();
        return T;
    };

    // ---------------------------------------------------------------- Z2 (§32): inspection — the engine's side
    // No panel here: this is the API the UI session's panel is built on. The section reads the PRIMITIVES, not the
    // baked surface, so it sees a tube that lies under another tube — which a height field cannot tell you.
    const MMU = v => 6.2831853 * (2 + 4 * v), MMV = 4;          // mm per unit u at radius v · mm per unit v
    // the floor the renderer actually draws, mm below the sheet: the hole's own wall plus as much of the deck's
    // thickness as deckZ is currently rendering (the anatomy is always the full T.deckH)
    const floorMm = () => -((T.src.mm.depth || 0) + (T.deckH || 0) * (T.deckZ === undefined ? 1 : T.deckZ));
    const renderedMm = zMm => floorMm() + zMm * (T.deckZ === undefined ? 1 : T.deckZ);
    function fibreIndex() {                                      // fibre samples bucketed in uv, built once per eye
        if (T.fidx && T.fidx.sets === T.sets) return T.fidx;
        const cell = 0.02, grid = new Map();                     // 0.02 in v ≈ 80 µm
        const put = (u, v, rec) => { const k = Math.floor(u / cell) + ':' + Math.floor(v / cell); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(rec); };
        const fib = T.sets.fibres || [];
        for (let i = 0; i < fib.length; i++) { const c = fib[i], uv = c.uv;
            for (let j = 0; j < uv.length - 1; j++) { const a = uv[j], b = uv[j + 1]; if (!a || !b) continue;
                const rec = [i, j]; put(a[0], a[1], rec); if (Math.floor(b[0] / cell) !== Math.floor(a[0] / cell) || Math.floor(b[1] / cell) !== Math.floor(a[1] / cell)) put(b[0], b[1], rec); } }
        return (T.fidx = { sets: T.sets, cell, grid });
    }
    /** every tube covering (u, v): distance to the centreline in mm, and the tube's section there. Anatomical mm. */
    T.tubesAt = function (u, v) {
        const ix = fibreIndex(), cell = ix.cell, rK = (T.src.z || {}).rK || 1.4, fib = T.sets.fibres || [], out = [];
        const su = MMU(v), seen = new Set();
        for (let du = -1; du <= 1; du++) for (let dv = -1; dv <= 1; dv++) {
            const a = ix.grid.get((Math.floor(u / cell) + du) + ':' + (Math.floor(v / cell) + dv)); if (!a) continue;
            for (const [i, j] of a) {
                const key = i * 65536 + j; if (seen.has(key)) continue; seen.add(key);
                const c = fib[i], p = c.uv[j], q = c.uv[j + 1]; if (!p || !q) continue;
                let qu = q[0]; while (qu - p[0] > 0.5) qu -= 1; while (p[0] - qu > 0.5) qu += 1;
                let pu = u; while (pu - p[0] > 0.5) pu -= 1; while (p[0] - pu > 0.5) pu += 1;
                const ax = 0, ay = 0, bx = (qu - p[0]) * su, by = (q[1] - p[1]) * MMV, px = (pu - p[0]) * su, py = (v - p[1]) * MMV;
                const L2 = bx * bx + by * by, t = L2 > 1e-12 ? Math.max(0, Math.min(1, (px * bx + py * by) / L2)) : 0;
                const d = Math.hypot(px - bx * t, py - by * t);
                const r = (c.r ? c.r[j] + t * (c.r[j + 1] - c.r[j]) : rK * (c.w[j] + t * (c.w[j + 1] - c.w[j])));
                if (d >= r) continue;
                const z = c.z ? c.z[j] + t * (c.z[j + 1] - c.z[j]) : r, dome = Math.sqrt(Math.max(0, r * r - d * d));
                out.push({ fibre: i, seg: j, t: +t.toFixed(3), dMm: d, rMm: r, zMm: z, topMm: z + dome, bottomMm: z - dome,
                           conf: c.zc ? +(c.zc[j] + t * (c.zc[j + 1] - c.zc[j])).toFixed(3) : null });
            }
        }
        // one entry per FIBRE, not per segment: a tube is wide enough that several of its own segments cover the
        // same texel, and reporting each of them would call one strand six layers
        const byFibre = new Map();
        for (const q of out) { const p = byFibre.get(q.fibre); if (!p || q.dMm < p.dMm) byFibre.set(q.fibre, q); }
        return [...byFibre.values()].sort((a, b) => b.topMm - a.topMm);   // nearest the camera first
    };
    // the baked surface (mm relative to the sheet, negative = below) over a rect of the region, read back once
    function auxRead(u0, v0, u1, v1) {
        const [w, h] = T.size, R = T.rect;
        const px = q => Math.max(0, Math.min(w - 1, Math.round((q - R[0]) / R[2] * w))), py = q => Math.max(0, Math.min(h - 1, Math.round((q - R[1]) / R[3] * h)));
        const x0 = px(Math.min(u0, u1)), x1 = px(Math.max(u0, u1)), y0 = py(Math.min(v0, v1)), y1 = py(Math.max(v0, v1));
        const bw = Math.max(1, x1 - x0 + 1), bh = Math.max(1, y1 - y0 + 1);
        if (!T.rfb) T.rfb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, T.rfb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, T.aux, 0);
        const buf = new Float32Array(bw * bh * 4); gl.readPixels(x0, y0, bw, bh, gl.RGBA, gl.FLOAT, buf);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return { buf, x0, y0, bw, bh, at: (u, v) => { const x = px(u) - x0, y = py(v) - y0; if (x < 0 || y < 0 || x >= bw || y >= bh) return null; const o = (y * bw + x) * 4; return { surfaceMm: buf[o], maskA: buf[o + 3] }; } };
    };
    /** Everything under one point of the fit image. x, y in fit pixels (fit.W × fit.H). */
    T.elevationAt = function (x, y) {
        const fit = F.fit, map = F.getMap(), uv = uvAt(map, fit.W, fit.H, x, y);
        if (!uv) return { inside: false };
        const inRegion = uv[0] > T.rect[0] && uv[0] < T.rect[0] + T.rect[2] && uv[1] > T.rect[1] && uv[1] < T.rect[1] + T.rect[3];
        const a = inRegion && T.aux ? auxRead(uv[0], uv[1], uv[0], uv[1]).at(uv[0], uv[1]) : null;
        const tubes = inRegion ? T.tubesAt(uv[0], uv[1]) : [];
        return { inside: true, inRegion, uv, rMm: 2 + 4 * uv[1],
                 surfaceUm: a ? +(a.surfaceMm * 1000).toFixed(1) : null, tissue: a ? +a.maskA.toFixed(3) : 0,
                 floorUm: inRegion ? +(floorMm() * 1000).toFixed(1) : null, deckThicknessUm: +((T.deckH || 0) * 1000).toFixed(1),
                 deckZ: T.deckZ, layers: tubes.length,
                 tubes: tubes.map(t => ({ fibre: t.fibre, zUm: +(t.zMm * 1000).toFixed(1), rUm: +(t.rMm * 1000).toFixed(1),
                                          topUm: +(t.topMm * 1000).toFixed(1), bottomUm: +(t.bottomMm * 1000).toFixed(1),
                                          offAxisUm: +(t.dMm * 1000).toFixed(1), conf: t.conf,
                                          renderedTopUm: +(renderedMm(t.topMm) * 1000).toFixed(1) })) };
    };
    /** A cross-section along a line in fit pixels: the surface, and every tube cut through, as circles. */
    T.section = function (p0, p1, n) {
        const fit = F.fit, map = F.getMap(); n = n || 200;
        const pts = [], uvs = [];
        for (let i = 0; i < n; i++) { const t = i / (n - 1), x = p0[0] + t * (p1[0] - p0[0]), y = p0[1] + t * (p1[1] - p0[1]);
            const uv = uvAt(map, fit.W, fit.H, x, y); pts.push({ t, x, y, uv }); if (uv) uvs.push(uv); }
        if (!uvs.length || !T.aux) return { samples: [], mm: 0 };
        const u0 = Math.min(...uvs.map(q => q[0])), u1 = Math.max(...uvs.map(q => q[0]));
        const v0 = Math.min(...uvs.map(q => q[1])), v1 = Math.max(...uvs.map(q => q[1]));
        const A = auxRead(u0, v0, u1, v1);
        // arclength in tissue mm along the cut
        let s = 0; const samples = [];
        for (let i = 0; i < pts.length; i++) {
            const p = pts[i], prev = i ? pts[i - 1] : null;
            if (prev && p.uv && prev.uv) { let du = p.uv[0] - prev.uv[0]; if (du > 0.5) du -= 1; if (du < -0.5) du += 1;
                s += Math.hypot(du * MMU(p.uv[1]), (p.uv[1] - prev.uv[1]) * MMV); }
            if (!p.uv) { samples.push({ sMm: +s.toFixed(4), off: true }); continue; }
            const a = A.at(p.uv[0], p.uv[1]), tubes = T.tubesAt(p.uv[0], p.uv[1]);
            samples.push({ sMm: +s.toFixed(4), xy: [Math.round(p.x), Math.round(p.y)], uv: p.uv,
                           surfaceUm: a ? +(a.surfaceMm * 1000).toFixed(1) : null, tissue: a ? +a.maskA.toFixed(3) : 0,
                           tubes: tubes.map(q => ({ fibre: q.fibre, zUm: +(q.zMm * 1000).toFixed(1), rUm: +(q.rMm * 1000).toFixed(1),
                                                    topUm: +(q.topMm * 1000).toFixed(1), bottomUm: +(q.bottomMm * 1000).toFixed(1),
                                                    offAxisUm: +(q.dMm * 1000).toFixed(1), renderedTopUm: +(renderedMm(q.topMm) * 1000).toFixed(1) })) });
        }
        const deep = samples.filter(q => q.tubes && q.tubes.length > 1).length;
        return { mm: +s.toFixed(4), n, floorUm: +(floorMm() * 1000).toFixed(1), deckThicknessUm: +((T.deckH || 0) * 1000).toFixed(1),
                 deckZ: T.deckZ, overlapped: deep, samples };
    };
    /** The baked surface over a rect of the region as a Float32Array in µm — for contour drawing. */
    T.heightField = function (opts = {}) {
        const R = opts.rect || T.rect, A = auxRead(R[0], R[1], R[0] + R[2], R[1] + R[3]);
        const out = new Float32Array(A.bw * A.bh);
        for (let i = 0; i < out.length; i++) out[i] = A.buf[i * 4] * 1000;
        return { um: out, w: A.bw, h: A.bh, rect: R, tauUm: (T.tauUsed || 0) * 1000 };
    };

    // ---------------------------------------------------------------- T2a (§32): the windowed re-bake
    // The base bake spreads one texel budget over the whole iris: a full circle at 3 µm would be 12 k texels wide, so
    // τ grows to ≈ 5.7 µm and that is the finest the model can be seen at. Zooming past it magnifies texels, not
    // tissue. The same primitives can be re-baked over just the part of the eye on screen, at whatever τ that part
    // deserves — the window is a DETAIL layer, the base still answers everywhere outside it, so the eye stays whole.
    const MAXW = 4096;
    /** Re-bake `rect` (tissue u, v) at `tau` mm per texel. Leaves the base bake alone. */
    T.bakeWindow = function (rect, opts = {}) {
        if (!T.sets) throw new Error('tissue: nothing loaded');
        const r = [Math.max(0, rect[0]), Math.max(0, rect[1]), rect[2], rect[3]];
        r[2] = Math.min(1 - r[0], r[2]); r[3] = Math.min(1 - r[1], r[3]);
        const rOut = 2 + 4 * (r[1] + r[3]);
        const wantTau = opts.tau || Math.max(0.0012, T.tauUsed / 4);
        const tau = Math.max(wantTau, r[2] * 6.2831853 * rOut / MAXW, r[3] * 4 / MAXW);
        const size = [Math.ceil(r[2] * 6.2831853 * rOut / tau), Math.ceil(r[3] * 4 / tau)];
        const [AW, AH] = E.ATLAS;
        const keep = { rect: T.rect, size: T.size, albedo: T.albedo, aux: T.aux, cellS: T.cellS, cellG: T.cellG,
                       fill: T.fill, lodBias: T.lodBias, tauUsed: T.tauUsed, full: T.full, fb: T.fb, depth: T.depth };
        const prev = T.win;
        T.albedo = T.aux = T.cellS = T.cellG = T.fill = null;   // bake() frees what it finds here; the base must not be in reach
        T.fb = null; T.depth = null;
        T.rect = r; T.size = size; T.full = false; T.tauUsed = tau;
        T.lodBias = Math.log2((4 / AH) / tau);
        let win = null;
        try {
            T.bake(opts);
            win = { albedo: T.albedo, aux: T.aux, rect: r, size, tau, lodBias: T.lodBias, cellS: T.cellS, cellG: T.cellG, fill: T.fill, fb: T.fb, depth: T.depth };
        } finally {
            Object.assign(T, keep);                             // the base is back, whatever happened
        }
        if (prev) for (const k of ['albedo', 'aux', 'cellS', 'cellG', 'fill']) if (prev[k]) gl.deleteTexture(prev[k]);
        if (prev && prev.fb) gl.deleteFramebuffer(prev.fb);
        if (prev && prev.depth) gl.deleteRenderbuffer(prev.depth);
        T.win = win;
        say(`window ${r[0].toFixed(4)}+${r[2].toFixed(4)} × ${r[1].toFixed(3)}+${r[3].toFixed(3)} → ${size[0]}×${size[1]} texels (τ ${(tau * 1000).toFixed(1)} µm, ${(T.tauUsed / tau).toFixed(1)}× the base)`);
        E.resetAccumulation && E.resetAccumulation();
        return win;
    };
    T.clearWindow = function () {
        const w = T.win; if (!w) return;
        for (const k of ['albedo', 'aux', 'cellS', 'cellG', 'fill']) if (w[k]) gl.deleteTexture(w[k]);
        if (w.fb) gl.deleteFramebuffer(w.fb); if (w.depth) gl.deleteRenderbuffer(w.depth);
        T.win = null; E.resetAccumulation && E.resetAccumulation();
    };
    /** The tissue rect the camera can currently see, from the engine's own coordinate map, padded. */
    T.viewRect = function (pad) {
        const fit = F.fit, map = F.getMap(), W = fit.W, H = fit.H;
        let u0 = 2, u1 = -1, v0 = 2, v1 = -1, n = 0, cs = 0, sn = 0;
        for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
            const k = y * W + x; if (!map.inside[k]) continue;
            const u = map.u[k], v = map.v[k]; n++;
            cs += Math.cos(6.2831853 * u); sn += Math.sin(6.2831853 * u);
            v0 = Math.min(v0, v); v1 = Math.max(v1, v);
        }
        if (!n) return null;
        const uc = (Math.atan2(sn, cs) / 6.2831853 + 1) % 1;    // the mean angle, so a window across the seam still makes sense
        let du = 0;
        for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
            const k = y * W + x; if (!map.inside[k]) continue;
            let d = map.u[k] - uc; while (d > 0.5) d -= 1; while (d < -0.5) d += 1;
            du = Math.max(du, Math.abs(d));
        }
        const p = pad === undefined ? 0.15 : pad;
        const w = Math.min(1, 2 * du * (1 + p)), h = Math.min(1, (v1 - v0) * (1 + p));
        return [uc - w / 2, Math.max(0, v0 - (v1 - v0) * p / 2), w, h];
    };
    /** Re-bake whatever the camera is looking at, if that is worth doing. Call it when the view settles. */
    T.refocus = function (opts = {}) {
        const r = T.viewRect(opts.pad);
        if (!r || r[2] >= 0.9) { T.clearWindow(); return null; }      // the whole circle: the base bake already is the window
        const gain = (T.win && Math.abs(T.win.rect[0] - r[0]) < 0.02 * r[2] && Math.abs(T.win.rect[2] - r[2]) < 0.05 * r[2]) ? 1 : 0;
        if (gain && !opts.force) return T.win;                         // already looking at it
        return T.bakeWindow(r, opts);
    };

    // ---------------------------------------------------------------- irradiance: what the engine's light does to a flat grey region
    T.calibrate = function () {
        // The renderer is affine in the albedo at a pixel: X = k(x)·A + s(x) — k the light (key, caustic, lid, ambient), s what it
        // adds regardless of the tissue colour (speculars). Two flat-grey renders through the real renderer give both; only their
        // smooth part (≈ 0.2 mm) is kept: light belongs to the engine, everything finer stays in the primitives.
        const fit = F.fit, W = fit.W, H = fit.H, map = F.getMap(), G = [0.06, 0.30]; T.irr = null; T.on = true;
        const inR = k => { if (!map.inside[k]) return false; const u = map.u[k], v = map.v[k]; return u > T.rect[0] && u < T.rect[0] + T.rect[2] && v > T.rect[1] && v < T.rect[1] + T.rect[3]; };
        const shots = G.map(g => { T.bake({ grey: g }); const px = F.renderFit(), x = new Float32Array(W * H * 3); for (let k = 0; k < W * H; k++) if (inR(k)) { const r = unpost([px[k * 4] / 255, px[k * 4 + 1] / 255, px[k * 4 + 2] / 255]); x[k * 3] = r[0]; x[k * 3 + 1] = r[1]; x[k * 3 + 2] = r[2]; } return x; });
        const acc = new Float32Array(W * H * 7);                                     // k rgb, s rgb, weight
        for (let k = 0; k < W * H; k++) if (inR(k)) for (let t = 0; t < 3; t++) { const kk = (shots[1][k * 3 + t] - shots[0][k * 3 + t]) / (G[1] - G[0]); acc[k * 7 + t] = kk; acc[k * 7 + 3 + t] = shots[0][k * 3 + t] - kk * G[0]; acc[k * 7 + 6] = 1; }
        const rad = Math.max(4, Math.round(0.2 * ((fit.limbus.rx + fit.limbus.ry) / 2 / 5.625) / 1.7)); let a = acc, b = new Float32Array(W * H * 7);
        for (let pass = 0; pass < 3; pass++) for (const horiz of [true, false]) {     // normalised box blur × 3 ≈ Gaussian
            b.fill(0); const n1 = horiz ? W : H, n2 = horiz ? H : W;
            for (let j = 0; j < n2; j++) { const sum = new Float64Array(7), at = i => (horiz ? j * W + i : i * W + j) * 7;
                for (let i = -rad; i < n1 + rad; i++) { const add = i + rad, sub = i - rad - 1; if (add >= 0 && add < n1) { const o = at(add); for (let t = 0; t < 7; t++) sum[t] += a[o + t]; } if (sub >= 0 && sub < n1) { const o = at(sub); for (let t = 0; t < 7; t++) sum[t] -= a[o + t]; } if (i >= 0 && i < n1) { const o = at(i); for (let t = 0; t < 7; t++) b[o + t] = sum[t]; } } }
            [a, b] = [b, a];
        }
        T.irr = a; const m = new Float64Array(6); let n = 0;
        for (let k = 0; k < W * H; k++) if (a[k * 7 + 6] > 1e-3 && inR(k)) { for (let t = 0; t < 6; t++) m[t] += a[k * 7 + t] / a[k * 7 + 6]; n++; }
        T.irrMean = Array.from(m, q => q / Math.max(1, n));
        T.irrAt = (x, y) => { const k = (Math.min(H - 1, Math.max(0, Math.round(y * H / T.src.fit[1]))) * W + Math.min(W - 1, Math.max(0, Math.round(x * W / T.src.fit[0])))) * 7, wgt = a[k + 6]; return wgt > 1e-3 ? [0, 1, 2, 3, 4, 5].map(t => a[k + t] / wgt) : T.irrMean; };
        say(`light on a flat region: gain k ${T.irrMean.slice(0, 3).map(q => q.toFixed(3)).join(' ')} · additive s ${T.irrMean.slice(3).map(q => q.toFixed(4)).join(' ')} (blur ${rad} px × 3)`);
        return T;
    };

    // the whole proof: primitives → region → calibrated albedo → on
    T.proof = async function (url) {
        const json = await fetch(url).then(r => r.json()); T.load(json); T.calibrate(); T.bake(); T.setOrigin(); T.on = true; say('tissue model on'); return T.log;
    };
})();
