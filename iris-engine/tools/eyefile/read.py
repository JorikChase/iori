#!/usr/bin/env python3
"""Read an eye file (study/15) back into the three objects today's engine consumes: (tissue json, case json, cal bytes).
Also: python3 tools/eyefile/read.py data/26.iris [section] → the head (or one section) as JSON on stdout — the dump tool."""
import sys, json, struct, gzip

def _col(b, o, enc, count):
    if enc == 'u8': return list(struct.unpack_from('<%dB' % count, b, o)), count
    if enc == 'i32': return list(struct.unpack_from('<%di' % count, b, o)), 4 * count
    if enc in ('q5', 'q5d'): return list(struct.unpack_from('<%di' % count, b, o)), 4 * count
    if enc == 'f64': return list(struct.unpack_from('<%dd' % count, b, o)), 8 * count
    raise ValueError(enc)

def _num(i): return i / 100000 if i % 100000 else i // 100000   # ints stay ints, like the source JSON

def _pad4(n): return n + (4 - n % 4) % 4

def table(b, meta):
    n = meta['n']; o = 0; counts = list(struct.unpack_from('<%dH' % n, b, 0)); o = _pad4(2 * n)
    cols = {}
    for c in meta['columns']:
        raw, size = _col(b, o, c['enc'], c['count']); o += _pad4(size); comps = c['comps']
        if c['enc'] in ('q5', 'q5d'):
            if c['enc'] == 'q5d':
                out = []; i = 0
                for pts in counts:
                    prev = [0] * comps
                    for p in range(pts):
                        cur = [a + b_ for a, b_ in zip(raw[i:i + comps], prev)]; out.extend(cur); prev = cur; i += comps
                raw = out
            raw = [_num(x) for x in raw]
        cols[c['name']] = (raw, comps)
    recs = []; i = 0
    for k, pts in enumerate(counts):
        r = dict((meta['scalars'] or [{}] * n)[k])
        for name, (raw, comps) in cols.items():
            seg = raw[i * comps:(i + pts) * comps]
            r[name] = [seg[j:j + comps] for j in range(0, len(seg), comps)] if comps > 1 else seg
        recs.append(r); i += pts
    return recs

def parse(buf):
    assert buf[:4] == b'IRIS', 'not an eye file'
    v, minor, hl = struct.unpack_from("<HHI", buf, 4); head = json.loads(buf[12:12 + hl].rstrip(b"\0")); base = 12 + hl
    def sec(name):
        s = next(x for x in head['sections'] if x['name'] == name); b = buf[base + s['off']: base + s['off'] + s['len']]
        if s['enc'] == 'json': return json.loads(b)
        if s['enc'] == 'gz': return json.loads(gzip.decompress(b))
        if s['enc'] == 'bytes': return bytes(b)
        if s['enc'] == 'table': return table(b, s['meta'])
        raise ValueError(s['enc'])
    return head, sec

def read(buf):
    head, sec = parse(buf)
    fr = sec('frame'); st = sec('structures'); rel = sec('relief'); mat = sec('materials'); alb = sec('albedo')
    cells = sec('materials/cells')[0]
    t = {'ref': head['ref']['file'], 'fit': fr['fit'], 'grade': fr['grade'], 'z': rel['z'], 'mm': rel['mm'],
         'outlines': sec('structures/outlines'), 'fibres': sec('levels/deck/fibres'), 'veins': sec('levels/deck/veins'),
         'guides': sec('levels/sheet/guides'), 'sfib': sec('levels/sheet/sfib'), 'svein': sec('levels/sheet/svein'),
         'beads': sec('structures/beads'), 'margin': {'xy': sec('structures/margin')[0]['xy'], 'circle': st['margin.circle']},
         'cells': {'xy': cells['xy'], 'sheet': cells['sheet'], 'ground': cells['ground']}, 'rimRGB': mat['rimRGB'],
         'roots': sec('levels/bridges/graph'), 'lut': fr['lut'], 'edgeMm': fr['edgeMm'], 'ablTex': alb['ablTex']}
    c = dict(sec('legacy')); c.update({'align': fr['align'], 'view': fr['view'], 'scores': sec('scores'), 'texture': fr['texture'],
                                       'tag': fr['tag'], 'quality': fr['quality'], 'natural': fr['natural'], 'isolated': fr['isolated']})
    c = {k: v for k, v in c.items() if v is not None or k in ('scores',)}
    return t, c, sec('measurements')

if __name__ == '__main__':
    buf = open(sys.argv[1], 'rb').read(); head, sec = parse(buf)
    if len(sys.argv) > 2:
        v = sec(sys.argv[2]); print(json.dumps(v, indent=1)[:200000] if not isinstance(v, bytes) else f'{len(v)} bytes')
    else:
        h = dict(head); h['sections'] = [{k: v for k, v in s.items() if k != 'meta'} for s in h['sections']]; print(json.dumps(h, indent=1))
