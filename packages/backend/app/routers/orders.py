from decimal import Decimal
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.notification import Notification
from app.models.order import Order
from app.models.product import Product
from app.models.seller_profile import SellerProfile
from app.models.user import User
from app.routers.sellers import get_current_wallet
from app.schemas.order import (
    OrderConfirmRequest,
    OrderConfirmResponse,
    OrderInitiateContracts,
    OrderInitiateProduct,
    OrderInitiateRequest,
    OrderInitiateResponse,
    OrderInitiateSeller,
    OrderRead,
)

router = APIRouter(prefix="/orders", tags=["orders"])


# Commission BPS — must match EtaloEscrow constants.
COMMISSION_INTRA_BPS = 180
COMMISSION_CROSS_BPS = 270
BPS_DENOMINATOR = 10000

AUTO_RELEASE_INTRA_DAYS = 3
AUTO_RELEASE_CROSS_DAYS = 7


def _is_cross_border(buyer: User | None, seller_country: str | None) -> bool:
    """
    Cross-border when buyer and seller are in different countries.

    If we don't know the buyer's country (new wallet, no onboarding yet),
    we default to cross-border — the higher commission and longer
    auto-release window is the safer pessimistic default for the
    protocol. Documented in docs/DECISIONS.md.
    """
    if buyer is None or buyer.country is None:
        return True
    if seller_country is None:
        return True
    return buyer.country != seller_country


def _ipfs_url(h: str | None) -> str | None:
    if not h:
        return None
    return f"{settings.pinata_gateway_url.rstrip('/')}/{h}"


@router.post("/initiate", response_model=OrderInitiateResponse)
def initiate_order(
    body: OrderInitiateRequest,
    wallet: Annotated[str, Depends(get_current_wallet)],
    db: Annotated[Session, Depends(get_db)],
) -> OrderInitiateResponse:
    """
    Compute the checkout parameters for a product from the caller's POV.

    Returns everything the Mini App needs to build the on-chain txs:
    seller's wallet address, the amount in 6-decimals raw bigint, and
    the authoritative `is_cross_border` flag (frontend must not
    recompute — server is the source of truth for commission rules).
    """
    product = db.get(Product, body.product_id)
    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Product not found."
        )
    if product.status != "active":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Product is {product.status}.",
        )
    if product.stock <= 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Product is out of stock.",
        )

    seller_profile: SellerProfile | None = db.get(SellerProfile, product.seller_id)
    if seller_profile is None or seller_profile.user is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Seller profile is incomplete.",
        )

    seller_user = seller_profile.user
    if seller_user.wallet_address.lower() == wallet.lower():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You cannot buy from your own shop.",
        )

    buyer = (
        db.query(User).filter(User.wallet_address == wallet).one_or_none()
    )
    is_cross_border = _is_cross_border(buyer, seller_user.country)

    # Convert the stored Decimal(20, 6) price to 6-decimals raw bigint.
    amount_raw = int(product.price_usdt * Decimal(10**6))
    auto_release = (
        AUTO_RELEASE_CROSS_DAYS if is_cross_border else AUTO_RELEASE_INTRA_DAYS
    )

    hashes = product.image_ipfs_hashes or []
    image_url = _ipfs_url(hashes[0]) if hashes else None

    return OrderInitiateResponse(
        product=OrderInitiateProduct(
            id=product.id,
            title=product.title,
            image_url=image_url,
            slug=product.slug,
        ),
        seller=OrderInitiateSeller(
            shop_handle=seller_profile.shop_handle,
            shop_name=seller_profile.shop_name,
            address=seller_user.wallet_address,
            country=seller_user.country,
            logo_ipfs_hash=seller_profile.logo_ipfs_hash,
        ),
        amount_raw=str(amount_raw),
        is_cross_border=is_cross_border,
        auto_release_days_estimate=auto_release,
        contracts=OrderInitiateContracts(
            escrow=settings.escrow_contract_address,
            usdt=_usdt_address(),
        ),
    )


