# blackjach-api

Public deck sharing + a per-deck leaderboard for [blackjach](../blackjach).
Standalone service — its own SQLite DB, its own process, no relation to
`api/` (iori-api). No accounts: sharing a deck or posting a score just takes
a free-text nickname. Nicknames aren't reserved or authenticated — this is
an honor-system leaderboard, not a security boundary.

## Run it locally

```bash
cd blackjach-api
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python3 main.py                 # serves on http://localhost:3100
```

Then in `blackjach`'s Settings screen, point "API endpoint" at
`http://localhost:3100` to develop against it.

## Endpoints

| Method | Path                          | What                                   |
|--------|-------------------------------|-----------------------------------------|
| GET    | `/health`                     | liveness check                          |
| POST   | `/decks`                      | share a deck (name, sharedBy, cards[])  |
| GET    | `/decks?limit=&sort=new\|top` | browse shared decks                     |
| GET    | `/decks/{id}`                 | full deck (for importing)               |
| POST   | `/decks/{id}/scores`          | submit a leaderboard score              |
| GET    | `/decks/{id}/leaderboard`     | top scores for a deck                   |

Card images are decoded from the `imageDataUrl` base64 the client already
produces (it downscales before upload) and saved under `MEDIA_DIR`, served
back as `MEDIA_BASEURL/<file>`. Max 2MB decoded per image, max 500 cards per
deck — input hygiene, not moderation.

## Deploy (matches iori-api's shape — adapt paths/user to your actual setup)

```bash
# on the server
sudo useradd -r -s /usr/sbin/nologin blackjachapi
sudo mkdir -p /opt/blackjach-api /var/lib/blackjach-api
sudo chown blackjachapi:blackjachapi /var/lib/blackjach-api

# ship the code (scp/rsync this folder to /opt/blackjach-api), then:
cd /opt/blackjach-api
python3 -m venv venv
./venv/bin/pip install -r requirements.txt

sudo cp blackjach-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now blackjach-api
```

Then point Caddy at it — e.g. add a block like this to whichever Caddyfile
handles 3die.fr (adjust to match your actual redirects-*.caddy setup):

```caddyfile
blackjach-api.3die.fr {
    reverse_proxy 127.0.0.1:3100
}
```

Finally, set `CORS_ORIGINS` in the systemd unit to wherever `blackjach`
itself ends up served from, and set the API endpoint in the app's Settings
screen to `https://blackjach-api.3die.fr`.

## Notes

- No moderation gate — shared decks go live immediately (per current
  product decision; revisit if this stops being a small/trusted audience).
- No anti-cheat — scores are trusted as reported by the client. A very
  light per-IP rate limit (one write every 2s) exists purely to blunt
  accidental/careless flooding, not determined abuse.
- Nothing here is wired into `pages.meta.json` / `site.py` — same as
  `blackjach/` itself.
