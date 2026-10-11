// tools/xbench.mjs — the in-page harness in other engines (M8): WebKit (Safari's engine) and Firefox through Playwright,
// Chromium for comparison. Starts its own serve.py (production headers, D44), opens index.html?harness&bench, runs
// runAll and writes ref/xbench-<browser>-<tag>.json, with every console error and page exception the run produced.
//
//   node moshine/tools/xbench.mjs --browser webkit --tag m8
//   node moshine/tools/xbench.mjs --browser webkit --only matchParity,exportMix
//   node moshine/tools/xbench.mjs --browser webkit --shot editor.png --size 1440x900   (the editor on ?demo)
//   node moshine/tools/xbench.mjs --browser safari --tag m8      (Safari itself, through safaridriver: WebDriver classic)
//   node moshine/tools/xbench.mjs --browser zen --tag m8         (Zen / Firefox itself, through WebDriver BiDi; --bin <path>)
//
// Playwright is not a dependency of this repo: the module is taken from PLAYWRIGHT (a path to playwright/index.mjs),
// else the copy installed for iori's audio tests. Its browsers are the cached Playwright builds (WebKit is not Safari
// itself: Safari proper runs through safaridriver, see study/m8.md).
import { spawn, execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url)), APP = dirname(HERE);
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
  return acc;
}, []));
const name = String(args.browser || 'webkit'), tag = args.tag || 'dev';
// a port nobody serves (other sessions run their own servers; reusing one would serve another tree)
const busy = async (p) => { try { await fetch(`http://127.0.0.1:${p}/`); return true; } catch { return false; } };
const freePort = async (p) => { while (await busy(p)) p++; return p; };
const port = await freePort(+(args.port || 8793));
const kids = [], cleanup = () => { for (const k of kids) { try { k.kill('SIGKILL'); } catch {} } };
process.on('exit', cleanup); process.on('SIGINT', () => { cleanup(); process.exit(130); });
kids.push(spawn('python3', [join(APP, 'serve.py'), String(port)], { stdio: 'ignore' }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; ; i++) {
  try { if ((await fetch(`http://127.0.0.1:${port}/moshine/index.html`)).ok) break; } catch {}
  if (i > 50) throw new Error('serve.py did not come up');
  await sleep(100);
}
const { mkdtempSync, rmSync } = await import('node:fs'), { tmpdir } = await import('node:os');
const [vw, vh] = String(args.size || '1440x900').split('x').map(Number);

// ---- drivers: { version, goto(url), run(fnSource, arg) -> value, shot(path), errors(), close() }
// run() evaluates `(fnSource)(arg)` in the page and awaits it; values travel as JSON.
const wrap = (src, arg) => `Promise.resolve((${src})(${JSON.stringify(arg ?? null)})).then((v) => JSON.stringify({ ok: v === undefined ? null : v }), (e) => JSON.stringify({ err: String(e && e.stack || e) }))`;
const unwrap = (json) => { const r = JSON.parse(json); if (r.err) throw new Error(r.err); return r.ok; };
// errors seen in the page (WebDriver classic has no console events): collected from the first script that runs
const COLLECT = `(() => { if (window.__xerr) return; window.__xerr = []; const push = (t) => window.__xerr.length < 200 && window.__xerr.push(String(t).slice(0, 400));
  addEventListener('error', (e) => push('pageerror: ' + (e.message || e))); addEventListener('unhandledrejection', (e) => push('rejection: ' + (e.reason && e.reason.stack || e.reason)));
  for (const k of ['error', 'warn']) { const f = console[k].bind(console); console[k] = (...a) => { push(k + ': ' + a.map(String).join(' ')); f(...a); }; } })()`;

async function playwright() {
  const pw = await import(process.env.PLAYWRIGHT || '/Users/iori/Desktop/code/iori/tools/audio-test/node_modules/playwright/index.mjs');
  const profile = mkdtempSync(join(tmpdir(), `moshine-${name}-`));       // persistent (fresh per run): WebKit's throwaway contexts have no OPFS
  const ctx = await pw[name].launchPersistentContext(profile, { headless: !args.headed, viewport: { width: vw, height: vh } });
  const page = ctx.pages()[0] || (await ctx.newPage()), errors = [];
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${t}`.slice(0, 400)); if (args.verbose) console.log('  ' + t.slice(0, 300)); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e.message || e).slice(0, 400)));
  return { version: ctx.browser()?.version() || name, goto: (u) => page.goto(u), run: async (src, arg) => unwrap(await page.evaluate(wrap(src, arg))),
    shot: (p) => page.screenshot({ path: p }), errors: async () => errors, close: async () => { await ctx.close(); rmSync(profile, { recursive: true, force: true }); } };
}

/** Safari itself: safaridriver (WebDriver classic over HTTP). Needs `safaridriver --enable` and Develop ▸ Allow Remote Automation. */
async function safari() {
  const dport = await freePort(4444); kids.push(spawn('safaridriver', ['-p', String(dport)], { stdio: 'ignore' }));
  const W = async (method, path, body) => {
    const r = await fetch(`http://127.0.0.1:${dport}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json(); if (j.value && j.value.error) throw new Error(`${j.value.error}: ${j.value.message}`); return j.value;
  };
  let sess; for (let i = 0; ; i++) { try { sess = await W('POST', '/session', { capabilities: { alwaysMatch: { browserName: 'safari' } } }); break; } catch (e) { if (i > 40) throw e; await sleep(250); } }
  const S = `/session/${sess.sessionId}`;
  await W('POST', S + '/timeouts', { script: 3600000, pageLoad: 120000 });
  await W('POST', S + '/window/rect', { width: vw, height: vh + 90 }).catch(() => {});
  const exec = async (src) => W('POST', S + '/execute/async', { script: `const done = arguments[arguments.length - 1]; ${COLLECT}; (${src}).then(done, (e) => done(JSON.stringify({ err: String(e) })));`, args: [] });
  return { version: 'Safari ' + sess.capabilities.browserVersion, goto: (u) => W('POST', S + '/url', { url: u }), run: async (src, arg) => unwrap(await exec(wrap(src, arg))),
    shot: async (p) => writeFileSync(p, Buffer.from(await W('GET', S + '/screenshot'), 'base64')), errors: async () => JSON.parse(await exec('Promise.resolve(JSON.stringify(window.__xerr || []))')),
    close: async () => { await W('DELETE', S).catch(() => {}); } };
}

