// The JIT: a formula compiled into its own WGSL `iterate` — the same orbit as the interpreter
// (gpu/wgsl.js opFwd), statement for statement, with the op types and the schedule unrolled and no
// switch on opcodes. Two kinds:
//   literal    every parameter a literal too: the fastest, but one compile per set of values
//   structure  parameters read from the op buffer (through rec(), so lens overrides still apply):
//              one compile per structure (ops, schedule, iterations) serves every value — live
//              editing, drift, walks, and every frame of a video
// test/parity.html diffs both against the interpreter.

import { normalize, pullSafe, mixKids, seedOf } from '../core/formula.js';
import { isMix } from '../core/ops.js';
import { slotIndex } from '../core/notation.js';
import { rotationXYZ, rotation4, lift4, normalize as nrm } from '../core/vec.js';
import { driveBinds, drives, DRIVE_TYPE, pack, REC } from './pack.js';
import { perIteration, colourDrivers, ORBIT } from '../core/drive.js';

const L = (x) => {
  if (!Number.isFinite(x)) throw new Error('non-finite literal');
  const s = Math.fround(x).toPrecision(9);
  return /[.e]/.test(s) ? s : s + '.0';
};
const V = (a) => `vec${a.length}f(${a.map(L).join(', ')})`;
const REC_VEC = REC / 4;

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
    case 'fold.cell': return cellCode(`vec4f(${a}.yzw, ${b}.x)`);
    case 'wrap': return wrapCode(`vec4f(${a}.yzw, ${b}.x)`);
    case 'kleinian': return kleinCode(a, b);
    case 'fold.mandalay': return mandalayCode(`${a}.y`, `${a}.z`);
    case 'bulb': return bulbCode(`${a}.y`);
    case 'bulb4': return `{ let n = ${a}.y; let r = length(p); if (r > 0.0) { t.dr = t.dr * n * pow(r, n - 1.0); p = bulb4(p, n); } else { t.dr = 0.0; } }`;
    case 'power': return powerCode(`${a}.y`);
    case 'twist': return `{ let ang = ${a}.y * p.z; p = vec4f(cos(ang) * p.x - sin(ang) * p.y, sin(ang) * p.x + cos(ang) * p.y, p.z, p.w); }`;
    // the rest have no parameters: the literal code is the same code
    default: return opCode(o, oi);
  }
}

const cellCode = (l) => `{ let l = ${l};
      br = select(0u, 1u, p.x > l.x) + select(0u, 2u, p.x < -l.x) + select(0u, 3u, p.y > l.y) + select(0u, 6u, p.y < -l.y) + select(0u, 9u, p.z > l.z) + select(0u, 18u, p.z < -l.z) + select(0u, 27u, p.w > l.w) + select(0u, 54u, p.w < -l.w);
      p = clamp(p, -l, l) * 2.0 - p; }`;
const wrapCode = (l) => `{ let l = ${l}; let m = select(vec4f(0.0), floor(p / (2.0 * max(l, vec4f(1e-30))) + 0.5), l > vec4f(0.0));
      br = select(0u, 1u, m.x != 0.0) + select(0u, 2u, m.y != 0.0) + select(0u, 4u, m.z != 0.0) + select(0u, 8u, m.w != 0.0);
      p = p - 2.0 * l * m; }`;
const kleinCode = (a, b) => `{ let A = ${a}; let bz = ${b}.x; var x = p.xyz;
      x.x = x.x - 2.0 * A.w * floor((x.x + A.z / A.y * x.y + A.w) / (2.0 * A.w));
      x.z = x.z - 2.0 * bz * floor((x.z + bz) / (2.0 * bz));
      x.y = x.y - A.y * floor(x.y / A.y);
      br = 2u;
      if (x.y >= kleinLine(x.x, A)) { x = vec3f(-A.z, A.y, 0.0) - x; br = 1u; }
      let k = 1.0 / dot(x, x); t.dr = t.dr * k;
      p = vec4f(-A.z + k * x.x, A.y - k * x.y, -k * x.z, p.w); }`;
const mandalayCode = (fo, g) => `{ let o = mandalay(p, ${fo}, ${g});
      br = select(0u, 1u, o.x != p.x) + select(0u, 2u, o.y != p.y) + select(0u, 4u, o.z != p.z); p = o; }`;

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
    case 'fold.cell': return cellCode(V([P.lx, P.ly, P.lz, P.lw]));
    case 'wrap': return wrapCode(V([P.lx, P.ly, P.lz, P.lw]));
    case 'kleinian': return kleinCode(V([0, P.a, P.b, P.bx]), V([P.bz, 0]));
    case 'fold.mandalay': return mandalayCode(L(P.fo), L(P.g));
    // the estimate reads a seed at the orbit's end; in the orbit it is nothing
    case 'seed.slab': case 'seed.sphere': case 'seed.pillar': return '';
    case 'fold.sphere': {
      const m2 = P.rmin * P.rmin, f2 = P.rfix * P.rfix;
      // (a constant division by zero would not compile)
      if (m2 === 0) return `{ let r2 = dot(p, p);
      if (r2 < ${L(f2)}) { let k = ${L(f2)} / r2; p = p * k; t.dr = t.dr * k; br = 1u; }
      else { br = 2u; } }`;
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
  // (and, for a seed read at the orbit's end through rec(), the bindings' values)
  const end = `  if (DRIVE_ON && drvAny) {\n${lines(N, (i) => `    drvReg[${i}] = dn${i};`)}\n${seedOf(f) ? lines(B, (k) => `    drvV[${k}] = dv${k};`) : ''}\n  }\n`;
  // a driven op's row k: packed + Σ (value − own) · d row / dθ over its bindings, then the overrides
  const byOp = new Map();
  binds.forEach((x, k) => { const oi = opIndex.get(x.t.o); byOp.set(oi, [...(byOp.get(oi) || []), k]); });
  const recOf = (oi, k) => `recOv(${oi}u, ${k}u, ops[${oi * 5 + k}u]${byOp.get(oi).map((b) => ` + (dv${b} - ops[${R(b)} + 1u].x) * ops[${R(b)} + ${3 + k}u]`).join('')})`;
  const rewrite = (code, oi) => (byOp.has(oi) ? code.replace(new RegExp(`rec\\(${oi}u, (\\d)u\\)`, 'g'), (_, k) => recOf(oi, +k)) : code);
  return { decl, iter, end, rewrite, N, binds, byOp, R, live, perNodes, perBinds, firstCode, nodeCode };
}

