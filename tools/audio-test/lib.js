/* Audio Tools test harness — shared helpers.
   Headless Chromium (software GL) driving the pages from a local static server.
   - fake microphone: a WAV from signals/ is fed in as the capture device
   - virtual clock: page.clock lets motion be stepped frame by frame and captured at exact instants
   - state hooks: every page exposes window.__S (its state) and, with ?perf, window.__PERF
   Output goes to out/<scenario>/ : PNG frames, a contact sheet, and result.json. */
const { chromium, webkit } = require('playwright');
const ENGINE = process.env.AT_BROWSER === 'webkit' ? 'webkit' : 'chromium';   // AT_BROWSER=webkit: Safari's engine
const { spawn } = require('child_process');
const fs = require('fs'); const path = require('path'); const net = require('net');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, 'out');
const PORT = +(process.env.AT_PORT || 8794);   // parallel runs: give each its own AT_PORT
const VIEW = { width: 390, height: 844 };          // iPhone 15 class, CSS px
const DPR = +(process.env.DPR || 2);               // software GL is slow: DPR=1 for quick runs

function free(port) { return new Promise(r => { const s = net.createServer(); s.once('error', () => r(false)); s.listen(port, '127.0.0.1', () => s.close(() => r(true))); }); }

async function server() {
  if (!(await free(PORT))) return { stop() {} };   // something already serves the repo root
  const p = spawn('python3', [path.join(ROOT, 'tools', 'serve_root.py'), String(PORT)], { stdio: 'ignore' });
  for (let i = 0; i < 50 && await free(PORT); i++) await new Promise(r => setTimeout(r, 100));
  return { stop() { p.kill(); } };
}

/* one browser per WAV, since the capture file is a launch flag */
async function browser() {
  if (ENGINE === 'webkit') return webkit.launch({ headless: true });
  const args = ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  return chromium.launch({ headless: true, args });
}

/* The microphone, when a scenario names a WAV: getUserMedia is replaced before the page runs with a stream that
   plays that file through a MediaStreamAudioDestinationNode. Chromium's own fake capture device hangs on this
   Mac (getUserMedia never resolves, headless or headed), and this path is deterministic on every platform. */
const MIC_INIT = (url) => `(() => {
  const MD = window.MediaDevices && MediaDevices.prototype; if (!MD) return;
  const real = MD.getUserMedia;                                   // patch the prototype: WebKit ignores an instance override
  MD.getUserMedia = async function (c) {
    if (!c || !c.audio) return real.call(this, c);
    const ac = new (window.__MIC_AC = window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
    const buf = await ac.decodeAudioData(await (await fetch(${JSON.stringify(url)})).arrayBuffer());
    const src = ac.createBufferSource(); src.buffer = buf; const dst = ac.createMediaStreamDestination(); src.connect(dst);
    await ac.resume(); src.start(); window.__MIC = { ac, src, buf };
    return dst.stream;
  };
})();`;

/* iOS audio rule, emulated (AT_IOS=1 or {ios:true}): a context starts suspended unless created during a touch END
   (pointerup/touchend/click/keydown), and resume() does nothing outside one. Desktop engines are permissive, so
   without this the harness cannot see the commonest iPhone failure: audio started on touch-down never runs. */
const IOS_INIT = `(() => {
  let g = false; for (const t of ['touchend','pointerup','click','keydown']) addEventListener(t, () => { g = true; setTimeout(() => { g = false; }, 0); }, true);
  const O = window.AudioContext || window.webkitAudioContext; if (!O) return;
  const res = O.prototype.resume; O.prototype.resume = function () { return g ? res.call(this) : Promise.resolve(); };
  function C(o) { const c = o ? new O(o) : new O(); if (!g) c.suspend(); return c; } C.prototype = O.prototype;
  window.AudioContext = C; if (window.webkitAudioContext) window.webkitAudioContext = C; window.__IOS_AUDIO = true;
})();`;

