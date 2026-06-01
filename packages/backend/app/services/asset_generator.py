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
from app.services.short_link_service import create_short_link

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

# ADR-049 V1 enhance-photo flow uses a fixed square 2048×2048 output
# instead of per-template slot dimensions — the enhanced photo becomes
# the product's hero image (Product.image_ipfs_hashes[0]) and a square
# format is universal across the boutique grid + storefront detail view.
ENHANCE_OUTPUT_DIM = 2048

# Cream off-white backdrop, warmer than pure #FFFFFF. Matches the
# Net-a-Porter / MyTheresa premium ecom convention — pure white reads
# as clinical/cold on consumer-grade phone screens, the cream tone makes
# product photos feel more curated. Hex #F7F5F0. Used as the default
# preset's backdrop (overridden per category — see ENHANCE_PRESETS).
ENHANCE_BACKDROP_RGB = (247, 245, 240)


# Per-category enhance presets — the V1 pipeline was one-size-fits-all
# (cream bg + 10 % sat + soft sharpen) which plateaued quality across
# different product types. Tighten:
#  - backdrop: warmer cream for beauty, neutral light gray for home
#  - saturation: high for beauty packagings, neutral for home (preserve
#    real wood/metal tones), low for food (avoid washing out food colors)
#  - sharpening: stronger for home (hard product lines / electronics
#    edges) and beauty packaging fonts ; lighter for food and fashion
#    (texture noise / fabric patterns amplify ugly with hard sharpening)
#  - margin: more air for fashion (tall garments / shoes) ; tighter for
#    beauty/home where the product is the whole story
# Sharpen percents are deliberately gentle : the matte now carries a
# feathered edge and sources are compressed phone JPEGs, so aggressive
# UnsharpMask amplified noise / halos / JPEG blocks ("crunchy" look).
# Higher thresholds keep flat / noisy regions untouched and only crisp
# genuine product edges.
ENHANCE_PRESETS: dict[str, dict] = {
    "fashion": {
        "backdrop": (247, 245, 240),  # #F7F5F0 cream
        "saturation": 1.05,
        "sharpen_radius": 1,
        "sharpen_percent": 12,
        "sharpen_threshold": 5,
        "margin": 0.07,
    },
    "beauty": {
        "backdrop": (250, 247, 242),  # #FAF7F2 warmer cream
        "saturation": 1.12,
        "sharpen_radius": 1,
        "sharpen_percent": 18,
        "sharpen_threshold": 4,
        "margin": 0.06,
    },
    "food": {
        "backdrop": (250, 245, 235),  # #FAF5EB warm cream
        "saturation": 1.08,
        "sharpen_radius": 1,
        "sharpen_percent": 10,
        "sharpen_threshold": 6,
        "margin": 0.05,
    },
    "home": {
        "backdrop": (245, 245, 245),  # #F5F5F5 neutral light gray
        "saturation": 1.0,
        "sharpen_radius": 1,
        "sharpen_percent": 20,
        "sharpen_threshold": 4,
        "margin": 0.05,
    },
    "other": {
        "backdrop": ENHANCE_BACKDROP_RGB,
        "saturation": 1.05,
        "sharpen_radius": 1,
        "sharpen_percent": 14,
        "sharpen_threshold": 5,
        "margin": 0.05,
    },
}

DEFAULT_PRESET_KEY = "other"


