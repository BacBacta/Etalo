"""Standalone indexer debug — execute one cycle manually + print
everything that happens."""
import asyncio
import logging
import sys
import traceback

logging.basicConfig(level=logging.DEBUG, format="%(asctime)s %(levelname)s %(name)s — %(message)s")

async def main():
    print("=== Indexer debug ===")
    try:
        from app.config import settings
        print(f"RPC: {settings.celo_sepolia_rpc}")
        print(f"Escrow: {settings.etalo_escrow_address}")
        print(f"Chunk size: {settings.indexer_block_chunk_size}")
        print(f"Indexer enabled: {settings.indexer_enabled}")
        print()

        from app.services.celo import CeloService
        celo = CeloService.from_settings()
        print(f"CeloService init OK, escrow address: {celo._escrow.address}")

        # Get current block
        block = await celo._w3.eth.block_number
        print(f"Current mainnet block: {block}")

        # Try eth_getLogs for escrow with our starting block
        from_block = 67832965
        to_block = from_block + 50
        print(f"\nAttempting get_logs from {from_block} to {to_block}...")
        logs = await celo._w3.eth.get_logs({
            "address": celo._escrow.address,
            "fromBlock": from_block,
            "toBlock": to_block,
        })
        print(f"Got {len(logs)} logs")
        if logs:
            print(f"First log: {logs[0]}")

        # Test indexer
        print("\n=== Running indexer cycle ===")
        from app.database import get_async_session_factory
        from app.services.indexer import Indexer
        indexer = Indexer(celo=celo, session_factory=get_async_session_factory())
        await indexer._poll_cycle()
        print("Indexer cycle completed successfully")

    except Exception as e:
        print(f"\nFATAL: {type(e).__name__}: {e}")
        traceback.print_exc()
        sys.exit(1)

asyncio.run(main())
