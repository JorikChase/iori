"""Second round of icon studies: mark orb board, eye ratios, Petri dishes, fractals that fill or sit centred,
and the 3die mark built from itself.

uv run --with pillow,numpy --no-project tools/icon-forge/studies/study2.py orb|eye|petri|fill|centre|mark
"""
import cmath
import math
import pathlib
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from study import (GREEN, GROUND, INK, MARK, OCHRE, OUT, Pen, RED, ROOT, S, SHOTS, SS, board, instrument, lsys,
                   fit, marks_of, palette_menger, pie)

TEAL, AUDRED, YELLOW = (26, 199, 199), (255, 59, 48), (242, 194, 48)
AMBER, CELL = (232, 170, 60), (246, 214, 120)
CHAR = (38, 40, 42)


def grid(n=1024):
    v, u = np.mgrid[0:n, 0:n]
    return (u + .5) / n, (v + .5) / n


def ramp(t, stops):
    t = np.clip(t, 0, 1)[..., None] * (len(stops) - 1)
    i = np.minimum(t.astype(int), len(stops) - 2)
    s = np.array(stops, float)
    a = np.take(s, i[..., 0], axis=0)
    b = np.take(s, i[..., 0] + 1, axis=0)
    return Image.fromarray((a + (b - a) * (t - i)).astype("uint8"))


def newton(cols, zoom=2.4, p=3):
    u, v = grid()
    z = (u - .5) * zoom + 1j * (v - .5) * zoom + 1e-9
    n = np.zeros(z.shape)
    for i in range(36):
        d = (p - 1) / p * z + 1 / (p * z ** (p - 1)) - z
        n += np.abs(d) > 1e-3
        z = z + d
    roots = np.exp(2j * np.pi * np.arange(p) / p)
    k = np.argmin(np.abs(z[..., None] - roots), axis=-1)
    sh = (1 - np.exp(-n / 5))
    sh = .34 + .66 * (1 - sh) ** .5
    return Image.fromarray((np.array(cols, float)[k] * sh[..., None]).astype("uint8"))


def smooth_escape(c, z=None, it=320, power=2):
    z = np.zeros_like(c) if z is None else z
    n = np.full(c.shape, np.nan)
    m = np.ones(c.shape, bool)
    for i in range(it):
        z[m] = z[m] ** power + (c[m] if c.ndim else c)
        out = m & (np.abs(z) > 40)
        n[out] = i + 1 - np.log2(np.log(np.abs(z[out])))
        m &= ~out
    return n


def seahorse():
    u, v = grid()
    c = -.7445 + .115j + ((u - .5) + 1j * (v - .5)) * .0165
    n = smooth_escape(c, it=700)
    t = np.nan_to_num((np.sin(np.sqrt(np.nan_to_num(n)) * 1.0) + 1) / 2)
    im = np.asarray(ramp(t, [(10, 12, 13), GREEN, (235, 228, 210), OCHRE, (10, 12, 13)]))
    return Image.fromarray(im)


def julia_fill():
    u, v = grid()
    z = (u - .5) * 1.5 + 1j * (v - .5) * 1.5
    n = smooth_escape(np.full(z.shape, -.8 + .156j), z=z, it=400)
    t = np.nan_to_num(np.sqrt(np.nan_to_num(n)) / 7)
    return ramp(t, [(0, 0, 0), RED, OCHRE, (240, 230, 205)])


def kaliset():
    u, v = grid()
    x, y = (u - .5) * 1.9, (v - .5) * 1.9
    s = np.zeros(x.shape)
    px = np.hypot(x, y)
    for _ in range(11):
        d = x * x + y * y + 1e-6
        x, y = np.abs(x) / d - .62, np.abs(y) / d - .47
        l = np.hypot(x, y)
        s += np.exp(-np.abs(l - px) * 1.7)
        px = l
    return ramp((s / 11) ** 1.3 * 2.2, [(4, 5, 6), GREEN, (235, 228, 210)])


