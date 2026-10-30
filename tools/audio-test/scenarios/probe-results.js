/* Results keep across a reload and come out as one block; Clear asks twice. The page has no scripts refused and no
   horizontal scroll at phone width */
const p = require('../probe-lib');
module.exports = async (lib) => {
  const br = await lib.browser(); const ctx = await p.context(br);
  const page = await p.open(ctx);
  await page.getByPlaceholder('Device').fill('Rig phone');
  await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__S && window.__S.ready);
  const kept = await page.getByPlaceholder('Device').inputValue();
  const wide = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  const coi = await page.evaluate(() => crossOriginIsolated);
  await p.tap(page, 'Copy results'); await p.view(page, 'results');
  const text = await page.locator('textarea').inputValue();
  await p.tap(page, 'Clear all results'); const left = (await p.data(page)).device;
  await p.tap(page, 'Tap again'); await p.view(page, 'home');
  const gone = (await p.data(page)).device;
  const pass = kept === 'Rig phone' && wide && coi && text.includes('device: Rig phone') && text.includes('GATE 4') && text.endsWith('END') && left === 'Rig phone' && gone === '' && !page.errors.length;
  const res = { pass, kept, wide, coi, head: text.split('\n').slice(0, 4), errors: page.errors };
  await br.close(); return res;
};