// every op's index in the flat op table, slot by slot
function opTable(f) {
  const base = [], opIndex = new Map();
  f.slots.reduce((n, s, si) => { base[si] = n; s.forEach((o, j) => opIndex.set(o, n + j)); return n + s.length; }, 0);
  return { base, opIndex };
}
// the slots' code under the schedule
function scheduled(f, slots) {
  const sched = [...f.schedule].map(slotIndex);
  return sched.length === 1 || new Set(sched).size === 1
    ? slots[sched[0]]
    : `    switch (i % ${sched.length}u) {\n${sched.map((s, k) => `      case ${k}u: {\n${slots[s]}\n      }`).join('\n')}\n      default: {}\n    }`;
}

// the drive program's shape, which an inlined drive bakes into a structure JIT
const driveShape = (f) => {
  if (!drives(f)) return null;
  const d = f.drive, per = perIteration(d), at = new Map(d.nodes.map((m, i) => [m.id, i]));
  return [d.nodes.map((m) => [m.type, at.get(m.in.a) ?? -1, at.get(m.in.b) ?? -1, per.has(m.id)]), driveBinds(f).map((x) => [x.t.o.op, x.from]), colourDrivers(f).length];
};

// ---------- the dual numbers -----------------------------------------------------------------------
// The dual pass compiled for one formula (gpu/wgsl.js iterateDual and opTan, statement for statement, read
// from the same records). One op is one block: what its forward map and its tangents share is computed
// once, the tangent columns follow from it, and a branch that leaves them alone holds no code. The hit only
// reads the gradient and λ, so the selected-parameter column (the sensing pass) and the colour are not here.
// A column: v the tangent, d its dr derivative (λ has none), dc its derivative of c and s its value at the
// orbit's start (only the gradient's).
const GRAD = [0, 1, 2].map((j) => ({ v: `g${j}`, d: `gd${j}`, dc: `dc${j}`, s: `s${j}` }));
const LYAP = { v: 'lv', d: null, dc: null };
const COLS = [...GRAD, LYAP];

// dr's chain rule along column c: k the op's factor, dk the factor's derivative (null: none)
const chain = (c, k, dk) => (c.d ? `${c.d} = ${k} * ${c.d}${dk ? ` + (${dk}) * t.dr` : ''};` : '');
const each = (cols, fn) => cols.map(fn).join('\n      ');
// the power ops' radius and dr factor along a column, with their exponent's motion dn (null: none)
const powDR = (dn) => `(k * drr${dn ? ` + R * lr * ${dn}.y` : ''})`;
const powDk = (dn) => `n * (n - 1.0) * R2 * drr${dn ? ` + R1 * (1.0 + n * lr) * ${dn}.y` : ''}`;

