"""Check indexer_events_processed + decode event signatures."""
import asyncio
from app.database import get_async_session_factory
from sqlalchemy import text


async def main():
    sf = get_async_session_factory()
    async with sf() as s:
        print("=== indexer_events_processed (count by tx) ===")
        r = await s.execute(text(
            "SELECT COUNT(*), MIN(block_number), MAX(block_number) FROM indexer_events_processed"
        ))
        print(list(r))

        print("\n=== recent indexer events ===")
        r = await s.execute(text(
            "SELECT block_number, tx_hash, log_index FROM indexer_events_processed ORDER BY block_number DESC LIMIT 10"
        ))
        for row in r:
            print(row)

        print("\n=== products count ===")
        r = await s.execute(text("SELECT COUNT(*) FROM products"))
        print(list(r))


asyncio.run(main())
