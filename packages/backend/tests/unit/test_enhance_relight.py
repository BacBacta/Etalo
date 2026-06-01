"""Unit tests for the ADR-049 Tier-1 generative relight path.

The real fal IC-Light call can't run in CI (paid + key is a deployed
secret), so `_relight_via_fal` is mocked. These lock the CONTROL FLOW
that protects production : relight is used when enabled, and ANY relight
failure falls back to the verified studio compositor. The deterministic
Pillow prep + prompt selection are tested for real.
"""
from __future__ import annotations

from io import BytesIO

import pytest
from PIL import Image

from app.services import asset_generator as ag
from app.services.asset_generator import (
    _prep_subject_for_relight,
    _relight_prompt,
    _normalize_to_square,
    ENHANCE_OUTPUT_DIM,
)


def _transparent_product_png() -> bytes:
    # An ellipse (not a full rectangle) so the bbox corners are
    # transparent → the neutral grey shows through there after prep,
    # matching a real concave product matte.
    from PIL import ImageDraw

    canvas = Image.new("RGBA", (800, 800), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    draw.ellipse([250, 250, 550, 550], fill=(40, 120, 200, 255))
    buf = BytesIO()
    canvas.save(buf, format="PNG")
    return buf.getvalue()


def test_relight_prompt_is_category_aware_with_fallback():
    assert "fashion" in _relight_prompt("fashion").lower()
    assert _relight_prompt("food") != _relight_prompt("home")
    # unknown / None → the 'other' studio prompt
    assert _relight_prompt(None) == _relight_prompt("nonsense-category")


def test_prep_subject_returns_grey_rgb_jpeg_plus_alpha_mask():
    subj_bytes, mask_bytes = _prep_subject_for_relight(_transparent_product_png())
    subj = Image.open(BytesIO(subj_bytes))
    mask = Image.open(BytesIO(mask_bytes))
    assert subj.mode == "RGB"  # IC-Light keys off a grey field, not alpha
    assert mask.mode in ("L", "P")  # single-channel silhouette mask
    # cropped to the product bbox (~300px ellipse, inclusive coords → 301)
    assert subj.size == mask.size
    assert 298 <= subj.size[0] <= 303 and 298 <= subj.size[1] <= 303
    # background pixels are neutral grey (~127), not black/transparent
    corner = subj.getpixel((5, 5))
    assert all(abs(c - 127) < 5 for c in corner)


def test_normalize_to_square_outputs_target_dim_png():
    src = Image.new("RGB", (1200, 800), (90, 90, 90))
    buf = BytesIO()
    src.save(buf, format="PNG")
    out = _normalize_to_square(buf.getvalue())
    im = Image.open(BytesIO(out))
    assert im.format == "PNG"
    assert im.size == (ENHANCE_OUTPUT_DIM, ENHANCE_OUTPUT_DIM)


@pytest.mark.asyncio
async def test_variants_use_relight_when_enabled(monkeypatch):
    """With relight on + budget 1, the first variant must come from the
    relight path; the others from the compositor."""
    relit_marker = b"RELIT_BYTES"
    composite_marker = b"COMPOSITE_BYTES"
    calls = {"relight": 0, "composite": 0}

    async def _fake_relight(transparent_bytes, category, initial_latent="Top"):
        calls["relight"] += 1
        return relit_marker

    def _fake_composite(transparent_bytes, preset):
        calls["composite"] += 1
        return composite_marker

    uploaded: list[bytes] = []

    async def _fake_upload(image_bytes, filename):
        uploaded.append(image_bytes)
        return f"Qm{len(uploaded)}"

    monkeypatch.setattr(ag.settings, "enhance_relight_enabled", True)
    monkeypatch.setattr(ag.settings, "fal_key", "test-key")
    monkeypatch.setattr(ag.settings, "enhance_relight_variants", 1)
    monkeypatch.setattr(ag, "_relight_via_fal", _fake_relight)
    monkeypatch.setattr(ag, "_composite_square", _fake_composite)
    monkeypatch.setattr(ag.ipfs_service, "upload_image", _fake_upload)
    monkeypatch.setattr(ag.ipfs_service, "get_url", lambda h: f"https://ipfs/{h}")

    presets = [
        ("Recommended", {"backdrop": (247, 245, 240)}),
        ("White bright", {"backdrop": (252, 252, 252)}),
        ("Neutral cool", {"backdrop": (245, 247, 250)}),
    ]
    variants = await ag._build_enhance_variants(
        _transparent_product_png(), "fashion", presets
    )

    assert calls["relight"] == 1, "exactly one variant relit (budget=1)"
    assert calls["composite"] == 2, "other two variants from compositor"
    assert relit_marker in uploaded
    assert uploaded.count(composite_marker) == 2
    assert len(variants) == 3


@pytest.mark.asyncio
async def test_relight_failure_falls_back_to_compositor(monkeypatch):
    """If the relight call raises, that variant must still be produced
    by the compositor — the seller never gets a broken/missing variant."""
    composite_marker = b"COMPOSITE_FALLBACK"
    calls = {"relight": 0, "composite": 0}

    async def _boom_relight(transparent_bytes, category, initial_latent="Top"):
        calls["relight"] += 1
        raise RuntimeError("IC-Light 500")

    def _fake_composite(transparent_bytes, preset):
        calls["composite"] += 1
        return composite_marker

    async def _fake_upload(image_bytes, filename):
        return "Qmx"

    monkeypatch.setattr(ag.settings, "enhance_relight_enabled", True)
    monkeypatch.setattr(ag.settings, "fal_key", "test-key")
    monkeypatch.setattr(ag.settings, "enhance_relight_variants", 1)
    monkeypatch.setattr(ag, "_relight_via_fal", _boom_relight)
    monkeypatch.setattr(ag, "_composite_square", _fake_composite)
    monkeypatch.setattr(ag.ipfs_service, "upload_image", _fake_upload)
    monkeypatch.setattr(ag.ipfs_service, "get_url", lambda h: f"https://ipfs/{h}")

    presets = [
        ("Recommended", {"backdrop": (247, 245, 240)}),
        ("White bright", {"backdrop": (252, 252, 252)}),
        ("Neutral cool", {"backdrop": (245, 247, 250)}),
    ]
    variants = await ag._build_enhance_variants(
        _transparent_product_png(), "fashion", presets
    )

    assert calls["relight"] == 1, "relight attempted"
    assert calls["composite"] == 3, "all three variants fell back to compositor"
    assert len(variants) == 3
