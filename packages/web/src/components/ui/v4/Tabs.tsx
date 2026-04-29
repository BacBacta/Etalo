"use client";

import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type MutableRefObject,
} from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/components/ui/v4/utils";

export const TabsV4Root = TabsPrimitive.Root;

interface IndicatorState {
  x: number;
  width: number;
  measured: boolean;
}

// J10-V5 Phase 4 Block 3 — sliding indicator under the active tab.
// Phase 2 Block 5 originally drove the indicator with motion/react
// spring 500/30; Phase 4 Block 3 dropped the motion dep (Lesson #80
// récidive — module-level motion import injected ~15-20 KB into every
// route consumer that imported TabsV4, making the dashboard tree
// brush against the 280 KB strict trigger). CSS transform +
// transition-[transform,width] duration-300 ease-out approximates the
// snappy spring well enough at the small distances tabs travel; tabs
// UX is instant feedback rather than spring exploration.
//
// State strategy unchanged (manual position tracking via
// MutationObserver + ResizeObserver — Radix Tabs Root doesn't expose
// the active value to children Triggers, so the List measures the
// active descendant directly). Conditional render
// `{indicator.measured && ...}` still avoids a flash at position 0,0
// during the first paint.
export const TabsV4List = forwardRef<
  ElementRef<typeof TabsPrimitive.List>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, children, ...props }, ref) => {
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [indicator, setIndicator] = useState<IndicatorState>({
    x: 0,
    width: 0,
    measured: false,
  });

  useEffect(() => {
    const list = innerRef.current;
    if (!list) return;

    const update = () => {
      const active = list.querySelector(
        '[data-state="active"]',
      ) as HTMLElement | null;
      if (!active) return;
      setIndicator({
        x: active.offsetLeft,
        width: active.offsetWidth,
        measured: true,
      });
    };

    update();

    const mutationObserver = new MutationObserver(update);
    mutationObserver.observe(list, {
      attributes: true,
      attributeFilter: ["data-state"],
      subtree: true,
    });

    // jsdom < some-version doesn't ship ResizeObserver. Guard so
    // vitest doesn't crash on import; production browsers all support
    // it. Resize behavior is visual-tested only.
    let resizeObserver: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(update);
      resizeObserver.observe(list);
    }

    return () => {
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
    };
  }, []);

  // Forward the same node to both the local ref (for measurement) and
  // the caller's forwarded ref. Keeps the public API contract while
  // letting the indicator measure positions.
  const setRefs = (node: HTMLDivElement | null) => {
    innerRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) {
      (ref as MutableRefObject<HTMLDivElement | null>).current = node;
    }
  };

  return (
    <TabsPrimitive.List
      ref={setRefs}
      data-tabs-indicator-active={indicator.measured || undefined}
      className={cn(
        "relative flex gap-1 border-b border-celo-dark/[8%] dark:border-celo-light/[8%]",
        className,
      )}
      {...props}
    >
      {children}
      {indicator.measured && (
        <div
          aria-hidden="true"
          data-testid="tabs-indicator"
          className="absolute bottom-0 left-0 h-0.5 bg-celo-forest transition-[transform,width] duration-300 ease-out dark:bg-celo-forest-bright"
          style={{
            transform: `translateX(${indicator.x}px)`,
            width: `${indicator.width}px`,
          }}
        />
      )}
    </TabsPrimitive.List>
  );
});
TabsV4List.displayName = "TabsV4List";

export const TabsV4Trigger = forwardRef<
  ElementRef<typeof TabsPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "relative px-4 py-3 font-sans text-body-sm font-medium",
      // Reserve 2px of border-bottom space (transparent) so the m.div
      // indicator on TabsV4List visually aligns with the trigger's
      // bottom edge. Active border-color is no longer set — the motion
      // indicator replaces it.
      "border-b-2 border-transparent -mb-px",
      "text-celo-dark/60 hover:text-celo-dark dark:text-celo-light/60 dark:hover:text-celo-light",
      "data-[state=active]:text-celo-forest dark:data-[state=active]:text-celo-forest-bright",
      // CSS scoped to colors (Block 2-3 separation pattern) — motion
      // drives the indicator's transform on the List, not on triggers.
      "transition-colors duration-200 ease-out",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest dark:focus-visible:ring-celo-forest-bright",
      "focus-visible:ring-offset-2 focus-visible:ring-offset-celo-light dark:focus-visible:ring-offset-celo-dark-bg",
      "disabled:opacity-50 disabled:pointer-events-none",
      className,
    )}
    {...props}
  />
));
TabsV4Trigger.displayName = "TabsV4Trigger";

export const TabsV4Content = forwardRef<
  ElementRef<typeof TabsPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-4 outline-none",
      "focus-visible:ring-2 focus-visible:ring-celo-forest focus-visible:ring-offset-2 dark:focus-visible:ring-celo-forest-bright",
      "focus-visible:ring-offset-celo-light dark:focus-visible:ring-offset-celo-dark-bg",
      className,
    )}
    {...props}
  />
));
TabsV4Content.displayName = "TabsV4Content";
