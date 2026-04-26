import type { MetadataRoute } from "next";

import { fetchApi } from "@/lib/fetch-api";

interface SitemapData {
  sellers: { handle: string; updated_at: string }[];
  products: { handle: string; slug: string; updated_at: string }[];
}

// 1h aligned with backend Cache-Control: max-age=3600
export const revalidate = 3600;

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://etalo.app";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let data: SitemapData = { sellers: [], products: [] };
  try {
    const res = await fetchApi("/sitemap/data", {
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      data = (await res.json()) as SitemapData;
    }
  } catch {
    // Backend down or unreachable: fall back to a landing-only sitemap
    // rather than a 500. Real outages will be caught by monitoring; SEO
    // continues to function on the next ISR refresh.
  }

  const root: MetadataRoute.Sitemap[number] = {
    url: BASE_URL,
    lastModified: new Date(),
    changeFrequency: "daily",
    priority: 1.0,
  };

  const sellers = data.sellers.map((s) => ({
    url: `${BASE_URL}/${s.handle}`,
    lastModified: new Date(s.updated_at),
    changeFrequency: "daily" as const,
    priority: 0.8,
  }));

  const products = data.products.map((p) => ({
    url: `${BASE_URL}/${p.handle}/${p.slug}`,
    lastModified: new Date(p.updated_at),
    changeFrequency: "daily" as const,
    priority: 0.6,
  }));

  return [root, ...sellers, ...products];
}
