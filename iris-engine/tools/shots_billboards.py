#!/usr/bin/env python3
"""Two high-resolution billboards from the render pool (study/shots), for the outreach mail (2026-10-21).

    uv run --with pillow python3 iris-engine/tools/shots_billboards.py

Board 1 — structure: the traced strands (whole, by class / by strand / on black), the crypt sheets, the terrain
partition. Board 2 — render: the crops, the probe views, the ten presets. Dark ground, 8192 px wide, small grey
captions (file stem) under each tile. Output: study/shots/billboards/board-1-structure.jpg, board-2-render.jpg,
plus a 2048 px preview of each.
"""
import os
from PIL import Image, ImageDraw, ImageFont
ENG = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
D = os.path.join(ENG, 'study', 'shots'); OUT = os.path.join(D, 'billboards'); os.makedirs(OUT, exist_ok=True)
BG = (14, 14, 14); CAP = (150, 150, 150); W = 8192; GUT = 48
try: FONT = ImageFont.truetype('/System/Library/Fonts/HelveticaNeue.ttc', 34)
except Exception: FONT = ImageFont.load_default()

def load(name):
    im = Image.open(os.path.join(D, name))
    if im.mode == 'RGBA':
        bg = Image.new('RGB', im.size, (255, 255, 255) if 'front' in name or 'crop' in name or 'preset' in name else (0, 0, 0))
        bg.paste(im, mask=im.split()[3]); im = bg
    return im.convert('RGB')

def row(names, width, height=None):
    """Tiles side by side, each scaled to the row height, widths proportional; returns a canvas of `width`."""
    ims = [load(n) for n in names]
    if height is None:   # fit the row: sum of widths at a common height = width - gutters
        k = (width - GUT * (len(ims) - 1)) / sum(im.width / im.height for im in ims); height = int(k)
    tiles = [im.resize((max(1, int(im.width * height / im.height)), height), Image.LANCZOS) for im in ims]
    total = sum(t.width for t in tiles) + GUT * (len(tiles) - 1)
    cv = Image.new('RGB', (width, height + 56), BG); dr = ImageDraw.Draw(cv); x = (width - total) // 2
    for n, t in zip(names, tiles):
        cv.paste(t, (x, 0)); dr.text((x + 4, height + 10), os.path.splitext(n)[0], fill=CAP, font=FONT); x += t.width + GUT
    return cv

def board(rows, name, title):
    canv = [row(r, W - 2 * GUT) for r in rows]
    H = sum(c.height for c in canv) + GUT * (len(canv) + 1) + 110
    im = Image.new('RGB', (W, H), BG); dr = ImageDraw.Draw(im)
    try: tf = ImageFont.truetype('/System/Library/Fonts/HelveticaNeue.ttc', 54)
    except Exception: tf = FONT
    dr.text((GUT, 36), title, fill=(210, 210, 210), font=tf); y = 110 + GUT
    for c in canv: im.paste(c, (GUT, y)); y += c.height + GUT
    p = os.path.join(OUT, name + '.jpg'); im.save(p, quality=92, subsampling=0)
    im.resize((2048, int(H * 2048 / W)), Image.LANCZOS).save(os.path.join(OUT, name + '-preview.jpg'), quality=88)
    print(name, im.size, os.path.getsize(p) // 1024, 'KB')

board([
    ['09-strands-whole-class.png', '09-strands-whole-hue.png', '26-strands-whole-class-black.png'],
    ['09-strands-crypt1-hue.png', '09-strands-crypt2-class.png', '09-strands-crypt2-hue.png'],
    ['25-strands-crypt1-class.png', '26-strands-crypt1-class.png', '26-strands-crypt2-hue.png'],
    ['09-terrain-whole.png', '25-terrain-whole.png', '26-terrain-whole.png', '35-terrain-whole.png'],
], 'board-1-structure', 'Iris Engine — traced strands, by class and by strand · the automatic terrain partition')

board([
    ['09-crop-crypts-left-fine.png', '25-crop-crypts-left-fine.png', '26-crop-crypts-bottom-fine.png', '26-crop-crypts-left-fine.png', '35-crop-crypts-left-fine.png'],
    ['25-probe-crypts-left-low-clay-contour.png', '25-probe-crypts-left-mid-clay.png', '26-probe-crypts-bottom-high-elevation.png', '26-probe-crypts-bottom-low-albedo.png'],
    ['26-probe-margin-top-low-clay-contour.png', '26-probe-margin-top-mid-clay.png', '35-probe-crypts-left-high-elevation.png', '35-probe-crypts-left-low-albedo.png'],
    ['preset-ice-front-4k.png', 'preset-blue-front-4k.png', 'preset-grey-front-4k.png', 'preset-bluegreen-front-4k.png', 'preset-green-front-4k.png'],
    ['preset-hazel-front-4k.png', 'preset-amber-front-4k.png', 'preset-lightbrown-front-4k.png', 'preset-brown-front-4k.png', 'preset-darkbrown-front-4k.png'],
], 'board-2-render', 'Iris Engine — fitted eyes at 3× · the probe camera in the tissue · the ten procedural presets')
