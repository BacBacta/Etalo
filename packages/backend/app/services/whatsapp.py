"""WhatsApp notification stubs — Twilio Business API wrapper.

Current state (J11.5 Block 7) : message body composition is live, with
deeplinks pointing at the buyer interface MVP at
`{frontend_base_url}/orders/{order_uuid}`. The actual Twilio SDK call
in `send_message` is still a TODO ; full end-to-end wire-up (SDK +
call sites + opt-out compliance + observability) is tracked as
FU-J11-007 for V1.5+.

Why deeplinks were added before the SDK : the buyer interface MVP
(Blocks 3-6) needs the templates in their final shape so the eventual
Twilio enablement is a 1-file change. Splitting the template
composition from the SDK wire-up keeps each PR focused (J11.5 ships
the buyer-facing surface ; FU-J11-007 ships the actual notification
path).
"""
from app.config import settings


def _compose_order_url(order_uuid: str) -> str:
    """Compose the canonical deeplink for an order detail page.

    Strips a trailing slash on `frontend_base_url` so we don't emit
    `https://etalo.app//orders/<uuid>` if the env value has one. The
    UUID itself is URL-safe (RFC 4122 charset) — no encoding needed.
    """
    base = settings.frontend_base_url.rstrip("/")
    return f"{base}/orders/{order_uuid}"


class WhatsAppService:
    """Twilio WhatsApp Business API wrapper for notifications."""

    def __init__(self):
        self.account_sid = settings.twilio_account_sid
        self.auth_token = settings.twilio_auth_token
        self.from_number = settings.twilio_whatsapp_from

    async def send_message(self, to: str, body: str) -> dict:
        """Send a WhatsApp message. Returns message SID.

        TODO (FU-J11-007) : implement with Twilio SDK + retry/dead-
        letter queue + opt-out compliance.
        """
        return {"status": "stub", "to": to}

    async def send_order_notification(
        self,
        to: str,
        order_id: str,
        status: str,
        order_uuid: str,
    ) -> dict:
        """Send order status update via WhatsApp.

        `order_id` is the human-readable identifier surfaced in the
        message body (typically the on-chain order id). `order_uuid`
        is the off-chain UUID that addresses `/orders/{uuid}` in the
        buyer interface MVP (Block 4) — it's the routing key for the
        deeplink, distinct from the on-chain id used in copy.
        """
        url = _compose_order_url(order_uuid)
        body = (
            f"Etalo: Your order #{order_id} is now {status}. "
            f"View: {url}"
        )
        return await self.send_message(to, body)

    async def send_dispute_notification(
        self,
        to: str,
        order_id: str,
        level: str,
        order_uuid: str,
    ) -> dict:
        """Send dispute escalation notification."""
        url = _compose_order_url(order_uuid)
        body = (
            f"Etalo: Dispute for order #{order_id} escalated to "
            f"{level}. View: {url}"
        )
        return await self.send_message(to, body)


whatsapp_service = WhatsAppService()
