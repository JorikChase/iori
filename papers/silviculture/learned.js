// 2.10 Learned trees, at their smallest.
// The learned tree generators of 2024–2026 write a tree as a sequence of tokens and predict the next token from the
// ones before: Wang, Zhang, Klein, Michels, Yan & Wonka (SIGGRAPH Asia 2025) with a 79-million-parameter transformer
// over branch tokens in depth-first order, trained on trees from Rhizomorph's simulator; Lee et al. (2024) with a
// transformer over L-system strings, trained on 155,000 procedural trees. Neither runs in a page. What does run is
// the same idea with the smallest possible model: an n-gram, which predicts the next token from the last n − 1 by
// counting, trained here on §2.3's self-organising trees grown beside the wall.
//
// Tokens. The skeleton is walked depth first (the order Wang et al. found best). A segment becomes one token: its
// angle from its parent's direction (5° bins to 90°, nearest bin so that straight stays straight), its turn around
// the parent's axis measured from the side facing up (16 bins of 22.5°) and its length (3 bins); a fork opens with '['
// and a finished branch closes with ']'. Vocabulary 915. The n-gram backs off to shorter contexts where a context was never seen.
//
// What it cannot learn from a token stream: where the wall is. Nothing in a token says where in space the tree is,
// so the samples copy how the trees branch and not why.
import { Skeleton } from './skeleton.js?v=3';
import { createSelfOrg } from './selforg.js?v=3';
import { makeRng } from '../fractals/silviculture-core.js?v=3';

const NT = 19, NP = 16, NL = 3, BT = Math.PI / 36, BP = Math.PI / 8, OPEN = NT * NP * NL, CLOSE = OPEN + 1, END = OPEN + 2;
const LEN = [0.25, 0.5, 0.75]; // length bins: the self-organising tree's internodes are 0.25 m; merged chains are longer
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// a frame around direction h: e1 points as far up as it can, e2 = h × e1
function frame(h) {
  let up = [0, 1, 0]; if (Math.abs(h[1]) > 0.98) up = [1, 0, 0];
  const e1 = norm([up[0] - h[0] * dot(up, h), up[1] - h[1] * dot(up, h), up[2] - h[2] * dot(up, h)]);
  return [e1, cross(h, e1)];
}

export function tokenize(S) {
  const n = S.n, kids = Array.from({ length: n }, () => []);
  for (let i = 1; i < n; i++) if (S.par[i] >= 0) kids[S.par[i]].push(i);
  const out = [];
  const dirOf = (i) => { const p = S.par[i]; return norm([S.x[i] - S.x[p], S.y[i] - S.y[p], S.z[i] - S.z[p]]); };
  const tok = (i, hp) => {
    const h = dirOf(i), p = S.par[i], L = Math.hypot(S.x[i] - S.x[p], S.y[i] - S.y[p], S.z[i] - S.z[p]);
    const th = Math.acos(Math.max(-1, Math.min(1, dot(h, hp)))), [e1, e2] = frame(hp);
    let ph = Math.atan2(dot(h, e2), dot(h, e1)); if (ph < 0) ph += 2 * Math.PI;
    // nearest bin, so a straight segment stays straight (bin 0 is exactly 0°)
    const a = Math.min(NT - 1, Math.round(th / BT)), b = Math.round(ph / BP) % NP, c = L < 0.375 ? 0 : L < 0.625 ? 1 : 2;
    return (a * NP + b) * NL + c;
  };
  const walk = (i, hp) => { // node i's children, depth first; every child but the last in brackets
    const ks = kids[i];
    for (let k = 0; k < ks.length; k++) {
      const c = ks[k], last = k === ks.length - 1;
      if (!last) out.push(OPEN);
      out.push(tok(c, hp)); walk(c, dirOf(c));
      if (!last) out.push(CLOSE);
    }
  };
  walk(0, [0, 1, 0]);
  out.push(END);
  return out;
}

