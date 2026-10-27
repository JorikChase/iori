/* star-tree — the start page as a linktree: the star in the centre, four directions (engines up, tools
   right, art + games down, studio left; assets/star-tree.json), three links each.

   Each direction of the bloomed star (cusp distance R) has three tips: its own cusp, and the two outer cusps
   of the small X star in that quad, 45° either side, 0.5 R from the quad's centre (which sits 0.5044 R out).
   The direction's three links sit on those tips as buttons: the first on the main tip, the second on the tip
   anticlockwise of it, the third clockwise. Only the chosen direction shows its buttons. The star never moves.

   Controls, as in the audio synth's paths. Mouse: entering the centre opens the star; the angle picks a
   direction, and beyond the star the same angle picks the nearest of its three tips; a click goes.
   Touch: press the centre and drag; lift on a link to go, lift anywhere else and the star closes again. */
(function () {
    'use strict';
    const NS = 'http://www.w3.org/2000/svg';
    const ORDER = ['up', 'right', 'down', 'left'];
    const CUSP = 0.701;
    const nav = document.getElementById('center-nav');
    if (!nav) return;
    const quadEl = {};
    Array.from(nav.children).filter((e) => e.classList.contains('quad'))
        .forEach((e, i) => (quadEl[['up', 'right', 'left', 'down'][i]] = e));

    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const sp = (x, t, k, dt) => x + (t - x) * (1 - Math.exp(-k * dt));
    const f1 = (v) => Math.round(v * 10) / 10;
    const f2 = (v) => (Math.round(v * 100) / 100) + '';
    const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
    function mk(tag, attrs, parent) {
        const e = document.createElementNS(NS, tag);
        for (const k in attrs) e.setAttribute(k, attrs[k]);
        if (parent) parent.appendChild(e);
        return e;
    }
    function at(e, k, v) {
        const c = e._a || (e._a = {});
        if (c[k] !== v) { c[k] = v; e.setAttribute(k, v); }
    }

    const svg = mk('svg', { id: 'sn', 'aria-hidden': 'true' }, document.body);
    mk('defs', {}, svg).innerHTML =
        '<filter id="st-soft" x="-30%" y="-80%" width="160%" height="260%">' +
        '<feGaussianBlur in="SourceAlpha" stdDeviation="5" result="b"/><feFlood flood-color="#fff" flood-opacity=".45"/>' +
        '<feComposite in2="b" operator="in" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter>';

    let G = [], W = 0, H = 0, C = { x: 0, y: 0 }, R = 200, PX = 15, fitKey = '';
    let turnH = false, turnV = false; // names on the side / up-down arms turned across the narrow axis
    const S = { open: false, p: null, touch: false, down: false, g: -1, li: -1, gF: [0, 0, 0, 0], hF: {}, outT: 0, tx: null };
    window.__starTree = S; // for the test rig: frames stop while the page is hidden

    function geo() {
        W = innerWidth; H = innerHeight;
        C = { x: W / 2, y: H / 2 };
        PX = clamp(Math.min(W, H) * 0.036, 12, 17);
        fit();
        R = CUSP * (nav.offsetWidth || 280);
    }
    /* tip i of direction g as a multiple of R from the centre, the way it points, and its angle */
    function tipK(g, i) {
        const th = ((g - 1) * Math.PI) / 2, ta = th + [0, -Math.PI / 4, Math.PI / 4][i];
        const x = i ? Math.cos(th) * 0.5044 + Math.cos(ta) * 0.5 : Math.cos(th);
        const y = i ? Math.sin(th) * 0.5044 + Math.sin(ta) * 0.5 : Math.sin(th);
        return { x, y, vx: Math.cos(ta), vy: Math.sin(ta), a: Math.atan2(y, x) };
    }
    function tip(g, i) { const k = tipK(g, i); return { x: C.x + k.x * R, y: C.y + k.y * R, vx: k.vx, vy: k.vy, a: k.a }; }
    /* where a name sits relative to its tip. It reads outward along the tip; straight up and down read level.
       When the screen is narrow one way (a phone), the names on the arms that point along the narrow axis turn
       across it, so it does not cap the star: on the side arms they stand upright (reading bottom to top), the
       main one centred past the tip, the side-tip ones running up or down away from the arm; on the up and
       down arms the side-tip names lie level, running sideways away from the arm */
    function place(T, h, g, tH = turnH, tV = turnV) {
        const off = 8 + 3 * h;
        if (Math.abs(T.vx) < 0.01) return { x: 0, y: T.vy * (off + PX * 0.55), rot: 0, anchor: 'middle', kind: 'level' };
        if (tH && g % 2 === 1) {
            if (Math.abs(T.vy) < 0.01) return { x: T.vx * (off + PX * 0.6), y: 0, rot: -90, anchor: 'middle', kind: 'up' };
            return { x: Math.sign(T.vx) * PX * 0.7, y: T.vy * off, rot: -90, anchor: T.vy < 0 ? 'start' : 'end', kind: T.vy < 0 ? 'upS' : 'upE' };
        }
        if (tV && g % 2 === 0) return { x: T.vx * off, y: Math.sign(T.vy) * PX * 0.6, rot: 0, anchor: T.vx > 0 ? 'start' : 'end', kind: T.vx > 0 ? 'lvS' : 'lvE' };
        const deg = (Math.atan2(T.vy, T.vx) * 180) / Math.PI, flip = Math.abs(deg) > 90;
        return { x: T.vx * off, y: T.vy * off, rot: flip ? deg + 180 : deg, anchor: flip ? 'end' : 'start', kind: 'out' };
    }
    /* the largest star (at most the CSS 440px) for which every name, chosen size, stays on screen: each name's
       box is fixed relative to its tip, and the tip moves out linearly with R, so each edge bounds R */
    const meas = mk('text', { x: -9999, y: -9999, class: 'sn-t' }, svg);
    function fit() {
        const key = W + 'x' + H + ':' + G.length;
        if (!G.length || key === fitKey) return;
        fitKey = key;
        const hp = PX * 1.2;
        meas.setAttribute('font-size', hp);
        meas.setAttribute('letter-spacing', '.1em');
        const widths = G.map((g) => g.links.map((l) => { meas.textContent = l.t; return meas.getComputedTextLength(); }));
        // keep the diagonals unless turning the names across the narrow axis grows the star by over 15%
        const tH = W < H, tV = !tH, diag = biggest(widths, false, false), turned = biggest(widths, tH, tV);
        const turn = turned > diag * 1.15;
        turnH = turn && tH; turnV = turn && tV;
        nav.style.setProperty('--s', f1(Math.max(40, turn ? turned : diag) / CUSP) + 'px');
    }
    function biggest(widths, tH, tV) {
        const m = 10, hh = PX * 1.2 * 0.65;
        let best = CUSP * 440;
        G.forEach((g, gi) => g.links.forEach((l, i) => {
            const w = widths[gi][i], k = tipK(gi, i), L = place(k, 1, gi, tH, tV);
            let x0, x1, y0, y1;
            if (L.kind === 'level') { x0 = -w / 2; x1 = w / 2; y0 = L.y - hh; y1 = L.y + hh; }
            else if (L.kind === 'up') { x0 = L.x - hh; x1 = L.x + hh; y0 = -w / 2; y1 = w / 2; }
            else if (L.kind === 'upS') { x0 = L.x - hh; x1 = L.x + hh; y0 = L.y - w; y1 = L.y; }
            else if (L.kind === 'upE') { x0 = L.x - hh; x1 = L.x + hh; y0 = L.y; y1 = L.y + w; }
            else if (L.kind === 'lvS') { x0 = L.x; x1 = L.x + w; y0 = L.y - hh; y1 = L.y + hh; }
            else if (L.kind === 'lvE') { x0 = L.x - w; x1 = L.x; y0 = L.y - hh; y1 = L.y + hh; }
            else {
                const ex = L.x + k.vx * w, ey = L.y + k.vy * w, px = Math.abs(k.vy) * hh, py = Math.abs(k.vx) * hh;
                x0 = Math.min(L.x, ex) - px; x1 = Math.max(L.x, ex) + px; y0 = Math.min(L.y, ey) - py; y1 = Math.max(L.y, ey) + py;
            }
            if (k.x > 1e-6) best = Math.min(best, (W - m - C.x - x1) / k.x);
            if (k.x < -1e-6) best = Math.min(best, (C.x + x0 - m) / -k.x);
            if (k.y > 1e-6) best = Math.min(best, (H - m - C.y - y1) / k.y);
            if (k.y < -1e-6) best = Math.min(best, (C.y + y0 - m) / -k.y);
        }));
        return best;
    }

    /* ---------- control */
    function sector(a, cur) {
        if (cur >= 0 && Math.abs(angDiff(a, ((cur - 1) * Math.PI) / 2)) < Math.PI / 4 + 0.12) return cur;
        return (((Math.round(a / (Math.PI / 2)) + 1) % 4) + 4) % 4;
    }
    function setOpen(v) {
        if (S.open === v) return;
        S.open = v;
        nav.classList.toggle('open', v);
        if (!v) { S.g = -1; S.li = -1; }
    }
    function control(dt) {
        if (!S.p) return;
        const dx = S.p.x - C.x, dy = S.p.y - C.y, r = Math.hypot(dx, dy);
        if (!S.open) {
            if (!S.touch && r < Math.max(30, R * 0.12 + 14)) setOpen(true);
            return;
        }
        S.g = r < R * 0.16 ? -1 : sector(Math.atan2(dy, dx), S.g);
        S.li = -1;
        if (S.g >= 0 && r > R * 0.7) {
            const a = Math.atan2(dy, dx);
            let bd = 9;
            for (let i = 0; i < 3; i++) { const d = Math.abs(angDiff(a, tip(S.g, i).a)); if (d < bd) { bd = d; S.li = i; } }
        }
        if (!S.touch) {
            S.outT = r < R * 1.15 + PX * 8 ? 0 : S.outT + dt;
            if (S.outT > 0.18) setOpen(false);
        }
    }

    /* ---------- draw */
    const nodes = [];
    function draw(dt) {
        S.tx = null;
        G.forEach((g, gi) => {
            const on = S.open && S.g === gi;
            S.gF[gi] = sp(S.gF[gi], on ? 1 : 0, on ? 12 : 18, dt);
            g.links.forEach((l, i) => {
                const key = gi + '.' + i, hot = on && S.li === i;
                S.hF[key] = sp(S.hF[key] || 0, hot ? 1 : 0, 16, dt);
                const h = S.hF[key], n = nodes[gi * 3 + i], T = tip(gi, i), L = place(T, h, gi);
                at(n.g, 'transform', 'translate(' + f1(T.x + L.x) + ' ' + f1(T.y + L.y) + ') rotate(' + f1(L.rot) + ')');
                at(n.g, 'opacity', f2(S.gF[gi] * (0.65 + 0.35 * h)));
                at(n.t, 'font-size', f1(PX * (1 + 0.2 * h)));
                at(n.t, 'text-anchor', L.anchor);
                at(n.t, 'letter-spacing', h > 0.5 ? '.1em' : '.06em');
                if (hot) S.tx = l.h;
            });
        });
        nav.classList.toggle('sn-focus', S.open && S.g >= 0);
        ORDER.forEach((d, i) => quadEl[d] && quadEl[d].classList.toggle('sn-on', S.g === i));
    }
    function go() { if (S.tx) location.href = S.tx; }

    let last = performance.now();
    function frame(now) {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        geo();
        control(dt);
        draw(dt);
        requestAnimationFrame(frame);
    }

    /* ---------- input */
    addEventListener('pointermove', (e) => {
        if (!e.isPrimary) return;
        const touch = e.pointerType !== 'mouse';
        if (touch && !S.down) return;
        S.touch = touch;
        S.p = { x: e.clientX, y: e.clientY };
    }, { passive: true });
    addEventListener('pointerdown', (e) => {
        if (!e.isPrimary || e.pointerType === 'mouse') return;
        S.touch = true;
        S.p = { x: e.clientX, y: e.clientY };
        // touch opens only from the centre, at once
        if (Math.hypot(e.clientX - C.x, e.clientY - C.y) < Math.max(44, R * 0.12 + 30)) {
            S.down = true;
            setOpen(true);
            e.preventDefault();
        }
    }, { passive: false });
    addEventListener('pointerup', (e) => {
        if (!e.isPrimary || !S.down) return;
        S.down = false;
        S.lastTouch = performance.now();
        control(0);
        draw(0);
        if (S.tx) go();
        else setOpen(false); // let go before a link: the star closes again
    });
    addEventListener('pointercancel', () => { if (S.down) { S.down = false; setOpen(false); } });
    addEventListener('click', (e) => {
        if (performance.now() - (S.lastTouch || 0) < 700) return;
        if (S.open && S.tx) { e.preventDefault(); go(); }
    });
    addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });

    /* ---------- boot */
    fetch('/assets/star-tree.json').then((r) => r.json()).then((data) => {
        G = ORDER.map((d) => data.genres.find((g) => g.dir === d));
        G.forEach((g, gi) => g.links.forEach((l, i) => {
            const tg = mk('g', { opacity: '0' }, svg);
            const t = mk('text', { class: 'sn-t', fill: '#f4f4f4', filter: 'url(#st-soft)', 'dominant-baseline': 'central' }, tg);
            t.textContent = l.t;
            nodes[gi * 3 + i] = { g: tg, t };
        }));
        // every link as a plain list, for keyboards, screen readers and crawlers
        const list = document.createElement('nav');
        list.className = 'sn-sr';
        list.setAttribute('aria-label', 'Links');
        list.innerHTML = G.map((g) => '<h2>' + g.t + '</h2><ul>' + g.links.map((l) => '<li><a href="' + l.h + '">' + l.t + '</a></li>').join('') + '</ul>').join('');
        document.body.appendChild(list);
        // names measure wider in Milksea than in the fallback: fit again once it has loaded
        if (document.fonts) document.fonts.ready.then(() => { fitKey = ''; });
        geo();
        requestAnimationFrame(frame);
    });
})();
