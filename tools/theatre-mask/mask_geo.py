"""Procedural antique theatre mask: the form, the shell SDF and the muscle deformation fields.

Pure numpy, so it runs inside Blender's Python (build.py) and anywhere else.

Units are centimetres in a face frame: x to the mask's left (viewer's right), y up, z out of the face
towards the viewer. The mask is a porcelain shell around a height field h(x, y): front surface at h,
back surface at h - THICK, cut by the face outline and the eye and mouth holes, all edges rounded.

Expressions are NOT re-sculpts. Every facial muscle action (AU, after FACS) is a smooth displacement
field over the base mask's (x, y), applied to every vertex, front and back alike: holes, rims and wall
thickness travel with the warp, so one mesh topology serves every emotion. Each AU has two parts:
  - move: where tissue goes (brows up, mouth corners out, jaw down ...)
  - wrinkle: the folds that compression raises (forehead lines, crow's feet, nasolabial fold ...),
    displaced along the base surface normal, exported as a separate key so a runtime can give wrinkles
    their own onset curve (they appear late in a contraction and release early).
"""
import numpy as np

THICK = 0.38      # wall, cm: thick enough to read at every rim
RIM = 0.14        # rounding radius of every cut edge, cm


# ---------------------------------------------------------------- helpers

def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def gauss(x, y, cx, cy, sx, sy):
    return np.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2))


def gauss2(x, y, cx, cy, sx, sy):
    """Mirrored pair at (+cx, cy) and (-cx, cy)."""
    return gauss(x, y, cx, cy, sx, sy) + gauss(x, y, -cx, cy, sx, sy)


def side(x, s=0.6):
    """~+1 on the mask's left (x > 0), ~-1 on its right: mirrors lateral vectors. Smooth through the
    midline, or a lateral push from both sides would tear the face open along x = 0."""
    return np.tanh(np.asarray(x) / s)


def smax(a, b, k):
    h = np.maximum(k - np.abs(a - b), 0.0) / k
    return np.maximum(a, b) + h * h * k * 0.25


def catmull(ctrl, n=10, closed=False):
    """Centripetal-ish Catmull-Rom through control points, sampled n per span."""
    P = np.asarray(ctrl, float)
    if closed:
        P = np.vstack([P[-1], P, P[0], P[1]])
    else:
        P = np.vstack([2 * P[0] - P[1], P, 2 * P[-1] - P[-2]])
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for t in np.linspace(0, 1, n, endpoint=False):
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    if not closed:
        out.append(P[-2])
    return np.array(out)


def smooth_interp(v, xs, ys):
    """C1-looking 1-D interpolation: a dense Catmull-Rom through (xs, ys), then linear lookup."""
    c = catmull(np.c_[xs, ys], n=24)
    o = np.argsort(c[:, 0])
    return np.interp(v, c[o, 0], c[o, 1])


def poly_dist(x, y, pts, closed=False, margin=6.0):
    """Distance to a polyline, signed by side (left of travel = +), and arc parameter t in [0, 1].
    Points farther than `margin` outside the curve's bounding box are not measured: they get distance
    2 * margin (every feature built on a curve has died out by then)."""
    x = np.asarray(x, float)
    y = np.asarray(y, float)
    P = np.asarray(pts, float)
    lo, hi = P.min(0) - margin, P.max(0) + margin
    m = (x >= lo[0]) & (x <= hi[0]) & (y >= lo[1]) & (y <= hi[1])
    if not m.all():
        sd, d, tt = np.full(x.shape, 2 * margin), np.full(x.shape, 2 * margin), np.zeros(x.shape)
        if m.any():
            sd[m], d[m], tt[m] = _poly_dist(x[m], y[m], P, closed)
        return sd, d, tt
    return _poly_dist(x, y, P, closed)


def _poly_dist(x, y, P, closed):
    if closed:
        P = np.vstack([P, P[:1]])
    seg = P[1:] - P[:-1]
    L = np.hypot(seg[:, 0], seg[:, 1])
    cum = np.r_[0.0, np.cumsum(L)]
    best = np.full(np.shape(x), np.inf)
    sgn = np.ones(np.shape(x))
    tt = np.zeros(np.shape(x))
    for i in range(len(seg)):
        ax, ay = P[i]
        dx, dy = seg[i]
        t = np.clip(((x - ax) * dx + (y - ay) * dy) / (L[i] ** 2), 0.0, 1.0)
        qx, qy = x - (ax + t * dx), y - (ay + t * dy)
        d = np.hypot(qx, qy)
        m = d < best
        best = np.where(m, d, best)
        sgn = np.where(m, np.where(dx * qy - dy * qx >= 0, 1.0, -1.0), sgn)
        tt = np.where(m, (cum[i] + t * L[i]) / cum[-1], tt)
    return best * sgn, best, tt


def poly_sdf(x, y, pts):
    """Signed distance to a closed polygon: negative inside."""
    P = np.asarray(pts, float)
    _, d, _ = poly_dist(x, y, P, closed=True)
    inside = np.zeros(np.shape(x), bool)
    Q = np.vstack([P, P[:1]])
    for i in range(len(P)):
        (x1, y1), (x2, y2) = Q[i], Q[i + 1]
        c = ((y1 > y) != (y2 > y)) & (x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-12) + x1)
        inside ^= c
    return np.where(inside, -d, d)


