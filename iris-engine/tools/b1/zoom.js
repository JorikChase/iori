// study/11 §5.2.5 B1 — the front view through the photo shader, zoomed onto a parent's instances: the fit pose, a tile of
// the image rendered at the fit's full size (the tiled-capture path), so the crop is K× the whole eye's resolution.
//   await import('/iris-engine/tools/b1/zoom.js'); __b1z.crop(parentId, K) → ImageData; __b1z.pair(label, a, b) → saves a PNG
(() => {
    const E = window.__irisEngine, F = E.fit, T = window.IrisTissue, X = window.__b1z = {};
    X.centre = pid => { const cs = T.sets.fibres.filter(c => c.parent === pid && c.xy); let x = 0, y = 0, n = 0; for (const c of cs) for (const q of c.xy) { x += q[0]; y += q[1]; n++; } const k = [F.fit.W / T.src.fit[0], F.fit.H / T.src.fit[1]]; return [k[0] * x / n, k[1] * y / n]; };   // xy are in the source fit's pixels
    X.crop = (pid, K = 8) => {
        const W = F.fit.W, H = F.fit.H, [cx, cy] = X.centre(pid), s = 1 / K;
        const x0 = Math.min(1 - s, Math.max(0, cx / W - s / 2)), y0 = Math.min(1 - s, Math.max(0, 1 - cy / H - s / 2));
        // straight through drawPhotoFrame with its own view: fit.renderFit is guarded to restore the overlay's pose (overlay.js)
        const gl = E.gl, mk = (hf) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, hf ? gl.RGBA16F : gl.RGBA8, W, H, 0, gl.RGBA, hf ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); return { t, f }; };
        const A = mk(true), B = mk(false), Z = mk(true), S = E.state, pose = S.view;
        E.drawPhotoFrame(A.f, W, H, 0, Z.t, { ref: 1, rot: S.camRot, zoom: S.zoomPhoto, view: [pose[0] + x0, pose[1] + y0, s, s], specular: 1, edgeFade: 0 });
        E.drawPost(B.f, A.t, W, H, 0, { ref: 1 });
        const px = new Uint8Array(W * H * 4); gl.bindFramebuffer(gl.FRAMEBUFFER, B.f); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, E.canvas.width, E.canvas.height);
        for (const q of [A, B, Z]) { gl.deleteTexture(q.t); gl.deleteFramebuffer(q.f); }
        const out = new Uint8ClampedArray(W * H * 4); for (let y = 0; y < H; y++) out.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
        return new ImageData(out, W, H);
    };
    X.sheet = async (label, panels) => {
        const W = panels[0][1].width, H = panels[0][1].height, sc = Math.min(1, 560 / W), w = Math.round(W * sc), h = Math.round(H * sc);
        const cv = document.createElement('canvas'); cv.width = panels.length * (w + 8); cv.height = h + 22; const cx = cv.getContext('2d');
        cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
        panels.forEach(([name, img], i) => { const t = document.createElement('canvas'); t.width = W; t.height = H; t.getContext('2d').putImageData(img, 0, 0);
            cx.drawImage(t, i * (w + 8), 22, w, h); cx.fillStyle = '#222'; cx.font = '13px sans-serif'; cx.fillText(name, i * (w + 8) + 4, 15); });
        return fetch(`/save/b1-${label}.json`, { method: 'POST', body: JSON.stringify({ png: cv.toDataURL('image/png') }) }).then(r => r.text());
    };
})();
