"""Buyer address book CRUD — Sprint J11.7 Block 2 (ADR-044).

5 endpoints under /me/addresses :
- GET    list non-deleted addresses for the caller
- POST   create new (first becomes default automatically)
- PATCH  update partial (caller must own)
- DELETE soft-delete (sets is_deleted ; reassigns default if needed)
- POST   .../set-default toggle default exclusively

Auth : X-Wallet-Address header via get_current_wallet (dev pattern,
ADR-036 — same as /sellers/me, /onboarding/complete).
"""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.delivery_address import DeliveryAddress
from app.models.user import User
from app.routers.sellers import get_current_wallet
from app.schemas.delivery_address import (
    DeliveryAddressCreate,
    DeliveryAddressList,
    DeliveryAddressResponse,
    DeliveryAddressUpdate,
)

router = APIRouter(prefix="/me/addresses", tags=["addresses"])


def _find_user(db: Session, wallet: str) -> User | None:
    """Read-only lookup. Returns None if no User row exists for the wallet
    (fresh buyer who has never declared country / saved an address)."""
    return db.query(User).filter(User.wallet_address == wallet).one_or_none()


def _get_or_create_user(db: Session, wallet: str) -> User:
    """Upsert pattern : create the User row on first write if absent.
    Mirrors PUT /users/me behavior (Block 5) so the address book CRUD
    works for fresh buyers who haven't completed the country prompt yet.
    """
    user = _find_user(db, wallet)
    if user is None:
        user = User(wallet_address=wallet)
        db.add(user)
        db.flush()  # populate user.id without committing
    return user


def _get_or_404_user(db: Session, wallet: str) -> User:
    """Strict lookup — used by mutation endpoints that operate on an
    existing address (PATCH / DELETE / set-default). 404 here is correct
    : if there's no User there's no addresses, so any address_id will
    404 anyway."""
    user = _find_user(db, wallet)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Address not found.",
        )
    return user


def _get_or_404_address(db: Session, address_id: uuid.UUID, user_id: uuid.UUID) -> DeliveryAddress:
    """Fetch a non-deleted address that belongs to the caller. Returns 404
    if missing OR soft-deleted OR owned by another user — no leak between
    cases (privacy)."""
    addr = (
        db.query(DeliveryAddress)
        .filter(
            DeliveryAddress.id == address_id,
            DeliveryAddress.user_id == user_id,
            DeliveryAddress.is_deleted.is_(False),
        )
        .one_or_none()
    )
    if addr is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Address not found.",
        )
    return addr


@router.get("", response_model=DeliveryAddressList)
def list_addresses(
    wallet: Annotated[str, Depends(get_current_wallet)],
    db: Annotated[Session, Depends(get_db)],
) -> DeliveryAddressList:
    # Fresh buyer (no User row yet) → return empty list, not 404. The
    # frontend treats empty list as "no saved addresses, prompt to add".
    user = _find_user(db, wallet)
    if user is None:
        return DeliveryAddressList(items=[], count=0)
    rows = (
        db.query(DeliveryAddress)
        .filter(
            DeliveryAddress.user_id == user.id,
            DeliveryAddress.is_deleted.is_(False),
        )
        .order_by(
            DeliveryAddress.is_default.desc(),
            DeliveryAddress.created_at.desc(),
        )
        .all()
    )
    return DeliveryAddressList(
        items=[DeliveryAddressResponse.model_validate(r) for r in rows],
        count=len(rows),
    )


@router.post(
    "",
    response_model=DeliveryAddressResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_address(
    body: DeliveryAddressCreate,
    wallet: Annotated[str, Depends(get_current_wallet)],
    db: Annotated[Session, Depends(get_db)],
) -> DeliveryAddressResponse:
    # Upsert User on first address write — buyers don't need to set
    # country before saving their first address. The User row carries
    # only wallet_address ; country can be added later via PUT /users/me
    # or via CountrySelector in /seller/dashboard ProfileTab.
    user = _get_or_create_user(db, wallet)

    # First non-deleted address of this user becomes default automatically.
    existing_count = (
        db.query(DeliveryAddress)
        .filter(
            DeliveryAddress.user_id == user.id,
            DeliveryAddress.is_deleted.is_(False),
        )
        .count()
    )
    is_first = existing_count == 0

    addr = DeliveryAddress(
        user_id=user.id,
        phone_number=body.phone_number,
        country=body.country.value,
        city=body.city,
        region=body.region,
        address_line=body.address_line,
        landmark=body.landmark,
        notes=body.notes,
        is_default=is_first,
    )
    db.add(addr)
    db.commit()
    db.refresh(addr)
    return DeliveryAddressResponse.model_validate(addr)


@router.patch("/{address_id}", response_model=DeliveryAddressResponse)
def update_address(
    address_id: uuid.UUID,
    body: DeliveryAddressUpdate,
    wallet: Annotated[str, Depends(get_current_wallet)],
    db: Annotated[Session, Depends(get_db)],
) -> DeliveryAddressResponse:
    user = _get_or_404_user(db, wallet)
    addr = _get_or_404_address(db, address_id, user.id)

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field == "country" and value is not None:
            value = value.value if hasattr(value, "value") else value
        setattr(addr, field, value)

    db.commit()
    db.refresh(addr)
    return DeliveryAddressResponse.model_validate(addr)


@router.delete(
    "/{address_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
def delete_address(
    address_id: uuid.UUID,
    wallet: Annotated[str, Depends(get_current_wallet)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    user = _get_or_404_user(db, wallet)
    addr = _get_or_404_address(db, address_id, user.id)
    was_default = addr.is_default

    addr.is_deleted = True
    addr.is_default = False
    db.flush()

    # If we just deleted the default, promote the most recent surviving
    # address to default so the user always has one (when at least one
    # remains).
    if was_default:
        replacement = (
            db.query(DeliveryAddress)
            .filter(
                DeliveryAddress.user_id == user.id,
                DeliveryAddress.is_deleted.is_(False),
            )
            .order_by(DeliveryAddress.created_at.desc())
            .first()
        )
        if replacement is not None:
            replacement.is_default = True

    db.commit()


@router.post("/{address_id}/set-default", response_model=DeliveryAddressResponse)
def set_default_address(
    address_id: uuid.UUID,
    wallet: Annotated[str, Depends(get_current_wallet)],
    db: Annotated[Session, Depends(get_db)],
) -> DeliveryAddressResponse:
    user = _get_or_404_user(db, wallet)
    addr = _get_or_404_address(db, address_id, user.id)

    # Unset all other defaults for this user, then set this one.
    (
        db.query(DeliveryAddress)
        .filter(
            DeliveryAddress.user_id == user.id,
            DeliveryAddress.id != addr.id,
            DeliveryAddress.is_default.is_(True),
        )
        .update({"is_default": False}, synchronize_session=False)
    )
    addr.is_default = True
    db.commit()
    db.refresh(addr)
    return DeliveryAddressResponse.model_validate(addr)
