/* Analyzer, real audio only: the microphone is the default source; a 1 kHz sine at -20 dBFS measures at 1 kHz and
   about -23 LUFS; a refused microphone shows microphone-off and makes no sound at all; an opened file is analysed
   and lands in the library; the source is remembered; no generated audio is left in the page. */
const fs = require('fs'); const path = require('path');
const DENY = `navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));`;
/* count every audio source node the page creates (the harness microphone's own context excluded) */
const COUNT = `(() => { window.__GEN = { osc: 0, bufsrc: 0, buf: 0 }; const P = (window.BaseAudioContext || window.AudioContext).prototype;
  [['createOscillator', 'osc'], ['createBufferSource', 'bufsrc'], ['createBuffer', 'buf']].forEach(([m, k]) => { const f = P[m];
    P[m] = function () { if (!window.__MIC || this !== window.__MIC.ac) window.__GEN[k]++; return f.apply(this, arguments); }; }); })();`;
const BIN = Math.log(1000) / 256;                                  // one log-bin step, natural log
module.exports = async (lib) => {
  const dir = lib.outDir('ana-real'); const W = lib.VIEW.width, H = lib.VIEW.height; const shots = []; const out = {};
  const CTL = [W / 2, Math.round(H * .55)], SRC = [W - 34, 34];
  const tap = async (page, [x, y]) => { await page.mouse.click(x, y); await page.waitForTimeout(150); };
  const shot = async (page, name) => { const f = `${dir}/${name}.png`; await page.screenshot({ path: f }); shots.push(f); };
  const icon = (page) => page.evaluate(() => { const i = [...document.querySelectorAll('#al i')].find(e => e.style.top === '34px' && e.style.visibility !== 'hidden'); return i ? i.className.replace('ti ti-', '') : null; });
  const st = (page) => page.evaluate(() => ({ src: __S.src, take: __S.take, run: __S.run, wait: __S.wait, micFail: __S.micFail, nodes: __S.nodes.length,
    pf: __S.pf, pd: __S.pd, mom: __S.mom, sh: __S.sh, intg: __S.intg, view: __S.view,
    peakBin: (() => { let b = 0; for (let i = 1; i < 256; i++) if (__S.spec[i] > __S.spec[b]) b = i; return b; })() }));
  const br = await lib.browser();

  /* 1. default source = microphone; 1 kHz -20 dBFS through it */
  {
    const page = await lib.open(br, 'ana', { wait: 800, wav: 'tone1k_m20.wav' });
    const s0 = await st(page); const ic0 = await icon(page); await shot(page, '1-idle-mic');
    await tap(page, CTL); await page.waitForTimeout(3500);
    const s = await st(page); const ic = await icon(page); await shot(page, '2-mic-1k-spectrum');
    // the loudness view: hold the control, drag to the third bud, release
    const a = -30 * Math.PI / 180, bud = [CTL[0] + 110 * Math.cos(a), CTL[1] + 110 * Math.sin(a)];
    await page.mouse.move(...CTL); await page.mouse.down(); await page.waitForTimeout(400);
    await page.mouse.move(bud[0], bud[1], { steps: 6 }); await page.waitForTimeout(100); await page.mouse.up();
    await page.waitForTimeout(1200); const sv = await st(page); await shot(page, '3-mic-1k-loudness');
    const binCentre = Math.floor(256 * Math.log(1000 / 20) / Math.log(1000));      // 144: the bin that holds 1 kHz
    const ok = s0.src === 'mic' && ic0 === 'microphone' && !s0.run && s.run && s.src === 'mic' && !s.micFail && s.nodes === 1 &&
      Math.abs(Math.log(s.pf / 1000)) <= BIN && Math.abs(s.peakBin - binCentre) <= 1 && lib.near(s.mom, -23, 1.5) && sv.view === 2;
    out.mic = { ok, idle: { src: s0.src, icon: ic0, run: s0.run }, running: { icon: ic, ...s }, loudnessView: { view: sv.view, mom: sv.mom, sh: sv.sh, intg: sv.intg },
      pfErrPct: +(100 * (s.pf / 1000 - 1)).toFixed(2), binStepPct: +(100 * (Math.exp(BIN) - 1)).toFixed(2), binCentre, errors: page.errors };
    await page.context().close();
  }

  /* 2. microphone refused: microphone-off, no run, no nodes, nothing generated; the dot retries, then moves on */
  {
    const page = await lib.open(br, 'ana', { wait: 300 });
    await page.addInitScript(DENY); await page.addInitScript(COUNT); await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(600);
    await tap(page, CTL); await page.waitForTimeout(800);
    const s1 = await st(page); const ic1 = await icon(page); await shot(page, '4-refused');
    await tap(page, SRC); await page.waitForTimeout(800);                      // retry
    const s2 = await st(page); const ic2 = await icon(page);
    let chooser = null; page.on('filechooser', c => (chooser = c)); await page.waitForTimeout(200);   // interception on before the tap
    await tap(page, SRC); await page.waitForTimeout(800);                      // next tap moves on: empty library, so open file
    if (chooser) await chooser.setFiles([]).catch(() => {});             // answer the dialog (cancel) so the browser can open the next one
    const s3 = await st(page); const gen = await page.evaluate(() => window.__GEN);
    const ok = s1.micFail && !s1.run && s1.nodes === 0 && ic1 === 'microphone-off' && s2.micFail && !s2.run && ic2 === 'microphone-off' &&
      !!chooser && s3.src === 'file' && gen.osc === 0 && gen.bufsrc === 0 && gen.buf === 0;
    out.refused = { ok, afterPlay: { icon: ic1, ...s1 }, afterRetry: { icon: ic2, run: s2.run, micFail: s2.micFail }, nextTapOpensPicker: !!chooser, srcAfter: s3.src, generated: gen, errors: page.errors };
    await page.context().close();
  }

  /* 3. open a file: picker -> imported into the library -> analysed (looped); the source survives a reload.
     Its own browser: a file dialog left open by step 2 keeps Chromium from raising another one in the same browser. */
  {
    const br3 = await lib.browser();
    const page = await lib.open(br3, 'ana', { wait: 300 });
    await page.addInitScript(DENY); await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(600);
    const choosing = page.waitForEvent('filechooser'); await page.waitForTimeout(200);   // interception on before the tap
    await tap(page, SRC); const chooser = await choosing;
    await chooser.setFiles(path.join(lib.ROOT, 'tools/audio-test/signals/sine440.wav'));
    await page.waitForTimeout(3000);
    const s = await st(page); const ic = await icon(page); await shot(page, '5-file-440');
    const lib1 = await page.evaluate(() => AT.takes.list().then(a => a.map(m => ({ id: m.id, name: m.name, kind: m.kind, dur: +m.dur.toFixed(2) }))));
    const sess = await page.evaluate(() => AT.session.load('ana'));
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(800);
    const r = await st(page); const icr = await icon(page); await shot(page, '6-reload-take-remembered');
    await tap(page, CTL); await page.waitForTimeout(2000); const rr = await st(page);
    await tap(page, SRC); const c1 = await st(page);                           // take -> open file (picker; left unanswered)
    await tap(page, SRC); const c2 = await st(page); const icm = await icon(page);  // -> microphone (stopped: refused here)
    await tap(page, SRC); const c3 = await st(page);                           // microphone refused? first tap retries...
    const ok = s.src === 'take' && s.run && s.nodes === 1 && Math.abs(Math.log(s.pf / 440)) <= BIN && lib1.length === 1 && lib1[0].kind === 'file' &&
      lib1[0].id === s.take && sess && sess.src === 'take' && sess.take === s.take && r.src === 'take' && r.take === s.take && icr === 'number-1' &&
      rr.run && Math.abs(Math.log(rr.pf / 440)) <= BIN && c1.src === 'file' && !c1.run && c2.src === 'mic' && icm === 'microphone';
    out.file = { ok, playing: { icon: ic, ...s }, library: lib1, session: sess, afterReload: { icon: icr, src: r.src, take: r.take, run: r.run },
      replay: { run: rr.run, pf: rr.pf }, cycle: [c1.src, c2.src, c3.src], errors: page.errors };
    await page.context().close(); await br3.close();
  }

  /* 4. no generated audio left in the source */
  {
    const src = fs.readFileSync(path.join(lib.ROOT, 'audio/t/ana.html'), 'utf8');
    const hits = ['createOscillator', 'Math.random()*2-1', 'demo(', 'wave-sine\'}'].filter(k => src.includes(k));
    out.grep = { ok: !hits.length, hits };
  }

  await lib.sheet(br, shots, `${dir}/sheet.png`, 6, 160); await br.close();
  const pass = out.mic.ok && out.refused.ok && out.file.ok && out.grep.ok &&
    !out.mic.errors.length && !out.refused.errors.length && !out.file.errors.length;
  return lib.result(dir, { pass, ...out, shots });
};
