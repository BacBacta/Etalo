"""Generate every Etalo icon asset from the brand mark
(public/icon-512.svg) — the MiniPay listing icon, the Next App-Router
PWA/Apple icons, AND the browser-tab favicon.

Deterministic export of the EXISTING V4 logo (docs/DESIGN_V4_PREVIEW.md,
inlined as EtaloLogo in PublicHeader.tsx) — not a new design. Uses the
already-installed Playwright chromium to rasterize the SVG (no sharp /
imagemagick dep) + Pillow to pack the multi-resolution favicon.ico.

Run from packages/web:
    ../backend/venv/Scripts/python.exe scripts/rasterize-icon.py
"""
import shutil
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent.parent  # packages/web
SVG = HERE / "public" / "icon-512.svg"
PNG = HERE / "public" / "icon-512.png"
APP = HERE / "src" / "app"

svg = SVG.read_text(encoding="utf-8")
html = (
    "<!doctype html><html><head><style>*{margin:0;padding:0}</style>"
    f"</head><body>{svg}</body></html>"
)

# 1. Render the SVG → 512×512 PNG (the listing icon + base for the rest).
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(
        viewport={"width": 512, "height": 512}, device_scale_factor=1
    )
    page.set_content(html, wait_until="networkidle")
    page.screenshot(path=str(PNG), clip={"x": 0, "y": 0, "width": 512, "height": 512})
    browser.close()

# 2. Next App-Router PWA + Apple touch icons (served from /icon, /apple-icon).
shutil.copyfile(PNG, APP / "icon.png")
shutil.copyfile(PNG, APP / "apple-icon.png")

# 3. Browser-tab favicon — multi-resolution .ico so the desktop tab is
#    crisp at every size the browser picks (16/32/48 are the common ones).
base = Image.open(PNG).convert("RGBA")
ico_sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
base.save(APP / "favicon.ico", format="ICO", sizes=ico_sizes)

print("wrote:")
for f in (PNG, APP / "icon.png", APP / "apple-icon.png", APP / "favicon.ico"):
    print(f"  {f.relative_to(HERE)}  ({f.stat().st_size} bytes)")
