// Names on demand (DESIGN.md "Hover labels"). The graphs are glyphs; a pointer resting still on one of
// their controls (LABEL_MS), or a finger held on it, shows its name in small text beside it — no box, a
// dark halo under the white — and the key on a desktop where it has one. Every word the UI can show is
// in this file, so the documentation names things the same way.
//
// An op is named by its notation (core/ops.js: 'fold.box', 'mix.noise'); everything else by LABELS,
// keyed by the glyph id where the control has a glyph, else by a short id of its own. PARAMS names the
// numbers on the dimension lines ('<op>.<key>' first, then the key alone).

export const LABEL_MS = 400;

export const LABELS = {
  // the formula's graph (ui/graph.js)
  'graph.edge': 'insert op',               // an edge, and its plus: a hold opens the ring of ops
  'graph.count': 'iterations',
  'graph.letter': 'schedule',               // + the letter: 'schedule B'
  'graph.letterPlus': 'add letter',
  'graph.chainPlus': 'add chain',
  'graph.binding': 'binding',               // a driver's hairline to what it moves
  'graph.band': 'band',                     // a bound line's range: + the line's name
  fork: 'fork chain',
  plus: 'add species',
  // a collage piece's frame (ui/gizmo.js): the centre dot names the axes (a tap flips them; a drag moves
  // the piece in the screen's plane)
  'gz.local': 'local axes', 'gz.world': 'world axes', 'gz.axis': 'move along', 'gz.ring': 'turn', 'gz.corner': 'scale',
  // the shading frame (ui/shadegraph.js): readings, maths, colour mixes, the ramp and its editor
  col: 'fold index', trap: 'orbit trap', depth: 'depth', lyap: 'lyapunov', facing: 'facing',
  species: 'species', w: 'w axis', piece: 'piece', seam: 'seam',
  shade: 'colour ramp',
  'math.add': 'add', 'math.sub': 'subtract', 'math.mul': 'multiply', 'math.min': 'min', 'math.max': 'max',
  'math.pow': 'power', 'math.sin': 'sine', 'math.bands': 'bands',
  'mixc.mix': 'colour mix', 'mixc.multiply': 'multiply colours', 'mixc.screen': 'screen colours', 'mixc.add': 'add colours',
  'out.color': 'surface colour', 'out.glow': 'glow',
  'interp.constant': 'constant steps', 'interp.linear': 'linear', 'interp.ease': 'ease',
  'interp.bspline': 'b-spline', 'interp.cardinal': 'cardinal',
  'space.rgb': 'rgb space', 'space.hsv': 'hsv space', 'space.oklab': 'oklab space',
  'mode.clamp': 'clamp', 'mode.repeat': 'repeat', 'mode.mirror': 'mirror',
  log: 'log map', invert: 'invert',
  'shade.stop': 'colour stop', 'shade.bar': 'add stop', 'shade.hue': 'hue ring', 'shade.start': 'start shading',
  'shade.link': 'link', 'port.in': 'input', 'port.out': 'output',
  'preset.oil': 'oil ramp', 'preset.malachite': 'malachite ramp', 'preset.bone': 'bone ramp', 'preset.prism': 'prism ramp', 'preset.strata': 'strata ramp',
  'preset.beetle': 'beetle ramp', 'preset.abyss': 'abyss ramp',
  'preset.fire': 'fire ramp', 'preset.ice': 'ice ramp', 'preset.film': 'film ramp', 'preset.mono': 'mono ramp',
  // the drivers (ui/drivegraph.js)
  'drv.i': 'iteration', 'drv.r': 'radius', 'drv.trap': 'trap distance', 'drv.lyap': 'stretch',
  'drv.px': 'orbit x', 'drv.py': 'orbit y', 'drv.pz': 'orbit z', 'drv.pw': 'orbit w',
  'drv.x': 'start x', 'drv.y': 'start y', 'drv.z': 'start z', 'drv.w': 'start w',
  'drv.axis': 'axis field', 'drv.sphere': 'sphere field', 'drv.noise': 'noise field', 'drv.tissue': 'tissue field',
  'drv.time': 'time', 'drv.param': 'read parameter', 'drv.remap': 'remap',
  'drv.wave.saw': 'saw wave', 'drv.wave.sine': 'sine wave', 'drv.wave.tri': 'triangle wave',
  'drv.out.cell': 'cell reading', 'drv.out.wall': 'wall reading', 'drv.clamp': 'clamp',
  // a collage's graph (ui/collagegraph.js)
  'cl.piece': 'piece',                      // + its number: 'piece 2'
  'cl.plus': 'add piece', 'cl.out': 'collage shading', 'cl.grow': 'grow',
  'join.union': 'smooth union', 'join.inter': 'smooth intersection', 'join.sub': 'smooth subtraction', 'join.morph': 'morph',
  'join.hard.union': 'union', 'join.hard.inter': 'intersection', 'join.hard.sub': 'subtraction',
  'rep.none': 'no repeat', 'rep.grid': 'grid repeat', 'rep.mirror': 'mirror repeat', 'rep.polar': 'polar repeat',
  // the overlay toggles (ui/toggles.js)
  'tg.graph': 'graph', 'tg.shade': 'shading', 'tg.drive': 'drivers', 'tg.surface': 'metasurface',
  'tg.collage': 'collage', 'tg.structure': 'structure', 'tg.lyap': 'lyapunov',
  'tg.mode.pull': 'pull mode', 'tg.mode.push': 'push mode', 'tg.mode.loop': 'loop mode',
  // the structure layer: the strip, its key row, the exports
  'st.graph': 'graph',
  'key.lyap': 'lyapunov', 'key.replay': 'replay', 'key.surface': 'metasurface', 'key.drift': 'drift',
  'ex.still': '4K still', 'ex.video': 'video', 'ex.splats': 'splats', 'ex.mesh': 'mesh',
};

