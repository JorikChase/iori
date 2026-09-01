/* Card drawing (weighted toward misses, no repeats within a run, fallback to
   adjacent difficulties when a pool is thin) and multiple-choice option
   building (hand-written distractors first, then plausible auto-fill). */
window.AHB = window.AHB || {};

AHB.draw = (function () {
  function weightForCard(card, statsMap) {
    const s = statsMap[card.id];
    if (!s || s.timesSeen === 0) return 1;
    const wrongCount = Math.max(0, s.timesSeen - s.timesCorrect);
    return 1 + wrongCount * 1.5; // more misses -> more likely to reappear
  }

  function weightedPick(pool, statsMap) {
    const weights = pool.map((c) => weightForCard(c, statsMap));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  // Picks one card for `difficulty`, excluding `usedIds`. Widens into
  // neighbouring difficulties when the exact-difficulty pool is thin.
  function drawCard(allCards, statsMap, difficulty, usedIds) {
    const { minPoolSize, maxWiden } = AHB.CONFIG.LADDER.fallback;
    const sameDifficulty = allCards.filter((c) => c.difficulty === difficulty);

    let widen = 0;
    let candidatePool = sameDifficulty;
    while (candidatePool.length < minPoolSize && widen < maxWiden) {
      widen++;
      candidatePool = allCards.filter((c) => Math.abs(c.difficulty - difficulty) <= widen);
    }

    let pool = candidatePool.filter((c) => !usedIds.has(c.id));
    if (pool.length === 0) pool = candidatePool; // run has used them all: allow a repeat
    if (pool.length === 0) return null; // deck is empty

    return weightedPick(pool, statsMap);
  }

  // Builds `optionsPerQuestion` shuffled options for `card`, including the
  // correct answer exactly once.
  function buildOptions(card, allCards) {
    const need = AHB.CONFIG.LADDER.optionsPerQuestion - 1;
    const chosen = [];
    const seen = new Set([card.answer]);

    (card.distractors || []).forEach((d) => {
      if (chosen.length < need && d && !seen.has(d)) {
        chosen.push(d);
        seen.add(d);
      }
    });

    if (chosen.length < need) {
      const scored = allCards
        .filter((c) => c.id !== card.id && c.answer && !seen.has(c.answer))
        .map((c) => {
          const sharesTag = (c.tags || []).some((t) => (card.tags || []).includes(t));
          const sameDifficulty = c.difficulty === card.difficulty;
          // Same difficulty is weighted higher than shared tag: cards at the
          // same difficulty tend to share an "answer shape" (movement name,
          // decade, designer name…), which matters more for plausibility
          // than topical overlap alone.
          return { answer: c.answer, score: (sameDifficulty ? 2 : 0) + (sharesTag ? 1 : 0) };
        });

      // Dedupe by answer text, keeping the best score seen for it.
      const byAnswer = new Map();
      scored.forEach(({ answer, score }) => {
        if (!byAnswer.has(answer) || byAnswer.get(answer) < score) byAnswer.set(answer, score);
      });

      const ranked = AHB.utils.shuffle([...byAnswer.entries()]).sort((a, b) => b[1] - a[1]);
      for (const [answer] of ranked) {
        if (chosen.length >= need) break;
        chosen.push(answer);
        seen.add(answer);
      }
    }

    let fillerN = 1;
    while (chosen.length < need) {
      chosen.push(`(no alternative available ${fillerN++})`);
    }

    return AHB.utils.shuffle([card.answer, ...chosen]);
  }

  return { drawCard, buildOptions, weightForCard };
})();
