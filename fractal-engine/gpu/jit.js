// The JIT: a formula compiled into its own WGSL `iterate` — the same orbit as the interpreter
// (gpu/wgsl.js opFwd), statement for statement, with the op types and the schedule unrolled and no
// switch on opcodes. Two kinds:
//   literal    every parameter a literal too: the fastest, but one compile per set of values
//   structure  parameters read from the op buffer (through rec(), so lens overrides still apply):
//              one compile per structure (ops, schedule, iterations) serves every value — live
//              editing, drift, walks, and every frame of a video
// test/parity.html diffs both against the interpreter.

import { normalize, pullSafe } from '../core/formula.js';
import { slotIndex } from '../core/notation.js';
import { rotationXYZ, normalize as nrm } from '../core/vec.js';

const L = (x) => {
  if (!Number.isFinite(x)) throw new Error('non-finite literal');
  const s = Math.fround(x).toPrecision(9);
  return /[.e]/.test(s) ? s : s + '.0';
};
const V = (a) => `vec3f(${a.map(L).join(', ')})`;

// one op as WGSL statements on `p`, `t.dr`, `br`, reading its packed record from the buffer
function opCodeBuffered(o, oi) {
  const a = `rec(${oi}u, 0u)`, b = `rec(${oi}u, 1u)`, cc = `rec(${oi}u, 2u)`;
  switch (o.op) {
    case 'translate': return `p = p + ${a}.yzw;`;
    case '+c': return 'p = p + c; t.dr = t.dr + 1.0;';
    case 'scale': return `{ let s = ${a}.y; p = p * s; t.dr = t.dr * abs(s); }`;
    case 'rotate': return `{ let A = ${a}; let B = ${b}; let C = ${cc};
      p = vec3f(dot(A.yzw, p), dot(B.xyz, p), dot(vec3f(B.w, C.xy), p)); }`;
    case 'fold.plane': return `{ let n = ${a}.yzw; let d = dot(p, n) - ${b}.x; if (d < 0.0) { p = p - 2.0 * d * n; br = 1u; } }`;
    case 'fold.box': return `{ let l = ${a}.y;
      br = select(0u, 1u, p.x > l) + select(0u, 2u, p.x < -l) + select(0u, 3u, p.y > l) + select(0u, 6u, p.y < -l) + select(0u, 9u, p.z > l) + select(0u, 18u, p.z < -l);
      p = clamp(p, vec3f(-l), vec3f(l)) * 2.0 - p; }`;
    case 'fold.sphere': return `{ let A = ${a}; let r2 = dot(p, p); let m2 = A.y * A.y; let f2 = A.z * A.z;
      if (r2 < m2) { let k = f2 / m2; p = p * k; t.dr = t.dr * k; }
      else if (r2 < f2) { let k = f2 / r2; p = p * k; t.dr = t.dr * k; br = 1u; }
      else { br = 2u; } }`;
    case 'bulb': return `{ let n = ${a}.y; let r = length(p);
      if (r > 0.0) {
        let theta = acos(clamp(p.z / r, -1.0, 1.0)) * n;
        let phi = atan2(p.y, p.x) * n;
        t.dr = t.dr * n * pow(r, n - 1.0);
        p = pow(r, n) * vec3f(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta));
      } else { t.dr = 0.0; } }`;
    case 'power': return `{ let n = ${a}.y; let r = length(p.xy);
      if (r > 0.0) {
        let ang = atan2(p.y, p.x) * n;
        t.dr = t.dr * n * pow(r, n - 1.0);
        p = vec3f(pow(r, n) * cos(ang), pow(r, n) * sin(ang), p.z);
      } else { t.dr = 0.0; } }`;
    case 'twist': return `{ let ang = ${a}.y * p.z; p = vec3f(cos(ang) * p.x - sin(ang) * p.y, sin(ang) * p.x + cos(ang) * p.y, p.z); }`;
    // the rest have no parameters: the literal code is the same code
    default: return opCode(o, oi);
  }
}

