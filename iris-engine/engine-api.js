// IrisEngine — the public surface of the engine (study/15 §5, study/14 phase 1 step 4). The page and every tool are
// clients of this; nothing outside engine.js, tissue.js, eyefile.js and tissue-ui.js should reach for the globals
// (__irisEngine, IrisTissue, IrisEye, __irisTissueUI) directly once this exists. It is a facade: the engine still
// creates its own canvas (#gl) and syncs the page's buttons — mount(canvas) therefore accepts only that canvas today
// and says so; moving the engine off the page's DOM is the 1b worklist (study/14).
(() => {
    const E = () => window.__irisEngine, T = () => window.IrisTissue, X = () => window.__irisTissueUI, EYE = () => window.IrisEye;
    const need = (v, what) => { if (!v) throw new Error('IrisEngine: ' + what + ' is not on this page yet'); return v; };
    let handle = null;

    function mount(canvas, opts = {}) {
        const e = need(E(), 'the renderer');
        if (canvas && canvas !== e.canvas) throw new Error('IrisEngine.mount: this version renders only into the page\'s own canvas (#gl); a free canvas is 1b');
        if (handle) return handle;
        if (opts.quality) e.setQuality(opts.quality);
        handle = {
            get version() { return e.ENGINE_VERSION; },
            get canvas() { return e.canvas; },
            // ---- the eye: one way in (tissue-ui.js X.load is the implementation; this is its public name)
            async load(src = {}, o = {}) {                  // src: 'data/26.iris' | { url } | { id: '26' } | '26'
                const x = need(X(), 'the loader');
                const url = typeof src === 'string' && /\.iris(\?|$)/.test(src) ? src : src.url;
                const id = typeof src === 'string' && !url ? src : src.id;
                if (id) { if (!x.eyes().includes(id)) throw new Error('IrisEngine.load: unknown eye ' + id); x.eye = id; }
                await x.load({ url, arrival: !!o.arrival, journal: o.journal });
                if (x.st !== 'loaded') throw new Error('IrisEngine.load: ' + x.st + (x.error ? ' — ' + x.error : ''));
                return this.eye;
            },
            unload() { const t = T(); if (t) t.on = false; e.resetAccumulation(); },
            get eye() { const t = T(), x = X(); return t && t.src ? { id: x && x.eye, photo: t.src.ref, on: !!t.on, measured: !(t.shipped && t.shipped.light), timing: x && x.timing } : null; },
            get on() { const t = T(); return !!(t && t.on); }, set on(v) { const t = need(T(), 'the layer model'); t.on = !!v; e.resetAccumulation(); },
            eyes() { return need(X(), 'the loader').eyes(); },
            measure() { return need(X(), 'the loader').load(); },                                   // the measured load (editor only)
            // ---- state the viewer owns
            get quality() { return e.quality; }, set quality(q) { e.setQuality(q); },
            get camera() { const s = e.state; return { zoom: s.zoomPhoto, view: s.view.slice(), rot: s.camRot.slice(), fixed: !!s.useRot, pupil: s.pupil }; },
            set camera(c) { const s = e.state, t = e.target; if (c.zoom !== undefined) s.zoomPhoto = t.zoomPhoto = c.zoom; if (c.view) s.view = c.view.slice(); if (c.rot) { s.camRot = c.rot.slice(); s.useRot = true; } if (c.fixed !== undefined) s.useRot = !!c.fixed; if (c.pupil !== undefined) e.setSlider('pupil', 'pupil', c.pupil); e.resetAccumulation(); },
            // ---- the journal: every edit is an op (G4)
            apply(op) { return need(T(), 'the layer model').apply(op); },
            undo() { return need(T(), 'the layer model').undo(); },
            journal() { return need(T(), 'the layer model').journal(); },
            replay(j) { return need(T(), 'the layer model').replay(j); },
            // ---- looking closely
            probe(opts) { return need(T(), 'the layer model').probe(opts); },
            elevationAt(x, y) { return need(T(), 'the layer model').elevationAt(x, y); },
            // ---- the file: this eye with its journal, as bytes (the sections not touched pass through)
            async export() {
                const x = need(X(), 'the loader'), ey = need(EYE(), 'the eye file reader'), t = need(T(), 'the layer model');
                const url = (x.lastUrl) || `data/${x.eye}.iris`, buf = await fetch(url).then(r => r.arrayBuffer());
                return ey.replaceSection(buf, 'journal', t.journal(), 'json');
            },
            // ---- escape hatches, named so their use can be found and removed
            get _engine() { return e; }, get _tissue() { return T(); }, get _loader() { return X(); },
        };
        return handle;
    }
    window.IrisEngine = { mount, get handle() { return handle; }, read: (...a) => need(EYE(), 'the eye file reader').read(...a), fetch: (...a) => need(EYE(), 'the eye file reader').fetch(...a) };
})();
