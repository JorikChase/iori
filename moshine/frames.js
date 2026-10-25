// frames.js — the editing round trip (2026-10-25): an export as a lossless PNG image sequence with the sound beside it
// as a 24-bit WAV, which Premiere, Resolve, Final Cut and After Effects all import. Two targets, the same files:
// a folder the user picks (Chrome/Edge, File System Access) or one streamed ZIP (everywhere else; store-only, since PNG
// is already compressed, and ZIP64 so a long 1080p sequence can pass 4 GB). Memory stays flat: every file is written
// as soon as it exists and nothing is collected.

// ------------------------------------------------------------------------------------------------ CRC-32 (ZIP)
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(bytes, crc = 0) {
  let c = ~crc >>> 0;
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

// ------------------------------------------------------------------------------------------------ ZIP writer
/**
 * A streamed, store-only ZIP onto a writable ({ write(Uint8Array), close() }, e.g. a FileSystemWritableFileStream).
 * Each entry is written as its chunks arrive (local header with the data-descriptor flag, the bytes, a descriptor
 * with CRC and size), so no entry is held whole. Entries stay under 4 GB each; offsets and the entry count may pass the
 * classic limits, and then the central directory carries ZIP64 fields and a ZIP64 end record.
 * Returns { add(name, chunks) (chunks: Uint8Array | iterable | async iterable of Uint8Array), finish(), bytes }.
 */
export function createZipWriter(writable) {
  const enc = new TextEncoder(), entries = [], d = new Date();
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  let at = 0;
  const put = async (u8) => { await writable.write(u8); at += u8.length; };
  const rec = (n) => { const b = new Uint8Array(n); return [b, new DataView(b.buffer)]; };
  const u64 = (v, o, x) => { v.setUint32(o, x % 2 ** 32, true); v.setUint32(o + 4, Math.floor(x / 2 ** 32), true); };
  return {
    get bytes() { return at; },
    async add(name, chunks) {
      const nm = enc.encode(name), offset = at;
      const [lh, l] = rec(30 + nm.length);
      l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x0808, true); l.setUint16(8, 0, true);   // flags: descriptor + UTF-8
      l.setUint16(10, dosTime, true); l.setUint16(12, dosDate, true); l.setUint16(26, nm.length, true); lh.set(nm, 30);
      await put(lh);
      let crc = 0, size = 0;
      const one = async (c) => { crc = crc32(c, crc); size += c.length; await put(c); };
      if (chunks instanceof Uint8Array) await one(chunks); else for await (const c of chunks) await one(c);
      if (size >= 0xffffffff) throw new Error(`${name} is over 4 GB, too big for one ZIP entry`);
      const [dd, v] = rec(16); v.setUint32(0, 0x08074b50, true); v.setUint32(4, crc, true); v.setUint32(8, size, true); v.setUint32(12, size, true);
      await put(dd);
      entries.push({ nm, crc, size, offset });
    },
    async finish() {
      const cdAt = at;
      for (const e of entries) {
        const big = e.offset >= 0xffffffff, [c, v] = rec(46 + e.nm.length + (big ? 12 : 0));
        v.setUint32(0, 0x02014b50, true); v.setUint16(4, 45, true); v.setUint16(6, big ? 45 : 20, true); v.setUint16(8, 0x0808, true); v.setUint16(10, 0, true);
        v.setUint16(12, dosTime, true); v.setUint16(14, dosDate, true); v.setUint32(16, e.crc, true); v.setUint32(20, e.size, true); v.setUint32(24, e.size, true);
        v.setUint16(28, e.nm.length, true); v.setUint16(30, big ? 12 : 0, true); v.setUint32(42, big ? 0xffffffff : e.offset, true); c.set(e.nm, 46);
        if (big) { const o = 46 + e.nm.length; v.setUint16(o, 0x0001, true); v.setUint16(o + 2, 8, true); u64(v, o + 4, e.offset); }
        await put(c);
      }
      const cdSize = at - cdAt, n = entries.length, z64 = n >= 0xffff || cdAt >= 0xffffffff || cdSize >= 0xffffffff;
      if (z64) {
        const recAt = at, [r, v] = rec(56 + 20);
        v.setUint32(0, 0x06064b50, true); u64(v, 4, 44); v.setUint16(12, 45, true); v.setUint16(14, 45, true);
        u64(v, 24, n); u64(v, 32, n); u64(v, 40, cdSize); u64(v, 48, cdAt);
        v.setUint32(56, 0x07064b50, true); u64(v, 64, recAt); v.setUint32(72, 1, true);
        await put(r);
      }
      const [e, v] = rec(22);
      v.setUint32(0, 0x06054b50, true); v.setUint16(8, Math.min(n, 0xffff), true); v.setUint16(10, Math.min(n, 0xffff), true);
      v.setUint32(12, Math.min(cdSize, 0xffffffff), true); v.setUint32(16, Math.min(cdAt, 0xffffffff), true);
      await put(e);
      await writable.close();
    },
  };
}

