#!/usr/bin/env python3
"""Publish an eye's disc edge (study/11 §5.6 P0): `edgeMm`, the 10–90 % rise of the limbus in mm on the tissue, measured on the
photograph and fitted on the render with tools/crisp/dof_study.js (`__dof.edge('photo')`, then `__dof.fitEdge(target)`).
Inserted into data/tissue-NN.json as one field BEFORE `ablTex` (abl_publish.py keeps that one last), so the diff is one line.
Presentation only — the fit and comparison renders are opaque to the edge, the shipped measurements stay valid.
usage: python3 edge_publish.py NN=MM [NN=MM …]      e.g. 26=0.115"""
import json, os, re, sys
ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for arg in sys.argv[1:]:
    ref, mm = arg.split('='); mm = round(float(mm), 4)
    p = os.path.join(ENG, 'data', f'tissue-{ref}.json'); s = open(p).read().rstrip()
    s = re.sub(r', "edgeMm": [0-9.eE+-]+', '', s)                        # replace an earlier value
    i = s.find(', "ablTex": ')
    s = (s[:i] + f', "edgeMm": {mm}' + s[i:]) if i >= 0 else (s[:-1] + f', "edgeMm": {mm}' + '}')
    assert json.loads(s)['edgeMm'] == mm
    open(p, 'w').write(s + '\n'); print(ref, 'edgeMm', mm)
