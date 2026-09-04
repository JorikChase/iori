/* Renders the "Play" tab (bet mode, AHB.betGame's state — not to be
   confused with the "Training" tab, which is the ladder/points game) —
   bet selection, the draw/answer/quit-or-hit loop, and the round-result
   panel (with the BIG WIN flourish on a full clear). Also keeps the
   credits chip in the global app header in sync, since bet mode is the
   only source of that number. Keyboard: 1-5 answer, B cash out, H hit,
   Space re-bets after a round settles. */
window.AHB = window.AHB || {};

AHB.uiBet = (function () {
  const el = {};
  const cardFace = AHB.cardRenderer();

  function cacheEls() {
    // Lives in the global app header now, not on this screen — credits
    // stay visible everywhere, not just while on the Play tab.
    el.creditsValue = document.getElementById('header-credits-value');
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

    el.decision = document.getElementById('bet-decision');
    el.btnQuit = document.getElementById('btn-bet-quit');
    el.btnHit = document.getElementById('btn-bet-hit');
    el.quitAmount = document.getElementById('bet-quit-amount');

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

  function renderResult(state) {
    const s = state.lastRoundSummary;
    el.result.hidden = false;
    el.bigWin.hidden = !s.bigWin;
    const sign = s.delta >= 0 ? '+' : '';
    const amount = `${sign}${s.delta} credits · Balance: ${s.newBalance}`;

    if (s.outcome === 'lost') {
      el.resultTitle.textContent = 'Busted';
      el.resultDetail.textContent = `Wrong on question ${s.correctCount + 1} — lost the whole bet · ${amount}`;
    } else if (s.outcome === 'won') {
      el.resultTitle.textContent = `${s.correctCount} / ${s.total} correct`;
      el.resultDetail.textContent = `Bet ${s.bet} → ${amount}`;
    } else {
      el.resultTitle.textContent = `Cashed out — ${s.correctCount} / ${s.total} correct`;
      el.resultDetail.textContent = `Bet ${s.bet} → ${amount}`;
    }
  }

  function render(state) {
    el.creditsValue.textContent = state.credits;

    el.betSelect.hidden = true;
    el.emptyDeckNotice.hidden = true;
    el.decision.hidden = true;
    el.result.hidden = true;
    el.progress.hidden = true;

    if (state.phase === 'idle') {
      el.betSelect.hidden = false;
      el.cardStage.hidden = true;
      el.options.hidden = true;
      renderBetOptions(state);
      return;
    }

    if (state.phase === 'empty-deck') {
      el.emptyDeckNotice.hidden = false;
      el.cardStage.hidden = true;
      el.options.hidden = true;
      return;
    }

    // flipping / question / correct-choice / settled — the round is in progress.
    const total = AHB.betGame.getTotalQuestions();
    el.progress.hidden = false;
    el.progressText.textContent = `Question ${Math.min(state.questionIndex + 1, total)} of ${total} — bet ${state.bet}`;
    el.correctCount.textContent = state.correctCount;

    el.cardStage.hidden = false;
    el.card.classList.add('is-flipped');
    renderCardFace(state.currentCard);

    if (state.phase === 'flipping') {
      el.options.hidden = true;
      el.options.innerHTML = '';
      return;
    }

    el.options.hidden = false;
    renderOptions(state);

    if (state.phase === 'correct-choice') {
      el.decision.hidden = false;
      const amount = Math.round(state.bet * AHB.betGame.getCurrentMultiplier());
      const sign = amount >= 0 ? '+' : '';
      el.quitAmount.textContent = `(${sign}${amount})`;
    }

    if (state.phase === 'settled') {
      renderResult(state);
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

    el.btnQuit.addEventListener('click', () => AHB.betGame.quit());
    el.btnHit.addEventListener('click', () => AHB.betGame.hit());
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
        return;
      }
      if ((e.key === 'b' || e.key === 'B') && state.phase === 'correct-choice') AHB.betGame.quit();
      if ((e.key === 'h' || e.key === 'H') && state.phase === 'correct-choice') AHB.betGame.hit();
    });
  }

  function init() {
    cacheEls();
    bindEvents();
    AHB.betGame.onChange(render);
  }

  return { init };
})();
