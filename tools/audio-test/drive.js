/* Gestures scripted inside the page. page.mouse goes through the browser's input queue, and on a loaded machine a drag
   can take a second to arrive and turn into a hold; a timeline run in the page keeps the gesture's own timing. The
   events are real PointerEvents on the tool's own element, so the tool's handlers run as they do for a finger.

   await d.install(page, '#sb')   then inside page.evaluate:  await G.drag(x0, y0, x1, y1, {ms, steps, hold, lift})
   G.down / G.move / G.up / G.cancel / G.tap / G.wait; a second finger takes id 2 (a pointerId, isPrimary only on 1).
   G.frame(fn) resolves on the first animation frame where fn() is truthy, with a timeout.

   d.audioLog(page) then a reload: every oscillator start lands in window.__OSC, the last 256-wide texture (the synth's
   live waveform) in window.__WV, every uniform1f by name in window.__U. */
const AUDIO_LOG = () => {
  const Osc = window.OscillatorNode; if (!Osc) return; const s = Osc.prototype.start; window.__OSC = [];
  Osc.prototype.start = function (t) { if (t > 0) window.__OSC.push({ t, f: this.frequency.value, type: this.type }); return s.apply(this, arguments); };
  const GL = window.WebGLRenderingContext && WebGLRenderingContext.prototype; if (!GL) return; window.__U = {};
  const ti = GL.texImage2D; GL.texImage2D = function () { const a = arguments; if (a.length === 9 && a[3] === 256 && a[4] === 1 && a[8]) window.__WV = Array.from(a[8]); return ti.apply(this, a); };
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
    async tap(x, y, { ms = 40, id = 1 } = {}) { G.down(x, y, id); await wait(ms); G.up(id); },
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

const clean = (page) => page.errors.filter(e => !/serviceworker|service worker/i.test(e));
module.exports = { install, audioLog, pixels, clean };
