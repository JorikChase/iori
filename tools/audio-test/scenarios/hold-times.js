/* The app's timings (MATRIX timing table, PLAN Stage 0): 220 ms for the other meaning of a spot, 350 ms for a wheel, 300 ms
   for a double tap. A hold is measured in the page from the pointerdown's timestamp to the first frame showing its effect, five times,
   and the fastest counts: a slow frame can only make a press look longer. The double tap uses events with exact
   timestamps, so the window is tested at 280 and 320 ms without any scheduling jitter. */
module.exports = async (lib) => {
  const dir = lib.outDir('hold-times'); const W = lib.VIEW.width, H = lib.VIEW.height;
  const br = await lib.browser(); const steps = {}; let pass = true;
  const check = (k, ok, data) => { steps[k] = { ok: !!ok, ...data }; pass = pass && !!ok; };
  const seed = async (pg, key) => { const id = await pg.evaluate(async () => (await AT.takes.import(new File([await (await fetch('/tools/audio-test/signals/click120.wav')).blob()], 'click120.wav'))).id);
    await pg.evaluate(([k, id]) => AT.session.save(k, { id }), [key, id]); await pg.reload({ waitUntil: 'load' }); await pg.waitForTimeout(600); };
  /* fn: the page expression that turns true when the hold has fired */
  const measure = async (pg, xy, fn, n = 5) => { const out = [];
    for (let i = 0; i < n; i++) { await pg.evaluate((fn) => { window.__H = null; const f = new Function('return ' + fn); let t0 = 0; const d = (e) => { t0 = e.timeStamp; }; addEventListener('pointerdown', d, { capture: true, once: true });
        const L = () => { if (t0 && f()) { window.__H = performance.now() - t0; return; } if (performance.now() - (t0 || performance.now()) < 900) requestAnimationFrame(L); }; requestAnimationFrame(L); }, fn);
      await pg.mouse.move(...xy); await pg.mouse.down(); await pg.waitForTimeout(500); out.push(await pg.evaluate(() => window.__H)); await pg.mouse.up(); await pg.waitForTimeout(200); }
    const ok = out.filter(v => v != null); return { min: ok.length ? Math.round(Math.min(...ok)) : null, all: out.map(v => v == null ? null : Math.round(v)) }; };
  /* one WebGL page at a time: several in software GL starve each other's frames */
  const done = (pg) => pg.context().close();
  const range = (m, lo, hi) => m.min != null && m.min >= lo && m.min < hi;

  const ana = await lib.open(br, 'ana', { wait: 800 });
  const a = await measure(ana, [W / 2, Math.round(H * .55)], '!!__S.pick');
  check('ana220', range(a, 214, 255), a); await done(ana);

  const play = await lib.open(br, 'play', { wait: 600 }); await seed(play, 'play');
  await play.waitForFunction(() => !!__S.song, null, { timeout: 8000 });
  const p = await measure(play, [W / 2, Math.round(H * .4) + 60], '!!(__S.press&&__S.press.mode==="loop")');
  check('play220', range(p, 214, 255), p); await done(play);

  const bpm = await lib.open(br, 'bpm', { wait: 800 });
  const f = await measure(bpm, [34 + 2 * (W - 68) / 3, H - 28], '!!(__S.mp&&__S.mp.open)');
  check('bpmFan220', range(f, 214, 255), f); await done(bpm);

  const metro = await lib.open(br, 'metro', { wait: 800 });
  const m = await measure(metro, [W / 2, 226], '!!Wheel.active()', 1);
  check('metroWheel350', range(m, 345, 700), m); await done(metro);

  const bpm2 = await lib.open(br, 'bpm', { wait: 800 }); await seed(bpm2, 'bpm'); await bpm2.waitForFunction(() => !__S.busy && __S.n > 0, null, { timeout: 20000 });
  const pair = (gap) => bpm2.evaluate((gap) => { const b = document.querySelector('body>div'), r = b.getBoundingClientRect(), x = r.left + innerWidth / 2, y = r.top + 300, T = performance.now() + 1e6;
    const ev = (type, ts) => { const e = new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 9, pointerType: 'touch' }); Object.defineProperty(e, 'timeStamp', { value: ts }); b.dispatchEvent(e); };
    __S.lastTap = 0; __S.whole = false; __S.sel = { a: 2, b: 10 };
    ev('pointerdown', T); ev('pointerup', T + 40); ev('pointerdown', T + gap); ev('pointerup', T + 40 + gap); return __S.whole; }, gap);
  const w280 = await pair(280), w320 = await pair(320);
  check('doubleTap300', w280 === true && w320 === false, { w280, w320 });

  const errors = [ana, play, bpm, metro, bpm2].flatMap(g => g.errors).filter(e => !/serviceworker|service worker/i.test(e));
  check('noErrors', errors.length === 0, { errors });
  await br.close();
  return lib.result(dir, { pass, steps });
};
