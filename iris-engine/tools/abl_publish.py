#!/usr/bin/env python3
"""Publish an eye's ABL texture (study/11 §5.5 (a)): insert `ablTex` from study/proof-layers/sheet/abltex-NN.json into
the eye file's `albedo` section (data/NN.iris, study/15; every other section passes through byte for byte). Albedo only: the
shipped measurements stay valid; check the arrival against the measured load (max 1/255) after.
usage: python3 abl_publish.py NN [NN …]"""
import sys, json, os
ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for ref in sys.argv[1:]:
    spec = json.load(open(os.path.join(ENG, 'study/proof-layers/sheet', f'abltex-{ref}.json')))
    keep = {k: spec[k] for k in ('amp', 'exp', 'gain', 'var', 'octVar', 'perPixel') if k in spec}; keep['src'] = 'tools/abl_texture.py, study/11 §5.5 (a)'
    # study/15: the spec lives in the eye file's `albedo` section — replace that one section, everything else byte for byte
    sys.path.insert(0, os.path.join(ENG, 'tools', 'eyefile')); from replace import replace
    p = os.path.join(ENG, 'data', f'{ref}.iris'); buf = open(p, 'rb').read()
    open(p, 'wb').write(replace(buf, 'albedo', {'ablTex': keep})); print(ref, keep)
