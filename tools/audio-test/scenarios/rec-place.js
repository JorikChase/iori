/* Recorder: hold a take strip ~220 ms -> three SDF buds bead off it (place, export, delete); slide to the place bud and
   release -> the take is queued in localStorage 'audio.place' and (outside the shell) the page navigates to edit.html.
   The take comes from a real file opened through the picker. */
module.exports = async (lib) => {
  const path = require('path');
  const dir = lib.outDir('rec-place'); const W = lib.VIEW.width, H = lib.VIEW.height; const takeY0 = Math.round(H * .45) + 84 + 44;
  const br = await lib.browser();
  const ctx = await br.newContext({ viewport: lib.VIEW, deviceScaleFactor: lib.DPR, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => {   // log every write to the placement queue into sessionStorage (survives the navigation)
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { if (k === 'audio.place' && this === window.localStorage) set.call(window.sessionStorage, '__placeLog', v); return set.call(this, k, v); };
  });
  const page = await ctx.newPage(); const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  const port = +(process.env.AT_PORT || 8794);
  await page.goto(`http://127.0.0.1:${port}/audio/t/rec.html`, { waitUntil: 'load' }); await page.waitForTimeout(800);
  const fc = page.waitForEvent('filechooser', { timeout: 5000 }); await page.waitForTimeout(150);   // let Playwright arm chooser interception first
  await page.mouse.click(W - 34, 34); const chooser = await fc;
  await chooser.setFiles(path.join(__dirname, '..', 'signals', 'click120.wav'));
  await page.waitForFunction(() => __S.takes.some(t => t.meta.kind === 'file'), null, { timeout: 8000 });
  await page.waitForTimeout(800);
  const id = await page.evaluate(() => __S.takes[0].key);
  const x0 = W / 2 + 20;
  await page.mouse.move(x0, takeY0); await page.mouse.down();
  await page.waitForTimeout(120);
  const early = await page.evaluate(() => ({ opened: !!(__S.press && __S.press.opened) }));
  await page.waitForTimeout(380);
  const open = await page.evaluate(() => ({ opened: !!(__S.press && __S.press.opened), n: __S.n, tgt: __S.tgt, icons: [...document.querySelectorAll('#rl i')].filter(e => e.style.visibility === 'visible').map(e => e.className.replace('ti ti-', '')) }));
  await page.screenshot({ path: `${dir}/buds.png` });
  const p = open.tgt[0];
  for (let k = 1; k <= 6; k++) await page.mouse.move(x0 + (p[0] - x0) * k / 6, takeY0 + (p[1] - takeY0) * k / 6);
  await page.waitForTimeout(250);
  const sel = await page.evaluate(() => __S.press && __S.press.sel);
  await page.screenshot({ path: `${dir}/buds-place-selected.png` });
  const nav = page.waitForURL(/\/edit\.html/, { timeout: 5000 }).then(() => true, () => false);
  await page.mouse.up();
  const navigated = await nav; await page.waitForTimeout(800);
  const log = await page.evaluate(() => sessionStorage.getItem('__placeLog'));
  let queued = []; try { queued = JSON.parse(log || '[]'); } catch (_) {}
  await page.screenshot({ path: `${dir}/edit-after-place.png` });
  await br.close();
  const recErrors = errors.filter(e => !/serviceworker|service worker/i.test(e));
  const checks = { notBeforeHold: !early.opened, budsOpen: open.opened && open.n === 3, budIcons: ['layout-columns', 'arrow-bar-to-down', 'trash'].every(n => open.icons.includes(n)),
    placeSelected: sel === 0, queued: queued.some(q => q.id === id), navigated };
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, id, open: { ...open, tgt: open.tgt.map(q => q.map(Math.round)) }, sel, queued, errors: recErrors });
};
