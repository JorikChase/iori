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
     pick()            -> Promise<meta|null>  open the system file picker (call from a tap) and import
   AT.onTakes(fn)      fn({op:'put'|'del', id}) whenever any tool changes the library

   AT.place(id)        Put a take on the editor timeline: queues it, then asks the shell to open the editor.
   AT.placements()     Editor: take (and clear) the queue — [{id, at:'playhead'}].
   AT.go(tool) / AT.preload(tool)   Shell navigation: 'edit','tuner','bpm','metro','synth','ana','play','rec'.
   AT.session.load(key) / save(key, obj)   Small JSON state that must survive leaving a tool (editor timeline).

   AT.mic()            getUserMedia through the shell's one-grant-per-session helper.
   AT.wake(on)         Screen wake lock (recorder).
   AT.inShell()        True inside the shell's frame.

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

  /* ---------------------------------------------------------------- shell link */
  function shell() { try { return window.parent !== window && window.parent.ATS ? window.parent.ATS : null; } catch (_) { return null; } }
  function inShell() { try { return window.parent !== window; } catch (_) { return true; } }

  /* ---------------------------------------------------------------- broadcast */
  var ch = null; try { ch = new BroadcastChannel('audio'); } catch (_) {}
  var L = { tempo: [], takes: [], place: [] };
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
        var r = indexedDB.open('audio', 2);
        r.onupgradeneeded = function (ev) {
          var d = r.result, tx = r.transaction;
          if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'id' });
          if (!d.objectStoreNames.contains('pcm')) d.createObjectStore('pcm', { keyPath: 'id' });
          if (ev.oldVersion === 1 && d.objectStoreNames.contains('takes')) {   // v1 kept float samples inline
            tx.objectStore('takes').openCursor().onsuccess = function (e) {
              var c = e.target.result; if (!c) { d.deleteObjectStore('takes'); return; }
              var k = c.value, rec = pack({ id: k.id, name: k.name, kind: k.retro ? 'retro' : 'rec', sr: k.sr, data: k.data, created: k.created });
              tx.objectStore('meta').put(rec.meta); tx.objectStore('pcm').put(rec.pcm); c.continue();
            };
          }
        };
        r.onsuccess = function () { res(r.result); };
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
    var d = k.data, n = d.length, q = new Int16Array(n);
    for (var i = 0; i < n; i++) { var v = d[i]; q[i] = v >= 1 ? 32767 : v <= -1 ? -32767 : (v * 32767) | 0; }
    var meta = { id: k.id || uid(), name: k.name || '', kind: k.kind || 'rec', sr: k.sr, len: n, dur: n / k.sr, created: k.created || Date.now(), env: envelope(d, 64), markers: k.markers || [] };
    return { meta: meta, pcm: { id: meta.id, data: q } };
  }
  function unpack(q) { var n = q.length, d = new Float32Array(n); for (var i = 0; i < n; i++) d[i] = q[i] / 32767; return d; }

  var persisted = false;
  function persist() { if (persisted) return; persisted = true; try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {}); } catch (_) {} }

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
      var rec = pack(k);
      return store(['meta', 'pcm'], 'readwrite').then(function (x) { x.s('meta').put(rec.meta); x.s('pcm').put(rec.pcm); return x.done; })
        .then(function () { emit('takes', { op: 'put', id: rec.meta.id }); fire('takes', { op: 'put', id: rec.meta.id }); return rec.meta; });
    },
    del: function (id) {
      return store(['meta', 'pcm'], 'readwrite').then(function (x) { x.s('meta').delete(id); x.s('pcm').delete(id); return x.done; })
        .then(function () { emit('takes', { op: 'del', id: id }); fire('takes', { op: 'del', id: id }); });
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
    pick: function () {
      return new Promise(function (res) {
        var fi = document.createElement('input'); fi.type = 'file'; fi.accept = 'audio/*,video/*'; fi.style.display = 'none';
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
    save: function (key, obj) { try { localStorage.setItem('audio.session.' + key, JSON.stringify(obj)); } catch (_) {} }
  };
  function go(tool) { var s = shell(); if (s && s.go) s.go(tool); else if (!inShell()) location.href = tool + '.html'; }
  function preload(tool) { var s = shell(); if (s && s.preload) s.preload(tool); }

  /* ---------------------------------------------------------------- microphone + wake lock */
  var CONS = { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } };
  function own() { return navigator.mediaDevices.getUserMedia(CONS); }
  function mic() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(new Error('no microphone'));
    var s = shell(), p = s && s.mic ? s.mic() : null;
    return p ? p.then(own, own) : own();
  }
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
    mic: mic, wake: wake, inShell: inShell
  };

  /* ---------------------------------------------------------------- ready: painted at least one frame */
  function ready() { requestAnimationFrame(function () { requestAnimationFrame(function () { var s = shell(); if (s && s.ready) s.ready(window); }); }); }
  if (document.readyState === 'complete') ready(); else window.addEventListener('load', ready);
})();
