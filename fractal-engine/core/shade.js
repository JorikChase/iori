// Shading: the formula's colour as a typed dataflow — the orbit's readings flow through ramps, maths
// and colour mixes into the outputs (DESIGN.md "Shading (Q5)"). The first real formula-v2 graph.
//
//   formula.shade = { nodes: [{ id, type, in: { port: nodeId }, p: {…} }, …], out: { color, glow? } }
//
// Nodes come in topological order: an input names an earlier node. Types:
//   readings (no inputs, a number out): col (the fold colour index, 0..1), trap (least |p|²), depth
//            (iterations done ÷ iterations), lyap (λ along the orbit), facing (n·v), species (the
//            leading chimera species ÷ (k − 1)), w (the hit point's place along w in 4-D)
//   ramp     in.v number → colour. p: stops [{ t, c: [r, g, b, a] }] (linear RGB), interp (constant,
//            linear, ease, bspline, cardinal), space (rgb, hsv, oklab), map { scale, offset, mode
//            (clamp, repeat, mirror), log, invert }: the number becomes t in 0..1 as
//            log2 (if log) → · scale + offset → clamp / repeat / mirror → 1 − t (if invert)
//   math     in.a, in.b numbers → number. p: op (add, sub, mul, min, max, pow, sin, bands), c (b when
//            in.b is not connected). sin = ½ + ½ sin(2π a b); bands = ⌊a / b⌋ b (terraces of a)
//   mixc     in.a, in.b colours, in.f number → colour. p: mode (mix, multiply, screen, add), f (when
//            in.f is not connected)
// out.color names a colour node (the surface's albedo); out.glow a number (scales the glow) or a
// colour (tints it), or is absent (the glow takes out.color's colour).
//
// evalShade(shade, readings) is the reference the GPU's register interpreter (gpu/wgsl.js SHADE) is
// diffed against. packShade lays the program out for it.

export const READINGS = ['col', 'trap', 'depth', 'lyap', 'facing', 'species', 'w'];
export const INTERPS = ['constant', 'linear', 'ease', 'bspline', 'cardinal'];
export const SPACES = ['rgb', 'hsv', 'oklab'];
export const MODES = ['clamp', 'repeat', 'mirror'];
export const MATH_OPS = ['add', 'sub', 'mul', 'min', 'max', 'pow', 'sin', 'bands'];
export const MIX_MODES = ['mix', 'multiply', 'screen', 'add'];
export const MAX_NODES = 32, MAX_STOPS = 16, MAX_TOTAL_STOPS = 64;

const COLOUR = new Set(['ramp', 'mixc']);
const NUMBER = new Set([...READINGS, 'math']);
const PORTS = { ramp: ['v'], math: ['a', 'b'], mixc: ['a', 'b', 'f'] };
const REQUIRED = { ramp: ['v'], math: ['a'], mixc: ['a', 'b'] };
const PORT_KIND = { ramp: { v: 'number' }, math: { a: 'number', b: 'number' }, mixc: { a: 'colour', b: 'colour', f: 'number' } };
export const kindOf = (type) => (COLOUR.has(type) ? 'colour' : NUMBER.has(type) ? 'number' : null);

const num = (x, d) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
const sortKeys = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));

// defaults filled, keys in a fixed order, stops sorted: the form that is hashed and written
function normParams(type, p = {}) {
  if (type === 'ramp') {
    const m = p.map || {};
    const stops = (p.stops || []).map((s) => ({ t: num(s.t, 0), c: [0, 1, 2, 3].map((i) => num((s.c || [])[i], i === 3 ? 1 : 0)) }));
    stops.sort((a, b) => a.t - b.t);
    return {
      interp: p.interp || 'linear', space: p.space || 'rgb',
      map: { invert: !!m.invert, log: !!m.log, mode: m.mode || 'clamp', offset: num(m.offset, 0), scale: num(m.scale, 1) },
      stops,
    };
  }
  if (type === 'math') return { c: num(p.c, 1), op: p.op || 'add' };
  if (type === 'mixc') return { f: num(p.f, 0.5), mode: p.mode || 'mix' };
  return {};
}

export function normShade(s) {
  return {
    nodes: (s.nodes || []).map((n) => ({ id: String(n.id), in: sortKeys({ ...(n.in || {}) }), p: normParams(n.type, n.p), type: n.type })),
    out: { color: s.out && s.out.color != null ? String(s.out.color) : null, ...(s.out && s.out.glow != null ? { glow: String(s.out.glow) } : {}) },
  };
}

