// tools/flydown/webkit-probe.cjs — load the Iris Engine in Playwright's WebKit (Safari's engine) and report what an iPad-like
// browser hits: page errors, console errors, WebGL2 extensions, context loss, whether the fly-down and the print got going.
// Usage: node iris-engine/tools/flydown/webkit-probe.cjs <url> [seconds] [shot.png] [--ipad]
// Playwright comes from tools/audio-test's node_modules (webkit build in ~/Library/Caches/ms-playwright).
const path = require('path');
const fs = require('fs'), PW = [process.env.PW, path.join(__dirname, '../../../tools/audio-test/node_modules/playwright'), '/Users/iori/Desktop/code/iori/tools/audio-test/node_modules/playwright'].find(p => p && fs.existsSync(p));   // worktrees have no node_modules: the main checkout's
const { webkit, devices } = require(PW);
(async () => {
    const url = process.argv[2] || 'http://localhost:8781/iris-engine/', secs = +(process.argv[3] || 25), shot = process.argv[4] || null, ipad = process.argv.includes('--ipad');
    const browser = await webkit.launch({ headless: true });
    const ctx = await browser.newContext(ipad ? { ...devices['iPad Pro 11'] } : { viewport: { width: 1200, height: 900 } });
    const page = await ctx.newPage(), log = [];
    page.on('pageerror', e => log.push('PAGEERROR ' + e.message));
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') log.push(m.type().toUpperCase() + ' ' + m.text().slice(0, 300)); });
    page.on('crash', () => log.push('CRASH'));
    await page.addInitScript(() => {
        window.__probe = { lost: 0, restored: 0 };
        const orig = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (t, o) { const c = orig.call(this, t, o);
            if (c && t === 'webgl2' && !this.__probed) { this.__probed = true; this.addEventListener('webglcontextlost', () => window.__probe.lost++); this.addEventListener('webglcontextrestored', () => window.__probe.restored++); }
            return c; };
    });
    const t0 = Date.now(); await page.goto(url, { waitUntil: 'load', timeout: 60000 }).catch(e => log.push('GOTO ' + e.message));
    const samples = [];
    for (let s = 0; s < secs; s += 5) {
        await page.waitForTimeout(5000);
        samples.push(await page.evaluate(() => { const E = window.__irisEngine, F = window.__irisFly, gl = E && E.gl;
            return { t: Math.round(performance.now() / 1000), engine: !!E, glLost: gl ? gl.isContextLost() : null, lost: window.__probe.lost, fly: !!F, flyReady: F ? F.ready : null, flyActive: F ? !!F.active : null,
                     rim: F && F.rimInfo ? F.rimInfo.crypts + ' crypts ' + F.rimInfo.ms + ' ms worker=' + F.rimInfo.worker : null, print: window.IrisPrint ? (window.IrisPrint.mode || null) : null,
                     frames: E && E.state ? E.state.frameCount : null, body: document.body.innerText.slice(0, 40) }; }).catch(e => ({ err: e.message })));
    }
    const caps = await page.evaluate(() => { const c = document.createElement('canvas').getContext('webgl2'); if (!c) return null;
        return { ext: c.getSupportedExtensions(), maxTex: c.getParameter(c.MAX_TEXTURE_SIZE), maxUnits: c.getParameter(c.MAX_TEXTURE_IMAGE_UNITS), renderer: c.getParameter(c.RENDERER), ua: navigator.userAgent, touch: navigator.maxTouchPoints }; }).catch(e => ({ err: e.message }));
    if (shot) await page.screenshot({ path: shot });
    console.log(JSON.stringify({ url, ms: Date.now() - t0, caps, samples, log: log.slice(0, 60) }, null, 1));
    await browser.close();
})();
