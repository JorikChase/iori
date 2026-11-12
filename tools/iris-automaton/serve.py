#!/usr/bin/env python3
"""Dev server for the iris automaton captures: serves the repo root (no-store) and accepts
POST /save/<path> with raw bytes into tools/iris-automaton/captures/<path> (png/jpg/json/bin only).
Local use only. Usage: /usr/bin/python3 tools/iris-automaton/serve.py 8791"""
import http.server, socketserver, sys, os, re
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'tools', 'iris-automaton', 'captures')
os.chdir(ROOT)
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store'); super().end_headers()
    def do_POST(self):
        n = int(self.headers.get('Content-Length', '0')); body = self.rfile.read(n)
        m = re.match(r'^/save/([A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)?\.(?:png|jpg|json|bin))$', self.path)
        if not m: self.send_response(404); self.end_headers(); return
        p = os.path.join(OUT, m.group(1)); os.makedirs(os.path.dirname(p), exist_ok=True)
        open(p, 'wb').write(body)
        self.send_response(200); self.end_headers(); self.wfile.write(b'saved ' + m.group(1).encode())
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(('127.0.0.1', int(sys.argv[1]) if len(sys.argv) > 1 else 8791), H) as s:
    s.serve_forever()
