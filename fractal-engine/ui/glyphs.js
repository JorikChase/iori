// One glyph per op, drawn in a 24×24 box with hairlines only. They stand in for words: the UI has no
// labels, only names on demand (ui/labels.js, keyed by these ids). Ids match `glyph` in core/ops.js.

export const GLYPHS = {
  translate: 'M3 12h16M15 8l4 4-4 4',
  c: 'M12 4v5M12 15v5M4 12h5M15 12h5M12 11.2a.8.8 0 1 0 .01 0',
  scale: 'M2 2h20v20H2zM8 8h8v8H8z',
  rotate: 'M5 15a8 8 0 1 1 3 4M8 19l0-5-5 0',
  // the 4-D ones carry a second, inner figure: the fourth axis the 3-D glyph cannot show
  rotate4: 'M5 15a8 8 0 1 1 3 4M8 19l0-5-5 0M10 10h4v4h-4z',
  plane: 'M3 17L12 4l9 4-9 13z',
  box: 'M2 2h20v20H2zM2 12h20',
  sphere: 'M12 2a10 10 0 1 0 .01 0M12 8a4 4 0 1 0 .01 0',
  // the box glyph's fold, its height its own: the limit per axis
  cell: 'M2 5h20v14H2zM2 12h20M12 5v14',
  // the lattice: a cell and the neighbours it stands for
  wrap: 'M8 8h8v8H8zM2 8h3M19 8h3M2 16h3M19 16h3M8 2v3M16 2v3M8 19v3M16 19v3',
  // a circle packing: the outer circle, the two it holds, the one between them
  kleinian: 'M12 2a10 10 0 1 0 .01 0M7 7a5 5 0 1 0 .01 0M17 7a5 5 0 1 0 .01 0M12 17a2.5 2.5 0 1 0 .01 0',
  // the stepped fold: a stair down and up the axis
  mandalay: 'M2 20h5v-6h5v-6h5v-6h5M2 12h3M19 12h3',
  // the seeds: the shape the orbit ends on, on a dot, the orbit's last point
  'seed.slab': 'M2 15h20M2 18h20M12 3v9M10 10l2 2 2-2',
  'seed.sphere': 'M12 8a6 6 0 1 0 .01 0M12 1v5M10 4l2 2 2-2',
  'seed.pillar': 'M12 2v20M4 13h16M6 16h12',
  abs: 'M4 4l8 16 8-16',
  sort: 'M4 6h16M4 12h11M4 18h6',
  sort4: 'M4 5h16M4 10h12M4 15h8M4 20h4',
  bulb: 'M12 6a6 6 0 1 0 .01 0M12 1v3M12 20v3M1 12h3M20 12h3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
  bulb4: 'M12 6a6 6 0 1 0 .01 0M12 9a3 3 0 1 0 .01 0M12 1v3M12 20v3M1 12h3M20 12h3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
  quat: 'M12 4a8 8 0 1 0 .01 0M12 4v16M5.1 8l13.8 8M18.9 8L5.1 16',
  // the chimera: two species overlapping, the field's wall through their lens
  mix: 'M9 12a6 6 0 1 0 .01 0M15 12a6 6 0 1 0 .01 0M12 4v16',
  // the fields: the two species, and what weighs them
  'mix.axis': 'M9 12a5 5 0 1 0 .01 0M15 12a5 5 0 1 0 .01 0M2 21L22 3',
  'mix.sphere': 'M9 12a4 4 0 1 0 .01 0M15 12a4 4 0 1 0 .01 0M12 1a11 11 0 1 0 .01 0',
  'mix.noise': 'M9 9a5 5 0 1 0 .01 0M15 9a5 5 0 1 0 .01 0M2 20c2-3 3-3 5 0s3 3 5 0 3-3 5 0 3 3 5 0',
  'mix.tissue': 'M2 7l6 2 1 7-6 4M8 9l6-6M9 16l7 1 4-6-6-8M16 17l2 6M20 11l3-1',
  'mix.trap': 'M9 12a5 5 0 1 0 .01 0M15 12a5 5 0 1 0 .01 0M12 11.2a.8.8 0 1 0 .01 0M12 3v4M12 17v4',
  'mix.depth': 'M9 8a5 5 0 1 0 .01 0M15 8a5 5 0 1 0 .01 0M4 17h16M7 20h10M10 23h4',
  'mix.lyap': 'M9 12a5 5 0 1 0 .01 0M15 12a5 5 0 1 0 .01 0M1 12h3M20 12h3M12 1v3M12 20v3',
  power: 'M12 12a2 2 0 1 1 2 2 5 5 0 1 1-5-5 8 8 0 1 1-6 7',
  invert: 'M12 3a9 9 0 1 0 .01 0M12 11a1 1 0 1 0 .01 0M5 19L19 5',
  twist: 'M6 3c12 3 0 15 12 18M18 3C6 6 18 18 6 21',
  spherical: 'M12 4a8 8 0 1 0 .01 0M4 12h16',
  swirl: 'M12 12m-1 0a1 1 0 1 1 2 0 3 3 0 1 1-6 0 6 6 0 1 1 12 0 9 9 0 1 1-18 0',
  sin: 'M2 12c3-8 6-8 10 0s7 8 10 0',
  horseshoe: 'M5 4v8a7 7 0 0 0 14 0V4',
  polar: 'M12 20L4 6M12 20L12 4M12 20L20 6M6 9a8 8 0 0 1 12 0',
};

