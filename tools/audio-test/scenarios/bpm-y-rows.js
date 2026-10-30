/* BPM B5–B7 on click tracks built here and opened through the real file dot.
   B5 a drag on the strip selects a part, its tempo drawn as a beat grid · B6 selecting sets the shared tempo, opening a
   file does not · B7 octave correction keeps a 40 and a 260 BPM click inside 50–215 */
const d = require('../drive');
module.exports = async (lib) => {
  const dir = lib.outDir('bpm-y-rows' + (lib.ENGINE === 'webkit' ? '-webkit' : '')), W = lib.VIEW.width, H = lib.VIEW.height, checks = {}, info = {}, DPR = lib.DPR;
  const click = (bpm, sec) => { const sr = 48000, n = sr * sec, b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
    const a = new Float32Array(n); for (let k = 0; k * 60 / bpm * sr < n; k++) { const i0 = Math.round(k * 60 / bpm * sr); for (let i = 0; i < 2400 && i0 + i < n; i++) a[i0 + i] = .7 * Math.exp(-i / 500) * Math.sin(2 * Math.PI * 1200 * i / sr); } for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(a[i] * 32000), 44 + i * 2); return b; };
  const br = await lib.browser(); const page = await lib.open(br, 'bpm', { wait: 500 }); await page.evaluate(() => { localStorage.clear(); AT.setTempo(100); });
  const q = []; page.on('filechooser', c => q.push(c));
  await d.install(page, '#' + await page.evaluate(() => document.querySelector('canvas').parentElement.id));
  const open = async (name, bpm, sec) => { const was = await page.evaluate(() => __S.takeId); await page.mouse.click(W - 34, 34); const t0 = Date.now(); while (!q.length && Date.now() - t0 < 25000) await page.waitForTimeout(50); const c = q.shift(); if (!c) throw new Error('no chooser'); await c.setFiles({ name, mimeType: 'audio/wav', buffer: click(bpm, sec) });
    await page.waitForFunction((was) => !__S.busy && __S.n > 0 && __S.res && __S.takeId && __S.takeId !== was, was, { timeout: 40000 }).catch(() => {}); await page.waitForTimeout(500); return page.evaluate(() => ({ n: __S.n, res: __S.res, tempo: AT.tempo(), whole: __S.whole, sel: { ...__S.sel } })); };
  const s0 = await open('c120.wav', 120, 24); info.opened = s0;
  checks.B6_fileLeavesTempo = s0.tempo === 100 && lib.near(s0.res.bpm, 120, 1);
  const f0 = `${dir}/whole.png`; await page.screenshot({ path: f0 });
  const dur = s0.n / (s0.sel.b / s0.n ? s0.n / s0.sel.b : 1), ys = await page.evaluate(() => { const Y0 = 124, Y1 = innerHeight - 106; return { Y0, Y1 }; });
  const y = (t) => ys.Y0 + t / s0.sel.b * (ys.Y1 - ys.Y0);
  const sel = await page.evaluate(async ({ a, b, x }) => { await G.drag(x, a, x, b, { ms: 200, steps: 10 }); await G.frame(() => !__S.busy, 3000); await G.wait(200); return { sel: { ...__S.sel }, whole: __S.whole, grids: __S.grids.map(g => ({ a: g.a, b: g.b, bpm: g.bpm })), res: __S.res, tempo: AT.tempo() }; }, { a: y(6), b: y(18), x: W / 2 });
  const png = await page.screenshot({ path: `${dir}/selected.png` });
  checks.B5_selects = !sel.whole && lib.near(sel.sel.a, 6, .15) && lib.near(sel.sel.b, 18, .15); checks.B5_grid = sel.grids.length === 1 && lib.near(sel.grids[0].bpm, 120, 1) && lib.near(sel.grids[0].a, 6, .15); checks.B6_selectionSetsTempo = lib.near(sel.tempo, 120, 1); info.sel = sel;
  // grid lines: beat spacing on screen, 0.5 s = this many px; the rows inside the selection carry a period, the rows outside none
  const col = []; for (let yy = ys.Y0; yy < ys.Y1; yy++) col.push({ x: 30, y: yy }, { x: W - 50, y: yy }); const px = await d.pixels(br, png, col, DPR), lum = (c) => c[0] + c[1] + c[2], bg = lum(px[0]); info.gridSample = px.filter(c => Math.abs(lum(c) - bg) > 80).length;
  const low = await open('c40.wav', 40, 30), hi = await open('c260.wav', 260, 24);
  checks.B7_slow = low.res && low.res.bpm >= 50 && low.res.bpm <= 215 && lib.near(low.res.bpm / 40, Math.round(low.res.bpm / 40), .04); checks.B7_fast = hi.res && hi.res.bpm >= 50 && hi.res.bpm <= 215 && lib.near(hi.res.bpm, 130, 2); info.b7 = { low: low.res, hi: hi.res };
  const errors = d.clean(page); await br.close(); checks.noErrors = !errors.length;
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, info, errors });
};
