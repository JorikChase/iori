// tools/xbench.mjs — the in-page harness in other engines (M8): WebKit (Safari's engine) and Firefox through Playwright,
// Chromium for comparison. Starts its own serve.py (production headers, D44), opens index.html?harness&bench, runs
// runAll and writes ref/xbench-<browser>-<tag>.json, with every console error and page exception the run produced.
//
//   node moshine/tools/xbench.mjs --browser webkit --tag m8
//   node moshine/tools/xbench.mjs --browser webkit --only matchParity,exportMix
//   node moshine/tools/xbench.mjs --browser webkit --shot editor.png --size 1440x900   (the editor on ?demo)
//
// Playwright is not a dependency of this repo: the module is taken from PLAYWRIGHT (a path to playwright/index.mjs),
// else the copy installed for iori's audio tests. Its browsers are the cached Playwright builds (WebKit is not Safari
// itself: Safari proper runs through safaridriver, see study/m8.md).
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url)), APP = dirname(HERE);
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
  return acc;
}, []));
const PW = process.env.PLAYWRIGHT || '/Users/iori/Desktop/code/iori/tools/audio-test/node_modules/playwright/index.mjs';
const pw = await import(PW);
const name = String(args.browser || 'webkit'), tag = args.tag || 'dev';
// a port nobody serves (other sessions run their own servers; reusing one would serve another tree)
const busy = async (p) => { try { await fetch(`http://127.0.0.1:${p}/`); return true; } catch { return false; } };
let port = +(args.port || 8793); while (await busy(port)) port++;
const server = spawn('python3', [join(APP, 'serve.py'), String(port)], { stdio: 'ignore' });
const cleanup = () => { try { server.kill('SIGKILL'); } catch {} };
process.on('exit', cleanup); process.on('SIGINT', () => { cleanup(); process.exit(130); });
for (let i = 0; ; i++) {
  try { if ((await fetch(`http://127.0.0.1:${port}/moshine/index.html`)).ok) break; } catch {}
  if (i > 50) throw new Error('serve.py did not come up');
  await new Promise((r) => setTimeout(r, 100));
}

// a persistent profile (fresh per run): WebKit's throwaway contexts have no OPFS
const { mkdtempSync, rmSync } = await import('node:fs'), { tmpdir } = await import('node:os');
const profile = mkdtempSync(join(tmpdir(), `moshine-${name}-`));
const [vw, vh] = String(args.size || '1440x900').split('x').map(Number);
const ctx = await pw[name].launchPersistentContext(profile, { headless: !args.headed, viewport: { width: vw, height: vh } });
const browser = { version: () => ctx.browser()?.version() || pw[name].name(), close: async () => { await ctx.close(); rmSync(profile, { recursive: true, force: true }); } };
const page = ctx.pages()[0] || (await ctx.newPage()), errors = [];
page.on('response', (r) => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${t}`.slice(0, 400)); if (args.verbose) console.log('  ' + t.slice(0, 300)); });
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e.message || e).slice(0, 400)));
const version = browser.version();

if (args.shot) {
  await page.goto(`http://127.0.0.1:${port}/moshine/index.html?demo`); await page.waitForTimeout(+(args.wait || 3000));
  if (args.expr) console.log(JSON.stringify(await page.evaluate(`(async () => { ${args.expr} })()`), null, 1));
  await page.screenshot({ path: String(args.shot) }); console.log(`screenshot ${args.shot} (${name} ${version})`);
  if (errors.length) console.log(errors.join('\n'));
  await browser.close(); cleanup(); process.exit(0);
}

await page.goto(`http://127.0.0.1:${port}/moshine/index.html?harness&bench`);
await page.waitForFunction(() => !!(window.__moshineHarness && window.__moshine), null, { timeout: 30000 });
await page.evaluate(() => { window.__moshine.playing = false; });
const t0 = Date.now();
const result = await page.evaluate(async ({ only, tiers }) => {
  const H = window.__moshineHarness, out = {};
  if (only) {
    for (const n of only) { const tier = ['T0', 'T1', 'T4'].find((t) => H[t] && H[t][n]); const t = performance.now();
      try { out[n] = tier ? await H[tier][n]() : { error: 'no such row' }; } catch (e) { out[n] = { pass: false, error: String(e && e.stack || e) }; }
      out[n].secs = +((performance.now() - t) / 1000).toFixed(2); }
    return { only: out };
  }
  return H.runAll({ tag: 'x', save: false, tiers });
}, { only: args.only ? String(args.only).split(',') : null, tiers: args.tiers ? String(args.tiers).split(',') : ['T0', 'T1', 'T4'] });
const rows = result.only ? { only: result.only } : { T0: result.T0, T1: result.T1, T4: result.T4 };
const summary = {};
for (const [tier, r] of Object.entries(rows)) for (const [n, x] of Object.entries(r || {})) summary[n] = x.pass === true ? 'pass' : x.pass === false ? 'FAIL' : x.skipped ? 'skip' : 'info';
const out = { browser: name, version, tag, date: new Date().toISOString(), secs: (Date.now() - t0) / 1000, summary, errors, ...rows };
const file = join(APP, 'ref', `xbench-${name}-${tag}.json`); writeFileSync(file, JSON.stringify(out, null, 1));
for (const [n, s] of Object.entries(summary)) if (s !== 'pass' || args.all) console.log(`  ${s.padEnd(4)} ${n}${s === 'FAIL' ? '  ' + JSON.stringify(Object.values(rows).find((r) => r && r[n])[n]).slice(0, 300) : ''}`);
const c = Object.values(summary).reduce((a, s) => ((a[s] = (a[s] || 0) + 1), a), {});
console.log(`${name} ${version}: ${JSON.stringify(c)} in ${out.secs.toFixed(1)} s, ${errors.length} console errors/warnings -> ${file.replace(APP + '/', 'moshine/')}`);
await browser.close(); cleanup();
