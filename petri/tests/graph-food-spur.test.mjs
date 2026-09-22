// A short dead end off a straight vein: pruned as thinning noise when nothing is at its tip, kept when
// a food source is (buildGraph keepTips). The spur is ~10 cells long and ~4 wide, under
// the 3-widths rule, so it goes unless food protects it.
import { skeleton, distanceTransform, buildGraph } from '../graph.js';
const n = 128, cm = 0.05, m = new Uint8Array(n * n);
const disc = (cx, cy, r) => { for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (Math.hypot(x - cx, y - cy) <= r) m[y * n + x] = 1; };
const bar = (x0, y0, x1, y1, w) => { for (let t = 0; t <= 1; t += 0.002) disc(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, w); };
bar(10, 64, 118, 64, 4); bar(64, 64, 64, 72, 2);             // vein + a short branch downward
const skel = skeleton(m, n), dist = distanceTransform(m, n);
const plain = buildGraph(skel, dist, n, cm);
const tip = [64 * cm, 72 * cm, 0.1];
const fed = buildGraph(skel, dist, n, cm, { keepTips: [tip], tipReach: 0.3 });
const far = buildGraph(skel, dist, n, cm, { keepTips: [[20 * cm, 20 * cm, 0.1]], tipReach: 0.3 });
const ok = plain.edges.length === 2 && fed.edges.length === 3 && far.edges.length === 2;
console.log(`${ok ? 'pass' : 'FAIL'}  food spur  edges plain ${plain.edges.length} (2), food at tip ${fed.edges.length} (3), food elsewhere ${far.edges.length} (2)`);
process.exit(ok ? 0 : 1);