def carpet_bleed(d=4):
    n = 3 ** 6
    v, u = np.mgrid[0:n, 0:n]
    m = np.ones((n, n), bool)
    a, b = u.copy(), v.copy()
    for _ in range(d):
        m &= ~((a % 3 == 1) & (b % 3 == 1))
        a //= 3
        b //= 3
    # hole size follows depth, so step down to the first level for coarse cells
    k = 3 ** (6 - d)
    a, b = u // k, v // k
    m = np.ones((n, n), bool)
    for _ in range(d):
        m &= ~((a % 3 == 1) & (b % 3 == 1))
        a //= 3
        b //= 3
    return Image.fromarray((m * 255).astype("uint8")).resize((1024, 1024), Image.NEAREST)


def hilbert_bleed(d=4):
    P = Pen()
    pts = lsys("A", {"A": "-BF+AFA+FB-", "B": "+AF-BFB-FA+"}, 90, d)
    w = 100 / 2 ** d * .5
    P.line(fit(pts, 100 / 2 ** d / 2), w)
    return P.out()


def pascal(p, cols, n=81):
    y, x = np.mgrid[0:n, 0:n]
    a, b = x.copy(), y.copy()
    k = np.ones((n, n), int)
    for _ in range(6):
        ad, bd = a % p, b % p
        tot = ad + bd
        c = np.zeros((n, n), int)
        for i in range(p):
            for j in range(p):
                c[(ad == i) & (bd == j)] = math.comb(i + j, j) % p if i + j < p * 2 else 0
        k = k * c % p
        a //= p
        b //= p
    return Image.fromarray(np.array(cols, "uint8")[k]).resize((1024, 1024), Image.NEAREST)


def dragon_tile(cols, d=12):
    P = Pen()
    base = lsys("F", {"F": "F+G", "G": "F-G"}, 90, d)
    s = 2 ** (-(d / 2)) * 62
    for r, c in zip(range(4), cols):
        a = r * math.pi / 2 + math.pi / 4 * d
        pts = [(50 + s * (x * math.cos(a) - y * math.sin(a)), 50 + s * (x * math.sin(a) + y * math.cos(a))) for x, y in base]
        P.line(pts, s * .72, c)
    return P.out()


def gasket(depth):
    """Returns circles as (z, radius, generation), outermost first, in unit-disc coordinates."""
    r = 2 * math.sqrt(3) - 3
    k = 1 / r
    o = (0j, -1.0)
    c = [((1 - r) * cmath.exp(1j * (i * 2 * math.pi / 3 - math.pi / 2)), k) for i in range(3)]
    out = [(z, 1 / q, 0) for z, q in c]
    def rec(a, b, d, g):
        (za, ka), (zb, kb), (zc, kc) = a, b, d
        kn = ka + kb + kc + 2 * math.sqrt(abs(ka * kb + kb * kc + kc * ka))
        w = cmath.sqrt(ka * kb * za * zb + kb * kc * zb * zc + kc * ka * zc * za)
        zm = ka * za + kb * zb + kc * zc
        best = min(((abs(abs(z - za) - abs(1 / kn + 1 / ka)) + abs(abs(z - zb) - abs(1 / kn + 1 / kb)) + abs(abs(z - zc) - abs(1 / kn + 1 / kc))), z)
                   for z in ((zm + 2 * w) / kn, (zm - 2 * w) / kn))
        nw = (best[1], kn)
        out.append((nw[0], 1 / kn, g))
        if g < depth:
            rec(a, b, nw, g + 1)
            rec(b, d, nw, g + 1)
            rec(a, d, nw, g + 1)
    rec(c[0], c[1], c[2], 1)
    rec(o, c[0], c[1], 1)
    rec(o, c[1], c[2], 1)
    rec(o, c[0], c[2], 1)
    return out


def apollo(depth, col, zoom=.84, centre=0j, ring=None, ground=GROUND, inner=None, pad=.004):
    P = Pen()
    P.d.rectangle([0, 0, P.n, P.n], fill=ground)
    s = 50 * zoom
    if ring:
        P.disc(50, 50, s + .9, ring)
        P.disc(50, 50, s + .25, ground)
    for z, r, g in sorted(gasket(depth), key=lambda t: -t[1]):
        q = (z - centre) * s
        rr = (r - pad) * s
        if rr > .12:
            P.disc(50 + q.real, 50 + q.imag, rr, col(z, r, g))
            if inner and rr > 3:
                inner(P, 50 + q.real, 50 + q.imag, rr, z, g)
    return P.out()


