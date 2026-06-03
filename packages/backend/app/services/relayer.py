"""Shared relayer transaction gate.

A single relayer key signs for BOTH the auto-refund keeper (ADR-019)
and the auto-release keeper (ADR-058), and they run as concurrent
asyncio tasks in the same process. Without serialization, two keepers
(or two sequential sends within one keeper while a prior tx is still
pending) can read the same account nonce and broadcast two txs with
nonce N — the node keeps one and silently drops the other, so a seller
isn't paid or a buyer isn't refunded until the next scan.

This module-level lock serializes the nonce-read → sign → broadcast
critical section across every keeper that shares the relayer. Combined
with reading the nonce at the `"pending"` block tag (which counts the
relayer's not-yet-mined txs), back-to-back and cross-keeper sends each
get a fresh, monotonically increasing nonce.

The receipt wait is intentionally done OUTSIDE the lock — only the
broadcast needs serializing, not the (up to 120s) confirmation wait.
"""
from __future__ import annotations

import asyncio

# One event loop per process, so a module-level Lock is shared by every
# keeper coroutine. asyncio.Lock binds to the running loop on first
# acquire (3.10+), so module-import time is safe.
RELAYER_TX_LOCK = asyncio.Lock()

# Block tag for nonce reads. "pending" includes the relayer's broadcast-
# but-unmined txs, so sequential sends don't reuse a nonce.
RELAYER_NONCE_BLOCK = "pending"
