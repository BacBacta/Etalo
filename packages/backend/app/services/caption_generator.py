"""Claude API marketing caption generator — Sprint J7 Block 4.

Calls Anthropic's Messages API via the AsyncAnthropic SDK. Per-language
system prompts are stable (engineered for marketing tone); the variable
product details + platform CTA hint go in the user message. This split
keeps the system prefix cacheable if/when prompt size grows past Sonnet
4.6's 2048-token caching threshold.

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
TemplateKey = Literal["ig_square", "ig_story", "wa_status", "tiktok", "fb_feed"]
MODEL = "claude-sonnet-4-6"
MAX_TOKENS = 400  # ~280-char output target, with headroom for tokenization

# Platform-specific CTA hint — passed to the model so the caption ends
# with the right action verb for the surface. WA/FB get the URL on its
# own line because text URLs are clickable there. IG/TikTok point the
# reader at the bio/sticker because in-image URLs aren't tappable.
_CTA_BY_TEMPLATE: dict[TemplateKey, str] = {
    "ig_square": (
        "End the caption with a soft CTA pointing at link in bio. The "
        "image already shows the URL prominently."
    ),
    "ig_story": (
        "End with a CTA telling the viewer to tap the link sticker. "
        "Stories support tappable link stickers — that's the path to "
        "the product page."
    ),
    "wa_status": (
        "End the caption with the URL on its own line, prefixed by "
        "an emoji like 👉 — text URLs are clickable in WhatsApp Status."
    ),
    "tiktok": (
        "End with a CTA pointing at link in bio. Short, punchy, "
        "TikTok-native — think 'link in bio fr fr' style energy if it "
        "fits the language."
    ),
    "fb_feed": (
        "End with the URL on its own line, prefixed by 👉 — text URLs "
        "are clickable in Facebook posts."
    ),
}


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
        "- Maximum 320 characters total (caption + URL line if any)\n"
        "- Mention the price prominently\n"
        "- Emphasize buyer protection through USDT escrow\n"
        "- Follow the platform CTA instruction in the user message\n"
        "- Add 2-4 relevant hashtags at the end (country + category)\n"
        "- Return ONLY the caption text — no quotes, no preamble, no "
        "explanations"
    ),
    "sw": (
        "You write marketing captions for African sellers on Etalo, a "
        "non-custodial marketplace where buyers pay in USDT stablecoin "
        "with smart contract escrow.\n\n"
        "Tone: energetic, mobile-friendly, hashtag-friendly. A few emojis "
        "are welcome but not excessive.\n\n"
        "Output rules:\n"
        "- Write in Swahili (Kenya / Tanzania East-African style)\n"
        "- Maximum 320 characters total (caption + URL line if any)\n"
        "- Mention the price prominently\n"
        "- Emphasize buyer protection through USDT escrow\n"
        "- Follow the platform CTA instruction in the user message\n"
        "- Add 2-4 relevant hashtags at the end (country + category)\n"
        "- Return ONLY the caption text — no quotes, no preamble, no "
        "explanations"
    ),
}


def _build_user_message(
    *,
    title: str,
    price_usdt: str,
    description: str | None,
    seller_handle: str,
    country: str,
    short_url: str,
    template: TemplateKey,
) -> str:
    cta_hint = _CTA_BY_TEMPLATE.get(
        template, "End with a soft CTA pointing at the URL."
    )
    return (
        f"Product: {title}\n"
        f"Price: {price_usdt} USDT\n"
        f"Description: {description or '(no description)'}\n"
        f"Seller: @{seller_handle}\n"
        f"Country: {country}\n"
        f"Short URL: {short_url}\n"
        f"Target platform: {template}\n"
        f"Platform CTA instruction: {cta_hint}"
    )


async def generate_caption(
    *,
    title: str,
    price_usdt: str,
    description: str | None,
    seller_handle: str,
    country: str,
    lang: CaptionLang,
    short_url: str,
    template: TemplateKey,
) -> str:
    """Generate a marketing caption via Claude (~280-char EN or Swahili)
    with a platform-aware CTA and the trackable short URL embedded."""
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
                        short_url=short_url,
                        template=template,
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
