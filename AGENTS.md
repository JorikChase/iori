# AGENTS.md — iori / 3die repository

## What this repo is
Source for two sites served from one VPS webroot by Caddy:
- **iori.me** — iori's artist catalogue: experiments, hubs (web.html, catalog.html, web3d.html)
- **3die.fr** — the label: games, shop, music, artist pages, info/contact
Plus **api.3die.fr** (Python backend) and **dash.3die.fr** (dashboard SPA).

## The one rule for adding pages
Every HTML page must be registered in `pages.meta.json`
(domain / category / type / unique title + description), then:

```bash
python3 site.py all      # heads + sitemaps + robots + pages.json + redirects + check
python3 site.py check    # must pass
```

- `site.py heads` rewrites the marked `<!-- SEO:BEGIN/END -->` block in every
  page's `<head>` — never hand-edit inside the markers; edit pages.meta.json instead
- Hidden/internal pages: `"hidden": true` (excluded from sitemap/hubs, noindex)
- New pages then appear automatically in catalog.html, web3d.html, sitemaps

## Deploy
Push to `main` on GitHub, then on the server (`ssh iori-vps`):

```bash
bash /root/iori/server_setup.sh          # git pull + rsync + api + caddy
```

- Deploys exclude: `.git`, `splats/`, `zausi`, heavy unreferenced assets
  (see rsync excludes in server_setup.sh)
- The API redeploys to /opt/iori-api + restarts `iori-api.service`
- Dashboard files deploy to /var/www/iori-dash
- **Never run the script from inside /root/iori while it self-updates via git** —
  scp it to /tmp and run from there if server_setup.sh itself changed

## Layout
- `site.py`, `pages.meta.json` — build tooling + page registry
- `api/` — FastAPI backend (auth, kanban, messages, photo posts; SQLite)
- `dash/` — dashboard SPA (vanilla JS)
- `BACKLOG.md` — deferred projects with resume instructions
- `RESTORE.md` (in the parent dir, next to backups) — disaster recovery
- `splats/` — local-only 2.6 GB splat collection (untracked; see BACKLOG.md #1)

## Hard rules
- Never commit `required.md` (server credentials — gitignored)
- Never re-add `splats/` to git tracking (see BACKLOG.md #2 before any history work)
- Media uploads go through the dashboard (stored on the VPS, not in git)
