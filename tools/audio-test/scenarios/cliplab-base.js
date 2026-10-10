/* Clip Lab (audio/clip-lab.html) — base scenario + the helpers every cliplab-* scenario uses.
   Takes are seeded through the library API (AT.takes.put of known test signals: test data written through the
   library, never audio the page makes up), then the page is reloaded and builds its scene from the latest takes.
   1. empty library -> the open-file bud, no clips, no playhead; tapping it opens the system picker and the chosen
      file (sine440.wav) becomes the scene; a warped clip follows a shared-tempo change, an unwarped one does not
   2. three takes -> lane 0 holds two clips that TOUCH end-to-start, lane 1 one clip; each clip is the middle of
      its take (handles on both sides); pps fits the content
   3. tempo estimate: a 120 BPM click take -> ~120 ('est'); a held 440 Hz tone -> null, the shared tempo ('shared')
   4. idle screenshot, no console errors */
const PORT = () => +(process.env.AT_PORT || 8794);
const SFX = () => (process.env.AT_BROWSER === 'webkit' ? '-webkit' : '');

async function openLab(lib, br, { q = '', wait = 700, dpr = lib.DPR } = {}) {
  const opts = lib.ENGINE === 'webkit' ? { viewport: lib.VIEW, deviceScaleFactor: dpr, hasTouch: true } : { viewport: lib.VIEW, deviceScaleFactor: dpr, hasTouch: true, isMobile: true };
  const ctx = await br.newContext(opts); const page = await ctx.newPage(); const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.errors = errors; page.q = q;
  await page.goto(`http://127.0.0.1:${PORT()}/audio/clip-lab.html${q}`, { waitUntil: 'load' });
  await page.waitForTimeout(wait); return page;
}
/* specs (oldest first; the last one is the newest take = clip A): {name, sec, hz, amp, ramp:[a0,a1]} or {name, wav, sec} */
async function seed(page, specs) {
  return page.evaluate(async (specs) => {
    const ids = [];
    for (const sp of specs) {
      const sr = 48000; let d;
      if (sp.wav) {
        const buf = await (await fetch('/tools/audio-test/signals/' + sp.wav)).arrayBuffer();
        const O = window.OfflineAudioContext || window.webkitOfflineAudioContext; const ab = await new Promise((res, rej) => { const p = new O(1, 1, sr).decodeAudioData(buf, res, rej); if (p && p.then) p.then(res, rej); });
        d = ab.getChannelData(0).slice(0, Math.round(sr * (sp.sec || ab.duration)));
      } else {
        d = new Float32Array(Math.round(sr * sp.sec)); const a0 = sp.ramp ? sp.ramp[0] : sp.amp, a1 = sp.ramp ? sp.ramp[1] : sp.amp;
        for (let i = 0; i < d.length; i++) d[i] = (a0 + (a1 - a0) * i / d.length) * Math.sin(2 * Math.PI * sp.hz * i / sr);
      }
      ids.push((await AT.takes.put({ name: sp.name, kind: 'rec', sr, data: d })).id);
      await new Promise(r => setTimeout(r, 5));   // distinct 'created' stamps: the order is the newest-first order
    }
    return ids;
  }, specs);
}
async function settle(page, ms = 5000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const ok = await page.evaluate(() => window.__CL && __CL.ready() && __CL.pending() === 0); if (ok) return true; await page.waitForTimeout(60); }
  return false;
}
async function reload(page) { await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(300); await settle(page); await page.waitForTimeout(250); }
const clips = (page) => page.evaluate(() => __CL.clips());
const view = (page) => page.evaluate(() => __CL.view());
const st = (page) => page.evaluate(() => __CL.state());
const yOf = (page, s) => page.evaluate((s) => __CL.yOf(s), s);
async function shot(page, dir, name, list) { const f = `${dir}/${name}.png`; await page.screenshot({ path: f }); if (list) list.push(f); return f; }
/* one finger (mouse): press, optional hold, move in steps, release */
async function drag(page, x0, y0, x1, y1, { hold = 0, steps = 0, stepMs = 16, after = 120, up = true } = {}) {
  /* steps of >= 5 px by default: an immediate drag must pass the 4 px edge threshold before the 220 ms hold, also
     when software GL at DPR 2 slows event delivery */
  if (!steps) steps = Math.max(1, Math.min(12, Math.floor(Math.hypot(x1 - x0, y1 - y0) / 5)));
  await page.mouse.move(x0, y0); await page.mouse.down(); if (hold) await page.waitForTimeout(hold);
  for (let i = 1; i <= steps; i++) { await page.mouse.move(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); await page.waitForTimeout(stepMs); }
  if (up) { await page.waitForTimeout(after); await page.mouse.up(); }
}
async function tap(page, x, y, ms = 60) { await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(ms); await page.mouse.up(); }
/* two fingers: Chromium = real touch through CDP (pointer events from the touch pipeline); WebKit (no CDP in
   Playwright) = synthetic touch PointerEvents dispatched on the editor box. frames: [[{x,y},{x,y}], ...] */
