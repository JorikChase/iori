/* Screenshots for dash/guide.html — the moises posting guide.

   Drives a LOCAL api + dash + moises.html (never production): it posts the
   sample set through the dashboard's own upload form, arranges it, and
   captures each step at 2x.

     DB_PATH=/tmp/g/iori.db MEDIA_DIR=/tmp/g/media MEDIA_BASEURL=http://localhost:3010/media \
       CORS_ORIGINS=http://localhost:8793 PORT=3010 api/venv/bin/python api/main.py
     python3 tools/serve_root.py 8793
     MOISES_PW=<from /tmp/g/initial-passwords.txt> PICS=<dir with the sample files> \
       node tools/moises-guide/shoot.js

   Output: dash/guide/*.jpg                                                   */
const path = require("path");
const { chromium } = require(path.join(__dirname, "../audio-test/node_modules/playwright"));

const SITE = "http://localhost:8793";
const API = "http://localhost:3010";
const OUT = path.join(__dirname, "../../dash/guide");
const PICS = process.env.PICS;
const PW = process.env.MOISES_PW;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pic = (n) => path.join(PICS, n);

// the sample set left on moises' profile — same captions as tools/moises-guide/seed.py
const SAMPLES = [
  { files: ["r1.jpg"], caption: "ukázková fotka — vyměň ji za svoji (PLÁTNO → klikni na ni → VYMĚNIT SOUBOR)" },
  { files: ["r3.jpg"], caption: "ukázka — chyť mě na plátně a přetáhni, kam chceš" },
  { files: ["r2.jpg", "r4.jpg", "tall.jpg"], caption: "jeden příspěvek, tři fotky — na stránce se listují šipkami" },
  { files: [], caption: "ukázkový textový příspěvek.\nmůžeš psát i bez fotky — zalomení řádků zůstanou." },
  { files: [], caption: "ukázkové video z YouTube — stačí vložit odkaz", link: "https://www.youtube.com/watch?v=jNQXAC9IVRw" },
  { files: ["zvuk.mp3"], caption: "ukázkový zvuk (mp3) — nahraj svůj" },
];
// final arrangement, by caption prefix: x, y, w on the 1200px stage
const ARRANGE = [
  ["ukázková fotka", 40, 40, 460],
  ["ukázka — chyť", 560, 110, 300],
  ["jeden příspěvek", 910, 40, 250],
  ["ukázkový textový", 910, 300, 250],
  ["ukázkové video", 560, 400, 300],
  ["ukázkový zvuk", 40, 430, 400],
];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  await ctx.addInitScript((api) => localStorage.setItem("dash_api", api), API);
  const page = await ctx.newPage();
  const shot = (name, opts = {}) => page.screenshot({ path: path.join(OUT, name), type: "jpeg", quality: 82, ...opts });

  // 1 — login
  await page.goto(SITE + "/dash/");
  await page.fill("#login-user", "moises");
  await shot("01-login.jpg", { clip: { x: 340, y: 200, width: 600, height: 400 } });
  await page.fill("#login-pass", PW);
  await page.click("#login-form button[type=submit]");
  await page.waitForSelector("#main-view:not(.hidden)");
  await sleep(800);

  // 2 — the blog form with a photo chosen
  await page.click('.tab[data-tab="blog"]');
  await page.fill("#post-caption", SAMPLES[0].caption);
  await page.setInputFiles("#post-files", pic("r1.jpg"));
  await sleep(400);
  await shot("02-new-post.jpg", { clip: { x: 0, y: 0, width: 1280, height: 520 } });

  // post the samples through the real form
  for (const s of SAMPLES) {
    await page.fill("#post-caption", s.caption);
    await page.fill("#post-link", s.link || "");
    await page.setInputFiles("#post-files", s.files.map(pic));
    if (s.link) await shot("03-youtube-link.jpg", { clip: { x: 0, y: 0, width: 1280, height: 520 } });
    await page.click("#post-submit");
    await page.waitForFunction(() => !document.querySelector("#post-submit").disabled && !document.querySelector("#post-caption").value, null, { timeout: 30000 });
    const err = await page.textContent("#post-status");
    if (err) throw new Error("post failed: " + err);
    await sleep(300);
  }

  // arrange
  await page.evaluate(async ([api, arrange]) => {
    const { posts } = await (await fetch(api + "/posts?author=moises")).json();
    let z = 1;
    for (const [prefix, x, y, w] of arrange) {
      const p = posts.find((q) => q.caption.startsWith(prefix));
      await fetch(`${api}/posts/${p.id}`, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout: { ...(p.layout || {}), x, y, w, z: z++ } }),
      });
    }
  }, [API, ARRANGE]);

  // 4 — the feed under the form
  await page.reload();
  await page.waitForSelector("#main-view:not(.hidden)");
  await page.click('.tab[data-tab="blog"]');
  await sleep(1200);
  await page.evaluate(() => document.querySelector("#feed-list").scrollIntoView());
  await sleep(300);
  await shot("04-feed.jpg");

  // 5 — canvas with a post selected
  await page.click('.tab[data-tab="canvas"]');
  await sleep(1500);
  await page.click('.canvas-item:has-text("ukázka — chyť")', { position: { x: 120, y: 80 } });
  await sleep(300);
  await shot("05-canvas.jpg");

  // 6 — edit text dialog
  await page.click("#ct-text");
  await sleep(300);
  await shot("06-edit-text.jpg");
  await page.click('#cap-dialog button[value="cancel"]');

  // 7 — the public page
  await page.goto(SITE + "/moises.html");
  await page.waitForLoadState("networkidle");
  await sleep(1500);
  // drive the car in-page: one pointermove per frame, so the tyre tracks show
  await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i <= 140; i++) {
      dispatchEvent(new PointerEvent("pointermove", { clientX: 120 + i * 8, clientY: 760 - Math.sin(i / 18) * 230 }));
      await sleep(20);
    }
  });
  await sleep(600);
  await shot("07-page.jpg");

  // 8 — viewer on the three-photo post
  await page.click('.post:has-text("jeden příspěvek")');
  await sleep(500);
  await page.keyboard.press("ArrowRight");
  await sleep(700);
  await shot("08-viewer.jpg");

  // 9 — phone: the post form
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await phone.addInitScript((api) => localStorage.setItem("dash_api", api), API);
  await phone.addCookies(await ctx.cookies());
  const ph = await phone.newPage();
  await ph.goto(SITE + "/dash/");
  await ph.waitForSelector("#main-view:not(.hidden)");
  await ph.click('.tab[data-tab="blog"]');
  await sleep(1200);
  await ph.screenshot({ path: path.join(OUT, "09-phone.jpg"), type: "jpeg", quality: 82 });

  await browser.close();
  console.log("done");
})().catch((e) => { console.error(e); process.exit(1); });
