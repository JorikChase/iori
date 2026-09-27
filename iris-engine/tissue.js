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
        uniform float u_R, u_top, u_rK;
        layout(location = 0) out vec4 o0; layout(location = 1) out vec4 o1;
        void main() {
            vec2 ab = v_b - v_a; float t = clamp(dot(v_q - v_a, ab) / max(dot(ab, ab), 1e-12), 0.0, 1.0);
            float d = length(v_q - (v_a + ab * t)); if (d > u_R) discard;
            gl_FragDepth = d / u_R;                                          // the nearest curve wins the texel
            // §5.2.5 the floating pass: the HIGHEST surface wins where tubes cover (a braid's children cross over and under
            // each other, and the nearest centreline would cut a seam across every crossing); beyond every tube, the nearest
            float r = u_rK * mix(v_w.x, v_w.y, t), dm = sqrt(max(0.0, r * r - d * d)), zc = mix(v_v0.a, v_v1.a, t);
            if (u_top > 1.5) { if (d >= r) discard; o0 = vec4(0.0); o1 = vec4(0.0, 0.0, zc - dm, 0.0); return; }   // the BOTTOM pass: MIN-blended into .b
            if (u_top > 0.5) gl_FragDepth = d < r ? clamp(0.25 - 0.2 * (zc + dm), 0.0, 0.499) : 0.5 + 0.5 * d / u_R;
            o0 = mix(v_v0, v_v1, t);
            o1 = vec4(d, mix(v_w.x, v_w.y, t), u_top > 0.5 ? 1e4 : ((ab.x * (v_q.y - v_a.y) - ab.y * (v_q.x - v_a.x)) >= 0.0 ? 1.0 : -1.0), 1.0);
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
        uniform sampler2D u_fibA, u_fibB, u_veinA, u_veinB, u_guideA, u_guideB, u_sfA, u_sfB, u_svA, u_svB, u_flA, u_flB, u_outB, u_cellS, u_cellG, u_pack;   // §5.2.3: fill and the rim strength ride in u_pack (.b, .a) — compose is at the sampler limit — and the FLOATING pass (u_flA / u_flB) takes their units
        uniform vec4 u_rect; uniform vec2 u_size; uniform vec3 u_rimRGB; uniform float u_grey;
        uniform float u_wall, u_rimW, u_rimOff, u_pit0, u_pit1, u_depth, u_deckZ, u_deckH, u_fibRK, u_delight, u_wallZ, u_sheetZ, u_srelAmt, u_fibNoise, u_slabOn, u_layered, u_ablMm, u_under0, u_under1, u_lipMm, u_edgeMix;
        layout(location = 0) out vec4 o_alb; layout(location = 1) out vec4 o_aux; layout(location = 2) out vec4 o_slab; layout(location = 3) out vec4 o_slabAlb;
        const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
        float sstep(float a, float b, float x) { float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
        float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
        void main() {
            vec2 c = v_c, px = 1.0 / u_size;
            vec4 cs = texture(u_cellS, c), cg = texture(u_cellG, c);
            float mask = smoothstep(0.05, 0.6, cs.a);
            // sheet coverage and rim from the outlines (signed distance, + inside a hole)
            vec4 oB = texture(u_outB, c), pk = texture(u_pack, c); float sd = (pk.b > 0.5 ? 1.0 : -1.0) * oB.r;   // distance from the nearest outline, sign from the winding fill (packed)
            float cover = 1.0 - sstep(-u_wall, u_wall, sd);
            float rim = pk.a * exp(-pow((sd + u_rimOff) / u_rimW, 2.0)) * step(sd, 0.0093);
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
            // study/11 §5.2.2: the per-texel term. A fibre's payload is 1-D — one brightness per 20 µm along the centreline,
            // flat across the tube — and study/08 §7 showed a flat curve is no better than LIC: what a real strand carries is
            // texture ALONG and ACROSS its width (S0: local contrast std / mean 0.31–0.37). Seeded value noise in the tube's own
            // frame (the across direction is the gradient of the distance field, so the noise stretches along the tube),
            // inside the footprint only, u_fibNoise its amplitude; 0 leaves the picture as it was.
            vec2 mm = (u_rect.xy + c * u_rect.zw) * vec2(6.2831853 * (2.0 + 4.0 * (u_rect.y + c.y * u_rect.w)), 4.0);
            float fibTex = 1.0;
            if (u_fibNoise > 0.0) {
                vec2 gAcross = vec2(dFdx(fB.r), dFdy(fB.r)); float gLen = length(gAcross); vec2 nA = gLen > 1e-6 ? gAcross / gLen : vec2(0.0, 1.0), tA = vec2(-nA.y, nA.x);
                vec2 q = vec2(dot(mm, tA) / 0.060, dot(mm, nA) / 0.014);       // a 60 µm grain along, 14 µm across
                float n = 0.6 * vnoise(q) + 0.4 * vnoise(q * 2.3 + 5.7) - 0.5;
                fibTex = 1.0 + u_fibNoise * 2.0 * n * (1.0 - sstep(0.8 * u_fibRK * fB.g, 1.4 * u_fibRK * fB.g, fB.r));
            }
            vec3 hole = mix(cg.rgb, fib * roundness * fibTex * (1.0 - vein), prof);
            // sheet: material cells × guides (relative brightness, own colour) × fine streaks and veins × seeded matte grain
            vec4 gA = texture(u_guideA, c), gB = texture(u_guideB, c), sfB = texture(u_sfB, c), svB = texture(u_svB, c);
            float mod_ = 1.0 + (gA.a - 1.0) * exp(-0.5 * pow(gB.r / max(0.55 * gB.g, 0.0093), 2.0)) * gB.a;
            mod_ *= 1.0 + (max(texture(u_sfA, c).r, 1.0) - 1.0) * exp(-0.5 * pow(sfB.r / max(sfB.g, 0.0056), 2.0)) * sfB.a;
            mod_ *= 1.0 - (1.0 - min(texture(u_svA, c).r, 1.0)) * exp(-0.5 * pow(svB.r / max(svB.g, 0.0056), 2.0)) * svB.a;
            float gmix = 0.85 * exp(-0.5 * pow(gB.r / max(0.9 * gB.g, 0.014), 2.0)) * gB.a;
            float sY = dot(cs.rgb, LUMA);
            vec3 sheetC = (cs.rgb / max(sY, 1e-5) * (1.0 - gmix) + gA.rgb / max(dot(gA.rgb, LUMA), 1e-5) * gmix) * sY;
            float grain = 1.0 + 0.055 * 3.4 * (0.5 * vnoise(mm / 0.008) + 0.5 * vnoise(mm / 0.017 + 7.3) - 0.5);
            vec3 sheet = mix(sheetC, u_rimRGB, rim) * mod_ * grain;
            vec3 lin = mix(hole, sheet, cover);
            // Z3b (§32): de-light by MEASUREMENT. calibrate() measures the light on a flat region and keeps only its
            // smooth part — but the relief the model now has makes light at the FINE scale too, and that light is not
            // in the primitives' measurement, so the renderer applies it a second time on top of an albedo that was
            // read out of the photo with it already in. u_srel is that fine part, measured by rendering this very
            // region flat-grey with the relief on and with it off and dividing: what the geometry does to the light,
            // according to the renderer itself rather than to an assumed cosine, which was tried and is 3x too strong.
            if (u_srelAmt > 0.0) lin /= mix(1.0, clamp(texture(u_pack, c).g, 0.45, 2.2), u_srelAmt);
            if (u_grey > 0.0) lin = vec3(u_grey);                           // calibration: flat grey albedo, the relief stays
            o_alb = vec4(lin, mask);
            // Z1 (§32): the deck has height. Every fibre is a tube of radius rK·w whose centre sits z above the floor
            // of its hole (radius measured, weave inferred — tools/layer_proof.py), so the surface inside a hole is
            // the floor plus the dome of the nearest tube. The floor drops by the deck's own thickness so the tallest
            // tubes come up level with the underside of the sheet instead of standing proud of it.
            float rr = u_fibRK * fB.g;
            float dome = sqrt(max(0.0, rr * rr - fB.r * fB.r));
            // Beyond the tube the ground has to come back DOWN. Without this the height is the nearest fibre's centre
            // height right across its Voronoi cell, so the deck renders as mesas with cliffs along the cell walls —
            // invisible head-on, glaring the moment the probe stands on it. The tube keeps its dome; a tube-width out,
            // the surface is the floor again.
            float fall = 1.0 - sstep(rr, 2.0 * rr, fB.r);
            float zDeck = (texture(u_fibA, c).a + dome) * fall * u_deckZ * prof;
            // the RELIEF's wall may be wider than the colour's: the colour edge of a hole is sharp in the photo, but
            // a 100 µm drop over a 23 µm wall is an 80° cliff, and §30.1 warns what a cliff does under a coaxial key
            float coverZ = 1.0 - sstep(-u_wallZ, u_wallZ, sd);
            // On the SHEET the layer model has nothing to say about height: it carries no furrows and no micro-relief,
            // and writing 0 there left 75.6 % of the iris at exactly 0.000 µm — a flat table, where the legacy atlas
            // has no texel at exactly zero and a 109 µm spread. The region's own (u, v) is the atlas's, so the old
            // height field can be read straight off it here, and then EVERY reader — the front view, the probe, the
            // section — is looking at one surface. A stand-in until the sheet's relief is primitives (T1, G).
            float sheetH = pk.r * u_sheetZ;
            o_aux = vec4(mix(-u_depth - u_deckH + zDeck, sheetH, coverZ), coverZ, 0.0, mask);
            // §5.2.3 the bridge layer: the FLOATING strands (their bottom clear of the floor) are not part of the ground —
            // they are a SLAB above it: top and bottom height (the same units as o_aux.r), coverage, and their own albedo.
            // The photo shader's view ray and shadow ray test the slab before the ground, so a bridge shows the floor
            // beneath it and drops its own shadow. One slab at NORMAL; the count is the quality's to raise.
            vec4 flA = texture(u_flA, c), flB = texture(u_flB, c);
            float frr = u_fibRK * flB.g, fdome = sqrt(max(0.0, frr * frr - flB.r * flB.r));
            float fcov = (flB.a > 0.5 && flB.r < frr) ? 1.0 : 0.0;
            float fround = mix(0.78 + 0.22 * sqrt(clamp(1.0 - pow(flB.r / max(frr, 0.014), 2.0), 0.0, 1.0)), 1.0, u_delight);
            float fbase = -u_depth - u_deckH;
            // .a marks where the slab's TOP is defined for the normal: out to twice the tube radius, flat at the centre height
            // beyond the dome — without it the normal at a bridge's rim read the ground ~70 µm below and drew a false cliff
            float fdef = (flB.a > 0.5 && flB.r < 2.0 * frr) ? 1.0 : 0.0;
            float fbot = flB.b < 1e3 ? min(flB.b, flA.a - fdome) : flA.a - fdome;   // §5.2.5: the lowest bottom of every floating tube here (the bottom pass)
            o_slab = vec4(fbase + (flA.a + fdome) * u_deckZ, fbase + fbot * u_deckZ, fcov * u_slabOn, fdef * u_slabOn);
            // the slab's colour goes through the ground's own chain (iori: "the colour should be the same as the fitted layer
            // underneath"): the same small blur of the payload, and the same measured fine-scale de-light, so a floating strand
            // is not shaded twice — once in the photograph its colour was read from, and again by the renderer's own light
            vec3 flC = vec3(0.0); float fw = 0.0;
            for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec4 q = texture(u_flA, c + vec2(float(i), float(j)) * px * 2.5); if (texture(u_flB, c + vec2(float(i), float(j)) * px * 2.5).a < 0.5) continue; float w = (i == 0 ? 2.0 : 1.0) * (j == 0 ? 2.0 : 1.0); flC += w * q.rgb; fw += w; }
            flC = fw > 0.0 ? flC / fw : flA.rgb;
            vec3 slabC = flC * fround;
            if (u_srelAmt > 0.0) slabC /= mix(1.0, clamp(pk.g, 0.45, 2.2), u_srelAmt);
            if (u_grey > 0.0) slabC = vec3(u_grey);
            o_slabAlb = vec4(slabC, fcov * u_slabOn);
            // §5.4 L0 the LAYERED stroma: no walls. The ground is the BASE — the floor with the strands resting on it, continued
            // under the sheet — and the sheet is the ABL, a SHELL u_ablMm thick whose holes are the crypts; the slab carries it.
            // Under the shell the base stays down for u_under0 past the hole's edge (the undercut: the loose stroma a crypt opens
            // into) and rises to just under the shell over u_under1, so a band of the ABL narrower than twice the undercut spans a
            // valley. The shell thins to nothing at its edge (the ABL ends; its lip catches the light). Floating strands are not
            // in the slab here — they are traced (the probe's segment list).
            if (u_layered > 0.5) {
                float sh = cover > 0.5 ? 1.0 : 0.0;
                // the lip: a half-round edge of the shell's own thickness — full within half a thickness of the edge, then round
                // (both corners rounded by u_lipMm; between them the edge is a face, seen edge-on from the front)
                float rl = min(u_lipMm, 0.5 * u_ablMm), lx = clamp(-sd, 0.0, rl), hr = sqrt(max(0.0, rl * rl - (rl - lx) * (rl - lx)));
                float ablTop = sheetH - rl + hr, ablBot = sheetH - u_ablMm + rl - hr;
                float rise = sstep(u_under0, u_under0 + u_under1, -sd);
                float baseZ = mix(-u_depth - u_deckH + zDeck, ablBot - 0.006, rise);
                // .r what the FRONT view marches: the base with the floating strands' tops on it (seen from above a strand hides what
                // is under it; the photo shader has no traced strands yet — L2); .g the base alone, for the probe, which traces them
                float fTop = fbase + (flA.a + fdome) * u_deckZ;
                o_aux = vec4(fcov > 0.5 ? max(baseZ, fTop) : baseZ, baseZ, 0.0, mask);
                // colour at the edge as soft as the ground's was (the colour wall ± u_wall): the shell takes the mixed colour, the base
                // just outside it the outer half of the mix; under the shell the base keeps the hole's own colour
                vec3 bse = mix(hole, sheet, sd > 0.0 ? cover * u_edgeMix : 0.0); if (u_srelAmt > 0.0) bse /= mix(1.0, clamp(pk.g, 0.45, 2.2), u_srelAmt); if (u_grey > 0.0) bse = vec3(u_grey);
                o_alb = vec4(fcov > 0.5 && fTop > baseZ ? slabC : bse, mask);   // the base's own colour everywhere (under the shell too), through the same chain as lin; a floating strand's where it is on top
                vec3 abl = lin;                                              // lin: mix(hole, sheet, cover), de-lit and greyed above
                o_slab = vec4(ablTop, ablBot, sh, sd < 0.02 ? 1.0 : 0.0);   // .a: the top is DEFINED 20 µm past the edge, so the edge's normal does not read the base (no false cliff)
                o_slabAlb = vec4(abl, sh);
            }
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

    // compose is at the 16-sampler limit, so the two single-channel lookups it needs — the legacy height field and the
    // measured de-light — are packed into one region-sized texture first.
    const PACK_FS = `#version 300 es
        precision highp float;
        in vec2 v_c; uniform sampler2D u_ah, u_sr, u_fill, u_outA; uniform vec4 u_rect; out vec4 o;
        void main() { o = vec4(texture(u_ah, u_rect.xy + v_c * u_rect.zw).r, texture(u_sr, v_c).r, texture(u_fill, v_c).r, texture(u_outA, v_c).r); }`;

    function programs() {
        if (P) return P;
        P = { curve: program(CURVE_VS, CURVE_FS, 'tissue-curve'), compose: program(QUAD_VS, COMPOSE_FS, 'tissue-compose'), fill: program(FILL_VS, FILL_FS, 'tissue-fill'), origin: program(QUAD_VS, ORIGIN_FS, 'tissue-origin'), probe: program(QUAD_VS, PROBE_FS, 'tissue-probe'), pack: program(QUAD_VS, PACK_FS, 'tissue-pack') };
        // the photo shader variant: string replacement on the untouched fs-photo source
        let src = document.getElementById('fs-photo').text.trim(); const need = (a, b) => { if (!src.includes(a)) throw new Error('tissue: fs-photo anchor missing: ' + a.slice(0, 40)); src = src.replace(a, b); };
        // every height read goes through tissueH (done first, so the helper below keeps its own raw read)
        src = src.replace(/textureLod\(u_atlas0, (.+?), lod\)\.r \* u_relief/g, (m, uv) => `tissueH(${uv}, lod)`);
        // T1 (§32): the pupil margin is not a circle. This belongs to the VARIANT and not to fs-photo itself: the
        // same correction written into the shared source moved the isolated bench (62.2 / 68.4 / 70.4 / 66.4 against
        // 61.6 / 68.3 / 70.5 / 66.4) even with every coefficient zero and the arithmetic an identity — recompiling
        // that shader is enough to shift a 120-iteration fit. Separately compiled variants only, as HANDOFF says.
        need('void irisCoords(vec2 xy, float rp,', `uniform float u_marg0, u_margFade; uniform vec2 u_marg[10];
        float margDev(float a_) {
            float d = u_marg0;
            for (int i = 0; i < 10; i++) { float n = float(i + 1); d += u_marg[i].x * cos(n * a_) + u_marg[i].y * sin(n * a_); }
            return clamp(d, -0.25, 0.25);
        }
        void irisCoords(vec2 xy, float rp,`);
        // T1 (iori): the inner edge fades into the pupil instead of cutting to it. In the photo the tissue darkens
        // over the last tens of microns before the black — the ruff's own shadow and the margin's roll — where the
        // model stepped straight from full tissue to pupil colour in one texel.
        need(`                float rootL = 1.0 - smoothstep(0.0, 0.05, abs(v - 1.0) * w);
                lit = mix(lit, vec3(1.0, 1.0, 0.0), rootL);
            }
            return lit;`, `                float rootL = 1.0 - smoothstep(0.0, 0.05, abs(v - 1.0) * w);
                lit = mix(lit, vec3(1.0, 1.0, 0.0), rootL);
            }
            if (u_margFade > 0.0) lit = mix(vec3(0.0015, 0.0012, 0.001), lit, smoothstep(0.0, u_margFade, v));
            return lit;`);
        need('            v = (r - rp) / annulus;\n        }', `            v = (r - rp) / annulus;
            float vm = margDev(ang);                     // where the measured margin actually lies, in v
            v = (v - vm) / max(1.0 - vm, 1e-3);          // so v = 0 is the margin, not the fitted circle
        }`);
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
        // §5.2.3 the bridge layer: a slab of floating strands above the ground — top, bottom (o_aux units), coverage — and its albedo.
        // g_slab is set by the march when the view ray hits the slab; from then on this fragment's height is the slab's top.
        uniform sampler2D u_slab, u_slabAlb; uniform float u_slabOn; float g_slab = 0.0;
        vec4 slabAt(vec2 uv, float lod) { return u_slabOn > 0.5 ? tissueAt(u_slab, uv, lod) : vec4(0.0); }
        float tissueH(vec2 uv, float lod) {
            if (g_slab > 0.5) { vec4 sl = slabAt(uv, lod); if (sl.a > 0.5) return sl.r * u_tisReliefK; }   // the top where it is defined (to 2 r), not only where the tube covers
            vec4 a = tisAux(uv, lod); return mix(textureLod(u_atlas0, uv, lod).r * u_relief, a.r * u_tisReliefK, a.a); }`);
        need('vec3 shadeInterior(vec3 pIn, vec3 dIn, vec3 nFront, vec3 dView, vec3 L, float rp, bool hq) {\n            float t = hitIris(pIn, dIn, rp);',
             'vec3 shadeInterior(vec3 pIn, vec3 dIn, vec3 nFront, vec3 dView, vec3 L, float rp, bool hq) {\n            g_slab = 0.0; float t = hitIris(pIn, dIn, rp);');
        need('int nM = int(u_marchSteps + 0.5);', 'int nM = int(u_marchSteps + 0.5); float hpPrev = 1e9, topPrev = -1e9;');
        need(`                float hh = tissueH(atlasUV(aa, remapV(vv, rpr)), lod);
                if (Pp.z > irisZ(vv) - hh) { tB = tt; break; }
                tA = tt;`, `                vec2 uvS = atlasUV(aa, remapV(vv, rpr)); float hh = tissueH(uvS, lod); float hp = irisZ(vv) - Pp.z;
                if (u_slabOn > 0.5) {                                             // the slab first: the ray comes from above, so crossing its top is the hit
                    vec4 sl = slabAt(uvS, lod); float top = sl.r * u_tisReliefK, bot = sl.g * u_tisReliefK;
                    // crossing the top from above — measured against the top where the ray WAS as well as where it is, so a shell
                    // thinner than a step is not stepped through where its top rises between two steps (§5.4)
                    if (sl.b > 0.5 && hp <= top && (hpPrev > top || hpPrev > topPrev || hp >= bot)) { g_slab = 1.0; tB = tt; break; }
                    topPrev = sl.b > 0.5 ? top : -1e9;
                }
                hpPrev = hp;
                if (Pp.z > irisZ(vv) - hh) { tB = tt; break; }
                tA = tt;`);
        need(`                    float surf = irisZ(qv) - qh;
                    float pen = (Q.z - surf) - 0.006;             // >0: the ray is under the surface (bias vs acne)`, `                    float surf = irisZ(qv) - qh;
                    float pen = (Q.z - surf) - 0.006;             // >0: the ray is under the surface (bias vs acne)
                    if (u_slabOn > 0.5 && g_slab < 0.5) {         // §5.2.3: a bridge between this point and the light shadows it
                        vec4 sl = slabAt(atlasUV(qa, remapV(qv, rpr)), lod); float hq = irisZ(qv) - Q.z;
                        if (sl.b > 0.5 && hq < sl.r * u_tisReliefK && hq > sl.g * u_tisReliefK) pen = max(pen, 0.02);
                    }`);
        need('float occ = t3.r;', `vec4 tsA = tisAlb(uv, lod);
            if (g_slab > 0.5) { vec4 sa = tissueAt(u_slabAlb, uv, lod); if (sa.a > 0.5) tsA = vec4(sa.rgb, 1.0); }   // §5.2.3: on the slab, its own albedo
            float tisRidge0 = t1.a;                                                                // K1: the fitted strand coverage, before the line below zeroes it
            t0.r = mix(t0.r, tissueH(uv, lod) / max(u_relief, 1e-4), tsA.a); t0.a *= 1.0 - tsA.a;   // the layer model owns relief and darkness here (tissueH: the slab's top when the ray hit the slab):
            t1 = mix(t1, vec4(0.0), tsA.a); t3.r = mix(t3.r, 1.0, tsA.a);                          // no crypt / furrow / spot / strand-sheen / occlusion terms of the old model
            float occ = t3.r;`);
        need('float ruff = 1.0 - smoothstep(RUFF_W * 0.6 * scallop, RUFF_W * 1.4 * scallop, (r - rp));',
            'float ruff = (1.0 - smoothstep(RUFF_W * 0.6 * scallop, RUFF_W * 1.4 * scallop, (r - rp))) * (1.0 - tsA.a);   // T1: the painted ruff is drawn after the layer model, so it landed ON TOP of it — a grey ring with two sine waves for scallops. Where the tissue owns the texel it owns the margin, beads and all.');
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
        gl.activeTexture(gl.TEXTURE19); gl.bindTexture(gl.TEXTURE_2D, T.slab || T.aux); gl.uniform1i(gl.getUniformLocation(prog, 'u_slab'), 19);        // §5.2.3 the bridge layer
        gl.activeTexture(gl.TEXTURE20); gl.bindTexture(gl.TEXTURE_2D, T.slabAlb || T.albedo); gl.uniform1i(gl.getUniformLocation(prog, 'u_slabAlb'), 20);
        gl.uniform1f(gl.getUniformLocation(prog, 'u_slabOn'), (T.slab && ((T.slabCurves > 0 && T.slabs() > 0) || T.layered)) ? 1 : 0);   // §5.4: in the layered mode the slab is the ABL shell
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
        gl.uniform1f(u('u_tisK1'), (T.k1 === false || !haveOrigin) ? 0 : 1);
        if (T.marg && T.margin !== false) {                     // T1: the aperture follows the measured margin
            // iori: more circular. But "out of round" and "lumpy" are not the same thing — the low harmonics are the
            // margin's true decentring and ovality, which the photo really has and which damping costs 3.7 MATCH2,
            // while the high ones are the crenellation that reads as lumps. So the first `keep` harmonics stand and
            // the rest fall away: round to look at, still the shape the eye actually has.
            const keep = T.marginKeep === undefined ? 3 : T.marginKeep, soft = T.marginRound === undefined ? 0.25 : T.marginRound;
            const K = T.marg.K.map((k, i) => { const n = i + 1, wgt = n <= keep ? 1 : soft / (1 + (n - keep - 1) * 0.5);
                return [k[0] * wgt, k[1] * wgt]; });
            gl.uniform1f(u('u_marg0'), T.marg.m0);
            gl.uniform2fv(u('u_marg'), new Float32Array(K.flat()));
        } else { gl.uniform1f(u('u_marg0'), 0); gl.uniform2fv(u('u_marg'), new Float32Array(20)); }
        gl.uniform1f(u('u_margFade'), T.margFade === undefined ? 0.04 : T.margFade);
        gl.uniform1f(u('u_tisSheetZ'), T.sheetZ === undefined ? 1 : T.sheetZ);   // the sheet keeps the legacy relief   // ablation: K1 off = the v0.8 behaviour, the fit as fixed pixels
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
    T.load = function (json, opts = {}) {
        E = window.__irisEngine; gl = E.gl; F = E.fit; T.src = json;
        const fit = F.fit, W = fit.W, H = fit.H, map = F.getMap(), sx = W / json.fit[0], sy = H / json.fit[1];
        const conv = xy => xy.map(p => uvAt(map, W, H, p[0] * sx, p[1] * sy));
        const sets = {}; let u0 = 1, u1 = 0, v0 = 1, v1 = 0, lost = 0, tot = 0;
        if (json.beads && json.beads.length && !json.__beadsIn) { json.fibres = json.fibres.concat(json.beads); json.__beadsIn = 1; }   // T1: the ruff's lobes are short tubes lying on the margin — the deck's own rasteriser domes them
        for (const k of ['outlines', 'fibres', 'veins', 'guides', 'sfib', 'svein']) sets[k] = json[k].map(c => { const uv = conv(c.xy); for (const p of uv) { tot++; if (!p) { lost++; continue; } u0 = Math.min(u0, p[0]); u1 = Math.max(u1, p[0]); v0 = Math.min(v0, p[1]); v1 = Math.max(v1, p[1]); } return Object.assign({}, c, { uv }); });
        T.full = u1 - u0 > 0.5;                                          // the whole iris: the region is the full circle, u wraps
        T.parents = []; T.fields = null;                                // §5.2.2 / §5.1: a load starts from the measured primitives alone
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
        // T1 (§32): the margin, as the engine's own v. Each traced point goes through the same coordinate map as
        // every other primitive, so v_m(angle) says directly how far the true margin sits from the fitted circle;
        // ten harmonics of that are what irisCoords needs to stop drawing a circle.
        if (!opts.keepMargin) T.marg = null;
        if (json.margin && json.margin.xy && !opts.keepMargin) {
            const pts = [];
            for (const p of conv(json.margin.xy)) if (p) pts.push([(p[0] - 0.5) * 6.2831853, p[1]]);   // u → angle
            if (pts.length > 64) {
                pts.sort((a, b) => a[0] - b[0]);
                const N = 512, vs = new Float64Array(N);
                for (let i = 0; i < N; i++) {
                    const a = -Math.PI + (i + 0.5) / N * 6.2831853;
                    let lo = 0, hi = pts.length - 1;
                    while (lo < hi - 1) { const m = (lo + hi) >> 1; if (pts[m][0] <= a) lo = m; else hi = m; }
                    const p0 = pts[lo], p1 = pts[hi], d = p1[0] - p0[0];
                    vs[i] = d > 1e-9 ? p0[1] + (p1[1] - p0[1]) * (a - p0[0]) / d : p0[1];
                }
                let m0 = 0; for (let i = 0; i < N; i++) m0 += vs[i]; m0 /= N;
                const K = [];
                for (let n = 1; n <= 10; n++) { let c = 0, sn = 0;
                    for (let i = 0; i < N; i++) { const a = -Math.PI + (i + 0.5) / N * 6.2831853;
                        c += vs[i] * Math.cos(n * a); sn += vs[i] * Math.sin(n * a); }
                    K.push([2 * c / N, 2 * sn / N]); }
                T.marg = { m0, K };
                let lo = 1e9, hi = -1e9; for (let i = 0; i < N; i++) { lo = Math.min(lo, vs[i]); hi = Math.max(hi, vs[i]); }
                say(`margin: v ${lo.toFixed(4)}–${hi.toFixed(4)} (mean ${m0.toFixed(4)}) — the aperture follows it now`);
            }
        }
        T.sets = sets; T.cells = cells; T.deckH = undefined; T.origin = null;   // a new eye is a new origin
        // G4: what a journal was painted on — the eye, its fit frame and every set's size as loaded (before any op)
        T.primKey = JSON.stringify([json.ref, json.fit, ...['outlines', 'fibres', 'veins', 'guides', 'sfib', 'svein'].map(k => (json[k] || []).length), (json.cells && json.cells.xy || []).length]);
        if (T.marg && !opts.keepMargin) {
            // The margin is part of the coordinate system, not a decoration on top of it: with it in place irisCoords
            // puts v = 0 on the true margin, so every primitive's v moves with it. Mapping them in the old system and
            // drawing them in the new one shifts the whole texture outward by the mean offset — it cost 10 MATCH2
            // before this second pass existed. So: fit the margin from the plain map, switch it on, map again.
            const wasOn = T.on;
            T.on = true; F.fit.map = null;
            try { return T.load(json, { keepMargin: true }); }
            finally { T.on = wasOn; F.fit.map = null; }
        }
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
    // study/11 §5.2.3 (2026-09-27): the tube radius is 0.6 × the traced ridge width (the ridge's full width at half maximum);
    // every shipped eye carries its own `z.rK`, this is only the fallback for a file without one
    const RK_DEFAULT = 0.6;
    T.deckZ = 1;                                  // 0 = the flat v0.8 relief · 1 = the anatomy as inferred
    // §5.2.3 the bridge layer: how many slabs the quality allows (one from NORMAL up; DRAFT has none, its floating strands
    // fall back into the ground), the clearance above the floor that makes a strand float, and whether the weave's own
    // lifted fibres may float too (off: only generated instances, until the picture is judged)
    T.slabs = () => (E && E.Q && E.Q.layers >= 2) ? 1 : 0;
    T.slabClearMm = 0.02; T.slabMeasured = false; T.slabCurves = 0;
    // §5.4 L0 the layered stroma (off: the shipped model): the ABL shell's thickness, and the undercut — how far under the shell
    // the base stays down past a crypt's edge, then over how far it rises to meet the shell
    T.layered = false; T.ablMm = 0.04; T.underMm = [0.06, 0.10]; T.lipMm = 0.02; T.edgeMix = 0;
    T.delight = 1;                                // 1 = the geometry's own cross-fibre shading · 0 = the painted one
    // How much of the old model's sheet relief to keep. The layer model carries no furrows and no micro-relief, so
    // writing 0 on the sheet left 75.6 % of the iris at exactly 0.000 µm — a flat table, where the legacy atlas has
    // no texel at exactly zero and a 109 µm spread. Measured on the whole iris of ref 26 at NORMAL,
    // sheetZ 0 / 0.5 / 1 / 1.5 — MATCH2 85.25 / 85.69 / 84.42 / 82.92 · hcorr 0.574 / 0.738 / 0.741 / 0.705 ·
    // cellDab 2.63 / 2.64 / 2.79 / 2.92. Half of it is the best the picture has been, and the height correlation with
    // the photo jumps by 0.16 — the flat table was not only visibly wrong under the probe, it was measurably wrong.
    // This is a stand-in: the sheet's real relief is furrows and micro-texture as primitives, which is T1 and G.
    T.marginKeep = 3;                             // harmonics kept whole: the margin's real decentring and ovality
    T.marginRound = 0.25;                         // how much of the crenellation above that to keep (iori: more circular)
    // How far the tissue fades into the pupil, in v. The photo's edge rises over about 445 µm; the model stepped
    // from full tissue to pupil colour in one texel. Whole iris of ref 26, each row loaded and calibrated with its
    // own setting (the fade reaches calibrate(), so it cannot be swept by re-rendering) — MATCH2 / cellDab:
    //   no fade, every harmonic   85.61 / 2.70      (what shipped before iori asked)
    //   no fade, keep 3           85.17 / 2.73
    //   fade 0.04, keep 3         84.57 / 2.58      ← here: the best colour of the four
    //   fade 0.07, keep 3         84.64 / 2.70
    // So the soft edge is not free — it costs about 1 MATCH2 with the harmonic taper — but it gives the best cellDab
    // of any setting, and it is what the photograph shows. iori asked for it having looked at the render.
    T.margFade = 0.04;
    T.sheetZ = 0.5;
    // How much of the measured de-light to apply. Whole iris of ref 26 at NORMAL — MATCH2 / grad / cellDab / strandCorr:
    //   none                          86.10 / 0.770 / 2.64 / 0.359
    //   1 tile,  30 µm, amt 0.5       86.64 / 0.780 / 2.61 / 0.358      (too coarse to see across a tube: no strandCorr)
    //   3 tiles, 15 µm, amt 0.5       86.76 / 0.783 / 2.62 / 0.375      ← here: every metric improves
    //   3 tiles, 15 µm, amt 1         85.63 / 0.763 / 2.68 / 0.381
    //   5 tiles, 10 µm, amt 1         85.15 / 0.754 / 2.70 / 0.394      (best strandCorr, but the ratio is getting noisy)
    // strandCorr does climb as the measurement gets finer, which is the double-count of §32.4 coming out — but only
    // part of it: the flat model scores 0.516 and no setting comes near. The rest of that gap is still open.
    T.srelAmt = 0.5;                              // 0 = keep the double-count · 1 = divide all of what was measured
    T.wallZ = undefined;                          // the relief's hole wall; default 2.5 × the colour wall (set in bake)
    // the crypt floor's drop below the deck (mm): the fitter's constant (0.01) unless T.depthMm says otherwise (§5.4 L0: the
    // anatomy puts a crypt's floor 120–370 µm below the surface, the fitted model ≈ 110 µm with its deck)
    T.depthMm = null; const cryptDepth = () => T.depthMm == null ? T.src.mm.depth : T.depthMm;
    function deckThickness() {
        if (T.deckH !== undefined) return T.deckH;
        const rK = (T.src.z || {}).rK || RK_DEFAULT, top = [];
        for (const c of (T.sets.fibres || [])) if (c.z && c.inst === undefined) for (let i = 0; i < c.z.length; i++) top.push(c.z[i] + rK * c.w[i]);   // measured fibres only: a floating instance must not push the floor down
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
        const spec = { fibres: [alb, 0.20, false], floating: [alb, 0.20, false], veins: [val, 0.05, false], guides: [chroma, 0.12, false], sfib: [val, 0.05, false], svein: [val, 0.05, false], outlines: [rimv, 0.55, true] };
        // §5.2.3: a fibre whose bottom clears the floor floats — it goes to the slab pass, not the ground's. Generated
        // instances always qualify by their height; measured fibres (the weave's lifts) only when T.slabMeasured says so.
        const rKf = (T.src.z || {}).rK || RK_DEFAULT, clear = T.slabClearMm === undefined ? 0.02 : T.slabClearMm, slabOn = T.slabs() > 0 && !opts.noSlab;
        const floats = c => { if (!slabOn || !c.z || !c.w) return false;
            if (c.bridge) return c.z.some((z, i) => z - rKf * c.w[i] > clear);   // a measured BRIDGE (the fitter's separator rule): it floats wherever its span is lifted
            if (c.inst === undefined && !T.slabMeasured && !(T.layered && c.layered)) return false; const q = c.z.map((z, i) => z - rKf * c.w[i]).sort((a, b) => a - b); return q[q.length >> 1] > clear; };
        const part = { fibres: [], floating: [] }; for (const c of T.sets.fibres) part[floats(c) ? 'floating' : 'fibres'].push(c);
        T.slabCurves = part.floating.length;
        // §5.2.5 B1: a floating strand with a braid spec (its own, or T.braid) is drawn as its children; the set keeps the tube
        T.floatCurves = part.floating;          // §5.4 L0: the floating strands, for the probe's traced segments (after the braid below)
        T.braidKids = 0; if (part.floating.length) part.floating = part.floating.flatMap(c => { const sp = c.braid || T.braid; if (!sp) return [c]; const k = braidOf(c, sp, rKf); T.braidKids += k.length; return k; }); T.floatCurves = part.floating;
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
            const g = buildSet(part[k] || T.sets[k], valueOf, closed, R); gl.uniform1f(pr.curve.loc('u_R'), R); T.segs = (T.segs || 0) + g.count / 6;
            gl.uniform1f(pr.curve.loc('u_top'), k === 'floating' ? 1 : 0); gl.uniform1f(pr.curve.loc('u_rK'), rKf);
            gl.bindVertexArray(g.vao); gl.drawArrays(gl.TRIANGLES, 0, g.count);
            if (k === 'floating' && g.count) {   // §5.2.5: the slab's BOTTOM is the lowest of every tube over the texel (a braid's lower children), not the top one's
                gl.disable(gl.DEPTH_TEST); gl.drawBuffers([gl.NONE, gl.COLOR_ATTACHMENT1]); gl.colorMask(false, false, true, false);
                gl.enable(gl.BLEND); gl.blendEquation(gl.MIN); gl.uniform1f(pr.curve.loc('u_top'), 2);
                gl.drawArrays(gl.TRIANGLES, 0, g.count);
                gl.disable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.colorMask(true, true, true, true); gl.enable(gl.DEPTH_TEST);
            }
            gl.bindVertexArray(null);
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
        {   // pack the legacy height field and the measured de-light into one texture (compose is at the sampler limit)
            if (!T.white) { T.white = texture(1, 1, false, new Float32Array([1, 1, 1, 1])); }
            if (T.pack) gl.deleteTexture(T.pack);
            T.pack = texture(w, h, false);
            gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, null);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, T.pack, 0);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, null, 0);
            gl.drawBuffers([gl.COLOR_ATTACHMENT0]); gl.viewport(0, 0, w, h);
            const pk = pr.pack; gl.useProgram(pk);
            gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, E.atlas.tex[0]); gl.uniform1i(pk.loc('u_ah'), 0);
            gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, T.srel || T.white); gl.uniform1i(pk.loc('u_sr'), 1);
            gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, T.fill); gl.uniform1i(pk.loc('u_fill'), 2);
            gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, T.tex.outlines[0]); gl.uniform1i(pk.loc('u_outA'), 3);
            gl.uniform4f(pk.loc('u_rect'), T.rect[0], T.rect[1], T.rect[2], T.rect[3]);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
        // compose → the region's albedo and relief
        for (const t of [T.albedo, T.aux, T.cellS, T.cellG, T.slab, T.slabAlb]) if (t) gl.deleteTexture(t);
        T.albedo = texture(w, h, true); T.aux = texture(w, h, true); T.slab = texture(w, h, true); T.slabAlb = texture(w, h, true); T.cellS = cellTexture('sheet', !grey); T.cellG = cellTexture('ground', !grey);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, null);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, T.albedo, 0); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, T.aux, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, T.slab, 0); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT3, gl.TEXTURE_2D, T.slabAlb, 0);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2, gl.COLOR_ATTACHMENT3]); gl.viewport(0, 0, w, h);
        const c = pr.compose; gl.useProgram(c); let unit = 0;
        const bindT = (name, t) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(c.loc(name), unit); unit++; };
        bindT('u_fibA', T.tex.fibres[0]); bindT('u_fibB', T.tex.fibres[1]); bindT('u_veinA', T.tex.veins[0]); bindT('u_veinB', T.tex.veins[1]);
        bindT('u_guideA', T.tex.guides[0]); bindT('u_guideB', T.tex.guides[1]); bindT('u_sfA', T.tex.sfib[0]); bindT('u_sfB', T.tex.sfib[1]);
        bindT('u_svA', T.tex.svein[0]); bindT('u_svB', T.tex.svein[1]); bindT('u_flA', T.tex.floating[0]); bindT('u_flB', T.tex.floating[1]); bindT('u_outB', T.tex.outlines[1]);
        bindT('u_cellS', T.cellS); bindT('u_cellG', T.cellG); bindT('u_pack', T.pack);
        gl.uniform1f(c.loc('u_slabOn'), slabOn ? 1 : 0);
        gl.uniform4f(c.loc('u_rect'), T.rect[0], T.rect[1], T.rect[2], T.rect[3]); gl.uniform2f(c.loc('u_size'), w, h);
        const rim = grey ? [grey, grey, grey] : toAlbedo(T.src.rimRGB, T.cells.xy[0][0], T.cells.xy[0][1]); gl.uniform3f(c.loc('u_rimRGB'), rim[0], rim[1], rim[2]);
        gl.uniform1f(c.loc('u_grey'), grey); gl.uniform1f(c.loc('u_wall'), mm.wall); gl.uniform1f(c.loc('u_rimW'), mm.rimW); gl.uniform1f(c.loc('u_rimOff'), mm.rimOff);
        gl.uniform1f(c.loc('u_pit0'), mm.pit[0]); gl.uniform1f(c.loc('u_pit1'), mm.pit[1]); gl.uniform1f(c.loc('u_depth'), opts.depth === undefined ? cryptDepth() : opts.depth);
        const zm = T.src.z || {}, dz = T.deckZ === undefined ? 1 : T.deckZ;
        gl.uniform1f(c.loc('u_fibRK'), zm.rK || RK_DEFAULT); gl.uniform1f(c.loc('u_deckZ'), dz); gl.uniform1f(c.loc('u_deckH'), deckThickness() * dz);
        gl.uniform1f(c.loc('u_delight'), T.delight === undefined ? 0 : T.delight);
        gl.uniform1f(c.loc('u_wallZ'), T.wallZ === undefined ? 2.5 * mm.wall : T.wallZ);
        gl.uniform1f(c.loc('u_sheetZ'), T.sheetZ === undefined ? 0.5 : T.sheetZ);
        gl.uniform1f(c.loc('u_layered'), T.layered ? 1 : 0); gl.uniform1f(c.loc('u_ablMm'), T.ablMm); gl.uniform1f(c.loc('u_under0'), T.underMm[0]); gl.uniform1f(c.loc('u_under1'), T.underMm[1]); gl.uniform1f(c.loc('u_lipMm'), T.lipMm); gl.uniform1f(c.loc('u_edgeMix'), T.edgeMix);   // §5.4 L0
        gl.uniform1f(c.loc('u_srelAmt'), (T.srel && !grey) ? (T.srelAmt === undefined ? 1 : T.srelAmt) : 0);
        gl.uniform1f(c.loc('u_fibNoise'), grey ? 0 : (T.fibNoise || 0));      // §5.2.2 the per-texel term; never in a calibration render
        // the engine's fullscreen quad lives on attribute 0 of the default vertex array
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        for (const t of [T.albedo, T.aux, T.slab, T.slabAlb]) { gl.bindTexture(gl.TEXTURE_2D, t); gl.generateMipmap(gl.TEXTURE_2D); }
        for (const k in T.tex) { gl.deleteTexture(T.tex[k][0]); gl.deleteTexture(T.tex[k][1]); } T.tex = {};       // twelve region-sized targets: keep only the result
        gl.activeTexture(gl.TEXTURE0); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.drawBuffers([gl.BACK]); gl.viewport(0, 0, E.canvas.width, E.canvas.height);
        T.depthUsed = opts.depth === undefined ? cryptDepth() : opts.depth;
        E.resetAccumulation && E.resetAccumulation();
        return T;
    };

    // ---------------------------------------------------------------- study/11 §5.2.2: the flow and spacing fields of a layer eye
    // The grower (strands.js) reads flow(u, v) — the angle from radial, sin along u — and spacing(u, v) in mm. For a fitted eye
    // they come from the traced primitives themselves: the DECK's from its fibres (the shards, and through them the roots), the
    // SHEET's from its guides and fine fibres — never from the legacy engine's flowDir / spacing, which belong to the procedural
    // model. Per cell of ≈ 0.1 mm: the structure tensor of the tangents (doubled angles, so a tangent and its reverse agree)
    // weighted by segment length, and the median across-flow distance from a sample to the nearest sample of ANOTHER curve.
    // Cells with no sample are filled by relaxation from their neighbours (u wraps on a whole iris) and carry conf 0; a layer
    // with no samples at all gets the prior: radial flow, S0's spacing (deck 0.10 mm, sheet 0.22 — study/08 §4).
    // flow is read from every curve of the layer; spacing only from its bundle-scale curves (the sheet's fine fibres lie between
    // the guides and would halve the guides' spacing), and only between PARALLEL neighbours in different lanes — a crossing fibre
    // or a same-lane fragment (split at a junction) is not a neighbouring strand
    const FIELD_SETS = { deck: { flow: ['fibres'], spacing: ['fibres'] }, sheet: { flow: ['guides', 'sfib'], spacing: ['guides'] } }, FIELD_PRIOR_MM = { deck: 0.10, sheet: 0.22 };
    T.fields = null;
    T.buildFields = function (opts = {}) {
        if (!T.sets) throw new Error('tissue: nothing loaded');
        const cellMm = opts.cellMm || 0.10, R = T.rect, full = T.full, rMid = 2 + 4 * (R[1] + 0.5 * R[3]);
        const w = Math.max(4, Math.ceil(R[2] * 6.2831853 * rMid / cellMm)), h = Math.max(4, Math.ceil(R[3] * 4 / cellMm));
        const cellOf = (u, v) => { let cu = (u - R[0]) / R[2], cv = (v - R[1]) / R[3]; if (full) cu -= Math.floor(cu); if (cu < 0 || cu >= 1 || cv < 0 || cv >= 1) return -1; return Math.min(h - 1, Math.floor(cv * h)) * w + Math.min(w - 1, Math.floor(cu * w)); };
        const out = {};
        for (const layer in FIELD_SETS) {
            const c2 = new Float32Array(w * h), s2 = new Float32Array(w * h), wt = new Float32Array(w * h), n = new Int32Array(w * h);
            const spBins = Array.from({ length: w * h }, () => []);
            // every sample of the layer, bucketed for the across-flow neighbour search
            const samples = [], grid = new Map(), bu = 0.02 / (6.2831853 * rMid), bv = 0.02 / 4;
            const key = (u, v) => Math.floor(((u % 1) + 1) % 1 / bu) + ':' + Math.floor(v / bv);
            for (const set of FIELD_SETS[layer].flow) for (const c of (T.sets[set] || [])) {
                const uv = c.uv; if (!uv) continue; const forSpacing = FIELD_SETS[layer].spacing.includes(set);
                for (let j = 0; j < uv.length; j++) {
                    const p = uv[j]; if (!p) continue;
                    const a = uv[Math.max(0, j - 1)], b = uv[Math.min(uv.length - 1, j + 1)]; if (!a || !b) continue;
                    let du = b[0] - a[0]; du -= Math.round(du); const r = 2 + 4 * p[1], tx = du * 6.2831853 * r, ty = (b[1] - a[1]) * 4, L = Math.hypot(tx, ty);
                    if (L < 1e-6) continue;
                    const t = Math.atan2(tx, ty);                                        // from radial (+v), sin along u — strands.js' convention
                    const rec = { u: p[0], v: p[1], t, curve: c, tx: tx / L, ty: ty / L, sp: forSpacing };
                    samples.push(rec); const k = key(p[0], p[1]); let bkt = grid.get(k); if (!bkt) grid.set(k, bkt = []); bkt.push(rec);
                    const ci = cellOf(p[0], p[1]); if (ci < 0) continue;
                    const seg = 0.5 * L; c2[ci] += seg * Math.cos(2 * t); s2[ci] += seg * Math.sin(2 * t); wt[ci] += seg; n[ci]++;
                }
            }
            // across-flow spacing: the nearest sample of another curve, its perpendicular distance to this sample's tangent line
            for (let i = 0; i < samples.length; i += 2) {
                const s = samples[i]; if (!s.sp) continue; const r = 2 + 4 * s.v, cu = Math.floor(((s.u % 1) + 1) % 1 / bu), cv = Math.floor(s.v / bv); let best = 1e9;
                for (let dv = -4; dv <= 4; dv++) for (let du = -4; du <= 4; du++) {
                    const bkt = grid.get((((cu + du) % Math.round(1 / bu)) + Math.round(1 / bu)) % Math.round(1 / bu) + ':' + (cv + dv)); if (!bkt) continue;
                    for (const q of bkt) { if (q.curve === s.curve || !q.sp) continue;
                        if (Math.abs(q.tx * s.tx + q.ty * s.ty) < 0.7) continue;         // a crossing fibre is not a neighbouring strand
                        let ddu = q.u - s.u; ddu -= Math.round(ddu); const ex = ddu * 6.2831853 * r, ey = (q.v - s.v) * 4, along = ex * s.tx + ey * s.ty, across = Math.abs(ex * s.ty - ey * s.tx);
                        if (across < 0.015 || Math.abs(along) > across + 0.02) continue;   // the same lane (a fragment split at a junction), or ahead rather than beside
                        if (across < best) best = across; }
                }
                if (best < 0.4 && best > 0.004) { const ci = cellOf(s.u, s.v); if (ci >= 0) spBins[ci].push(best); }
            }
            const sp = new Float32Array(w * h), conf = new Float32Array(w * h), C2 = new Float32Array(w * h), S2 = new Float32Array(w * h);
            let any = false;
            for (let i = 0; i < w * h; i++) {
                if (wt[i] > 0) { C2[i] = c2[i] / wt[i]; S2[i] = s2[i] / wt[i]; conf[i] = Math.min(1, n[i] / 8); any = true; }
                const b = spBins[i]; if (b.length) { b.sort((x, y) => x - y); sp[i] = b[b.length >> 1]; } else sp[i] = wt[i] > 0 ? -1 : 0;
            }
            // relaxation: empty cells (and empty spacings) take the mean of their filled neighbours until every cell is set
            const relax = (arr, has) => {
                const cur = Float32Array.from(arr), set = Uint8Array.from(has);
                for (let it = 0; it < 400; it++) {
                    let changed = 0; const nx = Float32Array.from(cur), ns = Uint8Array.from(set);
                    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (set[i]) continue; let sum = 0, k = 0;
                        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const yy = y + dy; let xx = x + dx; if (yy < 0 || yy >= h) continue; if (xx < 0 || xx >= w) { if (!full) continue; xx = (xx + w) % w; }
                            const j = yy * w + xx; if (set[j]) { sum += cur[j]; k++; } }
                        if (k) { nx[i] = sum / k; ns[i] = 1; changed++; } }
                    cur.set(nx); set.set(ns); if (!changed) break;
                }
                return cur;
            };
            const hasT = Uint8Array.from(wt, v => v > 0 ? 1 : 0), hasS = Uint8Array.from(sp, v => v > 0 ? 1 : 0);
            let flowC, flowS, spacing;
            if (!any) { flowC = new Float32Array(w * h).fill(1); flowS = new Float32Array(w * h); spacing = new Float32Array(w * h).fill(FIELD_PRIOR_MM[layer]); }
            else { flowC = relax(C2, hasT); flowS = relax(S2, hasT); spacing = hasS.some(v => v) ? relax(sp.map(v => v > 0 ? Math.log(v) : 0), hasS).map(Math.exp) : new Float32Array(w * h).fill(FIELD_PRIOR_MM[layer]); }
            const flow = new Float32Array(w * h); for (let i = 0; i < w * h; i++) flow[i] = 0.5 * Math.atan2(flowS[i], flowC[i]);
            const spv = Array.from(spacing).sort((a, b) => a - b), q = f => spv[Math.min(spv.length - 1, Math.floor(f * spv.length))];
            out[layer] = { w, h, cellMm, flow, c2: flowC, s2: flowS, spacing, logSpacing: spacing.map(Math.log), conf, samples: samples.length, cellsWithSamples: hasT.reduce((a, b) => a + b, 0),
                           spacingMm: { p10: +q(0.1).toFixed(4), median: +q(0.5).toFixed(4), p90: +q(0.9).toFixed(4) }, prior: !any };
            say(`fields · ${layer}: ${samples.length} samples over ${out[layer].cellsWithSamples}/${w * h} cells of ${cellMm} mm · spacing median ${out[layer].spacingMm.median} mm (p10 ${out[layer].spacingMm.p10}, p90 ${out[layer].spacingMm.p90})${any ? '' : ' · PRIOR (no samples)'}`);
        }
        T.fields = Object.assign(out, { rect: R.slice(), full });
        return T.fields;
    };
    /** the field at (u, v): bilinear on the doubled-angle vectors (so the ±90° wrap never averages to nonsense), log-spacing */
    T.fieldAt = function (layer, u, v) {
        const F_ = (T.fields || T.buildFields())[layer], R = T.fields.rect, w = F_.w, h = F_.h;
        let cu = (u - R[0]) / R[2] * w - 0.5, cv = (v - R[1]) / R[3] * h - 0.5;
        if (T.fields.full) cu = ((cu % w) + w) % w; else cu = Math.min(w - 1, Math.max(0, cu)); cv = Math.min(h - 1, Math.max(0, cv));
        const x0 = Math.floor(cu), y0 = Math.floor(cv), fx = cu - x0, fy = cv - y0, x1 = T.fields.full ? (x0 + 1) % w : Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), xa = ((x0 % w) + w) % w;
        const lerp4 = a => (1 - fy) * ((1 - fx) * a[y0 * w + xa] + fx * a[y0 * w + x1]) + fy * ((1 - fx) * a[y1 * w + xa] + fx * a[y1 * w + x1]);
        return { flow: 0.5 * Math.atan2(lerp4(F_.s2), lerp4(F_.c2)), spacing: Math.exp(lerp4(F_.logSpacing)), conf: lerp4(F_.conf) };
    };
    /** how well the field agrees with the primitives it was built from: the angle between each sample's own tangent and the
     *  field's flow there (mod 180°) — median and p90 in degrees, per layer */
    T.fieldsCheck = function () {
        const F0 = T.fields || T.buildFields(), out = {};
        for (const layer in FIELD_SETS) {
            const errs = [];
            for (const set of FIELD_SETS[layer].flow) for (const c of (T.sets[set] || [])) { const uv = c.uv; if (!uv) continue;
                for (let j = 1; j < uv.length - 1; j += 3) { const a = uv[j - 1], p = uv[j], b = uv[j + 1]; if (!a || !p || !b) continue;
                    let du = b[0] - a[0]; du -= Math.round(du); const t = Math.atan2(du * 6.2831853 * (2 + 4 * p[1]), (b[1] - a[1]) * 4);
                    let d = Math.abs(t - T.fieldAt(layer, p[0], p[1]).flow) % Math.PI; if (d > Math.PI / 2) d = Math.PI - d; errs.push(d * 180 / Math.PI); } }
            errs.sort((x, y) => x - y); const q = f => errs.length ? +errs[Math.min(errs.length - 1, Math.floor(f * errs.length))].toFixed(2) : null;
            out[layer] = { samples: errs.length, medianDeg: q(0.5), p90Deg: q(0.9), spacingMm: F0[layer].spacingMm, prior: F0[layer].prior };
        }
        return out;
    };
    /** the field drawn: a stroke per cell along the flow, its length the cell, its colour the spacing (blue 0.03 mm → red 0.3 mm);
     *  unfilled cells dim. Returns a canvas. */
    T.fieldsImage = function (layer, opts = {}) {
        const F_ = (T.fields || T.buildFields())[layer], R = T.fields.rect, px = opts.px || 6;
        const cv = document.createElement('canvas'); cv.width = F_.w * px; cv.height = F_.h * px; const cx = cv.getContext('2d');
        cx.fillStyle = '#111'; cx.fillRect(0, 0, cv.width, cv.height);
        for (let y = 0; y < F_.h; y++) for (let x = 0; x < F_.w; x++) { const i = y * F_.w + x, t = F_.flow[i], s = F_.spacing[i];
            const k = Math.min(1, Math.max(0, (Math.log(s) - Math.log(0.03)) / (Math.log(0.3) - Math.log(0.03)))), hue = 240 - 240 * k;
            cx.strokeStyle = `hsla(${hue}, 90%, ${F_.conf[i] > 0 ? 60 : 28}%, 1)`; cx.lineWidth = F_.conf[i] > 0 ? 1.5 : 1;
            // v runs up in the tissue: draw with the root at the top, the pupil at the bottom; flow angle from radial (vertical)
            const cxp = (x + 0.5) * px, cyp = cv.height - (y + 0.5) * px, L = 0.45 * px, dx = Math.sin(t) * L, dy = -Math.cos(t) * L;
            cx.beginPath(); cx.moveTo(cxp - dx, cyp - dy); cx.lineTo(cxp + dx, cyp + dy); cx.stroke(); }
        cx.fillStyle = '#fff'; cx.font = '12px sans-serif'; cx.fillText(`${layer} · flow (stroke) and spacing (blue 0.03 → red 0.3 mm) · ${F_.w} × ${F_.h} cells of ${F_.cellMm} mm · u → , v ↑ (pupil at the bottom)`, 6, 14);
        return cv;
    };

    // ---------------------------------------------------------------- G (§32): ops, the journal, and the brushes
    // One vocabulary for three callers. A brush emits ops, the generator emits ops, and the fitter of T6 will emit
    // the same ops as it grows an eye — so an edit by hand and a step of the fit are the same kind of thing, and the
    // journal that records one records the other. Every op carries what it needs to be undone, and every primitive
    // it makes carries its provenance, so `measured`, `inferred`, `painted` and `seeded` stay told apart forever.
    const rng = seed => { let a = (seed >>> 0) || 1; return () => { a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
    const SETS = ['fibres', 'guides', 'veins', 'sfib', 'svein', 'outlines'];
    T.ops = [];                                   // the journal: what was done, in order
    T.dirty = false;
    function curvesOf(set) { if (!T.sets || !T.sets[set]) throw new Error('tissue: no set ' + set); return T.sets[set]; }
    function clone(c) { return JSON.parse(JSON.stringify(c)); }

    /** Apply one op. Returns the op, with an `undo` record attached, and leaves the bake stale. */
    T.apply = function (op) {
        const set = op.set || 'fibres', list = curvesOf(set);
        switch (op.t) {
            case 'add': {
                const c = op.curve;
                if (!c.uv) c.uv = c.xy.map(q => uvAt(F.getMap(), F.fit.W, F.fit.H, q[0] * F.fit.W / T.src.fit[0], q[1] * F.fit.H / T.src.fit[1]));
                list.push(c); op.undo = { at: list.length - 1 };
                op.curve = clone(c);                  // G4: the op keeps the curve AS ADDED — later ops mutate the one in the set, and a replay
                                                      // must add this state and then re-apply them, not add their result
                break;
            }
            case 'delete': { op.undo = { at: op.at, curve: list[op.at] }; list.splice(op.at, 1); break; }
            case 'move': {                        // one vertex, in json-fit pixels
                const c = list[op.at]; op.undo = { xy: c.xy[op.i].slice(), uv: c.uv[op.i] && c.uv[op.i].slice() };
                c.xy[op.i] = op.xy.slice();
                c.uv[op.i] = uvAt(F.getMap(), F.fit.W, F.fit.H, op.xy[0] * F.fit.W / T.src.fit[0], op.xy[1] * F.fit.H / T.src.fit[1]);
                break;
            }
            case 'set': {                         // a payload along a curve: w, z, r, zc, rgb
                const c = list[op.at]; op.undo = { key: op.key, was: clone(c[op.key]) };
                if (Array.isArray(op.value)) c[op.key] = op.value.slice();
                else c[op.key] = c[op.key].map(() => op.value);
                if (op.key === 'w') c.r = c.w.map(w => ((T.src.z || {}).rK || RK_DEFAULT) * w);
                break;
            }
            case 'split': {                       // cut a curve at vertex i into two
                const c = list[op.at], i = op.i, keys = ['xy', 'uv', 'w', 'z', 'r', 'zc', 'val', 'rgb', 'base'];
                op.undo = { at: op.at, curve: clone(c) };
                const b = {}; for (const k of keys) if (Array.isArray(c[k])) b[k] = c[k].slice(i);
                for (const k of keys) if (Array.isArray(c[k])) c[k] = c[k].slice(0, i + 1);
                b.provenance = c.provenance; list.splice(op.at + 1, 0, b);
                break;
            }
            case 'join': {                        // append curve `b` onto curve `at`
                const c = list[op.at], b = list[op.b], keys = ['xy', 'uv', 'w', 'z', 'r', 'zc', 'val', 'rgb', 'base'];
                op.undo = { at: op.at, curve: clone(c), b: op.b, bCurve: clone(b) };
                for (const k of keys) if (Array.isArray(c[k]) && Array.isArray(b[k])) c[k] = c[k].concat(b[k]);
                list.splice(op.b, 1);
                break;
            }
            default: if (!applyParentOp(op)) throw new Error('tissue: unknown op ' + op.t);
        }
        op.set = set; T.ops.push(op); T.dirty = true; T.deckH = undefined;
        return op;
    };
    /** Undo the last op (or `n` of them). */
    T.undo = function (n) {
        for (let k = 0; k < (n || 1); k++) {
            const op = T.ops.pop(); if (!op) break;
            const list = curvesOf(op.set);
            if (op.t === 'add') list.splice(op.undo.at, 1);
            else if (op.t === 'delete') list.splice(op.undo.at, 0, op.undo.curve);
            else if (op.t === 'move') { const c = list[op.at]; c.xy[op.i] = op.undo.xy; c.uv[op.i] = op.undo.uv; }
            else if (op.t === 'set') { const c = list[op.at]; c[op.undo.key] = op.undo.was; if (op.undo.key === 'w') c.r = c.w.map(w => ((T.src.z || {}).rK || RK_DEFAULT) * w); }
            else if (op.t === 'split') { list.splice(op.at, 2, op.undo.curve); }
            else if (op.t === 'join') { list[op.at] = op.undo.curve; list.splice(op.undo.b, 0, op.undo.bCurve); }
            else undoParentOp(op);
        }
        T.dirty = true; T.deckH = undefined;
        return T.ops.length;
    };
    /** Re-bake after edits. */
    T.commit = function () { if (!T.dirty) return T; T.bake(); T.dirty = false; return T; };
    // ---- G4 (study/11): the journal as data. Every op without its undo record (re-derived on replay), numbers to 5
    // decimals; `primitives` says what it was painted on. replay() refuses a journal made on other primitives (the
    // caller says so; nothing is applied silently) and applies the rest in order, then re-bakes once.
    const r5 = v => Array.isArray(v) ? v.map(r5) : (typeof v === 'number' ? Math.round(v * 1e5) / 1e5 : (v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, r5(x)])) : v));
    T.journal = () => ({ v: 1, primitives: T.primKey || null, ops: T.ops.map(op => { const o = Object.assign({}, op); delete o.undo; return r5(o); }) });
    T.replay = function (j) {
        if (!j || !Array.isArray(j.ops) || !j.ops.length) return 0;
        if (j.primitives !== T.primKey) { say('journal not applied: it was painted on other primitives'); return false; }
        for (const op of j.ops) T.apply(JSON.parse(JSON.stringify(op)));
        T.commit(); say(`journal replayed: ${j.ops.length} op${j.ops.length === 1 ? '' : 's'}`); return j.ops.length;
    };

    // ---- brushes: they do not draw pixels, they emit the ops above
    T.brush = {
        /**
         * A bundle of deck fibres along `path` (fit pixels). Seeded, so the same stroke re-rolls the same bundle.
         * Direction comes from the stroke; width, spacing and waviness from the local tissue unless given.
         */
        strands(path, opts = {}) {
            if (!T.sets) throw new Error('tissue: nothing loaded');
            const R = rng(opts.seed === undefined ? 1 : opts.seed), n = opts.count || 8;
            const kx = T.src.fit[0] / F.fit.W, ky = T.src.fit[1] / F.fit.H;     // fit px → the json's own pixels
            const P = path.map(q => [q[0] * kx, q[1] * ky]);
            // the local look: median width and colour of the fibres nearest the stroke's middle
            const mid = P[P.length >> 1];
            let near = null, nd = 1e18;
            for (const c of T.sets.fibres) { if (!c.xy) continue; const q = c.xy[c.xy.length >> 1];
                const d = (q[0] - mid[0]) ** 2 + (q[1] - mid[1]) ** 2; if (d < nd) { nd = d; near = c; } }
            const wMed = opts.widthMm !== undefined ? opts.widthMm / 1.4 : (near ? near.w[near.w.length >> 1] : 0.014);
            const rgb0 = opts.rgb || (near ? near.rgb[near.rgb.length >> 1] : [0.02, 0.02, 0.015]);
            const spread = (opts.spreadMm === undefined ? 0.12 : opts.spreadMm), wav = opts.wavinessMm === undefined ? 0.02 : opts.wavinessMm;
            const pxPerMm = (F.fit.limbus.rx / 5.85) * kx;                        // json px per mm
            const made = [];
            for (let i = 0; i < n; i++) {
                const off = (R() - 0.5) * 2 * spread * pxPerMm, ph = R() * 6.2831853, amp = wav * pxPerMm * (0.4 + R());
                const xy = [], w = [], z = [], zc = [], rgb = [];
                for (let j = 0; j < P.length; j++) {
                    const a = P[Math.max(0, j - 1)], b = P[Math.min(P.length - 1, j + 1)];
                    let tx = b[0] - a[0], ty = b[1] - a[1]; const L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L;
                    const s = j / Math.max(1, P.length - 1);
                    const d = off + amp * Math.sin(ph + s * 6.2831853);
                    xy.push([P[j][0] - ty * d, P[j][1] + tx * d]);
                    const ww = wMed * (0.7 + 0.6 * R());
                    w.push(ww); z.push(1.4 * ww * (0.9 + 0.3 * R())); zc.push(0);
                    const k = 0.75 + 0.5 * R();
                    rgb.push([rgb0[0] * k, rgb0[1] * k, rgb0[2] * k]);
                }
                const c = { xy, w, z, zc, rgb, r: w.map(q => 1.4 * q), provenance: 'painted' };
                made.push(T.apply({ t: 'add', set: 'fibres', curve: c, brush: 'strands', seed: opts.seed }));
            }
            say(`brush: ${n} strands painted, ${(wMed * 2.8 * 1000).toFixed(0)} µm wide, over ${(P.length)} points`);
            return made;
        },
        /**
         * G1: guides — the streaks ON the sheet (deck fibres painted on the sheet are invisible by design: they lie under
         * the border layer). A guide carries what a measured one does: width, `val` (brightness relative to the sheet
         * around it — above 1 lighter, below 1 darker), `base` (the sheet's local level) and `rgb` (its chroma, luminance
         * 1). Unless given, width, colour and base come from the nearest measured guide, and `brightness` defaults to 1.2
         * (a pale streak). `count` > 1 lays a seeded bundle across `spreadMm`, like the strand brush.
         * The stroke is in tissue (u, v) when opts.space === 'uv' (the Tissue window: the live view at any camera), else
         * in fit pixels (the console, as the strand brush). It is resampled every 20 µm, a measured guide's payload step.
         * A painted sample's json-pixel position — which the bake needs only to read the measured LIGHT there — is the
         * nearest measured primitive sample's: the primitives cover the iris every ≈ 20 µm and the light is smooth to
         * 0.2 mm, so this is exact to what the light resolves, at any camera (the live map is not the case's pose).
         */
        guides(path, opts = {}) {
            if (!T.sets || !T.sets.guides) throw new Error('tissue: nothing loaded');
            const R = rng(opts.seed === undefined ? 1 : opts.seed), n = Math.max(1, opts.count || 1);
            const circ = v => 6.2831853 * (2 + 4 * v);                          // mm round the eye at tissue v (as the region)
            let UV = opts.space === 'uv' ? path.map(q => q.slice())
                : path.map(q => uvAt(F.getMap(), F.fit.W, F.fit.H, q[0], q[1])).filter(Boolean);
            for (let j = 1; j < UV.length; j++) { let du = UV[j][0] - UV[j - 1][0]; du -= Math.round(du); UV[j][0] = UV[j - 1][0] + du; }   // unwrap u
            const P = UV.length ? [UV[0]] : [];                                // resample every 20 µm (arc length in mm)
            for (let j = 1; j < UV.length; j++) {
                let a = P[P.length - 1]; const b = UV[j];
                const mm = (p, q) => Math.hypot((q[0] - p[0]) * circ((p[1] + q[1]) / 2), (q[1] - p[1]) * 4);
                let d = mm(a, b);
                while (d >= 0.020) { const t = 0.020 / d; a = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; P.push(a); d = mm(a, b); }
            }
            if (P.length < 2) { say('brush: stroke too short for a guide'); return []; }
            // nearest measured samples, bucketed in (u, v): for the json-pixel position, and the nearest guide's look
            const cell = 0.004, key = (u, v) => `${Math.floor((((u % 1) + 1) % 1) / cell)},${Math.floor(v / cell)}`, grid = new Map();
            for (const set of SETS) for (const c of (T.sets[set] || [])) if (c.uv && c.xy) c.uv.forEach((q, i) => { if (!q) return; const k = key(q[0], q[1]); let b = grid.get(k); if (!b) grid.set(k, b = []); b.push([q[0], q[1], c, i, set]); });
            const nearest = (u, v, only) => { let best = null, bd = 1e18; const cu = Math.floor((((u % 1) + 1) % 1) / cell), cv0 = Math.floor(v / cell);
                for (let r = 1; r <= 6 && !best; r++) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) { const b = grid.get(`${(cu + dx + Math.round(1 / cell)) % Math.round(1 / cell)},${cv0 + dy}`); if (!b) continue;
                    for (const e of b) { if (only && e[4] !== only) continue; let du = e[0] - u; du -= Math.round(du); const d = (du * circ(v)) ** 2 + ((e[1] - v) * 4) ** 2; if (d < bd) { bd = d; best = e; } } }
                return best; };
            const mid = P[P.length >> 1], ng = nearest(mid[0], mid[1], 'guides'), near = ng ? ng[2] : null, ni = ng ? ng[3] : 0;
            const w0 = opts.widthMm !== undefined ? opts.widthMm : (near ? near.w[ni] : 0.03);
            const rgb0 = opts.rgb || (near && near.rgb ? near.rgb[ni] : [1, 1, 1]), base0 = near && near.base ? near.base[ni] : null;
            const val0 = opts.brightness === undefined ? 1.2 : opts.brightness, spread = opts.spreadMm === undefined ? 0.06 : opts.spreadMm;
            const made = [];
            for (let i = 0; i < n; i++) {
                const off = n > 1 ? (R() - 0.5) * 2 * spread : 0, uv = [], xy = [], w = [], val = [], base = [], rgb = [];
                for (let j = 0; j < P.length; j++) {
                    const a = P[Math.max(0, j - 1)], b = P[Math.min(P.length - 1, j + 1)], cm = circ(P[j][1]);
                    let tx = (b[0] - a[0]) * cm, ty = (b[1] - a[1]) * 4; const L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L;
                    const q = [P[j][0] - ty * off / cm, P[j][1] + tx * off / 4]; q[0] = ((q[0] % 1) + 1) % 1;
                    const e = nearest(q[0], q[1]); if (!e) continue;               // off the tissue: the stroke skips it
                    const taper = Math.min(1, 4 * Math.min(j, P.length - 1 - j) / Math.max(1, P.length - 1) + 0.25);   // the ends fade in
                    uv.push(q); xy.push(e[2].xy[e[3]].slice());
                    w.push(w0 * (0.85 + 0.3 * R())); val.push(1 + (val0 - 1) * taper * (0.85 + 0.3 * R()));
                    if (base0 !== null) base.push(base0); rgb.push(rgb0.slice());
                }
                if (uv.length < 2) continue;
                const c = { uv, xy, w, val, rgb, provenance: 'painted' }; if (base.length) c.base = base;
                made.push(T.apply({ t: 'add', set: 'guides', curve: c, brush: 'guides', seed: opts.seed, stroke: opts.stroke }));
            }
            say(`brush: ${made.length} guide${made.length === 1 ? '' : 's'} painted, ${(w0 * 1000).toFixed(0)} µm wide, brightness ×${val0}, ${P.length} samples`);
            return made;
        },
    };

    // ---------------------------------------------------------------- §5.4 L0: the layered stroma's traced strands
    // The floating strands of the last bake as capsules in a per-cell list: cells of ~40 µm over (u, v), each segment registered in
    // every cell its footprint (radius + one cell) touches. Rebuilt when the bake changes. World z as the probe's: the sheet at 0,
    // the floor at −(depth + deck thickness), a strand's centre z above the floor.
    let segCache = null;
    function segmentGrid() {
        const list = T.floatCurves || [];
        if (segCache && segCache.list === list && segCache.bakeId === T.bakeId) return segCache;
        if (segCache) for (const k of ['seg', 'head', 'idx']) if (segCache[k]) gl.deleteTexture(segCache[k]);
        const rK = (T.src.z || {}).rK || RK_DEFAULT, dz = T.deckZ, fbase = -cryptDepth() - deckThickness() * dz;
        const segs = [];
        for (const c of list) for (let i = 0; i + 1 < c.uv.length; i++) { const a = c.uv[i], b = c.uv[i + 1]; if (!a || !b) continue;
            const al = toAlbedo(c.rgb[i], c.xy[i][0], c.xy[i][1]);
            segs.push([a[0], a[1], fbase + c.z[i] * dz, rK * c.w[i], a[0] + ((b[0] - a[0]) - Math.round(b[0] - a[0])), b[1], fbase + c.z[i + 1] * dz, rK * c.w[i + 1], al[0], al[1], al[2]]); }
        const rect = [0, T.rect[1], 1, T.rect[3]], cell = 0.04, nU = Math.ceil(6.2831853 * 6 / cell), nV = Math.max(1, Math.ceil(rect[3] * 4 / cell));
        const cells = new Map();
        segs.forEach((q, i) => { const v0 = Math.min(q[1], q[5]), v1 = Math.max(q[1], q[5]), cm = 6.2831853 * (2 + 4 * 0.5 * (v0 + v1)), pad = Math.max(q[3], q[7]) + cell;
            const ua = Math.min(q[0], q[4]) - pad / cm, ub = Math.max(q[0], q[4]) + pad / cm, va = v0 - pad / 4, vb = v1 + pad / 4;
            for (let cv = Math.max(0, Math.floor((va - rect[1]) / rect[3] * nV)); cv <= Math.min(nV - 1, Math.floor((vb - rect[1]) / rect[3] * nV)); cv++)
                for (let cu = Math.floor(ua * nU); cu <= Math.floor(ub * nU); cu++) { const k = cv * nU + ((cu % nU) + nU) % nU; let b = cells.get(k); if (!b) cells.set(k, b = []); b.push(i); } });
        const nC = nU * nV, headH = Math.ceil(nC / 1024), head = new Float32Array(1024 * headH * 4), idxL = []; for (const [k, b] of cells) { head[k * 4] = idxL.length; head[k * 4 + 1] = Math.min(b.length, 64); for (const i of b.slice(0, 64)) idxL.push(i); }
        const idxH = Math.max(1, Math.ceil(idxL.length / 1024)), idx = new Float32Array(1024 * idxH * 4); idxL.forEach((i, j) => { idx[j * 4] = i; });
        const segH = Math.max(1, Math.ceil(segs.length / 1024)), sd = new Float32Array(3072 * segH * 4); segs.forEach((q, i) => { const o = ((i / 1024 | 0) * 3072 + 3 * (i % 1024)) * 4; sd.set([q[0], q[1], q[2], q[3], q[4], q[5], q[6], q[7], q[8], q[9], q[10], 1], o); });
        const tex = (w, h, data) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, data);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); return t; };
        let over = 0; for (const b of cells.values()) if (b.length > 64) over++;
        segCache = { list, bakeId: T.bakeId, n: segs.length, nU, nV, rect, seg: tex(3072, segH, sd), head: tex(1024, headH, head), idx: tex(1024, idxH, idx), cellsUsed: cells.size, cellsOver64: over };
        return segCache;
    }
    T.segmentStats = () => { const G = segmentGrid(); return { segments: G.n, cells: G.cellsUsed, cellsOver64: G.cellsOver64, grid: [G.nU, G.nV] }; };
    /** §5.4 L0: the depth pass on the measured deck — every strand a depth from three cues, as an arc between anchors.
     *  (1) brightness against its neighbours (deeper is darker and softer), (2) thickness against its neighbours (iori: the
     *  thickest single strands are the bridges), (3) the weave's own over / under. Only the upper part of the range lifts; the
     *  rest stays in the valley, resting on the base. A strand's end at a crypt WALL anchors at the level it passes under the
     *  shell and continues under it; a free end dives to the base; a branch meets its neighbour half way. `false` restores. */
    T.layerDepths = function (on = true, o = {}) {
        const fib = T.sets.fibres || [], rK = (T.src.z || {}).rK || RK_DEFAULT, ends = ((T.src.roots || {}).ends) || [];
        for (const c of fib) if (c.layered) { c.uv = c.l0.uv; c.xy = c.l0.xy; c.w = c.l0.w; c.z = c.l0.z; c.zc = c.l0.zc; c.rgb = c.l0.rgb; c.r = c.w.map(w => rK * w); delete c.l0; delete c.layered; delete c.depth; }
        T.dirty = true; T.deckH = undefined; if (!on) return 0;
        const P = Object.assign({ wBright: 0.5, wThick: 0.25, wWeave: 0.25, lift0: 0.55, lift1: 0.95, jitter: 0.15, extMm: null }, o);
        const deckH = deckThickness(), Htop = cryptDepth() + deckH - T.ablMm, ext = P.extMm === null ? T.underMm[0] + 0.04 : P.extMm;
        const meas = fib.map((c, i) => ({ c, i })).filter(q => q.c.inst === undefined && q.c.z && q.c.uv.length >= 2 && q.c.uv.every(Boolean));
        const med = a => { const b = a.slice().sort((x, y) => x - y); return b[b.length >> 1]; };
        for (const q of meas) { const c = q.c; q.L = med(c.rgb.map(v => 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2])); q.W = med(c.w); q.Z = med(c.z.map((z, k) => (z - rK * c.w[k]) / Math.max(deckH, 1e-4))); q.m = c.uv[c.uv.length >> 1]; }
        const grid = new Map(), cs = 0.3, key = (u, v) => Math.floor(u * 6.2831853 * 4 / cs) + ',' + Math.floor(v * 4 / cs);
        for (const q of meas) { const k = key(q.m[0], q.m[1]); let b = grid.get(k); if (!b) grid.set(k, b = []); b.push(q); }
        let lifted = 0;
        for (const q of meas) {
            const [gu, gv] = key(q.m[0], q.m[1]).split(',').map(Number), nb = [];
            for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const x of (grid.get((gu + a) + ',' + (gv + b)) || [])) nb.push(x);
            const pct = (f, val) => nb.filter(x => f(x) < val).length / Math.max(1, nb.length - 1);
            const d = P.wBright * pct(x => x.L, q.L) + P.wThick * pct(x => x.W, q.W) + P.wWeave * Math.min(1, Math.max(0, q.Z));
            const lift = Math.min(1, Math.max(0, (d - P.lift0) / (P.lift1 - P.lift0))), c = q.c; q.d = d;
            if (lift <= 0.02) continue;
            const R = rng(q.i * 7919 + 13), r0 = rK * q.W, peak = r0 + lift * (Htop - r0) * (1 + P.jitter * (2 * R() - 1));
            const kinds = ends[q.i] || ['free', 'free'], anchor = k => k === 'wall' ? peak : (k === 'free' ? r0 : 0.5 * (r0 + peak));
            c.l0 = { uv: c.uv, xy: c.xy, w: c.w, z: c.z, zc: c.zc, rgb: c.rgb };
            let uv = c.uv.map(p => p.slice()), xy = c.xy.map(p => p.slice()), w = c.w.slice(), rgb = c.rgb.map(p => p.slice()), zw = c.z.slice();
            // a wall end continues under the shell along its tangent (the stroma does not stop at the ABL's edge)
            const extend = (atEnd) => { if (kinds[atEnd ? 1 : 0] !== 'wall' || lift < 0.3 || ext <= 0) return;
                const n = uv.length, A = atEnd ? uv[n - 2] : uv[1], B = atEnd ? uv[n - 1] : uv[0], XA = atEnd ? xy[n - 2] : xy[1], XB = atEnd ? xy[n - 1] : xy[0];
                let du = B[0] - A[0]; du -= Math.round(du); const dv = B[1] - A[1], L = mmBetween(A, B) || 1e-6, m = Math.max(1, Math.round(ext / 0.02));
                for (let s = 1; s <= m; s++) { const f = s * 0.02 / L, p = [(((B[0] + du * f) % 1) + 1) % 1, B[1] + dv * f], x = [XB[0] + (XB[0] - XA[0]) * f, XB[1] + (XB[1] - XA[1]) * f];
                    if (atEnd) { uv.push(p); xy.push(x); w.push(w[w.length - 1]); rgb.push(rgb[rgb.length - 1].slice()); zw.push(zw[zw.length - 1]); }
                    else { uv.unshift(p); xy.unshift(x); w.unshift(w[0]); rgb.unshift(rgb[0].slice()); zw.unshift(zw[0]); } } };
            extend(false); extend(true);
            const arc = [0]; for (let k = 1; k < uv.length; k++) arc.push(arc[k - 1] + mmBetween(uv[k - 1], uv[k])); const tot = arc[arc.length - 1] || 1e-6;
            const za = anchor(kinds[0]), zb = anchor(kinds[1]), hump = Math.max(0, peak - Math.max(za, zb));
            c.uv = uv; c.xy = xy; c.w = w; c.rgb = rgb; c.zc = uv.map(() => 0);
            c.z = arc.map((a, k) => { const t = a / tot, r = rK * w[k]; return Math.max(zw[k], r, za + (zb - za) * t + hump * Math.sin(Math.PI * t)); });
            c.r = w.map(x => rK * x); c.layered = true; c.depth = +d.toFixed(3); lifted++;
        }
        T.layerStats = { strands: meas.length, lifted, HtopUm: Math.round(Htop * 1000), deckHUm: Math.round(deckH * 1000) };
        say(`layer depths: ${lifted} of ${meas.length} deck strands lifted (the top ${(100 * lifted / Math.max(1, meas.length)).toFixed(0)} %), the shell's underside ${Math.round(Htop * 1000)} µm above the floor`);
        return T.layerStats;
    };

    // ---------------------------------------------------------------- T3 (§32): the probe camera
    // A camera inside the anterior chamber, down among the tissue, for reading the SHAPE of the landscape: how deep a
    // crypt is, how its walls run, which fibre bridges over which. It does not share fs-photo's camera: that march is
    // built for looking nearly straight down with ten steps, and a grazing look along a canyon floor needs hundreds
    // and a different formulation. A pass of its own also means the probe cannot move any bench.
    //
    // The world here is the tissue's own height field, in millimetres, over a local tangent plane: x along u at the
    // probe's radius, y along v, z up from the sheet's surface (so z = 0 is the sheet and the canyon floors are
    // negative). Over the sub-millimetre neighbourhood a probe sees, treating the iris as flat is right to well under
    // a texel, and the radius is taken at the probe's own v.
    const PROBE_FS = `#version 300 es
        precision highp float;
        in vec2 v_c;
        uniform sampler2D u_alb, u_aux, u_slab, u_slabAlb; uniform float u_slabOn;
        uniform vec4 u_rect; uniform vec2 u_uv0; uniform float u_r0;
        uniform vec3 u_pos, u_fwd, u_right, u_up;
        uniform float u_tanHalf, u_aspect, u_far, u_mode, u_contour, u_lightUp, u_ambient, u_zLo, u_zHi;
        out vec4 o;
        vec2 toUV(vec2 p) { return u_uv0 + vec2(p.x / (6.2831853 * u_r0), p.y / 4.0); }
        bool inR(vec2 uv, out vec2 c) { c = (vec2(fract(uv.x), uv.y) - u_rect.xy) / u_rect.zw; return c.x > 0.0 && c.x < 1.0 && c.y > 0.0 && c.y < 1.0; }
        uniform float u_layered, u_segOn; uniform sampler2D u_seg, u_cellH, u_cellI; uniform vec2 u_gridN; uniform vec4 u_gridR;
        float H(vec2 p) { vec2 c; if (!inR(toUV(p), c)) return 0.0; vec4 a = textureLod(u_aux, c, 0.0); return u_layered > 0.5 ? a.g : a.r; }   // §5.4: the layered base (.g) — the floating strands are traced
        // §5.4 L0 traced strands: every floating strand as capsules (20 µm segments) in a per-cell list over (u, v). A segment is
        // three texels — (u, v, z, r) at both ends, then its albedo; z is already the world's (mm, the sheet at 0).
        vec3 segP(vec4 a) { float du = a.x - u_uv0.x; du -= floor(du + 0.5); return vec3(du * 6.2831853 * u_r0, (a.y - u_uv0.y) * 4.0, a.z); }
        float capT(vec3 ro, vec3 rd, vec3 pa, vec3 pb, float r) {           // ray × capsule, the nearest t > 0 or -1 (after iq)
            vec3 ba = pb - pa, oa = ro - pa; float baba = dot(ba, ba), bard = dot(ba, rd), baoa = dot(ba, oa), rdoa = dot(rd, oa), oaoa = dot(oa, oa);
            float a = baba - bard * bard, b = baba * rdoa - baoa * bard, c = baba * oaoa - baoa * baoa - r * r * baba, h = b * b - a * c;
            if (h >= 0.0 && a > 1e-12) { float t = (-b - sqrt(h)) / a, y = baoa + t * bard; if (y > 0.0 && y < baba) return t;
                vec3 oc = y <= 0.0 ? oa : ro - pb; b = dot(rd, oc); c = dot(oc, oc) - r * r; h = b * b - c; if (h > 0.0) return -b - sqrt(h); }
            return -1.0;
        }
        int cellOf(vec2 p) { vec2 uv = toUV(p); float cu = floor((fract(uv.x) - u_gridR.x) / u_gridR.z * u_gridN.x), cv = floor((uv.y - u_gridR.y) / u_gridR.w * u_gridN.y);
            if (cu < 0.0 || cv < 0.0 || cu >= u_gridN.x || cv >= u_gridN.y) return -1; return int(cv * u_gridN.x + cu); }
        // the nearest capsule of cell k along the ray, if nearer than best
        void segCell(int k, vec3 ro, vec3 rd, inout float best, inout int bi) {
            vec2 hd = texelFetch(u_cellH, ivec2(k % 1024, k / 1024), 0).rg; int o = int(hd.x + 0.5), n = min(int(hd.y + 0.5), 64);
            for (int j = 0; j < 64; j++) { if (j >= n) break; int i = int(texelFetch(u_cellI, ivec2((o + j) % 1024, (o + j) / 1024), 0).r + 0.5);
                vec4 A = texelFetch(u_seg, ivec2(3 * (i % 1024), i / 1024), 0), B = texelFetch(u_seg, ivec2(3 * (i % 1024) + 1, i / 1024), 0);
                float t = capT(ro, rd, segP(A), segP(B), 0.5 * (A.w + B.w)); if (t > 1e-5 && t < best) { best = t; bi = i; } }
        }
        vec4 SL(vec2 p) { vec2 c; if (u_slabOn < 0.5 || !inR(toUV(p), c)) return vec4(0.0); return textureLod(u_slab, c, 0.0); }   // §5.2.3 the bridge layer: top, bottom, coverage
        bool inSlab(vec3 q) { vec4 sl = SL(q.xy); return sl.b > 0.5 && q.z <= sl.r && q.z >= sl.g; }
        vec3 SLALB(vec2 p) { vec2 c; if (!inR(toUV(p), c)) return vec3(0.22, 0.20, 0.18); return textureLod(u_slabAlb, c, 0.0).rgb; }
        vec3 ALB(vec2 p) { vec2 c; if (!inR(toUV(p), c)) return vec3(0.22, 0.20, 0.18); return textureLod(u_alb, c, 0.0).rgb; }
        vec3 turbo(float t) {   // enough of a turbo for reading elevation
            t = clamp(t, 0.0, 1.0);
            return clamp(vec3(34.61 + t * (1172.33 + t * (-10793.56 + t * (33300.12 + t * (-38394.49 + t * 14825.05)))),
                              23.31 + t * (557.33 + t * (1225.33 + t * (-3574.96 + t * (1073.77 + t * 707.56)))),
                              27.2 + t * (3211.1 + t * (-15327.97 + t * (27814.0 + t * (-22569.18 + t * 6838.66))))) / 255.0, 0.0, 1.0);
        }
        void main() {
            vec2 s = v_c * 2.0 - 1.0;
            vec3 rd = normalize(u_fwd + s.x * u_aspect * u_tanHalf * u_right + s.y * u_tanHalf * u_up);
            // march the height field: step by a fraction of the gap, never past a texel, then bisect the crossing
            float t = 0.0, hit = -1.0;
            vec3 p = u_pos;
            float gap = p.z - H(p.xy), prevT = 0.0, prevGap = gap, slab = 0.0, zPrev = p.z;
            if (gap < 0.0 || inSlab(p)) { o = vec4(0.02, 0.02, 0.03, 1.0); return; }        // started inside the tissue
            float segBest = 1e9; int segI = -1, lastCell = -2;
            for (int i = 0; i < 320; i++) {
                if (u_segOn > 0.5) { int k = cellOf(p.xy); if (k != lastCell) { if (k >= 0) segCell(k, u_pos, rd, segBest, segI); lastCell = k; } if (segBest <= t) break; }
                float dt = clamp(abs(gap) * 0.45, 0.0008, 0.02 + 0.05 * t);
                if (u_slabOn > 0.5) { vec4 s0 = SL(p.xy); if (s0.a > 0.5) dt = min(dt, max(0.0008, 0.45 * min(abs(p.z - s0.r), abs(p.z - s0.g)))); else dt = min(dt, 0.006); }   // §5.4: a thin shell is not stepped over
                if (u_segOn > 0.5) dt = min(dt, 0.012);                               // never past a cell of the segment grid
                prevT = t; prevGap = gap; t += dt;
                if (t > u_far) break;
                p = u_pos + rd * t; gap = p.z - H(p.xy);
                vec4 sl = SL(p.xy);                                                 // the slab: crossing its top from above, or stepping into it
                if (sl.b > 0.5 && p.z <= sl.r && (zPrev > sl.r || p.z >= sl.g)) { hit = t; slab = 1.0; break; }
                zPrev = p.z;
                if (gap < 0.0) { hit = t; break; }
            }
            bool tube = segI >= 0 && (hit < 0.0 || segBest < hit);
            if (tube) { hit = segBest; slab = 0.0; }
            if (hit < 0.0) {                                                    // the sky of the anterior chamber
                if (u_mode > 2.5) { o = vec4(0.0, 0.0, 0.0, 0.0); return; }      // 'height': nothing was hit
                float k = clamp(rd.z * 2.0, 0.0, 1.0);
                o = vec4(mix(vec3(0.05, 0.06, 0.08), vec3(0.10, 0.12, 0.16), k), 1.0); return;
            }
            for (int i = 0; i < 24; i++) { if (tube) break;                    // bisect onto the surface (the slab's top when the slab was hit); a tube's hit is exact
                float m = 0.5 * (prevT + hit); vec3 q = u_pos + rd * m;
                bool under = slab > 0.5 ? (SL(q.xy).b > 0.5 && q.z <= SL(q.xy).r) : (q.z - H(q.xy) < 0.0);
                if (under) hit = m; else prevT = m;
            }
            vec3 P = u_pos + rd * hit;
            float e = 0.0015;                                                   // 1.5 µm: the finest the bake resolves
            vec3 N;
            vec3 tubeAlb = vec3(0.0);
            if (tube) { vec4 A = texelFetch(u_seg, ivec2(3 * (segI % 1024), segI / 1024), 0), B = texelFetch(u_seg, ivec2(3 * (segI % 1024) + 1, segI / 1024), 0);
                vec3 pa = segP(A), pb = segP(B), ba = pb - pa; float hq = clamp(dot(P - pa, ba) / max(dot(ba, ba), 1e-12), 0.0, 1.0);
                N = normalize(P - (pa + ba * hq)); tubeAlb = texelFetch(u_seg, ivec2(3 * (segI % 1024) + 2, segI / 1024), 0).rgb; }
            else if (slab > 0.5) { float t0_ = SL(P.xy).r; vec4 sR = SL(P.xy + vec2(e, 0.0)), sL = SL(P.xy - vec2(e, 0.0)), sU = SL(P.xy + vec2(0.0, e)), sD = SL(P.xy - vec2(0.0, e)); float tR = sR.a > 0.5 ? sR.r : t0_, tL = sL.a > 0.5 ? sL.r : t0_, tU = sU.a > 0.5 ? sU.r : t0_, tD = sD.a > 0.5 ? sD.r : t0_;
                N = normalize(vec3(-(tR - tL) / (2.0 * e), -(tU - tD) / (2.0 * e), 1.0)); }
            else N = normalize(vec3(-(H(P.xy + vec2(e, 0.0)) - H(P.xy - vec2(e, 0.0))) / (2.0 * e),
                                    -(H(P.xy + vec2(0.0, e)) - H(P.xy - vec2(0.0, e))) / (2.0 * e), 1.0));
            vec3 toL = u_pos + vec3(0.0, 0.0, u_lightUp) - P;                   // the probe's own lamp, liftable
            float dist = length(toL); toL /= max(dist, 1e-6);
            float lam = max(dot(N, toL), 0.0) / (1.0 + 6.0 * dist * dist);       // close light, so it falls off fast
            // is the lamp's path to this point blocked? one cheap march back toward it
            float sh = 1.0;
            if (u_segOn > 0.5) {                                                 // a traced strand between here and the lamp
                vec3 so = P + N * 0.0008; float sb = dist; int si = -1, lc = -2;
                for (int i = 0; i <= 40; i++) { vec3 q = so + toL * (dist * float(i) / 40.0); int k = cellOf(q.xy); if (k != lc) { if (k >= 0) segCell(k, so, toL, sb, si); lc = k; } }
                if (si >= 0 && sb < dist) sh = 0.0;
            }
            for (int i = 1; i <= 24; i++) {
                float ts = dist * float(i) / 25.0; vec3 q = P + toL * ts;
                if (q.z < H(q.xy) - 0.0004) { sh = 0.0; break; }
                if (i > 1 && inSlab(q)) { sh = 0.0; break; }                       // a bridge between here and the lamp
            }
            if (u_mode > 2.5) {                                                  // 'height': the hit's z, linear, for reading back
                o = vec4(vec3(clamp((P.z - u_zLo) / max(u_zHi - u_zLo, 1e-5), 0.0, 1.0)), 1.0); return;
            }
            vec3 base = u_mode > 1.5 ? turbo((P.z - u_zLo) / max(u_zHi - u_zLo, 1e-5))
                      : (u_mode > 0.5 ? vec3(0.55) : (tube ? tubeAlb : (slab > 0.5 ? SLALB(P.xy) : ALB(P.xy))) * 1.6);
            vec3 col = base * (u_ambient + (1.0 - u_ambient) * lam * mix(0.25, 1.0, sh));
            if (u_contour > 0.0) {                                              // height contours, every u_contour mm
                float f = abs(fract(P.z / u_contour + 0.5) - 0.5) / max(fwidth(P.z / u_contour), 1e-4);
                col = mix(col, vec3(0.95, 0.98, 1.0), 0.35 * (1.0 - smoothstep(0.0, 1.2, f)));
            }
            col *= exp(-hit * 0.35);                                             // a little depth haze so distance reads
            o = vec4(pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
        }`;

    /**
     * Render the probe's view. Everything is where you would say it in words:
     *   at        [x, y] in fit pixels — the place on the iris to stand
     *   heightUm  how far above the LOCAL surface to float (negative goes below it, down in the canyon)
     *   yaw       degrees, 0 looks along +u (round the iris), 90 looks outward along +v
     *   pitch     degrees, negative looks down at the floor, 0 is level — a grazing look
     *   mode      'albedo' (as lit) · 'clay' (neutral, for reading shape) · 'elevation' (turbo by height)
     */
    T.probe = function (opts = {}) {
        if (!T.albedo) throw new Error('tissue: bake first');
        const pr = programs(), w = opts.w || 640, h = opts.h || 420;
        const src = (opts.window === false || !T.win) ? { alb: T.albedo, aux: T.aux, rect: T.rect } : { alb: T.win.albedo, aux: T.win.aux, rect: T.win.rect };
        // where to stand
        let uv = opts.uv;
        if (!uv) { const at = opts.at || [E.fit.fit.W / 2, E.fit.fit.H / 2]; uv = uvAt(F.getMap(), F.fit.W, F.fit.H, at[0], at[1]); }
        if (!uv) throw new Error('tissue: that point is not on the iris');
        const r0 = 2 + 4 * uv[1];
        const ground = (() => { const a = auxRead(uv[0], uv[1], uv[0], uv[1]).at(uv[0], uv[1]); return a ? a.surfaceMm : 0; })();
        const hUp = (opts.heightUm === undefined ? 120 : opts.heightUm) / 1000;
        const yaw = (opts.yaw || 0) * Math.PI / 180, pitch = (opts.pitch === undefined ? -8 : opts.pitch) * Math.PI / 180;
        const fwd = [Math.cos(yaw) * Math.cos(pitch), Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch)];
        const right = [-Math.sin(yaw), Math.cos(yaw), 0];
        const up = [-Math.sin(pitch) * Math.cos(yaw), -Math.sin(pitch) * Math.sin(yaw), Math.cos(pitch)];   // cross(fwd, right)
        if (!T.pfb) { T.pfb = gl.createFramebuffer(); }
        if (!T.ptex || T.ptexSize !== w + 'x' + h) {
            if (T.ptex) gl.deleteTexture(T.ptex);
            T.ptex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, T.ptex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            T.ptexSize = w + 'x' + h;
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, T.pfb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, T.ptex, 0);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0]); gl.viewport(0, 0, w, h);
        gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
        const G = T.layered && src.alb === T.albedo ? segmentGrid() : null;       // §5.4 L0: the traced strands — built BEFORE the bindings below (creating a texture binds it to the active unit)
        const P = pr.probe, u = n => P.loc(n); gl.useProgram(P);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.alb); gl.uniform1i(u('u_alb'), 0);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, src.aux); gl.uniform1i(u('u_aux'), 1);
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, T.slab || src.aux); gl.uniform1i(u('u_slab'), 2);
        gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, T.slabAlb || src.alb); gl.uniform1i(u('u_slabAlb'), 3);
        gl.uniform1f(u('u_slabOn'), (T.slab && (T.slabCurves > 0 || T.layered) && src.alb === T.albedo) ? 1 : 0);   // the window has no slab of its own yet
        gl.uniform1f(u('u_layered'), T.layered && src.alb === T.albedo ? 1 : 0);
        gl.uniform1f(u('u_segOn'), G && G.n ? 1 : 0);
        if (G && G.n) { gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, G.seg); gl.uniform1i(u('u_seg'), 4);
            gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, G.head); gl.uniform1i(u('u_cellH'), 5);
            gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, G.idx); gl.uniform1i(u('u_cellI'), 6);
            gl.uniform2f(u('u_gridN'), G.nU, G.nV); gl.uniform4f(u('u_gridR'), G.rect[0], G.rect[1], G.rect[2], G.rect[3]); }
        gl.uniform4f(u('u_rect'), src.rect[0], src.rect[1], src.rect[2], src.rect[3]);
        gl.uniform2f(u('u_uv0'), uv[0], uv[1]); gl.uniform1f(u('u_r0'), r0);
        gl.uniform3f(u('u_pos'), 0, 0, ground + hUp);
        gl.uniform3f(u('u_fwd'), fwd[0], fwd[1], fwd[2]);
        gl.uniform3f(u('u_right'), right[0], right[1], right[2]);
        gl.uniform3f(u('u_up'), up[0], up[1], up[2]);
        gl.uniform1f(u('u_tanHalf'), Math.tan((opts.fov === undefined ? 75 : opts.fov) * Math.PI / 360));
        gl.uniform1f(u('u_aspect'), w / h);
        gl.uniform1f(u('u_far'), opts.farMm || 2.5);
        gl.uniform1f(u('u_mode'), { albedo: 0, clay: 1, elevation: 2, height: 3 }[opts.mode || 'albedo']);
        gl.uniform1f(u('u_contour'), (opts.contourUm === undefined ? 0 : opts.contourUm) / 1000);
        gl.uniform1f(u('u_lightUp'), (opts.lampUm === undefined ? 60 : opts.lampUm) / 1000);
        gl.uniform1f(u('u_ambient'), opts.ambient === undefined ? 0.18 : opts.ambient);
        const dh = T.deckH || 0.1, floor = -( (cryptDepth() || 0) + dh * (T.deckZ === undefined ? 1 : T.deckZ));
        gl.uniform1f(u('u_zLo'), opts.zLoMm === undefined ? floor : opts.zLoMm);
        gl.uniform1f(u('u_zHi'), opts.zHiMm === undefined ? 0.02 : opts.zHiMm);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        const px = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.drawBuffers([gl.BACK]); gl.viewport(0, 0, E.canvas.width, E.canvas.height);
        const out = new Uint8ClampedArray(w * h * 4);
        for (let y = 0; y < h; y++) out.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);   // GL is bottom-up
        return { data: new ImageData(out, w, h), uv, r0, groundUm: +(ground * 1000).toFixed(1),
                 standingAtUm: +((ground + hUp) * 1000).toFixed(1), fineWindow: src !== T.albedo && !!T.win };
    };

    // ---------------------------------------------------------------- study/11 §5.1 / §5.2.2: parents and their instances
    // A strand bundle is not N independent curves: it is a PARENT spline plus parameters, and its instances are generated
    // from it — reshape the parent and every instance re-flows. The same parent drives both layers: deck strands (in the
    // fibres set, seen through the crypts) and sheet streaks (in the guides set). Instances carry `parent` and `inst`; only
    // parents and their genes need to be stored, the instances regenerate identically from the seed. Every change is an op in
    // the journal (G4), so undo, the session file and a replay cover it. Actualize (iori) freezes a parent's instances into
    // parents of their own, editable point by point; they keep `from` as a record.
    T.parents = [];
    const PARENT_DEFAULTS = { count: 6, spreadMm: 0.10, wavinessMm: 0.014, waveLenMm: 0.30, widthMm: 0, floatMm: 0.06, sagMm: 0.02, taperMm: 0.10, brightness: 1.0, seed: 1, braid: 0, braidTurns: 1.5, braidFill: 0.85, braidSplayMm: 0.08, braidLoose: 0.25 };   // braid ≥ 2: each floating instance is a braid of that many children (§5.2.5)
    const circMm = v => 6.2831853 * (2 + 4 * v);                                 // mm round the eye at tissue v
    const mmBetween = (a, b) => { let du = b[0] - a[0]; du -= Math.round(du); return Math.hypot(du * circMm(0.5 * (a[1] + b[1])), (b[1] - a[1]) * 4); };
    /** centripetal Catmull-Rom through control points in tissue (u, v), u unwrapped, resampled every `step` mm */
    function splineSamples(ctrl, step = 0.020) {
        const P = ctrl.map(q => q.slice()); for (let j = 1; j < P.length; j++) { let du = P[j][0] - P[j - 1][0]; du -= Math.round(du); P[j][0] = P[j - 1][0] + du; }
        if (P.length === 1) return [P[0]];
        if (P.length === 2) { const out = []; const L = mmBetween(P[0], P[1]), n = Math.max(1, Math.round(L / step)); for (let i = 0; i <= n; i++) out.push([P[0][0] + (P[1][0] - P[0][0]) * i / n, P[0][1] + (P[1][1] - P[0][1]) * i / n]); return out; }
        const pts = [P[0], ...P, P[P.length - 1]], out = [];
        const tj = (ti, a, b) => ti + Math.sqrt(mmBetween(a, b));
        for (let k = 1; k < pts.length - 2; k++) {
            const p0 = pts[k - 1], p1 = pts[k], p2 = pts[k + 1], p3 = pts[k + 2];
            const t0 = 0, t1 = tj(t0, p0, p1) || 1e-6, t2 = tj(t1, p1, p2), t3 = tj(t2, p2, p3);
            if (t2 - t1 < 1e-9) continue;
            const n = Math.max(1, Math.round(mmBetween(p1, p2) / step));
            for (let i = (k === 1 ? 0 : 1); i <= n; i++) {
                const t = t1 + (t2 - t1) * i / n, w = (ta, tb) => (tb - t) / (tb - ta || 1e-9), q = (a, b, ta, tb) => [w(ta, tb) * a[0] + (1 - w(ta, tb)) * b[0], w(ta, tb) * a[1] + (1 - w(ta, tb)) * b[1]];
                const A1 = q(p0, p1, t0, t1), A2 = q(p1, p2, t1, t2), A3 = q(p2, p3, t2, t3), B1 = q(A1, A2, t0, t2), B2 = q(A2, A3, t1, t3);
                out.push(q(B1, B2, t1, t2));
            }
        }
        return out;
    }
    /** nearest measured sample of a set to (u, v): { curve, i } — bucketed once per set per load */
    const sampleIndex = {};
    function nearestSample(set, u, v) {
        let ix = sampleIndex[set]; const list = T.sets[set] || [], meas = list.filter(c => c.inst === undefined);   // measured (and painted) curves only, never a generated instance
        if (!ix || ix.list !== list || ix.n !== meas.length) { const cell = 0.004, grid = new Map(); for (const c of meas) if (c.uv && c.xy) c.uv.forEach((q, i) => { if (!q) return; const k = Math.floor((((q[0] % 1) + 1) % 1) / cell) + ',' + Math.floor(q[1] / cell); let b = grid.get(k); if (!b) grid.set(k, b = []); b.push([q[0], q[1], c, i]); }); ix = sampleIndex[set] = { list, n: meas.length, cell, grid, nu: Math.round(1 / cell) }; }
        const cu = Math.floor((((u % 1) + 1) % 1) / ix.cell), cv = Math.floor(v / ix.cell); let best = null, bd = 1e18;
        for (let r = 1; r <= 8 && !best; r++) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) { const b = ix.grid.get(((cu + dx + ix.nu) % ix.nu) + ',' + (cv + dy)); if (!b) continue;
            for (const e of b) { let du = e[0] - u; du -= Math.round(du); const d = (du * circMm(v)) ** 2 + ((e[1] - v) * 4) ** 2; if (d < bd) { bd = d; best = e; } } }
        return best ? { curve: best[2], i: best[3], dMm: Math.sqrt(bd) } : null;
    }
    const seededNoise = (R, n) => { const d = []; for (let i = 0; i < n; i++) d.push(R() * 2 - 1); const s = t => t * t * (3 - 2 * t); return x => { const i = Math.floor(x), f = s(x - i); return (1 - f) * d[((i % n) + n) % n] + f * d[(((i + 1) % n) + n) % n]; }; };
    /** the instances of a parent: `count` curves laid along its spline — the first on it, the rest spread across it, each
     *  with its own gentle wave; width, colour and (deck) height from the params, the light's position from the nearest
     *  measured sample (as the brushes). Deck instances taper at their ends: thinner and diving to rest on the floor. */
    function instancesOf(par) {
        const prm = Object.assign({}, PARENT_DEFAULTS, par.params), deck = par.layer === 'deck', set = deck ? 'fibres' : 'guides', rK = (T.src.z || {}).rK || RK_DEFAULT;
        const out = par.bridges ? bridgesOf(par) : [];
        if (par.frozen && !par.edited) { out.push(Object.assign(clone(par.frozen), { parent: par.id, inst: 0 })); return out; }   // an actualized child, untouched: the same shape
        if (!(prm.count > 0)) return out;
        const P = splineSamples(par.spline); if (P.length < 2) return out;
        const arc = [0]; for (let j = 1; j < P.length; j++) arc.push(arc[j - 1] + mmBetween(P[j - 1], P[j])); const total = arc[arc.length - 1] || 1e-6;
        const mid = nearestSample(set, ((P[P.length >> 1][0] % 1) + 1) % 1, P[P.length >> 1][1]);
        const wMed = prm.widthMm > 0 ? (deck ? prm.widthMm / (2 * rK) : prm.widthMm) : (mid ? mid.curve.w[mid.i] : (deck ? 0.014 : 0.03));
        for (let k = 0; k < Math.max(1, prm.count | 0); k++) {
            const R = rng((prm.seed | 0) * 1000003 + k * 7919 + 1), off = k === 0 ? 0 : (R() - 0.5) * 2 * prm.spreadMm, ph = R() * 6.2831853, amp = prm.wavinessMm * (0.5 + R()), wl = prm.waveLenMm * (0.7 + 0.6 * R()), bright = seededNoise(R, 64), wk = 0.8 + 0.4 * R();
            const uv = [], xy = [], w = [], z = [], zc = [], rgb = [], val = [], base = [];
            for (let j = 0; j < P.length; j++) {
                const a = P[Math.max(0, j - 1)], b = P[Math.min(P.length - 1, j + 1)], cm = circMm(P[j][1]);
                let tx = (b[0] - a[0]) * cm, ty = (b[1] - a[1]) * 4; const L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L;
                const d = off + amp * Math.sin(6.2831853 * arc[j] / wl + ph), q = [P[j][0] - ty * d / cm, P[j][1] + tx * d / 4]; q[0] = ((q[0] % 1) + 1) % 1;
                const near = nearestSample(set, q[0], q[1]); if (!near || near.dMm > 0.6) continue;           // off the tissue (or far from anything measured): skipped
                const s = arc[j] / total, endMm = Math.min(arc[j], total - arc[j]), taper = prm.taperMm > 0 ? Math.min(1, endMm / prm.taperMm) : 1;
                const ww = wMed * wk * (0.85 + 0.3 * R()) * (0.4 + 0.6 * taper), mod = 1 + 0.15 * bright(arc[j] / 0.1);
                uv.push(q); xy.push(near.curve.xy[near.i].slice()); w.push(ww);
                const col = (near.curve.rgb && near.curve.rgb[near.i]) || [1, 1, 1];
                if (deck) { const zz = prm.floatMm - prm.sagMm * 4 * s * (1 - s), r = rK * ww; z.push(taper < 1 ? r + (zz - r) * taper : zz); zc.push(0); rgb.push(col.map(c => c * prm.brightness * mod)); }
                else { const nv = near.curve.val ? near.curve.val[near.i] : 1; val.push(1 + (prm.brightness * nv - 1) * taper * mod); base.push(near.curve.base ? near.curve.base[near.i] : 1); rgb.push(col.slice()); }
            }
            if (uv.length < 2) continue;
            const c = deck ? { uv, xy, w, z, zc, rgb, r: w.map(q => rK * q) } : { uv, xy, w, val, base, rgb };
            out.push(Object.assign(c, { provenance: par.provenance === 'inferred' ? 'inferred' : 'seeded', parent: par.id, inst: k }));
        }
        if (deck && prm.braid >= 2) out.forEach((c, i) => { c.braid = { n: prm.braid, turnsPerMm: prm.braidTurns, fill: prm.braidFill, splayMm: prm.braidSplayMm, loose: prm.braidLoose, seed: (prm.seed | 0) * 97 + i }; });
        return out;
    }
    const parentById = id => T.parents.find(p => p.id === id);
    function regen(par) {                          // replace a parent's instances in its set (measured fragments tagged with the parent stay)
        const set = par.layer === 'deck' ? 'fibres' : 'guides', list = curvesOf(set);
        for (let i = list.length - 1; i >= 0; i--) if (list[i].parent === par.id && list[i].inst !== undefined) list.splice(i, 1);
        if (par.fragments) for (const i of par.fragments) if (list[i]) list[i].parent = par.actualized ? undefined : par.id;
        if (!par.actualized) for (const c of instancesOf(par)) list.push(c);
        T.dirty = true; T.deckH = undefined;
    }
    /** the bridges of a roots parent: one generated curve per join, a cubic from fragment A's end along its tangent to fragment
     *  B's end along B's, sampled every 20 µm, width / height / colour interpolated between the two ends. What the shards lacked. */
    function bridgesOf(par) {
        const fib = curvesOf('fibres'), rK = (T.src.z || {}).rK || RK_DEFAULT, out = [];
        par.bridges.forEach((br, bi) => {
            const A = fib[br.a[0]], B = fib[br.b[0]], ia = br.a[1], ka = br.a[2], ib = br.b[1], kb = br.b[2]; if (!A || !B || !A.uv[ia] || !B.uv[ib] || !A.uv[ka] || !B.uv[kb]) return;
            const pa = A.uv[ia], pb = B.uv[ib], cm = circMm(0.5 * (pa[1] + pb[1]));
            let ta = [pa[0] - A.uv[ka][0], pa[1] - A.uv[ka][1]]; ta[0] -= Math.round(ta[0]); let tb = [B.uv[kb][0] - pb[0], B.uv[kb][1] - pb[1]]; tb[0] -= Math.round(tb[0]);
            const nrm = t => { const x = t[0] * cm, y = t[1] * 4, L = Math.hypot(x, y) || 1; return [x / L, y / L]; }; ta = nrm(ta); tb = nrm(tb);
            let d = [pb[0] - pa[0], pb[1] - pa[1]]; d[0] -= Math.round(d[0]); const gap = Math.hypot(d[0] * cm, d[1] * 4), n = Math.max(2, Math.round(gap / 0.02));
            const uv = [], xy = [], w = [], z = [], zc = [], rgb = [];
            for (let q = 0; q <= n; q++) {
                const s = q / n, h10 = s ** 3 - 2 * s ** 2 + s, h01 = -2 * s ** 3 + 3 * s ** 2, h11 = s ** 3 - s ** 2;
                const mx = h10 * gap * ta[0] + h01 * (d[0] * cm) + h11 * gap * tb[0], my = h10 * gap * ta[1] + h01 * (d[1] * 4) + h11 * gap * tb[1];
                const p = [(((pa[0] + mx / cm) % 1) + 1) % 1, pa[1] + my / 4]; const near = nearestSample('fibres', p[0], p[1]); if (!near) continue;
                uv.push(p); xy.push(near.curve.xy[near.i].slice());
                const lerp = (x, y) => x + (y - x) * s; w.push(lerp(A.w[ia], B.w[ib])); z.push(lerp(A.z ? A.z[ia] : rK * A.w[ia], B.z ? B.z[ib] : rK * B.w[ib])); zc.push(0);
                rgb.push([0, 1, 2].map(t => lerp(A.rgb[ia][t], B.rgb[ib][t])));
            }
            if (uv.length >= 2) out.push({ uv, xy, w, z, zc, rgb, r: w.map(q => rK * q), provenance: 'inferred', parent: par.id, inst: 1000 + bi, bridge: true });
        });
        return out;
    }
    // §5.2.5 B1 (iori, 2026-09-27: "the bridge reads as a displaced tube"): a floating strand as a BRAID — n thinner children
    // twisting gently round its centreline, pressed together inside the tube's own radius, loosening apart where the bridge
    // lands in the deck. Expanded at bake time, never stored: the tube stays the unit the data, the ops and the selection
    // know, and only its spec ships (a parent's params, or T.braid for floating strands without one). At the whole eye a
    // child is under a pixel and the braid averages back into the tube; it is a close-up's detail.
    const BRAID_DEFAULTS = { n: 4, turnsPerMm: 1.5, fill: 0.85, splayMm: 0.08, loose: 0.25, seed: 1 };
    T.braid = null;                                 // e.g. { n: 4 }: braid every floating strand that has no spec of its own
    function braidOf(c, spec, rK) {
        const S = Object.assign({}, BRAID_DEFAULTS, spec), n = Math.max(2, Math.min(8, S.n | 0));
        // resample to ≤ 12 µm so a turn is smooth whatever the tube's own spacing
        const U = [], W = [], Z = [], C = [], X = [];
        for (let i = 0; i < c.uv.length; i++) {
            if (!c.uv[i]) continue;
            if (U.length) { const a = U[U.length - 1]; let b = c.uv[i].slice(); b[0] = a[0] + ((b[0] - a[0]) - Math.round(b[0] - a[0]));
                const m = Math.max(1, Math.ceil(mmBetween(a, b) / 0.012)), w0 = W[W.length - 1], z0 = Z[Z.length - 1], c0 = C[C.length - 1];
                for (let q = 1; q <= m; q++) { const s = q / m; U.push([a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s]); W.push(w0 + (c.w[i] - w0) * s); Z.push(z0 + (c.z[i] - z0) * s); C.push(c0.map((x, t) => x + (c.rgb[i][t] - x) * s)); X.push(q < m ? X[X.length - 1] : c.xy[i]); }
            } else { U.push(c.uv[i].slice()); W.push(c.w[i]); Z.push(c.z[i]); C.push(c.rgb[i]); X.push(c.xy[i]); }
        }
        if (U.length < 2) return [c];
        const arc = [0]; for (let j = 1; j < U.length; j++) arc.push(arc[j - 1] + mmBetween(U[j - 1], U[j])); const total = arc[arc.length - 1] || 1e-6;
        const kc = Math.sqrt(S.fill / n), kr = 1 - kc;                               // child radius and helix radius, as fractions of the tube's
        const kids = [];
        for (let k = 0; k < n; k++) { const R = rng((S.seed | 0) * 7919 + k * 104729 + 17);
            kids.push({ ph: 6.2831853 * (k + S.loose * (R() - 0.5)) / n, rho: 1 + S.loose * (R() - 0.5), wob: seededNoise(R, 64), rad: seededNoise(R, 64), br: 1 + 0.24 * (R() - 0.5), grain: seededNoise(R, 64) }); }
        const phase = (kd, s) => kd.ph + 6.2831853 * S.turnsPerMm * s + 1.2 * S.loose * kd.wob(s / 0.25);
        // where the bridge lands the children fan out ACROSS it, each to a slot in the order they arrive in, so none crosses another
        const slots = end => { const s = end ? total : 0, ord = kids.map((kd, k) => [Math.cos(phase(kd, s)), k]).sort((a, b) => a[0] - b[0]), out = new Array(n); ord.forEach(([, k], r) => { out[k] = n > 1 ? 2 * r / (n - 1) - 1 : 0; }); return out; };
        const slotA = slots(false), slotB = slots(true);
        return kids.map((kd, k) => {
            const uv = [], xy = [], w = [], z = [], zc = [], rgb = [];
            for (let j = 0; j < U.length; j++) {
                const a = U[Math.max(0, j - 1)], b = U[Math.min(U.length - 1, j + 1)], cm = circMm(U[j][1]);
                let tx = (b[0] - a[0]) * cm, ty = (b[1] - a[1]) * 4; const L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L;
                const Rt = rK * W[j], rho = kr * Rt * kd.rho * (1 + 0.3 * S.loose * kd.rad(arc[j] / 0.2)), ph = phase(kd, arc[j]);
                const endMm = Math.min(arc[j], total - arc[j]), e0 = S.splayMm > 0 ? Math.max(0, 1 - endMm / S.splayMm) : 0, e = e0 * e0 * (3 - 2 * e0);
                const slot = arc[j] < 0.5 * total ? slotA[k] : slotB[k];
                const across = (1 - e) * rho * Math.cos(ph) + e * slot * (Rt + kc * Rt), up = (1 - e) * rho * Math.sin(ph);
                const q = [U[j][0] - ty * across / cm, U[j][1] + tx * across / 4]; q[0] = ((q[0] % 1) + 1) % 1;
                uv.push(q); xy.push(X[j]); w.push(kc * W[j]); z.push(Z[j] + up); zc.push(0);
                const m = kd.br * (1 + 0.08 * kd.grain(arc[j] / 0.05)); rgb.push(C[j].map(x => x * m));
            }
            return { uv, xy, w, z, zc, rgb, r: w.map(x => rK * x), provenance: c.provenance, parent: c.parent, inst: c.inst, bridge: c.bridge, braided: k };
        });
    }
    T.braidOf = (c, spec) => braidOf(c, spec, (T.src.z || {}).rK || RK_DEFAULT);
    let parentSeq = 1;
    /** the parent ops: addParent · setParams · moveParentPoint · insertParentPoint · removeParentPoint · deleteParent · actualize */
    function applyParentOp(op) {
        switch (op.t) {
            case 'addParent': { const par = clone(op.parent); if (!par.id) par.id = 'p' + (parentSeq++); else parentSeq = Math.max(parentSeq, parseInt(String(par.id).replace(/\D/g, '') || '0', 10) + 1);
                if (!par.layer) par.layer = 'deck'; if (!par.params) par.params = {}; if (!par.provenance) par.provenance = 'seeded'; T.parents.push(par); op.parent = clone(par); op.undo = { id: par.id }; regen(par); return true; }
            case 'setParams': { const par = parentById(op.id); if (!par) throw new Error('tissue: no parent ' + op.id); op.undo = { params: clone(par.params) }; Object.assign(par.params, op.params); regen(par); return true; }
            case 'moveParentPoint': { const par = parentById(op.id); op.undo = { uv: par.spline[op.i].slice(), edited: par.edited }; par.spline[op.i] = op.uv.slice(); par.edited = true; regen(par); return true; }
            case 'insertParentPoint': { const par = parentById(op.id); par.spline.splice(op.i, 0, op.uv.slice()); op.undo = { i: op.i, edited: par.edited }; par.edited = true; regen(par); return true; }
            case 'removeParentPoint': { const par = parentById(op.id); if (par.spline.length <= 2) throw new Error('tissue: a parent keeps at least two points'); op.undo = { i: op.i, uv: par.spline[op.i].slice(), edited: par.edited }; par.spline.splice(op.i, 1); par.edited = true; regen(par); return true; }
            case 'deleteParent': { const k = T.parents.findIndex(p => p.id === op.id); const par = T.parents[k]; op.undo = { at: k, parent: clone(par) }; par.actualized = true; regen(par); T.parents.splice(k, 1); return true; }
            case 'actualize': {                    // every instance becomes a parent of its own (one instance, the same shape), the original stops driving them
                const par = parentById(op.id); const made = [];
                const set = par.layer === 'deck' ? 'fibres' : 'guides', list = curvesOf(set);
                for (const c of list) if (c.parent === par.id && c.inst !== undefined) {
                    // control points every 60 µm: five per wavelength of the instance's wave, so its shape survives the hand-over
                    const ctrl = []; let acc = 0; for (let j = 0; j < c.uv.length; j++) { if (j === 0 || j === c.uv.length - 1 || acc >= 0.06) { ctrl.push(c.uv[j].slice()); acc = 0; } else acc += mmBetween(c.uv[j - 1], c.uv[j]); }
                    const frozen = clone(c); delete frozen.parent; delete frozen.inst;   // the instance as it was: the child shows exactly this until a point of it is edited
                    const child = { id: 'p' + (parentSeq++), layer: par.layer, spline: ctrl, params: Object.assign({}, par.params, { count: 1, spreadMm: 0, wavinessMm: 0, seed: (par.params.seed | 0) * 31 + c.inst }), provenance: par.provenance, from: par.id, actualized: false, frozen };
                    made.push(child);
                }
                op.undo = { children: made.map(m => m.id) }; par.actualized = true; regen(par);
                for (const m of made) { T.parents.push(m); regen(m); }
                op.made = made.map(m => m.id); return true; }
        }
        return false;
    }
    function undoParentOp(op) {
        switch (op.t) {
            case 'addParent': { const k = T.parents.findIndex(p => p.id === op.undo.id); if (k >= 0) { const par = T.parents[k]; par.actualized = true; regen(par); T.parents.splice(k, 1); } break; }
            case 'setParams': { const par = parentById(op.id); par.params = op.undo.params; regen(par); break; }
            case 'moveParentPoint': { const par = parentById(op.id); par.spline[op.i] = op.undo.uv; par.edited = op.undo.edited; regen(par); break; }
            case 'insertParentPoint': { const par = parentById(op.id); par.spline.splice(op.undo.i, 1); par.edited = op.undo.edited; regen(par); break; }
            case 'removeParentPoint': { const par = parentById(op.id); par.spline.splice(op.undo.i, 0, op.undo.uv); par.edited = op.undo.edited; regen(par); break; }
            case 'deleteParent': { const par = op.undo.parent; par.actualized = false; T.parents.splice(op.undo.at, 0, par); regen(par); break; }
            case 'actualize': { for (const id of op.undo.children) { const k = T.parents.findIndex(p => p.id === id); if (k >= 0) { const ch = T.parents[k]; ch.actualized = true; regen(ch); T.parents.splice(k, 1); } }
                const par = parentById(op.id); par.actualized = false; regen(par); break; }
        }
    }
    /** a parent grown from a point along the field: the flow followed both ways for `lengthMm`, control points every 0.3 mm */
    T.growParentFrom = function (u, v, lengthMm = 1.0, layer = 'deck', params = {}) {
        const step = 0.02, halves = [];
        for (const sgn of [1, -1]) {
            const pts = []; let q = [u, v], t = null;
            for (let k = 0; k < lengthMm / 2 / step; k++) {
                const f = T.fieldAt(layer, q[0], q[1]); let th = f.flow; if (t !== null && Math.cos(th - t) < 0) th += Math.PI;   // keep going the same way
                t = th; q = [q[0] + sgn * step * Math.sin(th) / circMm(q[1]), q[1] + sgn * step * Math.cos(th) / 4];
                if (q[1] < 0.02 || q[1] > 0.98) break; pts.push(q);
            }
            halves.push(pts);
        }
        const all = halves[1].reverse().concat([[u, v]], halves[0]), ctrl = []; let acc = 0;
        for (let j = 0; j < all.length; j++) { if (j === 0 || j === all.length - 1 || acc >= 0.30) { ctrl.push(all[j]); acc = 0; } else acc += mmBetween(all[j - 1], all[j]); }
        return T.apply({ t: 'addParent', parent: { layer, spline: ctrl, params, provenance: 'seeded' } });
    };
    /** §5.2.1 → §5.2.2: every root of the loaded eye becomes a parent — its spline through the chained fragments' samples,
     *  the fragments tagged as its measured instances, and a generated BRIDGE across each join (from end to end along the
     *  join's own curve, width, height and colour interpolated between the two ends). The bridges are what the shards lacked. */
    T.parentsFromRoots = function (opts = {}) {
        const roots = T.src && T.src.roots; if (!roots || !roots.roots) { say('no roots in this eye'); return 0; }
        const fib = curvesOf('fibres'), rK = (T.src.z || {}).rK || RK_DEFAULT; let made = 0, bridges = 0;
        const linkAt = {}; for (const L of roots.links) { linkAt[L.a.join(':')] = L; linkAt[L.b.join(':')] = L; }
        for (const root of roots.roots) {
            const ids = root.fibres.map(f => f[0]); if (ids.some(i => !fib[i] || !fib[i].uv)) continue;
            const chain = [];                                                    // the samples in root order, fragments reversed where flagged
            for (const [i, rev] of root.fibres) { const c = fib[i]; const uv = rev ? c.uv.slice().reverse() : c.uv; for (const q of uv) if (q) chain.push(q); }
            if (chain.length < 4) continue;
            const ctrl = []; let acc = 0; for (let j = 0; j < chain.length; j++) { if (j === 0 || j === chain.length - 1 || acc >= 0.30) { ctrl.push(chain[j].slice()); acc = 0; } else acc += mmBetween(chain[j - 1], chain[j]); }
            const par = { layer: 'deck', spline: ctrl, params: { count: 0 }, provenance: 'inferred', from: { root: roots.roots.indexOf(root) }, bridges: [] };
            // the bridges: one per join between consecutive fragments of this root
            for (let k = 0; k + 1 < root.fibres.length; k++) {
                const [i, ri] = root.fibres[k], [j, rj] = root.fibres[k + 1], ea = ri ? 0 : 1, eb = rj ? 1 : 0;
                const A = fib[i], B = fib[j], ia = ea === 0 ? 0 : A.uv.length - 1, ib = eb === 0 ? 0 : B.uv.length - 1;
                const pa = A.uv[ia], pb = B.uv[ib]; if (!pa || !pb) continue;
                const ka = ea === 0 ? Math.min(3, A.uv.length - 1) : Math.max(0, A.uv.length - 4), kb = eb === 0 ? Math.min(3, B.uv.length - 1) : Math.max(0, B.uv.length - 4);
                if (!A.uv[ka] || !B.uv[kb]) continue;
                par.bridges.push({ a: [i, ia, ka], b: [j, ib, kb] });
            }
            par.fragments = ids; T.apply({ t: 'addParent', parent: par }); made++;
            bridges += par.bridges.length;
        }
        T.dirty = true; T.deckH = undefined; say(`roots → ${made} parents, ${bridges} bridges across their joins`);
        return { parents: made, bridges };
    };
    /** parents as data (for the session file): the ops already carry them; this is the current state for inspection */
    T.parentsJSON = () => T.parents.map(p => clone(p));

    // ---------------------------------------------------------------- Z2 (§32): inspection — the engine's side
    // No panel here: this is the API the UI session's panel is built on. The section reads the PRIMITIVES, not the
    // baked surface, so it sees a tube that lies under another tube — which a height field cannot tell you.
    const MMU = v => 6.2831853 * (2 + 4 * v), MMV = 4;          // mm per unit u at radius v · mm per unit v
    // the floor the renderer actually draws, mm below the sheet: the hole's own wall plus as much of the deck's
    // thickness as deckZ is currently rendering (the anatomy is always the full T.deckH)
    const floorMm = () => -((cryptDepth() || 0) + (T.deckH || 0) * (T.deckZ === undefined ? 1 : T.deckZ));
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
        const ix = fibreIndex(), cell = ix.cell, rK = (T.src.z || {}).rK || RK_DEFAULT, fib = T.sets.fibres || [], out = [];
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
        return T.atUV(uv[0], uv[1]);
    };
    /** elevationAt by tissue coordinates — what the Tissue window reads under the pointer (it maps the LIVE view to (u, v)
     *  itself, so it does not depend on the fit frame). Tube heights: z / top / bottom from the floor up, as tubesAt
     *  gives them; renderedTopUm / renderedZUm absolute, on the same scale as surfaceUm and floorUm. */
    T.atUV = function (u, v) {
        const uv = [u, v];
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
                                          renderedTopUm: +(renderedMm(t.topMm) * 1000).toFixed(1), renderedZUm: +(renderedMm(t.zMm) * 1000).toFixed(1) })) };
    };
    /** A cross-section along a line in fit pixels: the surface, and every tube cut through, as circles. */
    T.section = function (p0, p1, n) {
        const fit = F.fit, map = F.getMap(); n = n || 200;
        const pts = [];
        for (let i = 0; i < n; i++) { const t = i / (n - 1), x = p0[0] + t * (p1[0] - p0[0]), y = p0[1] + t * (p1[1] - p0[1]);
            pts.push({ t, x, y, uv: uvAt(map, fit.W, fit.H, x, y) }); }
        return T.sectionUV(pts);
    };
    /** section() by a list of points that already carry their (u, v) (null = off the iris); x / y are whatever frame the
     *  caller drew the cut in — the Tissue window passes screen points of the live view. */
    T.sectionUV = function (pts) {
        const n = pts.length, uvs = pts.filter(p => p.uv).map(p => p.uv);
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
                                                    offAxisUm: +(q.dMm * 1000).toFixed(1), renderedTopUm: +(renderedMm(q.topMm) * 1000).toFixed(1), renderedZUm: +(renderedMm(q.zMm) * 1000).toFixed(1) })) });
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
        const keep = { rect: T.rect, size: T.size, albedo: T.albedo, aux: T.aux, cellS: T.cellS, cellG: T.cellG, slab: T.slab, slabAlb: T.slabAlb,
                       fill: T.fill, lodBias: T.lodBias, tauUsed: T.tauUsed, full: T.full, fb: T.fb, depth: T.depth };
        const prev = T.win;
        T.albedo = T.aux = T.cellS = T.cellG = T.fill = T.slab = T.slabAlb = null;   // bake() frees what it finds here; the base must not be in reach
        T.fb = null; T.depth = null;
        T.rect = r; T.size = size; T.full = false; T.tauUsed = tau;
        T.lodBias = Math.log2((4 / AH) / tau);
        let win = null;
        try {
            T.bake(opts);
            win = { albedo: T.albedo, aux: T.aux, rect: r, size, tau, lodBias: T.lodBias, cellS: T.cellS, cellG: T.cellG, fill: T.fill, fb: T.fb, depth: T.depth, slab: T.slab, slabAlb: T.slabAlb };
        } finally {
            Object.assign(T, keep);                             // the base is back, whatever happened
        }
        if (prev) for (const k of ['albedo', 'aux', 'cellS', 'cellG', 'fill', 'slab', 'slabAlb']) if (prev[k]) gl.deleteTexture(prev[k]);
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
        T.irr = a; T.irrDims = [W, H]; T.shipped = null; const m = new Float64Array(6); let n = 0;
        for (let k = 0; k < W * H; k++) if (a[k * 7 + 6] > 1e-3 && inR(k)) { for (let t = 0; t < 6; t++) m[t] += a[k * 7 + t] / a[k * 7 + 6]; n++; }
        T.irrMean = Array.from(m, q => q / Math.max(1, n));
        T.irrAt = (x, y) => { const k = (Math.min(H - 1, Math.max(0, Math.round(y * H / T.src.fit[1]))) * W + Math.min(W - 1, Math.max(0, Math.round(x * W / T.src.fit[0])))) * 7, wgt = a[k + 6]; return wgt > 1e-3 ? [0, 1, 2, 3, 4, 5].map(t => a[k + t] / wgt) : T.irrMean; };
        say(`light on a flat region: gain k ${T.irrMean.slice(0, 3).map(q => q.toFixed(3)).join(' ')} · additive s ${T.irrMean.slice(3).map(q => q.toFixed(4)).join(' ')} (blur ${rad} px × 3)`);
        return T;
    };

    // ---------------------------------------------------------------- Z3b (§32): de-light by measurement
    // calibrate() asks the renderer what its LIGHT does to a flat grey region, and keeps the smooth part. This asks
    // the same question of the RELIEF: render the region flat-grey with the geometry on, then with it off, and the
    // ratio is what the geometry does to the light — every term of it, normals, self-shadow, occlusion and all, as
    // the renderer actually computes them, not as an analytic dome cosine predicts (§32.4: that was 3× too strong).
    // Two grey levels each, so the additive part of the render (speculars) cancels and only the gain is compared.
    T.measureDelight = function (opts = {}) {
        const fit = F.fit, W = fit.W, H = fit.H, G = [0.06, 0.30];
        const was = { deckZ: T.deckZ, sheetZ: T.sheetZ, srelAmt: T.srelAmt, on: T.on, view: E.state.view.slice() };
        T.on = true; T.srelAmt = 0;                                  // measure the bare geometry, not a de-lit one
        // The whole eye in one 640 px frame is 28 µm a pixel, and a tube is 60–120 µm across: too coarse to see the
        // profile that is being double-counted. So the eye is measured in TILES, each a view crop rendered at the
        // same 640 px — n × n tiles put the render and the region at the same scale, which is what §32.4 asked for.
        const n = Math.max(1, Math.round(opts.tiles === undefined ? 3 : opts.tiles));   // 3 × 3 ≈ 9 µm a pixel
        const views = [];
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) views.push([i / n, j / n, 1 / n, 1 / n]);
        const lum = px => { const out = new Float32Array(W * H);
            for (let k = 0; k < W * H; k++) { const r = unpost([px[k * 4] / 255, px[k * 4 + 1] / 255, px[k * 4 + 2] / 255]);
                out[k] = 0.2126 * r[0] + 0.7152 * r[1] + 0.0722 * r[2]; } return out; };
        const gain = () => {                                         // k(x) per pixel per tile: the light's gain on a flat albedo
            const per = G.map(g => { T.bake({ grey: g });
                return views.map(v => { E.state.view = v; return lum(F.renderFit()); }); });
            return views.map((v, t) => { const k = new Float32Array(W * H);
                for (let i = 0; i < W * H; i++) k[i] = (per[1][t][i] - per[0][t][i]) / (G[1] - G[0]); return k; });
        };
        const kOn = gain();
        T.deckZ = 0; T.sheetZ = 0; const kOff = gain();
        T.deckZ = was.deckZ; T.sheetZ = was.sheetZ;
        // scatter the ratio into a grid over the region — ≈ 30 µm cells, which is what a 640 px frame of the whole
        // eye can actually resolve; finer than that would be inventing detail the measurement does not have
        const mmW = T.rect[2] * 6.2831853 * (2 + 4 * (T.rect[1] + 0.5 * T.rect[3])), mmH = T.rect[3] * 4;
        const cell = opts.cellMm || 0.015;
        const gw = Math.max(8, Math.min(2048, Math.round(mmW / cell))), gh = Math.max(8, Math.min(512, Math.round(mmH / cell)));
        const acc = new Float32Array(gw * gh), wgt = new Float32Array(gw * gh);
        let nIn = 0;
        views.forEach((v, t) => {
            E.state.view = v; const map = F.getMap();                // each tile's own coordinate map, at its own scale
            for (let k = 0; k < W * H; k++) {
                if (!map.inside[k] || kOff[t][k] < 1e-4) continue;
                const u = map.u[k], vv = map.v[k];
                let cu = (u - T.rect[0]) / T.rect[2]; if (T.full) cu = ((cu % 1) + 1) % 1;
                const cv = (vv - T.rect[1]) / T.rect[3];
                if (cu < 0 || cu >= 1 || cv < 0 || cv >= 1) continue;
                const x = Math.min(gw - 1, Math.floor(cu * gw)), y = Math.min(gh - 1, Math.floor(cv * gh));
                acc[y * gw + x] += kOn[t][k] / kOff[t][k]; wgt[y * gw + x] += 1; nIn++;
            }
        });
        E.state.view = was.view; F.fit.map = null;
        const grid = new Float32Array(gw * gh).fill(1);
        for (let i = 0; i < gw * gh; i++) if (wgt[i] > 0) grid[i] = acc[i] / wgt[i];
        for (let pass = 0; pass < 2; pass++) {                       // fill the cells no pixel landed in, then soften
            const cp = Float32Array.from(grid);
            for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
                const i = y * gw + x; let sm = 0, n = 0;
                for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                    let xx = x + dx; const yy = y + dy;
                    if (T.full) xx = (xx + gw) % gw; else if (xx < 0 || xx >= gw) continue;
                    if (yy < 0 || yy >= gh) continue;
                    sm += cp[yy * gw + xx]; n++;
                }
                if (wgt[i] === 0 || pass === 1) grid[i] = sm / n;
            }
        }
        // Only the FINE part belongs here. calibrate() already measured the light with this geometry in place and
        // toAlbedo divided it out, so the smooth part of what relief does is accounted for twice if it is left in —
        // it was: the raw ratio had mean 0.865 and the eye came out 7.5 MATCH2 worse. Dividing the grid by its own
        // 0.2 mm blur (calibrate's own scale) leaves exactly what the smoothing threw away.
        {
            const rad = Math.max(1, Math.round(0.1 / cell)), sm = new Float32Array(gw * gh);
            for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
                let a = 0, n = 0;
                for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
                    let xx = x + dx; const yy = y + dy;
                    if (T.full) xx = (xx + gw) % gw; else if (xx < 0 || xx >= gw) continue;
                    if (yy < 0 || yy >= gh) continue;
                    a += grid[yy * gw + xx]; n++;
                }
                sm[y * gw + x] = a / Math.max(n, 1);
            }
            for (let i = 0; i < gw * gh; i++) grid[i] = grid[i] / Math.max(sm[i], 1e-3);
        }
        const data = new Float32Array(gw * gh * 4);
        for (let i = 0; i < gw * gh; i++) { data[i * 4] = grid[i]; data[i * 4 + 3] = 1; }
        if (T.srel) gl.deleteTexture(T.srel);
        T.srel = texture(gw, gh, false, data);
        T.srelGrid = { w: gw, h: gh, data: grid };                   // kept for exportMeasurements (study/11 S3)
        let mn = 9, mx = 0, sum = 0; for (let i = 0; i < gw * gh; i++) { mn = Math.min(mn, grid[i]); mx = Math.max(mx, grid[i]); sum += grid[i]; }
        T.srelStats = { grid: [gw, gh], cellUm: +(cell * 1000).toFixed(0), tiles: n, pixels: nIn, min: +mn.toFixed(3), max: +mx.toFixed(3), mean: +(sum / (gw * gh)).toFixed(3) };
        T.on = was.on; T.srelAmt = was.srelAmt;
        T.bake();                                                    // the albedo, now divided by what was measured
        say(`de-light measured: ${gw}×${gh} cells of ${(cell * 1000).toFixed(0)} µm · relief multiplies the light by ${T.srelStats.min}–${T.srelStats.max} (mean ${T.srelStats.mean})`);
        return T.srelStats;
    };

    // ---------------------------------------------------------------- study/11 S3: the measurements, shipped with the eye
    // calibrate() and measureDelight() render flat-grey frames through the engine; they never read the photograph, so they
    // give the same answer on every visit — 60 % of the iPad's 11.9 s. Measured once (the Tissue window's Load button
    // always measures, iori D2), exported here, and the arrival load installs them instead of measuring.
    // Valid only for what they were measured with: the engine, the eye and the dials that reach calibrate / bake. srelAmt
    // and k1 are not in the key — neither reaches a grey bake. A mismatch = measure, as before.
    T.dialKey = () => JSON.stringify({ engine: E.ENGINE_VERSION, eye: T.src && T.src.ref, n: T.src && T.src.fit,
        deckZ: T.deckZ, sheetZ: T.sheetZ, wallZ: T.wallZ === undefined ? 2.5 : T.wallZ, delight: T.delight, margin: T.margin !== false,
        marginKeep: T.marginKeep, marginRound: T.marginRound, margFade: T.margFade });
    const q16 = (v, lo, hi, L = 65535) => Math.max(0, Math.min(L, Math.round((v - lo) / Math.max(hi - lo, 1e-12) * L)));
    const gz = async (bytes, dir) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(dir ? new CompressionStream('gzip') : new DecompressionStream('gzip'))).arrayBuffer());
    // → gzipped bytes: 'IRC1' · u32 header length · header JSON · light (6 planes u16) · shading (u16) · light mask (u8, one
    // per FIT pixel). Every u16 plane is delta-coded along its rows; the light's g and b planes are stored as their
    // difference from r (the light is near-white, so they are almost all zeros). The light is looked up exactly as
    // calibrate's irrAt does — the nearest fit pixel, the mean where the mask is off — because at the pupil margin it
    // falls from ≈ 1 to ≈ 0 within a pixel or two and any interpolation across that edge moves the ruff's albedo.
    // `step` > 1 keeps the light every step fit pixels (the mask stays per pixel).
    T.exportMeasurements = async function (opts = {}) {
        if (!T.irr || !T.irrDims || !T.srelGrid) throw new Error('measure first: the Load button (T.proof without shipped)');
        const [W, H] = T.irrDims, f = opts.step || 1, Li = 2 ** (opts.lightBits || 16) - 1, Ls = 2 ** (opts.shadeBits || 16) - 1, gw = Math.ceil(W / f), gh = Math.ceil(H / f), a = T.irr;
        const cell = new Float64Array(gw * gh * 6), cnt = new Float64Array(gw * gh), mask = new Uint8Array(W * H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const k = (y * W + x) * 7, wgt = a[k + 6]; if (wgt <= 1e-3) continue; mask[y * W + x] = 1;
            const c = ((y / f) | 0) * gw + ((x / f) | 0); for (let t = 0; t < 6; t++) cell[c * 6 + t] += a[k + t] / wgt; cnt[c]++; }
        const lo = [9, 9], hi = [-9, -9];                            // one range for k (rgb), one for s (rgb)
        for (let c = 0; c < gw * gh; c++) if (cnt[c]) for (let t = 0; t < 6; t++) { const v = cell[c * 6 + t] /= cnt[c], g = t < 3 ? 0 : 1; lo[g] = Math.min(lo[g], v); hi[g] = Math.max(hi[g], v); }
        const S = T.srelGrid; let slo = 9, shi = -9; for (const v of S.data) { slo = Math.min(slo, v); shi = Math.max(shi, v); }
        const head = { v: 2, key: T.dialKey(), measured: new Date().toISOString(), quality: E.quality,
            irr: { w: gw, h: gh, step: f, fit: [W, H], lo, hi, L: Li, mean: T.irrMean }, srel: { w: S.w, h: S.h, lo: slo, hi: shi, L: Ls, stats: T.srelStats } };
        const hb = new TextEncoder().encode(JSON.stringify(head)), hpad = (4 - (8 + hb.length) % 4) % 4;
        const u16 = new Uint16Array(6 * gw * gh + S.w * S.h); let o = 0;
        const rows = (w, h, val) => { for (let y = 0; y < h; y++) { let prev = 0; for (let x = 0; x < w; x++) { const q = val(y * w + x); u16[o++] = (q - prev) & 65535; prev = q; } } };
        const qc = (c, t) => cnt[c] ? q16(cell[c * 6 + t], lo[t < 3 ? 0 : 1], hi[t < 3 ? 0 : 1], Li) : 0;
        for (const b of [0, 3]) { rows(gw, gh, c => qc(c, b)); for (const t of [b + 1, b + 2]) rows(gw, gh, c => (qc(c, t) - qc(c, b)) & 65535); }
        rows(S.w, S.h, i => q16(S.data[i], slo, shi, Ls));
        const out = new Uint8Array(8 + hb.length + hpad + u16.byteLength + mask.length), dv = new DataView(out.buffer);
        out.set([73, 82, 67, 49]); dv.setUint32(4, hb.length + hpad, true); out.set(hb, 8); out.fill(32, 8 + hb.length, 8 + hb.length + hpad);
        out.set(new Uint8Array(u16.buffer), 8 + hb.length + hpad); out.set(mask, 8 + hb.length + hpad + u16.byteLength);
        const packed = await gz(out, true);
        say(`measurements exported: light ${gw}×${gh} (every ${f} px), shading ${S.w}×${S.h} · ${(out.length / 1024).toFixed(0)} KB → ${(packed.length / 1024).toFixed(0)} KB gzipped`);
        return { bytes: packed, raw: out.length, head };
    };
    // install shipped measurements; false (and nothing changed) when they do not apply here — the caller then measures
    T.installMeasurements = async function (buf) {
        let b = new Uint8Array(buf);
        if (b[0] === 0x1f && b[1] === 0x8b) { if (typeof DecompressionStream === 'undefined') return false; b = await gz(b, false); }
        if (b[0] !== 73 || b[1] !== 82 || b[2] !== 67 || b[3] !== 49) return false;
        const dv = new DataView(b.buffer, b.byteOffset, b.byteLength), hl = dv.getUint32(4, true);
        const head = JSON.parse(new TextDecoder().decode(b.subarray(8, 8 + hl)));
        if (head.v !== 2 || head.key !== T.dialKey()) { say('shipped measurements do not match these dials — measuring'); T.shipped = { skipped: 'key' }; return false; }
        const { w: gw, h: gh, lo, hi, step: f, fit: [W0, H0], mean, L: Li } = head.irr, S = head.srel, n16 = 6 * gw * gh + S.w * S.h;
        const u16 = new Uint16Array(b.buffer.slice(b.byteOffset + 8 + hl, b.byteOffset + 8 + hl + 2 * n16)), mask = b.slice(8 + hl + 2 * n16, 8 + hl + 2 * n16 + W0 * H0);
        let o = 0; const rows = (w, h, put) => { for (let y = 0; y < h; y++) { let q = 0; for (let x = 0; x < w; x++) { q = (q + u16[o++]) & 65535; put(y * w + x, q); } } };
        const qv = new Uint16Array(gw * gh * 6);
        for (const bb of [0, 3]) { rows(gw, gh, (c, q) => { qv[c * 6 + bb] = q; }); for (const t of [bb + 1, bb + 2]) rows(gw, gh, (c, q) => { qv[c * 6 + t] = (q + qv[c * 6 + bb]) & 65535; }); }
        const irr = new Float32Array(gw * gh * 6); for (let i = 0; i < gw * gh * 6; i++) { const g = (i % 6) < 3 ? 0 : 1; irr[i] = lo[g] + qv[i] / Li * (hi[g] - lo[g]); }
        const grid = new Float32Array(S.w * S.h); rows(S.w, S.h, (i, q) => { grid[i] = S.lo + q / S.L * (S.hi - S.lo); });
        T.irr = true; T.irrDims = null; T.irrMean = mean;
        T.irrAt = (x, y) => {                                        // calibrate's irrAt: the nearest fit pixel of the measured frame
            const px = Math.min(W0 - 1, Math.max(0, Math.round(x * W0 / T.src.fit[0]))), py = Math.min(H0 - 1, Math.max(0, Math.round(y * H0 / T.src.fit[1])));
            if (!mask[py * W0 + px]) return mean;
            const c = (Math.min(gh - 1, (py / f) | 0) * gw + Math.min(gw - 1, (px / f) | 0)) * 6; return [irr[c], irr[c + 1], irr[c + 2], irr[c + 3], irr[c + 4], irr[c + 5]]; };
        const data = new Float32Array(S.w * S.h * 4); for (let i = 0; i < S.w * S.h; i++) { data[i * 4] = grid[i]; data[i * 4 + 3] = 1; }
        if (T.srel) gl.deleteTexture(T.srel);
        T.srel = texture(S.w, S.h, false, data); T.srelGrid = { w: S.w, h: S.h, data: grid }; T.srelStats = S.stats;
        T.shipped = { measured: head.measured, quality: head.quality, light: [gw, gh], step: f, shading: [S.w, S.h] };
        say(`shipped measurements installed (measured ${head.measured.slice(0, 10)} at ${head.quality})`); return true;
    };

    // the whole proof: primitives → region → calibrated albedo → on
    T.proof = async function (url, opts = {}) {
        // opts.onStage(i, n, label): the Tissue window's progress. With it, the page gets a frame between stages (the
        // computation is the same, in the same order); opts.json: primitives already fetched (a re-load after a dial).
        const st = opts.onStage, n = opts.delight !== false ? 6 : 5, stage = async (i, label) => { if (st) { st(i, n, label); await new Promise(r => setTimeout(r, 0)); } };
        await stage(0, 'reading the primitives');
        const json = opts.json || await fetch(url).then(r => r.json()); T.json = json;
        await stage(1, 'mapping them onto the eye'); T.load(json);
        if (T.layered && T.layerDepthsOnLoad) T.layerDepths(true, T.layerDepthsOnLoad === true ? {} : T.layerDepthsOnLoad);   // §5.4 L0: before the light is measured, so it is measured on this geometry
        // study/11 S3: opts.shipped = the eye's measurements (a URL or bytes). Installed → bake + origin, done; they do
        // not apply (dials, engine, no DecompressionStream) → the measured path below, unchanged.
        if (opts.shipped) {
            await stage(2, 'the measured light and shading');
            let ok = false; try { const buf = typeof opts.shipped === 'string' ? await fetch(opts.shipped).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }) : opts.shipped; ok = await T.installMeasurements(buf); } catch (e) { say('shipped measurements unavailable (' + (e && e.message || e) + ') — measuring'); }
            if (ok) { T.on = true; await stage(3, 'baking the tissue'); T.bake(); await stage(4, 'the knob origin'); T.setOrigin(); if (st) st(n, n, 'done'); say('tissue model on (shipped measurements)'); return T.log; }
        }
        await stage(2, 'measuring the light'); T.calibrate();
        await stage(3, 'baking the tissue'); T.bake();
        await stage(4, 'the knob origin'); T.setOrigin();
        if (opts.delight !== false) { await stage(5, 'measuring the shading'); T.measureDelight(opts); }      // ≈ 2 s: what the relief does to the light, measured
        T.on = true; if (st) st(n, n, 'done'); say('tissue model on'); return T.log;
    };
})();