async function twoFinger(lib, page, frames, { stepMs = 16, hold = 0 } = {}) {
  if (lib.ENGINE !== 'webkit') {
    const cdp = page.cdp || (page.cdp = await page.context().newCDPSession(page));
    const pts = (f) => f.map((p, i) => ({ x: p.x, y: p.y, id: i }));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(frames[0]) }); if (hold) await page.waitForTimeout(hold);
    for (let k = 1; k < frames.length; k++) { await page.waitForTimeout(stepMs); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(frames[k]) }); }
    await page.waitForTimeout(stepMs); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    return;
  }
  const fire = (type, f) => page.evaluate(([type, f]) => { const el = document.getElementById('eb');
    f.forEach((p, i) => el.dispatchEvent(new PointerEvent(type, { clientX: p.x, clientY: p.y, pointerId: 31 + i, pointerType: 'touch', isPrimary: i === 0, bubbles: true, cancelable: true }))); }, [type, f]);
  await fire('pointerdown', frames[0]); if (hold) await page.waitForTimeout(hold);
  for (let k = 1; k < frames.length; k++) { await page.waitForTimeout(stepMs); await fire('pointermove', frames[k]); }
  await page.waitForTimeout(stepMs); await fire('pointerup', frames[frames.length - 1]);
}
/* the same, a step at a time (to screenshot mid-gesture) */
async function twoStart(lib, page, f) { page.two = f;
  if (lib.ENGINE !== 'webkit') { const cdp = page.cdp || (page.cdp = await page.context().newCDPSession(page)); return cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: f.map((p, i) => ({ x: p.x, y: p.y, id: i })) }); }
  return synth(page, 'pointerdown', f); }
async function twoMove(lib, page, f) { page.two = f;
  if (lib.ENGINE !== 'webkit') return page.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: f.map((p, i) => ({ x: p.x, y: p.y, id: i })) });
  return synth(page, 'pointermove', f); }
async function twoEnd(lib, page) { if (lib.ENGINE !== 'webkit') return page.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); return synth(page, 'pointerup', page.two); }
function synth(page, type, f) { return page.evaluate(([type, f]) => { const el = document.getElementById('eb');
  f.forEach((p, i) => el.dispatchEvent(new PointerEvent(type, { clientX: p.x, clientY: p.y, pointerId: 31 + i, pointerType: 'touch', isPrimary: i === 0, bubbles: true, cancelable: true }))); }, [type, f]); }
/* in-page analysis: window.__AN.amp(data, sr, t, f, win) = amplitude of the f Hz component around t (Hann-windowed
   Goertzel, window win s); peak(data, sr, t0, t1, f0, f1) = the strongest frequency in [f0, f1] (0.25 Hz scan + parabola) */
