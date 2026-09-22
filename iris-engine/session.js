// session.js — study/11 SAVE (iori D3): the page's state as one file. ⌘ / Ctrl + S saves it, ⌘ / Ctrl + O or a file
// dropped on the page opens it, File ▸ New goes back to the start eye. The same object is kept in localStorage when
// the hand stops, and on the next visit it wins over the start eye (never with ?start=off — tests and benches).
// Loaded by ui31.js after tissue-ui.js (3.11 only). Engine API only: E.makeID / importID, IrisTissue, the Tissue window.
//
// The file: { format: 'iris-session', v: 1, engine, saved, quality, camera, tissue | id, journal }
//   tissue — the layer-model eye (its case file, its dials, on / off); then `id` is left out: the eye IS the case
//   id     — any other eye: the engine's own ID (genome, fields, view), exactly what File ▸ Save ID writes
//   journal — the op journal (G4); null until then: painted work is not saved yet
(() => {
    const E = window.__irisEngine, U = window.__irisUI, T = window.IrisTissue, X = window.__irisTissueUI;
    if (!E || !U || window.__irisSession) return;
    const state = E.state, target = E.target, KEY = 'irisSession';
    const DIALS = ['deckZ', 'sheetZ', 'wallZ', 'srelAmt', 'delight', 'margin', 'marginKeep', 'marginRound', 'margFade', 'k1'];
    const S = window.__irisSession = {};

    S.capture = () => {
        const s = { format: 'iris-session', v: 1, engine: E.ENGINE_VERSION, saved: new Date().toISOString(), quality: E.quality,
            camera: { useRot: !!state.useRot, camRot: (state.camRot || [0, 0]).slice(), view: (state.view || [0, 0, 1, 1]).slice(), zoomPhoto: state.zoomPhoto, specular: state.specular || 0 },
            tissue: null, id: null, journal: null };
        if (X && X.st === 'loaded' && T && T.src) s.tissue = { eye: T.src.ref, on: !!T.on, dials: Object.fromEntries(DIALS.map(k => [k, T[k] === undefined ? null : T[k]])) };
        else s.id = E.makeID();
        return s;
    };
    const busy = () => state.fitting || state.capturing || (E.fit && E.fit.fit && E.fit.fit.benchRunning) || (X && X.loading);

    // put a session back. The layer-model eye goes through the start eye's quiet path (shipped measurements when the
    // dials are the defaults, measured otherwise); any other eye is the engine's own importID. The camera comes last.
    S.restore = async (s, opts = {}) => {
        if (typeof s === 'string') s = JSON.parse(s);
        if (s && s.format !== 'iris-session' && s.genome) { E.importID(s); U.say('Opened an iris ID'); return true; }   // a plain ID file
        if (!s || s.format !== 'iris-session') throw new Error('not an iris session file');
        if (s.quality && s.quality !== E.quality && E.QUALITY && E.QUALITY[s.quality]) E.setQuality(s.quality);
        let note = '';
        if (s.tissue && X && X.eyeFile && s.tissue.eye === X.eyeFile()) {
            for (const k of DIALS) if (s.tissue.dials && s.tissue.dials[k] !== null && s.tissue.dials[k] !== undefined) T[k] = s.tissue.dials[k];
            if (X.syncDials) X.syncDials();
            X.quietOpen = true; state.fitting = true;
            try { await X.load({ arrival: true }); } finally { state.fitting = false; X.quietOpen = false; }
            if (X.st !== 'loaded') throw new Error('the layer model could not be loaded');
            T.on = !!s.tissue.on; if (X.sync) X.sync();
        } else if (s.tissue) { note = ' — its layer-model eye is not on this site; opened without it'; if (s.id) E.importID(s.id); }
        else if (s.id) E.importID(s.id);
        const c = s.camera || {};
        if (c.view) state.view = c.view.slice(); if (c.camRot) state.camRot = c.camRot.slice(); state.useRot = !!c.useRot;
        if (c.zoomPhoto) state.zoomPhoto = target.zoomPhoto = c.zoomPhoto; if (c.specular !== undefined) state.specular = c.specular;
        E.resetAccumulation();
        if (!opts.quiet) U.say('Session opened' + (s.saved ? ' (saved ' + s.saved.slice(0, 16).replace('T', ' ') + ')' : '') + note);
        return true;
    };

    // ⌘ S — a file the visitor keeps; the name says which eye and when
    S.save = () => {
        const s = S.capture(), json = JSON.stringify(s), t = s.saved.slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
        const eye = s.tissue ? 'eye' + s.tissue.eye.slice(0, 2) : 'seed' + ((s.id && s.id.genome && s.id.genome.seed) || '');
        const a = document.createElement('a'); a.download = `iris-${eye}-${t}.iris.json`; a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000); keep(json); U.say('Saved ' + a.download); return s;
    };
    const openFile = f => f.text().then(t => S.restore(t)).catch(e => U.say('Could not open ' + f.name + ': ' + (e && e.message || e)));
    S.open = () => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json'; inp.onchange = () => { if (inp.files[0]) openFile(inp.files[0]); }; inp.click(); };
    // File ▸ New: forget the kept session and meet the start eye again
    S.fresh = () => { try { localStorage.removeItem(KEY); } catch (e) {} paused = true; location.hash = ''; location.reload(); };

    // the kept copy: written when the hand stops (1.5 s after the last pointer / key / wheel), never mid-fit or mid-load
    let timer = 0, last = '', paused = false;
    function keep(json) { if (paused) return; try { if (json !== last) { localStorage.setItem(KEY, json); last = json; } } catch (e) {} }
    const soon = () => { clearTimeout(timer); timer = setTimeout(() => { if (busy()) return soon(); try { keep(JSON.stringify(S.capture())); } catch (e) {} }, 1500); };
    S.autosave = on => { paused = !on; };
    if (/[?&]start=off\b/.test(location.search)) paused = true;             // tests and benches neither read nor write it
    for (const ev of ['pointerup', 'keyup', 'wheel', 'change']) document.addEventListener(ev, soon, { passive: true, capture: true });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && !busy()) try { keep(JSON.stringify(S.capture())); } catch (e) {} });

    // a session or ID file dropped anywhere on the page
    document.addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
    document.addEventListener('drop', e => { const f = e.dataTransfer && e.dataTransfer.files[0]; if (!f || !/\.json$/i.test(f.name)) return; e.preventDefault(); openFile(f); });

    // the visit: a kept session (ui31.js decided before the first frame, and skipped the start eye for it)
    const P = window.__irisSessionPending; window.__irisSessionPending = null;
    if (P) S.restore(P, { quiet: true }).then(() => U.say('Welcome back — your last eye')).catch(e => {
        console.warn('kept session', e); try { localStorage.removeItem(KEY); } catch (e2) { return; } location.reload(); });   // a broken copy: forget it, meet the start eye
})();
