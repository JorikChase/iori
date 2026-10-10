/* Hub dial reaches every other tool on one axis (owner, 2026-10-10): from inside a tool, hold the hub and drag
   sideways -> steps forward through all 7 others; drag upward -> steps back through all 7. Release switches. */
module.exports = async (lib) => {
  const br = await lib.browser(); const dir = lib.outDir('dial-reach'); const W = lib.VIEW.width, H = lib.VIEW.height;
  const page = await lib.open(br, 'shell', { wait: 1200 });
  const fire = (type, x, y) => page.evaluate(([type, x, y]) => document.getElementById('hit').dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, pointerId: 1, isPrimary: true, pointerType: 'touch' })), [type, x, y]);
  const open = async (i) => { const s = await page.evaluate((i) => __SAT(i), i); await fire('pointerdown', s.x, s.y); await page.waitForTimeout(60); await fire('pointerup', s.x, s.y); await page.waitForFunction((i) => __S.mode === 'tool' && __S.tool === i, i, { timeout: 8000 }); await page.waitForTimeout(500); };
  await open(0);
  const hub = { x: 44, y: H - 44 };
  const sweep = async (dx, dy, n) => { await fire('pointerdown', hub.x, hub.y); await page.waitForTimeout(250); const picks = [];
    for (let i = 1; i <= n; i++) { await fire('pointermove', hub.x + dx * i, hub.y - dy * i); await page.waitForTimeout(20); picks.push(await page.evaluate(() => __S.pick)); } return picks; };
  const side = await sweep(8, 0, 42);                 // up to ~336 px sideways
  const sideSet = [...new Set(side)];
  await page.screenshot({ path: `${dir}/side-end.png` });
  await fire('pointermove', hub.x, hub.y - 2); await page.waitForTimeout(30); await fire('pointerup', hub.x, hub.y - 2);   // back to start: no switch
  await page.waitForTimeout(400); const stillEdit = await page.evaluate(() => __S.tool);
  const up = await sweep(0, 12, 50);                  // up to 600 px upward
  const upSet = [...new Set(up)];
  await page.screenshot({ path: `${dir}/up-end.png` });
  const lastUp = up[up.length - 1];
  await fire('pointerup', hub.x, hub.y - 600); await page.waitForFunction((t) => __S.mode === 'tool' && __S.tool === t, lastUp, { timeout: 8000 }).catch(() => {});
  const switched = await page.evaluate(() => __S.tool);
  const errors = page.errors.filter(e => !/service ?worker/i.test(e)); await page.context().close(); await br.close();
  const fwd = [0, 1, 2, 3, 4, 5, 6, 7], back = [0, 7, 6, 5, 4, 3, 2, 1];
  const checks = { sidewaysReachesAll: JSON.stringify(sideSet) === JSON.stringify(fwd), upwardReachesAll: JSON.stringify(upSet) === JSON.stringify(back),
    returnToStartNoSwitch: stillEdit === 0, releaseSwitches: switched === lastUp && lastUp === 1, noErrors: !errors.length };
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, sideSet, upSet, switched, errors });
};
