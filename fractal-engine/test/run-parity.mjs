#!/usr/bin/env node
/* Headless runner for the GPU / CPU parity page (test/parity.html) and, with --compile, the shader
   compile-time page (test/compile-time.html). Serves the repo root over a throwaway static server,
   opens the page in Playwright's Chromium with WebGPU on (Metal on this Mac), streams the page's
   `parity <section> <s> <text>` console lines, waits for window.__parity, prints one row per suite
   and exits 1 on any failure (2 on a timeout or a page that never ran).

     node fractal-engine/test/run-parity.mjs                # parity only
     node fractal-engine/test/run-parity.mjs --compile      # then compile times (one page at a time)
     node fractal-engine/test/run-parity.mjs --compile-only
     node fractal-engine/test/run-parity.mjs --rows         # every row, not only failing ones
     node fractal-engine/test/run-parity.mjs --json out.json --timeout 600

   Playwright comes from tools/audio-test/node_modules (npm i there once); a worktree without it falls
   back to the main checkout's copy, or set PLAYWRIGHT_DIR to a folder whose node_modules has it.
   GPU load: one page, one browser, sequential — the Mac has frozen under two heavy renders at once.

   The page's own `ok` is the verdict. The per-suite verdicts below repeat its thresholds (parity.html,
   the `*Ok` lines before window.__parity) only to say WHICH suite failed; if the two ever disagree the
   runner says so and trusts the page. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const opt = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const TIMEOUT = +opt('--timeout', 900) * 1000;          // the whole page; parity takes minutes
const STALL = +opt('--stall', 240) * 1000;               // no progress line for this long → give up
const HEADED = flag('--headed');

function loadPlaywright() {
  const dirs = [process.env.PLAYWRIGHT_DIR, path.join(ROOT, 'tools', 'audio-test')];
  try {   // a worktree shares .git with the main checkout, whose tools/audio-test has node_modules
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: ROOT, encoding: 'utf8' }).trim();
    dirs.push(path.join(path.dirname(common), 'tools', 'audio-test'));
  } catch {}
  for (const d of dirs.filter(Boolean)) {
    try { return createRequire(path.join(d, 'package.json'))('playwright'); } catch {}
  }
  console.error('playwright not found: run `npm i` in tools/audio-test, or set PLAYWRIGHT_DIR'); process.exit(2);
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.wgsl': 'text/plain', '.png': 'image/png', '.svg': 'image/svg+xml' };
function serve() {
  const srv = http.createServer((req, res) => {
    const p = path.normalize(path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (!p.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    fs.readFile(p, (err, buf) => {
      if (err) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(buf);
    });
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}

// the page's thresholds, per suite (see the header: the page's ok decides)
const N = 4096, SH_N = 4096;
const drv = (r) => r.formula.includes('drive=');
const SUITES = [
  ['forward', 'rows', (r) => r.median < (drv(r) ? 3e-4 : 1e-4) && r.p99 < (drv(r) ? 5e-2 : 2e-2) && r.iterMismatch / r.n < 0.02,
    (r) => `median ${r.median.toExponential(2)} p99 ${r.p99.toExponential(2)} iter≠ ${r.iterMismatch}/${r.n}`],
  ['inverse', 'invRows', (r) => r.wrong / Math.max(r.found, 1) < 0.01 && r.found / N > 0.33,
    (r) => `found ${r.found}/${N} wrong ${r.wrong}`],
  ['dual', 'dualRows', (r) => r.gradDegMed < 1 && r.paramRelMed < 0.01 && r.lyapAbsMed < 0.01,
    (r) => `grad ${r.gradDegMed.toFixed(3)}° ∂θ ${r.paramRelMed.toExponential(2)} λ ${r.lyapAbsMed.toExponential(2)}`],
  ['override', 'ovRows', (r) => r.median < 1e-4 && r.p99 < 2e-2,
    (r) => `median ${r.median.toExponential(2)} p99 ${r.p99.toExponential(2)}`],
  ['jit', 'jitRows', (r) => r.median < 1e-4 && r.p99 < 2e-2 && r.sMedian < 1e-4 && r.sP99 < 2e-2,
    (r) => `median ${r.median.toExponential(2)} p99 ${r.p99.toExponential(2)} ×${r.speedup.toFixed(2)} / ×${r.structSpeedup.toFixed(2)}`],
  ['shade', 'shadeRows', (r) => r.median < 1e-5 && r.off / SH_N < 0.005,
    (r) => `median ${r.median.toExponential(2)} off ${r.off}`],
];
const label = (r) => r.formula ?? `#${r.graph} ${r.nodes}`;

const pad = (s, n) => String(s).padEnd(n);
const t0 = Date.now();
const secs = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(6) + 's';

async function runPage(browser, base, file, done, onConsole) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let last = Date.now();
  page.on('console', (m) => { last = Date.now(); if (m.type() === 'error') errors.push(m.text()); onConsole(m.text()); });
  const start = Date.now();
  await page.goto(`${base}/fractal-engine/test/${file}`, { waitUntil: 'load' });
  const adapter = await page.evaluate(async () => { const a = navigator.gpu && await navigator.gpu.requestAdapter(); return a && [a.info.vendor, a.info.architecture, a.info.description].filter(Boolean).join(' '); });
  if (!adapter) { await page.close(); return { error: 'no WebGPU adapter in this browser', errors }; }
  console.log(`${secs()}  adapter: ${adapter}`);
  for (;;) {
    const r = await page.evaluate(done);
    if (r) { await page.close(); return { result: r, ms: Date.now() - start, errors }; }
    if (Date.now() - start > TIMEOUT) { const p = await page.evaluate(() => window.__progress); await page.close(); return { error: `timeout after ${TIMEOUT / 1000}s (last: ${JSON.stringify(p)})`, errors }; }
    if (Date.now() - last > STALL) { const p = await page.evaluate(() => window.__progress); await page.close(); return { error: `stalled ${STALL / 1000}s (last: ${JSON.stringify(p)})`, errors }; }
    await new Promise((r) => setTimeout(r, 500));
  }
}

function reportParity(res) {
  if (res.error || res.result.error) { console.log(`\nparity: ERROR ${res.error || res.result.error}`); return false; }
  const P = res.result;
  console.log(`\nparity: ${P.ok ? 'PASS' : 'FAIL'} in ${(res.ms / 1000).toFixed(1)}s\n`);
  let all = true;
  console.log(pad('suite', 10) + pad('rows', 6) + pad('fail', 6) + 'verdict');
  for (const [name, key, pass] of SUITES) {
    const rows = P[key] || [];
    const bad = rows.filter((r) => !pass(r));
    if (bad.length) all = false;
    console.log(pad(name, 10) + pad(rows.length, 6) + pad(bad.length, 6) + (bad.length ? 'FAIL' : 'PASS'));
  }
  for (const [name, key, pass, fmt] of SUITES) for (const r of P[key] || []) {
    const ok = pass(r);
    if (!ok || flag('--rows')) console.log(`  ${ok ? ' ' : '✗'} ${pad(name, 9)}${label(r)}\n      ${fmt(r)}`);
  }
  if (all !== P.ok) console.log(`\nnote: the per-suite thresholds here (${all ? 'all pass' : 'some fail'}) disagree with the page's ok=${P.ok} — parity.html changed them; update SUITES in run-parity.mjs`);
  if (res.errors.length) console.log('\npage errors:\n  ' + res.errors.join('\n  '));
  return P.ok;
}

function reportCompile(res) {
  if (res.error) { console.log(`\ncompile: ERROR ${res.error}`); return false; }
  console.log(`\ncompile times (ms, ${(res.ms / 1000).toFixed(1)}s total)\n`);
  let ok = true;
  for (const [k, v] of Object.entries(res.result)) { if (typeof v !== 'number') ok = false; console.log('  ' + pad(k, 16) + v); }
  return ok;
}

const { chromium } = loadPlaywright();
const srv = await serve();
const base = `http://127.0.0.1:${srv.address().port}`;
// channel 'chromium' = the full browser in new headless mode (the headless shell has no WebGPU)
const browser = await chromium.launch({ channel: 'chromium', headless: !HEADED,
  args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
let ok = true, fatal = false;
try {
  if (!flag('--compile-only')) {
    console.log(`${secs()}  parity.html`);
    const res = await runPage(browser, base, 'parity.html', () => window.__parity,
      (t) => { if (t.startsWith('parity ')) { const [, sec, s, ...rest] = t.split(' '); const txt = rest.join(' ').replace(/(shade=)\S{12,}/g, '$1…'); console.log(`${secs()}  ${pad(sec, 9)} page ${s}s  ${txt.length > 150 ? txt.slice(0, 149) + '…' : txt}`); } });
    if (res.error) fatal = true;
    ok = reportParity(res) && ok;
    if (flag('--json')) fs.writeFileSync(opt('--json'), JSON.stringify(res, null, 1));
  }
  if (flag('--compile') || flag('--compile-only')) {
    console.log(`\n${secs()}  compile-time.html`);
    const res = await runPage(browser, base, 'compile-time.html', () => window.__compile, () => {});
    if (res.error) fatal = true;
    ok = reportCompile(res) && ok;
  }
} finally {
  await browser.close(); srv.close();
}
console.log(`\n${ok ? 'PASS' : 'FAIL'}  (${secs().trim()})`);
process.exit(fatal ? 2 : ok ? 0 : 1);
