// IrisMaterials — the spectral material model in the page (study/16 K2.2): a port of tools/layer_proof.py build_lut (itself
// the fitter's port of the engine's buildSpectralLut, plus the mie axis), the fitter's Lab round trip and camera grade, so
// a sample's colour is REGENERATED from its material: rgb = grade(clip01(LUT[mat] × lum)); guides: that colour divided by
// its own luminance. The grid is the fitter's (Ma 24 · Ds 16 · pheo 5 · yellow 8 · mie 7 = 107 520 entries, ≈ 1.3 MB of
// float32, built once per page in ≈ 0.2 s). Lab is CIE L*a*b* under D65 from linear sRGB (what OpenCV's float path
// computes, to ≈ 1e-3); the grade rotates and scales a*, b* (hue in DEGREES).
(() => {
    const lam = [400, 420, 440, 460, 480, 500, 520, 540, 560, 580, 600, 620, 640, 660, 680, 700];
    const xb = [0.0143, 0.1344, 0.3483, 0.2908, 0.0956, 0.0049, 0.0633, 0.2904, 0.5945, 0.9163, 1.0622, 0.8544, 0.4479, 0.1649, 0.0468, 0.0114];
    const yb = [0.0004, 0.0040, 0.0230, 0.0600, 0.1390, 0.3230, 0.7100, 0.9540, 0.9950, 0.8700, 0.6310, 0.3810, 0.1750, 0.0610, 0.0170, 0.0041];
    const zb = [0.0679, 0.6456, 1.7471, 1.6692, 0.8130, 0.2720, 0.0782, 0.0203, 0.0039, 0.0017, 0.0008, 0.0002, 0, 0, 0, 0];
    const d65 = [82.75, 93.43, 104.86, 117.81, 115.92, 109.35, 104.79, 104.41, 100.0, 95.79, 90.01, 87.70, 83.70, 80.21, 78.28, 71.61];
    const interp = (l, pts) => { if (l <= pts[0][0]) return pts[0][1]; if (l >= pts[pts.length - 1][0]) return pts[pts.length - 1][1]; for (let i = 0; i < pts.length - 1; i++) { const [l0, v0] = pts[i], [l1, v1] = pts[i + 1]; if (l >= l0 && l <= l1) return v0 + (v1 - v0) * (l - l0) / (l1 - l0); } return pts[0][1]; };
    const GRID = { Ma: Array.from({ length: 24 }, (_, i) => 6 * Math.pow((i + 0.5) / 24, 2)), Ds: Array.from({ length: 16 }, (_, j) => 0.5 * (j + 0.5) / 16), pheo: [0, 0.25, 0.5, 0.75, 1], yellow: Array.from({ length: 8 }, (_, i) => 2.5 * i / 7), mie: [0, 0.08, 0.2, 0.35, 0.5, 0.7, 1.0] };
    const SHAPE = [24, 16, 5, 8, 7], N = 24 * 16 * 5 * 8 * 7;
    let LUT = null;
    function buildLut(rayExp = 5.0, yellowEdgeNm = 450) {
        const K = lam.map(l => ({ aEu: Math.pow(l / 550, -3.33), aPh: Math.pow(l / 550, -4.75), ray: Math.pow(550 / l, rayExp),
            Ripe: interp(l, [[464, 0.020], [549, 0.030], [611, 0.045]]), rhoEu: interp(l, [[464, 0.022], [549, 0.038], [611, 0.065]]), rhoPh: interp(l, [[464, 0.055], [549, 0.15], [611, 0.26]]),
            yel: 1 - 1 / (1 + Math.exp(-(l - yellowEdgeNm) / 14)) }));
        let Xw = 0, Yw = 0, Zw = 0; for (let i = 0; i < 16; i++) { Xw += xb[i] * d65[i]; Yw += yb[i] * d65[i]; Zw += zb[i] * d65[i]; }
        const out = new Float32Array(N * 3); let o = 0;
        for (let ia = 0; ia < 24; ia++) for (let id = 0; id < 16; id++) for (let ip = 0; ip < 5; ip++) for (let iy = 0; iy < 8; iy++) for (let im = 0; im < 7; im++) {
            const Ma = GRID.Ma[ia], Ds = GRID.Ds[id], pheo = GRID.pheo[ip], yellow = GRID.yellow[iy], mie = GRID.mie[im];
            let X = 0, Y = 0, Z = 0;
            for (let i = 0; i < 16; i++) {
                const k = K[i], melS = k.aEu + (k.aPh - k.aEu) * pheo, Ms = 0.7 * Ma;
                const sigS = Math.max(Ds, 0.005) * (k.ray + (1 - k.ray) * mie), sigA = Ms * melS + 1e-4;
                const a = 1 + sigA / sigS, b = Math.sqrt(Math.max(a * a - 1, 1e-6)), x = Math.min(b * sigS, 30), coth = Math.cosh(x) / Math.sinh(x);
                const Rs = (1 - k.Ripe * (a - b * coth)) / (a - k.Ripe + b * coth);
                const T = Math.exp(-Ma * melS), rho = k.rhoEu + (k.rhoPh - k.rhoEu) * pheo, Ty = Math.exp(-yellow * k.yel);
                const r = ((1 - T) * rho + T * T * Rs) * Ty * Ty;
                X += r * xb[i] * d65[i]; Y += r * yb[i] * d65[i]; Z += r * zb[i] * d65[i];
            }
            X /= Xw; Y /= Yw; Z /= Zw;
            out[o++] = Math.max(0, 3.2406 * X - 1.5372 * Y - 0.4986 * Z); out[o++] = Math.max(0, -0.9689 * X + 1.8758 * Y + 0.0415 * Z); out[o++] = Math.max(0, 0.0557 * X - 0.2040 * Y + 1.0570 * Z);
        }
        LUT = out; return out;
    }
    const index = m => (((m[0] * 16 + m[1]) * 5 + m[2]) * 8 + m[3]) * 7 + m[4];
    // Lab under D65 from LINEAR sRGB (OpenCV's BGR2Lab on float: sRGB → linear → XYZ → Lab; the fitter encodes to sRGB first, so net: Lab of the linear colour)
    const Xn = 0.950456, Zn = 1.088754, fl = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116, fi = t => { const c = t * t * t; return c > 0.008856 ? c : (t - 16 / 116) / 7.787; };
    function lin2lab(r, g, b) { r = Math.min(1, Math.max(0, r)); g = Math.min(1, Math.max(0, g)); b = Math.min(1, Math.max(0, b));
        const X = (0.412453 * r + 0.357580 * g + 0.180423 * b) / Xn, Y = 0.212671 * r + 0.715160 * g + 0.072169 * b, Z = (0.019334 * r + 0.119193 * g + 0.950227 * b) / Zn;
        const fx = fl(X), fy = fl(Y), fz = fl(Z); return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]; }
    function lab2lin(L, a, b) { const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200; const X = fi(fx) * Xn, Y = fi(fy), Z = fi(fz) * Zn;
        return [3.240479 * X - 1.537150 * Y - 0.498535 * Z, -0.969256 * X + 1.875991 * Y + 0.041556 * Z, 0.055648 * X - 0.204043 * Y + 1.057311 * Z]; }
    function grade(lab, g, rotDeg) { const t = rotDeg * Math.PI / 180, a = lab[1] * g, b = lab[2] * g; return [lab[0], a * Math.cos(t) - b * Math.sin(t), a * Math.sin(t) + b * Math.cos(t)]; }
    // the fitter's graded(): clip to the cube (lin2lab clips), Lab, grade, back
    function graded(lin, g, rotDeg) { const lab = lin2lab(Math.max(1e-5, lin[0]), Math.max(1e-5, lin[1]), Math.max(1e-5, lin[2])); return lab2lin(...grade(lab, g, rotDeg)); }
    const LUMA = [0.2126, 0.7152, 0.0722];
    function colourOf(mat, lum, gr, opts = {}) {       // → linear sRGB in photo space, as the file's rgb was
        if (!LUT) buildLut(); const i = index(mat) * 3, c = graded([LUT[i] * lum, LUT[i + 1] * lum, LUT[i + 2] * lum], gr ? gr.chroma : 1, gr ? (gr.hue || 0) : 0);
        if (opts.unit) { const Y = Math.max(1e-9, c[0] * LUMA[0] + c[1] * LUMA[1] + c[2] * LUMA[2]); return [c[0] / Y, c[1] / Y, c[2] / Y]; }
        return c;
    }
    window.IrisMaterials = { GRID, SHAPE, buildLut, get lut() { return LUT || buildLut(); }, index, lin2lab, lab2lin, grade, graded, colourOf, LUMA };
})();
