/* Analyzer A1, A2, A4, A5, A7, A8 and its dark running state (G4), listening to a 1 kHz tone from the injected mic.
   A1 control dot · A2 hold or flick opens three view buds · A4 spectrum ring with a blue peak marker · A5 three styles,
   72 dots by default · A7 spectrogram waterfall · A8 loudness rows, green near −14, a tap on top resets */
const fs = require('fs'), path = require('path'); const d = require('../drive');
module.exports = async (lib) => {
  const dir = lib.outDir('ana-y-rows' + (lib.ENGINE === 'webkit' ? '-webkit' : '')), W = lib.VIEW.width, H = lib.VIEW.height, checks = {}, info = {}, DPR = lib.DPR;
  const tone = (db, hz = 1000) => { const sr = 48000, n = sr * 150, b = Buffer.alloc(44 + n * 2), A = Math.pow(10, db / 20) * 32767; b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40); for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(A * Math.sin(2 * Math.PI * hz * i / sr)), 44 + i * 2); return b; };
  fs.writeFileSync(path.join(dir, 'm11.wav'), tone(-11.05)); fs.writeFileSync(path.join(dir, 'm20.wav'), tone(-20));   // long enough for a loaded machine
  const br = await lib.browser(), name = path.basename(dir);
  const go = async (w) => { const page = await lib.open(br, 'ana', { wait: 300, wav: w }); await d.audioLog(page); await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(600); await d.install(page, '#' + await page.evaluate(() => document.querySelector('canvas').parentElement.id)); return page; };
  const CT = { x: W / 2, y: H * .55 }, STY = { x: W - 34, y: H - 34 }; let page = await go(`../out/${name}/m20.wav`);
  const corner = async () => (await d.pixels(br, await page.screenshot(), [{ x: 16, y: 16 }], DPR))[0];
  const w0 = await corner();
  const a1 = await page.evaluate(async ({ x, y }) => { await G.tap(x, y); await G.frame(() => __S.run, 5000); await G.wait(1800); return { run: __S.run, pf: __S.pf, pd: __S.pd }; }, CT); await page.waitForTimeout(500); const k0 = await corner();
  checks.A1_tapListens = a1.run; checks.G4_analyzer = w0[0] > 230 && k0[0] < 30; info.a1 = { a1, w0, k0 };

  // A4
  const specPng = await page.screenshot({ path: `${dir}/spectrum.png` }), sp = await page.evaluate(() => { const a = Array.from(__S.spec); let m = 0; a.forEach((v, i) => { if (v > a[m]) m = i; }); return { n: a.length, peak: m }; });
  const ann = []; for (let r = 60; r < 180; r += 1) for (let a = 0; a < 360; a += 1) ann.push({ x: W / 2 + r * Math.sin(a * Math.PI / 180), y: Math.round(H * .55) - r * Math.cos(a * Math.PI / 180), a, r }); const apx = await d.pixels(br, specPng, ann, DPR), blue = ann.filter((q, i) => apx[i][2] > apx[i][0] + 90 && apx[i][2] > apx[i][1] + 40);
  const expBin = Math.log(1000 / 20) / Math.log(1000) * 256; checks.A4_peak = lib.near(sp.peak, expBin, 4) && lib.near(a1.pf, 1000, 3); checks.A4_blueMarker = blue.length >= 4; info.a4 = { sp, expBin: +expBin.toFixed(1), blue: blue.length, a: blue.slice(0, 3).map(q => [q.a, q.r]) };

  // A5
  const shots = []; for (let k = 0; k < 3; k++) { shots.push({ sty: await page.evaluate(() => __S.sty), png: await page.screenshot({ path: `${dir}/style${k}.png` }) }); await page.evaluate(({ x, y }) => G.tap(x, y), STY); await page.waitForTimeout(350); }
  const back = await page.evaluate(() => __S.sty); checks.A5_cycle = shots.map(s => s.sty).join() === '0,1,2' && back === 0;
  const bestRuns = async (png) => { let best = 0; const dark = (await d.pixels(br, png, [{ x: 16, y: 16 }], DPR))[0][0] < 128; for (let r = 72; r < 178; r += 3) { const pts = []; for (let a = 0; a < 720; a++) pts.push({ x: W / 2 + r * Math.sin(a / 720 * 6.2832), y: Math.round(H * .55) - r * Math.cos(a / 720 * 6.2832) }); const px = await d.pixels(br, png, pts, DPR), ink = px.map(c => dark ? c[0] + c[1] + c[2] > 24 : c[0] + c[1] + c[2] < 500); let runs = 0; ink.forEach((v, i) => { if (v && !ink[(i + 719) % 720]) runs++; }); if (runs > best) best = runs; } return best; };
  const runs0 = await bestRuns(shots[0].png), runs1 = await bestRuns(shots[1].png); checks.A5_72dots = lib.near(runs0, 72, 2); checks.A5_differ = !shots[0].png.equals(shots[1].png) && !shots[1].png.equals(shots[2].png); info.a5 = { runs0, runs1 };

  // A2: flick
  const pick = (i, how) => page.evaluate(async ({ i, how }) => { const c = { x: innerWidth / 2, y: innerHeight * (__S.view === 0 ? .55 : 0) + (__S.view === 0 ? 0 : innerHeight - 48) }, a = (-150 + i * 60) * Math.PI / 180, rad = 90; G.down(c.x, c.y); if (how === 'hold') { await G.frame(() => __S.pick, 900); } await G.to(c.x + rad * Math.cos(a), c.y + rad * Math.sin(a), { ms: how === 'hold' ? 120 : 70, steps: 6 }); await G.wait(30); const p = __S.pick && { ...__S.pick }; G.up(); await G.wait(650); return { p, view: __S.view, vt: __S.vt, run: __S.run }; }, { i, how });
  const v1 = await pick(1, 'flick'); await page.waitForTimeout(900); const f1 = await page.screenshot({ path: `${dir}/spectrogram1.png` }); await page.waitForTimeout(1200); const f2 = await page.screenshot({ path: `${dir}/spectrogram2.png` });
  checks.A2_flick = !!v1.p && v1.view === 1 && v1.run; const v2 = await pick(2, 'hold'); checks.A2_hold = !!v2.p && v2.view === 2 && v2.run; info.a2 = { v1, v2 };
  // A7: time scrolls, and the tone is a bright line at one place
  const lines = []; for (let x = 8; x < W - 8; x += 1) lines.push({ x, y: Math.round(H * .4) }); const rowA = await d.pixels(br, f2, lines, DPR), lumA = rowA.map(c => c[0] + c[1] + c[2]), maxL = Math.max(...lumA), bright = lumA.filter(v => v > maxL * .6).length;
  checks.A7_waterfall = !f1.equals(f2) && maxL > 100 && bright < W / 3; info.a7 = { maxL, bright };

  // A8 at −20 dBFS: −23 LUFS, peak −20, not green. Then a reset
  await page.waitForTimeout(3500);
  const a8 = await page.evaluate(() => ({ mom: __S.mom, sh: __S.sh, intg: __S.intg, pk: __S.pk, rms: __S.rms })); const pn = await d.panels(page), lp = await page.screenshot({ path: `${dir}/loud.png` });
  const rst = await page.evaluate(async () => { await G.tap(innerWidth / 2, 80); await G.wait(60); return { blocks: __S.kwBlocks.length, intg: __S.intg }; });
  checks.A8_values = lib.near(a8.mom, -23, .3) && lib.near(a8.sh, -23, .3) && lib.near(a8.intg, -23, .3) && lib.near(a8.pk, -20, .5) && lib.near(a8.rms, -23, .5); checks.A8_reset = rst.blocks < 3 && rst.intg === -70; info.a8 = { a8, pn, rst };
  const greenN = async (png) => { const pts = []; for (let y = 20; y < H - 80; y += 2) for (let x = 8; x < W - 8; x += 2) pts.push({ x, y }); const px = await d.pixels(br, png, pts, DPR); return px.filter(c => c[1] > c[0] + 70 && c[1] > c[2] + 20).length; };
  const g23 = await greenN(lp); await page.evaluate(async ({ x, y }) => { await G.tap(x, y); await G.wait(300); }, { x: W / 2, y: H - 48 }); const stopped = await page.evaluate(() => __S.run); await page.waitForTimeout(600); const w1 = await corner(); checks.A1_stops = !stopped && w1[0] > 230; await page.context().close();
  page = await go(`../out/${name}/m11.wav`);
  await page.evaluate(({ x, y }) => G.tap(x, y), CT); await page.waitForFunction(() => __S.run, null, { timeout: 5000 }); await pick(2, 'flick'); await page.waitForTimeout(4500); const hot = await page.evaluate(() => ({ intg: __S.intg, mom: __S.mom })); const hp = await page.screenshot({ path: `${dir}/loud-14.png` }), g14 = await greenN(hp);
  checks.A8_greenNear14 = lib.near(hot.intg, -14, 1) && g14 > g23 + 4; info.green = { hot, g23, g14 };
  const errors = d.clean(page); await br.close(); checks.noErrors = !errors.length;
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, info, errors });
};
