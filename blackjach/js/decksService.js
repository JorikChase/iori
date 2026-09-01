/* Deck (collection) management: create/rename/duplicate/delete named decks,
   track which one is "active" (played + edited), and one-time migration/
   seeding so the app always has at least one deck to open into. */
window.AHB = window.AHB || {};

AHB.decksService = (function () {
  const STORE = AHB.db.STORES.decks;
  let listeners = [];

  function onChange(fn) { listeners.push(fn); }
  function emit() { listeners.forEach((fn) => fn()); }

  async function getAll() {
    const decks = await AHB.db.getAll(STORE);
    return decks.sort((a, b) => a.name.localeCompare(b.name));
  }

  function getById(id) {
    return AHB.db.get(STORE, id);
  }

  async function create(name) {
    const now = Date.now();
    const deck = { id: AHB.utils.uid('deck'), name: (name || 'Untitled deck').trim() || 'Untitled deck', createdAt: now, updatedAt: now };
    await AHB.db.put(STORE, deck);
    emit();
    return deck;
  }

  async function rename(id, name) {
    const deck = await getById(id);
    if (!deck) return null;
    deck.name = (name || '').trim() || deck.name;
    deck.updatedAt = Date.now();
    await AHB.db.put(STORE, deck);
    emit();
    return deck;
  }

  async function duplicate(id, newName) {
    const deck = await getById(id);
    if (!deck) return null;
    const copy = await create(newName || `${deck.name} copy`);
    const cards = await AHB.deckService.getAll(id);
    for (const card of cards) {
      let promptImage = card.promptImage;
      if (promptImage) {
        const dataUrl = await AHB.imageService.getDataUrl(promptImage);
        promptImage = dataUrl ? await AHB.imageService.storeFromDataUrl(dataUrl) : null;
      }
      await AHB.deckService.save({ ...card, id: undefined, deckId: copy.id, promptImage });
    }
    emit();
    return copy;
  }

  // Deletes a deck and everything in it (cards, their images, their stats).
  // Refuses to delete the last remaining deck.
  async function remove(id) {
    const all = await getAll();
    if (all.length <= 1) throw new Error('You need at least one deck — create another before deleting this one.');
    const cards = await AHB.deckService.getAll(id);
    for (const card of cards) await AHB.deckService.remove(card.id);
    await AHB.db.del(STORE, id);

    if ((await getActiveId()) === id) {
      const remaining = await getAll();
      await setActiveId(remaining[0].id);
    }
    emit();
  }

  async function getActiveId() {
    return AHB.metaService.getValue('activeDeckId');
  }

  async function setActiveId(id) {
    await AHB.metaService.setValue('activeDeckId', id);
    emit();
  }

  async function getActive() {
    const id = await getActiveId();
    return id ? getById(id) : null;
  }

  // One-time migration (cards saved before multi-deck support existed) and
  // first-run seeding. Guarantees: at least one deck exists, every card
  // belongs to a deck, and activeDeckId points at a real deck.
  async function ensureReady() {
    const decks = await getAll();
    const allCards = await AHB.db.getAll(AHB.db.STORES.cards);
    const orphans = allCards.filter((c) => !c.deckId);

    if (orphans.length > 0) {
      const legacy = decks[0] || await create(AHB.CONFIG.DEFAULT_DECK_NAME);
      for (const card of orphans) await AHB.deckService.save({ ...card, deckId: legacy.id });
    }

    if ((await getAll()).length === 0) {
      const starter = await create(AHB.CONFIG.DEFAULT_DECK_NAME);
      const now = Date.now();
      const seedCards = AHB.SEED_DECK.map((c) => ({
        ...c, deckId: starter.id, promptImage: null,
        distractors: c.distractors || [], tags: c.tags || [],
        createdAt: now, updatedAt: now,
      }));
      await AHB.db.bulkPut(AHB.db.STORES.cards, seedCards);
    }

    const activeId = await getActiveId();
    const stillExists = activeId && (await getById(activeId));
    if (!stillExists) await setActiveId((await getAll())[0].id);
  }

  return {
    onChange, getAll, getById, create, rename, duplicate, remove,
    getActiveId, setActiveId, getActive, ensureReady,
  };
})();
