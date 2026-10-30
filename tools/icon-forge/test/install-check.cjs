// Icon gallery rig: browser-specific steps, Chrome's installability check, gallery navigation, menu reachability.
// node tools/icon-forge/test/install-check.cjs
const http = require('http'), fs = require('fs'), path = require('path');
const R = path.resolve(__dirname, '../../..');
const { chromium, devices } = require(path.join(R, 'tools/audio-test/node_modules/playwright'));
const OUT = path.join(R, 'tools/icon-forge/studies/out/install'); fs.mkdirSync(OUT, { recursive: true });
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };
const UA = {
  iphone: devices['iPhone 14'].userAgent,
  chromeIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1',
  firefoxIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/130.0 Mobile/15E148 Safari/605.1.15',
  instagram: devices['iPhone 14'].userAgent + ' Instagram 300.0',
  android: devices['Pixel 7'].userAgent,
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  firefoxDesk: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:130.0) Gecko/20100101 Firefox/130.0',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0',
  chrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
};
const s = http.createServer((q, r) => {
  let u = decodeURIComponent(q.url.split('?')[0]); if (u.endsWith('/')) u += 'index.html';
  const f = path.join(R, u);
  if (!f.startsWith(R) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
}).listen(0, '127.0.0.1', async () => {
  const B = 'http://127.0.0.1:' + s.address().port, b = await chromium.launch(), fail = [];
  const res = {};
  for (const [k, ua] of Object.entries(UA)) {
    const c = await b.newContext({ userAgent: ua, viewport: { width: 390, height: 844 }, hasTouch: /iP|Android/.test(ua) });
    const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(B + '/audio/icon/teal/'); await p.waitForLoadState('load');
    res[k] = (await p.innerText('#steps')).replace(/\s+/g, ' ').slice(0, 96);
    if (errs.length) fail.push(k + ': ' + errs[0]);
    if (k === 'iphone') {
      await p.screenshot({ path: path.join(OUT, 'iphone-teal.png'), fullPage: true });
      const w = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
      if (w[0] > w[1]) fail.push('sideways scroll ' + w);
      await p.click('.inst-grid a[href="../violet/"]');
      await p.waitForURL('**/audio/icon/violet/');
      const cur = await p.getAttribute('.inst-grid a[aria-current]', 'href');
      const hero = await p.evaluate(async () => (await fetch(document.querySelector('link[rel=apple-touch-icon]').href)).status);
      res.navigate = [cur, hero];
      const bad = await p.evaluate(async () => (await Promise.all([...document.images].map(async i => [i.getAttribute('src'), i.naturalWidth]))).filter(x => !x[1]));
      if (bad.length) fail.push('broken images ' + bad);
    }
    await c.close();
  }
  { const c = await b.newContext({ userAgent: UA.iphone, viewport: { width: 390, height: 844 } }); await c.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
    const p = await c.newPage(); await p.goto(B + '/audio/icon/teal/'); res.standalone = (await p.innerText('#steps')).replace(/\s+/g, ' ').slice(0, 96);
    await p.click('#copy').catch(() => {}); await c.close(); }
  // every page and manifest: Chrome's own reading, icons present
  const apps = JSON.parse(fs.readFileSync(path.join(R, 'tools/icon-forge/apps.json')));
  const ids = new Set(); let pages = 0;
  const c = await b.newContext({ viewport: { width: 1280, height: 800 } });
  for (const a of Object.values(apps)) for (const v of a.variants) {
    const p = await c.newPage(); const cdp = await c.newCDPSession(p);
    await p.goto(`${B}/${a.dir}/icon/${v.slug}/`, { waitUntil: 'load' });
    const m = await cdp.send('Page.getAppManifest'); const inst = await cdp.send('Page.getInstallabilityErrors');
    const mj = JSON.parse(m.data); pages++;
    if (m.errors.length) fail.push(`${v.slug} manifest: ${m.errors[0].message}`);
    if (ids.has(mj.id)) fail.push('duplicate id ' + mj.id); ids.add(mj.id);
    if (mj.start_url !== `/${a.dir}/` || mj.scope !== `/${a.dir}/`) fail.push('start/scope ' + v.slug);
    for (const i of mj.icons) { const f = path.join(R, a.dir, 'icon', v.slug, i.src); if (!fs.existsSync(f)) fail.push('missing ' + f); }
    const err = inst.installabilityErrors.map(e => e.errorId).filter(e => !/no-acceptable-icon-size|not-from-secure/.test(e));
    if (err.length) (res.installErrors = res.installErrors || []).push(v.slug + ':' + err.join());
    await p.close();
  }
  res.pages = pages;
  // the "install app" entry, by each app's real route. Iris, Petri and MOSHINE build their UI after WebGPU starts,
  // so with HEADED=1 they run in a real window on this Mac's GPU; headless covers Audio and Fractal.
  res.menu = {};
  const headed = process.env.HEADED ? await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] }) : null;
  const route = {
    audio: async p => { await p.locator('#site-menu-check').click({ force: true }); },
    'fractal-engine': async p => { await p.locator('#site-menu-check').click({ force: true }); await p.waitForTimeout(350); await p.locator('#site-menu-check').click({ force: true }); },
    'iris-engine': async p => { await p.locator('#w31-ctl').click({ timeout: 15000 }); },
    moshine: async p => { await p.locator('#ms-cap .ms-ctl').click({ timeout: 15000 }); },
    petri: async p => { await p.locator('#pt-ctl').dispatchEvent('pointerdown', { bubbles: true }, { timeout: 15000 }); },
  };
  for (const [vw, vh] of [[390, 844], [1280, 800]]) for (const a of Object.values(apps)) {
    const gpu = ['iris-engine', 'petri', 'moshine'].includes(a.dir);
    if (gpu && !headed) continue;
    const c2 = await (gpu ? headed : b).newContext({ viewport: { width: vw, height: vh }, hasTouch: vw < 500 }); const p = await c2.newPage();
    let ok = 'no';
    try {
      await p.goto(`${B}/${a.dir}/`, { waitUntil: 'domcontentloaded', timeout: 40000 }); await p.waitForTimeout(2500);
      await route[a.dir](p); await p.waitForTimeout(400);
      const it = p.getByText('install app', { exact: true }).filter({ visible: true });
      ok = (await it.count()) ? 'visible' : 'not visible';
      if (ok === 'visible') { await it.first().click({ timeout: 1500 }); await p.waitForTimeout(600); ok += ' -> ' + new URL(p.url()).host + new URL(p.url()).pathname; }
    } catch (e) { ok = 'error: ' + e.message.split('\n')[0].slice(0, 70); }
    res.menu[`${a.dir}@${vw}`] = ok;
    await c2.close();
  }
  if (headed) await headed.close();
  console.log(JSON.stringify(res, null, 1)); console.log('FAIL', JSON.stringify(fail));
  await b.close(); s.close();
});
