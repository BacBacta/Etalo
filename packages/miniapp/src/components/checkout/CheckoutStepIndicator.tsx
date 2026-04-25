import { Check, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

interface Props {
  current: 1 | 2 | 3;
  total: 2 | 3;
  needsApprove: boolean;
  step: "approve" | "create" | "fund";
}

const LABELS = {
  approve: "Approving USDT spending",
  create: "Creating order",
  fund: "Funding escrow",
} as const;

export function CheckoutStepIndicator({
  current,
  total,
  needsApprove,
  step,
}: Props) {
  const sequence: Array<"approve" | "create" | "fund"> = needsApprove
    ? ["approve", "create", "fund"]
    : ["create", "fund"];

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">
        Step {current} of {total}: {LABELS[step]}
      </p>
      <ul className="flex flex-col gap-2">
        {sequence.map((s, i) => {
          const num = i + 1;
          const done = num < current;
          const active = num === current;
          return (
            <li
              key={s}
              className="flex items-center gap-3 text-sm text-muted-foreground"
            >
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full border",
                  done
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : active
                      ? "border-primary"
                      : "border-muted",
                )}
              >
                {done ? (
                  <Check className="h-3 w-3" />
                ) : active ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <span className="text-sm">{num}</span>
                )}
              </span>
              <span className={cn(active && "font-medium text-foreground")}>
                {LABELS[s]}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
