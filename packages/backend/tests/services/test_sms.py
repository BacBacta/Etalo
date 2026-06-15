"""Unit tests for the Africa's Talking SMS notifier + composite fan-out."""
from __future__ import annotations

import pytest

from app.services.sms import (
    CompositeNotifier,
    SmsNotifier,
    format_sms_number,
    render_sms,
)

FRONTEND = "https://etalo.xyz"
EVENTS = (
    "order_funded",
    "dispute_opened",
    "funds_released",
    "order_refunded",
    "order_shipped",
    "order_delivered",
)


# ── number normalization ───────────────────────────────────
def test_number_normalizes_with_plus():
    assert format_sms_number("+234 901 123 4567") == "+2349011234567"


def test_number_rejected_without_plus():
    assert format_sms_number("0901 123 4567") is None


def test_number_rejected_empty_or_short():
    assert format_sms_number("") is None
    assert format_sms_number(None) is None
    assert format_sms_number("+123") is None


# ── render_sms ──────────────────────────────────────────────
@pytest.mark.parametrize("event", EVENTS)
def test_render_returns_text_for_every_event(event):
    body = render_sms(event, {"1": "42", "2": "12.50"}, FRONTEND)
    assert body and "Etalo" in body and "42" in body


def test_render_unknown_event_is_none():
    assert render_sms("nope", {"1": "1"}, FRONTEND) is None


def test_render_includes_amount_where_relevant():
    assert "12.50 USDT" in render_sms("funds_released", {"1": "1", "2": "12.50"}, FRONTEND)


# ── SmsNotifier enable/skip ─────────────────────────────────
def test_notifier_disabled_without_creds():
    assert SmsNotifier("", "").enabled is False


def test_notifier_enabled_with_creds():
    assert SmsNotifier("user", "key").enabled is True


def test_dispatch_noop_when_disabled():
    # No creds → dispatch must be a silent no-op (no task scheduled, no raise).
    SmsNotifier("", "").dispatch("+2349011234567", body="hi", label="x")


# ── CompositeNotifier fan-out ───────────────────────────────
class _Spy:
    def __init__(self, enabled=True):
        self.enabled = enabled
        self.calls: list[tuple] = []

    def dispatch(self, to, **kw):
        self.calls.append(("dispatch", to, kw))

    def dispatch_new_order(self, to, **kw):
        self.calls.append(("new_order", to, kw))


def test_composite_fans_out_to_both_channels():
    wa, sms = _Spy(), _Spy()
    c = CompositeNotifier(whatsapp=wa, sms=sms, frontend_base_url=FRONTEND)
    c.dispatch("+2349011234567", event="funds_released",
               variables={"1": "9", "2": "5.00"}, label="order=9")
    assert len(wa.calls) == 1 and len(sms.calls) == 1
    # WhatsApp gets the template event+variables; SMS gets a rendered body.
    assert wa.calls[0][2]["event"] == "funds_released"
    assert "5.00 USDT" in sms.calls[0][2]["body"]


def test_composite_new_order_fans_out():
    wa, sms = _Spy(), _Spy()
    c = CompositeNotifier(whatsapp=wa, sms=sms, frontend_base_url=FRONTEND)
    c.dispatch_new_order("+2349011234567", order_id=7, amount_human="70.00")
    assert wa.calls[0][0] == "new_order"
    assert "order #7" in sms.calls[0][2]["body"] and "70.00" in sms.calls[0][2]["body"]


def test_composite_channels_reports_enabled():
    c = CompositeNotifier(whatsapp=_Spy(enabled=True), sms=_Spy(enabled=False))
    assert c.channels == ["whatsapp"]
