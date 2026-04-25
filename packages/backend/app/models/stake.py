"""V2 Stake model — Sprint J5 Block 3.

Mirrors per-seller state in EtaloStake (ADR-020 tier system, ADR-021
withdrawal cooldown, ADR-028 auto-downgrade, ADR-033 post-slash
recovery gap).

One row per seller (PK = lowercased address). The withdrawal state
is embedded — only one withdrawal can be pending per seller per
ADR-021. The indexer overwrites these fields on every relevant event
(StakeDeposited, StakeUpgraded, StakeToppedUp, StakeSlashed,
TierAutoDowngraded, WithdrawalInitiated, WithdrawalExecuted,
WithdrawalPaused, WithdrawalResumed, WithdrawalCancelled).
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Enum as SAEnum,
    Index,
    Interval,
    SmallInteger,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.enums import StakeTier, STAKE_TIER_ENUM_NAME
from app.models.order import USDT_SCALE


class Stake(Base):
    """Per-seller stake state. PK on lowercased seller address."""

    __tablename__ = "stakes"

    seller_address: Mapped[str] = mapped_column(String(42), primary_key=True)

    tier: Mapped[StakeTier] = mapped_column(
        SAEnum(
            StakeTier,
            name=STAKE_TIER_ENUM_NAME,
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
        default=StakeTier.NONE,
    )
    amount_usdt: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    active_sales: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    freeze_count: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)

    # --- Embedded withdrawal state (max 1 active per seller, ADR-021) ---
    withdrawal_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    withdrawal_amount_usdt: Mapped[int | None] = mapped_column(BigInteger)
    withdrawal_target_tier: Mapped[StakeTier | None] = mapped_column(
        SAEnum(
            StakeTier,
            name=STAKE_TIER_ENUM_NAME,
            values_callable=lambda x: [e.value for e in x],
            create_type=False,  # type already created by `tier` column above
        )
    )
    withdrawal_unlock_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Captured remaining cooldown when freeze_count goes 0 → 1.
    # PostgreSQL INTERVAL — duration in seconds.
    withdrawal_frozen_remaining: Mapped[Interval | None] = mapped_column(Interval)

    last_synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        CheckConstraint(
            "seller_address ~ '^0x[0-9a-f]{40}$'", name="stakes_seller_address_lowercase_hex"
        ),
        CheckConstraint("amount_usdt >= 0", name="stakes_amount_non_negative"),
        CheckConstraint("active_sales >= 0", name="stakes_active_sales_non_negative"),
        CheckConstraint("freeze_count >= 0", name="stakes_freeze_count_non_negative"),
        Index("ix_stakes_tier", "tier"),
        # Partial index: sellers with ongoing cross-border sales (hot lookup
        # for ADR-031 dispute-block-auto-refund check).
        Index(
            "ix_stakes_active_sales_positive",
            "seller_address",
            postgresql_where="active_sales > 0",
        ),
    )

    # --- Helpers ---
    @property
    def amount_human(self) -> Decimal:
        return Decimal(self.amount_usdt) / USDT_SCALE
