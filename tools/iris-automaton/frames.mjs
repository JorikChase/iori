// node tools/iris-automaton/frames.mjs <ref> t1,t2,… [--crop x,y,w] → out/<ref>-frames.png (full-res frames side by side)
import { join, dirname } from 'node:path'; import { fileURLToPath } from 'node:url';
import { writePNG } from './png.mjs'; import { loadSheet } from './run.mjs';
import { createAutomaton } from '../../papers/iris-automaton/automaton.js';
const [ref, ts, , crop] = process.argv.slice(2); const T = ts.split(',').map(Number);
const { sheet } = loadSheet(ref); const A = createAutomaton(sheet); A.run(1, 5000);
const { W, H } = sheet; const [cx, cy, cw] = crop ? crop.split(',').map(Number) : [0, 0, W];
const out = new Uint8ClampedArray(cw * T.length * cw * 4), fr = new Uint8ClampedArray(W * H * 4);
T.forEach((t, j) => { A.compose(fr, A.depositsAt(t)); for (let y = 0; y < cw; y++) for (let x = 0; x < cw; x++) for (let c = 0; c < 4; c++) out[(y * cw * T.length + j * cw + x) * 4 + c] = fr[((y + cy) * W + x + cx) * 4 + c]; });
writePNG(join(dirname(fileURLToPath(import.meta.url)), 'out', `${ref}-frames.png`), cw * T.length, cw, out); console.log('tEnd', A.st.tEnd);
