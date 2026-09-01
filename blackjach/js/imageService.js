/* Image import/downscale/storage. Images live in IndexedDB as data URLs,
   never in localStorage. Cards only hold an image id (`promptImage`). */
window.AHB = window.AHB || {};

AHB.imageService = (function () {
  const STORE = AHB.db.STORES.images;
  const { maxDimension, jpegQuality } = AHB.CONFIG.IMAGE;

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not decode image'));
      img.src = src;
    });
  }

  async function downscaleDataUrl(dataUrl) {
    const img = await loadImage(dataUrl);
    const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    // Keep transparency for PNGs, otherwise compress as JPEG.
    const keepPng = dataUrl.startsWith('data:image/png') && await hasAlpha(ctx, w, h);
    return keepPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', jpegQuality);
  }

  async function hasAlpha(ctx, w, h) {
    try {
      const data = ctx.getImageData(0, 0, w, h).data;
      for (let i = 3; i < data.length; i += 4 * 97) { // sample, don't scan every pixel
        if (data[i] < 255) return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  // Store a File (from a picker or drag-drop) as a new downscaled image record.
  async function storeFromFile(file) {
    const raw = await readFileAsDataURL(file);
    const dataUrl = await downscaleDataUrl(raw);
    const id = AHB.utils.uid('img');
    await AHB.db.put(STORE, { id, dataUrl });
    return id;
  }

  // Store a raw base64 data URL (used by deck import) as a new image record.
  async function storeFromDataUrl(dataUrl) {
    const downscaled = await downscaleDataUrl(dataUrl);
    const id = AHB.utils.uid('img');
    await AHB.db.put(STORE, { id, dataUrl: downscaled });
    return id;
  }

  // Fetch a remote image (e.g. a community deck's card image on
  // blackjach-api) and store it locally, same as any other import.
  async function storeFromUrl(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Couldn't download image (HTTP ${res.status}).`);
    const blob = await res.blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    return storeFromDataUrl(dataUrl);
  }

  async function getDataUrl(imageId) {
    if (!imageId) return null;
    const row = await AHB.db.get(STORE, imageId);
    return row ? row.dataUrl : null;
  }

  async function remove(imageId) {
    if (imageId) await AHB.db.del(STORE, imageId);
  }

  return { storeFromFile, storeFromDataUrl, storeFromUrl, getDataUrl, remove };
})();
