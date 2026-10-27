// Edits of a formula's shading network (core/shade.js), for the graph's shading frame. Each takes a
// formula and returns a new normalised one, or throws when the result would not be valid: nodes are
// kept in topological order (an input names an earlier node), ports are type-checked, cycles refused.
//
//   shadeOn / shadeOff        a starting network (today's look as a graph) / none
//   addNode(f, type, at)      a new node; at = { node, port } inserts it on that input's link (or on an
//                             output: node 'out', port 'color' | 'glow'), taking the old source as its
//                             own input where the kinds allow
//   connect(f, from, to, port)    a link from a node's output to an input (or to 'out'.color / .glow)
//   disconnect(f, to, port)   an optional input (math.b, mixc.f, out.glow) left unconnected
//   removeNode(f, id)         a node out; what it fed takes its own input instead (a bypass)
//   setNodeParam(f, id, key, v)   key may be a path: 'map.scale'
//   addStop / moveStop / removeStop / setStopColour, setRamp (interp, space, map mode, log, invert),
//   applyPreset(f, id, name)

import { normalize, validate } from './formula.js';
import { normShade, validateShade, kindOf, READINGS, defaultShade, rampPreset, rampAt, MAX_STOPS } from './shade.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const PORTS = { ramp: ['v'], math: ['a', 'b'], mixc: ['a', 'b', 'f'] };
const PORT_KIND = { ramp: { v: 'number' }, math: { a: 'number', b: 'number' }, mixc: { a: 'colour', b: 'colour', f: 'number' } };
const OPTIONAL = { math: ['b'], mixc: ['f'] };
export const SHADE_TYPES = [...READINGS, 'ramp', 'math', 'mixc'];
export const inputKind = (type, port) => (PORT_KIND[type] || {})[port] || null;
// what an input wants: a node's port kind, 'colour' for the colour output, null (anything) for glow
export function wantsAt(formula, at) {
  const s = normalize(formula).shade;
  if (!s || !at) return null;
  if (at.node === 'out') return at.port === 'color' ? 'colour' : null;
  const n = s.nodes.find((q) => q.id === at.node);
  return n ? inputKind(n.type, at.port) : null;
}
export const portsOf = (type) => PORTS[type] || [];

// nodes in an order where every input comes earlier; throws on a cycle
function topo(s) {
  const byId = new Map(s.nodes.map((n) => [n.id, n]));
  const out = [], state = new Map();
  const visit = (n) => {
    if (state.get(n.id) === 2) return;
    if (state.get(n.id) === 1) throw new Error('shade: that would make a loop');
    state.set(n.id, 1);
    for (const ref of Object.values(n.in || {})) { const m = byId.get(ref); if (m) visit(m); }
    state.set(n.id, 2);
    out.push(n);
  };
  s.nodes.forEach(visit);
  s.nodes = out;
  return s;
}

function edit(formula, fn) {
  const f = clone(normalize(formula));
  if (!f.shade) throw new Error('shade: the formula has no shading yet');
  const s = clone(f.shade);
  fn(s);
  topo(s);
  const errs = validateShade(s);
  if (errs.length) throw new Error(errs.join('; '));
  f.shade = normShade(s);
  const v = validate(f);
  if (!v.ok) throw new Error(v.errors.join('; '));
  return normalize(f);
}

const nodeOf = (s, id) => {
  const n = s.nodes.find((q) => q.id === id);
  if (!n) throw new Error(`shade: no node ${id}`);
  return n;
};
const newId = (s, type) => { let k = 0; while (s.nodes.some((n) => n.id === `${type}${k}`)) k++; return `${type}${k}`; };

