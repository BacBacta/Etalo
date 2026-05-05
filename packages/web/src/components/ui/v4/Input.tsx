import {
  forwardRef,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
} from "react";

import { cn } from "@/components/ui/v4/utils";

export interface InputV4Props
  extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const InputV4 = forwardRef<HTMLInputElement, InputV4Props>(
  ({ className, error, type = "text", disabled, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        disabled={disabled}
        aria-invalid={error || undefined}
        data-error={error || undefined}
        className={cn(
          // base
          "block w-full font-sans text-body text-celo-dark bg-celo-light dark:text-celo-light dark:bg-celo-dark-elevated",
          "border border-celo-dark/[16%] rounded-xl px-4 py-3 dark:border-celo-light/[16%]",
          "placeholder:text-celo-dark/[40%] dark:placeholder:text-celo-light/[40%]",
          "transition-all duration-200 ease-out",
          // focus
          "focus:outline-none focus:ring-2 focus:ring-celo-forest focus:border-transparent dark:focus:ring-celo-forest-bright",
          // error
          error &&
            "ring-2 ring-celo-red border-transparent focus:ring-celo-red dark:ring-celo-red-bright dark:focus:ring-celo-red-bright",
          // disabled
          "disabled:bg-celo-dark/[4%] disabled:opacity-60 disabled:cursor-not-allowed dark:disabled:bg-celo-light/[4%]",
          className,
        )}
        {...props}
      />
    );
  },
);
InputV4.displayName = "InputV4";

export type LabelV4Props = LabelHTMLAttributes<HTMLLabelElement>;

export const LabelV4 = forwardRef<HTMLLabelElement, LabelV4Props>(
  ({ className, ...props }, ref) => {
    return (
      <label
        ref={ref}
        className={cn(
          "block font-sans text-caption tracking-[0.5px] uppercase font-medium text-celo-dark dark:text-celo-light mb-2",
          className,
        )}
        {...props}
      />
    );
  },
);
LabelV4.displayName = "LabelV4";

export interface HelperTextV4Props
  extends HTMLAttributes<HTMLParagraphElement> {
  error?: boolean;
}

export const HelperTextV4 = forwardRef<
  HTMLParagraphElement,
  HelperTextV4Props
>(({ className, error, ...props }, ref) => {
  return (
    <p
      ref={ref}
      data-error={error || undefined}
      className={cn(
        "font-sans text-caption mt-2",
        error
          ? "text-celo-red dark:text-celo-red-bright"
          : "text-celo-dark/[60%] dark:text-celo-light/[60%]",
        className,
      )}
      {...props}
    />
  );
});
HelperTextV4.displayName = "HelperTextV4";
