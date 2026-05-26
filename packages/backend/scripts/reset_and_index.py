"""Reset cursor + run one indexer cycle synchronously with verbose decode."""
import asyncio
import logging
import traceback

logging.basicConfig(level=logging.DEBUG, format="%(levelname)s %(name)s — %(message)s")

# Silence noisy libraries
logging.getLogger("web3").setLevel(logging.INFO)
logging.getLogger("aiohttp").setLevel(logging.INFO)
logging.getLogger("urllib3").setLevel(logging.INFO)
logging.getLogger("sqlalchemy").setLevel(logging.WARNING)


async def main():
    from app.config import settings
    from app.database import get_async_session_factory
    from app.services.celo import CeloService
    from app.services.indexer import Indexer
    from app.models.indexer_state import IndexerState
    from sqlalchemy import select, text

    sf = get_async_session_factory()

    # Reset cursor
    async with sf() as db:
        await db.execute(text("UPDATE indexer_state SET last_processed_block = 67832965"))
        await db.commit()
        print(">>> reset all cursors to 67832965")

    celo = CeloService.from_settings()
    print(f">>> escrow: {celo._escrow.address}")
    print(f">>> chunk_size: {settings.indexer_block_chunk_size}")

    # Test direct get_logs for escrow + decode
    print("\n>>> Manual scan of escrow events at Mike's order blocks 67844000-67844200")
    logs = await celo._w3.eth.get_logs({
        "address": celo._escrow.address,
        "fromBlock": 67844000,
        "toBlock": 67844200,
    })
    print(f">>> got {len(logs)} raw logs")
    for log in logs:
        print(f"  block={log['blockNumber']} tx={log['transactionHash'].hex()[:18]}... topic0={log['topics'][0].hex()[:18]}...")
        # Try to decode
        for ev in celo._escrow.events:
            try:
                decoded = ev().process_log(log)
                print(f"    DECODED as {decoded['event']}: {dict(decoded['args'])}")
                break
            except Exception as e:
                pass
        else:
            print(f"    NO MATCH in escrow ABI")

    # Now run the indexer cycle
    print("\n>>> Running indexer cycle...")
    indexer = Indexer(celo=celo, session_factory=sf)
    try:
        await indexer._poll_cycle()
    except Exception as e:
        print(f"FATAL: {e}")
        traceback.print_exc()

    # Inspect results
    async with sf() as db:
        r = await db.execute(text("SELECT contract_name, last_processed_block FROM indexer_state ORDER BY contract_name"))
        print("\n>>> Cursor state after cycle:")
        for row in r:
            print(f"  {row}")

        r = await db.execute(text("SELECT COUNT(*) FROM indexer_events_processed"))
        print(f">>> events_processed count: {list(r)[0][0]}")

        r = await db.execute(text("SELECT COUNT(*) FROM orders"))
        print(f">>> orders count: {list(r)[0][0]}")


asyncio.run(main())
