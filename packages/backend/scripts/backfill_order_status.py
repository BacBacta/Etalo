"""Backfill order.global_status for every order from on-chain truth.

Run once after merging the indexer rollup fix to clear drift from
orders whose status events never triggered the new sync (eg. orders
shipped before the fix landed).
"""
import asyncio
from app.database import get_async_session_factory
from app.services.celo import CeloService
from sqlalchemy import text


async def main():
    celo = CeloService.from_settings()
    sf = get_async_session_factory()
    async with sf() as db:
        rows = await db.execute(
            text("SELECT id, onchain_order_id, global_status FROM orders ORDER BY onchain_order_id")
        )
        orders = list(rows)
        print(f"Re-syncing {len(orders)} orders from chain")
        changes = 0
        for row in orders:
            chain = await celo.get_order(row.onchain_order_id)
            if chain is None:
                print(f"  order #{row.onchain_order_id}: NOT ON CHAIN, skip")
                continue
            if chain.global_status.value != row.global_status:
                print(
                    f"  order #{row.onchain_order_id}: {row.global_status} -> {chain.global_status.value}"
                )
                await db.execute(
                    text("UPDATE orders SET global_status = :s WHERE id = :id"),
                    {"s": chain.global_status.value, "id": row.id},
                )
                changes += 1
            else:
                print(f"  order #{row.onchain_order_id}: {row.global_status} (no change)")
        if changes > 0:
            await db.commit()
            print(f"\nCommitted {changes} status updates.")
        else:
            print("\nNo drift detected.")


asyncio.run(main())
