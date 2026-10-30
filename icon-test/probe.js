// Temporary test: which contexts (browser, installed A, installed B) share local data on one origin.
// Writes only to test-only stores. The real Audio database is listed by name and never opened.
(function () {
  var root = document.getElementById('probe'), V = root.dataset.variant;
  var standalone = !!(navigator.standalone || matchMedia('(display-mode: standalone)').matches);
  var mode = standalone ? 'installed' : 'browser';
  var launch = new URLSearchParams(location.search).get('launch') === 'start_url' ? 'start_url' : 'the page itself';
  var ME = V + ' ' + mode, DB = 'icon-test', STORE = 'marks', KEY = 'icon-test.marks', FILE = 'icon-test-marks.json';
  var report = { variant: V, mode: mode, launch: launch, ua: navigator.userAgent };

  function uniq(a) { return a.filter(function (v, i) { return a.indexOf(v) === i; }).sort(); }

  function viaLocal() {
    var m = JSON.parse(localStorage.getItem(KEY) || '[]');
    m = uniq(m.concat(ME));
    localStorage.setItem(KEY, JSON.stringify(m));
    return Promise.resolve(m);
  }
  function viaIDB() {
    return new Promise(function (ok, no) {
      var r = indexedDB.open(DB, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(STORE); };
      r.onerror = function () { no(r.error); };
      r.onsuccess = function () {
        var tx = r.result.transaction(STORE, 'readwrite'), s = tx.objectStore(STORE);
        s.put(Date.now(), ME);
        var k = s.getAllKeys();
        tx.oncomplete = function () { r.result.close(); ok(k.result); };
        tx.onerror = function () { no(tx.error); };
      };
    });
  }
  function viaOPFS() {
    return navigator.storage.getDirectory().then(function (d) {
      return d.getFileHandle(FILE, { create: true }).then(function (h) {
        return h.getFile().then(function (f) { return f.text(); }).then(function (t) {
          var m = uniq((t ? JSON.parse(t) : []).concat(ME));
          return h.createWritable().then(function (w) {
            return w.write(JSON.stringify(m)).then(function () { return w.close(); }).then(function () { return m; });
          });
        });
      });
    });
  }
  function viaCache() {
    return caches.open(DB).then(function (c) {
      return c.put('/icon-test/__mark/' + encodeURIComponent(ME), new Response('1')).then(function () { return c.keys(); });
    }).then(function (ks) {
      return ks.map(function (q) { return decodeURIComponent(q.url.split('/__mark/')[1]); });
    });
  }
  function names() {
    if (!indexedDB.databases) return Promise.reject(new Error('databases() missing'));
    return indexedDB.databases().then(function (l) { return l.map(function (d) { return d.name; }); });
  }

  var tests = [['localStorage', viaLocal], ['IndexedDB', viaIDB], ['OPFS (MOSHINE)', viaOPFS], ['Cache', viaCache]];

  Promise.all(tests.map(function (t) {
    return t[1]().then(function (m) { return [t[0], m, null]; }, function (e) { return [t[0], [], String(e && e.message || e)]; });
  })).then(function (rows) {
    report.stores = {};
    rows.forEach(function (r) { report.stores[r[0]] = r[2] ? 'error: ' + r[2] : r[1]; });
    return names().then(function (n) { return n; }, function () { return null; });
  }).then(function (dbs) {
    report.databases = dbs;
    report.audioData = dbs ? dbs.indexOf('audio') >= 0 : 'unknown';
    render();
  });

  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

  function render() {
    var h = '<h1>Icon test ' + V + '</h1><p>Open as: <b>' + mode + '</b>. Launched from: <b>' + launch + '</b></p>';
    h += '<h2>Contexts that can see this data</h2>';
    Object.keys(report.stores).forEach(function (k) {
      var v = report.stores[k];
      h += '<p>' + esc(k) + '</p><ul>' + (typeof v === 'string' ? '<li class="no">' + esc(v) + '</li>' :
        v.map(function (m) { return '<li class="yes">' + esc(m) + '</li>'; }).join('')) + '</ul>';
    });
    h += '<h2>Real Audio data visible here</h2><p class="' + (report.audioData === true ? 'yes' : 'no') + '">' +
      (report.audioData === 'unknown' ? 'cannot tell' : report.audioData ? 'yes, the audio database exists' : 'no audio database') + '</p>';
    h += '<button id="copy">Copy results</button><button id="again">Check again</button><a class="b" href="/audio/">Open Audio</a>';
    h += '<pre id="out"></pre>';
    root.innerHTML = h;
    document.getElementById('again').onclick = function () { location.reload(); };
    document.getElementById('copy').onclick = function () {
      var t = JSON.stringify(report, null, 1), b = this;
      document.getElementById('out').textContent = t;
      (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { b.textContent = 'Copied'; }, function () { b.textContent = 'Copy the text below'; });
    };
  }
})();
