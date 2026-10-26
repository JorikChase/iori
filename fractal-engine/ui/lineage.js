// The lineage: every formula you made, as a tree. Nothing is ever overwritten — going back and editing
// starts a branch, so yesterday's fern is always one click away. Each node keeps the formula, the camera,
// the mode and a thumbnail. Kept in this browser's localStorage (a per-viewer convenience; the formula
// itself always travels in the URL).

const KEY = 'fractal-engine.lineage.v1';
const MAX_NODES = 600;
const MAX_THUMBS = 160;

export function createLineage() {
  let nodes = [], cur = null, nextId = 1;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && Array.isArray(raw.nodes)) { nodes = raw.nodes; cur = raw.cur; nextId = raw.nextId || nodes.length + 1; }
  } catch { /* private window or blocked storage: the lineage lives for this page only */ }

  const byId = (id) => nodes.find((n) => n.id === id) || null;
  const same = (a, b) => a && b && a.text === b.text && a.mode === b.mode;

  function save() {
    // keep the newest nodes and thumbnails; a pruned parent turns its children into roots
    if (nodes.length > MAX_NODES) {
      const keep = new Set(nodes.slice(-MAX_NODES).map((n) => n.id));
      nodes = nodes.filter((n) => keep.has(n.id));
      for (const n of nodes) if (n.parent != null && !keep.has(n.parent)) n.parent = null;
    }
    const withThumb = nodes.filter((n) => n.thumb);
    for (const n of withThumb.slice(0, Math.max(0, withThumb.length - MAX_THUMBS))) delete n.thumb;
    try { localStorage.setItem(KEY, JSON.stringify({ nodes, cur, nextId })); } catch { /* full or blocked */ }
  }

  // snap: { text, cam, mode }. The same formula and mode as the current node only refreshes its camera.
  function commit(snap) {
    const c = byId(cur);
    if (same(c, snap)) { c.cam = snap.cam; save(); return c; }
    const n = { id: nextId++, parent: c ? c.id : null, text: snap.text, cam: snap.cam, mode: snap.mode, t: Date.now() };
    nodes.push(n);
    cur = n.id;
    save();
    return n;
  }

  function jump(id) { const n = byId(id); if (n) { cur = id; save(); } return n; }
  const parent = () => { const c = byId(cur); return c && c.parent != null ? byId(c.parent) : null; };
  const child = () => {
    const kids = nodes.filter((n) => n.parent === cur);
    return kids.length ? kids[kids.length - 1] : null;
  };
  function setThumb(id, url) { const n = byId(id); if (n) { n.thumb = url; save(); } }

  // a layout for drawing: generation → column, each leaf its own lane; only the newest `limit` nodes
  function layout(limit = 48) {
    const shown = nodes.slice(-limit);
    const ids = new Set(shown.map((n) => n.id));
    const kids = new Map();
    const roots = [];
    for (const n of shown) {
      if (n.parent != null && ids.has(n.parent)) {
        if (!kids.has(n.parent)) kids.set(n.parent, []);
        kids.get(n.parent).push(n);
      } else roots.push(n);
    }
    const pos = new Map();
    let lane = 0;
    const walk = (n, depth) => {
      const ch = kids.get(n.id) || [];
      const myLane = lane;
      pos.set(n.id, { col: depth, lane: myLane });
      if (!ch.length) lane++;
      ch.forEach((k) => walk(k, depth + 1));
    };
    roots.forEach((r) => walk(r, 0));
    return shown.map((n) => ({ ...n, ...pos.get(n.id), current: n.id === cur }));
  }

  return { commit, jump, parent, child, setThumb, layout, get cur() { return cur; }, get size() { return nodes.length; }, byId };
}
