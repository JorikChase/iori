"""Build moises_car_atlas.png from the 8-direction turnaround in IMG.png.

The source is 2048x1024 with 8 cars loosely arranged 3x3 (centre empty), but
NOT on a uniform grid -- the sprite bounding boxes overlap what would be the
cell boundaries, so a naive width/3 x height/3 split slices most of the cars
in half (that was the original bug) and neighbouring cars bleed into each
other's boxes. Each car is therefore isolated as an alpha connected component
and masked to its own pixels before cropping.

The art is also not consistently scaled -- the bottom row is drawn ~25% larger
than the top row. Each sprite is normalised to a constant roof-to-tyre height,
which cancels that: a car's on-screen height barely changes across these
elevated 3/4 views, while its length legitimately does.

Direction names come from what the art actually shows, not from the grid slot:
the two pure side views are mirrored relative to their positions (the LEFT-hand
car faces right = East).

Output: 4x2 atlas of 256x160 cells, row-major  N NE E SE / S SW W NW.
"""
import zlib, struct, json, subprocess, sys
from collections import deque

SRC_PNG = "IMG.png"        # the source turnaround, repo root
W, H = 2048, 1024
CELL_W, CELL_H = 256, 160
TARGET_H = 100
ORDER = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
MIN_AREA = 20000

subprocess.run(["ffmpeg", "-v", "error", "-i", SRC_PNG, "-f", "rawvideo",
                "-pix_fmt", "rgba", "src.raw", "-y"], check=True)
d = open("src.raw", "rb").read()
assert len(d) == W * H * 4

# ---------- 1. isolate each car as an alpha connected component ----------
# Labelled on a 4x downsample for speed; every opaque full-res pixel lands in an
# occupied coarse cell, so the coarse label map doubles as an exact full-res
# mask -- which is what keeps neighbouring cars out of each other's crops.
S = 4
w, h = W // S, H // S
occ = bytearray(w * h)
for y in range(h):
    for x in range(w):
        m = 0
        for yy in range(y * S, y * S + S):
            b = yy * W + x * S
            for xx in range(S):
                a = d[(b + xx) * 4 + 3]
                if a > m: m = a
        occ[y * w + x] = 1 if m > 16 else 0

label = [0] * (w * h)
comps = []
nid = 0
for i in range(w * h):
    if occ[i] and not label[i]:
        nid += 1
        q = deque([i]); label[i] = nid
        x0 = y0 = 1 << 30; x1 = y1 = -1; n = 0
        while q:
            p = q.popleft(); px, py = p % w, p // w; n += 1
            if px < x0: x0 = px
            if px > x1: x1 = px
            if py < y0: y0 = py
            if py > y1: y1 = py
            for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
                nx, ny = px + dx, py + dy
                if 0 <= nx < w and 0 <= ny < h:
                    j = ny * w + nx
                    if occ[j] and not label[j]:
                        label[j] = nid; q.append(j)
        if n * S * S >= MIN_AREA:
            comps.append({"id": nid,
                          "box": (x0*S, y0*S, min(W, (x1+1)*S), min(H, (y1+1)*S))})

if len(comps) != 8:
    sys.exit(f"expected 8 sprites, found {len(comps)}")

# ---------- 2. name components from the 3x3 arrangement ----------
def cy(c): return (c["box"][1] + c["box"][3]) / 2
def cx(c): return (c["box"][0] + c["box"][2]) / 2
comps.sort(key=cy)
top, mid, bot = comps[0:3], comps[3:5], comps[5:8]
for r in (top, mid, bot): r.sort(key=cx)
named = {"NW": top[0], "N": top[1], "NE": top[2],
         "E":  mid[0],              "W":  mid[1],   # side views are swapped
         "SW": bot[0], "S": bot[1], "SE": bot[2]}

