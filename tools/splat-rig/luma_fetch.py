#!/usr/bin/env python3
"""Fetch Luma public capture metadata for every scene in splat-work/luma/captures.json.

Saves, per scene, under splat-work/luma/<name>/:
  public.json                 the /api/v3/captures/<uuid>/public response
  camera_params.json          with_background_gs_camera_params (Luma's orbit + intrinsics)
  *_meta.json / small blobs   gs_web_meta, gs_compressed_meta, semantics, skybox, thumb (small artifacts only)
Big artifacts (ply zips, mp4, luma) are listed in public.json but not downloaded.
"""
import json, os, sys, urllib.request, re
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'splat-work', 'luma')
caps = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'captures.json')))  # tracked: name -> Luma capture uuid
API = 'https://webapp.engineeringlumalabs.com/api/v3/captures/{}/public'
SMALL = re.compile(r'(camera_params|meta|semantics|skybox|thumb|preview|initial|json)', re.I)
BIG = re.compile(r'(\.zip|\.mp4|\.luma|\.ply$|light_field|\.bin)', re.I)
def get(url, binary=False):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read() if binary else r.read().decode('utf-8', 'replace')
only = sys.argv[1:] or list(caps)
for name in only:
    uid = caps[name]; d = os.path.join(ROOT, name); os.makedirs(d, exist_ok=True)
    try:
        pub = get(API.format(uid))
    except Exception as e:
        print(f'{name:14s} FAIL public: {e}'); continue
    open(os.path.join(d, 'public.json'), 'w').write(pub)
    j = json.loads(pub)
    arts = (j.get('response') or j).get('artifacts') or ((j.get('response') or j).get('latestRun') or {}).get('artifacts') or []
    types = [a.get('type') for a in arts]
    got = []
    for a in arts:
        t, u = a.get('type', ''), a.get('url', '')
        if not u or BIG.search(u) and not SMALL.search(t): continue
        if not SMALL.search(t): continue
        ext = os.path.splitext(u.split('?')[0])[1] or '.bin'
        fn = 'camera_params.json' if 'camera_params' in t else (t + ext if not t.endswith(ext) else t)
        try:
            data = get(u, binary=True)
            if len(data) > 8_000_000: continue
            open(os.path.join(d, fn), 'wb').write(data); got.append(f'{fn}({len(data)//1024}k)')
        except Exception as e:
            got.append(f'{t}:ERR')
    print(f'{name:14s} artifacts={len(arts)} saved: {", ".join(got)}')
    open(os.path.join(d, 'artifact_types.txt'), 'w').write('\n'.join(types))
