/* Helpers for the probe-* scenarios. /audio/probe/ is opened with the iOS gesture rule emulated, a stand-in microphone
   (lab-only: the page never makes sound of its own), and analytics answered by nothing, so a run is offline-safe. */
const fs = require('fs'); const path = require('path');
const lib = require('./lib');
const BASE = () => `http://127.0.0.1:${lib.PORT}/audio/probe/`;

const FAKE_MIC = `(() => {
  const MD = window.MediaDevices && MediaDevices.prototype, AC = window.AudioContext; if (!MD) return;   // AC: before the iOS rule wraps it
  MD.getUserMedia = async function (c) {
    window.__MIC_ASKED = (window.__MIC_ASKED || []).concat([c]);
    const ac = new AC({ sampleRate: 48000 }), o = ac.createOscillator(), d = ac.createMediaStreamDestination();
    o.connect(d); o.start(); ac.resume(); return d.stream;
  };
})();`;

async function context(br) {
  const ctx = await br.newContext(lib.ENGINE === 'webkit' ? { viewport: lib.VIEW, deviceScaleFactor: 1, hasTouch: true } : { viewport: lib.VIEW, deviceScaleFactor: 1, hasTouch: true, isMobile: true, permissions: ['microphone'] });
  await ctx.route(/googletagmanager/, (r) => r.abort());
  await ctx.addInitScript(FAKE_MIC);
  await ctx.addInitScript(lib.IOS_INIT);
  return ctx;
}
async function open(ctx, query = '') {
  const page = await ctx.newPage(); page.errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/googletagmanager|ERR_FAILED|Failed to load resource|access control checks|Cross-Origin-Embedder-Policy|ERR_INTERNET_DISCONNECTED/i.test(m.text())) page.errors.push(m.text()); });
  page.on('pageerror', (e) => { if (!/Load failed|ping=/.test(e.message)) page.errors.push('pageerror: ' + e.message); });   // WebKit reports a service worker's failed fetch as a page error
  await page.goto(BASE() + query, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__S && window.__S.ready, null, { timeout: 15000 });
  return page;
}
const tap = (page, name) => page.getByRole('button', { name, exact: false }).first().click();
const view = (page, v, timeout = 60000) => page.waitForFunction((x) => window.__S && window.__S.view === x, v, { timeout });
const data = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__S.R)));

/* a real file for the picker: two seconds of decaying, detuned partials, different left and right */
function wav(file) {
  const sr = 48000, n = sr * 2, b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { const t = i / sr, e = Math.exp(-2 * (t % 0.5)); b.writeInt16LE(Math.round(9000 * e * Math.sin(6.283 * 220 * t)), 44 + i * 4); b.writeInt16LE(Math.round(9000 * e * Math.sin(6.283 * 331 * t)), 46 + i * 4); }
  fs.writeFileSync(file, b); return file;
}
function tmp(name) { const d = lib.outDir('probe'); return path.join(d, name); }

module.exports = { BASE, context, open, tap, view, data, wav, tmp };
