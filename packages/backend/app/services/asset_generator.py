"""Asset generator — Sprint J7 Block 3, refactored for ADR-048.

Pipeline (production, FAL_KEY set):
1. Fetch product + seller (eager-load shop_handle + image).
2. fal.ai birefnet/v2 removes the bg from the seller's photo,
   returning a transparent PNG that preserves the product 100 %
   (text, logos, colors, textures untouched — surgical, not
   generative).
3. Pillow composites the product centered on a pure white canvas
   sized to the template's image slot.
4. Playwright renders the template HTML with the white-bg PNG fed in
   as a base64 data: URL — chrome (header, title, price, CTA, QR)
   wraps the cleaned product photo.
5. Pin the final composite to Pinata.
6. Generate caption via Anthropic Claude.
7. Return hash + URL + caption.

ADR-048 documents the switch from Flux Kontext (generative, smoothed
brand text on the live Dreame H12 vacuum test) to this clean-isolate
pipeline — 35× cheaper at $0.001/image and faithful to the source
product photo.

Pipeline (dev fallback, FAL_KEY unset OR birefnet exception):
- Steps 2-3 are skipped ; the template renders with the original
  seller photo so dev environments without a fal.ai account stay
  functional and a transient provider outage doesn't 502 the user.
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import logging
import sys
from io import BytesIO
from pathlib import Path
from typing import Literal, TypedDict
from uuid import UUID

import httpx
import qrcode
from jinja2 import Template
from playwright.sync_api import sync_playwright
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.services.ipfs import build_ipfs_url
from app.models.product import Product
from app.models.seller_profile import SellerProfile
from app.services.caption_generator import (
    CaptionGenerationError,
    generate_caption,
)
from app.services.ipfs import ipfs_service

logger = logging.getLogger(__name__)

TemplateKey = Literal["ig_square", "ig_story", "wa_status", "tiktok", "fb_feed"]
CaptionLang = Literal["en", "sw"]

TEMPLATES_DIR = Path(__file__).parent / "asset_templates"

TEMPLATE_DIMENSIONS: dict[TemplateKey, tuple[int, int]] = {
    "ig_square": (1080, 1080),
    "ig_story": (1080, 1920),
    "wa_status": (1080, 1920),
    "tiktok": (1080, 1920),
    "fb_feed": (1200, 630),
}

# Image-slot dimensions per asset_templates/*.html. The clean-isolate
# pipeline (ADR-048) generates a PNG sized to fit each template's
# product-image slot exactly — no cropping, no aspect mismatch.
TEMPLATE_IMAGE_SLOT: dict[TemplateKey, tuple[int, int]] = {
    "ig_square": (880, 660),
    "ig_story": (920, 920),
    "wa_status": (920, 920),
    "tiktok": (920, 920),
    "fb_feed": (540, 630),
}

# fal.ai background-removal model. birefnet/v2 is the highest-quality
# segmentation model on fal.ai for product photos (~$0.001/image,
# 35× cheaper than Flux Kontext Pro). It returns a transparent PNG
# of the original product ; we then composite it on a clean white
# canvas via Pillow. ADR-048 spells out the rationale for switching
# from Flux Kontext (generative, smoothes brand text) to this
# surgical pipeline (preserves the product 100 %).
REMBG_MODEL_ID = "fal-ai/birefnet/v2"
REMBG_TIMEOUT_SECONDS = 60.0
# 5 % margin around the product inside the image slot so the subject
# isn't flush against the rounded-corner border of the template.
ISOLATE_MARGIN = 0.05


class AssetGenerationResult(TypedDict):
    ipfs_hash: str
    image_url: str
    caption: str
    template: str


def _generate_qr_data_url(url: str) -> str:
    """Render the product URL as a base64 PNG data: URL for HTML embedding."""
    qr = qrcode.QRCode(version=1, box_size=10, border=2)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = BytesIO()
    img.save(buf, format="PNG")
    return f"data:image/png;base64,{base64.b64encode(buf.getvalue()).decode()}"


def _dev_stub_hash(content: bytes) -> str:
    """Mirror of routers/uploads.py:_dev_stub_hash — distinctive QmDev prefix
    so dev fallback hashes are never confused with real CIDs."""
    digest = hashlib.sha256(content).hexdigest()[:40]
    return f"QmDev{digest}"


def _render_sync(template_name: TemplateKey, template_vars: dict) -> bytes:
    """Sync Playwright render. Called via asyncio.to_thread() so it runs
    in a worker thread. Even the sync API uses asyncio internally
    (Playwright's transport calls create_subprocess_exec), so on Windows
    we have to swap the global event-loop policy from Selector (forced
    by psycopg async at app start) to Proactor for the duration of the
    render — Selector loops on Windows don't support subprocesses.
    No-op on Linux in production."""
    width, height = TEMPLATE_DIMENSIONS[template_name]
    template_path = TEMPLATES_DIR / f"{template_name}.html"
    if not template_path.exists():
        raise FileNotFoundError(f"Template {template_name}.html not found")

    template = Template(template_path.read_text(encoding="utf-8"))
    rendered_html = template.render(**template_vars)

    prev_policy = None
    if sys.platform == "win32":
        prev_policy = asyncio.get_event_loop_policy()
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            try:
                context = browser.new_context(
                    viewport={"width": width, "height": height}
                )
                page = context.new_page()
                page.set_content(rendered_html, wait_until="networkidle")
                png_bytes = page.screenshot(full_page=False)
            finally:
                browser.close()
    finally:
        if prev_policy is not None:
            asyncio.set_event_loop_policy(prev_policy)

    return png_bytes


async def _render_template_to_png(
    template_name: TemplateKey,
    template_vars: dict,
) -> bytes:
    return await asyncio.to_thread(_render_sync, template_name, template_vars)


def _build_template_vars(
    product: Product,
    primary_image_url: str,
    seller_handle: str,
) -> dict:
    """Compose the Jinja2 template context for the Playwright render.
    Extracted as a helper so the clean-isolate path and the
    fall-back-to-original-photo path share the same vars dict shape."""
    product_url = f"https://etalo.app/{seller_handle}/{product.slug}"
    return {
        "product_image_url": primary_image_url,
        "title": product.title,
        "price_usdt": f"{product.price_usdt:.2f}",
        "seller_handle": seller_handle,
        "qr_url": _generate_qr_data_url(product_url),
    }


async def _pin_with_dev_fallback(content: bytes, filename: str) -> str:
    """Pin PNG to Pinata if creds are present, otherwise return a deterministic
    dev stub hash. Same fallback pattern as routers/uploads.py."""
    has_creds = bool(
        settings.pinata_jwt
        or (settings.pinata_api_key and settings.pinata_api_secret)
    )
    if not has_creds:
        logger.warning(
            "Pinata creds missing — returning dev-stub hash for %s (%d bytes).",
            filename,
            len(content),
        )
        return _dev_stub_hash(content)
    return await ipfs_service.upload_image(content, filename)


async def _render_via_clean_isolate(
    image_url: str,
    template: TemplateKey,
) -> bytes:
    """Surgical bg-removal pipeline (ADR-048).

    1. Send the seller's product photo to fal.ai birefnet/v2 — a
       segmentation model that returns the product on a transparent
       canvas without modifying the product itself (key : preserves
       brand text, logos, colors, textures pixel-near-perfect, unlike
       generative restagers like Flux Kontext that smooth the same).
    2. Composite the transparent product on a pure white canvas
       sized to the template's image slot, with a 5 % margin so the
       subject doesn't crowd the slot's rounded-corner border.
    3. Return the white PNG as bytes ; the caller drops it into the
       Playwright HTML template via a base64 data: URL.

    Cost : ~$0.001 per call (vs $0.04-0.045 for Flux Kontext).
    Margin : ~99 % against 1 credit (0.15 USDT) revenue.
    """
    import fal_client  # local import — avoid pulling at module load

    logger.info("Clean-isolate call : template=%s", template)

    handler = await fal_client.subscribe_async(
        REMBG_MODEL_ID,
        arguments={"image_url": image_url},
    )
    image = handler.get("image")
    if not image or "url" not in image:
        raise RuntimeError(
            f"birefnet returned no image (handler keys={list(handler.keys())})"
        )
    transparent_url = image["url"]

    async with httpx.AsyncClient(timeout=REMBG_TIMEOUT_SECONDS) as client:
        resp = await client.get(transparent_url)
        resp.raise_for_status()
        transparent_bytes = resp.content

    return await asyncio.to_thread(
        _composite_on_white, transparent_bytes, template
    )


def _composite_on_white(
    transparent_bytes: bytes,
    template: TemplateKey,
) -> bytes:
    """Pillow-only sync helper : take a transparent PNG, scale it to
    fit a template's image slot with a small margin, paste centered
    on a pure white canvas. Wrapped via asyncio.to_thread so it
    doesn't block the event loop."""
    from PIL import Image

    out_w, out_h = TEMPLATE_IMAGE_SLOT[template]

    src = Image.open(BytesIO(transparent_bytes)).convert("RGBA")
    src_w, src_h = src.size

    # Compute scaled dimensions : fit within (1 - 2*margin) of the
    # slot, preserving aspect ratio.
    target_w = int(out_w * (1 - 2 * ISOLATE_MARGIN))
    target_h = int(out_h * (1 - 2 * ISOLATE_MARGIN))
    scale = min(target_w / src_w, target_h / src_h)
    new_w = max(1, int(src_w * scale))
    new_h = max(1, int(src_h * scale))
    resized = src.resize((new_w, new_h), Image.LANCZOS)

    canvas = Image.new("RGB", (out_w, out_h), (255, 255, 255))
    paste_x = (out_w - new_w) // 2
    paste_y = (out_h - new_h) // 2
    # Use the alpha channel as the paste mask so transparent pixels
    # don't bleed into the white canvas as gray fringes.
    canvas.paste(resized, (paste_x, paste_y), mask=resized.split()[3])

    out_buf = BytesIO()
    canvas.save(out_buf, format="PNG", optimize=True)
    return out_buf.getvalue()


async def generate_marketing_image(
    product_id: UUID,
    template: TemplateKey,
    caption_lang: CaptionLang,
    db: AsyncSession,
) -> AssetGenerationResult:
    """Generate a marketing image + caption for a seller's product.

    Pipeline:
    1. Fetch product + seller (eager-load chain for shop_handle + image)
    2. Build template vars (product image gateway URL, title, price,
       handle, QR data URL pointing at the public boutique product page)
    3. Render template HTML through Playwright -> PNG bytes
    4. Pin PNG to IPFS (Pinata) — falls back to QmDev... stub locally
    5. Caption is stubbed — Block 4 wires Claude API
    """
    stmt = (
        select(Product)
        .where(Product.id == product_id)
        .options(selectinload(Product.seller).selectinload(SellerProfile.user))
    )
    product = await db.scalar(stmt)
    if product is None:
        raise ValueError(f"Product {product_id} not found")

    primary_image_url = build_ipfs_url(
        product.image_ipfs_hashes[0]
        if product.image_ipfs_hashes
        else "QmPlaceholder"
    )
    seller_handle = product.seller.shop_handle.lower()

    # ADR-048 clean-isolate pipeline :
    #   1. fal.ai birefnet/v2 removes the bg from the seller's photo
    #      (transparent PNG, product preserved 100 % — text, logos,
    #      colors untouched, unlike Flux Kontext which generated
    #      around them).
    #   2. Pillow composites the product centered on a pure white
    #      canvas sized to the template image slot.
    #   3. Result fed to Playwright as a base64 data: URL ; chrome
    #      (header, title, price, CTA, QR) wraps it via the existing
    #      template HTML.
    #
    # If FAL_KEY is unset, or the birefnet call raises, fall back to
    # the original photo + chrome — the seller never sees a 502.
    image_for_template = primary_image_url
    if settings.fal_key:
        try:
            isolated_png_bytes = await _render_via_clean_isolate(
                primary_image_url, template
            )
            # data: URL keeps the round-trip in-process. Playwright
            # honors data: schemes natively.
            b64 = base64.b64encode(isolated_png_bytes).decode("ascii")
            image_for_template = f"data:image/png;base64,{b64}"
        except Exception:
            logger.exception(
                "Clean-isolate failed for product %s — falling back to "
                "the original photo with chrome.",
                product.id,
            )

    png_bytes = await _render_template_to_png(
        template,
        _build_template_vars(product, image_for_template, seller_handle),
    )

    filename = f"marketing_{product.id}_{template}_{caption_lang}.png"
    ipfs_hash = await _pin_with_dev_fallback(png_bytes, filename)

    try:
        caption = await generate_caption(
            title=product.title,
            price_usdt=f"{product.price_usdt:.2f}",
            description=product.description,
            seller_handle=seller_handle,
            country=product.seller.user.country or "AFR",
            lang=caption_lang,
        )
    except CaptionGenerationError as exc:
        logger.warning(
            "Caption generation failed for product %s — falling back: %s",
            product.id,
            exc,
        )
        caption = (
            f"{product.title} — {product.price_usdt} USDT @{seller_handle}"
        )

    return AssetGenerationResult(
        ipfs_hash=ipfs_hash,
        image_url=ipfs_service.get_url(ipfs_hash),
        caption=caption,
        template=template,
    )
