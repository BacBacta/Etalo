"""products.enhanced_at — track ADR-049 photo enhancement

Revision ID: f7a2b8c3d4e5
Revises: e6f1a8b2c3d4
Create Date: 2026-05-10 10:00:00.000000

Set when the seller spends 1 credit on the "Enhance photo" button in
the add-product flow. NULL = the photo is the seller's original phone
shot. The IPFS hash stored in `image_ipfs_hashes[0]` already points at
the enhanced output when this column is non-null.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f7a2b8c3d4e5"
down_revision: Union[str, None] = "e6f1a8b2c3d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "products",
        sa.Column(
            "enhanced_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("products", "enhanced_at")
