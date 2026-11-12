// papers/iris-automaton/figures.js — the paper's live figures. Everything runs the same automaton.js + iris.js as the
// Node runner (tools/iris-automaton/run.mjs), on the sheets in papers/iris-automaton/data/<ref>/.
import { createAutomaton, errorTo } from './automaton.js?v=2';
import { irisSheet, STAGES } from './iris.js?v=2';

const BASE = new URL('./', import.meta.url).href;
export const EYES = ['26', '09', '35', '25'];

async function pixels(url) {
    const b = await (await fetch(url)).blob(), bm = await createImageBitmap(b, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    const c = new OffscreenCanvas(bm.width, bm.height), g = c.getContext('2d', { colorSpace: 'srgb' }); g.drawImage(bm, 0, 0);
    return { W: bm.width, H: bm.height, data: g.getImageData(0, 0, bm.width, bm.height).data };
}
const cache = new Map();
export function eyeAutomaton(ref, seed = 7) {
    const key = ref + '/' + seed;
    if (!cache.has(key)) cache.set(key, (async () => {
        const d = BASE + 'data/' + ref + '/';
        const [f, rg, flat, relief, fin] = await Promise.all(['fields', 'region', 'flat', 'relief', 'final'].map(s => pixels(d + s + '.png')));
        const sheet = irisSheet({ W: f.W, H: f.H, fields: f.data, region: rg.data, images: { flat: flat.data, relief: relief.data, final: fin.data }, seed });
        return createAutomaton(sheet);
    })());
    return cache.get(key);
}
// advance an automaton until its clock reaches t (or it ends), a few ms at a time
function advance(A, t, budgetMs = 10) {
    const t0 = performance.now();
    while (A.st.t < Math.min(t, A.st.done ? A.st.tEnd : Infinity) && performance.now() - t0 < budgetMs) A.step(1);
}
const TEND = 780;                                   // ≈ T_end for every eye at speed 1 (measured 763–778)

// colour maps
const viridis = t => { t = Math.max(0, Math.min(1, t)); return [68 + t * (253 - 68) * (t > 0.5 ? 1 : 0.6), 1 + 230 * t, 84 + (t < 0.5 ? 60 * t : 30 - 20 * t) + 20]; };
const HOW = [[255, 255, 255], [20, 20, 20], [70, 140, 220], [230, 90, 40], [235, 235, 235]];   // –, source, neighbour, ember, outside

// ---------------------------------------------------------------- figure 1: the automaton on one eye
export async function liveFigure(fig) {
    if (fig.dataset.started) return; fig.dataset.started = '1';
    const cv = fig.querySelector('canvas.main'), g = cv.getContext('2d'), zc = fig.querySelector('canvas.zoom'), zg = zc.getContext('2d');
    const q = n => fig.querySelector(`[name=${n}]`), status = fig.querySelector('.figstatus'), info = fig.querySelector('.cell');
    const stageBox = fig.querySelector('.stages');
    STAGES.slice(1).forEach((s, k) => { const l = document.createElement('label'); l.innerHTML = `<input type="checkbox" data-k="${k}" checked> ${s}`; stageBox.appendChild(l); });
    EYES.forEach(r => q('eye').add(new Option('eye ' + r, r)));
    STAGES.slice(1).forEach((s, k) => q('layer').add(new Option(s, k)));
    let A = null, img = null, T = 0, playing = true, pick = null, loadId = 0;
    async function load() {
        const id = ++loadId; status.textContent = 'loading eye ' + q('eye').value + '…';
        const a = await eyeAutomaton(q('eye').value, +q('seed').value);
        if (id !== loadId) return;
        A = a; cv.width = A.sheet.W; cv.height = A.sheet.H; img = g.createImageData(A.sheet.W, A.sheet.H); T = playing ? 0 : T;
        A.st.on.forEach((_, k) => A.st.on[k] = stageBox.querySelector(`[data-k="${k}"]`).checked);
    }
    const dep = () => A.depositsAt(T);
    function draw() {
        const { W, H, fields: F } = A.sheet, N = W * H, view = q('view').value, k = +q('layer').value, d = img.data;
        if (view === 'picture' || view === 'error') {
            A.compose(d, dep());
            if (view === 'error') { const L = A.sheet.layers[A.sheet.layers.length - 1]; for (let i = 0; i < N; i++) { let e = 0; for (let c = 0; c < 3; c++) e += Math.abs(d[i * 4 + c] - L[i * 3 + c] * 255); e = Math.min(1, e / 3 / 64); d[i * 4] = 255 * Math.sqrt(e); d[i * 4 + 1] = 40 + 120 * e * (1 - e); d[i * 4 + 2] = 30 + 60 * (1 - e); } }
        } else if (view === 'arrival') {
            const f = A.st.f[k];
            for (let i = 0; i < N; i++) { const t = f[i]; const c = !isFinite(t) || t > T ? [250, 250, 250] : viridis(t / TEND); d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255; }
        } else {                                                     // what fired each cell
            const how = A.st.how[k], f = A.st.f[k];
            for (let i = 0; i < N; i++) { const c = HOW[f[i] <= T || how[i] === 4 ? how[i] : 0]; d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255; }
        }
        g.putImageData(img, 0, 0);
        if (pick) { g.strokeStyle = '#e33'; g.lineWidth = 1; g.strokeRect(pick[0] - 7.5, pick[1] - 7.5, 15, 15); }
        const e = errorTo(A.sheet, (A._pic ||= new Float32Array(N * 3)).fill(0) && A.compose(A._pic, dep()), F.region);
        status.textContent = `t = ${T.toFixed(0)}${A.st.done ? ' of ' + A.st.tEnd.toFixed(0) : ' (computing ' + A.st.t.toFixed(0) + ')'} · error to the engine's frame on the eye: ${e.mean.toFixed(2)} levels mean, ${e.max.toFixed(0)} max`;
        q('t').value = T;
        if (pick) drawCell();
    }
    function drawCell() {
        const [px, py] = pick, { W, H, fields: F } = A.sheet, k = +q('layer').value, f = A.st.f[k], how = A.st.how[k], R = 7, s = zc.width / (2 * R + 1);
        let tmin = Infinity, tmax = -Infinity;
        for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) { const xx = px + x, yy = py + y; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const t = f[yy * W + xx]; if (isFinite(t)) { tmin = Math.min(tmin, t); tmax = Math.max(tmax, t); } }
        zg.clearRect(0, 0, zc.width, zc.height); zg.font = `${Math.floor(s * 0.32)}px Inter, sans-serif`; zg.textAlign = 'center'; zg.textBaseline = 'middle';
        for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
            const xx = px + x, yy = py + y; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const i = yy * W + xx, t = f[i];
            const c = isFinite(t) && t <= T ? viridis((t - tmin) / Math.max(tmax - tmin, 1)) : [245, 245, 245];
            zg.fillStyle = `rgb(${c.map(Math.round)})`; zg.fillRect((x + R) * s, (y + R) * s, s - 1, s - 1);
            if (Math.abs(x) <= 1 && Math.abs(y) <= 1 && isFinite(t) && t > -1e9) { zg.fillStyle = '#000'; zg.fillText(t.toFixed(0), (x + R + 0.5) * s, (y + R + 0.5) * s); }
        }
        zg.strokeStyle = '#e33'; zg.lineWidth = 2; zg.strokeRect(R * s, R * s, s - 1, s - 1); zg.strokeStyle = '#333'; zg.lineWidth = 1; zg.strokeRect((R - 1) * s, (R - 1) * s, 3 * s - 1, 3 * s - 1);
        const i = py * W + px, names = ['not yet', 'a source', 'a neighbour', 'the ember', 'outside the layer'];
        const fmt = t => t === -Infinity ? 'at once' : !isFinite(t) ? 'not yet' : t.toFixed(1);
        info.innerHTML = `cell (${px}, ${py}) · θ ${(F.theta[i] * 180 / Math.PI).toFixed(0)}° · crest ${F.crest[i].toFixed(2)} · crypt ${F.crypt[i].toFixed(2)} · ρ ${F.rho[i].toFixed(2)}${F.pupil[i] ? ' · pupil' : ''}<br>` +
            STAGES.slice(1).map((s, j) => `${j === k ? '<b>' : ''}${s}: fired ${fmt(A.st.f[j][i])} by ${names[A.st.how[j][i]]}${j === k ? '</b>' : ''}`).join(' · ');
    }
    q('eye').onchange = q('seed').onchange = async () => { await load(); draw(); };
    stageBox.onchange = e => { const k = +e.target.dataset.k; if (A) A.st.on[k] = e.target.checked; draw(); };
    q('t').oninput = () => { T = +q('t').value; playing = false; q('play').textContent = 'play'; if (A) { T = Math.min(T, A.st.done ? A.st.tEnd : A.st.t); draw(); } };
    q('view').onchange = q('layer').onchange = () => draw();
    q('play').onclick = () => { playing = !playing; if (playing && A && A.st.done && T >= A.st.tEnd) T = 0; q('play').textContent = playing ? 'pause' : 'play'; };
    q('restart').onclick = () => { T = 0; playing = true; q('play').textContent = 'pause'; };
    cv.onclick = e => { const r = cv.getBoundingClientRect(); pick = [Math.floor((e.clientX - r.left) / r.width * cv.width), Math.floor((e.clientY - r.top) / r.height * cv.height)]; draw(); };
    q('t').max = TEND;
    await load();
    let visible = true; new IntersectionObserver(es => { visible = es.some(x => x.isIntersecting); }).observe(fig);
    (function loop() {
        if (visible && A) {
            if (playing) T = Math.min(T + +q('speed').value, A.st.done ? A.st.tEnd : T + +q('speed').value);
            advance(A, T + 1, 12);
            if (!A.st.done && T > A.st.t) T = A.st.t;               // the display never runs ahead of the automaton
            if (A.st.done && T >= A.st.tEnd && playing) { playing = false; q('play').textContent = 'play'; }
            draw();
        }
        requestAnimationFrame(loop);
    })();
}

