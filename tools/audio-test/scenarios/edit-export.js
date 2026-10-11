/* Editor save / export (owner, 2026-10-10: "save-export button ... bottom right button second row tools").
   The property row's fourth bud renders the MIXDOWN, stores it as a 'mix' take, and a second tap shares the WAV.
   Fixtures are real takes written through the library API (deterministic, asymmetric signals so a wrong direction or
   offset shows numerically):
     A  2.0 s rising chirp   track 0, s = 4 beats, reversed
     B  3.0 s two-tone ramp  track 1, s = 2 beats, offset 0.5 s, 2.0 s long
     C  2.4 s 'noise'        track 2, s = 5 beats, track MUTED, ends after everything else
     D  1.0 s decaying tone  placed live while AT.takes.get is held back 2.5 s -> the render must fetch it (busy state)
   1. prop dot -> the row shows the save bud; tap it -> busy (ring), then ready (green); a 'mix' take is in the library,
      length = end of the last AUDIBLE clip (A: 4 beats + 2 s) +-1 ms, samples = 0.8 x the sum of A(rev), B(off), D,
      each with the 4 ms linear declick at both of its edges (the clip model since the gesture port, 2026-10-10: playback
      and the mixdown play the per-clip baked buffers); without the ramps the clip edges would be off by > 0.05;
      C absent (window where only C would add)
   2. second tap on the green bud -> navigator.share called once, inside a user activation, with one audio/wav File whose
      header is 16-bit mono at the mix rate and whose samples equal the mix
   3. solo track 1 (timeline edited) -> the next tap renders again: only B
   4. no file sharing (canShare false) -> the second tap downloads the WAV instead
   5. empty timeline: the bud is dimmed and a tap does nothing */
