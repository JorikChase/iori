/* Leaving the recorder mid-take must not lose it (Stage 0). Inside the shell, real clock, injected mic:
   1. record 3 s, tap the hub -> home; the take is in the library at about the length recorded.
   2. record again, switch to another tool on the hub dial path (AT.go) -> the take is in the library.
   3. standalone recorder: record 5 s, reload the page mid-take, as a crash or a killed page would -> reopening the
      recorder recovers what had reached the draft store, at most a few seconds short. */
const rows = (page) => page.evaluate(() => new Promise((res, rej) => { const r = indexedDB.open('audio'); r.onerror = () => rej(r.error);
  r.onsuccess = () => { const d = r.result, q = d.transaction(['meta'], 'readonly').objectStore('meta').getAll();
    q.onsuccess = () => { d.close(); res(q.result.map(m => ({ id: m.id, kind: m.kind, dur: m.dur, recovered: !!m.recovered })).sort((a, b) => b.dur - a.dur)); }; q.onerror = () => rej(q.error); }; }));
module.exports = async (lib) => {
  const br = await lib.browser(); const dir = lib.outDir('rec-leave'); const W = lib.VIEW.width, H = lib.VIEW.height;
  const C = { x: W / 2, y: Math.round(H * .45) };
  const page = await lib.open(br, 'shell', { wait: 1200, wav: 'bursts.wav' });
  const hit = (x, y, hold = 60) => page.evaluate(([x, y, hold]) => new Promise(res => { const h = document.getElementById('hit');
    const f = (t) => h.dispatchEvent(new PointerEvent(t, { clientX: x, clientY: y, bubbles: true, pointerId: 1, isPrimary: true, pointerType: 'touch' }));
    f('pointerdown'); setTimeout(() => { f('pointerup'); res(); }, hold); }), [x, y, hold]);
  const rec = () => page.frames().find(f => f.url().includes('/t/rec.html'));
  const openRec = async () => { const s = await page.evaluate(() => __SAT(7)); await hit(s.x, s.y);
    await page.waitForFunction(() => __S.mode === 'tool' && __S.tool === 7, null, { timeout: 8000 }); await page.waitForTimeout(400); };
  const record = async (ms) => { await page.mouse.click(C.x, C.y); await rec().waitForFunction(() => __S.rec, null, { timeout: 6000 }); await page.waitForTimeout(ms); };
  // 1. hub tap mid-take
  await openRec(); await record(3000);
  await hit(40, H - 40); await page.waitForFunction(() => __S.mode === 'home', null, { timeout: 12000 }); await page.waitForTimeout(300);
  const a = await rows(page);
  // 2. switching tools mid-take
  await openRec(); await record(2000);
  await rec().evaluate(() => AT.go('metro'));
  await page.waitForFunction(() => __S.mode === 'tool' && __S.tool !== 7, null, { timeout: 12000 }); await page.waitForTimeout(300);
  const b = await rows(page);
  await page.context().close();
  // 3. the page dies mid-take
  const p2 = await lib.open(br, 'rec', { wav: 'bursts.wav', wait: 800 });
  await p2.mouse.click(C.x, C.y); await p2.waitForFunction(() => __S.rec === true, null, { timeout: 8000 });
  await p2.waitForTimeout(5000); await p2.reload({ waitUntil: 'load' }); await p2.waitForTimeout(1500);
  const c = await rows(p2);
  const errors = page.errors.concat(p2.errors).filter(e => !/service ?worker/i.test(e)); await br.close();
  const checks = {
    hubKeepsTake: a.length === 1 && lib.near(a[0].dur, 3, .6),
    switchKeepsTake: b.length === 2 && b.some(t => lib.near(t.dur, 2, .6)),
    crashRecovers: c.length === 1 && c[0].dur > 2.5 && c[0].dur < 5.6 && c[0].recovered, noErrors: !errors.length };
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), checks, a, b, c, errors });
};
