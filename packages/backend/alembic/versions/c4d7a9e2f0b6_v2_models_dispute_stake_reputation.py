"""v2 models dispute stake reputation

Adds Block 3 V2 models:
- 3 PostgreSQL ENUM types: dispute_level (5), stake_tier (4), seller_status (3)
- disputes (mirror EtaloDispute.Dispute struct + N1 proposals + JSONB metadata)
- stakes (one row per seller, embedded withdrawal state per ADR-021)
- reputation_cache (one row per seller, indexed from
  EtaloReputation OrderRecorded/DisputeRecorded events)

Sprint J5 Block 3.

Revision ID: c4d7a9e2f0b6
Revises: b2c5e8f1d9a3
Create Date: 2026-04-25
"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op


revision: str = "c4d7a9e2f0b6"
down_revision: Union[str, None] = "b2c5e8f1d9a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Enum value lists — must match app/models/enums.py order
DISPUTE_LEVEL_VALUES = ("None", "N1_Amicable", "N2_Mediation", "N3_Voting", "Resolved")
STAKE_TIER_VALUES = ("None", "Starter", "Established", "TopSeller")
SELLER_STATUS_VALUES = ("Active", "Suspended", "Banned")


def upgrade() -> None:
    bind = op.get_bind()

    # --- 1. Create ENUM types
    dispute_level = postgresql.ENUM(*DISPUTE_LEVEL_VALUES, name="dispute_level")
    stake_tier = postgresql.ENUM(*STAKE_TIER_VALUES, name="stake_tier")
    seller_status = postgresql.ENUM(*SELLER_STATUS_VALUES, name="seller_status")
    dispute_level.create(bind, checkfirst=True)
    stake_tier.create(bind, checkfirst=True)
    seller_status.create(bind, checkfirst=True)

    # --- 2. disputes
    op.create_table(
        "disputes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("onchain_dispute_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "order_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("orders.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "order_item_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("order_items.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("buyer_address", sa.String(42), nullable=False),
        sa.Column("seller_address", sa.String(42), nullable=False),
        sa.Column(
            "level",
            postgresql.ENUM(*DISPUTE_LEVEL_VALUES, name="dispute_level", create_type=False),
            nullable=False,
            server_default="N1_Amicable",
        ),
        sa.Column("n2_mediator_address", sa.String(42)),
        sa.Column("refund_amount_usdt", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("slash_amount_usdt", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("favor_buyer", sa.Boolean()),
        sa.Column("resolved", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("reason", sa.Text()),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("n1_deadline", sa.DateTime(timezone=True), nullable=False),
        sa.Column("n2_deadline", sa.DateTime(timezone=True)),
        sa.Column("resolved_at", sa.DateTime(timezone=True)),
        sa.Column("buyer_proposal_amount_usdt", sa.BigInteger()),
        sa.Column("seller_proposal_amount_usdt", sa.BigInteger()),
        sa.Column("vote_id", sa.BigInteger()),
        sa.Column("photo_ipfs_hashes", postgresql.JSONB()),
        sa.Column("conversation", postgresql.JSONB()),
        sa.UniqueConstraint("onchain_dispute_id", name="uq_disputes_onchain_dispute_id"),
        sa.CheckConstraint(
            "buyer_address ~ '^0x[0-9a-f]{40}$'",
            name="disputes_buyer_address_lowercase_hex",
        ),
        sa.CheckConstraint(
            "seller_address ~ '^0x[0-9a-f]{40}$'",
            name="disputes_seller_address_lowercase_hex",
        ),
        sa.CheckConstraint(
            "n2_mediator_address IS NULL OR n2_mediator_address ~ '^0x[0-9a-f]{40}$'",
            name="disputes_n2_mediator_address_lowercase_hex",
        ),
    )
    op.create_index("ix_disputes_order_id", "disputes", ["order_id"])
    op.create_index("ix_disputes_order_item_id", "disputes", ["order_item_id"])
    op.create_index("ix_disputes_level", "disputes", ["level"])
    op.create_index("ix_disputes_resolved", "disputes", ["resolved"])

    # --- 3. stakes
    op.create_table(
        "stakes",
        sa.Column("seller_address", sa.String(42), primary_key=True),
        sa.Column(
            "tier",
            postgresql.ENUM(*STAKE_TIER_VALUES, name="stake_tier", create_type=False),
            nullable=False,
            server_default="None",
        ),
        sa.Column("amount_usdt", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("active_sales", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("freeze_count", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("withdrawal_active", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("withdrawal_amount_usdt", sa.BigInteger()),
        sa.Column(
            "withdrawal_target_tier",
            postgresql.ENUM(*STAKE_TIER_VALUES, name="stake_tier", create_type=False),
        ),
        sa.Column("withdrawal_unlock_at", sa.DateTime(timezone=True)),
        sa.Column("withdrawal_frozen_remaining", sa.Interval()),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "seller_address ~ '^0x[0-9a-f]{40}$'",
            name="stakes_seller_address_lowercase_hex",
        ),
        sa.CheckConstraint("amount_usdt >= 0", name="stakes_amount_non_negative"),
        sa.CheckConstraint("active_sales >= 0", name="stakes_active_sales_non_negative"),
        sa.CheckConstraint("freeze_count >= 0", name="stakes_freeze_count_non_negative"),
    )
    op.create_index("ix_stakes_tier", "stakes", ["tier"])
    op.create_index(
        "ix_stakes_active_sales_positive",
        "stakes",
        ["seller_address"],
        postgresql_where=sa.text("active_sales > 0"),
    )

    # --- 4. reputation_cache
    op.create_table(
        "reputation_cache",
        sa.Column("seller_address", sa.String(42), primary_key=True),
        sa.Column("orders_completed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("orders_disputed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("disputes_lost", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_volume_usdt", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("score", sa.Integer(), nullable=False, server_default="50"),
        sa.Column(
            "is_top_seller", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column(
            "status",
            postgresql.ENUM(*SELLER_STATUS_VALUES, name="seller_status", create_type=False),
            nullable=False,
            server_default="Active",
        ),
        sa.Column("last_sanction_at", sa.DateTime(timezone=True)),
        sa.Column("first_order_at", sa.DateTime(timezone=True)),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "seller_address ~ '^0x[0-9a-f]{40}$'",
            name="reputation_cache_seller_address_lowercase_hex",
        ),
        sa.CheckConstraint(
            "orders_completed >= 0",
            name="reputation_cache_orders_completed_non_negative",
        ),
        sa.CheckConstraint(
            "orders_disputed >= 0",
            name="reputation_cache_orders_disputed_non_negative",
        ),
        sa.CheckConstraint(
            "disputes_lost >= 0",
            name="reputation_cache_disputes_lost_non_negative",
        ),
        sa.CheckConstraint(
            "total_volume_usdt >= 0",
            name="reputation_cache_total_volume_non_negative",
        ),
    )
    op.create_index(
        "ix_reputation_cache_is_top_seller", "reputation_cache", ["is_top_seller"]
    )
    op.create_index(
        "ix_reputation_cache_status", "reputation_cache", ["status"]
    )
    op.create_index("ix_reputation_cache_score", "reputation_cache", ["score"])


def downgrade() -> None:
    bind = op.get_bind()

    # --- 1. Drop tables (no FKs between these three)
    op.drop_index("ix_reputation_cache_score", table_name="reputation_cache")
    op.drop_index("ix_reputation_cache_status", table_name="reputation_cache")
    op.drop_index("ix_reputation_cache_is_top_seller", table_name="reputation_cache")
    op.drop_table("reputation_cache")

    op.drop_index("ix_stakes_active_sales_positive", table_name="stakes")
    op.drop_index("ix_stakes_tier", table_name="stakes")
    op.drop_table("stakes")

    op.drop_index("ix_disputes_resolved", table_name="disputes")
    op.drop_index("ix_disputes_level", table_name="disputes")
    op.drop_index("ix_disputes_order_item_id", table_name="disputes")
    op.drop_index("ix_disputes_order_id", table_name="disputes")
    op.drop_table("disputes")

    # --- 2. Drop ENUM types
    postgresql.ENUM(name="seller_status").drop(bind, checkfirst=True)
    postgresql.ENUM(name="stake_tier").drop(bind, checkfirst=True)
    postgresql.ENUM(name="dispute_level").drop(bind, checkfirst=True)