export function validateShade(s) {
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
    seen.set(n.id, kind);
  });
  if (total > MAX_TOTAL_STOPS) err(`more than ${MAX_TOTAL_STOPS} stops in all`);
  const out = s.out || {};
  if (!seen.has(out.color) || seen.get(out.color) !== 'colour') err('out.color must name a colour node');
  if (out.glow != null && !seen.has(out.glow)) err('out.glow must name a node');
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
  if (n === 1 || t <= S[0].t) return S[0].c.map(clamp01);
  if (t >= S[n - 1].t) return S[n - 1].c.map(clamp01);
  let i = 0;
  for (let j = 0; j < n; j++) if (S[j].t <= t) i = j;
  if (p.interp === 'constant') return S[i].c.map(clamp01);
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
  return [...rgb, alpha];
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

// readings: { col, trap, depth, lyap, facing, species, w } (missing ones are 0)
export function evalShade(shade, readings = {}) {
  const s = normShade(shade);
  const reg = new Map();
  for (const n of s.nodes) {
    const get = (port, d) => (n.in[port] != null ? reg.get(n.in[port]) : d);
    let v;
    if (READINGS.includes(n.type)) v = num(readings[n.type], 0);
    else if (n.type === 'ramp') v = rampAt(n.p, get('v', 0));
    else if (n.type === 'math') v = mathOp(n.p.op, get('a', 0), get('b', n.p.c));
    else if (n.type === 'mixc') v = mixOp(n.p.mode, get('a'), get('b'), get('f', n.p.f));
    reg.set(n.id, v);
  }
  const glow = s.out.glow != null ? reg.get(s.out.glow) : null;
  return { color: reg.get(s.out.color), glow: Array.isArray(glow) ? glow.slice(0, 3) : glow };
}

// ---------- presets ---------------------------------------------------------------------------------
const stop = (t, r, g, b, a = 1) => ({ t, c: [r, g, b, a] });
const defMap = (o = {}) => ({ scale: 1, offset: 0, mode: 'clamp', log: false, invert: false, ...o });
export const RAMP_PRESETS = {
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
// vec4 units after the op records: [n, colour node, glow node (−1 none), glow is a colour], then three
// vec4 per node — [type, in0, in1, in2] (node indices, −1 unconnected), then per type: ramp [first
// stop, stops, interp, space] [scale, offset, mode, flags (1 log, 2 invert)]; math [op, c]; mixc
// [mode, f] — then the stops, two vec4 each: [t] [r, g, b, a].
export const SHADE_VEC4 = 1 + MAX_NODES * 3 + MAX_TOTAL_STOPS * 2;
export const TYPE_CODE = { col: 1, trap: 2, depth: 3, lyap: 4, facing: 5, species: 6, w: 7, ramp: 10, math: 11, mixc: 12 };
export function packShade(shade) {
  const s = normShade(shade);
  const out = new Float32Array(SHADE_VEC4 * 4);
  const index = new Map(s.nodes.map((n, i) => [n.id, i]));
  const ix = (id) => (id != null && index.has(id) ? index.get(id) : -1);
  const glow = s.out.glow != null ? ix(s.out.glow) : -1;
  out.set([s.nodes.length, ix(s.out.color), glow, glow >= 0 && kindOf(s.nodes[glow].type) === 'colour' ? 1 : 0], 0);
  const stopBase = 1 + MAX_NODES * 3;
  let stopAt = 0;
  s.nodes.forEach((n, i) => {
    const o = (1 + i * 3) * 4;
    const ports = PORTS[n.type] || [];
    out.set([TYPE_CODE[n.type], ...[0, 1, 2].map((k) => (ports[k] ? ix(n.in[ports[k]]) : -1))], o);
    if (n.type === 'ramp') {
      const p = n.p;
      out.set([stopAt, p.stops.length, INTERPS.indexOf(p.interp), SPACES.indexOf(p.space)], o + 4);
      out.set([p.map.scale, p.map.offset, MODES.indexOf(p.map.mode), (p.map.log ? 1 : 0) + (p.map.invert ? 2 : 0)], o + 8);
      p.stops.forEach((st, j) => {
        out[(stopBase + (stopAt + j) * 2) * 4] = st.t;
        out.set(st.c, (stopBase + (stopAt + j) * 2 + 1) * 4);
      });
      stopAt += p.stops.length;
    } else if (n.type === 'math') out.set([MATH_OPS.indexOf(n.p.op), n.p.c], o + 4);
    else if (n.type === 'mixc') out.set([MIX_MODES.indexOf(n.p.mode), n.p.f], o + 4);
  });
  return out;
}
