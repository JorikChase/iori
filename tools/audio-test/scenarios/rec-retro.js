/* Recorder: retro capture from the real microphone — after the mic is live, hold the record dot and drag down ->
   a 'retro' take of the chosen length (capped by what has been heard) lands at the top of the stack. */
module.exports = async (lib) => {
  const dir = lib.outDir('rec-retro'); const W = lib.VIEW.width, H = lib.VIEW.height; const C = { x: W / 2, y: Math.round(H * .45) };
  const br = await lib.browser();
  const page = await lib.open(br, 'rec', { wav: 'bursts.wav', wait: 800 });
  await page.mouse.click(C.x, C.y); await page.waitForFunction(() => __S.rec === true, null, { timeout: 8000 });
  await page.waitForTimeout(500); await page.mouse.click(C.x, C.y);        // a short take, just to bring the mic up
  await page.waitForTimeout(4000);
  const heard = await page.evaluate(() => __S.rn / __S.ctx.sampleRate);
  await page.mouse.move(C.x, C.y); await page.mouse.down();
  for (let k = 1; k <= 8; k++) { await page.mouse.move(C.x, C.y + k * 20); await page.waitForTimeout(30); }
  await page.screenshot({ path: `${dir}/drag.png` });
  await page.mouse.up(); const heardAtRelease = await page.evaluate(() => __S.rn / __S.ctx.sampleRate);
  await page.waitForFunction(() => __S.takes.some(t => t.meta.kind === 'retro'), null, { timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(500);
  const got = await page.evaluate(() => __S.takes.map(t => ({ kind: t.meta.kind, dur: +t.meta.dur.toFixed(3) })));
  const errors = page.errors; await br.close();
  const r = got[0] || {};
  const checks = { retroTop: r.kind === 'retro', length: r.dur > heard - 0.1 && r.dur <= heardAtRelease + 0.01,   /* drag asked for >= 10 s: all that was heard */ recBelow: got.some(t => t.kind === 'rec'), noErrors: !errors.length };
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, heard, heardAtRelease, got, errors });
};