def _taper(t, e=0.3):
    """Fade-in/out along a curve with zero slope at both ends: t is clamped beyond the ends, and any
    corner there would draw a straight seam across the face."""
    t = np.clip(t, 0, 1)
    return smoothstep(0.0, e, t) * smoothstep(1.0, 1.0 - e, t)


def mirror(pts):
    P = np.asarray(pts, float)
    return P * [-1, 1]


# ---------------------------------------------------------------- the base form

# face outline, mask's left half from the crown down to the chin, then mirrored: a broad, high forehead dome
_OUT_L = [(0, 10.7), (2.8, 10.55), (5.2, 9.9), (6.9, 8.6), (7.9, 6.6), (8.35, 4.0), (8.4, 1.0), (8.05, -2.4),
          (7.2, -5.8), (5.7, -8.9), (3.4, -11.2), (0, -12.2)]
OUTLINE = catmull(_OUT_L[:-1] + [(-p[0], p[1]) for p in _OUT_L[::-1]][:-1], n=8, closed=True)

# eye opening, mask's left eye: inner corner, upper lid, outer corner, lower lid
_EYE_L = [(1.55, 1.48), (2.25, 2.25), (3.30, 2.62), (4.40, 2.40), (5.15, 1.88),
          (4.35, 1.15), (3.25, 0.86), (2.20, 1.02)]
EYE_L = catmull(_EYE_L, n=10, closed=True)
EYE_R = mirror(EYE_L)[::-1]
EYE_C = (3.25, 1.65)

# mouth opening: corners at (+-2.9, -7.0), a calm, parted mouth
_MOUTH = [(2.90, -7.00), (1.90, -6.72), (0.70, -6.58), (0.0, -6.62), (-0.70, -6.58), (-1.90, -6.72),
          (-2.90, -7.00), (-1.90, -7.60), (-0.75, -7.86), (0.0, -7.88), (0.75, -7.86), (1.90, -7.60)]
MOUTH = catmull(_MOUTH, n=10, closed=True)
MOUTH_Y = -7.08        # the line between the lips
CORNER = (2.90, -7.00)

# brow ridge (orbital rim under the brow), mask's left
BROW_L = catmull([(0.8, 3.6), (2.0, 4.4), (3.4, 4.85), (4.8, 4.6), (6.2, 3.8)], n=24)
# cheekbone: the zygoma, from under the eye out towards the ear
ZYG_L = catmull([(3.3, -0.7), (4.8, -0.6), (6.3, 0.1), (7.7, 1.3)], n=24)
# nasolabial fold: from the nose wing to past the mouth corner
NL_L = catmull([(1.95, -3.75), (2.70, -4.8), (3.25, -6.0), (3.55, -7.3), (3.60, -8.2)], n=24)
# in a laugh the fold runs on, sweeping round under the mouth corner
NL_SMILE_L = catmull([(1.95, -3.75), (2.70, -4.8), (3.25, -6.0), (3.55, -7.3), (3.45, -8.4), (2.9, -9.2)], n=24)


def _curve_pair(fn, x, y, curve_l, **kw):
    """Evaluate a curve feature on the left curve and its mirror, taking the stronger."""
    a = fn(x, y, curve_l, **kw)
    b = fn(-x, y, curve_l, **kw)
    return np.where(np.abs(a) >= np.abs(b), a, b)


def _ridge(x, y, curve, amp, w, taper=0.3):
    _, d, t = poly_dist(x, y, curve)
    tp = _taper(t, taper)
    return amp * np.exp(-(d / w) ** 2) * tp


