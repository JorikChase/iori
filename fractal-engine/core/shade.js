// Shading: the formula's colour as a typed dataflow — the orbit's readings flow through ramps, maths
// and colour mixes into the outputs (DESIGN.md "Shading (Q5)"). The first real formula-v2 graph.
//
//   formula.shade = { nodes: [{ id, type, in: { port: nodeId }, p: {…} }, …], out: { color, glow? } }
//
// Nodes come in topological order: an input names an earlier node. Types:
//   readings (no inputs, a number out): col (the fold colour index, 0..1), trap (least |p|²), depth
//            (iterations done ÷ iterations), lyap (λ along the orbit), facing (n·v), species (the
//            leading chimera species ÷ (k − 1)), w (the hit point's place along w in 4-D); a
//            collage's own shade also reads piece (which piece leads, Σ shareᵢ·i/(n − 1), blended at
//            seams) and seam (how deep into a fillet, 1 on its middle) — 0 for a formula
//   ramp     in.v number → colour. p: stops [{ t, c: [r, g, b, a] }] (linear RGB), interp (constant,
//            linear, ease, bspline, cardinal), space (rgb, hsv, oklab), map { scale, offset, mode
//            (clamp, repeat, mirror), log, invert }: the number becomes t in 0..1 as
//            log2 (if log) → · scale + offset → clamp / repeat / mirror → 1 − t (if invert)
//   math     in.a, in.b numbers → number. p: op (add, sub, mul, min, max, pow, sin, bands), c (b when
//            in.b is not connected). sin = ½ + ½ sin(2π a b); bands = ⌊a / b⌋ b (terraces of a)
//   kali     no inputs, a number out: Kali's map p → |p|/p² − c run from the hit point (fractalforums
//            2011), the forum's colouring and bump made a node, so any species takes it. p: cx, cy, cz,
//            f (the point's scale), n (iterations), mode (mean: the mean step of |p|; min: the least |p|)
//   mixc     in.a, in.b colours, in.f number → colour. p: mode (mix, multiply, screen, add), f (when
//            in.f is not connected)
// out.color names a colour node (the surface's albedo); out.glow a number (scales the glow) or a
// colour (tints it), or is absent (the glow takes out.color's colour); out.gain the glow's strength
// (1, written only when it is not).
//
// Drivers → colour (DESIGN.md "Drivers → colour (C)"): a number input may name one of the formula's
// drivers (core/drive.js) as 'd:<driver id>' — the same register that drives the shape, read at the hit
// — and shade.bind binds shading parameters as drive.bind binds op parameters:
//   bind: [{ to: '<node id>.map.scale' | '.map.offset' | '.map.hue' | '.stops.<k>.t' | '.c' | '.f'
//                | 'out.gain', from: <driver id>, lo, hi }]   (written only when there are any)
// map.hue (turns, 0 unwritten) turns the ramp's colour around the hue ring in Oklab after
// interpolation, so lightness stays put. A driven stop stays between its neighbours.
//
// evalShade(shade, readings) is the reference the GPU's register interpreter (gpu/wgsl.js SHADE) is
// diffed against. packShade lays the program out for it.

export const READINGS = ['col', 'trap', 'depth', 'lyap', 'facing', 'species', 'w', 'piece', 'seam'];
export const INTERPS = ['constant', 'linear', 'ease', 'bspline', 'cardinal'];
export const SPACES = ['rgb', 'hsv', 'oklab'];
export const MODES = ['clamp', 'repeat', 'mirror'];
export const MATH_OPS = ['add', 'sub', 'mul', 'min', 'max', 'pow', 'sin', 'bands'];
export const MIX_MODES = ['mix', 'multiply', 'screen', 'add'];
export const KALI_MODES = ['mean', 'min'];
export const KALI_MAX = 32;
export const MAX_NODES = 32, MAX_STOPS = 16, MAX_TOTAL_STOPS = 64;

const COLOUR = new Set(['ramp', 'mixc']);
const NUMBER = new Set([...READINGS, 'math', 'kali']);
const PORTS = { ramp: ['v'], math: ['a', 'b'], mixc: ['a', 'b', 'f'] };
const REQUIRED = { ramp: ['v'], math: ['a'], mixc: ['a', 'b'] };
const PORT_KIND = { ramp: { v: 'number' }, math: { a: 'number', b: 'number' }, mixc: { a: 'colour', b: 'colour', f: 'number' } };
export const kindOf = (type) => (COLOUR.has(type) ? 'colour' : NUMBER.has(type) ? 'number' : null);

