/* Tuner against known pitches fed in as the microphone (T2, T3). note = MIDI number, cents = offset. */
module.exports = async (lib) => {
  const dir = lib.outDir('audio-tuner'); const cases = [
    { wav: 'sine440.wav', note: 69, cents: 0, hz: 440 },
    { wav: 'dsharp3_plus20c.wav', note: 51, cents: 20, hz: 157.4 },
  ];
  const out = []; const W = lib.VIEW.width, H = lib.VIEW.height; let pass = true;
  for (const c of cases) {
    const br = await lib.browser();
    const page = await lib.open(br, 'tuner', { wait: 800, wav: c.wav });
    await page.mouse.click(W - 34, H - 28);                                // mic dot (micP() in tuner.html)
    await page.waitForTimeout(3000);
    const s = await page.evaluate(() => ({ mic: __S.mic, micFail: __S.micFail, note: __S.note, cents: __S.cents, has: __S.has, p: __S.p }));
    await page.screenshot({ path: `${dir}/${c.wav.replace('.wav', '')}.png` });
    const ok = s.mic === 1 && s.has && s.note === c.note && lib.near(s.cents, c.cents, 4);
    pass = pass && ok; out.push({ ...c, got: s, ok, errors: page.errors });
    await page.context().close(); await br.close();
  }
  return lib.result(dir, { pass, cases: out });
};