export function decode(tokens, S = new Skeleton(4096)) {
  S.clear(); S.add(0, 0, 0, -1, 0, 0);
  const stack = [];
  let node = 0, h = [0, 1, 0];
  for (const t of tokens) {
    if (t === END) break;
    if (t === OPEN) { stack.push([node, h]); continue; }
    if (t === CLOSE) { if (stack.length) [node, h] = stack.pop(); continue; }
    const c = t % NL, b = Math.floor(t / NL) % NP, a = Math.floor(t / (NL * NP));
    const th = a * BT, ph = b * BP, [e1, e2] = frame(h);
    const st = Math.sin(th), ct = Math.cos(th), cp = Math.cos(ph), sp = Math.sin(ph);
    const d = norm([h[0] * ct + (e1[0] * cp + e2[0] * sp) * st, h[1] * ct + (e1[1] * cp + e2[1] * sp) * st, h[2] * ct + (e1[2] * cp + e2[2] * sp) * st]);
    const L = LEN[c];
    node = S.add(S.x[node] + d[0] * L, Math.max(0.02, S.y[node] + d[1] * L), S.z[node] + d[2] * L, node, 0, 0);
    h = d;
  }
  const kids = new Uint8Array(S.n); for (let i = 1; i < S.n; i++) kids[S.par[i]] = 1;
  for (let i = 1; i < S.n; i++) if (!kids[i]) S.leaf[i] = 1;
  S.pipe(0.015, 2);
  return S;
}

// an n-gram with back-off: counts of the next token after every context of length 0 … n − 1
export function train(seqs, order) {
  const tables = Array.from({ length: order }, () => new Map());
  for (const s of seqs) for (let i = 0; i < s.length; i++) for (let k = 0; k < order; k++) {
    if (i - k < 0) break;
    const key = s.slice(i - k, i).join(','), m = tables[k];
    let row = m.get(key); if (!row) m.set(key, (row = new Map()));
    row.set(s[i], (row.get(s[i]) || 0) + 1);
  }
  return { order, tables, contexts: tables.reduce((a, m) => a + m.size, 0) };
}
export function sample(model, rng, maxLen, minLen = 0) {
  // the model does not know how deep in the brackets it is, so tokens that cannot come next (a close with nothing
  // open, an end before minLen) are left out of the draw; if a context offers nothing else, back off to a shorter one
  const out = [];
  let depth = 0;
  while (out.length < maxLen) {
    let t = -1;
    for (let k = Math.min(model.order - 1, out.length); k >= 0 && t < 0; k--) {
      const row = model.tables[k].get(out.slice(out.length - k).join(',')); if (!row) continue;
      let tot = 0; const ok = [];
      for (const [tk, v] of row) { if ((tk === CLOSE && depth === 0) || (tk === END && (out.length < minLen || depth > 0))) continue; ok.push([tk, v]); tot += v; }
      if (!tot) continue;
      let r = rng.next() * tot; for (const [tk, v] of ok) { r -= v; if (r <= 0) { t = tk; break; } }
      if (t < 0) t = ok[ok.length - 1][0];
    }
    if (t < 0 || t === END) break;
    if (t === OPEN) depth++; if (t === CLOSE) depth--;
    out.push(t);
  }
  while (depth-- > 0) out.push(CLOSE);
  out.push(END);
  return out;
}
export const tokenText = (t) => (t === OPEN ? '[' : t === CLOSE ? ']' : t === END ? '∎' : `${Math.floor(t / (NL * NP)) * 5}°/${((Math.floor(t / NL) % NP) * 22.5).toFixed(0)}°/${['s', 'm', 'l'][t % NL]}`);

// the lineage interface: train on K trees grown beside the wall (seeds 101…), sample with the figure's seed, and
// reveal the sample a few tokens per step, depth first, as the model writes it
const cache = new Map();
export function createLearned() {
  let P = { order: 4, trees: 8, show: 'sample' }, seq = [], k = 0, model = null, seed = 1;
  const S = new Skeleton(8192);
  function corpus(K) {
    const key = K; if (cache.has(key)) return cache.get(key);
    const seqs = [];
    for (let i = 0; i < K; i++) { const g = createSelfOrg(); g.reset(101 + i, { wall: true }); for (let y = 0; y < 15; y++) g.step(); seqs.push(tokenize(g.skeleton())); }
    cache.set(key, seqs); return seqs;
  }
  return {
    name: 'Learned tree', unit: 'token', max: 6000, reveal: 24,
    reset(s = 1, opts = {}) {
      seed = s; P = { ...P, ...opts }; k = 0;
      const seqs = corpus(P.trees);
      model = train(seqs, P.order);
      const meanLen = seqs.reduce((a, q) => a + q.length, 0) / seqs.length;
      seq = P.show === 'training' ? seqs[(seed - 1) % seqs.length] : sample(model, makeRng(seed * 977 + 1), Math.round(meanLen * 1.5), Math.round(meanLen * 0.8));
      decode([], S);
    },
    step() { if (k >= seq.length) return false; k = Math.min(seq.length, k + this.reveal); decode(seq.slice(0, k), S); return true; },
    get t() { return k; }, get done() { return k >= seq.length; },
    skeleton: () => S,
    tokens: () => ({ seq, k }), model: () => model,
  };
}
