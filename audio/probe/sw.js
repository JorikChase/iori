/* Audio probe service worker, scoped to /audio/probe/ so it takes these pages from the live /audio/sw.js. Network first
   so a deploy shows at once, cache when there is no network: that fallback is the offline launch gate 3 measures.
   The cache name must not start with audio- : the live worker deletes those on activate.
   sw-status answers how the last navigation was served and whether the isolation headers came with it. */
var CACHE = 'probe-1';
var FILES = ['./', 'probe.js', 'load-worklet.js', 'frame-worklet.js', 'clock-worker.js', 'frame.html', 'manifest.json', 'scalar.wasm', 'simd.wasm'];
var EXTRA = ['../../icon/android/launchericon-192x192.png?v=2026-09-27', '../../icon/android/launchericon-512x512.png?v=2026-09-27'];
var last = null;

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return c.addAll(FILES).then(function () { return Promise.all(EXTRA.map(function (f) { return c.add(f).catch(function () {}); })); });
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('probe-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function headers(res) {
  return { coop: res.headers.get('cross-origin-opener-policy'), coep: res.headers.get('cross-origin-embedder-policy') };
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.slice(-9) === 'sw-status') {
    e.respondWith(caches.open(CACHE).then(function (c) { return c.keys(); }).then(function (k) {
      return new Response(JSON.stringify({ last: last, files: k.length, cache: CACHE }), { headers: { 'content-type': 'application/json', 'cross-origin-resource-policy': 'same-origin' } });
    }));
    return;
  }
  if (url.searchParams.has('ping')) { e.respondWith(fetch(req, { cache: 'no-store' })); return; }
  var nav = req.mode === 'navigate';
  e.respondWith(fetch(req).then(function (res) {
    if (nav) last = Object.assign({ from: 'network', url: url.pathname }, headers(res));
    if (res && res.ok && res.type === 'basic' && !res.redirected) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () {
    return caches.open(CACHE).then(function (c) { return c.match(req, { ignoreSearch: true }); }).then(function (hit) {
      if (nav) last = hit ? Object.assign({ from: 'cache', url: url.pathname }, headers(hit)) : { from: 'miss', url: url.pathname };
      return hit || Response.error();
    });
  }));
});
