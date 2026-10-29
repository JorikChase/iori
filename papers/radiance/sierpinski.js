// Radiance Fields' contemporary figures (chapter 7): fractals that hold light and matter.
//
//   createElectrons(el)  an electron on a Sierpiński gasket (Kempkes et al. 2019): tight binding on the gasket's
//                        graph, solved exactly; one eigenstate's |ψ|², or what a scanning microscope sees at an
//                        energy (the states near it summed), drawn as emission — a radiance field held by a fractal
//   createEnzyme(el)     the citrate-synthase fractal (Sendker et al. 2024) as geometry: hexamers joined corner to
//                        corner make Sierpiński triangles; symmetric contacts fill the triangle instead. Mass against
//                        size gives the dimension
//
// Canvas 2D, on demand.

const tok = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
function fit(canvas) {
  const dpr = Math.min(devicePixelRatio || 1, 2), w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

// ---------- the Sierpiński gasket graph ----------
// generation g: the corners of the smallest triangles, joined along their sides; (3^(g+1) + 3)/2 sites
export function gasket(g) {
  const key = (p) => `${Math.round(p[0] * 1e6)},${Math.round(p[1] * 1e6)}`;
  const ids = new Map(), pts = [], edges = new Set();
  const id = (p) => { const k = key(p); if (!ids.has(k)) { ids.set(k, pts.length); pts.push(p); } return ids.get(k); };
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const tri = (a, b, c, k) => {
    if (k === 0) { const [i, j, l] = [id(a), id(b), id(c)]; for (const [u, v] of [[i, j], [j, l], [i, l]]) edges.add(u < v ? `${u}-${v}` : `${v}-${u}`); return; }
    const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
    tri(a, ab, ca, k - 1); tri(ab, b, bc, k - 1); tri(ca, bc, c, k - 1);
  };
  tri([-1, -0.866], [1, -0.866], [0, 0.866], g);
  return { pts, edges: [...edges].map((e) => e.split('-').map(Number)) };
}

// eigen-decomposition of a real symmetric matrix by cyclic Jacobi rotations: values ascending, vectors as rows
export function eigh(A, n) {
  const a = Float64Array.from(A), V = new Float64Array(n * n);
  for (let i = 0; i < n; i++) V[i * n + i] = 1;
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p * n + q] * a[p * n + q];
    if (off < 1e-20) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      const apq = a[p * n + q];
      if (Math.abs(apq) < 1e-14) continue;
      const th = (a[q * n + q] - a[p * n + p]) / (2 * apq);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) {
        const akp = a[k * n + p], akq = a[k * n + q];
        a[k * n + p] = c * akp - s * akq; a[k * n + q] = s * akp + c * akq;
      }
      for (let k = 0; k < n; k++) {
        const apk = a[p * n + k], aqk = a[q * n + k];
        a[p * n + k] = c * apk - s * aqk; a[q * n + k] = s * apk + c * aqk;
      }
      for (let k = 0; k < n; k++) {
        const vkp = V[k * n + p], vkq = V[k * n + q];
        V[k * n + p] = c * vkp - s * vkq; V[k * n + q] = s * vkp + c * vkq;
      }
    }
  }
  const order = [...Array(n).keys()].sort((i, j) => a[i * n + i] - a[j * n + j]);
  return { values: order.map((i) => a[i * n + i]), vectors: order.map((i) => Float64Array.from({ length: n }, (_, k) => V[k * n + i])) };
}

