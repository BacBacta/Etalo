from app.config import settings


class CeloService:
    """Celo blockchain interaction service."""

    def __init__(self):
        self.rpc_url = settings.celo_rpc_url
        self.escrow_address = settings.escrow_contract_address
        self.dispute_address = settings.dispute_contract_address
        self.reputation_address = settings.reputation_contract_address

    async def get_order(self, order_id: int) -> dict:
        """Fetch order data from EtaloEscrow contract."""
        # TODO: implement with web3/viem RPC calls
        return {"status": "stub", "order_id": order_id}

    async def get_reputation(self, wallet_address: str) -> dict:
        """Fetch seller reputation from EtaloReputation contract."""
        return {"status": "stub", "wallet_address": wallet_address}

    async def is_top_seller(self, wallet_address: str) -> bool:
        """Check if a seller has Top Seller status."""
        return False


celo_service = CeloService()
