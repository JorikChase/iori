// The JIT: a formula compiled into its own WGSL `iterate` — the same orbit as the interpreter
// (gpu/wgsl.js opFwd), statement for statement, with the op types and the schedule unrolled and no
// switch on opcodes. Two kinds:
//   literal    every parameter a literal too: the fastest, but one compile per set of values
//   structure  parameters read from the op buffer (through rec(), so lens overrides still apply):
//              one compile per structure (ops, schedule, iterations) serves every value — live
//              editing, drift, walks, and every frame of a video
// test/parity.html diffs both against the interpreter.

import { normalize, pullSafe, mixKids } from '../core/formula.js';
import { isMix } from '../core/ops.js';
import { slotIndex } from '../core/notation.js';
import { rotationXYZ, rotation4, lift4, normalize as nrm } from '../core/vec.js';
import { driveBinds, drives, DRIVE_TYPE } from './pack.js';
import { perIteration, colourDrivers, ORBIT } from '../core/drive.js';

const L = (x) => {
  if (!Number.isFinite(x)) throw new Error('non-finite literal');
  const s = Math.fround(x).toPrecision(9);
  return /[.e]/.test(s) ? s : s + '.0';
};
const V = (a) => `vec${a.length}f(${a.map(L).join(', ')})`;

// one op as WGSL statements on `p` (vec4f), `t.dr`, `br`, reading its packed record from the buffer
function opCodeBuffered(o, oi) {
  const a = `rec(${oi}u, 0u)`, b = `rec(${oi}u, 1u)`;
  switch (o.op) {
    case 'translate': return `{ let A = ${a}; p = p + vec4f(A.yzw, ${b}.x); }`;
    case 'scale': return `{ let s = ${a}.y; p = p * s; t.dr = t.dr * abs(s); }`;
    case 'rotate': case 'rotate4': return `p = p * rowsOf(${oi}u);`;
    case 'fold.plane': return `{ let A = ${a}; let B = ${b}; let n = vec4f(A.yzw, B.x); let d = dot(p, n) - B.y; if (d < 0.0) { p = p - 2.0 * d * n; br = 1u; } }`;
    case 'fold.box': return `{ let l = ${a}.y;
      br = select(0u, 1u, p.x > l) + select(0u, 2u, p.x < -l) + select(0u, 3u, p.y > l) + select(0u, 6u, p.y < -l) + select(0u, 9u, p.z > l) + select(0u, 18u, p.z < -l) + select(0u, 27u, p.w > l) + select(0u, 54u, p.w < -l);
      p = clamp(p, vec4f(-l), vec4f(l)) * 2.0 - p; }`;
    case 'fold.sphere': return `{ let A = ${a}; let r2 = dot(p, p); let m2 = A.y * A.y; let f2 = A.z * A.z;
      if (r2 < m2) { let k = f2 / m2; p = p * k; t.dr = t.dr * k; }
      else if (r2 < f2) { let k = f2 / r2; p = p * k; t.dr = t.dr * k; br = 1u; }
      else { br = 2u; } }`;
    case 'bulb': return bulbCode(`${a}.y`);
    case 'bulb4': return `{ let n = ${a}.y; let r = length(p); if (r > 0.0) { t.dr = t.dr * n * pow(r, n - 1.0); p = bulb4(p, n); } else { t.dr = 0.0; } }`;
    case 'power': return powerCode(`${a}.y`);
    case 'twist': return `{ let ang = ${a}.y * p.z; p = vec4f(cos(ang) * p.x - sin(ang) * p.y, sin(ang) * p.x + cos(ang) * p.y, p.z, p.w); }`;
    // the rest have no parameters: the literal code is the same code
    default: return opCode(o, oi);
  }
}

const bulbCode = (n) => `{ let n = ${n}; let r = length(p.xyz);
      if (r > 0.0) {
        let theta = acos(clamp(p.z / r, -1.0, 1.0)) * n;
        let phi = atan2(p.y, p.x) * n;
        t.dr = t.dr * n * pow(r, n - 1.0);
        p = vec4f(pow(r, n) * vec3f(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta)), p.w);
      } else { t.dr = 0.0; } }`;
