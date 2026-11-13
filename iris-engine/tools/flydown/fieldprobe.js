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
    async run(name, o) {
        const F = window.__irisFly; await FP.bake();
        const r = await F.probeField(o);
        const put = (ext, body) => fetch(`/save/field/${name}.${ext}`, { method: 'POST', body }).then(x => x.status);
        const s = [await put('ground.f32', r.ground.buffer), await put('sdf.f32', r.sdf.buffer), await put('json', JSON.stringify(r.meta, null, 1))]; if (r.kind) s.push(await put('kind.f32', r.kind.buffer), await put('col.f32', r.col.buffer));
        return { saved: s, meta: r.meta };
    },
};
