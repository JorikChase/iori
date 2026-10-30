/* Gestures scripted inside the page. page.mouse goes through the browser's input queue, and on a loaded machine a drag
   can take a second to arrive and turn into a hold; a timeline run in the page keeps the gesture's own timing. The
   events are real PointerEvents on the tool's own element, so the tool's handlers run as they do for a finger.

   await d.install(page, '#sb')   then inside page.evaluate:  await G.drag(x0, y0, x1, y1, {ms, steps, hold, lift})
   G.down / G.move / G.up / G.cancel / G.tap / G.wait; a second finger takes id 2 (a pointerId, isPrimary only on 1).
   G.frame(fn) resolves on the first animation frame where fn() is truthy, with a timeout.

   d.audioLog(page) then a reload: every oscillator start lands in window.__OSC, the last 256-wide texture (the synth's
   live waveform) in window.__WV, every uniform1f by name in window.__U, the dot-matrix text cells in window.__TD.
   d.panels(page) reads that text back: every tool writes its 3×5 glyphs into a band of 8 cells of 4 columns. */
const AUDIO_LOG = () => {
  const Osc = window.OscillatorNode; if (!Osc) return; const s = Osc.prototype.start; window.__OSC = [];
  Osc.prototype.start = function (t) { if (t > 0) window.__OSC.push({ t, f: this.frequency.value, type: this.type }); return s.apply(this, arguments); };
  const GL = window.WebGLRenderingContext && WebGLRenderingContext.prototype; if (!GL) return; window.__U = {};
  const ti = GL.texImage2D; GL.texImage2D = function () { const a = arguments; if (a.length === 9 && a[3] === 256 && a[4] === 1 && a[8]) window.__WV = Array.from(a[8]); if (a.length === 9 && a[6] === 6410) window.__TD = { w: a[3], h: a[4], d: a[8] }; return ti.apply(this, a); };
  const gl = GL.getUniformLocation; GL.getUniformLocation = function (p, n) { const l = gl.call(this, p, n); if (l) l.__n = n; return l; };
  const u1 = GL.uniform1f; GL.uniform1f = function (l, v) { if (l) window.__U[l.__n] = v; return u1.call(this, l, v); };
};
const G_INIT = (sel) => { const el = typeof sel === 'string' ? document.querySelector(sel) : sel, wait = (t) => new Promise(r => setTimeout(r, t));
  const ev = (t, x, y, id = 1, target) => (target || el).dispatchEvent(new PointerEvent(t, { clientX: x, clientY: y, pointerId: id, isPrimary: id === 1, pointerType: 'touch', button: 0, buttons: t === 'pointerup' || t === 'pointercancel' ? 0 : 1, bubbles: true, cancelable: true }));
  const G = window.G = { el, wait, pos: {},
    down(x, y, id = 1) { G.pos[id] = { x, y }; ev('pointerdown', x, y, id); }, move(x, y, id = 1) { G.pos[id] = { x, y }; ev('pointermove', x, y, id); },
    up(id = 1) { const p = G.pos[id] || { x: 0, y: 0 }; ev('pointerup', p.x, p.y, id); }, cancel(id = 1) { const p = G.pos[id] || { x: 0, y: 0 }; ev('pointercancel', p.x, p.y, id); },
    async to(x1, y1, { ms = 120, steps = 8, id = 1 } = {}) { const p = G.pos[id], x0 = p.x, y0 = p.y; for (let k = 1; k <= steps; k++) { G.move(x0 + (x1 - x0) * k / steps, y0 + (y1 - y0) * k / steps, id); await wait(ms / steps); } },
    async drag(x0, y0, x1, y1, { ms = 120, steps = 8, hold = 0, rest = 0, lift = true, id = 1 } = {}) { G.down(x0, y0, id); if (hold) await wait(hold); await G.to(x1, y1, { ms, steps, id }); if (rest) await wait(rest); if (lift) G.up(id); },
    async tap(x, y, { ms = 0, id = 1 } = {}) { G.down(x, y, id); if (ms) await wait(ms); G.up(id); },   // no gap by default: load cannot age a tap into a hold
    frame(fn, timeout = 4000) { return new Promise(res => { const t0 = performance.now(), go = () => { let v = false; try { v = fn(); } catch (_) {} if (v || performance.now() - t0 > timeout) res(v || false); else requestAnimationFrame(go); }; go(); }); } };
};
async function install(page, sel, frame = null) { await (frame || page).evaluate(G_INIT, sel); }
async function audioLog(page) { await page.addInitScript(AUDIO_LOG); }

/* a page's PNG -> one pixel, in CSS px; read in a blank page (the GL buffer is gone after present) */
async function pixels(br, png, pts, dpr) {
  const p = await (await br.newContext()).newPage();
  const v = await p.evaluate(async ([src, pts, dpr]) => { const im = new Image(); im.src = src; await im.decode();
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0);
    return pts.map(q => Array.from(g.getImageData(Math.round(q.x * dpr), Math.round(q.y * dpr), 1, 1).data).slice(0, 3)); }, ['data:image/png;base64,' + png.toString('base64'), pts, dpr]);
  await p.context().close(); return v;
}

const GLYPH = { 111101101101111: '0', '010110010010111': '1', 111001111100111: '2', 111001111001111: '3', 101101111001001: '4', 111100111001111: '5', 111100111101111: '6', 111001001001001: '7', 111101111101111: '8', 111101111001111: '9', '000000000000010': '.', '000000111000000': '-', 100101110101101: 'k', '000010000010000': ':' };
const panels = (page) => page.evaluate((GLYPH) => { const T = window.__TD; if (!T) return []; const out = [], at = (x, y) => T.d[(y * T.w + x) * 2] > 110, half = T.w >= 64 ? T.w / 2 : T.w;
  for (let b = 0; (b + 1) * 5 <= T.h; b++) for (let co = 0; co < T.w; co += half) { let s = ''; for (let k = 0; k < 8 && co + k * 4 + 3 <= T.w; k++) { let g = ''; for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) g += at(co + k * 4 + c, b * 5 + r) ? '1' : '0'; s += /^0+$/.test(g) ? ' ' : (GLYPH[g] || '?'); } s = s.trim(); if (s) out.push(s); } return out; }, GLYPH);
const clean = (page) => page.errors.filter(e => !/serviceworker|service worker|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED/i.test(e));   // the shell's analytics, offline
module.exports = { install, audioLog, pixels, panels, clean };
