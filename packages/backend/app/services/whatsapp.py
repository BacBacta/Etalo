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
        templates: dict[str, str] | None = None,
        frontend_base_url: str = "https://etalo.xyz",
    ) -> None:
        self._sid = account_sid.strip()
        self._token = auth_token.strip()
        # `from` may be given with or without the `whatsapp:` prefix.
        f = from_number.strip()
        self._from = f if f.startswith("whatsapp:") else f"whatsapp:{f}" if f else ""
        # event name → approved Content Template SID (HX…). Empty/missing
        # SID means that event's notification is skipped (template-only),
        # except order_funded which carries a sandbox Body fallback.
        self._templates = {k: v.strip() for k, v in (templates or {}).items()}
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
            templates={
                "order_funded": settings.twilio_order_template_sid,
                "dispute_opened": settings.twilio_dispute_template_sid,
                "funds_released": settings.twilio_released_template_sid,
                "order_refunded": settings.twilio_refunded_template_sid,
                "order_shipped": settings.twilio_shipped_template_sid,
                "order_delivered": settings.twilio_delivered_template_sid,
            },
            frontend_base_url=settings.frontend_base_url,
        )

    def dispatch(
        self,
        to_raw: str | None,
        *,
        event: str,
        variables: dict[str, str],
        label: str,
        fallback_body: str | None = None,
    ) -> None:
        """Fire-and-forget a templated WhatsApp message for `event`. No-op
        when disabled, when the number can't be normalized, or when the
        event has no approved template SID and no fallback body. Never
        raises — notifications are best-effort."""
        if not self.enabled:
            return
        to = format_whatsapp_number(to_raw)
        if to is None:
            logger.info("whatsapp.skip event=%s reason=unusable_number", label)
            return
        sid = self._templates.get(event, "")
        if not sid and not fallback_body:
            logger.info("whatsapp.skip event=%s reason=no_template", label)
            return
        task = asyncio.create_task(
            self._send(
                to,
                sid=sid,
                variables=variables,
                fallback_body=fallback_body,
                label=label,
            )
        )
        # Keep a reference so the task isn't GC'd mid-flight.
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    def dispatch_new_order(
        self, to_raw: str | None, *, order_id: int, amount_human: str
    ) -> None:
        """New funded-order ping to the seller. Kept as a named method
        (the order_funded path also has a sandbox Body fallback so it
        works before the prod template is approved)."""
        self.dispatch(
            to_raw,
            event="order_funded",
            variables={"1": str(order_id), "2": amount_human},
            label=f"order={order_id}",
            fallback_body=(
                f"New order on Etalo — #{order_id} for {amount_human} USDT. "
                f"Open your shop to ship and release your funds: "
                f"{self._frontend}/seller/dashboard?tab=orders"
            ),
        )

    async def _send(
        self,
        to: str,
        *,
        sid: str,
        variables: dict[str, str],
        fallback_body: str | None,
        label: str,
    ) -> None:
        body_fields: dict[str, str] = {"From": self._from, "To": to}
        if sid:
            body_fields["ContentSid"] = sid
            body_fields["ContentVariables"] = json.dumps(variables)
        elif fallback_body:
            body_fields["Body"] = fallback_body
        else:
            return  # guarded in dispatch(), defensive here

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
                            "whatsapp.send_failed event=%s status=%s body=%s",
                            label,
                            resp.status,
                            text[:300],
                        )
                        return
            logger.info("whatsapp.sent event=%s", label)
        except Exception as exc:  # noqa: BLE001 — best-effort, never break indexing
            logger.warning("whatsapp.send_error event=%s err=%r", label, exc)
