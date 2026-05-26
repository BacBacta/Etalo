"""Inspect dispute state for orders in dispute."""
import asyncio
from app.database import get_async_session_factory
from app.services.celo import CeloService
from sqlalchemy import text


async def main():
    sf = get_async_session_factory()
    celo = CeloService.from_settings()

    async with sf() as db:
        print("=== disputes (DB) ===")
        rows = await db.execute(text(
            "SELECT onchain_dispute_id, order_id, order_item_id, level, "
            "buyer_address, seller_address, n1_deadline, resolved, reason, "
            "buyer_proposal_amount_usdt, seller_proposal_amount_usdt, "
            "n2_mediator_address, vote_id "
            "FROM disputes ORDER BY onchain_dispute_id"
        ))
        for row in rows:
            print(row)

        print("\n=== order #4 chain state ===")
        chain_order = await celo.get_order(4)
        print(f"  global_status: {chain_order.global_status if chain_order else 'N/A'}")
        chain_items = await celo.get_order_items(4)
        for iid in chain_items:
            item = await celo.get_item(iid)
            print(f"  item #{iid}: status={item.status if item else 'N/A'}")


asyncio.run(main())
