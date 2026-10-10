#!/usr/bin/env node
/* Usage: node run.js [scenario ...]     (no args = every scenario in scenarios/)
   Each scenario exports async (lib) => ({pass, ...details}). Exit code 1 if any fails. */
const fs = require('fs'); const path = require('path'); const lib = require('./lib');
(async () => {
  const dir = path.join(__dirname, 'scenarios');
  const names = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => f.slice(0, -3)).sort();
  const srv = await lib.server(); let failed = 0; const summary = [];
  for (const n of names) {
    const t0 = Date.now(); let r;
    try { r = await require(path.join(dir, n + '.js'))(lib); } catch (e) { r = { pass: false, error: e.stack || String(e) }; }
    failed += r.pass ? 0 : 1; summary.push({ scenario: n, ...r, ms: Date.now() - t0 });
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${n}  ${((Date.now() - t0) / 1000).toFixed(1)}s` + (r.pass ? '' : '\n      ' + (r.error || JSON.stringify(r)).split('\n').slice(0, 6).join('\n      ')));
  }
  srv.stop();
  fs.mkdirSync(lib.OUT || path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(`\n${names.length - failed}/${names.length} passed`);
  process.exit(failed ? 1 : 0);
})();
