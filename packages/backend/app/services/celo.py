"""V2 CeloService — read methods for the V2 contract suite.

Replaces the V1 stub. All public methods are async and return
Pydantic OnChain schemas mirroring the Solidity struct verbatim.

Layering:
- This service is the ONLY place that talks to the chain. Endpoints
  go through it; the indexer goes through a similar layer (Block 5).
- Addresses are normalized to lowercase on output. Internal calls
  to the contracts use checksummed addresses (web3.py requirement).
- BIGINT amounts stay in raw units (USDT smallest = 6 decimals).
- Uninitialized data (order_id 0, unknown ID) returns None gracefully.
- RPC errors propagate as web3.exceptions.* — caller decides how to
  surface (typically as 503 from HTTP routes).
"""
from __future__ import annotations

import json
from pathlib import Path

from web3 import AsyncHTTPProvider, AsyncWeb3

from app.config import settings
from app.models.enums import (
    DisputeLevel,
    ItemStatus,
    OrderStatus,
    SellerStatus,
    ShipmentStatus,
    StakeTier,
)
from app.schemas.onchain import (
    DisputeOnChain,
    ItemOnChain,
    N1ProposalOnChain,
    OrderOnChain,
    ReputationOnChain,
    ShipmentGroupOnChain,
    StakeOnChain,
    WithdrawalStateOnChain,
)


ABI_DIR = Path(__file__).resolve().parent.parent / "abis"
ABI_FILES = {
    "MockUSDT": "MockUSDT.json",
    "EtaloReputation": "EtaloReputation.json",
    "EtaloStake": "EtaloStake.json",
    "EtaloVoting": "EtaloVoting.json",
    "EtaloDispute": "EtaloDispute.json",
    "EtaloEscrow": "EtaloEscrow.json",
}


def _load_abis() -> dict[str, list]:
    out: dict[str, list] = {}
    for name, fname in ABI_FILES.items():
        out[name] = json.loads((ABI_DIR / fname).read_text(encoding="utf-8"))
    return out


def _normalize_address(addr: str) -> str:
    """Lowercased address, no checksum."""
    return addr.lower()


