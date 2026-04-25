"""V2 Dispute API schemas — Sprint J5 Block 6."""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, computed_field

from app.models.enums import DisputeLevel

USDT_SCALE = Decimal(10) ** 6


class DisputeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    onchain_dispute_id: int
    order_id: uuid.UUID
    order_item_id: uuid.UUID
    buyer_address: str
    seller_address: str
    level: DisputeLevel
    n2_mediator_address: str | None
    refund_amount_usdt: int
    slash_amount_usdt: int
    favor_buyer: bool | None
    resolved: bool
    reason: str | None
    opened_at: datetime
    n1_deadline: datetime
    n2_deadline: datetime | None
    resolved_at: datetime | None
    buyer_proposal_amount_usdt: int | None
    seller_proposal_amount_usdt: int | None
    vote_id: int | None
    photo_ipfs_hashes: list[str] | None
    conversation: list[dict[str, Any]] | None

    @computed_field
    @property
    def refund_amount_human(self) -> Decimal:
        return Decimal(self.refund_amount_usdt) / USDT_SCALE

    @computed_field
    @property
    def slash_amount_human(self) -> Decimal:
        return Decimal(self.slash_amount_usdt) / USDT_SCALE


class DisputePhotoCreate(BaseModel):
    """Append a photo IPFS hash to the dispute's photo list."""
    ipfs_hash: str = Field(..., pattern=r"^Qm[1-9A-HJ-NP-Za-km-z]{44}$|^bafy[0-9a-z]+$")
    description: str | None = None


class DisputeMessageCreate(BaseModel):
    """Append a message to the dispute conversation."""
    message: str = Field(..., min_length=1, max_length=2000)
