"""Vision classifier — Claude Sonnet 4.6 vision call to extract
product photo characteristics that override the per-category preset
defaults. ADR-049 Block B.

Used by `enhance_product_photo` BEFORE the birefnet bg-removal call,
to fine-tune the composite preset (backdrop, sat, sharpening, margin)
based on what Claude actually sees in the photo (vs. just trusting
the seller's manually-picked category).

Cost ~$0.003-0.005 per call with Claude Sonnet 4.6 vision (1024×1024
max input). Caches results by (image_ipfs_hash, model_version) in
Redis so re-enhancing the same source skips the second vision call.
"""
from __future__ import annotations

import base64
import json
import logging
from typing import Literal, TypedDict

import anthropic
from anthropic import AsyncAnthropic

from app.config import settings
from app.services.asset_generator import (
    DEFAULT_PRESET_KEY,
    ENHANCE_PRESETS,
    get_enhance_preset,
)

logger = logging.getLogger(__name__)

VISION_MODEL = "claude-sonnet-4-6"
VISION_MODEL_VERSION = "v1"  # bump to invalidate Redis cache on prompt change
MAX_INPUT_DIM = 1024  # Claude vision sweet spot
VISION_TIMEOUT_SECONDS = 30.0


class ProductInsights(TypedDict):
    category: str
    dominant_tone: Literal["dark", "light", "neutral"]
    has_visible_text: bool
    compactness: Literal["tall_portrait", "landscape", "square", "small"]


_DEFAULT_INSIGHTS: ProductInsights = {
    "category": DEFAULT_PRESET_KEY,
    "dominant_tone": "neutral",
    "has_visible_text": False,
    "compactness": "square",
}


SYSTEM_PROMPT = """You analyze e-commerce product photos to help an
image-enhancement pipeline pick the right backdrop, color saturation,
and sharpening settings. You ONLY return a single JSON object — no
explanation, no markdown fence.

The JSON must have exactly these 4 fields :

- "category" : one of "fashion", "beauty", "food", "home", "other"
  (best fit for the product, not the photo style).
- "dominant_tone" : one of "dark" (mostly black/dark blue/navy),
  "light" (mostly white/cream/pastel), "neutral" (mid tones, mixed).
- "has_visible_text" : true if the product has visible brand text or
  logos (sharpening should be lighter), false otherwise.
- "compactness" : one of "tall_portrait" (clearly taller than wide,
  e.g. bottle / vacuum / dress), "landscape" (clearly wider than
  tall, e.g. laptop / sofa), "square" (~equal w/h, e.g. shoebox),
  "small" (small object lost in the frame, e.g. ring / earring).

Example output : {"category":"fashion","dominant_tone":"dark","has_visible_text":false,"compactness":"tall_portrait"}"""


_client: AsyncAnthropic | None = None


def _get_client() -> AsyncAnthropic | None:
    """Lazy client. Returns None if ANTHROPIC_API_KEY is unset (so the
    caller can fallback to the category preset without crashing in
    dev/test environments without a key)."""
    global _client
    if _client is None:
        if not settings.anthropic_api_key:
            return None
        _client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _client


def _resize_for_vision(src_bytes: bytes) -> bytes:
    """Downscale to MAX_INPUT_DIM on longest side and re-encode JPEG
    so the vision call is cheap. EXIF transpose to avoid sending a
    rotated image (Claude doesn't auto-correct orientation either)."""
    from io import BytesIO

    from PIL import Image, ImageOps

    im = Image.open(BytesIO(src_bytes))
    im = ImageOps.exif_transpose(im)
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGB")
    w, h = im.size
    if max(w, h) > MAX_INPUT_DIM:
        scale = MAX_INPUT_DIM / max(w, h)
        im = im.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    buf = BytesIO()
    im.save(buf, format="JPEG", quality=85, optimize=True)
    return buf.getvalue()


