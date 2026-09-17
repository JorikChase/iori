#!/usr/bin/env python3
"""Second pass over ref/survey-isolated.json: which candidates are an iris on a plain black or white ground?

    /usr/bin/python3 iris-engine/tools/commons_isolated.py

Title/description filter first (the genus Iris is a flower, and "iris macro" returns hundreds of them),
then each remaining 330 px thumbnail (a size Commons pre-renders; 400 px is rendered on demand and
throttled to ~5 s a request) is fetched into memory — nothing is written to disk — and scored:
  ground   = share of the outer 8 % border that is near-black (V < 35) or near-white (V > 220, S < 40)
  plain    = 1 − normalised std of that border (a flat ground, not a dark face)
  eye      = a dark roughly round blob (the pupil) near the centre, inside a coloured ring
Sequential, User-Agent, 0.25 s apart: Commons rate-limits parallel clients.
"""
import json, os, re, time, urllib.request
import cv2
import numpy as np

ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ENG, 'ref', 'survey-isolated.json')
UA = 'iori-iris-engine-survey/1.0 (https://iori.me; reference survey)'
NOT_EYE = re.compile(r'\b(flower|flowers|blossom|bloom|plant|garden|germanica|sibirica|pallida|reticulata|pseudacorus|'
                     r'versicolor|ensata|laevigata|xiphium|hollandica|tectorum|pumila|foetidissima|missouriensis|'
                     r'setosa|virginica|spuria|douglasiana|bearded|iridaceae|petal|bulb|cultivar|rhizome|'
                     r'cat|cats|dog|dogs|horse|bird|owl|eagle|fish|frog|lizard|snake|reptile|insect|spider|fly|'
                     r'goat|sheep|cow|lion|tiger|wolf|fox|lemur|monkey|gecko|chameleon|crocodile|octopus|'
                     r'painting|drawing|diagram|illustration|logo|icon|svg|map|coat of arms|stamp|statue|sculpture|'
                     r'nebula|galaxy|satellite|diaphragm|aperture|lens|camera)\b', re.I)


def fetch(url):
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=30) as r:
                return r.read()
        except Exception:
            time.sleep(2 + 3 * attempt)
    return None


def score(buf):
    img = cv2.imdecode(np.frombuffer(buf, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        return None
    h, w = img.shape[:2]
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    b = max(3, int(0.08 * min(h, w)))
    border = np.concatenate([hsv[:b].reshape(-1, 3), hsv[-b:].reshape(-1, 3), hsv[:, :b].reshape(-1, 3), hsv[:, -b:].reshape(-1, 3)])
    V, S = border[:, 2].astype(float), border[:, 1].astype(float)
    black, white = float((V < 35).mean()), float(((V > 220) & (S < 40)).mean())
    plain = float(1.0 - min(1.0, V.std() / 60.0))
    # an eye: the darkest compact blob near the centre, with more saturated / brighter tissue around it
    g = cv2.GaussianBlur(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), (0, 0), 2)
    cy, cx = h // 2, w // 2
    core = g[int(h * .25):int(h * .75), int(w * .25):int(w * .75)]
    thr = np.percentile(core, 6)
    mask = (g <= thr).astype(np.uint8)
    n, lab, stats, cent = cv2.connectedComponentsWithStats(mask)
    eye = 0.0
    for i in range(1, n):
        x, y, ww, hh, a = stats[i]
        if a < 0.002 * h * w:
            continue
        fill = a / max(1, ww * hh)
        ar = min(ww, hh) / max(ww, hh)
        near = 1 - min(1, np.hypot(cent[i][0] - cx, cent[i][1] - cy) / (0.35 * min(h, w)))
        eye = max(eye, fill * ar * near)
    return {'black': round(black, 3), 'white': round(white, 3), 'plain': round(plain, 3), 'eye': round(float(eye), 3)}


def main():
    d = json.load(open(SRC))
    rows = [r for r in d['kept'] if not r['alreadyInRefs'] and not NOT_EYE.search(r['title'] + ' ' + (r['desc'] or ''))]
    print(f"{len(d['kept'])} candidates, {len(rows)} after the title/description filter", flush=True)
    for i, r in enumerate(rows):
        buf = fetch(re.sub(r'/400px-', '/330px-', r['thumb'])) if r.get('thumb') else None
        r['iso'] = score(buf) if buf else None
        if (i + 1) % 50 == 0:
            print(f'  {i + 1}/{len(rows)}  {time.strftime("%H:%M:%S")}', flush=True)
        time.sleep(0.25)
    for r in rows:
        s = r.get('iso')
        r['isoScore'] = round(max(s['black'], s['white']) * s['plain'] * (0.4 + s['eye']), 3) if s else 0
    rows.sort(key=lambda r: -r['isoScore'])
    d['screened'] = rows
    json.dump(d, open(SRC, 'w'), indent=1)
    print('top 40:')
    for r in rows[:40]:
        s = r['iso']
        print(f"  {r['isoScore']:.3f}  bk {s['black']:.2f} wh {s['white']:.2f} plain {s['plain']:.2f} eye {s['eye']:.2f}  "
              f"{r['width']}x{r['height']}  {r['license']:12s} {r['title'][5:70]}")


if __name__ == '__main__':
    main()