async function analysis(page) { await page.evaluate(() => { if (window.__AN) return;
  function g(d, i0, n, f, sr) { let re = 0, im = 0, ws = 0; for (let k = 0; k < n; k++) { const w = .5 - .5 * Math.cos(2 * Math.PI * (k + .5) / n), x = (d[i0 + k] || 0) * w, a = 2 * Math.PI * f * (i0 + k) / sr; re += x * Math.cos(a); im -= x * Math.sin(a); ws += w; } return 2 * Math.hypot(re, im) / ws; }
  window.__AN = { amp: (d, sr, t, f, win = .04) => { const n = Math.round(win * sr); return g(d, Math.round(t * sr - n / 2), n, f, sr); },
    peak: (d, sr, t0, t1, f0, f1) => { const i0 = Math.round(t0 * sr), n = Math.round((t1 - t0) * sr); let best = f0, bv = -1; const P = (f) => g(d, i0, n, f, sr);
      for (let f = f0; f <= f1; f += .25) { const v = P(f); if (v > bv) { bv = v; best = f; } }
      const a = P(best - .25), b = bv, c = P(best + .25), den = a - 2 * b + c; return { f: den < 0 ? best + .25 * .5 * (a - c) / den : best, amp: bv }; } }; }); }
/* a twist about (cx, cy): fingers r px from the centre, rotated from 0 to deg in n steps */
function twistFrames(cx, cy, deg, { r = 46, n = 24, start = 0 } = {}) {
  const out = []; for (let k = 0; k <= n; k++) { const a = (start + deg * k / n) * Math.PI / 180;
    out.push([{ x: cx - r * Math.cos(a), y: cy - r * Math.sin(a) }, { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }]); }
  return out;
}
const errorsOf = (page) => page.errors.filter(x => !/service ?worker/i.test(x));
const STD = [{ name: 'take-c', sec: 8, hz: 330, amp: .5 }, { name: 'take-b', sec: 8, hz: 660, amp: .5 }, { name: 'take-a', sec: 8, hz: 440, amp: .5 }];

