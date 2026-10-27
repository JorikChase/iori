// Drivers: op parameters driven by the orbit, the world, the clock and each other — formula v2's first
// half (DESIGN.md "Formula v2 — drivers (V)"). A second dataflow beside the shading one, same form.
//
//   formula.drive = { nodes: [{ id, type, in: { port: nodeId }, p: {…} }, …],
//                     bind: [{ to: '<graph path id>.<param>', from: nodeId, lo, hi }, …] }
//
// Nodes come in topological order: an input names an earlier node. Every node gives one number.
//   orbit readings (per iteration, read at the start of each iteration, before its ops):
//            i (iterations done ÷ iterations), r (|p|), trap (least |p|² so far, the start included),
//            lyap (the running stretch log dr ÷ (i + 1)), px py pz pw (the point)
//   the start (once per orbit): x y z w — the orbit's start point in 4-D
//   world fields (once per orbit, read at the start): axis (g·n̂·x), sphere (g·(|x − c| − r)), noise
//            (g·fBm), tissue (out cell: the soft cell index ÷ (n − 1); out wall: the gap between the two
//            nearest sites' distances ÷ size) — core/fields.js's sites and noise
//   time     p: rate, wave (saw, sine, tri), phase → 0..1 at the clock t (seconds)
//   param    p: of — another op's own value (its JSON value, never its driven one) by '<path>.<param>'
//   math     in.a, in.b → number; core/shade.js's ops, c standing in for b (and a math node with no
//            inputs is the constant c: a param node whose op is removed becomes one)
//   remap    in.a → (a − lo) ÷ (hi − lo), clamped to 0..1 when clamp
// A binding sets its parameter to lo + v·(hi − lo), clamped to the parameter's range — the band on the
// parameter's dimension line is [lo, hi]; [0, 1] passes v through. One binding per parameter, and only
// continuous parameters can be driven (counts, seeds and frames are not). The op keeps its own value
// for when it is unbound.
//
// A node is per-iteration when it is an orbit reading or reads one; the rest (start, fields, time,
// param) are computed once per orbit — hoisted. driveRuntime is what core/cpu.js runs; evalDrive the
// reference a GPU program will be diffed against.

import { getOp, isMix } from './ops.js';
import { fbm, site } from './fields.js';
import { MATH_OPS } from './shade.js';
import { slotLetter } from './notation.js';

export const ORBIT = ['i', 'r', 'trap', 'lyap', 'px', 'py', 'pz', 'pw'];
export const START = ['x', 'y', 'z', 'w'];
export const FIELDS = ['axis', 'sphere', 'noise', 'tissue'];
export const WAVES = ['saw', 'sine', 'tri'];
export const TISSUE_OUT = ['cell', 'wall'];
export const TYPES = [...ORBIT, ...START, ...FIELDS, 'time', 'param', 'math', 'remap'];
export const MAX_NODES = 32, MAX_BINDS = 16;

const PORTS = { math: ['a', 'b'], remap: ['a'] };
const REQUIRED = { remap: ['a'] };

// each type's parameters: numbers { d, min, max, discrete }, or a list of words (an enum), a boolean, a
// string — the numbers that are not discrete are what breeding and the lens may move
const n = (d, min, max) => ({ d, min, max });
const dn = (d, min, max) => ({ d, min, max, discrete: true });
export const PARAMS = {
  axis: { nx: n(1), ny: n(0), nz: n(0), nw: n(0), g: n(1, -64, 64) },
  sphere: { cx: n(0), cy: n(0), cz: n(0), cw: n(0), r: n(1, 0, 16), g: n(1, -64, 64) },
  noise: { f: n(1, 0, 16), g: n(1, -16, 16), o: dn(2, 1, 4), seed: dn(0, 0, 65535) },
  tissue: { n: dn(6, 2, 16), size: n(1.5, 1e-3, 32), soft: n(0.1, 1e-4, 2), seed: dn(0, 0, 65535), out: TISSUE_OUT },
  time: { rate: n(0.25, -64, 64), phase: n(0), wave: WAVES },
  param: { of: '' },
  math: { op: MATH_OPS, c: n(1) },
  remap: { lo: n(0), hi: n(1), clamp: true },
};
const BAND = n(0);

const num = (x, d) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
const sortKeys = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
const clampTo = (v, q) => Math.min(q.max ?? Infinity, Math.max(q.min ?? -Infinity, v));

