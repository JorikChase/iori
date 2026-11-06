"""Icon studies. Nothing here ships; forge.py stays the build.

uv run --with pillow,numpy --no-project tools/icon-forge/studies/study.py orb|fractal|fractal2|iris
"""
import math
import pathlib
import random
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = pathlib.Path(__file__).parent
ROOT = HERE.parents[2]
OUT = HERE / "out"
SHOTS = ROOT / "iris-engine/study/shots"
S = 1024
SS = 2
GREEN, RED, OCHRE = (111, 138, 120), (142, 36, 48), (150, 112, 44)
INK = (255, 255, 255)
GROUND = (0, 0, 0)
MARK = {
    "green": ((2, 21), (86, 2), (21.5, 92)),
    "red": ((43, 61.5), (69, 99), (32, 78)),
    "ochre": ((43, 61.5), (96.5, 73), (55, 78)),
}


def squircle(n):
    y, x = np.mgrid[0:n * 4, 0:n * 4]
    u = (x + .5) / (n * 4) * 2 - 1
    v = (y + .5) / (n * 4) * 2 - 1
    m = Image.fromarray(((np.abs(u) ** 5 + np.abs(v) ** 5 <= 1) * 255).astype("uint8"))
    return m.resize((n, n), Image.LANCZOS)


def tile(img, n):
    t = img.convert("RGB").resize((n, n), Image.LANCZOS)
    bg = Image.new("RGB", (n, n), (34, 35, 37))
    bg.paste(t, (0, 0), squircle(n))
    return bg


