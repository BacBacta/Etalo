from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class NotificationRead(BaseModel):
    id: UUID
    channel: str
    notification_type: str
    payload: dict | None = None
    sent: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class NotificationsListResponse(BaseModel):
    items: list[NotificationRead]
    total: int