const num = (x, d) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
export const DRV = 'd:';
export const isDrv = (ref) => typeof ref === 'string' && ref.startsWith(DRV);
export const drvId = (ref) => ref.slice(DRV.length);
const sortKeys = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));

// defaults filled, keys in a fixed order, stops sorted: the form that is hashed and written
function normParams(type, p = {}) {
  if (type === 'ramp') {
    const m = p.map || {};
    const stops = (p.stops || []).map((s) => ({ t: num(s.t, 0), c: [0, 1, 2, 3].map((i) => num((s.c || [])[i], i === 3 ? 1 : 0)) }));
    stops.sort((a, b) => a.t - b.t);
    const hue = num(m.hue, 0);
    return {
      interp: p.interp || 'linear', space: p.space || 'rgb',
      map: { ...(hue ? { hue } : {}), invert: !!m.invert, log: !!m.log, mode: m.mode || 'clamp', offset: num(m.offset, 0), scale: num(m.scale, 1) },
      stops,
    };
  }
  if (type === 'math') return { c: num(p.c, 1), op: p.op || 'add' };
  if (type === 'mixc') return { f: num(p.f, 0.5), mode: p.mode || 'mix' };
  if (type === 'kali') return { cx: num(p.cx, 0.8), cy: num(p.cy, 0.7), cz: num(p.cz, 0.6), f: num(p.f, 1), mode: p.mode || 'mean', n: num(p.n, 10) };
  return {};
}

export function normShade(s) {
  const gain = num(s.out && s.out.gain, 1);
  const bind = (s.bind || []).map((b) => ({ from: String(b.from), hi: num(b.hi, 1), lo: num(b.lo, 0), to: String(b.to) })).sort((a, b) => (a.to < b.to ? -1 : a.to > b.to ? 1 : 0));
  return {
    ...(bind.length ? { bind } : {}),
    nodes: (s.nodes || []).map((n) => ({ id: String(n.id), in: sortKeys({ ...(n.in || {}) }), p: normParams(n.type, n.p), type: n.type })),
    out: { color: s.out && s.out.color != null ? String(s.out.color) : null, ...(gain !== 1 ? { gain } : {}), ...(s.out && s.out.glow != null ? { glow: String(s.out.glow) } : {}) },
  };
}

// What a binding target names: { node, kind: 'scale' | 'offset' | 'hue' | 'stop' | 'c' | 'f' | 'gain',
// stop (its index), min, max } — null when it names nothing a binding may drive. A stop's range is
// between its neighbours (the ramp's stops stay sorted).
export const MAX_SHADE_BINDS = 16;
export const GAIN_MAX = 16;
export function shadeTarget(s, to) {
  if (to === 'out.gain') return { node: null, kind: 'gain', min: 0, max: GAIN_MAX };
  const i = String(to).indexOf('.');
  if (i < 0) return null;
  const n = (s.nodes || []).find((q) => q.id === to.slice(0, i));
  const key = to.slice(i + 1);
  if (!n) return null;
  if (n.type === 'ramp') {
    if (key === 'map.scale' || key === 'map.offset' || key === 'map.hue') return { node: n, kind: key.slice(4), min: -Infinity, max: Infinity };
    const m = key.match(/^stops\.(\d+)\.t$/);
    const st = n.p && n.p.stops;
    if (m && st && +m[1] < st.length) {
      const k = +m[1];
      return { node: n, kind: 'stop', stop: k, min: k > 0 ? st[k - 1].t : 0, max: k < st.length - 1 ? st[k + 1].t : 1 };
    }
    return null;
  }
  if (n.type === 'math' && key === 'c') return { node: n, kind: 'c', min: -Infinity, max: Infinity };
  if (n.type === 'mixc' && key === 'f') return { node: n, kind: 'f', min: -Infinity, max: Infinity };
  return null;
}
// the driver ids a shading network reads (its inputs and its bindings)
export function shadeDrivers(s) {
  const out = new Set();
  if (!s) return out;
  for (const n of s.nodes || []) for (const ref of Object.values(n.in || {})) if (isDrv(ref)) out.add(drvId(ref));
  for (const b of s.bind || []) out.add(String(b.from));
  return out;
}
// a binding's own (unbound) value
export function shadeOwn(s, t) {
  if (t.kind === 'gain') return num(s.out && s.out.gain, 1);
  const P = t.node.p;
  if (t.kind === 'stop') return P.stops[t.stop].t;
  if (t.kind === 'scale' || t.kind === 'offset' || t.kind === 'hue') return num(P.map[t.kind], t.kind === 'scale' ? 1 : 0);
  return P[t.kind];
}

