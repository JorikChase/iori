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
