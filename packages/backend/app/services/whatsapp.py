from app.config import settings


class WhatsAppService:
    """Twilio WhatsApp Business API wrapper for notifications."""

    def __init__(self):
        self.account_sid = settings.twilio_account_sid
        self.auth_token = settings.twilio_auth_token
        self.from_number = settings.twilio_whatsapp_from

    async def send_message(self, to: str, body: str) -> dict:
        """Send a WhatsApp message. Returns message SID."""
        # TODO: implement with Twilio SDK
        return {"status": "stub", "to": to}

    async def send_order_notification(self, to: str, order_id: str, status: str) -> dict:
        """Send order status update via WhatsApp."""
        body = f"Etalo: Your order #{order_id} is now {status}."
        return await self.send_message(to, body)

    async def send_dispute_notification(self, to: str, order_id: str, level: str) -> dict:
        """Send dispute escalation notification."""
        body = f"Etalo: Dispute for order #{order_id} escalated to {level}."
        return await self.send_message(to, body)


whatsapp_service = WhatsAppService()
