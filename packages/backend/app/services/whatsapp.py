"""WhatsApp order notifications via the Twilio Messages API.

Sellers in the V1 markets live on WhatsApp — the in-app toast/badge only
reaches them while the app is open, so a funded order also fires a
WhatsApp ping that reaches them with the phone in their pocket.

Design:
- Best-effort and self-disabling. If the Twilio creds aren't configured
  the notifier is a no-op (mirrors the relayer pattern) so the indexer
  runs identically until Mike sets the secrets.
- Fire-and-forget: the indexer handler calls `dispatch_new_order(...)`,
  which schedules a detached task. The Twilio HTTP round-trip never
  blocks the indexer cycle nor holds its DB transaction.
- Direct REST call over a scoped aiohttp session (no Twilio SDK dep, and
  `async with ClientSession()` closes itself — no leaked sessions).
- Business-initiated messages need an approved template outside the 24h
  window: if `twilio_order_template_sid` is set we send via ContentSid +
  ContentVariables, otherwise we fall back to a plain Body (sandbox /
  in-window only).
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

_TWILIO_TIMEOUT_S = 10
_TWILIO_BASE = "https://api.twilio.com/2010-04-01"


def format_whatsapp_number(raw: str | None) -> str | None:
    """Normalize a stored seller number to Twilio's `whatsapp:+E164` form.

    Sellers enter international format (the Profile placeholder is
    `+234 901 123 4567`). We keep digits + a leading `+`; without a `+`
    we can't infer the country, so we skip rather than guess wrong.
    """
    if not raw:
        return None
    cleaned = re.sub(r"[^\d+]", "", raw.strip())
    if cleaned.startswith("+"):
        digits = cleaned[1:]
    else:
        return None
    if not digits.isdigit() or not (7 <= len(digits) <= 15):
        return None
    return f"whatsapp:+{digits}"


class WhatsAppNotifier:
    def __init__(
        self,
        account_sid: str,
        auth_token: str,
        from_number: str,
        *,
        template_sid: str = "",
        frontend_base_url: str = "https://etalo.xyz",
    ) -> None:
        self._sid = account_sid.strip()
        self._token = auth_token.strip()
        # `from` may be given with or without the `whatsapp:` prefix.
        f = from_number.strip()
        self._from = f if f.startswith("whatsapp:") else f"whatsapp:{f}" if f else ""
        self._template_sid = template_sid.strip()
        self._frontend = frontend_base_url.rstrip("/")
        self._tasks: set[asyncio.Task[Any]] = set()

    @property
    def enabled(self) -> bool:
        return bool(self._sid and self._token and self._from)

    @classmethod
    def from_settings(cls) -> "WhatsAppNotifier":
        from app.config import settings

        return cls(
            account_sid=settings.twilio_account_sid,
            auth_token=settings.twilio_auth_token,
            from_number=settings.twilio_whatsapp_from,
            template_sid=settings.twilio_order_template_sid,
            frontend_base_url=settings.frontend_base_url,
        )

    def dispatch_new_order(
        self, to_raw: str | None, *, order_id: int, amount_human: str
    ) -> None:
        """Fire-and-forget a new-order WhatsApp ping. No-op when disabled
        or when the number can't be normalized. Never raises."""
        if not self.enabled:
            return
        to = format_whatsapp_number(to_raw)
        if to is None:
            logger.info(
                "whatsapp.skip order=%s reason=unusable_number", order_id
            )
            return
        task = asyncio.create_task(
            self._send_new_order(to, order_id=order_id, amount_human=amount_human)
        )
        # Keep a reference so the task isn't GC'd mid-flight.
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def _send_new_order(
        self, to: str, *, order_id: int, amount_human: str
    ) -> None:
        body_fields: dict[str, str] = {"From": self._from, "To": to}
        if self._template_sid:
            body_fields["ContentSid"] = self._template_sid
            body_fields["ContentVariables"] = json.dumps(
                {"1": str(order_id), "2": amount_human}
            )
        else:
            body_fields["Body"] = (
                f"New order on Etalo — #{order_id} for {amount_human} USDT. "
                f"Open your shop to ship and release your funds: "
                f"{self._frontend}/seller/dashboard?tab=orders"
            )

        url = f"{_TWILIO_BASE}/Accounts/{self._sid}/Messages.json"
        try:
            import aiohttp

            timeout = aiohttp.ClientTimeout(total=_TWILIO_TIMEOUT_S)
            auth = aiohttp.BasicAuth(self._sid, self._token)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(url, data=body_fields, auth=auth) as resp:
                    if resp.status >= 400:
                        text = await resp.text()
                        logger.warning(
                            "whatsapp.send_failed order=%s status=%s body=%s",
                            order_id,
                            resp.status,
                            text[:300],
                        )
                        return
            logger.info("whatsapp.sent order=%s", order_id)
        except Exception as exc:  # noqa: BLE001 — best-effort, never break indexing
            logger.warning("whatsapp.send_error order=%s err=%r", order_id, exc)
