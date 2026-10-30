/* iori's Safari already has the live app's /audio/sw.js, whose scope covers /audio/probe/. The first visit goes through
   it: the isolation headers must survive, the probe's own worker must take over, and the live worker must keep its cache */
const p = require('../probe-lib');
module.exports = async (lib) => {
  const br = await lib.browser(); const ctx = await p.context(br);
  const live = await ctx.newPage();
  await live.goto(`http://127.0.0.1:${lib.PORT}/audio/`, { waitUntil: 'load' });
  await live.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => {});
  const outer = await live.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration('/audio/'); return { scope: r && r.scope, ctl: !!navigator.serviceWorker.controller }; });
  await live.close();
  const page = await p.open(ctx);
  const first = await page.evaluate(() => ({ coi: crossOriginIsolated, ctl: navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL }));
  await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration('./')).active);
  await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__S && window.__S.ready);
  const second = await page.evaluate(async () => ({ coi: crossOriginIsolated, ctl: navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL, keys: await caches.keys(), regs: (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope) }));
  const pass = outer.ctl && first.coi && second.coi && /audio\/probe\/sw\.js/.test(second.ctl) && second.keys.some((k) => k.startsWith('audio-')) && second.keys.includes('probe-1') && !page.errors.length;
  const res = { pass, outer, first, second, errors: page.errors };
  await br.close(); return res;
};
