from typing import Literal, TypedDict
from uuid import UUID

TemplateKey = Literal["ig_square", "ig_story", "wa_status", "tiktok", "fb_feed"]
CaptionLang = Literal["en", "sw"]


class AssetGenerationResult(TypedDict):
    ipfs_hash: str
    image_url: str
    caption: str


async def generate_marketing_image(
    product_id: UUID,
    template: TemplateKey,
    caption_lang: CaptionLang,
) -> AssetGenerationResult:
    """
    Generate a marketing image + caption for a product.

    Block 3 will implement the Playwright rendering pipeline.
    Block 4 will implement the Claude API caption generation.
    Block 6 will wire credit deduction.

    Args:
        product_id: UUID of the product
        template: which marketing template to use (5 V1 options)
        caption_lang: language for the AI-generated caption ("en" | "sw")

    Returns:
        dict with ipfs_hash, image_url (Pinata gateway), caption (text)

    Raises:
        NotImplementedError: until Block 3 lands
    """
    raise NotImplementedError(
        "Asset generation pipeline lands in Sprint J7 Block 3. "
        "See docs/SPRINT_J7.md."
    )
