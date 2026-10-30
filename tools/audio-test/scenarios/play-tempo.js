/* Practice grid (Stage 0): a take's grid, snap and tempo readout come from that take alone. The shared tempo is 77 and
   unrelated to every take here, so any trace of 77 is the old bug.
   - a steady click reports about 120, the grid sits on the clicks, the tempo wheel opens on it, a loop snaps to half-beats
   - a sine, silence, noise and irregular bursts have no tempo: bpm 0, no wheel on the readout, a loop that does not snap */
module.exports = async (lib) => {
  const dir = lib.outDir('play-tempo'); const W = lib.VIEW.width, H = lib.VIEW.height;
  const br = await lib.browser(); const steps = {}; let pass = true;
  const check = (k, ok, data) => { steps[k] = { ok: !!ok, ...data }; pass = pass && !!ok; };
  const page = await lib.open(br, 'play', { wait: 600 });
  const ids = await page.evaluate(async () => { AT.setTempo(77, 'test'); const sr = 8000, out = {};
    const put = async (name, f, secs) => { const x = new Float32Array(sr * secs); f(x); out[name] = (await AT.takes.put({ name, kind: 'rec', sr, data: x })).id; await new Promise(r => setTimeout(r, 15)); };
    let seed = 7; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
    await put('sine', x => { for (let j = 0; j < x.length; j++) x[j] = Math.sin(j / 7) * .2; }, 12);
    await put('silence', x => {}, 12);
    await put('noise', x => { for (let j = 0; j < x.length; j++) x[j] = (rnd() - .5) * .4; }, 12);
    await put('irregular', x => { let j = 0; while (j < x.length) { const on = Math.floor(sr * (.08 + rnd() * .15)), off = Math.floor(sr * (.15 + rnd() * .55)); for (let i = 0; i < on && j + i < x.length; i++) x[j + i] = (rnd() - .5) * .6 * (1 - i / on); j += on + off; } }, 20);
    for (const n of ['click120', 'tempo100to130']) out[n] = (await AT.takes.import(new File([await (await fetch(`/tools/audio-test/signals/${n}.wav`)).blob()], n + '.wav'))).id;
    return out; });
  /* the page saves its own session as it leaves: this write has to land after that one */
  const show = async (id) => { await page.evaluate((id) => { const w = () => AT.session.save('play', { id }); addEventListener('pagehide', w); document.addEventListener('visibilitychange', w); }, id); await page.reload({ waitUntil: 'load' });
    const t0 = Date.now(); while (Date.now() - t0 < 8000) { if (await page.evaluate((id) => !!(__S.src && __S.src.id === id && __S.song), id)) break; await page.waitForTimeout(80); } await page.waitForTimeout(200); };
  const st = () => page.evaluate(() => ({ conf: __S.song ? +(__S.song.conf || 0).toFixed(3) : -1, bpm: __S.song ? __S.song.bpm : -1, b0: __S.song ? __S.song.b0 : -1, tempo: AT.tempo(), loop: __S.loop, wheel: !!__S.wheel }));
  const head = Math.round(H * .4), PPS = 42;
  /* hold on the waveform 77 px below the playhead (t = 1.833 s), drag 84 px further, release */
  const loop = async () => { await page.mouse.move(W / 2, head + 77); await page.mouse.down(); await page.waitForTimeout(420); for (let i = 1; i <= 6; i++) { await page.mouse.move(W / 2, head + 77 + 14 * i); await page.waitForTimeout(25); } await page.mouse.up(); await page.waitForTimeout(250); return (await st()).loop; };
  const off = (t, b0, g) => { const r = (t - b0) / g; return Math.abs(r - Math.round(r)) * g; };

  await show(ids.click120); let s = await st();
  check('clickTempo', lib.near(s.bpm, 120, .5) && (s.b0 % .5 < .03 || s.b0 % .5 > .47), s);
  await page.evaluate(() => AT.setTempo(140, 'test')); await page.waitForTimeout(120);
  check('sharedTempoIgnored', lib.near((await st()).bpm, 120, .5), await st());
  await page.mouse.click(W / 2 + 40, 80); await page.waitForTimeout(400);
  const w = await page.evaluate(() => { const h = Wheel.last; if (!h) return null; const c = h.state(); return { kind: __S.wheelK, item: h.o.columns[0].items[c.cols[0].idx], cancel: c.cancel }; });
  check('clickWheel', w && w.kind === 'tempo' && w.item === '120', w);
  if (w) { await page.mouse.click(w.cancel.x, w.cancel.y); await page.waitForTimeout(300); }
  const l = await loop();
  check('clickSnaps', l && off(l.a, s.b0, 30 / s.bpm) < .005 && off(l.b, s.b0, 30 / s.bpm) < .005, { loop: l, b0: s.b0 });

  for (const n of ['sine', 'silence', 'noise', 'irregular']) {
    await show(ids[n]); await page.evaluate(() => AT.setTempo(77, 'test')); s = await st();
    await page.mouse.click(W / 2 + 40, 80); await page.waitForTimeout(350); const opened = (await st()).wheel;
    if (opened) { const c = await page.evaluate(() => Wheel.last.state().cancel); await page.mouse.click(c.x, c.y); await page.waitForTimeout(300); }
    const lp = await loop();
    check(n, s.bpm === 0 && !opened && lp && lib.near(lp.a, 77 / PPS, .03) && lib.near(lp.b, 161 / PPS, .03), { bpm: s.bpm, conf: s.conf, b0: s.b0, opened, loop: lp });
  }
  await show(ids.tempo100to130); s = await st(); steps.tempoChange = { ok: true, note: 'informational: one estimate for a take whose tempo moves', bpm: s.bpm, conf: s.conf };

  const errors = page.errors.filter(e => !/serviceworker|service worker/i.test(e));
  check('noErrors', errors.length === 0, { errors });
  await br.close();
  return lib.result(dir, { pass, steps });
};
