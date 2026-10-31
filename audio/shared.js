/* Audio Tools — shared layer, loaded by every tool page (t/*.html) from <head>.
   One tempo for the whole app, one library of real audio, and the link to the shell.

   AT.tempo() / AT.setTempo(bpm, src) / AT.onTempo(fn)
     Shared tempo: localStorage 'audio.tempo', broadcast on BroadcastChannel 'audio'.

   AT.takes — the library. Everything audible in the app that is not synthesised live is a take:
   recordings, retro captures, opened files, synth saves. Stored in IndexedDB 'audio':
     store 'meta' {id, name, kind:'rec'|'retro'|'file'|'synth', sr, len (samples), dur (s), created,
                   env: Float32Array(64) peak envelope 0..1, markers: [s, ...]}
     store 'pcm'  {id, data: Int16Array}     (16-bit mono; half the size of float)
     list()            -> Promise<meta[]> newest first (no samples: instant)
     get(id)           -> Promise<meta & {data: Float32Array}>
     put({name, kind, sr, data: Float32Array, markers}) -> Promise<meta>
     del(id)           -> Promise
     import(file)      -> Promise<meta>   decode any audio/video file to mono and store it
     pick()            -> Promise<meta|null>  open the system file picker (call from a tap) and import; no type filter
                          (iPadOS greys out WAV under "audio/*"), undecodable files resolve null
   AT.onTakes(fn)      fn({op:'put'|'del', id}) whenever any tool changes the library

   AT.place(id)        Put a take on the editor timeline: queues it, then asks the shell to open the editor.
   AT.placements()     Editor: take (and clear) the queue — [{id, at:'playhead'}].
   AT.go(tool) / AT.preload(tool)   Shell navigation: 'edit','tuner','bpm','metro','synth','ana','play','rec'.
   AT.session.load(key) / save(key, obj)   Small JSON state that must survive leaving a tool (editor timeline).
   AT.storage()        -> Promise<{persisted, usage, quota}> from navigator.storage; null for whatever is unavailable.
   AT.onError(fn)      fn({what, error}) when a write fails, in any open frame; what: 'session.save', 'takes.put',
                       'takes.del', 'draft.add', 'draft.end'. Takes and drafts still reject to their callers.

   AT.mic()            getUserMedia (each tool asks itself; iOS keeps the site's permission once allowed).
   Audio unlock        every AudioContext is resumed on each touch end (iOS rule) and after interruptions.
   AT.wake(on)         Screen wake lock (recorder).
   AT.inShell()        True inside the shell's frame.
   AT.hint(id, {at, in, move, to, delay}) -> bool   Teach one gesture once: a ghost hand over the real target, no words.
                       at {x,y}; in: element at is relative to (else the viewport); move 'tap'|'hold-drag'|'drag'|'twist';
                       to {dx,dy}. Call it at the trigger and at a failed attempt: whichever comes first shows it.
   AT.did(id)          The gesture was done: dismissed, never shown. Stored per id in localStorage 'audio.hints'.
   AT.docs(tool)       The docs over the tool, which keeps running. AT.docsClose() from the page.

   Ready signal: two frames after load the page tells the shell it has painted, so the reveal never
   shows a blank tool. ?perf adds the frame-time overlay (window.__PERF). */
