import http.server, base64, os, json, sys
ROOT = os.path.dirname(os.path.abspath(__file__))
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*'); self.send_header('Access-Control-Allow-Headers', '*'); self.send_header('Cache-Control', 'no-store'); super().end_headers()
    def do_OPTIONS(self): self.send_response(204); self.end_headers()
    def do_POST(self):
        n = int(self.headers.get('Content-Length', 0)); body = json.loads(self.rfile.read(n))
        name = os.path.basename(body['name']); data = body['data'].split(',', 1)[1]
        with open(os.path.join(ROOT, 'shots', name), 'wb') as f: f.write(base64.b64decode(data))
        if 'meta' in body:
            with open(os.path.join(ROOT, 'shots', name + '.json'), 'w') as f: json.dump(body['meta'], f)
        self.send_response(200); self.end_headers(); self.wfile.write(b'ok')
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(('127.0.0.1', 8790), H).serve_forever()