def three(z, r, g):
    a = (cmath.phase(z) + math.pi / 2) % (2 * math.pi)
    return (GREEN, OCHRE, RED)[int(a / (2 * math.pi / 3)) % 3]


def flake(n, d, ratio):
    P = Pen()
    def go(x, y, r, k):
        if not k:
            P.d.polygon([P.pt(x + r * math.cos(i * 2 * math.pi / n - math.pi / 2), y + r * math.sin(i * 2 * math.pi / n - math.pi / 2)) for i in range(n)], fill=INK)
            return
        c = r * (1 - ratio)
        go(x, y, r * ratio, k - 1)
        for i in range(n):
            a = i * 2 * math.pi / n - math.pi / 2
            go(x + c * math.cos(a), y + c * math.sin(a), r * ratio, k - 1)
    go(50, 50, 42, d)
    return P.out()


def centred(c, zoom, power=2, it=200, colr=INK, tricorn=False):
    u, v = grid()
    p = (u - .5) * zoom + c + 1j * (v - .5) * zoom
    z = np.zeros_like(p)
    m = np.ones(p.shape, bool)
    for _ in range(it):
        z[m] = (np.conj(z[m]) if tricorn else z[m]) ** power + p[m]
        m &= np.abs(z) < 4
    a = np.zeros((*p.shape, 3), "uint8")
    a[m] = colr
    return Image.fromarray(a)


def rabbit():
    """Interior of the Douady rabbit, coloured by which point of the 3-cycle it falls into."""
    u, v = grid()
    c = -.1226 + .7449j
    z = (u - .5) * 2.9 + 1j * (v - .5) * 2.9
    z = z * cmath.exp(1j * -.5)
    m = np.ones(z.shape, bool)
    for _ in range(600):
        z[m] = z[m] ** 2 + c
        m &= np.abs(z) < 4
    w = np.array([-.1226 + .7449j], complex)
    p = 0j
    for _ in range(3000):
        p = p * p + c
    cyc = [p, p * p + c, (p * p + c) ** 2 + c]
    k = np.argmin(np.abs(z[..., None] - np.array(cyc)), axis=-1)
    a = np.zeros((*z.shape, 3), "uint8")
    cols = np.array((GREEN, OCHRE, RED), "uint8")
    a[m] = cols[k[m]]
    return Image.fromarray(a)


def twin_dragon(cols, d=13):
    P = Pen()
    b = lsys("F", {"F": "F+G", "G": "F-G"}, 90, d)
    s = 2 ** (-(d / 2)) * 48
    for r, c in zip((0, 2), cols):
        a = r * math.pi / 2 + math.pi / 4 * d + .4
        pts = [(50 + s * (x * math.cos(a) - y * math.sin(a)), 50 + s * (x * math.sin(a) + y * math.cos(a))) for x, y in b]
        P.line(pts, s * .72, c)
    return P.out()


def tree(d, cols):
    P = Pen()
    def go(x, y, s, a, n):
        c, t = math.cos(a), math.sin(a)
        A, B = (x, y), (x + s * c, y + s * t)
        C, D = (B[0] + s * t, B[1] - s * c), (x + s * t, y - s * c)
        P.d.polygon([P.pt(*p) for p in (A, B, C, D)], fill=cols[n % len(cols)])
        if n:
            q = math.radians(36.87)
            k1, k2 = s * .8, s * .6
            go(D[0], D[1], k1, a - q, n - 1)
            E = (D[0] + k1 * math.cos(a - q), D[1] + k1 * math.sin(a - q))
            go(E[0], E[1], k2, a + math.radians(53.13), n - 1)
    go(44, 88, 15, 0, d)
    return P.out()


FRAME = ((2, 21), (96, 40), (40, 99))


def tmap(src, dst):
    A = np.array([[*p, 1] for p in src], float)
    return np.linalg.solve(A, np.array(dst, float)).T


