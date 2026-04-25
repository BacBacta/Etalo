import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { BoutiqueHeader } from "@/components/BoutiqueHeader";
import { EmptyState } from "@/components/EmptyState";
import { ProductGrid } from "@/components/ProductGrid";
import { fetchPublicBoutique } from "@/lib/api";

interface Props {
  params: { handle: string };
}

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

function normalize(raw: string): string {
  // Next.js dynamic params arrive URL-encoded ("%40chioma" for "@chioma"),
  // so decode before applying the canonical-form rules (lowercase, strip @).
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // Fall back to raw on malformed input — the 404 path will catch it.
  }
  return decoded.toLowerCase().replace(/^@/, "");
}

export async function generateMetadata({
  params,
}: Props): Promise<Metadata> {
  const normalized = normalize(params.handle);
  const data = await fetchPublicBoutique(normalized).catch(() => null);
  if (!data) return { title: "Shop not found" };

  const title = `${data.seller.shop_name} on Etalo`;
  const description = `Browse ${data.seller.shop_name}'s products and buy with USDT. Your digital stall, open 24/7.`;
  const ogImage = data.seller.logo_url ?? undefined;
  const url = `${BASE_URL}/${data.seller.shop_handle}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      siteName: "Etalo",
      title,
      description,
      images: ogImage ? [{ url: ogImage }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ogImage ? [ogImage] : [],
    },
  };
}

export default async function BoutiquePage({ params }: Props) {
  // Canonicalize the handle: lowercase + strip leading @. Non-canonical
  // forms 308-redirect to the canonical URL so SEO / share links land
  // on a single source of truth.
  const normalized = normalize(params.handle);
  if (normalized !== params.handle) {
    permanentRedirect(`/${normalized}`);
  }

  const data = await fetchPublicBoutique(normalized);
  if (!data) notFound();

  const url = `${BASE_URL}/${data.seller.shop_handle}`;
  // Schema.org Store markup. addressCountry accepts ISO-2 or ISO-3;
  // backend stores ISO-3 so we pass it through verbatim.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Store",
    name: data.seller.shop_name,
    url,
    image: data.seller.logo_url ?? undefined,
    address: data.seller.country
      ? {
          "@type": "PostalAddress",
          addressCountry: data.seller.country,
        }
      : undefined,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main className="min-h-screen">
        <BoutiqueHeader seller={data.seller} />
        {data.products.length === 0 ? (
          <EmptyState />
        ) : (
          <ProductGrid
            products={data.products}
            handle={data.seller.shop_handle}
            sellerShopName={data.seller.shop_name}
          />
        )}
      </main>
    </>
  );
}
