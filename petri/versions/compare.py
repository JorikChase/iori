#!/usr/bin/env python3
"""The scorecard across sealed versions (study/05 §8). Same contract as iris-engine/versions/compare.py.

    python3 petri/versions/compare.py                 # every version, one row each
    python3 petri/versions/compare.py --diff v1 v2    # what moved between two
"""
import argparse, gzip, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
UP, DOWN, SAME = '↑', '↓', ' '
# metric -> (label, better direction, tolerance for "unchanged")
METRICS = [
    ('T0_passed', 'T0', +1, 0),
    ('T1_passed', 'T1', +1, 0),
    ('boxD_dla', 'DLA D', 0, 0.02),          # 0 = closer to target is better
    ('beta_eden', 'Eden b', 0, 0.02),
    ('ms_per_step', 'ms/step', -1, 0.05),
    ('agents', 'agents', +1, 1000),
]
TARGET = {'boxD_dla': 1.71, 'beta_eden': 1 / 3}


def index():
    p = os.path.join(HERE, 'index.json')
    return json.load(open(p))['versions'] if os.path.exists(p) else []


def bench_of(vid):
    d = os.path.join(HERE, vid, 'bench')
    if not os.path.isdir(d):
        return None
    for f in sorted(os.listdir(d)):
        if f.endswith('.gz'):
            with gzip.open(os.path.join(d, f), 'rt') as fh:
                return json.load(fh)
    return None


def arrow(key, a, b):
    if a is None or b is None:
        return SAME
    _, _, better, tol = next(m for m in METRICS if m[0] == key)
    if key in TARGET:
        da, db = abs(a - TARGET[key]), abs(b - TARGET[key])
        if abs(db - da) <= tol:
            return SAME
        return UP if db < da else DOWN
    if abs(b - a) <= tol:
        return SAME
    if better == 0:
        return SAME
    return UP if (b - a) * better > 0 else DOWN


def table(vs):
    cols = [m[1] for m in METRICS]
    print(f"{'version':<24} {'when':<17} " + ' '.join(f'{c:>9}' for c in cols) + '  note')
    prev = None
    for v in vs:
        s = v.get('summary', {})
        cells = []
        for key, _, _, _ in METRICS:
            cur = s.get(key)
            if cur is None:
                cells.append(f'{"-":>9}')
                continue
            a = arrow(key, (prev or {}).get(key), cur) if prev else SAME
            txt = f'{cur:.3f}' if isinstance(cur, float) and abs(cur) < 100 else f'{cur:g}'
            if key in ('T0_passed', 'T1_passed'):
                txt = f"{cur}/{s.get(key.replace('passed', 'total'), '?')}"
            cells.append(f'{txt + a:>9}')
        print(f"{v['id']:<24} {v['when'][:16]:<17} " + ' '.join(cells) + '  ' + v.get('note', ''))
        prev = s


def diff(a, b):
    va = next((v for v in index() if v['id'] == a), None)
    vb = next((v for v in index() if v['id'] == b), None)
    if not va or not vb:
        return print('unknown version')
    print(f'{a}  ->  {b}\n')
    for key, label, _, _ in METRICS:
        x, y = va['summary'].get(key), vb['summary'].get(key)
        if x is None and y is None:
            continue
        print(f'  {label:<10} {x!s:>10}  ->  {y!s:<10} {arrow(key, x, y)}')
    for tier in ('T0', 'T1'):
        ta, tb = va['summary'].get(tier, {}), vb['summary'].get(tier, {})
        for k in sorted(set(ta) | set(tb)):
            if ta.get(k) != tb.get(k):
                print(f'  {tier} {k:<22} {ta.get(k)} -> {tb.get(k)}')
    fa, fb = va.get('features', {}), vb.get('features', {})
    for k in sorted(set(fa) | set(fb)):
        if fa.get(k) != fb.get(k):
            print(f'  feature {k:<18} {fa.get(k)} -> {fb.get(k)}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--diff', nargs=2)
    a = ap.parse_args()
    vs = index()
    if not vs:
        return print('no versions sealed yet — run snapshot.py')
    if a.diff:
        diff(*a.diff)
    else:
        table(vs)


if __name__ == '__main__':
    main()
