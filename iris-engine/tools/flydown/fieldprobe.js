// tools/flydown/fieldprobe.js — run the fly-down's field probe (F.probeField, flydown.js) and save it through serve.py's
// POST /save/field/<name>.{json,f32} into iris-engine/study/field/raw/ (untracked: ~150 MB a box). Paste or inject into the page.
//   await FP.run('crypt26a', { uv: [0.44, 0.59], half: 0.5, step: 0.002, level: 2 })
// The pane's rAF can stall while it is hidden: FP.bake() ticks the fly-down by hand until the edge map is baked (the ropes need it).
// Then: python3 iris-engine/study/flydown/field/mesh.py iris-engine/study/field/raw/<name>
window.FP = {
    async bake(maxS = 20) {
        const F = window.__irisFly;
        for (let i = 0; i < maxS * 4 && !(F.rimInfo && F.rimInfo.crypts); i++) { F.tick(0.03); await new Promise(r => setTimeout(r, 250)); }
        return F.rimInfo;
    },
    // boxes rich in bands over crypts: band share × crypt share (capped), on a grid over the iris, the best n that do not overlap
    pick(n = 3, half = 0.4) {
        const F = window.__irisFly, res = []; F._bandCh = 0;
        for (let v = 0.08; v < 0.86; v += 0.03) for (let u = 0; u < 1; u += 0.006) { const rr = 2 + 4 * v; let nb = 0, nc = 0, k = 0;
            for (let a = -half; a <= half; a += half / 8) for (let b = -half; b <= half; b += half / 8) { const uu = u + b / (2 * Math.PI * rr), vv = v + a / 4; k++; if (F._bandAt(uu, vv) > 0) nb++; if (F._rimAt(uu, vv)[0] < 0) nc++; }
            res.push({ uv: [+u.toFixed(3), +v.toFixed(2)], band: nb / k, crypt: nc / k, s: (nb / k) * Math.min(nc / k, 0.5) }); }
        res.sort((a, b) => b.s - a.s); const out = [];
        const mm = (p, q) => { const r = 2 + 4 * (p[1] + q[1]) / 2, du = ((p[0] - q[0] + 1.5) % 1) - 0.5; return Math.hypot(du * 2 * Math.PI * r, (p[1] - q[1]) * 4); };
        for (const r of res) { if (out.every(o => mm(o.uv, r.uv) > 2.5 * half)) out.push(r); if (out.length >= n) break; }
        return out;
    },
    // every crypt of the eye from the baked crypt map (F._rimAt < 0 over a crypt), as connected areas in mm2 (wrapping round the ring)
    crypts(nu = 1536, nv = 315) {
        const F = window.__irisFly, R = window.IrisTissue.rect, v0 = R[1], v1 = R[1] + R[3], m = new Uint8Array(nu * nv), lab = new Int32Array(nu * nv).fill(-1), out = [];
        for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) m[j * nu + i] = F._rimAt((i + 0.5) / nu, v0 + (j + 0.5) / nv * (v1 - v0))[0] < 0 ? 1 : 0;
        const cell = j => 2 * Math.PI * (2 + 4 * (v0 + (j + 0.5) / nv * (v1 - v0))) / nu * 4 * (v1 - v0) / nv, st = [];
        for (let k = 0; k < nu * nv; k++) { if (!m[k] || lab[k] >= 0) continue; let a = 0, sp = 0, touchEdge = false; st[sp++] = k; lab[k] = out.length;
            while (sp) { const q = st[--sp], j = (q / nu) | 0, i = q - j * nu; a += cell(j); if (j === 0 || j === nv - 1) touchEdge = true;
                for (const [ii, jj] of [[(i + 1) % nu, j], [(i + nu - 1) % nu, j], [i, j + 1], [i, j - 1]]) { if (jj < 0 || jj >= nv) continue; const w = jj * nu + ii; if (m[w] && lab[w] < 0) { lab[w] = out.length; st[sp++] = w; } } }
            out.push({ mm2: +a.toFixed(4), edge: touchEdge }); }
        return out;
    },
    async run(name, o) {
        const F = window.__irisFly; await FP.bake();
        const r = await F.probeField(o);
        const put = async (ext, body) => { for (let t = 0; ; t++) { try { return (await fetch(`/save/field/${name}.${ext}`, { method: 'POST', body })).status; } catch (e) { if (t >= 3) throw e; await new Promise(r => setTimeout(r, 1500)); } } };   // big bodies now and then fail (ERR_NO_BUFFER_SPACE): retried
        const s = [await put('ground.f32', r.ground.buffer), await put('sdf.f32', r.sdf.buffer), await put('json', JSON.stringify(r.meta, null, 1))]; if (r.kind) s.push(await put('kind.f32', r.kind.buffer)); if (r.col) s.push(await put('col.f32', r.col.buffer));
        return { saved: s, meta: r.meta };
    },
};
