#!/usr/bin/env python3
"""Rank iris photographs by how much real strand-scale detail they carry.

    /usr/bin/python3 iris-engine/tools/iris_sharpness.py /Users/iori/Desktop/code/iris/SBVPI

For each image with an iris mask (SBVPI layout: <id>.jpg + <id>_iris.png, optional _pupil / _eyelashes),
and for our four isolated macros (iris region from the fitted alignment in ref/cases.json):

- the iris region is the iris mask minus pupil and lashes, eroded by 4 % of the iris diameter so the
  limbus and pupil edges do not count as detail;
- µm/px comes from the iris diameter (12 mm);
- `strand` = std of a difference-of-Gaussians band-pass at 30–90 µm, over the mean luminance — the same
  quantity as the engine's hfRatio, at a *physical* scale so a 4 µm/px macro and a 12 µm/px eye compare;
- `focus` = the same band energy relative to the band energy at 90–270 µm: a soft iris keeps its coarse
  structure but loses the fine band, so this falls when the focal plane misses the iris;
- `lashFocus` = band energy on the lashes over the iris's: > 1 means the focal plane sits on the lid.

Output: JSON + CSV next to the dataset (research data stays out of the git repo). No images are copied.
"""
import cv2, glob, json, os, sys
import numpy as np

ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def band(gray, um_per_px, lo_um, hi_um):
    # DoG between Gaussians whose σ correspond to the band edges (σ ≈ wavelength / 2π · 2)
    s1 = max(0.5, lo_um / um_per_px / 3.0)
    s2 = max(s1 * 1.5, hi_um / um_per_px / 3.0)
    return cv2.GaussianBlur(gray, (0, 0), s1) - cv2.GaussianBlur(gray, (0, 0), s2)


def measure(gray, region, diam_px, lash=None):
    um = 12000.0 / diam_px
    k = max(3, int(0.04 * diam_px) | 1)
    region = cv2.erode(region, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    m = region > 0
    if m.sum() < 1000:
        return None
    mean = float(gray[m].mean())
    fine = band(gray, um, 30, 90)
    coarse = band(gray, um, 90, 270)
    sf, sc = float(fine[m].std()), float(coarse[m].std())
    out = {'umPerPx': round(um, 2), 'diamPx': int(diam_px), 'strand': round(sf / max(mean, 1e-3), 4),
           'focus': round(sf / max(sc, 1e-6), 3), 'irisPx': int(m.sum()), 'meanL': round(mean * 255, 1)}
    if lash is not None:
        lm = lash > 0
        if lm.sum() > 500:
            out['lashFocus'] = round(float(fine[lm].std()) / max(sf, 1e-6), 2)
    return out


def sbvpi(root):
    rows = []
    for mask_path in sorted(glob.glob(os.path.join(root, '*', '*_iris.png'))):
        stem = mask_path[:-len('_iris.png')]
        jpg = stem + '.jpg'
        if not os.path.exists(jpg):
            continue
        img = cv2.imread(jpg, cv2.IMREAD_GRAYSCALE)
        iris = cv2.imread(mask_path, cv2.IMREAD_GRAYSCALE)
        if img is None or iris is None or img.shape != iris.shape:
            continue
        region = (iris > 127).astype(np.uint8)
        for extra in ('_pupil.png', '_eyelashes.png'):
            p = cv2.imread(stem + extra, cv2.IMREAD_GRAYSCALE)
            if p is not None and p.shape == region.shape:
                region[p > 127] = 0
        lash = cv2.imread(stem + '_eyelashes.png', cv2.IMREAD_GRAYSCALE)
        ys, xs = np.nonzero(iris > 127)
        diam = float(xs.max() - xs.min())                   # horizontal extent: the lids crop the vertical one
        visible = float(len(xs)) / (np.pi * (diam / 2) ** 2)
        r = measure(img.astype(np.float32) / 255.0, region, diam, lash)
        if not r:
            continue
        name = os.path.basename(stem)
        r.update(id=name, file=os.path.relpath(jpg, root), gaze={'s': 'straight', 'l': 'left', 'r': 'right', 'u': 'up'}.get(name.split('_')[1], '?'),
                 visible=round(visible, 3), size=list(img.shape[::-1]))
        rows.append(r)
        if len(rows) % 100 == 0:
            print(f'  {len(rows)} measured', flush=True)
    return rows


def ours():
    cases = json.load(open(os.path.join(ENG, 'ref', 'cases.json')))
    rows = []
    for f, c in sorted(cases.items()):
        if 'isolated' not in f:
            continue
        img = cv2.imread(os.path.join(ENG, 'ref', f), cv2.IMREAD_GRAYSCALE)
        if img is None:
            continue
        H, W = img.shape
        (px, py, pr), (lx, ly, lrx, lry, la) = c['align']['pupil'], c['align']['limbus']
        region = np.zeros_like(img, np.uint8)
        cv2.ellipse(region, (int(lx * W), int(ly * H)), (int(lrx * H), int(lry * H)), np.degrees(la), 0, 360, 1, -1)
        cv2.circle(region, (int(px * W), int(py * H)), int(pr * H * 1.1), 0, -1)
        r = measure(img.astype(np.float32) / 255.0, region, 2 * lrx * H)
        r.update(id='ref' + f[:2], file=f, gaze='straight', visible=1.0, size=[W, H])
        rows.append(r)
    return rows


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else '/Users/iori/Desktop/code/iris/SBVPI'
    ref = ours()
    print('our isolated macros:')
    for r in ref:
        print(f"  {r['id']}: {r['umPerPx']} µm/px  strand {r['strand']}  focus {r['focus']}")
    rows = sbvpi(root)
    rows.sort(key=lambda r: -r['strand'])
    out_dir = os.path.dirname(root.rstrip('/'))
    json.dump({'reference': ref, 'sbvpi': rows}, open(os.path.join(out_dir, 'iris_sharpness.json'), 'w'), indent=1)
    keys = ['id', 'gaze', 'diamPx', 'umPerPx', 'strand', 'focus', 'lashFocus', 'visible', 'meanL', 'file']
    with open(os.path.join(out_dir, 'iris_sharpness.csv'), 'w') as fh:
        fh.write(','.join(keys) + '\n')
        for r in ref + rows:
            fh.write(','.join(str(r.get(k, '')) for k in keys) + '\n')
    s = np.array([r['strand'] for r in rows]); fo = np.array([r['focus'] for r in rows])
    print(f'\nSBVPI: {len(rows)} irises measured')
    print(f'  strand  median {np.median(s):.4f}  p90 {np.percentile(s, 90):.4f}  max {s.max():.4f}')
    print(f'  focus   median {np.median(fo):.3f}  p90 {np.percentile(fo, 90):.3f}')
    lf = [r['lashFocus'] for r in rows if 'lashFocus' in r]
    if lf:
        print(f'  lashes sharper than iris in {sum(x > 1 for x in lf)} of {len(lf)}')
    worst_ref = min(r['strand'] for r in ref)
    print(f'  SBVPI irises with at least the weakest macro\'s strand detail ({worst_ref}): {int((s >= worst_ref).sum())}')
    print('top 15:')
    for r in rows[:15]:
        print(f"  {r['id']:12s} {r['gaze']:8s} {r['diamPx']:5d}px  strand {r['strand']:.4f}  focus {r['focus']:.3f}  lash {r.get('lashFocus', '-')}  visible {r['visible']}")


if __name__ == '__main__':
    main()
