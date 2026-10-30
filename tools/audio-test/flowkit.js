/* Workflows through the shell: real frames, the shell's own transitions, every tool reached the way a finger reaches it.
   const f = await kit(lib, page);  await f.open('rec'); await f.home(); f.frame('edit'); await f.sw('edit') ... */
const d = require('./drive');
const TOOLS = ['edit', 'tuner', 'bpm', 'metro', 'synth', 'ana', 'play', 'rec'];
async function kit(lib, page) {   // holds are stretched and waits long: these prove the path through the tools, hold-times and dial-hold the timings
  const H = lib.VIEW.height, W = lib.VIEW.width;
  await page.evaluate(() => { const el = document.getElementById('hit'); window.__hit = (t, x, y) => el.dispatchEvent(new PointerEvent(t, { clientX: x, clientY: y, bubbles: true, pointerId: 1, isPrimary: true, pointerType: 'touch' })); });
  const tapHit = async (x, y, ms = 60) => { await page.evaluate(([x, y]) => __hit('pointerdown', x, y), [x, y]); await page.waitForTimeout(ms); await page.evaluate(([x, y]) => __hit('pointerup', x, y), [x, y]); };
  const frame = (k) => page.frames().find(f => f.url().includes(`/t/${k}.html`));
  const inTool = (k) => page.waitForFunction((i) => __S.mode === 'tool' && __S.tool === i, TOOLS.indexOf(k), { timeout: 40000 });
  const ready = async (k, sel) => { const f = frame(k); await f.waitForFunction(() => window.__S, null, { timeout: 8000 }); await d.install(page, sel || f, f).catch(() => {}); return f; };
  const G = async (k) => { const f = frame(k); const id = await f.evaluate(() => document.querySelector('canvas').parentElement.id); await d.install(page, '#' + id, f); return f; };
  return { tapHit, frame, inTool, G,
    async open(k) { const i = TOOLS.indexOf(k), s = await page.evaluate((i) => __SAT(i), i); await tapHit(s.x, s.y); await inTool(k); await page.waitForTimeout(500); return G(k); },
    async home() { await tapHit(44, H - 44); await page.waitForFunction(() => __S.mode === 'home', null, { timeout: 40000 }); await page.waitForTimeout(350); },
    // hub dial: hold, sideways by steps, release
    async sw(k) { const a = await page.evaluate(() => __S.tool), b = TOOLS.indexOf(k), st = (b - a + 8) % 8, hub = await page.evaluate(() => ({ x: __S.cx, y: __S.cy })); await page.evaluate(([x, y]) => __hit('pointerdown', x, y), [hub.x, hub.y]); await page.waitForTimeout(40);
      const SS = Math.max(40, Math.min(70, (Math.min(W, H) - 44 - 56 - 24) / 6)), dx = 56 + (st - 1) * SS + SS / 2; for (let k2 = 1; k2 <= 8; k2++) { await page.evaluate(([x, y]) => __hit('pointermove', x, y), [hub.x + dx * k2 / 8, hub.y]); await page.waitForTimeout(16); } await page.waitForTimeout(60); await page.evaluate(([x, y]) => __hit('pointerup', x, y), [hub.x + dx, hub.y]); await inTool(k); await page.waitForTimeout(500); return G(k); } };
}
const SLOW = () => { window.__HOLD = 700; window.__SEEDHOLD = 3000; };
const SHARE_STUB = () => { window.__shares = []; const P = Navigator.prototype; Object.defineProperty(P, 'canShare', { configurable: true, writable: true, value: (d) => !!(d && d.files && d.files.length) });
  Object.defineProperty(P, 'share', { configurable: true, writable: true, value: function (d) { const f = d.files[0], rec = { name: f.name, type: f.type, size: f.size }; window.__shares.push(rec); return Promise.resolve(); } }); };
module.exports = { kit, SHARE_STUB, SLOW, TOOLS };
