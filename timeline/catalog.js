import { paint, themeColors } from './dial.js?v=4';

/* The style catalog: timeline.html?catalog. Every component of the timeline and its editor, in every
   state, built from the same classes the page uses, so the catalog cannot drift from the real thing. */

const TOKENS = ['--paper', '--paper-2', '--ink', '--ink-2', '--muted', '--rule-2', '--amber', '--teal'];

function swatches(themeClass) {
  return `<div class="panel ${themeClass}">
    <p class="meta label">${themeClass === 't-dark' ? 'Night' : 'Dust'}</p>
    <div class="sw">${TOKENS.map(t => `<div><i style="background:var(${t})"></i><span class="meta">${t.slice(2)}</span></div>`).join('')}</div>
    <div class="specimen"><span class="meta"><b>21 Jul</b> 2006</span><h3>The house under the forest</h3>
    <p>Hairlines, not boxes. One amber for what the hand holds, <a href="#">a link like this</a>, and teal for the machine.</p></div>
  </div>`;
}

const GESTURES = [
  ['Scroll', 'wheel, trackpad, J K, shift for years', 'swipe', 'the grip turns, the index follows, the address becomes #YYYY-MM'],
  ['Dial', 'hover the right edge; drag anywhere on it', 'the grip appears while scrolling; drag it', 'the loupe spreads the months under the hand; the date and chapter float beside the index'],
  ['Type', 'Aa, bottom left', 'the same', 'face, weight and theme, kept on this device; “use the author’s choice” undoes it'],
  ['Jump', 'click a point on the dial; G and g for the ends', '—', 'fade through for distances over three screens, glide otherwise'],
  ['Share', 'copy the address, or Copy in the sheet', 'the same', '#slug lands on the entry and rings it once in amber'],
  ['Select', 'click', 'tap', 'amber frame, handles, kind and date above it'],
  ['Open', 'double-click, E or Enter', 'double-tap', 'the sheet slides in from the right (from below on phones)'],
  ['Resize', 'drag the right handle; 1 to 5', 'drag the larger handle', 'stops at ⅓ ½ ⅔ 1 and bleed light up; a dashed ghost previews'],
  ['Shape', 'drag the bottom handle', 'the same', 'snaps to 21:9 16:9 3:2 4:3 1:1 4:5 2:3 9:16 when close'],
  ['Move', 'drag the entry', 'hold 0.4 s, then drag', 'a card follows; an amber line and date show the landing; edges scroll the page'],
  ['Undate', 'drop on the open drafts tray', 'the same', 'the tray rings teal; the entry leaves the timeline'],
  ['Date a draft', 'drag a card out of the tray', 'hold a card, then drag', 'same landing line as a move'],
  ['Insert', 'hover a gap between days, press +; N for a note', 'New in the bar', 'kinds menu springs open at the gap'],
  ['Add files', 'drop photos, video or sound anywhere', 'New → Photo / Video / Sound', 'dated by the camera, else by the day under the hand; progress in the bar'],
  ['Visibility', 'V, or the chip above the frame', 'the chip', 'private → unlisted → public; private items show a dashed badge'],
  ['Delete', 'Delete key, or hold the sheet button 0.7 s', 'hold the button', 'toast with Undo for six seconds before anything is removed'],
  ['Undo', '⌘Z / Ctrl Z', '—', 'reverts the last change; a toast confirms'],
  ['Publish', 'Shift P or the bar', 'the bar', 'a dot on Publish marks unpublished changes'],
  ['Close', 'Esc lets go of whatever is held, in order', 'drag a sheet down past a third', 'the drag, help, menu, field, sheet, tray, then the selection'],
];

const RULES = [
  ['Nothing jumps', 'Estimates become measurements, fonts arrive, entries move: the block under the top of the screen stays where it is.'],
  ['One amber', 'Amber is what the hand is holding, what was just shared, the thumb of time. Teal is the machine: sync, unlisted, the tray as a target.'],
  ['Hairlines, not boxes', 'Rules at 9 to 22 percent ink. Frames have no borders; panels are glass with one hairline.'],
  ['Captions are small and tracked', 'Dates, kinds and states are uppercase at 0.68 rem with 0.2 em tracking. Titles are light and large.'],
  ['Arrive in focus', 'Pictures pull from blur to sharp over 700 ms, once. Seen pictures never replay it.'],
  ['Hands get springs, pages get ease', 'What the hand let go of lands with a small overshoot; what the page moves glides out fast and lands soft.'],
  ['Every gesture has a key', 'And every key has a gesture. Touch gets holds where the mouse gets drags, never hover-only actions.'],
  ['Undo instead of confirm', 'Nothing asks “are you sure”. Deletes wait six seconds with Undo; everything else is one ⌘Z away.'],
];

