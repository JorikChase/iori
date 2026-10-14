"""A small client for the timeline API, shared by the import tools in this folder.

Token: TIMELINE_TOKEN in the environment, else a prompt for the dash login (scope "timeline").
The default API is production (api.3die.fr); pass --api http://127.0.0.1:8796 for a local one."""
import getpass, io, json, mimetypes, os, sys, urllib.error, urllib.request, uuid

UA = "iori-timeline-import/1 (+https://iori.me/timeline.html)"


class Api:
    def __init__(self, base, token=None):
        self.base = base.rstrip("/")
        self.token = token or os.environ.get("TIMELINE_TOKEN") or self.login()

    def login(self):
        # prompts go to stderr: stdout may be captured, as in TIMELINE_TOKEN=$(python3 -c "... print(Api(...).token)")
        sys.stderr.write("dash username: "); sys.stderr.flush()
        user = sys.stdin.readline().strip()
        pw = getpass.getpass("password: ", stream=sys.stderr)
        return self.call("POST", "/auth/login", {"username": user, "password": pw, "scope": "timeline"}, auth=False)["token"]

    def call(self, method, path, body=None, data=None, ctype="application/json", auth=True):
        hd = {"Content-Type": ctype, "User-Agent": UA}
        if auth:
            hd["Authorization"] = "Bearer " + self.token
        payload = data if data is not None else (json.dumps(body).encode() if body is not None else None)
        req = urllib.request.Request(self.base + path, method=method, data=payload, headers=hd)
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read() or b"{}")
        except urllib.error.HTTPError as e:
            raise SystemExit(f"{method} {path}: HTTP {e.code} {e.read()[:300].decode(errors='replace')}")

    def entries(self):
        return self.call("GET", "/timeline/entries")["entries"]

    def create(self, body):
        return self.call("POST", "/timeline/entries", body)

    def patch(self, entry_id, body):
        return self.call("PATCH", f"/timeline/entries/{entry_id}", body)

    def upload(self, path, filename, data, ctype=None, fields=None):
        """multipart POST of one file (to /timeline/upload or /timeline/entries/<id>/media)"""
        b = uuid.uuid4().hex
        out = io.BytesIO()
        for k, v in (fields or {}).items():
            out.write(f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
        ctype = ctype or mimetypes.guess_type(filename)[0] or "application/octet-stream"
        out.write(f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\nContent-Type: {ctype}\r\n\r\n'.encode())
        out.write(data)
        out.write(f"\r\n--{b}--\r\n".encode())
        return self.call("POST", path, data=out.getvalue(), ctype=f"multipart/form-data; boundary={b}")


def fetch(url, limit=25 * 1024 * 1024):
    """GET a public URL (feeds, artwork) with a size cap."""
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 " + UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read(limit + 1)
    if len(data) > limit:
        raise ValueError(f"{url}: larger than {limit} bytes")
    return data


def args_api(ap):
    ap.add_argument("--api", default="https://api.3die.fr")
    ap.add_argument("--dry-run", action="store_true", help="show what would change, send nothing")