def board(items, name, cols, big=180):
    """Each item at app size under the iOS mask, then 60, 32 and 16 for the small-size test."""
    w, h = big + 66, big + 30
    pad = 14
    rows = math.ceil(len(items) / cols)
    B = Image.new("RGB", (cols * (w + pad) + pad, rows * (h + pad) + pad), (24, 25, 27))
    d = ImageDraw.Draw(B)
    f = ImageFont.load_default(13)
    for i, (label, img) in enumerate(items):
        x = pad + (i % cols) * (w + pad)
        y = pad + (i // cols) * (h + pad)
        B.paste(tile(img, big), (x, y))
        yy = y
        for n in (60, 32, 16):
            B.paste(tile(img, n), (x + big + 6, yy))
            yy += n + 6
        d.text((x, y + big + 7), label, font=f, fill=(190, 190, 190))
    OUT.mkdir(exist_ok=True)
    B.save(OUT / f"{name}.png")
    print("wrote", OUT / f"{name}.png", B.size)


class Pen:
    def __init__(self):
        self.n = S * SS
        self.im = Image.new("RGB", (self.n, self.n), GROUND)
        self.d = ImageDraw.Draw(self.im)

    def pt(self, x, y):
        return (x * self.n / 100, y * self.n / 100)

    def tri(self, a, b, c, col=INK):
        self.d.polygon([self.pt(*a), self.pt(*b), self.pt(*c)], fill=col)

    def rect(self, x, y, w, h, col=INK):
        self.d.rectangle([self.pt(x, y), self.pt(x + w, y + h)], fill=col)

    def line(self, pts, w=1.2, col=INK):
        self.d.line([self.pt(*p) for p in pts], fill=col, width=max(1, round(w * self.n / 100)), joint="curve")

    def disc(self, x, y, r, col=INK):
        p, q = self.pt(x - r, y - r), self.pt(x + r, y + r)
        self.d.ellipse([p, q], fill=col)

    def out(self):
        return self.im.resize((S, S), Image.LANCZOS)


def lsys(ax, rules, ang, depth, start=0):
    s = ax
    for _ in range(depth):
        s = "".join(rules.get(c, c) for c in s)
    x = y = 0.0
    a = math.radians(start)
    pts = [(x, y)]
    st = []
    for c in s:
        if c in "FGAB":
            x += math.cos(a)
            y += math.sin(a)
            pts.append((x, y))
        elif c == "+":
            a += math.radians(ang)
        elif c == "-":
            a -= math.radians(ang)
    return pts


def fit(pts, m=10):
    xs, ys = zip(*pts)
    k = (100 - 2 * m) / max(max(xs) - min(xs), max(ys) - min(ys))
    ox = (100 - k * (max(xs) - min(xs))) / 2 - k * min(xs)
    oy = (100 - k * (max(ys) - min(ys))) / 2 - k * min(ys)
    return [(ox + k * x, oy + k * y) for x, y in pts]


def sierpinski(d):
    P = Pen()
    def go(a, b, c, n):
        if not n:
            P.tri(a, b, c)
            return
        m = lambda p, q: ((p[0] + q[0]) / 2, (p[1] + q[1]) / 2)
        go(a, m(a, b), m(a, c), n - 1)
        go(m(a, b), b, m(b, c), n - 1)
        go(m(a, c), m(b, c), c, n - 1)
    go((8, 90), (92, 90), (50, 17.3), d)
    return P.out()


def carpet(d):
    P = Pen()
    def go(x, y, s, n):
        if not n:
            P.rect(x, y, s, s)
            return
        t = s / 3
        for i in range(3):
            for j in range(3):
                if i != 1 or j != 1:
                    go(x + i * t, y + j * t, t, n - 1)
    go(10, 10, 80, d)
    return P.out()


def vicsek(d):
    P = Pen()
    def go(x, y, s, n):
        if not n:
            P.rect(x, y, s, s)
            return
        t = s / 3
        for i, j in ((1, 0), (0, 1), (1, 1), (2, 1), (1, 2)):
            go(x + i * t, y + j * t, t, n - 1)
    go(10, 10, 80, d)
    return P.out()


def tsquare(d):
    P = Pen()
    def go(x, y, s, n):
        if not n:
            return
        P.rect(x - s / 2, y - s / 2, s, s)
        for a in (-1, 1):
            for b in (-1, 1):
                go(x + a * s / 2, y + b * s / 2, s / 2, n - 1)
    go(50, 50, 40, d)
    return P.out()


def cantor(d):
    P = Pen()
    def go(x, w, y, n):
        P.rect(x, y, w, 10)
        if n:
            go(x, w / 3, y + 17, n - 1)
            go(x + 2 * w / 3, w / 3, y + 17, n - 1)
    go(8, 84, 12, d)
    return P.out()


def koch(d):
    def seg(a, b, n):
        if not n:
            return [a]
        u = ((b[0] - a[0]) / 3, (b[1] - a[1]) / 3)
        p = (a[0] + u[0], a[1] + u[1])
        q = (a[0] + 2 * u[0], a[1] + 2 * u[1])
        r = (p[0] + u[0] / 2 + u[1] * .866, p[1] + u[1] / 2 - u[0] * .866)
        return seg(a, p, n - 1) + seg(p, r, n - 1) + seg(r, q, n - 1) + seg(q, b, n - 1)
    A, B, C = (16, 32), (84, 32), (50, 91)
    pts = seg(A, B, d) + seg(B, C, d) + seg(C, A, d)
    P = Pen()
    P.d.polygon([P.pt(*p) for p in pts], fill=INK)
    return P.out()


def curve(pts, w):
    P = Pen()
    P.line(fit(pts), w)
    return P.out()


def pythagoras(d):
    P = Pen()
    def go(x, y, s, a, n):
        c, t = math.cos(a), math.sin(a)
        A = (x, y)
        B = (x + s * c, y + s * t)
        C = (B[0] + s * t, B[1] - s * c)
        D = (x + s * t, y - s * c)
        P.d.polygon([P.pt(*p) for p in (A, B, C, D)], fill=INK)
        if n:
            k = s * math.sqrt(.5)
            go(D[0], D[1], k, a - math.pi / 4, n - 1)
            E = (D[0] + k * math.cos(a - math.pi / 4), D[1] + k * math.sin(a - math.pi / 4))
            go(E[0], E[1], k, a + math.pi / 4, n - 1)
    go(38, 90, 24, 0, d)
    return P.out()


def apollonian(d):
    P = Pen()
    P.disc(50, 50, 42)
    P.disc(50, 50, 41.2, GROUND)
    cs = []
    def circ(z, k):
        cs.append((z, k))
    r = 2 * math.sqrt(3) - 3
    k = 1 / (r * 42)
    for i in range(3):
        a = i * 2 * math.pi / 3 - math.pi / 2
        z = complex(50, 50) + (42 - 1 / k) * complex(math.cos(a), math.sin(a))
        circ(z, k)
    base = [(complex(50, 50), -1 / 42)] + cs[:]
    def rec(a, b, c, n):
        (za, ka), (zb, kb), (zc, kc) = a, b, c
        kn = ka + kb + kc + 2 * math.sqrt(abs(ka * kb + kb * kc + kc * ka))
        zm = ka * za + kb * zb + kc * zc
        import cmath
        w = cmath.sqrt(ka * kb * za * zb + kb * kc * zb * zc + kc * ka * zc * za)
        best = None
        for sgn in (1, -1):
            zn = (zm + sgn * 2 * w) / kn
            err = abs(abs(zn - za) - abs(1 / kn + 1 / ka)) + abs(abs(zn - zb) - abs(1 / kn + 1 / kb))
            err += abs(abs(zn - zc) - abs(1 / kn + 1 / kc))
            if best is None or err < best[0]:
                best = (err, zn)
        nw = (best[1], kn)
        cs.append(nw)
        if n:
            rec(a, b, nw, n - 1)
            rec(b, c, nw, n - 1)
            rec(a, c, nw, n - 1)
    o = base[0]
    c1, c2, c3 = cs[0], cs[1], cs[2]
    rec(c1, c2, c3, d)
    rec(o, c1, c2, d)
    rec(o, c2, c3, d)
    rec(o, c1, c3, d)
    for z, k in cs:
        P.disc(z.real, z.imag, 1 / k - .4)
    return P.out()


def escape(fn):
    n = 1024
    y, x = np.mgrid[0:n, 0:n]
    return fn((x + .5) / n, (y + .5) / n)


def mandelbrot():
    def f(u, v):
        c = (u * 3 - 2.15) + 1j * (v * 3 - 1.5)
        z = np.zeros_like(c)
        m = np.ones(c.shape, bool)
        for _ in range(120):
            z[m] = z[m] ** 2 + c[m]
            m &= np.abs(z) < 2
        return m
    return Image.fromarray((f(*np.broadcast_arrays(*np.mgrid[0:1:1024j, 0:1:1024j][::-1])) * 255).astype("uint8"))


def julia(c, zoom=3.2):
    u, v = np.mgrid[0:1:1024j, 0:1:1024j][::-1]
    z = (u - .5) * zoom + 1j * (v - .5) * zoom
    m = np.ones(z.shape, bool)
    for _ in range(160):
        z[m] = z[m] ** 2 + c
        m &= np.abs(z) < 2
    return Image.fromarray((m * 255).astype("uint8"))


def fern():
    P = np.zeros((1024, 1024), bool)
    x = y = 0.0
    rnd = random.Random(1)
    for i in range(400000):
        r = rnd.random()
        if r < .01:
            x, y = 0, .16 * y
        elif r < .86:
            x, y = .85 * x + .04 * y, -.04 * x + .85 * y + 1.6
        elif r < .93:
            x, y = .2 * x - .26 * y, .23 * x + .22 * y + 1.6
        else:
            x, y = -.15 * x + .28 * y, .26 * x + .24 * y + .44
        P[int(980 - y * 94), int(512 + x * 170)] = True
    return Image.fromarray((P * 255).astype("uint8"))


def menger(d):
    """Isometric sponge, painter's order, three faces in the 3die palette's values."""
    P = Pen()
    k = 3 ** d
    keep = []
    def solid(i, j, l):
        for _ in range(d):
            if (i % 3 == 1) + (j % 3 == 1) + (l % 3 == 1) >= 2:
                return False
            i, j, l = i // 3, j // 3, l // 3
        return True
    s = 80 / (2 * k * .866)
    iso = lambda x, y, z: (50 + (x - y) * s * .866, 50 + (x + y) * s * .5 - z * s - (k * s * .0))
    cells = [(i, j, l) for i in range(k) for j in range(k) for l in range(k) if solid(i, j, l)]
    cells.sort(key=lambda c: c[0] + c[1] + c[2])
    o = -k / 2
    for i, j, l in cells:
        x, y, z = i + o, j + o, l + o
        p = [iso(x + a, y + b, z + c) for a, b, c in ((1, 1, 1), (0, 1, 1), (0, 0, 1), (1, 0, 1), (1, 1, 0), (0, 1, 0), (1, 0, 0))]
        P.d.polygon([P.pt(*q) for q in (p[0], p[1], p[2], p[3])], fill=(245, 245, 245))
        P.d.polygon([P.pt(*q) for q in (p[0], p[1], p[5], p[4])], fill=(150, 150, 150))
        P.d.polygon([P.pt(*q) for q in (p[0], p[3], p[6], p[4])], fill=(80, 80, 80))
    return P.out()


def affine(src, dst):
    A = np.array([[*p, 1] for p in src], float)
    return np.linalg.solve(A, np.array(dst, float)).T


def mark_ifs(n=1200000, colour=True):
    """The 3die mark as its own fractal: the outer triangle maps onto green, red and ochre."""
    T = ((2, 21), (86, 2), (69, 99))
    ms = [affine(T, MARK[k]) for k in ("green", "red", "ochre")]
    cs = (GREEN, RED, OCHRE)
    area = [abs(np.linalg.det(m[:2, :2])) for m in ms]
    w = np.cumsum(area) / sum(area)
    rnd = random.Random(3)
    N = 1024
    A = np.zeros((N, N, 3), "uint8")
    p = np.array([40.0, 40.0, 1.0])
    for i in range(n):
        k = int(np.searchsorted(w, rnd.random()))
        p = np.append(ms[k] @ p, 1.0)
        if i > 20:
            x, y = int(p[0] * N / 100), int(p[1] * N / 100)
            if 0 <= x < N and 0 <= y < N:
                A[y, x] = cs[k] if colour else INK
    return Image.fromarray(A)


def mark_search():
    """Every vertex order of the three maps; keep the attractors that fill the most ground."""
    T = np.array(((-8, 6, 1), (122, -2, 1), (30, 118, 1)), float)
    keys = ("green", "red", "ochre")
    import itertools
    perms = list(itertools.permutations(range(3)))
    rng = np.random.default_rng(5)
    res = []
    for pp in itertools.product(perms, repeat=3):
        ms = []
        ok = True
        for k, p in zip(keys, pp):
            m = np.linalg.solve(T, np.array(MARK[k], float)[list(p)]).T
            if np.linalg.svd(m[:2, :2], compute_uv=False)[0] > .985:
                ok = False
                break
            ms.append(m)
        if not ok:
            continue
        area = np.array([abs(np.linalg.det(m[:2, :2])) for m in ms])
        w = area / area.sum()
        X = rng.uniform(0, 100, (20000, 2))
        C = np.zeros(len(X), int)
        for _ in range(26):
            C = rng.choice(3, len(X), p=w)
            nx = np.zeros_like(X)
            for k in range(3):
                q = C == k
                nx[q] = (ms[k][:2, :2] @ X[q].T).T + ms[k][:2, 2]
            X = nx
        g = np.floor(X / 2).astype(int)
        res.append((len({(a, b) for a, b in g}), pp, ms, w))
    res.sort(key=lambda r: -r[0])
    print("mark IFS: tried", len(res), "best cells", [r[0] for r in res[:6]])
    it = []
    for cells, pp, ms, w in res[:8]:
        N = 1024
        A = np.zeros((N, N, 3), "uint8")
        X = rng.uniform(0, 100, (500000, 2))
        cols = np.array((GREEN, RED, OCHRE), "uint8")
        for j in range(30):
            C = rng.choice(3, len(X), p=w)
            nx = np.zeros_like(X)
            for k in range(3):
                q = C == k
                nx[q] = (ms[k][:2, :2] @ X[q].T).T + ms[k][:2, 2]
            X = nx
        x, y = (X * N / 100).astype(int).T
        q = (x >= 0) & (x < N) & (y >= 0) & (y < N)
        A[y[q], x[q]] = cols[C[q]]
        it.append((f"order {cells}", Image.fromarray(A)))
    return it


def palette_menger(d):
    P = Pen()
    k = 3 ** d
    def solid(i, j, l):
        for _ in range(d):
            if (i % 3 == 1) + (j % 3 == 1) + (l % 3 == 1) >= 2:
                return False
            i, j, l = i // 3, j // 3, l // 3
        return True
    s = 80 / (2 * k * .866)
    iso = lambda x, y, z: (50 + (x - y) * s * .866, 50 + (x + y) * s * .5 - z * s)
    cells = sorted(((i, j, l) for i in range(k) for j in range(k) for l in range(k) if solid(i, j, l)), key=sum)
    o = -k / 2
    for i, j, l in cells:
        x, y, z = i + o, j + o, l + o
        p = [iso(x + a, y + b, z + c) for a, b, c in ((1, 1, 1), (0, 1, 1), (0, 0, 1), (1, 0, 1), (1, 1, 0), (0, 1, 0), (1, 0, 0))]
        P.d.polygon([P.pt(*q) for q in (p[0], p[1], p[2], p[3])], fill=GREEN)
        P.d.polygon([P.pt(*q) for q in (p[0], p[1], p[5], p[4])], fill=RED)
        P.d.polygon([P.pt(*q) for q in (p[0], p[3], p[6], p[4])], fill=OCHRE)
    return P.out()


def palette_sierpinski(d):
    P = Pen()
    def go(a, b, c, n, col):
        if not n:
            P.tri(a, b, c, col)
            return
        m = lambda p, q: ((p[0] + q[0]) / 2, (p[1] + q[1]) / 2)
        go(a, m(a, b), m(a, c), n - 1, col or RED)
        go(m(a, b), b, m(b, c), n - 1, col or OCHRE)
        go(m(a, c), m(b, c), c, n - 1, col or GREEN)
    go((8, 90), (92, 90), (50, 17.3), d, None)
    return P.out()


def cmd_fractal2():
    it = mark_search()[:6]
    it += [("Menger 1 palette", palette_menger(1)), ("Menger 2 palette", palette_menger(2)),
           ("Sierpinski 2 palette", palette_sierpinski(2)), ("Sierpinski 3 palette", palette_sierpinski(3))]
    (OUT / "fractal").mkdir(parents=True, exist_ok=True)
    for n, im in it:
        im.convert("RGB").save(OUT / "fractal" / ("r2-" + n.lower().replace(" ", "-") + ".png"))
    board(it, "fractal-board-2", 4, 150)


def cmd_fractal():
    random.seed(1)
    it = [
        ("3die mark IFS", mark_ifs()),
        ("Sierpinski 1", sierpinski(1)),
        ("Sierpinski 2", sierpinski(2)),
        ("Sierpinski 3", sierpinski(3)),
        ("Carpet 1", carpet(1)),
        ("Carpet 2", carpet(2)),
        ("Vicsek 2", vicsek(2)),
        ("T-square 3", tsquare(3)),
        ("Cantor 3", cantor(3)),
        ("Koch 2", koch(2)),
        ("Hilbert 3", curve(lsys("A", {"A": "-BF+AFA+FB-", "B": "+AF-BFB-FA+"}, 90, 3), 3.2)),
        ("Dragon 8", curve(lsys("F", {"F": "F+G", "G": "F-G"}, 90, 8), 1.6)),
        ("Levy C 8", curve(lsys("F", {"F": "+F--F+"}, 45, 8), 1.6)),
        ("Gosper 2", curve(lsys("A", {"A": "A-B--B+A++AA+B-", "B": "+A-BB--B-A++A+B"}, 60, 2), 3)),
        ("Pythagoras 4", pythagoras(4)),
        ("Apollonian 2", apollonian(2)),
        ("Mandelbrot", mandelbrot()),
        ("Julia dendrite", julia(0 + 1j)),
        ("Douady rabbit", julia(-.123 + .745j, 2.8)),
        ("Basilica", julia(-1 + 0j, 3.4)),
        ("Fern", fern()),
        ("Menger 1", menger(1)),
        ("Menger 2", menger(2)),
    ]
    OUT.mkdir(exist_ok=True)
    (OUT / "fractal").mkdir(exist_ok=True)
    for n, im in it:
        im.convert("RGB").save(OUT / "fractal" / (n.lower().replace(" ", "-") + ".png"))
    board(it, "fractal-board", 4, 150)


def rays(path, n=720):
    """Pupil and limbus radius per angle, so real, non-circular eyes still align exactly."""
    a = np.asarray(Image.open(path).convert("L"), float)
    H, W = a.shape
    ys, xs = np.where(a < 235)
    cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
    th = np.arange(n) / n * 2 * np.pi
    R = np.arange(0, int(max(xs.max() - xs.min(), ys.max() - ys.min()) * .62))
    for _ in range(4):
        u = np.clip(cx + np.outer(np.cos(th), R), 0, W - 1).astype(int)
        v = np.clip(cy + np.outer(np.sin(th), R), 0, H - 1).astype(int)
        L = a[v, u]
        rp = np.argmax(L > 30, axis=1).astype(float)
        cx += float(np.mean(rp * np.cos(th))) * 2
        cy += float(np.mean(rp * np.sin(th))) * 2
    rl = (L.shape[1] - 1 - np.argmax((L < 235)[:, ::-1], axis=1)).astype(float)
    def smooth(v):
        w = 15
        st = np.stack([np.roll(v, i) for i in range(-w, w + 1)])
        m = np.median(st, axis=0)
        return np.convolve(np.r_[m[-w:], m, m[:w]], np.ones(2 * w + 1) / (2 * w + 1), "valid")
    return cx, cy, smooth(rp) * 1.012, smooth(rl) * .975


def unrolled(path, n, rp1, rl1):
    """Resample so every eye shares one pupil and one limbus. Returns RGB in the n×n frame."""
    im = np.asarray(Image.open(path).convert("RGB"), float)
    cx, cy, rp, rl = rays(path)
    y, x = np.mgrid[0:n, 0:n]
    dx, dy = x + .5 - n / 2, y + .5 - n / 2
    r = np.hypot(dx, dy)
    ang = np.arctan2(dy, dx) % (2 * np.pi)
    i = (ang / (2 * np.pi) * len(rp)).astype(int) % len(rp)
    ri = rp[i] + (r - rp1) / (rl1 - rp1) * (rl[i] - rp[i])
    u = np.clip(cx + ri * np.cos(ang), 0, im.shape[1] - 2)
    v = np.clip(cy + ri * np.sin(ang), 0, im.shape[0] - 2)
    u0, v0 = u.astype(int), v.astype(int)
    fu, fv = (u - u0)[..., None], (v - v0)[..., None]
    return (im[v0, u0] * (1 - fu) * (1 - fv) + im[v0, u0 + 1] * fu * (1 - fv)
            + im[v0 + 1, u0] * (1 - fu) * fv + im[v0 + 1, u0 + 1] * fu * fv)


def pie(layers, angles, n=1024, rp=.17, rl=.46, gap=0.0, start=-90):
    """Wedges of aligned irises. angles are degrees and sum to 360."""
    N = n * SS
    rp1, rl1 = rp * N, rl * N
    y, x = np.mgrid[0:N, 0:N]
    dx, dy = x + .5 - N / 2, y + .5 - N / 2
    r = np.hypot(dx, dy)
    th = (np.degrees(np.arctan2(dy, dx)) - start) % 360
    out = np.zeros((N, N, 3))
    a = 0
    for lay, ang in zip(layers, angles):
        src = unrolled(lay, N, rp1, rl1)
        off = (gap / 2) / np.maximum(r, 1) * 180 / math.pi
        m = (th >= a + off) & (th < a + ang - off)
        out[m] = src[m]
        a += ang
    disc = (r >= rp1) & (r <= rl1)
    out[~disc] = 0
    return Image.fromarray(out.astype("uint8")).resize((n, n), Image.LANCZOS)


def instrument(img, marks, n=1024):
    """Fractal Engine's hairlines: rim ring, wedge boundaries, calibration ticks."""
    k = 2
    N = n * k
    O = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    d = ImageDraw.Draw(O)
    c = N / 2
    ri, ro = .485 * N, .5 * N - 6
    d.ellipse([c - ri, c - ri, c + ri, c + ri], outline=(255, 255, 255, 150), width=3)
    for i in range(120):
        a = math.radians(i * 3)
        q = ri + (26 if i % 10 == 0 else 12)
        d.line([c + ri * math.cos(a), c + ri * math.sin(a), c + q * math.cos(a), c + q * math.sin(a)],
               fill=(255, 255, 255, 170 if i % 10 == 0 else 80), width=2)
    for m in marks:
        a = math.radians(m - 90)
        d.line([c + .17 * N * math.cos(a), c + .17 * N * math.sin(a), c + ri * math.cos(a), c + ri * math.sin(a)],
               fill=(255, 255, 255, 200), width=3)
    base = img.convert("RGB").resize((N, N), Image.LANCZOS).convert("RGBA")
    base.alpha_composite(O)
    return base.convert("RGB").resize((n, n), Image.LANCZOS)


def marks_of(angles):
    a, o = 0, []
    for x in angles:
        o.append(a)
        a += x
    return o


def cmd_iris():
    P = lambda k: SHOTS / f"preset-{k}-front-4k.png"
    F = lambda k: SHOTS / f"{k}-front-fine-4k.png"
    H = lambda k: SHOTS / f"{k}-pass-height-fine-4k.png"
    M = lambda k: SHOTS / f"{k}-pass-material-fine-4k.png"
    ten = ["ice", "blue", "bluegreen", "grey", "green", "hazel", "amber", "lightbrown", "brown", "darkbrown"]
    golden = 137.508
    five = ["ice", "darkbrown", "green", "amber", "blue"]
    a3 = [216, 90, 54]
    a4 = [180, 90, 54, 36]
    it = [
        ("ten presets, equal", pie([P(k) for k in ten], [36] * 10)),
        ("five, equal", pie([P(k) for k in five], [72] * 5)),
        ("three, mark ratio", pie([P(k) for k in ("bluegreen", "amber", "darkbrown")], a3)),
        ("fitted 09 25 26 35", pie([F(k) for k in ("09", "25", "26", "35")], a4)),
        ("one eye, passes", pie([F("26"), H("26"), M("26")], a3)),
        ("five, fine gap", pie([P(k) for k in five], [72] * 5, gap=10)),
    ]
    it.append(("ten + instrument", instrument(it[0][1], marks_of([36] * 10))))
    it.append(("fitted + instrument", instrument(it[3][1], marks_of(a4))))
    it.append(("passes + instrument", instrument(it[4][1], marks_of(a3))))
    wide = [pie([F("26"), H("26"), M("26")], a3, rp=.10, rl=.60)]
    it.append(("passes, full bleed", wide[0]))
    it.append(("ten, full bleed", pie([P(k) for k in ten], [36] * 10, rp=.10, rl=.60)))
    it.append(("whole 26 for comparison", pie([F("26")], [360])))
    (OUT / "iris").mkdir(parents=True, exist_ok=True)
    for n, im in it:
        im.save(OUT / "iris" / (n.replace(" ", "-").replace("+", "and") + ".png"))
    board(it, "iris-board", 4, 170)


def cmd_orb():
    d = OUT / "orb"
    it = [(p.stem, Image.open(p)) for p in sorted(d.glob("*.png")) if not p.stem.startswith("more")]
    board(it, "orb-board", 5, 150)
    keep = [d / "rest-t31.png", d / "more2-t26.png", d / "more2-t31.png", d / "more6-t36.png"]
    keep += sorted(d.glob("more6-o*.png"))
    board([(p.stem, Image.open(p)) for p in keep], "orb-colours-board", 4, 150)


if __name__ == "__main__":
    {"orb": cmd_orb, "fractal": cmd_fractal, "fractal2": cmd_fractal2, "iris": cmd_iris}[sys.argv[1]]()
