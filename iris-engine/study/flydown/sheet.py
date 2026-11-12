#!/usr/bin/env python3
"""Comparison sheets: the same spot at several zooms (columns), one row per algorithm.
python3 sheet.py 26 crypt-lip 1185 1965  [--today shots/26-crypt-lip]  →  sheets/26-crypt-lip.jpg"""
import os, sys, time, numpy as np, cv2
from rig import Eye, calibrate, render, octaves

HERE = os.path.dirname(os.path.abspath(__file__))
ZOOMS = [1, 2, 4, 8, 16]
ROWS = [('photo', 'photograph, magnified (bicubic)'),
        ('today', "today's engine (Tissue model, fine)"),
        ('erosion', 'A  erosion filter, steered by strand tangents + relief'),
        ('mosaic', 'B  Worley cell mosaic (ABL cells, then granules)'),
        ('example', "C  by-example from the eye's own photo"),
        ('cascade', 'D  cascade: A on strands/crypts, B on the sheet')]

def label(img, text, sub=None):
    out = img.copy()
    cv2.rectangle(out, (0, 0), (out.shape[1], 22), (0, 0, 0), -1)
    cv2.putText(out, text, (6, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (255, 255, 255), 1, cv2.LINE_AA)
    return out

def build(ref, name, P, N=320, today_dir=None, rows=ROWS, zooms=ZOOMS, extra=None):
    eye = calibrate(Eye(ref)); cache = {}
    tiles = []; t0 = time.time()
    for key, title in rows:
        row = []
        for z in zooms:
            s = eye.UM / z
            if key == 'today':
                f = os.path.join(today_dir or '', f'x{z}.jpg')
                if today_dir and os.path.exists(f):
                    im = cv2.resize(cv2.imread(f), (N, N), interpolation=cv2.INTER_AREA)
                else:
                    im = np.full((N, N, 3), 40, np.uint8); cv2.putText(im, 'not captured', (90, N // 2), 0, 0.6, (200, 200, 200), 1)
            else:
                rgb = render(eye, P, s, N, key, cache=cache)
                im = (rgb[..., ::-1] * 255 + 0.5).astype(np.uint8)
            row.append(label(im, f'x{z}  {s:.2f} um/px  view {N * s / 1000:.2f} mm'))
        r = np.concatenate([np.pad(t, ((0, 4), (0, 4), (0, 0))) for t in row], 1)
        head = np.zeros((30, r.shape[1], 3), np.uint8)
        cv2.putText(head, title, (8, 21), cv2.FONT_HERSHEY_SIMPLEX, 0.62, (120, 230, 255), 1, cv2.LINE_AA)
        tiles.append(np.concatenate([head, r], 0))
        print(f'  {key}: {time.time() - t0:.1f} s', flush=True)
    sheet = np.concatenate(tiles, 0)
    top = np.zeros((44, sheet.shape[1], 3), np.uint8)
    oc = ', '.join(f'{l:.1f}' for _, l in octaves(eye))
    cv2.putText(top, f'eye {ref} - {name} - centre ({P[0]:.0f}, {P[1]:.0f}) native px - octaves {oc} um, floor 1 um - seeded from the photo\'s finest band',
                (8, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.58, (255, 255, 255), 1, cv2.LINE_AA)
    sheet = np.concatenate([top, sheet], 0)
    os.makedirs(os.path.join(HERE, 'sheets'), exist_ok=True)
    out = os.path.join(HERE, 'sheets', f'{ref}-{name}.jpg')
    cv2.imwrite(out, sheet, [cv2.IMWRITE_JPEG_QUALITY, 90])
    return out

REFINED = [('photo', 'photograph, magnified (bicubic)'), ('today', "today's engine (Tissue model, fine)"),
           ('cascade', 'D  cascade as iori saw it'), ('refined', "D' refined: seeded soft-wall mosaic + coherence-weighted erosion + 40 % by-example")]

if __name__ == '__main__':
    if '--refined' in sys.argv:
        sys.argv.remove('--refined'); ref, name, x, y = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4])
        print(build(ref, name + '-refined', np.array([x, y]), today_dir=os.path.join(HERE, 'today', f'{ref}-{name}'), rows=REFINED)); sys.exit()
    ref, name, x, y = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4])
    td = sys.argv[sys.argv.index('--today') + 1] if '--today' in sys.argv else os.path.join(HERE, 'today', f'{ref}-{name}')
    print(build(ref, name, np.array([x, y]), today_dir=td))
