"""add slug to products

Revision ID: a1b2c3d4e5f6
Revises: ab5c5a3a9ca0
Create Date: 2026-04-22 16:14:29.323331

Adds a per-seller-unique `slug` column to products and backfills
existing rows. The backfill uses the same slugify helper the runtime
code uses (app.services.slug) so data produced by migration and by
application stays consistent.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.services.slug import build_unique_slug

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "ab5c5a3a9ca0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1) Add the column nullable so we can backfill before the NOT NULL.
    op.add_column(
        "products",
        sa.Column("slug", sa.String(length=60), nullable=True),
    )

    # 2) Backfill existing rows — one pass per seller so we can resolve
    #    collisions per seller within the migration itself.
    conn = op.get_bind()
    sellers = conn.execute(
        sa.text("SELECT DISTINCT seller_id FROM products")
    ).fetchall()

    for (seller_id,) in sellers:
        rows = conn.execute(
            sa.text(
                "SELECT id, title FROM products "
                "WHERE seller_id = :sid ORDER BY created_at"
            ),
            {"sid": seller_id},
        ).fetchall()

        taken: set[str] = set()
        for product_id, title in rows:
            candidate = build_unique_slug(title, taken)
            taken.add(candidate)
            conn.execute(
                sa.text("UPDATE products SET slug = :slug WHERE id = :pid"),
                {"slug": candidate, "pid": product_id},
            )

    # 3) Enforce NOT NULL now that every row has a slug.
    op.alter_column("products", "slug", nullable=False)

    # 4) Supporting indexes + uniqueness per seller.
    op.create_index("ix_products_slug", "products", ["slug"])
    op.create_unique_constraint(
        "uq_products_seller_slug", "products", ["seller_id", "slug"]
    )


def downgrade() -> None:
    op.drop_constraint("uq_products_seller_slug", "products", type_="unique")
    op.drop_index("ix_products_slug", table_name="products")
    op.drop_column("products", "slug")
