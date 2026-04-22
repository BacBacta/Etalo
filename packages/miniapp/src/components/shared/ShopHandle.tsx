import { cn } from "@/lib/utils";

interface ShopHandleProps {
  handle: string;
  name?: string;
  className?: string;
}

/**
 * Render a seller's public identity.
 *
 * CLAUDE.md rule: never surface raw 0x... wallet addresses to the user.
 * This component is the single source of truth for seller display —
 * always go through it rather than reading addresses directly.
 */
export function ShopHandle({ handle, name, className }: ShopHandleProps) {
  const prefixed = handle.startsWith("@") ? handle : `@${handle}`;
  return (
    <span className={cn("inline-flex items-baseline gap-1", className)}>
      {name ? <span className="font-semibold">{name}</span> : null}
      <span className="text-muted-foreground">{prefixed}</span>
    </span>
  );
}