def height(x, y):
    """Front surface depth h(x, y) in cm: an idealised face, carved rather than modelled from skin."""
    x = np.asarray(x, float)
    y = np.asarray(y, float)
    ax = np.abs(x)
    # base: strong side-to-side wrap; the profile rises from the chin to the brow, then the forehead rolls back
    Wb = 9.1 - np.where(y > -0.5, 0.007, 0.013) * (y + 0.5) ** 2
    Hc = smooth_interp(y, [-12.6, -10.0, -7.0, -3.0, 0.0, 3.0, 5.0, 7.0, 9.0, 11.0],
                       [3.90, 5.20, 6.00, 6.50, 6.80, 7.00, 6.90, 6.50, 5.70, 4.40])
    h = Hc * np.clip(1.0 - (x / Wb) ** 2, 0.0, 1.0) ** 0.6

    # forehead: frontal bosses over a soft dip above the brows, hollow temples
    h += 0.38 * gauss2(x, y, 2.7, 7.6, 2.4, 2.0)
    h -= 0.15 * gauss2(x, y, 2.2, 5.75, 2.5, 0.6)
    h += 0.20 * gauss(x, y, 0.0, 4.1, 0.9, 0.8)                        # glabella
    h -= 0.45 * gauss2(x, y, 7.4, 4.5, 1.4, 2.8)                      # temples
    h += _curve_pair(_ridge, x, y, BROW_L, amp=0.75, w=0.9, taper=1.0)

    # eyes: deep sockets, the eyeball's swell under a heavy upper lid, a lid crease, a soft lower lid
    h -= 1.90 * gauss2(x, y, 3.35, 1.7, 2.3, 1.5)
    de = poly_sdf(ax, y, EYE_L)
    up = smoothstep(1.2, 2.2, y)
    lid_w = gauss(ax, y, 3.35, 2.3, 1.8, 1.2)
    h += (0.24 + 0.16 * up) * np.exp(-((de - 0.32) / (0.30 + 0.10 * up)) ** 2)    # lid rims
    h += 0.35 * np.exp(-((de - 0.78) / 0.50) ** 2) * up * lid_w                  # eyeball under the lid
    h -= 0.15 * np.exp(-((de - 1.18) / 0.18) ** 2) * up * lid_w                  # lid crease
    h += 0.12 * np.exp(-((de - 0.90) / 0.45) ** 2) * (1 - up)                    # lower lid
    h -= 0.18 * gauss2(x, y, 2.9, -0.2, 1.5, 0.5)                                # tear trough

    # nose: broad bridge, a round tip, wings set off by their crease
    P = smooth_interp(y, [-4.8, -4.2, -3.5, -2.9, -1.0, 1.2, 2.7, 3.9, 5.2],
                      [0.00, 0.85, 2.20, 2.45, 1.95, 1.25, 0.75, 0.40, 0.00])
    S = smooth_interp(y, [-4.8, -4.2, -3.5, -2.9, -1.0, 1.2, 2.7, 3.9, 5.2],
                      [1.45, 1.70, 1.45, 1.20, 0.95, 0.80, 0.80, 1.00, 1.40])
    h += P * np.exp(-(ax / S) ** 2.2)
    h += 0.42 * gauss(x, y, 0.0, -3.05, 0.85, 0.75)                   # ball of the tip
    h += 1.00 * gauss2(x, y, 1.55, -3.55, 0.85, 0.75)                 # wings
    r = np.hypot(ax - 1.55, y + 3.55)
    h -= 0.20 * np.exp(-((r - 0.95) / 0.16) ** 2) * smoothstep(-4.3, -3.6, y) * smoothstep(1.2, 1.7, ax)
    h -= 0.24 * gauss2(x, y, 0.65, -4.05, 0.34, 0.24)                 # nostrils

    # cheeks: bone, the fat pad that sits on it and slides into the smile fold, the hollow below
    h += _curve_pair(_ridge, x, y, ZYG_L, amp=0.75, w=1.25, taper=0.8)
    u, v = (ax - 3.4) * 0.45 - (y + 2.6) * 0.89, (ax - 3.4) * 0.89 + (y + 2.6) * 0.45
    h += 0.70 * np.exp(-((u / 1.9) ** 2 + (v / 1.2) ** 2))           # malar pad, long along the fold
    h -= 0.55 * gauss2(x, y, 5.3, -4.8, 1.6, 1.9)                     # buccal hollow
    h += 0.25 * gauss2(x, y, 5.6, -8.4, 1.6, 1.2)                     # jaw
    h += _curve_pair(_fold, x, y, NL_L, depth=0.24, w=0.42, bulge=0.22)
    h += 0.18 * gauss2(x, y, 3.35, -7.0, 0.5, 0.6)                    # modiolus, the knot at the corner

    # mouth: muzzle, rolled lips with a bow and a vermilion edge, philtrum, chin
    h += 0.95 * gauss(x, y, 0.0, -6.7, 3.4, 2.3)
    dm = poly_sdf(x, y, MOUTH)
    upper = smoothstep(MOUTH_Y - 0.25, MOUTH_Y + 0.25, y)
    bow = 0.14 * np.exp(-(x / 0.5) ** 2)
    h += 0.58 * np.exp(-((dm - 0.48 + bow) / 0.46) ** 2) * upper
    h += 0.05 * np.exp(-((dm - 0.98 + bow) / 0.14) ** 2) * upper * np.exp(-(x / 2.4) ** 4)
    h += 0.70 * (1 + 0.10 * np.exp(-((ax - 0.8) / 0.6) ** 2)) * np.exp(-((dm - 0.52) / 0.55) ** 2) * (1 - upper)
    band = smoothstep(-6.3, -5.9, y) * (1 - smoothstep(-4.7, -4.3, y))
    h -= 0.12 * np.exp(-(x / 0.32) ** 2) * band
    h += 0.06 * np.exp(-((ax - 0.46) / 0.16) ** 2) * band
    h -= 0.32 * gauss(x, y, 0.0, -8.85, 2.0, 0.5)                     # under the lower lip
    h += 1.10 * gauss(x, y, 0.0, -10.4, 2.2, 1.4)                     # chin

    # resting lines: a trace of the creases this face makes most, there in every pose
    for name, k in RESTING.items():
        h += k * AUS[name](x, y)[1]
    return h


_HGRID = {}


