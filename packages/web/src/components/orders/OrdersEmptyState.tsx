/**
 * OrdersEmptyState — buyer-side "no orders yet" surface.
 * J11.5 Block 3.D.
 *
 * Reuses EmptyStateV5 with the existing `no-orders` illustration
 * (already shipped in Phase 3 Block 2). The CTA points to the
 * marketplace so a fresh buyer has a one-tap path to start shopping.
 */
import { EmptyStateV5 } from "@/components/ui/v5/EmptyState";

export function OrdersEmptyState() {
  return (
    <EmptyStateV5
      illustration="no-orders"
      title="No orders yet"
      description="When you buy from a shop, your orders will appear here."
      action={{ label: "Browse the marketplace", href: "/marketplace" }}
      data-testid="orders-empty-state"
    />
  );
}
