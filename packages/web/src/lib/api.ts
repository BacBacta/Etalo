export interface ProductPublic {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  price_usdt: string;
  stock: number;
  status: string;
  image_urls: string[];
  seller: {
    shop_handle: string;
    shop_name: string;
    logo_url: string | null;
    country: string | null;
  };
}

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

export async function fetchPublicProduct(
  handle: string,
  slug: string,
): Promise<ProductPublic | null> {
  const res = await fetch(
    `${API_URL}/products/public/${encodeURIComponent(handle)}/${encodeURIComponent(slug)}`,
    // Let Next.js cache the response for 60s so hot products don't
    // hammer the API when a link goes viral.
    { next: { revalidate: 60 } },
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`API ${res.status}`);
  }
  return (await res.json()) as ProductPublic;
}

export function displayUsdt(decimalString: string): string {
  const n = Number(decimalString);
  if (Number.isNaN(n)) return `${decimalString} USDT`;
  return `${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} USDT`;
}
