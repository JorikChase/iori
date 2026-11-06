#!/usr/bin/env python3
"""The render pool's index and contact sheets (study/shots, 2026-10-19).

    uv run --with pillow python3 iris-engine/tools/shots_index.py

Writes study/shots/index.md (one line per file, grouped by category) and study/shots/sheets/<category>.jpg
(a numbered contact sheet per category). Categories come from the file names:
  <eye>-front|crop|pass|strands|terrain|polar|legacy-atlas|fields|height|probe-…   and   preset-<name>-…
"""
import os, re, glob
from PIL import Image, ImageDraw, ImageFont
ENG = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
D = os.path.join(ENG, 'study', 'shots'); OUT = os.path.join(D, 'sheets'); os.makedirs(OUT, exist_ok=True)

CAT = [  # (regex on the file name, category, one-line description template)
    (r'^(\d\d)-front-', 'front', 'eye {eye}: the beauty render, white sclera, quality fine, 4096 px'),
    (r'^(\d\d)-crop-(.+)-fine', 'crop', 'eye {eye}: 3× crop ({a}) through the windowed re-bake'),
    (r'^(\d\d)-pass-(\w+)-', 'pass', 'eye {eye}: the {a} pass over the fitted eye'),
    (r'^(\d\d)-strands-(\w+)-(\w+)', 'strands', 'eye {eye}: traced lines, {a}, coloured by {b}'),
    (r'^(\d\d)-terrain-', 'terrain', 'eye {eye}: the automatic terrain partition (zones, crypts, septa, bridge spans, flanks)'),
    (r'^(\d\d)-polarhi-(\w+)', 'polar-hi', 'eye {eye}: the tissue re-baked in four quarter windows at 2.3 µm, stitched, polar: {a} (≈ 15 000 × 1 600)'),
    (r'^(\d\d)-polar-(\w+)', 'polar', 'eye {eye}: the base tissue bake at 6 µm, polar (u across, v up), 6144 × 646: {a}'),
    (r'^(\d\d)-legacy-atlas(\d)', 'legacy-atlas', 'eye {eye}: legacy procedural atlas target {a}, polar 4096 × 1024'),
    (r'^(\d\d)-fields-(\w+)', 'fields', 'eye {eye}: the {a} layer\'s flow (stroke) and spacing (hue) field, polar'),
    (r'^(\d\d)-height-contours', 'height', 'eye {eye}: the baked surface in µm, turbo, 25 µm contours, polar'),
    (r'^(\d\d)-probe-(.+?)-(low|high|mid)-(.+)', 'probe', 'eye {eye}: the probe camera at {a}, {b} ({c})'),
    (r'^preset-(\w+)-front', 'preset', 'preset {eye}: the legacy procedural engine, front, 4096 px'),
    (r'^preset-(\w+)-pass(\d\d)-(.+)', 'preset-pass', 'preset {eye}: debug view {a}, {b}'),
    (r'^preset-(\w+)-pass-(\w+)', 'preset-pass', 'preset {eye}: the {a} pass'),
    (r'^preset-(\w+)-atlas(\d)', 'preset-atlas', 'preset {eye}: atlas target {a}, polar'),
]
def classify(name):
    for rx, cat, tpl in CAT:
        m = re.match(rx, name)
        if m:
            g = list(m.groups()) + ['', '', '']
            return cat, tpl.format(eye=g[0], a=g[1], b=g[2], c=g[3])
    return 'other', name

files = sorted(f for f in os.listdir(D) if f.lower().endswith(('.png', '.jpg')))
groups = {}
for f in files:
    cat, desc = classify(f); groups.setdefault(cat, []).append((f, desc))

try: font = ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', 14)
except Exception: font = ImageFont.load_default()
WIDE = {'polar', 'polar-hi', 'legacy-atlas', 'fields', 'height', 'preset-atlas'}   # strips: one per row, full width
def sheet(cat, items, W=560, cols=4):
    if cat in WIDE: W, cols = 2400, 1
    H = int(W * (0.3 if cat in WIDE else 0.72)); rows = (len(items) + cols - 1) // cols
    im = Image.new('RGB', (cols * W, rows * (H + 24)), (16, 16, 16)); dr = ImageDraw.Draw(im)
    for i, (f, _) in enumerate(items):
        try:
            t = Image.open(os.path.join(D, f))
            if t.mode == 'RGBA': bg = Image.new('RGB', t.size, (255, 255, 255)); bg.paste(t, mask=t.split()[3]); t = bg
            t = t.convert('RGB'); t.thumbnail((W - 6, H - 6))
        except Exception as e: print('skip', f, e); continue
        x, y = (i % cols) * W, (i // cols) * (H + 24)
        im.paste(t, (x + 3 + (W - 6 - t.width) // 2, y + 3 + (H - 6 - t.height) // 2))
        dr.text((x + 6, y + H + 4), f'{i + 1:02d} {f}'[:70], fill=(230, 230, 230), font=font)
    p = os.path.join(OUT, cat + '.jpg'); im.save(p, quality=85); return p

order = ['front', 'crop', 'pass', 'strands', 'terrain', 'polar', 'polar-hi', 'fields', 'height', 'legacy-atlas', 'probe', 'preset', 'preset-pass', 'preset-atlas', 'other']
lines = ['# The render pool — index', '', f'{len(files)} files in `iris-engine/study/shots/`, sheets in `sheets/`. Made 2026-10-19 by the in-page capture rig (see PLAN.md).', '']
for cat in order:
    if cat not in groups: continue
    items = groups[cat]; p = sheet(cat, items)
    lines += [f'## {cat} ({len(items)}) — `sheets/{cat}.jpg`', '']
    lines += [f'{i + 1:02d}. `{f}` — {d}' for i, (f, d) in enumerate(items)] + ['']
    print(cat, len(items), '→', os.path.relpath(p, ENG))
open(os.path.join(D, 'index.md'), 'w').write('\n'.join(lines))
print('index.md:', len(files), 'files')
