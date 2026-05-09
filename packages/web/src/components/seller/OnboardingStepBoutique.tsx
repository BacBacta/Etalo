/**
 * OnboardingStepBoutique — first step of the seller onboarding wizard.
 *
 * Collects shop identity (handle, name, country, optional description
 * and logo). Handle availability is checked live against the backend
 * with a 400ms debounce so the UI doesn't fight the user as they type.
 *
 * The step intentionally exits via `onNext(values)` rather than
 * fetching itself — the wizard parent owns the cross-step state and
 * the final POST /onboarding/complete call so we don't need to
 * fetch+rollback if step 2 fails.
 */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { CountrySelector, type CountryCode } from "@/components/CountrySelector";
import { ImageUploader } from "@/components/seller/ImageUploader";
import { Button } from "@/components/ui/button";
import { checkHandleAvailable } from "@/lib/onboarding-api";

export interface BoutiqueValues {
  shop_handle: string;
  shop_name: string;
  country: CountryCode;
  description: string;
  logo_ipfs_hash: string | null;
}

interface Props {
  walletAddress: string;
  initial?: BoutiqueValues;
  onNext: (values: BoutiqueValues) => void;
}

const HANDLE_PATTERN = /^[a-z0-9_]{3,30}$/;
const HANDLE_DEBOUNCE_MS = 400;

type HandleStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available"; handle: string }
  | { state: "format" }
  | { state: "taken" };

export function OnboardingStepBoutique({
  walletAddress,
  initial,
  onNext,
}: Props) {
  const [shopName, setShopName] = useState(initial?.shop_name ?? "");
  const [shopHandle, setShopHandle] = useState(initial?.shop_handle ?? "");
  const [country, setCountry] = useState<CountryCode | null>(
    initial?.country ?? null,
  );
  const [description, setDescription] = useState(initial?.description ?? "");
  const [logoHash, setLogoHash] = useState<string | null>(
    initial?.logo_ipfs_hash ?? null,
  );

  const [handleStatus, setHandleStatus] = useState<HandleStatus>({
    state: "idle",
  });

  // Debounced handle availability check. We only fire when the value
  // matches the format regex — a malformed value short-circuits to
  // "format" without burning a backend request.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = shopHandle.trim().toLowerCase();
    if (trimmed.length === 0) {
      setHandleStatus({ state: "idle" });
      return;
    }
    if (!HANDLE_PATTERN.test(trimmed)) {
      setHandleStatus({ state: "format" });
      return;
    }
    setHandleStatus({ state: "checking" });
    debounceRef.current = setTimeout(() => {
      checkHandleAvailable(walletAddress, trimmed)
        .then((res) => {
          if (res.available) {
            setHandleStatus({ state: "available", handle: trimmed });
          } else if (res.reason === "taken") {
            setHandleStatus({ state: "taken" });
          } else {
            setHandleStatus({ state: "format" });
          }
        })
        .catch(() => {
          // Network error → fall back to "idle" so the user can submit
          // and the final POST surfaces the conflict if any.
          setHandleStatus({ state: "idle" });
        });
    }, HANDLE_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [shopHandle, walletAddress]);

  const canSubmit = useMemo(() => {
    if (shopName.trim().length === 0) return false;
    if (!HANDLE_PATTERN.test(shopHandle.trim().toLowerCase())) return false;
    if (handleStatus.state === "taken") return false;
    if (handleStatus.state === "checking") return false;
    if (!country) return false;
    if (description.length > 500) return false;
    return true;
  }, [shopName, shopHandle, handleStatus, country, description]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !country) return;
    onNext({
      shop_handle: shopHandle.trim().toLowerCase(),
      shop_name: shopName.trim(),
      country,
      description: description.trim(),
      logo_ipfs_hash: logoHash,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="shop-name" className="mb-1 block text-sm font-medium">
          Shop name
        </label>
        <input
          id="shop-name"
          type="text"
          value={shopName}
          onChange={(e) => setShopName(e.target.value)}
          maxLength={100}
          placeholder="My Boutique"
          required
          className="block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-base text-celo-dark dark:border-celo-light/20 dark:bg-celo-dark-elevated dark:text-celo-light focus:border-celo-forest focus:outline-none focus:ring-1 focus:ring-celo-forest"
        />
      </div>

      <div>
        <label
          htmlFor="shop-handle"
          className="mb-1 block text-sm font-medium"
        >
          Shop handle
        </label>
        <div className="flex items-center gap-2">
          <span className="text-base text-neutral-500 dark:text-celo-light/60">etalo.app/</span>
          <input
            id="shop-handle"
            type="text"
            value={shopHandle}
            onChange={(e) =>
              setShopHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
            }
            maxLength={30}
            placeholder="myshop"
            required
            className="block flex-1 rounded-md border border-neutral-300 bg-white px-3 py-2 text-base text-celo-dark dark:border-celo-light/20 dark:bg-celo-dark-elevated dark:text-celo-light focus:border-celo-forest focus:outline-none focus:ring-1 focus:ring-celo-forest"
          />
        </div>
        <p
          className={`mt-1 text-sm ${
            handleStatus.state === "available"
              ? "text-celo-forest dark:text-celo-forest-bright"
              : handleStatus.state === "taken" ||
                  handleStatus.state === "format"
                ? "text-red-600 dark:text-red-400"
                : "text-neutral-500 dark:text-celo-light/60"
          }`}
          data-testid="onboarding-handle-status"
        >
          {handleStatus.state === "checking" && "Checking availability…"}
          {handleStatus.state === "available" &&
            `@${handleStatus.handle} is available`}
          {handleStatus.state === "taken" && "This handle is already taken"}
          {handleStatus.state === "format" &&
            "Use 3-30 lowercase letters, digits, or underscores"}
          {handleStatus.state === "idle" &&
            "Lowercase letters, digits, underscores. 3-30 chars."}
        </p>
      </div>

      <div>
        <label htmlFor="shop-country" className="mb-1 block text-sm font-medium">
          Country
        </label>
        <CountrySelector
          value={country}
          onChange={setCountry}
          required
          id="shop-country"
        />
      </div>

      <div>
        <label
          htmlFor="shop-description"
          className="mb-1 block text-sm font-medium"
        >
          About your shop <span className="text-neutral-500 dark:text-celo-light/60">(optional)</span>
        </label>
        <textarea
          id="shop-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="What you sell, who you make it for…"
          className="block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-base text-celo-dark dark:border-celo-light/20 dark:bg-celo-dark-elevated dark:text-celo-light focus:border-celo-forest focus:outline-none focus:ring-1 focus:ring-celo-forest"
        />
        <p className="mt-1 text-sm text-neutral-500 dark:text-celo-light/60">
          {description.length}/500
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">
          Logo <span className="text-neutral-500 dark:text-celo-light/60">(optional)</span>
        </label>
        <ImageUploader
          walletAddress={walletAddress}
          maxImages={1}
          initialIpfsHashes={logoHash ? [logoHash] : []}
          onChange={(hashes) => setLogoHash(hashes[0] ?? null)}
        />
      </div>

      <div className="pt-2">
        <Button
          type="submit"
          disabled={!canSubmit}
          data-testid="onboarding-step-boutique-next"
          className="w-full"
        >
          Continue
        </Button>
      </div>
    </form>
  );
}