// ---------------------------------------------------------------- figure 2: convergence on every eye (the runner's numbers)
export async function convergenceFigure(fig) {
    if (fig.dataset.started) return; fig.dataset.started = '1';
    const data = await (await fetch(BASE + 'data/convergence.json')).json(), svg = fig.querySelector('svg');
    const W = 640, H = 300, m = { l: 48, r: 16, t: 14, b: 36 }, X = t => m.l + t / TEND * (W - m.l - m.r);
    const ymax = Math.max(...Object.values(data).flatMap(d => d.curve.map(c => c[1]))), Y = e => H - m.b - e / ymax * (H - m.t - m.b);
    const col = { '26': '#2f6b3a', '09': '#2a6fb0', '35': '#7a7a7a', '25': '#b07a2a' };
    let s = `<g font-family="Inter, sans-serif" font-size="11" fill="currentColor">`;
    for (let e = 0; e <= ymax; e += 20) s += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(e)}" y2="${Y(e)}" stroke="currentColor" stroke-opacity="0.12"/><text x="${m.l - 6}" y="${Y(e) + 4}" text-anchor="end">${e}</text>`;
    for (let t = 0; t <= TEND; t += 100) s += `<text x="${X(t)}" y="${H - m.b + 16}" text-anchor="middle">${t}</text>`;
    const r0 = data['26'].rules;
    r0.forEach(r => s += `<line x1="${X(r.start)}" x2="${X(r.start)}" y1="${m.t}" y2="${H - m.b}" stroke="currentColor" stroke-opacity="0.25" stroke-dasharray="3 3"/><text x="${X(r.start) + 3}" y="${m.t + 10}" font-size="10" opacity="0.7">${r.name}</text>`);
    s += `<text x="${(W + m.l) / 2}" y="${H - 4}" text-anchor="middle">time (steps)</text><text transform="translate(12 ${H / 2}) rotate(-90)" text-anchor="middle">mean |O − rendering| (8-bit levels)</text>`;
    for (const [ref, d] of Object.entries(data)) {
        s += `<polyline fill="none" stroke="${col[ref]}" stroke-width="1.6" points="${d.curve.map(c => X(c[0]).toFixed(1) + ',' + Y(c[1]).toFixed(1)).join(' ')}"/>`;
        const last = d.curve[d.curve.length - 1]; s += `<text x="${X(last[0]) - 4}" y="${Y(last[1]) - 6 - 12 * EYES.indexOf(ref)}" text-anchor="end" fill="${col[ref]}">eye ${ref}: ${last[1]} at t = ${d.tEnd}</text>`;
    }
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.innerHTML = s + '</g>';
    const tb = document.querySelector('table.conv tbody');
    tb.innerHTML = Object.values(data).map(d => `<tr><td>${d.ref}</td><td>${d.tEnd}</td><td>${d.finalError.eyeMean} / ${d.finalError.eyeMax}</td><td>${d.span.reduce((a, s) => a + s.causalityViolations, 0)}</td><td>${(100 * d.span.reduce((a, s) => a + s.ember, 0) / d.span.reduce((a, s) => a + s.cells, 0)).toFixed(2)} %</td><td>${d.msPerStep}</td></tr>`).join('');
}

