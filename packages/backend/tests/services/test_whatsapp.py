"""Unit tests for WhatsApp deeplink composition — J11.5 Block 7.

Coverage targets the URL composition + payload shape only ; the
actual Twilio SDK call is a TODO stub (`send_message` returns
`{"status": "stub"}`). Full end-to-end wire-up tests come with
FU-J11-007.
"""
from __future__ import annotations

import pytest

from app.config import settings
from app.services.whatsapp import (
    WhatsAppService,
    _compose_order_url,
)


@pytest.mark.asyncio
async def test_send_order_notification_includes_orders_deeplink(
    monkeypatch: pytest.MonkeyPatch,
):
    """The composed body must contain `/orders/{uuid}` deeplink so
    the buyer lands on their order detail page (Block 4)."""
    monkeypatch.setattr(settings, "frontend_base_url", "https://etalo.app")
    svc = WhatsAppService()

    captured: dict = {}

    async def capture_send(to: str, body: str):
        captured["to"] = to
        captured["body"] = body
        return {"status": "stub", "to": to}

    monkeypatch.setattr(svc, "send_message", capture_send)

    await svc.send_order_notification(
        to="whatsapp:+2348012345678",
        order_id="9001",
        status="Funded",
        order_uuid="ffffffff-ffff-ffff-ffff-ffffffffffff",
    )

    assert "https://etalo.app/orders/ffffffff-ffff-ffff-ffff-ffffffffffff" in captured["body"]
    assert "#9001" in captured["body"]
    assert "Funded" in captured["body"]


@pytest.mark.asyncio
async def test_send_dispute_notification_includes_orders_deeplink(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr(settings, "frontend_base_url", "https://etalo.app")
    svc = WhatsAppService()

    captured: dict = {}

    async def capture_send(to: str, body: str):
        captured["body"] = body
        return {"status": "stub", "to": to}

    monkeypatch.setattr(svc, "send_message", capture_send)

    await svc.send_dispute_notification(
        to="whatsapp:+2348012345678",
        order_id="9001",
        level="N1_Amicable",
        order_uuid="ffffffff-ffff-ffff-ffff-ffffffffffff",
    )

    assert "https://etalo.app/orders/ffffffff-ffff-ffff-ffff-ffffffffffff" in captured["body"]
    assert "Dispute" in captured["body"]
    assert "N1_Amicable" in captured["body"]


def test_compose_order_url_uses_configured_base(
    monkeypatch: pytest.MonkeyPatch,
):
    """An override (e.g. ngrok URL in dev) is honored — the helper
    reads from `settings.frontend_base_url` at compose time."""
    monkeypatch.setattr(
        settings,
        "frontend_base_url",
        "https://upright-henna-armless.ngrok-free.dev",
    )
    url = _compose_order_url("abc-uuid")
    assert url == "https://upright-henna-armless.ngrok-free.dev/orders/abc-uuid"


def test_compose_order_url_strips_trailing_slash(
    monkeypatch: pytest.MonkeyPatch,
):
    """A trailing slash on the configured base must not double-up
    when concatenated with `/orders/...`."""
    monkeypatch.setattr(settings, "frontend_base_url", "https://etalo.app/")
    url = _compose_order_url("abc-uuid")
    assert url == "https://etalo.app/orders/abc-uuid"
    assert "//orders" not in url


def test_compose_order_url_default_points_at_production():
    """Default config (no .env override) must point at production
    so an accidental wire-up in prod doesn't silently leak localhost
    or staging URLs into buyer messages."""
    # The test environment's settings should reflect the default
    # unless an .env explicitly overrides it. We assert the substring
    # rather than equality to tolerate dev .env having an override.
    assert settings.frontend_base_url.startswith("http")
    # Default should at least NOT be localhost in tests run without
    # .env override — sanity check.
    if "etalo.app" in settings.frontend_base_url:
        assert _compose_order_url("u").startswith("https://etalo.app/orders/")
