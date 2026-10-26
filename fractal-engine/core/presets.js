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
  // the Mandelbox turned through the fourth dimension every iteration (pseudo-Kleinian needs its own
  // slab estimate; with r/dr it fills space — not yet)
  { id: 'mandelbox-4d', text: 'fold.box 1 · fold.sphere .5 1 · rotate4 0 0 15 0 10 0 · scale 2 · +c ×12 bail=100', view: 20, axes: [[2, 'xw', 30], [2, 'yw', 30]], at: [-0.85, -0.6] },
  // the IFS family (bottom)
  { id: 'menger', text: 'abs · sort · scale 3 · translate -2 -2 · fold.plane 0 0 -1 -1 ×8 bail=50', view: 3.2, axes: [[2, 's', 0.8], [3, 'x', 0.6]], at: [-0.2, -0.75] },
  { id: 'sierpinski', text: 'fold.plane 1 1 0 · fold.plane 1 0 1 · fold.plane 0 1 1 · scale 2 · translate -1 -1 -1 ×16 bail=16', view: 3, axes: [[3, 's', 0.6], [4, 'x', 0.6]], at: [0.25, -0.6] },
  { id: 'kifs', text: 'abs · fold.plane 1 -1 0 · fold.plane 0 1 -1 · rotate 10 15 0 · scale 2 · translate -1 -1 -1 ×12 bail=30', view: 3.2, axes: [[3, 'x', 40], [3, 'y', 40]], at: [0.6, -0.75] },
];

export const presetById = (id) => PRESETS.find((p) => p.id === id);