function normParams(type, p = {}) {
  const spec = PARAMS[type] || {}, out = {};
  for (const [k, q] of Object.entries(spec)) {
    if (Array.isArray(q)) out[k] = q.includes(p[k]) ? p[k] : q[0];
    else if (typeof q === 'boolean') out[k] = p[k] === undefined ? q : !!p[k];
    else if (typeof q === 'string') out[k] = p[k] == null ? q : String(p[k]);
    else out[k] = num(p[k], q.d);
  }
  if (type === 'time' && !WAVES.includes(p.wave)) out.wave = 'sine';
  return sortKeys(out);
}

// '<path>.<param>' → { path, key }
export const splitTarget = (to) => { const i = String(to).lastIndexOf('.'); return { path: to.slice(0, i), key: to.slice(i + 1) }; };

export function normDrive(d) {
  return {
    bind: (d.bind || []).map((b) => ({ from: String(b.from), hi: num(b.hi, 1), lo: num(b.lo, 0), to: String(b.to) })).sort((a, b) => (a.to < b.to ? -1 : a.to > b.to ? 1 : 0)),
    nodes: (d.nodes || []).map((m) => ({ id: String(m.id), in: sortKeys({ ...(m.in || {}) }), p: normParams(m.type, m.p), type: m.type })),
  };
}
export const emptyDrive = (d) => !d || (!(d.nodes || []).length && !(d.bind || []).length);

// Every op of a formula by its graph path id (core/graph.js): 'B3' op 3 of scheduled chain B, 'B3.1.0'
// the first op of species 1 of that chimera. Map id → the op object itself.
export function opPaths(f) {
  const mixes = [];
  f.slots.forEach((sl, si) => sl.forEach((o, j) => { if (isMix(o.op)) mixes.push({ si, j, k: Math.round((o.p && o.p.s) || 2) }); }));
  const top = f.slots.length - mixes.reduce((a, m) => a + m.k, 0);
  let next = top;
  const kidsAt = new Map(mixes.map((m) => [`${m.si}.${m.j}`, Array.from({ length: m.k }, () => next++)]));
  const out = new Map();
  f.slots.slice(0, Math.max(top, 0)).forEach((sl, si) => sl.forEach((o, j) => {
    const id = `${slotLetter(si)}${j}`;
    out.set(id, o);
    (kidsAt.get(`${si}.${j}`) || []).forEach((k, s) => (f.slots[k] || []).forEach((q, i) => out.set(`${id}.${s}.${i}`, q)));
  }));
  return out;
}

// the op parameter a target names, when it is one a binding may drive (null otherwise)
export function targetParam(paths, to) {
  const { path, key } = splitTarget(to);
  const o = paths.get(path);
  const def = o && getOp(o.op);
  if (!def) return null;
  const q = def.params.find((r) => r.k === key);
  return q && !q.discrete && !q.hidden ? { o, q, key } : null;
}

// f: the normalised formula the bindings name (optional: without it targets are not checked)
export function validateDrive(d, f = null) {
  const errors = [];
  const err = (m) => errors.push('drive: ' + m);
  if (!d || typeof d !== 'object' || !Array.isArray(d.nodes || []) || !Array.isArray(d.bind || [])) return ['drive: needs nodes and bind'];
  const nodes = d.nodes || [], bind = d.bind || [];
  if (nodes.length > MAX_NODES) err(`more than ${MAX_NODES} nodes`);
  if (bind.length > MAX_BINDS) err(`more than ${MAX_BINDS} bindings`);
  const paths = f ? opPaths(f) : null;
  const seen = new Set();
  nodes.forEach((m, i) => {
    if (!m || !TYPES.includes(m.type)) { err(`node ${i}: unknown type "${m && m.type}"`); return; }
    if (typeof m.id !== 'string' || !m.id || seen.has(m.id)) { err(`node ${i}: needs a unique id`); return; }
    const ports = PORTS[m.type] || [];
    for (const [port, ref] of Object.entries(m.in || {})) {
      if (!ports.includes(port)) err(`${m.id}: ${m.type} has no input ${port}`);
      else if (!seen.has(ref)) err(`${m.id}.${port}: ${ref} is not an earlier node`);
    }
    for (const port of REQUIRED[m.type] || []) if (!(m.in && m.in[port] != null)) err(`${m.id}: input ${port} is not connected`);
    const p = m.p || {};
    for (const [k, q] of Object.entries(PARAMS[m.type] || {})) {
      if (Array.isArray(q)) { if (!q.includes(p[k])) err(`${m.id}: ${k} is one of ${q.join(', ')}`); }
      else if (typeof q === 'object' && !(Number.isFinite(p[k]))) err(`${m.id}: ${k} must be a finite number`);
      else if (typeof q === 'object' && q.discrete && !Number.isInteger(p[k])) err(`${m.id}: ${k} must be a whole number`);
    }
    if (m.type === 'param' && paths) {
      const { path, key } = splitTarget(p.of || '');
      const o = paths.get(path);
      if (!o || !o.p || !(key in o.p)) err(`${m.id}: no parameter ${p.of}`);
    }
    seen.add(m.id);
  });
  const targets = new Set();
  for (const b of bind) {
    if (!seen.has(b.from)) err(`${b.to}: ${b.from} is not a node`);
    if (!Number.isFinite(b.lo) || !Number.isFinite(b.hi)) err(`${b.to}: the band needs finite lo and hi`);
    if (targets.has(b.to)) err(`${b.to} is bound twice`);
    targets.add(b.to);
    if (paths && !targetParam(paths, b.to)) err(`${b.to} is not a parameter that can be driven`);
  }
  return errors;
}

