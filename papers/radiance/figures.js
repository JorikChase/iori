// The radiance-fields paper's own figures, all in 2-D on the shapes of fields.js, drawn with Canvas 2D in
// the paper's colours. Each figure draws only when something changed, and animates only while on screen.
//
//   createRay(el)       a ray through a density: σ, transmittance T, the weights T·σ, the colour they add up to
//   createLobes(el)     view-dependent colour: a point's radiance by direction as circular harmonics
//   createReps(el)      one field, four representations at the same budget, each with its error
//   createMorph(el)     two shapes morphed three ways: densities mixed, distances mixed, Gaussians moved

import { sdfA, sdfB, density, emission, occupancy, voxels, distanceGrid, gaussians, lowFrequencies } from './fields.js?v=1';

const tok = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const rgbOf = (hex) => { const h = hex.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const INK = () => rgbOf(tok('--ink') || '#1d2024'), PAPER = () => rgbOf(tok('--paper') || '#ffffff');

// a canvas sized to its box at the device's pixel ratio; returns its 2-D context in CSS pixels
function fit(canvas) {
  const dpr = Math.min(devicePixelRatio || 1, 2), w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

// a field f(x, y) → 0..1 painted as ink on paper (or rgb(x, y) → [r, g, b, a] 0..1 over paper), res² samples
function paint(ctx, x0, y0, size, res, f, rgb = null) {
  const img = new ImageData(res, res), ink = INK(), paper = PAPER();
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    const x = -1 + (2 * i + 1) / res, y = 1 - (2 * j + 1) / res, o = (j * res + i) * 4;
    if (rgb) {
      const c = rgb(x, y);
      for (let k = 0; k < 3; k++) img.data[o + k] = paper[k] * (1 - c[3]) + 255 * c[k] * c[3];
    } else {
      const v = f(x, y);
      for (let k = 0; k < 3; k++) img.data[o + k] = paper[k] * (1 - v) + ink[k] * v;
    }
    img.data[o + 3] = 255;
  }
  const tmp = new OffscreenCanvas(res, res);
  tmp.getContext('2d').putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(tmp, x0, y0, size, size);
}
const toPx = (x0, y0, size) => ([x, y]) => [x0 + ((x + 1) / 2) * size, y0 + ((1 - y) / 2) * size];
const fromPx = (x0, y0, size, px, py) => [((px - x0) / size) * 2 - 1, 1 - ((py - y0) / size) * 2];
const css = (c) => `rgb(${c.map((v) => Math.round(255 * Math.min(1, Math.max(0, v)))).join(',')})`;

// ---------- 1. a ray through a density ----------
export function createRay(el) {
  const canvas = el.querySelector('canvas'), [sharp, steps] = el.querySelectorAll('input[type=range]');
  const status = el.querySelector('.status');
  let eye = [-0.95, -0.75], aim = [0.25, 0.1], drag = null, running = false;
  const sOf = () => Math.round(Math.pow(10, +sharp.value));
  // the field square and the plots: side by side, or stacked on a narrow screen
  const layout = (w, h) => {
    if (w >= 520) { const size = Math.min(h - 16, w * 0.48), y0 = (h - size) / 2; return { size, x0: 8, y0, px0: 8 + size + 24, py0: y0, pw: w - size - 40, ph: size }; }
    const size = Math.min(w - 16, h * 0.56), y0 = 8;
    return { size, x0: (w - size) / 2, y0, px0: 8, py0: y0 + size + 12, pw: w - 16, ph: h - size - 28 };
  };
  const along = (t, dir) => [eye[0] + dir[0] * t, eye[1] + dir[1] * t];
  function draw() {
    if (!running) return;
    const { ctx, w, h } = fit(canvas), { size, x0, y0, px0, py0, pw, ph } = layout(w, h);
    const s = sOf(), n = +steps.value;
    ctx.clearRect(0, 0, w, h);
    // the field: emission shown where there is density (opacity of a thin slab)
    paint(ctx, x0, y0, size, 150, null, (x, y) => { const c = emission(x, y); return [...c, 1 - Math.exp(-density(sdfA(x, y), s) * 0.05)]; });
    ctx.strokeStyle = tok('--rule'); ctx.strokeRect(x0 + 0.5, y0 + 0.5, size - 1, size - 1);
    // the ray, from the eye through the aim to the square's far side
    const dx = aim[0] - eye[0], dy = aim[1] - eye[1], L = Math.hypot(dx, dy) || 1, dir = [dx / L, dy / L];
    const tmax = 2.9, P = toPx(x0, y0, size);
    // exact (2000 steps) and the n-sample quadrature α = 1 − exp(−σδ), as NeRF writes it
    const integrate = (m) => {
      const dt = tmax / m, out = [];
      let T = 1, C = [0, 0, 0];
      for (let i = 0; i < m; i++) {
        const p = along((i + 0.5) * dt, dir), inside = Math.abs(p[0]) <= 1 && Math.abs(p[1]) <= 1;
        const sg = inside ? density(sdfA(p[0], p[1]), s) : 0, a = 1 - Math.exp(-sg * dt), c = emission(p[0], p[1]);
        out.push({ t: (i + 0.5) * dt, sg, T, w: (T * a) / dt });
        for (let k = 0; k < 3; k++) C[k] += T * a * c[k];
        T *= 1 - a;
      }
      return { out, C, T };
    };
    const ex = integrate(2000), q = integrate(n);
    ctx.strokeStyle = tok('--walk'); ctx.lineWidth = 1.25;
    ctx.beginPath(); ctx.moveTo(...P(eye)); ctx.lineTo(...P(along(tmax, dir))); ctx.stroke();
    ctx.fillStyle = tok('--walk');
    for (const r of q.out) { const [px, py] = P(along(r.t, dir)); ctx.fillRect(px - 1.5, py - 1.5, 3, 3); }
    ctx.beginPath(); ctx.arc(...P(eye), 5, 0, Math.PI * 2); ctx.fill();
    // the plots along t: σ (filled, scaled to its peak), T, and the weights T·σ that make the pixel
    if (pw > 60 && ph > 40) {
      const sgMax = Math.max(1e-6, ...ex.out.map((r) => r.sg)), wMax = Math.max(1e-6, ...ex.out.map((r) => r.w));
      const X = (t) => px0 + (t / tmax) * pw, Y = (v) => py0 + ph - v * ph * 0.92;
      ctx.strokeStyle = tok('--rule'); ctx.lineWidth = 1; ctx.strokeRect(px0 + 0.5, py0 + 0.5, pw - 1, ph - 1);
      ctx.fillStyle = 'rgba(45,111,210,0.14)';
      ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ex.out.forEach((r) => ctx.lineTo(X(r.t), Y(r.sg / sgMax))); ctx.lineTo(X(tmax), Y(0)); ctx.fill();
      const line = (key, scale, colour, width) => { ctx.strokeStyle = colour; ctx.lineWidth = width; ctx.beginPath(); ex.out.forEach((r, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(r.t), Y(r[key] / scale))); ctx.stroke(); };
      line('T', 1, tok('--data'), 1.25);
      line('w', wMax, tok('--ink'), 1.5);
      ctx.font = '11px ' + tok('--sans'); ctx.fillStyle = tok('--muted');
      ctx.fillText('σ (shaded) · T (green) · weight T·σ (ink), along the ray', px0 + 6, py0 + 14);
      // the pixel: exact and n samples
      const sw = 22;
      ctx.fillStyle = css(ex.C); ctx.fillRect(px0 + pw - 2 * sw - 14, py0 + ph - sw - 8, sw, sw);
      ctx.fillStyle = css(q.C); ctx.fillRect(px0 + pw - sw - 8, py0 + ph - sw - 8, sw, sw);
    }
    const err = Math.max(...[0, 1, 2].map((k) => Math.abs(ex.C[k] - q.C[k])));
    status.textContent = `sharpness s = ${s} · opacity ${(1 - ex.T).toFixed(3)} · ${n} samples: colour off by ${(err * 100).toFixed(1)} % (exact on the left, sampled on the right)`;
  }
  const at = (e) => { const r = canvas.getBoundingClientRect(), Lt = layout(r.width, r.height); return fromPx(Lt.x0, Lt.y0, Lt.size, e.clientX - r.left, e.clientY - r.top); };
  canvas.addEventListener('pointerdown', (e) => {
    const p = at(e);
    if (Math.abs(p[0]) > 1.05 || Math.abs(p[1]) > 1.05) return;
    drag = Math.hypot(p[0] - eye[0], p[1] - eye[1]) < 0.12 ? 'eye' : 'aim';
    canvas.setPointerCapture(e.pointerId);
    if (drag === 'aim') { aim = p; draw(); }
  });
  canvas.addEventListener('pointermove', (e) => { if (!drag) return; const p = at(e).map((v) => Math.max(-1, Math.min(1, v))); if (drag === 'eye') eye = p; else aim = p; draw(); });
  const up = () => { drag = null; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  sharp.addEventListener('input', draw); steps.addEventListener('input', draw);
  addEventListener('resize', draw);
  return { start() { running = true; draw(); }, stop() { running = false; }, draw };
}

// ---------- 2. view-dependent colour ----------
export function createLobes(el) {
  const canvas = el.querySelector('canvas'), degree = el.querySelector('input[type=range]'), again = el.querySelector('button'), status = el.querySelector('.status');
  let seed = 3, coef = [], running = false, raf = 0, t0 = performance.now();
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const material = () => { coef = Array.from({ length: 5 }, (_, l) => (l ? [rnd() * 2 - 1, rnd() * 2 - 1].map((v) => v * 0.55 / l) : [0.55, 0])); };
  material();
  // radiance toward direction φ: the degree-L circular-harmonic series, kept ≥ 0
  const L = () => +degree.value;
  const radiance = (phi) => { let r = coef[0][0]; for (let l = 1; l <= L(); l++) r += coef[l][0] * Math.cos(l * phi) + coef[l][1] * Math.sin(l * phi); return Math.max(0, r); };
  const base = [0.878, 0.439, 0.227];
  function draw() {
    const { ctx, w, h } = fit(canvas), cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.36;
    ctx.clearRect(0, 0, w, h);
    // the lobe: radiance by direction, a polar curve around the point
    ctx.beginPath();
    for (let i = 0; i <= 256; i++) { const p = (i / 256) * Math.PI * 2, r = radiance(p) * R * 0.9; (i ? ctx.lineTo : ctx.moveTo).call(ctx, cx + r * Math.cos(p), cy - r * Math.sin(p)); }
    ctx.fillStyle = 'rgba(224,112,58,0.16)'; ctx.fill(); ctx.strokeStyle = tok('--walk'); ctx.lineWidth = 1.25; ctx.stroke();
    ctx.fillStyle = tok('--ink'); ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, Math.PI * 2); ctx.fill();
    // cameras around it, each seeing the colour the point sends its way; one of them circles slowly
    ctx.strokeStyle = tok('--rule'); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, R * 1.18, 0, Math.PI * 2); ctx.stroke();
    const t = (performance.now() - t0) / 1000;
    const cams = Array.from({ length: 16 }, (_, i) => (i / 16) * Math.PI * 2);
    cams.push((t * 0.35) % (Math.PI * 2));
    cams.forEach((p, i) => {
      const r = radiance(p), x = cx + R * 1.18 * Math.cos(p), y = cy - R * 1.18 * Math.sin(p), big = i === cams.length - 1;
      ctx.fillStyle = css(base.map((c) => Math.min(1, c * r * 1.6)));
      const s = big ? 22 : 12;
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
      ctx.strokeStyle = big ? tok('--ink') : tok('--rule'); ctx.strokeRect(x - s / 2 + 0.5, y - s / 2 + 0.5, s - 1, s - 1);
    });
    const l = L();
    status.textContent = `degree ${l}: ${2 * l + 1} numbers per colour channel in 2-D; in 3-D spherical harmonics need ${(l + 1) ** 2} (3D Gaussian splatting keeps degree 3: 16 per channel, 48 per Gaussian)`;
  }
  const loop = () => { if (!running) return; draw(); raf = requestAnimationFrame(loop); };
  degree.addEventListener('input', draw);
  again.addEventListener('click', () => { material(); draw(); });
  return { start() { running = true; loop(); }, stop() { running = false; cancelAnimationFrame(raf); } };
}

