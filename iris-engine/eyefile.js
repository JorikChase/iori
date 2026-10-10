// The eye file, ID v3 (study/15) — the page's only parser. Mirrors tools/eyefile/read.py exactly.
//   const eye = await IrisEye.fetch('data/26.iris')   → { head, tissue, case, measurements }
//   IrisEye.read(arrayBuffer)                          → the same from bytes
// `tissue` is the object IrisTissue.load / proof consume (today's data/tissue-NN.json shape), `case` what the fitter's
// renderCaseThumb / frameFromCase import (today's data/case-NN.json shape), `measurements` the bytes installMeasurements
// takes (today's cal.bin). Sections the reader does not know are kept in `head.sections` and ignored.
(() => {
    const dec = new TextDecoder();
    const pad4 = n => n + (4 - n % 4) % 4;
    const gunzip = async b => { const ds = new DecompressionStream('gzip'); const w = ds.writable.getWriter(); w.write(b); w.close(); return new Uint8Array(await new Response(ds.readable).arrayBuffer()); };
    const num = i => i / 100000;                                     // q5: an i32 of value × 1e5

    function table(b, meta) {                                        // → the list of records the JSON had
        const dv = new DataView(b.buffer, b.byteOffset, b.byteLength), n = meta.n; let o = 0;
        const counts = new Array(n); for (let k = 0; k < n; k++) counts[k] = dv.getUint16(o + 2 * k, true); o = pad4(2 * n);
        const cols = {};
        for (const c of meta.columns) {
            let raw; const cnt = c.count;
            if (c.enc === 'u8') { raw = Array.from(b.subarray(o, o + cnt)); o += pad4(cnt); }
            else if (c.enc === 'f64') { raw = new Array(cnt); for (let i = 0; i < cnt; i++) raw[i] = dv.getFloat64(o + 8 * i, true); o += pad4(8 * cnt); }
            else { raw = new Array(cnt); for (let i = 0; i < cnt; i++) raw[i] = dv.getInt32(o + 4 * i, true); o += pad4(4 * cnt);
                if (c.enc === 'q5d') { let i = 0; for (const pts of counts) { const prev = new Array(c.comps).fill(0); for (let p = 0; p < pts; p++) { for (let j = 0; j < c.comps; j++) { prev[j] += raw[i + j]; raw[i + j] = prev[j]; } i += c.comps; } } }
                if (c.enc === 'q5' || c.enc === 'q5d') for (let i = 0; i < cnt; i++) raw[i] = num(raw[i]); }
            cols[c.name] = [raw, c.comps];
        }
        const recs = new Array(n); let i = 0;
        for (let k = 0; k < n; k++) {
            const pts = counts[k], r = Object.assign({}, meta.scalars ? meta.scalars[k] : {});
            for (const name in cols) { const [raw, comps] = cols[name]; const seg = raw.slice(i * comps, (i + pts) * comps);
                if (comps > 1) { const out = new Array(pts); for (let j = 0; j < pts; j++) out[j] = seg.slice(j * comps, (j + 1) * comps); r[name] = out; } else r[name] = seg; }
            recs[k] = r; i += pts;
        }
        return recs;
    }

    async function read(buf) {
        const b = new Uint8Array(buf), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
        if (dec.decode(b.subarray(0, 4)) !== 'IRIS') throw new Error('not an eye file');
        const v = dv.getUint16(4, true), hl = dv.getUint32(8, true); if (v !== 3) throw new Error('eye file v' + v + ' — this reader knows v3');
        const head = JSON.parse(dec.decode(b.subarray(12, 12 + hl)).replace(/\0+$/, '')), base = 12 + hl;
        const sec = async name => { const s = head.sections.find(x => x.name === name); if (!s) return undefined; const q = b.subarray(base + s.off, base + s.off + s.len);
            if (s.enc === 'json') return JSON.parse(dec.decode(q)); if (s.enc === 'gz') return JSON.parse(dec.decode(await gunzip(q)));
            if (s.enc === 'bytes') return q.slice(); if (s.enc === 'table') return table(q, s.meta); throw new Error('eye file: unknown encoding ' + s.enc); };
        const fr = await sec('frame'), st = await sec('structures'), rel = await sec('relief'), mat = await sec('materials'), alb = await sec('albedo'), cells = (await sec('materials/cells'))[0];
        const tissue = { ref: head.ref.file, fit: fr.fit, grade: fr.grade, z: rel.z, mm: rel.mm, outlines: await sec('structures/outlines'),
            fibres: await sec('levels/deck/fibres'), veins: await sec('levels/deck/veins'), guides: await sec('levels/sheet/guides'), sfib: await sec('levels/sheet/sfib'), svein: await sec('levels/sheet/svein'),
            beads: await sec('structures/beads'), margin: { xy: (await sec('structures/margin'))[0].xy, circle: st['margin.circle'] },
            cells: { xy: cells.xy, sheet: cells.sheet, ground: cells.ground }, rimRGB: mat.rimRGB, roots: await sec('levels/bridges/graph'), lut: fr.lut, edgeMm: fr.edgeMm, ablTex: alb.ablTex };
        const cs = Object.assign({}, await sec('legacy'), { align: fr.align, view: fr.view, scores: await sec('scores'), texture: fr.texture, tag: fr.tag, quality: fr.quality, natural: fr.natural, isolated: fr.isolated });
        for (const k in cs) if (cs[k] === null || cs[k] === undefined) delete cs[k];
        return { head, tissue, case: cs, measurements: await sec('measurements'), levels: await sec('levels'), journal: await sec('journal') };
    }
    // study/15 §1.6: a writer passes through what it did not change. replaceSection(bytes, name, payload, enc?) returns a new
    // file in which that one section carries `payload` (Uint8Array for 'bytes', an object for 'json'); offsets and hashes are
    // recomputed, head.modified is stamped, nothing else moves. Used by the publish tools (the measurements section).
    const enc8 = new TextEncoder();
    const sha1hex16 = async b => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1', b))).slice(0, 8).map(x => x.toString(16).padStart(2, '0')).join('');
    async function replaceSection(buf, name, payload, enc) {
        const b = new Uint8Array(buf), dv = new DataView(b.buffer, b.byteOffset, b.byteLength), hl = dv.getUint32(8, true), base = 12 + hl;
        const head = JSON.parse(dec.decode(b.subarray(12, 12 + hl)).replace(/\0+$/, ''));
        const parts = []; let off = 0;
        for (const s of head.sections) {
            let q = b.subarray(base + s.off, base + s.off + s.len);
            if (s.name === name) { q = payload instanceof Uint8Array ? payload : enc8.encode(JSON.stringify(payload)); s.enc = enc || (payload instanceof Uint8Array ? 'bytes' : 'json'); s.len = q.length; s.sha1 = await sha1hex16(q); }
            const padded = new Uint8Array(pad4(q.length)); padded.set(q); s.off = off; off += padded.length; parts.push(padded);
        }
        head.modified = new Date().toISOString();
        const hb0 = enc8.encode(JSON.stringify(head)), hb = new Uint8Array(pad4(hb0.length)); hb.set(hb0);
        const out = new Uint8Array(12 + hb.length + off), odv = new DataView(out.buffer);
        out.set(enc8.encode('IRIS'), 0); odv.setUint16(4, head.v, true); odv.setUint16(6, head.minor || 0, true); odv.setUint32(8, hb.length, true); out.set(hb, 12);
        let o = 12 + hb.length; for (const p of parts) { out.set(p, o); o += p.length; }
        return out;
    }
    const cache = {};
    window.IrisEye = { read, replaceSection, fetch: async (url, opts = {}) => { if (!opts.fresh && cache[url]) return cache[url]; const r = await fetch(url); if (!r.ok) throw new Error('eye file ' + url + ': ' + r.status); const e = await read(await r.arrayBuffer()); e.url = url; cache[url] = e; return e; }, cache };
})();