def rot(t, k):
    return tuple(t[(i + k) % 3] for i in range(3))


def mark_of_marks(depth, ground=GROUND, rots=(0, 0, 0), shrink=.96):
    P = Pen()
    P.d.rectangle([0, 0, P.n, P.n], fill=ground)
    keys = ("green", "red", "ochre")
    cols = (GREEN, RED, OCHRE)
    ms = [tmap(FRAME, rot(MARK[k], r)) for k, r in zip(keys, rots)]
    def go(t, n, c):
        if n == 0:
            g = np.mean(t, axis=0)
            P.tri(*[tuple(g + (np.array(p) - g) * shrink) for p in t], c)
            return
        for i, m in enumerate(ms):
            child = [tuple(m @ np.array([*p, 1])) for p in FRAME]
            # compose: parent frame → t
            pm = tmap(FRAME, t)
            go([tuple(pm @ np.array([*q, 1])) for q in child], n - 1, c or cols[i])
    go(FRAME, depth, None)
    return P.out()


def mark_spiral(levels, ground=GROUND, k=(.97, .0)):
    """The mark nested in its own green triangle, each ring turned one vertex on."""
    P = Pen()
    P.d.rectangle([0, 0, P.n, P.n], fill=ground)
    pm = np.array([[1, 0, 0], [0, 1, 0]], float)
    F = FRAME
    M = tmap(F, rot(MARK["green"], 1))
    pts = lambda t, a: [tuple(a @ np.array([*p, 1])) for p in t]
    col = [np.array(GREEN, float)]
    for i in range(levels):
        tint = GREEN if i % 2 == 0 else CHAR
        P.tri(*pts(MARK["green"], pm), GREEN if i % 2 == 0 else (58, 72, 64))
        P.tri(*pts(MARK["red"], pm), RED)
        P.tri(*pts(MARK["ochre"], pm), OCHRE)
        pm = pm @ np.vstack([M * 1, [0, 0, 1]])
    return P.out()


def painted_droste(levels, targets=("green",), inset=.9):
    """The painted sheet itself, set inside its own triangles."""
    base = Image.open(ROOT / "logo_dark.png").convert("RGB").resize((S, S), Image.LANCZOS)
    k = S / 100
    F = ((0, 0), (100, 0), (0, 100))
    out = base
    for _ in range(levels):
        nxt = base.copy()
        for t in targets:
            tri = np.array(MARK[t], float)
            g = tri.mean(0)
            tri = g + (tri - g) * inset
            # square onto the triangle's bounding parallelogram
            o, a, b = tri[0], tri[1] - tri[0], tri[2] - tri[0]
            f = 1.0
            M = np.array([[a[0] / 100 * f, b[0] / 100 * f, o[0]], [a[1] / 100 * f, b[1] / 100 * f, o[1]], [0, 0, 1]])
            I = np.linalg.inv(M)
            warped = out.transform((S, S), Image.AFFINE, (I[0, 0], I[0, 1], I[0, 2] * k, I[1, 0], I[1, 1], I[1, 2] * k), Image.BICUBIC)
            m = Image.new("L", (S * 2, S * 2), 0)
            ImageDraw.Draw(m).polygon([(x * k * 2, y * k * 2) for x, y in tri], fill=255)
            nxt.paste(warped, (0, 0), m.resize((S, S), Image.LANCZOS))
        out = nxt
    return out


def mark_sierpinski(d):
    P = Pen()
    a, b, c = [np.array(p, float) * .94 + 3 for p in ((2, 21), (86, 2), (21.5, 92))]
    def go(a, b, c, n, col):
        if not n:
            P.tri(tuple(a), tuple(b), tuple(c), col)
            return
        ab, bc, ca = (a + b) / 2, (b + c) / 2, (c + a) / 2
        go(a, ab, ca, n - 1, col or GREEN)
        go(ab, b, bc, n - 1, col or OCHRE)
        go(ca, bc, c, n - 1, col or RED)
    go(a, b, c, d, None)
    return P.out()


