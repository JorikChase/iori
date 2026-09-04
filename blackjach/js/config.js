/* =========================================================
   CONFIG — blackjach
   Change the ladder length, point values, or draw behaviour
   by editing this one object. Nothing else in the codebase
   hardcodes rung counts or point totals.
   ========================================================= */
window.AHB = window.AHB || {};

AHB.CONFIG = {
  LADDER: {
    // Add/remove/re-order entries to change the ladder. `difficulty`
    // matches Card.difficulty (1 = easy, 2 = medium, 3 = hard).
    rungs: [
      { rung: 1, difficulty: 1, points: 1 },
      { rung: 2, difficulty: 2, points: 2 },
      { rung: 3, difficulty: 2, points: 2 },
      { rung: 4, difficulty: 3, points: 3 },
      { rung: 5, difficulty: 3, points: 3 },
      { rung: 6, difficulty: 3, points: 3 },
    ],
    // Bonus added on top of the summed rung points when every rung is cleared.
    clearBonus: 5,
    optionsPerQuestion: 5,
    fallback: {
      // A difficulty bucket smaller than this triggers the "thin pool"
      // warning in the editor, and draw() widens into neighbour difficulties.
      minPoolSize: 5,
      maxWiden: 1,
    },
  },

  // A separate, optional game mode: wager credits, answer a fixed run of
  // questions (same length + difficulty progression as LADDER.rungs, so
  // editing the ladder above automatically reshapes bet rounds too), get
  // paid out by how many you got right. Its own currency — entirely
  // separate from points/session/all-time score and the public leaderboard.
  BETTING: {
    startingCredits: 100,
    betOptions: [4, 10, 20],
    // Net multiplier applied to the bet, indexed by correct-answer count
    // (0..rungs.length). Must have exactly rungs.length + 1 entries.
    // e.g. 3 correct out of 6 -> credits += bet * 1.5
    payoutMultipliers: [-1, -0.5, 0, 1.5, 2, 3, 4],
  },

  DIFFICULTY_LABELS: { 1: 'Easy', 2: 'Medium', 3: 'Hard' },

  IMAGE: {
    maxDimension: 900,
    jpegQuality: 0.85,
  },

  DB: {
    name: 'ahb-blackjack',
    version: 2,
    stores: { decks: 'decks', cards: 'cards', images: 'images', stats: 'stats', meta: 'meta' },
  },

  DEFAULT_DECK_NAME: 'Art History Starter Deck',
};

// Total pot for a full clear, derived from the ladder above (not hardcoded).
AHB.CONFIG.LADDER.fullClearPoints = AHB.CONFIG.LADDER.rungs.reduce((sum, r) => sum + r.points, 0);

if (AHB.CONFIG.BETTING.payoutMultipliers.length !== AHB.CONFIG.LADDER.rungs.length + 1) {
  console.warn(
    `BETTING.payoutMultipliers has ${AHB.CONFIG.BETTING.payoutMultipliers.length} entries but ` +
    `LADDER.rungs has ${AHB.CONFIG.LADDER.rungs.length} rungs — it needs rungs.length + 1 entries ` +
    `(one per possible correct-answer count, 0..rungs.length).`
  );
}
