/* BPM detector and the wheel (owner decision 2026-10-11): (1) choosing a take, (2) the detected tempo VALUE.
   Takes are seeded into the library as click tracks at 100 / 120 / 140 BPM (kinds file / rec / synth, 12 s each).
   1. a plain tap on the properties dot with nothing loaded does nothing; a still hold (350 ms) opens a DRAG-mode take
      wheel listing ALL takes newest first (Wheel.takes rows), above the dot: never over it, never in the hub corner
   2. one gesture: drag up one row, release -> that take (120 BPM, the second newest) is analysed; shared tempo untouched
   3. a plain tap on the properties dot still selects the whole song (after a drag selection), and opens no wheel
   4. hold again and release without moving: the wheel opens on the loaded take (marked current) and nothing reloads
   5. tap the big detected-tempo readout -> a tap-mode digit wheel pre-set to the shown value; set 128.0, tap the band
      -> shared tempo AT.tempo() 128.0 exactly, and the readout shows 128.0
   6. moving the finger off the dot before the hold cancels: no wheel, no whole-song tap */
module.exports = async (lib) => {
  const dir = lib.outDir('bpm-wheel' + (lib.ENGINE === 'webkit' ? '-webkit' : '')); const W = lib.VIEW.width, H = lib.VIEW.height;
  const br = await lib.browser(); const shots = []; const steps = {}; let pass = true;
  const check = (k, ok, data) => { steps[k] = { ok: !!ok, ...data }; pass = pass && !!ok; };
  const page = await lib.open(br, 'bpm', { wait: 800 });
  const shot = async (n) => { const f = `${dir}/${n}.png`; await page.screenshot({ path: f }); shots.push(f); return f; };
  const prop = [W - 34, H - 28], Y0 = 124, Y1 = H - 106;
  const idle = async (ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await page.evaluate(() => ({ b: __S.busy, n: __S.n })); if (!s.b && s.n) return true; await page.waitForTimeout(150); } return false; };
  const st = () => page.evaluate(() => { const w = Wheel.active(); return { n: __S.n, busy: __S.busy, whole: __S.whole, takeId: __S.takeId, tempo: AT.tempo(), lib: __S.lib.map(m => m.id),
    secs: (__S.secs || []).map(x => +x.bpm.toFixed(1)), res: __S.res, mult: __S.mult,
    wheel: w ? { kind: w.kind, mode: w.mode, light: !!w.o.light, idx: w.indices(), n: w.cols.length ? w.cols[0].n : 0, items: w.cols[0].items.map(i => (i.icon || '') + ' ' + (i.text || '')), cur: w.cols[0].cur, st: w.state() } : null }; });

  /* seed: three click tracks, oldest first (100 file, 120 rec, 140 synth) */
  const ids = await page.evaluate(async () => {
    const mk = (bpm, secs, sr) => { const d = new Float32Array(sr * secs); let s = 7; const R = () => { s = (s * 16807) % 2147483647; return s / 2147483647 * 2 - 1; };
      for (let t = 0; t < secs; t += 60 / bpm) { const i0 = Math.floor(t * sr); for (let k = 0; k < sr * .02 && i0 + k < d.length; k++) d[i0 + k] = .8 * R() * Math.exp(-k / (sr * .004)); } return d; };
    const out = []; const now = Date.now();
    for (const [bpm, kind, k] of [[100, 'file', 0], [120, 'rec', 1], [140, 'synth', 2]]) out.push((await AT.takes.put({ name: 'click ' + bpm, kind, sr: 44100, data: mk(bpm, 12, 44100), created: now - 3000 + k * 1000 })).id);
    return out; });
  await page.waitForTimeout(300);
  const s0 = await st(); const tempo0 = s0.tempo;

  /* 1 */
  await page.mouse.click(...prop); await page.waitForTimeout(300);
  const sTap = await st();
  await page.mouse.move(...prop); await page.mouse.down(); await page.waitForTimeout(200);
  const at200 = await st(); await page.waitForTimeout(250);
  const s1 = await st(); await shot('1-take-wheel');
  const r = s1.wheel && s1.wheel.st.rect, dotTop = prop[1] - 17;
  check('holdOpensTakeWheel', !sTap.wheel && sTap.n === 0 && !at200.wheel && s1.wheel && s1.wheel.kind === 'takes' && s1.wheel.mode === 'drag' && s1.wheel.n === 3
    && JSON.stringify(s0.lib) === JSON.stringify(ids.slice().reverse()) && /wave-sine 0:12/.test(s1.wheel.items[0]) && /microphone 0:12/.test(s1.wheel.items[1]) && /file-music 0:12/.test(s1.wheel.items[2])
    && JSON.stringify(s1.wheel.idx) === '[0]' && r.top + r.h <= dotTop - 4 && !(r.left < 104 && r.top + r.h > H - 104),
    { items: s1.wheel && s1.wheel.items, idx: s1.wheel && s1.wheel.idx, rect: r, dotTop, libNewestFirst: s0.lib, seeded: ids });
  /* 2: up one row (the finger stays below the wheel), release */
  for (let i = 1; i <= 8; i++) { await page.mouse.move(prop[0], prop[1] - 44 * i / 8); await page.waitForTimeout(25); }
  const mid = await st(); await shot('2-drag-one-row');
  await page.mouse.up(); await page.waitForTimeout(300); await idle();
  const s2 = await st(); await shot('2-analysed-120');
  check('releaseAnalyses', JSON.stringify(mid.wheel && mid.wheel.idx) === '[1]' && !s2.wheel && s2.takeId === ids[1] && s2.secs.length === 1 && lib.near(s2.secs[0], 120, 1.5) && s2.whole && s2.tempo === tempo0,
    { idxAtRelease: mid.wheel && mid.wheel.idx, takeId: s2.takeId, expected: ids[1], secs: s2.secs, tempo: s2.tempo, tempoBefore: tempo0 });

  /* 3: drag a selection on the strip, then a plain tap on the dot = whole song */
  const yAt = (t) => Y0 + t / (s2.n / 100) * (Y1 - Y0);
  await page.mouse.move(W / 2, yAt(2)); await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(W / 2, yAt(2) + (yAt(8) - yAt(2)) * i / 10); await page.waitForTimeout(30); }
  await page.mouse.up(); await page.waitForTimeout(300);
  const s3a = await st();
  await page.mouse.click(...prop); await page.waitForTimeout(300);
  const s3 = await st();
  check('tapSelectsWhole', !s3a.whole && s3.whole && !s3.wheel, { beforeTap: s3a.whole, afterTap: s3.whole, wheel: !!s3.wheel });

  /* 4: hold + release in place: opens on the loaded take, commits it, no reload */
  await page.evaluate(() => { window.__loads = 0; const g = AT.takes.get; AT.takes.get = function (id) { window.__loads++; return g.call(this, id); }; });
  await page.mouse.move(...prop); await page.mouse.down(); await page.waitForTimeout(450);
  const s4a = await st(); await page.mouse.up(); await page.waitForTimeout(400);
  const s4 = await st(); const loads = await page.evaluate(() => __loads);
  check('holdReleaseInPlace', s4a.wheel && JSON.stringify(s4a.wheel.idx) === '[1]' && s4a.wheel.cur === 1 && !s4.wheel && s4.takeId === ids[1] && loads === 0,
    { idx: s4a.wheel && s4a.wheel.idx, cur: s4a.wheel && s4a.wheel.cur, loads });

  /* 5: the readout */
  const shown = Math.round(s4.res.bpm * s4.mult * 10) / 10, v = Math.round(shown * 10);
  await page.mouse.click(W / 2, 22 + 37); await page.waitForTimeout(500);
  const s5a = await st(); await shot('5-tempo-wheel');
  await page.evaluate(() => { const w = Wheel.active(); w.set(0, 1); w.set(1, 2); w.set(2, 8); w.set(3, 0); }); await page.waitForTimeout(700);
  const s5b = await st(); await shot('5-set-128');
  await page.mouse.click(s5b.wheel.st.cols[1].x, s5b.wheel.st.bandY); await page.waitForTimeout(600);
  const s5 = await st(); await shot('5-committed');
  const want = [Math.floor(v / 1000), Math.floor(v / 100) % 10, Math.floor(v / 10) % 10, v % 10];
  check('readoutWheel128', s5a.wheel && s5a.wheel.kind === 'tempo' && s5a.wheel.mode === 'tap' && JSON.stringify(s5a.wheel.idx) === JSON.stringify(want)
    && JSON.stringify(s5b.wheel.idx) === '[1,2,8,0]' && s5.tempo === 128 && !s5.wheel && s5.res && s5.res.user === 128,
    { shown, preset: s5a.wheel && s5a.wheel.idx, want, tempo: s5.tempo, res: s5.res });

  /* 6: slide off the dot before the hold */
  await page.mouse.move(...prop); await page.mouse.down();
  for (let i = 1; i <= 6; i++) { await page.mouse.move(prop[0] - i * 4, prop[1] - i * 6); await page.waitForTimeout(20); }
  await page.waitForTimeout(500); const s6a = await st(); await page.mouse.up(); await page.waitForTimeout(200);
  check('moveCancelsHold', !s6a.wheel, { wheel: !!s6a.wheel });

  const errors = page.errors.filter(e => !/serviceworker|service worker/i.test(e));
  check('noErrors', errors.length === 0, { errors });
  await lib.sheet(br, shots, `${dir}/sheet.png`, 4, 200);
  await page.context().close(); await br.close();
  return lib.result(dir, { pass, steps });
};
