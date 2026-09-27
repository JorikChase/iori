// study/11 §5.2.5 B1 — a review sheet of a floating strand under the probe: from above, grazing, and from beside.
//   await import('/iris-engine/tools/b1/sheet.js');
//   await __b1.sheet('label', { u, v })   // → a PNG data URL in __b1.last[label]; __b1.save(label) → iris-engine/ref/b1-<label>.json
(() => {
    const T = window.IrisTissue, X = window.__b1 = { last: {} };
    const views = [
        { name: 'above', du: 0, heightUm: 700, yaw: 0, pitch: -89, lightUp: 1.5 },
        { name: 'grazing, along', du: -0.55, heightUm: 260, yaw: 0, pitch: -14 },
        { name: 'beside, across', dv: -0.12, heightUm: 300, yaw: 90, pitch: -30 },
        { name: 'close, from beside', dv: -0.06, heightUm: 280, yaw: 90, pitch: -35 },
    ];
    X.sheet = async (label, site, opts = {}) => {
        const w = opts.w || 560, h = opts.h || 380, cv = document.createElement('canvas');
        cv.width = 2 * w + 8; cv.height = 2 * (h + 22); const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
        views.forEach((vw, i) => {
            const cm = 6.2831853 * (2 + 4 * site.v), uv = [site.u + (vw.du || 0) / cm, site.v + (vw.dv || 0) / 4];
            const r = T.probe({ uv, heightUm: vw.heightUm, yaw: vw.yaw, pitch: vw.pitch, w, h, mode: opts.mode || 'albedo' });
            const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h; tmp.getContext('2d').putImageData(r.data, 0, 0);
            const x = (i % 2) * (w + 8), y = Math.floor(i / 2) * (h + 22);
            cx.drawImage(tmp, x, y + 22); cx.fillStyle = '#222'; cx.font = '13px sans-serif'; cx.fillText(`${label} · ${vw.name}`, x + 4, y + 15);
        });
        X.last[label] = cv.toDataURL('image/png'); return X.last[label].length;
    };
    X.save = label => fetch(`/save/b1-${label.replace(/[^A-Za-z0-9_.-]/g, '_')}.json`, { method: 'POST', body: JSON.stringify({ png: X.last[label] }) }).then(r => r.text());
})();
