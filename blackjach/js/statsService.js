/* Per-card stats: times seen, times correct, last seen, last-wrong timestamp
   (the last one drives the "weight toward misses" draw logic in draw.js). */
window.AHB = window.AHB || {};

AHB.statsService = (function () {
  const STORE = AHB.db.STORES.stats;

  function blank(cardId) {
    return { cardId, timesSeen: 0, timesCorrect: 0, lastSeen: null, lastWrongAt: null };
  }

  async function getAllAsMap() {
    const rows = await AHB.db.getAll(STORE);
    const map = {};
    rows.forEach((r) => { map[r.cardId] = r; });
    return map;
  }

  async function get(cardId) {
    const row = await AHB.db.get(STORE, cardId);
    return row || blank(cardId);
  }

  async function recordAnswer(cardId, wasCorrect) {
    const s = await get(cardId);
    s.timesSeen += 1;
    if (wasCorrect) s.timesCorrect += 1;
    else s.lastWrongAt = Date.now();
    s.lastSeen = Date.now();
    await AHB.db.put(STORE, s);
    return s;
  }

  // Worst-accuracy cards first; requires at least `minSeen` exposures so a
  // single unlucky draw doesn't dominate the list.
  async function leaks(cards, { minSeen = 2, limit = 10 } = {}) {
    const statsMap = await getAllAsMap();
    return cards
      .map((c) => ({ card: c, stats: statsMap[c.id] || blank(c.id) }))
      .filter((row) => row.stats.timesSeen >= minSeen)
      .sort((a, b) => (a.stats.timesCorrect / a.stats.timesSeen) - (b.stats.timesCorrect / b.stats.timesSeen))
      .slice(0, limit);
  }

  return { blank, getAllAsMap, get, recordAnswer, leaks };
})();
