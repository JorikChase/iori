// inspector.js — the Stack pane (spec §11.1): the selected clip's properties (Transform & Blend, hold; reset policy and
// warm-up), its effect stack (enable, reorder, remove, add, presets) and the selected effect's parameters. Every
// parameter row has a stopwatch (keyframes at the playhead), a value control, and modulation slots (∿). Clicking a
// parameter's name shows it in the timeline's keyframe lane with its ghost curve. Edits go through the command bus; a
// slider drag merges into one undo step. The DOM is rebuilt only when the structure changes; values update in place.
import { h } from './shell.js';
import { EFFECTS, TRANSFORM } from './project.js';
import { SCHEMA, OPS, FX, PRESETS, LEGACY, opDefaults, fxDefaults, normalize } from './config.js';
import { indexProject } from './timeline.js';
import { resolve, MODULATORS, modulatorDefaults } from './params.js';
import { clockOf } from './sequence.js';
import { MASK_TRANSFORM } from './masks.js';

const isAnim = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && ('value' in v || 'keys' in v);
const ALL_PRESETS = { ...PRESETS, ...LEGACY };
const fmt = (x) => (typeof x === 'number' ? (Math.abs(x) >= 100 ? x.toFixed(0) : +x.toFixed(3)) : String(x));

let clipboard = null;                                                   // a copied stack (shared by every inspector)
const INTERP = ['hold', 'linear', 'easeIn', 'easeOut', 'easeInOut'];

