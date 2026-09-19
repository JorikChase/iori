#!/usr/bin/env python3
"""Compare engine versions: which numbers moved, and which case each change helped or hurt.

    python3 iris-engine/versions/compare.py                  # mean table, every version, newest last
    python3 iris-engine/versions/compare.py --cases          # per-case MATCH2, one row per version
    python3 iris-engine/versions/compare.py --metric ssim2   # per-case table for one metric
    python3 iris-engine/versions/compare.py --diff v62 v63   # every metric, side by side, with Δ

"Which feature fit best" is read off the per-metric deltas: a contrast change should move sigmaRatio
and ssim2, a relief change hcorr, a colour change dab. A version that moves match2 without moving any
diagnostic moved the optimiser, not the engine.
"""
import argparse, json, os, sys

VDIR = os.path.dirname(os.path.abspath(__file__))
# column: (key, width, decimals, higher-is-better) — None = no direction (diagnostic only)
COLS = [('match2', 7, 1, True), ('match', 6, 1, True), ('ssim', 6, 3, True), ('ssim2', 6, 3, True),
        ('grad', 6, 3, True), ('hcorr', 6, 3, True), ('sigmaRatio', 7, 3, None), ('specAgree', 7, 3, True),
        ('hfRatio', 7, 3, None), ('strandCorr', 10, 3, True), ('spacingRatio', 7, 3, None), ('darkErr', 7, 1, False),
        ('dab', 5, 1, False), ('cellDab', 8, 2, False), ('secs', 6, 1, False)]


def load():
    out = []
    for d in sorted(os.listdir(VDIR)):
        p = os.path.join(VDIR, d, 'manifest.json')
        if os.path.isfile(p):
            out.append(json.load(open(p)))
    out.sort(key=lambda m: m['date'])
    return out


def fmt(v, w, dec):
    return ('—'.rjust(w) if v is None else f'{v:{w}.{dec}f}')


def arrow(cur, prev, better):
    if prev is None or cur is None or better is None or abs(cur - prev) < 1e-9:
        return '   '
    up = cur > prev
    good = up == better
    return ('  ↑' if up else '  ↓') if good else ('  ↑' if up else '  ↓')


def table_means(mans, show_delta=True):
    W = {k: max(len(k), w) for k, w, _, _ in COLS}       # a name wider than its numbers sets the column
    head = 'version'.ljust(18) + ''.join(k.rjust(W[k] + 3) for k, w, _, _ in COLS)
    print(head); print('-' * len(head))
    prev = {}
    for m in mans:
        s = (m.get('summary') or {}).get('mean', {})
        line = m['id'].ljust(18)
        for k, w, dec, better in COLS:
            v = s.get(k)
            line += fmt(v, W[k], dec) + (arrow(v, prev.get(k), better) if show_delta else '   ')
        print(line)
        prev = s
    print()
    for m in mans:
        if m.get('note'):
            print(f"  {m['id']}: {m['note']}")


def table_cases(mans, metric):
    keys = sorted({k for m in mans for k in (m.get('summary') or {}).get('cases', {})})
    head = 'version'.ljust(18) + ''.join(k.rjust(14) for k in keys) + 'mean'.rjust(10)
    print(f'[{metric}]'); print(head); print('-' * len(head))
    prev = {}
    for m in mans:
        summ = m.get('summary') or {}
        cs, line = summ.get('cases', {}), m['id'].ljust(18)
        for k in keys:
            v = cs.get(k, {}).get(metric)
            d = None if prev.get(k) is None or v is None else v - prev[k]
            line += (('—' if v is None else f'{v:.2f}') + ('' if not d else f' {d:+.2f}')).rjust(14)
            prev[k] = v
        mv = summ.get('mean', {}).get(metric)
        line += ('—' if mv is None else f'{mv:.2f}').rjust(10)
        print(line)


def table_diff(mans, a, b):
    ma = next((m for m in mans if m['id'].startswith(a)), None)
    mb = next((m for m in mans if m['id'].startswith(b)), None)
    if not ma or not mb:
        sys.exit(f'version not found: {a if not ma else b}')
    sa = (ma.get('summary') or {}).get('mean', {}); sb = (mb.get('summary') or {}).get('mean', {})
    print(f"{'metric'.ljust(16)}{ma['id'].rjust(12)}{mb['id'].rjust(12)}{'Δ'.rjust(12)}")
    print('-' * 52)
    for k in sorted(set(sa) | set(sb)):
        va, vb = sa.get(k), sb.get(k)
        d = '' if va is None or vb is None else f'{vb - va:+.3f}'
        print(k.ljust(16) + ('—' if va is None else f'{va:.3f}').rjust(12) +
              ('—' if vb is None else f'{vb:.3f}').rjust(12) + d.rjust(12))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--cases', action='store_true')
    ap.add_argument('--metric', default='match2')
    ap.add_argument('--diff', nargs=2, metavar=('A', 'B'))
    a = ap.parse_args()
    mans = load()
    if not mans:
        sys.exit('no snapshots yet — run versions/snapshot.py <id>')
    if a.diff:
        table_diff(mans, *a.diff)
    elif a.cases:
        table_cases(mans, a.metric)
    else:
        table_means(mans)
