#!/usr/bin/env python3
"""Dev server for MOSHINE (same contract as petri/serve.py and iris-engine/serve.py): serves the parent of
this folder, so the app is at /moshine/ exactly as it will be on iori.me, and accepts
POST /save/<name>.json -> moshine/ref/. Sends the cross-origin isolation headers production will send
(COOP same-origin, COEP require-corp), so SharedArrayBuffer and multithreaded WASM behave the same here.
Local use only."""
import http.server, socketserver, sys, os, re, json
APP = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(APP)
os.chdir(ROOT)
class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.mjs': 'text/javascript',
                      '.wasm': 'application/wasm', '.md': 'text/plain; charset=utf-8', '.woff2': 'font/woff2'}
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        self.send_header('Cross-Origin-Resource-Policy', 'same-origin')
        super().end_headers()
    def do_POST(self):
        n = int(self.headers.get('Content-Length', '0')); body = self.rfile.read(n)
        m = re.match(r'^/save/([A-Za-z0-9_.-]+\.json)$', self.path)
        if not m: self.send_response(404); self.end_headers(); return
        try: json.loads(body)
        except Exception: self.send_response(400); self.end_headers(); self.wfile.write(b'not json'); return
        d = os.path.join(APP, 'ref'); os.makedirs(d, exist_ok=True); open(os.path.join(d, m.group(1)), 'wb').write(body)
        self.send_response(200); self.end_headers(); self.wfile.write(b'saved ' + m.group(1).encode())
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(('127.0.0.1', int(sys.argv[1]) if len(sys.argv) > 1 else 8772), H) as s:
    print('moshine dev server on', s.server_address, 'root', ROOT, flush=True); s.serve_forever()
