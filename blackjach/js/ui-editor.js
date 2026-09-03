/* Deck editor screen: deck management (create/rename/duplicate/delete/
   import/export) plus the card list + filters and the create/edit form for
   whichever deck is currently active. */
window.AHB = window.AHB || {};

AHB.uiEditor = (function () {
  const el = {};
  let allCards = [];
  let currentDeckId = null;
  let currentDeck = null;
  let editingCardId = null;
  let pendingImageId = null; // image id staged in the open form (may be unsaved)

  function cacheEls() {
    el.deckName = document.getElementById('deck-manager-name');
    el.btnDeckNew = document.getElementById('btn-deck-new');
    el.btnDeckRename = document.getElementById('btn-deck-rename');
    el.btnDeckDuplicate = document.getElementById('btn-deck-duplicate');
    el.btnDeckDelete = document.getElementById('btn-deck-delete');
    el.btnExportAll = document.getElementById('btn-export-all-decks');
    el.btnShare = document.getElementById('btn-deck-share');
    el.btnLeaderboard = document.getElementById('btn-deck-leaderboard');
    el.sharedNote = document.getElementById('deck-manager-shared-note');

    el.shareModal = document.getElementById('share-modal');
    el.shareModalBackdrop = document.getElementById('share-modal-backdrop');
    el.shareForm = document.getElementById('share-form');
    el.shareDeckNameSpan = document.getElementById('share-deck-name');
    el.shareNickname = document.getElementById('share-nickname');
    el.shareFormErrors = document.getElementById('share-form-errors');
    el.btnCancelShare = document.getElementById('btn-cancel-share');

    el.counts = document.getElementById('editor-counts');
    el.thinWarning = document.getElementById('editor-thin-warning');
    el.filterDifficulty = document.getElementById('filter-difficulty');
    el.filterTag = document.getElementById('filter-tag');
    el.filterSearch = document.getElementById('filter-search');
    el.list = document.getElementById('card-list');
    el.btnNew = document.getElementById('btn-new-card');
    el.btnExport = document.getElementById('btn-export-deck');
    el.inputImport = document.getElementById('input-import-deck');

    el.modal = document.getElementById('card-modal');
    el.modalBackdrop = document.getElementById('card-modal-backdrop');
    el.form = document.getElementById('card-form');
    el.formTitle = document.getElementById('card-form-title');
    el.fieldDifficulty = document.getElementById('field-difficulty');
    el.fieldPromptType = document.getElementById('field-prompt-type');
    el.textWrap = document.getElementById('field-text-wrap');
    el.fieldPromptText = document.getElementById('field-prompt-text');
    el.imageWrap = document.getElementById('field-image-wrap');
    el.dropzone = document.getElementById('dropzone');
    el.dropzoneHint = document.getElementById('dropzone-hint');
    el.imagePreview = document.getElementById('image-preview');
    el.fieldImageFile = document.getElementById('field-image-file');
    el.fieldAnswer = document.getElementById('field-answer');
    el.distractorInputs = Array.from(document.querySelectorAll('.field-distractor'));
    el.fieldNote = document.getElementById('field-note');
    el.fieldTags = document.getElementById('field-tags');
    el.formErrors = document.getElementById('form-errors');
    el.btnCancel = document.getElementById('btn-cancel-card');
  }

  function difficultyLabel(d) { return AHB.CONFIG.DIFFICULTY_LABELS[d] || d; }

  async function refresh() {
    currentDeckId = await AHB.decksService.getActiveId();
    currentDeck = currentDeckId ? await AHB.decksService.getById(currentDeckId) : null;
    el.deckName.textContent = currentDeck?.name || '—';
    allCards = currentDeckId ? await AHB.deckService.getAll(currentDeckId) : [];
    renderCounts();
    renderThinWarning();
    renderTagFilterOptions();
    renderList();
    await renderShareState();
  }

  async function renderShareState() {
    const apiReady = await AHB.apiService.isConfigured();
    el.btnShare.hidden = !apiReady || !!currentDeck?.serverId;
    if (currentDeck?.serverId) {
      el.btnLeaderboard.hidden = false;
      el.sharedNote.hidden = false;
      el.sharedNote.textContent = `Shared publicly by ${currentDeck.sharedBy}.`;
    } else {
      el.btnLeaderboard.hidden = true;
      el.sharedNote.hidden = true;
    }
  }

  function renderCounts() {
    const counts = { 1: 0, 2: 0, 3: 0 };
    allCards.forEach((c) => { counts[c.difficulty] = (counts[c.difficulty] || 0) + 1; });
    el.counts.innerHTML = `<span>Total: <strong>${allCards.length}</strong></span>` +
      [1, 2, 3].map((d) => `<span>${difficultyLabel(d)}: <strong>${counts[d] || 0}</strong></span>`).join('');
  }

  function renderThinWarning() {
    const thin = AHB.deckService.findThinPools(allCards);
    if (thin.length === 0) {
      el.thinWarning.hidden = true;
      return;
    }
    el.thinWarning.hidden = false;
    el.thinWarning.innerHTML = 'Thin pool warning — draws will borrow from adjacent difficulties: ' +
      thin.map((t) => `${difficultyLabel(t.difficulty)} has ${t.count}/${t.minPoolSize} cards`).join(', ');
  }

  function renderTagFilterOptions() {
    const tags = new Set();
    allCards.forEach((c) => (c.tags || []).forEach((t) => tags.add(t)));
    const current = el.filterTag.value;
    el.filterTag.innerHTML = '<option value="">All</option>' +
      Array.from(tags).sort().map((t) => `<option value="${AHB.utils.escapeHtml(t)}">${AHB.utils.escapeHtml(t)}</option>`).join('');
    el.filterTag.value = current;
  }

  function applyFilters(cards) {
    const difficulty = el.filterDifficulty.value;
    const tag = el.filterTag.value;
    const search = el.filterSearch.value.trim().toLowerCase();
    return cards.filter((c) => {
      if (difficulty && String(c.difficulty) !== difficulty) return false;
      if (tag && !(c.tags || []).includes(tag)) return false;
      if (search) {
        const hay = `${c.promptText} ${c.answer}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });
  }

  async function renderList() {
    const filtered = applyFilters(allCards);
    if (filtered.length === 0) {
      el.list.innerHTML = '<p class="stats-subtext">No cards match these filters.</p>';
      return;
    }
    const rows = await Promise.all(filtered.map(renderRow));
    el.list.innerHTML = rows.join('');
  }

  async function renderRow(card) {
    const errors = AHB.deckService.validate(card);
    let thumb = '<span>Text</span>';
    if (card.promptType === 'image' && card.promptImage) {
      const dataUrl = await AHB.imageService.getDataUrl(card.promptImage);
      thumb = dataUrl ? `<img src="${dataUrl}" alt="" />` : '<span>No img</span>';
    }
    const promptPreview = card.promptType === 'image'
      ? `[Image] → ${AHB.utils.escapeHtml(card.answer || '(no answer)')}`
      : AHB.utils.escapeHtml(card.promptText || '(no prompt)');
    return `
      <div class="card-row" data-id="${card.id}">
        <div class="card-row__thumb">${thumb}</div>
        <div class="card-row__body">
          <div class="card-row__prompt">${promptPreview}</div>
          <div class="card-row__meta">
            <span class="difficulty-badge difficulty-badge--${card.difficulty}">${difficultyLabel(card.difficulty)}</span>
            ${(card.tags || []).map((t) => `<span class="card-row__tag">#${AHB.utils.escapeHtml(t)}</span>`).join('')}
            ${errors.length ? `<span class="card-row__warning">⚠ ${errors.join(' ')}</span>` : ''}
          </div>
        </div>
        <div class="card-row__actions">
          <button type="button" class="btn btn--ghost" data-action="edit">Edit</button>
          <button type="button" class="btn btn--ghost" data-action="duplicate">Duplicate</button>
          <button type="button" class="btn btn--ghost" data-action="delete">Delete</button>
        </div>
      </div>`;
  }

  // ---- Deck management ----

  async function handleDeckNew() {
    const name = prompt('Name the new deck:', 'Untitled deck');
    if (name === null) return;
    const deck = await AHB.decksService.create(name);
    await AHB.decksService.setActiveId(deck.id);
    AHB.toast?.show(`Created "${deck.name}".`);
  }

  async function handleDeckRename() {
    if (!currentDeckId) return;
    const deck = await AHB.decksService.getById(currentDeckId);
    const name = prompt('Rename deck:', deck?.name || '');
    if (name === null) return;
    await AHB.decksService.rename(currentDeckId, name);
    AHB.toast?.show('Deck renamed.');
  }

  async function handleDeckDuplicate() {
    if (!currentDeckId) return;
    const deck = await AHB.decksService.getById(currentDeckId);
    const name = prompt('Name the duplicate:', `${deck?.name || 'Deck'} copy`);
    if (name === null) return;
    const copy = await AHB.decksService.duplicate(currentDeckId, name);
    await AHB.decksService.setActiveId(copy.id);
    AHB.toast?.show(`Duplicated as "${copy.name}".`);
  }

  async function handleDeckDelete() {
    if (!currentDeckId) return;
    const deck = await AHB.decksService.getById(currentDeckId);
    if (!confirm(`Delete "${deck?.name}" and all its cards? This cannot be undone.`)) return;
    try {
      await AHB.decksService.remove(currentDeckId);
      AHB.toast?.show('Deck deleted.');
    } catch (err) {
      alert(err.message);
    }
  }

  // ---- Sharing / leaderboard ----

  async function openShareModal() {
    if (!currentDeck) return;
    el.shareDeckNameSpan.textContent = currentDeck.name;
    el.shareNickname.value = (await AHB.metaService.getValue('lastNickname')) || '';
    el.shareFormErrors.hidden = true;
    el.shareModal.hidden = false;
    el.shareNickname.focus();
  }

  function closeShareModal() {
    el.shareModal.hidden = true;
  }

  async function handleShareSubmit(e) {
    e.preventDefault();
    const nickname = el.shareNickname.value.trim();
    if (!nickname) return;
    const btn = el.shareForm.querySelector('#btn-confirm-share');
    btn.disabled = true;
    btn.textContent = 'Sharing…';
    try {
      const cards = allCards.map((c) => ({
        difficulty: c.difficulty,
        promptType: c.promptType,
        promptText: c.promptText,
        answer: c.answer,
        distractors: c.distractors,
        note: c.note,
        tags: c.tags,
      }));
      // Attach image data URLs for image cards, matching what the card's
      // promptImage id resolves to locally.
      await Promise.all(allCards.map(async (c, i) => {
        if (c.promptType === 'image' && c.promptImage) {
          cards[i].imageDataUrl = await AHB.imageService.getDataUrl(c.promptImage);
        }
      }));
      const result = await AHB.apiService.shareDeck({ name: currentDeck.name, sharedBy: nickname, cards });
      await AHB.decksService.markShared(currentDeck.id, { serverId: result.id, sharedBy: nickname });
      await AHB.metaService.setValue('lastNickname', nickname);
      closeShareModal();
      AHB.toast?.show(`"${currentDeck.name}" is now public.`);
    } catch (err) {
      el.shareFormErrors.hidden = false;
      el.shareFormErrors.textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Share deck';
    }
  }

  function handleViewLeaderboard() {
    if (!currentDeck?.serverId) return;
    AHB.uiLeaderboard.open(currentDeck.serverId, currentDeck.name);
  }

  // ---- Card modal / form ----

  function resetForm() {
    el.form.reset();
    editingCardId = null;
    pendingImageId = null;
    el.imagePreview.hidden = true;
    el.dropzoneHint.hidden = false;
    el.formErrors.hidden = true;
    el.distractorInputs.forEach((i) => { i.value = ''; });
    syncPromptTypeVisibility();
  }

  function syncPromptTypeVisibility() {
    const isImage = el.fieldPromptType.value === 'image';
    el.imageWrap.hidden = !isImage;
    el.textWrap.hidden = isImage;
  }

  async function openModal(card) {
    resetForm();
    if (card) {
      editingCardId = card.id;
      el.formTitle.textContent = 'Edit card';
      el.fieldDifficulty.value = card.difficulty;
      el.fieldPromptType.value = card.promptType;
      el.fieldPromptText.value = card.promptText || '';
      el.fieldAnswer.value = card.answer || '';
      el.fieldNote.value = card.note || '';
      el.fieldTags.value = (card.tags || []).join(', ');
      (card.distractors || []).forEach((d, i) => { if (el.distractorInputs[i]) el.distractorInputs[i].value = d; });
      pendingImageId = card.promptImage || null;
      syncPromptTypeVisibility();
      if (pendingImageId) {
        const dataUrl = await AHB.imageService.getDataUrl(pendingImageId);
        if (dataUrl) {
          el.imagePreview.src = dataUrl;
          el.imagePreview.hidden = false;
          el.dropzoneHint.hidden = true;
        }
      }
    } else {
      el.formTitle.textContent = 'New card';
    }
    el.modal.hidden = false;
  }

  function closeModal() {
    el.modal.hidden = true;
  }

  async function handleImageFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const id = await AHB.imageService.storeFromFile(file);
    pendingImageId = id;
    const dataUrl = await AHB.imageService.getDataUrl(id);
    el.imagePreview.src = dataUrl;
    el.imagePreview.hidden = false;
    el.dropzoneHint.hidden = true;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const card = {
      id: editingCardId,
      deckId: currentDeckId,
      difficulty: Number(el.fieldDifficulty.value),
      promptType: el.fieldPromptType.value,
      promptImage: el.fieldPromptType.value === 'image' ? pendingImageId : null,
      promptText: el.fieldPromptText.value,
      answer: el.fieldAnswer.value,
      distractors: el.distractorInputs.map((i) => i.value),
      note: el.fieldNote.value,
      tags: el.fieldTags.value.split(',').map((t) => t.trim()).filter(Boolean),
    };
    const errors = AHB.deckService.validate(card);
    if (errors.length) {
      el.formErrors.hidden = false;
      el.formErrors.textContent = errors.join(' ');
      return;
    }
    await AHB.deckService.save(card);
    closeModal();
    await refresh();
    AHB.toast?.show('Card saved.');
  }

  async function handleListClick(e) {
    const row = e.target.closest('.card-row');
    if (!row) return;
    const id = row.dataset.id;
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'edit') {
      const card = await AHB.deckService.getById(id);
      openModal(card);
    } else if (action === 'duplicate') {
      await AHB.deckService.duplicate(id);
      await refresh();
      AHB.toast?.show('Card duplicated.');
    } else if (action === 'delete') {
      if (confirm('Delete this card? This cannot be undone.')) {
        await AHB.deckService.remove(id);
        await refresh();
        AHB.toast?.show('Card deleted.');
      }
    }
  }

  // ---- Import / export ----

  function downloadJson(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleExport() {
    if (!currentDeckId) return;
    const deck = await AHB.decksService.getById(currentDeckId);
    const data = await AHB.deckService.exportDeck(currentDeckId);
    const slug = (deck?.name || 'deck').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    downloadJson(data, `blackjach-${slug}-${new Date().toISOString().slice(0, 10)}.json`);
  }

  async function handleExportAll() {
    const data = await AHB.deckService.exportAllDecks();
    downloadJson(data, `blackjach-all-decks-${new Date().toISOString().slice(0, 10)}.json`);
  }

  async function handleImportFile(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const deckCount = Array.isArray(json?.decks) ? json.decks.length : 1;
      const cardCount = Array.isArray(json?.decks)
        ? json.decks.reduce((sum, d) => sum + (d.cards?.length || 0), 0)
        : (json.cards?.length || 0);
      if (!confirm(`Import ${deckCount} deck(s), ${cardCount} card(s) total? Matching ids will be overwritten.`)) return;
      const result = await AHB.deckService.importDeck(json);
      if (result.lastDeckId) await AHB.decksService.setActiveId(result.lastDeckId);
      AHB.toast?.show(`Imported ${result.deckCount} deck(s), ${result.cardCount} card(s).`);
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    }
  }

  function bindEvents() {
    el.btnDeckNew.addEventListener('click', handleDeckNew);
    el.btnDeckRename.addEventListener('click', handleDeckRename);
    el.btnDeckDuplicate.addEventListener('click', handleDeckDuplicate);
    el.btnDeckDelete.addEventListener('click', handleDeckDelete);
    el.btnShare.addEventListener('click', openShareModal);
    el.btnLeaderboard.addEventListener('click', handleViewLeaderboard);
    el.btnCancelShare.addEventListener('click', closeShareModal);
    el.shareModalBackdrop.addEventListener('click', closeShareModal);
    el.shareForm.addEventListener('submit', handleShareSubmit);

    el.btnNew.addEventListener('click', () => openModal(null));
    el.btnCancel.addEventListener('click', closeModal);
    el.modalBackdrop.addEventListener('click', closeModal);
    el.form.addEventListener('submit', handleSubmit);
    el.fieldPromptType.addEventListener('change', syncPromptTypeVisibility);

    el.dropzone.addEventListener('click', () => el.fieldImageFile.click());
    el.fieldImageFile.addEventListener('change', (e) => handleImageFile(e.target.files[0]));
    el.dropzone.addEventListener('dragover', (e) => { e.preventDefault(); el.dropzone.classList.add('is-dragover'); });
    el.dropzone.addEventListener('dragleave', () => el.dropzone.classList.remove('is-dragover'));
    el.dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      el.dropzone.classList.remove('is-dragover');
      handleImageFile(e.dataTransfer.files[0]);
    });

    el.filterDifficulty.addEventListener('change', renderList);
    el.filterTag.addEventListener('change', renderList);
    el.filterSearch.addEventListener('input', AHB.utils.debounce(renderList, 150));

    el.list.addEventListener('click', handleListClick);
    el.btnExport.addEventListener('click', handleExport);
    el.btnExportAll.addEventListener('click', handleExportAll);
    el.inputImport.addEventListener('change', (e) => {
      handleImportFile(e.target.files[0]);
      e.target.value = '';
    });

    AHB.decksService.onChange(refresh);
  }

  function init() {
    cacheEls();
    bindEvents();
  }

  return { init, refresh };
})();
