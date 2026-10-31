"""Dark rounded square with a link bar: the part kept in white, the ? part struck off in grey.
Same background and accent as Grok Usage Floating's icon.
Run: python3 scripts/icons.py"""
from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "icons"
OUT.mkdir(exist_ok=True)

BG = (15, 15, 15)
KEEP = (242, 242, 242)
CUT = (78, 78, 78)
SLASH = (26, 94, 255)


def png_rgba(px: bytearray, size: int) -> bytes:
    stride = size * 4
    raw = b"".join(b"\x00" + bytes(px[y * stride:(y + 1) * stride]) for y in range(size))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    return b"".join(
        [
            b"\x89PNG\r\n\x1a\n",
            chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)),
            chunk(b"IDAT", zlib.compress(raw, 9)),
            chunk(b"IEND", b""),
        ]
    )


# Signed distances in pixels, negative inside. Coverage is 0.5 - d, so edges come out antialiased.
def round_rect(x0: float, y0: float, x1: float, y1: float, r: float):
    cx, cy, hx, hy = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2 - r, (y1 - y0) / 2 - r

    def d(x: float, y: float) -> float:
        qx, qy = abs(x - cx) - hx, abs(y - cy) - hy
        return math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - r

    return d


def segment(ax: float, ay: float, bx: float, by: float, w: float):
    """A stroke from a to b with round caps."""

    def d(px: float, py: float) -> float:
        vx, vy = bx - ax, by - ay
        h = max(0.0, min(1.0, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)))
        return math.hypot(px - ax - vx * h, py - ay - vy * h) - w / 2

    return d


def layers(size: int) -> list:
    u = size / 128
    # 16 and 32 are laid out by hand on whole pixels so the bars stay sharp in the toolbar.
    if size <= 16:
        x0, split, x1, h, gap, sw = 2, 9, 14, 4, 2, 1.6
    elif size <= 32:
        x0, split, x1, h, gap, sw = 5, 18, 27, 8, 4, 2.6
    else:
        x0, split, x1, h, gap, sw = 18 * u, 72 * u, 110 * u, 26 * u, 14 * u, 7 * u
    y = (size - h) / 2
    if size <= 32:
        y = round(y)
    out = [(round_rect(0, 0, size, size, size * 0.22), BG)]
    # The kept part, then the cut part after a gap.
    out.append((round_rect(x0, y, split, y + h, h / 2), KEEP))
    out.append((round_rect(split + gap, y, x1, y + h, h / 2), CUT))
    # A blue slash through the gap, where the ? was.
    mx = split + gap / 2
    reach = h * 0.95
    out.append((segment(mx - reach * 0.35, y + h / 2 + reach, mx + reach * 0.35, y + h / 2 - reach, sw), SLASH))
    return out


def icon(size: int) -> bytes:
    px = bytearray(size * size * 4)
    shapes = layers(size)
    for j in range(size):
        for i in range(size):
            r = g = b = a = 0.0
            for d, col in shapes:
                cov = min(1.0, max(0.0, 0.5 - d(i + 0.5, j + 0.5)))
                if cov:
                    r, g, b = (col[0] * cov + r * (1 - cov), col[1] * cov + g * (1 - cov), col[2] * cov + b * (1 - cov))
                    a = cov + a * (1 - cov)
            if a:
                k = (j * size + i) * 4
                px[k:k + 4] = bytes((round(r / a), round(g / a), round(b / a), round(a * 255)))
    return png_rgba(px, size)


for n in (16, 32, 48, 128):
    (OUT / f"{n}.png").write_bytes(icon(n))
print("icons written")
