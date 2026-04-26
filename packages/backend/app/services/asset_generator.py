"""Asset generator — Sprint J7 Block 3.

Pipeline: fetch product+seller -> render Jinja2 HTML template via
Playwright headless Chromium -> pin PNG to IPFS via Pinata (with dev
stub fallback when creds are missing) -> return hash + URL + caption.

Caption is currently stubbed; Block 4 wires Claude API for real
EN/Swahili captions. Credit deduction is stubbed; Block 6 wires the
EtaloCredits hybrid balance check + off-chain ledger consumption.
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

import qrcode
from jinja2 import Template
from playwright.sync_api import sync_playwright
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.models.product import Product
from app.models.seller_profile import SellerProfile
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


async def _pin_with_dev_fallback(content: bytes, filename: str) -> str:
    """Pin PNG to Pinata if creds are present, otherwise return a deterministic
    dev stub hash. Same fallback pattern as routers/uploads.py."""
    has_creds = bool(settings.pinata_api_key and settings.pinata_api_secret)
    if not has_creds:
        logger.warning(
            "Pinata creds missing — returning dev-stub hash for %s (%d bytes).",
            filename,
            len(content),
        )
        return _dev_stub_hash(content)
    return await ipfs_service.upload_image(content, filename)


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

    primary_image_url = (
        f"{settings.pinata_gateway_url.rstrip('/')}/{product.image_ipfs_hashes[0]}"
        if product.image_ipfs_hashes
        else f"{settings.pinata_gateway_url.rstrip('/')}/QmPlaceholder"
    )
    seller_handle = product.seller.shop_handle.lower()
    product_url = f"https://etalo.app/{seller_handle}/{product.slug}"
    qr_data_url = _generate_qr_data_url(product_url)

    template_vars = {
        "product_image_url": primary_image_url,
        "title": product.title,
        "price_usdt": f"{product.price_usdt:.2f}",
        "seller_handle": seller_handle,
        "qr_url": qr_data_url,
    }

    png_bytes = await _render_template_to_png(template, template_vars)

    filename = f"marketing_{product.id}_{template}_{caption_lang}.png"
    ipfs_hash = await _pin_with_dev_fallback(png_bytes, filename)

    caption = (
        f"[Block 4: caption in {caption_lang} for '{product.title}' — "
        f"{product.price_usdt} USDT @{seller_handle}]"
    )

    return AssetGenerationResult(
        ipfs_hash=ipfs_hash,
        image_url=ipfs_service.get_url(ipfs_hash),
        caption=caption,
        template=template,
    )
