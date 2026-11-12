// gaze.js — input hygiene and the gaze rules (study/09 §5, phase U0).
//
// The engine's pointer and wheel listeners sit on `window` and guard `#ui-panel`, which the shell hides, so
// every event over a window also drove the eye: moving over a window turned it, the wheel on a scrubber zoomed
// the camera, pressing a control constricted the pupil. This file fixes that from outside, without touching
// index.html (the renderer work edits that file):
//
//   guards  one bubble listener on `document`: an event that did not start on the GL canvas is stopped there,
//           before it reaches the engine's window listeners. Controls keep working — their own listeners ran
//           already. A pointerup is stopped only when its pointerdown was stopped, so a press that began on the
//           iris always gets released.
//   gaze    TRACK  pointer in the scene: index.html follows the cursor as before, nothing is written here
//           HOLD   pointer on UI or outside the page: the eye keeps its last look
//           RETURN after `hold` seconds idle: a finite smoothstep ease of the target to the canvas centre over
//                  `ret` seconds (finite so the accumulation can converge; an exponential tail never ends)
//           REST   centred
//           While any control is held the clock stops: nothing moves during a drag.
//
// State lives here, never in the engine's `state` (fit.js snapshots that at load and drops unknown keys).
// Frozen-camera modes (REF, DESIGN, CAM FIXED, fitting, capturing) are left alone.
(() => {
    const E = window.__irisEngine; if (!E || window.__irisGaze) return;
    const { state, target, canvas } = E;
    const G = { st: 'REST', idle: 0, t: 0, from: [0, 0], held: false, hold: 1.0, ret: 3.5, enabled: true };
    const uiDown = new Set();                                   // pointers whose pointerdown landed on UI
    const inScene = e => e.target === canvas;
    const frozen = () => state.ref || state.design || state.useRot || state.fitting || state.capturing;
    const centre = () => [canvas.width / 2, canvas.height / 2];
    const leave = () => { if (G.st === 'TRACK') { G.st = 'HOLD'; G.idle = 0; } };

    document.addEventListener('pointermove', e => {
        if (!G.enabled) return;
        if (inScene(e) && !uiDown.has(e.pointerId)) { G.st = 'TRACK'; return; }
        e.stopPropagation(); leave();
    });
    document.addEventListener('pointerdown', e => {
        if (!G.enabled) return;
        if (inScene(e)) { G.st = 'TRACK'; if (!frozen()) { target.mouseX = e.clientX * E.dpr; target.mouseY = e.clientY * E.dpr; } return; }   // a tap has no pointermove
        e.stopPropagation(); uiDown.add(e.pointerId); G.held = true; leave();
    });
    const up = e => {
        if (!G.enabled) return;
        if (uiDown.delete(e.pointerId)) { e.stopPropagation(); G.held = uiDown.size > 0; return; }
        if (e.pointerType === 'touch') leave();                  // touch has no hover: lifting the finger leaves the scene
    };
    document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
    document.addEventListener('wheel', e => { if (G.enabled && !inScene(e)) e.stopPropagation(); }, { passive: true });
    document.documentElement.addEventListener('pointerleave', leave);   // the cursor left the page
    window.addEventListener('blur', () => { uiDown.clear(); G.held = false; leave(); });

    // ---- optics zoom (iori, 2026-11-11, "as handy as the kiroshi optics zoom"): hold the RIGHT button on the eye (desktop), or rest
    // one finger still on it for HOLD_MS (touch), and the view snaps in to ×2 around the point under the pointer in ≈ 200 ms with a
    // crisp ease-out; keep holding and it steps on (×4, ×8, ×16) every STEP_MS; the wheel while held steps in or out (and stops the
    // auto-stepping). Release eases back to the full view. It is a telephoto crop of the frame (state.view, the tiled capture's own
    // window), anchored so the held point stays under the pointer — the camera does not move, the eye keeps following the cursor.
    // The deepest step is where the walk mode will take over (study/17 D5); until it exists the zoom stops at ×16.
    // Left click and taps keep their meaning; a touch that moves first is a drag, two fingers are ui31's pinch. The context menu is
    // suppressed only on the canvas, only while the optics are up (or just released).
    const STEPS = [1, 2, 4, 8, 16];
    const Z = { HOLD_MS: 380, SLOP: 10, STEP_MS: 650, T_STEP: 0.2, T_OUT: 0.32, auto: true, held: false, pid: null, relT: -1e9, touch: null, touches: new Set(),
                step: 0, m: 1, m0: 1, mT: 1, t: 1, dur: 0.2, anchor: null, base: null, since: 0 };
    const hud = document.createElement('div');
    hud.id = 'optics-hud';
    hud.innerHTML = '<i></i><i></i><i></i><i></i><b></b>';
    const css = document.createElement('style');
    css.textContent = `#optics-hud{position:fixed;width:120px;height:84px;margin:-42px 0 0 -60px;pointer-events:none;z-index:50;opacity:0;transition:opacity .12s;
      font:600 11px/1 ui-monospace,Menlo,monospace;color:#bff3ff;text-shadow:0 0 3px #000}
      #optics-hud i{position:absolute;width:12px;height:12px;border:1px solid rgba(191,243,255,.85)}
      #optics-hud i:nth-child(1){left:0;top:0;border-width:1px 0 0 1px}#optics-hud i:nth-child(2){right:0;top:0;border-width:1px 1px 0 0}
      #optics-hud i:nth-child(3){left:0;bottom:0;border-width:0 0 1px 1px}#optics-hud i:nth-child(4){right:0;bottom:0;border-width:0 1px 1px 0}
      #optics-hud b{position:absolute;left:100%;top:0;margin-left:6px;letter-spacing:.06em}`;
    document.head.appendChild(css); document.body.appendChild(hud);
    const goStep = (k, dur) => { k = Math.max(0, Math.min(STEPS.length - 1, k)); if (k === Z.step && Z.mT === STEPS[k]) return; Z.step = k; Z.m0 = Z.m; Z.mT = STEPS[k]; Z.t = 0; Z.dur = dur; Z.since = 0; };
    const zPress = (id, x, y) => {
        if (frozen() || (window.__irisFly && window.__irisFly.walk)) return;   // the walk has its own camera
        const r = canvas.getBoundingClientRect();
        if (Z.m === 1) { Z.base = (state.view || [0, 0, 1, 1]).slice(); }
        const b = Z.base, u = (x - r.left) / r.width, v = 1 - (y - r.top) / r.height;   // the view's y runs up (gl_FragCoord)
        // the held point in frame coordinates, through whatever crop is showing now
        const cur = state.view || b;
        Z.anchor = { u, v, fx: cur[0] + u * cur[2], fy: cur[1] + v * cur[3] };
        Z.held = true; Z.pid = id; Z.auto = true; goStep(Math.max(1, Z.step), Z.T_STEP);
        hud.style.left = x + 'px'; hud.style.top = y + 'px';
    };
    const zRelease = id => { if (Z.pid !== id || !Z.held) return; Z.held = false; Z.pid = null; Z.relT = performance.now(); goStep(0, Z.T_OUT); };
    const zCancelTouch = () => { Z.touch = null; };
    // window CAPTURE: ui31's pinch stops a second finger's events on document, before any canvas listener sees them
    window.addEventListener('pointerdown', e => {
        if (e.target !== canvas) return;
        if (e.pointerType === 'mouse') { if (e.button === 2) zPress(e.pointerId, e.clientX, e.clientY); return; }
        if (e.pointerType !== 'touch') return;
        Z.touches.add(e.pointerId);
        if (Z.touches.size > 1) { zCancelTouch(); if (Z.held) zRelease(Z.pid); return; }        // a second finger: pinch, not a hold
        Z.touch = { id: e.pointerId, x: e.clientX, y: e.clientY, t0: performance.now() };   // timed in the frame loop: a timer is throttled in a background tab
    }, true);
    window.addEventListener('pointermove', e => {
        const t = Z.touch; if (!t || t.id !== e.pointerId || Z.held) return;
        if (Math.hypot(e.clientX - t.x, e.clientY - t.y) > Z.SLOP) zCancelTouch();               // moved first: a drag
    }, true);
    const zUp = e => { Z.touches.delete(e.pointerId); if (Z.touch && Z.touch.id === e.pointerId) zCancelTouch(); zRelease(e.pointerId); };
    window.addEventListener('pointerup', zUp, true); window.addEventListener('pointercancel', zUp, true);
    window.addEventListener('blur', () => { zCancelTouch(); Z.touches.clear(); if (Z.held) zRelease(Z.pid); });
    // the wheel while held steps the optics (capture, so the engine's own wheel zoom does not also move the camera)
    window.addEventListener('wheel', e => {
        if (!Z.held || e.target !== canvas) return;
        e.preventDefault(); e.stopImmediatePropagation();
        const now = performance.now(); if (now - (Z.wheelT || 0) < 140) return; Z.wheelT = now;   // one notch, one step (trackpads send bursts)
        Z.auto = false; goStep(Z.step + (e.deltaY < 0 ? 1 : -1) || 1, Z.T_STEP);
    }, { capture: true, passive: false });
    canvas.addEventListener('contextmenu', e => { if (Z.held || Z.m > 1 || performance.now() - Z.relT < 500) e.preventDefault(); });
    const applyView = () => {
        const b = Z.base, a = Z.anchor, m = Z.m;
        if (m <= 1 + 1e-6) { state.view = b.slice(); return; }
        const w = b[2] / m, h = b[3] / m;
        // keep the held point under the pointer, inside the base view
        const x = Math.min(b[0] + b[2] - w, Math.max(b[0], a.fx - a.u * w)), y = Math.min(b[1] + b[3] - h, Math.max(b[1], a.fy - a.v * h));
        state.view = [x, y, w, h];
    };
    function zFrame(dt) {
        if (Z.touch && !Z.held && performance.now() - Z.touch.t0 >= Z.HOLD_MS) { const t = Z.touch; zPress(t.id, t.x, t.y); }
        if (!Z.held && Z.m === 1 && Z.t >= 1) return;
        if (Z.held && Z.t >= 1) { Z.since += dt * 1000; if (Z.auto && Z.since >= Z.STEP_MS && Z.step < STEPS.length - 1) goStep(Z.step + 1, Z.T_STEP); }
        // the deepest step hands over to the fly-down's walk on the surface (flydown.js, ?flydown=1), at the held point
        if (Z.held && Z.t >= 1 && Z.step === STEPS.length - 1 && Z.since >= Z.STEP_MS * 1.2 && window.__irisFly && window.__irisFly.ready) {
            const FL = window.__irisFly; if (FL.enterWalk(Z.anchor.u, Z.anchor.v)) { zReset(); Z.relT = performance.now(); return; }
        }
        if (Z.t < 1) {
            Z.t = Math.min(1, Z.t + dt / Z.dur);
            const k = 1 - Math.pow(1 - Z.t, 3);                                         // ease-out: crisp arrival
            Z.m = Math.exp(Math.log(Z.m0) + (Math.log(Z.mT) - Math.log(Z.m0)) * k);     // in log zoom: every step feels the same
            applyView(); E.resetAccumulation();
        }
        const shown = Z.held || Z.m > 1.001;
        hud.style.opacity = shown ? '1' : '0';
        hud.lastChild.textContent = '×' + (Z.m < 9.95 ? Z.m.toFixed(1) : Z.m.toFixed(0));
        if (!Z.held && Z.t >= 1 && Z.m <= 1.0001) { Z.m = 1; state.view = Z.base.slice(); Z.base = null; Z.step = 0; E.resetAccumulation(); }
    }
    const zReset = () => { if (Z.base) state.view = Z.base.slice(); Z.held = false; Z.pid = null; Z.m = Z.m0 = Z.mT = 1; Z.t = 1; Z.step = 0; Z.base = null; hud.style.opacity = '0'; };

    let last = performance.now(), primed = false;
    function frame(now) {
        const dt = Math.min(1, (now - last) / 1000); last = now;   // wall-clock timers: a throttled tab (≈ 1 frame/s) must still reach REST on time
        if (G.enabled && canvas.width > 0) {
            const [cx, cy] = centre();
            if (!primed) { primed = true; if (!target.mouseX && !target.mouseY) { target.mouseX = state.mouseX = cx; target.mouseY = state.mouseY = cy; } }   // no look into the corner before the first pointer event
            if (!frozen()) {
                if (G.st === 'HOLD' && !G.held) { G.idle += dt; if (G.idle >= G.hold) { G.st = 'RETURN'; G.t = 0; G.from = [target.mouseX, target.mouseY]; } }
                if (G.st === 'RETURN' && !G.held) { G.t += dt; const u = Math.min(1, G.t / G.ret), k = u * u * (3 - 2 * u); target.mouseX = G.from[0] + (cx - G.from[0]) * k; target.mouseY = G.from[1] + (cy - G.from[1]) * k; if (u >= 1) G.st = 'REST'; }
                else if (G.st === 'REST') { target.mouseX = cx; target.mouseY = cy; }
                zFrame(dt);
            } else if (Z.held || Z.m > 1) zReset();   // a frozen mode took over: put the full view back
        }
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    Z.tick = zFrame;                                            // tests drive time themselves (a hidden pane runs no rAF)
    window.__irisGaze = G; G.inScene = inScene; G.optics = Z;
})();
