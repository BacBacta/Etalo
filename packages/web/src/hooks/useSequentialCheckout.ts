import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { erc20Abi, parseUnits, type Abi } from "viem";
import { useAccount, useChainId, usePublicClient } from "wagmi";

import escrowAbiJson from "@/abis/v2/EtaloEscrow.json";
import { etaloChain } from "@/lib/chain";
import { useResolvedWalletClient } from "@/hooks/useResolvedWalletClient";
import { MARKETPLACE_PRODUCTS_QUERY_KEY } from "@/hooks/useMarketplaceProducts";
import { MY_PRODUCTS_QUERY_KEY } from "@/hooks/useMyProducts";

// JSON-imported ABIs lose literal-type narrowing on `type: "function"|"event"`,
// so viem's strict `Abi` type rejects them. Cast once at module scope.
const escrowAbi = escrowAbiJson as Abi;
import { finalizeCart, type ResolvedCart } from "@/lib/checkout";
import {
  classifyError,
  parseOrderIdFromLog,
} from "@/lib/checkout-orchestration";
import {
  persistInlineDeliveryToSession,
  type InlineDeliveryAddressData,
} from "@/components/checkout/InlineDeliveryAddressForm";
import { setOrderDeliverySnapshotInline } from "@/lib/orders/snapshot-api";

// MiniPay rejects EIP-1559 (CLAUDE.md rule 3). Every writeContract below
// passes `type: "legacy" as const` inline so wagmi v2's strict generic
// typing can still infer functionName narrowing.

const USDT_ADDRESS = process.env.NEXT_PUBLIC_USDT_ADDRESS as `0x${string}`;
const ESCROW_ADDRESS = process.env.NEXT_PUBLIC_ESCROW_ADDRESS as `0x${string}`;

// USDT has 6 decimals (CLAUDE.md rule 2).
const USDT_DECIMALS = 6;
// Sepolia RPC can be slow under load; bump > viem default 60s.
const TX_TIMEOUT_MS = 120_000;

export type CheckoutPhase =
  | "idle"
  | "allowance"
  | "executing"
  | "success"
  | "partial"
  | "canceled"
  | "error";

export type SellerStatus =
  | "pending"
  | "creating"
  | "funding"
  | "success"
  | "error"
  | "canceled";

export interface SellerExecution {
  sellerHandle: string;
  sellerShopName: string;
  status: SellerStatus;
  // uint256 from the OrderCreated event (not bytes32 — verified ABI).
  orderId?: bigint;
  createTxHash?: `0x${string}`;
  fundTxHash?: `0x${string}`;
  error?: string;
}

export interface CheckoutState {
  phase: CheckoutPhase;
  sellers: SellerExecution[];
  currentSellerIndex: number;
  approveTxHash?: `0x${string}`;
  globalError?: string;
}

// Expand a cart group's items into the contract's expected uint256[] of
// per-unit prices. createOrderWithItems takes itemPrices, not (itemId,
// quantity) pairs — qty=N is encoded by pushing the price N times.
function expandItemPrices(
  items: ResolvedCart["groups"][number]["items"],
): bigint[] {
  const out: bigint[] = [];
  for (const item of items) {
    const unitPrice = parseUnits(String(item.price_usdt), USDT_DECIMALS);
    for (let n = 0; n < item.qty; n++) out.push(unitPrice);
  }
  return out;
}

export interface UseSequentialCheckoutArgs {
  /** ADR-050 — buyer fills the delivery form inline at checkout. The
   *  full address is sent to the backend `/delivery-address-inline`
   *  PATCH endpoint after each successful fund so the order carries
   *  an immutable snapshot. Pass `null` until the form is fully
   *  filled (parent enforces via `isCheckoutAddressReady`).
   */
  deliveryFormData: InlineDeliveryAddressData | null;
  /** Cart-token HMAC. Forwarded to POST /cart/finalize after each
   *  successful fund so the backend can stamp Order.product_ids and
   *  decrement Product.stock by qty. Optional for tests / legacy
   *  callers ; when absent, finalize is skipped (stock stays stale).
   */
  token?: string;
}