def _hgrid(vs=0.04):
    """h and its gradient on a grid over the whole mask, computed once."""
    if vs not in _HGRID:
        xs = np.arange(-9.5, 9.5 + vs, vs)
        ys = np.arange(-13.5, 12.0 + vs, vs)
        X, Y = np.meshgrid(xs, ys, indexing="ij")
        H = height(X, Y)
        gx, gy = np.gradient(H, vs, vs)
        _HGRID[vs] = (xs, ys, gx, gy)
    return _HGRID[vs]


def _bilerp(xs, ys, G, x, y):
    vs = xs[1] - xs[0]
    fx = np.clip((x - xs[0]) / vs, 0, len(xs) - 1.001)
    fy = np.clip((y - ys[0]) / vs, 0, len(ys) - 1.001)
    i, j = fx.astype(int), fy.astype(int)
    u, v = fx - i, fy - j
    return ((1 - u) * (1 - v) * G[i, j] + u * (1 - v) * G[i + 1, j]
            + (1 - u) * v * G[i, j + 1] + u * v * G[i + 1, j + 1])


def normal(x, y):
    xs, ys, gx, gy = _hgrid()
    hx, hy = _bilerp(xs, ys, gx, x, y), _bilerp(xs, ys, gy, x, y)
    n = np.stack([-hx, -hy, np.ones_like(hx)], -1)
    return n / np.linalg.norm(n, axis=-1, keepdims=True)


def holes_2d(x, y):
    """2-D signed distance of the material region: outline minus eyes minus mouth (negative = material)."""
    d = poly_sdf(x, y, OUTLINE)
    d = np.maximum(d, -poly_sdf(np.abs(x), y, EYE_L))
    d = np.maximum(d, -poly_sdf(x, y, MOUTH))
    return d


def shell_sdf_grid(vs=0.05, pad=0.6):
    """Dense SDF of the porcelain shell on a voxel grid. Returns (sdf[nx, ny, nz] float32, origin, vs)."""
    xs = np.arange(-9.0, 9.0 + vs, vs)
    ys = np.arange(-13.0, 11.6 + vs, vs)
    X, Y = np.meshgrid(xs, ys, indexing="ij")
    H = height(X, Y)
    gx, gy = np.gradient(H, vs, vs)
    G = np.sqrt(1 + gx * gx + gy * gy)
    D2 = holes_2d(X, Y)
    inside = D2 < 0.5
    zmin, zmax = H[inside].min() - THICK - pad, H[inside].max() + pad
    zs = np.arange(zmin, zmax + vs, vs)
    out = np.empty((len(xs), len(ys), len(zs)), np.float32)
    C = H - THICK * 0.5
    for k, z in enumerate(zs):
        s = np.abs(z - C) / G - THICK * 0.5
        out[:, :, k] = smax(s, D2, RIM)
    return out, np.array([xs[0], ys[0], zs[0]]), vs


def snap_to_surface(pts):
    """Move mesher output onto the exact front and back surfaces. The voxel mesher leaves a faint
    staircase on steep slopes, which a satin highlight shows as parallel lines; near the cut edges the
    rounded rim is left as meshed."""
    x, y, z = pts[:, 0], pts[:, 1], pts[:, 2]
    xs, ys, gx, gy = _hgrid()
    G = np.sqrt(1 + _bilerp(xs, ys, gx, x, y) ** 2 + _bilerp(xs, ys, gy, x, y) ** 2)
    C = height(x, y) - THICK * 0.5
    zz = C + np.sign(z - C) * THICK * 0.5 * G
    k = smoothstep(-1.5 * RIM, -3.0 * RIM, holes_2d(x, y))
    out = pts.copy()
    out[:, 2] = z + k * (zz - z)
    return out


# ---------------------------------------------------------------- wrinkle primitives

def _fold(x, y, curve, depth, w, bulge=0.0, taper=0.3):
    """A skin fold along a curve: a narrow valley, tissue bunched up on its left (lateral) side."""
    sd, d, t = poly_dist(x, y, curve)
    tp = _taper(t, taper)
    v = -depth * np.exp(-(d / w) ** 2)
    v += bulge * np.exp(-((sd - 1.4 * w) / (1.6 * w)) ** 2)
    return v * tp


def _nat(ctrl, seed, wobble=0.05, n=24):
    """A curve through ctrl that wanders a little, the way a real crease never runs true."""
    c = catmull(ctrl, n=n)
    rng = np.random.default_rng(seed)
    t = np.linspace(0, 1, len(c))
    d = np.gradient(c, axis=0)
    nrm = np.c_[-d[:, 1], d[:, 0]]
    nrm /= np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-9
    off = np.zeros(len(c))
    for a, f in ((1.0, rng.uniform(1.0, 1.8)), (0.45, rng.uniform(2.4, 3.6)), (0.2, rng.uniform(5, 7))):
        off += a * np.sin(2 * np.pi * f * t + rng.uniform(0, 2 * np.pi))
    return c + nrm * (off * wobble)[:, None]


