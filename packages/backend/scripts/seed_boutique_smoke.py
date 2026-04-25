"""One-shot smoke seed for J6 Block 2 Étape B web boutique page.

Inserts a deterministic seller `boutique-smoke` with 3 active products
and 1 draft product. Idempotent — safe to re-run; it cleans up prior
seed before re-inserting.

Usage:
    venv/Scripts/python.exe scripts/seed_boutique_smoke.py
"""
from __future__ import annotations

import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

# Ensure `app` package is importable regardless of cwd
BACKEND_DIR = Path(__file__).resolve().parent.parent
os.chdir(BACKEND_DIR)
sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import delete, select

from app.database import get_async_session_factory
from app.models.product import Product
from app.models.seller_profile import SellerProfile
from app.models.user import User

HANDLE = "boutique-smoke"


async def main() -> None:
    factory = get_async_session_factory()

    # Cleanup prior seed
    async with factory() as db:
        existing = (
            await db.scalars(
                select(SellerProfile).where(SellerProfile.shop_handle == HANDLE)
            )
        ).all()
        if existing:
            seller_ids = [s.id for s in existing]
            user_ids = [s.user_id for s in existing]
            await db.execute(delete(Product).where(Product.seller_id.in_(seller_ids)))
            await db.execute(delete(SellerProfile).where(SellerProfile.id.in_(seller_ids)))
            await db.execute(delete(User).where(User.id.in_(user_ids)))
            await db.commit()

    # Insert seed
    async with factory() as db:
        user = User(
            id=uuid.uuid4(),
            wallet_address="0x" + "b0" * 20,  # 0xb0b0…b0b0 (42 chars)
            country="NGA",
        )
        db.add(user)
        await db.flush()

        seller = SellerProfile(
            id=uuid.uuid4(),
            user_id=user.id,
            shop_handle=HANDLE,
            shop_name="Boutique Smoke",
            logo_ipfs_hash="QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG",
        )
        db.add(seller)
        await db.flush()

        base = datetime(2026, 4, 25, 10, 0, 0, tzinfo=timezone.utc)
        for i, (slug, title) in enumerate(
            [
                ("dress-red", "Red Ankara Dress"),
                ("scarf-silk", "Silk Scarf"),
                ("bag-leather", "Leather Bag"),
            ]
        ):
            db.add(
                Product(
                    id=uuid.uuid4(),
                    seller_id=seller.id,
                    title=title,
                    slug=slug,
                    price_usdt=Decimal(f"{15.00 + i * 5}"),
                    stock=10 if i != 1 else 0,
                    status="active",
                    image_ipfs_hashes=[
                        "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG"
                    ],
                    created_at=base.replace(hour=10 + i),
                )
            )

        # One draft (must NOT appear in boutique listing)
        db.add(
            Product(
                id=uuid.uuid4(),
                seller_id=seller.id,
                title="Draft Item",
                slug="draft-item",
                price_usdt=Decimal("99.99"),
                stock=0,
                status="draft",
                image_ipfs_hashes=None,
            )
        )

        await db.commit()

    print(f"Seeded /{HANDLE} with 3 active + 1 draft products.")


if __name__ == "__main__":
    asyncio.run(main())