def cmd_orb():
    d = OUT / "orb"
    keep = sorted(d.glob("mark-*.png"))
    board([(p.stem, Image.open(p)) for p in keep], "orb-mark-board", 4, 150)


def tris_mask(tri, n, scale=1.0, off=(0, 0)):
    m = Image.new("L", (n * 2, n * 2), 0)
    k = n * 2 / 100
    g = (50, 50)
    ImageDraw.Draw(m).polygon([((g[0] + (x - g[0]) * scale + off[0]) * k, (g[1] + (y - g[1]) * scale + off[1]) * k) for x, y in tri], fill=255)
    return m.resize((n, n), Image.LANCZOS)


def cmd_eye():
    F = lambda k: SHOTS / f"{k}-front-fine-4k.png"
    M = lambda k: SHOTS / f"{k}-pass-material-fine-4k.png"
    H = lambda k: SHOTS / f"{k}-pass-height-fine-4k.png"
    area = lambda t: abs((t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[2][0] - t[0][0]) * (t[1][1] - t[0][1])) / 2
    ar = [area(MARK[k]) for k in ("green", "ochre", "red")]
    ang = [a / sum(ar) * 360 for a in ar]
    print("mark ratio degrees", [round(a) for a in ang])
    a4 = [180, 90, 54, 36]
    start = -90 + 172
    it = [
        ("A 25 leads", pie([F(k) for k in ("25", "26", "09", "35")], a4, start=-90)),
        ("B 26 leads, turned", pie([F(k) for k in ("26", "35", "25", "09")], a4, start=45)),
        ("C four quarters", pie([F(k) for k in ("26", "25", "09", "35")], [90] * 4, start=-135)),
        ("D mark ratio, wedges", pie([F("26"), F("25"), F("09")], ang, start=start)),
        ("E mark ratio, red pass", pie([F("26"), F("25"), M("26")], ang, start=start)),
    ]
    base = pie([F("35")], [360])
    black = Image.new("RGB", (S, S))
    for name, ground in (("F mark cut, on 35", base), ("G mark cut, on black", black)):
        o = ground.copy()
        for k, e in (("green", F("26")), ("ochre", F("25")), ("red", F("09"))):
            o.paste(pie([e], [360]), (0, 0), tris_mask(MARK[k], S))
        it.append((name, o))
    o = pie([F("26")], [360])
    for k, e in (("ochre", F("25")), ("red", M("26"))):
        o.paste(pie([e], [360]), (0, 0), tris_mask(MARK[k], S))
    it.append(("H 26 with two cuts", o))
    (OUT / "iris").mkdir(parents=True, exist_ok=True)
    for n, im in it:
        im.save(OUT / "iris" / ("r2-" + n[0] + ".png"))
    board(it, "iris-board-2", 4, 170)


