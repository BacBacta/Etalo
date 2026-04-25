"""Unit tests for V2 CeloService — mocked at the contract-call level.

We mock at the `_contract.functions.<X>(...).call()` boundary rather
than HTTP-mocking via respx, because web3.py 7.x AsyncHTTPProvider
uses aiohttp (not httpx) and respx cannot intercept aiohttp traffic.
Constructor-injected mocks are simpler and don't bind us to a
specific HTTP client.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models.enums import (
    DisputeLevel,
    ItemStatus,
    OrderStatus,
    SellerStatus,
    ShipmentStatus,
    StakeTier,
)
from app.services.celo import CeloService

# Valid checksum addresses (40 hex chars)
CHIOMA = "0xaD7Bbe9b75599D4703e3CA37350998F6C8D89596"
AISSA = "0xcdBA5Ccf538B4088682D2F6408D2305edF4F096B"
DEPLOYER_ADDRS = {
    "mock_usdt": "0x5ce5EBA46a72EA49655367c57334E038Ea1Aa1f3",
    "reputation": "0x2a6639074d0897c6280f55b252B97dd1c39820b7",
    "stake": "0xBB21BAA78f5b0C268eA66912cE8B3E76eB79c417",
    "voting": "0x335Ac0998667F76FE265BC28e6989dc535A901E7",
    "dispute": "0x863F0bBc8d5873fE49F6429A8455236fE51A9aBE",
    "escrow": "0x6caEBc6aDc5082f6B63282e86CaF51AEbd630bfb",
}


def _stub_w3() -> MagicMock:
    """A MagicMock standing in for AsyncWeb3.

    `eth.contract(...)` returns a fresh MagicMock — tests then attach
    AsyncMock-wrapped `.call()` returns to specific contract methods.
    """
    w3 = MagicMock()
    w3.eth.contract = MagicMock(side_effect=lambda **kwargs: MagicMock())
    return w3


# ABI dict keys must match CeloService internal names (contract names,
# not address-dict keys). Mocks bypass the ABI logic.
ABI_KEYS = ["MockUSDT", "EtaloReputation", "EtaloStake", "EtaloVoting", "EtaloDispute", "EtaloEscrow"]


def _make_service() -> CeloService:
    return CeloService(
        rpc_url="http://test",
        addresses=DEPLOYER_ADDRS,
        web3=_stub_w3(),
        abis={k: [] for k in ABI_KEYS},
    )


def _set_call(contract_mock, fn_name: str, return_value):
    """Wire `contract.functions.<fn>(...).call()` to return `return_value`."""
    fn = contract_mock.functions
    method = MagicMock()
    method.return_value.call = AsyncMock(return_value=return_value)
    setattr(fn, fn_name, method)


# ============================================================
# Escrow reads
# ============================================================

@pytest.mark.asyncio
async def test_get_order_happy_path():
    service = _make_service()
    # Order struct: orderId, buyer, seller, totalAmount, totalCommission,
    #   createdAt, fundedAt, isCrossBorder, globalStatus, itemCount, shipmentGroupCount
    raw = (1, CHIOMA, AISSA, 70_000_000, 1_260_000, 1700000000, 1700000100, False, 5, 2, 1)
    _set_call(service._escrow, "getOrder", raw)

    order = await service.get_order(1)
    assert order is not None
    assert order.order_id == 1
    assert order.buyer == CHIOMA.lower()  # lowercased on output
    assert order.seller == AISSA.lower()
    assert order.total_amount == 70_000_000
    assert order.global_status == OrderStatus.COMPLETED
    assert order.item_count == 2


@pytest.mark.asyncio
async def test_get_order_invalid_id_returns_none():
    service = _make_service()
    order_zero = await service.get_order(0)
    assert order_zero is None
    order_neg = await service.get_order(-1)
    assert order_neg is None


@pytest.mark.asyncio
async def test_get_order_uninitialized_struct_returns_none():
    service = _make_service()
    # Solidity returns zero-valued struct for unset mapping access.
    raw = (0, "0x" + "00" * 20, "0x" + "00" * 20, 0, 0, 0, 0, False, 0, 0, 0)
    _set_call(service._escrow, "getOrder", raw)

    assert await service.get_order(99999) is None


@pytest.mark.asyncio
async def test_get_item_happy_path():
    service = _make_service()
    # Item struct: itemId, orderId, itemPrice, itemCommission,
    #   shipmentGroupId, releasedAmount, status
    raw = (5, 3, 35_000_000, 630_000, 4, 35_000_000, 4)
    _set_call(service._escrow, "getItem", raw)

    item = await service.get_item(5)
    assert item is not None
    assert item.item_id == 5
    assert item.order_id == 3
    assert item.item_price == 35_000_000
    assert item.shipment_group_id == 4
    assert item.status == ItemStatus.RELEASED


@pytest.mark.asyncio
async def test_get_order_items_returns_list():
    service = _make_service()
    _set_call(service._escrow, "getOrderItems", [1, 2, 3, 4, 5])

    ids = await service.get_order_items(7)
    assert ids == [1, 2, 3, 4, 5]


@pytest.mark.asyncio
async def test_get_order_items_invalid_id_returns_empty():
    service = _make_service()
    assert await service.get_order_items(0) == []


@pytest.mark.asyncio
async def test_get_shipment_group_happy_path():
    service = _make_service()
    # ShipmentGroup struct
    raw = (
        9,                    # groupId
        10,                   # orderId
        [16, 17, 18],         # itemIds
        b"\x01" * 32,         # shipmentProofHash
        b"\x02" * 32,         # arrivalProofHash
        1700000200,           # shippedAt
        1700000300,           # arrivedAt
        1700000300 + 72*3600, # majorityReleaseAt
        1700000300 + 5*86400, # finalReleaseAfter
        2,                    # status (Arrived)
        1,                    # releaseStage
    )
    _set_call(service._escrow, "getShipmentGroup", raw)

    group = await service.get_shipment_group(9)
    assert group is not None
    assert group.group_id == 9
    assert group.item_ids == [16, 17, 18]
    assert group.status == ShipmentStatus.ARRIVED
    assert group.release_stage == 1
    assert len(group.shipment_proof_hash) == 32


# ============================================================
# Dispute reads
# ============================================================

@pytest.mark.asyncio
async def test_get_dispute_happy_path():
    service = _make_service()
    # getDispute returns (orderId, itemId, level, resolved)
    _set_call(service._dispute, "getDispute", (8, 13, 4, True))

    d = await service.get_dispute(2)
    assert d is not None
    assert d.order_id == 8
    assert d.item_id == 13
    assert d.level == DisputeLevel.RESOLVED
    assert d.resolved is True


@pytest.mark.asyncio
async def test_get_dispute_uninitialized_returns_none():
    service = _make_service()
    _set_call(service._dispute, "getDispute", (0, 0, 0, False))
    assert await service.get_dispute(99999) is None


@pytest.mark.asyncio
async def test_get_n1_proposal():
    service = _make_service()
    _set_call(service._dispute, "getN1Proposal", (15_000_000, 15_000_000, True, True))

    p = await service.get_n1_proposal(2)
    assert p.buyer_amount == 15_000_000
    assert p.seller_amount == 15_000_000
    assert p.buyer_proposed and p.seller_proposed


# ============================================================
# Stake reads
# ============================================================

@pytest.mark.asyncio
async def test_get_stake_top_seller():
    service = _make_service()
    _set_call(service._stake, "getStake", 50_000_000)
    _set_call(service._stake, "getTier", 3)  # TopSeller
    _set_call(service._stake, "getActiveSales", 7)

    s = await service.get_stake(CHIOMA)
    assert s.seller == CHIOMA.lower()
    assert s.amount == 50_000_000
    assert s.tier == StakeTier.TOP_SELLER
    assert s.active_sales == 7


@pytest.mark.asyncio
async def test_get_stake_address_case_normalization():
    service = _make_service()
    _set_call(service._stake, "getStake", 10_000_000)
    _set_call(service._stake, "getTier", 1)
    _set_call(service._stake, "getActiveSales", 0)

    s_lower = await service.get_stake(CHIOMA.lower())
    s_upper = await service.get_stake(CHIOMA.upper())
    assert s_lower.seller == s_upper.seller == CHIOMA.lower()


@pytest.mark.asyncio
async def test_get_stake_orphan_post_slash():
    """ADR-033 fixture: stake amount > 0 but tier == None."""
    service = _make_service()
    _set_call(service._stake, "getStake", 5_000_000)
    _set_call(service._stake, "getTier", 0)  # None
    _set_call(service._stake, "getActiveSales", 0)

    s = await service.get_stake(CHIOMA)
    assert s.amount == 5_000_000
    assert s.tier == StakeTier.NONE


@pytest.mark.asyncio
async def test_get_withdrawal():
    service = _make_service()
    raw = (10_000_000, 0, 0, 14 * 86400, True, 1)  # 14d frozen, freeze=1
    _set_call(service._stake, "getWithdrawal", raw)

    w = await service.get_withdrawal(CHIOMA)
    assert w.amount == 10_000_000
    assert w.target_tier == StakeTier.NONE
    assert w.active is True
    assert w.freeze_count == 1
    assert w.frozen_remaining == 14 * 86400


# ============================================================
# Reputation reads
# ============================================================

@pytest.mark.asyncio
async def test_get_reputation_top_seller():
    service = _make_service()
    # SellerReputation: ordersCompleted, ordersDisputed, disputesLost,
    #   totalVolume, score, isTopSeller, status, lastSanctionAt, firstOrderAt
    raw = (75, 0, 0, 5_000_000_000, 95, True, 0, 0, 1700000000)
    _set_call(service._reputation, "getReputation", raw)

    r = await service.get_reputation(CHIOMA)
    assert r.orders_completed == 75
    assert r.is_top_seller is True
    assert r.status == SellerStatus.ACTIVE
    assert r.total_volume == 5_000_000_000
    assert r.first_order_at == 1700000000


@pytest.mark.asyncio
async def test_is_top_seller():
    service = _make_service()
    _set_call(service._reputation, "isTopSeller", True)

    assert await service.is_top_seller(CHIOMA) is True


# ============================================================
# Bigint roundtrip integrity
# ============================================================

@pytest.mark.asyncio
async def test_bigint_roundtrip_no_loss():
    """Ensure large-but-realistic USDT amounts survive the schema unchanged."""
    service = _make_service()
    # 49,999.999_999 USDT = 49_999_999_999 raw (just under MAX_TVL = 50000)
    big_amount = 49_999_999_999
    raw = (1, CHIOMA, AISSA, big_amount, big_amount // 50, 0, 0, True, 1, 1, 0)
    _set_call(service._escrow, "getOrder", raw)

    order = await service.get_order(1)
    assert order is not None
    assert order.total_amount == big_amount
    assert order.total_amount_human > 49_999  # Decimal precision intact