// drive: the formula's drivers (optional: without it 'd:' inputs and bindings are not checked)
export function validateShade(s, drive = undefined) {
  const errors = [];
  const err = (m) => errors.push('shade: ' + m);
  if (!s || typeof s !== 'object' || !Array.isArray(s.nodes)) return ['shade: needs nodes'];
  if (s.nodes.length > MAX_NODES) err(`more than ${MAX_NODES} nodes`);
  const seen = new Map();
  let total = 0;
  s.nodes.forEach((n, i) => {
    const kind = kindOf(n && n.type);
    if (!kind) { err(`node ${i}: unknown type "${n && n.type}"`); return; }
    if (typeof n.id !== 'string' || !n.id || seen.has(n.id)) { err(`node ${i}: needs a unique id`); return; }
    const ports = PORTS[n.type] || [];
    for (const [port, ref] of Object.entries(n.in || {})) {
      if (!ports.includes(port)) { err(`${n.id}: ${n.type} has no input ${port}`); continue; }
      if (isDrv(ref)) {
        if (PORT_KIND[n.type][port] !== 'number') err(`${n.id}.${port}: wants a ${PORT_KIND[n.type][port]}, a driver is a number`);
        if (drive !== undefined && !((drive && drive.nodes) || []).some((m) => m.id === drvId(ref))) err(`${n.id}.${port}: no driver ${drvId(ref)}`);
        continue;
      }
      if (!seen.has(ref)) { err(`${n.id}.${port}: ${ref} is not an earlier node`); continue; }
      if (seen.get(ref) !== PORT_KIND[n.type][port]) err(`${n.id}.${port}: wants a ${PORT_KIND[n.type][port]}, ${ref} is a ${seen.get(ref)}`);
    }
    for (const port of REQUIRED[n.type] || []) if (!(n.in && n.in[port] != null)) err(`${n.id}: input ${port} is not connected`);
    const p = n.p || {};
    if (n.type === 'ramp') {
      const stops = p.stops || [];
      if (stops.length < 1 || stops.length > MAX_STOPS) err(`${n.id}: a ramp holds 1..${MAX_STOPS} stops`);
      total += stops.length;
      for (const st of stops) {
        if (!Number.isFinite(st.t) || !Array.isArray(st.c) || st.c.length !== 4 || !st.c.every(Number.isFinite)) err(`${n.id}: a stop is { t, c: [r, g, b, a] }`);
      }
      if (!INTERPS.includes(p.interp)) err(`${n.id}: interp is one of ${INTERPS.join(', ')}`);
      if (!SPACES.includes(p.space)) err(`${n.id}: space is one of ${SPACES.join(', ')}`);
      const m = p.map || {};
      if (!MODES.includes(m.mode) || !Number.isFinite(m.scale) || !Number.isFinite(m.offset)) err(`${n.id}: map is { scale, offset, mode, log, invert }`);
    }
    if (n.type === 'math' && (!MATH_OPS.includes(p.op) || !Number.isFinite(p.c))) err(`${n.id}: math op is one of ${MATH_OPS.join(', ')}`);
    if (n.type === 'mixc' && (!MIX_MODES.includes(p.mode) || !Number.isFinite(p.f))) err(`${n.id}: mix mode is one of ${MIX_MODES.join(', ')}`);
    if (n.type === 'kali' && (!KALI_MODES.includes(p.mode ?? 'mean') || !(Number.isInteger(p.n ?? 10) && (p.n ?? 10) >= 1 && (p.n ?? 10) <= KALI_MAX))) err(`${n.id}: kali mode is one of ${KALI_MODES.join(', ')}, n is 1..${KALI_MAX}`);
    seen.set(n.id, kind);
  });
  if (total > MAX_TOTAL_STOPS) err(`more than ${MAX_TOTAL_STOPS} stops in all`);
  const out = s.out || {};
  if (!seen.has(out.color) || seen.get(out.color) !== 'colour') err('out.color must name a colour node');
  if (out.glow != null && !seen.has(out.glow)) err('out.glow must name a node');
  if (out.gain != null && !(Number.isFinite(out.gain) && out.gain >= 0 && out.gain <= GAIN_MAX)) err(`out.gain is 0..${GAIN_MAX}`);
  const bind = s.bind || [];
  if (!Array.isArray(bind)) err('bind is a list');
  else {
    if (bind.length > MAX_SHADE_BINDS) err(`more than ${MAX_SHADE_BINDS} bindings`);
    const targets = new Set();
    // the GPU keeps four driven stops (gpu/wgsl.js shOvI)
    if (bind.filter((b) => b && /\.stops\.\d+\.t$/.test(b.to)).length > 4) err('at most four driven stops');
    for (const b of bind) {
      if (!b || !shadeTarget(s, b.to)) { err(`${b && b.to} is not a shading parameter that can be driven`); continue; }
      if (targets.has(b.to)) err(`${b.to} is bound twice`);
      targets.add(b.to);
      if (!Number.isFinite(b.lo) || !Number.isFinite(b.hi)) err(`${b.to}: the band needs finite lo and hi`);
      if (drive !== undefined && !((drive && drive.nodes) || []).some((m) => m.id === String(b.from))) err(`${b.to}: no driver ${b.from}`);
    }
  }
  return errors;
}

