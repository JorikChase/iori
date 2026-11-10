// The figures of chapter 3: the ground from above, hill-shaded, with a chart beside it and the same measurement
// strip as the other figures.
//   <figure class="groundfig" data-mode="spl|region|transport|score">
//   createGroundFig(el) returns { start(), stop(), advance(n), state() }
import { createSPL, makeGrid, fbm, ridged, measureGround, hydro, EARTH, A_C } from './ground.js?v=1';
import { createTransport } from './transport.js?v=1';

const tok = (n, d) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || d;
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const f2 = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '–');
const big = (v) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)} M` : Math.abs(v) >= 1e3 ? `${(v / 1e3).toFixed(0)} k` : v.toFixed(0));
function fit(canvas) {
  const dpr = Math.min(devicePixelRatio || 1, 2), w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}
function slider(name, mn, mx, st, val, fmt) {
  const inp = el('input'); Object.assign(inp, { type: 'range', min: mn, max: mx, step: st, value: val });
  const out = el('span', 'value', fmt(val)), lab = el('label', null, name + ' '); lab.append(inp, out);
  inp.addEventListener('input', () => { out.textContent = fmt(+inp.value); });
  return { lab, inp, out };
}
const button = (t) => { const b = el('button', null, t); b.type = 'button'; return b; };

// hypsometric tint, hill shade from the north-west, channels and lakes in blue
const TINT = [[0, [214, 222, 196]], [0.25, [196, 206, 168]], [0.5, [206, 190, 150]], [0.75, [184, 162, 132]], [1, [236, 232, 226]]];
const tint = (u) => { u = Math.max(0, Math.min(1, u)); for (let i = 1; i < TINT.length; i++) if (u <= TINT[i][0]) { const [a, ca] = TINT[i - 1], [b, cb] = TINT[i], t = (u - a) / (b - a); return ca.map((v, k) => v + (cb[k] - v) * t); } return TINT[4][1]; };
/** paint a heightfield (metres) into an n×n ImageData; opts: { cell, A (area m²), water (depth m), dep (deposit m), Q (0–1 discharge) } */
function paint(n, h, o) {
  const id = new ImageData(n, n), d = id.data;
  let lo = Infinity, hi = -Infinity; for (let i = 0; i < n * n; i++) { if (h[i] < lo) lo = h[i]; if (h[i] > hi) hi = h[i]; }
  const ex = o.exag || 1, inv = 1 / (hi - lo || 1);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, xm = i > 0 ? k - 1 : k, xp = i < n - 1 ? k + 1 : k, ym = j > 0 ? k - n : k, yp = j < n - 1 ? k + n : k;
    const gx = (h[xp] - h[xm]) / ((xp - xm) * o.cell), gy = (h[yp] - h[ym]) / (((yp - ym) / n) * o.cell);
    const shade = Math.max(0.35, Math.min(1.25, 1 - ex * 0.9 * (gx + gy) / Math.sqrt(1 + ex * ex * (gx * gx + gy * gy))));
    let c = tint((h[k] - lo) * inv).map((v) => v * shade);
    if (o.dep && o.dep[k] > 0.3) { const a = Math.min(1, o.dep[k] / 6); c = [c[0] * (1 - a) + 222 * a * shade, c[1] * (1 - a) + 178 * a * shade, c[2] * (1 - a) + 112 * a * shade]; }
    if (o.water && o.water[k] > 0.3) c = [120, 160, 205];
    if (o.A && o.A[k] >= (o.Ac || A_C)) { const a = Math.min(1, 0.35 + 0.18 * Math.log10(o.A[k] / (o.Ac || A_C))); c = [c[0] * (1 - a) + 45 * a, c[1] * (1 - a) + 111 * a, c[2] * (1 - a) + 210 * a]; }
    if (o.Q && o.Q[k] > 0.3) { const a = Math.min(1, (o.Q[k] - 0.3) * 1.6); c = [c[0] * (1 - a) + 45 * a, c[1] * (1 - a) + 111 * a, c[2] * (1 - a) + 210 * a]; }
    const p = k * 4; d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; d[p + 3] = 255;
  }
  return id;
}
function blit(ctx, id, x, y, s, label) {
  const c = new OffscreenCanvas(id.width, id.height); c.getContext('2d').putImageData(id, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.drawImage(c, x, y, s, s);
  ctx.strokeStyle = tok('--rule', '#e7e9eb'); ctx.strokeRect(x, y, s, s);
  if (label) { ctx.fillStyle = tok('--muted', '#74797f'); ctx.font = `10px ${tok('--mono', 'monospace')}`; ctx.textAlign = 'left'; ctx.fillText(label, x + 2, y + s + 12); }
}
function axes(ctx, x0, y0, w, h, xl, yl) {
  const muted = tok('--muted', '#74797f');
  ctx.font = `10px ${tok('--mono', 'monospace')}`; ctx.strokeStyle = muted; ctx.strokeRect(x0, y0, w, h);
  ctx.fillStyle = muted; ctx.textAlign = 'center'; ctx.fillText(xl, x0 + w / 2, y0 + h + 14);
  if (yl) { ctx.save(); ctx.translate(x0 - 32, y0 + h / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(yl, 0, 0); ctx.restore(); }
}

// the region of paper 0, generated in its own worker
function region(opts) {
  return new Promise((res, rej) => {
    const w = new Worker(new URL('../fractals/landscape-worker.js', import.meta.url), { type: 'module' });
    w.onmessage = (e) => { if (e.data.type === 'done') { w.terminate(); res(e.data.terrain); } else if (e.data.type === 'error') { w.terminate(); rej(new Error(e.data.error)); } else if (opts.onProgress) opts.onProgress(e.data.f, e.data.stage); };
    w.onerror = (e) => { w.terminate(); rej(e); };
    const { onProgress, ...o } = opts; w.postMessage({ opts: o });
  });
}

export function createGroundFig(fig) {
  const mode = fig.dataset.mode, cap = fig.querySelector('figcaption'), canvas = fig.querySelector('canvas');
  const bar = el('div', 'controls lin-controls'), status = el('p', 'status'), strip = el('dl', 'lin-metrics');
  fig.insertBefore(bar, cap); fig.insertBefore(status, cap);
  let table = null;
  if (mode === 'score') { table = el('div', 'ground-table'); fig.insertBefore(table, cap); } else fig.insertBefore(strip, cap);
  let running = false, raf = 0, playing = true, dirty = true, seed = 1;
  const play = button('Pause'), seedB = button('New seed');
  const setPlaying = (v) => { playing = v; play.textContent = v ? 'Pause' : 'Play'; };
  play.addEventListener('click', () => setPlaying(!playing));
  const M = { spl: splMode, region: regionMode, transport: transportMode, score: scoreMode }[mode]();
  seedB.addEventListener('click', () => { seed++; M.reset(); });
  addEventListener('resize', () => { dirty = true; });
  function tick() {
    if (!running) return;
    raf = requestAnimationFrame(tick);
    if (playing && M.step) { if (!M.step()) setPlaying(false); dirty = true; }
    if (dirty) { draw(); dirty = false; }
  }
  function draw() { const { ctx, w, h } = fit(canvas); ctx.fillStyle = tok('--paper', '#fff'); ctx.fillRect(0, 0, w, h); M.draw(ctx, w, h); M.report(); }
  function rows(r) { strip.innerHTML = r.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join(''); }
  // map on the left (or top on a phone), chart beside it
  function split(w, h) {
    const wide = w >= 620, s = wide ? Math.min(h - 24, w * 0.5) : Math.min(w - 16, h * 0.56);
    return wide ? { mx: 8, my: 6, s, cx: 8 + s + 56, cy: 10, cw: w - s - 78, ch: h - 46 } : { mx: (w - s) / 2, my: 6, s, cx: 50, cy: s + 30, cw: w - 64, ch: h - s - 72 };
  }

  // ---------------------------------------------------------------- 3.1 uplift against stream power
  function splMode() {
    let S, hist = [], meas = null, steps = 0, ms = 0;
    const solver = el('select'); for (const [v, t] of [['implicit', 'implicit (Braun–Willett)'], ['explicit', 'explicit']]) { const o = el('option', null, t); o.value = v; solver.append(o); }
    solver.setAttribute('aria-label', 'Solver');
    const dt = slider('Time step', 3, 5.3, 0.1, 5, (v) => `${Math.round(10 ** v / 1000)} kyr`);
    const creep = el('input'); creep.type = 'checkbox'; creep.checked = true; const cl = el('label'); cl.append(creep, document.createTextNode(' Hillslopes creep'));
    const restart = button('Restart');
    bar.append(play, solver, restart, seedB); const bar2 = el('div', 'controls lin-controls'); bar2.append(dt.lab, cl); fig.insertBefore(bar2, status);
    const TMAX = 15e6;
    function reset() { S = createSPL({ seed }); apply(); hist = []; meas = null; steps = 0; setPlaying(true); dirty = true; }
    function apply() { if (!S) return; S.P.solver = solver.value; S.P.dt = 10 ** +dt.inp.value; S.P.creep = creep.checked; }
    solver.addEventListener('change', () => { reset(); });
    dt.inp.addEventListener('change', () => { reset(); });
    creep.addEventListener('change', () => { reset(); });
    restart.addEventListener('click', reset);
    reset();
    return {
      reset,
      step() {
        if (S.t >= TMAX) { meas = measureGround(S.g); return false; }
        const t0 = performance.now(), budget = S.P.dt < 2e4 ? 25 : 1;
        for (let k = 0; k < budget && S.t < TMAX; k++) { S.step(); steps++; }
        ms = (performance.now() - t0) / budget;
        const st = S.stats(); hist.push(st);
        if (steps % (S.P.dt < 2e4 ? 250 : 15) === 0) meas = measureGround(S.g);
        return true;
      },
      draw(ctx, w, h) {
        const L = split(w, h), g = S.g;
        blit(ctx, paint(g.n, g.h, { cell: g.cell, A: g.A, exag: 2 }), L.mx, L.my, L.s, `${g.S / 1000} km · ${g.n}² cells`);
        // mean and highest elevation against time
        const { cx, cy, cw, ch } = L, ink = tok('--ink', '#1d2024'), walk = tok('--walk', '#e0703a'), muted = tok('--muted', '#74797f');
        axes(ctx, cx, cy, cw, ch, 'million years', 'elevation, m');
        let top = 1200; for (const r of hist) if (Number.isFinite(r.max)) top = Math.max(top, Math.min(4000, r.max));
        const X = (t) => cx + t / TMAX * cw, Y = (v) => cy + ch - Math.max(0, Math.min(1, v / top)) * ch;
        ctx.textAlign = 'right'; ctx.fillStyle = muted; for (let v = 0; v <= top; v += 500) ctx.fillText(v, cx - 3, Y(v) + 3);
        ctx.textAlign = 'center'; for (let t = 0; t <= 15; t += 5) ctx.fillText(t, X(t * 1e6), cy + ch + 26);
        for (const [k, c] of [['max', walk], ['mean', ink]]) { ctx.strokeStyle = c; ctx.lineWidth = 1.6; ctx.beginPath(); hist.forEach((r, i) => { i ? ctx.lineTo(X(r.t), Y(r[k])) : ctx.moveTo(X(r.t), Y(r[k])); }); ctx.stroke(); }
        ctx.lineWidth = 1; ctx.textAlign = 'left'; ctx.fillStyle = walk; ctx.fillText('highest point', cx + 6, cy + 13); ctx.fillStyle = ink; ctx.fillText('mean height', cx + 6, cy + 26);
      },
      report() {
        const st = S.stats();
        rows([['Time', `${f2(st.t / 1e6, 1)} Myr`], ['Highest', `${f2(st.max, 0)} m`], ['Courant number', f2(st.courant, 1)], ['Hack h', meas ? f2(meas.hack_h) : '–'], ['Concavity θ', meas ? f2(meas.concavity) : '–'], ['τ', meas ? f2(meas.tau) : '–']]);
        status.textContent = `${S.P.solver} · step ${Math.round(S.P.dt / 1000)} kyr · ${steps.toLocaleString('en')} steps · ${f2(ms, 1)} ms a step${st.courant > 1 && S.P.solver === 'explicit' ? ' · above 1: unstable' : ''}`;
      },
      state: () => ({ ...S.stats(), meas, steps }),
      advance(n) { for (let i = 0; i < n; i++) if (!this.step()) break; },
    };
  }

  // ---------------------------------------------------------------- 3.2 paper 0's region
  function regionMode() {
    let T = null, busy = false, prog = 0;
    const cells = el('select'); for (const [v, t] of [['129', '129² cells'], ['257', '257² cells'], ['513', '513² cells (paper 0)']]) { const o = el('option', null, t); o.value = v; cells.append(o); }
    cells.value = '257'; cells.setAttribute('aria-label', 'Resolution');
    bar.append(cells, seedB);
    async function reset() {
      if (busy) return; busy = true; T = null; prog = 0; dirty = true; const t0 = performance.now();
      try { T = await region({ seed, size_m: 10000, cells: +cells.value, seaQuantile: 0.08, onProgress: (f) => { prog = f; dirty = true; } }); T.ms = performance.now() - t0; }
      catch (e) { console.error(e); status.textContent = 'The region could not be generated in this browser.'; }
      busy = false; dirty = true;
    }
    cells.addEventListener('change', reset);
    reset();
    return {
      reset,
      draw(ctx, w, h) {
        const L = split(w, h);
        if (!T) { ctx.fillStyle = tok('--muted', '#74797f'); ctx.font = `11px ${tok('--mono', 'monospace')}`; ctx.textAlign = 'center'; ctx.fillText(`forming the region … ${Math.round(prog * 100)} %`, L.mx + L.s / 2, L.my + L.s / 2); return; }
        const water = new Float32Array(T.n * T.n); for (let k = 0; k < water.length; k++) water[k] = T.waterKind[k] ? 1 : 0;
        blit(ctx, paint(T.n, T.height, { cell: T.cell_m, A: T.area, water, exag: 1.2 }), L.mx, L.my, L.s, `10 km · ${T.n}² cells`);
        // Hack's law: longest path against area, the fitted points and Earth's band of slopes 0.57–0.60
        const { cx, cy, cw, ch } = L, f = T.stats.fits.hack, muted = tok('--muted', '#74797f'), walk = tok('--walk', '#e0703a'), data = tok('--data', '#23936a');
        axes(ctx, cx, cy, cw, ch, 'drainage area, km²', 'longest stream, km');
        if (!f || !f.pts.length) return;
        const xs = f.pts.map((p) => p[0]), ys = f.pts.map((p) => p[1]), x0 = Math.min(...xs) - 0.2, x1 = Math.max(...xs) + 0.2, y0 = Math.min(...ys) - 0.2, y1 = Math.max(...ys) + 0.2;
        const X = (v) => cx + (v - x0) / (x1 - x0) * cw, Y = (v) => cy + ch - (v - y0) / (y1 - y0) * ch;
        const NICE = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];
        ctx.fillStyle = muted; ctx.textAlign = 'center'; for (const v of NICE) { const e = Math.log10(v * 1e6); if (e >= x0 && e <= x1) ctx.fillText(v, X(e), cy + ch + 26); }
        ctx.textAlign = 'right'; for (const v of NICE) { const e = Math.log10(v * 1e3); if (e >= y0 && e <= y1) ctx.fillText(v, cx - 3, Y(e) + 3); }
        const mxv = xs[0], myv = ys[0];
        ctx.save(); ctx.beginPath(); ctx.rect(cx, cy, cw, ch); ctx.clip();
        ctx.fillStyle = 'rgba(35,147,106,0.14)'; ctx.beginPath(); ctx.moveTo(X(mxv), Y(myv)); ctx.lineTo(X(x1), Y(myv + 0.57 * (x1 - mxv))); ctx.lineTo(X(x1), Y(myv + 0.60 * (x1 - mxv))); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = data; ctx.beginPath(); ctx.moveTo(X(mxv), Y(myv)); ctx.lineTo(X(x1), Y(myv + 0.585 * (x1 - mxv))); ctx.stroke();
        ctx.fillStyle = walk; for (const [x, y] of f.pts) { ctx.beginPath(); ctx.arc(X(x), Y(y), 2.6, 0, 6.283); ctx.fill(); }
        ctx.restore();
        ctx.textAlign = 'left'; ctx.fillStyle = data; ctx.fillText('Earth, h 0.57–0.60', cx + 6, cy + 13); ctx.fillStyle = walk; ctx.fillText(`region, h ${f2(T.stats.hack_h)}`, cx + 6, cy + 26);
      },
      report() {
        const s = T && T.stats;
        rows([['Hack h', s ? f2(s.hack_h) : '–'], ['τ', s ? f2(s.tau) : '–'], ['Horton R_B', s ? f2(s.horton_Rb) : '–'], ['Concavity θ', s ? f2(s.concavity) : '–'], ['Hypsometric integral', s ? f2(s.hypsometric_integral) : '–'], ['Coastline D', s ? f2(s.coastline_D) : '–']]);
        status.textContent = T ? `seed ${seed} · formed in ${f2(T.ms / 1000, 1)} s · relief ${f2(T.stats.relief_m, 0)} m · ${T.stats.lakes} lakes` : 'forming the region in a worker …';
      },
      state: () => (T ? { stats: T.stats, ms: T.ms, n: T.n } : null),
      advance() {},
    };
  }

  // ---------------------------------------------------------------- 3.3 stochastic transport
  function transportMode() {
    let S = null, hist = [], ms = 0;
    const mom = el('input'); mom.type = 'checkbox'; mom.checked = true; const ml = el('label'); ml.append(mom, document.createTextNode(' Momentum'));
    const restart = button('Restart');
    bar.append(play, ml, restart, seedB);
    const ITMAX = 600;
    function reset() { S = createTransport({ seed }); S.reset(seed, { momentum: mom.checked ? 1 : 0 }); hist = []; setPlaying(true); dirty = true; }
    mom.addEventListener('change', reset); restart.addEventListener('click', reset);
    reset();
    const Qn = () => { const q = new Float32Array(S.n * S.n); for (let k = 0; k < q.length; k++) q[k] = S.disch(k); return q; };
    return {
      reset,
      step() {
        if (S.t >= ITMAX) return false;
        const t0 = performance.now(); S.step(); S.step(); ms = (performance.now() - t0) / 2;
        if (S.t % 10 === 0) hist.push(S.stats());
        return true;
      },
      draw(ctx, w, h) {
        const L = split(w, h), n = S.n, c = S.cell, hm = new Float64Array(n * n), dep = new Float32Array(n * n);
        for (let k = 0; k < hm.length; k++) { hm[k] = S.h[k] * c; dep[k] = (S.h[k] - S.h0[k]) * c; }
        blit(ctx, paint(n, hm, { cell: c, dep, Q: Qn(), exag: 1.5 }), L.mx, L.my, L.s, `${(n * c / 1000).toFixed(1)} km · outlet along the bottom edge`);
        const { cx, cy, cw, ch } = L, ink = tok('--ink', '#1d2024'), walk = tok('--walk', '#e0703a'), muted = tok('--muted', '#74797f'), blue = '#2d6fd2';
        axes(ctx, cx, cy, cw, ch, 'iterations', 'volume, million m³');
        let top = 20e6; for (const r of hist) top = Math.max(top, r.eroded);
        const X = (i) => cx + i / ITMAX * cw, Y = (v) => cy + ch - v / top * ch;
        ctx.textAlign = 'right'; ctx.fillStyle = muted; const stp = top > 80e6 ? 40e6 : 10e6; for (let v = 0; v <= top; v += stp) ctx.fillText(v / 1e6, cx - 3, Y(v) + 3);
        ctx.textAlign = 'center'; for (let i = 0; i <= ITMAX; i += 200) ctx.fillText(i, X(i), cy + ch + 26);
        for (const [k, col] of [['eroded', ink], ['fan', walk], ['exported', blue]]) { ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.beginPath(); hist.forEach((r, i) => { i ? ctx.lineTo(X(r.it), Y(r[k])) : ctx.moveTo(X(r.it), Y(r[k])); }); ctx.stroke(); }
        ctx.lineWidth = 1; ctx.textAlign = 'left'; ctx.fillStyle = ink; ctx.fillText('eroded', cx + 6, cy + 13); ctx.fillStyle = walk; ctx.fillText('set down below the front', cx + 6, cy + 26); ctx.fillStyle = blue; ctx.fillText('carried out at the outlet', cx + 6, cy + 39);
      },
      report() {
        const s = S.stats();
        rows([['Iteration', s.it], ['Threads across the plain', f2(s.threads, 1)], ['Eroded', `${big(s.eroded)} m³`], ['Below the front', `${big(s.fan)} m³`], ['Exported', `${big(s.exported)} m³`], ['Budget error', `${f2(Math.abs(s.balance), 3)} m³`]]);
        status.textContent = `${S.P.particles} water particles an iteration · momentum ${S.P.momentum ? 'on' : 'off'} · ${f2(ms, 1)} ms an iteration`;
      },
      state: () => S.stats(),
      advance(n) { for (let i = 0; i < n; i++) if (!this.step()) break; },
    };
  }

  // ---------------------------------------------------------------- 3.4 one harness for every generator
  function scoreMode() {
    const GEN = [['fbm', 'fBm noise'], ['ridged', 'ridged noise'], ['spl', 'stream power'], ['region', 'paper 0 region']];
    let res = {}, busy = false, msg = '';
    bar.append(seedB);
    const wait = () => new Promise((r) => setTimeout(r, 0));
    async function reset() {
      if (busy) return; busy = true; res = {}; dirty = true;
      for (const [k, name] of GEN) {
        msg = `measuring ${name} …`; dirty = true; await wait();
        const t0 = performance.now(); let g;
        if (k === 'fbm') g = fbm(makeGrid(), seed);
        else if (k === 'ridged') g = ridged(makeGrid(), seed);
        else if (k === 'spl') { const S = createSPL({ seed }); for (let i = 0; i < 150; i++) { S.step(); if (i % 10 === 9) await wait(); } g = S.g; }
        else { const T = await region({ seed, size_m: 10000, cells: 257 }); g = makeGrid(); for (let i = 0; i < g.N; i++) g.h[i] = T.height[i]; }
        const s = measureGround(g); const show = new Float64Array(g.N); show.set(g.h);
        res[k] = { s, h: show, A: Float64Array.from(g.A), water: Float32Array.from(g.w, (v, i) => v - g.h[i]), cell: g.cell, n: g.n, ms: performance.now() - t0 };
        dirty = true;
      }
      msg = ''; busy = false; dirty = true;
    }
    reset();
    const ROWS = [['pit_share', 'Surface in closed pits', (v) => `${f2(v * 100, 0)} %`, '0 %'], ['fill_m', 'Mean pit fill', (v) => `${f2(v, 1)} m`, '≈ 0'],
      ['hack_h', 'Hack h', f2, '0.57–0.60'], ['tau', 'Area exponent τ', f2, '1.43 ± 0.02'], ['concavity', 'Concavity θ', f2, '≈ 0.45'],
      ['horton_Rb', 'Horton R_B', f2, '3–5'], ['horton_Rl', 'Horton R_L', f2, '1.5–3'], ['hypsometric_integral', 'Hypsometric integral', f2, '0.35–0.6']];
    return {
      reset,
      draw(ctx, w) {
        const four = w >= 620, s = four ? (w - 40) / 4 : (w - 24) / 2;
        GEN.forEach(([k, name], i) => {
          const x = four ? 8 + i * (s + 8) : 8 + (i % 2) * (s + 8), y = four ? 6 : 6 + Math.floor(i / 2) * (s + 22), r = res[k];
          if (r) blit(ctx, paint(r.n, r.h, { cell: r.cell, A: r.A, water: r.water, exag: 2 }), x, y, s, name);
          else { ctx.strokeStyle = tok('--rule', '#e7e9eb'); ctx.strokeRect(x, y, s, s); ctx.fillStyle = tok('--muted', '#74797f'); ctx.font = `10px ${tok('--mono', 'monospace')}`; ctx.textAlign = 'left'; ctx.fillText(name, x + 2, y + s + 12); }
        });
      },
      report() {
        const cls = (k, v) => { const e = EARTH[k]; if (k === 'pit_share' || k === 'fill_m') return v < (k === 'pit_share' ? 0.02 : 0.5) ? 'in' : 'out'; if (!e || !Number.isFinite(v)) return ''; return v >= e.lo && v <= e.hi ? 'in' : v >= e.lo - e.tol && v <= e.hi + e.tol ? 'near' : 'out'; };
        table.innerHTML = `<table><thead><tr><th></th><th>Earth</th>${GEN.map(([, n]) => `<th>${n}</th>`).join('')}</tr></thead><tbody>${ROWS.map(([k, lab, fm, earth]) => `<tr><th>${lab}</th><td class="earth">${earth}</td>${GEN.map(([g]) => { const r = res[g]; return `<td class="${r ? cls(k, r.s[k]) : ''}">${r ? fm(r.s[k]) : '…'}</td>`; }).join('')}</tr>`).join('')}</tbody></table>`;
        status.textContent = msg || `seed ${seed} · every surface 10 km at 257², pits filled, channels from 0.05 km², measured by the same code`;
      },
      state: () => Object.fromEntries(Object.entries(res).map(([k, r]) => [k, { ...Object.fromEntries(ROWS.map(([q]) => [q, r.s[q]])), ms: r.ms }])),
      get busy() { return busy; },
      advance() {},
    };
  }

  return {
    start() { if (running) return; running = true; raf = requestAnimationFrame(tick); },
    stop() { running = false; cancelAnimationFrame(raf); },
    advance(n) { M.advance(n); draw(); },
    state: () => M.state(),
    redraw: draw,
  };
}
