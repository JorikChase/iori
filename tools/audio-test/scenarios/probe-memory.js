/* Gate 4: a clean finish, then both kinds of failure: the page reloads mid-step (the mark is read on return) and a
   results block that outlives it */
const p = require('../probe-lib');
module.exports = async (lib) => {
  const br = await lib.browser(); const ctx = await p.context(br);
  const page = await p.open(ctx, '?quick');
  await p.tap(page, 'Memory ceiling'); await p.view(page, 'mem');
  await p.tap(page, 'Typed arrays'); await p.view(page, 'memming'); await p.view(page, 'mem', 60000);
  await p.tap(page, 'WASM memory'); await p.view(page, 'memming'); await p.view(page, 'mem', 60000);
  const clean = (await p.data(page)).mem;

  await page.goto(p.BASE() + '?memsim=300', { waitUntil: 'load' }); await page.waitForFunction(() => window.__S && window.__S.ready);
  await p.tap(page, 'Memory ceiling'); await p.view(page, 'mem');
  await p.tap(page, 'Typed arrays');
  await page.waitForFunction(() => window.__S && window.__S.ready && window.__S.R.mem.length === 3, null, { timeout: 30000 });
  const m = (await p.data(page)).mem[2];
  // the mark is gone, so a second load must not count the same crash twice
  await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__S && window.__S.ready);
  const again = (await p.data(page)).mem.length;
  const text = await page.evaluate(() => window.__S.report());
  const pass = clean.length === 2 && clean.every((c) => c.lastSafeMB === 300) && m.lastSafeMB === 200 && m.failedAtMB === 300 && m.how === 'page was killed' && m.steps.length === 2 && again === 3 && text.includes('last safe 200 MB') && !page.errors.length;
  const res = { pass, clean: clean.map((c) => [c.kind, c.lastSafeMB, c.how, c.wasmMax, c.steps]), killed: m, again, errors: page.errors };
  await br.close(); return res;
};
