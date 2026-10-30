/* AT.storage() and the persist() answer (Stage 0): real numbers where the browser has them, nulls where it has not,
   never a rejection; the shell records its own answer in ATS.persisted. */
const TAKE = `AT.takes.put({ name: 'x', kind: 'rec', sr: 48000, data: new Float32Array(4800) })`;
const SM = `StorageManager.prototype`;
module.exports = async (lib) => {
  const br = await lib.browser(); const dir = lib.outDir('storage-report'); const errors = [];
  const fresh = async (tool, init) => { const p = await lib.open(br, tool); if (init) { await p.addInitScript(init); await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(300); } return p; };
  const done = async (p) => { errors.push(...p.errors.filter(e => !/service ?worker/i.test(e))); await p.context().close(); };
  // the real thing
  let p = await fresh('metro'); const real = await p.evaluate(() => AT.storage()); await done(p);
  // persist() says no, persisted() missing, estimate() rejects: the recorded answer stands in, the numbers go null
  p = await fresh('metro', `${SM}.persist = () => Promise.resolve(false); delete ${SM}.persisted; ${SM}.estimate = () => Promise.reject(new Error('no'));`);
  const denied = await p.evaluate(`${TAKE}.then(() => AT.storage())`); await done(p);
  p = await fresh('metro', `${SM}.persist = () => Promise.resolve(true); delete ${SM}.persisted;`);
  const before = await p.evaluate(() => AT.storage()), granted = await p.evaluate(`${TAKE}.then(() => AT.storage())`); await done(p);
  // no navigator.storage at all: nulls, and a take still saves
  p = await fresh('metro', `Object.defineProperty(navigator, 'storage', { value: undefined });`);
  const none = await p.evaluate(`${TAKE}.then((m) => AT.storage().then((s) => ({ s, saved: !!m.id })))`); await done(p);
  // the shell, installed
  const inst = `Object.defineProperty(navigator, 'standalone', { value: true }); `;
  p = await fresh('shell', inst + `${SM}.persist = () => Promise.resolve(true);`); const shellYes = await p.evaluate(() => ATS.persisted); await done(p);
  p = await fresh('shell', inst + `${SM}.persist = () => Promise.reject(new Error('no'));`); const shellNo = await p.evaluate(() => ATS.persisted); await done(p);
  p = await fresh('shell'); const shellIdle = await p.evaluate(() => ATS.persisted); await done(p);
  await br.close();
  const nulls = (s) => s.usage === null && s.quota === null;
  const checks = { real: typeof real.persisted === 'boolean' && real.usage >= 0 && real.quota > 0, deniedRecorded: denied.persisted === false && nulls(denied),
    grantedRecorded: before.persisted === null && granted.persisted === true && granted.quota > 0, unavailable: none.s.persisted === null && nulls(none.s) && none.saved,
    shellRecords: shellYes === true && shellNo === false && shellIdle === null, noErrors: !errors.length };
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, real, denied, before, granted, none, shellYes, shellNo, shellIdle, errors });
};