async function scenario(lib) {
  const sfx = SFX(); const dir = lib.outDir('cliplab-base' + sfx); const br = await lib.browser(); const files = []; const checks = {}, info = {};
  const page = await openLab(lib, br, { wait: 900 });
  // 1. empty library
  const e = await page.evaluate(() => ({ empty: __CL.empty(), ready: __CL.ready(), clips: __CL.clips().length, file: __CL.view().file }));
  info.empty = e; await shot(page, dir, '0-empty', files);
  checks.emptyShowsFileBud = e.empty && e.ready && e.clips === 0;
  // 1b. the open-file bud opens the system picker (AT.takes.pick) and the chosen file becomes the scene
  const pf = await openLab(lib, br, { wait: 700 }); const fcP = pf.waitForEvent('filechooser', { timeout: 8000 });
  await tap(pf, e.file.x, e.file.y); const fc = await fcP; await fc.setFiles(require('path').join(__dirname, '..', 'signals', 'sine440.wav'));
  await settle(pf, 8000); await pf.waitForTimeout(300); const pk = await pf.evaluate(() => ({ empty: __CL.empty(), clips: __CL.clips().map(c => c.take), takes: __CL.takes().length }));
  info.picked = pk; await shot(pf, dir, '0b-picked', files);
  checks.fileBudPicks = !pk.empty && pk.takes === 1 && pk.clips.length === 3 && pk.clips.every(n => n === 'sine440');
  // 1c. the shared tempo moves (another tool): a warped clip follows it, an unwarped one keeps its seconds
  const tw = await pf.evaluate(async () => { const c = __CL.clips().find(k => k.lane === 1); return c; });
  await tap(pf, (await view(pf)).lanes[1], await yOf(pf, tw.s + tw.d / 2)); await pf.waitForTimeout(450);
  const wb = (await pf.evaluate(() => __CL.panel())).items.find(o => o.kind === 'warp'); await tap(pf, wb.x, wb.y); await pf.waitForTimeout(200);
  const t0 = (await view(pf)).tempo;
  const other = (t) => pf.evaluate((t) => { localStorage.setItem('audio.tempo', String(t)); const ch = new BroadcastChannel('audio'); ch.postMessage({ t: 'tempo', v: t, src: 'metro' }); setTimeout(() => ch.close(), 50); }, t);   // as another tool would
  await other(t0 * 2); await pf.waitForTimeout(400);
  const after = await pf.evaluate(() => ({ clips: __CL.clips(), tempo: __CL.view().tempo }));
  const w2 = after.clips.find(k => k.id === tw.id), u2 = after.clips.find(k => k.lane === 0);
  info.tempoFollow = { t0, after: after.tempo, warped: w2, unwarped: u2 };
  checks.warpedFollowsSharedTempo = after.tempo === t0 * 2 && lib.near(w2.d, tw.d / 2, 1e-9) && lib.near(u2.d, u2.sl, 1e-12);
  await other(t0); page.errors.push(...errorsOf(pf)); await pf.context().close();
  // 2. three takes
  await seed(page, STD);
  await reload(page);
  const cs = await clips(page), v = await view(page), tk = await page.evaluate(() => __CL.takes());
  info.clips = cs; info.view = v; info.takes = tk;
  const L0 = cs.filter(c => c.lane === 0), L1 = cs.filter(c => c.lane === 1);
  checks.layout = cs.length === 3 && L0.length === 2 && L1.length === 1 && L0[0].take === 'take-a' && L0[1].take === 'take-b' && L1[0].take === 'take-c';
  checks.touchingPair = L0.length === 2 && Math.abs(L0[1].s - L0[0].end) < 1e-9;
  checks.handles = cs.every(c => c.off > 0.5 && c.off + c.sl < 8 - 0.5);
  checks.fitsView = v.pps > 20 && v.TOP + (Math.max(...cs.map(c => c.end)) - v.vt) * v.pps < v.H - v.BOT;
  await shot(page, dir, '1-idle', files);
  // 3. tempo estimate on the takes' samples: the library is scanned only for the four newest takes, so check the
  //    estimator directly on two older ones by reloading with only them newest
  const p2 = await openLab(lib, br, { wait: 600 });
  await seed(p2, [{ name: 'tone', sec: 8, hz: 440, amp: .25 }, { name: 'click', wav: 'click120.wav', sec: 12 }]); await reload(p2);
  const t2 = await p2.evaluate(() => ({ takes: __CL.takes(), clips: __CL.clips(), tempo: __CL.view().tempo }));
  info.estimate = t2;
  const click = t2.takes.find(t => t.name === 'click'), tone = t2.takes.find(t => t.name === 'tone');
  const cClick = t2.clips.find(c => c.take === 'click'), cTone = t2.clips.find(c => c.take === 'tone');
  checks.tempoEstimateClick = !!click && click.est != null && Math.abs(click.est - 120) <= 1 && cClick.ots === 'est' && Math.abs(cClick.ot - 120) <= 1;
  checks.tempoFallbackTone = !!tone && tone.est === null && cTone.ots === 'shared' && cTone.ot === t2.tempo;
  await shot(p2, dir, '2-click-and-tone', files);
  const errors = errorsOf(page).concat(errorsOf(p2)); checks.noErrors = errors.length === 0;
  await lib.sheet(br, files, `${dir}/sheet.png`, 3, 200); await br.close();
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), engine: lib.ENGINE, checks, info, errors });
}
module.exports = scenario;
Object.assign(module.exports, { openLab, seed, settle, reload, clips, view, st, yOf, shot, drag, tap, twoFinger, twoStart, twoMove, twoEnd, twistFrames, analysis, errorsOf, STD, SFX });
