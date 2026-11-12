// print.js — the bioprint (iori, 2026-11-11). The eye is laid down like pigment cells deposited: along the strands
// first, across later, crypt floors last, each area arriving soft and sharpening behind a thin wet front. One grammar
// for three moments:
//
//   cells  the deposition is cell by cell (study/17 §4.2, Oxman's voxel-printed pigment): a polar lattice of cells round the
//          iris, elongated along the radius like fibres; each cell is born whole at its seed's arrival time and fills as a
//          droplet from the seed, its rim dark while wet.
//   open   the page starts printing at once from a tiny preview of the start eye (data/<ref>.print.jpg: the eye's own
//          render at the start pose; data/<ref>.print.png: the arrival time from the pupil outward and the eye's coverage, built by
//          study/flydown/printprep.py), so the first frame does not wait for the eye file. When the layer model is on,
//          the real frame takes over where the preview printed, sharpening as it accumulates. 10 s (Slow, the default, for inspection) or 2 s (Control ▸ Print); a click or a key
//          skips; the 3.11 shell fades in after (body.iris-printing).
//   edit   a change that cannot update live (atlas bakes, the layer model's knob re-bakes, quality, an eye switch,
//          the layer model on/off) snapshots the frame on screen and prints the new state over it from the view
//          centre, instead of freezing and jumping. Live controls stay live: they never call change().
//   zoom   the fly-down's pages fade in the same way (flydown.js: per-cell delay); its front is not tinted yet.
//
// While no print runs, target() returns null and the engine draws to the canvas exactly as before: the end state is
// the same frame, bit for bit.
(() => {
    const E = window.__irisEngine; if (!E || window.IrisPrint) return;
    const gl = E.gl, canvas = E.canvas;
    const SPEEDS = { inspect: [10, 5], normal: [2.0, 1.1] };          // open, edit (s). iori 2026-11-11: "much slower for inspection"
    let speed = 'inspect'; try { speed = localStorage.getItem('irisPrintSpeed') || 'inspect'; } catch (e) {} if (!SPEEDS[speed]) speed = 'inspect';
    const P = { strands: true, strandOK: false, mode: null, t0: 0, dur: SPEEDS[speed][0], editDur: SPEEDS[speed][1], pending: false, skip: false, realT0: null, prevOK: false, place: null,
                stats: { pageT0: performance.timeOrigin ? 0 : 0, firstFrame: null, printed: null, realOn: null }, log: [] };
    const now = () => (P.fixed != null ? P.fixed : performance.now() / 1000);   // tests pin the clock (tools/flydown/rig.js printFrame)
    document.body.classList.add('iris-printing');                     // the shell waits for the print (index.html CSS)

    // ---------------------------------------------------------------- GL
    function compile(vs, fs) {
        const mk = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error('print: ' + gl.getShaderInfoLog(o)); return o; };
        const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.bindAttribLocation(p, 0, 'position'); gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('print: ' + gl.getProgramInfoLog(p));
        p.u = {}; p.loc = n => (n in p.u ? p.u[n] : (p.u[n] = gl.getUniformLocation(p, n))); return p;
    }
    const FS = `#version 300 es
        precision highp float;
        uniform sampler2D u_new, u_old, u_prev, u_arr; uniform vec2 u_res; uniform float u_t, u_mode, u_prevOn, u_real, u_realAge, u_oldOn, u_maxLod;
        uniform vec4 u_box; uniform vec2 u_origin, u_irisC; uniform float u_reach, u_cell, u_ns, u_strands, u_strandOn, u_uvOn, u_snapOn; uniform sampler2D u_uvm, u_str, u_snapUV;
        out vec4 o;
        float hsh(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        // the strand coordinates at a preview point (data/<ref>.print.png): length along the strand, the strand's angle at the
        // margin (16 bit over G/B — interpolated by hand, unwrapped, never by the sampler across the hi/lo split), crypt, eye
        vec4 strandAt(sampler2D m, vec2 tq, bool wrapU) {
            ivec2 sz = textureSize(m, 0); vec2 tc = tq * vec2(sz) - 0.5; ivec2 i0 = ivec2(floor(tc)); vec2 f = fract(tc);
            float u0 = 0.0, sL = 0.0, cr = 0.0, cv = 0.0, ref = -1.0;
            for (int k = 0; k < 4; k++) {
                ivec2 o = ivec2(k & 1, k >> 1), ii = i0 + o; if (wrapU) ii.x = (ii.x % sz.x + sz.x) % sz.x; vec4 t = texelFetch(m, clamp(ii, ivec2(0), sz - 1), 0);
                float w = (o.x == 1 ? f.x : 1.0 - f.x) * (o.y == 1 ? f.y : 1.0 - f.y);
                float u = (floor(t.g * 255.0 + 0.5) * 256.0 + floor(t.b * 255.0 + 0.5)) / 65535.0;
                if (ref < 0.0) ref = u; u = ref + (u - ref - floor(u - ref + 0.5));
                float in_ = step(0.1, t.a);
                u0 += w * u; sL += w * t.r; cr += w * clamp((t.a * 255.0 - 64.0) / 191.0, 0.0, 1.0) * in_; cv += w * in_;
            }
            return vec4(fract(u0), sL, cr, cv);
        }
        // the kept visit's snapshot (P.snapshot): its tissue (u, v) per preview texel — u 16 bit over R/G, v over B, A on the iris —
        // interpolated by hand (unwrapped), so its strands are the real frame's strands from the first frame on
        vec3 snapUV(vec2 tq) {
            ivec2 sz = textureSize(u_snapUV, 0); vec2 tc = tq * vec2(sz) - 0.5; ivec2 i0 = ivec2(floor(tc)); vec2 f = fract(tc);
            float u0 = 0.0, v0 = 0.0, w0 = 0.0, ins = 0.0, ref = -1.0;
            for (int k = 0; k < 4; k++) {
                ivec2 o = ivec2(k & 1, k >> 1); vec4 t = texelFetch(u_snapUV, clamp(i0 + o, ivec2(0), sz - 1), 0);
                float w = (o.x == 1 ? f.x : 1.0 - f.x) * (o.y == 1 ? f.y : 1.0 - f.y), in_ = step(0.75, t.a); ins += w * in_; if (in_ < 0.5) continue;   // A: 255 iris, 128 pupil
                float u = (floor(t.r * 255.0 + 0.5) * 256.0 + floor(t.g * 255.0 + 0.5)) / 65535.0;
                if (ref < 0.0) ref = u; u = ref + (u - ref - floor(u - ref + 0.5));
                u0 += w * u; v0 += w * t.b; w0 += w;
            }
            return w0 > 0.0 ? vec3(fract(u0 / w0), v0 / w0, ins) : vec3(0.0);
        }
        void main() {
            vec2 px = gl_FragCoord.xy, uv = px / u_res;
            vec2 bq = (px - u_box.xy) / (2.0 * u_box.z) + 0.5;            // preview coordinates (rows up)
            bool inBox = (u_prevOn > 0.5 || u_strandOn > 0.5 || u_snapOn > 0.5) && all(greaterThanEqual(bq, vec2(0.0))) && all(lessThanEqual(bq, vec2(1.0)));
            vec4 arr = inBox ? texture(u_arr, vec2(bq.x, 1.0 - bq.y)) : vec4(0.0);
            float cov = u_mode < 0.5 ? (u_prevOn > 0.5 || u_strandOn > 0.5 ? smoothstep(0.05, 0.2, arr.a) : 1.0) : 1.0;
            // the frame's own tissue coordinates (print.js uvMap: the engine's coordinate map, through the cornea): the strands
            // at any pose and zoom, a kept session, an edit; off the iris it is the pupil (dark: printed first) or the page
            vec4 uvm = u_uvOn > 0.5 ? texelFetch(u_uvm, ivec2(px), 0) : vec4(0.0); bool onIris = uvm.z > 0.5, pupil = false, rimP = false;
            // off the iris: the pupil (the map marks it, z 0.25) prints at once; the page (white) never; anything else — the limbal rim,
            // the edge blend — prints LAST, when the strands get there (it used to count as page and appeared at once)
            if (u_uvOn > 0.5 && !onIris) { vec4 nc = texelFetch(u_new, ivec2(px), 0); pupil = uvm.z > 0.1;
                bool page = nc.a < 0.02 || min(nc.r, min(nc.g, nc.b)) > 0.97;     // the page: cleared by the eye's fan, or drawn white
                rimP = !pupil && !page; if (u_mode < 0.5) cov = page ? 0.0 : 1.0; }
            if (u_uvOn > 0.5 && onIris && u_mode < 0.5) cov = 1.0;
            // before the real frame, a kept visit reads the same tissue coordinates from its snapshot
            if (u_uvOn < 0.5 && u_snapOn > 0.5 && u_mode < 0.5) {
                vec3 su = inBox ? snapUV(vec2(bq.x, 1.0 - bq.y)) : vec3(0.0); onIris = su.z > 0.5; uvm = vec4(su.xy, su.z, 0.0);
                if (!onIris && inBox) { ivec2 sz = textureSize(u_snapUV, 0); float a = texelFetch(u_snapUV, clamp(ivec2(vec2(bq.x, 1.0 - bq.y) * vec2(sz)), ivec2(0), sz - 1), 0).a;
                    pupil = a > 0.38 && a < 0.62; rimP = a > 0.13 && a < 0.38; }
                cov = onIris || pupil || rimP ? 1.0 : 0.0;
            }
            bool tisUV = u_uvOn > 0.5 || (u_snapOn > 0.5 && u_mode < 0.5);   // the eye (alpha ≥ 64/255, crypt above it)  // open: only the eye prints, never the white page
            // ---- Oxman deposition (study/17 §4.2, "the mosaic prints cell by cell — the Oxman voxel image"): a polar lattice of
            // cells round the iris centre, elongated along the radius like fibres; each cell is born WHOLE at the arrival time of
            // its own seed (+ a per-cell rank), then fills as a droplet spreading from the seed; its rim stays dark while wet
            vec2 rel = px - u_irisC; float rho = length(rel), th = atan(rel.y, rel.x);
            float NT = max(6.0, floor(6.2831853 * u_box.z * 0.6 / u_cell)), CR = 2.2 * u_cell;   // cells round, cell length (px)
            vec2 q = vec2(rho / CR, (th / 6.2831853 + 0.5) * NT); vec2 qi = floor(q);
            float F1 = 1e9, F2 = 1e9, Tc = 1.0, hc = 0.0;
            float T = 1.0, drop = 0.0, rimW = 0.0;
            // ---- the strands grow (iori 2026-11-12): each strand from the pupil margin outward along its own path, at its own
            // speed and start, forking twice on the way (a third and two thirds out), each child at its own speed from the
            // fork; the strand's core first, the gaps between strands after, crypt floors last, under the floating strands
            if (u_strands > 0.5 && ((tisUV && (onIris || pupil || rimP)) || (!tisUV && u_mode < 0.5 && u_strandOn > 0.5 && inBox))) {
                vec4 sa = tisUV ? (onIris ? strandAt(u_str, uvm.xy, true) : vec4(0.0, 1.0, 0.0, 1.0)) : strandAt(u_arr, vec2(bq.x, 1.0 - bq.y), false);
                float u0 = sa.x, S = sa.y, cr = sa.z;
                float Tg = 0.0, n = u_ns, c = 0.0, hs = 0.0; const float K = 0.7;
                for (int g = 0; g < 3; g++) {
                    float sb = float(g) / 3.0, se = g < 2 ? float(g + 1) / 3.0 : 1e9, id = floor(u0 * n);
                    hs = hsh(vec2(id, float(g) * 17.0 + 3.0)); float v = mix(0.7, 1.15, hsh(vec2(id * 1.7, float(g) + 9.0)));
                    Tg += (g == 0 ? 0.12 * hs : 0.035 * hs) + (min(S, se) - sb) / v * K;
                    c = fract(u0 * n); if (S < se) break; n *= 2.0;
                }
                float dc = abs(c - 0.5) * 2.0;                                   // 0 on the strand's axis, 1 between strands
                T = Tg + 0.012 * sin(S * 45.0 + hs * 6.2831853) + 0.06 * smoothstep(0.45, 1.0, dc) + 0.22 * cr * smoothstep(0.35, 1.0, dc);
                drop = dc; rimW = smoothstep(0.6, 0.95, dc); hc = hs;
                if (sa.w < 0.02) T = 1.0;
                if (rimP) { T = 1.02 + 0.03 * hsh(floor(px / 3.0)); drop = 0.0; rimW = 0.0; }   // the rim: after the strands have reached it
                if (pupil) { T = 0.0; drop = 0.0; rimW = 0.0; }                     // the pupil: printed at once, the strands grow out of its margin
            } else {
            for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
                vec2 ci = qi + vec2(float(dx), float(dy)); vec2 cw = vec2(ci.x, mod(ci.y, NT));
                vec2 f = ci + 0.15 + 0.7 * vec2(hsh(cw * 1.37 + 3.1), hsh(cw * 2.11 + 7.7));
                float fr = f.x * CR, ft = (f.y / NT - 0.5) * 6.2831853; vec2 fp = u_irisC + fr * vec2(cos(ft), sin(ft));
                float d = length(px - fp);
                if (d < F1) {
                    F2 = F1; F1 = d; hc = hsh(cw * 0.73 + 11.0);
                    // the seed's arrival
                    vec2 fq = (fp - u_box.xy) / (2.0 * u_box.z) + 0.5;
                    if (u_mode < 0.5 && u_prevOn > 0.5) Tc = all(greaterThanEqual(fq, vec2(0.0))) && all(lessThanEqual(fq, vec2(1.0))) ? texture(u_arr, vec2(fq.x, 1.0 - fq.y)).r : 1.0;
                    else { vec2 dd = fp - u_origin, r = normalize(fp - u_irisC + 1e-3); Tc = length(vec2(dot(dd, r), 3.5 * (dd.x * r.y - dd.y * r.x))) / (3.5 * u_reach); }
                } else F2 = min(F2, d);
            }
            T = clamp(Tc * 0.92 + 0.08 * hc, 0.0, 1.0);
            drop = clamp(F1 / (1.2 * u_cell), 0.0, 1.0);                      // 0 at the seed, 1 at the cell's edge
            rimW = 1.0 - smoothstep(0.0, 0.9 * u_cell * 0.35, F2 - F1);       // the droplet's edge against its neighbour
            }
            float age = u_t - T;
            float a = smoothstep(0.03 * drop, 0.03 * drop + 0.012, age);     // the droplet spreads from the seed over the cell
            float sharp = clamp(age / 0.25, 0.0, 1.0);                        // and sharpens
            float lod = (1.0 - sharp) * u_maxLod;
            vec4 nw;
            if (sharp >= 1.0 && u_real >= 1.0 && u_realAge > 0.4) nw = texelFetch(u_new, ivec2(px), 0);   // settled: the frame itself, exactly
            else {
                vec4 real = textureLod(u_new, uv, max(lod, (1.0 - clamp(u_realAge / 0.4, 0.0, 1.0)) * 2.0));
                vec4 pv = inBox && u_prevOn > 0.5 ? textureLod(u_prev, vec2(bq.x, 1.0 - bq.y), lod * 0.6) : vec4(0.0);
                pv = vec4(pv.rgb, cov);
                nw = mix(pv, real, u_real);
            }
            // the wet front: darker, a little more saturated, a few glints, drying over 0.12 of the print
            float w = clamp(1.0 - age / 0.12, 0.0, 1.0) * step(0.0, age);
            vec3 c = nw.rgb, g = vec3(dot(c, vec3(0.2126, 0.7152, 0.0722)));
            vec3 wet = mix(g, c, 1.35) * 0.72;
            float rim = rimW;
            c = mix(c, wet, 0.6 * w) * (1.0 - 0.35 * w * rim) + w * 0.5 * step(0.986, hsh(floor(px / 2.0) + floor(u_t * 20.0))) * smoothstep(0.04, 0.12, g.r);   // glints on tissue, not on the pupil's black
            vec4 old = u_oldOn > 0.5 ? texelFetch(u_old, ivec2(px), 0) : vec4(0.0);
            o = mix(old, vec4(clamp(c, 0.0, 1.0), nw.a), a);
            if (u_mode < 0.5 && cov < 0.02 && u_real >= 1.0) o = texelFetch(u_new, ivec2(px), 0);   // the page itself: as the engine draws it, never re-printed
            if (age > 0.5 && u_real >= 1.0 && u_realAge > 0.4) o = texelFetch(u_new, ivec2(px), 0);
        }`;
    let prog = null, fbNew = null, texNew = null, fbOld = null, texOld = null, texPrev = null, texArr = null, W = 0, H = 0;
    function alloc(tex, fb, mip) {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);   // the old frame has no mips: a mip filter would leave it incomplete (reads 0) gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    function ensure() {
        if (!prog) { prog = compile('#version 300 es\nin vec4 position; void main() { gl_Position = position; }', FS); texNew = gl.createTexture(); fbNew = gl.createFramebuffer(); texOld = gl.createTexture(); fbOld = gl.createFramebuffer(); }
        if (W !== canvas.width || H !== canvas.height) { W = canvas.width; H = canvas.height; alloc(texNew, fbNew, true); alloc(texOld, fbOld, false); }
    }

    // ---------------------------------------------------------------- the strands in tissue uv (data/<ref>.strands.png) and the
    // frame's own (u, v) per pixel (the engine's coordinate map, debug 14), remade when the camera moves
    let uvTex = null, uvFB = null, uvSig = '', strandT = null, strandRef = null, strandLoading = null, snapUVT = null;
    const curRef = () => { const X = window.__irisTissueUI, F = window.__irisFly; return (F && F.ref) || (X && X.eye) || null; };
    function loadStrands(ref) {
        if (!ref || strandLoading === ref) return; strandLoading = ref;
        const i = new Image(); i.onload = () => { if (strandLoading !== ref) return; if (strandT) gl.deleteTexture(strandT); strandT = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, strandT);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, i); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.BROWSER_DEFAULT_WEBGL);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); strandRef = ref; uvSig = ''; };
        i.onerror = () => { strandLoading = null; };
        fetch(`data/${ref}.strands.png`, { cache: 'no-cache' }).then(r => r.ok ? r.blob() : Promise.reject()).then(b => { i.src = URL.createObjectURL(b); }).catch(() => { strandLoading = null; });   // revalidated: never a stale map
    }
    function uvMap() {
        const T = window.IrisTissue, S = E.state, ref = curRef();
        if (ref && ref !== strandRef && !(P.snapRef && strandRef === P.snapRef && P.realT0 === null)) loadStrands(ref);
        if (!T || !T.on || !strandT || strandRef !== ref) return false;
        if (P.mode === 'open' && P.realT0 === null) return false;              // the real frame is not here yet
        if (P.mode === 'edit' && P.pending) return false;
        if (!uvTex || uvTex.w !== W || uvTex.h !== H) {
            if (uvTex) { gl.deleteTexture(uvTex); gl.deleteFramebuffer(uvFB); }
            uvTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, uvTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, W, H, 0, gl.RGBA, gl.FLOAT, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); uvTex.w = W; uvTex.h = H;
            uvFB = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, uvFB); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, uvTex, 0); uvSig = '';
        }
        const sig = [S.zoomPhoto, S.view.join(','), Math.round(S.mouseX), Math.round(S.mouseY), S.useRot, S.pupil, W, H, strandRef].join('|');
        if (sig !== uvSig) { E.drawPhotoFrame(uvFB, W, H, 0, texOld, { debug: 14, fstop: 64 }); uvSig = sig; }
        return true;
    }
    P.uvMapTex = () => uvTex;   // tests

    // ---------------------------------------------------------------- the kept visit's instant start (iori 2026-11-12: "do we start
    // rendering the center as soon as possible?"). With the session (session.js) a small snapshot of the eye on screen is kept:
    // its colour (JPEG, 384 px) and its tissue (u, v) per pixel (PNG, 256 px) over the centred square. The next visit prints
    // from it at once — the same strands, from the pupil — while the eye is still being built, and the real frame takes over
    // where it has printed. Only a centred view is kept (a restored view is centred, session.js), and only an unchanged one is used.
    const SNAP = 'irisSnap';
    P.snapshot = () => {
        try {
            const T = window.IrisTissue, S = E.state, src = E.lastFrameTex, ref = curRef();
            if (!T || !T.on || P.mode || !src || !ref || S.holdEye || S.fitting) return false;
            const v = S.view; if (Math.abs(v[0] + v[2] / 2 - 0.5) > 0.01 || Math.abs(v[1] + v[3] / 2 - 0.5) > 0.01) return false;
            ensure(); const side = Math.min(W, H), x0 = Math.round((W - side) / 2), y0 = Math.round((H - side) / 2), N = 384, NU = 256;
            E.drawPost(fbOld, src, W, H, 0, {});
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbOld); const px = new Uint8Array(side * side * 4); gl.readPixels(x0, y0, side, side, gl.RGBA, gl.UNSIGNED_BYTE, px);
            const c1 = document.createElement('canvas'); c1.width = side; c1.height = side; const g1 = c1.getContext('2d'), im = g1.createImageData(side, side);
            for (let y = 0; y < side; y++) im.data.set(px.subarray((side - 1 - y) * side * 4, (side - y) * side * 4), y * side * 4);
            g1.putImageData(im, 0, 0); const c2 = document.createElement('canvas'); c2.width = N; c2.height = N; c2.getContext('2d').drawImage(c1, 0, 0, N, N);
            const jpg = c2.toDataURL('image/jpeg', 0.82);
            // the coordinate map of the same square: the full frame's map at the snapshot's size, sampled (the camera's projection
            // follows the target's aspect, so the square is cut from a full-frame map, not rendered as a square)
            // at the canvas's own size (the engine draws only the eye's polygon, placed in canvas pixels), the square read, subsampled
            const ft = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, ft); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, W, H, 0, gl.RGBA, gl.FLOAT, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            const ffb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, ffb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, ft, 0);
            E.drawPhotoFrame(ffb, W, H, 0, texOld, { debug: 14, fstop: 64 });
            const full = new Float32Array(side * side * 4); gl.bindFramebuffer(gl.FRAMEBUFFER, ffb); gl.readPixels(x0, y0, side, side, gl.RGBA, gl.FLOAT, full);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(ffb); gl.deleteTexture(ft); gl.viewport(0, 0, W, H);
            const f = new Float32Array(NU * NU * 4);
            for (let y = 0; y < NU; y++) for (let x = 0; x < NU; x++) { const sx = Math.min(side - 1, Math.floor((x + 0.5) * side / NU)), sy = Math.min(side - 1, Math.floor((y + 0.5) * side / NU)), i = (sy * side + sx) * 4, o = (y * NU + x) * 4;
                f[o] = full[i]; f[o + 1] = full[i + 1]; f[o + 2] = full[i + 2]; f[o + 3] = px[i + 3] < 5 || Math.min(px[i], px[i + 1], px[i + 2]) > 247 ? 0 : 1; }   // .a: drawn and not the page (cleared, or white)
            const c3 = document.createElement('canvas'); c3.width = NU; c3.height = NU; const g3 = c3.getContext('2d'), iu = g3.createImageData(NU, NU);
            for (let y = 0; y < NU; y++) for (let x = 0; x < NU; x++) { const i = ((NU - 1 - y) * NU + x) * 4, o = (y * NU + x) * 4, ins = f[i + 2] > 0.5;
                const q = Math.floor(Math.min(1, Math.max(0, f[i])) * 65535); iu.data[o] = q >> 8; iu.data[o + 1] = q & 255; iu.data[o + 2] = Math.round(Math.min(1, Math.max(0, f[i + 1])) * 255); iu.data[o + 3] = ins ? 255 : f[i + 2] > 0.1 ? 128 : f[i + 3] > 0.02 ? 64 : 0; }   // A: 255 iris, 128 pupil, 64 the rim (drawn, off the iris), 0 the page
            g3.putImageData(iu, 0, 0); const uvPng = c3.toDataURL('image/png');
            const rec = { v: 4, ref, W, H, side, mx: S.mouseX / W, my: S.mouseY / H, zoom: +S.zoomPhoto.toFixed(3), vw: +v[2].toFixed(4), jpg, uv: uvPng, at: Date.now() };
            localStorage.setItem(SNAP, JSON.stringify(rec)); P.lastSnap = { bytes: jpg.length + uvPng.length, at: rec.at }; return true;
        } catch (e) { console.warn('print snapshot', e); return false; }
    };

    // ---------------------------------------------------------------- the engine's hooks
    P.owns = () => P.mode === 'open' && P.prevOK;                       // while the eye is on its way, the canvas is the print's
    P.target = () => {                                                   // the engine's post pass draws here while a print runs
        if (!P.mode) return null;
        ensure();
        if (P.mode === 'open' && P.realT0 === null) { P.realT0 = now(); P.stats.realOn = performance.now(); if (!P.prevOK) P.t0 = now(); }
        if (P.mode === 'edit' && P.pending) { P.pending = false; P.t0 = now(); }   // the new state's first frame starts the clock
        return fbNew;
    };
    P.present = () => {
        if (!P.mode) return;
        ensure();
        // device pacing (iori 2026-11-12): the print's clock advances with the frames it is shown on, never more than 1/30 s per
        // frame (a hitch does not make the growth jump), and its length follows how soon the device converges (P.pace) — the
        // setting is the most
        // the progress ACCUMULATES (iori 2026-11-12: "the growth still glitches back and forth"): it was elapsed ÷ length, and the
        // length follows the pace, which moves with the engine's samples per frame — so the front went back and forth. Now a
        // change of pace changes the speed only; the pace itself is smoothed
        const t = now(), base = P.mode === 'open' ? P.dur : P.editDur, pc = P.pace();
        P.pacing = P.pacing == null || P.uT0 !== P.t0 ? pc : 0.97 * P.pacing + 0.03 * pc;
        if (P.fixed != null) P.u = (t - P.t0) / (base * P.pacing);          // tests pin the clock
        else { const dt = P.lastT == null ? 0 : Math.min(1 / 30, Math.max(0, t - P.lastT));
            P.u = (P.u == null || P.uT0 !== P.t0) ? Math.max(0, t - P.t0) / (base * P.pacing) : P.u + dt / (base * P.pacing); }
        P.uT0 = P.t0; P.lastT = t;
        let u = P.pending ? -1 : P.u;
        if (P.skip) u = Math.max(u, 2);
        gl.bindTexture(gl.TEXTURE_2D, texNew); gl.generateMipmap(gl.TEXTURE_2D);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H); gl.useProgram(prog);
        gl.activeTexture(gl.TEXTURE25); gl.bindTexture(gl.TEXTURE_2D, texNew); gl.uniform1i(prog.loc('u_new'), 25);
        gl.activeTexture(gl.TEXTURE26); gl.bindTexture(gl.TEXTURE_2D, texOld); gl.uniform1i(prog.loc('u_old'), 26);
        gl.activeTexture(gl.TEXTURE27); gl.bindTexture(gl.TEXTURE_2D, texPrev || texOld); gl.uniform1i(prog.loc('u_prev'), 27);
        gl.activeTexture(gl.TEXTURE28); gl.bindTexture(gl.TEXTURE_2D, texArr || texOld); gl.uniform1i(prog.loc('u_arr'), 28);
        gl.activeTexture(gl.TEXTURE0);
        const realAge = P.mode === 'open' ? (P.realT0 === null ? 0 : t - P.realT0) : 10;
        gl.uniform2f(prog.loc('u_res'), W, H); gl.uniform1f(prog.loc('u_t'), u); gl.uniform1f(prog.loc('u_mode'), P.mode === 'open' ? 0 : 1);
        gl.uniform1f(prog.loc('u_prevOn'), P.mode === 'open' && P.prevOK ? 1 : 0);
        gl.uniform1f(prog.loc('u_real'), P.mode === 'open' ? (P.realT0 === null ? 0 : Math.min(1, realAge / 0.15)) : 1);   // the real frame takes over in 0.15 s: a longer blend ghosted the cached image where the eye had moved
        gl.uniform1f(prog.loc('u_realAge'), realAge); gl.uniform1f(prog.loc('u_oldOn'), P.mode === 'edit' ? 1 : 0);
        gl.uniform1f(prog.loc('u_maxLod'), 4.5);
        const b = P.box(); gl.uniform4f(prog.loc('u_box'), b[0], b[1], b[2], 0);
        gl.uniform2f(prog.loc('u_origin'), W / 2, H / 2); gl.uniform2f(prog.loc('u_irisC'), b[0], b[1]);
        gl.uniform1f(prog.loc('u_reach'), Math.hypot(W, H) * 0.5); gl.uniform1f(prog.loc('u_cell'), 3.5 * (E.dpr || 1));
        gl.uniform1f(prog.loc('u_strands'), P.strands ? 1 : 0); gl.uniform1f(prog.loc('u_strandOn'), P.mode === 'open' && P.strandOK ? 1 : 0);
        const uvOn = P.strands && uvMap(); gl.useProgram(prog); gl.viewport(0, 0, W, H); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.uniform1f(prog.loc('u_uvOn'), uvOn ? 1 : 0);
        const snapOn = P.mode === 'open' && P.snapOK && !!strandT; gl.uniform1f(prog.loc('u_snapOn'), snapOn ? 1 : 0);
        gl.activeTexture(gl.TEXTURE31); gl.bindTexture(gl.TEXTURE_2D, snapOn ? snapUVT : texOld); gl.uniform1i(prog.loc('u_snapUV'), 31);
        gl.activeTexture(gl.TEXTURE29); gl.bindTexture(gl.TEXTURE_2D, uvOn ? uvTex : texOld); gl.uniform1i(prog.loc('u_uvm'), 29);
        gl.activeTexture(gl.TEXTURE30); gl.bindTexture(gl.TEXTURE_2D, uvOn || snapOn ? strandT : texOld); gl.uniform1i(prog.loc('u_str'), 30); gl.activeTexture(gl.TEXTURE0); gl.uniform1f(prog.loc('u_ns'), 256);   // strands round the pupil margin (≈ 40 µm bundles there), forking twice on the way out   // the deposition cell, ~3.5 CSS px across (×2.2 along the radius)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        // done: the open print when the real frame has settled over every printed cell, an edit when its front has passed
        const doneOpen = P.mode === 'open' && u > 1.55 && P.realT0 !== null && realAge > 0.8;
        const doneEdit = P.mode === 'edit' && !P.pending && u > 1.55;
        if (doneOpen || doneEdit) finish();
    };
    function finish() {
        const was = P.mode; P.mode = null; P.skip = false;
        if (was === 'open') { P.stats.printed = performance.now(); document.body.classList.remove('iris-printing'); P.log.push({ open: P.stats }); }
        // the next engine frame (if it is still accumulating) goes straight to the canvas; if it has converged, the canvas
        // already holds the frame itself (the composite's settled branch is an exact copy)
    }
    // the preview's box on this canvas: centre and half-size, from the place it was captured (relative to the height)
    // the print's length follows how soon the device converges the eye: × 0.5 when it needs ≤ 1 s for its samples, × 1 at ≥ 3 s
    P.pace = () => { const pc = E.pace, sps = pc && pc.on && P.paced !== false ? pc.sps : null; if (!sps) return 1; const tc = E.Q.frames / sps; return Math.min(1, Math.max(0.5, 0.5 + 0.25 * (tc - 1))); };
    P.box = () => { const p = P.place; if (!p) return [W / 2, H / 2, H * 0.4]; return [W / 2 + p.cx * H, H / 2 - p.cy * H, p.half * H]; };

    // a change that cannot update live: keep the frame on screen, print the new state over it once its first frame exists
    P.change = (kind) => {
        if (P.mode === 'open') return;                                   // the opening print already covers it
        if (P.mode === 'edit') { if (!P.pending) P.t0 = Math.max(P.t0, now() - P.editDur * 0.35); return; }   // a drag keeps the front going
        const src = E.lastFrameTex; if (!src) return;
        ensure();
        E.drawPost(fbOld, src, W, H, 0, {});                            // the old frame, as it is on screen
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
        P.mode = 'edit'; P.pending = true; P.kind = kind; P.log.push({ edit: kind, t: performance.now() });
    };

    // ---------------------------------------------------------------- the opening
    const START = window.__irisStartEye, pendingStart = !!window.__irisStartPending, keptTissue = !!window.__irisSessionPending;
    if (E.state.holdEye && (pendingStart || keptTissue)) {
        P.mode = 'open'; P.t0 = now();
        const ref = pendingStart && START ? START.ref : null;
        if (ref) {
            const img = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
            Promise.all([fetch(`data/${ref}.print.json`).then(r => r.ok ? r.json() : null), img(`data/${ref}.print.jpg`), img(`data/${ref}.print.png`)])
                .then(([place, jpg, png]) => {
                    if (!place || !png || P.mode !== 'open') return;
                    ensure();
                    const up = (im, filt) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
                        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
                        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, im);
                        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.BROWSER_DEFAULT_WEBGL);
                        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filt); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                        if (filt !== gl.LINEAR) gl.generateMipmap(gl.TEXTURE_2D); return t; };
                    // the start view's strand map whenever it is here; the preview image only when it lands before the real frame
                    texArr = up(png, gl.LINEAR); P.place = place; P.strandOK = true;
                    if (jpg && P.realT0 === null) { texPrev = up(jpg, gl.LINEAR_MIPMAP_LINEAR); P.prevOK = true; P.t0 = now(); P.stats.firstFrame = performance.now(); }
                });
        }
    }
    // a kept visit: the snapshot, when it is this session's eye at this zoom (an unchanged view)
    if (P.mode === 'open' && !pendingStart && keptTissue) {
        try {
            const K = JSON.parse(window.__irisSessionPending || '{}'), cam = K.camera || {}, eyeRef = K.tissue && K.tissue.eye ? String(K.tissue.eye).split('-')[0] : null;
            const R = JSON.parse(localStorage.getItem(SNAP) || 'null');
            if (R && R.v === 4 && eyeRef && R.ref === eyeRef && Math.abs((cam.zoomPhoto || 0) - R.zoom) < 0.01 * R.zoom && cam.view && Math.abs(cam.view[2] - R.vw) < 0.002) {
                P.snapRef = R.ref; loadStrands(R.ref);
                // the eye turned as it was in the snapshot (it follows the pointer): the real frame lands on the printed one, no jump
                if (R.mx != null && !E.state.useRot) { E.state.mouseX = E.target.mouseX = R.mx * canvas.width; E.state.mouseY = E.target.mouseY = R.my * canvas.height; }
                const img = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
                Promise.all([img(R.jpg), img(R.uv)]).then(([jpg, uvI]) => {
                    if (!jpg || !uvI || P.mode !== 'open' || P.realT0 !== null) return;
                    ensure();
                    const up = (im, filt) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
                        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
                        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, im); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.BROWSER_DEFAULT_WEBGL);
                        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filt); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filt === gl.NEAREST ? gl.NEAREST : gl.LINEAR);
                        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                        if (filt === gl.LINEAR_MIPMAP_LINEAR) gl.generateMipmap(gl.TEXTURE_2D); return t; };
                    texPrev = up(jpg, gl.LINEAR_MIPMAP_LINEAR); snapUVT = up(uvI, gl.NEAREST);
                    P.place = { cx: 0, cy: 0, half: 0.5 * R.side / R.H }; P.snapOK = true; P.prevOK = true; P.t0 = now(); P.stats.firstFrame = performance.now(); P.stats.snap = true;
                });
            }
        } catch (e) { console.warn('print snapshot', e); }
    }
    if (P.mode !== 'open') document.body.classList.remove('iris-printing');   // nothing to print (?start=off, a URL eye): the shell at once
    // skip: a click or a key finishes the print (the shell comes at once)
    const skip = () => { if (P.mode === 'open') P.skip = true; };
    addEventListener('pointerdown', skip, true); addEventListener('keydown', skip, true);

    // ---------------------------------------------------------------- non-live changes the engine does not route itself
    const T = window.IrisTissue;
    if (T) {
        if (T.bake) { const b = T.bake; T.bake = function () { P.change('tissue-bake'); return b.apply(this, arguments); }; }
        let on = T.on; Object.defineProperty(T, 'on', { configurable: true, enumerable: true, get: () => on, set: v => { if (!!v !== !!on) P.change('model'); on = v; } });
    }
    const wrapLoad = () => { const X = window.__irisTissueUI; if (!X || X.__printWrapped || !X.load) return !!(X && X.__printWrapped);
        const l = X.load; X.load = function () { P.change('eye'); return l.apply(this, arguments); }; X.__printWrapped = true; return true; };
    const wl = setInterval(() => { if (wrapLoad()) clearInterval(wl); }, 200);

    // keep presenting while a print runs and the engine has nothing new to draw (converged, fitting or loading)
    (function loop() { try { if (P.mode && (P.prevOK || P.mode === 'edit' || P.realT0 !== null)) P.present(); } catch (e) { console.error(e); P.mode = null; document.body.classList.remove('iris-printing'); } requestAnimationFrame(loop); })();
    // a print can never keep the shell away: give up 10 s after it should have ended
    setTimeout(() => { if (P.mode === 'open') { P.skip = true; setTimeout(() => { if (P.mode === 'open') finish(); }, 1500); } }, (P.dur * 1.6 + 10) * 1000);
    P.SPEEDS = SPEEDS;
    Object.defineProperty(P, 'speed', { get: () => speed, set: v => { if (!SPEEDS[v]) return; speed = v; P.dur = SPEEDS[v][0]; P.editDur = SPEEDS[v][1]; try { localStorage.setItem('irisPrintSpeed', v); } catch (e) {} } });
    window.IrisPrint = P;
})();
