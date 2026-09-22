#!/usr/bin/env python3
"""Dev server for petri (same contract as iris-engine/serve.py): serves the repo root and accepts
POST /save/<name>.json -> petri/ref/ and POST /save/versions/<id>/<name>.json -> petri/versions/<id>/bench/.
Local use only."""
import http.server, socketserver, sys, os, re, json
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.md': 'text/plain; charset=utf-8'}
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store'); super().end_headers()
    def do_POST(self):
        n = int(self.headers.get('Content-Length', '0')); body = self.rfile.read(n)
        m = re.match(r'^/save/([A-Za-z0-9_.-]+\.json)$', self.path)
        mv = re.match(r'^/save/versions/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+\.json)$', self.path)
        if not m and not mv: self.send_response(404); self.end_headers(); return
        try: json.loads(body)
        except Exception: self.send_response(400); self.end_headers(); self.wfile.write(b'not json'); return
        if mv:
            d = os.path.join(ROOT, 'petri', 'versions', mv.group(1), 'bench'); name = mv.group(2)
        else:
            d = os.path.join(ROOT, 'petri', 'ref'); name = m.group(1)
        os.makedirs(d, exist_ok=True); open(os.path.join(d, name), 'wb').write(body)
        self.send_response(200); self.end_headers(); self.wfile.write(b'saved ' + name.encode())
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(('127.0.0.1', int(sys.argv[1]) if len(sys.argv) > 1 else 8770), H) as s:
    print('petri dev server on', s.server_address, 'root', ROOT, flush=True); s.serve_forever()
