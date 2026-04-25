"""E2E tests for /sellers/{address}/profile endpoint — Sprint J5 Block 7."""
from __future__ import annotations

import pytest
from httpx import AsyncClient

from tests.e2e.fixtures_data import AISSA, CHIOMA, MAMADOU


pytestmark = pytest.mark.asyncio


async def test_get_chioma_profile_indexer_source(client: AsyncClient):
    """CHIOMA seeded in DB — profile should source from indexer with
    ADR-033 orphan stake (tier=None, 5 USDT) + scenario-3 reputation."""
    r = await client.get(f"/api/v1/sellers/{CHIOMA}/profile")
    assert r.status_code == 200
    data = r.json()

    assert data["seller_address"] == CHIOMA
    assert data["source"] == "indexer"  # row exists in seeded DB

    # ADR-033 orphan signature
    assert data["stake"]["tier"] == "None"
    assert data["stake"]["amount_usdt"] == 5_000_000
    assert data["stake"]["amount_human"] == "5"
    assert data["stake"]["active_sales"] == 0

    # Reputation reflects scenario 3 outcomes
    assert data["reputation"]["orders_completed"] == 11
    assert data["reputation"]["disputes_lost"] == 3
    assert data["reputation"]["is_top_seller"] is False


async def test_get_aissa_profile_rpc_fallback(client: AsyncClient):
    """AISSA NOT seeded in DB — falls back to live RPC. Tier=Starter
    visible from on-chain state (set in J4 scenario 5 pre-setup)."""
    r = await client.get(f"/api/v1/sellers/{AISSA}/profile")
    assert r.status_code == 200
    data = r.json()
    assert data["seller_address"] == AISSA
    assert data["source"] == "rpc_fallback"
    # AISSA was staked Tier.Starter in J4 scenario 5 setup
    assert data["stake"]["tier"] == "Starter"
    assert data["stake"]["amount_usdt"] == 10_000_000


async def test_get_mamadou_profile_rpc_fallback(client: AsyncClient):
    """MAMADOU was buyer-only, never staked. RPC returns tier=None."""
    r = await client.get(f"/api/v1/sellers/{MAMADOU}/profile")
    assert r.status_code == 200
    data = r.json()
    assert data["seller_address"] == MAMADOU
    assert data["source"] == "rpc_fallback"
    assert data["stake"]["tier"] == "None"
    assert data["stake"]["amount_usdt"] == 0


async def test_get_seller_address_normalization(client: AsyncClient):
    """Lookup with mixed-case address still hits the same row."""
    r_lower = await client.get(f"/api/v1/sellers/{CHIOMA}/profile")
    r_upper = await client.get(f"/api/v1/sellers/{CHIOMA.upper()}/profile")
    assert r_lower.status_code == 200 and r_upper.status_code == 200
    assert r_lower.json()["seller_address"] == r_upper.json()["seller_address"] == CHIOMA
