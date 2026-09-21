// Known-answer test for graph.js — a 3x3 lattice of bars. Topology: the four corners are bends (degree 2
// in the skeleton), so the graph is 4 T-junctions + 1 centre = 5 nodes, 8 edges, 4 loops.
import { skeleton, distanceTransform, buildGraph, networkStats } from '../graph.js';
const n = 128, m = new Uint8Array(n * n);
const disc = (cx, cy, r) => { for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (Math.hypot(x - cx, y - cy) <= r) m[y * n + x] = 1; };
const bar = (x0, y0, x1, y1, w) => { for (let t = 0; t <= 1; t += 0.002) disc(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, w); };
const P = [20, 64, 108];
for (const y of P) for (let k = 0; k < 2; k++) bar(P[k], y, P[k + 1], y, 2.5);
for (const x of P) for (let k = 0; k < 2; k++) bar(x, P[k], x, P[k + 1], 2.5);
const g = buildGraph(skeleton(m, n), distanceTransform(m, n), n, 0.05);
const st = networkStats(g);
const ok = g.nodes.length === 5 && g.edges.length === 8 && st.degreeHistogram[3] === 4 && st.degreeHistogram[4] === 1;
console.log(`${ok ? 'pass' : 'FAIL'}  lattice topology  nodes ${g.nodes.length} (5), edges ${g.edges.length} (8), degrees ${JSON.stringify(st.degreeHistogram)} ({3:4,4:1}), width ${st.meanWidth_mm} mm`);
process.exit(ok ? 0 : 1);
