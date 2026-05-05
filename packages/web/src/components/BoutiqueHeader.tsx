import Image from "next/image";

import { countryName } from "@/lib/country";
import type { BoutiquePublic } from "@/lib/api";

interface Props {
  seller: BoutiquePublic["seller"];
}

export function BoutiqueHeader({ seller }: Props) {
  const country = countryName(seller.country);
  return (
    <header className="border-b border-neutral-200 px-4 py-6">
      <div className="mx-auto flex max-w-3xl items-center gap-4">
        {seller.logo_url ? (
          <Image
            src={seller.logo_url}
            alt={`${seller.shop_name} logo`}
            width={64}
            height={64}
            sizes="64px"
            className="h-16 w-16 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-200 text-base font-semibold text-neutral-700">
            {seller.shop_name.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="text-xl font-semibold">{seller.shop_name}</h1>
          <p className="text-sm text-neutral-600">
            @{seller.shop_handle}
            {country ? ` · ${country}` : null}
          </p>
          {/* TODO Block 8: reputation badge (stake/rep on-chain reads) */}
        </div>
      </div>
    </header>
  );
}
