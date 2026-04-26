"""Generate sample captions for QA tone review (Sprint J7 Block 4).

Hits the real Claude API with 10 mock products in EN + SW, writes
results to %TEMP%\\etalo_captions_<lang>.txt for visual inspection.
Cost ~$0.02 per full run (20 calls, ~300 input tokens + ~80 output
tokens each on Sonnet 4.6).

Requires ANTHROPIC_API_KEY in the environment.

Usage:
    cd packages/backend
    ./venv/Scripts/python.exe scripts/sample_captions.py
"""
from __future__ import annotations

import asyncio
import sys
import tempfile
from pathlib import Path

# Windows: psycopg async forces SelectorEventLoop in app/main.py at import
# time. We don't import the app here, so we don't inherit it — but anthropic
# does subprocess work nowhere, so default policy is fine on either OS.

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.caption_generator import (  # noqa: E402
    CaptionGenerationError,
    generate_caption,
)

OUTPUT_DIR = Path(tempfile.gettempdir())

MOCK_PRODUCTS = [
    {
        "title": "Red Ankara Dress",
        "price_usdt": "30.00",
        "description": "Hand-tailored, soft cotton, sizes S-XL",
        "seller_handle": "chioma",
        "country": "NGA",
    },
    {
        "title": "Leather Sandals",
        "price_usdt": "45.00",
        "description": "Genuine leather, handcrafted in Lagos",
        "seller_handle": "tunde",
        "country": "NGA",
    },
    {
        "title": "Beaded Necklace Set",
        "price_usdt": "18.00",
        "description": "Maasai-inspired, 3-piece set",
        "seller_handle": "amani",
        "country": "KEN",
    },
    {
        "title": "Kitenge Skirt",
        "price_usdt": "22.00",
        "description": "Wax print, A-line cut",
        "seller_handle": "fatima",
        "country": "GHA",
    },
    {
        "title": "Wooden Drum (Djembe)",
        "price_usdt": "85.00",
        "description": "Solid mahogany, professional quality",
        "seller_handle": "kofi",
        "country": "GHA",
    },
    {
        "title": "Coffee Beans 500g",
        "price_usdt": "12.00",
        "description": "Single-origin Arabica from Mt Kenya region",
        "seller_handle": "wanjiku",
        "country": "KEN",
    },
    {
        "title": "Beaded Earrings",
        "price_usdt": "8.00",
        "description": "Handmade, lightweight, multiple colors",
        "seller_handle": "akosua",
        "country": "GHA",
    },
    {
        "title": "Tie-Dye T-Shirt",
        "price_usdt": "15.00",
        "description": "100% cotton, unisex, M/L/XL",
        "seller_handle": "samuel",
        "country": "TZA",
    },
    {
        "title": "Soapstone Sculpture",
        "price_usdt": "55.00",
        "description": "Hand-carved African elephant figurine",
        "seller_handle": "mary",
        "country": "KEN",
    },
    {
        "title": "Shea Butter 250g",
        "price_usdt": "10.00",
        "description": "Unrefined, raw, ethically sourced",
        "seller_handle": "aminata",
        "country": "GHA",
    },
]


async def main() -> None:
    for lang in ("en", "sw"):
        output_path = OUTPUT_DIR / f"etalo_captions_{lang}.txt"
        print(f"\n=== Language: {lang.upper()} ===")
        with output_path.open("w", encoding="utf-8") as f:
            f.write(f"=== Etalo Captions — {lang.upper()} ===\n\n")
            for i, product in enumerate(MOCK_PRODUCTS, 1):
                try:
                    caption = await generate_caption(lang=lang, **product)
                    f.write(f"--- {i}. {product['title']} ({product['country']}) ---\n")
                    f.write(f"{caption}\n\n")
                    print(
                        f"  [{lang}] {i:2d}/10  "
                        f"{product['title']:25s} "
                        f"{len(caption):3d} chars"
                    )
                except CaptionGenerationError as exc:
                    f.write(f"--- {i}. {product['title']} (ERROR) ---\n")
                    f.write(f"{exc}\n\n")
                    print(f"  [{lang}] {i:2d}/10  ERROR: {exc}")
        print(f"Saved {output_path}")


if __name__ == "__main__":
    asyncio.run(main())
