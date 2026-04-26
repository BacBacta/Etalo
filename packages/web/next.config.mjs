/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "gateway.pinata.cloud" },
      { protocol: "https", hostname: "*.mypinata.cloud" },
      { protocol: "https", hostname: "ipfs.io" },
    ],
  },
  async rewrites() {
    // Conditional: only rewrite /api/* to a local backend if explicitly
    // configured via LOCAL_API_REWRITE_TARGET. Used during ngrok dev
    // (frontend on ngrok URL, backend on localhost) to avoid CORS.
    // Production builds (Vercel) leave this empty — fetches use
    // NEXT_PUBLIC_API_URL directly.
    const localApiTarget = process.env.LOCAL_API_REWRITE_TARGET;
    if (!localApiTarget) return [];
    return [
      {
        source: "/api/:path*",
        destination: `${localApiTarget}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
