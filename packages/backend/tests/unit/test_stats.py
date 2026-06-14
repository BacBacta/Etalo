"""Unit test for the public platform-stats aggregation."""
from decimal import Decimal
from unittest.mock import MagicMock

from app.routers.stats import get_platform_stats


def test_get_platform_stats_aggregates_order_mirror():
    db = MagicMock()
    # db.scalar is called once per aggregate, in router order:
    # total, completed, refunded, disputed, unique_buyers, unique_sellers,
    # gmv_raw, commission_raw, orders_30d, gmv_30d_raw
    db.scalar.side_effect = [
        10,  # total
        6,  # completed
        1,  # refunded
        1,  # disputed
        4,  # unique buyers
        3,  # unique sellers
        5_000_000,  # gmv raw (5.00 USDT)
        90_000,  # commission raw (0.09 USDT)
        2,  # orders 30d
        1_000_000,  # gmv 30d raw (1.00 USDT)
    ]

    result = get_platform_stats(db)

    assert result.total_orders == 10
    assert result.completed_orders == 6
    assert result.refunded_orders == 1
    assert result.disputed_orders == 1
    assert result.unique_buyers == 4
    assert result.unique_sellers == 3
    assert result.gmv_usdt == Decimal("5.00")
    assert result.commission_usdt == Decimal("0.09")
    assert result.dispute_rate_pct == Decimal("10.0")  # 1 / 10 * 100
    assert result.orders_30d == 2
    assert result.gmv_30d_usdt == Decimal("1.00")
    assert result.currency == "USDT"


def test_get_platform_stats_zero_orders_no_div_by_zero():
    db = MagicMock()
    db.scalar.side_effect = [0] * 10
    result = get_platform_stats(db)
    assert result.total_orders == 0
    assert result.dispute_rate_pct == Decimal("0.0")
    assert result.gmv_usdt == Decimal("0.00")
