/* Recorder: the top-right dot opens a file (system picker) -> it appears in the takes stack as a 'file' take,
   with the decoded length of the file; tapping it plays the real file. */
module.exports = async (lib) => {
  const path = require('path');
  const dir = lib.outDir('rec-file'); const W = lib.VIEW.width, H = lib.VIEW.height; const takeY0 = Math.round(H * .45) + 84 + 44;
  const br = await lib.browser();
  const page = await lib.open(br, 'rec', { wait: 800 });
  const before = await page.evaluate(() => __S.takes.length);
  const fc = page.waitForEvent('filechooser', { timeout: 5000 }); await page.waitForTimeout(150);   // let Playwright arm chooser interception first
  await page.mouse.click(W - 34, 34); const chooser = await fc;
  await chooser.setFiles(path.join(__dirname, '..', 'signals', 'sine440.wav'));
  await page.waitForFunction(() => __S.takes.some(t => t.meta.kind === 'file'), null, { timeout: 8000 });
  await page.waitForTimeout(700);
  const got = await page.evaluate(() => { const t = __S.takes[0]; return { kind: t.meta.kind, name: t.meta.name, dur: t.meta.dur, sr: t.meta.sr }; });
  const fileDur = await page.evaluate(async () => { const b = await (await fetch('/tools/audio-test/signals/sine440.wav')).arrayBuffer(); const v = new DataView(b); return v.getUint32(40, true) / (v.getUint32(28, true)); });
  await page.mouse.click(W / 2, takeY0);                                        // tap the strip: play
  await page.waitForFunction(() => !!__S.play, null, { timeout: 4000 }).catch(() => {});
  const playing = await page.evaluate(() => !!__S.play && __S.play.t === __S.takes[0]);
  await page.waitForTimeout(300); await page.screenshot({ path: `${dir}/file-take.png` });
  const errors = page.errors; await br.close();
  const checks = { appeared: got.kind === 'file' && got.name === 'sine440', length: lib.near(got.dur, fileDur, 0.05), plays: playing, noErrors: !errors.length };
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, before, got, fileDur, errors });
};
