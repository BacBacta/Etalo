from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.notification import Notification
from app.models.user import User
from app.routers.sellers import get_current_wallet
from app.schemas.notification import NotificationRead, NotificationsListResponse

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=NotificationsListResponse)
def list_notifications(
    wallet: Annotated[str, Depends(get_current_wallet)],
    db: Annotated[Session, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> NotificationsListResponse:
    """
    Return the connected wallet's latest notifications. Empty list when
    the wallet has no User row yet or no notifications — the frontend
    renders "You're all caught up." in that case.
    """
    user = db.query(User).filter(User.wallet_address == wallet).one_or_none()
    if user is None:
        return NotificationsListResponse(items=[], total=0)

    items = (
        db.query(Notification)
        .filter(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
        .all()
    )
    return NotificationsListResponse(
        items=[NotificationRead.model_validate(n) for n in items],
        total=len(items),
    )
