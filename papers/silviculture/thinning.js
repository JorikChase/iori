// Paper 0.3, figure "self-thinning, live": paper 0's forest simulator (papers/fractals/silviculture-core.js) grows
// a dense even-aged stand of one species, 24 × 24 seedlings on the 32 m plot (5,600 per hectare), with no
// recruitment, so every death is a tree starved by its neighbours' shade. Left: the stand from above, every leafy
// module a dot and every stem a ring sized by its diameter. Right: its path in the two forms of the self-thinning
// law, Reineke's (stems per hectare against quadratic mean diameter) and Yoda's (mean tree mass against stems per
// hectare), with the slope fitted live on the thinning phase (density 10 % below its peak), the same rule as
// tools/silviculture/measure.mjs, which measured the numbers the text quotes.
import { Sim, PLOT } from '../fractals/silviculture-core.js?v=3';

const HA = PLOT * PLOT / 10000, WOOD = 600, TREE_D = 0.05, G = 24;
const tok = (n, d) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || d;
const lg = Math.log10;

function fit(canvas) {
  const dpr = Math.min(devicePixelRatio || 1, 2), w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}
function ols(xs, ys) {
  const n = xs.length; if (n < 6) return NaN;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; }
  return (n * sxy - sx * sy) / (n * sxx - sx * sx);
}