async function open(br, tool, { perf = false, clock = false, wait = 600, wav = null, ios = !!process.env.AT_IOS, noUnlock = false } = {}) {
  const ctx = await br.newContext(ENGINE === 'webkit' ? { viewport: VIEW, deviceScaleFactor: DPR, hasTouch: true } : { viewport: VIEW, deviceScaleFactor: DPR, hasTouch: true, isMobile: true, permissions: ['microphone'] });
  const page = await ctx.newPage();
  if (ios) await page.addInitScript(IOS_INIT);
  if (noUnlock) await page.addInitScript(() => { window.__NO_UNLOCK = true; });
  if (wav) await page.addInitScript(MIC_INIT(`http://127.0.0.1:${PORT}/tools/audio-test/signals/${wav}`));
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  if (clock) {
    await page.clock.install();
    // Frames that a screenshot forces come from the compositor with REAL timestamps, while everything else on the
    // page runs on the virtual clock; a tool that computes elapsed = rAF timestamp - performance.now() would jump.
    // Hand every rAF callback the virtual clock's time instead, so screenshots show the state at the stepped instant.
    await page.addInitScript(() => { const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => raf(() => cb(performance.now())); });
  }
  const url = `http://127.0.0.1:${PORT}/audio/` + (tool === 'shell' ? '' : `t/${tool}.html`) + (perf ? '?perf' : '');
  await page.goto(url, { waitUntil: 'load' });
  if (clock) await page.clock.runFor(wait); else await page.waitForTimeout(wait);
  page.errors = errors;
  return page;
}

function outDir(name) { const d = path.join(OUT, name); fs.mkdirSync(d, { recursive: true }); return d; }

/* step the virtual clock and capture a frame at each listed time (ms since now); returns file paths */
async function frames(page, dir, times, tag = 'f') {
  let t = 0; const files = [];
  for (const target of times) {
    if (target > t) { await page.clock.runFor(target - t); t = target; }
    const f = path.join(dir, `${tag}-${String(target).padStart(5, '0')}.png`);
    await page.screenshot({ path: f }); files.push(f);
  }
  return files;
}

/* Capture exact instants of a motion: one fresh page per instant (a screenshot itself advances the virtual clock
   by ~80 ms, so a sequence of shots on one page cannot hit instants closer than that). `act(page)` performs the
   gesture on the virtual clock; `probe` is evaluated in the page for the state at that instant. Deterministic
   input + stepped clock = the same state every run. */
async function captureAt(br, tool, act, times, dir, { probe = '({})', tag = 'f', wait = 800 } = {}) {
  const out = [];
  for (const t of times) {
    const page = await open(br, tool, { clock: true, wait });
    await act(page); const t0 = await page.evaluate(() => performance.now());
    if (t > 0) await page.clock.runFor(t);
    const at = Math.round(await page.evaluate(() => performance.now()) - t0);
    const state = await page.evaluate(probe);
    const f = path.join(dir, `${tag}-${String(t).padStart(4, '0')}.png`); const png = await page.screenshot({ path: f });
    out.push({ t, at, file: f, lit: await lit(br, png), ...state });
    await page.context().close();
  }
  return out;
}

/* contact sheet: the PNGs tiled with their names, drawn by a blank page (no image deps) */
async function sheet(br, files, out, cols = 5, w = 180) {
  const page = await (await br.newContext()).newPage();
  const items = files.map(f => ({ name: path.basename(f, '.png'), src: 'data:image/png;base64,' + fs.readFileSync(f).toString('base64') }));
  await page.setContent(`<body style="margin:0;background:#222;font:11px Menlo,monospace;color:#ddd"><div style="display:grid;grid-template-columns:repeat(${cols},${w}px);gap:8px;padding:8px;width:max-content">${items.map(i => `<figure style="margin:0"><img src="${i.src}" style="width:${w}px;display:block;border:1px solid #444"><figcaption>${i.name}</figcaption></figure>`).join('')}</div></body>`);
  await page.waitForTimeout(200);
  await page.locator('div').first().screenshot({ path: out });
  await page.context().close();
}

/* fraction of non-black pixels in a PNG screenshot, measured by a blank page (the GL buffer is gone after present) */
async function lit(br, png) {
  const page = await (await br.newContext()).newPage();
  const v = await page.evaluate(async (src) => { const im = new Image(); im.src = src; await im.decode();
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0, t = 0; for (let i = 0; i < d.length; i += 16) { t++; if (d[i] + d[i + 1] + d[i + 2] > 40) n++; } return n / t; }, 'data:image/png;base64,' + png.toString('base64'));
  await page.context().close(); return +v.toFixed(3);
}

function result(dir, data) { fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(data, null, 2)); return data; }
const near = (a, b, tol) => Math.abs(a - b) <= tol;

module.exports = { IOS_INIT, ENGINE, PORT, server, browser, open, outDir, frames, captureAt, sheet, lit, result, near, VIEW, DPR, ROOT, OUT };
