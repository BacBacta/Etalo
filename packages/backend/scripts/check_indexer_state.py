"""Check indexer cursor + recent orders."""
import asyncio
from app.database import get_async_session_factory
from sqlalchemy import text


async def main():
    sf = get_async_session_factory()
    async with sf() as s:
        print("=== indexer_state ===")
        r = await s.execute(text("SELECT contract_name, last_processed_block FROM indexer_state ORDER BY contract_name"))
        for row in r:
            print(row)

        print("\n=== recent orders ===")
        r = await s.execute(text(
            "SELECT onchain_order_id, buyer_address, total_amount_usdt, created_at_chain, global_status "
            "FROM orders ORDER BY created_at_chain DESC NULLS LAST LIMIT 5"
        ))
        rows = list(r)
        if not rows:
            print("(no orders)")
        for row in rows:
            print(row)


asyncio.run(main())