export function createThinning(el) {
  const canvas = el.querySelector('canvas'), status = el.querySelector('.status');
  const spSel = el.querySelector('select'), [restart, reseed] = el.querySelectorAll('button');
  let sim, rows, seed = 1, running = false, raf = 0, done = false, YEARS = 300;

  function reset() {
    const sp = +spSel.value;
    YEARS = sp === 0 ? 50 : 300; // the pioneer lives 52 years; past that, old age and not crowding would kill it
    sim = new Sim({ seed, mode: 'plantation', mix: sp });
    for (const p of sim.plants) for (const m of p.mods) sim.release(m);
    sim.plants.length = 0;
    const cell = (PLOT - 2) / G;
    for (let i = 0; i < G; i++) for (let k = 0; k < G; k++)
      sim.addPlant(sim.species[sp], -PLOT / 2 + 1 + (i + 0.5 + (sim.rng.next() - 0.5) * 0.5) * cell, -PLOT / 2 + 1 + (k + 0.5 + (sim.rng.next() - 0.5) * 0.5) * cell);
    sim.lightPass();
    rows = []; done = false;
    draw();
  }

  function measure() {
    let n = 0, m = 0, d2 = 0;
    for (const p of sim.plants) if (p.stemD >= TREE_D) { n++; m += p.bio * WOOD; d2 += p.stemD * p.stemD; }
    if (n >= 4) rows.push({ year: sim.year, N: n / HA, m: m / n, dq: Math.sqrt(d2 / n) * 100 });
  }
  function slopes() {
    let pk = 0; rows.forEach((r, i) => { if (r.N > rows[pk].N) pk = i; });
    const ph = rows.slice(pk).filter((r) => r.N < 0.9 * rows[pk].N);
    return { ph, reineke: ols(ph.map((r) => lg(r.dq)), ph.map((r) => lg(r.N))), yoda: ols(ph.map((r) => lg(r.N)), ph.map((r) => lg(r.m))) };
  }

  // a log–log panel: x and y ranges in decades, the path, the thinning phase in colour, a reference slope
  function panel(ctx, x0, y0, w, h, xr, yr, pts, phase, ref, refLabel, xl, yl, fitted) {
    const ink = tok('--ink', '#1d2024'), muted = tok('--muted', '#74797f'), rule = tok('--rule', '#e7e9eb');
    const X = (v) => x0 + (lg(v) - xr[0]) / (xr[1] - xr[0]) * w, Y = (v) => y0 + h - (lg(v) - yr[0]) / (yr[1] - yr[0]) * h;
    ctx.strokeStyle = rule; ctx.lineWidth = 1; ctx.font = `10px ${tok('--mono', 'monospace')}`; ctx.fillStyle = muted;
    for (let d = Math.ceil(xr[0]); d <= xr[1]; d++) { const x = X(10 ** d); ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 + h); ctx.stroke(); ctx.textAlign = 'center'; ctx.fillText(fmt(10 ** d), x, y0 + h + 12); }
    for (let d = Math.ceil(yr[0]); d <= yr[1]; d++) { const y = Y(10 ** d); ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + w, y); ctx.stroke(); ctx.textAlign = 'right'; ctx.fillText(fmt(10 ** d), x0 - 4, y + 3); }
    ctx.strokeStyle = muted; ctx.strokeRect(x0, y0, w, h);
    ctx.textAlign = 'center'; ctx.fillText(xl, x0 + w / 2, y0 + h + 25);
    ctx.save(); ctx.translate(x0 - 30, y0 + h / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(yl, 0, 0); ctx.restore();
    // reference line through the phase's first point (or the panel's centre), dashed
    const anchor = phase[0] || null;
    if (anchor) {
      const [ax, ay] = anchor, s = ref;
      ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip();
      ctx.setLineDash([4, 4]); ctx.strokeStyle = tok('--data', '#23936a'); ctx.lineWidth = 1.2; ctx.beginPath();
      for (const t of [-3, 3]) { const lx = lg(ax) + t, ly = lg(ay) + s * t; const px = x0 + (lx - xr[0]) / (xr[1] - xr[0]) * w, py = y0 + h - (ly - yr[0]) / (yr[1] - yr[0]) * h; t < 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
      ctx.stroke(); ctx.restore();
    }
    ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip();
    ctx.strokeStyle = muted; ctx.lineWidth = 1.2; ctx.beginPath(); pts.forEach(([a, b], i) => (i ? ctx.lineTo(X(a), Y(b)) : ctx.moveTo(X(a), Y(b)))); ctx.stroke();
    ctx.strokeStyle = tok('--walk', '#e0703a'); ctx.lineWidth = 2.2; ctx.beginPath(); phase.forEach(([a, b], i) => (i ? ctx.lineTo(X(a), Y(b)) : ctx.moveTo(X(a), Y(b)))); ctx.stroke();
    ctx.restore();
    // labels in the lower left, the corner a falling line leaves empty
    ctx.textAlign = 'left'; ctx.fillStyle = tok('--data', '#23936a'); ctx.fillText(refLabel, x0 + 6, y0 + h - 20);
    ctx.fillStyle = tok('--walk', '#e0703a'); ctx.fillText(Number.isFinite(fitted) ? `stand ${fitted.toFixed(2)}` : 'stand: not thinning yet', x0 + 6, y0 + h - 7);
  }
  const fmt = (v) => (v >= 1000 ? `${v / 1000}k` : v >= 1 ? `${v}` : `${v}`);

  function draw() {
    const { ctx, w, h } = fit(canvas);
    ctx.fillStyle = tok('--paper', '#fff'); ctx.fillRect(0, 0, w, h);
    const wide = w >= 620;
    const mapS = wide ? Math.min(h - 20, w * 0.4) : Math.min(w - 20, h * 0.42);
    const mx = wide ? 10 : (w - mapS) / 2, my = wide ? (h - mapS) / 2 : 10;
    // the stand from above
    const ink = tok('--ink', '#1d2024'), leaf = tok('--data', '#23936a');
    const S = mapS / PLOT;
    ctx.strokeStyle = tok('--rule', '#e7e9eb'); ctx.strokeRect(mx, my, mapS, mapS);
    ctx.save(); ctx.beginPath(); ctx.rect(mx, my, mapS, mapS); ctx.clip(); // crowns overhang the plot's edge
    ctx.fillStyle = leaf; ctx.globalAlpha = 0.16;
    for (const p of sim.plants) for (const m of p.mods) {
      if (!m.nLive) continue;
      const r = Math.max(0.6, m.r * S * 0.7);
      ctx.beginPath(); ctx.arc(mx + (m.cx + PLOT / 2) * S, my + (m.cz + PLOT / 2) * S, r, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.strokeStyle = ink; ctx.lineWidth = 1;
    for (const p of sim.plants) {
      const r = Math.max(0.8, p.stemD * 0.5 * S * 6); // stems drawn six times their width so they read
      ctx.beginPath(); ctx.arc(mx + (p.x + PLOT / 2) * S, my + (p.z + PLOT / 2) * S, r, 0, 6.2832); ctx.stroke();
    }
    ctx.restore();
    // the two laws
    const { ph, reineke, yoda } = slopes();
    const phaseSet = new Set(ph);
    const px0 = wide ? mx + mapS + 58 : 48, pw = wide ? (w - px0 - 20) : w - 64;
    const ph_ = wide ? (h - 70) / 2 : (h - mapS - 100) / 2;
    const py1 = wide ? 14 : my + mapS + 22, py2 = py1 + ph_ + 40;
    panel(ctx, px0, py1, pw, ph_, [0, 2], [2, 4], rows.map((r) => [r.dq, r.N]), ph.map((r) => [r.dq, r.N]), -1.605,
      'Reineke −1.605', 'quadratic mean diameter, cm', 'stems / ha', reineke);
    panel(ctx, px0, py2, pw, ph_, [2, 4], [-2, 4], rows.map((r) => [r.N, r.m]), ph.map((r) => [r.N, r.m]), -1.5,
      'Yoda −3/2', 'stems / ha', 'mean tree mass, kg', yoda);
    const last = rows[rows.length - 1];
    status.textContent = last
      ? `year ${sim.year} · ${Math.round(last.N)} stems/ha of ≥ 5 cm · mean diameter ${last.dq.toFixed(1)} cm · ${sim.msStep.toFixed(1)} ms/step${done ? ' · finished' : ''}`
      : `year ${sim.year} · seedlings`;
  }

  function frame() {
    if (!running) return;
    if (!done) {
      sim.step(); measure();
      if (sim.year >= YEARS) done = true;
    }
    draw();
    raf = done ? 0 : requestAnimationFrame(frame);
  }
  spSel.addEventListener('change', () => { reset(); if (running && !raf) raf = requestAnimationFrame(frame); });
  restart.addEventListener('click', () => { reset(); if (running && !raf) raf = requestAnimationFrame(frame); });
  reseed.addEventListener('click', () => { seed++; reset(); if (running && !raf) raf = requestAnimationFrame(frame); });
  addEventListener('resize', () => { if (sim) draw(); });
  reset();
  return {
    start() { if (running) return; running = true; if (!done) raf = requestAnimationFrame(frame); },
    stop() { running = false; cancelAnimationFrame(raf); raf = 0; },
    get sim() { return sim; }, slopes, rows: () => rows,
    // for the test rig (a hidden pane gives no animation frames): run n years at once, then draw
    advance(n) { for (let i = 0; i < n && !done; i++) { sim.step(); measure(); if (sim.year >= YEARS) done = true; } draw(); },
  };
}