// ---------- colour spaces (linear sRGB in and out) ---------------------------------------------------
const clamp01 = (x) => Math.min(1, Math.max(0, x));
export function rgb2hsv([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx === r) h = ((g - b) / d) / 6;
    else if (mx === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
    h -= Math.floor(h);
  }
  return [h, mx > 0 ? d / mx : 0, mx];
}
export function hsv2rgb([h, s, v]) {
  const hh = (h - Math.floor(h)) * 6, i = Math.floor(hh), f = hh - i;
  const p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
  return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
}
const cbrt = (x) => Math.sign(x) * Math.pow(Math.abs(x), 1 / 3);
export function rgb2oklab([r, g, b]) {
  const l = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
export function oklab2rgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
}
const toSpace = (c, sp) => (sp === 'hsv' ? rgb2hsv(c) : sp === 'oklab' ? rgb2oklab(c) : [...c]);
const fromSpace = (c, sp) => (sp === 'hsv' ? hsv2rgb([c[0] - Math.floor(c[0]), clamp01(c[1]), clamp01(c[2])]) : sp === 'oklab' ? oklab2rgb(c) : c);

// ---------- the ramp ------------------------------------------------------------------------------
export function mapInput(x, m) {
  let v = x;
  if (m.log) v = Math.log2(Math.max(v, 1e-12));
  v = v * m.scale + m.offset;
  if (m.mode === 'clamp') v = clamp01(v);
  else if (m.mode === 'repeat') v -= Math.floor(v);
  else { v -= 2 * Math.floor(v / 2); if (v > 1) v = 2 - v; }
  if (m.invert) v = 1 - v;
  return v;
}

// weights of the four neighbours (P0, P1, P2, P3) of a segment at f
const BSPLINE = (f) => [(1 - f) ** 3 / 6, (3 * f ** 3 - 6 * f * f + 4) / 6, (-3 * f ** 3 + 3 * f * f + 3 * f + 1) / 6, f ** 3 / 6];
const CARDINAL = (f) => [0.5 * (-(f ** 3) + 2 * f * f - f), 0.5 * (3 * f ** 3 - 5 * f * f + 2), 0.5 * (-3 * f ** 3 + 4 * f * f + f), 0.5 * (f ** 3 - f * f)];

export function rampAt(p, x) {
  const S = p.stops, n = S.length, t = mapInput(x, p.map);
  const out = (c) => (p.map.hue ? [...hueTurn(c.slice(0, 3).map(clamp01), p.map.hue), clamp01(c[3])] : c.map(clamp01));
  if (n === 1 || t <= S[0].t) return out(S[0].c);
  if (t >= S[n - 1].t) return out(S[n - 1].c);
  let i = 0;
  for (let j = 0; j < n; j++) if (S[j].t <= t) i = j;
  if (p.interp === 'constant') return out(S[i].c);
  const i1 = Math.min(i + 1, n - 1), ta = S[i].t, tb = S[i1].t;
  let f = tb > ta ? (t - ta) / (tb - ta) : 0;
  let idx, w;
  if (p.interp === 'linear' || p.interp === 'ease') {
    if (p.interp === 'ease') f = f * f * (3 - 2 * f);
    idx = [i, i1]; w = [1 - f, f];
  } else {
    idx = [Math.max(i - 1, 0), i, i1, Math.min(i + 2, n - 1)];
    w = p.interp === 'bspline' ? BSPLINE(f) : CARDINAL(f);
  }
  const cs = idx.map((k) => toSpace(S[k].c.slice(0, 3), p.space));
  if (p.space === 'hsv') {
    // hues along the shortest way round, relative to the segment's first stop
    const ref = cs[idx.length === 2 ? 0 : 1][0];
    for (const c of cs) c[0] -= Math.round(c[0] - ref);
  }
  const mixed = [0, 1, 2].map((k) => cs.reduce((a, c, j) => a + w[j] * c[k], 0));
  const rgb = fromSpace(mixed, p.space).map(clamp01);
  const alpha = clamp01(idx.reduce((a, k, j) => a + w[j] * S[k].c[3], 0));
  return [...hueTurn(rgb, p.map.hue), alpha];
}