// one op on (p, t.dr) and on every column in cols. R(k): its record's row k as WGSL. E(c, k): how that row
// moves along column c with the op's drivers, or null (undriven, and λ, which holds the drivers still)
function dualOp(o, oi, cols, R, E = () => null) {
  const c4 = (fn) => each(cols, fn);
  const da = (c) => E(c, 0), db = (c) => E(c, 1);
  const sw = (cond, swiz) => `if (${cond}) { x = x.${swiz}; ${c4((c) => `${c.v} = ${c.v}.${swiz.length === 3 ? `${swiz}w` : swiz};`)} }`;
  switch (o.op) {
    case 'translate': return `{ let A = ${R(0)}; ${c4((c) => (da(c) ? `${c.v} = ${c.v} + vec4f(${da(c)}.yzw, ${db(c)}.x);` : ''))} p = p + vec4f(A.yzw, ${R(1)}.x); }`;
    case '+c': return `${c4((c) => (c.dc ? `${c.v} = ${c.v} + ${c.dc};` : ''))} p = p + c; t.dr = t.dr + 1.0;`;
    case 'scale': return `{ let s = ${R(0)}.y; let k = abs(s);
      ${c4((c) => (da(c) ? `${chain(c, 'k', `sign(s) * ${da(c)}.y`)} ${c.v} = s * ${c.v} + ${da(c)}.y * p;` : `${chain(c, 'k')} ${c.v} = s * ${c.v};`))}
      p = p * s; t.dr = t.dr * k; }`;
    case 'rotate': case 'rotate4': return `{ let M = mat4x4f(vec4f(${R(0)}.yzw, ${R(1)}.x), vec4f(${R(1)}.yzw, ${R(2)}.x), vec4f(${R(2)}.yzw, ${R(3)}.x), vec4f(${R(3)}.yzw, ${R(4)}.x));
      ${c4((c) => `${c.v} = ${c.v} * M${da(c) ? ` + p * mat4x4f(vec4f(${E(c, 0)}.yzw, ${E(c, 1)}.x), vec4f(${E(c, 1)}.yzw, ${E(c, 2)}.x), vec4f(${E(c, 2)}.yzw, ${E(c, 3)}.x), vec4f(${E(c, 3)}.yzw, ${E(c, 4)}.x))` : ''};`)}
      p = p * M; }`;
    case 'fold.plane': return `{ let A = ${R(0)}; let B = ${R(1)}; let n = vec4f(A.yzw, B.x); let d = dot(p, n) - B.y;
      if (d < 0.0) {
        ${c4((c) => (da(c) ? `{ let dn = vec4f(${da(c)}.yzw, ${db(c)}.x); let dt = dot(${c.v}, n) + dot(p, dn) - ${db(c)}.y; ${c.v} = ${c.v} - 2.0 * (dt * n + d * dn); }` : `${c.v} = ${c.v} - 2.0 * dot(${c.v}, n) * n;`))}
        p = p - 2.0 * d * n;
      } }`;
    case 'fold.box': return `{ let l = ${R(0)}.y; let hi = p > vec4f(l); let lo = p < vec4f(-l); let sg = select(vec4f(1.0), vec4f(-1.0), hi | lo);
      ${c4((c) => (da(c) ? `{ let dl = vec4f(2.0 * ${da(c)}.y); ${c.v} = select(select(${c.v}, -dl - ${c.v}, lo), dl - ${c.v}, hi); }` : `${c.v} = ${c.v} * sg;`))}
      p = clamp(p, vec4f(-l), vec4f(l)) * 2.0 - p; }`;
    case 'fold.cell': return `{ let A = ${R(0)}; let l = vec4f(A.yzw, ${R(1)}.x); let hi = p > l; let lo = p < -l; let sg = select(vec4f(1.0), vec4f(-1.0), hi | lo);
      ${c4((c) => (da(c) ? `{ let dl = 2.0 * vec4f(${da(c)}.yzw, ${db(c)}.x); ${c.v} = select(select(${c.v}, -dl - ${c.v}, lo), dl - ${c.v}, hi); }` : `${c.v} = ${c.v} * sg;`))}
      p = clamp(p, -l, l) * 2.0 - p; }`;
    case 'wrap': return `{ let A = ${R(0)}; let l = vec4f(A.yzw, ${R(1)}.x); let m = select(vec4f(0.0), floor(p / (2.0 * max(l, vec4f(1e-30))) + 0.5), l > vec4f(0.0));
      ${c4((c) => (da(c) ? `${c.v} = ${c.v} - 2.0 * vec4f(${da(c)}.yzw, ${db(c)}.x) * m;` : ''))}
      p = p - 2.0 * l * m; }`;
    case 'kleinian': return `{ let A = ${R(0)}; let bz = ${R(1)}.x;
      let mx = floor((p.x + A.z / A.y * p.y + A.w) / (2.0 * A.w));
      let mz = floor((p.z + bz) / (2.0 * bz));
      let my = floor(p.y / A.y);
      var x = vec3f(p.x - 2.0 * A.w * mx, p.y - A.y * my, p.z - 2.0 * bz * mz);
      let flip = x.y >= kleinLine(x.x, A);
      if (flip) { x = vec3f(-A.z, A.y, 0.0) - x; }
      let k = 1.0 / dot(x, x);
      ${c4((c) => {
        const ea = da(c), eb = db(c), w0 = ea ? `${c.v}.xyz - vec3f(2.0 * ${ea}.w * mx, ${ea}.y * my, 2.0 * ${eb}.x * mz)` : `${c.v}.xyz`;
        return `{ var w = ${w0}; if (flip) { w = ${ea ? `vec3f(-${ea}.z, ${ea}.y, 0.0)` : 'vec3f(0.0)'} - w; }
        let dk = -2.0 * dot(x, w) * k * k;
        ${chain(c, 'k', 'dk')}
        ${c.v} = vec4f(${ea ? `-${ea}.z + ` : ''}dk * x.x + k * w.x, ${ea ? `${ea}.y ` : ''}- dk * x.y - k * w.y, -dk * x.z - k * w.z, ${c.v}.w); }`;
      })}
      p = vec4f(-A.z + k * x.x, A.y - k * x.y, -k * x.z, p.w); t.dr = t.dr * k; }`;
    case 'fold.mandalay': return `{ let A = ${R(0)}; let fo = A.y; let g = A.z; let q = abs(p); let sg = select(vec3f(1.0), vec3f(-1.0), p.xyz < vec3f(0.0));
      ${c4((c) => { const dd = da(c) ? `${da(c)}.y, ${da(c)}.z` : '0.0, 0.0'; return `{ let w = ${c.v}.xyz * sg;
        ${c.v} = vec4f(sg * vec3f(mdTan(q.x, q.y, q.z, w.x, w.y, w.z, fo, g, ${dd}), mdTan(q.y, q.x, q.z, w.y, w.x, w.z, fo, g, ${dd}), mdTan(q.z, q.x, q.y, w.z, w.x, w.y, fo, g, ${dd})), ${c.v}.w); }`; })}
      p = mandalay(p, fo, g); }`;
    // the estimate reads a seed at the orbit's end; in the orbit it is nothing
    case 'seed.slab': case 'seed.sphere': case 'seed.pillar': return '';
    case 'fold.sphere': return `{ let A = ${R(0)}; let r2 = dot(p, p); let m2 = A.y * A.y; let f2 = A.z * A.z;
      if (r2 < m2) {
        let k = f2 / m2;
        ${c4((c) => (da(c) ? `{ let dk = 2.0 * k * (${da(c)}.z / A.z - ${da(c)}.y / A.y); ${chain(c, 'k', 'dk')} ${c.v} = k * ${c.v} + dk * p; }` : `${chain(c, 'k')} ${c.v} = k * ${c.v};`))}
        p = p * k; t.dr = t.dr * k;
      } else if (r2 < f2) {
        let k = f2 / r2;
        ${c4((c) => `{ let dk = ${da(c) ? `(2.0 * A.z * ${da(c)}.z - k * 2.0 * dot(p, ${c.v})) / r2` : `-k * 2.0 * dot(p, ${c.v}) / r2`}; ${chain(c, 'k', 'dk')} ${c.v} = k * ${c.v} + dk * p; }`)}
        p = p * k; t.dr = t.dr * k;
      } }`;
    case 'abs': return `{ let sg = select(vec4f(1.0), vec4f(-1.0), p < vec4f(0.0));
      ${c4((c) => `${c.v} = ${c.v} * sg;`)}
      p = abs(p); }`;
    case 'sort': return `{ var x = p.xyz;
      ${sw('x.x < x.y', 'yxz')}
      ${sw('x.y < x.z', 'xzy')}
      ${sw('x.x < x.y', 'yxz')}
      p = vec4f(x, p.w); }`;
    case 'sort4': return `{ var x = p;
      ${sw('x.x < x.y', 'yxzw')}
      ${sw('x.z < x.w', 'xywz')}
      ${sw('x.x < x.z', 'zyxw')}
      ${sw('x.y < x.w', 'xwzy')}
      ${sw('x.y < x.z', 'xzyw')}
      p = x; }`;
    case 'bulb': return `{ let n = ${R(0)}.y; let r = length(p.xyz);
      if (r > 0.0) {
        let rxy2 = dot(p.xy, p.xy); let sq = r * sqrt(rxy2);
        let th = acos(clamp(p.z / r, -1.0, 1.0)); let ph = atan2(p.y, p.x);
        let R = pow(r, n); let R1 = pow(r, n - 1.0); let R2 = pow(r, n - 2.0);
        let T = n * th; let F = n * ph;
        let st = sin(T); let ct = cos(T); let sf = sin(F); let cf = cos(F);
        let u = vec3f(st * cf, st * sf, ct);
        let k = n * R1; let lr = log(r);
        ${c4((c) => `{ let drr = dot(p.xyz, ${c.v}.xyz) / r;
          var dT = 0.0; var dF = 0.0;
          if (rxy2 > 0.0) { dT = n * (p.z * drr - r * ${c.v}.z) / sq; dF = n * (p.x * ${c.v}.y - p.y * ${c.v}.x) / rxy2; }
          ${da(c) ? `dT = dT + th * ${da(c)}.y; dF = dF + ph * ${da(c)}.y;` : ''}
          ${chain(c, 'k', powDk(da(c)))}
          ${c.v} = vec4f(${powDR(da(c))} * u + R * vec3f(ct * cf * dT - st * sf * dF, ct * sf * dT + st * cf * dF, -st * dT), ${c.v}.w); }`)}
        t.dr = t.dr * k; p = vec4f(R * u, p.w);
      } else {
        ${c4((c) => `${chain(c, '0.0')} ${c.v} = vec4f(0.0, 0.0, 0.0, ${c.v}.w);`)}
        t.dr = 0.0;
      } }`;
    case 'bulb4': return `{ let n = ${R(0)}.y; let r = length(p);
      if (r > 0.0) {
        let r1 = length(p.yzw); let r2 = length(p.zw);
        let t1 = acos(clamp(p.x / r, -1.0, 1.0));
        let t2 = select(0.0, acos(clamp(p.y / r1, -1.0, 1.0)), r1 > 0.0);
        let ph = atan2(p.w, p.z);
        let R = pow(r, n); let R1 = pow(r, n - 1.0); let R2 = pow(r, n - 2.0);
        let A = n * t1; let B = n * t2; let G = n * ph;
        let sa = sin(A); let ca = cos(A); let sb = sin(B); let cb = cos(B); let sg = sin(G); let cg = cos(G);
        let u = vec4f(ca, sa * cb, sa * sb * cg, sa * sb * sg);
        let k = n * R1; let lr = log(r);
        ${c4((c) => `{ let drr = dot(p, ${c.v}) / r;
          var dA = 0.0; var dB = 0.0; var dG = 0.0;
          if (r1 > 0.0) {
            dA = n * (p.x * drr - r * ${c.v}.x) / (r * r1);
            if (r2 > 0.0) { let dr1 = dot(p.yzw, ${c.v}.yzw) / r1; dB = n * (p.y * dr1 - r1 * ${c.v}.y) / (r1 * r2); dG = n * (p.z * ${c.v}.w - p.w * ${c.v}.z) / (r2 * r2); }
          }
          ${da(c) ? `dA = dA + t1 * ${da(c)}.y; dB = dB + t2 * ${da(c)}.y; dG = dG + ph * ${da(c)}.y;` : ''}
          ${chain(c, 'k', powDk(da(c)))}
          ${c.v} = ${powDR(da(c))} * u + R * vec4f(-sa * dA, ca * cb * dA - sa * sb * dB,
            ca * sb * cg * dA + sa * cb * cg * dB - sa * sb * sg * dG,
            ca * sb * sg * dA + sa * cb * sg * dB + sa * sb * cg * dG); }`)}
        t.dr = t.dr * k; p = R * u;
      } else {
        ${c4((c) => `${chain(c, '0.0')} ${c.v} = vec4f(0.0);`)}
        t.dr = 0.0;
      } }`;
    case 'power': return `{ let n = ${R(0)}.y; let r = length(p.xy);
      if (r > 0.0) {
        let al = atan2(p.y, p.x); let r2 = r * r;
        let R = pow(r, n); let R1 = pow(r, n - 1.0); let R2 = pow(r, n - 2.0);
        let ang = n * al; let cs = cos(ang); let sn = sin(ang);
        let k = n * R1; let lr = log(r);
        ${c4((c) => `{ let drr = dot(p.xy, ${c.v}.xy) / r; let dA = n * (p.x * ${c.v}.y - p.y * ${c.v}.x) / r2${da(c) ? ` + al * ${da(c)}.y` : ''}; let dR = ${powDR(da(c))};
          ${chain(c, 'k', powDk(da(c)))}
          ${c.v} = vec4f(dR * cs - R * sn * dA, dR * sn + R * cs * dA, ${c.v}.zw); }`)}
        t.dr = t.dr * k; p = vec4f(R * cs, R * sn, p.zw);
      } else {
        ${c4((c) => `${chain(c, '0.0')} ${c.v} = vec4f(0.0, 0.0, ${c.v}.zw);`)}
        t.dr = 0.0;
      } }`;
    case 'quat': return `{ let r = length(p); let k = 2.0 * r;
      ${c4((c) => `{ let dk = select(0.0, 2.0 * dot(p, ${c.v}) / r, r > 0.0); ${chain(c, 'k', 'dk')}
        ${c.v} = 2.0 * vec4f(p.x * ${c.v}.x - dot(p.yzw, ${c.v}.yzw), p.x * ${c.v}.yzw + ${c.v}.x * p.yzw); }`)}
      t.dr = t.dr * k; p = vec4f(p.x * p.x - dot(p.yzw, p.yzw), 2.0 * p.x * p.yzw); }`;
    case 'invert': return `{ let r2 = dot(p, p);
      if (r2 > 0.0) {
        let k = 1.0 / r2;
        ${c4((c) => `{ let dk = -2.0 * dot(p, ${c.v}) / (r2 * r2); ${chain(c, 'k', 'dk')} ${c.v} = ${c.v} / r2 + dk * p; }`)}
        p = p / r2; t.dr = t.dr / r2;
      } }`;
    case 'twist': return `{ let a = ${R(0)}.y; let ang = a * p.z; let cs = cos(ang); let sn = sin(ang);
      ${c4((c) => `{ let dang = a * ${c.v}.z${da(c) ? ` + p.z * ${da(c)}.y` : ''};
        ${c.v} = vec4f(cs * ${c.v}.x - sn * ${c.v}.y - (sn * p.x + cs * p.y) * dang, sn * ${c.v}.x + cs * ${c.v}.y + (cs * p.x - sn * p.y) * dang, ${c.v}.zw); }`)}
      p = vec4f(cs * p.x - sn * p.y, sn * p.x + cs * p.y, p.zw); }`;
    case 'spherical': return `{ let r2 = dot(p.xy, p.xy);
      if (r2 > 0.0) {
        let k = 1.0 / r2;
        ${c4((c) => `{ let dk = -2.0 * dot(p.xy, ${c.v}.xy) / (r2 * r2); ${chain(c, 'k', 'dk')} ${c.v} = vec4f(${c.v}.xy / r2 + dk * p.xy, ${c.v}.zw); }`)}
        p = vec4f(p.xy / r2, p.zw); t.dr = t.dr / r2;
      } }`;
    case 'swirl': return `{ let r2 = dot(p.xy, p.xy); let cs = cos(r2); let sn = sin(r2);
      ${c4((c) => `{ let dr2 = 2.0 * dot(p.xy, ${c.v}.xy);
        ${c.v} = vec4f(${c.v}.x * sn - ${c.v}.y * cs + (p.x * cs + p.y * sn) * dr2, ${c.v}.x * cs + ${c.v}.y * sn + (-p.x * sn + p.y * cs) * dr2, ${c.v}.zw); }`)}
      p = vec4f(p.x * sn - p.y * cs, p.x * cs + p.y * sn, p.zw); }`;
    case 'sin': return `{ let cx = cos(p.x); let cy = cos(p.y);
      ${c4((c) => `${c.v} = vec4f(cx * ${c.v}.x, cy * ${c.v}.y, ${c.v}.zw);`)}
      p = vec4f(sin(p.x), sin(p.y), p.zw); }`;
    case 'horseshoe': return `{ let r = length(p.xy);
      if (r > 0.0) {
        ${c4((c) => `{ let drr = dot(p.xy, ${c.v}.xy) / r;
          ${c.v} = vec4f((2.0 * p.x * ${c.v}.x - 2.0 * p.y * ${c.v}.y) / r - (p.x * p.x - p.y * p.y) * drr / (r * r), 2.0 * (p.y * ${c.v}.x + p.x * ${c.v}.y) / r - 2.0 * p.x * p.y * drr / (r * r), ${c.v}.zw); }`)}
        p = vec4f((p.x - p.y) * (p.x + p.y) / r, 2.0 * p.x * p.y / r, p.zw);
      } }`;
    case 'polar': return `{ let r2 = dot(p.xy, p.xy);
      if (r2 > 0.0) {
        let r = sqrt(r2);
        ${c4((c) => `${c.v} = vec4f((p.y * ${c.v}.x - p.x * ${c.v}.y) / r2 / PI, dot(p.xy, ${c.v}.xy) / r, ${c.v}.zw);`)}
      }
      p = vec4f(atan2(p.x, p.y) / PI, length(p.xy) - 1.0, p.zw); }`;
    default: throw new Error(`no dual JIT for ${o.op}`);
  }
}

