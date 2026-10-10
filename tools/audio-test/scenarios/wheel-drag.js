/* Wheel picker (audio/wheel.js), press-drag-release mode, hosted by audio/lab.html.
   1. drag up 5 rows (5 × rowH px) on the minutes of 07:30 -> commits 07:35, five onChange calls (one per row)
   2. drag up 2.6 rows -> rounds to 3 rows: 07:33
   3. loop column wraps: minutes 57, drag up 3 rows -> 58, 59, 00
   4. one gesture across columns: start on minutes, slide sideways onto the hours, drag down 2 rows -> 05:30
   5. bounded column: drag far past the end -> clamps on the last row (rubber band, no wrap) */
const PORT = +(process.env.AT_PORT || 8794);
async function openLab(lib, br, q = '') {
  const ctx = await br.newContext(lib.ENGINE === 'webkit' ? { viewport: lib.VIEW, deviceScaleFactor: lib.DPR, hasTouch: true } : { viewport: lib.VIEW, deviceScaleFactor: lib.DPR, hasTouch: true, isMobile: true });
  const page = await ctx.newPage(); const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(`http://127.0.0.1:${PORT}/audio/lab.html${q}`, { waitUntil: 'load' }); await page.waitForTimeout(400); page.errors = errors; return page;
}
module.exports = async (lib) => {
  const dir = lib.outDir('wheel-drag' + (lib.ENGINE === 'webkit' ? '-webkit' : '')); const br = await lib.browser(); const page = await openLab(lib, br); const shots = [];
  const X = 320, Y = 470;   /* clear of the lab's home buttons */
  /* arm: the next pointerdown opens a drag-mode wheel with that event */
  const arm = (cfg) => page.evaluate((cfg) => {
    window.__ch = []; window.__done = 'pending';
    const two = (n) => Array.from({ length: n }, (_, i) => String(i).padStart(2, '0'));
    addEventListener('pointerdown', function f(e) { removeEventListener('pointerdown', f, true);
      const cols = cfg.bounded ? [{ items: two(10), index: cfg.m }] : [{ items: two(24), index: cfg.h, loop: true }, { items: two(60), index: cfg.m, loop: true }];
      window.__h = Wheel.open({ mode: 'drag', pointerEvent: e, column: cfg.col, columns: cols, separators: [':'],
        onChange: (ix) => __ch.push(ix.slice()), onDone: (ix) => { window.__done = ix; } }); }, true);
  }, cfg);
  const drag = async (path, steps = 12, shot) => {
    await page.mouse.move(X, Y); await page.mouse.down(); await page.waitForTimeout(60);
    let cx = X, cy = Y;
    for (const [dx, dy] of path) { for (let k = 1; k <= steps; k++) { await page.mouse.move(cx + dx * k / steps, cy + dy * k / steps); await page.waitForTimeout(16); } cx += dx; cy += dy; }
    await page.waitForTimeout(60); if (shot) { const f = `${dir}/${shot}.png`; await page.screenshot({ path: f }); shots.push(f); }
    await page.mouse.up(); await page.waitForTimeout(350);
    return page.evaluate(() => ({ done: window.__done, ch: window.__ch, st: __h.state() }));
  };
  const rowH = 44;
  await arm({ h: 7, m: 30, col: 1 }); const r1 = await drag([[0, -5 * rowH]], 12, '1-drag-5-rows');
  await arm({ h: 7, m: 30, col: 1 }); const r2 = await drag([[0, -2.6 * rowH]]);
  await arm({ h: 7, m: 57, col: 1 }); const r3 = await drag([[0, -3 * rowH]], 12, '3-wrap');
  await arm({ h: 7, m: 30, col: 1 });
  const r4 = await (async () => { /* sideways onto the hours column (column centres are 86 px apart at rowH 44), then down 2 rows */
    return drag([[-86, 0], [0, 2 * rowH]], 12, '4-across'); })();
  await arm({ m: 7, col: 0, bounded: true }); const r5 = await drag([[0, -9 * rowH]], 12, '5-rubber');
  await lib.sheet(br, shots, `${dir}/sheet.png`, 4, 180);
  const errors = page.errors; await br.close();
  const seq = (ch, c) => ch.map(v => v[c]);
  const checks = {
    fiveRows: JSON.stringify(r1.done) === '[7,35]' && r1.ch.length === 5 && JSON.stringify(seq(r1.ch, 1)) === '[31,32,33,34,35]',
    roundsPartial: JSON.stringify(r2.done) === '[7,33]',
    wraps: JSON.stringify(r3.done) === '[7,0]' && JSON.stringify(seq(r3.ch, 1)) === '[58,59,0]',
    acrossColumns: JSON.stringify(r4.done) === '[5,30]',
    boundedClamps: JSON.stringify(r5.done) === '[9]',
    closed: r1.st.dead && r5.st.dead,
    noErrors: !errors.length };
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, r1: r1.done, ch1: r1.ch, r2: r2.done, r3: r3.done, ch3: r3.ch, r4: r4.done, r5: r5.done, errors });
};
