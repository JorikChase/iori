#!/usr/bin/env python3
"""Static dev server for the site root (no caching), for previewing pages and
folder apps such as audio/ at http://127.0.0.1:<port>/<dir>/.
Usage: python3 tools/serve_root.py [port]   (default 8792). Local use only."""
import http.server, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        if self.path.startswith('/audio/probe/'):      # same scope as the Caddy block in server_setup.sh
            self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
            self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        super().end_headers()
    def log_message(self, fmt, *a):
        sys.stderr.write("%s %s\n" % (self.command, self.path))
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8792
http.server.ThreadingHTTPServer(('127.0.0.1', port), H).serve_forever()
