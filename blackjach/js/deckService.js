/* Card CRUD, validation, and JSON import/export — all scoped to a single
   deck (identified by deckId). Deck-level operations (create/rename/
   duplicate/delete/switch) live in decksService.js. */
window.AHB = window.AHB || {};

AHB.deckService = (function () {
  const STORE = AHB.db.STORES.cards;

  // Cards belonging to one deck, newest-edited first. Pass no deckId to get
  // every card in the database (used internally by migration/cascade-delete).
  async function getAll(deckId) {
    const cards = await AHB.db.getAll(STORE);
    const scoped = deckId ? cards.filter((c) => c.deckId === deckId) : cards;
    return scoped.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  async function getById(id) {
    return AHB.db.get(STORE, id);
  }

  function validate(card) {
    const errors = [];
    if (!card.answer || !card.answer.trim()) errors.push('Missing answer.');
    if (card.promptType === 'image' && !card.promptImage) errors.push('Image prompt has no image.');
    if (card.promptType === 'text' && !card.promptText?.trim()) errors.push('Missing prompt text.');
    return errors;
  }

  async function save(card) {
    const now = Date.now();
    const existing = card.id ? await getById(card.id) : null;
    if (!card.deckId && !existing) throw new Error('save() needs a deckId for a new card.');
    const toSave = {
      id: card.id || AHB.utils.uid('card'),
      deckId: card.deckId || existing.deckId,
      difficulty: card.difficulty,
      promptType: card.promptType,
      promptImage: card.promptImage || null,
      promptText: card.promptText || '',
      answer: (card.answer || '').trim(),
      distractors: (card.distractors || []).filter((d) => d && d.trim()).slice(0, 4),
      note: card.note || '',
      tags: (card.tags || []).map((t) => t.trim().toLowerCase()).filter(Boolean),
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };
    await AHB.db.put(STORE, toSave);
    return toSave;
  }

  async function duplicate(id) {
    const card = await getById(id);
    if (!card) return null;
    let imageId = card.promptImage;
    if (imageId) {
      // Duplicate the underlying image too so editing/deleting one copy
      // doesn't affect the other.
      const dataUrl = await AHB.imageService.getDataUrl(imageId);
      imageId = dataUrl ? await AHB.imageService.storeFromDataUrl(dataUrl) : null;
    }
    const copy = { ...card, id: AHB.utils.uid('card'), promptImage: imageId };
    delete copy.createdAt;
    delete copy.updatedAt;
    return save(copy);
  }

  async function remove(id) {
    const card = await getById(id);
    if (card?.promptImage) await AHB.imageService.remove(card.promptImage);
    await AHB.db.del(STORE, id);
    await AHB.db.del(AHB.db.STORES.stats, id);
  }

  // Difficulty pools thinner than this trigger a warning banner in the editor.
  function findThinPools(cards) {
    const { minPoolSize } = AHB.CONFIG.LADDER.fallback;
    const counts = { 1: 0, 2: 0, 3: 0 };
    cards.forEach((c) => { counts[c.difficulty] = (counts[c.difficulty] || 0) + 1; });
    return Object.entries(counts)
      .filter(([, n]) => n < minPoolSize)
      .map(([difficulty, n]) => ({ difficulty: Number(difficulty), count: n, minPoolSize }));
  }

  // ---- Import / export ----
  // Single-deck shape:  { version, deckId, deckName, exportedAt, cards: [...] }
  // Whole-library shape: { version, exportedAt, decks: [ <single-deck shape>, ... ] }
  // Both are upserted by id, so re-importing the same backup never duplicates.

  async function exportDeck(deckId) {
    const deck = await AHB.decksService.getById(deckId);
    const cards = await getAll(deckId);
    const withImages = await Promise.all(cards.map(async (c) => {
      if (!c.promptImage) return { ...c, promptImage: undefined, imageDataUrl: null };
      const dataUrl = await AHB.imageService.getDataUrl(c.promptImage);
      return { ...c, promptImage: undefined, imageDataUrl: dataUrl };
    }));
    return {
      version: 2,
      deckId,
      deckName: deck?.name || 'Untitled deck',
      exportedAt: new Date().toISOString(),
      cards: withImages,
    };
  }

  async function exportAllDecks() {
    const decks = await AHB.decksService.getAll();
    const exported = await Promise.all(decks.map((d) => exportDeck(d.id)));
    return { version: 2, exportedAt: new Date().toISOString(), decks: exported };
  }

  async function importOneDeck(raw) {
    if (!raw || !Array.isArray(raw.cards)) throw new Error('That file doesn\'t look like an Art History Blackjack deck export.');
    const deckId = raw.deckId || AHB.utils.uid('deck');
    const existingDeck = await AHB.decksService.getById(deckId);
    if (existingDeck) {
      await AHB.decksService.rename(deckId, raw.deckName || existingDeck.name);
    } else {
      const now = Date.now();
      await AHB.db.put(AHB.db.STORES.decks, { id: deckId, name: raw.deckName || 'Imported deck', createdAt: now, updatedAt: now });
    }
    let imported = 0;
    for (const rawCard of raw.cards) {
      let promptImage = null;
      if (rawCard.imageDataUrl) {
        promptImage = await AHB.imageService.storeFromDataUrl(rawCard.imageDataUrl);
      } else if (typeof rawCard.promptImage === 'string' && rawCard.promptImage.startsWith('data:')) {
        promptImage = await AHB.imageService.storeFromDataUrl(rawCard.promptImage);
      }
      await save({
        id: rawCard.id,
        deckId,
        difficulty: rawCard.difficulty,
        promptType: rawCard.promptType,
        promptImage,
        promptText: rawCard.promptText,
        answer: rawCard.answer,
        distractors: rawCard.distractors,
        note: rawCard.note,
        tags: rawCard.tags,
      });
      imported++;
    }
    return { deckId, imported };
  }

  // Accepts either shape and returns how many decks/cards landed.
  async function importDeck(json) {
    const list = Array.isArray(json?.decks) ? json.decks : [json];
    const results = [];
    for (const raw of list) results.push(await importOneDeck(raw));
    return {
      deckCount: results.length,
      cardCount: results.reduce((sum, r) => sum + r.imported, 0),
      lastDeckId: results[results.length - 1]?.deckId,
    };
  }

  return {
    getAll, getById, validate, save, duplicate, remove,
    findThinPools, exportDeck, exportAllDecks, importDeck,
  };
})();
