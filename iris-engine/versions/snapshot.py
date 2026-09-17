#!/usr/bin/env python3
"""Snapshot one engine version: source + bench statistics + fitted cases, into versions/<id>/.

    python3 iris-engine/versions/snapshot.py v62-e1e2 --note "E1 layers + E2 MATCH2 baseline"
    python3 iris-engine/versions/snapshot.py v63-diag --bench ref/bench-iso-v63.json

Source files are copied verbatim (≈ 370 KB), cases.json is gzipped (1.5 MB → ≈ 300 KB), bench rows
are copied as-is and summarised into the manifest so compare.py never has to reparse them.
Everything here is a pure copy: taking a snapshot never touches the working tree.
"""
import argparse, gzip, hashlib, json, os, re, shutil, sys, datetime

ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # iris-engine/
VDIR = os.path.join(ENG, 'versions')
SRC = ['index.html', 'fit.js', 'ui.js', 'design.js', 'serve.py']
# every numeric column a bench row may carry; the mean is taken over the rows that have it
METRICS = ['match2', 'match', 'ssim', 'ssim2', 'grad', 'hcorr', 'sigmaRatio', 'sigmaPhoto', 'sigmaRender',
           'specAgree', 'hfRatio', 'hfPhoto', 'hfRender', 'hfLap', 'strandCorr', 'resolvedMm', 'spacingRatio', 'coverage', 'vmaxMin', 'darkErr', 'darkThr', 'bandWorst',
           'contrastRender', 'contrastPhoto', 'ridgeGapRender', 'ridgeGapPhoto',
           'psnr', 'dL', 'dab', 'match0', 'alignPx', 'secs', 'splats', 'ridges', 'crypts']


def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for b in iter(lambda: f.read(1 << 16), b''):
            h.update(b)
    return h.hexdigest()[:16]


def engine_version():
    m = re.search(r"ENGINE_VERSION\s*=\s*'([^']+)'", open(os.path.join(ENG, 'index.html'), encoding='utf-8').read())
    return m.group(1) if m else '?'


def summarise(rows):
    """mean of every metric present, plus the per-case table, plus per-metric best/worst case."""
    ok = [r for r in rows if not r.get('error')]
    out = {'n': len(ok), 'mean': {}, 'cases': {}}
    for m in METRICS:
        vals = [r[m] for r in ok if isinstance(r.get(m), (int, float))]
        if vals:
            out['mean'][m] = round(sum(vals) / len(vals), 4)
    for r in ok:
        key = r['file'].split('-')[0]
        out['cases'][key] = {m: r[m] for m in METRICS if isinstance(r.get(m), (int, float))}
    return out


def latest_bench():
    """the most recently modified ref/bench-*.json — what a fresh BENCH ISO just wrote."""
    d = os.path.join(ENG, 'ref')
    c = [os.path.join(d, f) for f in os.listdir(d) if f.startswith('bench-') and f.endswith('.json')]
    return [max(c, key=os.path.getmtime)] if c else []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('id', help='version id, e.g. v63-contrast')
    ap.add_argument('--note', default='', help='one line: what changed in this version')
    ap.add_argument('--bench', nargs='*', help='bench json paths (default: the newest ref/bench-*.json)')
    ap.add_argument('--features', nargs='*', default=[], help='feature flags active in this version, key=value')
    ap.add_argument('--force', action='store_true', help='overwrite an existing snapshot')
    a = ap.parse_args()

    out = os.path.join(VDIR, a.id)
    # a folder holding only bench/ is the normal case: benchIsolated({ ver }) writes there first.
    # Refuse only to overwrite a version that has already been sealed.
    if os.path.exists(os.path.join(out, 'manifest.json')) and not a.force:
        sys.exit(f'{a.id} is already sealed — pass --force to overwrite')
    os.makedirs(os.path.join(out, 'src'), exist_ok=True)
    os.makedirs(os.path.join(out, 'bench'), exist_ok=True)

    files = {}
    for f in SRC:
        p = os.path.join(ENG, f)
        if not os.path.exists(p):
            continue
        shutil.copy2(p, os.path.join(out, 'src', f))
        files[f] = {'sha256': sha(p), 'bytes': os.path.getsize(p)}

    # bench sources: what was asked for, plus anything the engine already wrote into this version's
    # own bench/ directory (benchIsolated({ ver }) posts there through serve.py)
    sources = list(a.bench) if a.bench else []
    own = os.path.join(out, 'bench')
    sources += [os.path.join(own, f) for f in sorted(os.listdir(own)) if f.endswith('.json')]
    if not sources:
        sources = latest_bench()
    benches, rows, seen = {}, [], set()
    for b in sources:
        p = b if os.path.isabs(b) else os.path.join(ENG, b)
        if not os.path.exists(p):
            print('  ! missing bench', p); continue
        name = os.path.basename(p)
        if name in seen:
            continue
        seen.add(name)
        dst = os.path.join(out, 'bench', name)
        if os.path.abspath(p) != os.path.abspath(dst):
            shutil.copy2(p, dst)
        r = json.load(open(p))
        benches[name] = summarise(r)
        rows += r

    cases = os.path.join(ENG, 'ref', 'cases.json')
    if os.path.exists(cases):
        with open(cases, 'rb') as fi, gzip.open(os.path.join(out, 'cases.json.gz'), 'wb') as fo:
            shutil.copyfileobj(fi, fo)

    man = {
        'id': a.id,
        'date': datetime.datetime.now().isoformat(timespec='seconds'),
        'engine': engine_version(),
        'note': a.note,
        'features': dict(kv.split('=', 1) for kv in a.features) if a.features else {},
        'src': files,
        'bench': benches,
        'summary': summarise(rows) if rows else None,
    }
    json.dump(man, open(os.path.join(out, 'manifest.json'), 'w'), indent=1)

    idx = os.path.join(VDIR, 'index.json')
    reg = json.load(open(idx)) if os.path.exists(idx) else []
    reg = [e for e in reg if e['id'] != a.id]
    reg.append({k: man[k] for k in ('id', 'date', 'engine', 'note')} |
               {'mean': (man['summary'] or {}).get('mean', {})})
    reg.sort(key=lambda e: e['date'])
    json.dump(reg, open(idx, 'w'), indent=1)

    s = (man['summary'] or {}).get('mean', {})
    print(f"snapshot {a.id} · engine {man['engine']} · {len(files)} src files · {len(benches)} bench files")
    if s:
        print('  ' + ' · '.join(f'{k} {v}' for k, v in list(s.items())[:8]))
    print('  →', out)


if __name__ == '__main__':
    main()