// The chimera (gpu/wgsl.js mixTan, its sums in the same order): every species once on (p, dr) and all the
// columns, each ending in registers of its own, then the blend. v' = Σ ωᵢ vᵢ + dωᵢ Fᵢ, dr' the same; the
// weights move by ∇ωᵢ·v (·the start's column in the world frame) and ∂ωᵢ/∂reading · dreading.
// spoken: the seed reads which species led.
function mixDual(o, oi, kids, cols, R, spoken) {
  const K = kids.length, ks = kids.map((_, i) => i);
  const reading = (c) => (o.op === 'mix.trap' ? (c.d ? `dft.${'xyz'[GRAD.indexOf(c)]}` : null)
    : o.op === 'mix.lyap' ? (c.d ? `dm_${c.v} / (max(drm, 1e-30) * (fIter + 1.0))` : null) : null);
  return `{ let pm = p; let drm = t.dr; let wd = ${R(0)}.z > 0.5;
      ${each(cols, (c) => `let vm_${c.v} = ${c.v};${c.d ? ` let dm_${c.v} = ${c.d};` : ''}`)}
      let fw = fieldAt(${oi}u, pm, drm, wd);
${kids.map((code, i) => `${code}
      let kp${i} = p; let kd${i} = t.dr; p = pm; t.dr = drm;
      ${each(cols, (c) => `let k${i}_${c.v} = ${c.v}; ${c.v} = vm_${c.v};${c.d ? ` let kd${i}_${c.v} = ${c.d}; ${c.d} = dm_${c.v};` : ''}`)}`).join('\n')}
      ${each(cols, (c) => `{ let vx = select(vm_${c.v}, ${c.s || 'vec4f(0.0)'}, wd);
        ${ks.map((i) => `let dw${i} = dot(fw.G[${i}], vx)${reading(c) ? ` + fw.S[${i}] * (${reading(c)})` : ''};`).join(' ')}
        ${c.v} = vec4f(0.0)${ks.map((i) => ` + fw.w[${i}] * k${i}_${c.v} + dw${i} * kp${i}`).join('')};
        ${c.d ? `${c.d} = 0.0${ks.map((i) => ` + fw.w[${i}] * kd${i}_${c.v} + dw${i} * kd${i}`).join('')};` : ''} }`)}
      p = vec4f(0.0)${ks.map((i) => ` + fw.w[${i}] * kp${i}`).join('')};
      t.dr = 0.0${ks.map((i) => ` + fw.w[${i}] * kd${i}`).join('')};
      ${spoken ? `var lead = 0u;
${ks.slice(1).map((i) => `      if (fw.w[${i}] > fw.w[lead]) { lead = ${i}u; }`).join('\n')}
      t.sp = f32(lead) / ${L(Math.max(K - 1, 1))};` : ''} }`;
}