const powerCode = (n) => `{ let n = ${n}; let r = length(p.xy);
      if (r > 0.0) {
        let ang = atan2(p.y, p.x) * n;
        t.dr = t.dr * n * pow(r, n - 1.0);
        p = vec4f(pow(r, n) * cos(ang), pow(r, n) * sin(ang), p.z, p.w);
      } else { t.dr = 0.0; } }`;

// one op as WGSL statements on `p` (vec4f), `t.dr`, `br`; oi is its index (for the branch colour)
function opCode(o, oi) {
  const P = o.p;
  switch (o.op) {
    case 'translate': return `p = p + ${V([P.x, P.y, P.z, P.w])};`;
    case '+c': return 'p = p + c; t.dr = t.dr + 1.0;';
    case 'scale': return `p = p * ${L(P.s)}; t.dr = t.dr * ${L(Math.abs(P.s))};`;
    case 'rotate': case 'rotate4': {
      const R = o.op === 'rotate' ? lift4(rotationXYZ(P.x, P.y, P.z)) : rotation4([P.xy, P.xz, P.xw, P.yz, P.yw, P.zw]);
      return `p = vec4f(${[0, 1, 2, 3].map((i) => `dot(${V(R.slice(i * 4, i * 4 + 4))}, p)`).join(', ')});`;
    }
    case 'fold.plane': {
      const n = V(nrm([P.nx, P.ny, P.nz, P.nw]));
      return `{ let d = dot(p, ${n}) - ${L(P.d)}; if (d < 0.0) { p = p - 2.0 * d * ${n}; br = 1u; } }`;
    }
    case 'fold.box': {
      const l = L(P.l);
      return `br = select(0u, 1u, p.x > ${l}) + select(0u, 2u, p.x < -${l}) + select(0u, 3u, p.y > ${l}) + select(0u, 6u, p.y < -${l}) + select(0u, 9u, p.z > ${l}) + select(0u, 18u, p.z < -${l}) + select(0u, 27u, p.w > ${l}) + select(0u, 54u, p.w < -${l});
      p = clamp(p, vec4f(-${l}), vec4f(${l})) * 2.0 - p;`;
    }
    case 'fold.sphere': {
      const m2 = P.rmin * P.rmin, f2 = P.rfix * P.rfix;
      return `{ let r2 = dot(p, p);
      if (r2 < ${L(m2)}) { let k = ${L(f2)} / ${L(m2)}; p = p * k; t.dr = t.dr * k; }
      else if (r2 < ${L(f2)}) { let k = ${L(f2)} / r2; p = p * k; t.dr = t.dr * k; br = 1u; }
      else { br = 2u; } }`;
    }
    case 'abs': return 'br = select(0u, 1u, p.x < 0.0) + select(0u, 2u, p.y < 0.0) + select(0u, 4u, p.z < 0.0) + select(0u, 8u, p.w < 0.0); p = abs(p);';
    case 'sort': return `{ var x = p.xyz;
      if (x.x < x.y) { x = x.yxz; br = br + 1u; }
      if (x.y < x.z) { x = x.xzy; br = br + 2u; }
      if (x.x < x.y) { x = x.yxz; br = br + 4u; }
      p = vec4f(x, p.w); }`;
    case 'sort4': return `{ var x = p;
      if (x.x < x.y) { x = x.yxzw; br = br + 1u; }
      if (x.z < x.w) { x = x.xywz; br = br + 2u; }
      if (x.x < x.z) { x = x.zyxw; br = br + 4u; }
      if (x.y < x.w) { x = x.xwzy; br = br + 8u; }
      if (x.y < x.z) { x = x.xzyw; br = br + 16u; }
      p = x; }`;
    case 'bulb': return bulbCode(L(P.n));
    case 'bulb4': return `{ let r = length(p); if (r > 0.0) { t.dr = t.dr * ${L(P.n)} * pow(r, ${L(P.n - 1)}); p = bulb4(p, ${L(P.n)}); } else { t.dr = 0.0; } }`;
    case 'power': return powerCode(L(P.n));
    case 'quat': return 't.dr = t.dr * 2.0 * length(p); p = vec4f(p.x * p.x - dot(p.yzw, p.yzw), 2.0 * p.x * p.yzw);';
    case 'invert': return '{ let r2 = dot(p, p); if (r2 > 0.0) { p = p / r2; t.dr = t.dr / r2; } }';
    case 'twist': return `{ let ang = ${L((P.a * Math.PI) / 180)} * p.z; p = vec4f(cos(ang) * p.x - sin(ang) * p.y, sin(ang) * p.x + cos(ang) * p.y, p.z, p.w); }`;
    case 'spherical': return '{ let r2 = dot(p.xy, p.xy); if (r2 > 0.0) { p = vec4f(p.xy / r2, p.zw); t.dr = t.dr / r2; } }';
    case 'swirl': return '{ let r2 = dot(p.xy, p.xy); p = vec4f(p.x * sin(r2) - p.y * cos(r2), p.x * cos(r2) + p.y * sin(r2), p.z, p.w); }';
    case 'sin': return 'p = vec4f(sin(p.x), sin(p.y), p.z, p.w);';
    case 'horseshoe': return '{ let r = length(p.xy); if (r > 0.0) { p = vec4f((p.x - p.y) * (p.x + p.y) / r, 2.0 * p.x * p.y / r, p.z, p.w); } }';
    case 'polar': return 'p = vec4f(atan2(p.x, p.y) / PI, length(p.xy) - 1.0, p.z, p.w);';
    // a mix is unrolled by jitIterate, which knows its sub-stacks
    default: throw new Error(`no JIT for ${o.op}`);
  }
}

