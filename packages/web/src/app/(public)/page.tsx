import { HomeRouter } from "@/components/HomeRouter";
import { fetchFeaturedSellers, type FeaturedSeller } from "@/lib/api";

// 5-min ISR keeps the public landing fresh without hammering the
// marketplace endpoint on every visitor.
export const revalidate = 300;

export default async function HomePage() {
  let featured: FeaturedSeller[] = [];
  try {
    featured = await fetchFeaturedSellers(6);
  } catch {
    // Silent fallback — landing renders without featured if the
    // backend is unreachable. Real outages will be caught by
    // monitoring; SEO continues to work on the next ISR refresh.
  }

  return <HomeRouter featuredSellers={featured} />;
}
