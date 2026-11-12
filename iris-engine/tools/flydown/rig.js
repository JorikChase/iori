// tools/flydown/rig.js — capture rig for the fly-down prototype (load with: await import('/iris-engine/tools/flydown/rig.js')).
// The Browser pane runs no rAF while hidden, so time is driven by hand: R.tick(n) steps flydown.js; captures go through
// captureTiled with a state.view getter (the region-crop trick of the capture rig) and POST /save/shots/fd-<name>.png.
const E = window.__irisEngine, F = window.__irisFly, S = E.state;
export const ready = async () => { for (let i = 0; i < 120 && !(F.ready && window.IrisTissue.dataV1); i++) await new Promise(r => setTimeout(r, 500)); return F.ready; };
export const crop = (m, cx, cy) => [cx - 0.5 / m, cy - 0.5 / m, 1 / m, 1 / m];
export const tick = (n = 1, dt = 0.05) => { for (let k = 0; k < n; k++) F.tick(dt); };
export async function cap(name, view, { ticks = 60, settle = true } = {}) {
    let v = view, had = Object.getOwnPropertyDescriptor(S, 'view');
    if (v) Object.defineProperty(S, 'view', { configurable: true, get() { return v; }, set(x) {} });
    const fade = F.fade, spread = F.spread; if (settle) { F.fade = 1e-3; F.spread = 0; }
    try {
        tick(ticks);
        const orig = HTMLAnchorElement.prototype.click; let blob; HTMLAnchorElement.prototype.click = function () { blob = this.href; };
        try { await E.captureTiled(Math.max(E.canvas.width, E.canvas.height)); } finally { HTMLAnchorElement.prototype.click = orig; }
        const b = await (await fetch(blob)).blob(); return (await fetch('/save/shots/fd-' + name + '.png', { method: 'POST', body: b })).status;
    } finally { F.fade = fade; F.spread = spread; if (v) Object.defineProperty(S, 'view', { configurable: true, writable: true, enumerable: true, value: had && 'value' in had ? had.value : [0, 0, 1, 1] }); }
}

// ---- the bioprint (print.js): capture the start view as it settles, and drive a print by hand in a hidden pane
export async function capStart(name) {
    const orig = HTMLAnchorElement.prototype.click; let blob; HTMLAnchorElement.prototype.click = function () { blob = this.href; };
    try { await E.captureTiled(Math.max(E.canvas.width, E.canvas.height)); } finally { HTMLAnchorElement.prototype.click = orig; }
    const b = await (await fetch(blob)).blob(); return (await fetch('/save/shots/' + name + '.png', { method: 'POST', body: b })).status;
}
// one composited frame at print time `sec`: `frames` engine frames by hand (they go through the print's target and present), then
// the composite at that clock, read back from the canvas. preview: true holds the engine (the eye "still on its way").
export async function printFrame(name, sec, { frames = 1, preview = false } = {}) {
    const P = window.IrisPrint, gl = E.gl; if (!P.mode) return 'no print';
    const hold = E.state.holdEye; if (preview) { E.state.holdEye = true; P.realT0 = null; }
    else if (P.realT0 === null) P.realT0 = P.t0;                         // the real frame "arrived" with the print's start
    P.fixed = P.t0 + sec;                                                // the print's clock, pinned
    for (let k = 0; k < frames; k++) E.stepFrame();
    P.present(); const W = E.canvas.width, H = E.canvas.height, px = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    P.fixed = null; E.state.holdEye = hold;
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'), im = g.createImageData(W, H);
    for (let y = 0; y < H; y++) im.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    g.putImageData(im, 0, 0); const b = await new Promise(r => c.toBlob(r, 'image/png'));
    return (await fetch('/save/shots/' + name + '.png', { method: 'POST', body: b })).status;
}
