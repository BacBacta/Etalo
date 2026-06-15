"""E2E test for the Africa's Talking SMS delivery-report callback."""
from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_dlr_accepts_form_post(client: AsyncClient):
    resp = await client.post(
        "/api/v1/sms/dlr",
        data={
            "id": "ATXid_test123",
            "status": "Failed",
            "phoneNumber": "+237681735135",
            "networkCode": "62402",
            "failureReason": "InvalidSenderId",
            "retryCount": "1",
        },
    )
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"ok": True}


@pytest.mark.asyncio
async def test_dlr_tolerates_empty_body(client: AsyncClient):
    # AT must always get a 200 so it stops retrying — even on odd payloads.
    resp = await client.post("/api/v1/sms/dlr")
    assert resp.status_code == 200, resp.text
