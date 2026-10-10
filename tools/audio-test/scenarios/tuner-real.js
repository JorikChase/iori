/* Tuner, real audio only: no simulated pitch with the microphone off (the impossibly thin line, no note), a drag never
   changes a pitch, a tap anywhere starts listening, a refused microphone shows microphone-off and a tap retries. */
const DENY = `window.__GUM = 0; navigator.mediaDevices.getUserMedia = () => { window.__GUM++; return Promise.reject(new DOMException('denied', 'NotAllowedError')); };`;
module.exports = async (lib) => {
  const dir = lib.outDir('tuner-real'); const W = lib.VIEW.width, H = lib.VIEW.height; const shots = []; const out = {};
  const shot = async (page, name) => { const f = `${dir}/${name}.png`; const png = await page.screenshot({ path: f }); shots.push(f); return lib.lit(br, png); };
  const st = (page) => page.evaluate(() => ({ mic: __S.mic, micFail: __S.micFail, has: __S.has, note: __S.note, cents: +(__S.cents || 0).toFixed(2), f: +(__S.f || 0).toFixed(2),
    pres: +__S.pres.toFixed(4), level: +__S.level.toFixed(4), p: __S.p, icon: document.getElementById('tmi').className.replace('ti ti-', '') }));
  const drag = async (page) => { await page.mouse.move(W * .3, H * .6); await page.mouse.down();
    for (let i = 1; i <= 12; i++) { await page.mouse.move(W * .3 + i * 15, H * .6 - i * 25); await page.waitForTimeout(30); } await page.mouse.up(); };
  const br = await lib.browser();

  /* 1. first open, no tap: silence. Sampled for 2 s: nothing detected, no note, presence 0, no p field at all */
  {
    const page = await lib.open(br, 'tuner', { wait: 600 });
    const samples = []; for (let i = 0; i < 10; i++) { samples.push(await st(page)); await page.waitForTimeout(200); }
    const lit = await shot(page, '1-first-open-thin-line');
    const ok = samples.every(s => s.mic === 0 && !s.has && s.note === -1 && s.pres === 0 && s.f === 0 && s.p === undefined && s.icon === 'microphone');
    out.firstOpen = { ok, first: samples[0], last: samples[9], lit, errors: page.errors };
    await page.context().close();
  }

  /* 2. microphone refused: a tap anywhere asks, fails, shows microphone-off; a drag asks again (retry) but moves nothing */
  {
    const page = await lib.open(br, 'tuner', { wait: 300 });
    await page.addInitScript(DENY); await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(500);
    await page.mouse.click(W / 2, H / 2); await page.waitForTimeout(600);
    const s1 = await st(page); const g1 = await page.evaluate(() => __GUM); const lit = await shot(page, '2-refused');
    await page.mouse.click(W * .2, H * .3); await page.waitForTimeout(600);            // retry from anywhere
    const g2 = await page.evaluate(() => __GUM);
    await drag(page); await page.waitForTimeout(800); const s3 = await st(page);
    const ok = s1.micFail && s1.mic === 0 && s1.icon === 'microphone-off' && !s1.has && s1.note === -1 && g1 === 1 && g2 === 2 &&
      s3.micFail && !s3.has && s3.note === -1 && s3.pres === 0;
    out.refused = { ok, afterTap: s1, gumCalls: [g1, g2], afterDrag: s3, lit, errors: page.errors };
    await page.context().close();
  }

  /* 3. a tap anywhere (not the mic dot) starts listening: A4 from the microphone; a drag then changes nothing */
  {
    const page = await lib.open(br, 'tuner', { wait: 600, wav: 'sine440.wav' });
    const s0 = await st(page);
    await page.mouse.click(W * .3, H * .45); await page.waitForTimeout(3000);
    const s1 = await st(page); await shot(page, '3-tap-anywhere-A4');
    await drag(page); await page.waitForTimeout(400); const s2 = await st(page); await shot(page, '4-after-drag-A4');
    await page.mouse.click(W / 2, H / 2); await page.waitForTimeout(300); const s3 = await st(page);   // a tap while running does not stop it
    await page.mouse.click(W - 34, H - 28); await page.waitForTimeout(1500); const s4 = await st(page);  // the mic dot stops it
    const lit = await shot(page, '5-mic-dot-stopped');
    const ok = s0.mic === 0 && s1.mic === 1 && s1.has && s1.note === 69 && lib.near(s1.cents, 0, 4) &&
      s2.mic === 1 && s2.note === 69 && lib.near(s2.cents, 0, 4) && lib.near(s2.f, 440, 2) && s3.mic === 1 && s4.mic === 0 && !s4.has;
    out.tapAnywhere = { ok, before: s0, running: s1, afterDrag: s2, tapWhileRunning: s3, afterMicDot: s4, litStopped: lit, errors: page.errors };
    await page.context().close();
  }

  await lib.sheet(br, shots, `${dir}/sheet.png`, 5, 170); await br.close();
  const pass = out.firstOpen.ok && out.refused.ok && out.tapAnywhere.ok && ![out.firstOpen, out.refused, out.tapAnywhere].some(o => o.errors.length);
  return lib.result(dir, { pass, ...out, shots });
};
