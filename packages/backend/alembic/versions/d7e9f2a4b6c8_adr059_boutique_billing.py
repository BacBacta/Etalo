"""ADR-059 boutique creation fee — boutique_billing mirror table

Adds the `boutique_billing` mirror table written solely by the indexer
(invariant #14) from EtaloBoutiqueBilling.CreationFeePaid. One row per
wallet that paid the one-time 1 USDT boutique creation fee. The
onboarding gate reads `creation_paid_at` once FEES_ENFORCED_FROM passes.

Additive only; downgrade drops the table. Safe to run ahead of the
contract deploy — the table just stays empty until CreationFeePaid is
emitted.

Revision ID: d7e9f2a4b6c8
Revises: c1d2e3f4a5b6
Create Date: 2026-06-15
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op


revision: str = "d7e9f2a4b6c8"
down_revision: Union[str, None] = "c1d2e3f4a5b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "boutique_billing",
        sa.Column("wallet_address", sa.String(length=42), nullable=False),
        sa.Column("creation_paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("creation_tx_hash", sa.String(length=80), nullable=True),
        sa.PrimaryKeyConstraint("wallet_address"),
    )


def downgrade() -> None:
    op.drop_table("boutique_billing")
