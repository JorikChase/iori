/* A pointercancel is the system taking the touch away (a notification, a gesture, a scroll): it must never act as a tap,
   a bud choice or a loop. Each case dispatches the same press twice where the action is safe to repeat: with a real
   pointerup as the control (proves the press lands), then with pointercancel. The tuner is read, it already checks. */
module.exports = async (lib) => {
  const dir = lib.outDir('cancel-taps'); const W = lib.VIEW.width, H = lib.VIEW.height;
  const br = await lib.browser(); const steps = {}; let pass = true;
  const check = (k, ok, data) => { steps[k] = { ok: !!ok, ...data }; pass = pass && !!ok; };
  const pe = (pg, type, x, y) => pg.evaluate(([type, x, y]) => { const b = document.querySelector('body>div'), r = b.getBoundingClientRect();
    b.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: r.left + x, clientY: r.top + y, pointerId: 9, pointerType: 'touch' })); }, [type, x, y]);
  const press = async (pg, end, x, y) => { await pe(pg, 'pointerdown', x, y); await pg.waitForTimeout(30); await pe(pg, end, x, y); await pg.waitForTimeout(60); };
  const seed = async (pg, key) => { const id = await pg.evaluate(async () => (await AT.takes.import(new File([await (await fetch('/tools/audio-test/signals/click120.wav')).blob()], 'click120.wav'))).id);
    await pg.evaluate(([k, id]) => AT.session.save(k, { id }), [key, id]); await pg.reload({ waitUntil: 'load' }); await pg.waitForTimeout(600); };
  const get = (pg, e) => pg.evaluate(e);

  /* metronome: centre = tap tempo, ring = accent */
  const m = await lib.open(br, 'metro', { wait: 800 }); const C = [W / 2, 226], Rg = [W / 2 + 128, 226];
  await press(m, 'pointerup', ...C); const t1 = await get(m, '__S.taps.length'); await m.evaluate(() => { __S.taps = []; });
  await press(m, 'pointercancel', ...C); const t2 = await get(m, '__S.taps.length');
  check('metroCentre', t1 === 1 && t2 === 0, { up: t1, cancel: t2 });
  const a0 = await get(m, '__S.st[1]'); await press(m, 'pointercancel', ...Rg); const a1 = await get(m, '__S.st[1]'); await press(m, 'pointerup', ...Rg); const a2 = await get(m, '__S.st[1]');
  check('metroRing', a1 === a0 && a2 !== a0, { before: a0, cancel: a1, up: a2 });

  /* analyzer: control dot, style dot, source dot, a view bud, the loudness reset */
  const a = await lib.open(br, 'ana', { wait: 800 }); const CTL = [W / 2, Math.round(H * .55)], ST = [W - 34, H - 34], SR = [W - 34, 34];
  await press(a, 'pointercancel', ...CTL); check('anaCtl', !(await get(a, '__S.run||__S.wait')), {});
  const s0 = await get(a, '__S.sty'); await press(a, 'pointercancel', ...ST); const s1 = await get(a, '__S.sty'); await press(a, 'pointerup', ...ST); const s2 = await get(a, '__S.sty');
  check('anaStyle', s1 === s0 && s2 !== s0, { s0, s1, s2 });
  await press(a, 'pointercancel', ...SR); await a.waitForTimeout(200); check('anaSource', !(await get(a, '!!(Wheel.active()||__S.wheel)')), {});
  const pick = async (end) => { await pe(a, 'pointerdown', ...CTL); await a.waitForTimeout(420); await a.evaluate(() => { if (__S.pick) __S.pick.sel = 2; }); await pe(a, end, ...CTL); await a.waitForTimeout(80); };
  await pick('pointercancel'); const v1 = await get(a, '[__S.view,!!__S.pick]'); await pick('pointerup'); const v2 = await get(a, '__S.view');
  check('anaBud', v1[0] === 0 && !v1[1] && v2 === 2, { cancel: v1, up: v2 });
  await a.waitForTimeout(500); await a.evaluate(() => { __S.intg = -30; });
  await press(a, 'pointercancel', W / 2, 60); const i1 = await get(a, '__S.intg'); await press(a, 'pointerup', W / 2, 60); const i2 = await get(a, '__S.intg');
  check('anaReset', i1 === -30 && i2 === -70, { cancel: i1, up: i2 });

  /* BPM: multiplier tap (resets to ×1), fan choice, strip tap */
  const b = await lib.open(br, 'bpm', { wait: 800 }); await seed(b, 'bpm'); await b.waitForFunction(() => !__S.busy && __S.n > 0, null, { timeout: 20000 });
  const MB = [34 + 2 * (W - 68) / 3, H - 28];
  await b.evaluate(() => { __S.mult = 2; }); await press(b, 'pointercancel', ...MB); const m1 = await get(b, '__S.mult'); await press(b, 'pointerup', ...MB); const m2 = await get(b, '__S.mult');
  check('bpmMultTap', m1 === 2 && m2 === 1, { cancel: m1, up: m2 });
  await pe(b, 'pointerdown', ...MB); await b.evaluate(() => { __S.mp.open = true; __S.mp.sel = 2; }); await pe(b, 'pointercancel', ...MB); await b.waitForTimeout(60); const m3 = await get(b, '__S.mult');
  check('bpmFan', m3 === 1, { cancel: m3 });
  await b.evaluate(() => { AT.setTempo(77, 'test'); __S.lastTap = 0; __S.res = null; }); await b.waitForTimeout(100);
  await press(b, 'pointercancel', W / 2, 300); const c = await b.evaluate(() => ({ tap: __S.lastTap, tempo: AT.tempo(), res: !!__S.res }));
  check('bpmStrip', c.tap === 0 && c.tempo === 77 && !c.res, c);

  /* practice: play dot, trainer dot, readout, source, waveform tap, loop tap, loop hold */
  const p = await lib.open(br, 'play', { wait: 600 }); await seed(p, 'play'); await p.waitForFunction(() => !!__S.song, null, { timeout: 8000 });
  const head = Math.round(H * .4);
  await press(p, 'pointercancel', W / 2, H - 46); check('playCtl', !(await get(p, '__S.play')), {});
  await press(p, 'pointercancel', W - 34, H - 34); const tr = await get(p, '__S.trainer'); check('playTrainer', tr === false, { tr });
  await press(p, 'pointercancel', W / 2, 40); await p.waitForTimeout(200); check('playReadout', !(await get(p, '!!__S.wheel')), {});
  await press(p, 'pointercancel', W - 34, 34); await p.waitForTimeout(200); check('playSource', !(await get(p, '!!__S.wheel')), {});
  const q0 = await get(p, '__S.pos'); await press(p, 'pointercancel', W / 2, head + 84); const q1 = await get(p, '__S.pos'); await press(p, 'pointerup', W / 2, head + 84); const q2 = await get(p, '__S.pos');
  check('playWave', q1 === q0 && q2 !== q0, { q0, q1, q2 });
  await p.evaluate(() => { __S.pos = 0; __S.loop = { a: 1, b: 5 }; }); await press(p, 'pointercancel', W / 2, head + 84); const lp = await get(p, '__S.loop'); await press(p, 'pointerup', W / 2, head + 84); const lq = await get(p, '__S.loop');
  check('playLoopTap', !!lp && !lq, { cancel: lp, up: lq });
  await p.evaluate(() => { __S.loop = null; }); await pe(p, 'pointerdown', W / 2, head + 40); await p.waitForTimeout(450); await pe(p, 'pointermove', W / 2, head + 160); await p.waitForTimeout(60); await pe(p, 'pointercancel', W / 2, head + 160); await p.waitForTimeout(60);
  const h = await p.evaluate(() => ({ loop: __S.loop, sel: __S.sel })); check('playLoopHold', !h.loop && !h.sel, h);

  const errors = [m, a, b, p].flatMap(g => g.errors).filter(e => !/serviceworker|service worker/i.test(e));
  check('noErrors', errors.length === 0, { errors });
  await br.close();
  return lib.result(dir, { pass, steps });
};