/** Zen or Firefox itself: launched with a fresh profile and driven over WebDriver BiDi (built in; no geckodriver). */
async function gecko() {
  const bin = String(args.bin || (name === 'zen' ? '/Applications/Zen.app/Contents/MacOS/zen' : '/Applications/Firefox.app/Contents/MacOS/firefox'));
  const profile = mkdtempSync(join(tmpdir(), `moshine-${name}-`)), bport = await freePort(9333);
  writeFileSync(join(profile, 'user.js'), [
    ['browser.shell.checkDefaultBrowser', false], ['datareporting.policy.dataSubmissionEnabled', false], ['toolkit.telemetry.reportingpolicy.firstRun', false],
    ['browser.aboutwelcome.enabled', false], ['zen.welcome-screen.seen', true], ['browser.startup.homepage_override.mstone', '"ignore"'], ['startup.homepage_welcome_url', '""'],
    ['browser.sessionstore.resume_from_crash', false], ['dom.webgpu.enabled', true], ['remote.prefs.recommended', true], ['app.update.auto', false], ['app.update.enabled', false],
    // the window opens in the background: no timer throttling there, or idle work (the cache fill) crawls
    ['dom.min_background_timeout_value', 4], ['dom.timeout.enable_budget_throttling', false], ['dom.suspend_inactive.enabled', false], ['layout.throttled_frame_rate', 60],
  ].map(([k, v]) => `user_pref("${k}", ${typeof v === 'string' ? v : JSON.stringify(v)});`).join('\n'));
  // through LaunchServices (`open -n`): started straight from a shell the app never initialises its profile here;
  // -n gives a separate instance, so a Zen or Firefox the owner has open is never touched
  const app = bin.replace(/\/Contents\/MacOS\/[^/]+$/, '');
  spawn('open', ['-n', '-g', '-a', app, '--args', '--remote-debugging-port', String(bport), '--profile', profile, '--no-remote', '--new-instance', ...(args.headed ? [] : ['--headless']), '--width', String(vw), '--height', String(vh)], { stdio: 'ignore' });
  let ourPid = 0;                                                     // our instance only, found by its debugging port
  const killOurs = () => { try { if (ourPid) process.kill(ourPid, 'SIGKILL'); } catch {} };
  let ws; for (let i = 0; ; i++) { try { ws = new WebSocket(`ws://127.0.0.1:${bport}/session`); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; }); break; } catch (e) { if (i > 80) throw new Error('no BiDi endpoint from ' + bin); await sleep(250); } }
  try { ourPid = +String(execSync(`lsof -t -iTCP:${bport} -sTCP:LISTEN`)).trim().split('\n')[0]; } catch {}
  let id = 0; const pending = new Map(), errors = [];
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.type === 'error' ? p.j(new Error(`${m.error}: ${m.message}`)) : p.r(m.result); return; }
    if (m.method === 'log.entryAdded' && ['error', 'warn'].includes(m.params.level)) errors.push(`${m.params.level}: ${m.params.text}`.slice(0, 400)); };
  const B = (method, params = {}) => new Promise((r, j) => { const i = ++id; pending.set(i, { r, j }); ws.send(JSON.stringify({ id: i, method, params })); });
  const sess = await B('session.new', { capabilities: {} });
  await B('session.subscribe', { events: ['log.entryAdded'] });
  const context = (await B('browsingContext.getTree', {})).contexts[0].context;
  await B('browsingContext.setViewport', { context, viewport: { width: vw, height: vh } }).catch(() => {});
  return { version: `${sess.capabilities.browserName} ${sess.capabilities.browserVersion}`, goto: (u) => B('browsingContext.navigate', { context, url: u, wait: 'complete' }),
    run: async (src, arg) => { const r = await B('script.evaluate', { expression: wrap(src, arg), target: { context }, awaitPromise: true }); if (r.type === 'exception') throw new Error(r.exceptionDetails.text); return unwrap(r.result.value); },
    shot: async (p) => writeFileSync(p, Buffer.from((await B('browsingContext.captureScreenshot', { context })).data, 'base64')), errors: async () => errors,
    close: async () => { await Promise.race([B('browser.close').catch(() => {}), sleep(3000)]); ws.close(); await sleep(800); killOurs(); rmSync(profile, { recursive: true, force: true }); } };
}