const fs = require('fs');
const SHARE_STUB = () => {
  window.__shares = []; window.__noShare = false;
  const P = Navigator.prototype;
  Object.defineProperty(P, 'canShare', { configurable: true, writable: true, value: function (d) { return !window.__noShare && !!(d && d.files && d.files.length); } });
  Object.defineProperty(P, 'share', { configurable: true, writable: true, value: function (d) {
    const active = navigator.userActivation ? navigator.userActivation.isActive : null;   // read synchronously, at the call
    const f = d.files[0], rec = { n: d.files.length, name: f.name, type: f.type, size: f.size, active };
    window.__shares.push(rec);
    return f.arrayBuffer().then((b) => { const v = new DataView(b), s = (o, n) => String.fromCharCode(...new Uint8Array(b, o, n));
      rec.riff = s(0, 4) + s(8, 4); rec.ch = v.getUint16(22, true); rec.sr = v.getUint32(24, true); rec.bits = v.getUint16(34, true); rec.dataBytes = v.getUint32(40, true);
      const n = rec.dataBytes / 2, q = new Float32Array(n); for (let i = 0; i < n; i++) q[i] = v.getInt16(44 + i * 2, true) / 32768; window.__wavData = q; });
  } });
};
module.exports = async (lib) => {
  const br = await lib.browser(); const dir = lib.outDir('edit-export'); const shots = []; const W = lib.VIEW.width, H = lib.VIEW.height;
  const page = await lib.open(br, 'edit', { wait: 600 });
  await page.addInitScript(SHARE_STUB);
  const shot = async (n, clip) => { const f = `${dir}/${n}.png`; await page.screenshot(clip ? { path: f, clip } : { path: f }); shots.push(f); return f; };
  const CORNER = { x: W - 170, y: H - 200, width: 170, height: 200 };
  const checks = {}, info = {};
  const BEAT = await page.evaluate(() => __E.BEAT);

  // fixtures: three takes, a session that places them, then reload so the editor restores it
  const ids = await page.evaluate(async () => {
    const sr = 48000, mk = (sec, f) => { const d = new Float32Array(Math.round(sr * sec)); for (let i = 0; i < d.length; i++) d[i] = f(i / sr, i, d.length); return d; };
    let z = 12345; const rnd = () => ((z = (z * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
    const A = mk(2.0, (t, i, n) => 0.35 * (i / n) * Math.sin(6.2832 * (180 * t + 120 * t * t)));
    const B = mk(3.0, (t) => 0.3 * (0.2 + 0.8 * t / 3) * (Math.sin(6.2832 * 260 * t) * 0.7 + Math.sin(6.2832 * 610 * t) * 0.3));
    const C = mk(2.4, () => 0.4 * rnd());
    const D = mk(1.0, (t) => 0.4 * Math.exp(-3 * t) * Math.sin(6.2832 * 520 * t));
    const put = async (name, data) => (await AT.takes.put({ name, kind: 'rec', sr, data })).id;
    return { A: await put('fx-a', A), B: await put('fx-b', B), C: await put('fx-c', C), D: await put('fx-d', D) };
  });
  await page.evaluate(([ids, BEAT]) => localStorage.setItem('audio.session.edit', JSON.stringify({ v: 2, tl: BEAT * 4 * 14, ph: 0, vt: 0, pps: 30, snap: 1, push: 0, hx: 0,
    tracks: [{ m: 0, s: 0, a: 0 }, { m: 0, s: 0, a: 0 }, { m: 1, s: 0, a: 0 }],
    clips: [{ k: ids.A, t: 0, s: 4 * BEAT, d: 2, off: 0, rev: 1 }, { k: ids.B, t: 1, s: 2 * BEAT, d: 2, off: 0.5, rev: 0 }, { k: ids.C, t: 2, s: 5 * BEAT, d: 2.4, off: 0, rev: 0 }] })), [ids, BEAT]);
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(1200);
  const restored = await page.evaluate(() => __D.clips.map(c => ({ k: c.k, t: c.t, s: c.s, d: c.d, off: c.off, rev: c.rev })));
  checks.fixturesRestored = restored.length === 3;

  // D placed live while the library is slow: the render has to fetch it itself
  await page.evaluate((id) => { const g = window.__getRaw = AT.takes.get; AT.takes.get = (k) => new Promise(r => setTimeout(() => r(g(k)), 2500)); __S.ph = 0;
    localStorage.setItem('audio.place', JSON.stringify([{ id, at: 'playhead' }])); new BroadcastChannel('audio').postMessage({ t: 'place', v: id }); }, ids.D);
  await page.waitForFunction((id) => __D.clips.some(c => c.k === id), ids.D, { timeout: 3000 });
  const dClip = await page.evaluate((id) => { const c = __D.clips.find(c => c.k === id); return { t: c.t, s: c.s, d: c.d, loaded: __E.slots().find(s => s.id === id).loaded }; }, ids.D);
  info.dClip = dClip;

  // 1. the row with the new bud, then the tap
  await page.mouse.click(W - 34, H - 30); await page.waitForTimeout(450);
  const bud = await page.evaluate(() => __E.bud(3)); info.bud = bud;
  const buds = await page.evaluate(() => [0, 1, 2, 3].map(i => __E.bud(i)));
  info.buds = buds;
  const icons = await page.evaluate(() => [...document.querySelectorAll('#el i')].filter(i => i.style.visibility === 'visible').map(i => i.className.replace('ti ti-', '')));
  checks.rowShowsSaveBud = icons.includes('device-floppy') && icons.includes('magnet') && icons.includes('stack-2');
  // clear of the play dot (x <= W/2+28) and the bottom-left corner; inside the screen; ~38 px apart along the arc
  const spacing = [Math.hypot(buds[2].x - buds[1].x, buds[2].y - buds[1].y), Math.hypot(buds[1].x - buds[0].x, buds[1].y - buds[0].y), Math.hypot(buds[0].x - buds[3].x, buds[0].y - buds[3].y)];
  info.spacing = spacing.map(v => +v.toFixed(1));
  checks.rowPlacement = buds.every(b => b.x - 15 > W / 2 + 28 && b.x + 20 < W && b.y + 15 < H) && spacing.every(v => v > 36) && lib.near(buds[2].x, W - 94, 0.5) && lib.near(buds[2].y, H - 30, 0.5);
  await shot('1-row-idle'); await shot('1-row-idle-corner', CORNER);
  await page.mouse.click(bud.x, bud.y); await page.waitForTimeout(350);
  const busy = await page.evaluate(() => __E.mix());
  await shot('2-busy-corner', CORNER);
  info.busy = busy;
  checks.busyWhileFetching = busy.st === 'busy' && busy.p > 0.1 && busy.p < 0.9 && busy.shown > 0.05;
  // the rest of the editor keeps working while it renders: play starts and stops
  await page.mouse.click(W / 2, H - 30); await page.waitForTimeout(250); const playingDuring = await page.evaluate(() => __S.play);
  await page.mouse.click(W / 2, H - 30); await page.waitForTimeout(100);
  checks.notBlocking = playingDuring === true;
  // the play tap closed the row (as any tap outside it does); reopen to watch the bud
  await page.mouse.click(W - 34, H - 30);
  await page.waitForFunction(() => __E.mix().st === 'ready', null, { timeout: 8000 });
  await page.waitForTimeout(450);
  const ready = await page.evaluate(() => __E.mix()); info.ready = ready;
  await shot('3-ready'); await shot('3-ready-corner', CORNER);
  const readyIcons = await page.evaluate(() => [...document.querySelectorAll('#el i')].filter(i => i.style.visibility === 'visible').map(i => i.className.replace('ti ti-', '')));
  checks.readyShowsShare = readyIcons.includes('share-2');

  // the library: a 'mix' take, its length and samples
  const lib1 = await page.evaluate(async () => (await AT.takes.list()).map(m => ({ id: m.id, name: m.name, kind: m.kind, sr: m.sr, len: m.len, dur: m.dur })));
  const mixes = lib1.filter(m => m.kind === 'mix'); info.mixes = mixes;
  checks.oneMixTake = mixes.length === 1 && /^mix-\d{8}-\d{6}$/.test(mixes[0].name) && mixes[0].id === ready.id;
  const B4 = 4 * BEAT, B2 = 2 * BEAT;
  // windows: D alone, B alone (with its offset), A+B overlap, A alone (reversed) where the muted C would add
  const WINS = [[0.05, 0.95, 'D'], [B2 + 0.05, B4 - 0.05, 'B (offset 0.5 s)'], [B4 + 0.05, B2 + 2 - 0.05, 'A rev + B'], [B2 + 2 + 0.05, B4 + 2 - 0.05, 'A rev alone, muted C under it']];
  /* expected mix, computed independently from the takes and the timeline document: 0.8 x each audible clip's samples,
     times the declick (linear over the first and the last 4 ms of the clip: t / 4 ms and (d - t) / 4 ms) */
  const cmp = (mixId, wins) => page.evaluate(async ([mixId, wins]) => {
    const g = window.__getRaw || AT.takes.get, mix = await g(mixId), sr = mix.sr;
    const tr = __D.tracks, solo = tr.some(t => t.s), aud = (t) => !tr[t].m && (!solo || tr[t].s);
    const clips = __D.clips.filter(c => !c.dying), on = clips.filter(c => aud(c.t));
    const end = Math.max(...on.map(c => c.s + c.d)), N = Math.round(end * sr);
    const L = Math.max(N, mix.data.length) + 10, exp = new Float32Array(L), alt = new Float32Array(L), cmuted = new Float32Array(L), raw = new Float32Array(L), DK = 0.004;
    for (const c of clips) {
      const src = (await g(c.k)).data, s0 = Math.round(c.s * sr), o0 = Math.round(c.off * sr), n = Math.round(c.d * sr), e0 = Math.round((c.off + c.d) * sr);
      for (let i = 0; i < n; i++) { const t = i / sr, dk = Math.min(1, t / DK) * Math.min(1, Math.max(0, (c.d - t) / DK)), u = c.rev ? src[e0 - 1 - i] : src[o0 + i], v = u * dk, vf = src[o0 + i] * dk;
        if (aud(c.t)) { exp[s0 + i] += 0.8 * v; alt[s0 + i] += 0.8 * vf; raw[s0 + i] += 0.8 * u; } else cmuted[s0 + i] += 0.8 * v; }
    }
    const win = ([a, b, label]) => { let e = 0, ea = 0, em = 0, pk = 0; const i0 = Math.round(a * sr), i1 = Math.min(mix.data.length, Math.round(b * sr));
      for (let i = i0; i < i1; i++) { const d = mix.data[i]; e = Math.max(e, Math.abs(d - exp[i])); ea = Math.max(ea, Math.abs(d - alt[i])); em = Math.max(em, Math.abs(d - exp[i] - cmuted[i])); pk = Math.max(pk, Math.abs(d)); }
      return { label, from: +a.toFixed(3), to: +b.toFixed(3), err: +e.toExponential(2), errIfForward: +ea.toExponential(2), errIfMutedPlayed: +em.toExponential(2), peak: +pk.toFixed(3) }; };
    let all = 0, noDk = 0; for (let i = 0; i < mix.data.length; i++) { all = Math.max(all, Math.abs(mix.data[i] - exp[i])); noDk = Math.max(noDk, Math.abs(mix.data[i] - raw[i])); }
    return { sr, len: mix.data.length, expLen: N, end, lenErrMs: +((mix.data.length - N) / sr * 1000).toFixed(3), all: +all.toExponential(2), errIfNoDeclick: +noDk.toExponential(2), win: (wins || []).map(win), clips: on.map(c => [c.t, c.s, c.d, c.off, c.rev]) };
  }, [mixId, wins]);
  const r1 = await cmp(ready.id, WINS); info.mix1 = r1; const wr = r1.win;
  checks.mixLength = lib.near(r1.end, B4 + 2, 1e-9) && Math.abs(r1.lenErrMs) <= 1 && lib.near(r1.len / r1.sr, B4 + 2, 0.001);
  checks.mixSamples = r1.all < 2e-4 && wr.every(w => w.err < 2e-4 && w.peak > 0.02);
  checks.declickInMix = r1.errIfNoDeclick > 0.05;
  checks.reversedMatters = wr[3].errIfForward > 0.01;
  checks.mutedAbsent = wr[3].errIfMutedPlayed > 0.05;

  // 2. the second tap shares the file (inside the tap's activation)
  await page.mouse.click(bud.x, bud.y); await page.waitForTimeout(500);
  const sh = await page.evaluate(() => window.__shares.slice()); info.shares = sh;
  const wavCmp = await page.evaluate(async (id) => { const m = await window.__getRaw(id), q = window.__wavData; if (!q) return null; let e = 0; for (let i = 0; i < m.data.length; i++) e = Math.max(e, Math.abs(q[i] - m.data[i])); return { n: q.length, err: +e.toExponential(2) }; }, ready.id);
  info.wavVsMix = wavCmp;
  const s0 = sh[0] || {};
  checks.sharedOnce = sh.length === 1 && s0.n === 1 && s0.type === 'audio/wav' && s0.name === ready.name + '.wav';
  checks.sharedInGesture = s0.active === true || (s0.active === null && lib.ENGINE === 'webkit');
  checks.wavFormat = s0.riff === 'RIFFWAVE' && s0.ch === 1 && s0.bits === 16 && s0.sr === r1.sr && s0.dataBytes === r1.len * 2 && s0.size === 44 + r1.len * 2;
  checks.wavSamples = !!wavCmp && wavCmp.n === r1.len && wavCmp.err < 1e-4;
  const after = await page.evaluate(() => __E.mix().st); checks.idleAfterShare = after === 'idle';
  await shot('4-after-share-corner', CORNER);

  // 3. solo track 1 -> re-render: only B, ending at 2 beats + 2 s
  await page.evaluate(() => { __D.tracks[1].s = true; });
  await page.mouse.click(bud.x, bud.y);
  await page.waitForFunction((id) => __E.mix().st === 'ready' && __E.mix().id !== id, ready.id, { timeout: 8000 });
  const ready2 = await page.evaluate(() => __E.mix());
  const r2 = await cmp(ready2.id, []); info.mix2 = r2;
  checks.soloRespected = lib.near(r2.end, B2 + 2, 1e-9) && Math.abs(r2.lenErrMs) <= 1 && r2.all < 2e-4 && r2.clips.length === 1 && r2.clips[0][0] === 1;

  // 4. a browser without file sharing: the second tap downloads the WAV
  await page.evaluate(() => { window.__noShare = true; __D.tracks[1].s = false; });
  await page.mouse.click(bud.x, bud.y);
  await page.waitForFunction((id) => __E.mix().st === 'ready' && __E.mix().id !== id, ready2.id, { timeout: 8000 });
  const ready3 = await page.evaluate(() => __E.mix());
  const dlP = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
  await page.mouse.click(bud.x, bud.y);
  const dl = await dlP; let dlInfo = null;
  if (dl) { const p = await dl.path().catch(() => null); dlInfo = { name: dl.suggestedFilename(), bytes: p && fs.existsSync(p) ? fs.statSync(p).size : null }; }
  info.download = dlInfo;
  checks.downloadFallback = !!dlInfo && dlInfo.name === ready3.name + '.wav' && dlInfo.bytes === 44 + ready3.len * 2 && (await page.evaluate(() => window.__shares.length)) === 1;
  const libN = await page.evaluate(async () => (await AT.takes.list()).filter(m => m.kind === 'mix').length);
  checks.threeMixesSaved = libN === 3;

  const errors = page.errors.filter(e => !/service ?worker/i.test(e));
  await page.context().close();

  // 5. empty timeline: dimmed, inert
  const p2 = await lib.open(br, 'edit', { wait: 900 });
  await p2.mouse.click(W - 34, H - 30); await p2.waitForTimeout(450);
  const eb = await p2.evaluate(() => __E.bud(3));
  const op = await p2.evaluate(() => { const i = [...document.querySelectorAll('#el i')].find(i => i.className === 'ti ti-device-floppy'); return i ? +i.style.opacity : null; });
  let f = `${dir}/5-empty-dimmed-corner.png`; await p2.screenshot({ path: f, clip: CORNER }); shots.push(f);
  await p2.mouse.click(eb.x, eb.y); await p2.waitForTimeout(600);
  const e5 = await p2.evaluate(async () => ({ st: __E.mix().st, mixes: (await AT.takes.list()).filter(m => m.kind === 'mix').length, propOpen: __S.propOpen }));
  info.empty = { op, ...e5 };
  checks.emptyDimmedInert = op !== null && op < 0.5 && e5.st === 'idle' && e5.mixes === 0 && !!e5.propOpen;
  const errors2 = p2.errors.filter(e => !/service ?worker/i.test(e));
  await p2.context().close();
  checks.noErrors = errors.length === 0 && errors2.length === 0;

  await lib.sheet(br, shots.filter(s => /corner/.test(s)), `${dir}/sheet.png`, 5, 170);
  await br.close();
  return lib.result(dir, { pass: Object.values(checks).every(Boolean), engine: lib.ENGINE, checks, info, restored, ids, errors: errors.concat(errors2) });
};
