"""Deterministic unit tests for the ADR-049 enhance compositor.

No fal.ai / network / DB — these exercise the pure-Pillow studio
compositing (gradient backdrop, silhouette shadow, edge feather) on a
synthetic transparent product so quality regressions are caught locally.
"""
from __future__ import annotations

from io import BytesIO

from PIL import Image

from app.services.asset_generator import (
    ENHANCE_OUTPUT_DIM,
    ENHANCE_PRESETS,
    _composite_square,
    _studio_backdrop,
)


def _synthetic_product_png() -> bytes:
    """A 400×400 product centred on an 800×800 transparent canvas. The
    body is red with LARGE near-white + near-black accent blocks (each
    >1 % of the frame, so the autocontrast `cutoff=1` doesn't clip them).
    This gives every channel a genuine 0..255 spread — like a real photo
    with highlights + shadows — so the classical autocontrast step stays
    ~hue-preserving instead of pathologically washing a flat fill white."""
    canvas = Image.new("RGBA", (800, 800), (0, 0, 0, 0))
    body = Image.new("RGBA", (400, 400), (190, 60, 60, 255))
    body.paste(Image.new("RGBA", (150, 150), (245, 245, 245, 255)), (15, 15))
    body.paste(Image.new("RGBA", (150, 150), (12, 12, 12, 255)), (235, 235))
    canvas.paste(body, (200, 200), body)
    buf = BytesIO()
    canvas.save(buf, format="PNG")
    return buf.getvalue()


def test_composite_outputs_square_png_at_target_dim():
    out = _composite_square(_synthetic_product_png(), ENHANCE_PRESETS["other"])
    im = Image.open(BytesIO(out))
    assert im.format == "PNG"
    assert im.size == (ENHANCE_OUTPUT_DIM, ENHANCE_OUTPUT_DIM)


def test_studio_backdrop_is_a_gradient_not_a_flat_fill():
    dim = 256
    bg = _studio_backdrop(dim, (247, 245, 240))
    # The light pool sits above centre → centre is brighter than the far
    # corner. A flat fill would make these equal.
    cx = bg.getpixel((dim // 2, int(dim * 0.42)))
    corner = bg.getpixel((dim - 1, dim - 1))
    assert sum(cx) > sum(corner), "backdrop should fall off toward corners"
    # Vignette stays a light studio sweep, never crushes to black.
    assert min(corner) > 180


def test_composite_casts_a_shadow_below_the_product():
    out = _composite_square(_synthetic_product_png(), ENHANCE_PRESETS["other"])
    im = Image.open(BytesIO(out)).convert("RGB")
    # Compare the composite against the CLEAN backdrop at the same pixel
    # just below the product — the only difference there is the shadow,
    # so this isolates the shadow contribution from the vignette.
    clean = _studio_backdrop(ENHANCE_OUTPUT_DIM, ENHANCE_PRESETS["other"]["backdrop"])
    px = (ENHANCE_OUTPUT_DIM // 2, int(ENHANCE_OUTPUT_DIM * 0.86))
    assert sum(im.getpixel(px)) < sum(clean.getpixel(px)), "expected a ground shadow"


def test_composite_preserves_product_color_region():
    # The product's red core must survive compositing (not be washed out
    # or shifted to a different hue).
    out = _composite_square(_synthetic_product_png(), ENHANCE_PRESETS["other"])
    im = Image.open(BytesIO(out)).convert("RGB")
    r, g, b = im.getpixel((ENHANCE_OUTPUT_DIM // 2, ENHANCE_OUTPUT_DIM // 2))
    assert r > 120 and r > g and r > b, "product red core should remain dominant"


def test_composite_runs_for_every_category_preset():
    png = _synthetic_product_png()
    for key, preset in ENHANCE_PRESETS.items():
        out = _composite_square(png, preset)
        im = Image.open(BytesIO(out))
        assert im.size == (ENHANCE_OUTPUT_DIM, ENHANCE_OUTPUT_DIM), key
