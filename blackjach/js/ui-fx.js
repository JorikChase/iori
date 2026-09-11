/* Casino "juice" layer — confetti, glowing sparkle bursts, odometer-style
   number tweening, and a tactile button-press bounce. Deliberately bolted
   on rather than woven into game.js/betGame.js/ui-*.js: it subscribes to
   the same onChange() pub-sub every UI module already uses, so it can
   observe phase transitions and score changes without those modules
   knowing FX exists at all. Uses the vendor-hosted GSAP (numeric tweens,
   button punch) and canvas-confetti (win celebrations); everything else
   (sparkle burst, marquee/glow) is plain CSS driven from here by toggling
   classes. Both vendor libs are optional at runtime — if either failed to
   load (e.g. a stale offline cache before this file existed), every
   helper below degrades to an instant/no-op instead of throwing. */
window.AHB = window.AHB || {};

AHB.fx = (function () {
  const hasGsap = typeof window.gsap !== 'undefined';
  const hasConfetti = typeof window.confetti !== 'undefined';

  const CONFETTI_COLORS = ['#e0bb63', '#c8a24a', '#ff3fd8', '#28e0ff', '#a4443a', '#5c8f6a'];

  function confettiBurst({ particleCount = 60, spread = 70, originY = 0.6, originX = 0.5, colors } = {}) {
    if (!hasConfetti) return;
    window.confetti({
      particleCount, spread, origin: { x: originX, y: originY },
      colors: colors || CONFETTI_COLORS,
      ticks: 220,
      gravity: 0.9,
      scalar: 1.1,
    });
  }

  // The full-clear / big-win treatment: a sustained two-sided cannon plus
  // one big center burst, instead of one flat confettiBurst() — this is
  // the moment the whole redesign is building up to, it should feel like
  // more than a slightly bigger version of the per-question sparkle.
  function bigWinCelebration() {
    if (!hasConfetti) return;
    const end = Date.now() + 1100;
    (function frame() {
      window.confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0, y: 0.7 }, colors: CONFETTI_COLORS });
      window.confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1, y: 0.7 }, colors: CONFETTI_COLORS });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
    confettiBurst({ particleCount: 150, spread: 110, originY: 0.5 });
  }

  // Tween a chip's numeric readout from an explicit `from` rather than
  // whatever is currently painted in the DOM — the owning ui-*.js module
  // already snaps el.textContent to the new value in the same onChange
  // tick (it doesn't know FX exists), so by the time this runs the old
  // value is gone from the DOM. Tracking `from` ourselves lets the tween
  // still animate a visible ramp up to the same target instead of finding
  // from === to and no-opping.
  function tweenNumber(el, from, to) {
    if (!el) return;
    const target = Number(to);
    if (Number.isNaN(target)) return;
    if (!hasGsap || from === target) { el.textContent = target; return; }
    const proxy = { v: Number(from) || 0 };
    gsap.to(proxy, {
      v: target,
      duration: 0.6,
      ease: 'power2.out',
      onUpdate: () => { el.textContent = Math.round(proxy.v); },
    });
  }

  // A little radial burst of ✦ glyphs from the center of `target`, used on
  // every correct answer — cheap enough to fire constantly, unlike
  // confetti which is reserved for an actual win/cash-out.
  function sparkleBurst(target) {
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const wrap = document.createElement('div');
    wrap.className = 'fx-sparkle-wrap';
    wrap.style.left = `${rect.left + rect.width / 2}px`;
    wrap.style.top = `${rect.top + rect.height / 2}px`;
    document.body.appendChild(wrap);
    const count = 10;
    for (let i = 0; i < count; i++) {
      const star = document.createElement('span');
      star.className = 'fx-sparkle';
      star.textContent = i % 2 === 0 ? '✦' : '✧';
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const dist = 46 + Math.random() * 28;
      star.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
      star.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
      star.style.animationDelay = `${Math.random() * 70}ms`;
      wrap.appendChild(star);
    }
    setTimeout(() => wrap.remove(), 950);
  }

  // Quick tactile scale-down-and-back on any button press — the
  // "physical" feel that sells a glossy casino button versus a flat web
  // one. Wired as a single delegated listener rather than touching every
  // ui-*.js module's own click handlers.
  function punch(el) {
    if (!hasGsap || !el) return;
    gsap.killTweensOf(el);
    gsap.fromTo(el, { scale: 1 }, { scale: 0.93, duration: 0.09, yoyo: true, repeat: 1, ease: 'power1.inOut' });
  }

  function wireButtonPunch() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn, .option-btn, .bet-option-btn, .app-nav__tab');
      if (btn && !btn.disabled) punch(btn);
    });
  }

  // Fires `handlers[state.phase]` exactly once per transition into that
  // phase, instead of on every onChange emission — onChange fires on
  // every state mutation (e.g. re-rendering the same question), and
  // effects like sparkleBurst/confetti must not repeat on those.
  function watchPhaseTransitions(source, handlers) {
    let prevPhase = null;
    source.onChange((state) => {
      if (state.phase !== prevPhase) {
        const fn = handlers[state.phase];
        if (fn) fn(state);
        prevPhase = state.phase;
      }
    });
  }

  function wireScoreChips() {
    const sessionEl = document.getElementById('score-session');
    const alltimeEl = document.getElementById('score-alltime');
    const creditsEl = document.getElementById('header-credits-value');
    let prevSession = null;
    let prevAllTime = null;
    let prevCredits = null;

    AHB.game.onChange((state) => {
      if (prevSession === null) prevSession = state.sessionScore;
      else if (prevSession !== state.sessionScore) { tweenNumber(sessionEl, prevSession, state.sessionScore); prevSession = state.sessionScore; }
      if (prevAllTime === null) prevAllTime = state.allTimeScore;
      else if (prevAllTime !== state.allTimeScore) { tweenNumber(alltimeEl, prevAllTime, state.allTimeScore); prevAllTime = state.allTimeScore; }
    });
    AHB.betGame.onChange((state) => {
      if (prevCredits === null) prevCredits = state.credits;
      else if (prevCredits !== state.credits) { tweenNumber(creditsEl, prevCredits, state.credits); prevCredits = state.credits; }
    });
  }

  function init() {
    wireButtonPunch();
    wireScoreChips();

    watchPhaseTransitions(AHB.game, {
      'correct-choice': () => sparkleBurst(document.getElementById('card-stage')),
      won: () => bigWinCelebration(),
    });

    watchPhaseTransitions(AHB.betGame, {
      'correct-choice': () => sparkleBurst(document.getElementById('bet-card-stage')),
      settled: (state) => {
        const s = state.lastRoundSummary;
        if (!s) return;
        if (s.bigWin) bigWinCelebration();
        else if (s.outcome === 'won' || s.outcome === 'banked') {
          confettiBurst({ particleCount: s.outcome === 'won' ? 90 : 45 });
        }
      },
    });
  }

  return { init, confettiBurst, bigWinCelebration, sparkleBurst, tweenNumber, punch };
})();
