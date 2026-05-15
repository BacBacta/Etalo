/**
 * OrderDeliveryAddressCard — Sprint J11.7 Block 8 (ADR-044).
 *
 * Renders the order's delivery address snapshot for the seller
 * (or buyer) of the order. Privacy is enforced server-side : the
 * backend returns delivery_address_snapshot=null when the caller is
 * not buyer or seller (cohérent with ADR-043 casual filter), so the
 * frontend just null-checks.
 *
 * Pre-fund orders also have snapshot=null by construction (the
 * snapshot is written post-fund per Block 7), so the same null-check
 * surfaces a neutral "address will appear once funded" message.
 *
 * Mobile-first : 360 px viewport friendly, break-words on free-form
 * fields, 44 x 44 WhatsApp button.
 */
"use client";

import { countryName } from "@/lib/country";
import { buildWhatsAppCoordinateUrl } from "@/lib/whatsapp";

// Anchor styled to match the primary Button without importing Button
// (which uses base-ui Button as a slot — incompatible with anchor as
// a child element). Keeps 44 x 44 touch target + WCAG-friendly focus
// outline + dark-mode parity.
const WHATSAPP_ANCHOR_CLASSES = [
  "inline-flex items-center justify-center gap-2",
  "min-h-[44px] px-5 py-2",
  "rounded-md text-base font-medium",
  "bg-primary text-primary-foreground hover:bg-primary/90",
  "transition-colors duration-200",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
  "focus-visible:ring-offset-2",
].join(" ");

export interface DeliveryAddressSnapshot {
  // ADR-050 V1 fields — present on snapshots written via the
  // /delivery-address-inline endpoint.
  recipient_name?: string | null;
  area?: string | null;
  // J11.7 fields — present on all snapshots (including legacy
  // pre-ADR-050 ones written via the address-book reference endpoint).
  phone_number?: string | null;
  country?: string | null;
  city?: string | null;
  region?: string | null;
  address_line?: string | null;
  landmark?: string | null;
  notes?: string | null;
}

interface Props {
  /** The snapshot field from OrderResponse. Pass null when missing
   *  — the component renders a neutral pre-fund / unauthorized
   *  message in that case. */
  snapshot: DeliveryAddressSnapshot | null | undefined;
  /** Order id for the WhatsApp pre-filled message. Use the on-chain
   *  ID (cleaner buyer-facing reference than a uuid). */
  orderId: string | number;
  /** When true, the empty/pre-fund branch renders nothing instead of a
   *  neutral notice card. Used by the seller orders list where the
   *  per-row delivery card is noise on pre-fund orders. Default false
   *  preserves the original buyer-facing /orders/[id] surface where
   *  the explicit message is informative. */
  hideWhenEmpty?: boolean;
}

export function OrderDeliveryAddressCard({
  snapshot,
  orderId,
  hideWhenEmpty = false,
}: Props) {
  if (!snapshot) {
    if (hideWhenEmpty) return null;
    return (
      <section
        data-testid="order-delivery-empty"
        className="rounded-md border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600 dark:border-celo-light/10 dark:bg-celo-dark-bg dark:text-celo-light/70"
      >
        Delivery address will appear once the buyer funds the order.
      </section>
    );
  }

  const waUrl = buildWhatsAppCoordinateUrl({
    phone: snapshot.phone_number,
    country: snapshot.country,
    orderId,
  });

  return (
    <section
      data-testid="order-delivery-card"
      aria-label="Delivery address"
      className="rounded-md border border-neutral-200 bg-white p-4 dark:border-celo-light/10 dark:bg-celo-dark-elevated"
    >
      <header className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-base font-medium text-neutral-900 dark:text-celo-light">
          Delivery address
        </h3>
      </header>
      <dl className="space-y-1 text-sm text-neutral-800 dark:text-celo-light/80">
        {snapshot.recipient_name ? (
          <div className="mb-1">
            <dt className="sr-only">Recipient</dt>
            <dd
              data-testid="order-delivery-recipient"
              className="text-base font-semibold text-neutral-900 dark:text-celo-light"
            >
              {snapshot.recipient_name}
            </dd>
          </div>
        ) : (
          <div className="mb-1 rounded-md bg-amber-50 p-2 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
            Recipient name not provided — coordinate via WhatsApp below.
          </div>
        )}
        {snapshot.city || snapshot.country ? (
          <div>
            <dt className="sr-only">City and country</dt>
            <dd
              data-testid="order-delivery-city"
              className="text-base font-medium"
            >
              {snapshot.city ?? "—"},{" "}
              {countryName(snapshot.country) ?? snapshot.country ?? "—"}
            </dd>
          </div>
        ) : null}
        {snapshot.region ? (
          <div>
            <dt className="sr-only">Region</dt>
            <dd data-testid="order-delivery-region">{snapshot.region}</dd>
          </div>
        ) : null}
        {/* area (ADR-050) — neighborhood/estate, sits between region
            and the free-form address_line so the seller can scan
            "city → area → details" in reading order. */}
        {snapshot.area ? (
          <div>
            <dt className="text-neutral-500 dark:text-celo-light/60">Area</dt>
            <dd
              data-testid="order-delivery-area"
              className="break-words"
            >
              {snapshot.area}
            </dd>
          </div>
        ) : null}
        {snapshot.address_line ? (
          <div>
            <dt className="sr-only">Address</dt>
            <dd
              data-testid="order-delivery-line"
              className="break-words"
            >
              {snapshot.address_line}
            </dd>
          </div>
        ) : null}
        {snapshot.landmark ? (
          <div>
            <dt className="text-neutral-500">Landmark</dt>
            <dd
              data-testid="order-delivery-landmark"
              className="break-words"
            >
              {snapshot.landmark}
            </dd>
          </div>
        ) : null}
        {/* Buyer phone number is intentionally NOT rendered. Surfacing
            the raw number invites direct off-platform contact (privacy
            risk + escrow bypass risk). The WhatsApp deeplink below
            opens a pre-filled chat tied to the order ID, which is
            sufficient for delivery coordination. */}
        {snapshot.notes ? (
          <div>
            <dt className="text-neutral-500">Notes</dt>
            <dd
              data-testid="order-delivery-notes"
              className="break-words"
            >
              {snapshot.notes}
            </dd>
          </div>
        ) : null}
      </dl>
      {waUrl ? (
        <div className="mt-4">
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Coordinate delivery via WhatsApp"
            data-testid="order-delivery-whatsapp"
            className={WHATSAPP_ANCHOR_CLASSES}
          >
            Coordinate via WhatsApp
          </a>
        </div>
      ) : null}
    </section>
  );
}