export function createElectrons(el) {
  const canvas = el.querySelector('canvas'), [mode, slider] = [el.querySelector('select'), el.querySelector('input[type=range]')];
  const status = el.querySelector('.status');
  const G = gasket(4), n = G.pts.length;
  // H = −t A, t = 1: an electron hopping between neighbouring sites
  const H = new Float64Array(n * n);
  for (const [i, j] of G.edges) { H[i * n + j] = -1; H[j * n + i] = -1; }
  const E = eigh(H, n);
  const lo = E.values[0], hi = E.values[n - 1];
  let running = false;
  const draw = () => {
    if (!running) return;
    const { ctx, w, h } = fit(canvas), size = Math.min(w, h * 1.12) * 0.9, cx = w / 2, cy = h * 0.53;
    // the density on the sites: one state, or the microscope's view (states within a window of energy summed)
    const rho = new Float64Array(n);
    let label;
    if (mode.value === 'state') {
      const k = Math.round(+slider.value * (n - 1)), v = E.vectors[k];
      for (let i = 0; i < n; i++) rho[i] = v[i] * v[i];
      label = `state ${k + 1} of ${n}, energy ${E.values[k].toFixed(3)} (hopping = 1)`;
    } else {
      const e = lo + +slider.value * (hi - lo), wdt = 0.12;
      E.values.forEach((ev, k) => { const g = Math.exp(-0.5 * ((ev - e) / wdt) ** 2); if (g > 1e-4) for (let i = 0; i < n; i++) rho[i] += g * E.vectors[k][i] ** 2; });
      label = `local density of states at energy ${e.toFixed(2)} (window ${wdt}), what the microscope maps`;
    }
    const max = Math.max(1e-12, ...rho);
    ctx.fillStyle = '#05060a'; ctx.fillRect(0, 0, w, h);
    // the lattice as faint hairlines, the density as glowing emission on the sites (additive)
    const P = (p) => [cx + (p[0] * size) / 2, cy - (p[1] * size) / 2];
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 0.6; ctx.beginPath();
    for (const [i, j] of G.edges) { const a = P(G.pts[i]), b = P(G.pts[j]); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    const r0 = size / 16 / 2;
    for (let i = 0; i < n; i++) {
      const v = rho[i] / max; if (v < 0.01) continue;
      const [x, y] = P(G.pts[i]), r = r0 * (0.6 + 1.6 * Math.sqrt(v));
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,200,140,${0.9 * v})`); g.addColorStop(0.4, `rgba(224,112,58,${0.55 * v})`); g.addColorStop(1, 'rgba(224,112,58,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    // the spectrum as ticks along the bottom, the chosen energy marked
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    E.values.forEach((ev) => ctx.fillRect(12 + ((ev - lo) / (hi - lo)) * (w - 24), h - 14, 1, 8));
    const at = mode.value === 'state' ? E.values[Math.round(+slider.value * (n - 1))] : lo + +slider.value * (hi - lo);
    ctx.fillStyle = tok('--walk'); ctx.fillRect(12 + ((at - lo) / (hi - lo)) * (w - 24) - 1, h - 18, 3, 14);
    status.textContent = `${n} sites, generation 4 · ${label}`;
  };
  mode.addEventListener('change', draw); slider.addEventListener('input', draw);
  addEventListener('resize', draw);
  return { start() { running = true; draw(); }, stop() { running = false; }, E };
}

// ---------- the enzyme's geometry ----------
// level k: 3^k hexamers at the corners of a Sierpiński triangle of side 2^k hexamer spacings; symmetric contacts
// pack the whole triangle (k+1 choose … : (2^k)(2^k + 1)/2 sites)
export function hexamerSites(k, symmetric) {
  const side = 2 ** k, out = [];
  for (let j = 0; j <= side - 1; j++) for (let i = 0; i <= side - 1 - j; i++) {
    // Pascal's triangle mod 2 picks the Sierpiński sites: binomial(i + j, j) odd ⇔ (i & j) === 0
    if (symmetric || (i & j) === 0) out.push([i + j / 2, (j * Math.sqrt(3)) / 2]);
  }
  return out;
}
export function createEnzyme(el) {
  const canvas = el.querySelector('canvas'), level = el.querySelector('input[type=range]'), sym = el.querySelector('input[type=checkbox]');
  const status = el.querySelector('.status');
  let running = false, raf = 0, t0 = 0;
  const draw = () => {
    if (!running) return;
    const { ctx, w, h } = fit(canvas), k = +level.value, sites = hexamerSites(k, sym.checked);
    const side = 2 ** k, s = Math.min((w - 24) / side, (h - 40) / (side * 0.87 + 0.3));
    const ox = (w - (side - 1) * s) / 2, oy = h - 20 - (s * 0.5);
    ctx.clearRect(0, 0, w, h);
    // assembly order: grow from the corner, a few hexamers a frame
    const shown = Math.min(sites.length, Math.floor(((performance.now() - t0) / 1000) * Math.max(6, sites.length / 2.5)));
    const R = s * 0.27;
    const cols = [tok('--walk'), tok('--data'), tok('--noise')];
    for (let q = 0; q < shown; q++) {
      const [x, y] = sites[q], X = ox + x * s, Y = oy - y * s;
      // a hexamer: three dimers in a ring, six subunits
      for (let m = 0; m < 6; m++) {
        const a = (m / 6) * Math.PI * 2 + Math.PI / 6;
        ctx.fillStyle = cols[Math.floor(m / 2)];
        ctx.beginPath(); ctx.arc(X + R * Math.cos(a), Y - R * Math.sin(a), Math.max(1, R * 0.36), 0, Math.PI * 2); ctx.fill();
      }
    }
    // mass against size over the levels: the slope is the dimension
    const levels = [1, 2, 3, 4, 5].map((L) => [Math.log(2 ** L), Math.log(hexamerSites(L, sym.checked).length)]);
    const mx = levels.reduce((a, r) => a + r[0], 0) / 5, my = levels.reduce((a, r) => a + r[1], 0) / 5;
    const D = levels.reduce((a, r) => a + (r[0] - mx) * (r[1] - my), 0) / levels.reduce((a, r) => a + (r[0] - mx) ** 2, 0);
    status.textContent = `level ${k}: ${sites.length} hexamers (${sites.length * 6} subunits) · ${sym.checked ? 'symmetric contacts fill the triangle' : 'corner-to-corner contacts leave the holes'} · mass grows as size^${D.toFixed(3)}`;
    // a timer, not animation frames: a page in the background still finishes its assembly
    if (shown < sites.length) raf = setTimeout(draw, 30);
  };
  const restart = () => { clearTimeout(raf); t0 = performance.now(); draw(); };
  level.addEventListener('input', restart); sym.addEventListener('change', restart);
  addEventListener('resize', draw);
  return { start() { running = true; restart(); }, stop() { running = false; clearTimeout(raf); } };
}