def get_enhance_preset(category: str | None) -> dict:
    """Return the enhance preset for a category, falling back to "other"
    on unknown / null inputs (defensive — sellers can theoretically set
    a stale category from before the enum was locked)."""
    if category is None:
        return ENHANCE_PRESETS[DEFAULT_PRESET_KEY]
    return ENHANCE_PRESETS.get(category, ENHANCE_PRESETS[DEFAULT_PRESET_KEY])


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
    short_url: str,
) -> dict:
    """Compose the Jinja2 template context for the Playwright render.
    Extracted as a helper so the clean-isolate path and the
    fall-back-to-original-photo path share the same vars dict shape.

    `short_url` is the trackable etalo.app/r/{code} URL the templates
    display and that the QR encodes, so seller posts and image-pixels
    point at the same destination.
    """
    return {
        "product_image_url": primary_image_url,
        "title": product.title,
        "price_usdt": f"{product.price_usdt:.2f}",
        "seller_handle": seller_handle,
        "short_url": short_url,
        "qr_url": _generate_qr_data_url(short_url),
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


def _erode_alpha_edges(rgba_image, erosion_pixels: int = 3):
    """Erode the alpha channel by `erosion_pixels` pixels around all
    edges. birefnet's bg-removal leaves a soft alpha gradient at the
    product/background boundary ; those alpha-blended pixels carry
    color from BOTH the product AND the original backdrop. When we
    composite on a new backdrop, the contaminated edge reveals as a
    color cast — particularly nasty on white products photographed
    against warm/colored surfaces (the FOHERB-on-wood case).

    Stripping a few pixels from the alpha edge removes the contaminated
    zone entirely. The product silhouette becomes ~3px smaller but on
    a 2048×2048 canvas with a product spanning ~1500px, that's <0.2 %
    — imperceptible.

    Implemented via Pillow's MinFilter on the alpha band, which shrinks
    bright (=opaque) regions by N pixels. RGB channels untouched.
    """
    from PIL import Image, ImageFilter

    if erosion_pixels < 1:
        return rgba_image
    r, g, b, a = rgba_image.split()
    kernel_size = erosion_pixels * 2 + 1
    a_eroded = a.filter(ImageFilter.MinFilter(size=kernel_size))
    return Image.merge("RGBA", (r, g, b, a_eroded))


def _refine_alpha_edges(rgba_image, erosion_pixels: int = 1, feather_radius: float = 1.0):
    """Premium edge treatment for the matte. Replaces the blunt 3px
    erosion : a hard 3px shave kills color bleed but also eats thin
    product parts (straps, handles, jewellery) and leaves a crisp
    "sticker" cut-out outline that reads as fake.

    Two gentle steps instead :
    1. Erode 1px — strips only the worst birefnet edge-bleed pixel.
    2. Gaussian-feather the alpha — softens the boundary so the product
       melts into the backdrop like a real photograph rather than a
       detoured layer. Thin parts survive because we only shave 1px.

    RGB channels untouched ; only the alpha band is refined.
    """
    from PIL import Image, ImageFilter

    r, g, b, a = rgba_image.split()
    if erosion_pixels >= 1:
        a = a.filter(ImageFilter.MinFilter(size=erosion_pixels * 2 + 1))
    if feather_radius > 0:
        a = a.filter(ImageFilter.GaussianBlur(radius=feather_radius))
    return Image.merge("RGBA", (r, g, b, a))


def _studio_backdrop(out_dim: int, base_rgb: tuple[int, int, int]):
    """Generate a studio-sweep backdrop instead of a flat fill. A soft
    radial light pool sits slightly above centre (where the product
    lands) and falls off toward the edges into a gentle vignette — the
    same light gradient a seamless paper sweep produces under a softbox.
    A flat solid colour is the tell-tale sign of a cheap cut-out tool ;
    this single change does most of the "studio" lift.

    Brightness ranges from +6 % at the light centre to ~-12 % at the far
    corners, applied multiplicatively to the per-category base colour so
    each preset keeps its hue (cream / cool grey / warm).
    """
    import numpy as np
    from PIL import Image

    yy, xx = np.mgrid[0:out_dim, 0:out_dim].astype(np.float32)
    cx, cy = out_dim * 0.5, out_dim * 0.42  # light pool a touch above centre
    dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    dist /= dist.max()  # normalise 0..1
    # Smooth falloff : bright near the pool, vignette at the corners.
    factor = 1.06 - 0.18 * np.clip(dist, 0.0, 1.0) ** 1.4
    base = np.array(base_rgb, dtype=np.float32)
    arr = np.clip(base[None, None, :] * factor[:, :, None], 0, 255).astype(np.uint8)
    return Image.fromarray(arr, "RGB")


def _paste_silhouette_shadow(canvas, product_rgba, paste_x, paste_y, out_dim):
    """Cast a shadow shaped like the product's actual silhouette, squashed
    onto the floor and softly blurred — replaces the generic blurred
    ellipse (which reads as a floating blob detached from the product).

    Build : fill the product's alpha with black → squash vertically to
    ~22 % height (foreshortened ground cast) → heavy gaussian blur →
    drop opacity to ~45 % → anchor at the product's base with a slight
    overlap so the contact point reads as grounded.
    """
    from PIL import Image, ImageFilter

    pw, ph = product_rgba.size
    alpha = product_rgba.split()[3]
    black = Image.new("RGBA", (pw, ph), (0, 0, 0, 255))
    transparent = Image.new("RGBA", (pw, ph), (0, 0, 0, 0))
    shadow = Image.composite(black, transparent, alpha)

    squash_h = max(8, int(ph * 0.22))
    shadow = shadow.resize((pw, squash_h), Image.LANCZOS)

    blur = max(10, int(out_dim * 0.018))
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=blur))

    r, g, b, a = shadow.split()
    a = a.point(lambda v: int(v * 0.45))
    shadow = Image.merge("RGBA", (r, g, b, a))

    sx = paste_x
    sy = paste_y + ph - int(squash_h * 0.55)  # overlap base for contact
    canvas.paste(shadow, (sx, sy), shadow)


