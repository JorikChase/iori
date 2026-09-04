/* Shared "flip a card and show its face" renderer — used by both the ladder
   game (ui-game.js) and bet mode (ui-bet.js) so the image/text/caption
   logic (and its image-load caching) lives in exactly one place.

   A card's face shows an image, text, or both: an image card's promptText
   is optional and renders as a caption alongside the image, not just as
   the sole content of a text-only card. */
window.AHB = window.AHB || {};

// Factory, not a singleton: each screen that flips its own cards (ladder
// play, bet mode) needs its own image-load cache, since they render into
// different DOM elements and can have different cards in flight.
AHB.cardRenderer = function createCardFaceRenderer() {
  let cachedCardId = null;

  // els = { difficulty, image, prompt } — the three elements on a card's face.
  async function render(els, card) {
    els.difficulty.textContent = AHB.CONFIG.DIFFICULTY_LABELS[card.difficulty] || '';

    const hasImage = card.promptType === 'image' && !!card.promptImage;
    els.image.hidden = !hasImage;

    if (hasImage) {
      if (cachedCardId !== card.id) {
        cachedCardId = card.id;
        els.image.innerHTML = '';
        const dataUrl = await AHB.imageService.getDataUrl(card.promptImage);
        if (cachedCardId === card.id && dataUrl) {
          const img = document.createElement('img');
          img.src = dataUrl;
          img.alt = '';
          els.image.appendChild(img);
        }
      }
    } else {
      cachedCardId = null;
      els.image.innerHTML = '';
    }

    // Renders for a text-only card's prompt, or an image card's optional
    // caption — same field (card.promptText) either way.
    els.prompt.innerHTML = card.promptText ? AHB.utils.renderPromptText(card.promptText) : '';
  }

  return { render };
};
