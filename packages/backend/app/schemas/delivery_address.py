"""Pydantic schemas for the buyer address book — Sprint J11.7 Block 2 (ADR-044)."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import Country


class DeliveryAddressBase(BaseModel):
    """Shared fields between Create and Response."""
    phone_number: str = Field(min_length=5, max_length=20)
    country: Country
    city: str = Field(min_length=1, max_length=100)
    region: str = Field(min_length=1, max_length=100)
    address_line: str = Field(min_length=1)
    landmark: str | None = Field(default=None, max_length=200)
    notes: str | None = None


class DeliveryAddressCreate(DeliveryAddressBase):
    """POST body. is_default is computed server-side : first row of a
    user becomes default automatically; subsequent rows default to False
    (use the set-default endpoint to change)."""


class DeliveryAddressUpdate(BaseModel):
    """PATCH body — all fields optional; only non-None ones are written."""
    phone_number: str | None = Field(default=None, min_length=5, max_length=20)
    country: Country | None = None
    city: str | None = Field(default=None, min_length=1, max_length=100)
    region: str | None = Field(default=None, min_length=1, max_length=100)
    address_line: str | None = Field(default=None, min_length=1)
    landmark: str | None = Field(default=None, max_length=200)
    notes: str | None = None


class DeliveryAddressResponse(DeliveryAddressBase):
    """GET response shape."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    is_default: bool
    created_at: datetime
    updated_at: datetime


class DeliveryAddressList(BaseModel):
    """List wrapper — count + items."""
    items: list[DeliveryAddressResponse]
    count: int
