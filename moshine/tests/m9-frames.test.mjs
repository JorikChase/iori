// The editing round trip (frames.js): the ZIP writer, the WAV writer. Run: node --test 'moshine/tests/*.test.mjs'
// MOSHINE_BIG=<dir> also writes a 4.6 GB ZIP there (ZIP64 offsets) and checks it with unzip -t, Python's zipfile and
// libarchive; the file is removed afterwards. Needs ~5 GB free.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openSync, writeSync, closeSync, rmSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { crc32, createZipWriter, wavHeader, pcm24, wavChunks } from '../frames.js';

const fileWritable = (path) => { const fd = openSync(path, 'w'); return { write: async (u8) => { writeSync(fd, u8); }, close: async () => closeSync(fd) }; };

test('crc32 matches the standard check value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const a = new TextEncoder().encode('12345'), b = new TextEncoder().encode('6789');
  assert.equal(crc32(b, crc32(a)), 0xcbf43926);                     // streamed in pieces
});

test('a small ZIP round-trips through unzip and Python', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'moshine-zip-')), path = join(dir, 'x.zip'), zip = createZipWriter(fileWritable(path));
  await zip.add('seq/a_000000.png', new Uint8Array([1, 2, 3]));
  await zip.add('seq/a.wav', (async function* () { yield new Uint8Array(1000).fill(7); yield new Uint8Array(24); })());
  await zip.finish();
  const list = execFileSync('unzip', ['-Z1', path]).toString().trim().split('\n');
  assert.deepEqual(list, ['seq/a_000000.png', 'seq/a.wav']);
  execFileSync('unzip', ['-tq', path]);
  const py = execFileSync('python3', ['-I', '-c', `import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print(len(z.read('seq/a.wav')))`, path]).toString().trim();
  assert.equal(py, '1024');
  execFileSync('ditto', ['-x', '-k', path, join(dir, 'out')]);                 // the engine behind macOS Archive Utility
  assert.equal(execFileSync('sh', ['-c', `cat "${join(dir, 'out', 'seq', 'a.wav')}" | wc -c`]).toString().trim(), '1024');
  rmSync(dir, { recursive: true });
});

test('a 24-bit WAV header and samples', async () => {
  const h = wavHeader(48000, 48000, 2), v = new DataView(h.buffer);
  assert.equal(String.fromCharCode(...h.slice(0, 4)), 'RIFF'); assert.equal(v.getUint16(34, true), 24); assert.equal(v.getUint32(40, true), 48000 * 2 * 3);
  const p = pcm24([new Float32Array([1, -1, 0.5]), new Float32Array([0, 2, -2])]);
  const s24 = (o) => (p[o] | (p[o + 1] << 8) | (p[o + 2] << 16)) << 8 >> 8;
  assert.deepEqual([0, 3, 6, 9, 12, 15].map((i) => s24(i)), [8388607, 0, -8388607, 8388607, 4194304, -8388607]);
  const mix = { sampleRate: 100, nch: 1, total: 250, block: async (a, b) => [new Float32Array(b - a)] };
  let n = 0; for await (const c of wavChunks(mix)) n += c.length;
  assert.equal(n, 44 + 250 * 3);
});

test('ZIP64: past 4 GB of offsets (MOSHINE_BIG=<dir>)', { skip: !process.env.MOSHINE_BIG, timeout: 20 * 60e3 }, async () => {
  const path = join(process.env.MOSHINE_BIG, 'moshine-zip64.zip'), zip = createZipWriter(fileWritable(path)), frame = new Uint8Array(4 << 20).map((_, i) => i * 31);
  try {
    for (let i = 0; i < 1100; i++) await zip.add(`big_${String(i).padStart(6, '0')}.png`, frame);     // 1100 × 4 MB = 4.6 GB
    await zip.add('big.wav', new Uint8Array(12345).fill(3));
    await zip.finish();
    assert.ok(zip.bytes > 2 ** 32);
    execFileSync('unzip', ['-tq', path], { maxBuffer: 64 << 20 });
    const py = execFileSync('python3', ['-I', '-c', `import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); n=z.namelist(); print(len(n), len(z.read(n[-1])), len(z.read('big_001099.png')))`, path]).toString().trim();
    assert.equal(py, `1101 12345 ${4 << 20}`);
    // libarchive reads every entry (bsdtar), without extracting 4.6 GB a second time
    assert.equal(execFileSync('sh', ['-c', `bsdtar -xOf "${path}" | wc -c`]).toString().trim(), String(1100 * (4 << 20) + 12345));
  } finally { rmSync(path, { force: true }); }
});