// a turn around the hue ring in Oklab (a, b rotated; lightness kept), back in gamut
export function hueTurn(rgb, hue) {
  if (!hue) return rgb;
  const [L, a, b] = rgb2oklab(rgb), th = 2 * Math.PI * hue, c = Math.cos(th), s = Math.sin(th);
  return oklab2rgb([L, a * c - b * s, a * s + b * c]).map(clamp01);
}

// ---------- evaluation ------------------------------------------------------------------------------
function mathOp(op, a, b) {
  switch (op) {
    case 'add': return a + b;
    case 'sub': return a - b;
    case 'mul': return a * b;
    case 'min': return Math.min(a, b);
    case 'max': return Math.max(a, b);
    case 'pow': return Math.pow(Math.max(a, 0), b);
    case 'sin': return 0.5 + 0.5 * Math.sin(2 * Math.PI * a * b);
    case 'bands': return b > 0 ? Math.floor(a / b) * b : a;
    default: return a;
  }
}
function mixOp(mode, a, b, f) {
  const lerp = (x, y) => x + (y - x) * f;
  const rgb = [0, 1, 2].map((k) => {
    if (mode === 'multiply') return lerp(a[k], a[k] * b[k]);
    if (mode === 'screen') return lerp(a[k], 1 - (1 - a[k]) * (1 - b[k]));
    if (mode === 'add') return a[k] + b[k] * f;
    return lerp(a[k], b[k]);
  });
  return [...rgb, lerp(a[3], b[3])];
}

// The shading parameters with the bindings' values in (a new network; the same one without bindings).
// drv(id) → a driver's value.
export function boundShade(s, drv) {
  if (!s.bind || !s.bind.length) return s;
  const o = JSON.parse(JSON.stringify(s));
  for (const b of s.bind) {
    const t = shadeTarget(s, b.to);
    if (!t) continue;
    const v = Math.min(t.max, Math.max(t.min, b.lo + num(drv(b.from), 0) * (b.hi - b.lo)));
    if (t.kind === 'gain') { o.out.gain = v; continue; }
    const P = o.nodes.find((q) => q.id === t.node.id).p;
    if (t.kind === 'stop') P.stops[t.stop].t = v;
    else if (t.kind === 'scale' || t.kind === 'offset' || t.kind === 'hue') P.map[t.kind] = v;
    else P[t.kind] = v;
  }
  return o;
}

// The kaliset from x (gpu/wgsl.js kaliset, operation for operation)
export function kaliAt(P, x = [0, 0, 0]) {
  let p = x.slice(0, 3).map((v) => v * P.f), last = Math.hypot(...p), sum = 0, lo = 1e30;
  const c = [P.cx, P.cy, P.cz];
  for (let i = 0; i < P.n; i++) {
    const r2 = Math.max(p[0] * p[0] + p[1] * p[1] + p[2] * p[2], 1e-12);
    p = p.map((v, k) => Math.abs(v) / r2 - c[k]);
    const l = Math.hypot(...p);
    sum += Math.abs(l - last); last = l; lo = Math.min(lo, l);
  }
  return P.mode === 'min' ? lo : sum / P.n;
}

// readings: { col, trap, depth, lyap, facing, species, w, piece, seam, x } (missing ones are 0; x the hit
// point, which the kaliset starts from); drivers: the drivers'
// registers at the hit (a Map or an object id → number; missing ones are 0)
export function evalShade(shade, readings = {}, drivers = null) {
  const drv = (id) => num(drivers instanceof Map ? drivers.get(id) : drivers ? drivers[id] : 0, 0);
  const s = boundShade(normShade(shade), drv);
  const reg = new Map();
  for (const n of s.nodes) {
    const get = (port, d) => (n.in[port] != null ? (isDrv(n.in[port]) ? drv(drvId(n.in[port])) : reg.get(n.in[port])) : d);
    let v;
    if (READINGS.includes(n.type)) v = num(readings[n.type], 0);
    else if (n.type === 'ramp') v = rampAt(n.p, get('v', 0));
    else if (n.type === 'math') v = mathOp(n.p.op, get('a', 0), get('b', n.p.c));
    else if (n.type === 'mixc') v = mixOp(n.p.mode, get('a'), get('b'), get('f', n.p.f));
    else if (n.type === 'kali') v = kaliAt(n.p, readings.x);
    reg.set(n.id, v);
  }
  const glow = s.out.glow != null ? reg.get(s.out.glow) : null;
  return { color: reg.get(s.out.color), glow: Array.isArray(glow) ? glow.slice(0, 3) : glow, gain: num(s.out.gain, 1) };
}

