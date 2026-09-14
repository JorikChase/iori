#!/usr/bin/env python3
"""Dev server for the Iris Engine: serves the repo root and accepts POST /save/<name>.json to write
bench outputs (cases.json, align.json, texture-study.json) into iris-engine/ref/. Local use only."""
import http.server, socketserver, sys, os, re, json
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store'); super().end_headers()
    def do_POST(self):
        n = int(self.headers.get('Content-Length', '0')); body = self.rfile.read(n)
        m = re.match(r'^/save/([A-Za-z0-9_.-]+\.json)$', self.path)
        if not m: self.send_response(404); self.end_headers(); return
        try: json.loads(body)
        except Exception: self.send_response(400); self.end_headers(); self.wfile.write(b'not json'); return
        path = os.path.join(ROOT, 'iris-engine', 'ref', m.group(1))
        open(path, 'wb').write(body)
        self.send_response(200); self.end_headers(); self.wfile.write(b'saved ' + m.group(1).encode())
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(('127.0.0.1', int(sys.argv[1]) if len(sys.argv) > 1 else 8768), H) as s:
    print('iris-engine dev server on', s.server_address, 'root', ROOT, flush=True); s.serve_forever()