def _composite_square(
    transparent_bytes: bytes,
    preset: dict | None = None,
) -> bytes:
    """ADR-049 V1 enhance flow : take a transparent PNG and paste it
    centered on a square 2048×2048 canvas using the preset's backdrop
    color. No template chrome, no per-platform slot dimensions — the
    output is the seller's new product hero photo, used universally
    across the boutique grid + storefront detail view.

    Crops to the alpha bbox first so the visible product is centered
    against the canvas, not against where it happened to sit in the
    seller's original phone shot.

    `preset` (default = the "other" preset) decides the backdrop color,
    auto-correct strength, the margin around the product, and whether
    to erode the alpha edge to kill birefnet edge-bleed casts.
    """
    from PIL import Image

    if preset is None:
        preset = ENHANCE_PRESETS[DEFAULT_PRESET_KEY]

    out_dim = ENHANCE_OUTPUT_DIM
    src = Image.open(BytesIO(transparent_bytes)).convert("RGBA")

    # Refine the matte edge (1px erode + feather) BEFORE color correction
    # so autocontrast / saturation operate on clean product pixels and the
    # boundary melts into the backdrop instead of reading as a sticker
    # cut-out. Gentler than the old blunt 3px shave → thin parts survive.
    src = _refine_alpha_edges(src, erosion_pixels=1, feather_radius=1.0)
    src = _auto_correct_rgba(src, preset)

    bbox = src.getbbox()
    if bbox is not None:
        src = src.crop(bbox)
    src_w, src_h = src.size

    margin = preset.get("margin", ISOLATE_MARGIN)
    target = int(out_dim * (1 - 2 * margin))
    scale = min(target / src_w, target / src_h, 4.0)
    new_w = max(1, int(src_w * scale))
    new_h = max(1, int(src_h * scale))
    resized = src.resize((new_w, new_h), Image.LANCZOS) if scale != 1.0 else src

    # Studio-sweep backdrop (radial light pool + vignette) instead of a
    # flat fill — the single biggest "studio" lift. Keeps the preset hue.
    backdrop = preset.get("backdrop", ENHANCE_BACKDROP_RGB)
    canvas = _studio_backdrop(out_dim, backdrop)
    paste_x = (out_dim - new_w) // 2
    paste_y = (out_dim - new_h) // 2

    # Silhouette-shaped contact shadow BEFORE pasting the product, so the
    # product overlaps the shadow's top edge and reads as grounded (not a
    # floating blob, and no double-shadow with any storefront CSS shadow).
    _paste_silhouette_shadow(canvas, resized, paste_x, paste_y, out_dim)

    canvas.paste(resized, (paste_x, paste_y), mask=resized.split()[3])

    out_buf = BytesIO()
    canvas.save(out_buf, format="PNG", optimize=True)
    composite_bytes = out_buf.getvalue()
    logger.info(
        "Composite enhance : src=%dx%d (cropped) → %dx%d bg=%s margin=%.0f%% neutralize=%s (scale=%.3f) → %d KB",
        src_w,
        src_h,
        out_dim,
        out_dim,
        backdrop,
        margin * 100,
        preset.get("neutralize_cast", False),
        scale,
        len(composite_bytes) // 1024,
    )
    return composite_bytes


def _paste_ground_shadow(canvas, prod_w, prod_h, paste_x, paste_y, canvas_dim):
    """Paste a soft elliptical ground shadow centered horizontally on
    the product, anchored at the product's bottom edge. Composited with
    a heavy gaussian blur so the shadow softens into the backdrop
    naturally — grounds the product so it doesn't read as floating /
    detoured from a Photoshop layer.

    Width = 85 % of the product's pasted width.
    Height = 2.5 % of the canvas dimension.
    Vertical anchor : 60 % of the shadow height SITS BEHIND the product
    (overlap), 40 % spreads below — gives a contact-shadow look.
    Opacity 70/255 (~28 %) before blur ; blur radius 1.2 % of canvas
    softens it across ~25 px on the 2048×2048 canvas.
    """
    from PIL import Image, ImageDraw, ImageFilter

    shadow_w = int(prod_w * 0.85)
    shadow_h = max(8, int(canvas_dim * 0.025))

    shadow_left = paste_x + (prod_w - shadow_w) // 2
    # Anchor : product bottom edge sits at 60 % of the way down the
    # shadow ellipse, so the ellipse extends 40 % below the product.
    shadow_top = paste_y + prod_h - int(shadow_h * 0.6)

    shadow_layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(shadow_layer)
    draw.ellipse(
        [
            shadow_left,
            shadow_top,
            shadow_left + shadow_w,
            shadow_top + shadow_h,
        ],
        fill=(0, 0, 0, 70),
    )

    blur_radius = max(8, int(canvas_dim * 0.012))
    shadow_blurred = shadow_layer.filter(
        ImageFilter.GaussianBlur(radius=blur_radius)
    )

    canvas.paste(shadow_blurred, (0, 0), shadow_blurred)


# =====================================================================
# ADR-049 Tier-1 — generative subject relighting (fal IC-Light v2).
#
# Pipeline when settings.enhance_relight_enabled :
#   birefnet matte (already paid) → composite the cut-out on neutral grey
#   + extract its alpha mask → IC-Light v2 relights ONLY the subject into
#   a coherent studio scene (real soft light + cast shadow) driven by a
#   category-aware prompt + a light direction → normalise to 2048².
#
# IC-Light is a *relighting* model : it preserves the subject's structure
# (more faithful to brand text / logos than a full restage) and changes
# lighting + background. ANY failure raises → caller falls back to the
# verified classical studio compositor, so enabling is always safe.
# =====================================================================