async def analyze_product_image(
    image_bytes: bytes,
) -> ProductInsights:
    """Call Claude vision with the (resized) product image, return
    parsed insights or the default if anything fails. Caller is
    responsible for caching by image hash."""
    client = _get_client()
    if client is None:
        logger.info("vision_classifier: ANTHROPIC_API_KEY unset, returning default insights")
        return _DEFAULT_INSIGHTS

    resized = _resize_for_vision(image_bytes)
    b64 = base64.b64encode(resized).decode("ascii")

    try:
        message = await client.messages.create(
            model=VISION_MODEL,
            max_tokens=200,
            system=SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/jpeg",
                                "data": b64,
                            },
                        },
                        {
                            "type": "text",
                            "text": "Return the JSON for this product photo.",
                        },
                    ],
                }
            ],
            output_config={"effort": "low"},
            thinking={"type": "disabled"},
        )
    except anthropic.APIError as exc:
        logger.warning(
            "vision_classifier: Claude API error (%s) — falling back to defaults",
            type(exc).__name__,
        )
        return _DEFAULT_INSIGHTS

    text_blocks = [b for b in message.content if b.type == "text"]
    if not text_blocks or not text_blocks[0].text.strip():
        logger.warning("vision_classifier: empty Claude response, falling back to defaults")
        return _DEFAULT_INSIGHTS

    raw = text_blocks[0].text.strip()
    if raw.startswith("```"):
        # Strip markdown fence if Claude added it despite the prompt
        raw = raw.strip("`").lstrip("json").strip()

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning(
            "vision_classifier: Claude returned non-JSON: %s, falling back",
            raw[:120],
        )
        return _DEFAULT_INSIGHTS

    return _validate_insights(parsed)


def _validate_insights(parsed: dict) -> ProductInsights:
    """Coerce the parsed JSON to a valid ProductInsights, falling back
    field-by-field if any value is bogus. Robust against Claude
    occasionally returning extra fields or wrong values."""
    valid_categories = set(ENHANCE_PRESETS.keys())
    valid_tones = {"dark", "light", "neutral"}
    valid_compactness = {"tall_portrait", "landscape", "square", "small"}

    cat = parsed.get("category")
    tone = parsed.get("dominant_tone")
    has_text = parsed.get("has_visible_text")
    compact = parsed.get("compactness")

    return ProductInsights(
        category=cat if cat in valid_categories else _DEFAULT_INSIGHTS["category"],
        dominant_tone=tone if tone in valid_tones else _DEFAULT_INSIGHTS["dominant_tone"],
        has_visible_text=bool(has_text) if isinstance(has_text, bool) else _DEFAULT_INSIGHTS["has_visible_text"],
        compactness=compact if compact in valid_compactness else _DEFAULT_INSIGHTS["compactness"],
    )


def adapt_preset_with_insights(
    preset: dict,
    insights: ProductInsights,
) -> dict:
    """Override the category-derived preset with vision insights.

    Rules :
    - dominant_tone="dark" → backdrop becomes warmer cream (255, 250, 240)
      so the dark product pops against light bg
    - dominant_tone="light" → backdrop becomes neutral light gray
      (235, 235, 235) so the light product still has contrast
    - has_visible_text=True → halve the sharpening percent (avoid halos
      on brand text)
    - compactness="small" → bump the margin to 0.10 so a tiny earring
      isn't lost in the frame
    - compactness="tall_portrait" → keep the preset margin (already
      tuned in fashion preset)

    Returns a NEW dict — never mutates the input preset.
    """
    adapted = dict(preset)

    tone = insights.get("dominant_tone")
    if tone == "dark":
        adapted["backdrop"] = (255, 250, 240)  # warmer cream for dark products
    elif tone == "light":
        adapted["backdrop"] = (235, 235, 235)  # light gray for light products

    if insights.get("has_visible_text"):
        adapted["sharpen_percent"] = max(
            10, int(adapted.get("sharpen_percent", 25) * 0.5)
        )

    if insights.get("compactness") == "small":
        adapted["margin"] = 0.10

    return adapted


def select_preset_with_insights(
    seller_category: str | None,
    insights: ProductInsights | None,
) -> dict:
    """Top-level helper used by `enhance_product_photo`.

    Strategy :
    1. Start from the seller-picked category preset (Block A).
    2. If we got vision insights AND its `category` differs from the
       seller's pick AND has high confidence (default validator only
       returns valid categories), prefer the vision category.
    3. Apply the additional vision adjustments (tone / text / size).

    If insights is None (vision call disabled or failed), just return
    the category preset unchanged.
    """
    base_preset = get_enhance_preset(seller_category)
    if insights is None:
        return base_preset

    # If vision sees a different (valid) category, lean on it — sellers
    # often miscategorize their products at upload time.
    vision_cat = insights.get("category")
    if vision_cat and vision_cat != seller_category:
        base_preset = get_enhance_preset(vision_cat)

    return adapt_preset_with_insights(base_preset, insights)
