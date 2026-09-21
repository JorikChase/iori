#!/usr/bin/env python3
"""Seal a version of the petri engine: source + the bench rows that were measured on it.

Same contract as iris-engine/versions/snapshot.py. A version is immutable once sealed, because every
number in the scorecard is only meaningful next to the exact source that produced it.

    python3 petri/versions/snapshot.py v1-p1a --note "ten kernels, 93 organisms" --features agents=1
    python3 petri/versions/snapshot.py --list
"""
import argparse, gzip, hashlib, json, os, shutil, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = ['index.html', 'engine.js', 'kernels.js', 'catalog.js', 'render.js', 'ui.js', 'ui.css',
       'harness.js', 'metrics.js', 'graph.js', 'tero.js', 'graphworker.js', 'serve.py']
INDEX = os.path.join(HERE, 'index.json')


def load_index():
    if os.path.exists(INDEX):
        with open(INDEX) as f:
            return json.load(f)
    return {'versions': []}


def summarise(bench):
    """Pull the scorecard row out of a bench file, whatever tiers it happens to carry."""
    out = {'pass': bench.get('pass'), 'quality': bench.get('quality'), 'n': bench.get('n')}
    t0 = bench.get('T0', {})
    out['T0'] = {k: bool(v.get('pass')) for k, v in t0.items()}
    out['T0_passed'] = sum(1 for v in out['T0'].values() if v)
    out['T0_total'] = len(out['T0'])
    for tier in ('T1', 'T2'):
        t = bench.get(tier, {})
        out[tier] = {k: bool(v.get('pass')) for k, v in t.items()}
        out[tier + '_passed'] = sum(1 for v in out[tier].values() if v)
        out[tier + '_total'] = len(out[tier])
    for key, path in (('boxD_dla', ('T1', 'dlaDimension', 'boxD')),
                      ('beta_eden', ('T1', 'edenRoughness', 'beta')),
                      ('ms_per_step', ('T4', 'stepCost', 'msPerStep')),
                      ('agents', ('T4', 'stepCost', 'agents'))):
        cur = bench
        for p in path:
            cur = cur.get(p, {}) if isinstance(cur, dict) else None
            if cur is None:
                break
        if isinstance(cur, (int, float)):
            out[key] = cur
    if bench.get('gpuErrors'):
        out['gpuErrors'] = len(bench['gpuErrors'])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('id', nargs='?')
    ap.add_argument('--note', default='')
    ap.add_argument('--features', nargs='*', default=[])
    ap.add_argument('--bench', default=None, help='bench json to seal (default: newest in petri/ref/)')
    ap.add_argument('--list', action='store_true')
    a = ap.parse_args()

    idx = load_index()
    if a.list or not a.id:
        for v in idx['versions']:
            s = v.get('summary', {})
            print(f"{v['id']:<24} {v['when'][:16]}  T0 {s.get('T0_passed', '-')}/{s.get('T0_total', '-')}"
                  f"  T1 {s.get('T1_passed', '-')}/{s.get('T1_total', '-')}"
                  f"  {s.get('ms_per_step', float('nan')):.2f} ms  {v.get('note', '')}")
        return

    dest = os.path.join(HERE, a.id)
    if os.path.exists(dest):
        sys.exit(f'{a.id} already sealed — versions are immutable, pick a new id')
    os.makedirs(os.path.join(dest, 'src'))

    digest = hashlib.sha256()
    for name in SRC:
        p = os.path.join(ROOT, name)
        if not os.path.exists(p):
            print(f'  warn: {name} missing')
            continue
        shutil.copy2(p, os.path.join(dest, 'src', name))
        with open(p, 'rb') as f:
            digest.update(f.read())

    bench_path = a.bench
    if not bench_path:
        refs = [os.path.join(ROOT, 'ref', f) for f in os.listdir(os.path.join(ROOT, 'ref'))
                if f.startswith('bench-') and f.endswith('.json')] if os.path.isdir(os.path.join(ROOT, 'ref')) else []
        bench_path = max(refs, key=os.path.getmtime) if refs else None
    summary = {}
    if bench_path and os.path.exists(bench_path):
        with open(bench_path) as f:
            bench = json.load(f)
        summary = summarise(bench)
        os.makedirs(os.path.join(dest, 'bench'), exist_ok=True)
        with gzip.open(os.path.join(dest, 'bench', os.path.basename(bench_path) + '.gz'), 'wt') as f:
            json.dump(bench, f)
    else:
        print('  warn: no bench file — sealing source only')

    feats = dict(kv.split('=', 1) for kv in a.features if '=' in kv)
    entry = {'id': a.id, 'when': time.strftime('%Y-%m-%dT%H:%M:%S'), 'note': a.note,
             'features': feats, 'src_sha256': digest.hexdigest()[:16],
             'bench': os.path.basename(bench_path) if bench_path else None, 'summary': summary}
    with open(os.path.join(dest, 'manifest.json'), 'w') as f:
        json.dump(entry, f, indent=1)
    idx['versions'] = [v for v in idx['versions'] if v['id'] != a.id] + [entry]
    with open(INDEX, 'w') as f:
        json.dump(idx, f, indent=1)
    print(f"sealed {a.id}: {len(SRC)} source files, bench {entry['bench']}, "
          f"T0 {summary.get('T0_passed', '-')}/{summary.get('T0_total', '-')}, "
          f"T1 {summary.get('T1_passed', '-')}/{summary.get('T1_total', '-')}")


if __name__ == '__main__':
    main()
