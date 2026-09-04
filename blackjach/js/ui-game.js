/* Renders the "Training" screen (the ladder/points game, AHB.game's state —
   not to be confused with the "Play" tab, which is bet mode) and wires up
   its controls, including the keyboard shortcuts (1-5 answer, B bank, H
   hit, Space draw/continue). */
window.AHB = window.AHB || {};

AHB.uiGame = (function () {
  const el = {};
  const cardFace = AHB.cardRenderer();
  let pendingScoreSubmit = null; // {serverId, points, rungsCleared, outcome} for the run just finished

  function cacheEls() {
    el.ladder = document.getElementById('ladder');
    el.potValue = document.getElementById('pot-value');
    el.card = document.getElementById('playing-card');
    el.cardDifficulty = document.getElementById('card-difficulty');
    el.cardImage = document.getElementById('card-image');
    el.cardPrompt = document.getElementById('card-prompt');
    el.options = document.getElementById('options');
    el.decision = document.getElementById('decision');
    el.bankAmount = document.getElementById('bank-amount');
    el.runResult = document.getElementById('run-result');
    el.runResultTitle = document.getElementById('run-result-title');
    el.runResultDetail = document.getElementById('run-result-detail');
    el.runResultNote = document.getElementById('run-result-note');
    el.drawPrompt = document.getElementById('draw-prompt');
    el.emptyDeckNotice = document.getElementById('empty-deck-notice');
    el.btnDraw = document.getElementById('btn-draw');
    el.btnBank = document.getElementById('btn-bank');
    el.btnHit = document.getElementById('btn-hit');
    el.btnContinue = document.getElementById('btn-continue');
    el.scoreSession = document.getElementById('score-session');
    el.scoreAllTime = document.getElementById('score-alltime');

    el.scoreSubmit = document.getElementById('score-submit');
    el.scoreSubmitDeckName = document.getElementById('score-submit-deck-name');
    el.scoreSubmitNickname = document.getElementById('score-submit-nickname');
    el.btnSubmitScore = document.getElementById('btn-submit-score');
    el.scoreSubmitResult = document.getElementById('score-submit-result');
  }

  function renderLadder(state) {
    const rungs = AHB.game.getLadder();
    el.ladder.innerHTML = rungs.map((r, i) => {
      const cls = ['ladder__rung'];
      if (i < state.rungIndex) cls.push('is-cleared');
      if (i === state.rungIndex) cls.push('is-current');
      return `<li class="${cls.join(' ')}" data-points="+${r.points}"></li>`;
    }).join('');
  }

  function renderCardFace(card) {
    return cardFace.render({ difficulty: el.cardDifficulty, image: el.cardImage, prompt: el.cardPrompt }, card);
  }

  function renderOptions(state) {
    const { phase, currentOptions, currentCard, selectedOption } = state;
    if (!currentOptions.length) {
      el.options.innerHTML = '';
      return;
    }
    const showResolution = phase !== 'question' && phase !== 'flipping';
    el.options.innerHTML = currentOptions.map((opt, i) => {
      const cls = ['option-btn'];
      if (showResolution) {
        if (opt === currentCard.answer) cls.push('is-correct');
        else if (opt === selectedOption) cls.push('is-wrong');
      }
      return `<button type="button" class="${cls.join(' ')}" data-option="${AHB.utils.escapeHtml(opt)}" ${showResolution ? 'disabled' : ''}>
        <span class="option-btn__key">${i + 1}</span><span>${AHB.utils.escapeHtml(opt)}</span>
      </button>`;
    }).join('');
  }

  // Only for runs that scored on a deck linked to a public leaderboard
  // (has a serverId — either shared or imported from Community).
  async function renderScoreSubmit(state) {
    if (!['won', 'banked'].includes(state.phase)) {
      pendingScoreSubmit = null;
      el.scoreSubmit.hidden = true;
      return;
    }
    const deck = await AHB.decksService.getActive();
    if (!deck?.serverId) {
      pendingScoreSubmit = null;
      el.scoreSubmit.hidden = true;
      return;
    }
    el.scoreSubmit.hidden = false;
    el.scoreSubmitDeckName.textContent = deck.name;
    el.scoreSubmitResult.hidden = true;
    el.scoreSubmitNickname.value = (await AHB.metaService.getValue('lastNickname')) || '';
    el.btnSubmitScore.disabled = false;
    el.btnSubmitScore.hidden = false;
    el.btnSubmitScore.textContent = 'Submit';
    pendingScoreSubmit = {
      serverId: deck.serverId,
      deckName: deck.name,
      points: state.lastRunSummary.pointsBanked,
      rungsCleared: state.lastRunSummary.rungsCleared,
      outcome: state.lastRunSummary.outcome,
    };
  }

  async function handleSubmitScore() {
    if (!pendingScoreSubmit) return;
    const nickname = el.scoreSubmitNickname.value.trim();
    if (!nickname) { el.scoreSubmitNickname.focus(); return; }
    el.btnSubmitScore.disabled = true;
    el.btnSubmitScore.textContent = 'Submitting…';
    const { serverId, deckName, points, rungsCleared, outcome } = pendingScoreSubmit;
    try {
      await AHB.apiService.submitScore(serverId, { nickname, points, rungsCleared, outcome });
      await AHB.metaService.setValue('lastNickname', nickname);
      el.btnSubmitScore.hidden = true;
      el.scoreSubmitResult.hidden = false;
      el.scoreSubmitResult.innerHTML = 'Submitted — <button type="button" class="btn btn--ghost" id="btn-view-leaderboard-inline">View leaderboard</button>';
      document.getElementById('btn-view-leaderboard-inline').addEventListener('click', () => {
        AHB.uiLeaderboard.open(serverId, deckName);
      });
    } catch (err) {
      el.btnSubmitScore.disabled = false;
      el.btnSubmitScore.textContent = 'Submit';
      el.scoreSubmitResult.hidden = false;
      el.scoreSubmitResult.textContent = `Couldn't submit: ${err.message}`;
    }
  }

  function render(state) {
    el.scoreSession.textContent = state.sessionScore;
    el.scoreAllTime.textContent = state.allTimeScore;
    el.potValue.textContent = state.pot;
    renderLadder(state);

    el.drawPrompt.hidden = true;
    el.emptyDeckNotice.hidden = true;
    el.decision.hidden = true;
    el.runResult.hidden = true;
    el.card.style.visibility = 'visible';

    if (state.phase === 'idle') {
      el.drawPrompt.hidden = false;
      el.card.classList.remove('is-flipped');
      el.options.innerHTML = '';
      return;
    }

    if (state.phase === 'empty-deck') {
      el.emptyDeckNotice.hidden = false;
      el.card.style.visibility = 'hidden';
      el.options.innerHTML = '';
      return;
    }

    if (state.phase === 'flipping') {
      el.card.classList.add('is-flipped');
      el.options.innerHTML = '';
      renderCardFace(state.currentCard);
      return;
    }

    // question, correct-choice, wrong, won, banked all show the flipped card + options
    el.card.classList.add('is-flipped');
    renderCardFace(state.currentCard);
    renderOptions(state);

    if (state.phase === 'correct-choice') {
      el.decision.hidden = false;
      el.bankAmount.textContent = `(${state.pot} pts)`;
    }

    if (state.phase === 'wrong' || state.phase === 'won' || state.phase === 'banked') {
      const s = state.lastRunSummary;
      el.runResult.hidden = false;
      el.runResult.className = `run-result run-result--${s.outcome === 'won' ? 'won' : s.outcome === 'lost' ? 'lost' : 'banked'}`;
      if (s.outcome === 'won') {
        el.runResultTitle.textContent = 'Full clear!';
        el.runResultDetail.textContent = `All 6 rungs cleared — ${s.pointsBanked} points banked`;
      } else if (s.outcome === 'banked') {
        el.runResultTitle.textContent = 'Banked';
        el.runResultDetail.textContent = `${s.rungsCleared} rung${s.rungsCleared === 1 ? '' : 's'} cleared — ${s.pointsBanked} points banked`;
      } else {
        el.runResultTitle.textContent = 'Run over';
        el.runResultDetail.textContent = `${s.rungsCleared} rung${s.rungsCleared === 1 ? '' : 's'} cleared — pot lost`;
      }
      if (s.endCard?.note) {
        el.runResultNote.hidden = false;
        el.runResultNote.innerHTML = AHB.utils.renderPromptText(s.endCard.note);
      } else {
        el.runResultNote.hidden = true;
      }
      renderScoreSubmit(state);
    }
  }

  function bindEvents() {
    el.btnDraw.addEventListener('click', () => AHB.game.drawNext());
    el.btnBank.addEventListener('click', () => AHB.game.bank());
    el.btnHit.addEventListener('click', () => AHB.game.hit());
    el.btnContinue.addEventListener('click', () => AHB.game.acknowledgeAndReset());
    el.btnSubmitScore.addEventListener('click', handleSubmitScore);

    el.options.addEventListener('click', (e) => {
      const btn = e.target.closest('.option-btn');
      if (!btn || btn.disabled) return;
      AHB.game.answer(btn.dataset.option);
    });

    document.addEventListener('keydown', (e) => {
      if (AHB.nav?.currentScreen() !== 'game') return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      const state = AHB.game.getState();

      if (e.code === 'Space') {
        e.preventDefault();
        if (state.phase === 'idle') AHB.game.drawNext();
        else if (['wrong', 'won', 'banked'].includes(state.phase)) AHB.game.acknowledgeAndReset();
        return;
      }
      if (e.key >= '1' && e.key <= '5' && state.phase === 'question') {
        const idx = Number(e.key) - 1;
        const opt = state.currentOptions[idx];
        if (opt) AHB.game.answer(opt);
        return;
      }
      if ((e.key === 'b' || e.key === 'B') && state.phase === 'correct-choice') AHB.game.bank();
      if ((e.key === 'h' || e.key === 'H') && state.phase === 'correct-choice') AHB.game.hit();
    });
  }

  function init() {
    cacheEls();
    bindEvents();
    AHB.game.onChange(render);
  }

  return { init };
})();
