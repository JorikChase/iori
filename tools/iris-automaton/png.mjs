// tools/iris-automaton/png.mjs — a tiny PNG reader/writer for the runner (8-bit grey / grey+alpha / RGB / RGBA,
// non-interlaced; zlib from Node). No dependencies.
import { inflateSync, deflateSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';

export function readPNG(path) {
    const b = readFileSync(path); let p = 8, W, H, ct, bd; const idat = [];
    while (p < b.length) {
        const len = b.readUInt32BE(p), type = b.toString('ascii', p + 4, p + 8), d = b.subarray(p + 8, p + 8 + len);
        if (type === 'IHDR') { W = d.readUInt32BE(0); H = d.readUInt32BE(4); bd = d[8]; ct = d[9]; if (d[12]) throw new Error('interlaced PNG'); }
        else if (type === 'IDAT') idat.push(d); else if (type === 'IEND') break;
        p += 12 + len;
    }
    if (bd !== 8) throw new Error('PNG bit depth ' + bd);
    const ch = { 0: 1, 4: 2, 2: 3, 6: 4 }[ct]; if (!ch) throw new Error('PNG colour type ' + ct);
    const raw = inflateSync(Buffer.concat(idat)), stride = W * ch, out = new Uint8Array(W * H * 4), prev = new Uint8Array(stride), cur = new Uint8Array(stride);
    for (let y = 0; y < H; y++) {
        const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
        for (let x = 0; x < stride; x++) {
            const a = x >= ch ? cur[x - ch] : 0, up = prev[x], c = x >= ch ? prev[x - ch] : 0; let v = row[x];
            if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1;
            else if (f === 4) { const pp = a + up - c, pa = Math.abs(pp - a), pb = Math.abs(pp - up), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c; }
            cur[x] = v & 255;
        }
        for (let x = 0; x < W; x++) {
            const o = (y * W + x) * 4, s = x * ch;
            if (ch === 1) { out[o] = out[o + 1] = out[o + 2] = cur[s]; out[o + 3] = 255; }
            else if (ch === 2) { out[o] = out[o + 1] = out[o + 2] = cur[s]; out[o + 3] = cur[s + 1]; }
            else { out[o] = cur[s]; out[o + 1] = cur[s + 1]; out[o + 2] = cur[s + 2]; out[o + 3] = ch === 4 ? cur[s + 3] : 255; }
        }
        prev.set(cur);
    }
    return { W, H, data: out };
}

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc = b => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };

export function writePNG(path, W, H, rgba) {   // RGB out (alpha dropped)
    const raw = Buffer.alloc(H * (W * 3 + 1));
    for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; for (let x = 0; x < W; x++) for (let c = 0; c < 3; c++) raw[y * (W * 3 + 1) + 1 + x * 3 + c] = rgba[(y * W + x) * 4 + c]; }
    const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 2;
    writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
}
