"""Unit tests for app.services.asset_generator pure helpers (no DB,
no Playwright, no Pinata)."""
import base64

from app.services.asset_generator import (
    TEMPLATE_DIMENSIONS,
    _dev_stub_hash,
    _generate_qr_data_url,
)


def test_generate_qr_data_url_returns_png_data_url():
    data_url = _generate_qr_data_url("https://etalo.app/chioma/red-dress")
    assert data_url.startswith("data:image/png;base64,")
    payload = data_url.split(",", 1)[1]
    raw = base64.b64decode(payload)
    # PNG magic bytes
    assert raw[:8] == b"\x89PNG\r\n\x1a\n"


def test_dev_stub_hash_is_deterministic_and_distinctive():
    a = _dev_stub_hash(b"hello world")
    b = _dev_stub_hash(b"hello world")
    c = _dev_stub_hash(b"different")
    assert a == b
    assert a != c
    assert a.startswith("QmDev")


def test_template_dimensions_cover_all_v1_templates():
    expected_keys = {"ig_square", "ig_story", "wa_status", "tiktok", "fb_feed"}
    assert set(TEMPLATE_DIMENSIONS.keys()) == expected_keys
    # Sanity-check the canonical sizes — these are locked by ADR-037.
    assert TEMPLATE_DIMENSIONS["ig_square"] == (1080, 1080)
    assert TEMPLATE_DIMENSIONS["fb_feed"] == (1200, 630)