// The drive program with its derivatives (gpu/wgsl.js driveIterDual, inlined as driveInline inlines
// driveIter): every node and binding carries a vec3f along the gradient's columns.
function driveDual(f, DI) {
  const m0 = f.drive.nodes, at = new Map(m0.map((m, i) => [m.id, i]));
  const D = (i) => `dnD${i}`;
  const inD = (m, k) => (m.in[k] != null && at.has(m.in[k]) ? D(at.get(m.in[k])) : null);
  const inV = (m, k) => (m.in[k] != null && at.has(m.in[k]) ? `dn${at.get(m.in[k])}` : null);
  const cols = (fn) => `vec3f(${[0, 1, 2].map(fn).join(', ')})`;
  const nodeD = (m, i) => {
    const ty = DRIVE_TYPE[m.type];
    switch (m.type) {
      case 'r': return `{ ${D(i)} = vec3f(0.0); let r_ = length(p); if (r_ > 0.0) { ${D(i)} = ${cols((j) => `dot(p, g${j})`)} / r_; } }`;
      case 'trap': return `${D(i)} = dft;`;
      case 'lyap': return `${D(i)} = vec3f(0.0); if (t.dr > 1e-30) { ${D(i)} = vec3f(gd0, gd1, gd2) / (t.dr * (f32(i) + 1.0)); }`;
      case 'px': case 'py': case 'pz': case 'pw': { const a = 'xyzw'[ty - 5]; return `${D(i)} = ${cols((j) => `g${j}.${a}`)};`; }
      case 'math': {
        const dx = inD(m, 'a'), dy = inD(m, 'b');
        return `{ let pd = drvMathD(u32(drvP(${i}u, 0u)), ${inV(m, 'a') || '0.0'}, ${inV(m, 'b') || `drvP(${i}u, 1u)`}); ${D(i)} = ${dx ? `pd.x * ${dx}` : 'vec3f(0.0)'}${dy ? ` + pd.y * ${dy}` : ''}; }`;
      }
      case 'remap': {
        const dx = inD(m, 'a'), x = inV(m, 'a') || '0.0';
        return `{ var d = drvP(${i}u, 1u) - drvP(${i}u, 0u); if (d == 0.0) { d = 1e-12; }
        let u = (${x} - drvP(${i}u, 0u)) / d; ${D(i)} = ${dx ? `${dx} / d` : 'vec3f(0.0)'};
        if (drvP(${i}u, 2u) > 0.5 && (u < 0.0 || u > 1.0)) { ${D(i)} = vec3f(0.0); } }`;
      }
      default: return '';
    }
  };
  // the first iteration: a field's value and gradient at once; the start's coordinates; the rest as they run
  const firstD = (m, i) => {
    const ty = DRIVE_TYPE[m.type];
    if (ty >= 13 && ty <= 16) return `{ let r_ = drvField(${i}u, ${ty}u, drvStart); dn${i} = r_.v; ${D(i)} = ${cols((j) => `dot(r_.g, s${j})`)}; }`;
    const own = DI.firstCode(m, i);
    if (ty >= 9 && ty <= 12) { const a = 'xyzw'[ty - 9]; return `${own} ${D(i)} = ${cols((j) => `s${j}.${a}`)};`; }
    return `${nodeD(m, i)} ${own}`;
  };
  const bindCode = (x, k) => `{ let B = ops[${DI.R(k)}]; let C = ops[${DI.R(k)} + 1u]; let raw = B.z + dn${x.from} * (B.w - B.z); dv${k} = clamp(raw, C.y, C.z);
        dvD${k} = select((B.w - B.z) * ${D(x.from)}, vec3f(0.0), raw < C.y || raw > C.z); }`;
  const lines = (a, fn) => a.map(fn).join('\n');
  const decl = `${DI.decl}${lines(m0, (_, i) => `  var ${D(i)} = vec3f(0.0);`)}\n${lines(DI.binds, (_, k) => `  var dvD${k} = vec3f(0.0);`)}\n`;
  const iter = `    if (DRIVE_ON && drvAny) {
      if (i == 0u) {
${lines(m0, (m, i) => '        ' + firstD(m, i))}
${lines(DI.binds, (x, k) => '        ' + bindCode(x, k))}
        drvFirst = false;
      }${DI.live ? ` else {
${lines(DI.perNodes, ([m, i]) => `        ${nodeD(m, i)} ${DI.nodeCode(m, i)}`)}
${lines(DI.perBinds, ([x, k]) => '        ' + bindCode(x, k))}
      }` : ''}
    }
`;
  // after the orbit: for a seed's own derivative through its record (gpu/wgsl.js seedDriven)
  const end = `${DI.end}${seedOf(f) ? `  if (DRIVE_ON && drvAny) {\n${lines(DI.binds, (_, k) => `    drvVD[${k}] = vec4f(dvD${k}, 0.0);`)}\n  }\n` : ''}`;
  return { decl, iter, end };
}

