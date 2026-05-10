"""GET /r/{code} — public 302 redirect for short marketing links.

Mounted at the root (not /api/v1) because the URLs embedded in seller
captions point at etalo.app/r/{code} — Next.js rewrites /r/* to this
backend path. Keeps the published short URLs short and brand-consistent.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_async_db
from app.services.short_link_service import resolve_and_count

router = APIRouter(prefix="/r", tags=["short-links"])


@router.get("/{code}")
async def redirect_short_link(
    code: str,
    db: Annotated[AsyncSession, Depends(get_async_db)],
) -> RedirectResponse:
    target = await resolve_and_count(code, db)
    if target is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Short link not found or expired",
        )
    return RedirectResponse(url=target, status_code=status.HTTP_302_FOUND)