// ---------- evaluation ------------------------------------------------------------------------------
export function perIteration(d) {
  const per = new Set();
  for (const m of d.nodes) if (ORBIT.includes(m.type) || Object.values(m.in).some((r) => per.has(r))) per.add(m.id);
  return per;
}

const dot4 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
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

export function fieldValue(type, P, x) {
  if (type === 'axis') {
    const l = Math.hypot(P.nx, P.ny, P.nz, P.nw) || 1;
    return (P.g * (P.nx * x[0] + P.ny * x[1] + P.nz * x[2] + P.nw * x[3])) / l;
  }
  if (type === 'sphere') return P.g * (Math.hypot(x[0] - P.cx, x[1] - P.cy, x[2] - P.cz, x[3] - P.cw) - P.r);
  if (type === 'noise') return P.g * fbm(x, P.f, Math.round(P.o), Math.round(P.seed)).n;
  if (type === 'tissue') {
    const k = Math.round(P.n), size = P.size, seed = Math.round(P.seed);
    const d2 = Array.from({ length: k }, (_, j) => { const y = site(seed, j, size), d = x.map((v, a) => v - y[a]); return dot4(d, d); });
    if (P.out === 'wall') {
      const s = d2.map(Math.sqrt).sort((a, b) => a - b);
      return (s[1] - s[0]) / size;
    }
    // the softmax of the field library's tissue, its cells numbered 0..1
    const tau = Math.max(P.soft * size, 1e-9), e = d2.map((v) => -v / tau), mx = Math.max(...e);
    const pi = e.map((v) => Math.exp(v - mx)), Z = pi.reduce((a, b) => a + b, 0);
    return pi.reduce((a, v, j) => a + (v / Z) * (j / (k - 1)), 0);
  }
  return 0;
}

export function wave(P, t) {
  const u = t * P.rate + P.phase, fr = u - Math.floor(u);
  if (P.wave === 'saw') return fr;
  if (P.wave === 'tri') return 1 - Math.abs(2 * fr - 1);
  return 0.5 + 0.5 * Math.sin(2 * Math.PI * u);
}

// One node's value. env: { read: { i, r, trap, lyap, px … pw }, start: [4], time, own(to) }
function nodeValue(m, get, env) {
  const P = m.p;
  if (ORBIT.includes(m.type)) return num(env.read && env.read[m.type], 0);
  if (START.includes(m.type)) return num(env.start && env.start[START.indexOf(m.type)], 0);
  if (FIELDS.includes(m.type)) return fieldValue(m.type, P, env.start || [0, 0, 0, 0]);
  if (m.type === 'time') return wave(P, env.time || 0);
  if (m.type === 'param') return num(env.own && env.own(P.of), 0);
  if (m.type === 'math') return mathOp(P.op, get('a', 0), get('b', P.c));
  if (m.type === 'remap') {
    const v = (get('a', 0) - P.lo) / (P.hi - P.lo || 1e-12);
    return P.clamp ? Math.min(1, Math.max(0, v)) : v;
  }
  return 0;
}

// every node's value and every binding's value (lo + v·(hi − lo), unclamped), in the normalised order
export function evalDrive(drive, env = {}) {
  const d = normDrive(drive), reg = new Map();
  for (const m of d.nodes) reg.set(m.id, nodeValue(m, (port, def) => (m.in[port] != null ? reg.get(m.in[port]) : def), env));
  return { reg, values: d.bind.map((b) => b.lo + num(reg.get(b.from), 0) * (b.hi - b.lo)) };
}

