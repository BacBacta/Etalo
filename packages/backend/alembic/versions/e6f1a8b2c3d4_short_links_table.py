"""short_links table for trackable marketing-image URLs

Revision ID: e6f1a8b2c3d4
Revises: 85c144f82fbb
Create Date: 2026-05-10 09:00:00.000000

Per-marketing-image short URL (etalo.app/r/{code}) so sellers can post
short, brand-consistent links and we can measure click-through.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "e6f1a8b2c3d4"
down_revision: Union[str, None] = "85c144f82fbb"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "short_links",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("code", sa.String(length=16), nullable=False),
        sa.Column("target_url", sa.Text(), nullable=False),
        sa.Column(
            "clicks",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("code", name="uq_short_links_code"),
    )
    op.create_index(
        "ix_short_links_code", "short_links", ["code"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_short_links_code", table_name="short_links")
    op.drop_table("short_links")
