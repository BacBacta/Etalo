import Image from "next/image";
import Link from "next/link";

import type { FeaturedSeller } from "@/lib/api";
import { countryName } from "@/lib/country";

interface Props {
  sellers: FeaturedSeller[];
}

export function FeaturedSellers({ sellers }: Props) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
      {sellers.map((seller) => {
        const country = countryName(seller.country);
        return (
          <Link
            key={seller.handle}
            href={`/${seller.handle}`}
            className="block min-h-[44px] overflow-hidden rounded-lg border border-neutral-200 bg-white transition-colors hover:border-neutral-400 dark:border-celo-light/10 dark:bg-celo-dark-elevated dark:hover:border-celo-light/30"
          >
            <div className="relative aspect-square bg-neutral-100 dark:bg-celo-dark-bg">
              {seller.primary_image_url ? (
                <Image
                  src={seller.primary_image_url}
                  alt={seller.shop_name}
                  fill
                  sizes="(max-width: 768px) 50vw, 33vw"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-base text-neutral-500 dark:text-celo-light/50">
                  {seller.shop_name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="p-3">
              <h3 className="line-clamp-1 text-base font-medium text-celo-dark dark:text-celo-light">
                {seller.shop_name}
              </h3>
              <p className="mt-1 text-sm text-neutral-600 dark:text-celo-light/70">
                @{seller.handle}
                {country ? ` · ${country}` : ""}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
