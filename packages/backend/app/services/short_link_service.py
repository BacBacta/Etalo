"""Short-link service — create unique 8-char codes that resolve to a
target URL via 302 redirect, with click counting for conversion metrics.

Used by the asset generator to embed `etalo.app/r/{code}` in marketing
captions instead of the full `etalo.app/{handle}/{slug}` so links stay
short and we can count post-click conversions per generated image.
"""
from __future__ import annotations

import logging
import secrets
from typing import Final

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.short_link import ShortLink

logger = logging.getLogger(__name__)

# URL-safe alphanumeric alphabet, 62 chars. 8-char codes give ~218T
# combinations — collision risk negligible at our scale.
_ALPHABET: Final[str] = (
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
)
_CODE_LENGTH: Final[int] = 8
_MAX_RETRIES: Final[int] = 5


async def create_short_link(
    target_url: str, db: AsyncSession
) -> str:
    """Insert a new short link with a fresh 8-char code. Retries on the
    unlikely event of a code collision (uniqueness violation). Returns
    the code (caller composes the full URL).
    """
    for attempt in range(_MAX_RETRIES):
        code = "".join(
            secrets.choice(_ALPHABET) for _ in range(_CODE_LENGTH)
        )
        link = ShortLink(code=code, target_url=target_url)
        db.add(link)
        try:
            await db.commit()
            return code
        except IntegrityError:
            await db.rollback()
            logger.warning(
                "short_link code collision (attempt %d/%d): %s",
                attempt + 1,
                _MAX_RETRIES,
                code,
            )
    raise RuntimeError(
        f"Failed to allocate a unique short code in {_MAX_RETRIES} retries"
    )


async def resolve_and_count(
    code: str, db: AsyncSession
) -> str | None:
    """Look up `code`, increment its click counter, return the target
    URL or None if the code doesn't exist. The counter increment uses
    a single UPDATE (no read-modify-write race)."""
    target = await db.scalar(
        select(ShortLink.target_url).where(ShortLink.code == code)
    )
    if target is None:
        return None
    await db.execute(
        update(ShortLink)
        .where(ShortLink.code == code)
        .values(clicks=ShortLink.clicks + 1)
    )
    await db.commit()
    return target
