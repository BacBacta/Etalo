"""Unit tests for the WhatsApp order notifier (no network)."""
from __future__ import annotations

import asyncio

import pytest

from app.services.whatsapp import WhatsAppNotifier, format_whatsapp_number


def test_format_number_variants():
    # International format (with separators) → normalized E.164.
    assert format_whatsapp_number("+234 901 123 4567") == "whatsapp:+2349011234567"
    assert format_whatsapp_number("+2349011234567") == "whatsapp:+2349011234567"
    # No leading '+' → we can't infer the country, so skip (don't guess).
    assert format_whatsapp_number("0803 123 4567") is None
    assert format_whatsapp_number("") is None
    assert format_whatsapp_number(None) is None
    assert format_whatsapp_number("+12") is None  # too short to be real


def test_enabled_requires_all_creds():
    assert not WhatsAppNotifier("", "", "").enabled
    assert not WhatsAppNotifier("sid", "tok", "").enabled
    assert WhatsAppNotifier("sid", "tok", "+14155238886").enabled


def test_from_prefix_normalized():
    n = WhatsAppNotifier("sid", "tok", "+14155238886")
    assert n._from == "whatsapp:+14155238886"
    n2 = WhatsAppNotifier("sid", "tok", "whatsapp:+14155238886")
    assert n2._from == "whatsapp:+14155238886"


@pytest.mark.asyncio
async def test_dispatch_noop_when_disabled():
    n = WhatsAppNotifier("", "", "")
    n.dispatch_new_order("+2349011234567", order_id=1, amount_human="5.00")
    assert len(n._tasks) == 0


@pytest.mark.asyncio
async def test_dispatch_noop_on_unusable_number():
    n = WhatsAppNotifier("sid", "tok", "+14155238886")
    n.dispatch_new_order("08031234567", order_id=1, amount_human="5.00")  # no '+'
    assert len(n._tasks) == 0


@pytest.mark.asyncio
async def test_dispatch_new_order_schedules_send(monkeypatch):
    n = WhatsAppNotifier("sid", "tok", "+14155238886")
    sent: dict = {}

    async def fake_send(to, *, sid, variables, fallback_body, label):
        sent.update(to=to, variables=variables, label=label)

    monkeypatch.setattr(n, "_send", fake_send)
    n.dispatch_new_order("+234 901 123 4567", order_id=42, amount_human="5.00")
    assert len(n._tasks) == 1
    await asyncio.gather(*list(n._tasks))
    assert sent["to"] == "whatsapp:+2349011234567"
    assert sent["variables"] == {"1": "42", "2": "5.00"}
    assert sent["label"] == "order=42"


@pytest.mark.asyncio
async def test_dispatch_generic_event_with_template(monkeypatch):
    n = WhatsAppNotifier(
        "sid", "tok", "+14155238886", templates={"order_shipped": "HXship"}
    )
    captured: dict = {}

    async def fake_send(to, *, sid, variables, fallback_body, label):
        captured.update(sid=sid, variables=variables, fallback_body=fallback_body)

    monkeypatch.setattr(n, "_send", fake_send)
    n.dispatch(
        "+2349011234567",
        event="order_shipped",
        variables={"1": "7"},
        label="order=7",
    )
    assert len(n._tasks) == 1
    await asyncio.gather(*list(n._tasks))
    assert captured["sid"] == "HXship"
    assert captured["variables"] == {"1": "7"}
    assert captured["fallback_body"] is None


@pytest.mark.asyncio
async def test_dispatch_skips_event_without_template_or_fallback():
    # Enabled + valid number, but the event has no configured template and
    # no fallback body → nothing scheduled (template-only event).
    n = WhatsAppNotifier("sid", "tok", "+14155238886")
    n.dispatch(
        "+2349011234567", event="order_shipped", variables={"1": "7"}, label="x"
    )
    assert len(n._tasks) == 0
