/* Session score, all-time score, and small persisted settings/log entries.
   Stored in the IndexedDB "meta" store as {key, value} rows. */
window.AHB = window.AHB || {};

AHB.metaService = (function () {
  const STORE = AHB.db.STORES.meta;

  const DEFAULTS = {
    sessionScore: 0,
    allTimeScore: 0,
    seeded: false,
    sessionLog: [], // recent run summaries, newest first
  };

  async function getValue(key) {
    const row = await AHB.db.get(STORE, key);
    return row ? row.value : DEFAULTS[key];
  }

  async function setValue(key, value) {
    await AHB.db.put(STORE, { key, value });
    return value;
  }

  async function addScore(points) {
    const session = (await getValue('sessionScore')) + points;
    const allTime = (await getValue('allTimeScore')) + points;
    await setValue('sessionScore', session);
    await setValue('allTimeScore', allTime);
    return { session, allTime };
  }

  async function resetSessionScore() {
    return setValue('sessionScore', 0);
  }

  async function pushSessionLog(entry) {
    const log = (await getValue('sessionLog')) || [];
    log.unshift({ ...entry, at: Date.now() });
    const trimmed = log.slice(0, 25);
    await setValue('sessionLog', trimmed);
    return trimmed;
  }

  async function resetStatsAndScores() {
    // "Reset stats" per the settings screen: clears scores + run history +
    // per-card stats, but leaves the deck (cards + images) untouched.
    await AHB.db.clear(AHB.db.STORES.stats);
    await setValue('sessionScore', 0);
    await setValue('allTimeScore', 0);
    await setValue('sessionLog', []);
  }

  async function wipeEverything() {
    await AHB.db.clear(AHB.db.STORES.decks);
    await AHB.db.clear(AHB.db.STORES.cards);
    await AHB.db.clear(AHB.db.STORES.images);
    await AHB.db.clear(AHB.db.STORES.stats);
    await AHB.db.clear(AHB.db.STORES.meta);
  }

  return {
    getValue, setValue, addScore, resetSessionScore,
    pushSessionLog, resetStatsAndScores, wipeEverything,
  };
})();
