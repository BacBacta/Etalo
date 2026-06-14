"""Unit tests for the ADR-059 creation-fee gate (no DB required).

Covers the pure policy logic in app.services.boutique_billing:
- fees_enforced() date window (empty / future / past);
- require_creation_fee_paid() free-window no-op, enforced+paid pass,
  enforced+unpaid 402.

The DB read (`has_paid_creation_fee`) is exercised with a tiny stub
Session so these run in plain CI without Postgres. End-to-end coverage
against the real mirror lives in tests/e2e/test_boutique_billing_e2e.py.
"""
from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.config import settings
from app.services import boutique_billing as bb


class _StubQuery:
    def __init__(self, result):
        self._result = result

    def filter(self, *args, **kwargs):
        return self

    def one_or_none(self):
        return self._result


class _StubSession:
    """Minimal sync-Session stand-in: db.query(...).filter(...).one_or_none()."""

    def __init__(self, result):
        self._result = result

    def query(self, *args, **kwargs):
        return _StubQuery(self._result)


def _row(paid_at):
    return type("Row", (), {"creation_paid_at": paid_at})()


# ── fees_enforced ──────────────────────────────────────────
def test_fees_not_enforced_when_unset(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "fees_enforced_from", "")
    assert bb.fees_enforced() is False


def test_fees_not_enforced_before_date(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "fees_enforced_from", "2999-01-01T00:00:00+00:00")
    assert bb.fees_enforced() is False


def test_fees_enforced_after_date(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "fees_enforced_from", "2020-01-01T00:00:00+00:00")
    assert bb.fees_enforced() is True


def test_fees_enforced_naive_date_treated_utc(monkeypatch: pytest.MonkeyPatch):
    # A date without tzinfo is interpreted as UTC, not crash.
    monkeypatch.setattr(settings, "fees_enforced_from", "2020-01-01T00:00:00")
    assert bb.fees_enforced() is True


# ── require_creation_fee_paid ──────────────────────────────
def test_gate_noop_during_free_window(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "fees_enforced_from", "")
    # Session is never queried during the free window — pass None safely.
    bb.require_creation_fee_paid(None, "0xabc")  # must not raise


def test_gate_passes_when_paid(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "fees_enforced_from", "2020-01-01T00:00:00+00:00")
    db = _StubSession(_row(datetime(2026, 6, 15, tzinfo=timezone.utc)))
    bb.require_creation_fee_paid(db, "0xABC")  # must not raise


def test_gate_402_when_enforced_and_unpaid(monkeypatch: pytest.MonkeyPatch):
    from fastapi import HTTPException

    monkeypatch.setattr(settings, "fees_enforced_from", "2020-01-01T00:00:00+00:00")
    db = _StubSession(None)
    with pytest.raises(HTTPException) as exc:
        bb.require_creation_fee_paid(db, "0xABC")
    assert exc.value.status_code == 402
    assert exc.value.detail["code"] == "creation_fee_required"


def test_gate_402_when_row_exists_but_unpaid(monkeypatch: pytest.MonkeyPatch):
    from fastapi import HTTPException

    monkeypatch.setattr(settings, "fees_enforced_from", "2020-01-01T00:00:00+00:00")
    db = _StubSession(_row(None))  # row present but creation_paid_at NULL
    with pytest.raises(HTTPException) as exc:
        bb.require_creation_fee_paid(db, "0xABC")
    assert exc.value.status_code == 402
