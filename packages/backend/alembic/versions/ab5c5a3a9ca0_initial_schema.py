"""initial schema

Revision ID: ab5c5a3a9ca0
Revises:
Create Date: 2026-04-21
"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "ab5c5a3a9ca0"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- users ---
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("wallet_address", sa.String(42), unique=True, nullable=False),
        sa.Column("phone", sa.String(20), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("country", sa.String(3), nullable=True),
        sa.Column("language", sa.String(5), server_default="en"),
        sa.Column("is_active", sa.Boolean, server_default=sa.text("true")),
        sa.Column("is_admin", sa.Boolean, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_users_wallet_address", "users", ["wallet_address"])

    # --- seller_profiles ---
    op.create_table(
        "seller_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), unique=True, nullable=False),
        sa.Column("shop_handle", sa.String(50), unique=True, nullable=False),
        sa.Column("shop_name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("logo_ipfs_hash", sa.String(100), nullable=True),
        sa.Column("banner_ipfs_hash", sa.String(100), nullable=True),
        sa.Column("socials", postgresql.JSONB, nullable=True),
        sa.Column("categories", postgresql.ARRAY(sa.String(50)), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_seller_profiles_shop_handle", "seller_profiles", ["shop_handle"])

    # --- products ---
    op.create_table(
        "products",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("seller_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("seller_profiles.id"), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("price_usdt", sa.Numeric(20, 6), nullable=False),
        sa.Column("stock", sa.SmallInteger, server_default="0"),
        sa.Column("status", sa.String(20), server_default="draft"),
        sa.Column("metadata_ipfs_hash", sa.String(100), nullable=True),
        sa.Column("image_ipfs_hashes", postgresql.ARRAY(sa.String(100)), nullable=True),
        sa.Column("category", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_products_status", "products", ["status"])

    # --- orders ---
    op.create_table(
        "orders",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("onchain_order_id", sa.BigInteger, unique=True, nullable=True),
        sa.Column("buyer_address", sa.String(42), nullable=False),
        sa.Column("seller_address", sa.String(42), nullable=False),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("products.id"), nullable=True),
        sa.Column("amount_usdt", sa.Numeric(20, 6), nullable=False),
        sa.Column("commission_usdt", sa.Numeric(20, 6), nullable=False),
        sa.Column("status", sa.String(20), server_default="created"),
        sa.Column("is_cross_border", sa.Boolean, server_default=sa.text("false")),
        sa.Column("milestones_total", sa.Integer, server_default="1"),
        sa.Column("milestones_released", sa.Integer, server_default="0"),
        sa.Column("delivery_address", sa.Text, nullable=True),
        sa.Column("tracking_number", sa.String(100), nullable=True),
        sa.Column("tx_hash", sa.String(66), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("shipped_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_orders_status", "orders", ["status"])
    op.create_index("ix_orders_buyer", "orders", ["buyer_address"])
    op.create_index("ix_orders_seller", "orders", ["seller_address"])

    # --- dispute_metadata ---
    op.create_table(
        "dispute_metadata",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orders.id"), unique=True, nullable=False),
        sa.Column("onchain_order_id", sa.Integer, nullable=True),
        sa.Column("level", sa.String(20), server_default="L1"),
        sa.Column("issue_type", sa.String(50), nullable=True),
        sa.Column("reason", sa.Text, nullable=True),
        sa.Column("photo_ipfs_hashes", postgresql.JSONB, nullable=True),
        sa.Column("conversation", postgresql.JSONB, nullable=True),
        sa.Column("mediator_address", sa.String(42), nullable=True),
        sa.Column("resolution", sa.String(50), nullable=True),
        sa.Column("refund_amount_usdt", sa.Numeric(20, 6), nullable=True),
        sa.Column("resolved", sa.Boolean, server_default=sa.text("false")),
        sa.Column("opened_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
    )

    # --- notifications ---
    op.create_table(
        "notifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("channel", sa.String(20), nullable=False),
        sa.Column("notification_type", sa.String(50), nullable=False),
        sa.Column("template", sa.String(100), nullable=True),
        sa.Column("payload", postgresql.JSONB, nullable=True),
        sa.Column("sent", sa.Boolean, server_default=sa.text("false")),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_notifications_user_id", "notifications", ["user_id"])

    # --- audit_logs ---
    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("admin_address", sa.String(42), nullable=False),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("target_type", sa.String(50), nullable=True),
        sa.Column("target_id", sa.String(100), nullable=True),
        sa.Column("details", postgresql.JSONB, nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # --- analytics_snapshots ---
    op.create_table(
        "analytics_snapshots",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("seller_address", sa.String(42), nullable=False),
        sa.Column("snapshot_date", sa.Date, nullable=False),
        sa.Column("orders_total", sa.Integer, server_default="0"),
        sa.Column("orders_completed", sa.Integer, server_default="0"),
        sa.Column("orders_disputed", sa.Integer, server_default="0"),
        sa.Column("revenue_usdt", sa.Numeric(20, 6), server_default="0"),
        sa.Column("commission_usdt", sa.Numeric(20, 6), server_default="0"),
        sa.Column("avg_delivery_hours", sa.Numeric(10, 2), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_analytics_seller_date", "analytics_snapshots", ["seller_address", "snapshot_date"], unique=True)


def downgrade() -> None:
    op.drop_table("analytics_snapshots")
    op.drop_table("audit_logs")
    op.drop_table("notifications")
    op.drop_table("dispute_metadata")
    op.drop_table("orders")
    op.drop_table("products")
    op.drop_table("seller_profiles")
    op.drop_table("users")
