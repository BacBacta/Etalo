const MINIAPP_URL =
  process.env.NEXT_PUBLIC_MINIAPP_URL ?? "http://localhost:5173";

interface BuyButtonProps {
  productId: string;
  disabled?: boolean;
  label?: string;
}

/**
 * "Buy" CTA. Links to the Mini App's checkout URL.
 *
 * When the user is already inside MiniPay's WebView, the link opens
 * the Mini App directly. In a regular browser, it lands on the Mini
 * App's public URL which itself renders an "Open in MiniPay" prompt.
 *
 * A future optimisation can swap this for a native MiniPay deep-link
 * scheme once the official format is confirmed — see DECISIONS.md
 * 2026-04-22 entry on the deep-link TODO.
 */
export function BuyButton({
  productId,
  disabled = false,
  label = "Buy with MiniPay",
}: BuyButtonProps) {
  const href = `${MINIAPP_URL}/checkout/${productId}`;
  if (disabled) {
    return (
      <button
        type="button"
        disabled
        className="inline-flex h-12 w-full items-center justify-center rounded-md bg-neutral-900 px-8 text-base font-medium text-white opacity-50"
      >
        {label}
      </button>
    );
  }
  return (
    <a
      href={href}
      className="inline-flex h-12 w-full items-center justify-center rounded-md bg-neutral-900 px-8 text-base font-medium text-white hover:bg-neutral-800"
    >
      {label}
    </a>
  );
}