export function createInspector(host, { tl, playhead, view, seek = () => {}, note = () => {} }) {
  const st = { effectId: null, mods: new Set(), all: false };
  let sig = '', updaters = [];
  const run = (name, args, opts) => { try { return tl.exec(name, args, opts); } catch (e) { note(e.message); return null; } };
  const seq = () => tl.project.sequences.find((s) => s.id === tl.project.activeSequence);

  function selection() {
    const ix = indexProject(tl.project), id = tl.selectedClips()[0], o = id && ix.get(id);
    if (!o) return null;
    const clip = o.obj, effs = clip.stack || [];
    if (!effs.some((e) => e.id === st.effectId)) st.effectId = effs[0]?.id || null;
    return { clip, ch: o.ch, eff: effs.find((e) => e.id === st.effectId) || null, ix };
  }
  const structure = (S) => !S ? 'none' : JSON.stringify([S && S.eff && S.eff.type === 'moshLoop' ? (S.eff.params.ops.find((o) => o.op === 'paint')?.strokes || []).length : 0, (S && S.clip.masks || []).map((m) => [m.id, m.mode, m.enabled, m.invert, m.shapes.length]), st.all, !!clipboard, (tl.project.presets || []).map((x) => x.id + x.name), S.clip.id, S.clip.kind, S.ch.locked, (S.clip.stack || []).map((e) => [e.id, e.type, e.enabled]), st.effectId, [...st.mods],
    S.eff && S.eff.type === 'moshLoop' ? [S.eff.params.ops.map((o) => o.op), S.eff.params.inLoop.map((o) => o.fx), S.eff.params.post.map((o) => o.fx)] : 0,
    animShape(S.clip.transform), S.eff ? animShape(S.eff.params) : 0, view.shown && view.shown.id + view.shown.path.join('.')]);
  function animShape(o) { const out = []; const walk = (x, p) => { if (isAnim(x)) out.push(p + (x.keys ? 'k' : '') + (x.mods ? 'm' + x.mods.length + x.mods.map((m) => m.type).join() : '')); else if (x && typeof x === 'object') for (const k of Object.keys(x)) walk(x[k], p + '.' + k); }; walk(o, ''); return out.join('|'); }

  function refresh() {
    const S = selection(), s = structure(S);
    if (s === sig) { for (const u of updaters) u(); return; }
    sig = s; updaters = []; host.innerHTML = '';
    if (!S) { host.append(h('div', 'ms-note', 'Select a clip on the timeline to edit its stack. Double-click a keyframe lane to add a key; drag diamonds to move them.')); return; }
    const { clip, ch } = S, owner = clip;
    const kv = h('div', 'ms-kv'); host.append(kv);
    const head = () => { kv.innerHTML = [['clip', clip.label || (clip.kind === 'effect' ? 'effect clip' : tl.project.media.find((m) => m.id === clip.mediaId)?.name || clip.kind)], ['range', `${clip.range.in} – ${clip.range.out} (${clip.range.out - clip.range.in} f)`], ['channel', `${ch.name}${ch.locked ? ' · locked' : ''}`]].map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join(''); };
    head(); updaters.push(head);
    // clip properties
    if (clip.kind === 'media') {
      const g = group('Transform & Blend');
      g.append(boolRow('hold (freeze source)', () => clip.hold, (v) => run('setValue', { id: clip.id, path: ['hold'], value: v })));
      for (const [k, spec] of Object.entries(TRANSFORM)) g.append(param({ id: clip.id, path: ['transform', k], spec, label: k, clip }));
    } else if (clip.kind === 'effect' && st.all) {
      const g = group('Effect clip');
      g.append(selRow('state at in', ['atIn', 'continue'], () => clip.reset, (v) => run('setValue', { id: clip.id, path: ['reset'], value: v })));
      g.append(numRow('warm-up frames', () => clip.warmup, (v) => run('setValue', { id: clip.id, path: ['warmup'], value: Math.max(0, Math.round(v)) })));
    }
    if (clip.kind === 'audio') { host.append(h('div', 'ms-note', 'Audio clips are mixed and played in M7.')); return; }
    // the stack
    const list = h('ul', 'ins-stack');
    clip.stack.forEach((e, i) => {
      const li = h('li', e.id === st.effectId ? 'sel' : ''), cb = h('input'); cb.type = 'checkbox'; cb.checked = e.enabled;
      cb.onclick = (ev) => { ev.stopPropagation(); run('setValue', { id: e.id, path: ['enabled'], value: cb.checked }); };
      const tools = h('span', 'ins-tools');
      for (const [lab, title, fn] of [['▲', 'up', () => i > 0 && run('moveEffect', { id: e.id, index: i - 1 })], ['▼', 'down', () => i < clip.stack.length - 1 && run('moveEffect', { id: e.id, index: i + 1 })], ['×', 'remove', () => run('removeEffect', { id: e.id })]]) {
        const b = h('button', '', lab); b.title = title; b.onclick = (ev) => { ev.stopPropagation(); fn(); }; tools.append(b);
      }
      li.append(cb, h('span', '', `${EFFECTS[e.type]?.label || e.type} <small>${EFFECTS[e.type]?.stateful ? 'stateful' : ''}</small>`), tools);
      li.onclick = () => { st.effectId = e.id; refresh(); };
      list.append(li);
    });
    if (!clip.stack.length) list.append(h('li', 'empty', clip.kind === 'effect' ? 'empty — add a Mosh Loop or an effect' : 'no clip effects'));
    host.append(list);
    const add = h('select', 'ins-add'); add.append(new Option('+ add effect…', ''), ...Object.entries(EFFECTS).map(([k, T]) => new Option(T.label, k)));
    add.onchange = () => { if (add.value) { const id = run('addEffect', { ownerId: clip.id, type: add.value }); if (id) st.effectId = id; } add.value = ''; };
    const pre = h('select', 'ins-add'), mine = tl.project.presets || [];
    pre.append(new Option('preset…', ''));
    if (mine.length) { const g = document.createElement('optgroup'); g.label = 'this project (adds the stack)'; for (const x of mine) g.append(new Option(`★ ${x.name}`, 'p:' + x.id)); pre.append(g); }
    const gl = document.createElement('optgroup'); gl.label = 'Mosh Loop styles'; for (const n of Object.keys(ALL_PRESETS)) gl.append(new Option(n, n)); pre.append(gl);
    pre.onchange = () => {
      const v = pre.value; pre.value = ''; if (!v) return;
      if (v.startsWith('p:')) { const x = mine.find((y) => 'p:' + y.id === v); const ids = run('pasteStack', { ownerId: clip.id, effects: x.stack }); if (ids?.length) { st.effectId = ids[0]; note(`preset ★ ${x.name} added`); } }
      else applyPreset(S, v);
    };
    const row = h('div', 'ms-brow'); row.append(add, pre); host.append(row);
    const row2 = h('div', 'ms-brow'), cp = h('button', 'ms-b', 'COPY'), ps = h('button', 'ms-b', 'PASTE'), sv = h('button', 'ms-b', 'SAVE PRESET…'), del = h('button', 'ms-b', '★ ×');
    cp.title = 'copy this stack'; ps.title = 'add the copied stack (Shift: replace)'; del.title = 'delete a project preset';
    cp.disabled = !clip.stack.length; ps.disabled = !clipboard; del.disabled = !mine.length;
    cp.onclick = () => { clipboard = structuredClone(clip.stack); note(`stack copied (${clip.stack.length} effect${clip.stack.length === 1 ? '' : 's'})`); sig = ''; refresh(); };
    ps.onclick = (ev) => { const ids = run('pasteStack', { ownerId: clip.id, effects: clipboard, replace: ev.shiftKey }); if (ids?.length) st.effectId = ids[0]; };
    sv.onclick = () => { const n = prompt('Preset name', clip.stack.map((e) => EFFECTS[e.type]?.label || e.type).join(' + ')); if (n) { run('savePreset', { name: n, stack: clip.stack }); note(`preset ★ ${n} saved in this project`); } };
    del.onclick = () => { const n = prompt('Delete which preset? ' + mine.map((x) => x.name).join(', ')); const x = mine.find((y) => y.name === n); if (x) run('deletePreset', { id: x.id }); };
    sv.disabled = !clip.stack.length; row2.append(cp, ps, sv, del); host.append(row2);
    if (clip.kind === 'effect') masksGroup(clip);
    // the selected effect
    const e = S.eff; if (!e) return;
    if (e.type === 'moshLoop') moshLoopParams(e, clip); else { const g = group(EFFECTS[e.type].label); for (const [k, spec] of Object.entries(FX[e.type].params)) g.append(param({ id: e.id, path: ['params', k], spec, label: k, clip })); }
    group('Effect').append(numRow('seed', () => e.seed, (v) => run('setValue', { id: e.id, path: ['seed'], value: Math.round(v) })));
  }

  /** Masks (R3): where this mosh applies. Paint them with MASK / LOCK on the preview; shapes and transforms here. */
  function masksGroup(clip) {
    const g = group('Masks'), list = clip.masks || [];
    if (!list.length) g.append(h('div', 'ms-note', 'None: the mosh covers the whole frame. Paint with MASK (G) or LOCK (Shift+G) on the preview, or add a shape below.'));
    list.forEach((m) => {
      const box = h('div', 'ins-mask'), head = h('div', 'ins-ihead'), x = h('button', 'ms-b', '×');
      head.append(h('b', '', `${m.mode === 'lock' ? 'LOCK' : 'MASK'} · ${m.shapes.length} shape${m.shapes.length === 1 ? '' : 's'}`), x); box.append(head);
      x.onclick = () => run('removeMask', { id: m.id });
      box.append(boolRow('enabled', () => m.enabled, (v) => run('setValue', { id: m.id, path: ['enabled'], value: v })), boolRow('invert', () => m.invert, (v) => run('setValue', { id: m.id, path: ['invert'], value: v })));
      box.append(param({ id: m.id, path: ['feather'], spec: [0, 0.3, 0.005, 0.02], label: 'feather', clip }));
      for (const [k, spec] of Object.entries(MASK_TRANSFORM)) box.append(param({ id: m.id, path: [k], spec, label: k, clip }));
      g.append(box);
    });
    for (const mode of ['include', 'lock']) {
      const r = h('div', 'ms-brow');
      for (const [lab, shape] of [['+ ELLIPSE', { type: 'ellipse', cx: 0.5, cy: 0.5, rx: 0.2, ry: 0.25 }], ['+ RECT', { type: 'rect', x: 0.3, y: 0.25, w: 0.4, h: 0.5 }]]) {
        const b = h('button', 'ms-b', `${lab} ${mode === 'lock' ? 'LOCK' : 'MASK'}`); b.onclick = () => run('addMaskStroke', { clipId: clip.id, mode, stroke: shape }); r.append(b);
      }
      g.append(r);
    }
  }
  function applyPreset(S, name) {
    let e = S.eff && S.eff.type === 'moshLoop' ? S.eff : S.clip.stack.find((x) => x.type === 'moshLoop');
    const params = normalize(ALL_PRESETS[name]); delete params.seed;
    if (!e) { const id = run('addEffect', { ownerId: S.clip.id, type: 'moshLoop', params }); if (id) st.effectId = id; note(`Mosh Loop added: ${name}`); return; }
    run('setValue', { id: e.id, path: ['params'], value: { ...params, bloom: { ...params.bloom, markers: e.params.bloom.markers } } }); note(`${name} applied`);
  }

  /**
   * The Essentials (R4): the few Mosh Loop controls that change the look most, in plain words, each with its stopwatch
   * and modulators; ALL PARAMETERS shows every stage. Motion gain edits the first Multiply field op (adds one if none).
   */
  function essentials(e, clip) {
    const P = e.params, g = group('Essentials'), p = (path, label) => g.append(param({ id: e.id, path: ['params', ...path], spec: SCHEMA[path[0]].params[path[1]], label, clip }));
    p(['residual', 'gain'], 'detail returns'); p(['reset', 'blocks'], 'healing'); p(['bloom', 'repeat'], 'bloom length'); p(['bloom', 'every'], 'bloom every');
    p(['reset', 'honourCut'], 'keep cuts'); p(['warp', 'sampling'], 'smear look');
    const mi = P.ops.findIndex((o) => o.op === 'multiply');
    if (mi >= 0) { g.append(param({ id: e.id, path: ['params', 'ops', mi, 'gx'], spec: OPS.multiply.params.gx, label: 'motion gain x', clip }), param({ id: e.id, path: ['params', 'ops', mi, 'gy'], spec: OPS.multiply.params.gy, label: 'motion gain y', clip })); }
    else { const b = h('button', 'ms-b', '+ MOTION GAIN'); b.title = 'amplify (or reverse) the motion with a Multiply field op'; b.onclick = () => run('setValue', { id: e.id, path: ['params', 'ops'], value: [...P.ops, { ...opDefaults('multiply'), gx: 1.5, gy: 1.5 }] }); const r = h('div', 'ms-brow'); r.append(b); g.append(r); }
    const pi = P.ops.findIndex((o) => o.op === 'paint');
    if (pi >= 0) {                                                       // R2: painted vectors (paint them with V on the preview)
      g.append(param({ id: e.id, path: ['params', 'ops', pi, 'amount'], spec: OPS.paint.params.amount, label: 'painted push', clip }));
      g.append(selRow('painted mode', ['add', 'replace'], () => P.ops[pi]?.mode, (v) => run('setValue', { id: e.id, path: ['params', 'ops', pi, 'mode'], value: v })));
      const r = h('div', 'ms-brow'), b = h('button', 'ms-b', `CLEAR VECTORS (${(P.ops[pi].strokes || []).length})`); b.onclick = () => run('setValue', { id: e.id, path: ['params', 'ops'], value: P.ops.filter((_, j) => j !== pi) }); r.append(b); g.append(r);
    }
    g.append(selRow('block size', [4, 8, 16, 32], () => P.block, (v) => run('setValue', { id: e.id, path: ['params', 'block'], value: +v })));
    g.append(h('div', 'ms-note', 'Stopwatch = keyframes at the playhead · ∿ = modulators · click a name to see its curve on the timeline.'));
  }
  function moshLoopParams(e, clip) {
    const P = e.params, tog = h('button', 'ms-b ins-all', st.all ? 'ESSENTIALS ONLY ▴' : 'ALL PARAMETERS ▾');
    tog.onclick = () => { st.all = !st.all; sig = ''; refresh(); };
    if (!st.all) { essentials(e, clip); const r = h('div', 'ms-brow'); r.append(tog); host.append(r); return; }
    const r0 = h('div', 'ms-brow'); r0.append(tog); host.append(r0);
    const gb = group('Mosh Loop'); gb.append(selRow('block', [4, 8, 16, 32], () => P.block, (v) => run('setValue', { id: e.id, path: ['params', 'block'], value: +v })));
    for (const [stage, S] of Object.entries(SCHEMA)) {
      const g = group(S.label);
      for (const [k, spec] of Object.entries(S.params)) g.append(param({ id: e.id, path: ['params', stage, k], spec, label: k, clip }));
      if (stage === 'estimate') listEditor(g, e, clip, 'ops', OPS, 'op', 'field op', opDefaults);
    }
    for (const [list, title] of [['inLoop', 'In-loop effects (accumulate)'], ['post', 'Post effects (display only)']]) listEditor(group(title), e, clip, list, FX, 'fx', 'effect', fxDefaults);
  }
  function listEditor(g, e, clip, list, CAT, key, what, defaults) {
    const items = e.params[list];
    items.forEach((o, i) => {
      const box = h('div', 'ins-item'), head = h('div', 'ins-ihead'), x = h('button', 'ms-b', '×');
      head.append(h('b', '', CAT[o[key]].label), x); box.append(head);
      x.onclick = () => run('setValue', { id: e.id, path: ['params', list], value: items.filter((_, j) => j !== i) });
      for (const [k, spec] of Object.entries(CAT[o[key]].params)) box.append(param({ id: e.id, path: ['params', list, i, k], spec, label: k, clip }));
      g.append(box);
    });
    const add = h('select', 'ins-add'); add.append(new Option(`+ add ${what}…`, ''), ...Object.entries(CAT).map(([k, T]) => new Option(T.label, k)));
    add.onchange = () => { if (add.value) run('setValue', { id: e.id, path: ['params', list], value: [...items, defaults(add.value)] }); add.value = ''; };
    g.append(add);
  }

  // ---- rows
  function group(title) { const g = h('div', 'ms-grp'); g.append(h('b', '', title)); host.append(g); return g; }
  function boolRow(label, get, set) { const r = h('div', 'ms-row ms-row-chk'), c = h('input'); c.type = 'checkbox'; c.checked = get(); c.onchange = () => set(c.checked); r.append(h('span', '', label), c); updaters.push(() => { c.checked = get(); }); return r; }
  function selRow(label, opts, get, set) { const r = h('div', 'ms-row ms-row-sel'), s = h('select'); for (const o of opts) s.append(new Option(String(o), String(o))); s.value = String(get()); s.onchange = () => set(s.value); r.append(h('span', '', label), s); updaters.push(() => { s.value = String(get()); }); return r; }
  function numRow(label, get, set) { const r = h('div', 'ms-row ms-row-sel'), i = h('input'); i.type = 'text'; i.className = 'ms-val'; i.value = get(); i.onchange = () => { const n = Number(i.value); if (Number.isFinite(n)) set(n); else i.value = get(); }; r.append(h('span', '', label), i); updaters.push(() => { if (document.activeElement !== i) i.value = get(); }); return r; }

  /** One parameter: stopwatch · name · control · value · ∿. o: { id, path, spec, label, clip } */
  function param(o) {
    const ix = () => indexProject(tl.project), obj = () => ix().get(o.id)?.obj;
    const raw = () => { let x = obj(); for (const k of o.path) x = x?.[k]; return x; };
    const off = o.clip ? o.clip.range.in : 0, local = () => playhead() - off, clock = () => clockOf(seq(), o.clip, ix().get(o.id)?.obj.seed || 0);
    const cur = () => resolve(raw(), local(), clock()), kind = o.spec.length === 4 ? 'num' : o.spec.length === 1 ? 'bool' : 'sel';
    const key = o.id + ':' + o.path.join('.'), mkey = key + '#mods';
    const wrap = h('div'), r = h('div', 'ins-prow'), sw = h('button', 'ins-sw'), name = h('span', 'ins-name', o.label), mod = h('button', 'ins-mod', '∿');
    sw.title = 'keyframes (stopwatch): on adds a key at the playhead'; mod.title = 'modulators';
    const showMe = () => { const v = raw(); if (isAnim(v) && (v.keys || v.mods) && !(view.shown && view.shown.id === o.id && view.shown.path.join() === o.path.join())) view.showParam({ id: o.id, path: o.path, spec: o.spec, label: o.label }); };
    const set = (value, merge) => { const r = run('setValue', { id: o.id, path: o.path, value, at: playhead() }, merge ? { merge: key } : undefined); showMe(); return r; };
    sw.onclick = () => { const v = raw(); if (isAnim(v) && v.keys) run('unanimate', { id: o.id, path: o.path, at: playhead() }); else { run('animate', { id: o.id, path: o.path, at: playhead() }); showMe(); } };
    name.onclick = () => view.showParam(view.shown && view.shown.id === o.id && view.shown.path.join() === o.path.join() ? null : { id: o.id, path: o.path, spec: o.spec, label: o.label });
    let ctl, val = null;
    if (kind === 'num') {
      const [min, max, step] = o.spec; ctl = h('input'); ctl.type = 'range'; ctl.min = min; ctl.max = max; ctl.step = step;
      val = h('input'); val.type = 'text'; val.className = 'ms-val';
      ctl.oninput = () => { set(+ctl.value, true); val.value = fmt(+ctl.value); };
      ctl.onchange = () => tl.seal();
      ctl.ondblclick = () => set(o.spec[3]);
      val.onchange = () => { const n = Number(val.value); if (Number.isFinite(n)) set(n); };
    } else if (kind === 'bool') { ctl = h('input'); ctl.type = 'checkbox'; ctl.onchange = () => set(ctl.checked); }
    else { ctl = h('select'); for (const x of o.spec[0]) ctl.append(new Option(String(x), String(x))); ctl.onchange = () => set(typeof o.spec[0][0] === 'number' ? +ctl.value : ctl.value); }
    r.append(sw, name, ctl); if (val) r.append(val); else r.append(h('span'));
    if (kind === 'num') { mod.onclick = () => { if (st.mods.has(mkey)) st.mods.delete(mkey); else st.mods.add(mkey); refresh(); }; r.append(mod); } else r.append(h('span'));
    wrap.append(r);
    const upd = () => {
      const v = raw(), c = cur(), animated = isAnim(v) && !!v.keys, onKey = animated && v.keys.some((k) => k.frame === local());
      sw.classList.toggle('on', animated); sw.classList.toggle('key', onKey);
      name.classList.toggle('shown', !!(view.shown && view.shown.id === o.id && view.shown.path.join() === o.path.join()));
      mod.classList.toggle('on', isAnim(v) && !!v.mods?.length);
      if (kind === 'num') { if (document.activeElement !== ctl) ctl.value = c; if (document.activeElement !== val) val.value = fmt(c); }
      else if (kind === 'bool') ctl.checked = !!c; else ctl.value = String(c);
    };
    upd(); updaters.push(upd);
    const v0 = raw();
    if (isAnim(v0) && v0.keys) wrap.append(keyRow(o, raw, local, off));
    if (kind === 'num' && st.mods.has(mkey)) wrap.append(modPanel(o, raw));
    return wrap;
  }

  /** Under an animated parameter: previous / next key (moves the playhead), the key count, and the interpolation of the
   *  key at or before the playhead (how the value travels to the next key). */
  function keyRow(o, raw, local, off) {
    const r = h('div', 'ins-keys'), prev = h('button', 'ms-b', '◂'), next = h('button', 'ms-b', '▸'), info = h('span'), sel = h('select');
    prev.title = 'previous key ([)'; next.title = 'next key (])';
    for (const x of INTERP) sel.append(new Option(x, x));
    const keys = () => raw()?.keys || [], cur = () => { const t = local(); let k = null; for (const x of keys()) if (x.frame <= t) k = x; return k || keys()[0]; };
    prev.onclick = () => { const t = local(), k = [...keys()].reverse().find((x) => x.frame < t); if (k) seek(k.frame + off); };
    next.onclick = () => { const t = local(), k = keys().find((x) => x.frame > t); if (k) seek(k.frame + off); };
    sel.onchange = () => { const k = cur(); if (k) run('setKey', { id: o.id, path: o.path, at: k.frame + off, interp: sel.value }); };
    r.append(prev, next, info, sel);
    const u = () => { const k = cur(), ks = keys(); info.textContent = `◆ ${ks.length} · key ${k ? k.frame + off : '–'}`; if (k && document.activeElement !== sel) sel.value = k.interp || 'linear'; sel.disabled = !k; }; u(); updaters.push(u);
    return r;
  }

  function modPanel(o, raw) {
    const box = h('div', 'ins-mods'), v = raw(), mods = (isAnim(v) && v.mods) || [];
    mods.forEach((m, i) => {
      const M = MODULATORS[m.type], item = h('div', 'ins-moditem'), head = h('div', 'ins-ihead'), x = h('button', 'ms-b', '×');
      head.append(h('b', '', m.type), x); item.append(head);
      x.onclick = () => run('removeModulator', { id: o.id, path: o.path, index: i });
      const base = [...o.path, 'mods', i];
      item.append(selRow('mode', ['add', 'multiply', 'replace'], () => raw()?.mods?.[i]?.mode, (val) => run('setValue', { id: o.id, path: [...base, 'mode'], value: val })));
      item.append(sub('depth', [-Math.max(1, Math.abs(o.spec[1] - o.spec[0])), Math.max(1, Math.abs(o.spec[1] - o.spec[0])), (o.spec[2] || 0.01), 1], () => raw()?.mods?.[i]?.depth, (val, merge) => run('setValue', { id: o.id, path: [...base, 'depth'], value: val }, merge ? { merge: o.id + base.join() + 'd' } : undefined)));
      for (const [k, spec] of Object.entries(M?.params || {})) {
        if (spec.length === 4) item.append(sub(k, spec, () => raw()?.mods?.[i]?.params?.[k], (val, merge) => run('setValue', { id: o.id, path: [...base, 'params', k], value: val }, merge ? { merge: o.id + base.join() + k } : undefined)));
        else item.append(selRow(k, spec[0], () => raw()?.mods?.[i]?.params?.[k], (val) => run('setValue', { id: o.id, path: [...base, 'params', k], value: val })));
      }
      if (m.type === 'trigger') {
        const r = h('div', 'ms-row ms-row-sel'), x = h('input'); x.type = 'text'; x.placeholder = 'manual frames, e.g. 12, 40, 75 (clip time)';
        x.value = (m.params?.frames || []).join(', ');
        x.onchange = () => run('setValue', { id: o.id, path: [...base, 'params', 'frames'], value: x.value.split(/[ ,;]+/).map(Number).filter((n) => Number.isInteger(n) && n >= 0) });
        r.append(h('span', '', 'frames'), x); item.append(r);
        item.append(h('div', 'ms-note', 'source hits = the mosh hit markers (H); manual = the frames above, counted from the clip in-point; every = n and phase.'));
      }
      box.append(item);
    });
    const row = h('div', 'ms-brow');
    for (const [t, lab] of [['audio', '+ AUDIO'], ['lfo', '+ LFO'], ['noise', '+ NOISE'], ['randomHold', '+ RAND'], ['trigger', '+ TRIG']]) {
      const b = h('button', 'ms-b', lab);
      b.onclick = () => run('addModulator', { id: o.id, path: o.path, mod: modulatorDefaults(t, { depth: t === 'trigger' ? o.spec[1] - o.spec[0] : (o.spec[1] - o.spec[0]) / 4, clamp: [o.spec[0], o.spec[1]], seed: 1 + mods.length, mode: t === 'trigger' ? 'replace' : 'add' }) });
      row.append(b);
    }
    box.append(row);
    return box;
  }
  function sub(label, spec, get, set) {
    const r = h('div', 'ms-row'), rg = h('input'), v = h('input'); rg.type = 'range'; rg.min = spec[0]; rg.max = spec[1]; rg.step = spec[2]; v.type = 'text'; v.className = 'ms-val';
    rg.oninput = () => { set(+rg.value, true); v.value = fmt(+rg.value); }; rg.onchange = () => tl.seal();
    v.onchange = () => { const n = Number(v.value); if (Number.isFinite(n)) set(n); };
    r.append(h('span', '', label), rg, v);
    const u = () => { const x = get(); if (document.activeElement !== rg) rg.value = x; if (document.activeElement !== v) v.value = fmt(x); }; u(); updaters.push(u);
    return r;
  }

  return { refresh, get effectId() { return st.effectId; } };
}
