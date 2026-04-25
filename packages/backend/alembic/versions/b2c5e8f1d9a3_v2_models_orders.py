"""v2 models orders

Drops V1 `dispute_metadata` and `orders` tables (testnet-only data,
no production migration concern). Creates V2 schema:
- 3 PostgreSQL ENUM types: order_status (9), item_status (7), shipment_status (4)
- orders (V2): one row per on-chain order, BIGINT for USDT amounts
- order_items: 1-N items per order, FK on_delete CASCADE
- shipment_groups: 0-N groups per order, FK on_delete CASCADE
- order_items.shipment_group_id: FK on_delete SET NULL (item survives if group deleted)

Sprint J5 Block 2.

Revision ID: b2c5e8f1d9a3
Revises: a1b2c3d4e5f6
Create Date: 2026-04-25
"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op


revision: str = "b2c5e8f1d9a3"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Enum value lists — must match app/models/enums.py order
ORDER_STATUS_VALUES = (
    "Created", "Funded", "PartiallyShipped", "AllShipped",
    "PartiallyDelivered", "Completed", "Disputed", "Refunded", "Cancelled",
)
ITEM_STATUS_VALUES = (
    "Pending", "Shipped", "Arrived", "Delivered",
    "Released", "Disputed", "Refunded",
)
SHIPMENT_STATUS_VALUES = ("Pending", "Shipped", "Arrived", "Delivered")


def upgrade() -> None:
    bind = op.get_bind()

    # --- 1. Drop V1 tables (FK constraint requires dispute_metadata first)
    op.drop_table("dispute_metadata")
    op.drop_table("orders")

    # --- 2. Create ENUM types
    order_status = postgresql.ENUM(*ORDER_STATUS_VALUES, name="order_status")
    item_status = postgresql.ENUM(*ITEM_STATUS_VALUES, name="item_status")
    shipment_status = postgresql.ENUM(*SHIPMENT_STATUS_VALUES, name="shipment_status")
    order_status.create(bind, checkfirst=True)
    item_status.create(bind, checkfirst=True)
    shipment_status.create(bind, checkfirst=True)

    # --- 3. orders (V2)
    op.create_table(
        "orders",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("onchain_order_id", sa.BigInteger(), nullable=False),
        sa.Column("buyer_address", sa.String(42), nullable=False),
        sa.Column("seller_address", sa.String(42), nullable=False),
        sa.Column("total_amount_usdt", sa.BigInteger(), nullable=False),
        sa.Column("total_commission_usdt", sa.BigInteger(), nullable=False),
        sa.Column("is_cross_border", sa.Boolean(), nullable=False),
        sa.Column(
            "global_status",
            postgresql.ENUM(*ORDER_STATUS_VALUES, name="order_status", create_type=False),
            nullable=False,
            server_default="Created",
        ),
        sa.Column("item_count", sa.SmallInteger(), nullable=False),
        sa.Column("funded_at", sa.DateTime(timezone=True)),
        sa.Column("created_at_chain", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at_db",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("delivery_address", sa.Text()),
        sa.Column("tracking_number", sa.String(100)),
        sa.Column(
            "product_ids",
            postgresql.ARRAY(postgresql.UUID(as_uuid=True)),
        ),
        sa.Column("notes", sa.Text()),
        sa.UniqueConstraint("onchain_order_id", name="uq_orders_onchain_order_id"),
        sa.CheckConstraint(
            "buyer_address ~ '^0x[0-9a-f]{40}$'",
            name="orders_buyer_address_lowercase_hex",
        ),
        sa.CheckConstraint(
            "seller_address ~ '^0x[0-9a-f]{40}$'",
            name="orders_seller_address_lowercase_hex",
        ),
        sa.CheckConstraint(
            "item_count BETWEEN 1 AND 50", name="orders_item_count_range"
        ),
    )
    op.create_index("ix_orders_buyer_address", "orders", ["buyer_address"])
    op.create_index("ix_orders_seller_address", "orders", ["seller_address"])
    op.create_index("ix_orders_global_status", "orders", ["global_status"])
    op.create_index("ix_orders_created_at_chain", "orders", ["created_at_chain"])

    # --- 4. shipment_groups (V2) — created BEFORE order_items so FK resolves
    op.create_table(
        "shipment_groups",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("onchain_group_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "order_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("orders.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "status",
            postgresql.ENUM(*SHIPMENT_STATUS_VALUES, name="shipment_status", create_type=False),
            nullable=False,
            server_default="Pending",
        ),
        sa.Column("proof_hash", sa.LargeBinary()),
        sa.Column("arrival_proof_hash", sa.LargeBinary()),
        sa.Column("release_stage", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("shipped_at", sa.DateTime(timezone=True)),
        sa.Column("arrived_at", sa.DateTime(timezone=True)),
        sa.Column("majority_release_at", sa.DateTime(timezone=True)),
        sa.Column("final_release_after", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("onchain_group_id", name="uq_shipment_groups_onchain_group_id"),
    )
    op.create_index("ix_shipment_groups_order_id", "shipment_groups", ["order_id"])
    op.create_index("ix_shipment_groups_status", "shipment_groups", ["status"])

    # --- 5. order_items (V2)
    op.create_table(
        "order_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("onchain_item_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "order_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("orders.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("item_index", sa.SmallInteger(), nullable=False),
        sa.Column("item_price_usdt", sa.BigInteger(), nullable=False),
        sa.Column("item_commission_usdt", sa.BigInteger(), nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM(*ITEM_STATUS_VALUES, name="item_status", create_type=False),
            nullable=False,
            server_default="Pending",
        ),
        sa.Column(
            "shipment_group_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("shipment_groups.id", ondelete="SET NULL"),
        ),
        sa.Column("released_amount_usdt", sa.BigInteger(), nullable=False, server_default="0"),
        sa.UniqueConstraint("onchain_item_id", name="uq_order_items_onchain_item_id"),
        sa.UniqueConstraint("order_id", "item_index", name="uq_order_items_order_index"),
    )
    op.create_index("ix_order_items_order_id", "order_items", ["order_id"])
    op.create_index(
        "ix_order_items_shipment_group_id", "order_items", ["shipment_group_id"]
    )
    op.create_index("ix_order_items_status", "order_items", ["status"])


def downgrade() -> None:
    bind = op.get_bind()

    # --- 1. Drop V2 tables (in reverse FK order)
    op.drop_index("ix_order_items_status", table_name="order_items")
    op.drop_index("ix_order_items_shipment_group_id", table_name="order_items")
    op.drop_index("ix_order_items_order_id", table_name="order_items")
    op.drop_table("order_items")

    op.drop_index("ix_shipment_groups_status", table_name="shipment_groups")
    op.drop_index("ix_shipment_groups_order_id", table_name="shipment_groups")
    op.drop_table("shipment_groups")

    op.drop_index("ix_orders_created_at_chain", table_name="orders")
    op.drop_index("ix_orders_global_status", table_name="orders")
    op.drop_index("ix_orders_seller_address", table_name="orders")
    op.drop_index("ix_orders_buyer_address", table_name="orders")
    op.drop_table("orders")

    # --- 2. Drop ENUM types
    postgresql.ENUM(name="item_status").drop(bind, checkfirst=True)
    postgresql.ENUM(name="shipment_status").drop(bind, checkfirst=True)
    postgresql.ENUM(name="order_status").drop(bind, checkfirst=True)

    # --- 3. Recreate V1 schema (orders + dispute_metadata)
    op.create_table(
        "orders",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("onchain_order_id", sa.BigInteger(), unique=True),
        sa.Column("buyer_address", sa.String(42), nullable=False),
        sa.Column("seller_address", sa.String(42), nullable=False),
        sa.Column(
            "product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id"),
        ),
        sa.Column("amount_usdt", sa.Numeric(20, 6), nullable=False),
        sa.Column("commission_usdt", sa.Numeric(20, 6), nullable=False),
        sa.Column("status", sa.String(20), server_default="created"),
        sa.Column("is_cross_border", sa.Boolean(), server_default="false"),
        sa.Column("milestones_total", sa.Integer(), server_default="1"),
        sa.Column("milestones_released", sa.Integer(), server_default="0"),
        sa.Column("delivery_address", sa.Text()),
        sa.Column("tracking_number", sa.String(100)),
        sa.Column("tx_hash", sa.String(66)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("shipped_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_orders_status", "orders", ["status"])
    op.create_index("ix_orders_buyer", "orders", ["buyer_address"])
    op.create_index("ix_orders_seller", "orders", ["seller_address"])

    op.create_table(
        "dispute_metadata",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "order_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("orders.id"),
            unique=True,
            nullable=False,
        ),
        sa.Column("onchain_order_id", sa.BigInteger()),
        sa.Column("level", sa.String(20), server_default="L1"),
        sa.Column("issue_type", sa.String(50)),
        sa.Column("reason", sa.Text()),
        sa.Column("photo_ipfs_hashes", postgresql.JSONB()),
        sa.Column("conversation", postgresql.JSONB()),
        sa.Column("mediator_address", sa.String(42)),
        sa.Column("resolution", sa.String(50)),
        sa.Column("refund_amount_usdt", sa.Numeric(20, 6)),
        sa.Column("resolved", sa.Boolean(), server_default="false"),
        sa.Column("opened_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("resolved_at", sa.DateTime(timezone=True)),
    )
