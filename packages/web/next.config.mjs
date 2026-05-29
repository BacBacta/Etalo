import withBundleAnalyzer from "@next/bundle-analyzer";

// J10-V5 Block 6 — wrap conditional via env var. `npm run build` runs
// without the analyzer; `npm run analyze` sets ANALYZE=true via
// cross-env, which opens 3 HTML reports (client / edge / nodejs) in
// the browser at the end of the build.
const bundleAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Barrel packages whose named imports webpack would otherwise pull in
  // wholesale. @phosphor-icons/react is the big one — dozens of icons
  // imported across the app via `import { X } from "@phosphor-icons/react"`.
  // optimizePackageImports rewrites these to per-icon paths at build.
  experimental: {
    optimizePackageImports: ["@phosphor-icons/react"],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "gateway.pinata.cloud" },
      { protocol: "https", hostname: "*.mypinata.cloud" },
      { protocol: "https", hostname: "ipfs.io" },
    ],
    // IPFS content is immutable (content-addressed by CID), so an
    // optimized derivative never goes stale — cache it at the Vercel
    // edge for a year to maximize hit rate and avoid re-optimizing
    // (which would re-fetch the slow origin gateway).
    minimumCacheTTL: 31_536_000,
  },
  async rewrites() {
    // Production: /r/{code} forwards to the backend short-link redirector
    // so seller marketing captions can use the short, brand-consistent
    // `etalo.app/r/{code}` URL. Backend hosts the route at the root.
    const apiBase =
      process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/v1\/?$/, "") ??
      "https://etalo-api.fly.dev";
    const prodRewrites = [
      {
        source: "/r/:code",
        destination: `${apiBase}/r/:code`,
      },
    ];

    // Dev: also rewrite /api/* to a local backend if explicitly
    // configured via LOCAL_API_REWRITE_TARGET. Used during ngrok dev
    // (frontend on ngrok URL, backend on localhost) to avoid CORS.
    const localApiTarget = process.env.LOCAL_API_REWRITE_TARGET;
    if (!localApiTarget) return prodRewrites;
    return [
      ...prodRewrites,
      {
        source: "/api/:path*",
        destination: `${localApiTarget}/api/:path*`,
      },
    ];
  },
};

export default bundleAnalyzer(nextConfig);