// ---------- presets ---------------------------------------------------------------------------------
const stop = (t, r, g, b, a = 1) => ({ t, c: [r, g, b, a] });
const defMap = (o = {}) => ({ scale: 1, offset: 0, mode: 'clamp', log: false, invert: false, ...o });
// The ring's presets (iori's picks of 2026-10-29 from design/colour/sheet-*.jpg, in the ring's order):
// each one is a ramp and the reading that feeds it (PRESET_READING) — the fold index barely moves on
// folding formulas and is 0 on the bulb, so they read the orbit trap (log) or the angle to the eye.
// fire, ice, film and mono are the first presets, kept for the documents and tests that name them.
export const RING_PRESETS = ['oil', 'malachite', 'bone', 'prism', 'strata', 'beetle', 'abyss'];
export const PRESET_READING = { oil: 'facing', malachite: 'trap', bone: 'trap', prism: 'trap', strata: 'trap', beetle: 'facing', abyss: 'trap' };
export const RAMP_PRESETS = {
  // thin film on dark water: saturated bands where the surface turns away
  oil: { stops: [stop(0, 0.0176, 0.0103, 0.0844), stop(0.2, 0.0176, 0.0802, 0.3916), stop(0.4, 0.016, 0.3515, 0.2159), stop(0.6, 0.6867, 0.4342, 0.0319), stop(0.8, 0.3916, 0.0395, 0.2086), stop(1, 0.0176, 0.0103, 0.0844)], interp: 'cardinal', space: 'oklab', map: defMap({ scale: 2, offset: 0.25, mode: 'repeat' }) },
  // agate-like rings of greens
  malachite: { stops: [stop(0, 0.0018, 0.016, 0.0091), stop(0.2, 0.0048, 0.1046, 0.0423), stop(0.4, 0.0273, 0.2961, 0.1329), stop(0.6, 0.2747, 0.6724, 0.4233), stop(0.8, 0.0048, 0.1046, 0.0423), stop(1, 0.0018, 0.016, 0.0091)], interp: 'ease', space: 'oklab', map: defMap({ scale: 0.8, mode: 'repeat', log: true }) },
  // ivory to warm grey
  bone: { stops: [stop(0, 0.0232, 0.0194, 0.0144), stop(0.333, 0.2623, 0.2232, 0.1683), stop(0.667, 0.6939, 0.624, 0.5029), stop(1, 0.9047, 0.8632, 0.7758)], interp: 'ease', space: 'oklab', map: defMap({ scale: 0.15, offset: 0.6, log: true }) },
  // a muted full sweep, repeating
  prism: { stops: [stop(0, 0.3916, 0.1683, 0.1683), stop(0.2, 0.3916, 0.305, 0.1441), stop(0.4, 0.2086, 0.3231, 0.1683), stop(0.6, 0.1441, 0.2874, 0.3515), stop(0.8, 0.2086, 0.1683, 0.3916), stop(1, 0.3916, 0.1683, 0.1683)], interp: 'linear', space: 'oklab', map: defMap({ scale: 0.35, mode: 'repeat', log: true }) },
  // one slow sweep: deep blue in the folds, warm on the crests
  strata: { stops: [stop(0, 0.0232, 0.0296, 0.162), stop(0.25, 0.0232, 0.1441, 0.1683), stop(0.5, 0.1946, 0.2542, 0.0648), stop(0.75, 0.4342, 0.1878, 0.0685), stop(1, 0.5271, 0.2542, 0.3231)], interp: 'bspline', space: 'oklab', map: defMap({ scale: 0.22, offset: 0.7, mode: 'mirror', log: true }) },
  // green facing the eye, blue then violet toward the rim
  beetle: { stops: [stop(0, 0.0685, 0.0232, 0.2789), stop(0.25, 0.0423, 0.0976, 0.5271), stop(0.5, 0.0232, 0.314, 0.4793), stop(0.75, 0.0103, 0.2542, 0.0976), stop(1, 0.003, 0.0423, 0.0116)], interp: 'bspline', space: 'oklab', map: defMap() },
  // the key magenta in six flat value steps: deep shadow to pale, terraced
  abyss: { stops: [stop(0, 0.0423, 0.0037, 0.016), stop(0.2, 0.1946, 0.0123, 0.0648), stop(0.4, 0.4508, 0.0423, 0.1683), stop(0.6, 0.6939, 0.1356, 0.3231), stop(0.8, 0.8714, 0.3916, 0.5776), stop(1, 0.9647, 0.7682, 0.855)], interp: 'constant', space: 'oklab', map: defMap({ scale: 0.6, mode: 'mirror', log: true }) },
  fire: { stops: [stop(0, 0, 0, 0), stop(0.3, 0.45, 0.02, 0.01), stop(0.6, 1, 0.28, 0.02), stop(0.85, 1, 0.75, 0.2), stop(1, 1, 1, 0.9)], interp: 'linear', space: 'oklab', map: defMap() },
  ice: { stops: [stop(0, 0.01, 0.02, 0.08), stop(0.45, 0.05, 0.25, 0.6), stop(0.8, 0.45, 0.85, 1), stop(1, 1, 1, 1)], interp: 'ease', space: 'oklab', map: defMap() },
  film: { stops: [stop(0, 0.9, 0.2, 0.5), stop(0.25, 0.25, 0.4, 1), stop(0.5, 0.2, 0.95, 0.75), stop(0.75, 1, 0.85, 0.25), stop(1, 0.9, 0.2, 0.5)], interp: 'cardinal', space: 'hsv', map: defMap({ mode: 'repeat', scale: 1.6 }) },
  mono: { stops: [stop(0, 0.02, 0.004, 0.012), stop(0.55, 1, 0.22, 0.55), stop(0.9, 1, 0.75, 0.88), stop(1, 1, 1, 1)], interp: 'ease', space: 'oklab', map: defMap() },
};
export const rampPreset = (name) => JSON.parse(JSON.stringify(RAMP_PRESETS[name]));