// The WGSL `iterateDual` for one formula (gpu/wgsl.js). Drivers: inlined where the forward orbit inlines
// them; otherwise (a rebuilt op, a chimera's own record) the interpreter's driveIterDual and mixTan run
// inside the compiled loop, and every other op stays compiled. lyapOnly: only λ's column, for a collage's
// piece (its normal comes from differences of the collage's estimate, so nothing reads the gradient there)
// and the drivers without their derivatives.
export function jitDual(formula, kind = 'literal', { lyapOnly = false } = {}) {
  const f = normalize(formula);
  const cols = lyapOnly ? [LYAP] : COLS;
  const { base, opIndex } = opTable(f);
  const driven = new Set(driveBinds(f).map((x) => x.t.o));
  const DI = driveInline(f, opIndex), DD = DI && !lyapOnly ? driveDual(f, DI) : null;
  const generic = drives(f) && !DI;
  const packed = kind === 'literal' ? pack(f).ops : null;
  const rowOf = (oi, o) => (k) => (packed && !driven.has(o) ? V([...packed.subarray((oi * REC_VEC + k) * 4, (oi * REC_VEC + k + 1) * 4)]) : `rec(${oi}u, ${k}u)`);
  const kidsOf = new Map(mixKids(f).mixes.map((m) => [`${m.si}.${m.j}`, m.kids]));
  const spoken = !!seedOf(f);
  // a driven op: its records' motion along each gradient column, then the op
  const opE = (o, oi) => {
    if (lyapOnly) { const code = dualOp(o, oi, cols, rowOf(oi, o)); return DI ? DI.rewrite(code, oi) : code; }
    if (generic) {
      const E = (c, k) => (GRAD.includes(c) ? `E[${GRAD.indexOf(c) * 5 + k}]` : null);
      return `{ let E = drvLoadAll(${oi}u);\n      ${dualOp(o, oi, COLS, rowOf(oi, o), E)} }`;
    }
    const bs = DI.byOp.get(oi), E = (c, k) => (GRAD.includes(c) ? `E${GRAD.indexOf(c)}_${k}` : null);
    const row = (j, k) => `let E${j}_${k} = ${bs.map((b) => `dvD${b}.${'xyz'[j]} * ops[${DI.R(b)} + ${3 + k}u]`).join(' + ')};`;
    return `{ ${[0, 1, 2].map((j) => `${row(j, 0)} ${row(j, 1)}`).join('\n      ')}\n      ${DI.rewrite(dualOp(o, oi, COLS, rowOf(oi, o), E), oi)} }`;
  };
  const code = (o, oi) => (driven.has(o) ? opE(o, oi) : dualOp(o, oi, cols, rowOf(oi, o)));
  const bare = (si) => f.slots[si].map((o, j) => '      ' + code(o, base[si] + j)).join('\n');
  const slots = f.slots.map((s, si) => s.map((o, j) => {
    const oi = base[si] + j, kids = kidsOf.get(`${si}.${j}`);
    if (kids && generic && lyapOnly) return `      { let f_ = mixFwd(${oi}u, p, c, t.dr); let z = vec4f(0.0); let y = array<f32, 5>(0.0, 0.0, 0.0, 0.0, 0.0);
        lv = mixTan(${oi}u, p, c, t.dr, 1u, array<vec4f, 5>(lv, z, z, z, z), y, array<vec4f, 5>(z, z, z, z, z), array<vec4f, 5>(z, z, z, z, z), y, 99u).v[0];
        t.dr = f_.dr; p = f_.p; t.sp = f_.sp; }`;
    if (kids && generic) return `      { let f_ = mixFwd(${oi}u, p, c, t.dr); let z = vec4f(0.0);
        let mt = mixTan(${oi}u, p, c, t.dr, 5u, array<vec4f, 5>(g0, g1, g2, z, lv), array<f32, 5>(gd0, gd1, gd2, 0.0, 0.0), array<vec4f, 5>(dc0, dc1, dc2, z, z),
                        array<vec4f, 5>(s0, s1, s2, z, z), array<f32, 5>(dft.x, dft.y, dft.z, 0.0, 0.0), 3u);
        g0 = mt.v[0]; g1 = mt.v[1]; g2 = mt.v[2]; lv = mt.v[4]; gd0 = mt.ddr[0]; gd1 = mt.ddr[1]; gd2 = mt.ddr[2];
        t.dr = f_.dr; p = f_.p; t.sp = f_.sp; }`;
    return '      ' + (kids ? mixDual(o, oi, kids.map(bare), cols, rowOf(oi, o), spoken) : code(o, oi));
  }).join('\n'));
  // the trap reading's derivative along each column, which follows the iterate that set it
  const trapped = !lyapOnly && (generic || f.slots.flat().some((o) => o.op === 'mix.trap') || (DI && f.drive.nodes.some((m) => m.type === 'trap')));
  return `
fn iterateDual(p0: vec4f, c: vec4f, cIsP: bool) -> Dual {
  var d: Dual;
  var t: Trace;
  t.dr = 1.0; t.n = 0u; t.escaped = false; t.trap = 1e20; t.col = 0.0;
  var p = p0;
  var lv = head.slice * vec4f(normalize(vec3f(0.6, 0.48, 0.64)), 0.0);
  var lsum = 0.0;
${lyapOnly ? '' : `  var g0 = head.slice[0];
  var g1 = head.slice[1];
  var g2 = head.slice[2];
  var gd0 = 0.0; var gd1 = 0.0; var gd2 = 0.0;
  let kc = select(0.0, 1.0, cIsP);
  let dc0 = g0 * kc; let dc1 = g1 * kc; let dc2 = g2 * kc;
  let s0 = g0; let s1 = g1; let s2 = g2;
`}  startOrbit(p0);
${trapped ? '  var dft = 2.0 * vec3f(dot(p0, g0), dot(p0, g1), dot(p0, g2));\n' : ''}${DD ? DD.decl : lyapOnly && DI ? DI.decl : ''}  for (var i = 0u; i < ${f.iters}u; i++) {
    fIter = f32(i);
${lyapOnly ? (DI ? DI.iter : generic ? '    if (DRIVE_ON && drvAny) { driveIter(p, t.dr, i, f32(head.iters)); }\n' : '') : DD ? DD.iter : generic ? '    if (DRIVE_ON && drvAny) { driveIterDual(p, t.dr, i, f32(head.iters), mat4x4f(g0, g1, g2, vec4f(0.0)), vec4f(gd0, gd1, gd2, 0.0), vec4f(dft, 0.0), mat4x4f(s0, s1, s2, vec4f(0.0))); }\n' : ''}${scheduled(f, slots)}
    t.n = i + 1u;
    let l = length(lv);
    if (l > 0.0 && l < 1e30) { lsum = lsum + log(l); lv = lv / l; }
    let r2 = dot(p, p);
    t.trap = min(t.trap, r2);
${lyapOnly ? '    fTrap = min(fTrap, r2);\n' : trapped ? '    if (r2 < fTrap) { fTrap = r2; dft = 2.0 * vec3f(dot(p, g0), dot(p, g1), dot(p, g2)); }\n' : ''}    if (!(r2 <= ${kind === 'structure' ? 'head.bail * head.bail' : L(f.bail * f.bail)})) { t.escaped = true; break; }
  }
  t.p = p;
${DD ? DD.end : lyapOnly && DI ? DI.end : ''}  d.t = t;
${lyapOnly ? '' : `  d.g0 = g0; d.g1 = g1; d.g2 = g2;
  d.gdr = vec3f(gd0, gd1, gd2);
`}  d.lyap = lsum / f32(max(t.n, 1u));
  return d;
}
`;
}

