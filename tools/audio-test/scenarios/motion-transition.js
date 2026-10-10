/* The shell transition photographed: window.__SLOW stretches it 10x (3 s), frames at fixed fractions of the
   motion for enter (home -> tuner) and leave (tuner -> home). Visual check of the band, the wobble, the reveal
   and the collapse into the hub; the timing itself is measured by timing-transition. */
module.exports = async (lib) => {
  const br = await lib.browser(); const dir = lib.outDir('motion-transition'); const SLOW = 10, TD = 300 * SLOW;
  const page = await lib.open(br, 'shell', { wait: 1200 });
  await page.evaluate((s) => { window.__SLOW = s; }, SLOW);
  const tap = (kind) => page.evaluate((kind) => { const hit = document.getElementById('hit'); const p = kind === 'enter' ? __SAT(1) : { x: 40, y: innerHeight - 40 };
    const fire = (t) => hit.dispatchEvent(new PointerEvent(t, { clientX: p.x, clientY: p.y, bubbles: true, pointerId: 1, isPrimary: true, pointerType: 'touch' }));
    fire('pointerdown'); return new Promise(r => setTimeout(() => { fire('pointerup'); r(performance.now()); }, kind === 'enter' ? 400 : 60)); }, kind);  // enter: a long touch lets the frame load first; leave: a tap (a hold opens the hub dial)
  const files = []; const fr = [0.05, 0.15, 0.3, 0.5, 0.7, 0.9];
  for (const kind of ['enter', 'leave']) {
    const t0 = await tap(kind);
    for (const f of fr) {
      const wait = t0 + f * TD - await page.evaluate(() => performance.now()); if (wait > 0) await page.waitForTimeout(wait);
      const st = await page.evaluate(() => ({ m: __S.mode, wo: Math.round(__S.wo), wi: Math.round(__S.wi), wa: +__S.wa.toFixed(1) }));
      const file = `${dir}/${kind}-${String(Math.round(f * 100)).padStart(2, '0')}.png`; await page.screenshot({ path: file }); files.push(file);
    }
    await page.waitForTimeout(TD + 300);
    const end = `${dir}/${kind}-end.png`; await page.screenshot({ path: end }); files.push(end);
  }
  await lib.sheet(br, files, `${dir}/sheet.png`, 7, 150);
  const mode = await page.evaluate(() => __S.mode); await page.context().close(); await br.close();
  return lib.result(dir, { pass: mode === 'home', frames: files.length });
};