def _crease(x, y, curve, depth, w, seed=0, taper=0.8, gaps=0, shoulder=0.45):
    """A natural crease: soft shoulders either side, depth that swells and fades along its length,
    sometimes broken; only evaluated near the curve."""
    x = np.asarray(x, float)
    y = np.asarray(y, float)
    out = np.zeros(np.shape(x))
    lo, hi = curve.min(0) - 3 * w, curve.max(0) + 3 * w
    m = (x >= lo[0]) & (x <= hi[0]) & (y >= lo[1]) & (y <= hi[1])
    if not m.any():
        return out
    _, d, t = poly_dist(x[m], y[m], curve)
    rng = np.random.default_rng(seed + 101)
    tp = _taper(t, 0.35)
    var = 0.78 + 0.22 * np.sin(2 * np.pi * rng.uniform(1.2, 2.2) * t + rng.uniform(0, 6.3))
    for _ in range(gaps):
        var *= 1 - 0.85 * np.exp(-((t - rng.uniform(0.25, 0.75)) / 0.05) ** 2)
    ww = w * (0.75 + 0.35 * tp)
    out[m] = depth * var * tp * (shoulder * np.exp(-(d / (2.6 * ww)) ** 2) - np.exp(-(d / ww) ** 2))
    return out


def _creases(x, y, curves, depth, w, seed=0, mirror_x=False, gaps=0):
    """Several creases; each line gets its own seed, and the mirrored side a different one (faces are
    never perfectly symmetric)."""
    v = np.zeros(np.shape(x))
    for i, c in enumerate(curves):
        dp = depth[i] if np.ndim(depth) else depth
        v += _crease(x, y, c, dp, w, seed=seed + 7 * i, gaps=gaps)
        if mirror_x:
            v += _crease(-x, y, c, dp, w, seed=seed + 7 * i + 3, gaps=gaps)
    return v


def _rolls(phase, env, amp, k=0.55):
    """Compressed skin buckles into rolls: broad rounded crests between narrow, deep valleys. Crests sit
    on the integer level sets of `phase`, valleys half-way between; `env` says where and how hard the skin
    is compressed. Zero-mean, so the rolls bunch the surface without inflating it."""
    c = 0.5 + 0.5 * np.cos(2 * np.pi * phase)
    return amp * env * (c ** k - 0.62)


def _wob(x, y, seed, a=0.10):
    """A slow, smooth wander added to a phase field: rolls never run parallel and evenly spaced."""
    rng = np.random.default_rng(seed)
    v = np.zeros(np.shape(x))
    for amp, f in ((1.0, 0.45), (0.5, 0.9), (0.25, 1.8)):
        th = rng.uniform(0, np.pi)
        v += amp * np.sin(f * (np.cos(th) * x + np.sin(th) * y) + rng.uniform(0, 6.3))
    return a * v


def _arc(x0, x1, y0, sag, n=6):
    """Horizontal-ish arc from x0 to x1 at y0, raised by sag in its middle."""
    xs = np.linspace(x0, x1, n)
    m = 0.5 * (x0 + x1)
    ys = y0 + sag * (1 - ((xs - m) / (0.5 * (x1 - x0))) ** 2)
    return catmull(np.c_[xs, ys], n=6)


# ---------------------------------------------------------------- muscle actions
# each returns (move[N, 3], wrinkle[N]) at full contraction: move in face-frame cm, wrinkle along normal

def _corners(x, y, sx=1.3, sy=1.15):
    return gauss(np.abs(x), y, CORNER[0], CORNER[1], sx, sy)


def _lower_face(x, y):
    """Everything below the line between the lips: the part the jaw carries."""
    return smoothstep(MOUTH_Y + 0.25, MOUTH_Y - 0.85, y) * np.exp(-(x / 6.2) ** 4)


def _lower_lip(x, y):
    return smoothstep(MOUTH_Y + 0.2, MOUTH_Y - 0.4, y) * gauss(x, y, 0, -7.9, 2.6, 1.2)


def _upper_lip(x, y):
    return smoothstep(MOUTH_Y - 0.2, MOUTH_Y + 0.4, y) * gauss(x, y, 0, -6.2, 2.5, 1.1)


# forehead rolls: one phase field for the whole forehead, so the centre rolls (AU1) and the lateral ones (AU2)
# are the same lines and join up when both fire (surprise). Arched up in the middle, dropping at the temples.
def _fore_phase(x, y):
    arch = 0.55 * np.exp(-(x / 2.8) ** 2) - 0.35 * (np.abs(x) / 6.0) ** 2
    s = y - arch
    return s, (s - 5.55) / (0.78 + 0.05 * (s - 5.5)) + _wob(x, y, 11)


def _fore_band(s, phase):
    lo = smoothstep(5.0, 5.55, s)
    hi = 1 - smoothstep(8.2 + 0.5 * np.sin(2.1 * phase), 9.6, s)
    return lo * hi


def au_brow_inner_up(x, y):
    w = gauss2(x, y, 1.5, 4.6, 1.75, 2.3)
    lid = gauss2(x, y, 2.4, 2.35, 0.9, 0.6) * smoothstep(1.6, 2.2, y)   # grief lifts the inner upper lid
    mv = np.stack([0.15 * side(x) * w, 1.05 * w + 0.35 * lid, 0.12 * w], -1)
    s, ph = _fore_phase(x, y)
    reach = 3.0 + 0.7 * np.sin(2 * np.pi * 0.37 * ph + 1.0)              # each roll ends somewhere else
    env = _fore_band(s, ph) * np.exp(-(x / reach) ** 4)
    return mv, _rolls(ph, env, 0.24)


