#!/usr/bin/env python3
"""Static server for the splat comparison rig: COOP/COEP headers (SharedArrayBuffer),
no-store caching, and POST /shots/<name>.png to save a canvas capture to shots/."""
import http.server, socketserver, sys, os, base64, re
os.chdir(os.path.dirname(os.path.abspath(__file__)))
class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
        '.ksplat':'application/octet-stream','.spz':'application/octet-stream','.sog':'application/octet-stream',
        '.ply':'application/octet-stream','.mjs':'text/javascript','.js':'text/javascript','.wasm':'application/wasm'}
    def end_headers(self):
        self.send_header('Cross-Origin-Opener-Policy','same-origin')
        self.send_header('Cross-Origin-Embedder-Policy','require-corp')
        self.send_header('Cross-Origin-Resource-Policy','cross-origin')
        self.send_header('Cache-Control','no-store')
        super().end_headers()
    def do_POST(self):
        n=int(self.headers.get('Content-Length','0')); body=self.rfile.read(n)
        name=re.sub(r'[^A-Za-z0-9_.-]','_',self.path.split('/')[-1] or 'shot.png')
        data=body.split(b',',1)[1] if body.startswith(b'data:') else body
        open(os.path.join('shots',name),'wb').write(base64.b64decode(data))
        self.send_response(200); self.end_headers(); self.wfile.write(b'ok')
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
with socketserver.ThreadingTCPServer(('127.0.0.1', int(sys.argv[1]) if len(sys.argv)>1 else 8765), H) as s:
    print('serving', os.getcwd(), flush=True); s.serve_forever()
