#!/usr/bin/env python3
"""Publish an eye's ABL texture (study/11 §5.5 (a)): insert `ablTex` from study/proof-layers/sheet/abltex-NN.json into
data/tissue-NN.json as ONE appended field — the file is not re-serialised, so its diff is a single line. Albedo only: the
shipped measurements (tissue-NN.cal.bin) stay valid; check the arrival against the measured load (max 1/255) after.
usage: python3 abl_publish.py NN [NN …]"""
import json, os, sys
ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for ref in sys.argv[1:]:
    spec = json.load(open(os.path.join(ENG, 'study/proof-layers/sheet', f'abltex-{ref}.json')))
    keep = {k: spec[k] for k in ('amp', 'exp', 'gain', 'var')}; keep['src'] = 'tools/abl_texture.py, study/11 §5.5 (a)'
    p = os.path.join(ENG, 'data', f'tissue-{ref}.json'); s = open(p).read().rstrip()
    if '"ablTex"' in s: print(ref, 'already carries ablTex — left alone'); continue
    assert s.endswith('}')
    s = s[:-1] + ', "ablTex": ' + json.dumps(keep) + '}\n'; json.loads(s); open(p, 'w').write(s); print(ref, keep)