// one op as WGSL statements on `p`, `t.dr`, `br`; oi is its index (for the branch colour)
function opCode(o, oi) {
  const P = o.p;
  switch (o.op) {
    case 'translate': return `p = p + ${V([P.x, P.y, P.z])};`;
    case '+c': return 'p = p + c; t.dr = t.dr + 1.0;';
    case 'scale': return `p = p * ${L(P.s)}; t.dr = t.dr * ${L(Math.abs(P.s))};`;
    case 'rotate': {
      const R = rotationXYZ(P.x, P.y, P.z);
      return `p = vec3f(dot(${V(R.slice(0, 3))}, p), dot(${V(R.slice(3, 6))}, p), dot(${V(R.slice(6, 9))}, p));`;
    }
    case 'fold.plane': {
      const n = V(nrm([P.nx, P.ny, P.nz]));
      return `{ let d = dot(p, ${n}) - ${L(P.d)}; if (d < 0.0) { p = p - 2.0 * d * ${n}; br = 1u; } }`;
    }
    case 'fold.box': {
      const l = L(P.l);
      return `br = select(0u, 1u, p.x > ${l}) + select(0u, 2u, p.x < -${l}) + select(0u, 3u, p.y > ${l}) + select(0u, 6u, p.y < -${l}) + select(0u, 9u, p.z > ${l}) + select(0u, 18u, p.z < -${l});
      p = clamp(p, vec3f(-${l}), vec3f(${l})) * 2.0 - p;`;
    }
    case 'fold.sphere': {
      const m2 = P.rmin * P.rmin, f2 = P.rfix * P.rfix;
      return `{ let r2 = dot(p, p);
      if (r2 < ${L(m2)}) { let k = ${L(f2)} / ${L(m2)}; p = p * k; t.dr = t.dr * k; }
      else if (r2 < ${L(f2)}) { let k = ${L(f2)} / r2; p = p * k; t.dr = t.dr * k; br = 1u; }
      else { br = 2u; } }`;
    }
    case 'abs': return 'br = select(0u, 1u, p.x < 0.0) + select(0u, 2u, p.y < 0.0) + select(0u, 4u, p.z < 0.0); p = abs(p);';
    case 'sort': return `{ var x = p;
      if (x.x < x.y) { x = x.yxz; br = br + 1u; }
      if (x.y < x.z) { x = x.xzy; br = br + 2u; }
      if (x.x < x.y) { x = x.yxz; br = br + 4u; }
      p = x; }`;
    case 'bulb': {
      const n = L(P.n);
      return `{ let r = length(p);
      if (r > 0.0) {
        let theta = acos(clamp(p.z / r, -1.0, 1.0)) * ${n};
        let phi = atan2(p.y, p.x) * ${n};
        t.dr = t.dr * ${n} * pow(r, ${n} - 1.0);
        p = pow(r, ${n}) * vec3f(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta));
      } else { t.dr = 0.0; } }`;
    }
    case 'power': {
      const n = L(P.n);
      return `{ let r = length(p.xy);
      if (r > 0.0) {
        let ang = atan2(p.y, p.x) * ${n};
        t.dr = t.dr * ${n} * pow(r, ${n} - 1.0);
        p = vec3f(pow(r, ${n}) * cos(ang), pow(r, ${n}) * sin(ang), p.z);
      } else { t.dr = 0.0; } }`;
    }
    case 'invert': return '{ let r2 = dot(p, p); if (r2 > 0.0) { p = p / r2; t.dr = t.dr / r2; } }';
    case 'twist': return `{ let ang = ${L((P.a * Math.PI) / 180)} * p.z; p = vec3f(cos(ang) * p.x - sin(ang) * p.y, sin(ang) * p.x + cos(ang) * p.y, p.z); }`;
    case 'spherical': return '{ let r2 = dot(p.xy, p.xy); if (r2 > 0.0) { p = vec3f(p.xy / r2, p.z); t.dr = t.dr / r2; } }';
    case 'swirl': return '{ let r2 = dot(p.xy, p.xy); p = vec3f(p.x * sin(r2) - p.y * cos(r2), p.x * cos(r2) + p.y * sin(r2), p.z); }';
    case 'sin': return 'p = vec3f(sin(p.x), sin(p.y), p.z);';
    case 'horseshoe': return '{ let r = length(p.xy); if (r > 0.0) { p = vec3f((p.x - p.y) * (p.x + p.y) / r, 2.0 * p.x * p.y / r, p.z); } }';
    case 'polar': return 'p = vec3f(atan2(p.x, p.y) / PI, length(p.xy) - 1.0, p.z);';
    default: throw new Error(`no JIT for ${o.op}`);
  }
}

// the WGSL `iterate` for one formula, replacing the interpreter's. kind: 'literal' | 'structure'
export function jitIterate(formula, kind = 'literal') {
  const f = normalize(formula);
  const gen = kind === 'structure' ? opCodeBuffered : opCode;
  let oi = 0;
  const slots = f.slots.map((s) => s.map((o) => {
    const code = gen(o, oi);
    const branchy = /br =|br = br/.test(code);
    const line = branchy
      ? `br = 0u; ${code}\n      if (br != 0u) { t.col = branchColour(t.col, ${oi}u, br); }`
      : code;
    oi++;
    return '      ' + line;
  }).join('\n'));
  const sched = [...f.schedule].map(slotIndex);
  const body = sched.length === 1 || new Set(sched).size === 1
    ? slots[sched[0]]
    : `    switch (i % ${sched.length}u) {\n${sched.map((s, k) => `      case ${k}u: {\n${slots[s]}\n      }`).join('\n')}\n      default: {}\n    }`;
  return `
fn iterate(p0: vec3f, c: vec3f) -> Trace {
  var t: Trace;
  t.p = p0; t.dr = 1.0; t.n = 0u; t.escaped = false; t.trap = 1e20; t.col = 0.0;
  var p = p0;
  var br = 0u;
  for (var i = 0u; i < ${f.iters}u; i++) {
${body}
    t.n = i + 1u;
    let r2 = dot(p, p);
    t.trap = min(t.trap, r2);
    if (!(r2 <= ${kind === 'structure' ? 'head.bail * head.bail' : L(f.bail * f.bail)})) { t.escaped = true; break; }
  }
  t.p = p;
  return t;
}
`;
}

// a shader source with the interpreter's iterate renamed out of the way and the JIT's in its place;
// everything else (de, deOf, the dual numbers, which still read the op table) is untouched
const SIG = 'fn iterate(p0: vec3f, c: vec3f) -> Trace {';
export function withJit(source, formula, kind = 'literal') {
  if (!source.includes(SIG)) throw new Error('no interpreter iterate to replace');
  return source.replace(SIG, 'fn iterateInterpreted(p0: vec3f, c: vec3f) -> Trace {') + jitIterate(formula, kind);
}

// what a structure JIT depends on: the ops in order, the schedule, the iteration count
export function structureKey(formula) {
  const f = normalize(formula);
  return JSON.stringify([f.slots.map((s) => s.map((o) => o.op)), f.schedule, f.iters]);
}

export { pullSafe };