// today's look as a graph to start from: the fold index through a repeating ramp sampled from the
// default tint (the key colour pulled toward thin-film iridescence)
export function defaultShade(key = [1, 0.22, 0.55], iridescence = 0.35, spread = 1.6, hue = 0) {
  const kl = Math.hypot(...key);
  const at = (t) => {
    const film = [0, 0.33, 0.67].map((o) => 0.5 + 0.5 * Math.cos(2 * Math.PI * (o + t + hue)));
    return key.map((k, i) => k + (film[i] * kl - k) * iridescence);
  };
  const stops = Array.from({ length: 9 }, (_, i) => stop(i / 8, ...at(i / 8)));
  return normShade({
    nodes: [
      { id: 'col', type: 'col', in: {}, p: {} },
      { id: 'ramp', type: 'ramp', in: { v: 'col' }, p: { stops, interp: 'linear', space: 'rgb', map: defMap({ mode: 'repeat', scale: spread }) } },
    ],
    out: { color: 'ramp' },
  });
}

// ---------- the GPU program (gpu/wgsl.js SHADE reads it) -----------------------------------------
// vec4 units after the op records: [n, colour node, glow node (−1 none), glow is a colour], [gain,
// bindings, 0, 0], then four vec4 per node — [type, in0, in1, in2] (node indices, −1 unconnected, ≤ −2
// a driver: −2 − its index in the drive program), then per type: ramp [first stop, stops, interp,
// space] [scale, offset, mode, flags (1 log, 2 invert)] [hue]; math [op, c]; mixc [mode, f] — then the
// stops, two vec4 each: [t] [r, g, b, a]; then two vec4 per binding: [node (−1 the outputs), what (0
// scale, 1 offset, 2 hue, 3 a stop's t, 4 c, 5 f, 6 gain), driver index, the stop's place among all
// stops], [lo, hi, min, max].
export const SH_NODE_VEC4 = 4;
export const SH_STOPS_AT = 2 + MAX_NODES * SH_NODE_VEC4;
export const SH_BINDS_AT = SH_STOPS_AT + MAX_TOTAL_STOPS * 2;
export const SHADE_VEC4 = SH_BINDS_AT + MAX_SHADE_BINDS * 2;
export const TYPE_CODE = { col: 1, trap: 2, depth: 3, lyap: 4, facing: 5, species: 6, w: 7, piece: 8, seam: 9, ramp: 10, math: 11, mixc: 12, kali: 13 };
const BIND_CODE = { scale: 0, offset: 1, hue: 2, stop: 3, c: 4, f: 5, gain: 6 };
// drive: the formula's drivers (their order is the drive program's: a 'd:' input names its register)
export function packShade(shade, drive = null) {
  const s = normShade(shade);
  const out = new Float32Array(SHADE_VEC4 * 4);
  const index = new Map(s.nodes.map((n, i) => [n.id, i]));
  const dIndex = new Map(((drive && drive.nodes) || []).map((m, i) => [m.id, i]));
  const ix = (id) => (id != null && index.has(id) ? index.get(id) : -1);
  const iref = (ref) => (isDrv(ref) ? (dIndex.has(drvId(ref)) ? -2 - dIndex.get(drvId(ref)) : -1) : ix(ref));
  const glow = s.out.glow != null ? ix(s.out.glow) : -1;
  out.set([s.nodes.length, ix(s.out.color), glow, glow >= 0 && kindOf(s.nodes[glow].type) === 'colour' ? 1 : 0], 0);
  const stopBase = SH_STOPS_AT;
  let stopAt = 0;
  const firstStop = new Map();
  s.nodes.forEach((n, i) => {
    const o = (2 + i * SH_NODE_VEC4) * 4;
    const ports = PORTS[n.type] || [];
    out.set([TYPE_CODE[n.type], ...[0, 1, 2].map((k) => (ports[k] ? iref(n.in[ports[k]]) : -1))], o);
    if (n.type === 'ramp') {
      const p = n.p;
      firstStop.set(n.id, stopAt);
      out.set([stopAt, p.stops.length, INTERPS.indexOf(p.interp), SPACES.indexOf(p.space)], o + 4);
      out.set([p.map.scale, p.map.offset, MODES.indexOf(p.map.mode), (p.map.log ? 1 : 0) + (p.map.invert ? 2 : 0)], o + 8);
      out[o + 12] = p.map.hue || 0;
      p.stops.forEach((st, j) => {
        out[(stopBase + (stopAt + j) * 2) * 4] = st.t;
        out.set(st.c, (stopBase + (stopAt + j) * 2 + 1) * 4);
      });
      stopAt += p.stops.length;
    } else if (n.type === 'math') out.set([MATH_OPS.indexOf(n.p.op), n.p.c], o + 4);
    else if (n.type === 'mixc') out.set([MIX_MODES.indexOf(n.p.mode), n.p.f], o + 4);
    else if (n.type === 'kali') { out.set([n.p.cx, n.p.cy, n.p.cz, n.p.f], o + 4); out.set([n.p.n, KALI_MODES.indexOf(n.p.mode)], o + 8); }
  });
  // bindings whose driver exists (a colour drive needs the drive program: gpu/pack.js packs it)
  const binds = (s.bind || []).map((b) => ({ b, t: shadeTarget(s, b.to) })).filter((x) => x.t && dIndex.has(x.b.from));
  out.set([s.out.gain ?? 1, binds.length, 0, 0], 4);
  const BIG = 1e30;
  binds.forEach(({ b, t }, k) => {
    const o = (SH_BINDS_AT + k * 2) * 4;
    out.set([t.node ? ix(t.node.id) : -1, BIND_CODE[t.kind], dIndex.get(b.from), t.kind === 'stop' ? firstStop.get(t.node.id) + t.stop : -1], o);
    out.set([b.lo, b.hi, Math.max(t.min, -BIG), Math.min(t.max, BIG)], o + 4);
  });
  return out;
}

// A driver gone from the formula: the shading's links to it take `instead` (another driver id) or,
// without one, an optional input is left unconnected and a required one reads the fold index (as a
// fresh node's does); its bindings move to `instead` or go. Returns a new network.
const OPTIONAL_PORTS = { math: ['b'], mixc: ['f'] };
export function dropDriverRefs(shade, id, instead = null) {
  const s = JSON.parse(JSON.stringify(normShade(shade)));
  const ref = DRV + id;
  let col = null;
  for (const n of s.nodes) for (const [port, r] of Object.entries(n.in)) {
    if (r !== ref) continue;
    if (instead != null) n.in[port] = DRV + instead;
    else if ((OPTIONAL_PORTS[n.type] || []).includes(port)) delete n.in[port];
    else {
      col = col || s.nodes.find((q) => q.type === 'col') || null;
      if (!col) { col = { id: s.nodes.some((q) => q.id === 'col') ? 'col_' : 'col', type: 'col', in: {}, p: {} }; s.nodes.unshift(col); }
      n.in[port] = col.id;
    }
  }
  s.bind = (s.bind || []).flatMap((b) => (b.from !== id ? [b] : instead != null ? [{ ...b, from: instead }] : []));
  return normShade(s);
}
