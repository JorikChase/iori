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
            }
        }
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    window.__irisGaze = G; G.inScene = inScene;
})();
