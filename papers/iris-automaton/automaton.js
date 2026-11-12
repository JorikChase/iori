// papers/iris-automaton/automaton.js — A(eye, t): a cellular automaton that draws any Iris Engine rendering over time.
//
// Standalone (no engine imports, no DOM): plain typed arrays in, typed arrays out, so the same file runs in the paper's
// live figures, in the Node runner (tools/iris-automaton/run.mjs) and, later, inside the engine.
//
// ---------------------------------------------------------------------------------------------------------------- model
// The grid is the rendering's own pixels (W × H). Every cell x carries
//   fixed  the stage images L_0(x) … L_K(x) (RGB, display values 0..1; L_K is the rendering to be drawn, L_0 the empty
//          page) and the anatomy at x: strand tangent θ, crest c (on a strand), crypt q, radius ρ (0 pupil margin → 1
//          limbus), iris i, pupil p, plus one hash h_k(x) per layer (the cell's own jitter);
//   state  per layer k = 1..K: an ignition charge e_k ∈ [0, 1], a flag fired_k, its firing time f_k, and the deposit
//          a_k ∈ [0, 1] (how much of the k-th stage has been laid down here).
// The picture is a telescoping sum:   O(x, t) = L_0(x) + Σ_k a_k(x, t) · (L_k(x) − L_{k−1}(x))   (+ a wet rim that is 0
// whenever a_k ∈ {0, 1}). When every a_k = 1 the sum collapses to L_K: the automaton ends on the rendering itself.
//
// Rules for layer k (all local: a cell reads only itself and its 8 neighbours N(x)):
//   schedule the layer's cells may change only from its start time s_k on (one global clock, no spatial reach)
//   gate     the layer may start at x only once the layer below has laid down g_k there:  a_{k−1}(x) ≥ g_k  (a_0 ≡ 1)
//   source   a gated cell whose anatomy matches the layer's source predicate fires at once (pupil margin, a strand crest, …)
//   spread   a gated cell charges from its fired neighbours:  e += dt · max_{n ∈ N(x), fired} v_k(x) · φ_k(x, n) / |n − x|
//            and fires when e ≥ 1.  v_k = v0 · J · max(vmin, b + wc·c + wq·q + wr·ρ) is the local speed (J = 1 + j·(2h − 1),
//            the cell's jitter); φ_k = (cos² + α² sin²)^(−1/2) of the step's angle to the strand tangent (α > 1: slower
//            across the strands than along them, the print's 3.5)
//   ember    a gated cell that has waited longer than its own patience P_k · (1 + h) fires by itself (so a region the
//            fronts cannot reach — a closed crypt, a speck of sclera — is still drawn; this is what makes the end certain)
//   deposit  once fired:  a_k = clamp((t − f_k) / D_k, 0, 1)
// Time advances in steps dt; every cell is updated from the state of the previous step (synchronous).
//
// The paper (iris-automaton.html) proves: (1) every cell fires in every layer by a finite T_end (gates + ember); (2)
// from then on O ≡ L_K (telescoping), so the error to the rendering is 0 up to float rounding; (3) the update of x
// reads only N(x), so the rule is local and the same for every eye: generality is in the inputs, not the rules.

export const FIELDS = ['theta', 'crest', 'crypt', 'rho', 'iris', 'pupil'];

// A layer's rule. Every number has a meaning in pixels / time units of the grid (time unit = one step at dt = 1).
export function rule(o = {}) {
    return Object.assign({
        name: 'layer', gate: 0.5,            // a_{k−1} needed before this layer may start
        src: null,                           // source predicate: { field, lt?, gt?, and? } (fires as soon as gated)
        v0: 1, vmin: 0.05, b: 1, wc: 0, wq: 0, wr: 0, j: 0.25,  // speed v = v0·J·max(vmin, b + wc·c + wq·q + wr·ρ)
        alpha: 1,                            // across / along the strand tangent (1 = isotropic)
        domain: null,                        // optional predicate: cells outside it fire at once and lay down instantly
        start: 0,                            // the schedule: sources may fire from this time on (spread and ember need it too)
        patience: 200,                       // ember: waits this long (× 1 + h) after its gate, then fires alone
        D: 12,                               // deposition time
        wet: 0,                              // darkening of the wet rim, max at a = 1/2, 0 at a ∈ {0, 1}
    }, o);
}

