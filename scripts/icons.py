"""A white chain link on a dark rounded square, with a blue sparkle: a clean link.
The background matches Grok Usage Floating's icon. 16 and 32 px are laid out on whole pixels;
16 px drops the sparkle, which would only read as a plus sign at that size.
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
LINK = (242, 242, 242)
SPARK = (77, 134, 255)


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


# Each shape is an inside test. Pixels are sampled on a grid, so edges come out antialiased.
def round_rect(x0: float, y0: float, x1: float, y1: float, r: float):
    cx, cy, hx, hy = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2 - r, (y1 - y0) / 2 - r

    def inside(x: float, y: float) -> bool:
        qx, qy = abs(x - cx) - hx, abs(y - cy) - hy
        return math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - r <= 0

    return inside


def seg_dist(px: float, py: float, ax: float, ay: float, bx: float, by: float) -> float:
    vx, vy = bx - ax, by - ay
    h = max(0.0, min(1.0, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy or 1)))
    return math.hypot(px - ax - vx * h, py - ay - vy * h)


def link(cx: float, cy: float, R: float, s: float, ax: float, g: float, b: float, bs: float):
    """Two facing C shapes and a bar between them.
    R: C half-height to the stroke centre; s: C stroke; ax: arc centre offset from cx;
    g: where each C's straight edges end, towards the middle; b: bar half-length; bs: bar stroke."""

    def inside(x: float, y: float) -> bool:
        u, v = x - cx, y - cy
        au = abs(u)
        d = min(seg_dist(au, v, g, -R, ax, -R), seg_dist(au, v, g, R, ax, R))
        if au >= ax:
            d = min(d, abs(math.hypot(au - ax, v) - R))
        return d <= s / 2 or seg_dist(u, v, -b, 0, b, 0) <= bs / 2

    return inside


def sparkle(cx: float, cy: float, r: float, p: float = 0.6):
    """A four-point star with concave sides."""

    def inside(x: float, y: float) -> bool:
        dx, dy = abs(x - cx) / r, abs(y - cy) / r
        return dx <= 1 and dy <= 1 and dx ** p + dy ** p <= 1

    return inside


def layers(size: int) -> list:
    out = [(round_rect(0, 0, size, size, size * 0.22), BG)]
    if size <= 16:
        out.append((link(cx=8, cy=8, R=3, s=2, ax=2, g=2, b=2, bs=2), LINK))
    elif size <= 32:
        # Strokes on rows 13–16, 18–21 and 23–26, outer edges on columns 5 and 27.
        out.append((link(cx=16, cy=19.5, R=5, s=3, ax=4.5, g=3.5, b=5.5, bs=3), LINK))
        out.append((sparkle(24.5, 7, 4.5), SPARK))
    else:
        u = size / 128
        out.append((link(cx=64 * u, cy=76 * u, R=17 * u, s=10 * u, ax=22 * u, g=11 * u, b=15 * u, bs=10 * u), LINK))
        out.append((sparkle(96 * u, 30 * u, 18 * u), SPARK))
        out.append((sparkle(70 * u, 20 * u, 6.5 * u), SPARK))
    return out


def icon(size: int) -> bytes:
    ss = 8 if size <= 48 else 4
    n = ss * ss
    px = bytearray(size * size * 4)
    shapes = layers(size)
    for j in range(size):
        for i in range(size):
            r = g = b = a = 0.0
            for inside, col in shapes:
                cov = sum(inside(i + (si + 0.5) / ss, j + (sj + 0.5) / ss) for sj in range(ss) for si in range(ss)) / n
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
