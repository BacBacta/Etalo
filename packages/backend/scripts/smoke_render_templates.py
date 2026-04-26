"""Smoke render the 5 templates with mock data.

Used to validate Block 2 design visually before Block 3 wires the
real pipeline. Saves PNGs to the platform tmp directory.

Usage: python scripts/smoke_render_templates.py
Output: 5 PNG files (etalo_smoke_<template>.png) + size summary.
"""
import asyncio
import tempfile
from pathlib import Path

from jinja2 import Template
from playwright.async_api import async_playwright

TEMPLATES_DIR = Path(__file__).parent.parent / "app" / "services" / "asset_templates"
OUTPUT_DIR = Path(tempfile.gettempdir())

MOCK_DATA = {
    "product_image_url": "https://images.unsplash.com/photo-1583744946564-b52ac1c389c8?w=1080",
    "title": "Red Ankara Dress",
    "price_usdt": "30.00",
    "seller_handle": "chioma",
    # 1×1 transparent PNG data URL as QR placeholder (Block 3 wires real QR generation)
    "qr_url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
}

TEMPLATES = [
    ("ig_square", 1080, 1080),
    ("ig_story", 1080, 1920),
    ("wa_status", 1080, 1920),
    ("tiktok", 1080, 1920),
    ("fb_feed", 1200, 630),
]


async def render_template(playwright, name: str, width: int, height: int):
    template_path = TEMPLATES_DIR / f"{name}.html"
    template = Template(template_path.read_text(encoding="utf-8"))
    html = template.render(**MOCK_DATA)

    browser = await playwright.chromium.launch()
    context = await browser.new_context(viewport={"width": width, "height": height})
    page = await context.new_page()
    await page.set_content(html, wait_until="networkidle")
    output = OUTPUT_DIR / f"etalo_smoke_{name}.png"
    await page.screenshot(path=str(output), full_page=False)
    await browser.close()

    return output, output.stat().st_size


async def main():
    async with async_playwright() as p:
        results = []
        for name, w, h in TEMPLATES:
            output, size = await render_template(p, name, w, h)
            results.append((name, w, h, output, size))
            print(f"  {name:12s} {w}x{h}: {size:6d} bytes -> {output}")
        print(f"\n[OK] Rendered {len(results)} templates.")


if __name__ == "__main__":
    asyncio.run(main())
