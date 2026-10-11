#!/usr/bin/env python3
"""The casebook sheet (iori, 2026-10-11: "show me a casebook of the renders"): ref/casebook-NN.json (the page's __casebook)
→ study/casebook/<date>-NN.png per eye, and one stitched sheet study/casebook/<date>-casebook.jpg (all eyes, rows)."""
import base64, json, os, sys, datetime
import numpy as np, cv2
ENG = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')); OUT = os.path.join(ENG, 'study', 'casebook')
day = datetime.date.today().isoformat(); rows = []; scores = {}
for ref in sys.argv[1:]:
    src = os.path.join(ENG, 'ref', f'casebook-{ref}.json'); d = json.load(open(src))
    png = base64.b64decode(d['png'].split(',', 1)[1]); p = os.path.join(OUT, f'{day}-{ref}.png'); open(p, 'wb').write(png)
    img = cv2.imdecode(np.frombuffer(png, np.uint8), cv2.IMREAD_COLOR); rows.append(img); scores[ref] = d['scores']; os.remove(src); print(p, img.shape)
if rows:
    w = max(r.shape[1] for r in rows); sheet = np.full((sum(r.shape[0] + 12 for r in rows), w, 3), 255, np.uint8); y = 0
    for r in rows: sheet[y:y + r.shape[0], :r.shape[1]] = r; y += r.shape[0] + 12
    out = os.path.join(OUT, f'{day}-casebook.jpg'); cv2.imwrite(out, sheet, [cv2.IMWRITE_JPEG_QUALITY, 88]); json.dump(scores, open(os.path.join(OUT, f'{day}-scores.json'), 'w'), indent=1)
    print(out, sheet.shape, f'{os.path.getsize(out) / 1e6:.1f} MB')
