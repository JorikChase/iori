#!/usr/bin/env python3
"""Decode the Strands layer's review sheets (tools/lines_sheets.js posts them as JSON into ref/, the only place the dev server
writes) into study/proof-layers/lines-<name>.jpg, and delete the temporaries. usage: python3 lines_sheets.py"""
import base64, glob, json, os
ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for p in sorted(glob.glob(os.path.join(ENG, 'ref', 'lines-tmp-*.json'))):
    d = json.load(open(p)); b = base64.b64decode(d['jpg'].split(',', 1)[1])
    q = os.path.join(ENG, 'study', 'proof-layers', f"lines-{d['name']}.jpg"); open(q, 'wb').write(b); os.remove(p)
    print(os.path.relpath(q, ENG), len(b) // 1024, 'KB')
