// sun.js — a light that moves round the eye (iori, 2026-11-11: "a day night cycle or anything where there wouldnt just be a frontal
// light and we can inspect the features shadows and overlaps"). Off by default: FIXED is the box light as it was, still in the world.
//
//   SUN     a time of day drives the key light along an arc over the eye: it rises grazing from the left (6 h), passes high over the
//           top at noon and sets grazing on the right (18 h); at night a dim, cold moon takes the same arc. Low sun is warm (kelvin
//           follows the elevation), the room dims at night. PLAY runs a day in `dayLen` seconds.
//   MANUAL  the dome: drag the dot. The centre is frontal light, the rim is grazing, the direction is where the light comes from.
//
// It writes only the engine's own light state (lightAngle, lightElev, kelvin, ambient, ev) through setSlider, so the sliders follow;
// FIXED puts back the values it found. Elevation is the engine's: π/2 is from the camera, 0 lies in the iris plane.
// The light is still in the world only in the free view (engine lightStatic); CAM FIXED keeps the fitter's rig.
(() => {
    const E = window.__irisEngine; if (!E || window.__irisSun) return;
    const { state } = E;
    const KEYS = [['light', 'lightAngle'], ['elev', 'lightElev'], ['kelvin', 'kelvin', 0], ['ambient', 'ambient'], ['ev', 'ev', 1]];
    const S = { mode: 'fixed', t: 9.5, playing: false, dayLen: 40, la: Math.PI * 0.75, le: 0.5, saved: null, maxElev: 1.25, listeners: new Set() };
    const set = (id, key, v, d) => E.setSlider(id, key, v, d);
    const save = () => { S.saved = Object.fromEntries(KEYS.map(([, k]) => [k, state[k]])); };
    const restore = () => { if (!S.saved) return; KEYS.forEach(([id, k, d]) => set(id, k, S.saved[k], d)); S.saved = null; E.resetAccumulation(); };
    const sm = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };

    // the time of day → light direction, colour, room and exposure
    function sunAt(t) {
        const day = t >= 6 && t < 18, u = day ? (t - 6) / 12 : ((t + 6) % 24) / 12;        // 0..1 along tonight's or today's arc
        const la = Math.PI * (1 - u);                                                      // from the left (π) over the top (π/2) to the right (0)
        const le = Math.max(0.03, S.maxElev * Math.sin(Math.PI * u));                       // grazing at both ends of the arc
        const lift = sm(0.0, 0.6, le);                                                     // 0 at the horizon, 1 high up
        const base = S.saved || state;
        if (day) return { la, le, kelvin: 2400 + (5600 - 2400) * lift, ambient: base.ambient * (0.45 + 0.55 * lift), ev: base.ev };
        return { la, le, kelvin: 7800, ambient: base.ambient * 0.25, ev: base.ev - 1.6 };   // the moon: cold, the room nearly dark
    }
    function apply(L) {
        set('light', 'lightAngle', L.la); set('elev', 'lightElev', L.le);
        if (L.kelvin !== undefined) set('kelvin', 'kelvin', L.kelvin, 0);
        if (L.ambient !== undefined) set('ambient', 'ambient', L.ambient);
        if (L.ev !== undefined) set('ev', 'ev', L.ev, 1);
        E.resetAccumulation(); S.listeners.forEach(f => f());
    }
    function setMode(m) {
        if (m === S.mode) return;
        if (S.mode === 'fixed') save();
        S.mode = m;
        if (m === 'fixed') { S.playing = false; restore(); S.listeners.forEach(f => f()); return; }
        if (m === 'sun') apply(sunAt(S.t));
        if (m === 'manual') { S.playing = false; const b = S.saved; apply({ la: S.la, le: S.le, kelvin: b.kelvin, ambient: b.ambient, ev: b.ev }); }
    }
    const setTime = t => { S.t = ((t % 24) + 24) % 24; if (S.mode !== 'sun') setMode('sun'); else apply(sunAt(S.t)); };
    const setDir = (la, le) => { S.la = la; S.le = Math.max(0.03, Math.min(Math.PI / 2, le)); if (S.mode !== 'manual') setMode('manual'); else apply({ la: S.la, le: S.le }); };
    const play = on => { S.playing = on === undefined ? !S.playing : !!on; if (S.playing && S.mode !== 'sun') setMode('sun'); S.listeners.forEach(f => f()); };
    function step(dt) { if (S.playing && S.mode === 'sun') setTime(S.t + dt * 24 / S.dayLen); }

    // the dome: a disc seen from the camera. Centre = frontal, rim = grazing; the dot is where the light comes from.
    function dome(size = 132) {
        const d = devicePixelRatio || 1, cv = document.createElement('canvas');
        cv.width = cv.height = Math.round(size * d); cv.style.width = cv.style.height = size + 'px'; cv.style.touchAction = 'none'; cv.style.cursor = 'crosshair';
        cv.title = 'Drag: where the light comes from (centre = from the camera, rim = grazing)';
        const g = cv.getContext('2d');
        const cur = () => S.mode === 'fixed' ? { la: state.lightAngle, le: state.lightElev } : { la: state.lightAngle, le: state.lightElev };
        function draw() {
            const W = cv.width, R = W / 2 - 8 * d, c = W / 2, ink = getComputedStyle(cv).color || '#000';
            g.clearRect(0, 0, W, W); g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = d;
            g.globalAlpha = 0.9; g.beginPath(); g.arc(c, c, R, 0, 7); g.stroke();
            g.globalAlpha = 0.35; [Math.PI / 6, Math.PI / 3].forEach(e => { g.beginPath(); g.arc(c, c, R * Math.cos(e), 0, 7); g.stroke(); });   // 30°, 60° elevation
            g.beginPath(); g.moveTo(c - R, c); g.lineTo(c + R, c); g.moveTo(c, c - R); g.lineTo(c, c + R); g.stroke();
            if (S.mode === 'sun') {                                                         // today's arc
                g.globalAlpha = 0.6; g.setLineDash([3 * d, 3 * d]); g.beginPath();
                for (let i = 0; i <= 48; i++) { const u = i / 48, la = Math.PI * (1 - u), le = Math.max(0.03, S.maxElev * Math.sin(Math.PI * u)), r = R * Math.cos(le); const x = c + r * Math.cos(la), y = c - r * Math.sin(la); i ? g.lineTo(x, y) : g.moveTo(x, y); }
                g.stroke(); g.setLineDash([]);
            }
            const { la, le } = cur(), r = R * Math.cos(le), x = c + r * Math.cos(la), y = c - r * Math.sin(la);
            g.globalAlpha = S.mode === 'fixed' ? 0.5 : 1; g.beginPath(); g.arc(x, y, 5 * d, 0, 7); S.mode === 'fixed' ? g.stroke() : g.fill();
            g.globalAlpha = 1;
        }
        const pick = e => { const r = cv.getBoundingClientRect(), R = r.width / 2 - 8, x = e.clientX - r.left - r.width / 2, y = -(e.clientY - r.top - r.height / 2);
            const q = Math.min(1, Math.hypot(x, y) / R); setDir(Math.atan2(y, x), Math.acos(q)); };
        cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); pick(e); e.preventDefault(); });
        cv.addEventListener('pointermove', e => { if (cv.hasPointerCapture(e.pointerId)) pick(e); });
        S.listeners.add(draw); draw();
        return cv;
    }

    let last = performance.now();
    (function frame(now) { const dt = Math.min(0.1, (now - last) / 1000); last = now; step(dt); requestAnimationFrame(frame); })(last);
    window.__irisSun = Object.assign(S, { setMode, setTime, setDir, play, step, sunAt, dome });
})();