def au_brow_outer_up(x, y):
    w = gauss2(x, y, 4.7, 4.6, 2.3, 2.3)
    mv = np.stack([0.1 * side(x) * w, 0.95 * w, 0.0 * w], -1)
    s, ph = _fore_phase(x, y)
    ax = np.abs(x)
    reach = 5.9 + 0.6 * np.sin(2 * np.pi * 0.29 * ph + 2.0)
    env = _fore_band(s, ph) * smoothstep(1.0, 2.6, ax) * (1 - smoothstep(reach - 0.8, reach + 0.6, ax))
    return mv, _rolls(ph, env, 0.20)


def au_brow_down(x, y):
    w = gauss2(x, y, 1.9, 4.0, 1.9, 1.5)
    mv = np.stack([-0.70 * side(x) * w, -1.10 * w, 0.38 * w], -1)
    ax = np.abs(x)
    # the corrugators bunch the skin between the brows into near-vertical rolls, fanning out as they rise
    q = ax - 0.12 * (y - 3.6)
    env = gauss(x, y, 0.0, 4.05, 1.5, 0.95) * smoothstep(0.12, 0.42, ax)
    v = _rolls((q - 0.50) / 0.68 + _wob(x, y, 31, 0.06), env, 0.30, k=0.45)
    # procerus: short horizontal rolls across the root of the nose
    v += _rolls((y - 2.62) / 0.42 + _wob(x, y, 32, 0.05), gauss(x, y, 0.0, 2.75, 1.0, 0.45), 0.11)
    return mv, v


def au_lid_raise(x, y):
    w = gauss2(x, y, 3.25, 2.5, 2.0, 0.85) * smoothstep(1.45, 2.05, y)
    mv = np.stack([0 * w, 0.62 * w, -0.05 * w], -1)
    return mv, np.zeros(np.shape(x))


def au_cheek_raise(x, y):
    w = gauss2(x, y, 3.6, -2.0, 1.9, 1.6)
    apple = gauss2(x, y, 3.5, -2.3, 1.45, 1.35)
    lid = gauss2(x, y, 3.35, 0.6, 1.45, 0.95) * (1 - smoothstep(1.3, 1.9, y))
    mv = np.stack([0.1 * side(x) * w, 0.95 * w + 1.15 * lid, 0.85 * w + 0.40 * apple + 0.15 * lid], -1)
    ax = np.abs(x)
    # crow's feet: rolls fanning out from the outer corner, bending down a little as they run out
    r = np.hypot(ax - 5.35, y - 1.8)
    th = np.arctan2(y - 1.8, ax - 5.35)
    reach = 1.55 + 0.4 * np.sin(4.0 * th + 0.7)
    env = (smoothstep(0.3, 0.8, r) * (1 - smoothstep(reach - 0.7, reach + 0.4, r))
           * smoothstep(4.9, 5.6, ax) * np.exp(-((th + 0.15) / 0.9) ** 2))
    v = _rolls((th + 0.10 * r) / 0.38 + _wob(x, y, 41, 0.05), env, 0.21, k=0.45)
    # under the eye: rolls following the lower lid, pushed up by the cheek
    de = poly_sdf(ax, y, EYE_L)
    env = ((1 - smoothstep(0.9, 1.5, y)) * smoothstep(0.3, 0.6, de) * (1 - smoothstep(1.3, 2.0, de))
           * gauss(ax, y, 3.4, 0.6, 1.8, 1.4))
    v += _rolls((de - 0.55) / 0.40 + _wob(x, y, 42, 0.05), env, 0.12)
    return mv, v


def au_smile(x, y):
    c = _corners(x, y, 1.5, 1.3)
    ch = gauss2(x, y, 3.2, -5.0, 2.0, 1.8)
    mv = np.stack([0.70 * side(x) * c + 0.15 * side(x) * ch, 1.25 * c + 0.45 * ch, 0.30 * c + 0.35 * ch], -1)
    v = _curve_pair(_fold, x, y, NL_SMILE_L, depth=0.66, w=0.44, bulge=0.55)
    second = [_nat([(3.0, -4.3), (3.75, -5.6), (4.15, -7.0), (4.2, -8.0)], seed=60)]
    v += _creases(x, y, second, 0.14, 0.26, seed=60, mirror_x=True)
    return mv, v


def au_frown(x, y):
    c = _corners(x, y, 1.4, 1.3)
    mv = np.stack([0.15 * side(x) * c, -1.5 * c, -0.12 * c], -1)
    marion = [_nat([(3.0, -7.4), (3.15, -8.5), (3.1, -9.9)], seed=70),
              _nat([(3.6, -7.6), (3.8, -8.6), (3.75, -9.6)], seed=71)]
    corner = [_nat([(3.25, -6.9), (3.55, -7.25), (3.7, -7.7)], seed=72)]
    v = _creases(x, y, marion, [0.26, 0.12], 0.22, seed=70, mirror_x=True)
    v += _creases(x, y, corner, 0.12, 0.15, seed=72, mirror_x=True)
    return mv, v


