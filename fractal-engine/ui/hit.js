// Finger-sized hits (DESIGN.md "Finishing touches"): on touch every target of the graphs — nodes, ports,
// links, edges, the schedule's letters and pluses, the glyph buttons — answers within HIT.r layout units of
// itself, 44 CSS px across at the view's zoom (app.js sets HIT.r from each pointer event: 22 / zoom for a
// finger, 0 for a mouse). The drawing does not change; only the reach. Where two enlarged targets overlap,
// the nearer one wins (a port beside its node: the side the finger is on). With a mouse every test keeps
// the reach it had.
export const HIT = { r: 0 };
export const FINGER = 22;
export const reach = (base) => Math.max(base, HIT.r);