export function glyphPath(id, x, y, size = 24) {
  const d = GLYPHS[id] || SHADE_GLYPHS[id] || DRIVE_GLYPHS[id] || COLLAGE_GLYPHS[id] || (id === 'plus' ? PLUS_GLYPH : id === 'fork' ? FORK_GLYPH : GLYPHS.c);
  const s = size / 24;
  return `<path d="${d}" transform="translate(${x - size / 2} ${y - size / 2}) scale(${s})" vector-effect="non-scaling-stroke"/>`;
}

// the shading network (DESIGN.md "Shading"): the orbit's readings, the maths, the mixes, the ramp's
// own toggles — technical drawing like the rest
export const SHADE_GLYPHS = {
  // readings
  col: 'M4 18l8-12 8 12M8 12h8M12 6v-3',                                   // the fold index: a fold's crease
  trap: 'M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0 -16 0M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M12 4v4', // closest approach
  depth: 'M4 5h16M6 9h12M8 13h8M10 17h4M12 21v-1',                      // iterations going down
  lyap: 'M2 12h4M18 12h4M12 2v4M12 18v4M7 7l2 2M15 15l2 2M17 7l-2 2M7 17l2-2', // the reticle's ticks
  facing: 'M3 20h18M12 20V6M8 10l4-4 4 4M5 14l7-8',                       // the normal toward the eye
  species: 'M8 12a5 5 0 1 0 .01 0M16 12a5 5 0 1 0 .01 0M12 3v4M12 17v4',  // which species leads
  w: 'M4 20L20 4M4 4h6M4 4v6M20 20h-6M20 20v-6M12 12h0',                  // the fourth axis
  piece: 'M3 6h8v12H3zM13 6h8v12h-8z',                                     // a collage's pieces side by side
  seam: 'M3 6c6 0 6 12 9 12s3-12 9-12M12 3v3',                             // the fillet between two pieces
  // maths
  'math.add': 'M12 5v14M5 12h14', 'math.sub': 'M5 12h14', 'math.mul': 'M6 6l12 12M18 6L6 18',
  'math.min': 'M4 8h7l2 8h7', 'math.max': 'M4 16h7l2-8h7', 'math.pow': 'M3 20C10 20 16 14 21 3',
  'math.sin': 'M2 12c3-8 6-8 10 0s7 8 10 0', 'math.bands': 'M3 20h4v-5h5v-5h5V5h4',
  // colour mixes
  'mixc.mix': 'M9 12a6 6 0 1 0 .01 0M15 12a6 6 0 1 0 .01 0',
  'mixc.multiply': 'M9 12a6 6 0 1 0 .01 0M15 12a6 6 0 1 0 .01 0M12 7.5v9',
  'mixc.screen': 'M9 12a6 6 0 1 0 .01 0M15 12a6 6 0 1 0 .01 0M12 3v3M12 18v3',
  'mixc.add': 'M9 12a6 6 0 1 0 .01 0M15 12a6 6 0 1 0 .01 0M12 9v6M9 12h6',
  // the ramp's toggles: interpolation, colour space, mapping mode, log, invert
  'interp.constant': 'M2 18h7v-7h6V5h7', 'interp.linear': 'M2 19L22 5', 'interp.ease': 'M2 19C12 19 12 5 22 5',
  'interp.bspline': 'M2 19C7 19 7 9 12 11s5-6 10-6', 'interp.cardinal': 'M2 19C6 4 9 4 12 12s6 7 10-7',
  'space.rgb': 'M8 9a4 4 0 1 0 .01 0M16 9a4 4 0 1 0 .01 0M12 16a4 4 0 1 0 .01 0',
  'space.hsv': 'M12 3a9 9 0 1 0 .01 0M12 12h9M12 12l-4.5 7.8',
  'space.oklab': 'M4 20V4M4 20h16M4 20L16 8M16 8h-4M16 8v4',
  'mode.clamp': 'M3 6v12M21 6v12M3 12h18', 'mode.repeat': 'M2 18L9 6v12l7-12v12l6-10', 'mode.mirror': 'M2 18L8 6l6 12 6-12',
  log: 'M3 20C4 9 9 5 21 4M3 20h18', invert: 'M3 8h18l-4-4M21 16H3l4 4',
  // the outputs: the surface's colour, the glow
  'out.color': 'M12 12m-6 0a6 6 0 1 0 12 0a6 6 0 1 0 -12 0', 'out.glow': 'M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M12 2v4M12 18v4M2 12h4M18 12h4',
  shade: 'M4 12h16M12 4v16M6 6l12 12',
};

