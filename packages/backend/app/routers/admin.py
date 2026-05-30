"""Admin endpoints — gated by X-Admin-Token header.

Per ADR-056 the admin surface is intentionally minimal in V1: the only
non-stub route is the dispute triage list that backs the wallet-gated
/admin/disputes page. Mediator approval and N2 assignment remain Safe
multisig ops — the admin page only *prepares* the calldata.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_async_db
from app.models.dispute import Dispute
from app.models.enums import DisputeLevel
from app.schemas.dispute import DisputeResponse


router = APIRouter(prefix="/admin", tags=["admin"])


async def verify_admin_token(
    x_admin_token: str | None = Header(default=None, alias="X-Admin-Token"),
) -> None:
    """Reject every admin request unless the caller supplied a matching
    bearer-style token. Empty server-side token → all requests denied
    (defensive default for misconfigured environments)."""
    expected = settings.admin_api_token
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Admin API not configured on this instance",
        )
    if not x_admin_token or x_admin_token != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin token",
        )


@router.get("/users")
async def list_users() -> dict:
    return {"message": "stub", "users": []}


@router.post("/users/{wallet_address}/sanction")
async def sanction_user(wallet_address: str) -> dict:
    return {"message": "stub", "wallet_address": wallet_address}


@router.get(
    "/disputes",
    response_model=list[DisputeResponse],
    dependencies=[Depends(verify_admin_token)],
)
async def list_disputes(
    level: DisputeLevel | None = Query(
        default=None,
        description="Filter by level. Omit to return any level.",
    ),
    resolved: bool | None = Query(
        default=False,
        description="Filter by resolved flag. Default false → only open disputes.",
    ),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_async_db),
) -> list[DisputeResponse]:
    """Triage list for the admin / Safe-owner page (ADR-056)."""
    stmt = select(Dispute).order_by(Dispute.opened_at.desc()).limit(limit)
    if level is not None:
        stmt = stmt.where(Dispute.level == level)
    if resolved is not None:
        stmt = stmt.where(Dispute.resolved.is_(resolved))
    result = await db.execute(stmt)
    return [DisputeResponse.model_validate(d) for d in result.scalars().all()]


@router.post("/disputes/{order_id}/resolve")
async def resolve_dispute(order_id: str) -> dict:
    # Kept as stub — resolution is a Safe op (assign N2 mediator) or a
    # mediator wallet tx (resolveN2Mediation) ; no backend mutation.
    return {"message": "stub", "order_id": order_id}
