#!/usr/bin/env python3
"""
Draws the Mac menu bar icon: the paper crane from assets/icon.png, as a flat
silhouette with its centre crease, and prints it as the base64 PNG that
modules/mac-status-item/ios/YKMacAppKit.m embeds (CraneIconPNG).

The outline is traced from the 1024px app icon, in its pixel coordinates. The
image is 36px square, an 18pt template image at 2x; AppKit tints it for light,
dark and highlighted menu bars, so only its alpha matters.

    python3 client/scripts/menu-bar-icon.py [out.png]

Needs Pillow.
"""
import base64
import io
import sys

from PIL import Image, ImageDraw

OUTLINE = [
    (130, 533),  # beak tip
    (213, 451),  # crown
    (250, 458),  # back of the head
    (392, 622),  # where the neck meets the wing
    (866, 222),  # wing tip
    (432, 866),  # bottom point
    (290, 705),
    (250, 655),
    (228, 500),  # throat
]
CREASE = ((392, 622), (432, 866))

PIXELS = 36
SUPERSAMPLE = 8
MARGIN = 0.94  # of the square the crane's longer side fills
CREASE_WIDTH = 1.0  # in output pixels


def draw() -> Image.Image:
    xs = [x for x, _ in OUTLINE]
    ys = [y for _, y in OUTLINE]
    left, top = min(xs), min(ys)
    width, height = max(xs) - left, max(ys) - top
    side = PIXELS * SUPERSAMPLE
    scale = side * MARGIN / max(width, height)
    dx = (side - width * scale) / 2
    dy = (side - height * scale) / 2

    def at(point):
        return ((point[0] - left) * scale + dx, (point[1] - top) * scale + dy)

    mask = Image.new('L', (side, side), 0)
    pen = ImageDraw.Draw(mask)
    pen.polygon([at(p) for p in OUTLINE], fill=255)
    pen.line([at(p) for p in CREASE], fill=0, width=round(CREASE_WIDTH * SUPERSAMPLE))

    icon = Image.new('RGBA', (PIXELS, PIXELS), (0, 0, 0, 0))
    icon.putalpha(mask.resize((PIXELS, PIXELS), Image.LANCZOS))
    return icon


if __name__ == '__main__':
    icon = draw()
    if len(sys.argv) > 1:
        icon.save(sys.argv[1])
    buffer = io.BytesIO()
    icon.save(buffer, format='PNG', optimize=True)
    print(base64.b64encode(buffer.getvalue()).decode())
