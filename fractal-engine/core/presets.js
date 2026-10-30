// The families: one formula each, single-slot so any two can be species of one chimera. Julia-type
// families add their constant with `translate` rather than a fixed c, so they compose with
// Mandelbrot-type ones (whose +c is the point itself).
//
//   id     a name for code and tests (the UI shows the glyph and the field, never a word)
//   text   the formula
//   view   camera distance that frames it, looking at the origin
//   axes   the parameters that breed inside its cell on the Metasurface: [op index, key, span] — the
//          horizontal axis first; moving across the cell sweeps value ± span/2
//   at     its site on the Metasurface, in [−1, 1]² (related families are neighbours)
//   eye    optional: { pos, yaw, pitch }, a camera inside it. The Kleinian families have no outside to
//          frame, so their sites stand in a hall (chosen by a CPU coverage scan: DESIGN.md)

export const PRESETS = [
  // the power family (right)
  { id: 'mandelbulb', text: 'bulb 8 · +c ×10 bail=4', view: 2.6, axes: [[0, 'n', 6]], at: [0.62, -0.05] },
  { id: 'bulb4', text: 'bulb4 8 · +c ×8 bail=2', view: 2.5, axes: [[0, 'n', 6]], at: [0.75, 0.55] },
  { id: 'quat-mandelbrot', text: 'quat · +c ×12 bail=4', view: 3, axes: [], at: [0.25, 0.45] },
  { id: 'quat-julia', text: 'quat · translate -.2 .6 .2 .1 ×12 bail=4', view: 2.4, axes: [[1, 'x', 0.8], [1, 'y', 0.6]], at: [0.3, 0.85] },
  // the box family (left)
  { id: 'mandelbox', text: 'fold.box 1 · fold.sphere .5 1 · scale 2.5 · +c ×12 bail=100', view: 16, axes: [[2, 's', 1.2], [1, 'rmin', 0.6]], at: [-0.55, -0.1] },
  { id: 'mandelbox-neg', text: 'fold.box 1 · fold.sphere .5 1 · scale -1.5 · +c ×14 bail=100', view: 5.5, axes: [[2, 's', 0.8], [0, 'l', 0.4]], at: [-0.8, 0.5] },
  { id: 'amazing-surf', text: 'fold.plane -1 0 0 -1 · fold.plane 1 0 0 -1 · fold.plane 0 -1 0 -1 · fold.plane 0 1 0 -1 · fold.sphere .5 1 · scale 2 · rotate 0 0 20 · +c ×12 bail=100', view: 8, axes: [[5, 's', 0.8], [6, 'z', 40]], at: [-0.25, 0.4] },
  // DarkBeam's stepped fold in the Mandelbox's place (Beddard's Aurullia)
  { id: 'mandalay', text: 'fold.mandalay .5 .15 · fold.sphere .5 1 · scale 2.3 · rotate 0 0 10 · +c ×12 bail=100', view: 4, axes: [[2, 's', 0.6], [0, 'fo', 0.3]], at: [-0.55, 0.8] },
  // the Mandelbox turned through the fourth dimension every iteration
  { id: 'mandelbox-4d', text: 'fold.box 1 · fold.sphere .5 1 · rotate4 0 0 15 0 10 0 · scale 2 · +c ×12 bail=100', view: 20, axes: [[2, 'xw', 30], [2, 'yw', 30]], at: [-0.85, -0.6] },
  // the IFS family (bottom)
  { id: 'menger', text: 'abs · sort · scale 3 · translate -2 -2 · fold.plane 0 0 -1 -1 ×8 bail=50', view: 3.2, axes: [[2, 's', 0.8], [3, 'x', 0.6]], at: [-0.2, -0.75] },
  { id: 'sierpinski', text: 'fold.plane 1 1 0 · fold.plane 1 0 1 · fold.plane 0 1 1 · scale 2 · translate -1 -1 -1 ×16 bail=16', view: 3, axes: [[3, 's', 0.6], [4, 'x', 0.6]], at: [0.25, -0.6] },
  { id: 'kifs', text: 'abs · fold.plane 1 -1 0 · fold.plane 0 1 -1 · rotate 10 15 0 · scale 2 · translate -1 -1 -1 ×12 bail=30', view: 3.2, axes: [[3, 'x', 40], [3, 'y', 40]], at: [0.6, -0.75] },
  // the Kleinian family (the middle: they answer to neither r/dr nor escape time, each ends on a seed)
  { id: 'pseudo-kleinian', text: 'fold.cell .92 .91 .92 · fold.sphere 0 1 · seed.slab ×12 bail=100', view: 3, axes: [[0, 'lz', 0.2], [0, 'lx', 0.2]], at: [0.05, -0.15],
    eye: { pos: [-1.204, -0.34, -0.779], yaw: 2.29, pitch: -0.08 } },
  { id: 'kleinian-pillars', text: 'fold.cell .92 .91 .92 · fold.sphere 0 1 · translate .1 .12 · seed.pillar .08 ×12 bail=100', view: 3, axes: [[2, 'x', 0.2], [3, 'r', 0.1]], at: [-0.05, -0.45],
    eye: { pos: [-1.144, -0.068, -0.21], yaw: 4.84, pitch: 0.25 } },
  { id: 'apollonian', text: 'wrap 1 1 1 · invert · scale 1.1 · seed.slab 0 1 0 0 0 .4 ×8 bail=1000', view: 2.9, axes: [[2, 's', 0.2], [3, 'd', 0.4]], at: [0.3, 0.1],
    eye: { pos: [0.95, -0.284, -0.842], yaw: 2.15, pitch: 0.38 } },
  { id: 'kleinian', text: 'kleinian 1.95 .02 ×40 bail=100', view: 3, axes: [[0, 'a', 0.2], [0, 'b', 0.3]], at: [-0.02, 0.2],
    eye: { pos: [-0.516, 0.882, -0.135], yaw: 0.3, pitch: 0.07 } },
];

export const presetById = (id) => PRESETS.find((p) => p.id === id);
