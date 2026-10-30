/* Metronome session: beat count and accents survive leaving the tool. Real input: drag up from the centre for more
   beats, tap marks on the ring to cycle their accents, reload. Stored junk falls back to the default bar. */
module.exports = async (lib) => {
  const dir = lib.outDir('metro-session'); const W = lib.VIEW.width;
  const br = await lib.browser(); const steps = {}; let pass = true;
  const check = (k, ok, data) => { steps[k] = { ok: !!ok, ...data }; pass = pass && !!ok; };
  const page = await lib.open(br, 'metro', { wait: 800 }); const C = [W / 2, 226], R = 128;
  const st = () => page.evaluate(() => ({ N: __S.N, logN: +__S.logN.toFixed(4), st: Array.from(__S.st.slice(0, __S.N)), bpm: __S.bpm }));
  const fresh = await st();
  check('default', fresh.N === 4 && fresh.st.join() === '2,1,1,1', fresh);
  await page.mouse.move(...C); await page.mouse.down(); for (let i = 1; i <= 10; i++) { await page.mouse.move(C[0], C[1] - i * 7); await page.waitForTimeout(20); } await page.mouse.up(); await page.waitForTimeout(900);
  const a = await st(); check('dragged', a.N > 4, a);
  const mark = async (k) => { const f = 2 * Math.PI * k / a.N; await page.mouse.click(C[0] + R * Math.sin(f), C[1] - R * Math.cos(f)); await page.waitForTimeout(120); };
  await mark(1); await mark(2); await mark(2);
  const b = await st(); check('accents', b.st[1] === 2 && b.st[2] === 0, b);
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(800);
  const c = await st(); check('restored', c.N === b.N && c.st.join() === b.st.join() && lib.near(Math.exp(c.logN), c.N, .5), { before: b, after: c });
  await page.evaluate(() => AT.session.save('metro', { n: 9999, st: 'junk' })); await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(600);
  const d = await st(); check('junkIgnored', d.N === 4 && d.st.join() === '2,1,1,1', d);
  await page.evaluate(() => { localStorage.setItem('audio.session.metro', '{"n":5,"st":[0,9,"x",2]}'); }); await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(600);
  const e = await st(); check('badBeatsSkipped', e.N === 5 && e.st.join() === '0,1,1,2,1', e);
  const errors = page.errors.filter(x => !/serviceworker|service worker/i.test(x));
  check('noErrors', errors.length === 0, { errors });
  await br.close();
  return lib.result(dir, { pass, steps });
};
