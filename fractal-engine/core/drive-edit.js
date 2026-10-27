// Edits of a formula's drivers (core/drive.js), for the graph's driver lane. Each takes a formula and
// returns a new normalised one, or throws when the result would not be valid: nodes are kept in
// topological order (an input names an earlier node), cycles refused. Bindings themselves are made and
// banded by core/graph.js (bind, unbind, setBand).
//
//   placeOf(type)                 'lane' (orbit readings, maths, remaps: inside the repeat zone) or 'top'
//                                 (the start, fields, time, param: on the zone's top edge, once an orbit)
//   addDriver(f, type, at, p)     a new node; at = { node, port } inserts it on that input's link, at =
//                                 { bind: to } between a binding and its source — the old source becomes
//                                 the new node's input where it has one
//   connectDriver(f, from, to, port), disconnectDriver(f, to, port)
//   removeDriverNode(f, id)       a bypass: what it fed takes its own input instead; bindings it fed with
//                                 nothing to take its place go, and so do nodes left without a required input
//   setDriverParam(f, id, key, v) clamped to the parameter's range; words and switches as given
//   bindTrace(f, start, time, c)  every binding's value at each iteration of the orbit from start (the
//                                 band's live tick)
//   drivenOps(f)                  the path ids of the ops a binding drives (the graph's notches)
//   handleRange(v, perPx, q)      the values a parameter's dimension line spans: ±75 px at the metric

import { normalize, validate } from './formula.js';
import { normDrive, validateDrive, emptyDrive, TYPES, ORBIT, PARAMS, opPaths, targetParam, evalDrive, splitTarget } from './drive.js';
import { iterate } from './cpu.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const PORTS = { math: ['a', 'b'], remap: ['a'] };
const REQUIRED = { remap: ['a'] };
export const DRIVER_TYPES = TYPES;
export const driverPorts = (type) => PORTS[type] || [];
export const placeOf = (type) => (ORBIT.includes(type) || type === 'math' || type === 'remap' ? 'lane' : 'top');

function topo(d) {
  const byId = new Map(d.nodes.map((n) => [n.id, n]));
  const out = [], seen = new Map();
  const visit = (n) => {
    if (seen.get(n.id) === 2) return;
    if (seen.get(n.id) === 1) throw new Error('drive: that would make a loop');
    seen.set(n.id, 1);
    for (const ref of Object.values(n.in || {})) { const m = byId.get(ref); if (m) visit(m); }
    seen.set(n.id, 2);
    out.push(n);
  };
  d.nodes.forEach(visit);
  d.nodes = out;
  return d;
}

function edit(formula, fn) {
  const f = clone(normalize(formula));
  const d = clone(f.drive || { nodes: [], bind: [] });
  fn(d, f);
  topo(d);
  const nd = normDrive(d);
  // normDrive fills every node's parameters but sorts nothing but bindings: the order stays topological
  const errs = validateDrive(nd, f);
  if (errs.length) throw new Error(errs.join('; '));
  if (emptyDrive(nd)) delete f.drive; else f.drive = nd;
  const v = validate(f);
  if (!v.ok) throw new Error(v.errors.join('; '));
  return normalize(f);
}

const nodeOf = (d, id) => {
  const n = d.nodes.find((q) => q.id === id);
  if (!n) throw new Error(`drive: no node ${id}`);
  return n;
};
const newId = (d, type) => { let k = 0; while (d.nodes.some((n) => n.id === `${type}${k}`)) k++; return `${type}${k}`; };
// the id a new node of a type will get (the UI selects it after adding)
export const nextDriverId = (formula, type) => newId(normalize(formula).drive || { nodes: [] }, type);

// a fresh node: inserted on a link, a math node multiplies by 1 and a remap spans 0..1 (nothing changes
// until they are edited); free, a math node is the constant ½
function freshNode(d, type, inserted, p = {}) {
  if (!TYPES.includes(type)) throw new Error(`drive: unknown type ${type}`);
  const id = newId(d, type);
  if (type === 'math') return { id, type, in: {}, p: inserted ? { op: 'mul', c: 1, ...p } : { op: 'add', c: 0.5, ...p } };
  if (type === 'remap') return { id, type, in: {}, p: { lo: 0, hi: 1, clamp: false, ...p } };
  if (type === 'param' && !p.of) throw new Error('drive: a param node reads a parameter (p.of)');
  return { id, type, in: {}, p: { ...p } };
}

export function addDriver(formula, type, at = null, p = {}) {
  return edit(formula, (d) => {
    const n = freshNode(d, type, !!at, p);
    let old = null;
    if (at && at.bind) {
      const b = d.bind.find((x) => x.to === at.bind);
      if (!b) throw new Error(`drive: ${at.bind} is not bound`);
      old = b.from;
      b.from = n.id;
    } else if (at) {
      const m = nodeOf(d, at.node);
      if (!driverPorts(m.type).includes(at.port)) throw new Error(`drive: ${m.type} has no input ${at.port}`);
      old = m.in[at.port] ?? null;
      m.in[at.port] = n.id;
    }
    if (old != null && driverPorts(type).length) n.in[driverPorts(type)[0]] = old;
    // a remap with nothing to read reads the iteration
    if (REQUIRED[type] && n.in.a == null) {
      const i = d.nodes.find((q) => q.type === 'i') || { id: newId(d, 'i'), type: 'i', in: {}, p: {} };
      if (!d.nodes.includes(i)) d.nodes.unshift(i);
      n.in.a = i.id;
    }
    d.nodes.push(n);
  });
}

