#!/usr/bin/env python3
"""study/11 T7: turn ref/t7-review-NN.json (written by the page's __t7.save) into study/proof-layers/t7-review-NN.png."""
import base64, json, os, sys
ENG = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
for ref in sys.argv[1:]:
    src = os.path.join(ENG, 'ref', f't7-review-{ref}.json'); d = json.load(open(src))
    dst = os.path.join(ENG, 'study', 'proof-layers', f't7-review-{ref}.png')
    open(dst, 'wb').write(base64.b64decode(d['png'].split(',', 1)[1])); os.remove(src)
    print(dst, 'legacy', d['legacy']['match2'], 'layer', d['layer']['match2'])
