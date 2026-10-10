/* Wheel picker (audio/wheel.js), tap mode (persistent): confirm and cancel.
   1. open 07:30, tap the row just below the minutes band -> spins to 31; tap the centre band -> onDone [7,31]
   2. open, drag minutes up 2 rows (slow, no fling), tap the x above the corner -> onDone null (cancelled)
   3. open, drag hours down 1 row, tap outside the panel -> confirms [6,30]
   4. fix(): a bounded "hundreds" digit + loop digits set to 015 with range 20..300 bounces back to 020 when settled
   5. the panel stays clear of the hub corner (bottom-left 104 x 104) when anchored there */
const PORT = +(process.env.AT_PORT || 8794);
async function openLab(lib, br, q = '') {
  const ctx = await br.newContext(lib.ENGINE === 'webkit' ? { viewport: lib.VIEW, deviceScaleFactor: lib.DPR, hasTouch: true } : { viewport: lib.VIEW, deviceScaleFactor: lib.DPR, hasTouch: true, isMobile: true });
  const page = await ctx.newPage(); const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(`http://127.0.0.1:${PORT}/audio/lab.html${q}`, { waitUntil: 'load' }); await page.waitForTimeout(400); page.errors = errors; return page;
}
module.exports = async (lib) => {
  const dir = lib.outDir('wheel-tap' + (lib.ENGINE === 'webkit' ? '-webkit' : '')); const br = await lib.browser(); const page = await openLab(lib, br); const shots = [];
  const shot = async (n) => { const f = `${dir}/${n}.png`; await page.screenshot({ path: f }); shots.push(f); };
  const open = (o = {}) => page.evaluate((o) => {
    window.__ch = []; window.__done = 'pending';
    const two = (n) => Array.from({ length: n }, (_, i) => String(i).padStart(2, '0'));
    window.__h = Wheel.open({ mode: 'tap', anchor: o.anchor || { x: 195, y: 420 }, columns: [{ items: two(24), index: 7, loop: true }, { items: two(60), index: 30, loop: true }], separators: [':'],
      onChange: (ix) => __ch.push(ix.slice()), onDone: (ix) => { window.__done = ix; } });
    return __h.state();
  }, o);
  const slow = async (x, y, dy) => { await page.mouse.move(x, y); await page.mouse.down(); for (let k = 1; k <= 12; k++) { await page.mouse.move(x, y + dy * k / 12); await page.waitForTimeout(20); }
    await page.waitForTimeout(160); await page.mouse.up(); await page.waitForTimeout(400); };
  /* 1 */
  let st = await open(); await page.waitForTimeout(300); await shot('1-open-0730');
  const R = st.rowH * 5 / 2, A = 2 / 5;
  await page.mouse.click(st.cols[1].x, st.bandY + R * Math.sin(A)); await page.waitForTimeout(500);
  const afterRowTap = await page.evaluate(() => __h.state().cols[1].idx); await shot('1-row-tapped');
  await page.mouse.click(st.cols[1].x, st.bandY); await page.waitForTimeout(60); await shot('1-confirm-green'); await page.waitForTimeout(400);
  const r1 = await page.evaluate(() => ({ done: window.__done, dead: __h.state().dead, overlays: document.querySelectorAll('body > div[style*="2147483000"]').length }));
  /* 2 */
  st = await open(); await page.waitForTimeout(250); await slow(st.cols[1].x, st.bandY, -2 * st.rowH);
  const moved = await page.evaluate(() => __h.state().cols[1].idx);
  await page.mouse.click(st.cancel.x, st.cancel.y); await page.waitForTimeout(400);
  const r2 = await page.evaluate(() => ({ done: window.__done, dead: __h.state().dead }));
  /* 3 */
  st = await open(); await page.waitForTimeout(250); await slow(st.cols[0].x, st.bandY, st.rowH);
  await page.mouse.click(40, 120); await page.waitForTimeout(400);
  const r3 = await page.evaluate(() => window.__done);
  /* 4 */
  const r4 = await page.evaluate(() => new Promise((res) => {
    const D = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    const h = Wheel.open({ mode: 'tap', anchor: { x: 195, y: 420 }, columns: [{ items: ['0', '1', '2', '3'], index: 1 }, { items: D, index: 2, loop: true }, { items: D, index: 0, loop: true }],
      fix: (ix) => { const v = ix[0] * 100 + ix[1] * 10 + ix[2], c = Math.max(20, Math.min(300, v)); return c === v ? null : [Math.floor(c / 100), Math.floor(c / 10) % 10, c % 10]; } });
    setTimeout(() => { h.set(0, 0); h.set(1, 1); h.set(2, 5); }, 300);
    setTimeout(() => { const s = h.state(); h.close(false); res(s.cols.map(c => c.idx)); }, 2200);
  }));
  /* 5 */
  st = await open({ anchor: { x: 30, y: 800 } }); await page.waitForTimeout(300); await shot('5-corner');
  const rc = st.rect, vh = lib.VIEW.height, clear = !(rc.left < 104 && rc.top + rc.h > vh - 104);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  const r5 = await page.evaluate(() => window.__done);
  await lib.sheet(br, shots, `${dir}/sheet.png`, 5, 180);
  const errors = page.errors; await br.close();
  const checks = {
    rowTap: afterRowTap === 31, confirm: JSON.stringify(r1.done) === '[7,31]' && r1.dead && r1.overlays === 0,
    cancel: moved === 32 && r2.done === null && r2.dead,
    outsideConfirms: JSON.stringify(r3) === '[6,30]',
    fixBounces: JSON.stringify(r4) === '[0,2,0]',
    hubCornerClear: clear, escapeCancels: r5 === null,
    noErrors: !errors.length };
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, afterRowTap, r1, moved, r2, r3, r4, rect: rc, r5, errors });
};
