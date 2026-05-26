"""Check on-chain order count + recent events on mainnet escrow."""
import asyncio
from app.config import settings
from app.services.celo import CeloService


async def main():
    celo = CeloService.from_settings()
    print(f"Escrow: {celo._escrow.address}")
    print(f"Chain id: {await celo._w3.eth.chain_id}")
    print(f"Current block: {await celo._w3.eth.block_number}")

    # Read on-chain order count
    try:
        count = await celo._escrow.functions.getOrderCount().call()
        print(f"On-chain order count: {count}")
    except Exception as e:
        print(f"getOrderCount failed: {e}")

    # Scan recent escrow logs for OrderCreated events
    deploy_block = 67832965
    to_block = await celo._w3.eth.block_number
    print(f"\nScanning escrow logs from {deploy_block} to {to_block}...")
    # chunk it
    found_total = 0
    chunk = 5000
    start = deploy_block
    while start <= to_block:
        end = min(start + chunk - 1, to_block)
        try:
            logs = await celo._w3.eth.get_logs({
                "address": celo._escrow.address,
                "fromBlock": start,
                "toBlock": end,
            })
            if logs:
                print(f"  blocks {start}-{end}: {len(logs)} logs")
                for log in logs[:3]:
                    print(f"    topic0: {log['topics'][0].hex()}, tx: {log['transactionHash'].hex()}, block: {log['blockNumber']}")
                found_total += len(logs)
        except Exception as e:
            print(f"  blocks {start}-{end}: ERROR {e}")
        start = end + 1
    print(f"\nTotal escrow logs found: {found_total}")


asyncio.run(main())
