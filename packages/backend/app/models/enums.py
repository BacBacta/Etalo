"""V2 model enums — mirror Solidity EtaloTypes.sol.

Member declaration order matches the on-chain enum index 1:1 so that
the indexer can map `uint8` event values to enum members via
`list(OrderStatus)[idx]`. Do not reorder.
"""
from __future__ import annotations

from enum import Enum


class OrderStatus(str, Enum):
    """EtaloTypes.OrderStatus — 9 states, mirrors contract uint8 0..8.

    Note: `Disputed` is rarely persisted on-chain in V2 (per Block 7
    design, item-level disputes do not flip the order to Disputed
    unless every item is in dispute). Indexer should still accept it.
    """
    CREATED = "Created"                    # 0
    FUNDED = "Funded"                      # 1
    PARTIALLY_SHIPPED = "PartiallyShipped" # 2
    ALL_SHIPPED = "AllShipped"             # 3
    PARTIALLY_DELIVERED = "PartiallyDelivered"  # 4
    COMPLETED = "Completed"                # 5
    DISPUTED = "Disputed"                  # 6
    REFUNDED = "Refunded"                  # 7
    CANCELLED = "Cancelled"                # 8


class ItemStatus(str, Enum):
    """EtaloTypes.ItemStatus — 7 states, mirrors contract uint8 0..6."""
    PENDING = "Pending"      # 0
    SHIPPED = "Shipped"      # 1
    ARRIVED = "Arrived"      # 2
    DELIVERED = "Delivered"  # 3
    RELEASED = "Released"    # 4
    DISPUTED = "Disputed"    # 5
    REFUNDED = "Refunded"    # 6


class ShipmentStatus(str, Enum):
    """EtaloTypes.ShipmentStatus — 4 states, mirrors contract uint8 0..3."""
    PENDING = "Pending"      # 0
    SHIPPED = "Shipped"      # 1
    ARRIVED = "Arrived"      # 2
    DELIVERED = "Delivered"  # 3


class DisputeLevel(str, Enum):
    """EtaloDispute LEVEL_* constants — uint8 0..4.

    Contract has LEVEL_NONE=0 (uninitialized; openDispute immediately
    sets to LEVEL_N1=1). NONE is included here so the indexer can map
    `uint8` directly via `list(DisputeLevel)[idx]`. NONE should never
    appear in persisted rows.
    """
    NONE = "None"                  # 0 — uninitialized, not persisted
    N1_AMICABLE = "N1_Amicable"    # 1 — bilateral 48h
    N2_MEDIATION = "N2_Mediation"  # 2 — assigned mediator 7d
    N3_VOTING = "N3_Voting"        # 3 — community vote 14d
    RESOLVED = "Resolved"          # 4 — terminal


class StakeTier(str, Enum):
    """EtaloTypes.StakeTier — 4 values, mirrors contract uint8 0..3.

    Contract enum starts at None=0 (sellers without stake). The indexer
    maps `uint8` via `list(StakeTier)[idx]`.
    """
    NONE = "None"                  # 0 — no stake; cannot sell cross-border
    STARTER = "Starter"            # 1 — 10 USDT, max 3 concurrent / 100 USDT order
    ESTABLISHED = "Established"    # 2 — 25 USDT, max 10 concurrent / 200 USDT order
    TOP_SELLER = "TopSeller"       # 3 — 50 USDT, unlimited (also requires Top Seller reputation)


class SellerStatus(str, Enum):
    """EtaloReputation.SellerStatus — 3 values for sanction/ban tracking."""
    ACTIVE = "Active"        # 0 — default, can sell
    SUSPENDED = "Suspended"  # 1 — temporary sanction
    BANNED = "Banned"        # 2 — permanent


# Postgres ENUM type names (used by SQLAlchemy + Alembic migration)
ORDER_STATUS_ENUM_NAME = "order_status"
ITEM_STATUS_ENUM_NAME = "item_status"
SHIPMENT_STATUS_ENUM_NAME = "shipment_status"
DISPUTE_LEVEL_ENUM_NAME = "dispute_level"
STAKE_TIER_ENUM_NAME = "stake_tier"
SELLER_STATUS_ENUM_NAME = "seller_status"
