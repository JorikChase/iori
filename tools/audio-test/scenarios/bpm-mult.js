/* BPM multiplier and the shared tempo (Stage 0, rule L2). What the readout shows is what the shared tempo holds:
   1. a file opened at ×1 leaves the shared tempo alone
   2. ×2 with no selection of the user's own leaves it alone too; the next opened file, at ×2, also leaves it alone
   3. a drag selection at ×2 writes the doubled value; ÷2 afterwards rewrites it; a tap back to ×1 rewrites it
   4. a value committed on the digit wheel counts as the user's own: a later ×2 updates the shared tempo */
const path = require('path');
module.exports = async (lib) => {
  const dir = lib.outDir('bpm-mult'); const W = lib.VIEW.width, H = lib.VIEW.height;
  const br = await lib.browser(); const steps = {}; let pass = true;
  const check = (k, ok, data) => { steps[k] = { ok: !!ok, ...data }; pass = pass && !!ok; };
  const q = []; const page = await lib.open(br, 'bpm', { wait: 800 }); page.on('filechooser', c => q.push(c));
  const nextChooser = async (ms = 5000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (q.length) return q.shift(); await page.waitForTimeout(50); } throw new Error('no file chooser opened'); };
  const st = () => page.evaluate(() => ({ bpm: __S.res ? __S.res.bpm : 0, mult: __S.mult, whole: __S.whole, tempo: AT.tempo(), n: __S.n, takeId: __S.takeId }));
  const want = (s) => Math.round(s.bpm * s.mult * 10) / 10;
  const open = async (name) => { const id0 = (await st()).takeId; await page.mouse.click(W - 34, 34); const c = await nextChooser(); await c.setFiles(path.join(__dirname, '..', 'signals', name));
    const t0 = Date.now(); while (Date.now() - t0 < 20000) { const s = await page.evaluate(() => ({ b: __S.busy, id: __S.takeId })); if (!s.b && s.id && s.id !== id0) break; await page.waitForTimeout(150); } await page.waitForTimeout(300); };
  const B = [34 + 2 * (W - 68) / 3, H - 28], MA = [112, 76, 40];
  const fan = async (k) => { const a = MA[k] * Math.PI / 180, x = B[0] + Math.cos(a) * 92, y = B[1] - Math.sin(a) * 92;
    await page.mouse.move(...B); await page.mouse.down(); await page.waitForTimeout(40); for (let i = 1; i <= 8; i++) { await page.mouse.move(B[0] + (x - B[0]) * i / 8, B[1] + (y - B[1]) * i / 8); await page.waitForTimeout(20); }
    await page.waitForTimeout(80); await page.mouse.up(); await page.waitForTimeout(250); };
  await page.evaluate(() => AT.setTempo(77, 'test')); await page.waitForTimeout(120);

  await open('click120.wav'); let s = await st();
  check('fileLeavesTempo', lib.near(s.bpm, 120, 1.5) && s.tempo === 77, s);
  await fan(2); s = await st();
  check('multWithoutSelection', s.mult === 2 && s.tempo === 77, s);
  await open('tempo100to130.wav'); s = await st();
  check('fileAtX2LeavesTempo', s.mult === 2 && s.tempo === 77, s);

  const Y0 = 124, Y1 = H - 106, yAt = (t) => Y0 + t / (s.n / 100) * (Y1 - Y0);
  await page.mouse.move(W / 2, yAt(2)); await page.mouse.down(); for (let i = 1; i <= 10; i++) { await page.mouse.move(W / 2, yAt(2) + (yAt(10) - yAt(2)) * i / 10); await page.waitForTimeout(40); }
  await page.mouse.up(); await page.waitForTimeout(400); s = await st();
  check('selectionAtX2', !s.whole && s.bpm > 80 && s.tempo === want(s) && s.tempo > 150, s);
  await fan(0); s = await st();
  check('halfRewrites', s.mult === 0.5 && s.tempo === want(s) && s.tempo < 80, s);
  await page.mouse.click(...B); await page.waitForTimeout(250); s = await st();
  check('tapBackToOne', s.mult === 1 && s.tempo === want(s), s);

  await open('click120.wav'); await page.evaluate(() => AT.setTempo(77, 'test')); await page.waitForTimeout(120);
  await page.mouse.click(W / 2, 60); await page.waitForTimeout(450);
  const w = await page.evaluate(() => { const h = Wheel.active(); return h ? { x: h.state().cols[1].x, y: h.state().bandY } : null; });
  if (w) { await page.mouse.click(w.x, w.y); await page.waitForTimeout(450); }
  const s1 = await st(); await fan(2); s = await st();
  check('wheelThenMult', !!w && lib.near(s1.tempo, s1.bpm, .06) && s.mult === 2 && s.tempo === want(s), { afterWheel: s1, afterMult: s });

  const errors = page.errors.filter(e => !/serviceworker|service worker/i.test(e));
  check('noErrors', errors.length === 0, { errors });
  await br.close();
  return lib.result(dir, { pass, steps });
};
