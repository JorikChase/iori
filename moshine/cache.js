// cache.js — checkpoint spill (spec §7 layer 3, D22): turning a snapshot into bytes and back, and the disk tier.
// A snapshot is any tree of plain data with binary leaves: GPUTextures and GPUBuffers (the GPU backend) or typed
// arrays (the CPU reference). pack() lifts the leaves out, leaving { $bin: i } placeholders; the backend turns its
// leaves into bytes (a lossless readback on the GPU) and back. Files hold [meta length, meta JSON, leaf count, then
// length + bytes per leaf]. Lossless everywhere: a restored checkpoint is bit-identical.

const isGpu = (x) => typeof GPUTexture !== 'undefined' && (x instanceof GPUTexture || x instanceof GPUBuffer);
const isBin = (x) => ArrayBuffer.isView(x) || isGpu(x);

/** Lift binary leaves out of a snapshot tree. Functions and getters are dropped (unpack re-adds destroy and bytes). */
export function pack(snap) {
  const leaves = [], seen = new Map();
  const walk = (x) => {
    if (x === null || typeof x !== 'object') return typeof x === 'function' ? undefined : x;
    if (isBin(x)) { if (!seen.has(x)) { seen.set(x, leaves.length); leaves.push(x); } return { $bin: seen.get(x) }; }
    if (Array.isArray(x)) return x.map((v) => { const w = walk(v); return w === undefined ? null : w; });
    const o = {}; for (const k of Object.keys(x)) { const d = Object.getOwnPropertyDescriptor(x, k); if (d.get || typeof d.value === 'function') continue; const w = walk(d.value); if (w !== undefined) o[k] = w; }
    return o;
  };
  return { tree: walk(snap), leaves };
}
/** Put leaves back into a packed tree. */
export function unpack(tree, leaves) {
  const walk = (x) => {
    if (x === null || typeof x !== 'object') return x;
    if ('$bin' in x && Object.keys(x).length === 1) return leaves[x.$bin];
    if (Array.isArray(x)) return x.map(walk);
    const o = {}; for (const k of Object.keys(x)) o[k] = walk(x[k]); return o;
  };
  return walk(tree);
}

/** Leaves as typed arrays of a known kind: { kind, ctor, ...shape } for the file format. */
const CTORS = { Float32Array, Uint16Array, Uint8Array, Int32Array, Uint32Array, Float64Array };
export function encodeFile(meta, chunks) {
  const m = new TextEncoder().encode(JSON.stringify(meta)), size = 8 + m.length + chunks.reduce((n, c) => n + 4 + c.byteLength, 0);
  const out = new Uint8Array(size), dv = new DataView(out.buffer); let o = 0;
  dv.setUint32(o, m.length, true); o += 4; out.set(m, o); o += m.length; dv.setUint32(o, chunks.length, true); o += 4;
  for (const c of chunks) { dv.setUint32(o, c.byteLength, true); o += 4; out.set(new Uint8Array(c.buffer, c.byteOffset, c.byteLength), o); o += c.byteLength; }
  return out;
}
export function decodeFile(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); let o = 0;
  const ml = dv.getUint32(o, true); o += 4; const meta = JSON.parse(new TextDecoder().decode(bytes.subarray(o, o + ml))); o += ml;
  const n = dv.getUint32(o, true); o += 4; const chunks = [];
  for (let i = 0; i < n; i++) { const l = dv.getUint32(o, true); o += 4; chunks.push(bytes.slice(o, o + l)); o += l; }
  return { meta, chunks };
}

/** The CPU reference's serializer: leaves are typed arrays already. */
export const cpuSerializer = {
  async serialize(snap) {
    const { tree, leaves } = pack(snap);
    return { tree, kinds: leaves.map((l) => ({ ctor: l.constructor.name })), chunks: leaves.map((l) => new Uint8Array(l.buffer.slice(l.byteOffset, l.byteOffset + l.byteLength))) };
  },
  deserialize({ tree, kinds, chunks }) {
    const leaves = chunks.map((c, i) => new CTORS[kinds[i].ctor](c.buffer.slice(c.byteOffset, c.byteOffset + c.byteLength)));
    return unpack(tree, leaves);
  },
};

/** Bytes per pixel of the texture formats checkpoints use. */
export const BPP = { rgba16float: 8, r32float: 4, rgba32float: 16, rgba8unorm: 4 };

