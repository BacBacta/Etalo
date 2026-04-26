import type { Metadata } from "next";
import Image from "next/image";
import { notFound, permanentRedirect } from "next/navigation";

import { ProductAddToCartButton } from "@/components/ProductAddToCartButton";
import { ShareButtons } from "@/components/ShareButtons";
import { displayUsdt, fetchPublicProduct } from "@/lib/api";

interface PageProps {
  params: { handle: string; slug: string };
}

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

function normalizeHandle(raw: string): string {
  // Next.js dynamic params arrive URL-encoded ("%40chioma" for "@chioma");
  // decode first, then lowercase + strip leading @ — same canonical-form
  // rules as the boutique page (Block 2 Étape B).
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // malformed input falls through; the 404 path will catch it.
  }
  return decoded.toLowerCase().replace(/^@/, "");
}

function normalizeSlug(raw: string): string {
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // ignore; the 404 path will catch malformed input.
  }
  // Slugs are always lowercased; the backend Product.slug column matches
  // case-sensitively, so we have to send the canonical form.
  return decoded.toLowerCase();
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const handle = normalizeHandle(params.handle);
  const slug = normalizeSlug(params.slug);
  const product = await fetchPublicProduct(handle, slug);
  if (!product) {
    return { title: "Product not found" };
  }

  const url = `${BASE_URL}/${product.seller.shop_handle}/${product.slug}`;
  const primaryImage = product.image_urls[0];
  const description =
    product.description?.slice(0, 160) ??
    `${displayUsdt(product.price_usdt)} — ships from ${
      product.seller.country ?? "Africa"
    }`;

  return {
    title: `${product.title} — ${product.seller.shop_name}`,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title: product.title,
      description,
      siteName: "Etalo",
      images: primaryImage
        ? [{ url: primaryImage, width: 1200, height: 630, alt: product.title }]
        : [],
    },
    twitter: {
      card: "summary_large_image",
      title: product.title,
      description,
      images: primaryImage ? [primaryImage] : [],
    },
  };
}

export default async function ProductPage({ params }: PageProps) {
  // Canonicalize both segments. If either differs, 308 to the canonical
  // URL so SEO + share links converge on a single source of truth.
  const handle = normalizeHandle(params.handle);
  const slug = normalizeSlug(params.slug);
  if (handle !== params.handle || slug !== params.slug) {
    permanentRedirect(`/${handle}/${slug}`);
  }

  const product = await fetchPublicProduct(handle, slug);
  if (!product) notFound();

  const url = `${BASE_URL}/${product.seller.shop_handle}/${product.slug}`;
  const outOfStock = product.stock <= 0 || product.status !== "active";
  const priceNumber = Number(product.price_usdt).toFixed(2);

  // Schema.org Product. priceCurrency uses "USD" — USDT pegs 1:1 and is
  // not in ISO 4217. Crawlers expect a standard code.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.description ?? undefined,
    image: product.image_urls.length > 0 ? product.image_urls : undefined,
    brand: {
      "@type": "Brand",
      name: product.seller.shop_name,
    },
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "USD",
      price: priceNumber,
      availability: outOfStock
        ? "https://schema.org/OutOfStock"
        : "https://schema.org/InStock",
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
        <header className="flex items-center gap-3">
          {product.seller.logo_url ? (
            <Image
              src={product.seller.logo_url}
              alt=""
              width={40}
              height={40}
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <div className="h-10 w-10 rounded-full bg-neutral-200" />
          )}
          <div className="flex flex-col">
            <span className="text-sm font-semibold">
              {product.seller.shop_name}
            </span>
            <span className="text-sm text-neutral-500">
              @{product.seller.shop_handle}
            </span>
          </div>
        </header>

        {product.image_urls.length > 0 ? (
          <div className="overflow-hidden rounded-lg bg-neutral-100">
            <Image
              src={product.image_urls[0]}
              alt={product.title}
              width={800}
              height={800}
              className="w-full object-cover"
            />
          </div>
        ) : (
          <div className="aspect-square rounded-lg bg-neutral-100" />
        )}

        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">{product.title}</h1>
          <p className="text-2xl font-semibold">
            {displayUsdt(product.price_usdt)}
          </p>
          {outOfStock ? (
            <p className="text-sm text-red-600">Out of stock.</p>
          ) : (
            <p className="text-sm text-neutral-500">
              {product.stock} left in stock.
            </p>
          )}
        </div>

        {product.description ? (
          <p className="whitespace-pre-line text-base text-neutral-700">
            {product.description}
          </p>
        ) : null}

        <ProductAddToCartButton
          productId={product.id}
          productSlug={product.slug}
          sellerHandle={product.seller.shop_handle}
          sellerShopName={product.seller.shop_name}
          title={product.title}
          priceUsdt={String(product.price_usdt)}
          imageUrl={product.image_urls[0] ?? null}
          stock={product.stock}
          outOfStock={outOfStock}
        />

        <ShareButtons url={url} title={product.title} />
      </main>
    </>
  );
}
