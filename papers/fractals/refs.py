#!/usr/bin/env python3
"""Number the citations of a paper page in order of first appearance.

Citations are written with stable keys and any placeholder number:
    <a class="cite" href="#ref-mandelbrot1982">[?]</a>
and the reference list holds one <li id="ref-KEY"> per source, in any order, inside <ol class="refs">.

Run after editing the text (idempotent; rewrites the file in place):
    python3 papers/fractals/refs.py fractals.html

It renumbers every citation, reorders the list to match, and reports keys cited without an entry
and entries never cited (those are kept, at the end, so nothing is lost by accident).
"""
import re
import sys

CITE = re.compile(r'(<a\s+class="cite"\s+href="#ref-)([\w-]+)("\s*>)\[[^\]]*\](</a>)')


def main(path):
    s = open(path, encoding="utf-8").read()
    a = s.index('<ol class="refs">') + len('<ol class="refs">')
    b = s.index("</ol>", a)
    head, refs, tail = s[:a], s[a:b], s[b:]

    entries = {}
    for m in re.finditer(r'\s*<li id="ref-([\w-]+)">.*?</li>', refs, re.S):
        entries[m.group(1)] = m.group(0).strip()

    order = []
    for m in CITE.finditer(head):
        if m.group(2) not in order:
            order.append(m.group(2))
    num = {k: i + 1 for i, k in enumerate(order)}

    missing = [k for k in order if k not in entries]
    unused = [k for k in entries if k not in num]

    head = CITE.sub(lambda m: f"{m.group(1)}{m.group(2)}{m.group(3)}[{num[m.group(2)]}]{m.group(4)}", head)
    items = [entries[k] for k in order if k in entries] + [entries[k] for k in unused]
    refs = "\n" + "\n".join("        " + it for it in items) + "\n      "
    open(path, "w", encoding="utf-8").write(head + refs + tail)

    print(f"[refs] {len(order)} sources cited, {len(entries)} in the list")
    for k in missing:
        print(f"  MISSING entry for cited key: {k}")
    for k in unused:
        print(f"  never cited (kept at the end): {k}")
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "fractals.html"))
