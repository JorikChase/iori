// study/11 §5.6 P1 — review sheets of the Strands layer (lines.js): the photograph with today's traced lines, by class, for
// the study's record. In the page, with an eye loaded WITH its photograph (Tissue ▸ Load, or __irisLines.set(true)):
//   await import('/iris-engine/tools/lines_sheets.js'); await __linesSheets.save('26')
// → ref/lines-tmp-*.json (the dev server only writes JSON there), then  python3 tools/lines_sheets.py  turns them into
// study/proof-layers/lines-NN-{whole,crypt1,crypt2}.jpg and deletes the temporaries.
(() => {
    const L = window.__irisLines, T = window.IrisTissue, X = window.__linesSheets = {};
    const area = q => { let a = 0; for (let i = 0; i < q.length; i++) { const p = q[i], n = q[(i + 1) % q.length]; a += p[0] * n[1] - n[0] * p[1]; } return Math.abs(a / 2); };
    const centroid = q => [q.reduce((s, p) => s + p[0], 0) / q.length, q.reduce((s, p) => s + p[1], 0) / q.length];
    const post = async (name, c) => fetch(`/save/lines-tmp-${name}.json`, { method: 'POST', body: JSON.stringify({ name, jpg: c.toDataURL('image/jpeg', 0.9) }) }).then(r => r.text());
    const stack = (a, b) => { const c = document.createElement('canvas'); c.width = a.width; c.height = a.height + b.height; const x = c.getContext('2d'); x.drawImage(a, 0, 0); x.drawImage(b, 0, a.height); return c; };
    X.save = async (ref, o = {}) => {
        const src = T.src, fw = src.fit[0], fh = src.fit[1], F = window.__irisEngine.fit.fit, Lb = F.limbus, k = fw / F.W;
        const whole = await L.sheet({ at: [Lb.x * k, Lb.y * k], span: 2.1 * Math.max(Lb.rx, Lb.ry) * k / fh, w: 1600, h: 1600, label: `eye ${ref} · today's detection, by class`, ...o });
        const out = [await post(`${ref}-whole`, stack(whole, L.legendSheet(1600)))];
        const holes = (src.outlines || []).filter(c => !c.island).map(c => ({ c: centroid(c.xy), a: area(c.xy) })).sort((p, q) => q.a - p.a);
        for (const [i, H] of holes.slice(0, 2).entries()) {
            const s = await L.sheet({ at: H.c, span: 0.2, w: 1600, h: 1100, label: `eye ${ref} · crypt ${i + 1} (≈ ${(0.2 * fh / k / (Lb.ry || 1) * 5.6).toFixed(1)} mm tall)`, ...o });
            out.push(await post(`${ref}-crypt${i + 1}`, stack(s, L.legendSheet(1600))));
        }
        return out;
    };
})();
