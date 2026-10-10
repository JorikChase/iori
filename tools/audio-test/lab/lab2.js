const voice = require('./voice'); const G = require('./gate'); const sr = 48000;
const det = { old: require('./detect_current'), new: require('./detect_new') };
function rate(x, which, f0) { let acc = 0, n = 0, wrong = 0; for (let s = 4800; s + 4096 < x.length; s += 3360) { const r = det[which](x.subarray(s, s + 4096), sr); n++;
  if (G[which](r)) { if (f0 && Math.abs(12 * Math.log2(r.f / f0)) < .5) acc++; else wrong++; } } return { ok: Math.round(100 * acc / n), wrong: Math.round(100 * wrong / n) }; }
let seed = 3; const R = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - .5; };
const scale = (x, db) => { let s = 0; for (const v of x) s += v * v; const k = Math.pow(10, db / 20) / Math.sqrt(s / x.length); return x.map(v => v * k); };
const room = (n, db) => scale(Float32Array.from({ length: n }, R), db);
const rows = [];
for (const [sex, f0] of [['m', 110], ['f', 262], ['f', 523], ['f', 880]]) for (const db of [-35, -45, -50, -55, -60]) {
  const v = scale(voice({ f0, sex, breath: .18, dur: 1.2, seed: f0, gain: 1 }), db), nz = room(v.length, -72), x = v.map((a, i) => a + nz[i]);
  const o = rate(x, 'old', f0), w = rate(x, 'new', f0); rows.push({ case: `${sex} ${f0} Hz @ ${db} dBFS`, old: o.ok + '%', new: w.ok + '%', newWrong: w.wrong + '%' });
}
// false positives: noise alone, and noise + a quiet 60 Hz hum
for (const db of [-40, -50, -60, -66]) { const x = room(48000 * 1.2, db); const o = rate(x, 'old'), w = rate(x, 'new'); rows.push({ case: `white noise @ ${db}`, old: 'false ' + o.wrong + '%', new: 'false ' + w.wrong + '%', newWrong: '' }); }
// pink-ish noise (one-pole lowpassed) — fans, traffic
for (const db of [-45, -55]) { let y = 0; const x = scale(Float32Array.from({ length: 48000 * 1.2 }, () => (y = .97 * y + R())), db); const o = rate(x, 'old'), w = rate(x, 'new'); rows.push({ case: `rumble noise @ ${db}`, old: 'false ' + o.wrong + '%', new: 'false ' + w.wrong + '%', newWrong: '' }); }
console.table(rows);