# Per-category studio-photography prompts. Kept product-neutral (no
# invented props) so IC-Light stages a clean professional scene without
# hallucinating objects onto the product.
_RELIGHT_PROMPTS: dict[str, str] = {
    "fashion": (
        "professional fashion product photography, soft diffused studio "
        "lighting, clean seamless light-grey backdrop, gentle natural "
        "shadow, high-end e-commerce catalogue, photorealistic"
    ),
    "beauty": (
        "premium beauty product photography, soft glowing studio light, "
        "clean minimal backdrop, subtle reflection, luxury cosmetics "
        "advertisement, crisp and photorealistic"
    ),
    "food": (
        "appetising food product photography, warm soft natural light, "
        "clean neutral backdrop, gentle shadow, fresh and vibrant, "
        "professional menu photography, photorealistic"
    ),
    "home": (
        "professional homeware product photography, even studio lighting, "
        "clean light backdrop, soft realistic shadow, modern catalogue "
        "look, sharp and photorealistic"
    ),
    "other": (
        "professional product photography, soft studio lighting, clean "
        "seamless backdrop, natural soft shadow, high-end e-commerce, "
        "photorealistic"
    ),
}

# Negative prompt — steer away from the classic generative failure modes
# on product shots.
_RELIGHT_NEGATIVE = (
    "blurry, distorted, deformed product, extra objects, text artifacts, "
    "watermark, oversaturated, harsh shadows, cluttered background, "
    "low quality, jpeg artifacts"
)

# Light directions cycled across variants so the 3 choices differ.
_RELIGHT_LIGHT_DIRECTIONS = ["Top", "Left", "Right"]

# Categories where generative relight HELPS : 3D-leaning products
# (bottles, jars, appliances, bags) gain real volume + lighting. Flat
# goods photographed laid-out (fashion garments, food on a plate) have no
# 3D form to relight and IC-Light degrades their framing — the classical
# studio compositor wins there. Probe evidence (Ndop textile) drove this.
_RELIGHT_CATEGORIES = {"beauty", "home", "other"}


def _relight_suitable(category: str | None) -> bool:
    """Whether generative relight is appropriate for this category.
    Unknown / None → treated as 'other' (allowed). Flat goods (fashion,
    food) are excluded → they keep the classical studio compositor."""
    return (category or "other") in _RELIGHT_CATEGORIES


def _relight_prompt(category: str | None) -> str:
    """Category-aware studio prompt for IC-Light. Falls back to 'other'."""
    if category is None:
        return _RELIGHT_PROMPTS["other"]
    return _RELIGHT_PROMPTS.get(category, _RELIGHT_PROMPTS["other"])


def _prep_subject_for_relight(
    transparent_bytes: bytes, pad_ratio: float = 0.08
) -> tuple[bytes, bytes]:
    """From a birefnet transparent matte, build the two inputs IC-Light
    wants : (1) the subject composited on neutral mid-grey (RGB JPEG —
    IC-Light keys lighting off a grey field, not transparency), and (2)
    the alpha as an L-mode mask PNG so the model conditions on the exact
    product silhouette.

    Both are produced SQUARE (product cropped to bbox, then centred on a
    square grey canvas with `pad_ratio` breathing room). A square subject
    makes IC-Light return a square scene, so the whole product stays
    visible — the earlier non-square output forced a destructive
    cover-crop that ate the product's edges.
    """
    from PIL import Image

    src = Image.open(BytesIO(transparent_bytes)).convert("RGBA")
    bbox = src.getbbox()
    if bbox is not None:
        src = src.crop(bbox)

    alpha = src.split()[3]
    w, h = src.size
    side = max(1, int(max(w, h) * (1 + 2 * pad_ratio)))
    ox, oy = (side - w) // 2, (side - h) // 2

    grey = Image.new("RGB", (side, side), (127, 127, 127))
    grey.paste(src, (ox, oy), mask=alpha)

    mask_canvas = Image.new("L", (side, side), 0)
    mask_canvas.paste(alpha, (ox, oy))

    subj_buf = BytesIO()
    grey.save(subj_buf, format="JPEG", quality=92)

    mask_buf = BytesIO()
    mask_canvas.save(mask_buf, format="PNG")

    return subj_buf.getvalue(), mask_buf.getvalue()