def cmd_petri():
    def nucleus(P, x, y, r, z, g):
        P.disc(x, y, r * .26, (120, 74, 18))
    def amber(z, r, g):
        t = min(1, r * 3)
        return tuple(int(a + (b - a) * t) for a, b in zip(AMBER, CELL))
    proto = Image.open(ROOT / "petri/proto/out/A-pressure-coupled-phase.png").convert("RGB")
    w, h = proto.size
    s = min(w, h)
    crop = proto.crop(((w - s) // 2, (h - s) // 2, (w + s) // 2, (h + s) // 2)).resize((S, S), Image.LANCZOS)
    it = [
        ("white, depth 2 (yours)", apollo(2, lambda *a: INK)),
        ("white, depth 4", apollo(4, lambda *a: INK)),
        ("amber cells", apollo(3, amber)),
        ("amber + nuclei", apollo(3, amber, inner=nucleus)),
        ("dish ring", apollo(3, amber, zoom=.76, ring=(255, 255, 255))),
        ("agar ground", apollo(3, amber, zoom=1.02, ground=(46, 28, 10), ring=None)),
        ("three strains", apollo(3, three)),
        ("proto crop (real)", crop),
    ]
    (OUT / "petri").mkdir(parents=True, exist_ok=True)
    for n, im in it:
        im.save(OUT / "petri" / (n.split(" (")[0].replace(" ", "-").replace("+", "and") + ".png"))
    board(it, "petri-board", 4, 170)


def cmd_fill():
    it = [
        ("Newton 3, 3die", newton((GREEN, RED, OCHRE))),
        ("Newton 3, audio", newton((TEAL, AUDRED, YELLOW))),
        ("Newton 3, close", newton((GREEN, RED, OCHRE), zoom=1.1)),
        ("Newton 5", newton((GREEN, RED, OCHRE, (235, 228, 210), (70, 74, 78)), p=5)),
        ("Seahorse valley", seahorse()),
        ("Julia, full", julia_fill()),
        ("Kaliset", kaliset()),
        ("Carpet 4", carpet_bleed(4)),
        ("Hilbert 4", hilbert_bleed(4)),
        ("Hilbert 5", hilbert_bleed(5)),
        ("x AND y (Pascal 2)", pascal(2, ((0, 0, 0), (255, 255, 255)))),
        ("Pascal 3", pascal(3, (GROUND, GREEN, OCHRE))),
        ("Pascal 5", pascal(5, (GROUND, GREEN, RED, OCHRE, (235, 228, 210)))),
        ("Dragon tiling", dragon_tile((GREEN, RED, OCHRE, (235, 228, 210)))),
        ("Gasket, inside", apollo(5, three, zoom=2.1, pad=.002)),
        ("Gasket, white inside", apollo(5, lambda *a: INK, zoom=2.1, pad=.002)),
    ]
    save(it, "fill")
    board(it, "fractal-fill-board", 4, 150)


def cmd_centre():
    it = [
        ("Apollonian 3 colours", apollo(4, three)),
        ("Apollonian ring", apollo(3, lambda *a: INK, zoom=.72, ring=INK)),
        ("Rabbit 3-cycle", rabbit()),
        ("Mandelbrot", centred(-.65, 2.9)),
        ("Multibrot 3", centred(0, 2.7, power=3)),
        ("Multibrot 4", centred(-.1, 2.7, power=4)),
        ("Tricorn", centred(-.15, 3.0, tricorn=True)),
        ("Hexaflake 3", flake(6, 3, 1 / 3)),
        ("Pentaflake 3", flake(5, 3, .382)),
        ("Twin dragon", twin_dragon((GREEN, OCHRE))),
        ("Pythagoras 3-4-5", tree(8, (GREEN, OCHRE, RED))),
        ("Menger 1", palette_menger(1)),
    ]
    save(it, "centre")
    board(it, "fractal-centre-board", 4, 150)


def cmd_mark():
    it = [
        ("mark of marks 1", mark_of_marks(1)),
        ("mark of marks 2", mark_of_marks(2)),
        ("mark of marks 3", mark_of_marks(3)),
        ("mark of marks 4", mark_of_marks(4)),
        ("turned 2", mark_of_marks(2, rots=(1, 2, 1))),
        ("turned 3", mark_of_marks(3, rots=(1, 2, 1))),
        ("on charcoal 3", mark_of_marks(3, ground=CHAR)),
        ("spiral 6", mark_spiral(6)),
        ("spiral on charcoal", mark_spiral(8, ground=CHAR)),
        ("Sierpinski mark 2", mark_sierpinski(2)),
        ("Sierpinski mark 3", mark_sierpinski(3)),
        ("Sierpinski mark 5", mark_sierpinski(5)),
        ("painted droste", painted_droste(3)),
        ("painted droste 3 cuts", painted_droste(3, ("green", "red", "ochre"))),
    ]
    save(it, "mark")
    board(it, "fractal-mark-board", 4, 150)


def save(it, name):
    (OUT / "fractal").mkdir(parents=True, exist_ok=True)
    for n, im in it:
        im.convert("RGB").save(OUT / "fractal" / f"{name}-{n.lower().replace(' ', '-').replace('(', '').replace(')', '')}.png")


if __name__ == "__main__":
    {"orb": cmd_orb, "eye": cmd_eye, "petri": cmd_petri, "fill": cmd_fill, "centre": cmd_centre, "mark": cmd_mark}[sys.argv[1]]()
