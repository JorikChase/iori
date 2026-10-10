const voice = require('./voice'); const detect = require(process.argv[2] || './detect_current'); const sr = 48000;
const gate = process.argv[3] === 'new' ? (r) => r.f > 0 && r.conf > .85 : (r) => r.f > 0 && r.conf > .85 && Math.min(1, r.rms * 9) > .05;
const rows = [];
for (const [sex, f0] of [['m', 131], ['f', 262], ['f', 440]]) for (const db of [-20, -30, -40, -45, -50, -55, -60]) {
  const x = voice({ f0, sex, breath: 0.18, dur: 1.2, seed: 7, gain: 1 });
  let rms = 0; for (const v of x) rms += v * v; rms = Math.sqrt(rms / x.length); const k = Math.pow(10, db / 20) / rms;
  const room = (i) => (Math.sin(i * 12.9898) * 43758.5453 % 1) * 0.0004;   // quiet room noise floor ~ -68 dBFS
  const y = x.map((v, i) => v * k + room(i));
  let acc = 0, n = 0; for (let s = 4800; s + 4096 < y.length; s += 3360) { const r = detect(y.subarray(s, s + 4096), sr); n++; if (gate(r) && Math.abs(12 * Math.log2(r.f / f0)) < .5) acc++; }
  rows.push({ voice: sex + ' ' + f0, 'rms dBFS': db, accepted: Math.round(100 * acc / n) + '%' });
}
console.table(rows);
