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

    let G = [], C = { x: 0, y: 0 }, R = 200, PX = 15;
    const S = { open: false, p: null, touch: false, down: false, g: -1, li: -1, gF: [0, 0, 0, 0], hF: {}, outT: 0, tx: null };
    window.__starTree = S; // for the test rig: frames stop while the page is hidden

    function geo() {
        C = { x: innerWidth / 2, y: innerHeight / 2 };
        R = CUSP * (nav.offsetWidth || 280);
        PX = clamp(R * 0.06, 12, 18);
    }
    /* tip i of direction g: where it is, which way it points, and its angle about the star's centre */
    function tip(g, i) {
        const th = ((g - 1) * Math.PI) / 2, ta = th + [0, -Math.PI / 4, Math.PI / 4][i];
        const x = i ? Math.cos(th) * 0.5044 * R + Math.cos(ta) * 0.5 * R : Math.cos(th) * R;
        const y = i ? Math.sin(th) * 0.5044 * R + Math.sin(ta) * 0.5 * R : Math.sin(th) * R;
        return { x: C.x + x, y: C.y + y, vx: Math.cos(ta), vy: Math.sin(ta), a: Math.atan2(y, x) };
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
                const h = S.hF[key], n = nodes[gi * 3 + i], T = tip(gi, i);
                // the button sits on its tip and reads outward along it; straight up and down read level
                const off = 8 + 3 * h, vert = Math.abs(T.vx) < 0.01;
                let L;
                if (vert) L = { x: T.x, y: T.y + T.vy * (off + PX * 0.55), rot: 0, anchor: 'middle' };
                else {
                    const deg = (Math.atan2(T.vy, T.vx) * 180) / Math.PI, flip = Math.abs(deg) > 90;
                    L = { x: T.x + T.vx * off, y: T.y + T.vy * off, rot: flip ? deg + 180 : deg, anchor: flip ? 'end' : 'start' };
                }
                at(n.g, 'transform', 'translate(' + f1(L.x) + ' ' + f1(L.y) + ') rotate(' + f1(L.rot) + ')');
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
        geo();
        requestAnimationFrame(frame);
    });
})();
