from datetime import datetime, timezone
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_async_db
from app.models.product import Product
from app.models.seller_profile import SellerProfile
from app.schemas.cart import (
    CartTokenRequest,
    CartTokenResponse,
    CartValidationItemError,
    ResolvedCart,
    ResolvedCartItem,
    ResolvedCartSellerGroup,
)
from app.services.cart_token import issue_token, verify_token

router = APIRouter(prefix="/cart", tags=["cart"])


from app.services.ipfs import build_ipfs_url_or_none as _ipfs_url


@router.post("/checkout-token", response_model=CartTokenResponse)
async def create_cart_token(
    request: CartTokenRequest,
    db: Annotated[AsyncSession, Depends(get_async_db)],
) -> CartTokenResponse:
    """
    Validate a cart payload + lock prices/seller info into a 15-minute
    HMAC-signed token. The Mini App passes the token at /checkout to
    resolve the locked groups for `createOrderWithItems` calls.

    Validation per item:
      - product must exist
      - product.status must be "active"
      - product.stock must be ≥ requested qty
    Failures aggregate into a single 422 with a `validation_errors` list.

    is_cross_border defaults to True (ADR-005, no buyer country in V1).
    TODO V1.5: ask buyer country at MiniPay onboarding for accurate
    commission tier.
    """
    qty_by_id = {item.product_id: item.qty for item in request.items}

    rows = (
        await db.scalars(
            select(Product)
            .where(Product.id.in_(qty_by_id.keys()))
            .options(selectinload(Product.seller).selectinload(SellerProfile.user))
        )
    ).all()
    products_by_id = {p.id: p for p in rows}

    errors: list[CartValidationItemError] = []
    for product_id, qty in qty_by_id.items():
        product = products_by_id.get(product_id)
        if product is None:
            errors.append(
                CartValidationItemError(product_id=product_id, reason="not_found")
            )
            continue
        if product.status != "active":
            errors.append(
                CartValidationItemError(product_id=product_id, reason="inactive")
            )
            continue
        if product.stock < qty:
            errors.append(
                CartValidationItemError(
                    product_id=product_id,
                    reason="qty_exceeds_stock",
                    available_qty=product.stock,
                )
            )

    if errors:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "validation_errors": [e.model_dump(mode="json") for e in errors]
            },
        )

    # Group by seller. We rebuild ResolvedCart* models so the schema
    # round-trip serialization matches what /resolve will return.
    groups_by_handle: dict[str, ResolvedCartSellerGroup] = {}
    for product_id, qty in qty_by_id.items():
        product = products_by_id[product_id]
        seller = product.seller
        handle = seller.shop_handle.lower()
        wallet = seller.user.wallet_address if seller.user else ""
        image_url = (
            _ipfs_url(product.image_ipfs_hashes[0])
            if product.image_ipfs_hashes
            else None
        )
        item = ResolvedCartItem(
            product_id=product.id,
            product_slug=product.slug,
            title=product.title,
            price_usdt=product.price_usdt,
            qty=qty,
            image_url=image_url,
        )
        line_total = Decimal(product.price_usdt) * qty
        existing = groups_by_handle.get(handle)
        if existing is None:
            groups_by_handle[handle] = ResolvedCartSellerGroup(
                seller_handle=handle,
                seller_shop_name=seller.shop_name,
                seller_address=wallet,
                items=[item],
                subtotal_usdt=line_total,
                is_cross_border=True,
            )
        else:
            existing.items.append(item)
            existing.subtotal_usdt += line_total

    groups = list(groups_by_handle.values())
    total = sum((g.subtotal_usdt for g in groups), start=Decimal("0"))

    cart_payload = {
        "groups": [g.model_dump(mode="json") for g in groups],
        "total_usdt": str(total),
    }
    token, expires_at = issue_token(cart_payload)
    return CartTokenResponse(token=token, expires_at=expires_at)


@router.get("/resolve/{token}", response_model=ResolvedCart)
async def resolve_cart_token(token: str) -> ResolvedCart:
    try:
        envelope = verify_token(token)
    except ValueError as exc:
        reason = str(exc)
        if reason == "expired":
            raise HTTPException(
                status_code=status.HTTP_410_GONE,
                detail="Cart token expired",
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid cart token: {reason}",
        ) from exc

    cart_dict = envelope["cart"]
    return ResolvedCart(
        groups=cart_dict["groups"],
        total_usdt=Decimal(cart_dict["total_usdt"]),
        issued_at=datetime.fromtimestamp(envelope["iat"], tz=timezone.utc),
        expires_at=datetime.fromtimestamp(envelope["exp"], tz=timezone.utc),
    )
