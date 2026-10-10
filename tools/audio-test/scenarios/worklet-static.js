/* AudioWorklet port, static: no ScriptProcessor left in the four capture tools, the module registers 'capture',
   shared.js exposes AT.worklet and every tool that captures creates its node from it. */
module.exports = async (lib) => {
  const fs = require('fs'); const path = require('path'); const dir = lib.outDir('worklet-static');
  const rd = (f) => fs.readFileSync(path.join(lib.ROOT, 'audio', f), 'utf8');
  const tools = ['t/rec.html', 't/bpm.html', 't/synth.html', 't/ana.html'];
  const sp = tools.filter(f => /ScriptProcessor|onaudioprocess/.test(rd(f)));
  const uses = tools.filter(f => /AT\.worklet\(/.test(rd(f)) && /new AudioWorkletNode\([^)]*'capture'/.test(rd(f)));
  const mod = rd('worklet-capture.js'), sh = rd('shared.js');
  const checks = { noScriptProcessor: sp.length === 0, allUseWorklet: uses.length === tools.length, registers: /registerProcessor\('capture'/.test(mod), loader: /AT\.worklet\s*=/.test(sh) };
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, sp, uses });
};
