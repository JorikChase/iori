/* Metronome: the tempo digit wheel (owner decision 2026-10-11: every value has the wheel as its exact way in; where a tap
   already means something, a STILL HOLD opens it). The centre: tap = tap tempo, drag = tempo / beat count (rounds to a
   whole BPM on release), still hold (350 ms, < 8 px) = the wheel, tap mode (stays open after the finger lifts).
   1. hold the centre -> a tap-mode wheel H/T/O . tenths pre-set to the current tempo; no tap tempo, no drag fired;
      moving the finger after it opened changes nothing; lifting leaves it open
   2. spin to 137.5 and tap the centre band -> S.bpm 137.5, AT.tempo() 137.5, readout "137" ".5"
   3. tap tempo still works (4 taps at 500 ms -> ~120) and opens no wheel
   4. a drag from the centre still sets the tempo (rounded to a whole BPM) and opens no wheel
   5. the x cancels: the tempo is untouched
   6. while running (dark screen) the wheel is dark */
module.exports = async (lib) => {
  const dir = lib.outDir('metro-wheel' + (lib.ENGINE === 'webkit' ? '-webkit' : '')); const W = lib.VIEW.width, H = lib.VIEW.height;
  const br = await lib.browser(); const page = await lib.open(br, 'metro', { wait: 800 }); const shots = []; const steps = {}; let pass = true;
  const check = (k, ok, data) => { steps[k] = { ok: !!ok, ...data }; pass = pass && !!ok; };
  const shot = async (n) => { const f = `${dir}/${n}.png`; await page.screenshot({ path: f }); shots.push(f); return f; };
  const C = [W / 2, 226];
  const st = () => page.evaluate(() => { const w = Wheel.active(); return { bpm: __S.bpm, tempo: AT.tempo(), taps: __S.taps.length, N: __S.N, drag: !!__S.drag,
    wheel: w ? { mode: w.mode, light: !!w.o.light, idx: w.indices(), n: w.cols.length, rect: w.state().rect, bandY: w.state().bandY, cols: w.state().cols.map(c => c.x), cancel: w.state().cancel } : null }; });
  await page.evaluate(() => AT.setTempo(100, 'test')); await page.waitForTimeout(150);

  /* 1 */
  const s0 = await st();
  await page.mouse.move(...C); await page.mouse.down(); await page.waitForTimeout(200);
  const at200 = await st();
  await page.waitForTimeout(300);
  const at500 = await st();
  for (let i = 1; i <= 8; i++) { await page.mouse.move(C[0] + i * 10, C[1] - i * 6); await page.waitForTimeout(20); }   // after it opened: no drag
  const moved = await st();
  await page.mouse.up(); await page.waitForTimeout(400);
  const lifted = await st();
  await shot('1-hold-wheel');
  check('holdOpens', !at200.wheel && at500.wheel && at500.wheel.mode === 'tap' && at500.wheel.n === 4 && at500.wheel.light && JSON.stringify(at500.wheel.idx) === '[1,0,0,0]'
    && at500.taps === s0.taps && moved.bpm === 100 && moved.N === s0.N && lifted.wheel && lifted.bpm === 100 && lifted.taps === s0.taps,
    { at200: !!at200.wheel, wheel: at500.wheel, bpmAfterMove: moved.bpm, N: [s0.N, moved.N], tapsBefore: s0.taps, tapsAfter: lifted.taps, openAfterLift: !!lifted.wheel });

  /* 2: tens and ones spun programmatically, the tenths by real taps on the row below the band (+1 each), confirm on the band */
  await page.evaluate(() => { const w = Wheel.active(); w.set(1, 3); w.set(2, 7); }); await page.waitForTimeout(600);
  const w2 = lifted.wheel, rowDy = 44 * 2.5 * Math.sin(2 / 5);
  for (let i = 0; i < 5; i++) { await page.mouse.click(w2.cols[3], w2.bandY + rowDy); await page.waitForTimeout(450); }
  const pre = await st(); await shot('2-set-137.5');
  await page.mouse.click(w2.cols[3], w2.bandY); await page.waitForTimeout(500);
  const s2 = await st(); await page.waitForTimeout(400);
  await shot('2-committed');
  check('set137_5', JSON.stringify(pre.wheel && pre.wheel.idx) === '[1,3,7,5]' && s2.bpm === 137.5 && s2.tempo === 137.5 && !s2.wheel,
    { idxBeforeCommit: pre.wheel && pre.wheel.idx, bpm: s2.bpm, tempo: s2.tempo, closed: !s2.wheel });

  /* 3: tap tempo */
  for (let i = 0; i < 4; i++) { await page.mouse.click(...C); await page.waitForTimeout(500); }
  const s3 = await st();
  check('tapTempo', lib.near(s3.bpm, 120, 8) && lib.near(s3.tempo, s3.bpm, .05) && !s3.wheel, { bpm: s3.bpm, tempo: s3.tempo, wheel: !!s3.wheel });

  /* 4: drag right 100 px from the centre: +30 BPM, whole on release */
  const b4 = s3.bpm;
  await page.mouse.move(...C); await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(C[0] + i * 10, C[1]); await page.waitForTimeout(25); }
  await page.waitForTimeout(450); const mid4 = await st();   // still holding after the drag: no wheel either
  await page.mouse.up(); await page.waitForTimeout(200);
  const s4 = await st();
  check('dragStillWorks', !mid4.wheel && !s4.wheel && s4.bpm === Math.round(b4 + 30) && s4.tempo === s4.bpm, { before: b4, after: s4.bpm, tempo: s4.tempo, wheelDuringHoldAfterDrag: !!mid4.wheel });

  /* 5: cancel */
  const b5 = s4.bpm;
  await page.mouse.move(...C); await page.mouse.down(); await page.waitForTimeout(450); await page.mouse.up(); await page.waitForTimeout(300);
  const o5 = await st(); await page.evaluate(() => { const w = Wheel.active(); w.set(1, 9); }); await page.waitForTimeout(500);
  await page.mouse.click(o5.wheel.cancel.x, o5.wheel.cancel.y); await page.waitForTimeout(400);
  const s5 = await st();
  check('cancel', o5.wheel && s5.bpm === b5 && !s5.wheel, { before: b5, after: s5.bpm });

  /* 6: running -> dark wheel */
  await page.mouse.click(W / 2, H - 34); await page.waitForTimeout(700);
  await page.mouse.move(...C); await page.mouse.down(); await page.waitForTimeout(450); await page.mouse.up(); await page.waitForTimeout(300);
  const s6 = await st(); await shot('6-running-dark');
  const run6 = await page.evaluate(() => __S.run);
  check('darkWhileRunning', run6 && s6.wheel && !s6.wheel.light, { run: run6, light: s6.wheel && s6.wheel.light });
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.mouse.click(W / 2, H - 34);

  check('noErrors', page.errors.length === 0, { errors: page.errors });
  await lib.sheet(br, shots, `${dir}/sheet.png`, 4, 200);
  await page.context().close(); await br.close();
  return lib.result(dir, { pass, steps });
};
