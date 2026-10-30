/* Recorder R2, R3, R6 and its dark running state (G4).
   R2 a tap elsewhere while recording drops a marker: red ripple, M2 readout, saved with the take
   R3 the retro ring keeps filling from the mic, and fills to two minutes of buffer: the rate here, the ceiling by size
   R6 level under the time: the level follows the input; near full scale the dots turn red */
const fs = require('fs'), path = require('path'); const d = require('../drive');
module.exports = async (lib) => {
  const dir = lib.outDir('rec-y-rows' + (lib.ENGINE === 'webkit' ? '-webkit' : '')), W = lib.VIEW.width, H = lib.VIEW.height, checks = {}, info = {}, DPR = lib.DPR;
  // a tone at about −1 dBFS: nothing in signals/ runs that hot
  const sr = 48000, n = sr * 30, wav = Buffer.alloc(44 + n * 2); wav.write('RIFF', 0); wav.writeUInt32LE(36 + n * 2, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(sr, 24); wav.writeUInt32LE(sr * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) wav.writeInt16LE(Math.round(29000 * Math.sin(2 * Math.PI * 440 * i / sr)), 44 + i * 2); fs.writeFileSync(path.join(dir, 'hot.wav'), wav);
  const br = await lib.browser(); const name = path.basename(dir);
  const go = async (w) => { const page = await lib.open(br, 'rec', { wait: 300, wav: w }); await page.evaluate(async () => { for (const t of await AT.takes.list()) await AT.takes.del(t.id); }); await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(500); await d.audioLog(page); await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(500); await d.install(page, '#' + await page.evaluate(() => document.querySelector('canvas').parentElement.id)); return page; };
  const REC = { x: W / 2, y: Math.round(H * .45) };
  let page = await go('tone1k_m20.wav');
  const shot = async (n) => page.screenshot({ path: `${dir}/${n}.png` });
  const out = await page.evaluate(async ({ x, y }) => { await G.tap(x, y); await G.frame(() => __S.live, 5000); await G.frame(() => __S.rec, 3000); return { live: __S.live, rec: __S.rec }; }, REC);
  if (!out.rec) await page.evaluate(async ({ x, y }) => { await G.frame(() => __S.live, 3000); await G.tap(x, y); await G.frame(() => __S.rec, 3000); }, REC);
  const y2 = H - 200;
  const m = await page.evaluate(async ({ x, y }) => { await G.wait(900); const r0 = __S.rn; const t0 = performance.now(); await G.tap(x, y); await G.wait(30); const fl = __S.mkFlash; await G.wait(700); const gap = (performance.now() - t0) / 1000; await G.tap(x + 40, y); await G.wait(320); return { gap, mk: __S.mk.slice(), fl, r0, rn: __S.rn, dt: (performance.now() - t0) / 1000, sr: __S.ctx.sampleRate, lvl: __S.lvl, inv: __S.inv, ring: __S.ring.length }; }, { x: W / 2 + 60, y: y2 });
  const pn = await d.panels(page); await shot('recording'); const [k] = await d.pixels(br, await page.screenshot(), [{ x: 16, y: 16 }], DPR);
  const end = await page.evaluate(async ({ x, y }) => { await G.tap(x, y); await G.frame(() => !__S.rec && !__S.tail, 3000); await G.wait(500); const l = await AT.takes.list(); return { n: l.length, mk: l[0] && l[0].markers, dur: l[0] && l[0].dur, inv: __S.inv }; }, REC);
  await page.waitForTimeout(500); const [w] = await d.pixels(br, await page.screenshot(), [{ x: 16, y: 16 }], DPR);
  checks.R2_markers = m.mk.length === 2 && lib.near(m.mk[1] - m.mk[0], m.gap, .05) && m.fl > .5 && end.mk.length === 2; checks.R2_readout = pn.join(' ').replace(/\?/g, ' ').includes('2'); info.r2 = { mk: m.mk, fl: m.fl, saved: end.mk, pn };
  const rate = (m.rn - m.r0) / m.sr / m.dt; checks.R3_fills = lib.near(rate, 1, .1) && m.ring === 120 * m.sr; info.r3 = { rate: +rate.toFixed(3), ring: m.ring };
  checks.G4_recorder = k[0] < 30 && w[0] > 230; info.g4 = { k, w };
  const quiet = await page.evaluate(() => __S.lvl); await page.context().close();
  page = await go(`../out/${name}/hot.wav`);
  const hot = await page.evaluate(async ({ x, y }) => { await G.tap(x, y); await G.frame(() => __S.live, 5000); await G.wait(700); return { live: __S.live, lvl: __S.lvl }; }, REC); await page.waitForTimeout(500);
  const hp = await page.screenshot({ path: `${dir}/hot.png` }); const qp = `${dir}/recording.png`; const scan = []; for (let y = 60; y < 150; y += 1) for (let x = W / 2 - 90; x < W / 2 + 90; x += 1) scan.push({ x, y }); const hpx = await d.pixels(br, hp, scan, DPR), qpx = await d.pixels(br, fs.readFileSync(qp), scan, DPR), red = (c) => c[0] > 180 && c[1] < 110 && c[2] < 110;
  const nr = hpx.filter(red).length, qr = qpx.filter(red).length;
  checks.R6_levelFollows = lib.near(m.lvl, -20, 1.5) && lib.near(hot.lvl, -1, 1.5); checks.R6_redNearClip = nr > 8; info.r6 = { quiet: m.lvl, hot, red: { hot: nr, quiet: qr } };
  const errors = d.clean(page); await br.close(); checks.noErrors = !errors.length;
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, info, errors });
};
