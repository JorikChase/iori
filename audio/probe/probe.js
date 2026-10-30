/* Audio probe — Stage 1 of audio/PLAN.md. Four device gates behind big buttons, results kept in localStorage after
   every step and exported as one block of text. Nothing here is shared with the live app.
   Test hooks: window.__S (state), ?quick (short steps, two kernels), ?memsim=N (reload at N MB as a failure would). */
(() => {
  'use strict';
  const KEY = 'audio-probe-v1', MARK = 'audio-probe-mark', Q = new URLSearchParams(location.search), QUICK = Q.has('quick'), MEMSIM = +Q.get('memsim') || 0;
  const VERSION = 1, standalone = !!(navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches));
  const MODE = standalone ? 'installed' : 'browser';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const round = (x, d = 1) => (x == null || !isFinite(x) ? x : +x.toFixed(d));
  const ms = (s) => (s == null ? null : round(s * 1000, 2));
  const db = (x) => (x > 0 ? round(20 * Math.log10(x), 1) : null);
  const stamp = () => new Date().toISOString().slice(0, 19) + 'Z';

  /* ---------- results ---------- */
  const fresh = () => ({ v: VERSION, device: '', launches: [], mic: [], load: [], iso: [], mem: [] });
  let R = fresh(), storeError = null;
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v === VERSION) R = s; } catch (e) { storeError = String(e); }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(R)); storeError = null; } catch (e) { storeError = String(e); } }

  /* the IndexedDB side: the picked recording, and a second copy of the memory mark, awaited before each allocation */
  const idb = () => new Promise((ok, no) => {
    const r = indexedDB.open('audio-probe', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
  });
  async function kvPut(k, v) { const d = await idb(); await new Promise((ok, no) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = ok; t.onerror = t.onabort = () => no(t.error); }); d.close(); }
  async function kvGet(k) { const d = await idb(); const v = await new Promise((ok, no) => { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => ok(q.result); q.onerror = () => no(q.error); }); d.close(); return v; }

  /* ---------- small DOM ---------- */
  const root = document.getElementById('root');
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const k in attrs || {}) { if (k === 'on') e.onclick = attrs.on; else if (k === 'cls') e.className = attrs.cls; else if (attrs[k] !== undefined) e[k] = attrs[k]; }
    for (const k of kids.flat()) if (k != null) e.append(k);
    return e;
  }
  const btn = (label, sub, on, cls) => h('button', { on, cls }, label, sub ? h('span', { cls: 's' }, sub) : null);
  function show(...kids) { root.replaceChildren(...kids.flat(Infinity).filter(Boolean)); window.scrollTo(0, 0); S.view = kids[0] && kids[0].dataset ? kids[0].dataset.v : null; }
  const back = () => btn('Back', null, home, 'sm');
  const title = (t, v) => { const e = h('h2', {}, t); e.dataset.v = v; return e; };
  const S = window.__S = { get R() { return R; }, view: 'home', busy: false, report: () => report() };

  /* one AudioContext at a time, made inside a tap, and the screen kept awake during long runs */
  let wake = null;
  async function keepAwake(on) {
    try {
      if (on && !wake && navigator.wakeLock) wake = await navigator.wakeLock.request('screen');
      if (!on && wake) { await wake.release(); wake = null; }
    } catch (e) { wake = null; }
  }

  /* ---------- launch log: every load, which also is the offline gate ---------- */
  const launch = { at: stamp(), mode: MODE, online: navigator.onLine, nav: (performance.getEntriesByType('navigation')[0] || {}).type, controlled: !!(navigator.serviceWorker && navigator.serviceWorker.controller), coi: !!window.crossOriginIsolated, sab: typeof SharedArrayBuffer !== 'undefined' };
  R.launches.push(launch); R.launches = R.launches.slice(-40); save();

  async function selfCheck() {
    // no tap needed: an OfflineAudioContext proves worklet + kernel + SAB came through this launch's delivery path
    const c = new OfflineAudioContext(1, 1280, 48000);
    await c.audioWorklet.addModule('load-worklet.js');
    new AudioWorkletNode(c, 'probe-tone').connect(c.destination);
    const out = await c.startRendering(), peak = out.getChannelData(0)[1000];
    const w = await WebAssembly.instantiate(await (await fetch('simd.wasm')).arrayBuffer(), { env: {} });
    w.instance.exports.init(48000); w.instance.exports.init4(); w.instance.exports.blep_svf4(16);
    const o = new Float32Array(w.instance.exports.memory.buffer, w.instance.exports.outp(), 128);
    return { worklet: peak > 0.2, wasm: o.some((x) => x !== 0) };
  }
  async function afterLoad() {
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('sw.js', { scope: './' });
        if (navigator.serviceWorker.controller) { const r = await fetch('sw-status', { cache: 'no-store' }); launch.sw = await r.json(); }
      } catch (e) { launch.swError = String(e); }
    } else launch.swError = 'no serviceWorker';
    try { const r = await fetch('manifest.json?ping=' + Date.now(), { cache: 'no-store' }); launch.net = r.ok; } catch (e) { launch.net = false; }
    try { launch.check = await selfCheck(); } catch (e) { launch.check = { error: String(e) }; }
    save(); S.ready = true;
    if (S.view === 'iso') isoView();
    if (S.view === 'home') home();
  }

  /* a memory run that never reached its finish line ended in a kill: read the mark this load, before anything else */
  async function readMark() {
    let a = null, b = null;
    try { a = JSON.parse(localStorage.getItem(MARK)); } catch (e) { /* no mark */ }
    try { b = await kvGet(MARK); } catch (e) { /* no mark */ }
    const m = (a && b) ? (a.safe >= b.safe ? a : b) : a || b;
    if (!m || !m.running) return;
    R.mem.push({ at: m.at, mode: m.mode, kind: m.kind, stepMB: 100, lastSafeMB: m.safe, failedAtMB: m.next, how: 'page was killed', navOnReturn: launch.nav, gapSec: round((Date.now() - m.t) / 1000), steps: m.steps });
    save(); localStorage.removeItem(MARK); try { await kvPut(MARK, null); } catch (e) { /* the local copy is gone already */ }
  }

  /* ---------- home ---------- */
  const lastOf = (a) => a[a.length - 1];
  function home() {
    const micRun = R.mic.find((r) => r.active), loadRun = lastOf(R.load);
    const iso = lastOf(R.iso), off = R.launches.filter((l) => l.net === false && l.check).length;
    const name = h('input', { type: 'text', placeholder: 'Device, e.g. iPhone 15 Pro, iOS 27.2', value: R.device });
    name.oninput = () => { R.device = name.value; save(); };
    const mem = R.mem.filter((m) => m.lastSafeMB != null), memBest = mem.length ? mem[mem.length - 1] : null;
    const e = h('h1', {}, 'Audio probe'); e.dataset.v = 'home';
    show(e,
      h('p', { cls: 'dim' }, `${standalone ? 'Installed app' : 'Browser, not installed'} · ${window.crossOriginIsolated ? 'isolated' : 'NOT isolated'}`),
      !window.crossOriginIsolated ? h('p', { cls: 'bad' }, 'Isolation headers are missing here, so gates 2 and 3 will report less.') : null,
      storeError ? h('p', { cls: 'bad' }, 'Results cannot be saved: ' + storeError) : null,
      name,
      btn('1  Microphone and playback', micRun ? 'Run in progress, tap to continue' : `${R.mic.filter((r) => r.done).length} routes done`, micView),
      btn('2  Worklet load', loadRun ? `${Object.keys(loadRun.kernels).length} kernels · ${loadRun.done ? 'finished' : 'unfinished'}` : 'About 6 minutes, keep the page open', loadView),
      btn('3  Isolation and offline', iso ? `Tested · ${off} offline launches` : 'Under a minute, then one airplane mode launch', isoView),
      btn('4  Memory ceiling', memBest ? `Last: ${memBest.lastSafeMB} MB safe` : 'This one is meant to crash the page', memView),
      btn('Copy results', 'One block of text to paste to Claude', resultsView, 'go'),
      standalone ? null : h('p', { cls: 'dim' }, 'Run everything here, then Share → Add to Home Screen, open that icon and run everything again. The installed app keeps separate results, so copy from both.'));
  }

  /* ---------- gate 1: microphone and playback ---------- */
  const CONS_APP = { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } };   // audio/shared.js CONS
  const CONS_EC = { audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false } };
  const PHASES = [
    { id: 'base', t: 'No microphone', say: 'Normal playback. This is your reference.', act: 'play' },
    { id: 'app', t: 'Mic open, today’s settings', say: 'Echo cancellation off, the way the app records now.', act: 'mic', cons: CONS_APP },
    { id: 'app-closed', t: 'Mic closed', say: 'The same playback with the mic shut. Has it recovered?', act: 'close' },
    { id: 'app-new', t: 'Audio restarted', say: 'A new audio context, what a recovery button would do.', act: 'rebuild' },
    { id: 'reload', t: 'After a page reload', say: 'A clean session, and the reference for the next mic test.', act: 'reload' },
    { id: 'ec', t: 'Mic open, echo cancellation on', say: 'Listen for crackle across the whole sound.', act: 'mic', cons: CONS_EC },
    { id: 'ec-closed', t: 'Mic closed', say: 'The same playback with the mic shut. Has it recovered?', act: 'close' },
    { id: 'ec-new', t: 'Audio restarted', say: 'A new audio context, what a recovery button would do.', act: 'rebuild' }
  ];
  const ROUTES = ['Speaker', 'Wired', 'USB-C', 'AirPods', 'Other BT'];
  const QUESTIONS = [
    ['where', 'Where do you hear it?', ['Speaker', 'Earpiece', 'Headphones', 'Nowhere']],
    ['level', 'How loud, against the first step?', ['Same', 'Quieter', 'Far quieter', 'Silent']],
    ['crackle', 'Crackle or dropouts?', ['Clean', 'A little', 'Bad']],
    ['stereo', 'Use Left and Right below. Is it stereo?', ['Stereo', 'Mono', 'Can’t tell']]
  ];
  const P = { ctx: null, src: null, buf: null, file: null, gL: null, gR: null, mic: null, micAna: null, micSrc: null, ear: 'both', auto: null, tick: 0, raf: 0 };

  function buildPlayer() {
    const c = P.ctx = new AudioContext();
    const split = c.createChannelSplitter(2), merge = c.createChannelMerger(2);
    P.gL = c.createGain(); P.gR = c.createGain();
    P.src = c.createBufferSource(); P.src.buffer = P.buf; P.src.loop = true;
    P.src.connect(split); split.connect(P.gL, 0); split.connect(P.gR, P.buf.numberOfChannels > 1 ? 1 : 0);
    P.gL.connect(merge, 0, 0); P.gR.connect(merge, 0, 1); merge.connect(c.destination);
    earSet(P.ear);
    c.onstatechange = () => note('ctx ' + c.state);
    c.resume(); P.src.start();
  }
  function earSet(e) { P.ear = e; if (P.gL) { P.gL.gain.value = e === 'right' ? 0 : 1; P.gR.gain.value = e === 'left' ? 0 : 1; } }
  function dropPlayer() { if (P.src) { try { P.src.stop(); } catch (e) { /* never started */ } } if (P.ctx) { P.ctx.onstatechange = null; P.ctx.close().catch(() => {}); } P.ctx = P.src = P.gL = P.gR = null; }
  function closeMic() { if (P.mic) { P.mic.getTracks().forEach((t) => t.stop()); note('mic stopped'); } if (P.micSrc) P.micSrc.disconnect(); P.mic = P.micAna = P.micSrc = null; }
  async function openMic(cons) {
    P.mic = await navigator.mediaDevices.getUserMedia(cons);
    const tr = P.mic.getAudioTracks()[0];
    for (const ev of ['mute', 'unmute', 'ended']) tr.addEventListener(ev, () => note('track ' + ev));
    P.micSrc = P.ctx.createMediaStreamSource(P.mic); P.micAna = P.ctx.createAnalyser(); P.micAna.fftSize = 2048;
    const zero = P.ctx.createGain(); zero.gain.value = 0; P.micSrc.connect(P.micAna); P.micAna.connect(zero); zero.connect(P.ctx.destination);
    if (P.ctx.state !== 'running') P.ctx.resume();
  }
  function note(s) { if (P.auto) P.auto.events.push(`${round((performance.now() - P.auto.t0) / 1000)}s ${s}`); }

  /* every phase logs what the page can see by itself; output lag rising means frames did not reach the hardware */
  function autoStart() {
    clearInterval(P.tick); P.tick = 0; cancelAnimationFrame(P.raf);
    P.auto = { t0: performance.now(), events: [], peak: 0, drops: 0, dropMs: 0 };
    let wmin = Infinity, n = 0, ref = null;
    P.tick = setInterval(() => {
      const c = P.ctx; if (!c || c.state !== 'running' || c.currentTime < 0.2) return;   // a context still starting is not a dropout
      const lag = performance.now() - c.currentTime * 1000;
      if (lag < wmin) wmin = lag;
      if (++n === 10) { if (ref == null || wmin < ref) ref = wmin; else if (wmin - ref > 30) { P.auto.drops++; P.auto.dropMs += wmin - ref; ref = wmin; } wmin = Infinity; n = 0; }
    }, 50);
    const meter = () => {
      if (P.micAna) {
        const b = new Float32Array(1024); P.micAna.getFloatTimeDomainData(b);
        let p = 0; for (let i = 0; i < b.length; i++) { const a = Math.abs(b[i]); if (a > p) p = a; }
        if (p > P.auto.peak) P.auto.peak = p;
        const m = document.getElementById('micbar'); if (m) m.style.width = Math.min(100, p * 200) + '%';
      }
      const st = document.getElementById('ctxstate');
      if (st && P.ctx) st.textContent = P.ctx.state === 'running' ? '' : 'Audio is ' + P.ctx.state;
      const re = document.getElementById('resume'); if (re) re.hidden = !P.ctx || P.ctx.state === 'running';
      P.raf = requestAnimationFrame(meter);
    };
    meter();
  }
  /* synchronous, because the next phase has to start inside this tap: iOS only lets a context run from one */
  function autoEnd() {
    clearInterval(P.tick); P.tick = 0; cancelAnimationFrame(P.raf);
    const c = P.ctx, tr = P.mic && P.mic.getAudioTracks()[0], a = P.auto;
    const out = {
      state: c && c.state, sr: c && c.sampleRate, baseMs: c && ms(c.baseLatency), outMs: c && ms(c.outputLatency), chMax: c && c.destination.maxChannelCount,
      session: navigator.audioSession ? navigator.audioSession.type : null,
      settings: tr ? (({ echoCancellation, noiseSuppression, autoGainControl, sampleRate, channelCount, latency }) => ({ ec: echoCancellation, ns: noiseSuppression, agc: autoGainControl, sr: sampleRate, ch: channelCount, latMs: ms(latency) }))(tr.getSettings()) : null,
      track: tr ? { muted: tr.muted, ready: tr.readyState, label: tr.label } : null,
      micPeakDb: P.mic ? (a.peak > 0 ? db(a.peak) : -999) : null, drops: a.drops, dropMs: Math.round(a.dropMs), events: a.events.slice(0, 20)
    };
    navigator.mediaDevices.enumerateDevices().then((d) => {
      out.inputs = d.filter((x) => x.kind === 'audioinput').map((x) => x.label); out.outputs = d.filter((x) => x.kind === 'audiooutput').map((x) => x.label); save();
    }).catch(() => {});
    return out;
  }

  async function decodeFile(blob) {
    const c = new OfflineAudioContext(2, 1, 48000), buf = await c.decodeAudioData(blob.bytes.slice(0));
    const l = buf.getChannelData(0), r = buf.getChannelData(buf.numberOfChannels > 1 ? 1 : 0);
    let m = 0, s = 0; const hop = Math.max(1, l.length >> 18);
    for (let i = 0; i < l.length; i += hop) { const a = (l[i] + r[i]) / 2, b = (l[i] - r[i]) / 2; m += a * a; s += b * b; }
    P.buf = buf; P.file = { name: blob.name, ch: buf.numberOfChannels, sr: buf.sampleRate, sec: round(buf.duration), sideDb: m > 0 ? db(Math.sqrt(s / m) || 0) : null };
  }
  async function loadKept() { if (P.buf) return; const b = await kvGet('file').catch(() => null); if (b) { try { await decodeFile(b); } catch (e) { P.fileError = String(e); } } }
  function pickFile() {
    const fi = document.createElement('input'); fi.type = 'file'; fi.style.display = 'none';   // no accept filter: iPadOS greys out WAV with audio/*
    fi.onchange = async () => {
      const f = fi.files && fi.files[0]; fi.remove(); if (!f) return;
      P.fileError = null;
      try { const kept = { name: f.name, bytes: await f.arrayBuffer() }; await decodeFile(kept); await kvPut('file', kept).catch(() => {}); } catch (e) { P.buf = P.file = null; P.fileError = 'That file does not decode here. Pick a WAV, M4A or MP3.'; }
      micView();
    };
    document.body.append(fi); fi.click();
  }

  async function micView() {
    const open = R.mic.find((r) => r.active);
    if (open) {
      await loadKept();
      const e = title('Continue the mic test', 'mic');
      return show(e, h('p', {}, `${open.route} · next is step ${open.i + 1} of ${PHASES.length}: ${PHASES[open.i].t}`),
        P.buf ? btn('Tap to play', null, () => enter(open, open.i), 'go') : btn('Choose the recording again', null, pickFile, 'go'),
        P.fileError ? h('p', { cls: 'bad' }, P.fileError) : null, btn('Abandon this run', null, () => { open.active = false; save(); micView(); }, 'sm'), back());
    }
    await loadKept();
    let route = null;
    const rows = h('div', { cls: 'row' }, ROUTES.map((r) => h('button', { on: (e) => { route = r; [...rows.children].forEach((b) => b.classList.toggle('on', b === e.currentTarget)); start.disabled = !P.buf; } }, r)));
    const start = btn('Start', 'Eight steps, about a minute each', () => beginRun(route), 'go'); start.disabled = true;
    const f = P.file;
    show(title('Microphone and playback', 'mic'),
      h('p', { cls: 'dim' }, 'Use a recording you know well, wide stereo and with quiet passages. Repeat once per output: speaker, wired, USB-C, AirPods. Turn the silent mode off first.'),
      btn(f ? `Recording: ${f.name}` : 'Choose a recording', f ? `${f.ch} ch · ${f.sr} Hz · ${f.sec} s · tap to change` : 'From Files', pickFile),
      f && f.ch < 2 ? h('p', { cls: 'bad' }, 'This file is mono, so the stereo question cannot be answered. Pick a stereo one.') : null,
      f && f.ch > 1 && f.sideDb != null && f.sideDb < -30 ? h('p', { cls: 'bad' }, 'Left and right are almost identical in this file. Pick a wider one.') : null,
      P.fileError ? h('p', { cls: 'bad' }, P.fileError) : null,
      h('h3', {}, 'What is plugged in right now?'), rows, start,
      R.mic.length ? h('p', { cls: 'dim' }, R.mic.filter((r) => r.done).map((r) => r.route).join(', ') || null) : null, back());
  }
  function beginRun(route) {
    const run = { at: stamp(), mode: MODE, route, file: P.file, i: 0, active: true, phases: [], constraints: { app: CONS_APP.audio, ec: CONS_EC.audio } };
    R.mic.push(run); save(); enter(run, 0);
  }
  async function enter(run, i) {
    const ph = PHASES[i]; run.i = i; save();
    if (ph.act === 'reload' && run.reloaded !== i) { closeMic(); dropPlayer(); run.reloaded = i; save(); location.reload(); return; }
    let error = null;
    autoStart();
    try {
      if (ph.act === 'rebuild') dropPlayer();
      if (!P.ctx) buildPlayer();   // also after a reload in mid-run: every phase plays
      if (ph.act === 'mic') await openMic(ph.cons);
      else if (ph.act === 'close') closeMic();
    } catch (e) { error = e.name + ': ' + e.message; note('error ' + error); }
    phaseView(run, i, error);
  }
  function phaseView(run, i, error) {
    const ph = PHASES[i], ans = {};
    const next = btn(i + 1 < PHASES.length ? 'Next step' : 'Finish', null, () => {
      next.disabled = true;
      run.phases.push({ id: ph.id, ans, error, auto: autoEnd() }); run.i = i + 1;
      if (i + 1 < PHASES.length) { save(); enter(run, i + 1); }
      else { closeMic(); dropPlayer(); run.active = false; run.done = true; save(); micView(); }
    }, 'go');
    next.disabled = true;
    const q = QUESTIONS.map(([k, ask, opts]) => {
      let text = ask;
      if (k === 'level' && i === 0) text = 'Set your volume now and leave it there. Then tap Same.';
      const row = h('div', { cls: 'row' }, opts.map((o) => h('button', { on: (e) => { ans[k] = o; [...row.children].forEach((b) => b.classList.toggle('on', b === e.currentTarget)); next.disabled = QUESTIONS.some(([x]) => !ans[x]); } }, o)));
      return [h('h3', {}, text), row];
    });
    const ears = h('div', { cls: 'row' }, ['left', 'both', 'right'].map((x) => h('button', { cls: P.ear === x ? 'on' : '', on: (e) => { earSet(x); [...ears.children].forEach((b) => b.classList.toggle('on', b === e.currentTarget)); } }, x[0].toUpperCase() + x.slice(1))));
    const res = btn('Audio stopped, tap to resume', null, () => { note('tapped resume'); P.ctx && P.ctx.resume(); }, 'go'); res.id = 'resume'; res.hidden = true;
    show(title(`${i + 1} of ${PHASES.length}: ${ph.t}`, 'phase'), h('p', { cls: 'dim' }, `${run.route} · ${ph.say}`),
      error ? h('p', { cls: 'bad' }, 'The microphone did not open: ' + error) : null,
      h('p', { id: 'ctxstate', cls: 'bad' }), res,
      P.mic ? h('div', { cls: 'meter' }, h('i', { id: 'micbar' })) : null,
      q, h('h3', {}, 'Ears'), ears, next);
  }

  /* ---------- gate 2: worklet load ---------- */
  const STEP = QUICK ? { warm: 250, measure: 900 } : { warm: 1000, measure: 3000 };
  const KERNELS = [
    { id: 'js', name: 'JS, 2 saws + filter', pass: true },
    { id: 'wasm', name: 'WASM, same voice', wasm: 'scalar.wasm', fn: 'blep_svf', pass: true },
    { id: 'simd', name: 'WASM SIMD, same voice', wasm: 'simd.wasm', fn: 'blep_svf4', pass: true },
    { id: 'wt', name: 'Wavetable voice', wasm: 'simd.wasm', fn: 'wt_svf' },
    { id: 'ladder', name: 'Ladder filter voice', wasm: 'simd.wasm', fn: 'blep_ladder' }
  ].filter((k) => !QUICK || k.id === 'js' || k.id === 'simd');
  const VCAP = 40000, FRACS = [0.15, 0.5, 0.75], G = { stop: false };

  /* main-thread load while the percentile pass runs: restyle, relayout and paint for about 8 ms of every frame */
  let domBox = null, domOn = false, domFrames = 0;
  function domStress(on) {
    domOn = on; domFrames = 0;
    if (!on) { if (domBox) domBox.replaceChildren(); return; }
    domBox = document.getElementById('domload');
    for (let i = 0; i < 200; i++) domBox.append(h('span', {}, String(i)));
    const c = domBox.children;
    const f = () => {
      if (!domOn) return;
      const t = performance.now(); let k = 0;
      while (performance.now() - t < 8) { const e = c[k++ % c.length]; e.style.padding = (k % 3) + 'px'; e.textContent = String(k); void domBox.offsetHeight; }
      domFrames++; requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  }
  function stepper(node) {
    let id = 0, wait = null;
    node.port.onmessage = (e) => { if (wait && e.data.id === wait.id) { const w = wait; wait = null; w.ok(e.data); } };
    return (voices) => new Promise((ok) => {
      const me = ++id; wait = { id: me, ok };
      node.port.postMessage({ cmd: 'step', id: me, voices, warmMs: STEP.warm, measureMs: STEP.measure });
      // a step so heavy it cannot finish is an underrun too; the load comes off and the search goes on
      setTimeout(() => { if (wait && wait.id === me) { wait = null; node.port.postMessage({ cmd: 'idle' }); ok({ voices, mean: 1, budget: 1, p50: 0, p99: 0, p999: 0, max: 0, over: 0, gap: 0, glitches: 0, lost: 0, nan: 0, clock: 'none', timeout: true }); } }, (STEP.warm + STEP.measure) * 4 + 4000);
    });
  }
  const row = (r, extra) => Object.assign({ v: r.voices, mean: round(r.mean / r.budget * 100), p50: r.p50, p99: r.p99, p999: r.p999, max: r.max, over: r.over, gapMs: round(r.gap / 1000), glitches: r.glitches, lostMs: round(r.lost / 1000), nan: r.nan, clock: r.clock, timeout: r.timeout }, extra);
  const failed = (r) => r.glitches > 0 || r.mean >= r.budget;

  async function runKernel(run, k, ctx, say) {
    const rec = run.kernels[k.id] = { name: k.name, steps: [], pass: [] };
    const bytes = k.wasm ? await (await fetch(k.wasm)).arrayBuffer() : null;
    const node = new AudioWorkletNode(ctx, 'probe-load', { numberOfOutputs: 1, outputChannelCount: [2], processorOptions: { fn: k.fn, bytes, cap: VCAP } });
    await new Promise((ok, no) => { node.port.onmessage = (e) => (e.data.error ? no(new Error(e.data.error)) : ok()); setTimeout(() => no(new Error('kernel did not load')), 8000); });
    node.connect(ctx.destination);
    const step = stepper(node);
    const guard = () => { if (G.stop) throw new Error('stopped'); if (ctx.state !== 'running') throw new Error('audio ' + ctx.state); if (document.hidden) throw new Error('page was hidden'); };
    const measure = async (v) => {
      guard(); say(`${k.name}: ${v} voices`);
      let r = await step(v); rec.steps.push(row(r));
      if (failed(r)) { guard(); say(`${k.name}: ${v} voices, checking again`); r = await step(v); rec.steps.push(row(r, { again: true })); }
      save(); return !failed(r);
    };
    rec.idle = row(await step(0));
    let v = 8, lo = 0, hi = 0;
    while (v <= VCAP) { if (await measure(v)) { lo = v; v *= 2; } else { hi = v; break; } }
    for (let i = 0; i < 3 && hi && hi - lo > 4; i++) { const mid = Math.round((lo + hi) / 8) * 4; if (mid <= lo || mid >= hi) break; if (await measure(mid)) lo = mid; else hi = mid; }
    rec.limit = lo; rec.underrunAt = hi || null;
    if (k.pass && lo) {
      /* the fine clock holds a core, so it only runs here; with no isolation the percentiles stay in 1 ms steps */
      let clk = null, a = null;
      if (typeof SharedArrayBuffer !== 'undefined' && window.crossOriginIsolated) {
        const sab = new SharedArrayBuffer(16); a = new Int32Array(sab); clk = new Worker('clock-worker.js');
        await new Promise((ok) => { clk.onmessage = ok; clk.postMessage({ sab }); });
        await sleep(50); node.port.postMessage({ cmd: 'clock', sab });
      }
      for (const f of FRACS) for (const dom of [false, true]) {
        const n = Math.max(4, Math.round(lo * f / 4) * 4);
        guard(); say(`${k.name}: ${n} voices${dom ? ' with DOM work' : ''}`);
        domStress(dom); const t0 = performance.now(), r = await step(n), fps = domFrames / ((performance.now() - t0) / 1000); domStress(false);
        rec.pass.push(row(r, { dom, frac: f, domFps: dom ? round(fps) : undefined })); save();
      }
      if (clk) { node.port.postMessage({ cmd: 'clock', sab: null }); await sleep(30); Atomics.store(a, 1, 1); await sleep(30); rec.clockStepUs = Atomics.load(a, 2); clk.terminate(); }
    }
    node.disconnect(); node.port.onmessage = null; node.port.close();
    return node;
  }

  async function startLoad(cont) {
    const ctx = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 }), prev = lastOf(R.load);
    const run = cont ? prev : { at: stamp(), mode: MODE, kernels: {}, order: [] };
    if (!cont) R.load.push(run);
    delete run.stopped;
    G.stop = false; S.busy = true;
    const line = h('p', {}, 'Starting'), say = (t) => { line.textContent = t; S.line = t; };
    show(title('Worklet load', 'loading'), h('p', { cls: 'dim' }, 'Keep this page in front and leave the device alone.'), line, btn('Stop', null, () => { G.stop = true; say('Stopping after this step'); }, 'sm'), h('div', { id: 'domload' }));
    keepAwake(true);
    try {
      await ctx.resume();
      if (ctx.state !== 'running') await Promise.race([new Promise((ok) => { ctx.onstatechange = () => ctx.state === 'running' && ok(); }), sleep(2000)]);
      await ctx.audioWorklet.addModule('load-worklet.js');
      Object.assign(run, { sr: ctx.sampleRate, baseMs: ms(ctx.baseLatency), outMs: ms(ctx.outputLatency), session: navigator.audioSession ? navigator.audioSession.type : null, cores: navigator.hardwareConcurrency, coi: !!window.crossOriginIsolated, simd: WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])), wakeLock: !!wake });
      for (const k of KERNELS) {
        if (run.kernels[k.id] && run.kernels[k.id].limit != null) continue;
        await runKernel(run, k, ctx, say);
      }
      /* the same load again at the end: a slower figure here means the device warmed up during the run */
      const k = KERNELS.find((x) => x.id === 'simd'), first = run.kernels.simd.pass.find((p) => !p.dom && p.frac === 0.5);
      if (first) {
        const again = await recheck(k, ctx, first.v); run.drift = { v: first.v, firstMean: first.mean, lastMean: again.mean, firstClock: first.clock, lastClock: again.clock };
      }
      run.done = true;
    } catch (e) { run.stopped = String(e.message || e); }
    save(); domStress(false); keepAwake(false); ctx.close().catch(() => {}); S.busy = false; loadView();
  }
  async function recheck(k, ctx, v) {
    const bytes = await (await fetch(k.wasm)).arrayBuffer();
    const node = new AudioWorkletNode(ctx, 'probe-load', { numberOfOutputs: 1, outputChannelCount: [2], processorOptions: { fn: k.fn, bytes, cap: VCAP } });
    await new Promise((ok) => { node.port.onmessage = ok; });
    node.connect(ctx.destination);
    const r = await stepper(node)(v); node.disconnect();
    return row(r);
  }
  function loadView() {
    const run = lastOf(R.load), open = run && !run.done;
    show(title('Worklet load', 'load'),
      h('p', { cls: 'dim' }, 'Steps each kernel up until audio underruns, then measures the slowest blocks with the page idle and busy. Silent. About 6 minutes. Run it in Safari and again installed.'),
      run ? h('pre', {}, loadText(run)) : null,
      run && run.stopped ? h('p', { cls: 'bad' }, 'Stopped: ' + run.stopped) : null,
      open ? btn('Continue', 'Picks up at the next kernel', () => startLoad(true), 'go') : null,
      btn(run ? 'Run again' : 'Start', null, () => startLoad(false), open ? '' : 'go'), back());
  }
  function loadText(run) {
    const out = [];
    for (const id in run.kernels) {
      const k = run.kernels[id];
      out.push(`${id}: limit ${k.limit == null ? '…' : k.limit + ' voices'}${k.limit != null && !k.underrunAt ? ' (no underrun by the cap)' : ''}${k.underrunAt ? `, underrun at ${k.underrunAt}` : ''}`);
      if (k.idle && k.idle.glitches) out.push(`  idle step showed ${k.idle.glitches} glitches: detector noisy`);
    }
    return out.join('\n');
  }

  /* ---------- gate 3: isolation and offline ---------- */
  function frame(src, wait = 8000) {
    return new Promise((ok) => {
      const f = document.createElement('iframe'); f.src = src; f.style.cssText = 'width:1px;height:1px;border:0;position:absolute;left:-10px';
      const t0 = performance.now(); document.body.append(f);
      // not f.onload: WebKit can fire it for the initial empty document. A refused frame never gets the flag
      const poll = () => {
        let up = false; try { up = f.contentWindow.childReady === true; } catch (e) { /* refused */ }
        if (up || performance.now() - t0 > wait) { f.loadMs = Math.round(performance.now() - t0); ok(f); } else setTimeout(poll, 20);
      };
      poll();
    });
  }
  function gcPressure() {
    for (let r = 0; r < 12; r++) { let a = []; for (let i = 0; i < 40000; i++) a.push({ i }); let b = new ArrayBuffer(16 << 20); new Uint8Array(b).fill(1); a = b = null; }
    if (window.gc) window.gc();
  }
  async function runIso() {
    const r = { at: stamp(), mode: MODE, coi: !!window.crossOriginIsolated, sabMain: typeof SharedArrayBuffer !== 'undefined' };
    R.iso.push(r); S.busy = true;
    const line = h('p', {}, 'Starting'), say = (t) => { line.textContent = t; };
    show(title('Isolation', 'isoing'), line);
    const ctx = new AudioContext({ sampleRate: 48000 });
    const silent = ctx.createGain(); silent.gain.value = 0; silent.connect(ctx.destination);
    try {
      await ctx.resume(); r.state = ctx.state;
      await ctx.audioWorklet.addModule('load-worklet.js');
      say('SharedArrayBuffer in the worklet');
      const t = new AudioWorkletNode(ctx, 'probe-tone'); t.connect(silent);
      r.worklet = await new Promise((ok) => { t.port.onmessage = (e) => ok(e.data); setTimeout(() => ok(null), 2000); });
      if (r.sabMain) {
        const sab = new SharedArrayBuffer(16), a = new Int32Array(sab);
        t.port.postMessage({ sab }); await sleep(400); r.sabWorklet = Atomics.load(a, 0) > 0;
        const b = new SharedArrayBuffer(16), w = new Worker('clock-worker.js'), c = new Int32Array(b);
        await new Promise((ok) => { w.onmessage = ok; w.postMessage({ sab: b }); }); await sleep(100); Atomics.store(c, 1, 1); await sleep(50);
        r.sabWorker = Atomics.load(c, 3) > 0; r.clockStepUs = Atomics.load(c, 2); w.terminate();
      }
      t.disconnect();

      say('Frames');
      const f0 = await frame('frame.html');
      try { const w = f0.contentWindow; r.frame = { ready: w.childReady === true, coi: w.crossOriginIsolated, sab: typeof w.SharedArrayBuffer !== 'undefined' }; r.frame.loadMs = f0.loadMs; await w.addChild(ctx); r.frame.addModule = true; }
      catch (e) { r.frame = Object.assign(r.frame || {}, { error: e.name + ': ' + e.message }); }
      f0.remove();
      const bad = await frame('/audio/manifest.json', 1500);   // same origin, no COEP: a tool page without the header would meet this
      try { const href = String(bad.contentWindow.location.href); r.noCoepFrame = href === 'about:blank' || bad.contentWindow.document.body == null ? 'refused' : 'LOADED'; } catch (e) { r.noCoepFrame = 'refused'; }
      bad.remove();

      const held = [], peak = (ana) => { const b = new Float32Array(2048); ana.getFloatTimeDomainData(b); let p = 0; for (let i = 0; i < b.length; i++) p = Math.max(p, Math.abs(b[i])); return round(p, 3); };
      const nodeCase = async (name, remove, keep) => {
        say('Frame nodes: ' + name);
        const c = {}, f = await frame('frame.html'), ana = ctx.createAnalyser(); ana.fftSize = 2048; ana.connect(silent);
        let o = f.contentWindow.probeNodes(ctx); o.g.connect(ana);
        await sleep(500); c.before = peak(ana);
        if (keep) held.push(o);
        if (remove) f.remove();
        o = null;
        await sleep(600); c.after = peak(ana);
        gcPressure(); await sleep(600); c.gc1 = peak(ana);
        gcPressure(); await sleep(600); c.gc2 = peak(ana); c.state = ctx.state;
        if (keep) { try { const h0 = held[held.length - 1]; h0.g.disconnect(); h0.n.disconnect(); h0.n.connect(ana); await sleep(300); c.reconnected = peak(ana); } catch (e) { c.reconnected = e.name; } }
        if (!remove) f.remove();
        return c;
      };
      r.nodes = {
        frameAlive: await nodeCase('frame alive', false, false),
        frameGoneHeld: await nodeCase('frame removed, parent holds them', true, true),
        frameGoneNoRef: await nodeCase('frame removed, nothing holds them', true, false)
      };
      r.gtag = { loaded: !!window.google_tag_manager, dataLayer: (window.dataLayer || []).length };
      r.done = true;
    } catch (e) { r.error = e.name + ': ' + e.message; }
    ctx.close().catch(() => {}); save(); S.busy = false; isoView();
  }
  async function isoView() {
    const r = lastOf(R.iso), off = R.launches.filter((l) => l.net === false), lastOff = lastOf(off);
    let sw = null;
    try { if (navigator.serviceWorker && navigator.serviceWorker.controller) sw = await (await fetch('sw-status', { cache: 'no-store' })).json(); } catch (e) { /* not ready */ }
    if (S.view !== 'iso' && S.view !== 'home' && S.view !== 'isoing') return;
    show(title('Isolation and offline', 'iso'),
      btn('Run the isolation test', 'Under a minute, silent', runIso, 'go'),
      r ? h('pre', {}, isoText(r)) : null,
      h('h3', {}, 'Offline launch'),
      h('p', {}, sw ? `Ready: ${sw.files} files saved on this device.` : 'Not ready yet. Reload this page once while online.'),
      h('p', { cls: 'dim' }, 'Turn on Airplane Mode with Wi-Fi off. Close this page or app completely, then open it again. Come back here, turn Airplane Mode off, and copy the results.'),
      lastOff ? h('p', { cls: lastOff.coi && lastOff.check && lastOff.check.worklet ? 'good' : 'bad' }, `Offline launch ${lastOff.at}, ${lastOff.mode}: page opened, isolated ${lastOff.coi ? 'yes' : 'NO'}, served from ${lastOff.sw && lastOff.sw.last ? lastOff.sw.last.from : '?'}, worklet ${lastOff.check && lastOff.check.worklet ? 'ok' : 'FAILED'}, WASM ${lastOff.check && lastOff.check.wasm ? 'ok' : 'FAILED'}`) : h('p', { cls: 'dim' }, 'No offline launch yet.'),
      back());
  }
  function isoText(r) {
    const n = r.nodes, c = (x) => (x ? `${x.before} → ${x.after} → ${x.gc1} → ${x.gc2}${x.reconnected != null ? ` reconnect ${x.reconnected}` : ''}` : '-');
    return [`isolated ${r.coi}  SAB main ${r.sabMain}, worklet ${r.sabWorklet}, worker ${r.sabWorker}, shared WASM memory ${r.worklet ? r.worklet.wmem : '?'}`,
      `frame with COEP ${JSON.stringify(r.frame)}`, `frame without COEP ${r.noCoepFrame}`,
      'level before → frame gone → GC → GC', `  frame alive     ${c(n && n.frameAlive)}`, `  gone, held      ${c(n && n.frameGoneHeld)}`, `  gone, no refs   ${c(n && n.frameGoneNoRef)}`,
      `gtag under COEP ${r.gtag ? (r.gtag.loaded ? 'LOADED' : 'not loaded') : '-'}`, r.error ? 'ERROR ' + r.error : null].filter(Boolean).join('\n');
  }

  /* ---------- gate 4: memory ceiling ---------- */
  const MEMCAP = 160;   // 16 GB, past anything a tab should get
  function fill(u, seed) { let x = seed | 1; for (let i = 0, n = u.length; i < n; i++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; u[i] = x; } return x; }   // noise, so the kernel's compressor can't hide it
  async function mark(m) { localStorage.setItem(MARK, JSON.stringify(m)); await kvPut(MARK, m).catch(() => {}); }
  async function runMem(kind) {
    const m = { running: true, at: stamp(), t: Date.now(), mode: MODE, kind, safe: 0, next: 100, steps: [] };
    const line = h('p', { id: 'memline' }, 'Starting'); S.busy = true;
    show(title('Memory ceiling', 'memming'), h('p', { cls: 'dim' }, `${kind === 'wasm' ? 'WASM memory' : 'Typed arrays'}, noise-filled, 100 MB at a time. The page will probably die. Open it again and the result is here.`), line);
    await keepAwake(true); await sleep(100);
    const keep = []; let mem = null, how = 'reached the cap', detail = null;
    const size = 100 * 1024 * 1024;
    if (kind === 'wasm') for (const max of [65536, 32768, 16384]) { try { mem = new WebAssembly.Memory({ initial: 1, maximum: max }); m.wasmMax = max; break; } catch (e) { detail = e.name; } }
    for (let i = 1; i <= MEMCAP; i++) {
      m.safe = (i - 1) * 100; m.next = i * 100; m.t = Date.now(); await mark(m);
      if (MEMSIM && m.next >= MEMSIM) { location.reload(); await sleep(5000); return; }
      const t0 = performance.now(); let u;
      try {
        if (kind === 'wasm') { if (!mem) throw new Error('no memory'); const from = mem.buffer.byteLength; mem.grow(1600); u = new Uint32Array(mem.buffer, from, size / 4); }
        else { const b = new ArrayBuffer(size); keep.push(b); u = new Uint32Array(b); }
        fill(u, i * 2654435761);
      } catch (e) { how = 'allocation refused'; detail = e.name + ': ' + e.message; m.safe = (i - 1) * 100; break; }
      const dt = Math.round(performance.now() - t0);
      m.steps.push(dt); line.textContent = `${i * 100} MB, ${dt} ms`;
      await sleep(150);
      m.safe = i * 100;
      if (QUICK && i >= 3) { how = 'quick stop'; break; }
    }
    m.running = false; await mark(m);
    R.mem.push({ at: m.at, mode: MODE, kind, stepMB: 100, lastSafeMB: m.safe, failedAtMB: how === 'allocation refused' ? m.next : null, how, detail, wasmMax: m.wasmMax, steps: m.steps });
    save(); keep.length = 0; mem = null; localStorage.removeItem(MARK); await kvPut(MARK, null).catch(() => {});
    keepAwake(false); S.busy = false; memView();
  }
  function memView() {
    show(title('Memory ceiling', 'mem'),
      h('p', { cls: 'dim' }, 'Allocates until something stops it. Before each 100 MB step the last safe size is saved, so a crash loses nothing. Close other apps first, and run each one twice.'),
      R.mem.length ? h('pre', {}, R.mem.map((m) => `${m.kind} ${m.mode}: ${m.lastSafeMB} MB safe, ${m.how}${m.failedAtMB ? ' at ' + m.failedAtMB : ''}`).join('\n')) : null,
      btn('Typed arrays', 'The way decoded audio is held', () => runMem('typed'), 'go'),
      btn('WASM memory', 'The way the engine would hold it', () => runMem('wasm')), back());
  }

  /* ---------- export ---------- */
  function report() {
    const L = [], l0 = lastOf(R.launches);
    L.push(`AUDIO PROBE v${VERSION}  ${stamp()}`, `device: ${R.device || '(not named)'}`, `ua: ${navigator.userAgent}`,
      `screen ${screen.width}x${screen.height}@${devicePixelRatio} cores ${navigator.hardwareConcurrency} ${MODE} isolated=${!!window.crossOriginIsolated} sab=${typeof SharedArrayBuffer !== 'undefined'}`);
    L.push('', 'GATE 1 mic + playback');
    for (const r of R.mic) {
      L.push(`${r.route} ${r.mode} ${r.at} ${r.done ? '' : '(unfinished)'} file ${r.file ? `${r.file.ch}ch ${r.file.sr}Hz ${r.file.sec}s side${r.file.sideDb}dB` : '?'}`);
      for (const p of r.phases) {
        const a = p.auto || {}, s = a.settings;
        if (a.inputs && p.id === 'base') L.push(`  devices in ${JSON.stringify(a.inputs)} out ${JSON.stringify(a.outputs)}`);
        L.push(`  ${p.id.padEnd(11)}${(p.ans.where || '').padEnd(11)}${(p.ans.level || '').padEnd(12)}${(p.ans.crackle || '').padEnd(9)}${(p.ans.stereo || '').padEnd(10)}| ${a.state} ${a.sr}Hz base${a.baseMs} out${a.outMs} ch${a.chMax} ${a.session || ''}${s ? ` ec=${s.ec} micsr=${s.sr} ch=${s.ch}` : ''}${a.micPeakDb != null ? ` mic${a.micPeakDb}dB "${a.track ? a.track.label : ''}"` : ''}${a.track && a.track.muted ? ' MUTED' : ''} drops ${a.drops}/${a.dropMs}ms${p.error ? ' ERR ' + p.error : ''}${a.events && a.events.length ? ' [' + a.events.join(', ') + ']' : ''}`);
      }
    }
    L.push('', 'GATE 2 worklet load (times in us, budget 2667 at 48 kHz)');
    for (const r of R.load) {
      L.push(`${r.mode} ${r.at} sr${r.sr} base${r.baseMs} out${r.outMs} coi=${r.coi} wake=${r.wakeLock} ${r.done ? '' : '(unfinished: ' + (r.stopped || 'open') + ')'}${r.drift ? ` drift simd ${r.drift.v}v ${r.drift.firstMean}%→${r.drift.lastMean}%` : ''}`);
      for (const id in r.kernels) {
        const k = r.kernels[id];
        L.push(`  ${id}: limit ${k.limit} underrunAt ${k.underrunAt} idleGlitches ${k.idle ? k.idle.glitches : '?'} clockStep ${k.clockStepUs == null ? '-' : k.clockStepUs + 'us'}`);
        L.push('    v mean% p50 p99 p99.9 max over gapMs glitch lostMs');
        for (const s of k.steps) L.push(`    ${s.v} ${s.mean} ${s.p50} ${s.p99} ${s.p999} ${s.max} ${s.over} ${s.gapMs} ${s.glitches} ${s.lostMs}${s.again ? ' again' : ''}${s.timeout ? ' TIMEOUT' : ''}${s.nan ? ' NAN' : ''}`);
        for (const s of k.pass) L.push(`    ${s.dom ? 'DOM ' : 'idle'} ${s.v} ${s.mean} ${s.p50} ${s.p99} ${s.p999} ${s.max} ${s.over} ${s.gapMs} ${s.glitches} ${s.lostMs} ${s.clock}${s.dom ? ' fps' + s.domFps : ''}`);
      }
    }
    L.push('', 'GATE 3 isolation');
    for (const r of R.iso) L.push(`${r.mode} ${r.at}`, isoText(r));
    const seen = R.launches.filter((l) => l.net === false);
    L.push(`launches ${R.launches.length}, offline ${seen.length}`);
    for (const l of seen) L.push(`  offline ${l.at} ${l.mode} coi=${l.coi} sab=${l.sab} from=${l.sw && l.sw.last ? l.sw.last.from : '?'} coep=${l.sw && l.sw.last ? l.sw.last.coep : '?'} check=${JSON.stringify(l.check)}${l.swError ? ' ' + l.swError : ''}`);
    L.push('', 'GATE 4 memory');
    for (const m of R.mem) L.push(`${m.kind} ${m.mode} ${m.at}: last safe ${m.lastSafeMB} MB, ${m.how}${m.failedAtMB ? ' at ' + m.failedAtMB : ''}${m.detail ? ' (' + m.detail + ')' : ''}${m.navOnReturn ? ` return=${m.navOnReturn} after ${m.gapSec}s` : ''} ms/step ${(m.steps || []).slice(-5).join(',')}`);
    L.push('', 'last launch ' + JSON.stringify(l0), '', 'END');
    return L.join('\n');
  }
  function resultsView() {
    const text = report(), box = h('textarea', { readOnly: true, value: text }), said = h('p', { cls: 'good' });
    let armed = false;
    const clear = btn('Clear all results', null, () => {
      if (!armed) { armed = true; clear.firstChild.textContent = 'Tap again to erase everything'; return; }
      R = fresh(); save(); home();
    }, 'sm');
    show(title('Results', 'results'),
      btn('Copy', 'Then paste it to Claude', async () => {
        try { await navigator.clipboard.writeText(text); said.textContent = 'Copied.'; }
        catch (e) { box.focus(); box.select(); box.setSelectionRange(0, text.length); said.textContent = document.execCommand('copy') ? 'Copied.' : 'Press and hold the text to select it.'; }
      }, 'go'), said,
      navigator.share ? btn('Share', 'Mail or AirDrop it to yourself', () => navigator.share({ text }).catch(() => {})) : null,
      box, clear, back());
  }

  /* ---------- start ---------- */
  home();
  readMark().finally(() => { if (S.view === 'home') home(); }).then(() => { const open = R.mic.find((r) => r.active); if (open && open.reloaded === open.i) micView(); });
  afterLoad();
})();
