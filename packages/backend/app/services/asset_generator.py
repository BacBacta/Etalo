"""Asset generator — Sprint J7 Block 3, refactored for ADR-047.

Pipeline (production, FAL_KEY set):
1. Fetch product + seller (eager-load shop_handle + image)
2. Send the seller's product photo URL + per-template prompt to
   fal.ai Flux Kontext for AI retouch (white seamless studio backdrop,
   centered subject, professional ecommerce look)
3. Pin the retouched PNG to Pinata
4. Generate caption via Anthropic Claude
5. Return hash + URL + caption

Pipeline (dev fallback, FAL_KEY unset):
- Steps 1, 4, 5 same.
- Step 2/3 use the legacy Playwright/HTML template render so devs
  without a fal.ai account can still iterate the rest of the flow.
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

# Flux Kontext per-template config (ADR-047 hybrid pipeline).
#
# The aspect ratio MUST match the image slot inside the template, not
# the full template — Playwright wraps the Flux output in chrome
# (header, title, price, CTA, QR) and fits the photo in a fixed-size
# slot via `object-fit: cover`, so an aspect mismatch cropped the
# product (vacuum brushhead lost on first hybrid output).
#
# Image slot dimensions per asset_templates/*.html :
#   ig_square  : 880x660  (4:3 landscape)
#   ig_story   : 920x920  (1:1 square)
#   wa_status  : 920x920  (1:1 square)
#   tiktok     : 920x920  (1:1 square)
#   fb_feed    : 540x630  (close to 3:4 portrait)
FLUX_TEMPLATE_CONFIG: dict[TemplateKey, dict[str, str]] = {
    "ig_square": {
        "aspect_ratio": "4:3",
        "extra": "balanced landscape composition",
    },
    "ig_story": {
        "aspect_ratio": "1:1",
        "extra": "balanced square composition",
    },
    "wa_status": {
        "aspect_ratio": "1:1",
        "extra": "balanced square composition",
    },
    "tiktok": {
        "aspect_ratio": "1:1",
        "extra": "balanced square composition",
    },
    "fb_feed": {
        "aspect_ratio": "3:4",
        "extra": "balanced portrait composition",
    },
}

# Base prompt — the "preserve exact product details" sentence is the
# Kontext-specific guardrail that keeps the seller's product unchanged
# while the model only restyles the surrounding context. The
# `text labels visible on the product` clause targets text/logo
# preservation. The "minimal contact shadow only" + "no background
# shadow" clauses fix the heavy drop-shadow regression observed live
# (Dreame vacuum had a dramatic grey halo behind it). The pure-white
# wording with explicit hex push the backdrop away from the grey
# studio look that some test outputs landed on.
FLUX_BASE_PROMPT = (
    "Premium ecommerce product photo of this exact item, "
    "pure white #FFFFFF seamless paper backdrop, "
    "even bright lighting, no color cast, "
    "centered subject, only a minimal contact shadow directly under "
    "the product base, no large background shadow, no halo. "
    "Crisp magazine-quality detail with razor-sharp focus, "
    "high-resolution catalog product photography. "
    "Preserve the exact product shape, color, branding, "
    "text labels and logos visible on the product, "
    "and surface texture details. No artifacts."
)

FLUX_MODEL_ID = "fal-ai/flux-pro/kontext"
FLUX_TIMEOUT_SECONDS = 60.0


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
    """Compose the Jinja2 template context for the legacy Playwright
    composite path. Extracted as a helper so both the dispatch and
    the Flux-fallback branches share the same vars dict shape."""
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


async def _render_via_flux_kontext(
    image_url: str,
    template: TemplateKey,
) -> bytes:
    """Send the seller's product photo to fal.ai Flux Kontext for AI
    retouch (white studio backdrop, centered subject, ecom look) and
    return the resulting PNG as bytes. ADR-047.

    fal_client reads FAL_KEY from the env automatically (set via
    `fly secrets set FAL_KEY=...`). subscribe_async polls the queue
    until the image is ready ; the model name + arguments map 1:1 to
    the fal.ai API docs.
    """
    import fal_client  # local import — avoid pulling at module load

    cfg = FLUX_TEMPLATE_CONFIG[template]
    prompt = f"{FLUX_BASE_PROMPT} {cfg['extra']}."

    logger.info(
        "Flux Kontext call : template=%s aspect=%s prompt_chars=%d",
        template,
        cfg["aspect_ratio"],
        len(prompt),
    )

    handler = await fal_client.subscribe_async(
        FLUX_MODEL_ID,
        arguments={
            "prompt": prompt,
            "image_url": image_url,
            "aspect_ratio": cfg["aspect_ratio"],
            "output_format": "png",
            "safety_tolerance": "5",
            # 40 steps is the sweet spot for Kontext : ~10 % more cost
            # than the default 28 but visibly cleaner edges and
            # texture preservation. Goes from $0.04 to ~$0.045 — still
            # ~70 % margin against 1 credit revenue.
            "num_inference_steps": 40,
        },
    )

    images = handler.get("images") or []
    if not images:
        raise RuntimeError(
            f"Flux Kontext returned no images (handler keys={list(handler.keys())})"
        )
    output_url = images[0]["url"]

    async with httpx.AsyncClient(timeout=FLUX_TIMEOUT_SECONDS) as client:
        resp = await client.get(output_url)
        resp.raise_for_status()
        return resp.content


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

    # ADR-047 hybrid pipeline :
    #   1. Flux Kontext retouches the seller's photo (clean studio
    #      backdrop, soft lighting) — but loses the Etalo brand chrome.
    #   2. Playwright then composites the chrome (header, title, price,
    #      CTA, QR) over the retouched photo via the existing template.
    # The Flux output is fed to Playwright as a base64 data: URL so we
    # avoid a Pinata round-trip just to host the intermediate image.
    #
    # If FAL_KEY is unset, or the Flux call raises, we degrade
    # gracefully to the original photo + chrome (= the pre-ADR-047
    # baseline). The seller never sees a 502.
    image_for_template = primary_image_url
    if settings.fal_key:
        try:
            flux_png_bytes = await _render_via_flux_kontext(
                primary_image_url, template
            )
            # data: URL keeps the round-trip in-process. Playwright
            # honors data: schemes natively.
            b64 = base64.b64encode(flux_png_bytes).decode("ascii")
            image_for_template = f"data:image/png;base64,{b64}"
        except Exception:
            logger.exception(
                "Flux Kontext failed for product %s — falling back to "
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
