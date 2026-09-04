/* Bet mode: a separate, optional game — wager credits, answer a fixed run
   of questions (same length + difficulty progression as the ladder, via
   AHB.CONFIG.LADDER.rungs), get paid by how many you got right. Its own
   currency (credits), entirely separate from points/session/all-time score
   and the public leaderboard — reuses the ladder's card-drawing/scoring
   plumbing (draw.js, statsService), not its points economy. */
window.AHB = window.AHB || {};

AHB.betGame = (function () {
  const { rungs } = AHB.CONFIG.LADDER;
  const { betOptions, payoutMultipliers } = AHB.CONFIG.BETTING;
  const totalQuestions = rungs.length;
  const RESOLVE_PAUSE_MS = 900; // time the correct/wrong highlight stays up before auto-advancing

  let state = {
    phase: 'idle', // idle -> flipping -> question -> resolved -> (loop) -> settled | empty-deck
    bet: 0,
    questionIndex: 0,
    correctCount: 0,
    usedCardIds: new Set(),
    currentCard: null,
    currentOptions: [],
    selectedOption: null,
    lastRoundSummary: null, // {bet, correctCount, total, multiplier, delta, newBalance, bigWin}
    credits: 0,
  };

  let listeners = [];
  let subscribedToDecks = false;
  function onChange(fn) { listeners.push(fn); }
  function emit() { listeners.forEach((fn) => fn(state)); }

  async function init() {
    state.credits = await AHB.metaService.getValue('credits');
    // Switching decks is locked out mid-round by the header switcher, but
    // reset defensively anyway so a stale round can never straddle two decks.
    if (!subscribedToDecks) {
      subscribedToDecks = true;
      AHB.decksService.onChange(() => resetRound());
    }
    emit();
  }

  function resetRound() {
    state.phase = 'idle';
    state.bet = 0;
    state.questionIndex = 0;
    state.correctCount = 0;
    state.usedCardIds = new Set();
    state.currentCard = null;
    state.currentOptions = [];
    state.selectedOption = null;
    emit();
  }

  async function placeBet(amount) {
    if (state.phase !== 'idle' && state.phase !== 'empty-deck') return;
    if (!betOptions.includes(amount) || amount > state.credits) return;
    state.bet = amount;
    state.questionIndex = 0;
    state.correctCount = 0;
    state.usedCardIds = new Set();
    await drawNext();
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
    const rung = rungs[state.questionIndex];
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
    if (correct) state.correctCount += 1;

    // Unlike the ladder, a wrong answer doesn't end the round early — the
    // player always answers all `totalQuestions`, right or wrong.
    state.phase = 'resolved';
    emit();

    setTimeout(async () => {
      state.questionIndex += 1;
      if (state.questionIndex >= totalQuestions) {
        await settleRound();
      } else {
        await drawNext();
      }
    }, RESOLVE_PAUSE_MS);
  }

  async function settleRound() {
    const multiplier = payoutMultipliers[state.correctCount] ?? 0;
    const delta = Math.round(state.bet * multiplier);
    const newBalance = await AHB.metaService.addCredits(delta);
    state.credits = newBalance;

    state.lastRoundSummary = {
      bet: state.bet,
      correctCount: state.correctCount,
      total: totalQuestions,
      multiplier,
      delta,
      newBalance,
      bigWin: state.correctCount === totalQuestions,
    };
    await AHB.metaService.pushBetLog(state.lastRoundSummary);

    state.phase = 'settled';
    emit();
  }

  function acknowledgeAndReset() {
    resetRound();
  }

  function getState() { return state; }
  function getTotalQuestions() { return totalQuestions; }
  function getBetOptions() { return betOptions; }

  return {
    init, onChange, getState, getTotalQuestions, getBetOptions,
    placeBet, answer, acknowledgeAndReset,
  };
})();
