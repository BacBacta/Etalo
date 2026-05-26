"""Inspect order #1 + its items + products."""
import asyncio
from app.database import get_async_session_factory
from sqlalchemy import text


async def main():
    sf = get_async_session_factory()
    async with sf() as s:
        print("=== orders ===")
        r = await s.execute(text(
            "SELECT id, onchain_order_id, buyer_address, seller_address, total_amount_usdt, "
            "global_status, funded_at FROM orders"
        ))
        for row in r:
            print(row)

        print("\n=== order_items ===")
        r = await s.execute(text(
            "SELECT id, order_id, onchain_item_id, item_index, item_price_usdt, status "
            "FROM order_items"
        ))
        rows = list(r)
        if not rows:
            print("(no items)")
        for row in rows:
            print(row)

        print("\n=== shipment_groups ===")
        r = await s.execute(text("SELECT id, order_id, onchain_group_id, status FROM shipment_groups"))
        rows = list(r)
        if not rows:
            print("(no groups)")
        for row in rows:
            print(row)

        print("\n=== products (count) ===")
        r = await s.execute(text("SELECT COUNT(*) FROM products"))
        print(list(r))


asyncio.run(main())