// the key a desktop has for it (shown after the name, dimmer)
export const KEYS = {
  'tg.graph': 'G', 'tg.surface': 'M', 'tg.structure': 'Tab', 'tg.lyap': 'L',
  'tg.mode.pull': 'P', 'tg.mode.push': 'P', 'tg.mode.loop': 'P',
  'st.graph': 'G', 'key.lyap': 'L', 'key.replay': 'R', 'key.surface': 'M', 'key.drift': 'Space', 'ex.still': '⌘S',
};

// the numbers on the dimension lines: an op's own name for one first ('fold.box.l'), then the key's
export const PARAMS = {
  'fold.box.l': 'fold limit', 'fold.sphere.rmin': 'min radius', 'fold.sphere.rfix': 'fixed radius',
  'fold.plane.d': 'offset', 'scale.s': 'scale', 'bulb.n': 'power', 'bulb4.n': 'power', 'power.n': 'power',
  'twist.a': 'twist angle', 'rotate.x': 'turn x', 'rotate.y': 'turn y', 'rotate.z': 'turn z',
  'mix.tissue.n': 'cells', 'mix.trap.t': 'trap radius',
  nx: 'normal x', ny: 'normal y', nz: 'normal z', nw: 'normal w',
  cx: 'centre x', cy: 'centre y', cz: 'centre z', cw: 'centre w',
  xy: 'turn xy', xz: 'turn xz', xw: 'turn xw', yz: 'turn yz', yw: 'turn yw', zw: 'turn zw',
  w: 'species mix', g: 'field gain', at: 'frame', r: 'radius', f: 'frequency', o: 'octaves', seed: 'seed',
  size: 'cell size', soft: 'softness', n: 'count',
  'mix.blend.c': 'weight c', 'tissue.n': 'cells',
  a: 'weight a', b: 'weight b', c: 'constant', d: 'weight d', e: 'weight e', h: 'weight h',
  // shading lines
  'map.scale': 'map scale', 'map.offset': 'map offset', 'map.hue': 'hue turn', gain: 'glow gain', 'mixc.f': 'amount',
  // drivers
  rate: 'rate', phase: 'phase', lo: 'low', hi: 'high',
  // a collage piece's placement and repetition, a join's seam
  tx: 'move x', ty: 'move y', tz: 'move z', rx: 'turn x', ry: 'turn y', rz: 'turn z', s: 'scale',
  'place.g': 'grow', 'grid.cx': 'cell x', 'grid.cy': 'cell y', 'grid.cz': 'cell z',
  'grid.nx': 'count x', 'grid.ny': 'count y', 'grid.nz': 'count z',
  'mirror.mx': 'mirror x', 'mirror.my': 'mirror y', 'mirror.mz': 'mirror z',
  'mirror.ox': 'offset x', 'mirror.oy': 'offset y', 'mirror.oz': 'offset z',
  'polar.n': 'spokes', 'polar.r': 'radius', 'polar.axis': 'axis',
  'join.r': 'seam width', 'join.n': 'steps', 'join.w': 'morph weight',
  // translate's own and fold.plane's own x, y, z, w
  'translate.x': 'move x', 'translate.y': 'move y', 'translate.z': 'move z', 'translate.w': 'move w',
};

export const labelOf = (id) => LABELS[id] || null;
export const paramLabel = (owner, key) => PARAMS[`${owner}.${key}`] || PARAMS[key] || key;
// a join: its op (smooth unless the kernel is hard) and its kernel, 'smooth union · quad'
export const joinLabel = (j) => (j.op === 'morph' ? LABELS['join.morph'] : j.k === 'hard' ? `${LABELS[`join.hard.${j.op}`]} · hard` : `${LABELS[`join.${j.op}`]} · ${j.k || 'quad'}`);

// ---------- drawing ---------------------------------------------------------------------------------
// L: { text, key?, x, y, r (the element's radius on screen), place?, touch?, fx, fy (the finger) }, or
// null. Beside the element, right of it (left where the screen ends); 'above' a dimension line, over its
// middle; 'below' a glyph of a row; a finger's above the finger, where the hand does not cover it. Kept
// on screen in every case.
export function drawLabel(svg, L, W, H) {
  if (!L) { if (svg.firstChild) svg.innerHTML = ''; return; }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot' }[c]};`);
  const key = L.key ? `<tspan class="k" dx="6">${esc(L.key)}</tspan>` : '';
  svg.innerHTML = `<text class="lb">${esc(L.text)}${key}</text>`;
  const t = svg.firstChild;
  let w = 0;
  try { w = t.getComputedTextLength(); } catch { /* not laid out */ }
  if (!w) w = (L.text.length + (L.key ? L.key.length + 1 : 0)) * 6.6;
  let x, y;
  if (L.touch) { x = L.fx - w / 2; y = L.fy - 58; if (y < 18) y = L.fy + 70; }
  else if (L.place === 'above') { x = L.x - w / 2; y = L.y - L.r - 8; }
  else if (L.place === 'below') { x = L.x - w / 2; y = L.y + L.r + 16; }
  else {
    x = L.x + L.r + 10; y = L.y + 4;
    if (x + w > W - 8) x = L.x - L.r - 10 - w;
  }
  x = Math.max(8, Math.min(W - 8 - w, x));
  y = Math.max(16, Math.min(H - 8, y));
  t.setAttribute('x', x.toFixed(1));
  t.setAttribute('y', y.toFixed(1));
}