// a fresh node of a type with its starting parameters
function freshNode(s, type) {
  const id = newId(s, type);
  if (READINGS.includes(type)) return { id, type, in: {}, p: {} };
  if (type === 'ramp') return { id, type, in: {}, p: { stops: [{ t: 0, c: [0, 0, 0, 1] }, { t: 1, c: [1, 1, 1, 1] }], interp: 'linear', space: 'oklab', map: { scale: 1, offset: 0, mode: 'clamp', log: false, invert: false } } };
  // math: × 1 and mix: half of a colour with itself — nothing changes where they are inserted
  if (type === 'math') return { id, type, in: {}, p: { op: 'mul', c: 1 } };
  if (type === 'mixc') return { id, type, in: {}, p: { mode: 'mix', f: 0.5 } };
  throw new Error(`shade: unknown node type ${type}`);
}

const kindOfId = (s, id) => { const n = s.nodes.find((q) => q.id === id); return n ? kindOf(n.type) : null; };
// what an input expects: a node's port, or the outputs (colour for color; anything for glow)
const wants = (s, to, port) => (to === 'out' ? (port === 'color' ? 'colour' : null) : inputKind(nodeOf(s, to).type, port));
const setLink = (s, to, port, from) => { if (to === 'out') s.out[port] = from; else nodeOf(s, to).in[port] = from; };
const linkOf = (s, to, port) => (to === 'out' ? s.out[port] : nodeOf(s, to).in[port]);

export function shadeOn(formula) {
  const f = clone(normalize(formula));
  if (f.shade) return normalize(f);
  f.shade = defaultShade();
  return normalize(f);
}
export function shadeOff(formula) {
  const f = clone(normalize(formula));
  delete f.shade;
  return normalize(f);
}

// the id a new node will get (the UI selects it after adding)
export const nextId = (formula, type) => newId(normalize(formula).shade || { nodes: [] }, type);

export function addNode(formula, type, at = null) {
  return edit(formula, (s) => {
    const n = freshNode(s, type);
    s.nodes.push(n);
    // required inputs nothing else feeds take the first source of their kind (the fold index for a
    // number, the surface colour for a colour) until they are wired otherwise
    const fill = () => {
      for (const port of portsOf(type)) {
        if ((OPTIONAL[type] || []).includes(port) || n.in[port] != null) continue;
        const kind = inputKind(type, port);
        let src = kind === 'colour' ? s.out.color : (s.nodes.find((q) => q.type === 'col') || {}).id;
        if (src == null && kind === 'number') { const c = freshNode(s, 'col'); s.nodes.unshift(c); src = c.id; }
        n.in[port] = src;
      }
    };
    if (!at) { fill(); return; }
    const want = wants(s, at.node, at.port), old = linkOf(s, at.node, at.port);
    const kind = kindOf(type);
    if (want && want !== kind) throw new Error(`shade: a ${type} gives a ${kind}, that input wants a ${want}`);
    // the old source becomes the new node's first input of its kind
    if (old != null) {
      const oldKind = kindOfId(s, old);
      const port = portsOf(type).find((q) => inputKind(type, q) === oldKind);
      if (port) n.in[port] = old;
    }
    // a mix needs two colours: the old one twice (half of a colour with itself)
    if (type === 'mixc' && n.in.a != null && n.in.b == null) n.in.b = n.in.a;
    fill();
    setLink(s, at.node, at.port, n.id);
  });
}

export function connect(formula, from, to, port) {
  return edit(formula, (s) => {
    nodeOf(s, from);
    const want = wants(s, to, port), kind = kindOfId(s, from);
    if (to !== 'out' && !portsOf(nodeOf(s, to).type).includes(port)) throw new Error(`shade: ${to} has no input ${port}`);
    if (to === 'out' && port !== 'color' && port !== 'glow') throw new Error('shade: the outputs are color and glow');
    if (want && want !== kind) throw new Error(`shade: ${port} wants a ${want}, ${from} gives a ${kind}`);
    if (from === to) throw new Error('shade: that would make a loop');
    setLink(s, to, port, from);
  });
}

export function disconnect(formula, to, port) {
  return edit(formula, (s) => {
    if (to === 'out') { if (port !== 'glow') throw new Error('shade: the colour output stays connected'); delete s.out.glow; return; }
    const n = nodeOf(s, to);
    if (!(OPTIONAL[n.type] || []).includes(port)) throw new Error(`shade: ${to}.${port} stays connected`);
    delete n.in[port];
  });
}

