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
import time
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

# Composite output is 2× the template slot dimensions. The browser
# downscales it to the slot at render time, which preserves source
# photo detail far better than letting Pillow downscale a multi-
# megapixel phone shot directly to 920x920 (Lanczos blurred fine
# details on a Dreame vacuum live test). 2× is the sweet spot for
# retina displays — 3× was blowing the data URL to 1.5 MB and Playwright
# spent ~25s parsing it before rendering.
COMPOSITE_OUTPUT_SCALE = 2

# Max longest-side of the seller's source photo before we send it to
# birefnet. Phone shots are routinely 12+ MP (3000x4000) which makes
# birefnet ~3× slower than necessary, balloons the transparent PNG it
# returns, and slows Pillow's downstream resize. 1536 is plenty for
# clean segmentation of a centered product on a plain background, and
# keeps the JPEG payload around 200 KB so fal upload is sub-second.
MAX_SOURCE_DIM_FOR_ISOLATION = 1536


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


def _resize_for_isolation(src_bytes: bytes) -> bytes:
    """Downscale the seller's photo to MAX_SOURCE_DIM_FOR_ISOLATION on
    its longest side and re-encode as JPEG. Phone photos are routinely
    12+ MP; birefnet doesn't need that to segment a product cleanly,
    and the smaller payload speeds up upload + processing + the
    transparent PNG download afterwards. Q=92 is visually lossless on
    a centered product. RGBA/P sources are flattened — JPEG can't carry
    alpha and we don't need it pre-segmentation.

    `exif_transpose` is non-negotiable : phone photos almost always carry
    an EXIF Orientation tag (typically 6 = rotate 90° CW for portraits)
    and Pillow doesn't apply it on `Image.open`. Skipping this once
    shipped a regression where every portrait product came back from
    birefnet rotated to landscape (vacuum lying on its side).
    """
    from PIL import Image, ImageOps

    im = Image.open(BytesIO(src_bytes))
    im = ImageOps.exif_transpose(im)
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGB")
    w, h = im.size
    if max(w, h) > MAX_SOURCE_DIM_FOR_ISOLATION:
        scale = MAX_SOURCE_DIM_FOR_ISOLATION / max(w, h)
        im = im.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    buf = BytesIO()
    im.save(buf, format="JPEG", quality=92, optimize=True)
    return buf.getvalue()


