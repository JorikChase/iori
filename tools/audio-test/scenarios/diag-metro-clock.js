/* Diagnostic: how the metronome's inversion advances under the real clock and under the virtual clock,
   sampling the tool's own state (flash, inv) instead of screenshots. Also records resting inv vs. frame brightness. */
module.exports = async (lib) => {
  const br = await lib.browser(); const dir = lib.outDir('diag-metro-clock'); const W = lib.VIEW.width, H = lib.VIEW.height;
  // real clock: sample every 10 ms for 650 ms after the tap
  let page = await lib.open(br, 'metro', { wait: 800 });
  const restLit = await lib.lit(br, await page.screenshot({ path: `${dir}/rest.png` }));
  const restInv = await page.evaluate(() => __S.inv);
  const real = await page.evaluate(() => new Promise(res => { const out = []; const t0 = performance.now();
    document.querySelector('canvas').dispatchEvent(new PointerEvent('pointerdown', { clientX: innerWidth / 2, clientY: innerHeight - 34, bubbles: true, pointerId: 1, isPrimary: true }));
    const id = setInterval(() => { const t = performance.now() - t0; out.push([Math.round(t), __S.flash, +__S.inv.toFixed(2), __S.run ? 1 : 0]); if (t > 650) { clearInterval(id); res(out); } }, 10); }));
  const runLit = await lib.lit(br, await page.screenshot({ path: `${dir}/running.png` }));
  await page.context().close();
  // virtual clock: step 20 ms at a time, reading performance.now() and the state
  page = await lib.open(br, 'metro', { clock: true, wait: 800 });
  await page.mouse.click(W / 2, H - 34);
  const virt = []; for (let t = 0; t <= 480; t += 20) { if (t) await page.clock.runFor(20); virt.push(await page.evaluate(() => [Math.round(performance.now()), __S.flash, +__S.inv.toFixed(2), __S.tr ? Math.round(performance.now() - __S.tr.t0) : null])); }
  await page.context().close(); await br.close();
  return lib.result(dir, { pass: true, restInv, restLit, runLit, real: real.filter((_, i) => i % 2 === 0), virt });
};
