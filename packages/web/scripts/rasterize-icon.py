"""Rasterize the Etalo brand mark (public/icon-512.svg) to a 512x512 PNG
for the MiniPay listing icon + PWA/Apple touch icons.

Deterministic export of the EXISTING V4 logo (docs/DESIGN_V4_PREVIEW.md,
inlined as EtaloLogo in PublicHeader.tsx) — not a new design. Uses the
already-installed Playwright chromium as the SVG renderer (no sharp /
imagemagick dependency in the web package).

Run from packages/web:
    ../backend/venv/Scripts/python.exe scripts/rasterize-icon.py
"""
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent.parent  # packages/web
SVG = HERE / "public" / "icon-512.svg"
OUT = HERE / "public" / "icon-512.png"

svg = SVG.read_text(encoding="utf-8")
html = f'<!doctype html><html><head><style>*{{margin:0;padding:0}}</style></head><body>{svg}</body></html>'

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(
        viewport={"width": 512, "height": 512}, device_scale_factor=1
    )
    page.set_content(html, wait_until="networkidle")
    page.screenshot(path=str(OUT), clip={"x": 0, "y": 0, "width": 512, "height": 512})
    browser.close()

print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")