function curve(bezier, label) {
  const [x1, y1, x2, y2] = bezier;
  const P = (x, y) => `${10 + x * 180},${110 - y * 90}`;
  return `<figure><svg viewBox="0 0 200 130"><path class="axis" d="M10 110 H190 M10 110 V10"/><path class="curve" d="M${P(0, 0)} C${P(x1, y1)} ${P(x2, y2)} ${P(1, 1)}"/></svg>
    <figcaption class="meta">${label}<br><span class="spec">cubic-bezier(${bezier.join(', ')})</span></figcaption></figure>`;
}

export function start(TL) {
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'timeline/editor.css?v=10'; document.head.appendChild(css);
  const css2 = document.createElement('link'); css2.rel = 'stylesheet'; css2.href = 'timeline/catalog.css?v=5'; document.head.appendChild(css2);
  document.getElementById('dial').style.display = 'none';
  TL.applyType();
  const head = document.querySelector('.head');
  head.innerHTML = `<p class="meta">Timeline · system</p><h1>Style catalog</h1>
    <p class="sub">Every part of the timeline and its editor, in every state. Built from the page's own classes, so it cannot drift. The ◐ button switches theme.</p>`;
  const col = TL.col;
  col.style.height = 'auto';
  col.classList.add('cat');
  const sec = (n, title, intro, body) => `<section id="c-${n}"><header><span class="meta">${String(n).padStart(2, '0')}</span><div><h2>${title}</h2>${intro ? `<p>${intro}</p>` : ''}</div></header>${body}</section>`;
  col.innerHTML = [
    sec(1, 'Colour', 'Two themes, the same tokens. Night is warm black lit by sodium; dust is the same scene by day. Grain and haze sit over both.',
      `<div class="grid2">${swatches('t-dark')}${swatches('t-light')}</div>`),
    sec(2, 'Type', 'One geometric face: Outfit by default, Manrope or Jost by choice. Bold by default; readers can lighten it.',
      `<div class="type">
        <div><span class="meta">Display<br><span class="spec">wt · 2.6–4.4 rem</span></span><span style="font-size:clamp(2.2rem,5vw,3.6rem);font-weight:var(--wt);letter-spacing:-.02em;line-height:1">Timeline</span></div>
        <div><span class="meta">Chapter<br><span class="spec">wt · 2–3 rem</span></span><span style="font-size:2.4rem;font-weight:var(--wt);line-height:1.1">The first house</span></div>
        <div><span class="meta">Entry title<br><span class="spec">wt · 1.45 rem</span></span><span style="font-size:1.45rem;font-weight:var(--wt)">A morning by the river</span></div>
        <div><span class="meta">Body<br><span class="spec">wb · 1.02 rem / 1.75</span></span><span>Light comes through the window in long bars and lands on the desk. The machine hums.</span></div>
        <div><span class="meta">Caption<br><span class="spec">wm · 0.68 rem · +0.2 em</span></span><span class="meta"><b>4 Dec</b> 2003 · image · private</span></div>
        <div><span class="meta">Weights<br><span class="spec">body / title / caption</span></span><span>Light 400 / 300 / 500 · Regular 500 / 400 / 600 · <b style="font-weight:600">Bold 600 / 500 / 700</b><br><span class="spec">Outfit Bold is the default. Readers change face, weight and theme in the Aa panel; the author sets the default in the editor.</span></span></div>
      </div>`),
    sec(3, 'Frames', 'Hard edges, no borders. Small pictures of one day share justified rows; anything wider than half stands alone, up to bleed.',
      `<div class="demo ed-on">
        <div class="date meta" style="position:relative;margin-bottom:10px"><b>21 Jul</b> 2006 <span class="spec">· middle and right as the editor shows private and unlisted</span></div>
        <div class="row3">
          <div class="item media image"><div class="box"><div class="fake a"></div></div></div>
          <div class="item media image" data-vis="private"><div class="box"><div class="fake b"></div></div></div>
          <div class="item media image" data-vis="unlisted"><div class="box"><div class="fake c"></div></div></div>
        </div>
        <div class="item text on" style="max-width:var(--text);margin:2.4rem auto"><h3>A note</h3><p>Text sits on the 40 rem reading column. <em>Emphasis</em>, <strong>weight</strong> and <a href="#">links</a> are the only marks.</p></div>
        <div class="grid2" style="margin-bottom:2rem">
          <div class="item media video" style="height:200px"><div class="box"><div class="fake c"></div><button class="play" type="button"></button></div></div>
          <div class="item link on"><a class="card" href="#"><span class="meta">3die.fr</span><h3>3DIE — Design, Art &amp; Technologies</h3><p class="spec">A link card: domain, title, one line.</p></a></div>
        </div>
        <div class="item media audio" style="height:84px;margin-bottom:2rem"><div class="box"><button class="pbtn" type="button"></button><div class="line"><i style="width:38%"></i></div><span class="t meta">Night drive · 3:41</span></div></div>
        <div class="grid2"><div class="item media module" style="height:140px"><div class="box stub"><span class="meta">module · reaction–diffusion</span></div></div>
        <div class="item media image" style="height:140px"><div class="box broken"></div></div></div>
        <p class="meta" style="margin-top:.8rem">Left: a kind without its renderer yet (embed, page, module, mention). Right: a picture that failed to load.</p>
      </div>`),
    sec(4, 'Chapters', 'A chapter is a place. An amber dash, the span in captions, the name large and light.',
      `<div class="demo block chapter" style="position:relative"><div class="ch"><div class="meta"><b>Dec 2003</b> — Apr 2006</div><h2>The first house</h2><p>The first chapter starts on the origin, 4 December 2003.</p></div></div>`),
    sec(5, 'The dial', 'The only navigation, on the right edge. Every year on the full height in proportion to how much there is of it, like Google Photos; drawn like a lens scale: engraved months and years on one hairline, an amber index, and a short knurled grip riding with it that turns as the page scrolls. A loupe spreads the months around the hand.',
      `<div class="states">
        ${[['rest', 'At rest · the whole life at a glance'], ['scroll', 'Scrolling · the loupe opens on the index'], ['hand', 'A hand on it · months named, the date beside it']].map(([k, l]) =>
          `<div><div class="dialbox"><canvas data-dial="${k}"></canvas>${k === 'hand' ? '<div class="hand meta">Mar 2012</div>' : ''}${k === 'scroll' ? '<div class="bubble"><span class="m">Sep</span><span class="y">2009</span><span class="c">The river flat</span></div>' : ''}</div><p class="meta">${l}</p></div>`).join('')}
      </div>`),
    sec(6, 'Motion', 'Three durations, three curves. Press the stages to replay.',
      `<div class="motion">${curve([0.2, 0.7, 0.1, 1], 'ease · the page')}${curve([0.34, 1.4, 0.5, 1], 'spring · the hand')}${curve([0.5, 0, 0.75, 0], 'ease-in · leaving')}</div>
       <div class="grid2" style="margin-top:1rem">
        <div><div class="stage" data-demo="focus"><div class="pic fake a"></div></div><p class="meta">Focus pull · 700 ms · press</p></div>
        <div><div class="stage" data-demo="pop"><div class="pop"></div></div><p class="meta">Spring · 320 ms · press</p></div>
       </div>
       <p class="spec meta" style="margin-top:1rem">fast 140 ms: hovers, colour · mid 320 ms: panels, frames, springs · slow 700 ms: arrivals</p>`),
    sec(7, 'Editor chrome', 'Glass over the page with one hairline. The bar holds the whole editor; everything else appears where the hand is.',
      `<div class="ed-glass" id="ed-bar"><span class="who"><span class="sync"></span><span class="meta">Editing</span></span><span class="ed-sep"></span>
        <button class="ed-btn">＋ <span class="lbl">New</span></button><button class="ed-btn"><span class="lbl">Drafts</span> <span class="n">50</span></button>
        <button class="ed-btn">⚙ <span class="lbl">Settings</span></button><span class="ups"><span class="up"><i style="width:60%"></i></span></span><span class="ed-sep"></span>
        <button class="ed-btn primary"><span class="lbl">Publish</span><span class="dot"></span></button><button class="ed-btn">?</button><button class="ed-btn">✕</button></div>
       <p class="meta" style="margin:.6rem 0 2.6rem">The bar · sync dot teal at rest, amber while saving · one upload at 60 % · Publish dotted: unpublished changes</p>
       <div class="framed"><div class="item media image"><div class="box"><div class="fake b"></div></div></div>
        <div id="ed-frame" class="image"><div class="tag"><span class="meta">image · 21 Jul 2006</span><button>private</button><button>Edit</button></div><div class="h h-r"></div><div class="h h-b"></div></div></div>
       <p class="meta" style="margin:.8rem 0 2.6rem">Selected · the frame carries kind, date, the visibility chip and Edit; the right handle sizes</p>
       <div class="snapdemo"><div id="ed-snap">
        ${[['⅓', 65.3], ['½', 73], ['⅔', 80.7], ['1', 96], ['bleed', 99.2]].map(([l, p], i) => `<div class="s ${i === 2 ? 'on' : ''}" style="left:${p}%"><span class="meta">${l}</span></div>`).join('')}
        <div class="ghost" style="left:19.3%;width:61.4%;top:30px;height:140px"><span class="meta" style="position:absolute;right:.5rem;top:.5rem;color:var(--amber)">⅔</span></div></div></div>
       <p class="meta" style="margin:.8rem 0 2.6rem">Resizing · stops as faint verticals, the snapped one lit, a dashed ghost of the result</p>
       <div class="movedemo"><div class="slot" style="top:30px"></div><div class="slot" style="top:140px"></div>
        <div id="ed-line"><span class="meta">21 Jul 2006</span></div>
        <div id="ed-ghost" class="ed-glass"><div class="th fake a"></div><div class="tx">A morning by the river</div><div class="when meta">→ 21 Jul 2006</div></div></div>
       <p class="meta" style="margin:.8rem 0 2.6rem">Moving · the card follows the hand, the line marks the landing; the original fades to a grey ghost</p>
       <div class="insdemo"><div id="ed-insert" class="on"><span class="meta">4 Aug 2006</span><button>+</button></div></div>
       <p class="meta" style="margin:.4rem 0 2.6rem">Insert · the gap between two days offers a +</p>
       <div class="grid2">
        <div><div id="ed-menu" class="ed-glass"><span class="meta">New · 4 Aug 2006</span>${['Note', 'Photo', 'Video', 'Sound', 'Link', 'Chapter', 'Embed', 'Page', 'Snippet', 'Mention'].map(l => `<button class="ed-btn">${l}</button>`).join('')}</div>
         <p class="meta" style="margin-top:.6rem">Kinds menu</p>
         <div style="margin-top:2rem"><div class="ed-toast ed-glass"><span>Deleted “A morning by the river”</span><button class="ed-btn">Undo</button></div><p class="meta" style="margin-top:.6rem">Toast with Undo</p></div></div>
        <div id="ed-tray" class="ed-glass"><header><h3>Drafts</h3><span class="meta n">50 undated</span></header><input class="ed-in q" placeholder="Search drafts">
          <div class="list"><div class="grp meta">The first house</div>
          <button class="card"><span class="k meta">text · private · <span class="fl">names-people</span></span><span class="tx">A paragraph waiting for its date. Drag it onto the timeline and it lands on the day under the hand.</span></button>
          <button class="card"><span class="k meta">text · private</span><span class="tx">Another, quieter one.</span></button></div></div>
       </div>
       <div class="grid2" style="margin-top:2.6rem">
        <div id="ed-sheet" class="ed-glass"><header><span class="meta">text</span><span class="st meta">saved</span><button class="ed-btn">✕</button></header><div class="body">
          <div class="ed-seg vis"><button>private</button><button>unlisted</button><button class="on" data-v="public">public</button></div>
          <label class="ed-f"><span class="meta">Title</span><input class="ed-in title" value="A morning by the river"></label>
          <label class="ed-f"><span class="meta">Text<span>*em* **strong** [link](url)</span></span><textarea class="ed-in" rows="3">Light comes through the window in long bars.</textarea></label>
          <div class="ed-f"><span class="meta">When</span><div class="ed-seg prec"><button class="on">day</button><button>month</button><button>year</button><button>undated</button></div></div>
          <div class="ed-f"><span class="meta">Flags<span>clear when checked</span></span><div class="ed-chips"><button class="ed-chip">names-people ✕</button></div></div>
          <button class="ed-btn ed-hold"><i></i><span>Hold to delete</span></button></div></div>
        <div>
          <div id="ed-help" class="ed-glass"><span class="meta">Gestures</span><h3>The hand and the keys</h3><dl>
            <dt><kbd>E</kbd> <kbd>↵</kbd></dt><dd>open the selected entry</dd><dt><kbd>1</kbd>–<kbd>5</kbd></dt><dd>width stops</dd>
            <dt><kbd>V</kbd></dt><dd>private → unlisted → public</dd><dt><kbd>⌘</kbd> <kbd>Z</kbd></dt><dd>undo</dd></dl></div>
          <form class="ed-glass" style="margin-top:1rem;padding:1.6rem;display:grid;gap:1rem"><span class="meta">Timeline · edit</span><h3 style="font-size:1.8rem">Sign in</h3>
            <label class="ed-f"><span class="meta">Name</span><input class="ed-in"></label><label class="ed-f"><span class="meta">Password</span><input class="ed-in" type="password"></label>
            <div style="display:flex;justify-content:space-between"><button type="button" class="ed-btn">Just read</button><button type="button" class="ed-btn primary">Enter</button></div></form>
        </div>
       </div>`),
    sec(8, 'Gestures', 'Every gesture has a key, every key a gesture. Touch gets holds where the mouse gets drags.',
      `<table><thead><tr><th>Gesture</th><th>Desktop</th><th>Touch</th><th>What you see</th></tr></thead><tbody>
        ${GESTURES.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`),
    sec(9, 'Rules', '', `<ul class="rules">${RULES.map(([a, b]) => `<li><b>${a}</b>${b}</li>`).join('')}</ul>`),
  ].join('');
  col.addEventListener('click', e => {
    const st = e.target.closest('.stage'); if (!st) return;
    const el = st.firstElementChild;
    if (st.dataset.demo === 'focus') { el.classList.remove('go'); el.classList.add('blur'); void el.offsetWidth; el.classList.add('go'); }
    else { el.classList.remove('go'); void el.offsetWidth; el.classList.add('go'); }
  });
  // the sections, listed under the title
  const nav = document.createElement('nav'); nav.className = 'catnav';
  col.querySelectorAll('section').forEach(sc => {
    const a = document.createElement('a'); a.className = 'meta'; a.href = '#' + sc.id; a.textContent = sc.querySelector('h2').textContent;
    a.addEventListener('click', ev => { ev.preventDefault(); sc.scrollIntoView({ behavior: 'smooth' }); });
    nav.appendChild(a);
  });
  head.appendChild(nav);
  // the dial, drawn by the page's own painter on a made-up life
  const marks = [], chapters = [];
  const years = 23;
  let f = 0;
  for (let y = 0; y < years; y++) {
    const weight = 0.4 + Math.pow(y / years, 1.6) * 2.2;          // later years hold more
    for (let m = 0; m < 12; m++) { marks.push({ f, y: String(2003 + y + (m === 0 ? 0 : 0)), m, year: m === 0 }); f += weight; }
  }
  marks.forEach(mk => mk.f /= f);
  chapters.push({ f: 0, title: 'Origin' }, { f: marks[5 * 12].f, title: 'The river flat' }, { f: marks[16 * 12].f, title: 'The hill flat' });
  const draw = () => {
    const col0 = themeColors();
    col.querySelectorAll('canvas[data-dial]').forEach(cv => {
      const k = cv.dataset.dial, box = cv.parentElement, w = box.clientWidth, h = box.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
      cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px';
      const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const pos = k === 'rest' ? 0.62 : k === 'scroll' ? marks[6 * 12 + 8].f : 0.7;
      const hover = k === 'hand' ? marks[9 * 12 + 2].f : null;
      paint(ctx, { marks, chapters }, { w, h, pos, hover, c: hover ?? pos, b: k === 'rest' ? 0 : k === 'scroll' ? 3.2 : 7, turn: k === 'rest' ? 0 : 7, grip: k === 'rest' ? 0 : k === 'scroll' ? 0.7 : 1 }, col0);
      const yOf = ff => 64 + (ff) * (h - 128);
      const lab = box.querySelector('.hand, .bubble');
      if (lab) lab.style.top = (k === 'hand' ? yOf(hover) : yOf(pos)) + 'px';
    });
  };
  // redraw whenever a box changes size (the stylesheet arriving, a resize) or the theme changes
  const ro = new ResizeObserver(() => requestAnimationFrame(draw));
  col.querySelectorAll('.dialbox').forEach(b => ro.observe(b));
  new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style'] });
  document.getElementById('foot-count').textContent = 'timeline.html?catalog';
}