// the chimera inline: every species unrolled on a copy of (p, dr), blended as mixCombine (gpu/wgsl.js)
// blends, by the weights fieldAtF reads from the record (one path for both kinds: a literal JIT runs only
// while the buffer holds its values). The species count is the structure's, so each species' result is
// a register of its own rather than an entry of a private array (an array passed by value spilled).
// The species' branches are not coloured; the mix colours by the leading species, as the interpreter does.
function mixCode(oi, kids) {
  const K = kids.length, ks = kids.map((_, i) => i), w = (i) => `fw.${i < 4 ? 'lo' : 'hi'}.${'xyzw'[i & 3]}`;
  return `{ let pm = p; let drm = t.dr;
${kids.map((code, i) => `${code}
      let kp${i} = p; let kd${i} = t.dr; p = pm; t.dr = drm;`).join('\n')}
      let fw = fieldAtF(${oi}u, pm, drm, rec(${oi}u, 0u).z > 0.5);
      p = vec4f(0.0)${ks.map((i) => ` + ${w(i)} * kp${i}`).join('')};
      t.dr = 0.0${ks.map((i) => ` + ${w(i)} * kd${i}`).join('')};
      var lead = 0u;
${ks.slice(1).map((i) => `      if (${w(i)} > mfAt(fw, lead)) { lead = ${i}u; }`).join('\n')}
      br = 1u + lead; t.sp = f32(lead) / ${L(Math.max(K - 1, 1))}; }`;
}

