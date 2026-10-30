/* Tuner T4, T5, measured on the drawn line: per row of pixels, where the ink sits and how wide it is.
   T4 in tune: straight; off pitch: coloured, bent · T5 silence: the line impossibly thin, not dimmed */
const fs = require('fs'), path = require('path'); const d = require('../drive');
module.exports = async (lib) => {
  const dir = lib.outDir('tuner-y-rows' + (lib.ENGINE === 'webkit' ? '-webkit' : '')), W = lib.VIEW.width, H = lib.VIEW.height, checks = {}, info = {}, DPR = lib.DPR;
  const sr = 48000, n = sr * 12, sil = Buffer.alloc(44 + n * 2); sil.write('RIFF', 0); sil.writeUInt32LE(36 + n * 2, 4); sil.write('WAVEfmt ', 8); sil.writeUInt32LE(16, 16); sil.writeUInt16LE(1, 20); sil.writeUInt16LE(1, 22); sil.writeUInt32LE(sr, 24); sil.writeUInt32LE(sr * 2, 28); sil.writeUInt16LE(2, 32); sil.writeUInt16LE(16, 34); sil.write('data', 36); sil.writeUInt32LE(n * 2, 40); fs.writeFileSync(path.join(dir, 'silence.wav'), sil);
  const br = await lib.browser(), name = path.basename(dir);
  const measure = async (wav, tag) => { const page = await lib.open(br, 'tuner', { wait: 500, wav }); await d.install(page, '#' + await page.evaluate(() => document.querySelector('canvas').parentElement.id)); await page.evaluate(({ x, y }) => G.tap(x, y), { x: W - 34, y: H - 34 }); await page.waitForFunction(() => __S.mic, null, { timeout: 6000 }).catch(() => {}); await page.waitForTimeout(2200);
    const st = await page.evaluate(() => ({ f: __S.f, cents: __S.cents, level: __S.level, mic: !!__S.mic })), png = await page.screenshot({ path: `${dir}/${tag}.png` }), pts = [], ys = []; for (let y = 200; y < H - 110; y += 12) { ys.push(y); for (let x = 20; x < W - 20; x += .5) pts.push({ x, y }); } const px = await d.pixels(br, png, pts, DPR), m = Math.round(pts.length / ys.length), bg = px[0], rows = [];
    let color = 0; for (let i = 0; i < ys.length; i++) { const r = px.slice(i * m, (i + 1) * m); let cov = 0, sx = 0, peak = 0; r.forEach((c, j) => { const v = Math.abs(c[0] + c[1] + c[2] - (bg[0] + bg[1] + bg[2])) / 765; cov += v; sx += v * j; if (v > peak) peak = v; if (Math.max(...c) - Math.min(...c) > 70 && Math.abs(c[0] - bg[0]) + Math.abs(c[1] - bg[1]) + Math.abs(c[2] - bg[2]) > 150) color++; }); rows.push({ w: cov / 2, x: cov ? 20 + sx / cov / 2 : 0, peak }); }
    await page.context().close(); const xs = rows.map(r => r.x).filter(Boolean), mean = xs.reduce((a, b) => a + b, 0) / (xs.length || 1); return { st, bend: +Math.max(...xs.map(x => Math.abs(x - mean))).toFixed(2), w: +(rows.reduce((a, r) => a + r.w, 0) / rows.length).toFixed(2), peak: +Math.max(...rows.map(r => r.peak)).toFixed(2), color }; };
  const ok = await measure('sine440.wav', 'in-tune'), off = await measure('dsharp3_plus20c.wav', 'off-pitch'), si = await measure(`../out/${name}/silence.wav`, 'silence');
  info.ok = ok; info.off = off; info.si = si;
  checks.T4_straightInTune = lib.near(ok.st.cents, 0, 2) && ok.bend < 2; checks.T4_offPitchStrips = lib.near(off.st.cents, 20, 3) && off.w > ok.w * 5 && off.color > 40;
  checks.T5_thin = si.st.mic && si.st.level === 0 && si.w < .6 && si.w < off.w * .05; info.t5 = 'peak ' + si.peak + ': the tool caps at DPR 2 and the line sits on a pixel boundary, 0.32 px over two pixels, so full ink cannot be told from dimmed here';
  await br.close();
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, info });
};