// the drivers (DESIGN.md "Formula v2 — drivers"): orbit readings carry a point (they move with the
// orbit), the start a corner (the origin it was read at); fields as in the chimera's, without species
const AX = { x: 'M3 12h18', y: 'M12 21V3', z: 'M5 19L19 5', w: 'M5 19L19 5M10 10h4v4h-4z' };
const POINT = 'M17 6a1.5 1.5 0 1 0 .01 0', ORIGIN = 'M3 21h5M3 21v-5';
export const DRIVE_GLYPHS = {
  'drv.i': 'M5 15a8 8 0 1 1 3 4M8 19l0-5-5 0M12 8v4h3',                    // the iteration: the loop and a hand
  'drv.r': 'M12 4a8 8 0 1 0 .01 0M12 12l5.6-5.6M12 11.2a.8.8 0 1 0 .01 0',   // |p|: a radius
  'drv.trap': 'M12 4a8 8 0 1 0 .01 0M12 9a3 3 0 1 0 .01 0M2 12h7',          // closest approach so far
  'drv.lyap': 'M2 12h4M18 12h4M12 2v4M12 18v4M9 12l3-3 3 3-3 3z',           // the stretch
  ...Object.fromEntries(Object.entries(AX).map(([k, d]) => [`drv.p${k}`, d + POINT])),
  ...Object.fromEntries(Object.entries(AX).map(([k, d]) => [`drv.${k}`, d + ORIGIN])),
  'drv.axis': 'M2 21L22 3M6 9l3 3M13 10l3 3',
  'drv.sphere': 'M12 1a11 11 0 1 0 .01 0M12 7a5 5 0 1 0 .01 0',
  'drv.noise': 'M2 14c2-3 3-3 5 0s3 3 5 0 3-3 5 0 3 3 5 0',
  'drv.tissue': 'M2 7l6 2 1 7-6 4M8 9l6-6M9 16l7 1 4-6-6-8M16 17l2 6M20 11l3-1',
  'drv.time': 'M12 3a9 9 0 1 0 .01 0M12 7v5l4 2',
  'drv.param': 'M3 15h18M3 12v6M21 12v6M14 15V5M11 8l3-3 3 3',               // another line's value, lifted off it
  'drv.remap': 'M3 18h4l10-12h4M3 15v6M21 3v6',
  // a node's own switches: the time's wave, the tissue's reading, the remap's clamp
  'drv.wave.saw': 'M2 18L9 6v12l7-12v12l6-10', 'drv.wave.sine': 'M2 12c3-8 6-8 10 0s7 8 10 0', 'drv.wave.tri': 'M2 18l5-12 5 12 5-12 5 12',
  'drv.out.cell': 'M2 7l6 2 1 7-6 4M8 9l6-6M9 16l7 1 4-6-6-8M12 11a.8.8 0 1 0 .01 0', 'drv.out.wall': 'M12 2v20M8 6v12M16 6v12',
  'drv.clamp': 'M3 6v12M21 6v12M3 12h18',
};