// ------------------------------------------------------------------------------------------------ WAV
/** The 44-byte header of a 24-bit PCM WAV with `frames` sample frames. */
export function wavHeader(frames, sampleRate, nch) {
  const data = frames * nch * 3, b = new Uint8Array(44), v = new DataView(b.buffer), s = (o, t) => { for (let i = 0; i < 4; i++) b[o + i] = t.charCodeAt(i); };
  s(0, 'RIFF'); v.setUint32(4, 36 + data, true); s(8, 'WAVE'); s(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nch, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * nch * 3, true); v.setUint16(32, nch * 3, true); v.setUint16(34, 24, true); s(36, 'data'); v.setUint32(40, data, true);
  return b;
}
/** Planar float channels -> interleaved 24-bit little-endian PCM (clipped, rounded). */
export function pcm24(channels) {
  const nch = channels.length, n = channels[0].length, out = new Uint8Array(n * nch * 3);
  for (let i = 0, o = 0; i < n; i++) for (let c = 0; c < nch; c++, o += 3) {
    const x = channels[c][i], v = Math.round((x > 1 ? 1 : x < -1 ? -1 : x) * 8388607) | 0;
    out[o] = v & 0xff; out[o + 1] = (v >> 8) & 0xff; out[o + 2] = (v >> 16) & 0xff;
  }
  return out;
}
/** A WAV as chunks, a second at a time: mix = { sampleRate, nch, total, block(s0, s1) -> Float32Array[] }. */
export async function* wavChunks(mix) {
  yield wavHeader(mix.total, mix.sampleRate, mix.nch);
  for (let s = 0; s < mix.total; s += mix.sampleRate) yield pcm24(await mix.block(s, Math.min(mix.total, s + mix.sampleRate)));
}

// ------------------------------------------------------------------------------------------------ targets
/**
 * Where a frame sequence goes. where: 'auto' (a folder the user picks when the browser can, else a ZIP), 'folder',
 * 'zip' (save picker when available, else browser storage), 'opfs' (a ZIP in browser storage, for tests and headless
 * runs) or 'opfs-folder' (a folder in browser storage; tests). base names the folder / ZIP and prefixes the frames.
 * Returns { kind: 'folder'|'zip', name, base, put(name, chunks), finish(), cancel(), file()? (ZIP only) }.
 */
export async function openSequenceTarget(base, where = 'auto') {
  if (where === 'folder' || where === 'opfs-folder' || (where === 'auto' && window.showDirectoryPicker)) {
    const parent = where === 'opfs-folder' ? await (await navigator.storage.getDirectory()).getDirectoryHandle('moshine-exports', { create: true }) : await window.showDirectoryPicker({ id: 'moshine-frames', mode: 'readwrite' });
    const dir = await parent.getDirectoryHandle(base, { create: true });
    return {
      kind: 'folder', name: `${parent.name || 'folder'}/${base}`, base, dir,
      async put(name, chunks) {
        const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
        if (chunks instanceof Uint8Array) await w.write(chunks); else for await (const c of chunks) await w.write(c);
        await w.close();
      },
      async finish() {}, async cancel() {},
    };
  }
  let fh, kind = 'opfs';
  if (where !== 'opfs' && window.showSaveFilePicker) {
    try { fh = await window.showSaveFilePicker({ suggestedName: base + '.zip', types: [{ description: 'ZIP', accept: { 'application/zip': ['.zip'] } }] }); kind = 'picker'; }
    catch (e) { if (e.name === 'AbortError') throw e; }
  }
  const dir = fh ? null : await (await navigator.storage.getDirectory()).getDirectoryHandle('moshine-exports', { create: true });
  if (!fh) fh = await dir.getFileHandle(base + '.zip', { create: true });
  const writable = await fh.createWritable(), zip = createZipWriter(writable);
  return {
    kind: 'zip', storage: kind, name: fh.name, base,
    put: (name, chunks) => zip.add(name, chunks), finish: () => zip.finish(),
    async cancel() { try { await writable.abort(); } catch (e) {} if (dir) await dir.removeEntry(fh.name).catch(() => {}); },
    file: () => fh.getFile(),
  };
}

/**
 * The frame sink exportSequence feeds: add(canvas) encodes the canvas as PNG (convertToBlob copies the pixels at the
 * call, so up to `depth` frames encode while the next ones render) and writes `<base>_000000.png` in order; finish()
 * writes the WAV, when there is a mix, and closes the target. Same interface as the video encoder.
 */
export function createFrameSink(target, { mix = null, depth = 4 } = {}) {
  const pending = []; let n = 0, err = null;
  const flushOne = async () => { const { name, blob } = pending.shift(); await target.put(name, new Uint8Array(await (await blob).arrayBuffer())); };
  return {
    codec: 'png', audio: mix ? 'wav' : null,
    async add(canvas) {
      if (err) throw err;
      const name = `${target.base}_${String(n++).padStart(6, '0')}.png`, blob = canvas.convertToBlob({ type: 'image/png' });
      blob.catch((e) => { err = e; });
      pending.push({ name, blob });
      while (pending.length >= depth) await flushOne();
    },
    async finish() {
      while (pending.length) await flushOne();
      if (mix) await target.put(`${target.base}.wav`, wavChunks(mix));
      await target.finish();
    },
    async cancel() { pending.length = 0; await target.cancel(); },
  };
}
