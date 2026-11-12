// tools/iris-automaton/capture.js — paste into the engine page's console (served by serve.py 8791 at
// /iris-engine/index.html?ui=31&flydown=1&start=off, viewport 1200² → 1800 px canvas), then: await __eye('26')
// Writes captures/<ref>-final.png (as shipped; first, because regenerated fly-down pages differ),
// <ref>-relief.png (no fly-down) and <ref>-flat.png (no fly-down, no relief).
(() => {
    const E = window.__irisEngine, gl = E.gl, F = window.__irisFly;
    window.__grab = async name => {
        E.resetAccumulation(); let n = 0; while (E.state.frameCount < E.Q.frames && n < 2000) { E.stepFrame(); n++; }
        const W = E.canvas.width, H = E.canvas.height, px = new Uint8Array(W * H * 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'), im = g.createImageData(W, H);
        for (let y = 0; y < H; y++) im.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
        g.putImageData(im, 0, 0); const b = await new Promise(r => c.toBlob(r, 'image/png'));
        return [name, (await fetch('/save/' + name + '.png', { method: 'POST', body: b })).status, n];
    };
    window.__eye = async ref => {
        await IrisEngine.mount().load(ref, { arrival: true }); IrisPrint.skip = true;
        let n = 0; while (IrisPrint.mode && n < 400) { E.stepFrame(); n++; }
        for (let k = 0; k < 150; k++) E.stepFrame(); await new Promise(r => setTimeout(r, 1500)); for (let k = 0; k < 50; k++) E.stepFrame();
        const out = [await __grab(ref + '-final')];
        F.on = false; out.push(await __grab(ref + '-relief'));
        E.state.relief = 0; E.target.relief = 0; out.push(await __grab(ref + '-flat'));
        E.state.relief = 1; E.target.relief = 1; F.on = true; return out;
    };
})();
