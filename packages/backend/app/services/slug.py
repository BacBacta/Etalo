"""
Slug helpers. Kept in its own module so both app runtime code and
Alembic migrations can import the same logic (no duplication drift).
"""

import re
import unicodedata
import uuid

MAX_SLUG_LENGTH = 60


def slugify(value: str) -> str:
    """
    Turn a free-form string into a URL-safe slug.

    Lowercases, strips accents, replaces non-alphanumeric runs with
    single hyphens, trims leading/trailing hyphens, caps at 60 chars.
    Returns an empty string for inputs with no slug-able characters —
    callers must handle that fallback.
    """
    norm = unicodedata.normalize("NFKD", value)
    ascii_only = norm.encode("ascii", "ignore").decode()
    lowered = ascii_only.lower()
    # Replace anything that isn't a-z0-9 with a hyphen, then collapse.
    hyphenated = re.sub(r"[^a-z0-9]+", "-", lowered)
    trimmed = hyphenated.strip("-")
    return trimmed[:MAX_SLUG_LENGTH]


def short_uuid_suffix() -> str:
    """8-char hex suffix used to disambiguate colliding slugs."""
    return uuid.uuid4().hex[:8]


def build_unique_slug(title: str, existing: set[str]) -> str:
    """
    Build a slug for `title`. If it collides with `existing` (slugs
    already taken for the same seller), append `-{8hex}` until unique.
    If the title produces an empty slug (e.g. emoji-only title), fall
    back to `item-{8hex}`.
    """
    base = slugify(title) or "item"
    candidate = base
    while candidate in existing:
        candidate = f"{base}-{short_uuid_suffix()}"[:MAX_SLUG_LENGTH]
    return candidate
