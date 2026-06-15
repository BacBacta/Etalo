"""E2E tests for the treasury revenue endpoints (ADR-059 follow-up).

Covers the allowlist gate + response shapes. Does not seed revenue data
— an empty result still exercises the gate, the JSON recap structure,
and the CSV content-type/headers. Detailed aggregation is unit-covered
in the revenue service.
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient

# Lowercased Safe address — present in the default treasury allowlist.
SAFE = "0x10d6ff4eb8372ae20638db1f87a60f31fdf13e0f"
NOT_ADMIN = "0x000000000000000000000000000000000000dead"


@pytest.mark.asyncio
async def test_summary_rejects_non_admin(client: AsyncClient):
    resp = await client.get(
        "/api/v1/treasury/revenue/summary",
        headers={"X-Wallet-Address": NOT_ADMIN},
    )
    assert resp.status_code == 403, resp.text


@pytest.mark.asyncio
async def test_csv_rejects_non_admin(client: AsyncClient):
    resp = await client.get(
        "/api/v1/treasury/revenue.csv",
        headers={"X-Wallet-Address": NOT_ADMIN},
    )
    assert resp.status_code == 403, resp.text


@pytest.mark.asyncio
async def test_summary_shape_for_admin(client: AsyncClient):
    resp = await client.get(
        "/api/v1/treasury/revenue/summary",
        headers={"X-Wallet-Address": SAFE},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "sources" in data
    for key in ("commission", "credits", "creation_fee", "total"):
        assert key in data["sources"]
        assert "count" in data["sources"][key]
        assert "total_usdt" in data["sources"][key]


@pytest.mark.asyncio
async def test_csv_headers_for_admin(client: AsyncClient):
    resp = await client.get(
        "/api/v1/treasury/revenue.csv",
        headers={"X-Wallet-Address": SAFE},
    )
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"].startswith("text/csv")
    assert "attachment" in resp.headers.get("content-disposition", "")
    first_line = resp.text.splitlines()[0]
    assert first_line == "date,source,amount_usdt,reference,counterparty"
    # Recap block present.
    assert "summary_source,count,total_usdt" in resp.text
