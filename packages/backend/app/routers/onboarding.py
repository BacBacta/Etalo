from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.product import Product
from app.models.seller_profile import SellerProfile
from app.models.user import User
from app.routers.sellers import get_current_wallet
from app.schemas.onboarding import (
    OnboardingCompleteProduct,
    OnboardingCompleteRequest,
    OnboardingCompleteResponse,
)
from app.schemas.seller import SellerProfilePublic

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


@router.post(
    "/complete",
    response_model=OnboardingCompleteResponse,
    status_code=status.HTTP_201_CREATED,
)
def complete_onboarding(
    body: OnboardingCompleteRequest,
    wallet: Annotated[str, Depends(get_current_wallet)],
    db: Annotated[Session, Depends(get_db)],
) -> OnboardingCompleteResponse:
    """
    Atomic onboarding: create the User (if missing), the SellerProfile,
    and the first Product in a single transaction.

    Rejects with 409 when the wallet already has a seller profile, or
    when the requested handle is taken by another seller.
    """
    # Enforce handle uniqueness up-front so we return 409 instead of
    # leaking a DB IntegrityError.
    existing_handle = (
        db.query(SellerProfile)
        .filter(SellerProfile.shop_handle == body.profile.shop_handle)
        .first()
    )
    if existing_handle is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Shop handle is already taken.",
        )

    try:
        user = (
            db.query(User).filter(User.wallet_address == wallet).one_or_none()
        )
        if user is None:
            user = User(
                wallet_address=wallet,
                country=body.profile.country,
                language=body.profile.language,
            )
            db.add(user)
            db.flush()  # assign user.id without committing

        if user.seller_profile is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This wallet already has a seller profile.",
            )

        profile = SellerProfile(
            user_id=user.id,
            shop_handle=body.profile.shop_handle,
            shop_name=body.profile.shop_name,
            description=body.profile.description,
            logo_ipfs_hash=body.profile.logo_ipfs_hash,
        )
        db.add(profile)
        db.flush()

        product = Product(
            seller_id=profile.id,
            title=body.first_product.title,
            description=body.first_product.description,
            price_usdt=body.first_product.price_usdt,
            stock=body.first_product.stock,
            status="active",
            image_ipfs_hashes=body.first_product.photo_ipfs_hashes,
        )
        db.add(product)

        db.commit()
        db.refresh(profile)
        db.refresh(product)
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise

    return OnboardingCompleteResponse(
        profile=SellerProfilePublic.model_validate(profile),
        first_product=OnboardingCompleteProduct.model_validate(product),
    )
