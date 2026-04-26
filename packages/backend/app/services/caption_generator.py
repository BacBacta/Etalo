"""Claude API marketing caption generator — Sprint J7 Block 4.

Calls Anthropic's Messages API via the AsyncAnthropic SDK. Per-language
system prompts are stable (engineered for marketing tone); the variable
product details go in the user message. This split keeps the system
prefix cacheable if/when prompt size grows past Sonnet 4.6's 2048-token
caching threshold (today's prompts are well below it, so cache_control
is a no-op — kept anyway as a free signal of intent).

Configured for content generation per the Claude API skill:
- model: claude-sonnet-4-6 (good speed / cost / intelligence balance)
- effort: low (chat / classification / content generation default)
- thinking: disabled (no multi-step reasoning needed for ~280-char output)
"""
from __future__ import annotations

import logging
from typing import Literal

import anthropic
from anthropic import AsyncAnthropic

from app.config import settings

logger = logging.getLogger(__name__)

CaptionLang = Literal["en", "sw"]
MODEL = "claude-sonnet-4-6"
MAX_TOKENS = 400  # ~280-char output target, with headroom for tokenization


class CaptionGenerationError(Exception):
    """Raised when Claude API call fails or returns unusable content."""


_client: AsyncAnthropic | None = None


def _get_client() -> AsyncAnthropic:
    global _client
    if _client is None:
        if not settings.anthropic_api_key:
            raise CaptionGenerationError(
                "ANTHROPIC_API_KEY not set — configure it in .env or environment"
            )
        _client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _client


SYSTEM_PROMPTS: dict[CaptionLang, str] = {
    "en": (
        "You write marketing captions for African sellers on Etalo, a "
        "non-custodial marketplace where buyers pay in USDT stablecoin "
        "with smart contract escrow.\n\n"
        "Tone: energetic, mobile-friendly, hashtag-friendly. A few emojis "
        "are welcome but not excessive.\n\n"
        "Output rules:\n"
        "- Write in English\n"
        "- Maximum 280 characters total\n"
        "- Mention the price prominently\n"
        "- Emphasize buyer protection through USDT escrow\n"
        "- Include a soft call-to-action\n"
        "- Return ONLY the caption text — no quotes, no preamble, no "
        "  explanations"
    ),
    "sw": (
        "You write marketing captions for African sellers on Etalo, a "
        "non-custodial marketplace where buyers pay in USDT stablecoin "
        "with smart contract escrow.\n\n"
        "Tone: energetic, mobile-friendly, hashtag-friendly. A few emojis "
        "are welcome but not excessive.\n\n"
        "Output rules:\n"
        "- Write in Swahili (Kenya / Tanzania East-African style)\n"
        "- Maximum 280 characters total\n"
        "- Mention the price prominently\n"
        "- Emphasize buyer protection through USDT escrow\n"
        "- Include a soft call-to-action\n"
        "- Return ONLY the caption text — no quotes, no preamble, no "
        "  explanations"
    ),
}


def _build_user_message(
    *,
    title: str,
    price_usdt: str,
    description: str | None,
    seller_handle: str,
    country: str,
) -> str:
    return (
        f"Product: {title}\n"
        f"Price: {price_usdt} USDT\n"
        f"Description: {description or '(no description)'}\n"
        f"Seller: @{seller_handle}\n"
        f"Country: {country}"
    )


async def generate_caption(
    *,
    title: str,
    price_usdt: str,
    description: str | None,
    seller_handle: str,
    country: str,
    lang: CaptionLang,
) -> str:
    """Generate a marketing caption via Claude (~280-char EN or Swahili)."""
    if lang not in SYSTEM_PROMPTS:
        raise ValueError(f"Unsupported caption_lang: {lang}")

    client = _get_client()

    try:
        message = await client.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            system=[
                {
                    "type": "text",
                    "text": SYSTEM_PROMPTS[lang],
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[
                {
                    "role": "user",
                    "content": _build_user_message(
                        title=title,
                        price_usdt=price_usdt,
                        description=description,
                        seller_handle=seller_handle,
                        country=country,
                    ),
                }
            ],
            output_config={"effort": "low"},
            thinking={"type": "disabled"},
        )
    except anthropic.APIError as exc:
        raise CaptionGenerationError(
            f"Claude API call failed ({type(exc).__name__}): {exc}"
        ) from exc

    text_blocks = [b for b in message.content if b.type == "text"]
    if not text_blocks or not text_blocks[0].text.strip():
        raise CaptionGenerationError("Claude returned no text content")

    caption = text_blocks[0].text.strip()
    if caption.startswith('"') and caption.endswith('"') and len(caption) > 1:
        caption = caption[1:-1].strip()
    return caption
