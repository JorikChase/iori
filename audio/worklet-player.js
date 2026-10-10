/* Audio Tools — Practice player engine (AudioWorklet), loaded by t/play.html:
     ctx.audioWorklet.addModule('../worklet-player.js'); new AudioWorkletNode(ctx, 'practice-player', {numberOfInputs: 0, outputChannelCount: [2]})

   The song is a mono Float32 take; speed (0.5..1.5) moves the read head, pitch (±12 semitones) resamples each grain,
   so the two are independent. Grains: N = 2048 output samples, hop 512, Hann window (4× overlap, sum 2 → ×0.5).
   Two grain placements:
     'wsola' (default)  each grain's read start may move ±10 ms off the nominal head to the offset whose waveform best
                        continues the previous grain (normalised cross-correlation: coarse on a 4× box-decimated copy,
                        then ±4 samples at full rate). Phase-continuous: a 440 Hz tone stays 440 Hz at any speed.
     'ola'              the original engine: every grain centred on the nominal head. Partials drift and comb at
                        speeds ≠ 100 % or pitch ≠ 0 (a 440 Hz tone at 75 % peaks near 424 Hz).

   Messages in (port):
     {t:'song', id, sr, data: Float32Array, dec: Float32Array}   once per song, buffers transferred; dec[k] = mean of
                                                                data[4k..4k+3] (built on the main thread, off the audio thread)
     {t:'state', seq, pos?, speed, semi, loop: {a, b} (s) | null, trainer, play, algo}
                                                                pos (song samples) only when seeking; a changed loop
                                                                restarts the pass count
   Messages out:
     {t:'pos', seq, pos, speed, pass, time}   every 3 quanta while playing, and once after each state message.
        pos is the read head (song samples) at audio-clock time `time` (s), continuous between hops;
        seq = the last state applied, so the page can drop reports older than its own last change.
   Loop A–B wraps on the audio thread; the trainer adds 5 % per pass (to 100 %) at the wrap itself.
   Real audio only: silence until a song plays, nothing generated, no keep-alive needed.

   Also loadable in Node (module.exports = Engine) for offline checks. */
