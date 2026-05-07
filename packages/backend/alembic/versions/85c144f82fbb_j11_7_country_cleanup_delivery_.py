"""j11_7 country cleanup + delivery_addresses table + order snapshot column

Sprint J11.7 Block 1 (ADR-044 + ADR-045).

1. Normalize existing `users.country` data to ISO 3166-1 alpha-3
   (4 rows currently use alpha-2 : 'NG' x2, 'GH' x2 → 'NGA', 'GHA').
2. Add CheckConstraint on users.country : NULL or in {NGA, GHA, KEN}.
3. Create delivery_addresses table (buyer address book per ADR-044).
4. Add orders.delivery_address_snapshot JSONB column (immutable copy
   at fundOrder time).

Revision ID: 85c144f82fbb
Revises: 73428197ad70
Create Date: 2026-05-07 17:04:14.739946
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '85c144f82fbb'
down_revision: Union[str, None] = '73428197ad70'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # --- 1. Cleanup existing users.country values (alpha-2 → alpha-3) ---
    op.execute("UPDATE users SET country = 'NGA' WHERE country = 'NG'")
    op.execute("UPDATE users SET country = 'GHA' WHERE country = 'GH'")
    op.execute("UPDATE users SET country = 'KEN' WHERE country = 'KE'")

    # --- 2. CheckConstraint on users.country ---
    op.create_check_constraint(
        "users_country_iso_alpha3",
        "users",
        "country IS NULL OR country IN ('NGA', 'GHA', 'KEN')",
    )

    # --- 3. delivery_addresses table ---
    op.create_table(
        "delivery_addresses",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("phone_number", sa.String(length=20), nullable=False),
        sa.Column("country", sa.String(length=3), nullable=False),
        sa.Column("city", sa.String(length=100), nullable=False),
        sa.Column("region", sa.String(length=100), nullable=False),
        sa.Column("address_line", sa.Text(), nullable=False),
        sa.Column("landmark", sa.String(length=200), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_delivery_addresses_user"),
        sa.PrimaryKeyConstraint("id", name="pk_delivery_addresses"),
        sa.CheckConstraint(
            "country IN ('NGA', 'GHA', 'KEN')",
            name="delivery_addresses_country_iso_alpha3",
        ),
    )
    op.create_index(
        "ix_delivery_addresses_user_default",
        "delivery_addresses",
        ["user_id", "is_default"],
    )

    # --- 4. orders.delivery_address_snapshot ---
    op.add_column(
        "orders",
        sa.Column("delivery_address_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("orders", "delivery_address_snapshot")
    op.drop_index("ix_delivery_addresses_user_default", table_name="delivery_addresses")
    op.drop_table("delivery_addresses")
    op.drop_constraint("users_country_iso_alpha3", "users", type_="check")
    # Note: alpha-2 → alpha-3 cleanup not reversed — original 'NG'/'GH'
    # values are not restorable from 'NGA'/'GHA' (lossy mapping). If a
    # full rollback is needed, restore from a pre-upgrade backup.
