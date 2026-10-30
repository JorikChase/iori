/* Gate 3: isolation test, then a real offline launch from the probe's own service worker */
const p = require('../probe-lib');
module.exports = async (lib) => {
  const br = await lib.browser(); const ctx = await p.context(br);
  let page = await p.open(ctx);
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.ready.then(() => true));
  await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__S && window.__S.ready && navigator.serviceWorker.controller);
  await p.tap(page, 'Isolation and offline'); await p.view(page, 'iso');
  await p.tap(page, 'Run the isolation test'); await p.view(page, 'isoing'); await p.view(page, 'iso', 60000);
  const r = (await p.data(page)).iso[0];

  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__S && window.__S.ready, null, { timeout: 15000 });
  const l = (await p.data(page)).launches.slice(-1)[0];
  const text = await page.evaluate(() => window.__S.report());
  await ctx.setOffline(false);

  const n = r.nodes, live = (c) => c.before > 0.2 && c.after > 0.2 && c.gc2 > 0.2;
  const pass = r.done && r.coi && r.sabMain && r.sabWorklet && r.sabWorker && r.worklet && r.worklet.wmem === true && r.frame.ready && r.frame.coi && r.frame.addModule && r.noCoepFrame === 'refused'
    && live(n.frameAlive) && live(n.frameGoneHeld) && n.frameGoneHeld.reconnected > 0.2
    && l.net === false && l.coi && l.sab && l.sw.last.from === 'cache' && l.sw.last.coep === 'require-corp' && l.check.worklet && l.check.wasm && /offline .* from=cache/.test(text) && !page.errors.length;
  const res = { pass, iso: { sw: r.sabWorklet, frame: r.frame, noCoep: r.noCoepFrame, nodes: n, step: r.clockStepUs, err: r.error }, offline: l, errors: page.errors };
  await br.close(); return res;
};
