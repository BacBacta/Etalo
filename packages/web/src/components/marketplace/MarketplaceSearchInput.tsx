/**
 * MarketplaceSearchInput — fix/marketplace-ux-pass.
 *
 * Title substring search for /marketplace. Debounces user input ~300 ms
 * before flushing to the parent's `onChange` so we don't fire a
 * marketplace refetch on every keystroke. The parent owns the debounced
 * value and writes it to URL state (?q=) — the input itself is purely
 * controlled by its local string.
 *
 * Mobile-first :
 * - 44 x 44 minimum touch target on the clear button.
 * - 16 px input font-size to skip iOS auto-zoom on focus.
 * - leading magnifier icon, trailing clear button when non-empty.
 * - role="search" on the wrapper for screen-reader landmark nav.
 */
"use client";

import { MagnifyingGlass, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (next: string) => void;
  /** Milliseconds before the local input change is forwarded. Lower
   *  numbers feel snappier ; 300 ms is a long-standing UX default for
   *  search-while-typing. */
  debounceMs?: number;
  className?: string;
  placeholder?: string;
}

export function MarketplaceSearchInput({
  value,
  onChange,
  debounceMs = 300,
  className,
  placeholder = "Search products",
}: Props) {
  const [local, setLocal] = useState(value);

  // Keep local in sync if the parent resets `value` externally
  // (e.g. clearing via URL state change). Avoids the controlled-vs-
  // uncontrolled gotcha where the input gets stuck on a stale prop.
  useEffect(() => {
    setLocal(value);
  }, [value]);

  // Debounced flush to the parent. The cleanup cancels any in-flight
  // timer when `local` changes again before debounceMs elapses, so
  // typing fast = single flush at the end.
  useEffect(() => {
    if (local === value) return;
    const id = window.setTimeout(() => {
      onChange(local);
    }, debounceMs);
    return () => window.clearTimeout(id);
  }, [local, debounceMs, onChange, value]);

  const showClear = local.length > 0;

  return (
    <div
      role="search"
      aria-label="Search marketplace products"
      data-testid="marketplace-search"
      className={cn(
        "relative flex items-center",
        "rounded-full border border-celo-dark/[12%] dark:border-celo-light/[12%]",
        "bg-celo-light dark:bg-celo-dark-elevated",
        "focus-within:ring-2 focus-within:ring-celo-forest focus-within:ring-offset-1",
        "transition-colors duration-150",
        className,
      )}
    >
      <MagnifyingGlass
        aria-hidden="true"
        className="ml-3 h-5 w-5 flex-shrink-0 text-neutral-500 dark:text-neutral-400"
      />
      <input
        type="text"
        inputMode="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        data-testid="marketplace-search-input"
        className={cn(
          "min-h-[44px] flex-1 bg-transparent px-3 text-base outline-none",
          "text-celo-dark placeholder:text-neutral-500",
          "dark:text-celo-light dark:placeholder:text-neutral-400",
        )}
      />
      {showClear ? (
        <button
          type="button"
          onClick={() => {
            setLocal("");
            onChange("");
          }}
          aria-label="Clear search"
          data-testid="marketplace-search-clear"
          className="mr-1 inline-flex h-11 w-11 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-celo-dark-surface"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
