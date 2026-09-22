// Known answers for fixture.js (Tero 2010 metrics) — `node petri/tests/fixture.test.mjs`
import { teroMetrics, bridges, pointMST, fixture36 } from '../fixture.js';
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'pass' : 'FAIL'}  ${name}  ${detail}`); if (!ok) failed++; };
const sq = [[0, 0], [10, 0], [10, 10], [0, 10]];

// 1. A network that IS the MST scores TL_MST 1, MD_MST 1, FT 0 (every link is a bridge between sources).
{
  const net = { nodes: sq, edges: [[0, 1, 10], [1, 2, 10], [2, 3, 10]], D: [1, 1, 1] };
  const m = teroMetrics(net, sq);
  check('MST scores (1, 1, 0)', m.TL_MST === 1 && m.MD_MST === 1 && m.FT === 0, JSON.stringify(m));
}
// 2. A ring over the same four sources: 4/3 of the MST, shorter mean paths, no bridges -> FT 1.
{
  const net = { nodes: sq, edges: [[0, 1, 10], [1, 2, 10], [2, 3, 10], [3, 0, 10]], D: [1, 1, 1, 1] };
  const m = teroMetrics(net, sq);
  check('ring scores (1.333, <1, 1)', m.TL_MST === 1.333 && m.MD_MST < 1 && m.FT === 1, JSON.stringify(m));
}
// 3. A dangling spur with no food on it is a bridge but isolates no source: it must NOT count against FT.
{
  const nodes = [...sq, [20, 0]];
  const net = { nodes, edges: [[0, 1, 10], [1, 2, 10], [2, 3, 10], [3, 0, 10], [1, 4, 10]], D: [1, 1, 1, 1, 1] };
  const m = teroMetrics(net, sq);
  check('food-free spur does not reduce FT', m.FT === 1, JSON.stringify(m));
}
// 4. Edges below the conductivity threshold are not tubes.
{
  const net = { nodes: sq, edges: [[0, 1, 10], [1, 2, 10], [2, 3, 10], [3, 0, 10]], D: [1, 1, 1, 0.001] };
  const m = teroMetrics(net, sq);
  check('dead vein is not a tube', m.TL_MST === 1 && m.FT === 0, JSON.stringify(m));
}
// 5. Tarjan bridges on a theta graph with a tail: only the tail is a bridge.
{
  const br = bridges(4, [[0, 1], [1, 2], [2, 0], [2, 3]]);
  check('bridges', br.join('') === '0001', br.join(''));
}
// 6. The fixture is deterministic and has Tero's 36 sources.
{
  const a = fixture36(), b = fixture36();
  check('fixture36 deterministic, 36 sources', a.length === 36 && JSON.stringify(a) === JSON.stringify(b), `${a.length} sources, MST ${pointMST(a).length.toFixed(1)} mm`);
}
process.exit(failed ? 1 : 0);
