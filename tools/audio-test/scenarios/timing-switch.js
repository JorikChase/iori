/* Tool to tool through the hub dial (real clock): open the tuner, hold the hub, drag out one dial step, rest so
   the next tool preloads, release. Measures release -> settled, checks the new tool is active, the old frame is
   unloaded and only one tool page remains loaded. */
module.exports = async (lib) => {
  const br = await lib.browser(); const dir = lib.outDir('timing-switch');
  const page = await lib.open(br, 'shell', { wait: 1200 });
  const fire = (type, x, y) => page.evaluate(([type, x, y]) => document.getElementById('hit').dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, pointerId: 1, isPrimary: true, pointerType: 'touch' })), [type, x, y]);
  const sat = await page.evaluate(() => __SAT(1));
  await fire('pointerdown', sat.x, sat.y); await page.waitForTimeout(60); await fire('pointerup', sat.x, sat.y);
  await page.waitForFunction(() => __S.mode === 'tool', null, { timeout: 8000 });
  const H = lib.VIEW.height, from = await page.evaluate(() => __S.tool);
  await fire('pointerdown', 44, H - 44); await page.waitForTimeout(250);            // dial opens (hold > 180 ms)
  for (let i = 1; i <= 8; i++) { await fire('pointermove', 44 + i * 10, H - 44 - i * 2); await page.waitForTimeout(16); }  // ~80 px out: one step
  await page.waitForTimeout(250);                                                     // rest: the picked tool preloads
  const pre = await page.evaluate(() => ({ pick: __S.pick, frames: [...document.querySelectorAll('iframe')].map(f => f.getAttribute('src')) }));
  const t = await page.evaluate(() => new Promise(res => { const t0 = performance.now();
    document.getElementById('hit').dispatchEvent(new PointerEvent('pointerup', { clientX: 124, clientY: innerHeight - 60, bubbles: true, pointerId: 1, isPrimary: true, pointerType: 'touch' }));
    (function f() { if (__S.mode === 'tool' && performance.now() - t0 > 50) res(Math.round(performance.now() - t0)); else if (performance.now() - t0 > 6000) res(-1); else requestAnimationFrame(f); })(); }));
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => ({ tool: __S.tool, frames: [...document.querySelectorAll('iframe')].map(f => f.getAttribute('src')) }));
  await page.screenshot({ path: `${dir}/after.png` });
  const errors = page.errors.filter(e => !/service ?worker/i.test(e));
  await page.context().close(); await br.close();
  const live = after.frames.filter(s => s && s !== 'about:blank');
  return lib.result(dir, { pass: t > 0 && t <= 820 && after.tool !== from && after.tool === pre.pick && live.length === 1 && !errors.length, from, pre, releaseToSettled: t, after, errors });
};
