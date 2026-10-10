/* Tuner with quiet, real-shaped voices (owner report 2026-10-10: a girl's voice was not accepted, his was).
   Sung vowels from lab/voice.js at -52 dBFS RMS through the injected microphone — the level of a voice about a
   metre from an iPhone with auto-gain off. Female 262 and 523 Hz, male 110 Hz; then room noise alone. */
const voice = require('../lab/voice'); const fs = require('fs'); const path = require('path');
function wav(file, x, sr) { const b = Buffer.alloc(44 + x.length * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(x.length * 2, 40); for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(x[i] * 32767))), 44 + 2 * i); fs.writeFileSync(file, b); }
const scale = (x, db) => { let s = 0; for (const v of x) s += v * v; const k = Math.pow(10, db / 20) / Math.sqrt(s / x.length); return x.map(v => v * k); };
module.exports = async (lib) => {
  const dir = lib.outDir('tuner-voices'), sr = 48000, W = lib.VIEW.width, H = lib.VIEW.height;
  let seed = 5; const R = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - .5; };
  const cases = [{ name: 'f262', sex: 'f', f0: 262, note: 60 }, { name: 'f523', sex: 'f', f0: 523, note: 72 }, { name: 'm110', sex: 'm', f0: 110, note: 45 }, { name: 'noise', noise: true }];
  const out = {}; let pass = true;
  for (const c of cases) {
    const n = sr * 8; let x;
    if (c.noise) x = scale(Float32Array.from({ length: n }, R), -55);
    else { const v = scale(voice({ f0: c.f0, sex: c.sex, breath: .2, dur: 8, seed: c.f0, gain: 1 }), -52), nz = scale(Float32Array.from({ length: n }, R), -72); x = v.map((a, i) => a + nz[i]); }
    const f = path.join(__dirname, '..', 'signals', `_voice_${c.name}.wav`); wav(f, x, sr);
    const br = await lib.browser(); const page = await lib.open(br, 'tuner', { wait: 800, wav: path.basename(f) });
    await page.mouse.click(W / 2, H / 2); const seen = []; for (let i = 0; i < 12; i++) { await page.waitForTimeout(250); seen.push(await page.evaluate(() => ({ has: __S.has, note: __S.note, level: +__S.level.toFixed(2) }))); }
    await page.screenshot({ path: `${dir}/${c.name}.png` });
    const hits = seen.filter(s => s.has).length, right = seen.filter(s => s.has && s.note === c.note).length;
    const ok = c.noise ? hits === 0 : right >= 8; pass = pass && ok;
    out[c.name] = { ok, hits, right, level: seen[seen.length - 1].level, errors: page.errors };
    await page.context().close(); await br.close(); fs.unlinkSync(f);
  }
  return lib.result(dir, { pass, ...out });
};
