"""Dev runner — invokes uvicorn programmatically so we can set the
asyncio event loop policy BEFORE uvicorn creates its loop.

Why: psycopg async mode (used by SQLAlchemy AsyncEngine) is
incompatible with the Windows default ProactorEventLoop. We must
switch to SelectorEventLoop before any asyncio code runs. Setting
the policy from app.main is too late — uvicorn has already taken
ownership of the loop by then.

Usage:
    python scripts/run_dev.py
    # equivalent to `uvicorn app.main:app --reload` but works on Windows.

On Linux/macOS the policy switch is a no-op.
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

# === HOTFIX #10 — Backend canonical inner repo banner ===
# Mirror of hotfix #9's frontend predev banner. Path-normalised
# detection so the check survives Windows backslash <-> POSIX slash
# interpretation in both shells.
_SCRIPT_DIR = os.path.abspath(os.path.dirname(__file__)).replace("\\", "/")
if "/etalo/Etalo/packages/backend" in _SCRIPT_DIR:
    print(
        "✓ Running backend from CANONICAL inner repo "
        "(C:/Users/Oxfam/projects/etalo/Etalo) — Phase 4 hotfix #10 banner",
        file=sys.stderr,
    )
# === END HOTFIX #10 ===

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

# Ensure `app` package is importable regardless of where this script is run from.
BACKEND_DIR = Path(__file__).resolve().parent.parent
os.chdir(BACKEND_DIR)
sys.path.insert(0, str(BACKEND_DIR))

import uvicorn

from app.main import app  # noqa: E402 — must come after sys.path tweak


def main() -> None:
    # Note: `reload=True` would spawn a subprocess that re-imports the
    # app and loses the SelectorEventLoop policy on Windows. For dev
    # hot-reload, edit code + re-run this script.
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8000,
        log_level="info",
    )


if __name__ == "__main__":
    main()
