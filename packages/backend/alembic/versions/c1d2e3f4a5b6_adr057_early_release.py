"""ADR-057 delivery-proof early release — shipment_groups columns

Adds two columns to shipment_groups for the seller's delivery-proof
early-release feature (ADR-057):
- delivery_proof_hash: optional bytes32 proof artifact (NULL when the
  seller requested early release without attaching one).
- early_release_requested: one-shot guard mirrored from the contract.

Additive only; downgrade drops both. The contract change ships with the
ADR-057 EtaloEscrow redeploy — this migration is safe to run ahead of
it (columns just stay empty until the new escrow emits
EarlyReleaseRequested).

Revision ID: c1d2e3f4a5b6
Revises: a9f3c1e0b7d2
Create Date: 2026-06-03
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op


revision: str = "c1d2e3f4a5b6"
down_revision: Union[str, None] = "a9f3c1e0b7d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "shipment_groups",
        sa.Column("delivery_proof_hash", sa.LargeBinary(), nullable=True),
    )
    op.add_column(
        "shipment_groups",
        sa.Column(
            "early_release_requested",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("shipment_groups", "early_release_requested")
    op.drop_column("shipment_groups", "delivery_proof_hash")
