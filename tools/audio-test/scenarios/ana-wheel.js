/* Analyzer: the wheel picker (audio/wheel.js) on the source dot. Real audio only.
   Three takes are seeded (sine440.wav imported as a file take, then a rec and a retro take); the microphone is the
   injected tone1k_m20.wav.
     1. tap the source dot -> a tap-mode wheel: OPEN FILE, the 3 takes (kind icon + m:ss, oldest to newest downward),
        the microphone at the bottom and pre-selected (the default source); white (stopped); clear of the dot
     2. press on the dot, pull down 1 row, release -> one gesture: a drag-mode wheel below the dot crosses one row and
        the newest take (retro) starts playing through analysis (run, one source node)
     3. tap -> wheel, 2 rows down to sine440, tap the band -> analysed: strongest frequency 440 Hz (within one log bin);
        the wheel opened dark (the analyzer runs); the dot shows the take's kind icon (file-music)
     4. tap -> wheel, drag up 3 rows to the microphone, tap the band -> the microphone starts: 1 kHz within one bin
     5. refused microphone (getUserMedia rejects, calls counted): tap play -> refused (microphone-off); tap the dot ->
        the wheel's microphone row shows microphone-off; choosing it retries (a 2nd getUserMedia call) and the refused
        state stays (no run, no nodes); then the OPEN FILE row opens the system picker (listener armed 200 ms before)
   No console errors. */
