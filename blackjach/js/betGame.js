/* Bet mode: a separate, optional game with the same push-your-luck shape as
   the ladder (draw, answer, then choose to cash out or press on) but paid
   out in credits via a multiplier table instead of additive points. Wager
   up front; each correct answer lets you either quit (settle at your
   current tier) or hit (risk the *entire bet* on the next question — a
   wrong answer while continuing forfeits it all, same as the ladder
   forfeiting an unbanked pot). Reaching the last question correctly is an
   automatic full clear (the only way to trigger BIG WIN, since it means
   every question up to that point was answered correctly in a row).

   Its own currency (credits), entirely separate from points/session/
   all-time score and the public leaderboard — reuses the ladder's
   card-drawing/scoring plumbing (draw.js, statsService, LADDER.rungs for
   question count + difficulty progression), not its points economy. */
window.AHB = window.AHB || {};

AHB.betGame = (function () {
  const { rungs } = AHB.CONFIG.LADDER;
  const { betOptions, payoutMultipliers } = AHB.CONFIG.BETTING;
  const totalQuestions = rungs.length;

  let state = {
    phase: 'idle', // idle -> flipping -> question -> correct-choice -> (loop) -> settled | empty-deck
    bet: 0,
    questionIndex: 0,
    correctCount: 0,
    usedCardIds: new Set(),
    currentCard: null,
    currentOptions: [],
    selectedOption: null,
    lastRoundSummary: null, // {bet, correctCount, total, multiplier, delta, newBalance, bigWin, outcome}
    credits: 0,
  };

  let listeners = [];
  let subscribedToDecks = false;
  function onChange(fn) { listeners.push(fn); }
  function emit() { listeners.forEach((fn) => fn(state)); }

  function currentMultiplier() { return payoutMultipliers[state.correctCount] ?? 0; }

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

    if (!correct) {
      // Wrong while continuing forfeits the whole bet, regardless of how
      // many questions were already answered correctly this round.
      await settleRound('lost');
      return;
    }

    state.correctCount += 1;
    const clearedAll = state.correctCount === totalQuestions;
    if (clearedAll) {
      await settleRound('won'); // full clear — the only path to BIG WIN
    } else {
      state.phase = 'correct-choice';
      emit();
    }
  }

  async function quit() {
    if (state.phase !== 'correct-choice') return;
    await settleRound('quit');
  }

  async function hit() {
    if (state.phase !== 'correct-choice') return;
    state.questionIndex += 1;
    await drawNext();
  }

  async function settleRound(outcome) {
    // A loss always forfeits the bet at the "0 correct" tier — same value
    // whether you missed the very first question or the fourth.
    const multiplier = outcome === 'lost' ? payoutMultipliers[0] : currentMultiplier();
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
      bigWin: outcome === 'won',
      outcome, // 'won' | 'lost' | 'quit'
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
  function getCurrentMultiplier() { return currentMultiplier(); }
  function getMultiplierFor(correctCount) { return payoutMultipliers[correctCount] ?? 0; }

  return {
    init, onChange, getState, getTotalQuestions, getBetOptions,
    getCurrentMultiplier, getMultiplierFor,
    placeBet, answer, quit, hit, acknowledgeAndReset,
  };
})();
