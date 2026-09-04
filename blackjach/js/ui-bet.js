/* Renders the Bets screen from AHB.betGame's state — bet selection, the
   fixed run of questions, and the round-result panel (with the BIG WIN
   flourish on a perfect run). Keyboard: 1-5 answer, Space re-bets after a
   round settles. */
window.AHB = window.AHB || {};

AHB.uiBet = (function () {
  const el = {};
  const cardFace = AHB.cardRenderer();

  function cacheEls() {
    el.creditsValue = document.getElementById('bet-credits-value');
    el.progress = document.getElementById('bet-progress');
    el.progressText = document.getElementById('bet-progress-text');
    el.correctCount = document.getElementById('bet-correct-count');

    el.betSelect = document.getElementById('bet-select');
    el.betOptionsWrap = document.getElementById('bet-select-options');

    el.cardStage = document.getElementById('bet-card-stage');
    el.card = document.getElementById('bet-playing-card');
    el.cardDifficulty = document.getElementById('bet-card-difficulty');
    el.cardImage = document.getElementById('bet-card-image');
    el.cardPrompt = document.getElementById('bet-card-prompt');

    el.options = document.getElementById('bet-options');

    el.result = document.getElementById('bet-result');
    el.bigWin = document.getElementById('big-win-banner');
    el.resultTitle = document.getElementById('bet-result-title');
    el.resultDetail = document.getElementById('bet-result-detail');
    el.btnAgain = document.getElementById('btn-bet-again');

    el.emptyDeckNotice = document.getElementById('bet-empty-deck-notice');
  }

  function renderCardFace(card) {
    return cardFace.render({ difficulty: el.cardDifficulty, image: el.cardImage, prompt: el.cardPrompt }, card);
  }

  function renderBetOptions(state) {
    const amounts = AHB.betGame.getBetOptions();
    el.betOptionsWrap.innerHTML = amounts.map((amount) => `
      <button type="button" class="bet-option-btn" data-amount="${amount}" ${amount > state.credits ? 'disabled' : ''}>${amount}</button>
    `).join('');
  }

  function renderOptions(state) {
    const { phase, currentOptions, currentCard, selectedOption } = state;
    if (!currentOptions.length) {
      el.options.innerHTML = '';
      return;
    }
    const showResolution = phase === 'resolved';
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

  function renderResult(state) {
    const s = state.lastRoundSummary;
    el.result.hidden = false;
    el.bigWin.hidden = !s.bigWin;
    el.resultTitle.textContent = `${s.correctCount} / ${s.total} correct`;
    const sign = s.delta > 0 ? '+' : '';
    el.resultDetail.textContent = `Bet ${s.bet} → ${sign}${s.delta} credits · Balance: ${s.newBalance}`;
  }

  function render(state) {
    el.creditsValue.textContent = state.credits;

    el.betSelect.hidden = true;
    el.cardStage.hidden = true;
    el.options.hidden = true;
    el.result.hidden = true;
    el.progress.hidden = true;
    el.emptyDeckNotice.hidden = true;

    if (state.phase === 'idle') {
      el.betSelect.hidden = false;
      renderBetOptions(state);
      return;
    }

    if (state.phase === 'empty-deck') {
      el.emptyDeckNotice.hidden = false;
      return;
    }

    if (state.phase === 'settled') {
      renderResult(state);
      return;
    }

    // flipping / question / resolved — the run is in progress.
    const total = AHB.betGame.getTotalQuestions();
    el.progress.hidden = false;
    el.progressText.textContent = `Question ${state.questionIndex + 1} of ${total} — bet ${state.bet}`;
    el.correctCount.textContent = state.correctCount;

    el.cardStage.hidden = false;
    el.card.classList.add('is-flipped');
    renderCardFace(state.currentCard);

    if (state.phase === 'flipping') {
      el.options.innerHTML = '';
    } else {
      el.options.hidden = false;
      renderOptions(state);
    }
  }

  function bindEvents() {
    el.betOptionsWrap.addEventListener('click', (e) => {
      const btn = e.target.closest('.bet-option-btn');
      if (!btn || btn.disabled) return;
      AHB.betGame.placeBet(Number(btn.dataset.amount));
    });

    el.options.addEventListener('click', (e) => {
      const btn = e.target.closest('.option-btn');
      if (!btn || btn.disabled) return;
      AHB.betGame.answer(btn.dataset.option);
    });

    el.btnAgain.addEventListener('click', () => AHB.betGame.acknowledgeAndReset());

    document.addEventListener('keydown', (e) => {
      if (AHB.nav?.currentScreen() !== 'bet') return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      const state = AHB.betGame.getState();

      if (e.code === 'Space') {
        e.preventDefault();
        if (state.phase === 'settled') AHB.betGame.acknowledgeAndReset();
        return;
      }
      if (e.key >= '1' && e.key <= '5' && state.phase === 'question') {
        const idx = Number(e.key) - 1;
        const opt = state.currentOptions[idx];
        if (opt) AHB.betGame.answer(opt);
      }
    });
  }

  function init() {
    cacheEls();
    bindEvents();
    AHB.betGame.onChange(render);
  }

  return { init };
})();
