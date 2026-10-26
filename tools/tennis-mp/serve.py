import os, sys, http.server, functools
d = sys.argv[1]; os.chdir(d)
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=d)
http.server.ThreadingHTTPServer(("127.0.0.1", int(sys.argv[2])), h).serve_forever()
