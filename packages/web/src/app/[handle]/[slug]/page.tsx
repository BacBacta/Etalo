import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";

import { BuyButton } from "@/components/BuyButton";
import { ShareButtons } from "@/components/ShareButtons";
import { displayUsdt, fetchPublicProduct } from "@/lib/api";

interface PageProps {
  params: { handle: string; slug: string };
}

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const product = await fetchPublicProduct(params.handle, params.slug);
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
  const product = await fetchPublicProduct(params.handle, params.slug);
  if (!product) notFound();

  const url = `${BASE_URL}/${product.seller.shop_handle}/${product.slug}`;
  const outOfStock = product.stock <= 0 || product.status !== "active";

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex items-center gap-3">
        {product.seller.logo_url ? (
          <Image
            src={product.seller.logo_url}
            alt=""
            width={40}
            height={40}
            unoptimized
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          <div className="h-10 w-10 rounded-full bg-neutral-200" />
        )}
        <div className="flex flex-col">
          <span className="text-sm font-semibold">
            {product.seller.shop_name}
          </span>
          <span className="text-xs text-neutral-500">
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
            unoptimized
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

      <BuyButton productId={product.id} disabled={outOfStock} />

      <ShareButtons url={url} title={product.title} />
    </main>
  );
}
