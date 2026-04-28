import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
} from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/components/ui/v4/utils";

export const TabsV4Root = TabsPrimitive.Root;

export const TabsV4List = forwardRef<
  ElementRef<typeof TabsPrimitive.List>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "flex gap-1 border-b border-celo-dark/[8%] dark:border-celo-light/[8%]",
      className,
    )}
    {...props}
  />
));
TabsV4List.displayName = "TabsV4List";

export const TabsV4Trigger = forwardRef<
  ElementRef<typeof TabsPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "relative px-4 py-3 font-sans text-body-sm font-medium",
      "border-b-2 border-transparent -mb-px",
      "text-celo-dark/60 hover:text-celo-dark dark:text-celo-light/60 dark:hover:text-celo-light",
      "data-[state=active]:border-celo-forest data-[state=active]:text-celo-forest dark:data-[state=active]:border-celo-forest-bright dark:data-[state=active]:text-celo-forest-bright",
      "transition-all duration-200 ease-out",
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