def _usdt_address() -> str:
    """
    Resolve the USDT contract the Mini App should spend.

    Settings hold the mainnet USDT address by default; on testnet we
    use MockUSDT (set via env). For Block 7 we read from the
    USDT_CONTRACT_ADDRESS env var, falling back to the mainnet
    constant from CLAUDE.md.
    """
    # Prefer the dedicated env var; fall back to the Celo mainnet USDT.
    override = getattr(settings, "usdt_contract_address", "") or ""
    return override or "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e"


@router.post(
    "/confirm",
    response_model=OrderConfirmResponse,
    status_code=status.HTTP_201_CREATED,
)
def confirm_order(
    body: OrderConfirmRequest,
    wallet: Annotated[str, Depends(get_current_wallet)],
    db: Annotated[Session, Depends(get_db)],
) -> OrderConfirmResponse:
    """
    Record a successfully-funded order in the DB.

    The Mini App calls this after both `createOrder` and `fundOrder`
    txs are mined. We trust the tx hashes for now — see DECISIONS.md
    for the on-chain indexer plan that will verify these asynchronously.
    """
    product = db.get(Product, body.product_id)
    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Product not found."
        )
    seller_profile: SellerProfile | None = db.get(SellerProfile, product.seller_id)
    if seller_profile is None or seller_profile.user is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Seller profile is incomplete.",
        )

    # Idempotency: if the on-chain id already has a row, return it.
    existing = (
        db.query(Order)
        .filter(Order.onchain_order_id == body.onchain_order_id)
        .one_or_none()
    )
    if existing is not None:
        return OrderConfirmResponse(
            id=existing.id,
            status=existing.status,
            onchain_order_id=existing.onchain_order_id or body.onchain_order_id,
        )

    amount_usdt = Decimal(body.amount_raw) / Decimal(10**6)
    commission_bps = (
        COMMISSION_CROSS_BPS if body.is_cross_border else COMMISSION_INTRA_BPS
    )
    commission_usdt = (amount_usdt * Decimal(commission_bps)) / Decimal(
        BPS_DENOMINATOR
    )

    order = Order(
        onchain_order_id=body.onchain_order_id,
        buyer_address=wallet,
        seller_address=seller_profile.user.wallet_address,
        product_id=product.id,
        amount_usdt=amount_usdt,
        commission_usdt=commission_usdt,
        status="funded",
        is_cross_border=body.is_cross_border,
        milestones_total=4 if body.is_cross_border else 1,
        milestones_released=0,
        tx_hash=body.tx_hash_fund,
    )
    db.add(order)

    # Notify the seller. Twilio is not wired yet — see DECISIONS.md.
    # The notification row is created with sent=false so a future
    # WhatsApp worker can pick it up.
    db.add(
        Notification(
            user_id=seller_profile.user.id,
            channel="whatsapp",
            notification_type="order_created",
            template="order_created_seller",
            payload={
                "order_id_onchain": body.onchain_order_id,
                "product_title": product.title,
                "amount_usdt": str(amount_usdt),
                "tx_hash": body.tx_hash_fund,
            },
            sent=False,
        )
    )

    db.commit()
    db.refresh(order)

    return OrderConfirmResponse(
        id=order.id,
        status=order.status,
        onchain_order_id=order.onchain_order_id or body.onchain_order_id,
    )


@router.get("/{order_id}", response_model=OrderRead)
def get_order(
    order_id: UUID,
    wallet: Annotated[str, Depends(get_current_wallet)],
    db: Annotated[Session, Depends(get_db)],
) -> OrderRead:
    order = db.get(Order, order_id)
    if order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Order not found."
        )
    # Buyer or seller can read; anyone else is hidden.
    if (
        order.buyer_address.lower() != wallet.lower()
        and order.seller_address.lower() != wallet.lower()
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Order not found."
        )
    return OrderRead.model_validate(order)