/**
 * The GPU backend's serializer: one submit copies every texture and buffer of a snapshot into mappable buffers, then
 * they are mapped and unpadded (rows are 256-byte aligned on the GPU side). deserialize() makes fresh textures and
 * buffers with the same shape and contents; the result has destroy() and bytes like a live snapshot.
 */
export function gpuSerializer(gpu) {
  const { device } = gpu;
  return {
    async serialize(snap) {
      const { tree, leaves } = pack(snap), enc = device.createCommandEncoder({ label: 'spill' }), jobs = [];
      for (const x of leaves) {
        if (x instanceof GPUTexture) {
          const bpp = BPP[x.format], row = Math.ceil((x.width * bpp) / 256) * 256, b = device.createBuffer({ size: row * x.height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
          enc.copyTextureToBuffer({ texture: x }, { buffer: b, bytesPerRow: row }, [x.width, x.height]);
          jobs.push({ kind: { tex: true, format: x.format, w: x.width, h: x.height, label: x.label }, b, row, bpp, w: x.width, h: x.height });
        } else if (x instanceof GPUBuffer) {
          const b = device.createBuffer({ size: x.size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
          enc.copyBufferToBuffer(x, 0, b, 0, x.size); jobs.push({ kind: { buf: true, size: x.size, label: x.label }, b });
        } else jobs.push({ kind: { ctor: x.constructor.name }, data: new Uint8Array(x.buffer.slice(x.byteOffset, x.byteOffset + x.byteLength)) });
      }
      device.queue.submit([enc.finish()]);
      const chunks = await Promise.all(jobs.map(async (j) => {
        if (j.data) return j.data;
        await j.b.mapAsync(GPUMapMode.READ); const raw = new Uint8Array(j.b.getMappedRange());
        let out;
        if (j.kind.tex) { out = new Uint8Array(j.w * j.h * j.bpp); for (let y = 0; y < j.h; y++) out.set(raw.subarray(y * j.row, y * j.row + j.w * j.bpp), y * j.w * j.bpp); }
        else out = raw.slice();
        j.b.unmap(); j.b.destroy(); return out;
      }));
      return { tree, kinds: jobs.map((j) => j.kind), chunks };
    },
    deserialize({ tree, kinds, chunks }) {
      const made = [];
      const leaves = chunks.map((c, i) => {
        const k = kinds[i];
        if (k.tex) {
          const t = device.createTexture({ label: k.label || 'restored', size: [k.w, k.h], format: k.format, usage: GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING });
          device.queue.writeTexture({ texture: t }, c, { bytesPerRow: k.w * BPP[k.format] }, [k.w, k.h]); made.push(t); return t;
        }
        if (k.buf) { const b = device.createBuffer({ label: k.label || 'restored', size: k.size, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST }); device.queue.writeBuffer(b, 0, c); made.push(b); return b; }
        return new CTORS[k.ctor](c.buffer.slice(c.byteOffset, c.byteOffset + c.byteLength));
      });
      const snap = unpack(tree, leaves);
      return Object.assign(snap, { bytes: chunks.reduce((n, c) => n + c.byteLength, 0), destroy: () => made.forEach((x) => x.destroy()) });
    },
  };
}

/** Disk tier on OPFS: one file per checkpoint in moshine-cache/<session>/ (session-scoped: cleared at start-up). */
export async function openDiskCache(session = 's' + Date.now().toString(36)) {
  const root = await navigator.storage.getDirectory(), top = await root.getDirectoryHandle('moshine-cache', { create: true });
  for await (const [name] of top.entries()) if (name !== session) await top.removeEntry(name, { recursive: true }).catch(() => {});   // caches never outlive a session
  const dir = await top.getDirectoryHandle(session, { create: true });
  return {
    async write(name, bytes) { const w = await (await dir.getFileHandle(name, { create: true })).createWritable(); await w.write(bytes); await w.close(); },
    async read(name) { return new Uint8Array(await (await (await dir.getFileHandle(name)).getFile()).arrayBuffer()); },
    async remove(name) { await dir.removeEntry(name).catch(() => {}); },
    async clear() { await top.removeEntry(session, { recursive: true }).catch(() => {}); },
  };
}
/** The same interface in memory (node tests, browsers without OPFS). */
export function memoryDiskCache() {
  const m = new Map();
  return { async write(n, b) { m.set(n, b.slice()); }, async read(n) { if (!m.has(n)) throw new Error('no file ' + n); return m.get(n).slice(); }, async remove(n) { m.delete(n); }, async clear() { m.clear(); }, get files() { return m.size; } };
}