// ---------------------------------------------------------------- figure 3: the same rules on four eyes, one clock
export async function fourFigure(fig) {
    if (fig.dataset.started) return; fig.dataset.started = '1';
    const cv = fig.querySelector('canvas'), g = cv.getContext('2d'), q = n => fig.querySelector(`[name=${n}]`), status = fig.querySelector('.figstatus');
    const As = await Promise.all(EYES.map(r => eyeAutomaton(r)));
    const S = As[0].sheet.W; cv.width = S * 2; cv.height = S * 2; const img = g.createImageData(S, S);
    let T = 0, playing = true, visible = true;
    new IntersectionObserver(es => { visible = es.some(x => x.isIntersecting); }).observe(fig);
    const paint = () => {
        T = Math.min(T, ...As.map(A => A.st.done ? Infinity : A.st.t));      // never ahead of any of the four
        As.forEach((A, j) => { A.compose(img.data, A.depositsAt(T)); g.putImageData(img, (j % 2) * S, (j >> 1) * S); });
        g.font = '14px Inter, sans-serif'; g.fillStyle = '#555'; EYES.forEach((r, j) => g.fillText('eye ' + r, (j % 2) * S + 8, (j >> 1) * S + 20));
        q('t').value = T; status.textContent = `t = ${T.toFixed(0)}`;
    };
    q('t').max = TEND; q('t').oninput = () => { T = +q('t').value; playing = false; q('play').textContent = 'play'; paint(); };
    q('play').onclick = () => { playing = !playing; if (playing && T >= TEND) T = 0; q('play').textContent = playing ? 'pause' : 'play'; };
    (function loop() {
        if (visible) {
            if (playing) T = Math.min(TEND, T + 2);
            As.forEach(A => advance(A, T + 1, 4));
            paint();
            if (T >= TEND && playing) { playing = false; q('play').textContent = 'play'; }
        }
        requestAnimationFrame(loop);
    })();
}
