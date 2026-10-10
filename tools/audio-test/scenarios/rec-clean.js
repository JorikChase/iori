/* Recorder: no synthesised audio in the source — no oscillators, no demo figure, no test-signal source, and every
   take created by the page is a real capture ('rec' / 'retro') or an imported file. */
module.exports = async (lib) => {
  const fs = require('fs'); const path = require('path');
  const dir = lib.outDir('rec-clean');
  const src = fs.readFileSync(path.join(lib.ROOT, 'audio', 't', 'rec.html'), 'utf8').split('\n').filter(l => !/^\.ti-/.test(l)).join('\n');
  const banned = ['createOscillator', 'OscillatorNode', 'createBiquadFilter', 'createConstantSource', 'createPeriodicWave', 'function demo', 'demo(', 'src===1', 'S.src', 'Math.random()*2-1', 'Math.sin(2*Math.PI', 'sawtooth', "type='sine'"];
  const found = banned.filter(b => src.includes(b));
  const kinds = [...src.matchAll(/save\(d,'([a-z]+)'/g)].map(m => m[1]);
  const checks = { noSynthCode: !found.length, onlyRealKinds: kinds.length > 0 && kinds.every(k => k === 'rec' || k === 'retro') };
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, found, kinds });
};
