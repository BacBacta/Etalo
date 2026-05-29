"""n2/n3 dispute surfaces — mediators + dispute_votes mirror tables

ADR-056. Two on-chain mirror tables for the dispute escalation tail:
- mediators: EtaloDispute isMediatorApproved whitelist (MediatorApproved).
- dispute_votes: EtaloVoting per-dispute N3 vote (VoteCreated /
  VoteSubmitted / VoteFinalized).

Additive only; downgrade drops both. No contract change.

Revision ID: a9f3c1e0b7d2
Revises: f7a2b8c3d4e5
Create Date: 2026-05-29
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op


revision: str = "a9f3c1e0b7d2"
down_revision: Union[str, None] = "f7a2b8c3d4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "mediators",
        sa.Column("address", sa.String(42), primary_key=True),
        sa.Column(
            "approved", sa.Boolean(), nullable=False, server_default=sa.true()
        ),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("removed_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "dispute_votes",
        sa.Column("onchain_vote_id", sa.BigInteger(), primary_key=True),
        sa.Column("onchain_dispute_id", sa.BigInteger(), nullable=False),
        sa.Column("deadline", sa.DateTime(timezone=True), nullable=False),
        sa.Column("for_buyer", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("for_seller", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "finalized", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column("buyer_won", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_dispute_votes_onchain_dispute_id",
        "dispute_votes",
        ["onchain_dispute_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_dispute_votes_onchain_dispute_id", table_name="dispute_votes"
    )
    op.drop_table("dispute_votes")
    op.drop_table("mediators")