def _edge_color(im) -> tuple[int, int, int]:
    """Average colour of an image's four edges — used to pad letterbox
    bars with the scene's own background so they blend invisibly."""
    px = im.load()
    w, h = im.size
    samples = []
    for x in range(0, w, max(1, w // 20)):
        samples.append(px[x, 0])
        samples.append(px[x, h - 1])
    for y in range(0, h, max(1, h // 20)):
        samples.append(px[0, y])
        samples.append(px[w - 1, y])
    n = len(samples)
    return tuple(sum(c[i] for c in samples) // n for i in range(3))  # type: ignore[return-value]


def _normalize_to_square(image_bytes: bytes, out_dim: int = ENHANCE_OUTPUT_DIM) -> bytes:
    """Fit an IC-Light output into a centred out_dim×out_dim PNG WITHOUT
    cropping the product (contain, not cover). With a square subject the
    output is already square → a plain resize ; the contain+pad path is a
    safety net for any non-square output, padding the bars with the
    scene's own edge colour so they blend in."""
    from PIL import Image, ImageOps

    im = Image.open(BytesIO(image_bytes)).convert("RGB")
    fitted = ImageOps.contain(im, (out_dim, out_dim), method=Image.LANCZOS)

    if fitted.size != (out_dim, out_dim):
        canvas = Image.new("RGB", (out_dim, out_dim), _edge_color(fitted))
        fw, fh = fitted.size
        canvas.paste(fitted, ((out_dim - fw) // 2, (out_dim - fh) // 2))
        fitted = canvas

    out = BytesIO()
    fitted.save(out, format="PNG", optimize=True)
    return out.getvalue()


async def _relight_via_fal(
    transparent_bytes: bytes,
    category: str | None,
    initial_latent: str = "Top",
) -> bytes:
    """Relight an isolated product into a studio scene via fal IC-Light v2.
    Raises on any failure so the caller can fall back to the compositor.

    Input/response shape per the fal IC-Light v2 API contract :
    in  = {image_url, mask_image_url, prompt, negative_prompt,
           initial_latent, output_format, guidance_scale}
    out = {images: [{url, ...}], ...}
    """
    import fal_client  # local import — avoid module-load cost

    subject_bytes, mask_bytes = await asyncio.to_thread(
        _prep_subject_for_relight, transparent_bytes
    )
    subject_url, mask_url = await asyncio.gather(
        fal_client.upload_async(subject_bytes, content_type="image/jpeg"),
        fal_client.upload_async(mask_bytes, content_type="image/png"),
    )

    t = time.monotonic()
    handler = await fal_client.subscribe_async(
        settings.enhance_relight_model,
        arguments={
            "image_url": subject_url,
            "mask_image_url": mask_url,
            "prompt": _relight_prompt(category),
            "negative_prompt": _RELIGHT_NEGATIVE,
            "initial_latent": initial_latent,
            "output_format": "png",
            "guidance_scale": 5,
        },
    )
    images = handler.get("images") if isinstance(handler, dict) else None
    if not images or not images[0].get("url"):
        raise RuntimeError(
            f"IC-Light returned no image (keys={list(handler.keys()) if isinstance(handler, dict) else type(handler)})"
        )
    relit_url = images[0]["url"]

    async with httpx.AsyncClient(timeout=REMBG_TIMEOUT_SECONDS) as client:
        resp = await client.get(relit_url)
        resp.raise_for_status()
        relit_bytes = resp.content
    logger.info("step.relight: %.2fs (dir=%s)", time.monotonic() - t, initial_latent)

    return await asyncio.to_thread(_normalize_to_square, relit_bytes)


async def enhance_product_photo(
    image_url: str,
    category: str | None = None,
) -> bytes:
    """ADR-049 V1 — bg-remove the seller's product photo via fal.ai
    birefnet/v2 and composite on a square 2048×2048 canvas using a
    preset that combines the seller's `category` (Block A defaults)
    with vision insights from Claude (Block B overrides). Returns the
    final PNG bytes, ready to pin to IPFS and use as the product's
    hero image (Product.image_ipfs_hashes[0]).

    Pipeline order :
    1. Download source from IPFS gateway.
    2. Resize to 1536px JPEG (~200 KB) for fast birefnet upload.
    3. Vision call to Claude Sonnet 4.6 in PARALLEL with birefnet
       (asyncio.gather) — vision insights tune the composite preset
       without adding to wall-clock latency.
    4. birefnet returns a transparent PNG.
    5. Pillow composite on the preset-driven backdrop.

    Vision call failure / no API key → falls back to the category
    preset (Block A) cleanly. No regression vs Block A behavior.
    """
    import fal_client

    from app.services.vision_classifier import (
        analyze_product_image,
        select_preset_with_insights,
    )

    logger.info(
        "Enhance call : start category=%s",
        category,
    )

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
        "step.resize: %d KB → %d KB in %.2fs",
        len(src_bytes) // 1024,
        len(resized_bytes) // 1024,
        time.monotonic() - t,
    )

    # Run vision analysis in parallel with birefnet — both take a few
    # seconds, no need to serialize. Vision failures return None
    # (handled by select_preset_with_insights → category preset
    # fallback), so a Claude outage never blocks the enhance.
    t = time.monotonic()
    vision_task = asyncio.create_task(_safe_vision_call(src_bytes))
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
    insights = await vision_task
    logger.info(
        "step.vision: insights=%s (%.2fs since birefnet end)",
        insights,
        time.monotonic() - t,
    )

    preset = select_preset_with_insights(category, insights)
    logger.info("step.preset: backdrop=%s margin=%.2f sharpen=%d",
                preset.get("backdrop"), preset.get("margin"),
                preset.get("sharpen_percent"))

    # Tier-1 relight gate (single hero photo) : only for suitable (3D-
    # leaning) categories ; try IC-Light, fall back to the verified studio
    # compositor on any failure.
    if (
        settings.enhance_relight_enabled
        and settings.fal_key
        and _relight_suitable(category)
    ):
        try:
            relit = await _relight_via_fal(
                transparent_bytes, category, initial_latent="Top"
            )
            logger.info("step.relight: hero photo relit via IC-Light")
            return relit
        except Exception as exc:  # noqa: BLE001 — any failure → compositor
            logger.warning(
                "relight failed (%s) — falling back to studio compositor", exc
            )

    t = time.monotonic()
    composite = await asyncio.to_thread(
        _composite_square, transparent_bytes, preset
    )
    logger.info("step.composite: %.2fs", time.monotonic() - t)
    return composite


async def _safe_vision_call(src_bytes: bytes):
    """Wrap analyze_product_image so any unexpected error returns None
    (which select_preset_with_insights treats as "no insights, use
    category preset"). Defense-in-depth — analyze_product_image already
    catches anthropic.APIError but we want to swallow asyncio
    cancellation, network errors, etc. too without breaking the enhance."""
    try:
        from app.services.vision_classifier import analyze_product_image

        return await analyze_product_image(src_bytes)
    except Exception:
        logger.exception("Vision call failed unexpectedly — preset fallback")
        return None


# ADR-049 Block C — multi-variant generation. Three preset overrides
# applied to the SAME birefnet output, so we run birefnet once and
# composite three times. Cost = 1× birefnet ($0.001) + 3× Pillow
# (negligible). Charged at 1 credit (Mike's call) — margin stays >95%.
#
# Variant 1 = the seller-derived preset (Block A + B insights).
# Variant 2 = "white-bright" override (pure white backdrop, more sat).
# Variant 3 = "neutral-cool" override (light gray backdrop, less sat).
# Sellers pick whichever matches their aesthetic in the frontend grid.
def _variant_white_bright(base_preset: dict) -> dict:
    """Pure white backdrop + slightly more sat. Closer to the Apple /
    Bose pure-catalog aesthetic. Useful for products the seller wants
    to look 'clinical professional'."""
    adapted = dict(base_preset)
    adapted["backdrop"] = (255, 255, 255)
    adapted["saturation"] = min(1.20, base_preset.get("saturation", 1.05) + 0.05)
    return adapted


def _variant_neutral_cool(base_preset: dict) -> dict:
    """Light gray backdrop + slightly less sat. Closer to the
    Aesop / Muji muted-editorial aesthetic. Useful for sellers
    targeting a more sober brand voice."""
    adapted = dict(base_preset)
    adapted["backdrop"] = (235, 235, 232)
    adapted["saturation"] = max(0.95, base_preset.get("saturation", 1.05) - 0.05)
    return adapted


class EnhanceVariant(TypedDict):
    label: str
    backdrop_hex: str
    ipfs_hash: str
    image_url: str


async def enhance_product_photo_variants(
    image_url: str,
    category: str | None = None,
) -> tuple[list[EnhanceVariant], int]:
    """ADR-049 Block C — generate 3 variants of an enhance pipeline
    output for the same source photo. Sellers pick one in the
    frontend ; the unselected variants are pinned but unused (Pinata
    storage cost ~negligible).

    Returns a tuple `(variants, credits_consumed)` where credits_consumed
    is always 1 (Mike's call : 1 credit gives access to all 3 variants
    so sellers don't pay 3× for 3 alternatives of the same product
    photo). The credit consumption is the caller's job (this function
    just generates + pins).

    Pipeline :
    1. Download + resize source.
    2. Vision call in parallel with birefnet (same as single-variant).
    3. Compose THREE variant presets : recommended (Block A + B
       insights), white-bright, neutral-cool.
    4. Composite + pin all three in parallel via asyncio.gather.
    """
    import fal_client

    from app.services.vision_classifier import (
        select_preset_with_insights,
    )

    logger.info("Enhance variants : start category=%s", category)

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
        "step.resize: %d KB → %d KB in %.2fs",
        len(src_bytes) // 1024,
        len(resized_bytes) // 1024,
        time.monotonic() - t,
    )

    t = time.monotonic()
    vision_task = asyncio.create_task(_safe_vision_call(src_bytes))
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

    insights = await vision_task
    logger.info("step.vision: insights=%s", insights)

    recommended_preset = select_preset_with_insights(category, insights)
    presets: list[tuple[str, dict]] = [
        ("Recommended", recommended_preset),
        ("White bright", _variant_white_bright(recommended_preset)),
        ("Neutral cool", _variant_neutral_cool(recommended_preset)),
    ]

    t = time.monotonic()
    variants = await _build_enhance_variants(transparent_bytes, category, presets)
    logger.info(
        "step.variants: %d variants + pins in %.2fs",
        len(variants),
        time.monotonic() - t,
    )

    return list(variants), 1


async def _build_enhance_variants(
    transparent_bytes: bytes,
    category: str | None,
    presets: list[tuple[str, dict]],
) -> list[EnhanceVariant]:
    """Build + pin one EnhanceVariant per (label, preset).

    Tier-1 relight gate : when enabled, the first N variants are relit via
    IC-Light (1 fal call each, bounded by `enhance_relight_variants`); the
    rest stay on the verified classical compositor. ANY relight error for
    a given variant falls back to its compositor output, so the seller
    always gets a full set of usable choices. Extracted module-level so
    the control flow is unit-testable without the upstream birefnet call.
    """
    relight_on = bool(
        settings.enhance_relight_enabled
        and settings.fal_key
        and _relight_suitable(category)
    )
    relight_budget = settings.enhance_relight_variants if relight_on else 0

    async def _build_variant(index: int, label: str, preset: dict) -> EnhanceVariant:
        bd = preset["backdrop"]
        backdrop_hex = f"#{bd[0]:02X}{bd[1]:02X}{bd[2]:02X}"
        image_bytes: bytes | None = None

        if index < relight_budget:
            direction = _RELIGHT_LIGHT_DIRECTIONS[
                index % len(_RELIGHT_LIGHT_DIRECTIONS)
            ]
            try:
                image_bytes = await _relight_via_fal(
                    transparent_bytes, category, initial_latent=direction
                )
            except Exception as exc:  # noqa: BLE001 — any failure → fallback
                logger.warning(
                    "relight variant %d failed (%s) — falling back to compositor",
                    index,
                    exc,
                )

        if image_bytes is None:
            image_bytes = await asyncio.to_thread(
                _composite_square, transparent_bytes, preset
            )

        slug = label.replace(" ", "_").lower()
        filename = f"variant_{slug}_{int(time.monotonic())}.png"
        ipfs_hash = await ipfs_service.upload_image(image_bytes, filename)
        return EnhanceVariant(
            label=label,
            backdrop_hex=backdrop_hex,
            ipfs_hash=ipfs_hash,
            image_url=ipfs_service.get_url(ipfs_hash),
        )

    return list(
        await asyncio.gather(
            *(
                _build_variant(i, label, preset)
                for i, (label, preset) in enumerate(presets)
            )
        )
    )


def _neutralize_warm_white_casts(rgb):
    """Selectively desaturate "white surface with warm cast" pixels.
    Targets the FOHERB-on-wood failure mode where birefnet correctly
    identifies the cast pixels as PRODUCT (they're inside the
    silhouette, not at the edge), so alpha erosion can't fix them —
    the white curved surface naturally reflected wood color, baked
    into the source photo.

    Algorithm operates in HSV space :
    - Warm hue (red/orange/yellow) : Pillow H in [0, 34] OR [221, 255]
      (Pillow maps 0-360° to 0-255, so 35 ≈ 49° = yellow-orange).
    - Bright (V > 170) : excludes dark panels and shadows.
    - Mild-to-moderate saturation (5 < S < 110) : excludes neutral
      whites (S < 5) AND saturated brand colors / LEDs / packaging
      accents (S > 110).

    Pixels matching ALL three drop saturation to 15 % of original,
    pulling them toward neutral. Pixels outside the mask (cool tones,
    dark zones, fully saturated colors) are untouched. Validated on
    synthetic and live images : kills cast on white surfaces while
    preserving LED displays, dark control panels, and brand text.

    Numpy-vectorized — ~0.1 s on a 2048×2048 image (16x faster than
    the per-pixel Python loop variant we tried first, which timed out
    Fly's HTTP proxy when used in 3-variant pipelines on slow days).
    """
    import numpy as np
    from PIL import Image

    hsv_arr = np.array(rgb.convert("HSV"), dtype=np.uint8)
    h = hsv_arr[:, :, 0]
    s = hsv_arr[:, :, 1]
    v = hsv_arr[:, :, 2]

    is_warm = (h < 35) | (h > 220)
    is_bright = v > 170
    is_cast_sat = (s > 5) & (s < 110)
    mask = is_warm & is_bright & is_cast_sat

    new_s = np.where(
        mask,
        (s.astype(np.float32) * 0.15).astype(np.uint8),
        s,
    )
    hsv_arr[:, :, 1] = new_s
    return Image.fromarray(hsv_arr, mode="HSV").convert("RGB")


def _apply_white_patch_balance(rgb):
    """White Patch white-balance algorithm — finds the brightest value
    per channel and rescales all three so they reach the same target.
    Effective at killing warm/cool color casts on near-white products
    where the seller's phone camera or indoor lighting tinted the
    natural white toward yellow/pink/blue.

    Pure Pillow (no numpy dep) via per-channel LUTs. Scale factors are
    clamped to [0.92, 1.15] to prevent over-correction on photos where
    the brightest pixel is intentionally colored (e.g. a backlit blue
    LED display we don't want neutralized).
    """
    from PIL import Image, ImageStat

    stat = ImageStat.Stat(rgb)
    extrema = rgb.getextrema()
    max_r = max(1, extrema[0][1])
    max_g = max(1, extrema[1][1])
    max_b = max(1, extrema[2][1])

    target = max(max_r, max_g, max_b)
    scale_r = max(0.92, min(1.15, target / max_r))
    scale_g = max(0.92, min(1.15, target / max_g))
    scale_b = max(0.92, min(1.15, target / max_b))

    lut_r = [min(255, int(i * scale_r)) for i in range(256)]
    lut_g = [min(255, int(i * scale_g)) for i in range(256)]
    lut_b = [min(255, int(i * scale_b)) for i in range(256)]

    r, g, b = rgb.split()
    return Image.merge(
        "RGB",
        (r.point(lut_r), g.point(lut_g), b.point(lut_b)),
    )


def _auto_correct_rgba(src, preset: dict | None = None):
    """Auto-correct an RGBA image's color channels (autocontrast,
    optional white-balance correction for light products, saturation
    boost, light sharpening). The alpha channel is preserved untouched.

    `preset["neutralize_cast"]=True` (typically set for products with
    `dominant_tone="light"` where any color cast is highly visible) :
    apply White Patch white-balance BEFORE the saturation step + clamp
    saturation to ≤0.95 so the cast doesn't get amplified.
    """
    from PIL import Image, ImageEnhance, ImageFilter, ImageOps

    if preset is None:
        preset = ENHANCE_PRESETS[DEFAULT_PRESET_KEY]

    r, g, b, a = src.split()
    rgb = Image.merge("RGB", (r, g, b))
    rgb = ImageOps.autocontrast(rgb, cutoff=1)

    # Selective HSV desaturation of "white surface with warm cast"
    # pixels — runs BEFORE the saturation step so any subsequent boost
    # doesn't re-amplify the cast we just killed. Always-on : the cast
    # exists for ANY product photographed near a warm surface (wood,
    # carpet, skin, indoor incandescent), the mask only matches when
    # there's actually a cast to fix.
    rgb = _neutralize_warm_white_casts(rgb)

    neutralize = preset.get("neutralize_cast", False)
    if neutralize:
        rgb = _apply_white_patch_balance(rgb)

    sat = preset.get("saturation", 1.10)
    if neutralize:
        sat = min(sat, 0.95)
    rgb = ImageEnhance.Color(rgb).enhance(sat)

    rgb = rgb.filter(
        ImageFilter.UnsharpMask(
            radius=preset.get("sharpen_radius", 1),
            percent=preset.get("sharpen_percent", 25),
            threshold=preset.get("sharpen_threshold", 4),
        )
    )
    r2, g2, b2 = rgb.split()
    return Image.merge("RGBA", (r2, g2, b2, a))


async def _generate_caption_safe(
    product: Product,
    seller_handle: str,
    caption_lang: CaptionLang,
    short_url: str,
    template: TemplateKey,
) -> str:
    """generate_caption + the title/price fallback in one place so it
    can run as an asyncio task in parallel with image rendering.

    The short_url + template are passed through so the caption can carry
    a platform-aware CTA (e.g. "Tap link in bio" for IG, raw URL for
    WhatsApp where text URLs are clickable).
    """
    try:
        return await generate_caption(
            title=product.title,
            price_usdt=f"{product.price_usdt:.2f}",
            description=product.description,
            seller_handle=seller_handle,
            country=product.seller.user.country or "AFR",
            lang=caption_lang,
            short_url=short_url,
            template=template,
        )
    except CaptionGenerationError as exc:
        logger.warning(
            "Caption generation failed for product %s — falling back: %s",
            product.id,
            exc,
        )
        return (
            f"{product.title} — {product.price_usdt} USDT\n"
            f"👉 {short_url}\n"
            f"@{seller_handle} on Etalo"
        )


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
    product_url = (
        f"https://etalo.app/{seller_handle}/{product.slug}"
    )

    # Trackable short URL — embedded in template (QR + visible chip)
    # and in caption so seller posts and image pixels point at the same
    # destination. Click counter increments on each /r/{code} resolve.
    short_code = await create_short_link(product_url, db)
    short_url = f"https://etalo.app/r/{short_code}"

    overall_start = time.monotonic()
    caption_task = asyncio.create_task(
        _generate_caption_safe(
            product, seller_handle, caption_lang, short_url, template
        )
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
        _build_template_vars(
            product, image_for_template, seller_handle, short_url
        ),
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
