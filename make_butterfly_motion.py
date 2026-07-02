from math import sin, pi
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter, ImageChops


ROOT = Path(__file__).parent
SRC = ROOT / "assets" / "ai-butterfly-hero.png"
OUT = ROOT / "assets" / "ai-butterfly-hero-motion.webp"


def soft_polygon_mask(size, points, blur=22):
    mask = Image.new("L", size, 0)
    draw = Image.new("L", size, 0)
    from PIL import ImageDraw

    d = ImageDraw.Draw(draw)
    d.polygon(points, fill=255)
    return draw.filter(ImageFilter.GaussianBlur(blur))


def wing_layer(base, mask, phase, side):
    w, h = base.size
    masked = Image.new("RGBA", base.size, (0, 0, 0, 0))
    rgba = base.convert("RGBA")
    masked.paste(rgba, (0, 0), mask)

    # Simulate flapping by compressing the wing toward the body and adding a
    # small vertical shear. The motion stays subtle so the original image still
    # reads as the same artwork.
    amp = sin(phase)
    scale_x = 1 - 0.055 * amp
    scale_y = 1 + 0.018 * amp
    shear = (0.018 * amp) * (-1 if side == "left" else 1)
    body_x = int(w * 0.5)
    body_y = int(h * 0.52)

    a = scale_x
    b = shear
    c = body_x - scale_x * body_x - shear * body_y
    d = 0
    e = scale_y
    f = body_y - scale_y * body_y
    moved = masked.transform(base.size, Image.Transform.AFFINE, (a, b, c, d, e, f), Image.Resampling.BICUBIC)

    glow = ImageEnhance.Brightness(moved).enhance(1.08 + 0.08 * max(amp, 0))
    return glow


def main():
    base = Image.open(SRC).convert("RGB")
    w, h = base.size

    left_mask = soft_polygon_mask(
        base.size,
        [
            (int(w * 0.09), int(h * 0.10)),
            (int(w * 0.50), int(h * 0.16)),
            (int(w * 0.50), int(h * 0.82)),
            (int(w * 0.08), int(h * 0.88)),
        ],
    )
    right_mask = soft_polygon_mask(
        base.size,
        [
            (int(w * 0.50), int(h * 0.16)),
            (int(w * 0.91), int(h * 0.10)),
            (int(w * 0.92), int(h * 0.88)),
            (int(w * 0.50), int(h * 0.82)),
        ],
    )

    frames = []
    total = 32
    for i in range(total):
        phase = 2 * pi * i / total
        amp = sin(phase)

        frame = base.convert("RGBA")
        # A tiny brightness pulse makes it feel like rendered motion without
        # changing the original composition.
        frame = ImageEnhance.Brightness(frame).enhance(0.98 + 0.035 * max(amp, 0))

        left = wing_layer(base, left_mask, phase, "left")
        right = wing_layer(base, right_mask, phase, "right")
        frame.alpha_composite(left)
        frame.alpha_composite(right)

        # Blend back a little of the original to avoid harsh duplicate edges.
        frame = Image.blend(frame, base.convert("RGBA"), 0.22)

        # Add a very subtle luminance difference frame-to-frame.
        if amp > 0:
            glow = ImageChops.screen(frame, ImageEnhance.Brightness(frame).enhance(1.015))
            frame = Image.blend(frame, glow, 0.08 * amp)

        frames.append(frame.convert("RGB"))

    frames[0].save(
        OUT,
        save_all=True,
        append_images=frames[1:],
        duration=145,
        loop=0,
        quality=82,
        method=6,
    )
    print(OUT, OUT.stat().st_size)


if __name__ == "__main__":
    main()
