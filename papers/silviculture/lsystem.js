// 2.1 The L-system: rewriting with no environment.
// The parametric monopodial tree of Prusinkiewicz & Lindenmayer, The Algorithmic Beauty of Plants (1990), Fig. 2.6,
// after Honda (1971) and Aono & Kunii (1984):
//
//   ω : A(1, 10)
//   p1: A(l, w) → !(w) F(l) [ &(a0) B(l·r2, w·wr) ] /(d) A(l·r1, w·wr)
//   p2: B(l, w) → !(w) F(l) [ −(a2) $ C(l·r2, w·wr) ] C(l·r1, w·wr)
//   p3: C(l, w) → !(w) F(l) [ +(a2) $ B(l·r2, w·wr) ] B(l·r1, w·wr)
//
// F draws a segment of length l and width w, & pitches down, + − turn, / rolls, $ rolls the turtle back level.
// The book's values: r1 0.9, r2 0.6, a0 45°, a2 45°, d 137.5°, wr 0.707. Liberties here: lengths × 2 m and widths
// × 0.035 m so the tree stands about as tall as the other methods'; leaves at the tips; nothing else. The rule
// never reads the world, which is the point: a wall in its way changes nothing.
import { Skeleton } from './skeleton.js?v=3';

const DEG = Math.PI / 180;
export const LS_DEFAULTS = { r1: 0.9, r2: 0.6, a0: 45, a2: 45, d: 137.5, wr: 0.707 };

// the derivation string after n steps, as a flat list of modules [sym, l, w, angle]
function derive(n, P) {
  let s = [['A', 1, 10]];
  for (let g = 0; g < n; g++) {
    const o = [];
    for (const m of s) {
      const [c, l, w] = m;
      if (c === 'A') o.push(['!', w], ['F', l], ['['], ['&', P.a0], ['B', l * P.r2, w * P.wr], [']'], ['/', P.d], ['A', l * P.r1, w * P.wr]);
      else if (c === 'B') o.push(['!', w], ['F', l], ['['], ['-', P.a2], ['$'], ['C', l * P.r2, w * P.wr], [']'], ['C', l * P.r1, w * P.wr]);
      else if (c === 'C') o.push(['!', w], ['F', l], ['['], ['+', P.a2], ['$'], ['B', l * P.r2, w * P.wr], [']'], ['B', l * P.r1, w * P.wr]);
      else o.push(m);
    }
    s = o;
  }
  return s;
}

// a 3-D turtle: heading H, left L, up U
function rot(v, axis, a) { // Rodrigues
  const c = Math.cos(a), s = Math.sin(a), [kx, ky, kz] = axis, [x, y, z] = v, d = kx * x + ky * y + kz * z;
  return [x * c + (ky * z - kz * y) * s + kx * d * (1 - c), y * c + (kz * x - kx * z) * s + ky * d * (1 - c), z * c + (kx * y - ky * x) * s + kz * d * (1 - c)];
}
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export function createLSystem() {
  let P = { ...LS_DEFAULTS }, n = 0;
  const S = new Skeleton(4096), LEN = 2, WID = 0.035;
  function build() {
    S.clear();
    const str = derive(n, P);
    let t = { p: [0, 0, 0], H: [0, 1, 0], L: [-1, 0, 0], U: [0, 0, 1], w: 10, node: S.add(0, 0, 0, -1, 10 * WID, 0) };
    const stack = [];
    for (const m of str) {
      switch (m[0]) {
        case 'F': {
          const l = m[1] * LEN, p = [t.p[0] + t.H[0] * l, t.p[1] + t.H[1] * l, t.p[2] + t.H[2] * l];
          t.node = S.add(p[0], p[1], p[2], t.node, t.w * WID, 0); t.p = p; break;
        }
        case '!': t.w = m[1]; break;
        case '[': stack.push({ ...t }); break;
        case ']': t = stack.pop(); break;
        case '&': { const a = m[1] * DEG; t.H = rot(t.H, t.L, a); t.U = rot(t.U, t.L, a); break; } // pitch down
        case '+': { const a = m[1] * DEG; t.H = rot(t.H, t.U, a); t.L = rot(t.L, t.U, a); break; }
        case '-': { const a = -m[1] * DEG; t.H = rot(t.H, t.U, a); t.L = rot(t.L, t.U, a); break; }
        case '/': { const a = m[1] * DEG; t.L = rot(t.L, t.H, a); t.U = rot(t.U, t.H, a); break; } // roll
        case '$': { const V = [0, 1, 0]; const L = norm(cross(V, t.H)); t.L = L; t.U = cross(t.H, L); break; }
        default: break;
      }
    }
    // leaves at the tips
    const kids = new Uint8Array(S.n);
    for (let i = 1; i < S.n; i++) kids[S.par[i]] = 1;
    for (let i = 1; i < S.n; i++) if (!kids[i]) S.leaf[i] = 1;
    return S;
  }
  return {
    name: 'L-system', unit: 'step', max: 12,
    reset(seed, opts = {}) { P = { ...LS_DEFAULTS, ...opts }; n = 0; build(); },
    set(opts) { P = { ...P, ...opts }; build(); },
    step() { if (n >= 12) return false; n++; build(); return true; },
    get t() { return n; },
    skeleton: () => S,
    symbols: () => derive(n, P).length,
  };
}