// The orbit's drivers, for core/cpu.js: map holds, for every driven op, its parameters with the driven
// values in (ops not in it run on their own). step(read) is called at the start of every iteration;
// hoisted nodes are computed once. null when the formula drives nothing.
export function driveRuntime(f, start, time = 0) {
  if (!f.drive || !f.drive.bind.length) return null;
  const d = f.drive, paths = opPaths(f), per = perIteration(d);
  const own = (to) => { const { path, key } = splitTarget(to), o = paths.get(path); return o ? o.p[key] : 0; };
  const targets = d.bind.map((b) => targetParam(paths, b.to));
  const live = d.bind.some((b) => per.has(b.from));
  const reg = new Map(), map = new Map();
  const env = { start, time, own, read: null };
  let first = true;
  const step = (read) => {
    if (!first && !live) return;
    env.read = read;
    for (const m of d.nodes) {
      if (!first && !per.has(m.id)) continue;
      reg.set(m.id, nodeValue(m, (port, def) => (m.in[port] != null ? reg.get(m.in[port]) : def), env));
    }
    first = false;
    map.clear();
    d.bind.forEach((b, i) => {
      const t = targets[i];
      if (!t) return;
      const P = map.get(t.o) || { ...t.o.p };
      P[t.key] = clampTo(b.lo + num(reg.get(b.from), 0) * (b.hi - b.lo), t.q);
      map.set(t.o, P);
    });
  };
  return { map, step };
}

// the orbit readings at the start of iteration i (of n) from the running state
export function readingsOf(s, i, n) {
  const p = s.p;
  return {
    i: i / n, r: Math.hypot(p[0], p[1], p[2], p[3]), trap: s.ctx ? s.ctx.trap : dot4(p, p),
    lyap: Math.log(Math.max(s.dr, 1e-30)) / (i + 1), px: p[0], py: p[1], pz: p[2], pw: p[3],
  };
}

// ---------- edits and parameters --------------------------------------------------------------------

// After a graph edit: old path ids → the new ids of the same nodes (the first the node itself, the
// rest its copies). Bindings follow their op (copies take a copy of it, so a fork changes nothing until
// a species does), and vanish with it or with their parameter; a param node whose op is gone becomes
// the constant it last read. f: the edited, normalised formula; was(to): an old parameter's value.
export function remapDrive(drive, ids, f, was = () => 0) {
  const d = normDrive(drive), paths = opPaths(f);
  const bind = [], taken = new Set();
  for (const b of d.bind) {
    const { path, key } = splitTarget(b.to);
    for (const id of ids.get(path) || []) {
      const to = `${id}.${key}`;
      if (taken.has(to) || bind.length >= MAX_BINDS || !targetParam(paths, to)) continue;
      taken.add(to);
      bind.push({ ...b, to });
    }
  }
  const nodes = d.nodes.map((m) => {
    if (m.type !== 'param') return m;
    const { path, key } = splitTarget(m.p.of), id = (ids.get(path) || [])[0];
    if (id && key in paths.get(id).p) return { ...m, p: { ...m.p, of: `${id}.${key}` } };
    return { id: m.id, in: {}, p: { c: num(was(m.p.of), 0), op: 'add' }, type: 'math' };
  });
  return normDrive({ nodes, bind });
}

// The drivers' continuous parameters, for breeding and the lens: refs 'bind/<to>/lo|hi' and
// 'node/<id>/<key>'. [{ ref, value, min, max }]
export function driveParams(drive) {
  if (!drive) return [];
  const d = normDrive(drive), out = [];
  for (const b of d.bind) for (const k of ['lo', 'hi']) out.push({ ref: `bind/${b.to}/${k}`, value: b[k], min: BAND.min, max: BAND.max });
  for (const m of d.nodes) for (const [k, q] of Object.entries(PARAMS[m.type] || {})) {
    if (q && typeof q === 'object' && !Array.isArray(q) && !q.discrete) out.push({ ref: `node/${m.id}/${k}`, value: m.p[k], min: q.min, max: q.max });
  }
  return out;
}

export function getDriveParam(drive, ref) {
  const [kind, id, key] = ref.split('/');
  const it = kind === 'bind' ? drive.bind.find((b) => b.to === id) : drive.nodes.find((m) => m.id === id);
  return it ? (kind === 'bind' ? it[key] : it.p[key]) : undefined;
}
// in place, clamped to the parameter's range
export function setDriveParam(drive, ref, v) {
  const [kind, id, key] = ref.split('/');
  if (kind === 'bind') { const b = drive.bind.find((x) => x.to === id); if (b) b[key] = v; return; }
  const m = drive.nodes.find((x) => x.id === id), q = m && PARAMS[m.type][key];
  if (m && q && typeof q === 'object') m.p[key] = clampTo(v, q);
}
