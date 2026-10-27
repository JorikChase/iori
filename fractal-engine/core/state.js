// A scene's state carried inside the files it exports, so a splat cloud or a still can conjure the exact
// state that made it: drop the file back on the engine. The state is a JSON document —
//
//   { engine: 'fractal-engine', v: 1, id, notation, formula, cam, mode, look, focus, pins, export, created }
//
// formula the canonical JSON and id its hash (the formula's own id), notation the same formula as text
// for a human reading the file (a collage rides in the same field, its own canonical JSON and hash), export what made the file (sample counts, opacity, size).
//
// In a PLY it rides in the header as comment lines, which every splat viewer skips: one line with the
// document's checksum and byte length, then its UTF-8 bytes in base64, 96 characters a line — ASCII
// only, short lines, nothing a strict header parser can trip on. In a PNG it is a tEXt chunk. Reading
// back checks the checksum and the length, parses JSON (never evaluates anything), and accepts the
// formula only if it validates and hashes to its id.

import { normalize, validate, canonical, hashString, hash } from './formula.js';
import { format } from './notation.js';
import { isCollage, normCollage, validateCollage, canonicalCollage, hashCollage, formatCollage } from './collage.js';

export const STATE_V = 1;
const TAG = 'fractal-engine';
const LINE = 96;
const MAX_BYTES = 1 << 20;

const toB64 = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

// the document for a state: { formula, cam, mode, look, focus, pins, export }
export function stateDoc(s) {
  const col = isCollage(s.formula), f = col ? normCollage(s.formula) : normalize(s.formula);
  return {
    engine: TAG, v: STATE_V, id: col ? hashCollage(f) : hash(f), notation: col ? formatCollage(f) : format(f), formula: JSON.parse(col ? canonicalCollage(f) : canonical(f)),
    cam: { pos: [...s.cam.pos], yaw: s.cam.yaw, pitch: s.cam.pitch }, mode: s.mode || 'pull',
    look: s.look ? { ...s.look } : null, focus: s.focus ?? null, pins: s.pins ? JSON.parse(JSON.stringify(s.pins)) : [],
    export: s.export || null, created: s.created || new Date().toISOString(),
  };
}

const encode = (doc) => {
  const json = JSON.stringify(doc), bytes = new TextEncoder().encode(json);
  return { json, bytes, sum: hashString(json) };
};

// the PLY header lines (without their newlines)
export function plyComments(doc) {
  const { bytes, sum } = encode(doc), b64 = toB64(bytes);
  const out = [`comment ${TAG} state v${STATE_V} sum ${sum} bytes ${bytes.length}`];
  for (let i = 0; i < b64.length; i += LINE) out.push(`comment ${TAG} b64 ${b64.slice(i, i + LINE)}`);
  return out;
}

// check and parse a document; throws with the reason when anything is off
function accept(json, sum, length) {
  if (length !== undefined && new TextEncoder().encode(json).length !== length) throw new Error('state: length mismatch');
  if (sum !== undefined && hashString(json) !== sum) throw new Error('state: checksum mismatch');
  const doc = JSON.parse(json);
  if (!doc || doc.engine !== TAG || typeof doc.v !== 'number' || doc.v > STATE_V) throw new Error('state: not a fractal-engine state');
  const col = isCollage(doc.formula), f = col ? normCollage(doc.formula) : normalize(doc.formula);
  const v = col ? validateCollage(f) : validate(f);
  if (!v.ok) throw new Error('state: invalid formula: ' + v.errors.join('; '));
  if ((col ? hashCollage(f) : hash(f)) !== doc.id) throw new Error('state: formula does not match its id');
  const num = (x) => typeof x === 'number' && Number.isFinite(x);
  if (!doc.cam || !Array.isArray(doc.cam.pos) || doc.cam.pos.length !== 3 || !doc.cam.pos.every(num) || !num(doc.cam.yaw) || !num(doc.cam.pitch)) throw new Error('state: bad camera');
  return { ...doc, formula: f };
}

// the state in a PLY header, or null when the file has none
export function readPlyState(buffer) {
  const head = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, MAX_BYTES * 2));
  const text = new TextDecoder('latin1').decode(head);
  const end = text.indexOf('end_header');
  if (!text.startsWith('ply') || end < 0) throw new Error('not a PLY file');
  const lines = text.slice(0, end).split(/\r?\n/);
  const meta = lines.find((l) => l.startsWith(`comment ${TAG} state `));
  if (!meta) return null;
  const m = meta.match(/ v(\d+) sum ([0-9a-f]+) bytes (\d+)$/);
  if (!m) throw new Error('state: bad header line');
  const b64 = lines.filter((l) => l.startsWith(`comment ${TAG} b64 `)).map((l) => l.slice(`comment ${TAG} b64 `.length)).join('');
  const bytes = fromB64(b64);
  if (bytes.length > MAX_BYTES) throw new Error('state: too large');
  return accept(new TextDecoder().decode(bytes), m[2], +m[3]);
}

// ---------- PNG: a tEXt chunk ("fractal-engine", the same line-free base64 with its checksum) --------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (bytes) => { let c = 0xffffffff; for (const b of bytes) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

export function pngWithState(png, doc) {
  const src = new Uint8Array(png);
  const { bytes, sum } = encode(doc);
  const body = new TextEncoder().encode(`${TAG}\0v${STATE_V} ${sum} ${bytes.length} ${toB64(bytes)}`);
  const chunk = new Uint8Array(12 + body.length), dv = new DataView(chunk.buffer);
  dv.setUint32(0, body.length);
  chunk.set([0x74, 0x45, 0x58, 0x74], 4); // tEXt
  chunk.set(body, 8);
  dv.setUint32(8 + body.length, crc32(chunk.subarray(4, 8 + body.length)));
  // before IEND, the last 12 bytes
  const out = new Uint8Array(src.length + chunk.length);
  out.set(src.subarray(0, src.length - 12));
  out.set(chunk, src.length - 12);
  out.set(src.subarray(src.length - 12), src.length - 12 + chunk.length);
  return out;
}

export function readPngState(png) {
  const b = new Uint8Array(png), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b[0] !== 0x89 || b[1] !== 0x50) throw new Error('not a PNG file');
  for (let o = 8; o + 8 <= b.length;) {
    const n = dv.getUint32(o), type = String.fromCharCode(...b.subarray(o + 4, o + 8));
    if (type === 'tEXt') {
      const body = new TextDecoder('latin1').decode(b.subarray(o + 8, o + 8 + n));
      if (body.startsWith(`${TAG}\0`)) {
        const m = body.slice(TAG.length + 1).match(/^v(\d+) ([0-9a-f]+) (\d+) ([A-Za-z0-9+/=]+)$/);
        if (!m) throw new Error('state: bad PNG chunk');
        const bytes = fromB64(m[4]);
        if (bytes.length > MAX_BYTES) throw new Error('state: too large');
        return accept(new TextDecoder().decode(bytes), m[2], +m[3]);
      }
    }
    if (type === 'IEND') break;
    o += 12 + n;
  }
  return null;
}
