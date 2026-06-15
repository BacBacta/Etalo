"""Unit tests for the treasury revenue gate + amount formatter (no DB)."""
from __future__ import annotations

from decimal import Decimal

import pytest
from fastapi import HTTPException

from app.config import settings
from app.routers.treasury import require_treasury_admin
from app.services.revenue import _fmt

SAFE = "0x10d6Ff4eb8372aE20638db1f87a60f31fdF13E0F"
OWNER = "0xfcfE723245e1e926Ae676025138cA2C38ecBA8D8"


# ── gate ────────────────────────────────────────────────────
def test_gate_allows_safe_address():
    assert require_treasury_admin(SAFE.lower()) == SAFE.lower()


def test_gate_allows_owner_case_insensitive():
    # get_current_wallet lowercases, but the check is .lower()-safe anyway.
    assert require_treasury_admin(OWNER) == OWNER


def test_gate_rejects_unknown_wallet():
    with pytest.raises(HTTPException) as exc:
        require_treasury_admin("0x000000000000000000000000000000000000dead")
    assert exc.value.status_code == 403


def test_gate_respects_env_override(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(
        settings, "treasury_admin_allowlist", "0xAbC0000000000000000000000000000000000001"
    )
    # Old default addresses no longer authorised…
    with pytest.raises(HTTPException):
        require_treasury_admin(SAFE.lower())
    # …only the configured one is.
    assert (
        require_treasury_admin("0xabc0000000000000000000000000000000000001")
        == "0xabc0000000000000000000000000000000000001"
    )


# ── formatter ───────────────────────────────────────────────
def test_fmt_whole_number():
    assert _fmt(Decimal(1)) == "1"


def test_fmt_two_dp():
    assert _fmt(Decimal("1.26")) == "1.26"


def test_fmt_trims_trailing_zeros():
    assert _fmt(Decimal("0.150000")) == "0.15"
