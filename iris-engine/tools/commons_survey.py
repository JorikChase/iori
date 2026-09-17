#!/usr/bin/env python3
"""Survey Wikimedia Commons for isolated-iris photographs (iris on a black or white ground).

    python3 iris-engine/tools/commons_survey.py            # → iris-engine/ref/survey-isolated.json

Candidates come from three sources: the uploaders who made the isolated macros we already use, the
human-iris category trees, and full-text searches in several languages. Each file is kept only if its
licence is CC0 / public domain / CC BY / CC BY-SA (read from the Commons API `extmetadata`, not from the
description text), it is a JPEG or PNG of at least 1600 px on the long side, and it is not already in
ref/refs.json. Nothing is downloaded here: the output lists URLs and a 400 px thumbnail per file, and the
"is it isolated" check runs on those thumbnails in the browser (survey.html).

Requests are sequential with a User-Agent and a pause — Commons rate-limits parallel clients.
"""
import json, os, re, sys, time, urllib.parse, urllib.request

API = 'https://commons.wikimedia.org/w/api.php'
UA = 'iori-iris-engine-survey/1.0 (https://iori.me; jorik reference survey)'
ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ENG, 'ref', 'survey-isolated.json')

UPLOADERS = ['Lizapopova143', 'Osmo Lundell']
CATEGORIES = ['Category:Human irises', 'Category:Close-up photographs of human eyes', 'Category:Iris (anatomy)',
              'Category:Macro photographs of human eyes', 'Category:Iris photography', 'Category:Human eyes',
              'Category:Heterochromia iridum', 'Category:Blue eyes', 'Category:Green eyes', 'Category:Brown eyes',
              'Category:Hazel eyes', 'Category:Grey eyes', 'Category:Amber eyes']
SEARCHES = ['iris macro', 'human iris macro', 'iris black background', 'iris white background', 'isolated iris',
            'iris close-up', 'iris texture', 'iris photography', 'eye iris macro', 'iris crypts', 'iris of human',
            'Regenbogenhaut', 'Iris Auge Makro', 'iris humain', 'iris oeil macro', 'радужная оболочка', 'радужка глаза',
            'iride occhio', 'iris ojo macro', 'tęczówka', 'iris oog', '虹彩', 'eye macro photography', 'iris art']
LICENCE_OK = re.compile(r'^(cc0|public domain|pd|cc[- ]by(-sa)?[- ]\d)', re.I)


def api(**params):
    params.update(format='json', formatversion='2')
    url = API + '?' + urllib.parse.urlencode(params)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=30) as r:
                return json.load(r)
        except Exception as e:
            time.sleep(2 + 3 * attempt)
            err = e
    raise err


def paged(**params):
    cont = {}
    while True:
        d = api(**params, **cont)
        yield d
        if 'continue' not in d:
            return
        cont = d['continue']
        time.sleep(0.4)


def collect():
    titles, why = set(), {}
    def add(t, src):
        if t.startswith('File:'):
            titles.add(t); why.setdefault(t, set()).add(src)
    for u in UPLOADERS:
        for d in paged(action='query', list='allimages', aiuser=u, aisort='timestamp', ailimit=500):
            for im in d['query']['allimages']:
                add(im['title'], 'uploader:' + u)
        print(f'  uploader {u}: {len(titles)} so far', flush=True)
    seen_cats, queue = set(), [(c, 0) for c in CATEGORIES]
    while queue:
        cat, depth = queue.pop(0)
        if cat in seen_cats:
            continue
        seen_cats.add(cat)
        try:
            for d in paged(action='query', list='categorymembers', cmtitle=cat, cmlimit=500, cmtype='file|subcat'):
                for m in d['query']['categorymembers']:
                    if m['title'].startswith('Category:'):
                        if depth < 1 and re.search(r'iris|irides|eye|heterochrom', m['title'], re.I):
                            queue.append((m['title'], depth + 1))
                    else:
                        add(m['title'], cat)
        except Exception as e:
            print('  ! category', cat, e)
        time.sleep(0.3)
    print(f'  categories ({len(seen_cats)} visited): {len(titles)} so far', flush=True)
    for q in SEARCHES:
        try:
            d = api(action='query', list='search', srsearch=q, srnamespace=6, srlimit=200)
            for m in d['query']['search']:
                add(m['title'], 'search:' + q)
        except Exception as e:
            print('  ! search', q, e)
        time.sleep(0.3)
    print(f'  searches: {len(titles)} candidates', flush=True)
    return titles, why


def describe(titles):
    out, titles = [], sorted(titles)
    for i in range(0, len(titles), 50):
        d = api(action='query', titles='|'.join(titles[i:i + 50]), prop='imageinfo',
                iiprop='url|size|mime|extmetadata', iiurlwidth=400)
        for p in d['query']['pages']:
            ii = (p.get('imageinfo') or [None])[0]
            if not ii:
                continue
            md = ii.get('extmetadata', {})
            val = lambda k: re.sub(r'<[^>]+>', '', (md.get(k) or {}).get('value', '')).strip()
            out.append({'title': p['title'], 'width': ii['width'], 'height': ii['height'], 'mime': ii['mime'],
                        'url': ii['url'], 'thumb': ii.get('thumburl'), 'page': ii.get('descriptionurl'),
                        'license': val('LicenseShortName'), 'author': val('Artist')[:120],
                        'desc': val('ImageDescription')[:240], 'bytes': ii.get('size')})
        time.sleep(0.4)
    return out


def main():
    have = {r['commons'] for r in json.load(open(os.path.join(ENG, 'ref', 'refs.json')))}
    titles, why = collect()
    rows = describe(titles)
    keep = []
    for r in rows:
        name = r['title'][5:]
        r['sources'] = sorted(why.get(r['title'], []))
        r['alreadyInRefs'] = name in have
        r['licenceOk'] = bool(LICENCE_OK.match(r['license'] or ''))
        r['bigEnough'] = max(r['width'], r['height']) >= 1600
        r['imageType'] = r['mime'] in ('image/jpeg', 'image/png')
        if r['licenceOk'] and r['bigEnough'] and r['imageType']:
            keep.append(r)
    keep.sort(key=lambda r: (not any(s.startswith('uploader:') for s in r['sources']), -max(r['width'], r['height'])))
    json.dump({'date': time.strftime('%Y-%m-%d'), 'candidates': len(rows), 'kept': keep}, open(OUT, 'w'), indent=1)
    print(f'{len(rows)} files described, {len(keep)} pass licence/size/type '
          f'({sum(r["alreadyInRefs"] for r in keep)} already in refs) → {OUT}')


if __name__ == '__main__':
    main()