def au_chin_raise(x, y):
    w = gauss(x, y, 0, -9.9, 2.5, 1.6)
    ll = _lower_lip(x, y)
    mv = np.stack([0 * w, 0.45 * w + 0.32 * ll, 0.35 * w + 0.18 * ll], -1)
    v = -0.32 * np.exp(-((y - (-8.65 - 0.12 * (x / 1.8) ** 2)) / 0.28) ** 2) * np.exp(-(x / 2.2) ** 2)
    # peau d'orange: mentalis dimpling as a few soft pits
    rng = np.random.default_rng(7)
    for _ in range(18):
        px, py = rng.uniform(-1.7, 1.7), rng.uniform(-11.1, -9.2)
        v -= rng.uniform(0.04, 0.08) * gauss(x, y, px, py, 0.32, 0.28)
    return mv, v


def au_jaw_drop(x, y):
    w = _lower_face(x, y)
    mv = np.stack([0 * w, -1.45 * w, -0.45 * w], -1)
    return mv, np.zeros(np.shape(x))


def au_lip_stretch(x, y):
    c = _corners(x, y, 1.7, 1.3)
    mv = np.stack([1.20 * side(x) * c, -0.30 * c, -0.20 * c], -1)
    return mv, np.zeros(np.shape(x))


def au_lip_round(x, y):
    c = _corners(x, y, 1.5, 1.4)
    lips = gauss(x, y, 0, -7.1, 2.4, 1.1)
    mv = np.stack([-0.85 * side(x) * c, 0.05 * c, 0.2 * c + 0.38 * lips], -1)
    return mv, np.zeros(np.shape(x))


