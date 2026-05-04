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
import {
  AnimatePresence,
  m,
  useReducedMotion,
  type MotionProps,
} from "motion/react";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "@phosphor-icons/react";

import { cn } from "@/components/ui/v4/utils";

// J10-V5 Phase 2 Block 6 — SheetV4 mirrors DialogV4's Block 6 refactor:
// Root becomes a Context wrapper that lifts open state, Content uses
// AnimatePresence + forceMount + asChild to drive enter/exit slide
// animations per side. Spring damping 30 (vs Dialog 28) because pure
// translation feels heavier than fade+zoom — the higher damping keeps
// the slide premium without bouncy overshoot.
type SheetV4ContextValue = {
  open: boolean;
};

const SheetV4Context = createContext<SheetV4ContextValue | null>(null);

export interface SheetV4Props {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  modal?: boolean;
  children?: ReactNode;
}

export function SheetV4({
  open: openProp,
  defaultOpen,
  onOpenChange,
  modal,
  children,
}: SheetV4Props) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen ?? false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;

  const handleOpenChange = (next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  return (
    <SheetV4Context.Provider value={{ open }}>
      <DialogPrimitive.Root
        open={open}
        onOpenChange={handleOpenChange}
        modal={modal}
      >
        {children}
      </DialogPrimitive.Root>
    </SheetV4Context.Provider>
  );
}

export const SheetV4Trigger = DialogPrimitive.Trigger;
export const SheetV4Portal = DialogPrimitive.Portal;

const overlayBaseClasses =
  "fixed inset-0 z-50 bg-celo-dark/40 backdrop-blur-md dark:bg-black/60";

export const SheetV4Overlay = forwardRef<
  ElementRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(overlayBaseClasses, className)}
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

// Positioning + size only — slide animation classes from V4 stripped
// because motion now drives translation. Border-radius per side stays
// because it's static layout, not animation.
const sheetV4ContentVariants = cva(
  "fixed z-50 bg-celo-light text-celo-dark shadow-celo-lg p-6 dark:bg-celo-dark-elevated dark:text-celo-light dark:border dark:border-celo-light/[8%]",
  {
    variants: {
      side: {
        right:
          "right-0 top-0 h-full w-[calc(100%-3rem)] max-w-[400px] rounded-l-3xl",
        left: "left-0 top-0 h-full w-[calc(100%-3rem)] max-w-[400px] rounded-r-3xl",
        top: "top-0 left-0 w-full max-h-[80vh] rounded-b-3xl",
        bottom: "bottom-0 left-0 w-full max-h-[80vh] rounded-t-3xl",
      },
    },
    defaultVariants: {
      side: "right",
    },
  },
);

type SheetSide = "right" | "left" | "top" | "bottom";

const sheetMotionVariantsBySide: Record<
  SheetSide,
  {
    initial: { x?: string; y?: string };
    animate: { x?: number; y?: number };
    exit: { x?: string; y?: string };
  }
> = {
  right: {
    initial: { x: "100%" },
    animate: { x: 0 },
    exit: { x: "100%" },
  },
  left: {
    initial: { x: "-100%" },
    animate: { x: 0 },
    exit: { x: "-100%" },
  },
  top: {
    initial: { y: "-100%" },
    animate: { y: 0 },
    exit: { y: "-100%" },
  },
  bottom: {
    initial: { y: "100%" },
    animate: { y: 0 },
    exit: { y: "100%" },
  },
};

const overlayMotionTransition = {
  duration: 0.2,
  ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
};

const sheetContentSpringTransition = {
  type: "spring" as const,
  stiffness: 350,
  damping: 30,
};

// J10-V5 Phase 5 polish follow-up #5 — when the user has set
// `prefers-reduced-motion: reduce` SheetV4 swaps the slide spring for
// an opacity-only fade tween (mirrors DialogV4's reduced-motion
// branch from commit b1632df). Slide translation is the visceral
// motion that triggers vestibular symptoms ; an opacity fade keeps
// the mount / unmount visual cue without the heavy translation. WCAG
// 2.1 SC 2.3.3 — Animation from Interactions. Drag forwarding stays
// untouched because drag is a user-initiated gesture, exempt from
// the auto-animation rule.
const sheetContentReducedTransition = {
  duration: 0.15,
  ease: "easeOut" as const,
};

const sheetReducedMotionVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
} as const;

// J10-V5 Phase 5 Block 2 sub-block 2.2 — drag-related motion props are
// forwarded to the inner m.div so consumers (CartDrawer swipe-to-close)
// can wire gestures without extending the component. We must Omit the
// HTML drag handler keys from DialogPrimitive.Content's props because
// motion's signatures (event + PanInfo) differ from React's native
// DragEvent handler signatures and would conflict in TypeScript.
type SheetV4DragMotionProps = Pick<
  MotionProps,
  | "drag"
  | "dragConstraints"
  | "dragElastic"
  | "dragMomentum"
  | "dragSnapToOrigin"
  | "onDragStart"
  | "onDrag"
  | "onDragEnd"
>;

export interface SheetV4ContentProps
  extends Omit<
      ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
      "onDragStart" | "onDrag" | "onDragEnd"
    >,
    VariantProps<typeof sheetV4ContentVariants>,
    SheetV4DragMotionProps {}

export const SheetV4Content = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  SheetV4ContentProps
>(
  (
    {
      className,
      side,
      children,
      drag,
      dragConstraints,
      dragElastic,
      dragMomentum,
      dragSnapToOrigin,
      onDragStart,
      onDrag,
      onDragEnd,
      ...props
    },
    ref,
  ) => {
    const ctx = useContext(SheetV4Context);
    const open = ctx?.open ?? false;
    const resolvedSide: SheetSide = side ?? "right";
    const shouldReduceMotion = useReducedMotion() ?? false;
    const motionVariants = shouldReduceMotion
      ? sheetReducedMotionVariants
      : sheetMotionVariantsBySide[resolvedSide];
    const contentTransition = shouldReduceMotion
      ? sheetContentReducedTransition
      : sheetContentSpringTransition;
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
                data-side={resolvedSide}
                data-motion-active
                data-reduced-motion={shouldReduceMotion ? "true" : undefined}
                className={cn(sheetV4ContentVariants({ side }), className)}
                initial={motionVariants.initial}
                animate={motionVariants.animate}
                exit={motionVariants.exit}
                transition={contentTransition}
                drag={drag}
                dragConstraints={dragConstraints}
                dragElastic={dragElastic}
                dragMomentum={dragMomentum}
                dragSnapToOrigin={dragSnapToOrigin}
                onDragStart={onDragStart}
                onDrag={onDrag}
                onDragEnd={onDragEnd}
              >
                {children}
                <SheetV4Close />
              </m.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        ) : null}
      </AnimatePresence>
    );
  },
);
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