(function () {
  'use strict';
  var N = 2048, HOP = 512, WIN = new Float32Array(N), DEC = 4;
  for (var i = 0; i < N; i++) WIN[i] = (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N)) * 0.5;   // ×0.5: 4× Hann overlap sums to 2

  function Engine(rate) {
    this.rate = rate; this.acc = new Float32Array(N); this.buf = new Float32Array(HOP); this.oi = HOP;
    this.song = null; this.pos = 0; this.speed = 1; this.semi = 0; this.loop = null; this.trainer = false; this.play = false;
    this.pass = 0; this.algo = 'wsola'; this.prev = null; this.idle = 4; this.seq = 0;
    this.onWrap = null;
  }
  Engine.prototype.setSong = function (m) {
    this.song = { id: m.id, sr: m.sr, data: m.data, dec: m.dec || null, len: m.data.length };
    this.prev = null; this.pos = 0; this.pass = 0;
  };
  Engine.prototype.setState = function (m) {
    if (m.pos != null && isFinite(m.pos)) this.pos = Math.max(0, +m.pos);
    if (m.speed != null) this.speed = Math.max(0.25, Math.min(4, +m.speed || 1));
    if (m.semi != null) this.semi = Math.max(-24, Math.min(24, +m.semi || 0));
    if (m.loop !== undefined) {
      var l = m.loop, o = this.loop, nl = l && l.b > l.a ? { a: +l.a, b: +l.b } : null;
      if (!nl || !o || nl.a !== o.a || nl.b !== o.b) this.pass = 0;   // a new (or no) loop counts its passes from 0
      this.loop = nl;
    }
    if (m.trainer != null) this.trainer = !!m.trainer;
    if (m.play != null) this.play = !!m.play;
    if (m.algo === 'ola' || m.algo === 'wsola') this.algo = m.algo;
    if (m.seq != null) this.seq = m.seq;
  };
  /* best read-start offset (song samples) for a grain at `st` that continues the previous grain, whose natural
     continuation starts at `nat`; r = read step per output sample. 0 when there is nothing to match. */
  Engine.prototype.search = function (st, nat, r) {
    if (Math.abs(nat - st) < 1) return nat - st;   // 100 %, 0 semitones: the head already continues the grain (same as 'ola')
    var sg = this.song, d = sg.data, len = sg.len, D = Math.round(0.010 * sg.sr);
    var L = Math.round(Math.min(1024, 1024 * r)), c = Math.round((N - HOP) / 2 * r - L / 2);   // where both windows weigh most
    var s0 = Math.round(st) + c, n0 = Math.round(nat) + c;
    if (n0 < 0 || n0 + L >= len || s0 + L + D + DEC >= len || s0 - D - DEC < 0) return 0;
    var base = Math.round(st) - st, best = 0, bs = -Infinity, e = 0, k, j, x, y, a, b;
    var dc = sg.dec;
    /* coarse, on the decimated copy */
    if (dc) {
      var Lq = L / DEC | 0, nq = n0 / DEC | 0, Dq = D / DEC | 0, sq = s0 / DEC | 0;
      for (j = 0; j < Lq; j++) { a = dc[nq + j]; e += a * a; }
      if (e < 1e-9 * Lq) return 0;   // silence: nothing to align
      for (k = -Dq; k <= Dq; k++) {
        x = 0; y = 1e-12;
        for (j = 0; j < Lq; j++) { a = dc[nq + j]; b = dc[sq + k + j]; x += a * b; y += b * b; }
        x /= Math.sqrt(y); if (x > bs) { bs = x; best = k * DEC; }
      }
    }
    /* fine, full rate, ±DEC around the coarse pick (step 2 through the window) */
    var f0 = best, F = dc ? DEC : D; bs = -Infinity; e = 0;
    for (j = 0; j < L; j += 2) { a = d[n0 + j]; e += a * a; }
    if (e < 1e-9 * L) return 0;
    for (k = f0 - F; k <= f0 + F; k++) {
      if (s0 + k < 0 || s0 + k + L >= len) continue;
      x = 0; y = 1e-12;
      for (j = 0; j < L; j += 2) { a = d[n0 + j]; b = d[s0 + k + j]; x += a * b; y += b * b; }
      x /= Math.sqrt(y); if (x > bs) { bs = x; best = k; }
    }
    /* keep the fractional phase of the natural continuation: integer offsets around round(st), then nat's fraction */
    return best + base + ((nat - Math.round(nat)));
  };
  Engine.prototype.grain = function () {
    var sg = this.song, d = sg.data, len = sg.len, A = this.acc, q = sg.sr / this.rate, r = Math.pow(2, this.semi / 12) * q;
    var st = this.pos - N * r / 2;
    if (this.algo === 'wsola' && this.prev) st += this.search(st, this.prev.st + HOP * this.prev.r, r);
    for (var j = 0; j < N; j++) {
      var x = st + j * r, i0 = Math.floor(x); if (i0 < 0 || i0 >= len - 1) continue;
      var f = x - i0; A[j] += (d[i0] + (d[i0 + 1] - d[i0]) * f) * WIN[j];
    }
    this.prev = { st: st, r: r };
    this.pos += HOP * this.speed * q;
    if (this.loop && this.pos >= this.loop.b * sg.sr) {
      this.pos -= (this.loop.b - this.loop.a) * sg.sr; this.pass++;
      if (this.trainer && this.speed < 1) this.speed = Math.min(1, Math.round((this.speed + 0.05) * 100) / 100);
      if (this.onWrap) this.onWrap();
    }
    if (this.pos >= len) this.pos = 0;
  };
  Engine.prototype.hop = function () {
    var A = this.acc;
    if (this.play && this.song) { this.grain(); this.idle = 0; }
    else { this.prev = null; if (this.idle < 4) this.idle++; }
    this.buf.set(A.subarray(0, HOP)); A.copyWithin(0, HOP); A.fill(0, N - HOP);
  };
  /* fill `out` (one channel) and copy it to the others */
  Engine.prototype.render = function (L, R) {
    var n = L.length, at = 0;
    if (!this.play && this.idle >= 4 && this.oi >= HOP) { L.fill(0); if (R) R.fill(0); return; }   // drained: silence, no work
    while (at < n) {
      if (this.oi >= HOP) { this.hop(); this.oi = 0; }
      var k = Math.min(n - at, HOP - this.oi);
      for (var i = 0; i < k; i++) L[at + i] = this.buf[this.oi + i] * 0.9;
      this.oi += k; at += k;
    }
    if (R) R.set(L);
  };
  /* the read head now, continuous between hops: the head already moved a whole hop when the hop's audio began */
  Engine.prototype.headNow = function () {
    var sg = this.song; if (!sg) return 0;
    if (!this.play) return this.pos;
    var p = this.pos - (HOP - this.oi) * this.speed * sg.sr / this.rate;
    if (this.loop && p < this.loop.a * sg.sr) p += (this.loop.b - this.loop.a) * sg.sr;
    return Math.max(0, p);
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
  if (typeof registerProcessor !== 'function') return;

  class Player extends AudioWorkletProcessor {
    constructor() {
      super();
      var self = this; this.e = new Engine(sampleRate); this.q = 0; this.ack = false;
      this.port.onmessage = function (ev) {
        var m = ev.data || {};
        if (m.t === 'song') self.e.setSong(m);
        else if (m.t === 'state') { self.e.setState(m); self.ack = true; }
      };
    }
    process(inputs, outputs) {
      var o = outputs[0], L = o && o[0]; if (!L) return true;
      var e = this.e; e.render(L, o[1] || null);
      if (this.ack || (e.play && ++this.q >= 3)) {
        this.q = 0; this.ack = false;
        if (e.song) this.port.postMessage({ t: 'pos', seq: e.seq, pos: e.headNow(), speed: e.speed, pass: e.pass, play: e.play, time: currentTime + L.length / sampleRate });
      }
      return true;
    }
  }
  registerProcessor('practice-player', Player);
})();
