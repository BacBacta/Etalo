from decimal import Decimal

from pydantic import BaseModel


class PlatformStats(BaseModel):
    """Public on-chain platform metrics, derived entirely from the
    indexer's order mirror (MiniPay listing requirement §8 — on-chain
    metrics). USDT amounts are human (6-decimal raw / 1e6)."""

    # Lifetime
    total_orders: int
    completed_orders: int
    refunded_orders: int
    disputed_orders: int
    unique_buyers: int
    unique_sellers: int
    gmv_usdt: Decimal  # gross merchandise value, completed orders
    commission_usdt: Decimal  # protocol fees collected, completed orders
    dispute_rate_pct: Decimal  # disputed / total, 0–100

    # Last 30 days
    orders_30d: int
    gmv_30d_usdt: Decimal

    # Provenance
    currency: str = "USDT"
    network: str = "Celo mainnet"