// The drive program inline (gpu/wgsl.js driveIter, statement for statement): the nodes and the bindings'
// values are registers of the iterate, each node's code chosen by its type — the first iteration computes
// every node (the fields among them: once per orbit), the later ones only the per-iteration nodes and
// the bindings they feed, and a driven op's record is its packed row plus each
// binding's term, written out (drvRec's sum, in its order). The interpreter walks the node table through
// dynamically indexed private arrays every iteration and every record read: ×10–15 a march step.
// Not inlined (null: the generic path): a binding that rebuilds a rotation or a plane fold (drvNL), or
// one on a chimera's own record (its field reads rec()).
const REBUILT = new Set(['rotate', 'rotate4', 'fold.plane']);
function driveInline(f, opIndex) {
  if (!drives(f)) return null;
  const d = f.drive, binds = driveBinds(f), per = perIteration(d);
  if (binds.some((x) => REBUILT.has(x.t.o.op) || isMix(x.t.o.op))) return null;
  const at = new Map(d.nodes.map((m, i) => [m.id, i]));
  const live = binds.some((x) => per.has(x.b.from)) || colourDrivers(f).some((id) => per.has(id));
  const N = d.nodes.length, B = binds.length, R = (k) => `DR_BINDS + ${k * 10}u`;
  const readings = { i: 'f32(i) / f32(head.iters)', r: 'length(p)', trap: 'fTrap', lyap: 'log(max(t.dr, 1e-30)) / (f32(i) + 1.0)', px: 'p.x', py: 'p.y', pz: 'p.z', pw: 'p.w' };
  const input = (m, k) => (m.in[k] != null && at.has(m.in[k]) ? `dn${at.get(m.in[k])}` : null);
  const nodeCode = (m, i) => {
    if (ORBIT.includes(m.type)) return `dn${i} = ${readings[m.type]};`;
    const x = input(m, 'a');
    if (m.type === 'math') {
      const y = input(m, 'b');
      return `{ var x = 0.0;${x ? ` x = ${x};` : ''} var y = drvP(${i}u, 1u);${y ? ` y = ${y};` : ''} dn${i} = shMath(u32(drvP(${i}u, 0u)), x, y); }`;
    }
    if (m.type === 'remap') {
      return `{ var x = 0.0;${x ? ` x = ${x};` : ''} var d = drvP(${i}u, 1u) - drvP(${i}u, 0u); if (d == 0.0) { d = 1e-12; }
        let v = (x - drvP(${i}u, 0u)) / d; dn${i} = select(v, clamp(v, 0.0, 1.0), drvP(${i}u, 2u) > 0.5); }`;
    }
    throw new Error(`a per-iteration ${m.type} node`);
  };
  // the first iteration: every node in order, its type a literal (the interpreter's switches fold away)
  const firstCode = (m, i) => {
    const ty = DRIVE_TYPE[m.type];
    if (ORBIT.includes(m.type) || m.type === 'math' || m.type === 'remap') return nodeCode(m, i);
    if (ty >= 13 && ty <= 16) return `dn${i} = drvField(${i}u, ${ty}u, drvStart).v;`;
    return `dn${i} = drvScalar(${i}u, vec4f(${ty}.0, -1.0, -1.0, 0.0), rd0);`;
  };
  const perNodes = d.nodes.map((m, i) => [m, i]).filter(([m]) => per.has(m.id));
  const perBinds = binds.map((x, k) => [x, k]).filter(([x]) => per.has(x.b.from));
  const lines = (n, fn) => [...Array(n).keys()].map(fn).join('\n');
  const decl = `${lines(N, (i) => `  var dn${i} = 0.0;`)}\n${lines(B, (k) => `  var dv${k} = 0.0;`)}\n  var rd0: DrvRead;\n`;
  const iter = `    if (DRIVE_ON && drvAny) {
      if (i == 0u) {
${d.nodes.map((m, i) => '        ' + firstCode(m, i)).join('\n')}
${lines(B, (k) => `        { let B = ops[${R(k)}]; let C = ops[${R(k)} + 1u]; dv${k} = clamp(B.z + dn${binds[k].from} * (B.w - B.z), C.y, C.z); }`)}
        drvFirst = false;
      }${live ? ` else {
${perNodes.map(([m, i]) => '        ' + nodeCode(m, i)).join('\n')}
${perBinds.map(([x, k]) => `        { let B = ops[${R(k)}]; let C = ops[${R(k)} + 1u]; dv${k} = clamp(B.z + dn${x.from} * (B.w - B.z), C.y, C.z); }`).join('\n')}
      }` : ''}
    }
`;
  // after the orbit: the registers where the shading and the readers of drvReg find them
  const end = `  if (DRIVE_ON && drvAny) {\n${lines(N, (i) => `    drvReg[${i}] = dn${i};`)}\n  }\n`;
  // a driven op's row k: packed + Σ (value − own) · d row / dθ over its bindings, then the overrides
  const byOp = new Map();
  binds.forEach((x, k) => { const oi = opIndex.get(x.t.o); byOp.set(oi, [...(byOp.get(oi) || []), k]); });
  const recOf = (oi, k) => `recOv(${oi}u, ${k}u, ops[${oi * 5 + k}u]${byOp.get(oi).map((b) => ` + (dv${b} - ops[${R(b)} + 1u].x) * ops[${R(b)} + ${3 + k}u]`).join('')})`;
  const rewrite = (code, oi) => (byOp.has(oi) ? code.replace(new RegExp(`rec\\(${oi}u, (\\d)u\\)`, 'g'), (_, k) => recOf(oi, +k)) : code);
  return { decl, iter, end, rewrite };
}

// the drive program's shape, which an inlined drive bakes into a structure JIT
const driveShape = (f) => {
  if (!drives(f)) return null;
  const d = f.drive, per = perIteration(d), at = new Map(d.nodes.map((m, i) => [m.id, i]));
  return [d.nodes.map((m) => [m.type, at.get(m.in.a) ?? -1, at.get(m.in.b) ?? -1, per.has(m.id)]), driveBinds(f).map((x) => [x.t.o.op, x.from]), colourDrivers(f).length];
};

