# Retired icon sources

`3die.svg` / `3die.ico` — the original vector 3DIE mark (flat triangles, 720x720).
Retired 2026-09-26, when the site moved to painted full-bleed sheets rendered by
`forge.py`. Nothing referenced them: they sat at the web root serving no `<link>`,
no manifest entry and no `browserconfig.xml` tile.

Kept here rather than deleted because the vector is the only editable form of the
mark that still appears inside the painted sheets. `tools/` is rsync-excluded from
the webroot, so filing them here is also what takes them off the live sites.