const path = require('path');
const DENY = `(() => { window.__GUM = 0; const MD = MediaDevices.prototype; MD.getUserMedia = function () { window.__GUM++; return Promise.reject(new DOMException('denied', 'NotAllowedError')); }; })();`;
const BIN = Math.log(1000) / 256;
module.exports = async (lib) => {
  const dir = lib.outDir('ana-wheel' + (lib.ENGINE === 'webkit' ? '-webkit' : '')); const W = lib.VIEW.width, H = lib.VIEW.height;
  const shots = []; const steps = {}; let pass = true; const errors = [];
  const check = (k, ok, data) => { steps[k] = { ok: !!ok, ...data }; pass = pass && !!ok; };
  const shot = async (pg, name) => { const f = `${dir}/${name}.png`; await pg.screenshot({ path: f }); shots.push(f); return f; };
  const until = async (pg, fn, ms = 8000, arg) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await pg.evaluate(fn, arg)) return true; await pg.waitForTimeout(60); } return false; };
  const SRC = [W - 34, 34], CTL = [W / 2, Math.round(H * .55)];
  const wh = (pg) => pg.evaluate(() => { const h = Wheel.last; if (!h) return null; const s = h.state();
    return { ...s, open: !s.closing, light: !!h.o.light, items: h.o.columns[0].items, keys: __S.wheelKeys, idx: s.cols[0].idx, x: s.cols[0].x }; });
  const overlap = (w) => { const dot = { l: SRC[0] - 16, t: SRC[1] - 16, r: SRC[0] + 16, b: SRC[1] + 16 };
    const rs = [{ l: w.rect.left, t: w.rect.top, r: w.rect.left + w.rect.w, b: w.rect.top + w.rect.h }];
    if (w.mode === 'tap') rs.push({ l: w.cancel.x - 10, t: w.cancel.y - 10, r: w.cancel.x + 10, b: w.cancel.y + 10 });
    return { hit: rs.some(q => q.l < dot.r && q.r > dot.l && q.t < dot.b && q.b > dot.t), gap: Math.round(Math.min(...rs.map(q => q.t)) - dot.b) }; };
  const spin = async (pg, rows, from) => { const w = await wh(pg); const x = w.x, y = from == null ? w.bandY : from, dy = rows * w.rowH;
    await pg.mouse.move(x, y); await pg.mouse.down(); for (let k = 1; k <= 14; k++) { await pg.mouse.move(x, y + dy * k / 14); await pg.waitForTimeout(18); }
    await pg.waitForTimeout(180); await pg.mouse.up(); await pg.waitForTimeout(450); return (await wh(pg)).idx; };
  const band = async (pg) => { const w = await wh(pg); await pg.mouse.click(w.x, w.bandY); await pg.waitForTimeout(250); };
  const icon = (pg) => pg.evaluate(() => { const i = [...document.querySelectorAll('#al i')].find(e => e.style.top === '34px' && e.style.visibility !== 'hidden'); return i ? i.className.replace('ti ti-', '') : null; });
  const st = (pg) => pg.evaluate(() => ({ src: __S.src, take: __S.take, run: __S.run, wait: __S.wait, micFail: __S.micFail, nodes: __S.nodes.length, pf: __S.pf, pd: __S.pd, mic: !!__S.stream }));
  const ICON = { rec: 'microphone', retro: 'history', file: 'file-music', synth: 'wave-sine', mix: 'device-floppy' };
  const fmt = (s) => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');

  /* ------------------------------------------------ 1–4: microphone allowed (injected 1 kHz) */
  {
    const br = await lib.browser(); const page = await lib.open(br, 'ana', { wait: 600, wav: 'tone1k_m20.wav' });
    await page.evaluate(async () => { AT.session.save('ana', null);
      const b = await (await fetch('/tools/audio-test/signals/sine440.wav')).blob(); await AT.takes.import(new File([b], 'sine440.wav'));
      for (const [k, d] of [['rec', 4], ['retro', 6]]) { await new Promise(r => setTimeout(r, 15)); const sr = 8000, x = new Float32Array(sr * d); for (let j = 0; j < x.length; j++) x[j] = Math.sin(j / 5) * .2; await AT.takes.put({ name: k, kind: k, sr, data: x }); } });
    await page.reload({ waitUntil: 'load' }); await until(page, () => __S.lib.length === 3);
    const metas = await page.evaluate(() => AT.takes.list().then(a => a.map(m => ({ id: m.id, kind: m.kind, dur: Math.round(m.dur), name: m.name }))));   // newest first
    const sine = metas.find(m => m.name === 'sine440');

    /* 1 */
    await page.mouse.click(...SRC); await page.waitForTimeout(400);
    const w1 = await wh(page); await shot(page, '1-source-wheel');
    const want = [{ icon: 'file-music' }].concat(metas.slice().reverse().map(m => ({ icon: ICON[m.kind], text: fmt(m.dur) })), [{ icon: 'microphone' }]);
    const ov1 = overlap(w1);
    check('list', w1.open && w1.mode === 'tap' && JSON.stringify(w1.items) === JSON.stringify(want) &&
      JSON.stringify(w1.keys) === JSON.stringify(['file'].concat(metas.slice().reverse().map(m => m.id), ['mic'])) && w1.idx === 4 && w1.light && !ov1.hit,
      { items: w1.items, preselected: w1.keys[w1.idx], light: w1.light, overlap: ov1 });
    await page.mouse.click(w1.cancel.x, w1.cancel.y); await page.waitForTimeout(300);
    const afterCancel = await st(page);

    /* 2: press-drag-release: microphone -> the newest take */
    await page.mouse.move(...SRC); await page.mouse.down();
    for (let k = 1; k <= 12; k++) { await page.mouse.move(SRC[0], SRC[1] + 46 * k / 12); await page.waitForTimeout(20); }
    await page.waitForTimeout(120); const w2 = await wh(page); await shot(page, '2-press-drag'); await page.mouse.up();
    await until(page, () => __S.run); await page.waitForTimeout(800);
    let s = await st(page); const ov2 = overlap(w2);
    check('pressDrag', afterCancel.src === 'mic' && !afterCancel.run && w2.mode === 'drag' && w2.changes === 1 && w2.idx === 3 && !ov2.hit &&
      s.src === 'take' && s.take === metas[0].id && s.run && s.nodes === 1, { cancelKeptMic: afterCancel.src, mode: w2.mode, rowsCrossed: w2.changes, row: w2.keys[w2.idx], overlap: ov2, src: s.src, take: s.take, newest: metas[0], run: s.run });

    /* 3: tap -> sine440 (2 rows down) -> analysed at 440 Hz */
    await page.mouse.click(...SRC); await page.waitForTimeout(400); const w3 = await wh(page);
    const idx3 = await spin(page, 2); await band(page);
    await until(page, (id) => __S.take === id && __S.run, 8000, sine.id); await page.waitForTimeout(2500);
    s = await st(page); const ic3 = await icon(page); await shot(page, '3-take-440');
    check('take440', w3.light === false && w3.keys[idx3] === sine.id && s.src === 'take' && s.take === sine.id && s.run && s.nodes === 1 && Math.abs(Math.log(s.pf / 440)) <= BIN && ic3 === 'file-music',
      { light: w3.light, row: w3.keys[idx3], pf: s.pf, pfErrPct: +(100 * (s.pf / 440 - 1)).toFixed(2), icon: ic3, run: s.run });

    /* 4: tap -> drag up 3 rows from below the band -> microphone */
    await page.mouse.click(...SRC); await page.waitForTimeout(400); const w4 = await wh(page);
    const idx4 = await spin(page, -3, w4.bandY + 90); await shot(page, '4-mic-row'); await band(page);
    await until(page, () => __S.src === 'mic' && __S.run && !!__S.stream); await page.waitForTimeout(3000);
    s = await st(page); const ic4 = await icon(page); await shot(page, '4b-mic-1k');
    check('mic1k', w4.keys[idx4] === 'mic' && s.src === 'mic' && s.run && s.mic && s.nodes === 1 && !s.micFail && Math.abs(Math.log(s.pf / 1000)) <= BIN && ic4 === 'microphone',
      { row: w4.keys[idx4], pf: s.pf, pfErrPct: +(100 * (s.pf / 1000 - 1)).toFixed(2), icon: ic4 });
    errors.push(...page.errors); await page.context().close(); await br.close();
  }

  /* ------------------------------------------------ 5: microphone refused */
  {
    const br = await lib.browser(); const page = await lib.open(br, 'ana', { wait: 300 });
    await page.addInitScript(DENY); await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(600);
    const choosers = []; page.on('filechooser', c => choosers.push(c));
    await page.mouse.click(...CTL); await page.waitForTimeout(800);
    const s1 = await st(page); const ic1 = await icon(page); await shot(page, '5-refused');
    await page.mouse.click(...SRC); await page.waitForTimeout(400); const w5 = await wh(page); await shot(page, '5b-refused-wheel');
    await band(page); await page.waitForTimeout(800);                                    // the microphone is pre-selected: choose it = retry
    const s2 = await st(page); const ic2 = await icon(page); const gum = await page.evaluate(() => window.__GUM);
    await page.mouse.click(...SRC); await page.waitForTimeout(400);
    const idx5 = await spin(page, 1); await page.waitForTimeout(200); await band(page);   // OPEN FILE row (empty library: right above the microphone)
    const t0 = Date.now(); while (!choosers.length && Date.now() - t0 < 5000) await page.waitForTimeout(50);
    const w5b = await wh(page); const s3 = await st(page);
    if (choosers[0]) await choosers[0].setFiles([]).catch(() => {});
    check('refused', s1.micFail && !s1.run && ic1 === 'microphone-off' && JSON.stringify(w5.items) === JSON.stringify([{ icon: 'file-music' }, { icon: 'microphone-off' }]) && w5.idx === 1 &&
      gum === 2 && s2.micFail && !s2.run && s2.nodes === 0 && ic2 === 'microphone-off' && w5b.keys[idx5] === 'file' && choosers.length === 1 && s3.src === 'file',
      { afterPlay: { icon: ic1, micFail: s1.micFail, run: s1.run }, wheelItems: w5.items, getUserMediaCalls: gum, afterRetry: { icon: ic2, micFail: s2.micFail, run: s2.run, nodes: s2.nodes },
        fileRowOpensPicker: choosers.length === 1, srcAfter: s3.src });
    errors.push(...page.errors); await page.context().close();
    await lib.sheet(br, shots, `${dir}/sheet.png`, 4, 200); await br.close();
  }
  const errs = errors.filter(e => !/serviceworker|service worker/i.test(e));
  check('noErrors', errs.length === 0, { errors: errs });
  return lib.result(dir, { pass, engine: lib.ENGINE, steps, shots });
};