(function () {
  'use strict';

  /* ---------------------------------------------------------------- ?perf overlay */
  if (/[?&]perf/.test(location.search)) (function () {
    var raf = window.requestAnimationFrame.bind(window), js = 0, last = 0, n = 0, sum = 0, worst = 0, long = 0, ctx = null;
    window.requestAnimationFrame = function (cb) { return raf(function (t) { var a = performance.now(); try { cb(t); } finally { js += performance.now() - a; } }); };
    var O = window.AudioContext || window.webkitAudioContext;
    if (O) { var W = function (o) { var c = new O(o); ctx = c; return c; }; W.prototype = O.prototype; window.AudioContext = W; if (window.webkitAudioContext) window.webkitAudioContext = W; }
    var el = document.createElement('div'); el.id = 'perf';
    el.style.cssText = 'position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:2147483647;font:11px/1.3 ui-monospace,Menlo,monospace;color:#fff;background:rgba(0,0,0,.75);padding:3px 6px;pointer-events:none;white-space:pre';
    if (document.body) document.body.appendChild(el); else document.addEventListener('DOMContentLoaded', function () { document.body.appendChild(el); });
    function tick(t) { if (last) { var d = t - last; n++; sum += d; if (d > worst) worst = d; if (d > 25) long++; } last = t; raf(tick); }
    raf(tick);
    setInterval(function () {
      if (!n) return; var m = sum / n;
      el.textContent = (1000 / m).toFixed(0) + ' fps  ' + m.toFixed(1) + ' ms  worst ' + worst.toFixed(0) + '  long ' + long + '  js ' + (js / n).toFixed(2) + ' ms' +
        (ctx ? '  lat ' + ((ctx.baseLatency || 0) * 1000).toFixed(0) + '/' + ((ctx.outputLatency || 0) * 1000).toFixed(0) + ' ms  ' + ctx.sampleRate + ' Hz ' + ctx.state : '');
      window.__PERF = { fps: 1000 / m, frame: m, worst: worst, long: long, js: js / n }; n = 0; sum = 0; worst = 0; js = 0;
    }, 500);
  })();

  /* ---------------------------------------------------------------- audio unlock (iOS) */
  /* iOS starts or resumes audio only inside a touch END — touchend, pointerup or click — never on touch-down.
     Tools create and resume their contexts on pointerdown, which leaves them suspended on an iPhone: no sound,
     no capture. Every AudioContext is registered here and resumed on each touch end, and resumed again when iOS
     interrupts it (a call, Siri, the mic starting). resume() inside the gesture is enough on current iOS — no silent
     "priming" buffer, so nothing is ever generated. */
  var CTXS = [];
  (function () {
    var O = window.AudioContext || window.webkitAudioContext; if (!O) return;
    function R(o) { var c = o ? new O(o) : new O(); CTXS.push(c); watch(c); return c; }
    R.prototype = O.prototype;
    window.AudioContext = R; if (window.webkitAudioContext) window.webkitAudioContext = R;
  })();
  function watch(c) { try { c.addEventListener('statechange', function () { if (c.state === 'interrupted' && document.visibilityState === 'visible') c.resume().catch(function () {}); }); } catch (_) {} }
  function unlock() {
    CTXS.forEach(function (c) {
      if (c.state === 'closed') return;
      if (c.state !== 'running') { try { c.resume().catch(function () {}); } catch (_) {} }
    });
  }
  if (!window.__NO_UNLOCK) ['touchend', 'pointerup', 'click', 'keydown'].forEach(function (t) { window.addEventListener(t, unlock, { capture: true, passive: true }); });   // __NO_UNLOCK: harness proof that iOS mode catches the bug
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') CTXS.forEach(function (c) { if (c.state === 'interrupted' || c.state === 'suspended') { try { c.resume().catch(function () {}); } catch (_) {} } }); });

  /* ---------------------------------------------------------------- drawing pause (shell transitions) */
  /* During a tool-to-tool transition the outgoing tool stays visible but need not redraw: a canvas keeps showing its
     last frame. The shell calls AT.pauseDraw(true) on it, rAF callbacks are held, and released on pauseDraw(false).
     Audio is untouched (it does not run on animation frames). Halves the GPU work while the sweep runs. */
  var rafNative = window.requestAnimationFrame.bind(window), held = [], drawPaused = false;
  window.requestAnimationFrame = function (cb) { if (drawPaused) { held.push(cb); return 0; } return rafNative(cb); };
  function pauseDraw(on) { on = !!on; if (on === drawPaused) return; drawPaused = on; if (!on) { var q = held; held = []; q.forEach(function (cb) { rafNative(cb); }); } }

  /* ---------------------------------------------------------------- shell link */
  function shell() { try { return window.parent !== window && window.parent.ATS ? window.parent.ATS : null; } catch (_) { return null; } }
  function inShell() { try { return window.parent !== window; } catch (_) { return true; } }

  /* ---------------------------------------------------------------- broadcast */
  var ch = null; try { ch = new BroadcastChannel('audio'); } catch (_) {}
  var L = { tempo: [], takes: [], place: [], error: [] };
  function fire(t, v, src) { (L[t] || []).forEach(function (f) { try { f(v, src); } catch (_) {} }); }
  if (ch) ch.onmessage = function (e) { var m = e.data || {}; fire(m.t, m.v, m.src); };
  function emit(t, v, src) { if (ch) try { ch.postMessage({ t: t, v: v, src: src }); } catch (_) {} }

  /* ---------------------------------------------------------------- tempo */
  var mem = { tempo: 100 };
  function getTempo() { try { var v = +localStorage.getItem('audio.tempo'); if (v >= 20 && v <= 300) return v; } catch (_) {} return mem.tempo; }
  var lastSet = 0, pend = null;
  function setTempo(v, src) {
    v = Math.max(20, Math.min(300, Math.round(v * 10) / 10)); mem.tempo = v;
    try { localStorage.setItem('audio.tempo', String(v)); } catch (_) {}
    var now = Date.now();
    if (now - lastSet > 60) { lastSet = now; emit('tempo', v, src); }
    else { clearTimeout(pend); pend = setTimeout(function () { lastSet = Date.now(); emit('tempo', mem.tempo, src); }, 70); }
  }

  /* ---------------------------------------------------------------- library */
  var dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      try {
        var r = indexedDB.open('audio', 3);
        r.onupgradeneeded = function (ev) {
          var d = r.result, tx = r.transaction;
          if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'id' });
          if (!d.objectStoreNames.contains('pcm')) d.createObjectStore('pcm', { keyPath: 'id' });
          if (!d.objectStoreNames.contains('draft')) d.createObjectStore('draft', { keyPath: 'k' });   // a take still being recorded
          if (ev.oldVersion === 1 && d.objectStoreNames.contains('takes')) {   // v1 kept float samples inline
            tx.objectStore('takes').openCursor().onsuccess = function (e) {
              var c = e.target.result; if (!c) { d.deleteObjectStore('takes'); return; }
              var k = c.value, rec = pack({ id: k.id, name: k.name, kind: k.retro ? 'retro' : 'rec', sr: k.sr, data: k.data, created: k.created });
              tx.objectStore('meta').put(rec.meta); tx.objectStore('pcm').put(rec.pcm); c.continue();
            };
          }
        };
        r.onsuccess = function () { var d = r.result; d.onversionchange = function () { d.close(); dbp = null; }; res(d); };
        r.onerror = function () { rej(r.error); };
      } catch (e) { rej(e); }
    });
    return dbp;
  }
  function req(r) { return new Promise(function (res, rej) { r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
  function store(names, mode) { return db().then(function (d) { var t = d.transaction(names, mode); return { t: t, s: function (n) { return t.objectStore(n); }, done: new Promise(function (res, rej) { t.oncomplete = res; t.onerror = function () { rej(t.error); }; t.onabort = function () { rej(t.error); }; }) }; }); }

  function envelope(data, bins) {
    var e = new Float32Array(bins), step = Math.max(1, Math.floor(data.length / bins)), mx = 1e-6;
    for (var b = 0; b < bins; b++) { var p = 0, i0 = b * step, i1 = Math.min(data.length, i0 + step); for (var i = i0; i < i1; i += 4) { var v = data[i] < 0 ? -data[i] : data[i]; if (v > p) p = v; } e[b] = p; if (p > mx) mx = p; }
    for (b = 0; b < bins; b++) e[b] /= mx;
    return e;
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function pack(k) {
    var d = k.data, n = d.length, q = int16(d);
    var meta = { id: k.id || uid(), name: k.name || '', kind: k.kind || 'rec', sr: k.sr, len: n, dur: n / k.sr, created: k.created || Date.now(), env: envelope(d, 64), markers: k.markers || [] };
    if (k.recovered) meta.recovered = true;
    return { meta: meta, pcm: { id: meta.id, data: q } };
  }
  function int16(d) { var n = d.length, q = new Int16Array(n); for (var i = 0; i < n; i++) { var v = d[i]; q[i] = v >= 1 ? 32767 : v <= -1 ? -32767 : (v * 32767) | 0; } return q; }
  function unpack(q) { var n = q.length, d = new Float32Array(n); for (var i = 0; i < n; i++) d[i] = q[i] / 32767; return d; }

  var asked = false, granted = null;   // granted: what persist() answered, null until it has
  function persist() { if (asked) return; asked = true; try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().then(function (v) { granted = !!v; }, function () { granted = false; }); } catch (_) {} }
  function quiet(f) { try { return Promise.resolve(f()).catch(function () { return null; }); } catch (_) { return Promise.resolve(null); } }
  function storage() {
    var s = navigator.storage || {};
    return Promise.all([quiet(function () { return s.persisted(); }), quiet(function () { return s.estimate(); })]).then(function (r) {
      var e = r[1] || {};
      return { persisted: r[0] === null ? granted : r[0], usage: e.usage == null ? null : e.usage, quota: e.quota == null ? null : e.quota };
    });
  }
  /* a failed write tells every open frame (the frame it failed in may be on its way out) and still rejects to its caller */
  function report(what, e) { var v = { what: what, error: e }; emit('error', v); fire('error', v); }
  function failed(what) { return function (e) { report(what, e); throw e; }; }

  var takes = {
    list: function () {
      return store(['meta'], 'readonly').then(function (x) { return req(x.s('meta').getAll()); })
        .then(function (a) { return (a || []).sort(function (p, q) { return q.created - p.created; }); })
        .catch(function () { return []; });
    },
    get: function (id) {
      return store(['meta', 'pcm'], 'readonly').then(function (x) { return Promise.all([req(x.s('meta').get(id)), req(x.s('pcm').get(id))]); })
        .then(function (r) { if (!r[0] || !r[1]) return null; var m = r[0]; m.data = unpack(r[1].data); return m; });
    },
    put: function (k) {
      persist();
      return new Promise(function (ok) { ok(pack(k)); }).then(function (rec) {   // pack still runs now: a caller may reuse k.data
        return store(['meta', 'pcm'], 'readwrite').then(function (x) { x.s('meta').put(rec.meta); x.s('pcm').put(rec.pcm); return x.done; })
          .then(function () { emit('takes', { op: 'put', id: rec.meta.id }); fire('takes', { op: 'put', id: rec.meta.id }); return rec.meta; });
      }).catch(failed('takes.put'));
    },
    del: function (id) {
      return store(['meta', 'pcm'], 'readwrite').then(function (x) { x.s('meta').delete(id); x.s('pcm').delete(id); return x.done; })
        .then(function () { emit('takes', { op: 'del', id: id }); fire('takes', { op: 'del', id: id }); }).catch(failed('takes.del'));
    },
    import: function (file) {
      return file.arrayBuffer().then(function (buf) {
        var O = window.OfflineAudioContext || window.webkitOfflineAudioContext, ctx = new O(1, 1, 48000);
        return new Promise(function (res, rej) { var p = ctx.decodeAudioData(buf, res, rej); if (p && p.then) p.then(res, rej); });
      }).then(function (ab) {
        var n = ab.length, d = new Float32Array(n), c = ab.numberOfChannels;
        for (var ci = 0; ci < c; ci++) { var s = ab.getChannelData(ci); for (var i = 0; i < n; i++) d[i] += s[i] / c; }
        return takes.put({ name: (file.name || 'file').replace(/\.[^.]+$/, ''), kind: 'file', sr: ab.sampleRate, data: d });
      });
    },
    /* a take in progress reaches the store in pieces, so a killed page loses seconds, not the take. draft.end() drops
       the pieces once the real take is saved; draft.recover() turns any left behind into takes */
    draft: {
      add: function (id, seq, o) {
        return new Promise(function (ok) { ok({ k: id + ':' + ('00000' + seq).slice(-6), id: id, seq: seq, sr: o.sr, name: o.name, created: o.created, markers: o.markers || [], data: int16(o.data) }); })
          .then(function (row) { return store(['draft'], 'readwrite').then(function (x) { x.s('draft').put(row); return x.done; }); }).catch(failed('draft.add'));
      },
      end: function (id) {
        return store(['draft'], 'readwrite').then(function (x) { x.s('draft').delete(IDBKeyRange.bound(id + ':', id + ':￿')); return x.done; }).catch(failed('draft.end'));
      },
      recover: function () {
        return store(['draft'], 'readonly').then(function (x) { return req(x.s('draft').getAll()); }).then(function (rows) {
          var by = {}; (rows || []).forEach(function (r) { (by[r.id] = by[r.id] || []).push(r); });
          return Promise.all(Object.keys(by).map(function (id) {
            var a = by[id].sort(function (p, q) { return p.seq - q.seq; }), n = 0, o = 0, last = a[a.length - 1];
            a.forEach(function (r) { n += r.data.length; }); var q = new Int16Array(n);
            a.forEach(function (r) { q.set(r.data, o); o += r.data.length; });
            return takes.put({ name: last.name, kind: 'rec', sr: last.sr, data: unpack(q), created: last.created, markers: last.markers, recovered: true }).then(function () { return takes.draft.end(id); });
          }));
        });
      }
    },
    pick: function () {
      return new Promise(function (res) {
        /* no accept filter: iPadOS maps "audio/*" to a set of file types that greys out WAV (and others) in the Files
           picker. Every file is selectable; anything that does not decode resolves null. */
        var fi = document.createElement('input'); fi.type = 'file'; fi.style.display = 'none';
        var done = false;
        fi.addEventListener('change', function () { done = true; var f = fi.files && fi.files[0]; fi.remove(); if (!f) return res(null); takes.import(f).then(res, function () { res(null); }); });
        fi.addEventListener('cancel', function () { if (!done) { done = true; fi.remove(); res(null); } });   // the user closed the picker
        document.body.appendChild(fi); fi.click();
      });
    }
  };

  /* ---------------------------------------------------------------- editor placement + session */
  var PQ = 'audio.place';
  function place(id) {
    var q = []; try { q = JSON.parse(localStorage.getItem(PQ) || '[]'); } catch (_) {}
    q.push({ id: id, at: 'playhead' }); try { localStorage.setItem(PQ, JSON.stringify(q)); } catch (_) {}
    emit('place', id); go('edit');
  }
  function placements() { var q = []; try { q = JSON.parse(localStorage.getItem(PQ) || '[]'); localStorage.removeItem(PQ); } catch (_) {} return q; }
  var session = {
    load: function (key) { try { return JSON.parse(localStorage.getItem('audio.session.' + key) || 'null'); } catch (_) { return null; } },
    save: function (key, obj) { try { localStorage.setItem('audio.session.' + key, JSON.stringify(obj)); return true; } catch (e) { report('session.save', e); return false; } }
  };
  function go(tool) { var s = shell(); if (s && s.go) s.go(tool); else if (!inShell()) location.href = tool + '.html'; }
  function preload(tool) { var s = shell(); if (s && s.preload) s.preload(tool); }

  /* ---------------------------------------------------------------- microphone + wake lock */
  var CONS = { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } };
  function own() { return navigator.mediaDevices.getUserMedia(CONS); }
  function mic() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(new Error('no microphone'));
    return own().then(function (st) { setTimeout(unlock, 0); return st; });   // capture start can interrupt a running context
  }
  /* a tool that must finish something before its frame goes: AT.onLeave(fn), where fn may return a promise. The shell
     calls AT.leaving() as the sweep starts and keeps the frame until it settles */
  var LV = [];
  function onLeave(f) { LV.push(f); }
  function leaving() { return Promise.all(LV.map(function (f) { try { return f(); } catch (_) {} })); }

  var wl = null, wantWake = false;
  function wake(on) {
    wantWake = !!on; if (!navigator.wakeLock) return;
    if (on) { if (wl) return; navigator.wakeLock.request('screen').then(function (l) { wl = l; l.addEventListener('release', function () { wl = null; }); }).catch(function () {}); }
    else if (wl) { try { wl.release(); } catch (_) {} wl = null; }
  }
  document.addEventListener('visibilitychange', function () { if (wantWake && !wl && document.visibilityState === 'visible') wake(true); });

  window.AT = {
    tempo: getTempo, setTempo: setTempo, onTempo: function (f) { L.tempo.push(f); },
    takes: takes, onTakes: function (f) { L.takes.push(f); },
    onPlace: function (f) { L.place.push(f); },
    place: place, placements: placements, go: go, preload: preload, session: session,
    storage: storage, onError: function (f) { L.error.push(f); },
    mic: mic, wake: wake, inShell: inShell, pauseDraw: pauseDraw, onLeave: onLeave, leaving: leaving
  };

  /* ---------------------------------------------------------------- capture worklet */
  /* AT.worklet(ctx) -> Promise, resolved once worklet-capture.js (processor 'capture') is added to that context.
     Call it where the context is made, inside the tap: addModule is async, so the node is created when it resolves
     and nothing waits for a second tap. One promise per context; the URL is resolved against shared.js itself. */
  var WK_URL = (function () { try { return new URL('worklet-capture.js', (document.currentScript && document.currentScript.src) || location.href).href; } catch (_) { return '../worklet-capture.js'; } })();
  var WKS = typeof WeakMap === 'function' ? new WeakMap() : null;
  window.AT.worklet = function (ctx) {
    var p = WKS && WKS.get(ctx); if (p) return p;
    p = ctx && ctx.audioWorklet ? ctx.audioWorklet.addModule(WK_URL) : Promise.reject(new Error('no AudioWorklet'));
    if (WKS) WKS.set(ctx, p); return p;
  };

  /* ---------------------------------------------------------------- docs over the tool */
  /* an overlay, not a tool switch: a take in progress or a running metronome must not stop for a look at the docs */
  var BASE = (function () { try { return new URL('.', (document.currentScript && document.currentScript.src) || location.href).href; } catch (_) { return '../'; } })();
  var docsFrame = null;
  function docsOpen(tool) {
    if (docsFrame) return; var f = docsFrame = document.createElement('iframe'); f.title = 'Docs';
    f.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;background:#000;z-index:2147483001';
    f.src = BASE + 'docs.html' + (tool ? '#' + tool : ''); document.body.appendChild(f); pauseDraw(true);
  }
  function docsClose() { if (!docsFrame) return; docsFrame.remove(); docsFrame = null; pauseDraw(false); }
  window.AT.docs = docsOpen; window.AT.docsClose = docsClose;

  /* ---------------------------------------------------------------- hints */
  /* One trigger, one hint, once. The layer has pointer-events:none, so it can never take a touch, and nothing runs until
     AT.hint is called: no timers, no listeners, no rAF. It moves by the Web Animations API, off the tool's frame loop.
     The docs dot beside the ghost is a tap read from the window's capture phase, so that touch still reaches the tool. */
  var HK = 'audio.hints', hintMem = {}, H = null, HAND = 'M8 13v-8.5a1.5 1.5 0 0 1 3 0v7.5M11 11.5v-2a1.5 1.5 0 1 1 3 0v2.5M14 10.5a1.5 1.5 0 0 1 3 0v1.5M17 11.5a1.5 1.5 0 0 1 3 0v4.5a6 6 0 0 1 -6 6h-2h.208a6 6 0 0 1 -5.012 -2.7a69.74 69.74 0 0 1 -.196 -.3c-.312 -.479 -1.407 -2.388 -3.286 -5.728a1.5 1.5 0 0 1 .536 -2.022a1.867 1.867 0 0 1 2.28 .28l1.47 1.47';
  var BOOK = 'M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0M3 6a9 9 0 0 1 9 0a9 9 0 0 1 9 0M3 6v13M12 6v13M21 6v13';
  /* [time 0..1, dx share, dy share, press scale, opacity, turn in degrees] */
  var MOVES = {
    tap: { ms: 1800, k: [[0, 0, 0, 1.2, 0, 0], [.15, 0, 0, 1.2, 1, 0], [.3, 0, 0, 1, 1, 0], [.42, 0, 0, 1.2, 1, 0], [.57, 0, 0, 1, 1, 0], [.7, 0, 0, 1.2, 1, 0], [1, 0, 0, 1.2, 0, 0]] },
    'hold-drag': { ms: 2400, k: [[0, 0, 0, 1.2, 0, 0], [.12, 0, 0, 1.2, 1, 0], [.22, 0, 0, 1, 1, 0], [.5, 0, 0, 1, 1, 0], [.85, 1, 1, 1, 1, 0], [1, 1, 1, 1.2, 0, 0]] },
    drag: { ms: 1900, k: [[0, 0, 0, 1.2, 0, 0], [.15, 0, 0, 1.2, 1, 0], [.25, 0, 0, 1, 1, 0], [.8, 1, 1, 1, 1, 0], [1, 1, 1, 1.2, 0, 0]] },
    twist: { ms: 2000, k: [[0, 0, 0, 1, 0, -20], [.15, 0, 0, 1, 1, -20], [.75, 0, 0, 1, 1, 110], [1, 0, 0, 1, 0, 110]] }
  };
  function hintsSeen() { var m = {}; try { m = JSON.parse(localStorage.getItem(HK) || '{}') || {}; } catch (_) {} for (var k in hintMem) m[k] = 1; return m; }
  function hintMark(id) { hintMem[id] = 1; try { localStorage.setItem(HK, JSON.stringify(hintsSeen())); } catch (_) {} }
  function fingers(e) { if (e.type === 'pointerdown') H.down++; else H.down = Math.max(0, H.down - 1); }
  function hintEnd() {
    var h = H; if (!h) return; H = null; clearTimeout(h.timer);
    window.removeEventListener('pointerdown', fingers, true); window.removeEventListener('pointerup', fingers, true); window.removeEventListener('pointercancel', fingers, true);
    window.removeEventListener('pointerdown', dotDown, true); window.removeEventListener('pointerup', dotUp, true);
    if (h.el) h.el.remove();
  }
  function near(e) { var d = H && H.dot; return d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 26; }
  function dotDown(e) { if (near(e)) H.press = { x: e.clientX, y: e.clientY, id: e.pointerId }; }
  function dotUp(e) { var p = H && H.press; if (!p || p.id !== e.pointerId) return; H.press = null; if (near(e) && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 10) { var t = H.tool; hintEnd(); docsOpen(t); } }
  /* the docs dot: 96 px from the gesture, inside the screen, clear of its path and of the hub's corner */
  function dotSpot(a, b, W, Hi) {
    for (var i = 0; i < 12; i++) {
      var r = i * Math.PI / 6 - Math.PI / 2, x = a.x + 96 * Math.cos(r), y = a.y + 96 * Math.sin(r);
      if (x < 30 || x > W - 30 || y < 70 || y > Hi - 70 || (x < 120 && y > Hi - 120)) continue;
      if (Math.hypot(x - b.x, y - b.y) < 70) continue; return { x: x, y: y };
    }
    return { x: W / 2, y: 70 };
  }
  function hintShow() {
    var h = H; if (!h) return;
    if (h.down > 0 && h.tries++ < 20) { h.timer = setTimeout(hintShow, 250); return; }   // never under a finger
    if (h.down > 0) { hintEnd(); return; }
    var s = h.spec, m = MOVES[s.move] || MOVES.tap, r = s.in ? s.in.getBoundingClientRect() : { left: 0, top: 0 }, to = s.to || {}, dx = to.dx || 0, dy = to.dy || 0;
    var a = { x: r.left + s.at.x, y: r.top + s.at.y }, W = window.innerWidth, Hi = window.innerHeight, spot = dotSpot(a, { x: a.x + dx, y: a.y + dy }, W, Hi);
    var el = h.el = document.createElement('div'); el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:2147483000';
    var two = s.move === 'twist', blob = 'position:absolute;width:30px;height:30px;margin:-15px;border-radius:50%;background:rgba(255,255,255,.45);box-shadow:0 0 0 1.5px rgba(0,0,0,.75)';
    el.innerHTML = '<div data-ghost style="position:absolute;left:' + a.x + 'px;top:' + a.y + 'px;width:0;height:0;opacity:0">' +
      '<div style="' + blob + ';left:' + (two ? -26 : 0) + 'px"></div>' + (two ? '<div style="' + blob + ';left:26px"></div>' : '') +
      '<svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round" style="position:absolute;left:' + ((two ? 26 : 0) - 28.5) + 'px;top:-9px;overflow:visible"><path d="' + HAND + '" stroke="#000" stroke-width="2.2"/><path d="' + HAND + '" stroke="#fff" stroke-width="1.1"/></svg></div>' +
      '<div data-dot style="position:absolute;left:' + (spot.x - 16) + 'px;top:' + (spot.y - 16) + 'px;width:32px;height:32px;border-radius:50%;background:#000;box-shadow:0 0 0 1.5px #fff"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="position:absolute;left:7px;top:7px"><path d="' + BOOK + '"/></svg></div>';
    document.body.appendChild(el); h.dot = spot; hintMark(h.id);
    window.addEventListener('pointerdown', dotDown, true); window.addEventListener('pointerup', dotUp, true);
    var kf = m.k.map(function (f) { return { offset: f[0], opacity: f[4], transform: 'translate(' + dx * f[1] + 'px,' + dy * f[2] + 'px) rotate(' + f[5] + 'deg) scale(' + f[3] + ')' }; });
    var run = el.firstChild.animate(kf, { duration: m.ms, iterations: 2, easing: 'ease-in-out' }); h.run = run;
    run.onfinish = function () { if (H === h) h.timer = setTimeout(hintEnd, 1200); };
  }
  function hint(id, spec) {
    if (H || !spec || !spec.at || hintsSeen()[id] || docsFrame) return false;
    H = { id: id, spec: spec, tool: id.split('.')[0], down: 0, tries: 0, el: null, dot: null };
    window.addEventListener('pointerdown', fingers, true); window.addEventListener('pointerup', fingers, true); window.addEventListener('pointercancel', fingers, true);
    H.timer = setTimeout(hintShow, spec.delay == null ? 500 : spec.delay);
    return true;
  }
  function did(id) { hintMark(id); if (H && H.id === id) hintEnd(); }
  window.AT.hint = hint; window.AT.did = did;
  window.AT.hints = { seen: hintsSeen, now: function () { return H ? { id: H.id, on: !!H.el, dot: H.dot } : null; }, reset: function () { hintEnd(); hintMem = {}; try { localStorage.removeItem(HK); } catch (_) {} } };

  /* ---------------------------------------------------------------- ready: painted at least one frame */
  function ready() { requestAnimationFrame(function () { requestAnimationFrame(function () { var s = shell(); if (s && s.ready) s.ready(window); }); }); }
  if (document.readyState === 'complete') ready(); else window.addEventListener('load', ready);
})();