const hash = (x, y, k, s) => {           // integer hash → [0, 1): the cell's own jitter (deterministic per eye seed)
    let n = (x * 374761393 + y * 668265263 + k * 2147483647 + s * 1274126177) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177); n ^= n >>> 16; return (n >>> 0) / 4294967296;
};

function pred(p, F, i) {                  // { field, lt, gt, and } on the anatomy at cell i
    if (!p) return false;
    const v = F[p.field][i];
    let ok = (p.lt === undefined || v < p.lt) && (p.gt === undefined || v > p.gt);
    if (ok && p.and) ok = pred(p.and, F, i);
    if (!ok && p.or) ok = pred(p.or, F, i);
    return ok;
}

// sheet: { W, H, layers: [Float32Array(W·H·3) × (K+1)], fields: { theta, crest, crypt, rho, iris, pupil: Float32Array(W·H) },
//          rules: [rule × K], seed }
export function createAutomaton(sheet) {
    const { W, H, layers, fields: F } = sheet, N = W * H, K = layers.length - 1, R = sheet.rules;
    if (R.length !== K) throw new Error(`automaton: ${K} stages above the page need ${K} rules, got ${R.length}`);
    const seed = sheet.seed | 0;
    // per-layer, per-cell constants (precomputed once: speed with jitter, patience, the 8 directional factors, source, domain)
    const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
    const L = R.map((r, k) => {
        const v = new Float32Array(N), pat = new Float32Array(N), src = new Uint8Array(N), dom = new Uint8Array(N), phi = new Float32Array(N * 8);
        for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
            const h = hash(x, y, k + 1, seed), J = 1 + r.j * (2 * h - 1);
            v[i] = r.v0 * J * Math.max(r.vmin, r.b + r.wc * F.crest[i] + r.wq * F.crypt[i] + r.wr * F.rho[i]);
            pat[i] = r.patience * (1 + hash(x, y, k + 101, seed));
            src[i] = pred(r.src, F, i) ? 1 : 0; dom[i] = r.domain ? (pred(r.domain, F, i) ? 1 : 0) : 1;
            const tc = Math.cos(F.theta[i]), ts = Math.sin(F.theta[i]);
            for (let d = 0; d < 8; d++) {
                const [dx, dy] = NB[d], len = Math.hypot(dx, dy), c = (dx * tc + dy * ts) / len, s2 = Math.max(0, 1 - c * c);
                phi[i * 8 + d] = 1 / Math.sqrt(c * c + r.alpha * r.alpha * s2) / len;
            }
        }
        return { v, pat, src, dom, phi };
    });
    const st = {
        t: 0, K, W, H,
        e: R.map(() => new Float32Array(N)), fired: R.map(() => new Uint8Array(N)), f: R.map(() => new Float32Array(N).fill(Infinity)),
        gt: R.map(() => new Float32Array(N).fill(Infinity)),   // when the gate opened (for the ember)
        how: R.map(() => new Uint8Array(N)),                   // what fired the cell: 1 source, 2 a neighbour, 3 ember, 4 outside the layer's domain
        a: R.map(() => new Float32Array(N)), on: R.map(() => true), done: false, tEnd: Infinity,
    };
    const nf = R.map(() => new Uint8Array(N));          // next step's fired flags (synchronous update)

    function step(dt = 1) {
        const t = st.t, t1 = t + dt;
        let allDone = true;
        for (let k = 0; k < K; k++) {
            const r = R[k], c = L[k], fired = st.fired[k], e = st.e[k], f = st.f[k], gt = st.gt[k], a = st.a[k], nx = nf[k], how = st.how[k];
            const below = k > 0 ? st.a[k - 1] : null;
            nx.set(fired);
            for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
                if (fired[i]) continue;
                allDone = false;
                if (t < r.start || (below && below[i] < r.gate)) continue;    // not yet scheduled, or the gate is closed
                if (gt[i] === Infinity) gt[i] = t;
                if (!c.dom[i] || c.src[i] || t - gt[i] >= c.pat[i]) { nx[i] = 1; f[i] = c.dom[i] ? t : -Infinity; how[i] = !c.dom[i] ? 4 : c.src[i] ? 1 : 3; continue; }
                let best = 0;
                for (let d = 0; d < 8; d++) {
                    const xx = x + NB[d][0], yy = y + NB[d][1];
                    if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
                    const n = yy * W + xx;
                    if (fired[n] && c.dom[n]) { const q = c.phi[i * 8 + d]; if (q > best) best = q; }
                }
                if (best > 0) { e[i] += dt * c.v[i] * best; if (e[i] >= 1) { nx[i] = 1; how[i] = 2; f[i] = t1 - (e[i] - 1) / (c.v[i] * best); } }
            }
            fired.set(nx);
            const D = r.D;
            for (let i = 0; i < N; i++) a[i] = f[i] === Infinity ? 0 : Math.min(1, Math.max(0, (t1 - f[i]) / D));
        }
        st.t = t1;
        if (allDone && !st.done) { st.done = true; st.tEnd = t1 + Math.max(...R.map(r => r.D)) + 1; }
        return st;
    }

    // a_k at any time t from the firing times (exact: deposition after firing is deterministic) — the scrubber
    function depositsAt(t, out = R.map(() => new Float32Array(N))) {
        for (let k = 0; k < K; k++) { const f = st.f[k], D = R[k].D, a = out[k]; for (let i = 0; i < N; i++) a[i] = f[i] === Infinity ? 0 : Math.min(1, Math.max(0, (t - f[i]) / D)); }
        return out;
    }

    // run to the end: every cell fired in every layer (returns T_end); bounded by maxT as a guard
    function run(dt = 1, maxT = 1e5, onStep) {
        while (!st.done && st.t < maxT) { step(dt); if (onStep) onStep(st); }
        return st.tEnd;
    }

    // the picture: O = L_0 + Σ on_k · a_k · (L_k − L_{k−1}) − wet rims; into a Float32Array RGB or a Uint8ClampedArray RGBA
    function compose(out, a = st.a, on = st.on) {
        const rgba = out instanceof Uint8ClampedArray, s = rgba ? 255 : 1, stride = rgba ? 4 : 3, L0 = layers[0];
        for (let i = 0; i < N; i++) {
            let r = L0[i * 3], g = L0[i * 3 + 1], b = L0[i * 3 + 2], wet = 0;
            for (let k = 0; k < K; k++) {
                if (!on[k]) continue;
                const ak = a[k][i]; if (ak === 0) continue;
                const P = layers[k], Q = layers[k + 1];
                r += ak * (Q[i * 3] - P[i * 3]); g += ak * (Q[i * 3 + 1] - P[i * 3 + 1]); b += ak * (Q[i * 3 + 2] - P[i * 3 + 2]);
                if (R[k].wet && ak < 1) wet += R[k].wet * 4 * ak * (1 - ak);
            }
            const m = 1 - Math.min(wet, 0.6);
            out[i * stride] = r * m * s; out[i * stride + 1] = g * m * s; out[i * stride + 2] = b * m * s; if (rgba) out[i * 4 + 3] = 255;
        }
        return out;
    }

    return { st, step, run, depositsAt, compose, rules: R, sheet };
}

// error of a picture against the rendering L_K, in 8-bit levels: mean |Δ| over all channels, over a mask (or all), and the max
export function errorTo(sheet, pic, mask = null) {
    const T = sheet.layers[sheet.layers.length - 1], N = sheet.W * sheet.H, rgba = pic instanceof Uint8ClampedArray, st = rgba ? 4 : 3, s = rgba ? 1 : 255;
    let sum = 0, n = 0, mx = 0;
    for (let i = 0; i < N; i++) {
        if (mask && !mask[i]) continue;
        for (let c = 0; c < 3; c++) { const d = Math.abs(pic[i * st + c] * s - T[i * 3 + c] * 255); sum += d; if (d > mx) mx = d; }
        n += 3;
    }
    return { mean: sum / Math.max(n, 1), max: mx };
}
