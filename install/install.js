// The steps for this visitor's browser on an icon page. Nothing here runs anywhere else:
// pages reach it only through the "install app" entry in the site menu.
(function () {
  var box = document.getElementById('steps'), name = document.body.dataset.name;
  var ua = navigator.userAgent;
  var ios = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  var android = /Android/.test(ua);
  var standalone = !!(navigator.standalone || matchMedia('(display-mode: standalone)').matches);
  var inApp = /FBAN|FBAV|Instagram|LinkedInApp|TikTok|Twitter|Discord|Line\//.test(ua);
  var firefox = /Firefox|FxiOS/.test(ua);
  var edge = /Edg(e|A|iOS)?\//.test(ua);
  var safariMac = !ios && /Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium/.test(ua);
  var deferred = null;

  var NOTE = 'A new icon is a separate app. It starts empty, and your work stays in the app you made it in, so save or ' +
    'export anything you want to bring along. Deleting an app deletes its work.';

  function p(text, cls) { return '<p' + (cls ? ' class="' + cls + '"' : '') + '>' + text + '</p>'; }
  function list(items) { return '<ol>' + items.map(function (i) { return '<li>' + i + '</li>'; }).join('') + '</ol>'; }
  var COPY = '<button class="inst-btn inst-btn--line" id="copy" type="button">Copy link</button>';
  function show(html) { box.innerHTML = html; wire(); }

  function wire() {
    var c = document.getElementById('copy');
    if (c) c.onclick = function () {
      var done = function () { c.textContent = 'Copied'; }, fail = function () { c.textContent = location.href; };
      if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(done, fail); else fail();
    };
    var i = document.getElementById('install');
    if (i) i.onclick = function () {
      deferred.prompt();
      deferred.userChoice.then(function (r) { if (r.outcome === 'accepted') show(p('Installed. You can open ' + name + ' from your apps.')); });
    };
  }

  function steps() {
    if (standalone) return p('You are in the installed app. To add this icon, open the link in ' + (ios ? 'Safari' : 'your browser') + '.') +
      COPY + p(NOTE, 'inst-note');
    if (inApp) return p('This app can’t install anything. Open the link in ' + (ios ? 'Safari' : 'your browser') + ' first.') + COPY;
    if (ios && firefox) return p('Firefox on iPhone can’t set this icon. Open the link in Safari.') + COPY;
    if (ios) return list(['Tap <b>Share</b>, the square with an arrow. If you don’t see it, tap <b>···</b> first.',
      'Scroll down and tap <b>Add to Home Screen</b>. It may be under <b>More</b>.', 'Tap <b>Add</b>.']) + p(NOTE, 'inst-note');
    if (safariMac) return list(['In the menu bar, choose <b>File</b>, then <b>Add to Dock</b>.', 'Click <b>Add</b>.']) + p(NOTE, 'inst-note');
    if (firefox && !android) return p('Firefox can’t install apps on a computer. Open the link in Chrome, Edge or Safari.') + COPY;
    if (android) return list(['Open the browser menu, <b>⋮</b>.', 'Tap <b>Add to Home screen</b> or <b>Install app</b>.', 'Confirm.']);
    if (edge) return list(['Open the menu, <b>⋯</b>.', 'Choose <b>Apps</b>, then <b>Install this site as an app</b>.']);
    return list(['Open the menu, <b>⋮</b>.', 'Choose <b>Cast, save and share</b>, then <b>Install page as app</b>.']);
  }

  addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    show('<button class="inst-btn" id="install" type="button">Install ' + name + '</button>');
  });
  addEventListener('appinstalled', function () { show(p('Installed. You can open ' + name + ' from your apps.')); });

  show(steps());
})();
