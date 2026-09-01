/* The push-your-luck state machine. UI layers subscribe via onChange and
   re-render whenever state changes; game.js owns no DOM. */
window.AHB = window.AHB || {};

AHB.game = (function () {
  const { rungs, clearBonus } = AHB.CONFIG.LADDER;

  let state = {
    phase: 'idle',        // idle -> flipping -> question -> correct-choice | wrong | won
    rungIndex: 0,
    pot: 0,
    usedCardIds: new Set(),
    currentCard: null,
    currentOptions: [],
    selectedOption: null,
    lastRunSummary: null, // {outcome, rungsCleared, pointsBanked, endCard}
    sessionScore: 0,
    allTimeScore: 0,
  };

  let listeners = [];
  let subscribedToDecks = false;
  function onChange(fn) { listeners.push(fn); }
  function emit() { listeners.forEach((fn) => fn(state)); }

  function currentRung() { return rungs[state.rungIndex]; }

  async function init() {
    state.sessionScore = await AHB.metaService.getValue('sessionScore');
    state.allTimeScore = await AHB.metaService.getValue('allTimeScore');
    // Switching decks (from the header switcher, only enabled between runs)
    // still resets defensively so a stale run can never straddle two decks.
    // init() can be called more than once (settings screen re-syncs scores
    // after a reset/wipe) — subscribe exactly once regardless.
    if (!subscribedToDecks) {
      subscribedToDecks = true;
      AHB.decksService.onChange(() => resetRun());
    }
    emit();
  }

  function resetRun() {
    state.phase = 'idle';
    state.rungIndex = 0;
    state.pot = 0;
    state.usedCardIds = new Set();
    state.currentCard = null;
    state.currentOptions = [];
    state.selectedOption = null;
    emit();
  }

  async function drawNext() {
    const deckId = await AHB.decksService.getActiveId();
    const cards = await AHB.deckService.getAll(deckId);
    if (cards.length === 0) {
      state.phase = 'empty-deck';
      emit();
      return;
    }
    const statsMap = await AHB.statsService.getAllAsMap();
    const rung = currentRung();
    const card = AHB.draw.drawCard(cards, statsMap, rung.difficulty, state.usedCardIds);
    if (!card) {
      state.phase = 'empty-deck';
      emit();
      return;
    }
    state.usedCardIds.add(card.id);
    state.currentCard = card;
    state.currentOptions = AHB.draw.buildOptions(card, cards);
    state.selectedOption = null;
    state.phase = 'flipping';
    emit();
    // Brief flip animation, then reveal the question — kept short per spec.
    setTimeout(() => {
      if (state.phase === 'flipping') {
        state.phase = 'question';
        emit();
      }
    }, 280);
  }

  async function answer(optionText) {
    if (state.phase !== 'question') return;
    const card = state.currentCard;
    const correct = optionText === card.answer;
    state.selectedOption = optionText;
    await AHB.statsService.recordAnswer(card.id, correct);

    if (correct) {
      const rung = currentRung();
      state.pot += rung.points;
      const isLastRung = state.rungIndex === rungs.length - 1;
      if (isLastRung) {
        await finishRun('won');
      } else {
        state.phase = 'correct-choice';
        emit();
      }
    } else {
      await finishRun('lost');
    }
  }

  async function finishRun(outcome) {
    const rungsCleared = outcome === 'won' ? rungs.length : state.rungIndex + (outcome === 'lost' ? 0 : 1);
    let pointsBanked = 0;

    if (outcome === 'won') {
      pointsBanked = AHB.CONFIG.LADDER.fullClearPoints + clearBonus;
    } else if (outcome === 'banked') {
      pointsBanked = state.pot;
    } else {
      pointsBanked = 0; // lost: pot is forfeited
    }

    if (pointsBanked > 0) {
      const { session, allTime } = await AHB.metaService.addScore(pointsBanked);
      state.sessionScore = session;
      state.allTimeScore = allTime;
    }

    state.lastRunSummary = {
      outcome,
      rungsCleared,
      pointsBanked,
      endCard: outcome === 'lost' ? state.currentCard : null,
      deckId: await AHB.decksService.getActiveId(),
    };
    await AHB.metaService.pushSessionLog(state.lastRunSummary);

    state.phase = outcome === 'won' ? 'won' : outcome === 'lost' ? 'wrong' : 'banked';
    emit();
  }

  async function bank() {
    if (state.phase !== 'correct-choice') return;
    await finishRun('banked');
  }

  async function hit() {
    if (state.phase !== 'correct-choice') return;
    state.rungIndex += 1;
    await drawNext();
  }

  function acknowledgeAndReset() {
    resetRun();
  }

  function getState() { return state; }
  function getLadder() { return rungs; }

  return {
    init, onChange, getState, getLadder, currentRung,
    drawNext, answer, bank, hit, acknowledgeAndReset,
  };
})();
