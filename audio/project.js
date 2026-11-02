/* Audio project: the document, its on-device store, its save file. Spec: audio/docs/FORMAT.md
   Loaded after shared.js. No tool uses it yet; nothing here touches the old session keys except to read them. */
(function () {
  'use strict';
  var FORMAT = 'audio-project', VERSION = 1, SR = 48000, PPQ = 960, UNDO_BYTES = 2 * 1024 * 1024;
  /* the synth's genes, in the order the old garden stored them (seed-garden-v1 arrays are positional) */
  var GENES = ['wave', 'base', 'oct2', 'mix2', 'det', 'ftype', 'cut', 'res', 'fenv', 'att', 'dec', 'sus', 'rel', 'level', 'lrate', 'lpit', 'lcut', 'drive', 'dmix', 'dtime', 'drvAmt', 'drvShape', 'crush', 'fltMix', 'fltType', 'fltCut', 'combMix', 'combF', 'fmRatio', 'fmIdx', 'sub'];

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function isInt(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v; }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  /* ---------------------------------------------------------------- the document */
  function blank(name) {
    var now = Date.now();
    return {
      format: FORMAT, version: VERSION, id: uid(), name: name || '', created: now, modified: now, rev: 0, app: '',
      time: { sr: SR, ppq: PPQ, tempo: window.AT ? AT.tempo() : 120, sig: [4, 4], map: [] },
      tracks: [track(0), track(1)], returns: [], master: { gain: 0, inserts: [] },
      takes: {}, patches: {}, racks: {}, markers: [], range: null, tools: {},
      view: { playhead: 0, scroll: 0, zoom: 60, lane: 0, snap: true, push: false }
    };
  }
  function track(i, kind) { return { id: 't' + (i + 1), kind: kind || 'audio', name: '', color: i, mute: false, solo: false, gain: 0, pan: 0, inserts: [], sends: [], instrument: null, clips: [] }; }

  /* every problem found, as readable strings; empty means the document can be trusted */
  function validate(d) {
    var e = [];
    if (!d || typeof d !== 'object') return ['not a document'];
    if (d.format !== FORMAT) e.push('format is not ' + FORMAT);
    if (!isInt(d.version) || d.version < 1) e.push('no version');
    if (!d.id) e.push('no id');
    if (!d.time || d.time.sr !== SR || d.time.ppq !== PPQ || !(d.time.tempo >= 20 && d.time.tempo <= 300)) e.push('bad time');
    if (!Array.isArray(d.tracks)) return e.concat('no tracks');
    var ids = {}, takes = d.takes || {}, patches = d.patches || {}, racks = d.racks || {};
    function seen(id, what) { if (!id) e.push(what + ' without an id'); else if (ids[id]) e.push('duplicate id ' + id); ids[id] = 1; }
    d.tracks.concat(d.returns || []).forEach(function (t) {
      seen(t.id, 'track');
      if (['audio', 'midi', 'return'].indexOf(t.kind) < 0) e.push('track ' + t.id + ' has kind ' + t.kind);
      if (t.instrument) { var i = t.instrument; if (i.patch && !patches[i.patch]) e.push('track ' + t.id + ' needs patch ' + i.patch); if (i.rack && !racks[i.rack]) e.push('track ' + t.id + ' needs rack ' + i.rack); }
      (t.clips || []).forEach(function (c) {
        seen(c.id, 'clip');
        if (c.anchor !== 'time' && c.anchor !== 'beats') e.push('clip ' + c.id + ' has anchor ' + c.anchor);
        if (!isInt(c.at) || c.at < 0 || !isInt(c.len) || c.len <= 0) e.push('clip ' + c.id + ' is not placed in whole units');
        if (c.type === 'audio') { if (!takes[c.take]) e.push('clip ' + c.id + ' needs take ' + c.take); if (!isInt(c.off) || !isInt(c.span)) e.push('clip ' + c.id + ' has a bad source range'); }
        else if (c.type === 'midi') (c.notes || []).forEach(function (n) { if (n.length !== 4 || !n.every(isInt) || n[2] < 0 || n[2] > 127) e.push('clip ' + c.id + ' has a bad note'); });
        else e.push('clip ' + c.id + ' has type ' + c.type);
      });
    });
    Object.keys(racks).forEach(function (id) {
      (racks[id].pads || []).forEach(function (p) { var s = p.source || {}; if (s.take && !takes[s.take]) e.push('rack ' + id + ' needs take ' + s.take); if (s.patch && !patches[s.patch]) e.push('rack ' + id + ' needs patch ' + s.patch); });
    });
    return e;
  }

  /* one step per version, run in order on a copy; steps are never removed */
  var STEPS = {};
  function upgrade(raw) {
    if (!raw || raw.format !== FORMAT) throw new Error('This isn\'t an audio project.');
    if (raw.version > VERSION) throw new Error('This project was made by a newer version of the app. Update the app to open it.');
    var d = clone(raw);
    while (d.version < VERSION) { d = STEPS[d.version](d); d.version++; }
    return d;
  }

  /* ---------------------------------------------------------------- what the app already holds */
  function patchFromGarden(g) {
    function byName(a) { var o = {}; GENES.forEach(function (n, i) { if (a && a[i] !== undefined) o[n] = a[i]; }); return o; }
    function phases(a) { var o = {}; GENES.forEach(function (n, i) { var p = a && a[i]; if (p) o[n] = [p.k1, p.k2, p.p1, p.p2]; }); return o; }
    return {
      id: uid(), name: '', tags: [], schema: 1, setup: g.setup || 0, mute: !!g.mute, layers: g.layersOn !== false,
      genes: byName(g.seed), ph: phases(g.ph),
      parked: (g.pk || []).map(function (k) { return { x: k.x, y: k.y, color: k.col, on: !!k.on, genes: byName(k.u), path: (k.an || []).map(function (a) { return { x: a.p.x, y: a.p.y, genes: byName(a.u), ph: phases(a.ph) }; }) }; }),
      mods: [], macros: []
    };
  }
  function takeRef(m) { return { id: m.id, hash: m.hash || '', name: m.name || '', kind: m.kind || 'rec', sr: m.sr, ch: m.ch || 1, bits: m.bits || 16, frames: m.len, created: m.created, tags: m.tags || [], markers: m.markers || [] }; }

  /* sources: {edit, play, ana, bpm, metro, tuner, garden, tempo, metas}. A clip whose take is gone is dropped */
  function fromLegacy(o) {
    var d = blank(''), metas = {}; (o.metas || []).forEach(function (m) { metas[m.id] = m; });
    d.time.tempo = o.tempo || d.time.tempo;
    var ed = o.edit, n = 0;
    function smp(s) { return Math.round((+s || 0) * SR); }
    if (ed && ed.tracks && ed.tracks.length) {
      d.tracks = ed.tracks.map(function (t, i) { var x = track(i); x.mute = !!t.m; x.solo = !!t.s; return x; });
      (ed.clips || []).forEach(function (c) {
        var m = metas[c.k], tr = d.tracks[c.t]; if (!m || !tr) return;
        d.takes[m.id] = takeRef(m); var sr = m.sr;
        tr.clips.push({
          id: 'c' + (++n), type: 'audio', take: c.k, anchor: 'time', at: smp(c.s), len: Math.max(1, smp(c.d)),
          off: Math.round((+c.off || 0) * sr), span: Math.max(1, Math.round((+c.sl || +c.d || 0) * sr)), rev: !!c.rev,
          gain: +c.gain || 0, fadeIn: smp(c.fin), fadeOut: smp(c.fout), curve: +c.curve || 0,
          warp: { on: !!c.warp, mode: c.mode || 'beats', bpm: +c.ot || d.time.tempo, source: c.ots || 'shared', semi: +c.semi || 0 }, automation: []
        });
      });
      d.view = { playhead: smp(ed.ph), scroll: +ed.vt || 0, zoom: +ed.pps || 60, lane: +ed.hx || 0, snap: ed.snap !== 0, push: !!ed.push };
    }
    ['play', 'ana', 'bpm', 'metro', 'tuner'].forEach(function (k) { if (o[k]) d.tools[k] = o[k]; });
    if (o.garden && o.garden.seed) { var p = patchFromGarden(o.garden); d.patches[p.id] = p; d.tools.synth = { patch: p.id }; }
    return d;
  }

  /* ---------------------------------------------------------------- differences, for undo */
  /* diff(a, b) -> a list of [path, value], and [path] alone for a removal; patch(a, list) gives b */
  function plain(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function diff(a, b, path, out) {
    path = path || []; out = out || [];
    if (plain(a) && plain(b)) {
      Object.keys(a).forEach(function (k) { if (!own(b, k)) out.push([path.concat(k)]); else diff(a[k], b[k], path.concat(k), out); });
      Object.keys(b).forEach(function (k) { if (!own(a, k)) out.push([path.concat(k), b[k]]); });
    } else if (JSON.stringify(a) !== JSON.stringify(b)) out.push([path, b]);
    return out;
  }
  function patch(doc, list) {
    var d = clone(doc);
    list.forEach(function (op) {
      var p = op[0]; if (!p.length) { d = clone(op[1]); return; }
      var o = d; for (var i = 0; i < p.length - 1; i++) o = o[p[i]];
      if (op.length > 1) o[p[p.length - 1]] = clone(op[1]); else delete o[p[p.length - 1]];
    });
    return d;
  }

  /* ---------------------------------------------------------------- on the device */
  function sum(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function stores(names, mode) { return AT.db.store(names, mode); }
  var req = function (r) { return AT.db.req(r); };

  /* newest slot that checks out; a damaged slot costs one save, never the project */
  function readDoc(id) {
    return stores(['docs'], 'readonly').then(function (x) { return Promise.all([req(x.s('docs').get(id + ':0')), req(x.s('docs').get(id + ':1'))]); }).then(function (r) {
      var good = r.filter(function (w) { return w && w.json && w.len === w.json.length && w.sum === sum(w.json); }).sort(function (a, b) { return b.rev - a.rev; });
      for (var i = 0; i < good.length; i++) { try { return upgrade(JSON.parse(good[i].json)); } catch (e) { if (i === good.length - 1) throw e; } }
      return null;
    });
  }
  /* writes the slot not holding the newest save; rev is taken from what's stored, so two saves in a row can't collide */
  function save(d) {
    var e = validate(d); if (e.length) return Promise.reject(new Error('Not saved: ' + e[0]));
    d.modified = Date.now(); d.rev = (d.rev || 0) + 1;
    var json = JSON.stringify(d), row = { k: d.id + ':' + (d.rev % 2), id: d.id, rev: d.rev, len: json.length, sum: sum(json), json: json };
    return stores(['projects', 'docs'], 'readwrite').then(function (x) {
      x.s('docs').put(row); x.s('projects').put({ id: d.id, name: d.name, created: d.created, modified: d.modified, rev: d.rev }); return x.done;
    }).then(function () { return d; }, function (err) { if (AT.failed) AT.failed('project.save', err); throw err; });
  }
  function list() { return stores(['projects'], 'readonly').then(function (x) { return req(x.s('projects').getAll()); }).then(function (a) { return (a || []).sort(function (p, q) { return q.modified - p.modified; }); }); }
  function remove(id) { return stores(['projects', 'docs', 'undo'], 'readwrite').then(function (x) { x.s('projects').delete(id); x.s('docs').delete(id + ':0'); x.s('docs').delete(id + ':1'); x.s('undo').delete(id); return x.done; }); }
  function current(id) { try { if (id) localStorage.setItem('audio.project', id); return localStorage.getItem('audio.project'); } catch (_) { return id || null; } }

  /* undo survives closing the app: entries of {back, fwd}, oldest dropped past the size limit */
  function undoRead(id) { return stores(['undo'], 'readonly').then(function (x) { return req(x.s('undo').get(id)); }).then(function (r) { return r || { id: id, past: [], next: [] }; }); }
  function undoWrite(u) { while (u.past.length > 1 && JSON.stringify(u).length > UNDO_BYTES) u.past.shift(); return stores(['undo'], 'readwrite').then(function (x) { x.s('undo').put(u); return x.done; }).then(function () { return u; }); }
  function edited(before, after) {
    return undoRead(after.id).then(function (u) { u.past.push({ back: diff(after, before), fwd: diff(before, after) }); u.next = []; return undoWrite(u); });
  }
  function step(d, from, to, key) {
    return undoRead(d.id).then(function (u) { var e = u[from].pop(); if (!e) return null; var next = patch(d, e[key]); u[to].push(e); return undoWrite(u).then(function () { return next; }); });
  }
  function undo(d) { return step(d, 'past', 'next', 'back'); }
  function redo(d) { return step(d, 'next', 'past', 'fwd'); }

  /* the first open: one project out of what the old keys hold. Idempotent; the old keys stay */
  function migrate() {
    var done = null; try { done = localStorage.getItem('audio.migrated'); } catch (_) {}
    if (done) return readDoc(done);
    function ses(k) { return AT.session.load(k); }
    var g = null; try { g = JSON.parse(localStorage.getItem('seed-garden-v1') || 'null'); } catch (_) {}
    return AT.takes.list().then(function (metas) {
      var d = fromLegacy({ edit: ses('edit'), play: ses('play'), ana: ses('ana'), bpm: ses('bpm'), metro: ses('metro'), tuner: ses('tuner'), garden: g, tempo: AT.tempo(), metas: metas });
      d.name = 'First project';
      return save(d);
    }).then(function (d) { try { localStorage.setItem('audio.migrated', d.id); } catch (_) {} current(d.id); return d; });
  }

  /* ---------------------------------------------------------------- the save file: a stored ZIP */
  var CRCT = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { var c = -1; for (var i = 0; i < b.length; i++) c = CRCT[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
  function utf8(s) { return new TextEncoder().encode(s); }
  function header(sig, size) { var v = new DataView(new ArrayBuffer(size)); v.setUint32(0, sig, true); return v; }
  /* each file becomes a Blob as soon as it's built, so the samples can leave the JS heap before the next take is read */
  function part(name, u) { return { name: name, data: new Blob([u]), crc: crc32(u), size: u.length }; }
  function zip(files) {
    var parts = [], central = [], at = 0;
    files.forEach(function (f) {
      var nm = utf8(f.name), crc = f.crc, n = f.size;
      var l = header(0x04034b50, 30); l.setUint16(4, 20, true); l.setUint16(6, 0x0800, true); l.setUint32(14, crc, true); l.setUint32(18, n, true); l.setUint32(22, n, true); l.setUint16(26, nm.length, true);
      var c = header(0x02014b50, 46); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint32(16, crc, true); c.setUint32(20, n, true); c.setUint32(24, n, true); c.setUint16(28, nm.length, true); c.setUint32(42, at, true);
      parts.push(l.buffer, nm, f.data); central.push(c.buffer, nm); at += 30 + nm.length + n;
    });
    var size = central.reduce(function (s, p) { return s + p.byteLength; }, 0);
    var e = header(0x06054b50, 22); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, size, true); e.setUint32(16, at, true);
    return new Blob(parts.concat(central, [e.buffer]), { type: 'application/zip' });
  }
  /* reads the directory from the end of the file, so a large project is never read whole */
  function unzip(file) {
    var tail = Math.min(file.size, 65557);
    return file.slice(file.size - tail).arrayBuffer().then(function (buf) {
      var v = new DataView(buf), i = buf.byteLength - 22; while (i >= 0 && v.getUint32(i, true) !== 0x06054b50) i--;
      if (i < 0) throw new Error('This isn\'t an audio project.');
      var count = v.getUint16(i + 10, true), size = v.getUint32(i + 12, true), start = v.getUint32(i + 16, true);
      return file.slice(start, start + size).arrayBuffer().then(function (cd) {
        var w = new DataView(cd), p = 0, out = {};
        for (var n = 0; n < count; n++) {
          var len = w.getUint32(p + 24, true), nl = w.getUint16(p + 28, true), xl = w.getUint16(p + 30, true), cl = w.getUint16(p + 32, true), off = w.getUint32(p + 42, true), crc = w.getUint32(p + 16, true);
          out[new TextDecoder().decode(new Uint8Array(cd, p + 46, nl))] = { off: off, len: len, crc: crc, method: w.getUint16(p + 10, true) };
          p += 46 + nl + xl + cl;
        }
        return out;
      });
    });
  }
  function entry(file, e) {
    if (e.method !== 0) return Promise.reject(new Error('This save file was compressed by another tool. Use the file the app exported.'));
    return file.slice(e.off, e.off + 30).arrayBuffer().then(function (h) {
      var v = new DataView(h), at = e.off + 30 + v.getUint16(26, true) + v.getUint16(28, true);
      return file.slice(at, at + e.len).arrayBuffer();
    }).then(function (b) { var u = new Uint8Array(b); if (crc32(u) !== e.crc) throw new Error('This save file is damaged.'); return u; });
  }

  function wav(pcm, sr) {
    var n = pcm.length * 2, v = new DataView(new ArrayBuffer(44)); function str(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }
    str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n, true);
    var u = new Uint8Array(44 + n); u.set(new Uint8Array(v.buffer), 0); u.set(new Uint8Array(pcm.buffer, pcm.byteOffset, n), 44); return u;
  }
  function unwav(u) {
    var v = new DataView(u.buffer, u.byteOffset, u.byteLength), p = 12, sr = 0, bits = 0;
    while (p + 8 <= u.length) {
      var id = String.fromCharCode(u[p], u[p + 1], u[p + 2], u[p + 3]), n = v.getUint32(p + 4, true);
      if (id === 'fmt ') { sr = v.getUint32(p + 12, true); bits = v.getUint16(p + 22, true); }
      if (id === 'data') { if (bits !== 16) throw new Error('This save file holds audio the app can\'t read yet.'); return { sr: sr, pcm: new Int16Array(u.slice(p + 8, p + 8 + n).buffer) }; }
      p += 8 + n + (n & 1);
    }
    throw new Error('This save file is damaged.');
  }
  function hash(pcm) { return crypto.subtle.digest('SHA-256', pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength)).then(function (b) { return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }); }

  function used(d) { var o = {}; function add(id) { if (id) o[id] = 1; } d.tracks.concat(d.returns || []).forEach(function (t) { (t.clips || []).forEach(function (c) { add(c.take); }); }); Object.keys(d.racks || {}).forEach(function (id) { (d.racks[id].pads || []).forEach(function (p) { add(p.source && p.source.take); }); }); return Object.keys(o); }

  /* -> {blob, name}. One take is read at a time and handed to a Blob */
  function exportFile(doc) {
    var d = clone(doc), ids = used(d), files = [], out = Promise.resolve();
    ids.forEach(function (id) {
      out = out.then(function () { return AT.takes.raw(id); }).then(function (r) {
        if (!r) throw new Error('A take this project uses is missing.');
        return hash(r.pcm).then(function (h) { d.takes[id] = takeRef(r.meta); d.takes[id].hash = h; files.push(part('takes/' + id + '.wav', wav(r.pcm, r.meta.sr))); });
      });
    });
    return out.then(function () {
      Object.keys(d.takes).forEach(function (id) { if (ids.indexOf(id) < 0) delete d.takes[id]; });
      var bad = validate(d); if (bad.length) throw new Error('Not saved: ' + bad[0]);
      var nm = (d.name || 'project').replace(/[\\/:*?"<>|]/g, '-');
      return { blob: zip([part('project.json', utf8(JSON.stringify(d, null, 1)))].concat(files)), name: nm + '.audio.zip' };
    });
  }
  /* -> the project, saved on this device under a new id so importing never overwrites anything */
  function importFile(file) {
    var dir, doc;
    return unzip(file).then(function (z) { dir = z; if (!dir['project.json']) throw new Error('This isn\'t an audio project.'); return entry(file, dir['project.json']); }).then(function (u) {
      doc = upgrade(JSON.parse(new TextDecoder().decode(u)));
      var ids = Object.keys(doc.takes || {}), out = Promise.resolve();
      ids.forEach(function (id) {
        out = out.then(function () {
          var e = dir['takes/' + id + '.wav']; if (!e) throw new Error('A take is missing from this save file.');
          return AT.takes.raw(id).then(function (have) {
            if (have) return hash(have.pcm).then(function (h) { if (h === doc.takes[id].hash) return null; throw new Error('A different recording already has this id.'); });
            return entry(file, e).then(unwav).then(function (w) {
              return hash(w.pcm).then(function (h) {
                if (doc.takes[id].hash && h !== doc.takes[id].hash) throw new Error('This save file is damaged.');
                var t = doc.takes[id]; return AT.takes.put({ id: id, name: t.name, kind: t.kind, sr: w.sr, pcm: w.pcm, created: t.created, markers: t.markers });
              });
            });
          });
        });
      });
      return out;
    }).then(function () {
      var bad = validate(doc); if (bad.length) throw new Error('This save file is damaged.');
      doc.id = uid(); doc.rev = 0; return save(doc);
    });
  }

  window.Project = {
    FORMAT: FORMAT, VERSION: VERSION, GENES: GENES, blank: blank, track: track, validate: validate, upgrade: upgrade, fromLegacy: fromLegacy,
    diff: diff, patch: patch, save: save, load: readDoc, list: list, remove: remove, current: current, edited: edited, undo: undo, redo: redo,
    migrate: migrate, exportFile: exportFile, importFile: importFile
  };
})();