export function useSequentialCheckout(
  cart: ResolvedCart,
  { deliveryFormData, token }: UseSequentialCheckoutArgs = {
    deliveryFormData: null,
  },
) {
  const { address: buyer } = useAccount();
  const { resolve: resolveWalletClient } = useResolvedWalletClient();
  const publicClient = usePublicClient();
  const chainId = useChainId();
  const queryClient = useQueryClient();

  const [state, setState] = useState<CheckoutState>(() => ({
    phase: "idle",
    sellers: cart.groups.map((g) => ({
      sellerHandle: g.seller_handle,
      sellerShopName: g.seller_shop_name,
      status: "pending" as SellerStatus,
    })),
    currentSellerIndex: -1,
  }));

  const cancelRef = useRef(false);
  // StrictMode + double-effect guard. start() is idempotent within a
  // single CheckoutFlow mount.
  const startedRef = useRef(false);

  const updateSeller = useCallback(
    (index: number, patch: Partial<SellerExecution>) => {
      setState((s) => ({
        ...s,
        sellers: s.sellers.map((seller, i) =>
          i === index ? { ...seller, ...patch } : seller,
        ),
      }));
    },
    [],
  );

  const finalizePhase = useCallback(() => {
    setState((s) => {
      const succeeded = s.sellers.filter((x) => x.status === "success").length;
      const failed = s.sellers.filter((x) => x.status === "error").length;
      const canceled = s.sellers.filter(
        (x) => x.status === "canceled",
      ).length;
      const total = s.sellers.length;

      let nextPhase: CheckoutPhase;
      if (succeeded === total) nextPhase = "success";
      else if (succeeded > 0) nextPhase = "partial";
      else if (failed > 0) nextPhase = "error";
      else if (canceled > 0) nextPhase = "canceled";
      else nextPhase = "error";

      // If any seller succeeded, the backend just decremented stock on
      // their products → invalidate the marketplace + seller dashboard
      // caches so other tabs/devices see fresh stock without waiting on
      // the 30s staleTime.
      if (succeeded > 0) {
        queryClient.invalidateQueries({
          queryKey: MARKETPLACE_PRODUCTS_QUERY_KEY,
        });
        queryClient.invalidateQueries({ queryKey: MY_PRODUCTS_QUERY_KEY });
      }

      return { ...s, phase: nextPhase, currentSellerIndex: -1 };
    });
  }, [queryClient]);

  const markRemainingCanceled = useCallback((fromIndex: number) => {
    setState((s) => ({
      ...s,
      sellers: s.sellers.map((seller, i) =>
        i >= fromIndex && seller.status === "pending"
          ? { ...seller, status: "canceled" as SellerStatus }
          : seller,
      ),
    }));
  }, []);

  const start = useCallback(async () => {
    if (startedRef.current) return;
    if (!buyer || !publicClient) {
      setState((s) => ({
        ...s,
        phase: "error",
        globalError: "Wallet not connected.",
      }));
      return;
    }
    if (chainId !== etaloChain.id) {
      // Defense in depth — CheckoutFlow already gates the Start
      // button via ChainMismatchBanner, but a wallet that flips
      // chains mid-session would otherwise hit viem's
      // "current chain … does not match …" revert at writeContract
      // time. Surface a clean message instead.
      setState((s) => ({
        ...s,
        phase: "error",
        globalError: `Wrong network. Switch your wallet to ${etaloChain.name}.`,
      }));
      return;
    }
    // Resolve walletClient async to survive the wagmi-MiniPay race
    // (J12 mainnet bug — PR #103). Same fallback chain as the rest
    // of the writeContract callers via useResolvedWalletClient.
    const walletClient = await resolveWalletClient();
    if (!walletClient) {
      setState((s) => ({
        ...s,
        phase: "error",
        globalError: "Wallet not connected.",
      }));
      return;
    }

    startedRef.current = true;
    cancelRef.current = false;

    try {
      // ÉTAPE 1 — Allowance + approve si nécessaire.
      setState((s) => ({ ...s, phase: "allowance" }));

      const totalRequired = parseUnits(
        String(cart.total_usdt),
        USDT_DECIMALS,
      );
      const currentAllowance = (await publicClient.readContract({
        address: USDT_ADDRESS,
        abi: erc20Abi,
        functionName: "allowance",
        args: [buyer, ESCROW_ADDRESS],
      })) as bigint;

      if (currentAllowance < totalRequired) {
        if (cancelRef.current) {
          markRemainingCanceled(0);
          finalizePhase();
          return;
        }
        const approveTx = await walletClient.writeContract({
          address: USDT_ADDRESS,
          abi: erc20Abi,
          functionName: "approve",
          args: [ESCROW_ADDRESS, totalRequired],
          type: "legacy" as const,
          chain: etaloChain,
          account: walletClient.account ?? buyer,
        });
        setState((s) => ({ ...s, approveTxHash: approveTx }));
        const approveReceipt = await publicClient.waitForTransactionReceipt({
          hash: approveTx,
          timeout: TX_TIMEOUT_MS,
        });
        if (approveReceipt.status !== "success") {
          throw new Error("Approve transaction reverted.");
        }
      }

      if (cancelRef.current) {
        markRemainingCanceled(0);
        finalizePhase();
        return;
      }

      // ÉTAPE 2 — Per seller : create + fund.
      setState((s) => ({ ...s, phase: "executing" }));

      for (let i = 0; i < cart.groups.length; i++) {
        if (cancelRef.current) {
          markRemainingCanceled(i);
          break;
        }

        setState((s) => ({ ...s, currentSellerIndex: i }));
        const group = cart.groups[i];

        try {
          // 2a — createOrderWithItems(seller, uint256[] itemPrices, bool isCrossBorder)
          updateSeller(i, { status: "creating" });

          const itemPrices = expandItemPrices(group.items);
          const createTx = await walletClient.writeContract({
            address: ESCROW_ADDRESS,
            abi: escrowAbi,
            functionName: "createOrderWithItems",
            args: [
              group.seller_address as `0x${string}`,
              itemPrices,
              group.is_cross_border,
            ],
            type: "legacy" as const,
            chain: etaloChain,
            account: walletClient.account ?? buyer,
          });
          updateSeller(i, { createTxHash: createTx });

          const createReceipt = await publicClient.waitForTransactionReceipt(
            { hash: createTx, timeout: TX_TIMEOUT_MS },
          );
          if (createReceipt.status !== "success") {
            throw new Error("Order creation reverted.");
          }

          const orderId = parseOrderIdFromLog(createReceipt.logs, escrowAbi);
          updateSeller(i, { orderId, status: "funding" });

          if (cancelRef.current) {
            // Tx already confirmed — but DON'T fund. Mark as error so the
            // partial-result UI tells the user funds are still in their
            // wallet and the on-chain order is unfunded (auto-refundable).
            updateSeller(i, {
              status: "error",
              error:
                "Order created but funding canceled. The unfunded order will auto-refund.",
            });
            markRemainingCanceled(i + 1);
            break;
          }

          // 2b — fundOrder(orderId). Contract pulls USDT internally.
          const fundTx = await walletClient.writeContract({
            address: ESCROW_ADDRESS,
            abi: escrowAbi,
            functionName: "fundOrder",
            args: [orderId],
            type: "legacy" as const,
            chain: etaloChain,
            account: walletClient.account ?? buyer,
          });
          updateSeller(i, { fundTxHash: fundTx });

          const fundReceipt = await publicClient.waitForTransactionReceipt({
            hash: fundTx,
            timeout: TX_TIMEOUT_MS,
          });
          if (fundReceipt.status !== "success") {
            throw new Error("Fund transaction reverted.");
          }

          // Snapshot the inline-typed delivery address into the freshly-
          // funded order (ADR-050). Best-effort : a failure here does NOT
          // mark the seller as error — the on-chain tx already succeeded
          // and the snapshot can be re-set from the order detail page
          // later. We still log to the console for ops visibility. On
          // success, persist the form to sessionStorage so the buyer
          // doesn't retype if they checkout twice in the same session.
          if (deliveryFormData && orderId !== undefined && buyer) {
            try {
              await setOrderDeliverySnapshotInline({
                walletAddress: buyer,
                onchainOrderId: orderId,
                ...deliveryFormData,
              });
              persistInlineDeliveryToSession(deliveryFormData);
            } catch (snapErr) {
              // eslint-disable-next-line no-console
              console.warn(
                "Delivery snapshot persistence failed, continuing :",
                snapErr,
              );
            }
          }

          // Stamp Order.product_ids + decrement Product.stock by qty.
          // Best-effort like the snapshot above : the on-chain fund tx
          // is already final, so a finalize error here would not be
          // recoverable by reverting. Retry once on "indexer_pending"
          // since the indexer can lag a few seconds behind the fund tx.
          if (token && orderId !== undefined) {
            try {
              let res = await finalizeCart({
                token,
                onchainOrderId: orderId,
                sellerHandle: group.seller_handle,
              });
              if (res === "indexer_pending") {
                await new Promise((r) => setTimeout(r, 2_000));
                res = await finalizeCart({
                  token,
                  onchainOrderId: orderId,
                  sellerHandle: group.seller_handle,
                });
              }
              if (res === "indexer_pending") {
                // eslint-disable-next-line no-console
                console.warn(
                  "Cart finalize still pending after retry — stock will lag for orderId",
                  orderId,
                );
              }
            } catch (finErr) {
              // eslint-disable-next-line no-console
              console.warn(
                "Cart finalize failed, stock may be stale :",
                finErr,
              );
            }
          }

          updateSeller(i, { status: "success" });
        } catch (err) {
          updateSeller(i, { status: "error", error: classifyError(err) });
          // On error, mark all later sellers canceled so the user has an
          // accurate picture of what didn't run.
          markRemainingCanceled(i + 1);
          break;
        }
      }

      finalizePhase();
    } catch (err) {
      setState((s) => ({
        ...s,
        phase: "error",
        globalError: classifyError(err),
        currentSellerIndex: -1,
      }));
    }
  }, [
    resolveWalletClient,
    buyer,
    publicClient,
    chainId,
    cart,
    deliveryFormData,
    token,
    updateSeller,
    finalizePhase,
    markRemainingCanceled,
  ]);

  const cancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  return { state, start, cancel };
}
