/* Editor shelf: the open-file bud opens the system picker; the chosen file (signals/bursts.wav, 30 s) is imported into
   the library and lands at the playhead. A second visit to the shelf shows it as take 1, and tapping take 1 places
   another copy of it (first free track). */
const path = require('path');
module.exports = async (lib) => {
  const br = await lib.browser(); const dir = lib.outDir('edit-file'); const shots = []; const W = lib.VIEW.width, H = lib.VIEW.height;
  const page = await lib.open(br, 'edit', { wait: 900 });
  const shot = async (n) => { const f = `${dir}/${n}.png`; await page.screenshot({ path: f }); shots.push(f); };
  const BEAT = await page.evaluate(() => __E.BEAT);
  const checks = {}; const info = {};
  await page.mouse.click(W * 0.3, 66 + 2 * BEAT * 30 + 1); await page.waitForTimeout(300);          // playhead at beat 3
  const shelf = async () => { await page.mouse.click(W - 34, H - 30); await page.waitForTimeout(350); await page.mouse.click(W - 94, H - 30); await page.waitForTimeout(700); };
  // listen first: Playwright turns file-chooser interception on asynchronously when the first listener is added
  const fcP = page.waitForEvent('filechooser', { timeout: 8000 }); await page.waitForTimeout(300);
  await shelf();
  await page.mouse.click(W - 34, H - 144);
  const fc = await fcP; await fc.setFiles(path.join(__dirname, '..', 'signals', 'bursts.wav'));
  await page.waitForFunction(() => __D.clips.length === 1 && __E.slots()[0] && __E.slots()[0].loaded, null, { timeout: 8000 });
  await page.waitForTimeout(500);
  const d1 = await page.evaluate(async () => ({ clips: __D.clips.map(c => ({ k: c.k, t: c.t, s: c.s, d: c.d })), shelf: __S.shelf, lib: await AT.takes.list() }));
  info.afterFile = { clips: d1.clips, lib: d1.lib.map(m => ({ id: m.id, name: m.name, kind: m.kind, dur: m.dur })) };
  const c = d1.clips[0], m = d1.lib[0];
  checks.fileImported = d1.lib.length === 1 && m.kind === 'file' && m.name === 'bursts' && lib.near(m.dur, 30, 0.01);
  checks.fileAtPlayhead = !!c && c.k === m.id && c.t === 0 && lib.near(c.s, 2 * BEAT, 1e-3) && lib.near(c.d, 30, 0.01);
  checks.shelfClosed = d1.shelf === false;
  await shot('file-placed');
  await shelf();
  const s2 = await page.evaluate(() => ({ takes: __S.shelfTakes.map(t => t.id),
    buds: [...document.querySelectorAll('#el i')].filter(i => i.style.visibility === 'visible').map(i => i.className.replace('ti ti-', '')) }));
  await shot('shelf-with-take');
  info.shelf = s2;
  checks.shelfListsTake = s2.takes.length === 1 && s2.takes[0] === m.id && s2.buds.includes('number-1') && s2.buds.includes('file-music');
  await page.mouse.click(W - 34 - 46, H - 144); await page.waitForTimeout(600);                    // take 1
  const d2 = await page.evaluate(() => __D.clips.map(c => ({ k: c.k, t: c.t, s: c.s, d: c.d })));
  info.afterShelfTake = d2;
  checks.shelfTakePlaced = d2.length === 2 && d2[1].k === m.id && d2[1].t === 1 && lib.near(d2[1].s, 2 * BEAT, 1e-3);
  await shot('two-copies');
  const errors = page.errors.filter(e => !/serviceworker|service worker/i.test(e));
  checks.noErrors = errors.length === 0;
  await page.context().close();
  await lib.sheet(br, shots, `${dir}/sheet.png`, 3, 220); await br.close();
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, info, errors });
};
