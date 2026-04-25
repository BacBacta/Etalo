"""v2 indexer tables

Adds the two infrastructure tables for the V2 event indexer:
- indexer_state: per-contract checkpoint (last_processed_block)
- indexer_events_processed: idempotency log, UNIQUE (tx_hash, log_index)

Sprint J5 Block 5.

Revision ID: d5e8b1c4a072
Revises: c4d7a9e2f0b6
Create Date: 2026-04-25
"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op


revision: str = "d5e8b1c4a072"
down_revision: Union[str, None] = "c4d7a9e2f0b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "indexer_state",
        sa.Column("contract_name", sa.String(50), primary_key=True),
        sa.Column(
            "last_processed_block",
            sa.BigInteger(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    op.create_table(
        "indexer_events_processed",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tx_hash", sa.String(66), nullable=False),
        sa.Column("log_index", sa.Integer(), nullable=False),
        sa.Column("contract_name", sa.String(50), nullable=False),
        sa.Column("event_name", sa.String(50), nullable=False),
        sa.Column("block_number", sa.BigInteger(), nullable=False),
        sa.Column(
            "processed_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "tx_hash ~ '^0x[0-9a-f]{64}$'",
            name="indexer_events_tx_hash_lowercase_hex",
        ),
    )
    op.create_index(
        "uq_indexer_events_tx_log",
        "indexer_events_processed",
        ["tx_hash", "log_index"],
        unique=True,
    )
    op.create_index(
        "ix_indexer_events_block_number",
        "indexer_events_processed",
        ["block_number"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_indexer_events_block_number", table_name="indexer_events_processed"
    )
    op.drop_index(
        "uq_indexer_events_tx_log", table_name="indexer_events_processed"
    )
    op.drop_table("indexer_events_processed")
    op.drop_table("indexer_state")