# ---------- 3. mask to own pixels, then tight-crop ----------
sprites = {}
for name, comp in named.items():
    cid = comp["id"]
    bx0, by0, bx1, by1 = comp["box"]
    nx0 = ny0 = 1 << 30; nx1 = ny1 = -1
    keep = {}
    for y in range(by0, by1):
        ly = (y // S) * w
        for x in range(bx0, bx1):
            if label[ly + x // S] != cid:      # a neighbouring car -- drop it
                continue
            i = (y * W + x) * 4
            if d[i + 3] <= 8:
                continue
            keep[(x, y)] = i
            if x < nx0: nx0 = x
            if x > nx1: nx1 = x
            if y < ny0: ny0 = y
            if y > ny1: ny1 = y
    bw, bh = nx1 - nx0 + 1, ny1 - ny0 + 1
    pix = bytearray(bw * bh * 4)
    for (x, y), i in keep.items():
        o = ((y - ny0) * bw + (x - nx0)) * 4
        pix[o:o+4] = d[i:i+4]
    sprites[name] = (bw, bh, pix)
    print(f"{name:2s} src({nx0:4d},{ny0:4d}) {bw:4d}x{bh:4d}")

# ---------- 4. normalise height, pack into the atlas ----------
def resize_area(sw, sh, src, dw, dh):
    """Area-average downsample in premultiplied alpha (avoids dark fringing)."""
    dst = bytearray(dw * dh * 4)
    xs = [(x*sw//dw, max(x*sw//dw + 1, (x+1)*sw//dw)) for x in range(dw)]
    ys = [(y*sh//dh, max(y*sh//dh + 1, (y+1)*sh//dh)) for y in range(dh)]
    for dy in range(dh):
        y0, y1 = ys[dy]
        for dx in range(dw):
            x0, x1 = xs[dx]
            r = g = b = a = n = 0
            for y in range(y0, y1):
                base = y * sw
                for x in range(x0, x1):
                    i = (base + x) * 4
                    sa = src[i+3]
                    r += src[i]*sa; g += src[i+1]*sa; b += src[i+2]*sa
                    a += sa; n += 1
            o = (dy*dw + dx) * 4
            if a:
                dst[o] = min(255, r//a); dst[o+1] = min(255, g//a); dst[o+2] = min(255, b//a)
            dst[o+3] = a // n if n else 0
    return dst

def write_png(path, ww, hh, pix):
    """PNG writer with per-scanline adaptive filtering (min sum of abs
    differences), which roughly halves the file versus unfiltered lines."""
    stride = ww * 4
    raw = bytearray()
    prev = bytearray(stride)
    for y in range(hh):
        line = pix[y*stride:(y+1)*stride]
        cands = []
        # 0 None
        cands.append((0, bytes(line)))
        # 1 Sub
        s = bytearray(stride)
        for i in range(stride):
            s[i] = (line[i] - (line[i-4] if i >= 4 else 0)) & 255
        cands.append((1, bytes(s)))
        # 2 Up
        u = bytearray(stride)
        for i in range(stride):
            u[i] = (line[i] - prev[i]) & 255
        cands.append((2, bytes(u)))
        # 3 Average
        a = bytearray(stride)
        for i in range(stride):
            left = line[i-4] if i >= 4 else 0
            a[i] = (line[i] - ((left + prev[i]) >> 1)) & 255
        cands.append((3, bytes(a)))
        # 4 Paeth
        p = bytearray(stride)
        for i in range(stride):
            la = line[i-4] if i >= 4 else 0
            b = prev[i]
            c = prev[i-4] if i >= 4 else 0
            pa, pb, pc = abs(b-c), abs(la-c), abs(la+b-2*c)
            pr = la if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
            p[i] = (line[i] - pr) & 255
        cands.append((4, bytes(p)))
        ft, data = min(cands, key=lambda cd: sum(v if v < 128 else 256-v for v in cd[1]))
        raw.append(ft)
        raw += data
        prev = line
    def chunk(tag, body):
        return (struct.pack(">I", len(body)) + tag + body
                + struct.pack(">I", zlib.crc32(tag + body) & 0xffffffff))
    open(path, "wb").write(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", ww, hh, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b""))

aw, ah = CELL_W * 4, CELL_H * 2
atlas = bytearray(aw * ah * 4)
meta = {}
for idx, name in enumerate(ORDER):
    sw, sh, src = sprites[name]
    dw, dh = max(1, round(sw * TARGET_H / sh)), TARGET_H
    if dw > CELL_W:
        sys.exit(f"{name} is {dw}px wide, exceeds the {CELL_W}px cell")
    small = resize_area(sw, sh, src, dw, dh)
    ccx, ccy = idx % 4, idx // 4
    ox = ccx * CELL_W + (CELL_W - dw) // 2
    oy = ccy * CELL_H + (CELL_H - dh) // 2
    for y in range(dh):
        s = y * dw * 4
        t = ((oy + y) * aw + ox) * 4
        atlas[t:t + dw*4] = small[s:s + dw*4]
    meta[name] = {"cell": [ccx, ccy], "size": [dw, dh]}
    print(f"{name:2s} -> {dw:3d}x{dh:3d} at cell({ccx},{ccy})")

write_png("moises_car_atlas.png", aw, ah, atlas)
json.dump(meta, open("atlas_meta.json", "w"), indent=1)
print("atlas:", aw, "x", ah)
