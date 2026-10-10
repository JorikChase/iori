/* Audio Tools — wheel picker: the iOS Clock alarm drum ("07 : 30"), for list choices and values.

   var h = Wheel.open({
     columns:[{items:['00','01',…], index:7, loop:true, width:auto}, …],   items: string (dot-matrix) | {icon:'stack-2'} | {text:'4/4'}
     separators:[':'],          glyph between column i and i+1 ('' = none)
     mode:'tap'|'drag',         tap: persistent — flick, tap the centre band or outside to confirm, the x above the corner cancels
                                drag: press-drag-release — opens under the finger, vertical drag spins 1:1, sideways moves to
                                      the next column, release commits (one gesture)
     anchor:{x,y},              client px: tap mode centres the band on it
     pointerEvent:e, column:i,  drag mode: the pointerdown that opened it, and the column under the finger
     current:[i,…],             rows marked blue (default: the opening indices)
     fix(indices)->indices|null bounce invalid combinations (e.g. 015.0 BPM) back into range when settled / at release
     onChange(indices, items, col)   once per row crossing
     onDone(indices|null, items)     committed values, or null when cancelled
     rowH:44, rows:5, light:false, haptic:false
   });
   h.close(commit) · h.set(col, index, animate) · h.indices() · h.fling(col, rowsPerSec) · h.state()

   Drawn on a small 2D canvas over the panel only (DPR aware); glyphs and icons are cached sprites, so a frame is ~2
   drawImage per visible row. The loop runs only while something moves. Pointer events, times from e.timeStamp.
   Never overlaps the bottom-left 104×104 corner (the app hub) or the safe areas. */
