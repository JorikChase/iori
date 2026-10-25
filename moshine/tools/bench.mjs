#!/usr/bin/env node
// tools/bench.mjs — run the MOSHINE harness in headless Chrome, outside the app's browser pane (petri idiom).
//
//   node moshine/tools/bench.mjs                        T0 + T4, tag "dev", writes moshine/ref/bench-dev.json
//   node moshine/tools/bench.mjs --tag m0 --tiers T0
//   node moshine/tools/bench.mjs --only warpParity,moshReplay
//   node moshine/tools/bench.mjs --expr "window.__moshine.probe"
//   node moshine/tools/bench.mjs --page lab.html --expr "await __lab.seek(50)" --shot lab.png --size 1400x900
//   node moshine/tools/bench.mjs --page index.html --expr "<driver returning { opfs: name }>" --out mosh.mp4   (any length)
//
// Uses the Chrome already installed (no downloads): headless with WebGPU on Metal, background throttling
// off, driven over the DevTools protocol with Node's built-in WebSocket. It starts its own serve.py on a
// spare port, so it never touches the dev server the app is using.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = dirname(HERE);
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
  return acc;
}, []));
const port = +(args.port || 8782);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ processes
const kids = [];
const cleanup = () => { for (const k of kids) { try { k.kill('SIGKILL'); } catch {} } };
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });

// production (iori.me) sends no COOP/COEP, so the bench runs without them unless --coi asks (the ffmpeg.wasm bake)
const server = spawn('python3', [join(APP, 'serve.py'), String(port), ...(args.coi ? ['--coi'] : [])], { stdio: 'ignore' });
kids.push(server);
for (let i = 0; ; i++) {
  try { if ((await fetch(`http://127.0.0.1:${port}/moshine/index.html`)).ok) break; } catch {}
  if (i > 50) throw new Error('serve.py did not come up');
  await sleep(100);
}

const profile = mkdtempSync(join(tmpdir(), 'moshine-bench-'));
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

// --page lab.html loads another page of the app (no harness); --shot file.png saves a screenshot after --expr
const page = args.page ? String(args.page) : 'index.html?harness&bench';
const url = `http://127.0.0.1:${port}/moshine/${page}`;
const { targetId } = await send('Target.createTarget', { url });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Runtime.enable', {}, sessionId);
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
// the app (index.html) sets window.__app after more start-up awaits than window.__moshine; --expr drivers need it
const ready = args.page ? `!!(window.__moshine && (window.__app || !/(^|\\/)(index\\.html)?$/.test(location.pathname)))` : '!!(window.__moshineHarness && window.__moshine)';
for (let i = 0; !(await evaluate(ready)); i++) {
  if (i > 200) throw new Error('harness did not load (WebGPU unavailable headless?)');
  await sleep(100);
}
const gpu = await evaluate(`(async () => { const a = await navigator.gpu.requestAdapter(); const i = a.info || {}; return [i.vendor, i.architecture, i.description].filter(Boolean).join(' '); })()`);
console.log(`moshine bench — headless Chrome, GPU: ${gpu || 'unknown'}`);
await evaluate('window.__moshine.playing = false; true');     // the page's own demo must not compete

// ------------------------------------------------------------------ run
const t0 = Date.now();
let result;
if (args.expr || args.shot) {
  if (args.expr) result = await evaluate(`(async () => { ${args.expr.includes('return') ? args.expr : 'return ' + args.expr} })()`);
  if (result !== undefined) console.log(JSON.stringify(result, null, 1));
  // --out file: the expr returns { opfs: '<name>' } (an export made with runExport({ where: 'opfs' })) and the file is
  // pulled from moshine-exports/ in 8 MB pieces. Never return a whole export as one string: past ~100 MB the DevTools
  // socket stalls for good (a 1000-frame 1080p mosh, 2026-10-25), which looked like an export hang.
  if (args.out && result?.opfs) {
    const fs = await import('node:fs'), fd = fs.openSync(String(args.out), 'w'), name = JSON.stringify(result.opfs), CH = 8 << 20;
    const file = `(await (await (await navigator.storage.getDirectory()).getDirectoryHandle('moshine-exports')).getFileHandle(${name})).getFile()`;
    const size = await evaluate(`(async () => (await ${file}).size)()`);
    for (let at = 0; at < size; at += CH) {
      const b64 = await evaluate(`(async () => { const b = new Uint8Array(await (await ${file}).slice(${at}, ${at + CH}).arrayBuffer()); let s = '';
        for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); })()`);
      fs.writeSync(fd, Buffer.from(b64, 'base64'));
    }
    fs.closeSync(fd);
    await evaluate(`(async () => { await (await (await navigator.storage.getDirectory()).getDirectoryHandle('moshine-exports')).removeEntry(${name}); return true; })()`);
    console.log(`wrote ${args.out} ${size} bytes`);
  }
  if (args.shot) {
    const [w, h] = String(args.size || '1400x900').split('x').map(Number);
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }, sessionId); await sleep(600);
    const { data } = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
    (await import('node:fs')).writeFileSync(String(args.shot), Buffer.from(data, 'base64')); console.log('screenshot ' + args.shot);
  }
} else if (args.only) {
  const names = String(args.only).split(',');
  result = await evaluate(`(async () => { const H = window.__moshineHarness, out = {};
    for (const n of ${JSON.stringify(names)}) { const tier = ['T0','T1','T4'].find((t) => H[t] && H[t][n]);
      if (!tier) { out[n] = { error: 'no such row' }; continue; }
      const t = performance.now(); try { out[n] = await H[tier][n](); } catch (e) { out[n] = { pass: false, error: String(e) }; }
      out[n].secs = +((performance.now() - t) / 1000).toFixed(1); console.log('[' + tier + '] ' + n, out[n].pass === undefined ? '' : out[n].pass ? 'pass' : 'FAIL'); }
    return out; })()`);
  console.log(JSON.stringify(result, null, 1));
  if (args.tag) { (await import('node:fs')).writeFileSync(join(APP, 'ref', `bench-${args.tag}.json`), JSON.stringify({ tag: args.tag, date: new Date().toISOString(), gpu, only: result }, null, 1)); console.log(`saved moshine/ref/bench-${args.tag}.json`); }
} else {
  const tiers = args.tiers ? String(args.tiers).split(',') : undefined;
  const opts = { tag: args.tag || 'dev', save: !args['no-save'], ...(tiers ? { tiers } : {}) };
  result = await evaluate(`window.__moshineHarness.runAll(${JSON.stringify(opts)}).then((r) => ({ pass: r.pass, tag: r.tag,
    rows: Object.fromEntries(['T0','T1','T4'].filter((t) => r[t]).map((t) => [t, Object.fromEntries(Object.entries(r[t]).map(([k, v]) => [k, v.pass === undefined ? 'info' : v.pass ? 'pass' : 'FAIL']))])) }))`);
  console.log(JSON.stringify(result, null, 1));
  if (opts.save) console.log(`saved moshine/ref/bench-${opts.tag}.json`);
}
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
ws.close(); cleanup();
await new Promise((r) => { chrome.once('exit', r); setTimeout(r, 2000); });
process.exit(result && result.pass === false ? 1 : 0);