const D = name === 'safari' ? await safari() : name === 'zen' || name === 'gecko' ? await gecko() : await playwright();
const version = D.version, finish = async () => { await D.close(); cleanup(); };
for (const ev of ['uncaughtException', 'unhandledRejection']) process.on(ev, async (e) => { console.error(String(e && e.stack || e)); try { await D.close(); } catch {} cleanup(); process.exit(1); });
const waitFor = async (src, ms = 30000) => {
  for (const t = Date.now(); ; await sleep(200)) {
    try { if (await D.run(src)) return; } catch {}
    if (Date.now() - t > ms) {
      const page = await D.run(String(async () => ({ url: location.href, gpu: !!navigator.gpu, adapter: !!(navigator.gpu && await navigator.gpu.requestAdapter()), webcodecs: typeof VideoEncoder, text: document.body ? document.body.innerText.slice(0, 600) : null }))).catch((e) => String(e));
      console.error('page state:', JSON.stringify(page, null, 1), '\nerrors:', (await D.errors()).join('\n'));
      throw new Error('timed out waiting for ' + src);
    }
  }
};

if (args.shot) {
  await D.goto(`http://127.0.0.1:${port}/moshine/index.html?demo`); await sleep(+(args.wait || 3000));
  if (args.expr) console.log(JSON.stringify(await D.run(`async () => { ${args.expr} }`), null, 1));
  await D.shot(String(args.shot)); console.log(`screenshot ${args.shot} (${version})`);
  const e = await D.errors(); if (e.length) console.log(e.join('\n'));
  await finish(); process.exit(0);
}

await D.goto(`http://127.0.0.1:${port}/moshine/index.html?harness&bench`);
await waitFor('() => !!(window.__moshineHarness && window.__moshine)');
await D.run('() => { window.__moshine.playing = false; }');
const t0 = Date.now();
// one call per row: a long run in one script call hits HTTP timeouts (safaridriver), and per-row calls show progress
const ROW = String(async ({ tier, n }) => {
  const H = window.__moshineHarness, t = performance.now(); let r;
  try { r = await H[tier][n](); } catch (e) { const m = String(e), st = e && e.stack ? String(e.stack) : ''; r = { pass: false, error: st.includes(m) ? st : m + '\n' + st }; }
  r.secs = +((performance.now() - t) / 1000).toFixed(2); return r;
});
const list = await D.run(String(() => Object.fromEntries(['T0', 'T1', 'T4'].map((t) => [t, Object.keys(window.__moshineHarness[t] || {})]))));
const want = args.only ? String(args.only).split(',') : null, tiers = args.tiers ? String(args.tiers).split(',') : ['T0', 'T1', 'T4'];
const result = want ? { only: {} } : {};
for (const tier of tiers) for (const n of list[tier] || []) {
  if (want ? !want.includes(n) : n.startsWith('slow')) continue;
  const r = await D.run(ROW, { tier, n });
  (want ? result.only : (result[tier] ||= {}))[n] = r;
  if (args.progress) console.log(`  [${tier}] ${n} ${r.pass === undefined ? 'info' : r.pass ? 'pass' : 'FAIL'}`);
}
const rows = result.only ? { only: result.only } : { T0: result.T0, T1: result.T1, T4: result.T4 };
const summary = {};
for (const [tier, r] of Object.entries(rows)) for (const [n, x] of Object.entries(r || {})) summary[n] = x.pass === true ? 'pass' : x.pass === false ? 'FAIL' : x.skipped ? 'skip' : 'info';
const errors = await D.errors();
const out = { browser: name, version, tag, date: new Date().toISOString(), secs: (Date.now() - t0) / 1000, summary, errors, ...rows };
const file = join(APP, 'ref', `xbench-${name}-${tag}.json`); writeFileSync(file, JSON.stringify(out, null, 1));
for (const [n, s] of Object.entries(summary)) if (s !== 'pass' || args.all) console.log(`  ${s.padEnd(4)} ${n}${s !== 'pass' && s !== 'info' ? '  ' + JSON.stringify(Object.values(rows).find((r) => r && r[n])[n]).slice(0, 300) : ''}`);
const c = Object.values(summary).reduce((a, s) => ((a[s] = (a[s] || 0) + 1), a), {});
console.log(`${name} ${version}: ${JSON.stringify(c)} in ${out.secs.toFixed(1)} s, ${errors.length} console errors/warnings -> ${file.replace(APP + '/', 'moshine/')}`);
await finish();
