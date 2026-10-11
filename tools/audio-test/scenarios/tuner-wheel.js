/* Tuner: the A4 reference control (top-right, the setup corner): a dot-matrix readout of the reference (default 440);
   TAP -> a wheel 415-466 Hz (tap mode). It moves the detection reference, persists (AT.session 'tuner') and restores.
   1. first open: A4 440; tapping the control opens the wheel and does NOT start the microphone
   2. the x cancels (unchanged); then spin to 432 and tap the band -> S.a4 432, session {a4:432}
   3. reload: 432 restored; a 432 Hz sine (generated here, fed as the microphone) reads A4 at 0 cents
   4. a 440 Hz sine against the restored 432 reads A4 at about +31.8 cents (1200·log2(440/432))
   5. a tap anywhere else still starts the microphone (step 3 does it from the centre) */
const fs = require('fs'); const path = require('path');
function wav(file, f0, sr, secs) { const n = sr * secs, b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40); for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(2 * Math.PI * f0 * i / sr) * .5 * 32767), 44 + 2 * i); fs.writeFileSync(file, b); }
module.exports = async (lib) => {
  const dir = lib.outDir('tuner-wheel' + (lib.ENGINE === 'webkit' ? '-webkit' : '')); const W = lib.VIEW.width, H = lib.VIEW.height;
  const sig = path.join(__dirname, '..', 'signals', '_sine432.wav'); wav(sig, 432, 48000, 10);
  const steps = {}; let pass = true; const shots = []; const errors = [];
  const check = (k, ok, data) => { steps[k] = { ok: !!ok, ...data }; pass = pass && !!ok; };
  const CTL = [W - 34, 34];
  const st = (pg) => pg.evaluate(() => { const w = Wheel.active(); return { a4: __S.a4, mic: __S.mic, req: __S.req, has: __S.has, note: __S.note, cents: +(__S.cents || 0).toFixed(2), f: +(__S.f || 0).toFixed(2),
    session: AT.session.load('tuner'), wheel: w ? { mode: w.mode, light: !!w.o.light, idx: w.indices(), n: w.cols[0].n, first: w.cols[0].items[0], last: w.cols[0].items[w.cols[0].n - 1], st: w.state() } : null }; });
  const shot = async (pg, n) => { const f = `${dir}/${n}.png`; await pg.screenshot({ path: f }); shots.push(f); };
  const br = await lib.browser();
  try {
    /* 1 */
    const page = await lib.open(br, 'tuner', { wait: 800, wav: '_sine432.wav' });
    const s0 = await st(page); await shot(page, '1-default-440');
    await page.mouse.click(...CTL); await page.waitForTimeout(500);
    const s1 = await st(page); await shot(page, '1-wheel-open');
    check('tapOpensNoMic', s0.a4 === 440 && s0.session === null && s1.wheel && s1.wheel.mode === 'tap' && !s1.wheel.light && s1.wheel.n === 52 && s1.wheel.first === '415' && s1.wheel.last === '466'
      && JSON.stringify(s1.wheel.idx) === '[25]' && s1.mic === 0 && !s1.req, { a4: s0.a4, wheel: s1.wheel && { idx: s1.wheel.idx, n: s1.wheel.n, rect: s1.wheel.st.rect }, mic: s1.mic, req: s1.req });
    /* 2 */
    await page.evaluate(() => Wheel.active().set(0, 30)); await page.waitForTimeout(500);
    await page.mouse.click(s1.wheel.st.cancel.x, s1.wheel.st.cancel.y); await page.waitForTimeout(400);
    const s2a = await st(page);
    await page.mouse.click(...CTL); await page.waitForTimeout(400);
    await page.evaluate(() => Wheel.active().set(0, 432 - 415)); await page.waitForTimeout(600);
    const w2 = (await st(page)).wheel; await shot(page, '2-432');
    await page.mouse.click(w2.st.cols[0].x, w2.st.bandY); await page.waitForTimeout(500);
    const s2 = await st(page);
    check('set432', s2a.a4 === 440 && s2a.session === null && !s2a.wheel && s2.a4 === 432 && s2.session && s2.session.a4 === 432 && !s2.wheel && s2.mic === 0,
      { afterCancel: s2a.a4, a4: s2.a4, session: s2.session, mic: s2.mic });
    await page.waitForTimeout(500); await shot(page, '2-readout-432');
    /* 3 */
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(800);
    const s3a = await st(page);
    await page.mouse.click(W / 2, H / 2); await page.waitForTimeout(3000);
    const s3 = await st(page); await shot(page, '3-432-sine-at-0c');
    check('restored432reads0c', s3a.a4 === 432 && s3.mic === 1 && s3.has && s3.note === 69 && lib.near(s3.cents, 0, 2.5) && lib.near(s3.f, 432, 1),
      { restored: s3a.a4, mic: s3.mic, note: s3.note, cents: s3.cents, f: s3.f });
    errors.push(...page.errors); await page.context().close();
    /* 4 */
    const p4 = await lib.open(br, 'tuner', { wait: 500, wav: 'sine440.wav' });
    await p4.evaluate(() => AT.session.save('tuner', { a4: 432 })); await p4.reload({ waitUntil: 'load' }); await p4.waitForTimeout(800);
    await p4.mouse.click(W / 2, H * .4); await p4.waitForTimeout(3000);
    const s4 = await st(p4); await shot(p4, '4-440-sine-vs-432');
    check('sine440vs432', s4.a4 === 432 && s4.has && s4.note === 69 && lib.near(s4.cents, 31.77, 3), { a4: s4.a4, note: s4.note, cents: s4.cents, f: s4.f });
    /* tapping the control while listening keeps the microphone on */
    await p4.mouse.click(...CTL); await p4.waitForTimeout(400); const s4b = await st(p4);
    await p4.keyboard.press('Escape'); await p4.waitForTimeout(300);
    check('controlKeepsMic', s4b.mic === 1 && s4b.wheel, { mic: s4b.mic });
    errors.push(...p4.errors); await p4.context().close();
  } finally { fs.unlinkSync(sig); }
  check('noErrors', errors.length === 0, { errors });
  await lib.sheet(br, shots, `${dir}/sheet.png`, 6, 160); await br.close();
  return lib.result(dir, { pass, steps });
};