// ---------- 3. one field, four representations ----------
export function createReps(el) {
  const canvases = [...el.querySelectorAll('canvas')], budget = el.querySelector('input[type=range]'), status = el.querySelector('.status');
  const tags = [...el.querySelectorAll('.tag')];
  let running = false, timer = 0, built = null;
  const truth = (x, y) => occupancy(sdfA(x, y));
  const makers = [null, voxels, distanceGrid, gaussians, lowFrequencies];
  function draw() {
    if (!running) return;
    const B = Math.round(Math.pow(10, +budget.value));
    built = makers.map((m) => (m ? m(sdfA, B) : { at: truth }));
    const errs = built.map((r) => {
      if (r.at === truth) return 0;
      let e = 0, n = 0;
      for (let j = 0; j < 64; j++) for (let i = 0; i < 64; i++) { const x = -1 + (2 * i + 1) / 64, y = -1 + (2 * j + 1) / 64; e += Math.abs(r.at(x, y) - truth(x, y)); n++; }
      return e / n;
    });
    canvases.forEach((c, k) => {
      const { ctx, w, h } = fit(c), size = Math.min(w, h);
      ctx.clearRect(0, 0, w, h);
      paint(ctx, (w - size) / 2, (h - size) / 2, size, 150, built[k].at);
      if (k === 3) {
        // the Gaussians' one-sigma ellipses
        const P = toPx((w - size) / 2, (h - size) / 2, size);
        ctx.strokeStyle = tok('--walk'); ctx.lineWidth = 0.75;
        for (const g of built[3].G) {
          const [a, b, d] = g.cov, tr = (a + d) / 2, q = Math.sqrt(Math.max(0, ((a - d) / 2) ** 2 + b * b)), l1 = tr + q, l2 = Math.max(1e-9, tr - q), ang = Math.atan2(l1 - a, b);
          const [px, py] = P(g.c);
          ctx.beginPath(); ctx.ellipse(px, py, (Math.sqrt(l1) * size) / 2, (Math.sqrt(l2) * size) / 2, -ang + Math.PI / 2, 0, Math.PI * 2); ctx.stroke();
        }
      }
    });
    const names = ['the field', 'voxels', 'distance grid', 'Gaussians', 'lowest frequencies'];
    const what = [null, `${built[1].n}×${built[1].n} cells`, `${built[2].n}×${built[2].n} distances`, `${built[3].k} Gaussians`, `${built[4].kept} frequencies`];
    tags.forEach((t, k) => { t.textContent = k ? `${names[k]} · ${what[k]} · error ${(errs[k] * 100).toFixed(1)} %` : names[0]; });
    status.textContent = `budget ${B} numbers each (what a representation stores); error = mean difference from the field over the square`;
  }
  budget.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(draw, 90); });
  addEventListener('resize', draw);
  return { start() { running = true; draw(); }, stop() { running = false; }, get built() { return built; } };
}

