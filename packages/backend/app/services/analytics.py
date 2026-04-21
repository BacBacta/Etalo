class AnalyticsService:
    """Analytics aggregation service for seller dashboards."""

    async def get_seller_stats(self, wallet_address: str) -> dict:
        """Get denormalized stats for a seller."""
        # TODO: query AnalyticsSnapshot table
        return {
            "wallet_address": wallet_address,
            "total_orders": 0,
            "total_revenue_usdt": "0.000000",
            "disputes_count": 0,
            "avg_rating": 0.0,
        }

    async def refresh_snapshot(self, wallet_address: str) -> None:
        """Refresh the daily analytics snapshot for a seller."""
        # TODO: aggregate from orders/disputes tables
        pass


analytics_service = AnalyticsService()
