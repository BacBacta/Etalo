/**
 * WhatsApp deeplink helpers — Sprint J11.7 Block 8 (ADR-044).
 *
 * Builds wa.me URLs for seller↔buyer delivery coordination. The
 * wa.me/{phone} endpoint requires the international format **without
 * the leading '+'** : wa.me/2349011234567 (NOT +2349011234567 nor
 * 09011234567).
 */

const COUNTRY_CODES: Record<string, string> = {
  NGA: "234",
  GHA: "233",
  KEN: "254",
};

/**
 * Format a phone number for the wa.me deeplink. Strips non-digits,
 * normalizes leading zeros, and prepends the V1 country code if the
 * number is in local format.
 *
 * Returns null if the phone is empty / unrecognized — callers must
 * NOT render the WhatsApp button in that case.
 */
export function formatPhoneForWhatsApp(
  phone: string | null | undefined,
  country: string | null | undefined,
): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/\D/g, "");
  if (!cleaned) return null;

  if (!country) {
    // Without a country, only accept already-international-looking
    // numbers (anything starting with one of the V1 codes).
    for (const code of Object.values(COUNTRY_CODES)) {
      if (cleaned.startsWith(code)) return cleaned;
    }
    return null;
  }

  const code = COUNTRY_CODES[country];
  if (!code) return null;
  if (cleaned.startsWith(code)) return cleaned;
  return code + cleaned.replace(/^0+/, "");
}

/**
 * Build a wa.me URL with a pre-filled coordination message. Returns
 * null if the phone can't be formatted (caller hides the button).
 */
export function buildWhatsAppCoordinateUrl({
  phone,
  country,
  orderId,
}: {
  phone: string | null | undefined;
  country: string | null | undefined;
  orderId: string | number;
}): string | null {
  const formatted = formatPhoneForWhatsApp(phone, country);
  if (!formatted) return null;
  const text = `Hi, I'm reaching out about your Etalo order #${orderId}. When would be a good time to coordinate delivery?`;
  return `https://wa.me/${formatted}?text=${encodeURIComponent(text)}`;
}
