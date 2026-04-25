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


# Postgres ENUM type names (used by SQLAlchemy + Alembic migration)
ORDER_STATUS_ENUM_NAME = "order_status"
ITEM_STATUS_ENUM_NAME = "item_status"
SHIPMENT_STATUS_ENUM_NAME = "shipment_status"
