/* Audio Tools service worker — scoped to /audiotools/.
   Precaches the shell and the eight tools so the installed app opens offline,
   then serves them cache-first and refreshes each file in the background
   (stale-while-revalidate): a deploy lands on the launch after next.
   VERSION is stamped by build.py from the files' content; a new version
   drops every older cache on activate. Cross-origin requests (analytics)
   pass straight through. */
var VERSION = '__VERSION__';
var CACHE = 'audiotools-' + VERSION;
var FILES = __FILES__;

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('audiotools-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // a navigation inside the scope always resolves to the shell or a tool page
  e.respondWith(caches.open(CACHE).then(function (c) {
    return c.match(req, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && res.ok && (res.type === 'basic')) c.put(req, res.clone());
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    });
  }));
});

self.addEventListener('message', function (e) {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
