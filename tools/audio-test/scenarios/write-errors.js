/* AT.onError (Stage 0): every failed write reports {what, error}, the caller still gets its rejection, a throwing
   subscriber stops nobody, another open frame hears it, and writes that work report nothing. */
module.exports = async (lib) => {
  const br = await lib.browser(); const dir = lib.outDir('write-errors');
  const page = await lib.open(br, 'metro');
  const other = await page.context().newPage(); await other.goto(page.url(), { waitUntil: 'load' });
  await other.evaluate(() => { window.__E = []; AT.onError(v => __E.push([v.what, v.error && v.error.name])); });
  const r = await page.evaluate(async () => {
    const out = {}, E = []; AT.onError(() => { throw new Error('a bad subscriber'); }); AT.onError(v => E.push([v.what, v.error && v.error.name]));
    const data = new Float32Array(4800), take = () => AT.takes.put({ name: 'x', kind: 'rec', sr: 48000, data }), draft = () => AT.takes.draft.add('d', 0, { sr: 48000, name: 'x', created: 1, data });
    const P = IDBObjectStore.prototype, real = { put: P.put, delete: P.delete }, set = Storage.prototype.setItem;
    const quota = () => new DOMException('full', 'QuotaExceededError'), caught = (p) => p.then(() => 'resolved', e => (e && e.name) || String(e));
    // nothing wrong, nothing reported
    const m = await take(); await draft(); await AT.takes.draft.end('d'); AT.session.save('t', { a: 1 }); out.clean = E.length;
    // the store refuses at once, as a quota error thrown from put
    P.put = function () { throw quota(); }; P.delete = function () { throw quota(); };
    out.put = await caught(take()); out.add = await caught(draft()); out.del = await caught(AT.takes.del(m.id)); out.end = await caught(AT.takes.draft.end('d'));
    // the transaction aborts afterwards, as a quota error at commit does
    P.put = function () { this.transaction.abort(); }; out.abort = await caught(draft().then(() => 'x', () => { throw new Error('aborted'); }));
    P.put = real.put; P.delete = real.delete;
    // a take that cannot be packed rejects rather than throwing at the caller
    try { out.pack = await caught(AT.takes.put({ sr: 48000 })); } catch (e) { out.pack = 'threw'; }
    // sessions: a full localStorage, and an object that will not serialise
    Storage.prototype.setItem = function () { throw quota(); }; AT.session.save('t', { a: 2 }); Storage.prototype.setItem = set;
    const loop = {}; loop.self = loop; AT.session.save('t', loop);
    // recovered: everything writes again and reports nothing
    const n = E.length; await take(); await draft(); await AT.takes.draft.end('d'); AT.session.save('t', { a: 3 }); out.after = E.length - n;
    out.session = AT.session.load('t'); out.E = E; return out; });
  await other.waitForFunction(() => __E.length >= 7, null, { timeout: 3000 }).catch(() => {});
  const heard = await other.evaluate(() => __E);
  const errors = page.errors.filter(e => !/service ?worker/i.test(e)); await page.context().close(); await br.close();
  const whats = r.E.map(e => e[0]);
  const checks = { cleanIsSilent: r.clean === 0 && r.after === 0 && r.session.a === 3, callersReject: ['put', 'add', 'del', 'end'].every(k => r[k] === 'QuotaExceededError') && r.abort === 'Error' && r.pack !== 'resolved' && r.pack !== 'threw',
    allReported: JSON.stringify(whats) === JSON.stringify(['takes.put', 'draft.add', 'takes.del', 'draft.end', 'draft.add', 'takes.put', 'session.save', 'session.save']),
    errorCarried: r.E[0][1] === 'QuotaExceededError', otherFrameHears: heard.length === whats.length && heard[0][0] === 'takes.put' && heard[0][1] === 'QuotaExceededError', noErrors: !errors.length };
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, r, heard, errors });
};