export function removeNode(formula, id) {
  return edit(formula, (s) => {
    const n = nodeOf(s, id), kind = kindOf(n.type);
    // its own first input of its own kind takes its place downstream
    const through = portsOf(n.type).map((q) => n.in[q]).find((ref) => ref != null && kindOfId(s, ref) === kind) ?? null;
    s.nodes = s.nodes.filter((q) => q.id !== id);
    for (const q of s.nodes) for (const [port, ref] of Object.entries(q.in)) {
      if (ref !== id) continue;
      if (through != null) q.in[port] = through;
      else if ((OPTIONAL[q.type] || []).includes(port)) delete q.in[port];
      else throw new Error(`shade: ${q.id}.${port} would be left unconnected`);
    }
    if (s.out.color === id) { if (through == null) throw new Error('shade: the colour output would be left unconnected'); s.out.color = through; }
    if (s.out.glow === id) { if (through != null) s.out.glow = through; else delete s.out.glow; }
  });
}

export function setNodeParam(formula, id, key, value) {
  return edit(formula, (s) => {
    const n = nodeOf(s, id), path = key.split('.');
    let o = n.p;
    for (const k of path.slice(0, -1)) o = o[k];
    if (!(path.at(-1) in o)) throw new Error(`shade: ${n.type} has no ${key}`);
    o[path.at(-1)] = value;
  });
}

// the ramp's own colour at t (its stops, without the input mapping)
export function rampColourAt(p, t) {
  return rampAt({ ...p, map: { scale: 1, offset: 0, mode: 'clamp', log: false, invert: false } }, t);
}

export function addStop(formula, id, t) {
  return edit(formula, (s) => {
    const n = nodeOf(s, id);
    if (n.type !== 'ramp') throw new Error(`shade: ${id} is not a ramp`);
    if (n.p.stops.length >= MAX_STOPS) throw new Error(`shade: a ramp holds at most ${MAX_STOPS} stops`);
    const tt = Math.min(1, Math.max(0, t));
    n.p.stops.push({ t: +tt.toFixed(4), c: rampColourAt(n.p, tt).map((x) => +x.toFixed(4)) });
  });
}
// stops are kept sorted by t: the index of a stop after an edit is where its t now sorts
export const stopIndex = (formula, id, t, c) => {
  const st = normalize(formula).shade.nodes.find((n) => n.id === id).p.stops;
  let best = 0, bd = Infinity;
  st.forEach((q, i) => { const d = Math.abs(q.t - t) + (c ? q.c.reduce((a, x, k) => a + Math.abs(x - c[k]), 0) * 1e-3 : 0); if (d < bd) { bd = d; best = i; } });
  return best;
};
export function moveStop(formula, id, i, t) {
  return edit(formula, (s) => { const st = nodeOf(s, id).p.stops; if (!st[i]) throw new Error('shade: no such stop'); st[i].t = +Math.min(1, Math.max(0, t)).toFixed(4); });
}
export function removeStop(formula, id, i) {
  return edit(formula, (s) => { const st = nodeOf(s, id).p.stops; if (st.length < 2) throw new Error('shade: a ramp keeps one stop'); st.splice(i, 1); });
}
export function setStopColour(formula, id, i, c) {
  return edit(formula, (s) => { const st = nodeOf(s, id).p.stops; if (!st[i]) throw new Error('shade: no such stop'); st[i].c = [0, 1, 2, 3].map((k) => +Math.min(1, Math.max(0, c[k] ?? 1)).toFixed(4)); });
}
// interp, space, map.mode, map.log, map.invert
export function setRamp(formula, id, key, value) {
  return setNodeParam(formula, id, key, value);
}
export function applyPreset(formula, id, name) {
  return edit(formula, (s) => { const n = nodeOf(s, id); if (n.type !== 'ramp') throw new Error(`shade: ${id} is not a ramp`); n.p = rampPreset(name); });
}
