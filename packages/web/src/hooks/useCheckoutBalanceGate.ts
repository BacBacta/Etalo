/**
 * useCheckoutBalanceGate — pre-checkout USDT balance check (J11 #1).
 *
 * Prevents the MiniPay BigInteger preflight crash when the buyer's
 * stablecoin balance is below the cart total. The gate runs BEFORE
 * the user clicks "Start checkout" — if balance is short, the UI
 * surfaces an Add Cash CTA instead of the start button, redirecting
 * to the MiniPay deposit deeplink (per minipay-requirements.md §4
 * Low-Balance Handling).
 *
 * Cache strategy : `staleTime: 0` + `refetchOnWindowFocus` so the
 * gate auto-re-evaluates when the user returns to the tab after a
 * deposit flow in MiniPay. No manual refresh needed.
 */
import { erc20Abi } from "viem";
import { useAccount, useReadContract } from "wagmi";

export interface CheckoutBalanceGateResult {
  /** True while the on-chain balance read is in flight. */
  isLoading: boolean;
  /** Buyer's USDT balance, in raw 6-decimal units (bigint). */
  balanceRaw: bigint | undefined;
  /** Cart total in raw 6-decimal units, echoed for UI rendering. */
  requiredRaw: bigint;
  /**
   * True when balanceRaw < requiredRaw AND the read has resolved.
   * False during loading or when balance is sufficient.
   */
  hasInsufficient: boolean;
  /**
   * Shortfall in raw 6-decimal units. Defined only when
   * hasInsufficient is true; 0n otherwise.
   */
  deficitRaw: bigint;
}

/**
 * Reads the buyer's USDT balance and compares it to the cart total.
 *
 * @param requiredRaw cart total in raw 6-decimal USDT (use
 *   `parseUnits(cart.total_usdt, 6)` to convert from the
 *   backend-supplied Decimal string).
 */
export function useCheckoutBalanceGate(
  requiredRaw: bigint,
): CheckoutBalanceGateResult {
  const { address } = useAccount();
  // Read env var inside the hook (not at module top-level) so vi.stubEnv
  // takes effect in tests. Cost is negligible — process.env access is
  // a property lookup, called once per render.
  const usdtAddress = process.env.NEXT_PUBLIC_USDT_ADDRESS as
    | `0x${string}`
    | undefined;

  const { data, isPending } = useReadContract({
    address: usdtAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      // Gate must reflect post-deposit balance immediately when the
      // user returns from the MiniPay /add_cash deeplink. wagmi's
      // default 30s staleTime would mask the new balance.
      staleTime: 0,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      enabled: Boolean(address && usdtAddress),
    },
  });

  // While address is undefined or read is in flight, treat as loading.
  const isLoading = !address || isPending;

  if (isLoading || data === undefined) {
    return {
      isLoading: true,
      balanceRaw: undefined,
      requiredRaw,
      hasInsufficient: false,
      deficitRaw: 0n,
    };
  }

  const balanceRaw = data as bigint;
  const hasInsufficient = balanceRaw < requiredRaw;
  const deficitRaw = hasInsufficient ? requiredRaw - balanceRaw : 0n;

  return {
    isLoading: false,
    balanceRaw,
    requiredRaw,
    hasInsufficient,
    deficitRaw,
  };
}
