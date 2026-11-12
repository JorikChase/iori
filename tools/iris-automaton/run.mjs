// tools/iris-automaton/run.mjs — runs A(eye, t) to the end on the sheets in papers/iris-automaton/data/<ref>/ and measures
// it against the engine's frame: the error per step (mean and max |O − L_K| in 8-bit levels, on the eye and on the whole
// crop), each stage's firing span, T_end, ms per step; writes tools/iris-automaton/out/<ref>.json and a strip of frames.
//   node tools/iris-automaton/run.mjs 26 09 35 25 [--every 10] [--strip 8] [--speed 1] [--seed 7]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPNG, writePNG } from './png.mjs';
import { createAutomaton, errorTo } from '../../papers/iris-automaton/automaton.js';
import { irisSheet } from '../../papers/iris-automaton/iris.js';

const HERE = dirname(fileURLToPath(import.meta.url)), DATA = join(HERE, '../../papers/iris-automaton/data'), OUT = join(HERE, 'out');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? +args[i + 1] : d; };
const refs = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
mkdirSync(OUT, { recursive: true });

export function loadSheet(ref, o = {}) {
    const meta = JSON.parse(readFileSync(join(DATA, ref, 'sheet.json'), 'utf8'));
    const im = s => readPNG(join(DATA, ref, s + '.png'));
    const f = im('fields'), images = { flat: im('flat').data, relief: im('relief').data, final: im('final').data };
    return { meta, sheet: irisSheet({ W: f.W, H: f.H, fields: f.data, images, seed: o.seed ?? 7, speed: o.speed ?? 1 }) };
}

function runOne(ref) {
    const every = opt('every', 10), nStrip = opt('strip', 8);
    const { meta, sheet } = loadSheet(ref, { seed: opt('seed', 7), speed: opt('speed', 1) });
    const A = createAutomaton(sheet), { W, H } = sheet, N = W * H;
    const eyeMask = sheet.fields.region, pic = new Float32Array(N * 3);
    const curve = [], t0 = performance.now();
    const meas = () => { A.compose(pic); const e = errorTo(sheet, pic, eyeMask), a = errorTo(sheet, pic); curve.push([+A.st.t.toFixed(2), +e.mean.toFixed(3), +e.max.toFixed(1), +a.mean.toFixed(3)]); };
    meas();
    let steps = 0;
    while (!A.st.done && A.st.t < 5000) { A.step(1); steps++; if (steps % every === 0) meas(); }
    const ms = (performance.now() - t0) / steps;
    // after the last firing every deposit still needs up to max D to finish
    while (A.st.t < A.st.tEnd) { A.step(1); steps++; if (steps % every === 0) meas(); }
    meas();
    // per layer: the firing span, what fired each cell, and causality: a cell fired by a neighbour must have a neighbour
    // (in the layer's domain) that fired strictly earlier — the check that nothing travels further than N(x) per firing
    const span = A.rules.map((r, k) => {
        let lo = Infinity, hi = -Infinity, viol = 0; const f = A.st.f[k], how = A.st.how[k], cnt = [0, 0, 0, 0, 0];
        for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
            cnt[how[i]]++; if (isFinite(f[i])) { lo = Math.min(lo, f[i]); hi = Math.max(hi, f[i]); }
            if (how[i] === 2) { let ok = false; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if ((dx || dy) && xx >= 0 && yy >= 0 && xx < W && yy < H) { const n = yy * W + xx; if (how[n] !== 4 && f[n] < f[i]) ok = true; } } if (!ok) viol++; }
        }
        const inD = N - cnt[4];
        return { name: r.name, first: +lo.toFixed(1), last: +hi.toFixed(1), cells: inD, source: cnt[1], spread: cnt[2], ember: cnt[3], emberShare: +(cnt[3] / Math.max(inD, 1)).toFixed(4), causalityViolations: viol };
    });
    const final = curve[curve.length - 1];
    // a strip of frames at even times (from the recorded firing times: exact)
    const S = 128, step = W / S, strip = new Uint8ClampedArray(S * nStrip * S * 4), frame = new Uint8ClampedArray(N * 4);
    for (let j = 0; j < nStrip; j++) {
        const t = A.st.tEnd * (j + 1) / nStrip;
        A.compose(frame, A.depositsAt(t));
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) for (let c = 0; c < 4; c++) {
            let a = 0; for (let yy = 0; yy < step; yy++) for (let xx = 0; xx < step; xx++) a += frame[((y * step + yy) * W + x * step + xx) * 4 + c];
            strip[(y * S * nStrip + j * S + x) * 4 + c] = a / (step * step);
        }
    }
    writePNG(join(OUT, `${ref}-strip.png`), S * nStrip, S, strip);
    const res = { ref, W, H, um_per_px: meta.um_per_px, stages: sheet.names, rules: A.rules, tEnd: +A.st.tEnd.toFixed(1), steps, msPerStep: +ms.toFixed(2), span,
                  finalError: { eyeMean: final[1], eyeMax: final[2], allMean: final[3] }, curve };
    writeFileSync(join(OUT, `${ref}.json`), JSON.stringify(res));
    console.log(ref, 'T_end', res.tEnd, 'steps', steps, res.msPerStep, 'ms/step', 'final err (eye mean/max, all mean)', final.slice(1).join(' / '));
    console.log('  ', span.map(s => `${s.name} ${s.first}–${s.last} src ${s.source} spr ${s.spread} emb ${s.ember} viol ${s.causalityViolations}`).join('\n   '));
    return res;
}

if (process.argv[1].endsWith("run.mjs")) for (const r of refs.length ? refs : ['26', '09', '35', '25']) runOne(r);
