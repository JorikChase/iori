#!/usr/bin/env python3
"""Shrink a Radiance .hdr into a tiny data: URI for inlining in a page <head>.

index.html has no lights: every photon in the scene comes from scene.environment,
so the canvas is pure black until 3dieMainBckg.hdr (1.4 MB) finishes downloading.
A 32x16 version of the same sky is ~2 KB of base64 — small enough to paste into
the HTML itself, so the scene is lit and correct on the very first frame while
the full-resolution sky streams in behind a blur.

Averaging happens in linear radiance, not in RGBE bytes: mixing mantissas across
differing exponents would smear the sun into nonsense.

    python3 tools/build_hdr_preview.py assets/3dieMainBckg.hdr --width 32 --base64

Prints the data: URI on stdout (--base64 for bare base64); --out writes a plain
.hdr instead. For the CSS backdrop that paints before WebGL has a context, open
tools/index_backdrop.html — that has to be measured off the real pass chain, not
derived from the HDRI.
"""

from __future__ import annotations

import argparse
import base64
import math
import struct
import sys
from pathlib import Path


def read_hdr(data: bytes) -> tuple[int, int, list[float]]:
    """Decode a Radiance .hdr into a flat list of linear RGB floats."""
    if not data.startswith(b"#?"):
        raise ValueError("not a Radiance file (missing #? magic)")

    pos = data.index(b"\n") + 1
    while True:
        end = data.index(b"\n", pos)
        line = data[pos:end]
        pos = end + 1
        if line.strip() == b"":
            break
        if line.startswith(b"FORMAT="):
            fmt = line.split(b"=", 1)[1].strip()
            if fmt != b"32-bit_rle_rgbe":
                raise ValueError(f"unsupported FORMAT {fmt!r}")

    end = data.index(b"\n", pos)
    res = data[pos:end].split()
    pos = end + 1
    # Only the standard top-down/left-right orientation is produced by the
    # exporters this site uses; anything else would need an axis flip here.
    if len(res) != 4 or res[0] != b"-Y" or res[2] != b"+X":
        raise ValueError(f"unsupported resolution line {data[pos:end]!r}")
    height, width = int(res[1]), int(res[3])

    pixels: list[float] = []
    scan = bytearray(width * 4)

    for _ in range(height):
        if width < 8 or width > 0x7FFF or data[pos] != 2 or data[pos + 1] != 2 \
                or (data[pos + 2] << 8 | data[pos + 3]) != width:
            pos = _read_flat_scanline(data, pos, width, scan)
        else:
            pos = _read_rle_scanline(data, pos + 4, width, scan)

        for x in range(width):
            e = scan[x * 4 + 3]
            if e == 0:
                pixels.extend((0.0, 0.0, 0.0))
                continue
            # RGBE: each channel is mantissa/256 scaled by a shared power of two.
            f = math.ldexp(1.0, e - 136)  # 2^(e-128) / 256
            pixels.extend((scan[x * 4] * f, scan[x * 4 + 1] * f, scan[x * 4 + 2] * f))

    return width, height, pixels


def _read_flat_scanline(data: bytes, pos: int, width: int, scan: bytearray) -> int:
    """Old-style scanline: raw RGBE triples with a (1,1,1,n) repeat escape."""
    x = 0
    shift = 0
    while x < width:
        r, g, b, e = data[pos:pos + 4]
        pos += 4
        if r == 1 and g == 1 and b == 1:
            count = e << shift
            prev = (x - 1) * 4
            for _ in range(count):
                scan[x * 4:x * 4 + 4] = scan[prev:prev + 4]
                x += 1
            shift += 8
        else:
            scan[x * 4:x * 4 + 4] = bytes((r, g, b, e))
            x += 1
            shift = 0
    return pos


def _read_rle_scanline(data: bytes, pos: int, width: int, scan: bytearray) -> int:
    """New-style scanline: the four components are run-length coded separately."""
    for c in range(4):
        x = 0
        while x < width:
            count = data[pos]
            pos += 1
            if count > 128:
                count -= 128
                value = data[pos]
                pos += 1
                for _ in range(count):
                    scan[x * 4 + c] = value
                    x += 1
            else:
                for _ in range(count):
                    scan[x * 4 + c] = data[pos]
                    pos += 1
                    x += 1
    return pos


def box_downscale(width: int, height: int, px: list[float], out_w: int, out_h: int) -> list[float]:
    """Average whole source blocks per output pixel, in linear radiance."""
    out = [0.0] * (out_w * out_h * 3)
    for oy in range(out_h):
        y0, y1 = oy * height // out_h, (oy + 1) * height // out_h
        for ox in range(out_w):
            x0, x1 = ox * width // out_w, (ox + 1) * width // out_w
            r = g = b = 0.0
            for y in range(y0, y1):
                row = y * width * 3
                for x in range(x0, x1):
                    i = row + x * 3
                    r += px[i]
                    g += px[i + 1]
                    b += px[i + 2]
            n = (y1 - y0) * (x1 - x0)
            i = (oy * out_w + ox) * 3
            out[i], out[i + 1], out[i + 2] = r / n, g / n, b / n
    return out


def write_hdr(width: int, height: int, px: list[float]) -> bytes:
    """Encode as uncompressed RGBE — at preview sizes RLE saves nothing."""
    head = b"#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y %d +X %d\n" % (height, width)
    body = bytearray()
    for i in range(0, len(px), 3):
        r, g, b = px[i], px[i + 1], px[i + 2]
        peak = max(r, g, b)
        if peak < 1e-32:
            body += b"\0\0\0\0"
            continue
        mant, exp = math.frexp(peak)
        scale = mant * 256.0 / peak
        body += struct.pack(
            "BBBB",
            min(255, int(r * scale)),
            min(255, int(g * scale)),
            min(255, int(b * scale)),
            exp + 128,
        )
    return head + bytes(body)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("source", type=Path, help="full-resolution .hdr")
    ap.add_argument("--width", type=int, default=32, help="preview width (default 32)")
    ap.add_argument("--out", type=Path, help="write a .hdr here instead of printing a data URI")
    ap.add_argument("--base64", action="store_true",
                    help="print bare base64 instead of a full data: URI")
    args = ap.parse_args()

    width, height, px = read_hdr(args.source.read_bytes())
    out_w = args.width
    out_h = max(1, round(out_w * height / width))
    if out_w > width:
        ap.error(f"--width {out_w} is larger than the source ({width}px)")

    small = box_downscale(width, height, px, out_w, out_h)
    blob = write_hdr(out_w, out_h, small)

    if args.out:
        args.out.write_bytes(blob)
        print(f"{args.source} {width}x{height} -> {args.out} {out_w}x{out_h} "
              f"({len(blob)} bytes)", file=sys.stderr)
        return 0

    b64 = base64.b64encode(blob).decode("ascii")
    uri = b64 if args.base64 else "data:image/vnd.radiance;base64," + b64
    print(f"{args.source} {width}x{height} -> {out_w}x{out_h}, "
          f"{len(blob)} bytes raw, {len(uri)} chars encoded", file=sys.stderr)
    print(uri)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
