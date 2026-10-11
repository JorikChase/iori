#!/usr/bin/env python3
"""The eye file, ID v3 (study/15): pack today's three files of an eye into one binary `data/NN.iris`.

  python3 tools/eyefile/pack.py 26            → data/26.iris   (reads data/tissue-26.json, data/case-26.json, data/tissue-26.cal.bin)
  python3 tools/eyefile/pack.py 26 --check    → also decodes the file again and asserts every number round-trips exactly

Container:  "IRIS" · u16 v=3 · u16 minor · u32 headLen · head JSON (padded to 4) · sections (4-byte aligned).
Sections are located by head.sections[i] = { name, enc, off, len, sha1, meta? }.
  enc 'json'    UTF-8 JSON
      'gz'      gzipped UTF-8 JSON (the legacy section)
      'bytes'   opaque bytes (the measurements: today's cal.bin, itself gzipped)
      'table'   a list of records with numeric per-point columns: meta = { n, counts: 'u16', columns: [{ name, comps, enc }],
                scalars: [...per-record JSON...] }; the columns' blobs follow each other in the section, each 4-byte aligned.
Column encodings are chosen per column, lossless by construction: 'u8' (ints 0–255), 'i32' (ints), 'q5' (i32 of value × 1e5,
for numbers with ≤ 5 decimals), 'q5d' (the same, delta-coded along a record's points — curves' xy), 'f64' (anything else).
"""
import sys, os, json, struct, gzip, hashlib, re
from decimal import Decimal

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..')); DATA = os.path.join(ROOT, 'data')
MAGIC = b'IRIS'; V = 3; MINOR = 0

# ------------------------------------------------------------------ numbers → the cheapest lossless column encoding
def decimals(x):
    if isinstance(x, bool) or isinstance(x, int): return 0
    s = repr(x)
    if 'e' in s or 'E' in s: return 99
    return len(s.split('.')[1]) if '.' in s else 0

def pick(vals):
    ints = all(isinstance(v, (int, bool)) and not isinstance(v, float) for v in vals)
    if ints:
        return 'u8' if all(0 <= int(v) <= 255 for v in vals) else 'i32'
    if all(decimals(v) <= 5 and abs(v) < 21000 for v in vals): return 'q5'
    return 'f64'

def q5(v): return int(Decimal(repr(v)) * 100000) if isinstance(v, float) else int(v) * 100000

def encode_column(vals, enc):
    if enc == 'u8': return struct.pack('<%dB' % len(vals), *[int(v) for v in vals])
    if enc == 'i32': return struct.pack('<%di' % len(vals), *[int(v) for v in vals])
    if enc in ('q5', 'q5d'): return struct.pack('<%di' % len(vals), *[q5(v) for v in vals])
    if enc == 'f64': return struct.pack('<%dd' % len(vals), *[float(v) for v in vals])
    raise ValueError(enc)

def pad4(b): return b + b'\0' * ((4 - len(b) % 4) % 4)

# ------------------------------------------------------------------ a table: records with per-point numeric columns
def table(records, point_fields, delta_fields=()):
    """records: list of dicts. point_fields: names whose value is a per-point list (scalar or small fixed vector per point).
    Everything else in a record is a scalar kept as JSON. Returns (meta, blob)."""
    n = len(records); counts = []; cols = {}; comps = {}
    for f in point_fields:
        cols[f] = []; comps[f] = None
    scalars = []
    for r in records:
        pts = len(r[point_fields[0]]) if point_fields else 0; counts.append(pts)
        for f in point_fields:
            v = r[f]
            assert len(v) == pts, (f, len(v), pts)
            if pts and isinstance(v[0], list):
                c = len(v[0]); assert comps[f] in (None, c); comps[f] = c
                cols[f].extend(x for p in v for x in p)
            else:
                assert comps[f] in (None, 1); comps[f] = 1; cols[f].extend(v)
        scalars.append({k: v for k, v in r.items() if k not in point_fields})
    assert max(counts, default=0) < 65536
    blob = pad4(struct.pack('<%dH' % n, *counts)); columns = []
    for f in point_fields:
        vals = cols[f]; enc = pick(vals); c = comps[f] or 1
        if f in delta_fields and enc == 'q5':
            enc = 'q5d'; out = []; i = 0
            for pts in counts:
                prev = [0] * c
                for p in range(pts):
                    cur = [q5(x) for x in vals[i:i + c]]; out.extend(a - b for a, b in zip(cur, prev)); prev = cur; i += c
            blob += pad4(struct.pack('<%di' % len(out), *out))
        else:
            blob += pad4(encode_column(vals, enc))
        columns.append({'name': f, 'comps': c, 'enc': enc, 'count': len(vals)})
    meta = {'n': n, 'counts': 'u16', 'columns': columns, 'scalars': scalars}
    if all(not s for s in scalars): meta['scalars'] = None
    return meta, blob

