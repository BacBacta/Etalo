import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type HTMLAttributes,
} from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/components/ui/v4/utils";

export const DialogV4 = DialogPrimitive.Root;
export const DialogV4Trigger = DialogPrimitive.Trigger;
export const DialogV4Portal = DialogPrimitive.Portal;

export const DialogV4Overlay = forwardRef<
  ElementRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-celo-dark/40 backdrop-blur-md",
      "data-[state=open]:animate-in data-[state=closed]:animate-out",
      "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogV4Overlay.displayName = "DialogV4Overlay";

export const DialogV4Close = forwardRef<
  ElementRef<typeof DialogPrimitive.Close>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Close>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Close
    ref={ref}
    className={cn(
      "absolute right-4 top-4 inline-flex items-center justify-center",
      "rounded-full p-1 text-celo-dark",
      "transition-colors duration-200",
      "hover:bg-celo-forest-soft",
      "focus:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest",
      "focus-visible:ring-offset-2 focus-visible:ring-offset-celo-light",
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
DialogV4Close.displayName = "DialogV4Close";

export const DialogV4Content = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogV4Portal>
    <DialogV4Overlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-1/2 top-1/2 z-50",
        "-translate-x-1/2 -translate-y-1/2",
        "w-[calc(100%-2rem)] max-w-[480px]",
        "bg-celo-light rounded-3xl p-6 shadow-celo-lg",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        className,
      )}
      {...props}
    >
      {children}
      <DialogV4Close />
    </DialogPrimitive.Content>
  </DialogV4Portal>
));
DialogV4Content.displayName = "DialogV4Content";

export interface DialogV4HeaderProps extends HTMLAttributes<HTMLDivElement> {
  dark?: boolean;
}

export const DialogV4Header = forwardRef<
  HTMLDivElement,
  DialogV4HeaderProps
>(({ className, dark, ...props }, ref) => (
  <div
    ref={ref}
    data-dark={dark || undefined}
    className={cn(
      "flex flex-col gap-1.5 mb-4",
      dark && "bg-celo-dark text-celo-light -m-6 mb-4 p-6 rounded-t-3xl",
      className,
    )}
    {...props}
  />
));
DialogV4Header.displayName = "DialogV4Header";

export const DialogV4Title = forwardRef<
  ElementRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("font-display text-display-4", className)}
    {...props}
  />
));
DialogV4Title.displayName = "DialogV4Title";

export const DialogV4Description = forwardRef<
  ElementRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("font-sans text-body-sm opacity-60", className)}
    {...props}
  />
));
DialogV4Description.displayName = "DialogV4Description";

export type DialogV4FooterProps = HTMLAttributes<HTMLDivElement>;

export const DialogV4Footer = forwardRef<
  HTMLDivElement,
  DialogV4FooterProps
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex justify-end gap-2 mt-6", className)}
    {...props}
  />
));
DialogV4Footer.displayName = "DialogV4Footer";
