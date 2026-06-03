import base64
import json
import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import get_async_db
from app.models.enums import OrderStatus
from app.models.order import Order
from app.models.product import Product
from app.models.seller_profile import SellerProfile
from app.models.user import User
from app.schemas.cart import (
    CartFinalizeRequest,
    CartFinalizeResponse,
    CartTokenRequest,
    CartTokenResponse,
    CartValidationItemError,
    ResolvedCart,
    ResolvedCartItem,
    ResolvedCartSellerGroup,
)
from app.services.cart_token import issue_token, verify_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cart", tags=["cart"])


from app.services.ipfs import build_ipfs_url_or_none as _ipfs_url


@router.post("/checkout-token", response_model=CartTokenResponse)
async def create_cart_token(
    request: CartTokenRequest,
    db: Annotated[AsyncSession, Depends(get_async_db)],
    x_wallet_address: Annotated[
        str | None, Header(alias="X-Wallet-Address")
    ] = None,
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

    is_cross_border defaults to False per ADR-041 (V1 scope restriction —
    intra-Africa only, single 1.8% commission rate, no cross-border).
    Supersedes ADR-005 cross-border default. The V2 binary on Sepolia
    still carries the flag in `createOrderWithItems` for V1.5 cross-
    border re-enable, but V1 mainnet hardcodes to intra (`isCrossBorder
    = false`) to avoid the cross-border seller-stake gate that would
    revert with "Seller stake ineligible" without an EtaloStake deposit.
    """
    # ADR-057 migration Phase 0 — intake freeze. This is the hard gate
    # that stops NEW order creation during the escrow drain window
    # (already-funded orders continue normally — the escrow is not
    # paused). Checked first, before any DB work, so a frozen backend is
    # cheap and unambiguous. Runtime-flippable via the ORDERS_FROZEN env
    # var ; rollback = set back to false + restart.
    if settings.orders_frozen:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "reason": "orders_frozen",
                "message": (
                    "New orders are paused for scheduled maintenance. "
                    "Existing orders are unaffected — please check back "
                    "shortly."
                ),
            },
        )

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

    # Cross-border defense-in-depth (ADR-045 + ADR-041) — V1 is intra-only,
    # so a buyer in country X cannot purchase from a seller in country Y.
    # Frontend filter (Block 7/9) prevents the case in normal UX, but we
    # block here too in case a malformed client bypasses the FE check.
    # Optional auth : if X-Wallet-Address header absent, we cannot enforce
    # the rule (legacy public callers may not pass it). Frontend SHOULD
    # always pass it post-J11.7.
    if x_wallet_address:
        buyer = (
            await db.scalars(
                select(User).where(User.wallet_address == x_wallet_address.lower())
            )
        ).one_or_none()
        if buyer is not None and buyer.country is not None:
            mismatched_handles: list[tuple[str, str | None]] = []
            for product_id, _qty in qty_by_id.items():
                product = products_by_id.get(product_id)
                if product is None or product.seller is None:
                    continue
                seller_country = (
                    product.seller.user.country if product.seller.user else None
                )
                if seller_country is None:
                    continue  # legacy seller without country — let it through
                if seller_country != buyer.country:
                    mismatched_handles.append(
                        (product.seller.shop_handle, seller_country)
                    )
            if mismatched_handles:
                # Deduplicate seller handles for a clean error message.
                seen: dict[str, str | None] = {}
                for handle, country in mismatched_handles:
                    seen.setdefault(handle, country)
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail={
                        "validation_errors": [
                            {
                                "reason": "cross_border_not_supported",
                                "buyer_country": buyer.country,
                                "blocked_sellers": [
                                    {"shop_handle": h, "country": c}
                                    for h, c in seen.items()
                                ],
                                "message": (
                                    "Cross-border orders are not yet supported. "
                                    "Your country differs from at least one "
                                    "seller in this cart."
                                ),
                            }
                        ]
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
                is_cross_border=False,
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


# OrderStatus values that mean the order is already terminal — finalize
# is a no-op for these (the indexer has moved past funding).
_FINALIZE_TERMINAL_STATUSES = {
    OrderStatus.COMPLETED,
    OrderStatus.REFUNDED,
    OrderStatus.CANCELLED,
}


@router.post("/finalize", response_model=CartFinalizeResponse)
async def finalize_cart(
    body: CartFinalizeRequest,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_async_db)],
) -> CartFinalizeResponse:
    """Stamp the off-chain link from the cart token onto the on-chain
    Order row and decrement each product's stock by qty.

    Called by the buyer's web app right after `fundOrder` confirms.
    One call per seller group (the checkout loop iterates seller by
    seller in `useSequentialCheckout`).

    Idempotent : safe to retry. Token is accepted even past its TTL
    (the fund tx can confirm > 60 min after token issuance ; no price
    re-check happens here).

    Returns 200 with status :
      - "finalized"           — wrote product_ids and decremented stock
      - "already_finalized"   — Order.product_ids already populated
      - "indexer_pending"     — Order row not yet inserted (response
                                code 202) ; caller may retry.
    """
    try:
        envelope = verify_token(body.token)
    except ValueError as exc:
        reason = str(exc)
        if reason == "expired":
            # Fund txs may confirm after the 60-min TTL on slow mobile
            # networks. Signature was already valid (verify_token would
            # have raised invalid_signature first), so decode and reuse
            # the envelope.
            try:
                b64_part = body.token.split(".", 1)[0]
                payload = base64.urlsafe_b64decode(b64_part.encode("ascii"))
                envelope = json.loads(payload)
            except Exception as decode_exc:  # noqa: BLE001
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid cart token: malformed_payload",
                ) from decode_exc
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid cart token: {reason}",
            ) from exc

    cart = envelope["cart"]
    seller_handle = body.seller_handle.lower()
    group = next(
        (g for g in cart["groups"] if g["seller_handle"].lower() == seller_handle),
        None,
    )
    if group is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Seller handle '{body.seller_handle}' not in cart token.",
        )

    order = (
        await db.execute(
            select(Order).where(Order.onchain_order_id == body.onchain_order_id)
        )
    ).scalar_one_or_none()

    if order is None:
        # Indexer race — the fund tx confirmed but our event handler
        # hasn't inserted the row yet. Tell the caller to retry.
        response.status_code = status.HTTP_202_ACCEPTED
        return CartFinalizeResponse(status="indexer_pending")

    if order.product_ids is not None or order.global_status in _FINALIZE_TERMINAL_STATUSES:
        return CartFinalizeResponse(status="already_finalized")

    expanded_product_ids: list[UUID] = []
    for item in group["items"]:
        product_id = UUID(item["product_id"])
        qty = int(item["qty"])

        # Conditional decrement — stock stays ≥ 0 even under concurrent
        # finalize calls for the same product (different orders).
        result = await db.execute(
            update(Product)
            .where(Product.id == product_id, Product.stock >= qty)
            .values(stock=Product.stock - qty)
        )
        if result.rowcount == 0:
            logger.warning(
                "cart_finalize: stock decrement skipped product_id=%s qty=%s "
                "(insufficient or already decremented) onchain_order_id=%s",
                product_id,
                qty,
                body.onchain_order_id,
            )
        expanded_product_ids.extend([product_id] * qty)

    order.product_ids = expanded_product_ids
    await db.commit()
    return CartFinalizeResponse(status="finalized")
