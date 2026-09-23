#!/usr/bin/env node
// tools/bench.mjs — run the petri harness in headless Chrome, outside the app's browser pane.
//
//   node petri/tools/bench.mjs                         full scorecard, tag "dev"
//   node petri/tools/bench.mjs --tag v8 --tiers T0,T4  some tiers
//   node petri/tools/bench.mjs --only replay,kernelCost
//   node petri/tools/bench.mjs --tank catalogue --opts '{"steps":2000}'   think tank suite(s)
//   node petri/tools/bench.mjs --expr "await (await import('/petri/diag/fixture-trace.js')).trace({steps: 3000})"
//
// Why: a hidden in-app pane throttles timers and ran the scorecard ~4x slower; the pane is also busy
// while a bench runs. This uses the Chrome already installed (no downloads): headless with WebGPU on
// Metal, background throttling off, driven over the DevTools protocol with Node's built-in WebSocket.
// It starts its own serve.py on a spare port, so it never touches the dev server the app is using.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PETRI = dirname(HERE);
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
  return acc;
}, []));
const port = +(args.port || 8781);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ processes
const kids = [];
const cleanup = () => { for (const k of kids) { try { k.kill('SIGKILL'); } catch {} } };
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });

const server = spawn('python3', [join(PETRI, 'serve.py'), String(port)], { stdio: 'ignore' });
kids.push(server);
for (let i = 0; ; i++) {
  try { if ((await fetch(`http://127.0.0.1:${port}/petri/index.html`)).ok) break; } catch {}
  if (i > 50) throw new Error('serve.py did not come up');
  await sleep(100);
}

const profile = mkdtempSync(join(tmpdir(), 'petri-bench-'));
process.on('exit', () => { try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); } catch {} });
const chrome = spawn(CHROME, [
  '--headless=new', `--user-data-dir=${profile}`, '--remote-debugging-port=0',
  '--enable-unsafe-webgpu', '--enable-features=Vulkan,WebGPUDeveloperFeatures',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows', '--no-first-run', '--no-default-browser-check',
  'about:blank',
], { stdio: 'ignore' });
kids.push(chrome);
const portFile = join(profile, 'DevToolsActivePort');
for (let i = 0; !existsSync(portFile); i++) { if (i > 100) throw new Error('Chrome did not start'); await sleep(100); }
const [devPort] = readFileSync(portFile, 'utf8').split('\n');
const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${devPort}/json/version`)).json();

// ------------------------------------------------------------------ DevTools protocol
const ws = new WebSocket(webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let nextId = 1; const pending = new Map();
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = nextId++; pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
});
const quiet = !!args.quiet;
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); return; }
  if (m.method === 'Runtime.consoleAPICalled' && !quiet) {
    const line = m.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
    if (!/willReadFrequently/.test(line)) console.log(`  ${line}`.slice(0, 400));
  }
  if (m.method === 'Runtime.exceptionThrown') console.error('  page exception:', m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
};

const url = `http://127.0.0.1:${port}/petri/index.html?harness&bench`;
const { targetId } = await send('Target.createTarget', { url });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Runtime.enable', {}, sessionId);
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
for (let i = 0; !(await evaluate('!!(window.__petriHarness && window.__petri)')); i++) {
  if (i > 200) throw new Error('harness did not load (WebGPU unavailable headless?)');
  await sleep(100);
}
const gpu = await evaluate(`(async () => { const a = await navigator.gpu.requestAdapter(); const i = a.info || {}; return [i.vendor, i.architecture, i.description].filter(Boolean).join(' '); })()`);
console.log(`petri bench — headless Chrome, GPU: ${gpu || 'unknown'}`);
await evaluate('window.__petri.playing = false; true');     // the page's own dish must not compete

// ------------------------------------------------------------------ run
const t0 = Date.now();
let result;
if (args.tank) {
  // think tank suites (tank-suites.js); --opts '{"steps":1000}' passes suite options
  const names = String(args.tank).split(','), o = args.opts ? String(args.opts) : '{}';
  result = await evaluate(`(async () => { const T = await import('/petri/tank.js'), S = await import('/petri/tank-suites.js'), out = {};
    for (const n of ${JSON.stringify(names)}) { const r = await T.runTank(S.SUITES[n](${o}));
      out[n] = { dishes: r.dishes, wall_s: r.wall_s, summary: r.summary, saved: 'petri/ref/tank-' + r.name + '.json' }; }
    return out; })()`);
  console.log(JSON.stringify(result, null, 1));
} else if (args.expr) {
  result = await evaluate(`(async () => { ${args.expr.includes('return') ? args.expr : 'return ' + args.expr} })()`);
  console.log(JSON.stringify(result, null, 1));
} else if (args.only) {
  const names = String(args.only).split(',');
  result = await evaluate(`(async () => { const H = window.__petriHarness, out = {};
    for (const n of ${JSON.stringify(names)}) { const tier = ['T0','T1','T2','T4','RETIRED'].find((t) => H[t] && H[t][n]);
      if (!tier) { out[n] = { error: 'no such row' }; continue; }
      const t = performance.now(); try { out[n] = await H[tier][n](); } catch (e) { out[n] = { pass: false, error: String(e) }; }
      out[n].secs = +((performance.now() - t) / 1000).toFixed(1); console.log('[' + tier + '] ' + n, out[n].pass === undefined ? '' : out[n].pass ? 'pass' : 'FAIL'); }
    return out; })()`);
  console.log(JSON.stringify(result, null, 1));
} else {
  const tiers = args.tiers ? String(args.tiers).split(',') : undefined;
  const opts = { tag: args.tag || 'dev', save: !args['no-save'], ...(tiers ? { tiers } : {}) };
  result = await evaluate(`window.__petriHarness.runAll(${JSON.stringify(opts)}).then((r) => ({ pass: r.pass, tag: r.tag,
    rows: Object.fromEntries(['T0','T1','T2','T4'].filter((t) => r[t]).map((t) => [t, Object.fromEntries(Object.entries(r[t]).map(([k, v]) => [k, v.pass === undefined ? 'info' : v.pass ? 'pass' : 'FAIL']))])) }))`);
  console.log(JSON.stringify(result, null, 1));
  if (opts.save) console.log(`saved petri/ref/bench-${opts.tag}.json`);
}
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
ws.close(); cleanup();
await new Promise((r) => { chrome.once('exit', r); setTimeout(r, 2000); });
process.exit(result && result.pass === false ? 1 : 0);