def section(name, enc, payload, meta=None):
    b = payload if isinstance(payload, (bytes, bytearray)) else json.dumps(payload, separators=(',', ':'), ensure_ascii=False).encode('utf8')
    if enc == 'gz': b = gzip.compress(b, 9)
    s = {'name': name, 'enc': enc, 'len': len(b), 'sha1': hashlib.sha1(b).hexdigest()[:16]}
    if meta is not None: s['meta'] = meta
    return s, pad4(b)

# ------------------------------------------------------------------ pack
def pack(ref, check=False):
    """the migration record: the three files of before → data/NN.iris (they are gone from data/ since 2026-10-10; from git history)"""
    t = json.load(open(os.path.join(DATA, f'tissue-{ref}.json')))
    c = json.load(open(os.path.join(DATA, f'case-{ref}.json')))
    cal = open(os.path.join(DATA, f'tissue-{ref}.cal.bin'), 'rb').read()
    out = build(ref, t, c, cal)
    path = os.path.join(DATA, f'{ref}.iris'); open(path, 'wb').write(out); report(path, out, t, c, cal, check); return path

def report(path, out, t, c, cal, check):
    print(f'{path}: {len(out) / 1024:.0f} KB (gz on the wire {len(gzip.compress(out, 6)) / 1024:.0f} KB)')
    if check:
        from read import read
        T2, C2, CAL2 = read(out)
        assert CAL2 == cal, 'measurements differ'
        def same(a, b):                                   # numeric equality: 1 and 1.0 are the same number in the page
            if isinstance(a, bool) or isinstance(b, bool): return a == b
            if isinstance(a, (int, float)) and isinstance(b, (int, float)): return a == b
            if isinstance(a, dict): return isinstance(b, dict) and set(a) == set(b) and all(same(a[k], b[k]) for k in a)
            if isinstance(a, list): return isinstance(b, list) and len(a) == len(b) and all(same(x, y) for x, y in zip(a, b))
            return a == b
        for k in t: assert same(t[k], T2[k]), f'tissue.{k} differs'
        for k in c: assert same(c[k], C2[k]), f'case.{k} differs'
        print('   round trip: every number comes back equal')

