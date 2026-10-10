#!/usr/bin/env python3
"""Replace ONE section of an eye file, everything else passed through byte for byte (study/15 §1.6) — the offline twin of
IrisEye.replaceSection. Used by the publish tools once the three old files are gone (e.g. a new texture spec into `albedo`).

  python3 tools/eyefile/replace.py 26 albedo '{"ablTex": {...}}'          # JSON payload inline
  python3 tools/eyefile/replace.py 26 albedo @spec.json                    # JSON payload from a file
  python3 tools/eyefile/replace.py 26 measurements @tissue-26.cal.bin     # bytes payload from a file
  python3 tools/eyefile/replace.py 26 --head '{"scores": {"match2": 90.354}}'   # merge into the head (sections untouched)
"""
import sys, os, json, struct, hashlib, datetime
HERE = os.path.dirname(os.path.abspath(__file__)); DATA = os.path.abspath(os.path.join(HERE, '..', '..', 'data'))
def pad4(b): return b + b'\0' * ((4 - len(b) % 4) % 4)

def replace(buf, name, payload, enc=None):
    assert buf[:4] == b'IRIS'
    v, minor, hl = struct.unpack_from('<HHI', buf, 4); head = json.loads(buf[12:12 + hl].rstrip(b'\0')); base = 12 + hl
    parts = []; off = 0; hit = False
    for s in head['sections']:
        q = buf[base + s['off']: base + s['off'] + s['len']]
        if s['name'] == name:
            hit = True
            q = payload if isinstance(payload, (bytes, bytearray)) else json.dumps(payload, separators=(',', ':'), ensure_ascii=False).encode('utf8')
            s['enc'] = enc or ('bytes' if isinstance(payload, (bytes, bytearray)) else 'json'); s['len'] = len(q); s['sha1'] = hashlib.sha1(q).hexdigest()[:16]
        p = pad4(bytes(q)); s['off'] = off; off += len(p); parts.append(p)
    assert hit, f'no section {name}'
    head['modified'] = datetime.datetime.utcnow().isoformat() + 'Z'
    hb = pad4(json.dumps(head, separators=(',', ':'), ensure_ascii=False).encode('utf8'))
    return b'IRIS' + struct.pack('<HHI', v, minor, len(hb)) + hb + b''.join(parts)

def set_head(buf, patch):
    """Merge `patch` (a dict) into the head's top level — sections untouched, byte for byte. For scores, engine, eye.name …"""
    assert buf[:4] == b'IRIS'
    v, minor, hl = struct.unpack_from('<HHI', buf, 4); head = json.loads(buf[12:12 + hl].rstrip(b'\0')); body = buf[12 + hl:]
    for k, val in patch.items():
        if isinstance(val, dict) and isinstance(head.get(k), dict): head[k].update(val)
        else: head[k] = val
    head['modified'] = datetime.datetime.utcnow().isoformat() + 'Z'
    hb = pad4(json.dumps(head, separators=(',', ':'), ensure_ascii=False).encode('utf8'))
    return b'IRIS' + struct.pack('<HHI', v, minor, len(hb)) + hb + body

if __name__ == '__main__':
    if sys.argv[2] == '--head':                     # python3 replace.py 26 --head '{"scores": {...}}'
        ref = sys.argv[1]; path = os.path.join(DATA, f'{ref}.iris'); out = set_head(open(path, 'rb').read(), json.loads(sys.argv[3])); open(path, 'wb').write(out); print(f'{path}: head updated'); sys.exit(0)
    ref, name, arg = sys.argv[1], sys.argv[2], sys.argv[3]
    path = os.path.join(DATA, f'{ref}.iris'); buf = open(path, 'rb').read()
    if arg.startswith('@'):
        raw = open(arg[1:], 'rb').read()
        try: payload = json.loads(raw) if not arg.endswith('.bin') else raw
        except Exception: payload = raw
    else: payload = json.loads(arg)
    out = replace(buf, name, payload); open(path, 'wb').write(out); print(f'{path}: section {name} replaced, {len(out) / 1024:.0f} KB')
