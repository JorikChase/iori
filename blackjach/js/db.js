/* Thin promise wrapper around IndexedDB. All persistence goes through here —
   cards, images, per-card stats, and session/all-time score + settings (meta). */
window.AHB = window.AHB || {};

AHB.db = (function () {
  const { name, version, stores } = AHB.CONFIG.DB;
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(name, version);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(stores.decks)) db.createObjectStore(stores.decks, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(stores.cards)) db.createObjectStore(stores.cards, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(stores.images)) db.createObjectStore(stores.images, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(stores.stats)) db.createObjectStore(stores.stats, { keyPath: 'cardId' });
        if (!db.objectStoreNames.contains(stores.meta)) db.createObjectStore(stores.meta, { keyPath: 'key' });
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
    return dbPromise;
  }

  function reqToPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function store(name, mode) {
    const db = await open();
    return db.transaction(name, mode).objectStore(name);
  }

  async function getAll(storeName) {
    return reqToPromise(await store(storeName, 'readonly').then((s) => s.getAll()));
  }

  async function get(storeName, key) {
    const s = await store(storeName, 'readonly');
    return reqToPromise(s.get(key));
  }

  async function put(storeName, value) {
    const s = await store(storeName, 'readwrite');
    return reqToPromise(s.put(value));
  }

  async function del(storeName, key) {
    const s = await store(storeName, 'readwrite');
    return reqToPromise(s.delete(key));
  }

  async function clear(storeName) {
    const s = await store(storeName, 'readwrite');
    return reqToPromise(s.clear());
  }

  async function bulkPut(storeName, values) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(storeName, 'readwrite');
      const s = t.objectStore(storeName);
      values.forEach((v) => s.put(v));
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  }

  return { open, getAll, get, put, del, clear, bulkPut, STORES: stores };
})();
