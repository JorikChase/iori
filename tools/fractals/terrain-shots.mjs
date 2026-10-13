#!/usr/bin/env node
// tools/fractals/terrain-shots.mjs — drive tools/fractals/terrain-test.html in headless Chrome over CDP
// (pattern: petri/tools/bench.mjs), never the shared browser pane.
//
//   node tools/fractals/terrain-shots.mjs --q "seed=3&sea=0.3" --shot region:name.png --shot focus:name2.png
//   node tools/fractals/terrain-shots.mjs --q "seed=1" --expr "window.__terrain.timing"
//   node tools/fractals/terrain-shots.mjs --q "seed=1" --do "window.__terrain.setPalette('natural')" --shot page:p.png
// Steps run in order: --do <js> (awaited), --shot <region|focus|page|stats>:<file> (saved in tools/fractals/shots/),
// --expr <js> (printed as JSON), --wait <ms>. A --q change reloads the page.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = dirname(dirname(HERE)), SHOTS = join(HERE, 'shots');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const steps = [];
const argv = process.argv.slice(2);
let width = 1400, height = 1600;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--size') { [width, height] = argv[++i].split('x').map(Number); continue; }
  if (a.startsWith('--')) steps.push([a.slice(2), argv[++i]]);
}
const freePort = () => new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });

const kids = [];
const cleanup = () => { for (const k of kids) { try { k.kill('SIGKILL'); } catch {} } };
process.on('exit', cleanup); process.on('SIGINT', () => { cleanup(); process.exit(130); });

const port = await freePort();
kids.push(spawn('/usr/bin/python3', [join(ROOT, 'tools/serve_root.py'), String(port)], { stdio: 'ignore' }));
for (let i = 0; ; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/tools/fractals/terrain-test.html`)).ok) break; } catch {} if (i > 60) throw new Error('server'); await sleep(100); }
const profile = mkdtempSync(join(tmpdir(), 'terrain-shots-'));
process.on('exit', () => { try { rmSync(profile, { recursive: true, force: true }); } catch {} });
kids.push(spawn(CHROME, ['--headless=new', `--user-data-dir=${profile}`, '--remote-debugging-port=0', '--enable-unsafe-webgpu',
  '--enable-features=Vulkan,WebGPUDeveloperFeatures', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows', '--no-first-run', '--no-default-browser-check', '--use-angle=metal', 'about:blank'], { stdio: 'ignore' }));
const portFile = join(profile, 'DevToolsActivePort');
for (let i = 0; !existsSync(portFile); i++) { if (i > 100) throw new Error('chrome'); await sleep(100); }
const [devPort] = readFileSync(portFile, 'utf8').split('\n');
const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${devPort}/json/version`)).json();
const ws = new WebSocket(webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let nextId = 1; const pending = new Map();
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = nextId++; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); return; }
  if (m.method === 'Runtime.consoleAPICalled') console.log('  console:', m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 600));
  if (m.method === 'Runtime.exceptionThrown') console.error('  page exception:', m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
};
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Runtime.enable', {}, sessionId); await send('Page.enable', {}, sessionId);
await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
async function load(qs) {
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/tools/fractals/terrain-test.html?${qs || ''}` }, sessionId);
  for (let i = 0; ; i++) { await sleep(200); try { if (await evaluate('!!(window.__terrain && window.__terrain.ready)')) break; } catch {} if (i > 600) throw new Error('harness not ready'); }
  await sleep(600);
}
mkdirSync(SHOTS, { recursive: true });
let loaded = false;
for (const [k, v] of steps) {
  if (k === 'q') { await load(v); loaded = true; continue; }
  if (!loaded) { await load(''); loaded = true; }
  if (k === 'wait') { await sleep(+v); continue; }
  if (k === 'do') { await evaluate(`(async () => { ${v}; })()`); await sleep(500); continue; }
  if (k === 'expr') { console.log(JSON.stringify(await evaluate(`(async () => (${v}))()`), null, 1)); continue; }
  if (k === 'shot') {
    const [what, file] = v.split(':');
    let clip;
    if (what !== 'page') {
      const id = what === 'region' ? 'regionView' : what === 'focus' ? 'focusView' : 'stats';
      const r = await evaluate(`(() => { const b = document.getElementById('${id}').getBoundingClientRect(); return { x: b.left + scrollX, y: b.top + scrollY, width: b.width, height: b.height }; })()`);
      clip = { ...r, scale: 1 };
    }
    const shot = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip, captureBeyondViewport: true } : {}) }, sessionId);
    writeFileSync(join(SHOTS, file), Buffer.from(shot.data, 'base64'));
    console.log('saved', join('tools/fractals/shots', file));
  }
}
ws.close(); cleanup();
process.exit(0);
