// The figures of §2.6–2.8: the stand of stand.js seen from above as a canopy height model (1 m, hill-shaded), with
// a layer to read (canopy, ground light, gaps, the air under the canopy, fuel, fire), a chart beside it and the same
// measurement strip as the other lineage figures.
//
//   createStandFig(el)   el is <figure class="standfig" data-mode="light|micro|fire">
//   returns { start(), stop(), advance(n), state() }
import { createStand, SP } from './stand.js?v=3';

const tok = (n, d) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || d;
const hex = (h) => { const s = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)); };
const lg = Math.log10;
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
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
  return { lab, inp };
}

const LAYERS = {
  light: [['canopy', 'Canopy height'], ['ground', 'Light at the ground'], ['gaps', 'Gaps below 10 m']],
  micro: [['air', 'Warmest-day air under the canopy'], ['canopy', 'Canopy height'], ['ground', 'Light at the ground']],
  fire: [['fire', 'Fire'], ['fuel', 'Fuel: ladder and crown'], ['canopy', 'Canopy height']],
};

export function createStandFig(fig) {
  const mode = fig.dataset.mode, cap = fig.querySelector('figcaption');
  const canvas = fig.querySelector('canvas');
  // ---- controls
  const bar = el('div', 'controls lin-controls'), bar2 = el('div', 'controls lin-controls');
  const play = el('button', null, 'Pause'); play.type = 'button';
  const sizeSel = el('select'); for (const [v, t] of [['100', '1 ha'], ['200', '4 ha'], ['400', '16 ha']]) { const o = el('option', null, t); o.value = v; sizeSel.append(o); }
  sizeSel.value = '200'; sizeSel.setAttribute('aria-label', 'Plot size');
  const layerSel = el('select'); for (const [v, t] of LAYERS[mode]) { const o = el('option', null, t); o.value = v; layerSel.append(o); }
  layerSel.setAttribute('aria-label', 'Layer');
  const seedB = el('button', null, 'New seed'); seedB.type = 'button';
  bar.append(play, sizeSel, layerSel, seedB);
  let Tm = null, wind = null, dirS = null, dry = null, ladder = null, igniteB = null;
  if (mode === 'micro') { Tm = slider('Warmest day in the open', 22, 40, 0.5, 30, (v) => `${v} °C`); bar2.append(Tm.lab); }
  if (mode === 'fire') {
    wind = slider('Wind', 0, 1, 0.05, 0.5, (v) => v.toFixed(2)); dirS = slider('Wind from', 0, 359, 1, 180, (v) => ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'][Math.round(v / 45) % 8]);
    dry = slider('Dryness', 0.6, 1.4, 0.02, 1, (v) => v.toFixed(2));
    ladder = el('input'); ladder.type = 'checkbox'; const ll = el('label'); ll.append(ladder, document.createTextNode(' Clear the ladder fuel'));
    igniteB = el('button', null, 'Ignite'); igniteB.type = 'button';
    bar2.append(wind.lab, dirS.lab, dry.lab, ll, igniteB);
  }
  const status = el('p', 'status'), strip = el('dl', 'lin-metrics');
  fig.insertBefore(bar, cap); if (bar2.childNodes.length) fig.insertBefore(bar2, cap); fig.insertBefore(status, cap); fig.insertBefore(strip, cap);

  // ---- state
  let S, seed = 1, running = false, playing = true, raf = 0, last = 0, dirty = true, g = null, burn = null, frameI = 0, fireRes = null, msYr = 0, fireYear = -1;
  const YEARS = mode === 'fire' ? 200 : 600;
  const hist = []; // per decade: census + gap lambda
  function reset() {
    S = createStand({ size: +sizeSel.value, seed, micro: mode === 'micro', Tmax: Tm ? +Tm.inp.value : 30 });
    hist.length = 0; g = null; burn = null; fireRes = null; frameI = 0; fireYear = -1;
    if (mode === 'fire') { const t = performance.now(); for (let y = 0; y < YEARS; y++) S.step(); msYr = (performance.now() - t) / YEARS; S.light(); g = S.gaps(); setPlaying(false); }
    dirty = true;
  }
  function yearStep() {
    const t = performance.now(); S.step(); msYr = 0.8 * msYr + 0.2 * (performance.now() - t);
    if (S.year % 10 === 0 || !g) { g = S.gaps(); hist.push({ ...S.census(), lam: g.lambda, n: g.fit.length, hot: hotShare() }); }
    dirty = true;
  }
  const hotShare = () => { if (mode !== 'micro') return NaN; let h = 0; for (const v of S.Tu) if (v > 31) h++; return h / S.Tu.length; };

  function ignite(x, z) {
    if (!S) return;
    const frames = [];
    fireRes = S.fire({ x, z, wind: +wind.inp.value, dir: (+dirS.inp.value + 180) * Math.PI / 180, dry: +dry.inp.value, clearLadder: ladder.checked,
      onTick: (st) => { frames.push(st.slice()); } });
    burn = frames; frameI = 0; fireYear = S.year; setPlaying(true);
  }

  // ---- drawing
  const img = { c: null, ctx: null };
  function drawMap(ctx, x0, y0, s) {
    const M = S.P.size, N = S.N, chm = S.canopy(), layer = layerSel.value;
    if (!img.c || img.c.width !== M) { img.c = new OffscreenCanvas(M, M); img.ctx = img.c.getContext('2d'); }
    const id = img.ctx.createImageData(M, M), d = id.data;
    const paper = hex(tok('--paper', '#ffffff')), green = [61, 107, 76], low = [242, 243, 239], walk = hex(tok('--walk', '#e0703a')), blue = [45, 111, 210];
    const lab = layer === 'gaps' && g ? g.lab : null;
    const firstFrame = burn && burn[Math.min(frameI, burn.length - 1)];
    const fu = layer === 'fuel' ? S.fuels() : null;
    for (let i = 0; i < M; i++) for (let j = 0; j < M; j++) {
      const c = i * M + j, h = chm[c];
      // hill shade from the north-west
      const hx = chm[((i + 1) % M) * M + j] - chm[((i - 1 + M) % M) * M + j], hz = chm[i * M + (j + 1) % M] - chm[i * M + (j - 1 + M) % M];
      const shade = Math.max(0.55, Math.min(1.15, 1 + 0.06 * (hx + hz)));
      let col;
      const t = Math.min(1, h / 34), base = [low[0] + (green[0] - low[0]) * t, low[1] + (green[1] - low[1]) * t, low[2] + (green[2] - low[2]) * t];
      const cell = Math.floor(i / 2) * N + Math.floor(j / 2);
      if (layer === 'canopy') col = base.map((v) => v * shade);
      else if (layer === 'ground') { const L = S.ground[cell]; col = [255 * (0.15 + 0.85 * L), 255 * (0.15 + 0.85 * L), 255 * (0.12 + 0.85 * L)].map((v) => v * 0.9); }
      else if (layer === 'gaps') { col = h < 10 ? walk.map((v) => v * 0.9 + 25) : base.map((v) => (v * 0.6 + 100) * shade); if (lab && h < 10 && g.sizes[lab[c]] < 20) col = [235, 205, 180]; }
      else if (layer === 'air') { const T = S.Tu[cell], u = Math.max(0, Math.min(1, (T - 22) / 18)); col = [blue[0] + (walk[0] - blue[0]) * u, blue[1] + (walk[1] - blue[1]) * u, blue[2] + (walk[2] - blue[2]) * u].map((v) => v * (0.75 + 0.25 * shade)); }
      else if (layer === 'fuel') { const a = fu.lad[cell], b = fu.cr[cell]; col = [paper[0] - 120 * a - 40 * b, paper[1] - 60 * a - 90 * b, paper[2] - 140 * a - 80 * b].map((v) => Math.max(0, v) * shade); }
      else { // fire
        col = base.map((v) => v * shade);
        if (firstFrame) { const st = firstFrame[cell]; if (st === 1) col = [235, 150, 60]; else if (st === 2) col = [214, 72, 40]; else if (st === 3) col = [150, 140, 128]; else if (st === 4) col = [60, 56, 52]; }
      }
      const o = (j * M + i) * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
    }
    img.ctx.putImageData(id, 0, 0);
    ctx.imageSmoothingEnabled = M < s; ctx.drawImage(img.c, x0, y0, s, s);
    ctx.strokeStyle = tok('--rule', '#e7e9eb'); ctx.strokeRect(x0, y0, s, s);
    ctx.fillStyle = tok('--muted', '#74797f'); ctx.font = `10px ${tok('--mono', 'monospace')}`; ctx.textAlign = 'left';
    ctx.fillText(`${M} m`, x0 + 4, y0 + s + 12);
  }
  // chart: gap sizes (light), heat share and species (micro), burnt area by tick (fire)
  function drawChart(ctx, x0, y0, w, h) {
    const muted = tok('--muted', '#74797f'), rule = tok('--rule', '#e7e9eb'), ink = tok('--ink', '#1d2024'), data = tok('--data', '#23936a'), walk = tok('--walk', '#e0703a');
    ctx.font = `10px ${tok('--mono', 'monospace')}`; ctx.strokeStyle = muted; ctx.strokeRect(x0, y0, w, h);
    if (mode === 'light' && g) {
      // complementary cumulative distribution of gap areas ≥ 20 m², log–log, with the fitted power law and Earth's band
      const a = [...g.fit].sort((p, q) => q - p);
      const X = (v) => x0 + (lg(v) - 1) / 3 * w, Y = (v) => y0 + h - (lg(v) + 3) / 3 * h; // area 10..10^4 m², P 10^-3..1
      ctx.fillStyle = muted; ctx.textAlign = 'center';
      for (const v of [10, 100, 1000, 10000]) { ctx.strokeStyle = rule; ctx.beginPath(); ctx.moveTo(X(v), y0); ctx.lineTo(X(v), y0 + h); ctx.stroke(); ctx.fillText(v >= 1000 ? `${v / 1000}k` : v, X(v), y0 + h + 12); }
      ctx.textAlign = 'right'; for (const v of [0.001, 0.01, 0.1, 1]) { ctx.strokeStyle = rule; ctx.beginPath(); ctx.moveTo(x0, Y(v)); ctx.lineTo(x0 + w, Y(v)); ctx.stroke(); ctx.fillText(v, x0 - 3, Y(v) + 3); }
      ctx.textAlign = 'center'; ctx.fillText('gap area, m²', x0 + w / 2, y0 + h + 25);
      ctx.save(); ctx.translate(x0 - 30, y0 + h / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('share of gaps this large or larger', 0, 0); ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip();
      // Earth: λ 1.66–2.50, a band of CCDF slopes −(λ − 1) from 20 m²
      ctx.fillStyle = 'rgba(35,147,106,0.12)'; ctx.beginPath(); ctx.moveTo(X(20), Y(1)); ctx.lineTo(X(1e4), Y(Math.pow(1e4 / 20, -0.66))); ctx.lineTo(X(1e4), Y(Math.pow(1e4 / 20, -1.5))); ctx.closePath(); ctx.fill();
      if (Number.isFinite(g.lambda)) { ctx.strokeStyle = walk; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(X(20), Y(1)); ctx.lineTo(X(1e4), Y(Math.pow(1e4 / 20, 1 - g.lambda))); ctx.stroke(); ctx.setLineDash([]); }
      ctx.fillStyle = ink; a.forEach((v, i) => { const p = (i + 1) / a.length; ctx.beginPath(); ctx.arc(X(v), Y(p), 2.2, 0, 6.283); ctx.fill(); });
      ctx.restore();
      ctx.textAlign = 'left'; ctx.fillStyle = data; ctx.fillText('Earth, λ 1.66–2.50', x0 + 6, y0 + h - 20);
      ctx.fillStyle = walk; ctx.fillText(Number.isFinite(g.lambda) ? `stand λ ${g.lambda.toFixed(2)} ± ${g.se.toFixed(2)} (${g.fit.length} gaps)` : 'too few gaps to fit', x0 + 6, y0 + h - 7);
    } else if (mode === 'micro') {
      // stems per hectare of each species (lines) and the share of the plot above 31 °C under the canopy (shaded)
      const n = hist.length, X = (i) => x0 + (n > 1 ? i / (YEARS / 10) : 0) * w;
      let mx = 100; for (const r of hist) mx = Math.max(mx, r.pioneer, r.tolerant);
      ctx.fillStyle = 'rgba(224,112,58,0.15)'; ctx.beginPath(); ctx.moveTo(X(0), y0 + h);
      hist.forEach((r, i) => ctx.lineTo(X(i), y0 + h - r.hot * h)); ctx.lineTo(X(n - 1), y0 + h); ctx.closePath(); ctx.fill();
      for (const [k, c] of [['tolerant', SP[1].hex], ['pioneer', SP[0].hex]]) { ctx.strokeStyle = c; ctx.lineWidth = 1.8; ctx.beginPath(); hist.forEach((r, i) => { const y = y0 + h - r[k] / mx * h * 0.95; i ? ctx.lineTo(X(i), y) : ctx.moveTo(X(i), y); }); ctx.stroke(); }
      ctx.lineWidth = 1; ctx.fillStyle = muted; ctx.textAlign = 'center'; ctx.fillText(`years (0–${YEARS})`, x0 + w / 2, y0 + h + 14);
      ctx.textAlign = 'left'; ctx.fillStyle = SP[1].hex; ctx.fillText('tolerant stems / ha', x0 + 6, y0 + 13); ctx.fillStyle = SP[0].hex; ctx.fillText('pioneer stems / ha', x0 + 6, y0 + 26);
      ctx.fillStyle = walk; ctx.fillText('plot hotter than 31 °C under the canopy', x0 + 6, y0 + 39);
    } else if (mode === 'fire') {
      const fr = burn || [], n = Math.min(frameI + 1, fr.length), N2 = S.N * S.N;
      const X = (i) => x0 + i / Math.max(60, fr.length) * w;
      const series = [[1, 2], [3, 4], [4]];
      const counts = (st, set) => { let k = 0; for (let c = 0; c < N2; c++) if (set.includes(st[c])) k++; return k / N2; };
      if (n) {
        for (const [set, col] of [[[3, 4], muted], [[4], ink], [[1, 2], walk]]) { ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.beginPath(); for (let i = 0; i < n; i += Math.max(1, (n / 120) | 0)) { const y = y0 + h - counts(fr[i], set) * h; i ? ctx.lineTo(X(i), y) : ctx.moveTo(X(i), y); } ctx.stroke(); }
      }
      ctx.lineWidth = 1; ctx.fillStyle = muted; ctx.textAlign = 'center'; ctx.fillText('time steps of the fire', x0 + w / 2, y0 + h + 14);
      ctx.textAlign = 'left'; ctx.fillText('burnt (share of plot)', x0 + 6, y0 + 13); ctx.fillStyle = ink; ctx.fillText('of it as crown fire', x0 + 6, y0 + 26); ctx.fillStyle = walk; ctx.fillText('burning now', x0 + 6, y0 + 39);
      if (!burn) { ctx.fillStyle = muted; ctx.textAlign = 'center'; ctx.fillText('click the map, or Ignite, to start a fire', x0 + w / 2, y0 + h / 2); }
    }
  }
  let layout = null;
  function draw() {
    const { ctx, w, h } = fit(canvas);
    ctx.fillStyle = tok('--paper', '#fff'); ctx.fillRect(0, 0, w, h);
    const wide = w >= 620;
    const s = wide ? Math.min(h - 24, w * 0.52) : Math.min(w - 16, h * 0.56);
    const mx = wide ? 8 : (w - s) / 2, my = 6;
    layout = { mx, my, s };
    drawMap(ctx, mx, my, s);
    if (wide) drawChart(ctx, mx + s + 52, 10, w - mx - s - 66, h - 46);
    else drawChart(ctx, 46, my + s + 24, w - 60, h - s - 66);
    report();
    dirty = false;
  }
  const f2 = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '–');
  function report() {
    const c = S.census();
    let rows;
    if (mode === 'light') rows = [['Stems ≥ 5 cm', `${c.stems.toFixed(0)} /ha`], ['Basal area', `${f2(c.basal, 1)} m²/ha`], ['≥ 30 cm', `${c.big.toFixed(0)} /ha`], ['Top height', `${f2(c.top, 1)} m`], ['Gaps fitted', g ? g.fit.length : '–'], ['Gap exponent λ', g ? `${f2(g.lambda)} ± ${f2(g.se)}` : '–']];
    else if (mode === 'micro') { let off = 0; for (let k = 0; k < S.Tu.length; k++) off += S.P.Tmax - S.Tu[k]; rows = [['Tolerant', `${c.tolerant.toFixed(0)} /ha`], ['Pioneer', `${c.pioneer.toFixed(0)} /ha`], ['Mean cooling', `${f2(off / S.Tu.length, 1)} °C`], ['Above 31 °C', `${f2(hotShare() * 100, 0)} %`], ['Top height', `${f2(c.top, 1)} m`], ['Gaps fitted', g ? g.fit.length : '–']]; }
    else rows = [['Stems ≥ 5 cm', `${c.stems.toFixed(0)} /ha`], ['Burnt', fireRes ? `${f2(fireRes.burnt * 100, 0)} %` : '–'], ['Crown fire', fireRes ? `${f2(fireRes.crown * 100, 0)} %` : '–'], ['Trees killed', fireRes ? `${fireRes.killed.toLocaleString('en')}` : '–'], ['Gap exponent λ', g ? f2(g.lambda) : '–'], ['Year', S.year]];
    strip.innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    status.textContent = mode === 'fire'
      ? (burn ? `fire step ${Math.min(frameI + 1, burn.length)} of ${burn.length}${frameI >= burn.length - 1 ? ' · out · Play lets the forest regrow' : ''}` : fireYear >= 0 ? `year ${S.year - fireYear} after the fire` : `the stand at year ${S.year}, grown in ${(msYr * YEARS / 1000).toFixed(1)} s · ${msYr.toFixed(1)} ms a year`)
      : `year ${S.year} of ${YEARS} · ${S.trees.length.toLocaleString('en')} trees · ${msYr.toFixed(1)} ms a year`;
  }

  // ---- loop
  function tick(now) {
    if (!running) return;
    raf = requestAnimationFrame(tick);
    if (playing && now - last >= (burn && frameI < burn.length - 1 ? 40 : 0)) {
      last = now;
      if (burn && frameI < burn.length - 1) { frameI++; dirty = true; if (frameI === burn.length - 1) { setPlaying(false); S.light(); g = S.gaps(); } }
      else if (mode === 'fire' && !burn && S.year <= YEARS) setPlaying(false); // waiting for a fire
      else if (S.year < (mode === 'fire' ? YEARS + 300 : YEARS)) { if (burn && mode === 'fire') layerSel.value = 'canopy'; burn = null; yearStep(); }
      else setPlaying(false);
    }
    if (dirty) draw();
  }
  function setPlaying(v) { playing = v; play.textContent = v ? 'Pause' : 'Play'; }
  play.addEventListener('click', () => setPlaying(!playing));
  sizeSel.addEventListener('change', () => { reset(); if (mode !== 'fire') setPlaying(true); });
  layerSel.addEventListener('change', () => { dirty = true; });
  seedB.addEventListener('click', () => { seed++; reset(); if (mode !== 'fire') setPlaying(true); });
  if (Tm) Tm.inp.addEventListener('change', () => { S.P.Tmax = +Tm.inp.value; dirty = true; });
  if (igniteB) igniteB.addEventListener('click', () => { const ang = (+dirS.inp.value) * Math.PI / 180, M = S.P.size; ignite(M / 2 + Math.cos(ang) * M * 0.4, M / 2 + Math.sin(ang) * M * 0.4); });
  canvas.addEventListener('click', (e) => {
    if (mode !== 'fire' || !layout) return;
    const r = canvas.getBoundingClientRect(), x = (e.clientX - r.left - layout.mx) / layout.s, z = (e.clientY - r.top - layout.my) / layout.s;
    if (x < 0 || x > 1 || z < 0 || z > 1) return;
    layerSel.value = 'fire'; ignite(x * S.P.size, z * S.P.size);
  });
  addEventListener('resize', () => { dirty = true; });
  reset();
  return {
    start() { if (running) return; running = true; raf = requestAnimationFrame(tick); },
    stop() { running = false; cancelAnimationFrame(raf); },
    advance(n) { for (let i = 0; i < n; i++) yearStep(); g = S.gaps(); draw(); },
    ignite(x, z) { ignite(x, z); if (burn) frameI = burn.length - 1; draw(); },
    state: () => ({ census: S.census(), g, fireRes, year: S.year }),
    get stand() { return S; },
  };
}
