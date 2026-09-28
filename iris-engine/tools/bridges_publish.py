#!/usr/bin/env python3
"""Publish the separator rule's bridge DETECTIONS (study/11 §5.2.3, roots.py find_bridges) into data/tissue-NN.json, so the
Strands overlay (study/11 §5.6 P1) can draw today's detection on the shipped eyes. The study export
study/proof-layers/tissue-NN-whole.json holds them over the same fibres (checked: identical fibre count and geometry); the
shipped files predate the export. Inserted as `roots.bridges` just before `roots.ends` — one field, the file is not
re-serialised. Detection only: nothing in the engine reads it, no fibre moves (the lift stays opt-in, `--bridges`).
usage: python3 bridges_publish.py NN [NN …]"""
import json, os, sys
ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for ref in sys.argv[1:]:
    src = json.load(open(os.path.join(ENG, 'study/proof-layers', f'tissue-{ref}-whole.json')))
    p = os.path.join(ENG, 'data', f'tissue-{ref}.json'); s = open(p).read(); d = json.loads(s)
    assert len(src['fibres']) == len(d['fibres']) and all(a['xy'] == b['xy'] for a, b in zip(src['fibres'], d['fibres'])), 'the export traced other fibres'
    br = src['roots'].get('bridges', [])
    if 'bridges' in d['roots']: print(ref, 'already has bridges — skipped'); continue
    i = s.find('"roots":{'); j = s.find('"ends":', i); assert i >= 0 and j > i and s.count('"ends":') == 1
    s = s[:j] + '"bridges":' + json.dumps(br, separators=(',', ':')) + ',' + s[j:]
    assert json.loads(s)['roots']['bridges'] == br
    open(p, 'w').write(s); print(ref, len(br), 'bridges')