// the WGSL `iterate` for one formula, replacing the interpreter's. kind: 'literal' | 'structure'
// Drivers (gpu/wgsl.js DRIVE): every iteration starts with driveIter, and a driven op reads its record
// through rec() — live, in the literal kind too (its other ops stay literals)
export function jitIterate(formula, kind = 'literal') {
  const f = normalize(formula);
  const driven = new Set(driveBinds(f).map((x) => x.t.o));
  const { base, opIndex } = opTable(f);
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
  const body = scheduled(f, slots);
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

// a shader source with the interpreter's iterate and iterateDual renamed out of the way and the JIT's in
// their place; everything else (de, deOf, the sensing, which still reads the op table) is untouched
const SIG = 'fn iterate(p0: vec4f, c: vec4f) -> Trace {';
const SIG_DUAL = 'fn iterateDual(p0: vec4f, c: vec4f, cIsP: bool) -> Dual {';
// A formula without the Kleinian or Mandalay ops loses their cases and the seed's read here: a JIT's
// structure is fixed, so nothing can ask for them (box cave 5–8 % a still frame, measured 2026-10-30)
const FAMILY = new Set(['fold.cell', 'wrap', 'kleinian', 'fold.mandalay', 'seed.slab', 'seed.sphere', 'seed.pillar']);
const plainOf = (source, f) => (f.slots.some((s) => s.some((o) => FAMILY.has(o.op))) ? source
  : source.replace('const SEED_ON = true;', 'const SEED_ON = false;').replace(/\/\/ FAMILIES\{[\s\S]*?\/\/ \}FAMILIES\n/g, ''));
export function withJit(source, formula, kind = 'literal') {
  if (!source.includes(SIG)) throw new Error('no interpreter iterate to replace');
  const dual = source.includes(SIG_DUAL) ? jitDual(formula, kind) : null;
  const src = plainOf(source, normalize(formula)).replace(SIG, 'fn iterateInterpreted(p0: vec4f, c: vec4f) -> Trace {');
  return (dual ? src.replace(SIG_DUAL, 'fn iterateDualInterpreted(p0: vec4f, c: vec4f, cIsP: bool) -> Dual {') + dual : src) + jitIterate(formula, kind);
}

// what a structure JIT depends on: the ops in order, the schedule, the iteration count, and the drive
// program's shape (its node types and wiring, its bindings' targets: driveInline bakes them in)
export function structureKey(formula) {
  const f = normalize(formula);
  return JSON.stringify([f.slots.map((s) => s.map((o) => o.op)), f.schedule, f.iters, drives(f), driveShape(f)]);
}

export { pullSafe };