def au_upper_lip_raise(x, y):
    w = _upper_lip(x, y)
    mv = np.stack([0 * w, 0.85 * w, 0.12 * w], -1)
    v = 0.6 * _curve_pair(_fold, x, y, NL_L[:len(NL_L) // 2 + 2], depth=0.35, w=0.34, bulge=0.25)
    return mv, v


def au_nose_wrinkle(x, y):
    w = gauss(x, y, 0, -2.2, 1.5, 2.2)
    alae = gauss2(x, y, 1.3, -3.6, 0.9, 0.8)
    mv = np.stack([0 * w, 0.32 * w + 0.60 * alae, 0.08 * w], -1)
    ax = np.abs(x)
    # bunny lines: oblique rolls on the sides of the bridge
    q = (ax - 0.9) * 0.6 - (y - 1.6) * 0.8
    v = _rolls(q / 0.34 + _wob(x, y, 81, 0.04), gauss(ax, y, 0.95, 1.6, 0.6, 0.75) * smoothstep(0.2, 0.5, ax), 0.20)
    v += _rolls((y - 2.6) / 0.40, gauss(x, y, 0.0, 2.65, 0.9, 0.35), 0.07)
    return mv, v


def au_lid_tighten(x, y):
    """AU7: the lower lid rises and tenses, the upper lid settles a little: the eye narrows from below."""
    ax = np.abs(x)
    lo = gauss2(x, y, 3.35, 0.75, 1.5, 0.75) * (1 - smoothstep(1.3, 1.8, y))
    hi = gauss2(x, y, 3.35, 2.45, 1.6, 0.55) * smoothstep(1.7, 2.2, y)
    mv = np.stack([0 * lo, 0.55 * lo - 0.18 * hi, 0.10 * lo], -1)
    de = poly_sdf(ax, y, EYE_L)
    env = (1 - smoothstep(0.9, 1.5, y)) * smoothstep(0.4, 0.7, de) * (1 - smoothstep(1.1, 1.6, de)) * gauss(ax, y, 3.4, 0.6, 1.6, 1.2)
    return mv, _rolls((de - 0.6) / 0.36, env, 0.06)


def au_lip_press(x, y):
    """AU23/24: the lips press together and thin; the mouth narrows to a hard line."""
    up, lo = _upper_lip(x, y), _lower_lip(x, y)
    c = _corners(x, y, 1.3, 1.1)
    mv = np.stack([-0.25 * side(x) * c, -0.42 * up + 0.48 * lo, 0.08 * (up + lo)], -1)
    v = _rolls((y + 9.6) / 0.42 + _wob(x, y, 91, 0.05), gauss(x, y, 0, -9.8, 1.6, 0.9), 0.07)   # chin bunches
    return mv, v


def _mouth_edges():
    """The opening's upper and lower edge heights as functions of x (from the base mouth outline)."""
    up = MOUTH[MOUTH[:, 1] >= MOUTH_Y]
    lo = MOUTH[MOUTH[:, 1] < MOUTH_Y]
    up, lo = up[np.argsort(up[:, 0])], lo[np.argsort(lo[:, 0])]
    return (lambda x: np.interp(x, up[:, 0], up[:, 1], left=MOUTH_Y, right=MOUTH_Y),
            lambda x: np.interp(x, lo[:, 0], lo[:, 1], left=MOUTH_Y, right=MOUTH_Y))


def au_lips_close(x, y):
    """The lips meet: each lip travels exactly as far as the opening is high at its x, so the mouth
    closes to a seam all along its length; the skin around it follows, fading out over a lip's width."""
    yu, yl = _mouth_edges()
    gap = 0.03
    du = np.maximum(yu(x) - MOUTH_Y - gap, 0)          # how far the upper edge must come down here
    dl = np.maximum(MOUTH_Y - yl(x) - gap, 0)
    lat = 1 - smoothstep(CORNER[0] - 0.2, CORNER[0] + 1.6, np.abs(x))
    upper = smoothstep(MOUTH_Y - 0.1, MOUTH_Y + 0.1, y) * np.exp(-np.maximum(y - yu(x), 0) ** 2 / 1.1 ** 2)
    lower = (1 - smoothstep(MOUTH_Y - 0.1, MOUTH_Y + 0.1, y)) * np.exp(-np.maximum(yl(x) - y, 0) ** 2 / 1.1 ** 2)
    mv = np.stack([0 * x, (-du * upper + dl * lower) * lat, 0.10 * (upper + lower) * lat], -1)
    return mv, np.zeros(np.shape(x))


def au_dimpler_l(x, y):
    """AU14 on the mask's left only: contempt. One corner is drawn back, tightened and lifted."""
    c = gauss(x, y, CORNER[0], CORNER[1], 1.2, 1.0)
    mv = np.stack([0.45 * c, 0.75 * c, -0.35 * c], -1)
    v = _crease(x, y, _nat([(3.45, -6.35), (3.75, -7.0), (3.7, -7.7)], seed=95), 0.30, 0.20, seed=95)
    return mv, v


AUS = {
    "brow_inner_up": au_brow_inner_up,
    "brow_outer_up": au_brow_outer_up,
    "brow_down": au_brow_down,
    "lid_raise": au_lid_raise,
    "cheek_raise": au_cheek_raise,
    "smile": au_smile,
    "frown": au_frown,
    "chin_raise": au_chin_raise,
    "jaw_drop": au_jaw_drop,
    "lip_stretch": au_lip_stretch,
    "lip_round": au_lip_round,
    "upper_lip_raise": au_upper_lip_raise,
    "nose_wrinkle": au_nose_wrinkle,
    "lid_tighten": au_lid_tighten,
    "lip_press": au_lip_press,
    "dimpler_L": au_dimpler_l,
    "lips_close": au_lips_close,
}

RESTING = {"brow_inner_up": 0.18, "brow_outer_up": 0.12, "brow_down": 0.12, "cheek_raise": 0.14,
           "smile": 0.08}

EMOTIONS = {
    "neutral": {},
    "surprise": {"brow_inner_up": 1.0, "brow_outer_up": 1.0, "lid_raise": 1.0, "jaw_drop": 0.9,
                 "lip_round": 0.6},
    "tragedy": {"brow_inner_up": 1.0, "brow_down": 0.7, "frown": 1.0, "jaw_drop": 0.75, "lip_stretch": 0.4,
                "upper_lip_raise": 0.5, "chin_raise": 0.4},
    "comedy": {"cheek_raise": 1.0, "smile": 1.0, "jaw_drop": 0.6, "upper_lip_raise": 0.15,
               "nose_wrinkle": 0.35, "brow_outer_up": 0.15, "lip_stretch": 0.3},
    # the rest of the basic emotions, each after its FACS prototype, pushed to theatre strength
    "fear": {"brow_inner_up": 1.0, "brow_outer_up": 0.5, "brow_down": 0.45, "lid_raise": 1.0, "lid_tighten": 0.3,
             "lip_stretch": 1.3, "jaw_drop": 0.45},
    "anger": {"brow_down": 1.0, "lid_raise": 0.6, "lid_tighten": 0.8, "lips_close": 1.0, "lip_press": 0.7,
              "nose_wrinkle": 0.3, "chin_raise": 0.6},
    "disgust": {"nose_wrinkle": 1.0, "upper_lip_raise": 1.0, "lid_tighten": 0.6, "brow_down": 0.4,
                "chin_raise": 0.6, "frown": 0.5, "cheek_raise": 0.25, "lip_press": 0.2},
    "contempt": {"dimpler_L": 1.0, "lid_tighten": 0.3, "lips_close": 1.0, "lip_press": 0.4, "brow_outer_up": 0.15},
    # closed-lip states: the quiet half of the surface
    "serenity": {"smile": 0.55, "cheek_raise": 0.45, "lips_close": 1.0, "brow_outer_up": 0.1},
    "sorrow": {"brow_inner_up": 0.9, "brow_down": 0.35, "frown": 0.7, "chin_raise": 0.7, "lips_close": 1.0,
               "lid_tighten": 0.2},
    "resolve": {"brow_down": 0.45, "lid_tighten": 0.5, "lips_close": 1.0, "lip_press": 0.6, "chin_raise": 0.4},
}


def wrinkle_onset(w):
    """Wrinkles lag the contraction: invisible at first, full by ~85 %."""
    return float(smoothstep(0.15, 0.85, w))


def au_fields(x, y):
    """All AUs on points (x, y): {name: (move[N, 3], wrinkle_disp[N, 3])}."""
    n = normal(x, y)
    out = {}
    for name, fn in AUS.items():
        mv, wr = fn(x, y)
        out[name] = (mv, wr[:, None] * n)
    return out
