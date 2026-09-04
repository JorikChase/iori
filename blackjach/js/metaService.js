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
    apiBaseUrl: '',  // empty = deck sharing / leaderboards disabled
    lastNickname: '', // remembered so sharing/scoring doesn't re-ask every time
    credits: AHB.CONFIG.BETTING.startingCredits, // separate currency for bet mode
    betLog: [], // recent bet-round summaries, newest first
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

  async function addCredits(delta) {
    const current = await getValue('credits');
    const next = Math.max(0, Math.round(current + delta));
    await setValue('credits', next);
    return next;
  }

  async function pushBetLog(entry) {
    const log = (await getValue('betLog')) || [];
    log.unshift({ ...entry, at: Date.now() });
    const trimmed = log.slice(0, 25);
    await setValue('betLog', trimmed);
    return trimmed;
  }

  async function resetStatsAndScores() {
    // "Reset stats" per the settings screen: clears scores + run history +
    // per-card stats + bet credits, but leaves the deck (cards + images) untouched.
    await AHB.db.clear(AHB.db.STORES.stats);
    await setValue('sessionScore', 0);
    await setValue('allTimeScore', 0);
    await setValue('sessionLog', []);
    await setValue('credits', AHB.CONFIG.BETTING.startingCredits);
    await setValue('betLog', []);
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
    addCredits, pushBetLog,
  };
})();
