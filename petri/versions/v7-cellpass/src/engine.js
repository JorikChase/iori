// engine.js — the petri engine core (P1): a 96 mm square of cells around a 90 mm dish, eight organism
// slots, ten kernels (kernels.js), organisms as data (catalog.js). Everything that changes the dish is an
// OPERATION with a step stamp; a Dish ID is seed + dish + ops and replays deterministically.
// Units: the API speaks millimetres (origin dish centre, +x right, +y up); the grid speaks cells.
import { CELL_PASS, AGENT_PASS, AGENT_DIVIDE, STAMP_PASS, AGENT_ERASE, AGENT_STRIDE, AGENT_BYTES, KERNELS } from './kernels.js';
import { CATALOG, byId, hexToRgb } from './catalog.js';
import { RENDER, MODES } from './render.js';

export const DISH_MM = 45, SPAN_MM = 96, SLOTS = 8;
export const QUALITY = { draft: { n: 1024, agents: 1 << 20 }, normal: { n: 2048, agents: 1 << 22 }, fine: { n: 4096, agents: 1 << 23 } };
const SIM_BYTES = 48 + 9 * 16 * 3, VIEW_BYTES = 48 + 36 * 16;
const KIND = { inoculate: 0, nutrient: 1, toxin: 2, attract: 3, erase: 4, scratch: 5, pour: 6, flake: 7 };

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export async function createEngine(canvas, opts = {}) {
  if (!navigator.gpu) throw new Error('WebGPU is not available in this browser');
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('no WebGPU adapter');
  const quality = QUALITY[opts.quality] ? opts.quality : 'normal';
  const want = QUALITY[quality].n ** 2 * 16;
  if (want > adapter.limits.maxStorageBufferBindingSize) throw new Error(`quality "${quality}" needs ${want >> 20} MB buffers; this GPU allows ${adapter.limits.maxStorageBufferBindingSize >> 20} MB`);
  const hasTs = adapter.features.has('timestamp-query');
  const device = await adapter.requestDevice({
    requiredFeatures: hasTs ? ['timestamp-query'] : [],
    requiredLimits: { maxStorageBufferBindingSize: Math.max(want, 134217728), maxBufferSize: Math.max(want, QUALITY[quality].agents * AGENT_BYTES, 268435456) },
  });
  const E = { device, canvas, quality, errors: [], MODES, CATALOG, KERNELS, hasTs };
  device.addEventListener('uncapturederror', (e) => { E.errors.push(String(e.error.message).slice(0, 400)); console.error('[petri gpu]', e.error.message); });
  const ctx = canvas.getContext('webgpu'); const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: 'opaque' });

  const n = QUALITY[quality].n, cells = n * n, maxAgents = QUALITY[quality].agents;
  E.n = n; E.cellMm = SPAN_MM / n; E.maxAgents = maxAgents;
  // Substrate diffusion is declared physically and converted per tier: D_cells = D_ref * (ref/cell)^2.
  // Explicit diffusion is stable to ~0.25 and the fastest channel here runs at 1.2x, so the factor is
  // capped at 0.16; a tier past the cap needs substeps (fine does - see HANDOFF).
  const DN_REF = 0.15, CELL_REF = SPAN_MM / QUALITY.normal.n;
  E.dnWanted = DN_REF * (CELL_REF / E.cellMm) ** 2;
  E.dn = Math.min(E.dnWanted, 0.16);
  E.dnClamped = E.dnWanted > E.dn;
  const SB = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;
  const buf = (size, usage = SB) => device.createBuffer({ size, usage });
  const B = { cells: [buf(cells * 16), buf(cells * 16)], sub: [buf(cells * 16), buf(cells * 16)], dep: buf(cells * 4), depId: buf(cells * 4),
    flake: buf(cells * 4), agents: buf(maxAgents * AGENT_BYTES), order: buf(maxAgents * 4), cond: buf(Math.max(256, n / 4) ** 2 * 4), sim: buf(SIM_BYTES, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST), view: buf(VIEW_BYTES, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST) };
  E.buffers = B;
  // P2 conductivity field: Tero conductivity of the adaptive slot's veins, rasterised by the graph
  // worker onto a gn x gn grid (a quarter of the cell grid) and read by the agent, cell and render passes.
  const gn = Math.max(256, n / 4);
  E.gn = gn;
  // GPU timing: a two-slot query set resolved into a mapped ring, so reading it never stalls the
  // queue. Falls back to wall clock around onSubmittedWorkDone when the feature is absent.
  const TS = hasTs ? { set: device.createQuerySet({ type: 'timestamp', count: 2 }),
    resolve: buf(16, GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC),
    read: device.createBuffer({ size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }),
    busy: false, ms: 0 } : null;
  E.gpuMs = () => (TS ? TS.ms : 0);

  const mk = async (code, label) => {
    const module = device.createShaderModule({ code, label });
    const info = await module.getCompilationInfo();
    const bad = info.messages.filter((m) => m.type === 'error');
    if (bad.length) throw new Error(`${label}: ` + bad.map((m) => `${m.lineNum}:${m.linePos} ${m.message}`).join(' | '));
    return module;
  };
  const cp = async (code, label) => device.createComputePipelineAsync({ label, layout: 'auto', compute: { module: await mk(code, label), entryPoint: 'main' } });
  const [pCell, pAgent, pDivide, pStamp, pErase] = await Promise.all([cp(CELL_PASS, 'cell'), cp(AGENT_PASS, 'agent'), cp(AGENT_DIVIDE, 'divide'), cp(STAMP_PASS, 'stamp'), cp(AGENT_ERASE, 'erase')]);
  const rmod = await mk(RENDER, 'render');
  const pRender = await device.createRenderPipelineAsync({ label: 'render', layout: 'auto', vertex: { module: rmod, entryPoint: 'vs' }, fragment: { module: rmod, entryPoint: 'fs', targets: [{ format }] }, primitive: { topology: 'triangle-list' } });
  const bg = (p, list) => device.createBindGroup({ layout: p.getBindGroupLayout(0), entries: list.map((b, i) => ({ binding: i, resource: { buffer: b } })) });
  // [cur] = the state being read this step
  const G = { cell: [0, 1].map((k) => bg(pCell, [B.sim, B.cells[k], B.cells[1 - k], B.sub[k], B.sub[1 - k], B.dep, B.depId, B.cond, B.flake])),
    agent: [0, 1].map((k) => bg(pAgent, [B.sim, B.agents, B.cells[k], B.sub[k], B.dep, B.depId, B.cond])),
    divide: bg(pDivide, [B.sim, B.agents]),
    render: [0, 1].map((k) => bg(pRender, [B.sim, B.view, B.cells[k], B.sub[k], B.cond])) };

  // ------------------------------------------------------------------ state
  const S = E.sim = { step: 0, seed: 1, cur: 0, agentHigh: 0, dish: { nutrient: 0.5, agar: 0.5, temp: 1 }, slots: Array(SLOTS + 1).fill(null), ops: [], pending: [], nInoc: 0,
    adapt: null, graphStep: -1 };
  E.graph = { busy: null, field: new Float32Array(gn * gn), stats: null, history: [] };
  E.view = { center: [0, 0], mmPerPx: SPAN_MM / 900, mode: 0, exposure: 1, reticle: true, ghost: false, cursor: [0, 0], toolR: 1 };
  E.playing = false; E.spf = 1; E.stepMs = 0; E.frameMs = 0;

  const simData = new ArrayBuffer(SIM_BYTES), simU = new Uint32Array(simData), simF = new Float32Array(simData);
  function writeSim() {
    simU[0] = n; simU[1] = S.step; simU[2] = S.seed >>> 0; simU[3] = S.agentHigh;
    simF[4] = DISH_MM / E.cellMm; simF[5] = S.dish.agar; simF[6] = S.dish.temp; simF[7] = E.dn; simF[8] = E.cellMm;
    simF[9] = S.adapt ? S.adapt.betaD : 0; simF[10] = S.adapt ? S.adapt.slot : 0; simF[11] = gn;
    for (let s = 0; s <= SLOTS; s++) {
      const sl = S.slots[s], o = 12 + s * 4;
      simU[o] = sl ? sl.kernel : 0;
      for (let k = 0; k < 4; k++) { simF[o + 36 + k] = sl ? sl.P[k] : 0; simF[o + 72 + k] = sl ? sl.Q[k] : 0; }
    }
    device.queue.writeBuffer(B.sim, 0, simData);
  }
  const viewData = new ArrayBuffer(VIEW_BYTES), viewF = new Float32Array(viewData), viewU = new Uint32Array(viewData);
  function writeView() {
    const v = E.view;
    viewF[0] = canvas.width; viewF[1] = canvas.height; viewF[2] = v.center[0]; viewF[3] = v.center[1];
    viewF[4] = v.mmPerPx * (E.cssW ? E.cssW / canvas.width : 1); viewU[5] = v.mode; viewF[6] = v.exposure; viewF[7] = S.step;
    viewF[8] = v.cursor[0]; viewF[9] = v.cursor[1]; viewF[10] = v.toolR; viewU[11] = (v.reticle ? 1 : 0) | (v.ghost ? 2 : 0);
    for (let s = 0; s <= SLOTS; s++) { const sl = S.slots[s]; for (let k = 0; k < 4; k++) { const c = sl ? hexToRgb(sl.ramp[k]) : [0, 0, 0]; viewF.set([c[0] ** 2.2, c[1] ** 2.2, c[2] ** 2.2, 1], 12 + (s * 4 + k) * 4); } }
    device.queue.writeBuffer(B.view, 0, viewData);
  }

  // ------------------------------------------------------------------ stamps: the only way state is touched from outside
  function stamp(kind, cx, cy, r, amount, slot, salt) {
    const d = new ArrayBuffer(32), f = new Float32Array(d), u = new Uint32Array(d);
    f[0] = cx; f[1] = cy; f[2] = r; f[3] = amount; u[4] = kind; u[5] = slot; u[6] = salt >>> 0;
    const U = buf(32, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST); device.queue.writeBuffer(U, 0, d);
    writeSim();
    const enc = device.createCommandEncoder(); const pass = enc.beginComputePass();
    pass.setPipeline(pStamp); pass.setBindGroup(0, bg(pStamp, [B.sim, U, B.cells[S.cur], B.sub[S.cur], B.flake]));
    const span = kind === KIND.pour ? n : Math.min(n, Math.ceil(2 * r) + 3);
    pass.dispatchWorkgroups(Math.ceil(span / 16), Math.ceil(span / 16));
    if (kind === KIND.erase && S.agentHigh) { pass.setPipeline(pErase); pass.setBindGroup(0, bg(pErase, [B.sim, U, B.agents])); pass.dispatchWorkgroups(Math.ceil(S.agentHigh / 256)); }
    pass.end(); device.queue.submit([enc.finish()]); U.destroy();
  }
  const toCell = (mm) => [mm[0] / E.cellMm + n / 2, mm[1] / E.cellMm + n / 2];

  function slotFor(orgId) {
    let s = S.slots.findIndex((sl) => sl && sl.org === orgId); if (s > 0) return s;
    s = S.slots.findIndex((sl, i) => i > 0 && !sl); if (s < 0) return 0;
    const o = byId(orgId); if (!o) return 0;
    S.slots[s] = { org: o.id, name: o.name, kernel: o.kernel, P: [...o.P], Q: [...o.Q], ramp: [...o.ramp], adapt: o.adapt ? { ...o.adapt } : null };
    if (o.adapt && !S.adapt) S.adapt = { slot: s, ...o.adapt };   // P2 supports one adaptive organism per dish
    return s;
  }
  // Founder density. Each founder permanently owns AGENT_STRIDE slots (itself + 6 generations), so
  // the density decides how many inoculations a dish can take: at 1.5 founders per cell a 2 mm
  // needle stab claimed 8192 blocks and the eighth inoculation of a dish silently did nothing.
  // 0.15 per cell still reaches the same saturated population (64x per founder) and leaves room for
  // ~75 stabs at normal.
  const FOUNDERS_PER_CELL = 0.15, FOUNDER_CAP = 4096;
  E.agentBlocksFree = () => Math.floor((maxAgents - S.agentHigh) / AGENT_STRIDE);
  function spawnAgents(slot, c, rc, salt) {
    const M = Math.min(FOUNDER_CAP, Math.max(48, Math.round(Math.PI * rc * rc * FOUNDERS_PER_CELL)), E.agentBlocksFree());
    if (M <= 0) return 0;
    const data = new ArrayBuffer(M * AGENT_STRIDE * AGENT_BYTES), f = new Float32Array(data), u = new Uint32Array(data), rng = mulberry32(salt);
    for (let k = 0; k < M; k++) {
      const o = k * AGENT_STRIDE * 6, a = rng() * Math.PI * 2, rad = Math.sqrt(rng()) * rc;
      f[o] = c[0] + Math.cos(a) * rad; f[o + 1] = c[1] + Math.sin(a) * rad; f[o + 2] = rng() * Math.PI * 2; f[o + 3] = rng(); u[o + 4] = slot;
    }
    device.queue.writeBuffer(B.agents, S.agentHigh * AGENT_BYTES, data);
    S.agentHigh += M * AGENT_STRIDE; return M;
  }

  // op = { t, tool, at:[x,y] | path:[[x,y],…], r, organism?, amount?, slot?, P?, Q?, nutrient?, agar?, temp? }
  function applyOp(op, index) {
    const salt = Math.imul((S.seed >>> 0) ^ 0x9E3779B9, index + 1) >>> 0;
    const pts = op.path || [op.at], rc = (op.r ?? 1) / E.cellMm;
    switch (op.tool) {
      case 'inoculate': {
        const slot = slotFor(op.organism);
        if (!slot) { E.lastRefusal = 'all eight organism slots are in use'; return false; }
        let agents = 0, wanted = 0;
        pts.forEach((mm, k) => {
          const c = toCell(mm); stamp(KIND.inoculate, c[0], c[1], rc, 1, slot, salt + k);
          if (S.slots[slot].kernel === 1) { wanted++; agents += spawnAgents(slot, c, rc, salt + k); }
        });
        if (wanted && !agents) { E.lastRefusal = 'the agent pool is full — pour a new dish'; return false; }
        S.nInoc++; break;
      }
      case 'nutrient': case 'toxin': case 'attract': case 'erase': case 'scratch': case 'flake':
        pts.forEach((mm, k) => { const c = toCell(mm); stamp(KIND[op.tool], c[0], c[1], rc, op.amount ?? 1, 0, salt + k); }); break;
      case 'param': { const sl = S.slots[op.slot]; if (sl) { if (op.P) sl.P = [...op.P]; if (op.Q) sl.Q = [...op.Q]; if (op.ramp) sl.ramp = [...op.ramp]; } break; }
      case 'dish': { if (op.agar != null) S.dish.agar = op.agar; if (op.temp != null) S.dish.temp = op.temp; break; }
      default: return false;
    }
    return true;
  }
  E.op = (op) => {                                        // live operation: stamped with the current step, applied now
    E.lastRefusal = null;
    const o = { t: S.step, ...op };
    const last = S.ops[S.ops.length - 1];
    if (o.tool === 'param' && last && last.tool === 'param' && last.slot === o.slot && last.t === o.t) S.ops.pop();   // dragging a slider is one op
    if (o.tool === 'dish' && last && last.tool === 'dish' && last.t === o.t) S.ops.pop();
    const ok = applyOp(o, S.ops.length); if (ok) S.ops.push(o); return ok;
  };

  E.newDish = ({ seed = S.seed, nutrient = S.dish.nutrient, agar = S.dish.agar, temp = S.dish.temp } = {}) => {
    S.step = 0; S.seed = seed >>> 0; S.cur = 0; S.agentHigh = 0; S.nInoc = 0; S.ops = []; S.pending = []; S.slots = Array(SLOTS + 1).fill(null);
    S.adapt = null; S.graphStep = -1; E.graph.field.fill(0); E.graph.stats = null; E.graph.history = []; E.graph.epoch = (E.graph.epoch || 0) + 1;
    S.dish = { nutrient, agar, temp };
    const enc = device.createCommandEncoder();
    for (const b of [B.cells[0], B.cells[1], B.sub[0], B.sub[1], B.dep, B.depId, B.agents, B.cond, B.flake]) enc.clearBuffer(b);
    device.queue.submit([enc.finish()]);
    stamp(KIND.pour, n / 2, n / 2, n / 2, nutrient, 0, 0);
  };

  // ------------------------------------------------------------------ stepping
  const graphDue = () => !!S.adapt && S.step > 0 && S.step % S.adapt.every === 0 && S.graphStep !== S.step;
  function step() {
    if (graphDue()) return false;
    while (S.pending.length && S.pending[0].t <= S.step) { const o = S.pending.shift(); if (applyOp(o, S.ops.length)) S.ops.push(o); }
    writeSim();
    const enc = device.createCommandEncoder();
    const timed = TS && !TS.busy && (S.step & 31) === 0;
    const pass = enc.beginComputePass(timed ? { timestampWrites: { querySet: TS.set, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } } : {});
    if (S.agentHigh) { pass.setPipeline(pAgent); pass.setBindGroup(0, G.agent[S.cur]); pass.dispatchWorkgroups(Math.ceil(S.agentHigh / 256));
      pass.setPipeline(pDivide); pass.setBindGroup(0, G.divide); pass.dispatchWorkgroups(Math.ceil(S.agentHigh / 256)); }
    pass.setPipeline(pCell); pass.setBindGroup(0, G.cell[S.cur]); pass.dispatchWorkgroups(Math.ceil(n / 16), Math.ceil(n / 16));
    pass.end();
    if (timed) { enc.resolveQuerySet(TS.set, 0, 2, TS.resolve, 0); enc.copyBufferToBuffer(TS.resolve, 0, TS.read, 0, 16); }
    device.queue.submit([enc.finish()]);
    if (timed) {
      TS.busy = true;
      TS.read.mapAsync(GPUMapMode.READ).then(() => {
        const t = new BigUint64Array(TS.read.getMappedRange());
        const dt = Number(t[1] - t[0]) / 1e6;
        if (dt > 0 && dt < 1000) TS.ms = TS.ms ? TS.ms + (dt - TS.ms) * 0.25 : dt;
        TS.read.unmap(); TS.busy = false;
      }).catch(() => { TS.busy = false; });
    }
    S.cur = 1 - S.cur; S.step++;
    return true;
  }
  // Per-kernel GPU time (T4 diagnostics): k real steps with agent / divide / cell each in its own
  // timed pass. Mean ms per pass. Needs timestamp-query; advances the dish like E.step.
  E.profile = async (k = 64) => {
    if (!hasTs) return null;
    const qs = device.createQuerySet({ type: 'timestamp', count: 6 });
    const res = buf(48, GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC);
    const rd = device.createBuffer({ size: 48, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const sum = [0, 0, 0]; let m = 0;
    for (let i = 0; i < k; i++) {
      if (graphDue()) await E.updateGraph();
      while (S.pending.length && S.pending[0].t <= S.step) { const o = S.pending.shift(); if (applyOp(o, S.ops.length)) S.ops.push(o); }
      writeSim();
      const enc = device.createCommandEncoder();
      const tw = (j) => ({ timestampWrites: { querySet: qs, beginningOfPassWriteIndex: 2 * j, endOfPassWriteIndex: 2 * j + 1 } });
      let p = enc.beginComputePass(tw(0));
      if (S.agentHigh) { p.setPipeline(pAgent); p.setBindGroup(0, G.agent[S.cur]); p.dispatchWorkgroups(Math.ceil(S.agentHigh / 256)); }
      p.end(); p = enc.beginComputePass(tw(1));
      if (S.agentHigh) { p.setPipeline(pDivide); p.setBindGroup(0, G.divide); p.dispatchWorkgroups(Math.ceil(S.agentHigh / 256)); }
      p.end(); p = enc.beginComputePass(tw(2));
      p.setPipeline(pCell); p.setBindGroup(0, G.cell[S.cur]); p.dispatchWorkgroups(Math.ceil(n / 16), Math.ceil(n / 16));
      p.end();
      enc.resolveQuerySet(qs, 0, 6, res, 0); enc.copyBufferToBuffer(res, 0, rd, 0, 48);
      device.queue.submit([enc.finish()]);
      await rd.mapAsync(GPUMapMode.READ);
      const t = new BigUint64Array(rd.getMappedRange());
      const d = [0, 1, 2].map((j) => Number(t[2 * j + 1] - t[2 * j]) / 1e6);
      rd.unmap();
      if (d.every((x) => x >= 0 && x < 1000)) { d.forEach((x, j) => (sum[j] += x)); m++; }
      S.cur = 1 - S.cur; S.step++;
    }
    qs.destroy(); res.destroy(); rd.destroy();
    return { agent: +(sum[0] / m).toFixed(3), divide: +(sum[1] / m).toFixed(3), cell: +(sum[2] / m).toFixed(3), samples: m };
  };
  // Returns how many steps actually ran: fewer than asked means a graph update is owed first.
  E.step = (k = 1) => { let did = 0; while (did < k && step()) did++; return did; };
  E.run = async (k, chunk = 50) => {
    let done = 0;
    while (done < k) {
      const want = Math.min(chunk, k - done), did = E.step(want);
      done += did;
      await device.queue.onSubmittedWorkDone();
      if (did < want) await E.updateGraph();
    }
  };

  // ------------------------------------------------------------------ P2: the graph worker
  // At every `every`-th step the adaptive slot's density goes to the worker (graph extraction + Tero
  // adaptation + rasterisation) and the stepping waits for the answer. Waiting at a fixed step, on an
  // input that is itself deterministic, is what keeps replay bit-exact with an asynchronous worker.
  let worker = null, reqId = 0;
  const ask = (msg, transfer) => new Promise((res, rej) => {
    if (!worker) worker = new Worker(new URL('./graphworker.js', import.meta.url), { type: 'module' });
    const id = ++reqId;
    const on = (ev) => { if (ev.data.id !== id) return; worker.removeEventListener('message', on); res(ev.data); };
    worker.addEventListener('message', on);
    worker.onerror = (err) => rej(err);
    worker.postMessage({ ...msg, id }, transfer);
  });
  E.updateGraph = () => {
    if (E.graph.busy) return E.graph.busy;
    if (!graphDue()) return Promise.resolve(null);
    const epoch = E.graph.epoch, at = S.step, A = S.adapt;
    E.graph.busy = (async () => {
      const c = await E.readCells();
      const vals = new Float32Array(n * n);
      for (let k = 0; k < n * n; k++) if ((c[k * 4 + 3] | 0) === A.slot) vals[k] = c[k * 4];
      const span = n * E.cellMm, org = S.slots[A.slot].org, toGrid = ([x, y]) => [x + span / 2, y + span / 2];
      const bodyMm = S.ops.filter((o) => o.tool === 'inoculate' && o.organism === org).flatMap((o) => (o.path || [o.at]).map((p) => [...toGrid(p), o.r ?? 1]));
      const foodMm = S.ops.filter((o) => o.tool === 'flake' || (o.tool === 'nutrient' && (o.amount ?? 1) > S.dish.nutrient))
        .flatMap((o) => (o.path || [o.at]).map((p) => [...toGrid(p), o.r ?? 1]));
      const t0 = performance.now();
      const res = await ask({ vals, n, cellMm: E.cellMm, gn, field: E.graph.field.slice(), bodyMm, foodMm, step: at, seed: S.seed,
        params: { mu: A.mu, Qh: A.Qh, iters: A.iters, dt: A.dt, ds: n >= 2048 ? 2 : 1, level: 0.01, closeR: 1, pruneMm: 0.4, bodyReach: 1.5, D0: 0.3 } },
        [vals.buffer]);
      if (epoch !== E.graph.epoch || S.step !== at) return null;       // the dish was reset meanwhile
      E.graph.field = res.field; E.graph.net = res.net;
      device.queue.writeBuffer(B.cond, 0, res.field);
      E.graph.stats = { step: at, wall_ms: +(performance.now() - t0).toFixed(0), ...res.stats };
      E.graph.history.push(E.graph.stats);
      S.graphStep = at;
      return E.graph.stats;
    })().finally(() => { E.graph.busy = null; });
    return E.graph.busy;
  };
  E.idle = () => device.queue.onSubmittedWorkDone();

  E.render = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2), w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    E.cssW = canvas.clientWidth || w;
    writeSim(); writeView();
    const enc = device.createCommandEncoder();
    const pass = enc.beginRenderPass({ colorAttachments: [{ view: ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
    pass.setPipeline(pRender); pass.setBindGroup(0, G.render[S.cur]); pass.draw(3); pass.end();
    device.queue.submit([enc.finish()]);
  };
  let last = 0;
  E.frame = (now) => {
    if (E.playing && !E.graph.busy) {
      const t0 = performance.now(), did = E.step(E.spf);
      if (did) E.stepMs += ((performance.now() - t0) / did - E.stepMs) * 0.1;
      if (did < E.spf) E.updateGraph().catch((err) => { E.errors.push('graph: ' + err.message); });
    }
    E.render(); E.frameMs += ((now - last) - E.frameMs) * 0.1; last = now;
    if (E.onFrame) E.onFrame();
  };
  E.start = () => { const loop = (t) => { E.frame(t); requestAnimationFrame(loop); }; requestAnimationFrame(loop); };

  // ------------------------------------------------------------------ view helpers
  E.screenToMm = (x, y) => { const r = canvas.getBoundingClientRect(), v = E.view; return [v.center[0] + (x - r.left - r.width / 2) * v.mmPerPx, v.center[1] - (y - r.top - r.height / 2) * v.mmPerPx]; };
  E.zoomAt = (x, y, factor) => { const v = E.view, before = E.screenToMm(x, y); v.mmPerPx = Math.min(Math.max(v.mmPerPx * factor, 0.0008), 0.4); const after = E.screenToMm(x, y); v.center[0] += before[0] - after[0]; v.center[1] += before[1] - after[1]; };
  E.fieldWidth = (mm) => { E.view.mmPerPx = mm / (canvas.clientWidth || 900); };

  // ------------------------------------------------------------------ Dish ID
  E.exportID = () => ({ petri: 1, quality, seed: S.seed, dish: { radius_mm: DISH_MM, ...S.dish }, ops: S.ops.map((o) => ({ ...o })),
    view: { center: [...E.view.center], mmPerPx: E.view.mmPerPx, mode: MODES[E.view.mode] } });
  E.importID = (id) => {
    E.newDish({ seed: id.seed, nutrient: id.dish?.nutrient, agar: id.dish?.agar, temp: id.dish?.temp });
    S.pending = (id.ops || []).map((o) => ({ ...o })).sort((a, b) => a.t - b.t);
    while (S.pending.length && S.pending[0].t <= 0) { const o = S.pending.shift(); if (applyOp(o, S.ops.length)) S.ops.push(o); }
    if (id.view) { E.view.center = [...id.view.center]; E.view.mmPerPx = id.view.mmPerPx; E.view.mode = Math.max(0, MODES.indexOf(id.view.mode)); }
  };

  // ------------------------------------------------------------------ readback (harness, telemetry)
  async function read(src, bytes) {
    const st = buf(bytes, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST); const enc = device.createCommandEncoder();
    enc.copyBufferToBuffer(src, 0, st, 0, bytes); device.queue.submit([enc.finish()]);
    await st.mapAsync(GPUMapMode.READ); const out = st.getMappedRange().slice(0); st.unmap(); st.destroy(); return out;
  }
  E.readCells = async () => new Float32Array(await read(B.cells[S.cur], cells * 16));
  E.readSub = async () => new Float32Array(await read(B.sub[S.cur], cells * 16));
  E.readAgents = async () => (S.agentHigh ? await read(B.agents, S.agentHigh * AGENT_BYTES) : new ArrayBuffer(0));
  E.hash = async () => {                                   // FNV-1a over the bit patterns of cells + substrate + agents
    let h = 0x811c9dc5;
    for (const ab of [await read(B.cells[S.cur], cells * 16), await read(B.sub[S.cur], cells * 16), await E.readAgents(), await read(B.cond, gn * gn * 4)]) { const u = new Uint32Array(ab); for (let i = 0; i < u.length; i++) { h ^= u[i]; h = Math.imul(h, 0x01000193); } }
    return (h >>> 0).toString(16).padStart(8, '0');
  };
  E.stats = async () => {
    const c = await E.readCells(), per = Array.from({ length: SLOTS + 1 }, () => ({ cells: 0, mass: 0 }));
    for (let i = 0; i < c.length; i += 4) { const s = c[i + 3] | 0; if (s > 0 && s <= SLOTS) { per[s].cells++; per[s].mass += c[i]; } }
    let agents = 0; const ab = await E.readAgents(), u = new Uint32Array(ab); for (let i = 4; i < u.length; i += 6) if (u[i] & 15) agents++;
    const mm2 = E.cellMm * E.cellMm;
    return { step: S.step, agents, slots: per.map((p, s) => (S.slots[s] ? { slot: s, name: S.slots[s].name, area_mm2: +(p.cells * mm2).toFixed(2), mass: +p.mass.toFixed(1) } : null)).filter(Boolean) };
  };

  E.newDish(opts);
  return E;
}
