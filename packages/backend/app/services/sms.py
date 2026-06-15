"""SMS order notifications via Africa's Talking.

WhatsApp business-initiated messaging requires a verified Meta business
(blocked for now). SMS via Africa's Talking — the regional aggregator
covering the V1 markets (Nigeria, Ghana, Kenya) — needs no Meta
verification and no recipient opt-in, so it's the channel that actually
works today. Cheaper + better African deliverability than global SMS
providers.

Design mirrors WhatsAppNotifier: best-effort, self-disabling (no-op when
creds absent), fire-and-forget over a scoped aiohttp session, no SDK dep.
SMS has no template-approval step — the message is plain text built by
`render_sms`.

`CompositeNotifier` fans every notification out to WhatsApp AND SMS, so
the indexer handlers keep calling a single `notifier` object unchanged.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

_AT_TIMEOUT_S = 10
_AT_PROD = "https://api.africastalking.com/version1/messaging"
_AT_SANDBOX = "https://api.sandbox.africastalking.com/version1/messaging"


def format_sms_number(raw: str | None) -> str | None:
    """Normalize a stored number to E.164 `+<digits>`. Requires a leading
    `+` (we can't infer the country otherwise), 7–15 digits."""
    if not raw:
        return None
    cleaned = re.sub(r"[^\d+]", "", raw.strip())
    if not cleaned.startswith("+"):
        return None
    digits = cleaned[1:]
    if not digits.isdigit() or not (7 <= len(digits) <= 15):
        return None
    return f"+{digits}"


def render_sms(
    event: str, variables: dict[str, str], frontend_base_url: str
) -> str | None:
    """Plain-text SMS body for an order-lifecycle event. Returns None for
    an unknown event. Variables match the WhatsApp template indices:
    {"1"} = order id, {"2"} = amount (when present)."""
    f = frontend_base_url.rstrip("/")
    oid = variables.get("1", "?")
    amount = variables.get("2", "")
    bodies = {
        "order_funded": (
            f"Etalo: new order #{oid} for {amount} USDT. Ship it from your "
            f"shop to get paid: {f}/seller/dashboard?tab=orders"
        ),
        "dispute_opened": (
            f"Etalo: a buyer opened a dispute on order #{oid}. Respond within "
            f"72h with shipping proof: {f}/seller/dashboard?tab=orders"
        ),
        "funds_released": (
            f"Etalo: {amount} USDT from order #{oid} has been released to your "
            f"wallet. Thanks for shipping on time!"
        ),
        "order_refunded": (
            f"Etalo: order #{oid} was auto-refunded ({amount} USDT) because it "
            f"wasn't shipped in time."
        ),
        "order_shipped": (
            f"Etalo: your order #{oid} has shipped. Track it: {f}/orders"
        ),
        "order_delivered": (
            f"Etalo: order #{oid} is marked delivered. Confirm receipt to "
            f"release funds to the seller: {f}/orders"
        ),
    }
    return bodies.get(event)


class SmsNotifier:
    def __init__(
        self,
        username: str,
        api_key: str,
        *,
        sender_id: str = "",
        sandbox: bool = False,
    ) -> None:
        self._username = username.strip()
        self._api_key = api_key.strip()
        self._sender_id = sender_id.strip()
        self._sandbox = sandbox
        self._tasks: set[asyncio.Task[Any]] = set()

    @property
    def enabled(self) -> bool:
        return bool(self._username and self._api_key)

    @property
    def _url(self) -> str:
        return _AT_SANDBOX if self._sandbox else _AT_PROD

    @classmethod
    def from_settings(cls) -> "SmsNotifier":
        from app.config import settings

        return cls(
            username=settings.africastalking_username,
            api_key=settings.africastalking_api_key,
            sender_id=settings.africastalking_sender_id,
            sandbox=settings.africastalking_sandbox,
        )

    def dispatch(self, to_raw: str | None, *, body: str | None, label: str) -> None:
        """Fire-and-forget an SMS. No-op when disabled, when the number
        can't be normalized, or when there's no body. Never raises."""
        if not self.enabled:
            return
        to = format_sms_number(to_raw)
        if to is None:
            logger.info("sms.skip event=%s reason=unusable_number", label)
            return
        if not body:
            logger.info("sms.skip event=%s reason=no_body", label)
            return
        task = asyncio.create_task(self._send(to, body=body, label=label))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def _send(self, to: str, *, body: str, label: str) -> None:
        data: dict[str, str] = {
            "username": self._username,
            "to": to,
            "message": body,
        }
        if self._sender_id:
            data["from"] = self._sender_id
        headers = {
            "apiKey": self._api_key,
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
        }
        try:
            import aiohttp

            timeout = aiohttp.ClientTimeout(total=_AT_TIMEOUT_S)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(self._url, data=data, headers=headers) as resp:
                    text = await resp.text()
                    if resp.status >= 400:
                        logger.warning(
                            "sms.send_failed event=%s status=%s body=%s",
                            label,
                            resp.status,
                            text[:300],
                        )
                        return
                    # Africa's Talking returns 201 even on per-recipient
                    # failures — surface the recipient status for ops.
                    status = _recipient_status(text)
            logger.info("sms.sent event=%s recipient_status=%s", label, status)
        except Exception as exc:  # noqa: BLE001 — best-effort, never break indexing
            logger.warning("sms.send_error event=%s err=%r", label, exc)


def _recipient_status(raw_text: str) -> str:
    """Pull Recipients[0].status from the Africa's Talking JSON response."""
    try:
        data = json.loads(raw_text)
        recipients = data.get("SMSMessageData", {}).get("Recipients", [])
        if recipients:
            return str(recipients[0].get("status", "?"))
    except Exception:  # noqa: BLE001
        pass
    return "?"


class CompositeNotifier:
    """Fans every notification out to all configured channels (WhatsApp +
    SMS), exposing the same surface the indexer handlers already call. Each
    channel is independently best-effort and self-disabling."""

    def __init__(
        self,
        *,
        whatsapp: Any | None = None,
        sms: SmsNotifier | None = None,
        frontend_base_url: str = "https://etalo.xyz",
    ) -> None:
        self._wa = whatsapp
        self._sms = sms
        self._frontend = frontend_base_url.rstrip("/")

    @property
    def enabled(self) -> bool:
        return bool(
            (self._wa and self._wa.enabled) or (self._sms and self._sms.enabled)
        )

    @property
    def channels(self) -> list[str]:
        out = []
        if self._wa and self._wa.enabled:
            out.append("whatsapp")
        if self._sms and self._sms.enabled:
            out.append("sms")
        return out

    def dispatch(
        self,
        to_raw: str | None,
        *,
        event: str,
        variables: dict[str, str],
        label: str,
        fallback_body: str | None = None,
    ) -> None:
        if self._wa is not None:
            self._wa.dispatch(
                to_raw,
                event=event,
                variables=variables,
                label=label,
                fallback_body=fallback_body,
            )
        if self._sms is not None:
            self._sms.dispatch(
                to_raw,
                body=render_sms(event, variables, self._frontend),
                label=label,
            )

    def dispatch_new_order(
        self, to_raw: str | None, *, order_id: int, amount_human: str
    ) -> None:
        if self._wa is not None:
            self._wa.dispatch_new_order(
                to_raw, order_id=order_id, amount_human=amount_human
            )
        if self._sms is not None:
            self._sms.dispatch(
                to_raw,
                body=render_sms(
                    "order_funded",
                    {"1": str(order_id), "2": amount_human},
                    self._frontend,
                ),
                label=f"order={order_id}",
            )
