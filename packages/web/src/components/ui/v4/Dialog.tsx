import {
  createContext,
  forwardRef,
  useContext,
  useState,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { X } from "@phosphor-icons/react";

import { cn } from "@/components/ui/v4/utils";

// J10-V5 Phase 2 Block 6 — DialogV4 Root becomes a Context wrapper that
// lifts Radix's open state so DialogV4Content's AnimatePresence can drive
// motion enter + exit animations via forceMount + asChild. Trigger,
// Title, Description, Header, Footer, Close, Portal stay 1:1 with Radix
// (no API change for consumers — open / defaultOpen / onOpenChange /
// modal mirror Radix Root). Pattern is the documented Radix→Framer
// Motion integration; without forceMount the exit animation can't play
// because Radix would unmount immediately.
type DialogV4ContextValue = {
  open: boolean;
};

const DialogV4Context = createContext<DialogV4ContextValue | null>(null);

export interface DialogV4Props {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  modal?: boolean;
  children?: ReactNode;
}

export function DialogV4({
  open: openProp,
  defaultOpen,
  onOpenChange,
  modal,
  children,
}: DialogV4Props) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen ?? false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;

  const handleOpenChange = (next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  return (
    <DialogV4Context.Provider value={{ open }}>
      <DialogPrimitive.Root
        open={open}
        onOpenChange={handleOpenChange}
        modal={modal}
      >
        {children}
      </DialogPrimitive.Root>
    </DialogV4Context.Provider>
  );
}

export const DialogV4Trigger = DialogPrimitive.Trigger;
export const DialogV4Portal = DialogPrimitive.Portal;

const overlayBaseClasses =
  "fixed inset-0 z-50 bg-celo-dark/40 backdrop-blur-md dark:bg-black/60";

// Standalone Overlay export retained for any direct consumer (kept the
// V4 contract). Block 6 motion lives inside DialogV4Content's
// composition, not on this standalone primitive — direct users still
// get a static overlay via plain DialogPrimitive.Overlay.
export const DialogV4Overlay = forwardRef<
  ElementRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(overlayBaseClasses, className)}
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
DialogV4Close.displayName = "DialogV4Close";

// Centering translate is folded into motion variants (x:"-50%", y:"-50%")
// so motion's transform composition doesn't fight a CSS translate. Scale
// 0.95→1 lives in the same transform alongside the translate.
const dialogContentClasses = [
  "fixed left-1/2 top-1/2 z-50",
  "w-[calc(100%-2rem)] max-w-[480px]",
  "bg-celo-light text-celo-dark rounded-3xl p-6 shadow-celo-lg",
  "dark:bg-celo-dark-elevated dark:text-celo-light dark:border dark:border-celo-light/[8%]",
].join(" ");

const overlayMotionTransition = {
  duration: 0.2,
  ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
};

const dialogContentSpringTransition = {
  type: "spring" as const,
  stiffness: 350,
  damping: 28,
};

// J10-V5 Phase 5 polish #5 — when the user has set
// `prefers-reduced-motion: reduce` the dialog opts out of the spring +
// scale animation and uses an opacity-only fade tween instead. The
// centering transform (x:"-50%", y:"-50%") stays in every variant
// because dropping it would break the dialog's positioning. WCAG 2.1
// SC 2.3.3 (Animation from Interactions) — vestibular-disorder-friendly
// motion is on by default, gated through motion's useReducedMotion
// hook (reads window.matchMedia('(prefers-reduced-motion: reduce)')).
const dialogContentReducedTransition = {
  duration: 0.15,
  ease: "easeOut" as const,
};

export const DialogV4Content = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => {
  const ctx = useContext(DialogV4Context);
  const open = ctx?.open ?? false;
  const shouldReduceMotion = useReducedMotion() ?? false;

  const contentInitial = shouldReduceMotion
    ? { opacity: 0, x: "-50%", y: "-50%" }
    : { opacity: 0, scale: 0.95, x: "-50%", y: "-50%" };
  const contentAnimate = shouldReduceMotion
    ? { opacity: 1, x: "-50%", y: "-50%" }
    : { opacity: 1, scale: 1, x: "-50%", y: "-50%" };
  const contentExit = shouldReduceMotion
    ? { opacity: 0, x: "-50%", y: "-50%" }
    : { opacity: 0, scale: 0.95, x: "-50%", y: "-50%" };
  const contentTransition = shouldReduceMotion
    ? dialogContentReducedTransition
    : dialogContentSpringTransition;

  return (
    <AnimatePresence>
      {open ? (
        <DialogPrimitive.Portal forceMount>
          <DialogPrimitive.Overlay asChild forceMount>
            <m.div
              data-motion-active
              className={overlayBaseClasses}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={overlayMotionTransition}
            />
          </DialogPrimitive.Overlay>
          <DialogPrimitive.Content ref={ref} asChild forceMount {...props}>
            <m.div
              data-motion-active
              data-reduced-motion={shouldReduceMotion ? "true" : undefined}
              className={cn(dialogContentClasses, className)}
              initial={contentInitial}
              animate={contentAnimate}
              exit={contentExit}
              transition={contentTransition}
            >
              {children}
              <DialogV4Close />
            </m.div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      ) : null}
    </AnimatePresence>
  );
});
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
      dark && "bg-celo-dark text-celo-light dark:bg-celo-dark-bg dark:text-celo-light -m-6 mb-4 p-6 rounded-t-3xl",
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
