import { ArrowUpRight, ShieldCheck, Truck } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";

import { ProductAddToCartButton } from "@/components/ProductAddToCartButton";
import { ProductImageGallery } from "@/components/ProductImageGallery";
import { ShareButtons } from "@/components/ShareButtons";
import { fetchPublicProduct } from "@/lib/api";
import { countryName } from "@/lib/country";
import { displayUsdtFromDecimalString } from "@/lib/usdt";

const COUNTRY_FLAGS: Record<string, string> = {
  NGA: "🇳🇬",
  GHA: "🇬🇭",
  KEN: "🇰🇪",
};

interface PageProps {
  params: { handle: string; slug: string };
}

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || "https://etalo.xyz";

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
    `${displayUsdtFromDecimalString(product.price_usdt)} — ships from ${
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
  const lowStock = !outOfStock && product.stock <= 3;
  const sellerCountry = countryName(product.seller.country);
  const sellerFlag = product.seller.country
    ? COUNTRY_FLAGS[product.seller.country]
    : undefined;

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
      {/*
        Escape `<` to `<` before insertion — `JSON.stringify`
        alone doesn't, so a seller naming their product
        `</script><script>evil()</script>` could escape the JSON-LD
        context and run arbitrary JS in etalo.app's origin. See the
        matching note on /[handle]/page.tsx.
      */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <main
        id="main"
        className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 pb-32 pt-5 sm:px-6"
      >
        {/* Seller header — tappable card that leads to the boutique.
            Establishes brand trust before the product itself. */}
        <Link
          href={`/${product.seller.shop_handle}`}
          className="group flex items-center gap-3 rounded-2xl border border-celo-dark/[6%] bg-celo-light p-2.5 pr-3 shadow-celo-sm transition-colors hover:bg-celo-sand/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celo-forest dark:border-celo-light/[8%] dark:bg-celo-dark-elevated dark:hover:bg-celo-dark-surface"
        >
          {product.seller.logo_url ? (
            <Image
              src={product.seller.logo_url}
              alt=""
              width={44}
              height={44}
              sizes="44px"
              className="h-11 w-11 rounded-full object-cover ring-1 ring-celo-dark/[8%] dark:ring-celo-light/10"
            />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-celo-sand text-base font-semibold text-celo-forest dark:bg-celo-dark-surface dark:text-celo-forest-bright">
              {product.seller.shop_name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-base font-semibold text-celo-dark dark:text-celo-light">
              {product.seller.shop_name}
            </span>
            <span className="truncate text-sm text-celo-dark/55 dark:text-celo-light/55">
              {sellerFlag ? `${sellerFlag} ` : ""}
              {sellerCountry ?? `@${product.seller.shop_handle}`}
            </span>
          </div>
          <span className="ml-auto inline-flex shrink-0 items-center gap-0.5 text-sm font-medium text-celo-forest transition-transform group-hover:translate-x-0.5 dark:text-celo-forest-bright">
            Boutique
            <ArrowUpRight weight="bold" className="h-4 w-4" aria-hidden />
          </span>
        </Link>

        <ProductImageGallery images={product.image_urls} alt={product.title} />

        {/* Title + price block — confident display typography. */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-display-3 text-celo-dark dark:text-celo-light">
              {product.title}
            </h1>
            <div className="flex items-baseline gap-1.5">
              <span className="font-display text-display-2 tabular-nums text-celo-dark dark:text-celo-light">
                {priceNumber}
              </span>
              <span className="text-base font-medium text-celo-dark/45 dark:text-celo-light/45">
                USDT
              </span>
            </div>
          </div>

          {/* Stock status pill */}
          {outOfStock ? (
            <span className="inline-flex w-fit items-center rounded-full bg-celo-red-soft px-3 py-1 text-sm font-medium text-celo-red dark:bg-celo-red-bright-soft dark:text-celo-red-bright">
              Out of stock
            </span>
          ) : lowStock ? (
            <span className="inline-flex w-fit items-center rounded-full bg-celo-yellow-soft px-3 py-1 text-sm font-medium text-celo-dark">
              Only {product.stock} left
            </span>
          ) : (
            <span className="inline-flex w-fit items-center rounded-full bg-celo-forest-soft px-3 py-1 text-sm font-medium text-celo-forest dark:bg-celo-forest-bright-soft dark:text-celo-forest-bright">
              In stock
            </span>
          )}
        </div>

        {product.description ? (
          <p className="whitespace-pre-line text-base leading-relaxed text-celo-dark/75 dark:text-celo-light/75">
            {product.description}
          </p>
        ) : null}

        {/* Trust strip — buyer-protection reassurance, the core Etalo
            value prop, surfaced at the point of decision. */}
        <div className="flex flex-col gap-3 rounded-2xl border border-celo-dark/[6%] bg-celo-sand/25 p-4 dark:border-celo-light/[8%] dark:bg-celo-dark-elevated">
          <div className="flex items-start gap-3">
            <ShieldCheck
              weight="duotone"
              className="mt-0.5 h-5 w-5 shrink-0 text-celo-forest dark:text-celo-forest-bright"
              aria-hidden
            />
            <p className="text-sm text-celo-dark/75 dark:text-celo-light/75">
              <span className="font-medium text-celo-dark dark:text-celo-light">
                Buyer protection.
              </span>{" "}
              Funds are held in escrow and only released once you confirm
              delivery.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <Truck
              weight="duotone"
              className="mt-0.5 h-5 w-5 shrink-0 text-celo-forest dark:text-celo-forest-bright"
              aria-hidden
            />
            <p className="text-sm text-celo-dark/75 dark:text-celo-light/75">
              <span className="font-medium text-celo-dark dark:text-celo-light">
                Ships from {sellerCountry ?? "within your market"}.
              </span>{" "}
              Coordinated directly with {product.seller.shop_name}.
            </p>
          </div>
        </div>

        <ShareButtons url={url} title={product.title} />
      </main>

      {/* Sticky purchase bar — mobile-commerce standard. Price recap +
          primary CTA, safe-area aware so it clears the gesture nav. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-celo-dark/[8%] bg-celo-light/90 px-4 pt-3 backdrop-blur-lg [padding-bottom:calc(0.75rem+env(safe-area-inset-bottom))] dark:border-celo-light/[8%] dark:bg-celo-dark-bg/90">
        <div className="mx-auto flex max-w-2xl items-center gap-4">
          <div className="flex shrink-0 flex-col leading-tight">
            <span className="text-sm text-celo-dark/50 dark:text-celo-light/50">
              Price
            </span>
            <span className="font-display text-display-4 tabular-nums text-celo-dark dark:text-celo-light">
              {priceNumber}
              <span className="ml-1 text-sm font-medium text-celo-dark/45 dark:text-celo-light/45">
                USDT
              </span>
            </span>
          </div>
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
        </div>
      </div>
    </>
  );
}
