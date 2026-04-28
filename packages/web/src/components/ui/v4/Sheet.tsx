import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type HTMLAttributes,
} from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";

import { cn } from "@/components/ui/v4/utils";

export const SheetV4 = DialogPrimitive.Root;
export const SheetV4Trigger = DialogPrimitive.Trigger;
export const SheetV4Portal = DialogPrimitive.Portal;

export const SheetV4Overlay = forwardRef<
  ElementRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-celo-dark/40 backdrop-blur-md dark:bg-black/60",
      "data-[state=open]:animate-in data-[state=closed]:animate-out",
      "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
SheetV4Overlay.displayName = "SheetV4Overlay";

export const SheetV4Close = forwardRef<
  ElementRef<typeof DialogPrimitive.Close>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Close>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Close
    ref={ref}
    className={cn(
      "absolute right-4 top-4 inline-flex items-center justify-center",
      "rounded-full p-1 text-celo-dark dark:text-celo-light",
      "transition-colors duration-200",
      "hover:bg-celo-forest-soft dark:hover:bg-celo-forest-bright-soft",
      "focus:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest dark:focus-visible:ring-celo-forest-bright",
      "focus-visible:ring-offset-2 focus-visible:ring-offset-celo-light dark:focus-visible:ring-offset-celo-dark-elevated",
      "disabled:pointer-events-none",
      className,
    )}
    {...props}
  >
    {children ?? (
      <>
        <X className="size-5" aria-hidden="true" />
        <span className="sr-only">Close</span>
      </>
    )}
  </DialogPrimitive.Close>
));
SheetV4Close.displayName = "SheetV4Close";

const sheetV4ContentVariants = cva(
  [
    "fixed z-50 bg-celo-light text-celo-dark shadow-celo-lg p-6 dark:bg-celo-dark-elevated dark:text-celo-light dark:border dark:border-celo-light/[8%]",
    "data-[state=open]:animate-in data-[state=closed]:animate-out",
    "duration-300",
  ].join(" "),
  {
    variants: {
      side: {
        right:
          "right-0 top-0 h-full w-[calc(100%-3rem)] max-w-[400px] rounded-l-3xl data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right",
        left: "left-0 top-0 h-full w-[calc(100%-3rem)] max-w-[400px] rounded-r-3xl data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left",
        top: "top-0 left-0 w-full max-h-[80vh] rounded-b-3xl data-[state=open]:slide-in-from-top data-[state=closed]:slide-out-to-top",
        bottom:
          "bottom-0 left-0 w-full max-h-[80vh] rounded-t-3xl data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
      },
    },
    defaultVariants: {
      side: "right",
    },
  },
);

export interface SheetV4ContentProps
  extends ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
    VariantProps<typeof sheetV4ContentVariants> {}

export const SheetV4Content = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  SheetV4ContentProps
>(({ className, side, children, ...props }, ref) => (
  <SheetV4Portal>
    <SheetV4Overlay />
    <DialogPrimitive.Content
      ref={ref}
      data-side={side ?? "right"}
      className={cn(sheetV4ContentVariants({ side }), className)}
      {...props}
    >
      {children}
      <SheetV4Close />
    </DialogPrimitive.Content>
  </SheetV4Portal>
));
SheetV4Content.displayName = "SheetV4Content";

export interface SheetV4HeaderProps extends HTMLAttributes<HTMLDivElement> {
  dark?: boolean;
}

export const SheetV4Header = forwardRef<HTMLDivElement, SheetV4HeaderProps>(
  ({ className, dark, ...props }, ref) => (
    <div
      ref={ref}
      data-dark={dark || undefined}
      className={cn(
        "flex flex-col gap-1.5 mb-4",
        dark && "bg-celo-dark text-celo-light dark:bg-celo-dark-bg dark:text-celo-light -m-6 mb-4 p-6 rounded-t-3xl",
        className,
      )}
      {...props}
    />
  ),
);
SheetV4Header.displayName = "SheetV4Header";

export const SheetV4Title = forwardRef<
  ElementRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("font-display text-display-4", className)}
    {...props}
  />
));
SheetV4Title.displayName = "SheetV4Title";

export const SheetV4Description = forwardRef<
  ElementRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("font-sans text-body-sm opacity-60", className)}
    {...props}
  />
));
SheetV4Description.displayName = "SheetV4Description";

export type SheetV4FooterProps = HTMLAttributes<HTMLDivElement>;

export const SheetV4Footer = forwardRef<HTMLDivElement, SheetV4FooterProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex justify-end gap-2 mt-6", className)}
      {...props}
    />
  ),
);
SheetV4Footer.displayName = "SheetV4Footer";

export { sheetV4ContentVariants };