// the WGSL `iterate` for one formula, replacing the interpreter's. kind: 'literal' | 'structure'
// Drivers (gpu/wgsl.js DRIVE): every iteration starts with driveIter, and a driven op reads its record
// through rec() — live, in the literal kind too (its other ops stay literals)
export function jitIterate(formula, kind = 'literal') {
  const f = normalize(formula);
  const driven = new Set(driveBinds(f).map((x) => x.t.o));
  // every op's index in the flat op table, slot by slot
  const base = [], opIndex = new Map();
  f.slots.reduce((n, s, si) => { base[si] = n; s.forEach((o, j) => opIndex.set(o, n + j)); return n + s.length; }, 0);
  const DI = driveInline(f, opIndex);
  const gen0 = kind === 'structure' ? opCodeBuffered : (o, oi) => (driven.has(o) ? opCodeBuffered(o, oi) : opCode(o, oi));
  const gen = DI ? (o, oi) => DI.rewrite(gen0(o, oi), oi) : gen0;
  const kidsOf = new Map(mixKids(f).mixes.map((m) => [`${m.si}.${m.j}`, m.kids]));
  const bare = (si) => f.slots[si].map((o, j) => '      ' + gen(o, base[si] + j)).join('\n');
  const slots = f.slots.map((s, si) => s.map((o, j) => {
    const oi = base[si] + j;
    const kids = kidsOf.get(`${si}.${j}`);
    const code = kids ? mixCode(oi, kids.map(bare)) : gen(o, oi);
    const branchy = /br =|br = br/.test(code);
    const line = branchy
      ? `br = 0u; ${code}\n      if (br != 0u) { t.col = branchColour(t.col, ${oi}u, br); }`
      : code;
    return '      ' + line;
  }).join('\n'));
  const sched = [...f.schedule].map(slotIndex);
  const body = sched.length === 1 || new Set(sched).size === 1
    ? slots[sched[0]]
    : `    switch (i % ${sched.length}u) {\n${sched.map((s, k) => `      case ${k}u: {\n${slots[s]}\n      }`).join('\n')}\n      default: {}\n    }`;
  return `
fn iterate(p0: vec4f, c: vec4f) -> Trace {
  var t: Trace;
  t.p = p0; t.dr = 1.0; t.n = 0u; t.escaped = false; t.trap = 1e20; t.col = 0.0;
  var p = p0;
  var br = 0u;
${DI ? DI.decl : ''}  startOrbit(p0);
  for (var i = 0u; i < ${f.iters}u; i++) {
    fIter = f32(i);
${DI ? DI.iter : drives(f) ? '    if (DRIVE_ON && drvAny) { driveIter(p, t.dr, i, f32(head.iters)); }\n' : ''}${body}
    t.n = i + 1u;
    let r2 = dot(p, p);
    t.trap = min(t.trap, r2);
    fTrap = min(fTrap, r2);
    if (!(r2 <= ${kind === 'structure' ? 'head.bail * head.bail' : L(f.bail * f.bail)})) { t.escaped = true; break; }
  }
  t.p = p;
${DI ? DI.end : ''}  return t;
}
`;
}

// a shader source with the interpreter's iterate renamed out of the way and the JIT's in its place;
// everything else (de, deOf, the dual numbers, which still read the op table) is untouched
const SIG = 'fn iterate(p0: vec4f, c: vec4f) -> Trace {';
export function withJit(source, formula, kind = 'literal') {
  if (!source.includes(SIG)) throw new Error('no interpreter iterate to replace');
  return source.replace(SIG, 'fn iterateInterpreted(p0: vec4f, c: vec4f) -> Trace {') + jitIterate(formula, kind);
}

// what a structure JIT depends on: the ops in order, the schedule, the iteration count, and the drive
// program's shape (its node types and wiring, its bindings' targets: driveInline bakes them in)
export function structureKey(formula) {
  const f = normalize(formula);
  return JSON.stringify([f.slots.map((s) => s.map((o) => o.op)), f.schedule, f.iters, drives(f), driveShape(f)]);
}

export { pullSafe };
