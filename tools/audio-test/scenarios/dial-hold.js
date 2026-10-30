/* The hub's two meanings part at 220 ms (Stage 0, the app's hold rule). From inside a tool, no drag, virtual clock
   (a loaded page's main thread can stall a real timer by hundreds of ms, which is what the boundary measures):
   1. pressed 205 ms -> still a tap: home. 2. held 240 ms -> the dial opened: release stays in the tool.
   3. pressed 100 ms but moved 12 px -> the dial opened on the move: release stays. */
module.exports = async (lib) => {
  const br = await lib.browser(); const dir = lib.outDir('dial-hold'); const H = lib.VIEW.height;
  const page = await lib.open(br, 'shell', { wait: 1200, clock: true });
  const fire = (type, x, y) => page.evaluate(([type, x, y]) => document.getElementById('hit').dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, pointerId: 1, isPrimary: true, pointerType: 'touch' })), [type, x, y]);
  const until = async (mode) => { for (let i = 0; i < 60; i++) { await page.clock.runFor(100); if (await page.evaluate((m) => __S.mode === m, mode)) return true; } return false; };
  const open = async () => { const s = await page.evaluate(() => __SAT(1)); await fire('pointerdown', s.x, s.y); await page.clock.runFor(60); await fire('pointerup', s.x, s.y); return until('tool'); };
  const press = async (ms, move = 0) => { await fire('pointerdown', 44, H - 44); if (move) { await page.clock.runFor(40); await fire('pointermove', 44 + move, H - 44); ms -= 40; }
    await page.clock.runFor(ms); const dWas = await page.evaluate(() => __S.dWas); await fire('pointerup', 44 + move, H - 44); return dWas; };
  const inTool = await open();
  const tapDial = await press(205), home = await until('home');
  await page.clock.runFor(800); await open();
  const heldDial = await press(240); await page.clock.runFor(800); const stayHold = await page.evaluate(() => __S.mode);
  const movedDial = await press(100, 12); await page.clock.runFor(800); const stayMove = await page.evaluate(() => __S.mode);
  const errors = page.errors.filter(e => !/service ?worker/i.test(e)); await page.context().close(); await br.close();
  const checks = { inTool, pressIsTap: !tapDial && home, holdOpensDial: heldDial && stayHold === 'tool', moveOpensDial: movedDial && stayMove === 'tool', noErrors: !errors.length };
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, tapDial, heldDial, movedDial, stayHold, stayMove, errors });
};
