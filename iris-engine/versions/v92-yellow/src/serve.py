#!/usr/bin/env python3
"""Dev server for the Iris Engine: serves the repo root and accepts POST /save/<name>.json to write
bench outputs (cases.json, align.json, texture-study.json) into iris-engine/ref/, and
POST /save/versions/<id>/<name>.json into iris-engine/versions/<id>/bench/ (§22), and
POST /save/data/<name>.json|.cal.bin into iris-engine/data/ (study/11 S3). Local use only."""
import http.server, socketserver, sys, os, re, json
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store'); super().end_headers()
    def do_POST(self):
        n = int(self.headers.get('Content-Length', '0')); body = self.rfile.read(n)
        # /save/<name>.json → iris-engine/ref/ ; /save/versions/<id>/<name>.json → iris-engine/versions/<id>/bench/
        # /save/data/<name> → iris-engine/data/ (study/11 S3: an eye's case file and its shipped measurements, any bytes)
        md = re.match(r'^/save/data/([A-Za-z0-9_-]+\.(?:json|cal\.bin))$', self.path)
        if md:
            open(os.path.join(ROOT, 'iris-engine', 'data', md.group(1)), 'wb').write(body)
            self.send_response(200); self.end_headers(); self.wfile.write(b'saved data/' + md.group(1).encode()); return
        m = re.match(r'^/save/([A-Za-z0-9_.-]+\.json)$', self.path)
        mv = re.match(r'^/save/versions/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+\.json)$', self.path)
        if not m and not mv: self.send_response(404); self.end_headers(); return
        try: json.loads(body)
        except Exception: self.send_response(400); self.end_headers(); self.wfile.write(b'not json'); return
        if mv:
            d = os.path.join(ROOT, 'iris-engine', 'versions', mv.group(1), 'bench')
            os.makedirs(d, exist_ok=True); path = os.path.join(d, mv.group(2))
        else:
            path = os.path.join(ROOT, 'iris-engine', 'ref', m.group(1))
        open(path, 'wb').write(body)
        self.send_response(200); self.end_headers(); self.wfile.write(b'saved ' + os.path.relpath(path, ROOT).encode())
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(('127.0.0.1', int(sys.argv[1]) if len(sys.argv) > 1 else 8768), H) as s:
    print('iris-engine dev server on', s.server_address, 'root', ROOT, flush=True); s.serve_forever()