def build(ref, t, c, cal, head_over=None):
    """the writer: the three in-memory objects (tissue, case, measurement bytes) → the file's bytes. head_over merges into
    the head (engine, scores, modified … carried over from a file being rewritten)."""
    refs = {r['file']: r for r in json.load(open(os.path.join(ROOT, 'ref', 'refs.json')))} if os.path.exists(os.path.join(ROOT, 'ref', 'refs.json')) else {}
    rj = refs.get(t['ref'], {})
    calhead = {}
    try:
        cb = gzip.decompress(cal) if cal[:2] == b'\x1f\x8b' else cal
        hl = struct.unpack('<I', cb[4:8])[0]; calhead = json.loads(cb[8:8 + hl])
    except Exception as e: print('cal head unreadable:', e)

    secs = []; blobs = []
    def add(name, enc, payload, meta=None):
        s, b = section(name, enc, payload, meta); secs.append(s); blobs.append(b)

    # 1 frame
    add('frame', 'json', {'align': c['align'], 'view': c['view'], 'fit': t['fit'], 'natural': c.get('natural'), 'isolated': c.get('isolated'),
                          'tag': c.get('tag'), 'quality': c.get('quality'), 'edgeMm': t.get('edgeMm'), 'grade': t.get('grade'), 'lut': t.get('lut'), 'texture': c.get('texture')})
    # 2 structures
    g = c['genome']
    add('structures', 'json', {'collarette': g.get('coll'), 'furrows': g.get('furrows', []), 'spots': g.get('spots', []), 'nodules': g.get('nodules', []),
                               'margin.circle': t['margin']['circle']})
    m, b = table([{'xy': t['margin']['xy']}], ['xy'], ('xy',)); add('structures/margin', 'table', b, m)
    m, b = table(t['beads'], ['xy', 'w', 'r', 'z', 'zc', 'rgb'], ('xy',)); add('structures/beads', 'table', b, m)
    m, b = table(t['outlines'], ['xy', 'rim'], ('xy',)); add('structures/outlines', 'table', b, m)
    # 3 levels — the ledger's six, today's sets by class; empty slots typed
    LEVELS = [('lattice', 'S-2', -0.35), ('deck', 'S-1', -0.2), ('sheet', 'S0', 0.0), ('freed', 'S+1', 0.02), ('bridges', 'S+2', 0.0), ('membrane', 'S+3', 0.3)]
    add('levels', 'json', [{'id': i, 'class': cl, 'heightMm': h, 'filled': {'fields': False, 'handles': False},
                            'fields': None, 'handles': None, 'children': None, 'parents': []} for i, cl, h in LEVELS])
    for setname, level in [('fibres', 'deck'), ('veins', 'deck'), ('guides', 'sheet'), ('sfib', 'sheet'), ('svein', 'sheet')]:
        recs = t[setname]; fields = [k for k in recs[0].keys() if isinstance(recs[0][k], list)]
        m, b = table(recs, fields, ('xy',)); add(f'levels/{level}/{setname}', 'table', b, m)
    add('levels/bridges/graph', 'json', t['roots'])
    # 4 materials
    cells = t['cells']; cf = [k for k in cells if isinstance(cells[k], list)]; m, b = table([{k: cells[k] for k in cf}], cf); add('materials/cells', 'table', b, m)
    add('materials', 'json', {'rimRGB': t.get('rimRGB'), 'rimMat': t.get('rimMat'), 'rimLum': t.get('rimLum'), 'channels': t.get('materialChannels')})
    # 5 albedo · 6 relief · 7 dynamics
    add('albedo', 'json', {'ablTex': t.get('ablTex')})
    add('relief', 'json', {'mm': t['mm'], 'z': t['z']})
    add('dynamics', 'json', {'pupilAtCapture': c['view'].get('pupil'), 'anchoredDefault': {'bridges': True, 'membrane': False}, 'rules': None})
    # 8 measurements · 9 legacy · 10 journal · 11 scores
    add('measurements', 'bytes', cal)
    add('legacy', 'gz', {k: v for k, v in c.items() if k not in ('align', 'view', 'scores', 'texture', 'tag', 'quality', 'natural', 'isolated')})
    add('journal', 'json', {'v': 1, 'primitives': None, 'ops': []})
    add('scores', 'json', c.get('scores'))

    off = 0
    for s, b in zip(secs, blobs): s['off'] = off; off += len(b)
    head = {'format': 'iris-eye', 'v': V, 'minor': MINOR, 'engine': None, 'quality': calhead.get('quality'),
            'eye': {'id': ref, 'name': rj.get('colour'), 'note': rj.get('note')},
            'ref': {'file': t['ref'], 'source': rj.get('source'), 'author': rj.get('author'), 'licence': rj.get('license'), 'natural': c.get('natural'), 'fit': t['fit'], 'isolated': c.get('isolated')},
            'dialKey': calhead.get('key'), 'measured': calhead.get('measured'),
            'scores': {'match2': (c.get('scores') or {}).get('match2'), 'hcorr': (c.get('scores') or {}).get('hcorr')},
            'provenance': {'frame': 'measured', 'structures': 'traced', 'levels': 'traced+inferred', 'materials': 'measured', 'measurements': 'measured'},
            'sections': secs}
    for k, v in (head_over or {}).items():
        if isinstance(v, dict) and isinstance(head.get(k), dict): head[k].update(v)
        else: head[k] = v
    hb = pad4(json.dumps(head, separators=(',', ':'), ensure_ascii=False).encode('utf8'))
    return MAGIC + struct.pack('<HHI', V, MINOR, len(hb)) + hb + b''.join(blobs)

if __name__ == '__main__':
    sys.path.insert(0, HERE)
    refs = [a for a in sys.argv[1:] if not a.startswith('--')] or ['26']
    for r in refs: pack(r, '--check' in sys.argv)
