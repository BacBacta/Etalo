"""Cleanup seller profiles whose handles match obvious test patterns.

Targets : `test-*`, `debug-*`, `*-debug-*`, plus the well-known `boutique-smoke`
seed (its dedicated re-seed script handles its own cleanup, but this
sweep covers the case where the seed ran in prod by accident).

Idempotent : safe to re-run, only deletes rows it finds. Prints a
summary of what it removed so the operator gets a paper trail.

Usage :
    cd packages/backend
    venv/Scripts/python.exe scripts/cleanup_test_sellers.py

Dry-run (default, doesn't modify the DB) :
    venv/Scripts/python.exe scripts/cleanup_test_sellers.py

Apply (actually deletes) :
    venv/Scripts/python.exe scripts/cleanup_test_sellers.py --apply

Caveats :
- DATABASE_URL env var must point at the target DB (typically loaded
  from packages/backend/.env). The script doesn't validate environment ;
  if you run it against prod, you're deleting from prod.
- Orders that reference deleted sellers are NOT cleaned ; the script
  refuses to delete a seller that has any non-cancelled orders. Test
  sellers shouldn't have real orders, so this is a safety net more
  than a feature.
- Products are cascaded explicitly so the script works regardless of
  the ORM `ondelete=` configuration.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

# Ensure `app` package is importable regardless of cwd
BACKEND_DIR = Path(__file__).resolve().parent.parent
os.chdir(BACKEND_DIR)
sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import delete, func, or_, select  # noqa: E402

from app.database import get_async_session_factory  # noqa: E402
from app.models.order import Order  # noqa: E402
from app.models.product import Product  # noqa: E402
from app.models.seller_profile import SellerProfile  # noqa: E402
from app.models.user import User  # noqa: E402

# Handles considered "obvious test" :
# - anything beginning with `test-` or `debug-`
# - anything containing `-debug-` (e.g. `test-debug-after-deploy`)
# - the well-known seed handle `boutique-smoke`
TEST_HANDLE_FILTERS = [
    SellerProfile.shop_handle.like("test-%"),
    SellerProfile.shop_handle.like("debug-%"),
    SellerProfile.shop_handle.like("%-debug-%"),
    SellerProfile.shop_handle == "boutique-smoke",
]

# Order statuses that count as "real activity" — if a test seller
# somehow has one of these, we skip them and ask the operator to
# investigate manually rather than silently nuking real escrow state.
LIVE_ORDER_STATUSES = ("Funded", "Shipped", "Delivered", "Completed", "Disputed")


async def main(apply: bool) -> None:
    factory = get_async_session_factory()

    async with factory() as db:
        sellers = (
            await db.scalars(
                select(SellerProfile).where(or_(*TEST_HANDLE_FILTERS))
            )
        ).all()

        if not sellers:
            print("[OK] No test sellers found, nothing to clean.")
            return

        print(f"[INFO] Found {len(sellers)} test seller(s) :")
        for s in sellers:
            print(f"  - @{s.shop_handle} (seller_id={s.id}, user_id={s.user_id})")

        seller_ids = [s.id for s in sellers]

        # Safety check : refuse to delete a seller that has live orders.
        # `Order.seller_id` is the FK from orders to seller_profiles.
        live_order_count = (
            await db.scalar(
                select(func.count(Order.id))
                .where(Order.seller_id.in_(seller_ids))
                .where(Order.global_status.in_(LIVE_ORDER_STATUSES))
            )
        ) or 0

        if live_order_count > 0:
            print(
                f"[ABORT] {live_order_count} live order(s) reference these "
                "sellers. Aborting — investigate manually before re-running.",
                file=sys.stderr,
            )
            sys.exit(2)

        product_count = (
            await db.scalar(
                select(func.count(Product.id)).where(Product.seller_id.in_(seller_ids))
            )
        ) or 0
        user_ids = [s.user_id for s in sellers]

        print(
            f"[INFO] Would delete {len(seller_ids)} seller(s), "
            f"{product_count} product(s), {len(user_ids)} user(s)."
        )

        if not apply:
            print("[DRY-RUN] Re-run with --apply to actually delete.")
            return

        await db.execute(delete(Product).where(Product.seller_id.in_(seller_ids)))
        await db.execute(
            delete(SellerProfile).where(SellerProfile.id.in_(seller_ids))
        )
        # Delete user rows last so we don't violate FK ordering. We delete
        # them too because the wallet addresses are obvious test patterns
        # (0x9999...9999 etc.) — keeping the User row would leave dangling
        # rows for no reason.
        await db.execute(delete(User).where(User.id.in_(user_ids)))
        await db.commit()
        print(
            f"[DONE] Deleted {len(seller_ids)} seller(s), "
            f"{product_count} product(s), {len(user_ids)} user(s)."
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually delete rows ; without this flag the script only prints what would happen.",
    )
    args = parser.parse_args()
    asyncio.run(main(apply=args.apply))
