"""SMS delivery-report (DLR) callback — Africa's Talking.

Africa's Talking accepts a message on submit (status "Success",
statusCode 100 = Processed) but the *real* handset delivery status
arrives later via a Delivery Report POSTed to a callback URL. Without
this, we can't tell whether SMS actually reach sellers/buyers (the
Cameroon test showed "Success" on submit yet nothing arrived — a carrier
/ Sender-ID delivery issue invisible from the submit response).

This endpoint receives those DLRs and logs them so ops can see the final
status (Delivered / Failed / Rejected + failureReason) per message.

Configure the URL in the AT dashboard:
  SMS → Delivery Reports / Callback URL →
  https://etalo-api.fly.dev/api/v1/sms/dlr

Public + unauthenticated (AT DLR callbacks carry no auth); the payload is
non-sensitive delivery metadata. Always returns 200 so AT stops retrying.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Request, status

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sms", tags=["sms"])


@router.post("/dlr", status_code=status.HTTP_200_OK)
async def africastalking_delivery_report(request: Request) -> dict:
    """Receive + log an Africa's Talking SMS delivery report.

    AT posts `application/x-www-form-urlencoded` with: id (messageId),
    status, phoneNumber, networkCode, failureReason, retryCount.
    Content-type-agnostic (falls back to JSON) and never raises.
    """
    data: dict = {}
    try:
        form = await request.form()
        data = {k: str(v) for k, v in form.items()}
    except Exception:  # noqa: BLE001
        data = {}
    if not data:
        try:
            data = await request.json()
        except Exception:  # noqa: BLE001
            data = {}

    logger.info(
        "sms.dlr id=%s status=%s phone=%s networkCode=%s failureReason=%s retryCount=%s",
        data.get("id"),
        data.get("status"),
        data.get("phoneNumber"),
        data.get("networkCode"),
        data.get("failureReason"),
        data.get("retryCount"),
    )
    return {"ok": True}