class CeloService:
    """V2 read-only service. Construct via from_settings() or directly
    with a pre-built AsyncWeb3 (used in tests)."""

    def __init__(
        self,
        rpc_url: str,
        addresses: dict[str, str],
        web3: AsyncWeb3 | None = None,
        abis: dict[str, list] | None = None,
    ) -> None:
        self._rpc_url = rpc_url
        self._w3 = web3 or AsyncWeb3(AsyncHTTPProvider(rpc_url))
        abis = abis or _load_abis()

        # Checksum addresses for contract instantiation
        self._addresses = {
            name: AsyncWeb3.to_checksum_address(addr)
            for name, addr in addresses.items()
        }

        self._mock_usdt = self._w3.eth.contract(
            address=self._addresses["mock_usdt"], abi=abis["MockUSDT"]
        )
        self._reputation = self._w3.eth.contract(
            address=self._addresses["reputation"], abi=abis["EtaloReputation"]
        )
        self._stake = self._w3.eth.contract(
            address=self._addresses["stake"], abi=abis["EtaloStake"]
        )
        self._voting = self._w3.eth.contract(
            address=self._addresses["voting"], abi=abis["EtaloVoting"]
        )
        self._dispute = self._w3.eth.contract(
            address=self._addresses["dispute"], abi=abis["EtaloDispute"]
        )
        self._escrow = self._w3.eth.contract(
            address=self._addresses["escrow"], abi=abis["EtaloEscrow"]
        )

    @classmethod
    def from_settings(cls) -> "CeloService":
        return cls(
            rpc_url=settings.celo_sepolia_rpc,
            addresses={
                "mock_usdt": settings.mock_usdt_address,
                "reputation": settings.etalo_reputation_address,
                "stake": settings.etalo_stake_address,
                "voting": settings.etalo_voting_address,
                "dispute": settings.etalo_dispute_address,
                "escrow": settings.etalo_escrow_address,
            },
        )

    # ============================================================
    # Escrow reads
    # ============================================================

    async def get_order(self, order_id: int) -> OrderOnChain | None:
        if order_id <= 0:
            return None
        raw = await self._escrow.functions.getOrder(order_id).call()
        return self._decode_order(raw)

    async def get_item(self, item_id: int) -> ItemOnChain | None:
        if item_id <= 0:
            return None
        raw = await self._escrow.functions.getItem(item_id).call()
        return self._decode_item(raw)

    async def get_order_items(self, order_id: int) -> list[int]:
        if order_id <= 0:
            return []
        raw = await self._escrow.functions.getOrderItems(order_id).call()
        return list(raw)

    async def get_order_groups(self, order_id: int) -> list[int]:
        if order_id <= 0:
            return []
        raw = await self._escrow.functions.getOrderGroups(order_id).call()
        return list(raw)

    async def get_shipment_group(self, group_id: int) -> ShipmentGroupOnChain | None:
        if group_id <= 0:
            return None
        raw = await self._escrow.functions.getShipmentGroup(group_id).call()
        return self._decode_shipment_group(raw)

    # ============================================================
    # Dispute reads
    # ============================================================

    async def get_dispute(self, dispute_id: int) -> DisputeOnChain | None:
        if dispute_id <= 0:
            return None
        raw = await self._dispute.functions.getDispute(dispute_id).call()
        # getDispute returns (uint256 orderId, uint256 itemId, uint8 level, bool resolved)
        if raw[0] == 0:
            return None
        return DisputeOnChain(
            order_id=raw[0],
            item_id=raw[1],
            level=list(DisputeLevel)[raw[2]],
            resolved=raw[3],
        )

    async def get_n1_proposal(self, dispute_id: int) -> N1ProposalOnChain:
        raw = await self._dispute.functions.getN1Proposal(dispute_id).call()
        # (buyerAmount, sellerAmount, buyerProposed, sellerProposed)
        return N1ProposalOnChain(
            buyer_amount=raw[0],
            seller_amount=raw[1],
            buyer_proposed=raw[2],
            seller_proposed=raw[3],
        )

    async def get_n2_mediator(self, dispute_id: int) -> str | None:
        raw = await self._dispute.functions.getN2Mediator(dispute_id).call()
        if int(raw, 16) == 0:
            return None
        return _normalize_address(raw)

    async def has_active_dispute(self, seller: str) -> bool:
        return await self._dispute.functions.hasActiveDispute(
            AsyncWeb3.to_checksum_address(seller)
        ).call()

    # ============================================================
    # Stake reads
    # ============================================================

    async def get_stake(self, seller: str) -> StakeOnChain:
        addr = AsyncWeb3.to_checksum_address(seller)
        amount = await self._stake.functions.getStake(addr).call()
        tier_idx = await self._stake.functions.getTier(addr).call()
        active_sales = await self._stake.functions.getActiveSales(addr).call()
        return StakeOnChain(
            seller=_normalize_address(seller),
            amount=amount,
            tier=list(StakeTier)[tier_idx],
            active_sales=active_sales,
        )

    async def get_withdrawal(self, seller: str) -> WithdrawalStateOnChain:
        addr = AsyncWeb3.to_checksum_address(seller)
        raw = await self._stake.functions.getWithdrawal(addr).call()
        # (amount, targetTier, unlockAt, frozenRemaining, active, freezeCount)
        return WithdrawalStateOnChain(
            amount=raw[0],
            target_tier=list(StakeTier)[raw[1]],
            unlock_at=raw[2],
            frozen_remaining=raw[3],
            active=raw[4],
            freeze_count=raw[5],
        )

    # ============================================================
    # Reputation reads
    # ============================================================

    async def get_reputation(self, seller: str) -> ReputationOnChain:
        addr = AsyncWeb3.to_checksum_address(seller)
        raw = await self._reputation.functions.getReputation(addr).call()
        # SellerReputation struct: ordersCompleted, ordersDisputed, disputesLost,
        # totalVolume, score, isTopSeller, status, lastSanctionAt, firstOrderAt
        return ReputationOnChain(
            seller=_normalize_address(seller),
            orders_completed=raw[0],
            orders_disputed=raw[1],
            disputes_lost=raw[2],
            total_volume=raw[3],
            score=raw[4],
            is_top_seller=raw[5],
            status=list(SellerStatus)[raw[6]],
            last_sanction_at=raw[7],
            first_order_at=raw[8],
        )

    async def is_top_seller(self, seller: str) -> bool:
        addr = AsyncWeb3.to_checksum_address(seller)
        return await self._reputation.functions.isTopSeller(addr).call()

    # ============================================================
    # Decoders (private)
    # ============================================================

    def _decode_order(self, raw: tuple) -> OrderOnChain | None:
        # Order struct fields per EtaloTypes.sol:
        # orderId, buyer, seller, totalAmount, totalCommission, createdAt,
        # fundedAt, isCrossBorder, globalStatus, itemCount, shipmentGroupCount
        if raw[0] == 0:
            return None
        return OrderOnChain(
            order_id=raw[0],
            buyer=_normalize_address(raw[1]),
            seller=_normalize_address(raw[2]),
            total_amount=raw[3],
            total_commission=raw[4],
            created_at=raw[5],
            funded_at=raw[6],
            is_cross_border=raw[7],
            global_status=list(OrderStatus)[raw[8]],
            item_count=raw[9],
            shipment_group_count=raw[10],
        )

    def _decode_item(self, raw: tuple) -> ItemOnChain | None:
        # Item: itemId, orderId, itemPrice, itemCommission,
        # shipmentGroupId, releasedAmount, status
        if raw[0] == 0:
            return None
        return ItemOnChain(
            item_id=raw[0],
            order_id=raw[1],
            item_price=raw[2],
            item_commission=raw[3],
            shipment_group_id=raw[4],
            released_amount=raw[5],
            status=list(ItemStatus)[raw[6]],
        )

    def _decode_shipment_group(self, raw: tuple) -> ShipmentGroupOnChain | None:
        # ShipmentGroup: groupId, orderId, itemIds[], shipmentProofHash,
        # arrivalProofHash, shippedAt, arrivedAt, majorityReleaseAt,
        # finalReleaseAfter, status, releaseStage
        if raw[0] == 0:
            return None
        return ShipmentGroupOnChain(
            group_id=raw[0],
            order_id=raw[1],
            item_ids=list(raw[2]),
            shipment_proof_hash=raw[3],
            arrival_proof_hash=raw[4],
            shipped_at=raw[5],
            arrived_at=raw[6],
            majority_release_at=raw[7],
            final_release_after=raw[8],
            status=list(ShipmentStatus)[raw[9]],
            release_stage=raw[10],
        )