export function connectDriver(formula, from, to, port) {
  return edit(formula, (d) => {
    nodeOf(d, from);
    const m = nodeOf(d, to);
    if (!driverPorts(m.type).includes(port)) throw new Error(`drive: ${m.type} has no input ${port}`);
    if (from === to) throw new Error('drive: that would make a loop');
    m.in[port] = from;
  });
}

export function disconnectDriver(formula, to, port) {
  return edit(formula, (d) => {
    const m = nodeOf(d, to);
    if ((REQUIRED[m.type] || []).includes(port)) throw new Error(`drive: ${m.type}.${port} must be connected`);
    delete m.in[port];
  });
}

export function removeDriverNode(formula, id) {
  return edit(formula, (d) => {
    const gone = new Set([id]);
    // what replaces a removed node: its own first input, if that is not going too
    const instead = (ref) => { const m = d.nodes.find((q) => q.id === ref); const src = m && m.in[driverPorts(m.type)[0]]; return src != null && !gone.has(src) ? src : null; };
    let changed = true;
    while (changed) {
      changed = false;
      for (const m of d.nodes) {
        if (gone.has(m.id)) continue;
        for (const [port, ref] of Object.entries(m.in)) {
          if (!gone.has(ref)) continue;
          const r = instead(ref);
          if (r != null) m.in[port] = r; else delete m.in[port];
          changed = true;
        }
        if ((REQUIRED[m.type] || []).some((port) => m.in[port] == null)) { gone.add(m.id); changed = true; }
      }
    }
    d.bind = d.bind.flatMap((b) => { if (!gone.has(b.from)) return [b]; const r = instead(b.from); return r != null ? [{ ...b, from: r }] : []; });
    d.nodes = d.nodes.filter((m) => !gone.has(m.id));
  });
}

export function setDriverParam(formula, id, key, v) {
  return edit(formula, (d) => {
    const m = nodeOf(d, id), q = (PARAMS[m.type] || {})[key];
    if (q === undefined) throw new Error(`drive: ${m.type} has no parameter ${key}`);
    if (Array.isArray(q)) { if (!q.includes(v)) throw new Error(`drive: ${key} is one of ${q.join(', ')}`); m.p[key] = v; }
    else if (typeof q === 'boolean') m.p[key] = !!v;
    else if (typeof q === 'string') m.p[key] = String(v);
    else {
      let x = Number(v);
      if (q.discrete) x = Math.round(x);
      if (q.min !== undefined) x = Math.max(q.min, x);
      if (q.max !== undefined) x = Math.min(q.max, x);
      m.p[key] = x;
    }
  });
}

// Every binding's value along the orbit from start (time t): [{ to, values: [one per iteration] }],
// clamped to the parameter's range — what core/cpu.js gives the op at each iteration. The readings at
// iteration i are those at its start (core/drive.js readingsOf), rebuilt from iterate's points and drs.
export function bindTrace(formula, start, time = 0, c = undefined) {
  const f = normalize(formula);
  if (!f.drive || !f.drive.bind.length) return [];
  const o = iterate(f, start, c, { time });
  const paths = opPaths(f), own = (to) => { const { path, key } = splitTarget(to), op = paths.get(path); return op ? op.p[key] : 0; };
  const p0 = o.points[0], n = f.iters;
  const out = f.drive.bind.map((b) => ({ to: b.to, values: [], q: (targetParam(paths, b.to) || {}).q }));
  let trap = Infinity;
  for (let i = 0; i < Math.max(1, o.points.length - 1); i++) {
    const p = o.points[i];
    trap = Math.min(trap, p[0] * p[0] + p[1] * p[1] + p[2] * p[2] + p[3] * p[3]);
    const read = { i: i / n, r: Math.hypot(...p), trap, lyap: Math.log(Math.max(o.drs[i], 1e-30)) / (i + 1), px: p[0], py: p[1], pz: p[2], pw: p[3] };
    const { values } = evalDrive(f.drive, { read, start: p0, time, own });
    values.forEach((v, k) => {
      const q = out[k].q || {};
      out[k].values.push(Math.min(q.max ?? Infinity, Math.max(q.min ?? -Infinity, v)));
    });
  }
  return out.map(({ to, values }) => ({ to, values }));
}

// the values a parameter's dimension line spans: the line is 150 px and a drag moves perPx a pixel, so
// ±75 px about the value, inside the parameter's range — the band a new binding takes
export function handleRange(v, perPx, q = {}) {
  const half = 75 * perPx;
  let lo = v - half, hi = v + half;
  if (q.min !== undefined) lo = Math.max(q.min, lo);
  if (q.max !== undefined) hi = Math.min(q.max, hi);
  const r = (x) => +x.toPrecision(5);
  return [r(lo), r(hi)];
}

export const drivenOps = (formula) => new Set(((formula && formula.drive && formula.drive.bind) || []).map((b) => splitTarget(b.to).path));
