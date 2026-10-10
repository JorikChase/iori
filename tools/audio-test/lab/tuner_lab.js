const voice = require('./voice'); const detect = require(process.argv[2] || './detect_current');
const sr = 48000, A4 = 440;
const cases = [['m', 98], ['m', 131], ['m', 165], ['m', 220], ['f', 196], ['f', 262], ['f', 330], ['f', 440], ['f', 523], ['f', 659], ['f', 784], ['f', 988]];
const rows = [];
for (const [sex, f0] of cases) for (const breath of [0.05, 0.18, 0.35]) {
  const x = voice({ f0, sex, breath, dur: 1.2, seed: f0 + breath * 100 }); let acc = 0, okPitch = 0, n = 0, confs = [];
  for (let s = 4800; s + 4096 < x.length; s += 3360) {      // a 4096 window every 70 ms, as the tuner does
    const r = detect(x.subarray(s, s + 4096), sr); n++; confs.push(r.conf);
    const accepted = r.f > 0 && r.conf > .85 && Math.min(1, r.rms * 9) > .05; if (accepted) acc++;
    if (accepted && Math.abs(12 * Math.log2(r.f / f0)) < 0.5) okPitch++;
  }
  confs.sort((a, b) => a - b);
  rows.push({ voice: sex + ' ' + f0 + ' Hz', breath, accepted: Math.round(100 * acc / n) + '%', rightNote: Math.round(100 * okPitch / n) + '%', medianConf: confs[confs.length >> 1].toFixed(2) });
}
console.table(rows);