// ---------- 4. morphs ----------
export function createMorph(el) {
  const canvases = [...el.querySelectorAll('canvas')], slider = el.querySelector('input[type=range]'), play = el.querySelector('button');
  let running = false, raf = 0, playing = true, t0 = performance.now(), last = -1;
  // the Gaussians of both shapes, matched one to one in the order of their angle about the centre
  const K = 30;
  const sortAround = (G) => G.slice().sort((a, b) => Math.atan2(a.c[1], a.c[0]) - Math.atan2(b.c[1], b.c[0]));
  const GA = sortAround(gaussians(sdfA, K * 6, 11).G), GB = sortAround(gaussians(sdfB, K * 6, 11).G);
  const lerp = (a, b, t) => a + (b - a) * t;
  function frame(t) {
    const fields = [
      (x, y) => Math.min(1, (1 - t) * occupancy(sdfA(x, y)) + t * occupancy(sdfB(x, y))),
      (x, y) => occupancy((1 - t) * sdfA(x, y) + t * sdfB(x, y)),
      (() => {
        const G = GA.map((a, i) => {
          const b = GB[i], cov = [0, 1, 2].map((k) => lerp(a.cov[k], b.cov[k], t)), det = cov[0] * cov[2] - cov[1] * cov[1];
          return { c: [lerp(a.c[0], b.c[0], t), lerp(a.c[1], b.c[1], t)], inv: [cov[2] / det, -cov[1] / det, cov[0] / det], w: lerp(a.w, b.w, t) };
        });
        return (x, y) => { let v = 0; for (const g of G) { const dx = x - g.c[0], dy = y - g.c[1]; v += g.w * Math.exp(-0.5 * (g.inv[0] * dx * dx + 2 * g.inv[1] * dx * dy + g.inv[2] * dy * dy)); } return Math.min(1, v); };
      })(),
    ];
    canvases.forEach((c, k) => { const { ctx, w, h } = fit(c), size = Math.min(w, h); ctx.clearRect(0, 0, w, h); paint(ctx, (w - size) / 2, (h - size) / 2, size, 160, fields[k]); });
  }
  const loop = () => {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    if (playing) { const p = ((performance.now() - t0) / 5000) % 2; slider.value = (p < 1 ? p : 2 - p).toFixed(3); }
    const t = +slider.value;
    if (t !== last) { last = t; frame(t); }
  };
  slider.addEventListener('input', () => { playing = false; play.textContent = 'Play'; });
  play.addEventListener('click', () => { playing = !playing; play.textContent = playing ? 'Pause' : 'Play'; t0 = performance.now() - +slider.value * 5000; });
  addEventListener('resize', () => { last = -1; });
  return { start() { running = true; last = -1; loop(); }, stop() { running = false; cancelAnimationFrame(raf); }, frame };
}