(function () {
  'use strict';
  var GL = {
    '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111', '4': '101101111001001',
    '5': '111100111001111', '6': '111100111101111', '7': '111001001001001', '8': '111101111101111', '9': '111101111001111',
    '.': '000000000000010', ':': '000010000010000', '-': '000000111000000', '+': '000010111010000', '/': '001001010100100',
    'x': '000101010101000', 'k': '100101110101101', ' ': '000000000000000'
  };
  var BLUE = '#2973f2', GREEN = '#33d194';   /* the app's category blue (current) and mod green (selected / on target) */
  var LIVE = [], ICONWAIT = [];

  function textW(s, P) { return Math.max(0, String(s).length * 4 - 1) * P; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function mod(a, n) { return ((a % n) + n) % n; }

  /* sprites: every glyph string / icon is rendered once per size and colour */
  var SPR = new Map();
  function sprite(key, make) { var s = SPR.get(key); if (s) return s; if (SPR.size > 1200) SPR.clear(); s = make(); SPR.set(key, s); return s; }
  function textSprite(str, pd, color, fat) {
    return sprite('t|' + str + '|' + pd + '|' + color + '|' + (fat ? 1 : 0), function () {
      var cols = Math.max(1, str.length * 4 - 1), c = document.createElement('canvas');
      c.width = Math.ceil(cols * pd) + 2; c.height = Math.ceil(5 * pd) + 2;
      var x = c.getContext('2d'); x.fillStyle = color; var r = (fat ? .5 : .42) * pd;
      for (var s = 0; s < str.length; s++) {
        var g = GL[str.charAt(s)] || GL[' '];
        for (var i = 0; i < 15; i++) {
          if (g.charAt(i) !== '1') continue;
          var col = i % 3, row = (i / 3) | 0, cx = 1 + (s * 4 + col + .5) * pd, cy = 1 + (row + .5) * pd;
          x.beginPath(); x.arc(cx, cy, r, 0, 6.2832); x.fill();
          if (fat) {   /* the soft-min neck between lit neighbours (the shader's smin while dots move) */
            if (col < 2 && g.charAt(i + 1) === '1') x.fillRect(cx, cy - r * .5, pd, r);
            if (row < 4 && g.charAt(i + 3) === '1') x.fillRect(cx - r * .5, cy, r, pd);
          }
        }
      }
      return c;
    });
  }
  var ICU = {};
  function iconURL(name) {
    if (name in ICU) return ICU[name];
    var el = document.createElement('i'); el.className = 'ti ti-' + name; el.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden';
    (document.body || document.documentElement).appendChild(el);
    var v = getComputedStyle(el).getPropertyValue('--i').trim(); el.remove();
    var m = /^url\((['"]?)(.*)\1\)$/.exec(v); return (ICU[name] = m ? m[2] : null);
  }
  function iconSprite(name, sd, color) {
    return sprite('i|' + name + '|' + sd + '|' + color, function () {
      var c = document.createElement('canvas'); c.width = c.height = Math.max(1, Math.ceil(sd)); c.ready = false;
      var u = iconURL(name); if (!u) return c;
      var im = new Image();
      im.onload = function () { c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); c.ready = true;
        LIVE.forEach(function (w) { w._kick(); }); ICONWAIT.forEach(function (f) { try { f(); } catch (_) {} }); };
      im.src = u.replace(/%23000%22/g, encodeURIComponent(color) + '%22');
      return c;
    });
  }
  function drawSpr(x, s, cx, cy, sx, sy, k) { var w = s.width / k * sx, h = s.height / k * sy; x.drawImage(s, cx - w / 2, cy - h / 2, w, h); }

  /* ordered dither (the tools' b2 Bayer on 2 px cells): opaque where the cell is NOT yet shown at this level */
  function b2(x, y) { var v = x * .5 + y * y * .75; return v - Math.floor(v); }
  function bayerCanvas(lvl, d, inverse) {
    var cs = Math.max(1, Math.round(2 * d)), c = document.createElement('canvas'); c.width = c.height = cs * 4;
    var g = c.getContext('2d'); g.fillStyle = '#000';
    for (var j = 0; j < 4; j++) for (var i = 0; i < 4; i++) {
      var b = b2(Math.floor(i * .5), Math.floor(j * .5)) * .25 + b2(i, j), on = b + .03 <= lvl;
      if (inverse ? on : !on) g.fillRect(i * cs, j * cs, cs, cs);
    }
    return c;
  }

  function rr(x, l, t, w, h, r) { x.beginPath(); x.moveTo(l + r, t); x.arcTo(l + w, t, l + w, t + h, r); x.arcTo(l + w, t + h, l, t + h, r); x.arcTo(l, t + h, l, t, r); x.arcTo(l, t, l + w, t, r); x.closePath(); }

  var SA = null;
  function safe() {
    if (!SA) { SA = document.createElement('div'); SA.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'; document.body.appendChild(SA); }
    var cs = getComputedStyle(SA); return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
  }

  /* optional haptic tick: Vibration API where it exists; on iOS 18+ Safari a hidden <input switch> toggle gives a tick */
  var HB = null, hLast = 0;
  function haptic() {
    var t = performance.now(); if (t - hLast < 28) return; hLast = t;
    try {
      if (navigator.vibrate) { navigator.vibrate(3); return; }
      if (!HB) { HB = document.createElement('label'); HB.style.cssText = 'position:fixed;left:-200px;top:0;opacity:0;pointer-events:none';
        var i = document.createElement('input'); i.type = 'checkbox'; i.setAttribute('switch', ''); HB.appendChild(i); document.body.appendChild(HB); }
      HB.click();
    } catch (_) {}
  }

  var M = 30;   /* canvas margin around the panel: room for the cancel mark and the pop */
  function norm(it) { if (it && typeof it === 'object') return it.icon ? { icon: it.icon } : { text: String(it.text) }; return { text: String(it) }; }

  function Wh(o) {
    var me = this; this.o = o; this.mode = o.mode === 'drag' ? 'drag' : 'tap';
    this.rowH = o.rowH || 44; this.rows = o.rows || 5; this.P = o.pitch || Math.round(this.rowH * .13 * 4) / 4;
    this.ink = o.light ? '#000' : '#fff'; this.bg = o.light ? '#fff' : '#000';
    this.dpr = Math.min(3, window.devicePixelRatio || 1); this.icoPx = Math.round(this.rowH * .55);
    var P = this.P, padX = o.padX == null ? 10 : o.padX;
    this.cols = o.columns.map(function (c, ci) {
      var its = c.items.map(norm), n = its.length, mw = 0;
      its.forEach(function (it) { mw = Math.max(mw, it.icon ? me.icoPx : textW(it.text, P)); });
      var ix = clamp(c.index | 0, 0, n - 1);
      return { items: c.items, its: its, n: n, loop: !!c.loop && n > 2, pos: ix, anim: null, last: ix,
        cur: o.current ? o.current[ci] : ix, w: c.width || Math.max(o.columns.length === 1 ? 96 : 44, Math.ceil(mw + 2 * padX)), x: 0, sepX: 0, sepW: 0 };   /* one column: a comfortable thumb target */
    });
    this.seps = (o.separators || []).map(function (s) { return s ? String(s) : ''; });
    var x = 8; this.cols.forEach(function (c, i) { c.x = x; x += c.w;
      if (i < me.cols.length - 1) { var s = me.seps[i] || ''; c.sepX = x; c.sepW = s ? textW(s, P) + 8 : 0; x += c.sepW; } });
    this.pw = x + 8; this.ph = this.rows * this.rowH; this.R = this.ph / 2; this.A = this.rowH / this.R;
    this.changes = 0; this.tick = 0; this.lvl = 0; this.t0 = null; this.ct0 = null; this.closing = false; this.dead = false; this.green = false;
    this.tp = null; this.g = null; this.act = 0; this.mute = false; this.wasBusy = false;

    /* placement */
    var vw = window.innerWidth, vh = window.innerHeight, sa = safe(), ax, ay, e = o.pointerEvent;
    if (this.mode === 'drag' && e) {
      ax = e.clientX; ay = e.clientY; this.act = clamp(o.column | 0, 0, this.cols.length - 1);
      var ac = this.cols[this.act]; this.left = ax - (ac.x + ac.w / 2);
    } else {
      ax = o.anchor ? o.anchor.x : vw / 2; ay = o.anchor ? o.anchor.y : vh / 2; this.act = clamp(o.column | 0, 0, this.cols.length - 1);
      this.left = ax - this.pw / 2;
    }
    this.top = ay - this.ph / 2;
    this.left = clamp(this.left, sa.l + 8, Math.max(sa.l + 8, vw - sa.r - 8 - this.pw));
    this.top = clamp(this.top, sa.t + 8 + (this.mode === 'tap' ? 34 : 0), Math.max(sa.t + 8, vh - sa.b - 8 - this.ph));
    if (this.left < 104 && this.top + this.ph > vh - 104) {   /* the hub corner */
      if (112 + this.pw <= vw - sa.r - 8) this.left = 112; else this.top = vh - 112 - this.ph;
    }

    /* DOM */
    var root = this.root = document.createElement('div');
    root.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;z-index:2147483000;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;' + (this.mode === 'drag' ? 'pointer-events:none;' : '');
    var cv = this.cv = document.createElement('canvas'), cw = this.pw + 2 * M, chh = this.ph + 2 * M;
    cv.width = Math.round(cw * this.dpr); cv.height = Math.round(chh * this.dpr);
    cv.style.cssText = 'position:absolute;left:' + (this.left - M) + 'px;top:' + (this.top - M) + 'px;width:' + cw + 'px;height:' + chh + 'px;pointer-events:none';
    root.appendChild(cv); document.body.appendChild(root);
    this.ctx = cv.getContext('2d');
    this.patIn = []; for (var k = 1; k <= 4; k++) this.patIn.push(this.ctx.createPattern(bayerCanvas(k / 5, this.dpr, false), 'repeat'));

    this._fb = this._frame.bind(this); this._raf = 0; this._lt = 0;
    this._d = this._down.bind(this); this._m = this._move.bind(this); this._u = this._up.bind(this);
    this._k = this._key.bind(this); this._w = this._wheel.bind(this); this._cm = function (ev) { ev.preventDefault(); };
    if (this.mode === 'tap') {
      root.addEventListener('pointerdown', this._d); root.addEventListener('pointermove', this._m);
      root.addEventListener('pointerup', this._u); root.addEventListener('pointercancel', this._u);
      root.addEventListener('wheel', this._w, { passive: false }); root.addEventListener('contextmenu', this._cm);
      window.addEventListener('keydown', this._k);
    } else {
      window.addEventListener('pointermove', this._m, true); window.addEventListener('pointerup', this._u, true); window.addEventListener('pointercancel', this._u, true);
      if (e) { this.tp = e.pointerId; var p = this._local(e); this.g = { x0: p.x, y0: p.y, t0: e.timeStamp, moved: 0, col: this.act, pos0: this.cols[this.act].pos, samples: [] }; }
    }
    LIVE.push(this); Wheel.last = this;
    this._kick();
  }
  var W = Wh.prototype;

  W._local = function (e) { return { x: e.clientX - this.left, y: e.clientY - this.top }; };
  W._colAt = function (x, any) {
    if (!any && (x < -4 || x > this.pw + 4)) return -1;
    var b = -1, bd = 1e9; this.cols.forEach(function (c, i) { var d = Math.abs(x - (c.x + c.w / 2)); if (d < bd) { bd = d; b = i; } }); return b;
  };
  W._rub = function (c, raw) {
    if (c.loop) return raw; var hi = c.n - 1;
    if (raw < 0) return -1.1 * (1 - Math.exp(raw * .45));
    if (raw > hi) return hi + 1.1 * (1 - Math.exp(-(raw - hi) * .45));
    return raw;
  };
  W._clampT = function (c, t) { return c.loop ? t : clamp(t, 0, c.n - 1); };
  W._emit = function (ci) {
    if (!this.o.onChange) return;
    try { this.o.onChange(this.indices(true), this._itemsOf(this.indices(true)), ci); } catch (err) { setTimeout(function () { throw err; }); }
  };
  W._cross = function (c, ci) {
    if (this.mute) return;
    var r = this._clampT(c, Math.round(c.pos)); if (r === c.last) return;
    this._crossTo(c, ci, r);
  };
  W._crossTo = function (c, ci, r) {
    if (r === c.last) return; var s = r > c.last ? 1 : -1;
    while (c.last !== r) { c.last += s; this.changes++; this._emit(ci); }
    this.tick = 1; if (this.o.haptic) haptic();
  };
  W._vel = function (s, tEnd) {
    if (s.length < 2) return 0; var last = s[s.length - 1]; if (tEnd - last.t > 90) return 0;
    var i = s.length - 1; while (i > 0 && last.t - s[i - 1].t <= 100) i--;
    var f = s[i], dt = (last.t - f.t) / 1000; return dt > .008 ? (last.p - f.p) / dt : 0;
  };
  W._snap = function (c) { c.anim = { t: this._clampT(c, Math.round(c.pos)), k: 14 }; this._kick(); };
  W._to = function (c, t, k) { c.anim = { t: this._clampT(c, t), k: k || 12 }; this._kick(); };
  W._fling = function (c, v) {
    var kd = this.o.decel || 2.6; if (Math.abs(v) < 1.2) { this._snap(c); return; }
    var t = this._clampT(c, Math.round(c.pos + v / kd)), d = t - c.pos;
    var k = (Math.abs(d) > .05 && d * v > 0) ? v / d : 10; k = clamp(k, 2.2, 14);
    c.anim = { t: t, k: k, fling: Math.abs(v) > 4 }; this._kick();
  };
  W._unwrapTo = function (c, idx) {
    if (!c.loop) return idx; var cur = c.anim ? c.anim.t : Math.round(c.pos), d = idx - mod(cur, c.n);
    if (d > c.n / 2) d -= c.n; if (d < -c.n / 2) d += c.n; return cur + d;
  };
  W._fixed = function (idx) {
    if (!this.o.fix) return null; var f = this.o.fix(idx.slice()); if (!f) return null;
    for (var i = 0; i < f.length; i++) if (f[i] !== idx[i]) return f; return null;
  };

  /* input */
  W._down = function (e) {
    if (this.closing || this.tp != null) return; e.preventDefault();
    var p = this._local(e), inP = p.x >= 0 && p.x <= this.pw && p.y >= 0 && p.y <= this.ph;
    this.tp = e.pointerId;
    this.g = { x0: p.x, y0: p.y, t0: e.timeStamp, moved: 0, col: inP ? this._colAt(p.x) : -1, samples: [],
      cancel: Math.hypot(p.x - (this.pw - 14), p.y + 20) < 22 };
    if (this.g.col >= 0) { var c = this.cols[this.g.col]; this.act = this.g.col; this.g.caught = !!(c.anim && c.anim.fling); c.anim = null;
      this.g.pos0 = c.pos; this.g.samples.push({ t: e.timeStamp, p: c.pos }); }
    this._kick();
  };
  W._move = function (e) {
    if (e.pointerId !== this.tp || !this.g || this.closing) return;
    var g = this.g, p = this._local(e); g.moved = Math.max(g.moved, Math.hypot(p.x - g.x0, p.y - g.y0));
    if (this.mode === 'drag') {
      var ci = this._colAt(p.x, true);
      if (ci !== g.col) { var cc = this.cols[g.col];
        if (Math.abs(p.x - (cc.x + cc.w / 2)) > cc.w / 2 + 10) { this._snap(cc); g.col = ci; this.act = ci; var nc = this.cols[ci]; nc.anim = null; g.pos0 = nc.pos; g.y0 = p.y; g.samples = []; } }
    }
    if (g.col < 0) return;
    var c = this.cols[g.col];
    c.pos = this._rub(c, g.pos0 - (p.y - g.y0) / this.rowH);
    g.samples.push({ t: e.timeStamp, p: c.pos }); if (g.samples.length > 14) g.samples.shift();
    this._cross(c, g.col); this._kick();
  };
  W._up = function (e) {
    if (e.pointerId !== this.tp) return; var g = this.g; this.tp = null; this.g = null; if (!g || this.closing) return;
    if (e.type === 'pointercancel') { if (this.mode === 'drag') this.close(false); else if (g.col >= 0) this._snap(this.cols[g.col]); return; }
    if (this.mode === 'drag') { this.close(true); return; }
    var p = this._local(e), tap = g.moved < 8 && e.timeStamp - g.t0 < 450;
    if (g.cancel && tap) { this.close(false); return; }
    if (g.col < 0) { if (tap) this.close(true); return; }
    var c = this.cols[g.col];
    if (tap && !g.caught) {
      var dy = p.y - this.ph / 2;
      if (Math.abs(dy) < this.rowH / 2) { this.close(true); return; }
      this._to(c, Math.round(c.pos + Math.asin(clamp(dy / this.R, -1, 1)) / this.A), 12); return;
    }
    this._fling(c, this._vel(g.samples, e.timeStamp));
  };
  W._wheel = function (e) {
    e.preventDefault(); if (this.closing) return;
    var ci = this._colAt(e.clientX - this.left, true), c = this.cols[ci], me = this;
    c.anim = null; c.pos = this._rub(c, c.pos + e.deltaY * (e.deltaMode === 1 ? 16 : 1) / this.rowH * .6); this._cross(c, ci); this._kick();
    clearTimeout(this.wt); this.wt = setTimeout(function () { me._snap(c); }, 110);
  };
  W._key = function (e) {
    if (this.closing) return; var c = this.cols[this.act], t = c.anim ? c.anim.t : Math.round(c.pos);
    if (e.key === 'ArrowUp') this._to(c, t - 1, 16); else if (e.key === 'ArrowDown') this._to(c, t + 1, 16);
    else if (e.key === 'ArrowLeft') this.act = Math.max(0, this.act - 1); else if (e.key === 'ArrowRight') this.act = Math.min(this.cols.length - 1, this.act + 1);
    else if (e.key === 'Enter') this.close(true); else if (e.key === 'Escape') this.close(false); else return;
    e.preventDefault(); this._kick();
  };

  /* public */
  W.indices = function (live) {
    return this.cols.map(function (c) { var r = live ? c.last : (c.anim ? c.anim.t : Math.round(c.pos)); if (!c.loop) r = clamp(r, 0, c.n - 1); return mod(r, c.n); });
  };
  W._itemsOf = function (ix) { var me = this; return ix.map(function (i, k) { return me.cols[k].items[i]; }); };
  W.items = function () { return this._itemsOf(this.indices()); };
  W.set = function (ci, idx, animate) {
    var c = this.cols[ci], t = this._unwrapTo(c, clamp(idx | 0, 0, c.n - 1));
    if (animate === false) { c.anim = null; c.pos = t; this._cross(c, ci); this._kick(); } else this._to(c, t, 12);
  };
  W.fling = function (ci, v) { this._fling(this.cols[ci], v); };
  W.close = function (commit) {
    if (this.closing) return; this.closing = true; var idx = null, me = this;
    if (commit !== false) {
      idx = this.indices(); var f = this._fixed(idx); if (f) idx = f;
      this.cols.forEach(function (c, ci) { var t = me._unwrapTo(c, idx[ci]); me._crossTo(c, ci, t); c.anim = { t: t, k: 22 }; });
      this.green = true;
    } else this.cols.forEach(function (c) { c.anim = null; });
    this.mute = true; this.ct0 = null;
    this._detach();
    var cb = this.o.onDone; if (cb) { try { cb(idx, idx ? this._itemsOf(idx) : null); } catch (err) { setTimeout(function () { throw err; }); } }
    this._kick();
  };
  W.state = function () {
    var me = this;
    return { mode: this.mode, closing: this.closing, dead: this.dead, changes: this.changes, act: this.act,
      rect: { left: this.left, top: this.top, w: this.pw, h: this.ph }, bandY: this.top + this.ph / 2, rowH: this.rowH,
      cols: this.cols.map(function (c) { return { pos: +c.pos.toFixed(4), last: c.last, idx: mod(me._clampT(c, c.last), c.n), moving: !!c.anim, x: me.left + c.x + c.w / 2, w: c.w, n: c.n, loop: c.loop }; }),
      cancel: { x: this.left + this.pw - 14, y: this.top - 20 } };
  };
  W._detach = function () {
    if (this.mode === 'tap') {
      var r = this.root; r.style.pointerEvents = 'none';
      r.removeEventListener('pointerdown', this._d); r.removeEventListener('pointermove', this._m); r.removeEventListener('pointerup', this._u);
      r.removeEventListener('pointercancel', this._u); r.removeEventListener('wheel', this._w); window.removeEventListener('keydown', this._k);
    } else {
      window.removeEventListener('pointermove', this._m, true); window.removeEventListener('pointerup', this._u, true); window.removeEventListener('pointercancel', this._u, true);
    }
    clearTimeout(this.wt);
  };
  W._destroy = function () {
    if (this.dead) return; this.dead = true; if (!this.closing) this._detach();
    if (this.root.parentNode) this.root.parentNode.removeChild(this.root);
    var i = LIVE.indexOf(this); if (i >= 0) LIVE.splice(i, 1);
  };

  /* frame */
  W._kick = function () { if (!this._raf && !this.dead) this._raf = requestAnimationFrame(this._fb); };
  W._step = function (dt) {
    var busy = false, me = this;
    this.cols.forEach(function (c, ci) {
      if (!c.anim) return; var a = c.anim; c.pos = a.t - (a.t - c.pos) * Math.exp(-a.k * dt);
      if (Math.abs(a.t - c.pos) < .004) { c.pos = a.t; c.anim = null;
        if (c.loop && !me.closing) { var m = mod(c.pos, c.n), off = m - c.pos; c.pos = m; c.last += off; } }
      else busy = true;
      me._cross(c, ci);
    });
    if (this.tick > .01) { this.tick *= Math.exp(-dt * 12); busy = true; } else this.tick = 0;
    if (!busy && this.wasBusy && this.tp == null && !this.closing && this.mode === 'tap') {   /* settled: bounce invalid combinations */
      var f = this._fixed(this.indices());
      if (f) { this.cols.forEach(function (c, ci) { if (f[ci] !== mod(Math.round(c.pos), c.n)) me._to(c, me._unwrapTo(c, f[ci]), 10); }); busy = true; }
    }
    this.wasBusy = busy; return busy;
  };
  W._frame = function (ts) {
    this._raf = 0; if (this.dead) return;
    var dt = this._lt ? clamp((ts - this._lt) / 1000, 0, .05) : 1 / 60; this._lt = ts; var w0 = performance.now();
    if (this.t0 == null) this.t0 = ts; if (this.closing && this.ct0 == null) this.ct0 = ts;
    var busy = this._step(dt), lv = Math.min(1, (Math.floor((ts - this.t0) / 36) + 1) / 5);   /* e-ink in: 5 steps, 180 ms */
    if (lv < 1) busy = true;
    if (this.closing) {
      var ce = ts - this.ct0, hold = this.green ? 110 : 0, lc = ce < hold ? 1 : 1 - Math.min(1, (Math.floor((ce - hold) / 40) + 1) / 5);
      lv = Math.min(lv, lc); if (lc <= 0) { this._destroy(); return; } busy = true;
    }
    this.lvl = lv; this._draw();
    if (Wheel.perf) Wheel.perf.push({ t: ts, dt: dt * 1000, work: performance.now() - w0 });
    if (busy) this._kick(); else this._lt = 0;
  };
  W._item = function (x, it, cx, cy, sx, sy, col, fat) {
    var d = this.dpr;
    if (it.icon) {
      var sd = Math.round(this.icoPx * d * 1.15), s = iconSprite(it.icon, sd, col);
      if (s.ready) drawSpr(x, s, cx, cy, sx, sy, sd / this.icoPx);
      else { x.fillStyle = col; x.beginPath(); x.arc(cx, cy, 3 * sy, 0, 6.2832); x.fill(); }
      return;
    }
    var pd = Math.round(this.P * d * 1.15 * 4) / 4, k = pd / this.P;
    drawSpr(x, textSprite(it.text, pd, col, false), cx, cy, sx, sy, k);
    if (fat > .03) { var a = x.globalAlpha; x.globalAlpha = a * fat * .9; drawSpr(x, textSprite(it.text, pd, col, true), cx, cy, sx, sy, k); x.globalAlpha = a; }
  };
  W._rows = function (x, c, hi) {
    var cx = M + c.x + c.w / 2, cy = M + this.ph / 2, R = this.R, A = this.A, lo = Math.floor(c.pos) - 3, top = Math.ceil(c.pos) + 3;
    var col = hi ? (this.green ? GREEN : this.ink) : this.ink;
    for (var i = lo; i <= top; i++) {
      var th = (i - c.pos) * A; if (Math.abs(th) > 1.5) continue; if (hi && Math.abs(i - c.pos) > 1.1) continue;
      var idx = c.loop ? mod(i, c.n) : i; if (idx < 0 || idx >= c.n) continue;
      var y = cy + R * Math.sin(th), co = Math.cos(th), sx = .9 + .1 * co, pop = hi && i === c.last ? 1 + .1 * this.tick : 1;
      x.globalAlpha = hi ? 1 : .62 * Math.pow(co, 1.5);
      this._item(x, c.its[idx], cx, y, sx * pop, co * pop, col, hi && i === c.last ? this.tick : 0);
      if (!hi && idx === c.cur && c.n > 1 && mod(c.last, c.n) !== c.cur) {   /* blue: where this column came from, once it has moved */ x.globalAlpha = Math.min(1, co * 1.2); x.fillStyle = BLUE; x.beginPath(); x.arc(M + c.x + 5, y, 2.6 * co, 0, 6.2832); x.fill(); }
    }
  };
  W._draw = function () {
    var x = this.ctx, d = this.dpr, rowH = this.rowH, cy = M + this.ph / 2, me = this;
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.clearRect(0, 0, this.cv.width, this.cv.height); x.setTransform(d, 0, 0, d, 0, 0);
    x.fillStyle = this.bg; rr(x, M, M, this.pw, this.ph, 18); x.fill();
    x.strokeStyle = this.ink; x.globalAlpha = .18; x.lineWidth = 1; x.stroke();
    x.fillStyle = this.ink; x.globalAlpha = .1 + .08 * this.tick; rr(x, M + 4, cy - rowH / 2 + 2, this.pw - 8, rowH - 4, 11); x.fill();
    if (this.g && this.g.col >= 0) { var ac = this.cols[this.g.col]; x.globalAlpha = .08; rr(x, M + ac.x + 2, cy - rowH / 2 + 2, ac.w - 4, rowH - 4, 9); x.fill(); }
    this.cols.forEach(function (c) { me._rows(x, c, false); });
    x.save(); x.beginPath(); x.rect(M, cy - rowH / 2 + 2, this.pw, rowH - 4); x.clip();
    this.cols.forEach(function (c) { me._rows(x, c, true); });
    x.restore();
    var pd = Math.round(this.P * d * 1.15 * 4) / 4;
    this.cols.forEach(function (c, i) { var s = me.seps[i]; if (!s || i >= me.cols.length - 1) return;
      x.globalAlpha = 1; drawSpr(x, textSprite(s, pd, me.green ? GREEN : me.ink, false), M + c.sepX + c.sepW / 2, cy, 1, 1, pd / me.P); });
    if (this.mode === 'tap') {   /* cancel: a small x above the top-right corner */
      var kx = M + this.pw - 14, ky = M - 20; x.globalAlpha = .55; x.strokeStyle = this.ink; x.lineWidth = 1.2;
      x.beginPath(); x.arc(kx, ky, 10, 0, 6.2832); x.stroke();
      var p2 = Math.round(2.2 * d * 4) / 4; drawSpr(x, textSprite('x', p2, this.ink, false), kx, ky, 1, 1, p2 / 2.2);
    }
    if (this.lvl < 1) {
      x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'destination-out';
      if (this.lvl <= 0) x.fillRect(0, 0, this.cv.width, this.cv.height);
      else { x.fillStyle = this.patIn[Math.max(0, Math.min(3, Math.round(this.lvl * 5) - 1))]; x.fillRect(0, 0, this.cv.width, this.cv.height); }
      x.globalCompositeOperation = 'source-over';
    }
  };

  /* drawing helpers shared with pages (dot-matrix text and icons on any 2D canvas) */
  function text(x, str, cx, cy, P, color, align, dpr, fat) {
    str = String(str); dpr = dpr || 1; var pd = Math.round(P * dpr * 4) / 4; if (pd < .5) return;
    var s = textSprite(str, pd, color || '#fff', !!fat), w = s.width / pd * P, h = s.height / pd * P;
    var l = align === 'l' ? cx - P / pd : (align === 'r' ? cx - w + P / pd : cx - w / 2);
    x.drawImage(s, l, cy - h / 2, w, h);
  }
  function icon(x, name, cx, cy, size, color, dpr) {
    dpr = dpr || 1; var sd = Math.round(size * dpr), s = iconSprite(name, sd, color || '#fff'); if (!s.ready) return false;
    x.drawImage(s, cx - size / 2, cy - size / 2, size, size); return true;
  }
  function seq(lo, hi, step, dec, pad) {
    var a = [], n = Math.round((hi - lo) / step); for (var i = 0; i <= n; i++) { var v = (lo + i * step).toFixed(dec || 0); while (pad && v.length < pad) v = '0' + v; a.push(v); } return a;
  }

  var Wheel = window.Wheel = {
    open: function (o) { return new Wh(o); },
    text: text, textW: textW, icon: icon, seq: seq, GL: GL, BLUE: BLUE, GREEN: GREEN, bayer: bayerCanvas,
    onIcon: function (f) { ICONWAIT.push(f); },
    active: function () { for (var i = 0; i < LIVE.length; i++) if (!LIVE[i].closing) return LIVE[i]; return null; },
    last: null, perf: null
  };
})();
