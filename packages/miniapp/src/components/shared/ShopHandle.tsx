import { cn } from "@/lib/utils";

const GATEWAY =
  import.meta.env.VITE_PINATA_GATEWAY_URL ??
  "https://gateway.pinata.cloud/ipfs";

interface ShopHandleProps {
  handle: string;
  name?: string;
  logoIpfsHash?: string | null;
  className?: string;
}

/**
 * Render a seller's public identity.
 *
 * CLAUDE.md rule: never surface raw 0x... wallet addresses to the user.
 * This component is the single source of truth for seller display —
 * always go through it rather than reading addresses directly.
 */
export function ShopHandle({
  handle,
  name,
  logoIpfsHash,
  className,
}: ShopHandleProps) {
  const prefixed = handle.startsWith("@") ? handle : `@${handle}`;
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {logoIpfsHash ? (
        <img
          src={`${GATEWAY}/${logoIpfsHash}`}
          alt=""
          className="h-8 w-8 rounded-full object-cover"
        />
      ) : null}
      <span className="inline-flex items-baseline gap-1">
        {name ? <span className="font-semibold">{name}</span> : null}
        <span className="text-muted-foreground">{prefixed}</span>
      </span>
    </span>
  );
}
