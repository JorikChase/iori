// ui.js — loads the shell. The Windows 3.11 shell (ui31.js + ui.css) is the only one: the frozen Win98 fallback (?ui=98)
// was removed on 2026-11-11 (iori). document.write keeps the script order — after fit.js, before design.js.
(() => {
    try { localStorage.removeItem('irisShell'); } catch (e) {}          // a remembered ?ui=98 would otherwise mean nothing
    document.write('<link rel="stylesheet" href="ui.css"><script src="start-eye.js"><\/script><script src="ui31.js"><\/script>');
})();
