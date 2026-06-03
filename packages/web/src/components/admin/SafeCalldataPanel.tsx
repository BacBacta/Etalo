/**
 * SafeCalldataPanel — read-only display of a prepared Safe transaction
 * (ADR-056). Shows the target contract, the human-readable function
 * signature + decoded args, the encoded hex calldata, a Copy button,
 * and a deeplink to the Safe queue UI where the signers craft the tx.
 */
"use client";

import { Copy, ArrowSquareOut } from "@phosphor-icons/react";
import { useState } from "react";

import { safeQueueUrl } from "@/lib/safe-config";

export interface SafeCalldataPanelProps {
  title: string;
  description?: string;
  targetAddress: string;
  functionSignature: string;
  decodedArgs: string;
  calldata: `0x${string}` | null;
  error?: string | null;
}

export function SafeCalldataPanel({
  title,
  description,
  targetAddress,
  functionSignature,
  decodedArgs,
  calldata,
  error,
}: SafeCalldataPanelProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!calldata) return;
    void navigator.clipboard.writeText(calldata).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <section
      data-testid="safe-calldata-panel"
      className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-celo-sm dark:border-celo-light/10 dark:bg-celo-dark-elevated"
    >
      <header className="space-y-1">
        <h3 className="text-base font-semibold text-celo-dark dark:text-celo-light">
          {title}
        </h3>
        {description ? (
          <p className="text-sm text-neutral-500 dark:text-celo-light/60">
            {description}
          </p>
        ) : null}
      </header>

      <dl className="space-y-1.5 text-sm">
        <div>
          <dt className="text-neutral-500 dark:text-celo-light/60">
            Target contract
          </dt>
          <dd
            data-testid="calldata-target"
            className="break-all font-mono text-celo-dark dark:text-celo-light"
          >
            {targetAddress}
          </dd>
        </div>
        <div>
          <dt className="text-neutral-500 dark:text-celo-light/60">Function</dt>
          <dd className="break-all font-mono text-celo-dark dark:text-celo-light">
            {functionSignature}
          </dd>
        </div>
        <div>
          <dt className="text-neutral-500 dark:text-celo-light/60">Args</dt>
          <dd className="break-all font-mono text-celo-dark dark:text-celo-light">
            {decodedArgs}
          </dd>
        </div>
      </dl>

      {error ? (
        <p
          role="alert"
          data-testid="calldata-error"
          className="rounded-md bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-900/30 dark:text-rose-200"
        >
          {error}
        </p>
      ) : null}

      {calldata ? (
        <div className="space-y-2">
          <div>
            <span className="text-sm text-neutral-500 dark:text-celo-light/60">
              Encoded calldata
            </span>
            <pre
              data-testid="calldata-hex"
              className="mt-1 break-all rounded-md bg-neutral-100 p-3 font-mono text-xs text-celo-dark dark:bg-celo-dark-bg dark:text-celo-light"
            >
              {calldata}
            </pre>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="calldata-copy"
              onClick={handleCopy}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-pill border border-neutral-200 px-4 text-sm font-medium text-celo-dark hover:bg-neutral-50 dark:border-celo-light/20 dark:text-celo-light dark:hover:bg-celo-dark-bg"
            >
              <Copy className="h-4 w-4" aria-hidden />
              {copied ? "Copied!" : "Copy calldata"}
            </button>
            <a
              href={safeQueueUrl()}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="calldata-safe-link"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-pill bg-celo-forest px-4 text-sm font-medium text-celo-light hover:bg-celo-forest-dark"
            >
              <ArrowSquareOut className="h-4 w-4" aria-hidden />
              Open Safe to sign
            </a>
          </div>
          <p className="text-sm text-neutral-500 dark:text-celo-light/60">
            In Safe, choose <span className="font-medium">New transaction →
            Contract Interaction</span>, paste the target address, then paste
            this calldata into the <span className="font-medium">Custom
            data</span> field.
          </p>
        </div>
      ) : null}
    </section>
  );
}