async def _render_via_clean_isolate(
    image_url: str,
    template: TemplateKey,
) -> bytes:
    """Surgical bg-removal pipeline (ADR-048).

    1. Download the seller's photo, fix EXIF orientation, and downscale
       to <=1536px on its longest side before sending to fal.ai — see
       `_resize_for_isolation` for why (12 MP phone shots make every
       step ~3× slower).
    2. Upload the resized JPEG via `fal_client.upload_async` (returns a
       short fal storage URL) and pass that URL to birefnet/v2 — a
       segmentation model that returns the product on a transparent
       canvas without modifying the product itself (preserves brand
       text, logos, colors, textures pixel-near-perfect, unlike
       generative restagers like Flux Kontext that smooth the same).
       Inline data: URLs work but were observed to make birefnet ~4×
       slower (42s vs 11s for the same image) — fal seems to re-upload
       to its storage internally before queueing, doubling the round-trip.
    3. Composite the transparent product on a pure white canvas
       sized to the template's image slot, with a 5 % margin so the
       subject doesn't crowd the slot's rounded-corner border.
    4. Return the white PNG as bytes ; the caller drops it into the
       Playwright HTML template via a base64 data: URL.

    Cost : ~$0.001 per call (vs $0.04-0.045 for Flux Kontext).
    Margin : ~99 % against 1 credit (0.15 USDT) revenue.
    """
    import fal_client  # local import — avoid pulling at module load

    logger.info("Clean-isolate call : template=%s", template)

    t = time.monotonic()
    async with httpx.AsyncClient(timeout=REMBG_TIMEOUT_SECONDS) as client:
        resp = await client.get(image_url)
        resp.raise_for_status()
        src_bytes = resp.content
    resized_bytes = await asyncio.to_thread(_resize_for_isolation, src_bytes)
    fal_url = await fal_client.upload_async(
        resized_bytes, content_type="image/jpeg"
    )
    logger.info(
        "step.resize: %d KB → %d KB in %.2fs (uploaded to fal storage)",
        len(src_bytes) // 1024,
        len(resized_bytes) // 1024,
        time.monotonic() - t,
    )

    t = time.monotonic()
    handler = await fal_client.subscribe_async(
        REMBG_MODEL_ID,
        arguments={"image_url": fal_url},
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
    logger.info("step.birefnet: %.2fs", time.monotonic() - t)

    t = time.monotonic()
    composite = await asyncio.to_thread(
        _composite_on_white, transparent_bytes, template
    )
    logger.info("step.composite: %.2fs", time.monotonic() - t)
    return composite


def _composite_on_white(
    transparent_bytes: bytes,
    template: TemplateKey,
) -> bytes:
    """Pillow-only sync helper : take a transparent PNG, auto-correct
    its color channels, scale it to fit the template slot with a
    margin, paste the product centered on a pure white canvas.
    Wrapped via `asyncio.to_thread` so it doesn't block the event
    loop.

    Output canvas is `COMPOSITE_OUTPUT_SCALE`× the template slot
    dimensions so the browser downscale at render time preserves
    source photo detail.

    Drop shadow is delegated to the template's CSS `box-shadow` on
    `.product-image` — baking a Pillow shadow under the product on
    top of the CSS one stacked into a muddy double-shadow.
    """
    from PIL import Image

    slot_w, slot_h = TEMPLATE_IMAGE_SLOT[template]
    out_w = slot_w * COMPOSITE_OUTPUT_SCALE
    out_h = slot_h * COMPOSITE_OUTPUT_SCALE

    src = Image.open(BytesIO(transparent_bytes)).convert("RGBA")
    src = _auto_correct_rgba(src)
    src_w, src_h = src.size

    target_w = int(out_w * (1 - 2 * ISOLATE_MARGIN))
    target_h = int(out_h * (1 - 2 * ISOLATE_MARGIN))
    # Fit-to-target with Lanczos in both directions. Capping upscale at
    # 4x guards against accidental thumbnails (e.g. 200px sources)
    # ballooning to soup. Typical phone photos (1500-3000px) end up
    # upscaled <2x, which Lanczos handles cleanly on a transparent-bg
    # subject. Without this, sources smaller than `slot * 3 * 0.9`
    # stayed at native resolution on the 3x canvas and rendered as a
    # tiny product floating in white space (regression from dc3513a).
    scale = min(target_w / src_w, target_h / src_h, 4.0)
    new_w = max(1, int(src_w * scale))
    new_h = max(1, int(src_h * scale))
    resized = src.resize((new_w, new_h), Image.LANCZOS) if scale != 1.0 else src

    canvas = Image.new("RGB", (out_w, out_h), (255, 255, 255))
    paste_x = (out_w - new_w) // 2
    paste_y = (out_h - new_h) // 2

    canvas.paste(resized, (paste_x, paste_y), mask=resized.split()[3])

    out_buf = BytesIO()
    canvas.save(out_buf, format="PNG", optimize=True)
    composite_bytes = out_buf.getvalue()
    logger.info(
        "Composite %s : src=%dx%d → canvas=%dx%d (scale=%.3f) → %d KB",
        template,
        src_w,
        src_h,
        out_w,
        out_h,
        scale,
        len(composite_bytes) // 1024,
    )
    return composite_bytes


def _auto_correct_rgba(src):
    """Auto-correct an RGBA image's color channels (white balance via
    autocontrast, mild saturation boost, light sharpening). The alpha
    channel is preserved untouched."""
    from PIL import Image, ImageEnhance, ImageFilter, ImageOps

    r, g, b, a = src.split()
    rgb = Image.merge("RGB", (r, g, b))
    # cutoff=1 = clip the brightest/darkest 1 % to anchor white/black,
    # which reliably normalizes the muddy-yellow indoor shots we see
    # from sellers without nuking pure-white backdrops or pure-black
    # logos when the source is already well-exposed.
    rgb = ImageOps.autocontrast(rgb, cutoff=1)
    rgb = ImageEnhance.Color(rgb).enhance(1.10)
    # Mild sharpening only. percent=60 was creating visible halos on
    # birefnet's already-clean cutout edges (the alpha mask gives a
    # hard product/transparent boundary, and unsharp mask amplifies
    # any pixel-level transition into a bright/dark fringe).
    rgb = rgb.filter(
        ImageFilter.UnsharpMask(radius=1, percent=25, threshold=4)
    )
    r2, g2, b2 = rgb.split()
    return Image.merge("RGBA", (r2, g2, b2, a))


async def _generate_caption_safe(
    product: Product,
    seller_handle: str,
    caption_lang: CaptionLang,
) -> str:
    """generate_caption + the title/price fallback in one place so it
    can run as an asyncio task in parallel with image rendering."""
    try:
        return await generate_caption(
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
        return f"{product.title} — {product.price_usdt} USDT @{seller_handle}"


async def generate_marketing_image(
    product_id: UUID,
    template: TemplateKey,
    caption_lang: CaptionLang,
    db: AsyncSession,
) -> AssetGenerationResult:
    """Generate a marketing image + caption for a seller's product.

    Pipeline:
    1. Fetch product + seller (eager-load chain for shop_handle + image).
    2. Kick off caption gen as an asyncio task — it has no dependency
       on the image pipeline and runs in parallel with the rendering
       work below (~2-3 s saved on the wall clock).
    3. Clean-isolate via fal.ai birefnet/v2 → composite on white.
    4. Render the template HTML with the cleaned product as a base64
       data: URL (Playwright).
    5. Pin the final PNG to IPFS (Pinata) — falls back to QmDev... stub
       locally.
    6. Await the caption task and return.
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

    overall_start = time.monotonic()
    caption_task = asyncio.create_task(
        _generate_caption_safe(product, seller_handle, caption_lang)
    )

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
            t = time.monotonic()
            isolated_png_bytes = await _render_via_clean_isolate(
                primary_image_url, template
            )
            logger.info(
                "step.clean_isolate_total: %.2fs", time.monotonic() - t
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

    t = time.monotonic()
    png_bytes = await _render_template_to_png(
        template,
        _build_template_vars(product, image_for_template, seller_handle),
    )
    logger.info("step.playwright: %.2fs", time.monotonic() - t)

    t = time.monotonic()
    filename = f"marketing_{product.id}_{template}_{caption_lang}.png"
    ipfs_hash = await _pin_with_dev_fallback(png_bytes, filename)
    logger.info("step.pinata: %.2fs", time.monotonic() - t)

    t = time.monotonic()
    caption = await caption_task
    logger.info("step.caption_wait: %.2fs", time.monotonic() - t)

    logger.info(
        "generate_marketing_image total: %.2fs (template=%s)",
        time.monotonic() - overall_start,
        template,
    )

    return AssetGenerationResult(
        ipfs_hash=ipfs_hash,
        image_url=ipfs_service.get_url(ipfs_hash),
        caption=caption,
        template=template,
    )