// a collage's placement and repetition (DESIGN.md "Collage (K)"): the growth (an outline pushed out),
// the repetition's kinds (none, a grid's cells, a mirror's plane, polar spokes)
export const COLLAGE_GLYPHS = {
  'cl.grow': 'M12 7a5 5 0 1 0 .01 0M12 2a10 10 0 1 0 .01 0M12 7V2',
  'rep.none': 'M12 12m-5 0a5 5 0 1 0 10 0a5 5 0 1 0 -10 0',
  'rep.grid': 'M3 3h18v18H3zM9 3v18M15 3v18M3 9h18M3 15h18',
  'rep.mirror': 'M12 2v20M9 7l-6 5 6 5M15 7l6 5-6 5',
  'rep.polar': 'M12 12L12 3M12 12l7.8 4.5M12 12l-7.8 4.5M12 10.5a1.5 1.5 0 1 0 .01 0',
};

// the graph's own: another species (a plus)
export const PLUS_GLYPH = 'M12 5v14M5 12h14';
// the fork: one chain splitting into species (the graph's ring)
export const FORK_GLYPH = 'M12 2v8M12 10L4 20M12 10l8 10M2 20h4M18 20h4';

// export glyphs (the structure layer): a still, a film, splats, a mesh
// the keys a finger has no key for (the structure layer's row on touch): Lyapunov (L, two orbits
// parting), replay (R, the lineage walked), the Metasurface (M, its square, two sites, a wall), drift (Space)
export const KEY_GLYPHS = {
  lyap: 'M3 12h5C13 12 16 10 21 4M8 12C13 12 16 14 21 20',
  replay: 'M3 12h15M15 9l3 3-3 3M5 11v2M10 11v2',
  surface: 'M4 4h16v16H4zM13 4l-3 16M8 9a1 1 0 1 0 .01 0M16 14a1 1 0 1 0 .01 0',
  drift: 'M3 15c3-6 5 1 8-3s5 1 10-5',
};

export const EXPORT_GLYPHS = {
  still: 'M3 5h18v14H3zM3 15l5-5 4 4 3-3 6 6',
  video: 'M2 5h20v14H2zM5 5v14M19 5v14M2 9h3M2 15h3M19 9h3M19 15h3M10 9l5 3-5 3z',
  splats: 'M7 8a2.5 2.5 0 1 0 .01 0M16 6a1.5 1.5 0 1 0 .01 0M15 15a3.5 2 30 1 0 .01 0M7 17a1.5 1.5 0 1 0 .01 0M12 11a1 1 0 1 0 .01 0',
  mesh: 'M12 2l9 5v10l-9 5-9-5V7zM12 12l9-5M12 12v10M12 12L3 7',
};
