/**
 * Centralized fetch wrapper for the Etalo backend API.
 *
 * Responsibilities:
 *  - Resolves the base URL once, with a server-side fallback so SSR
 *    routes (sitemap, OG images, /[handle] page) work even when the
 *    public env is set to a relative path for ngrok dev mode.
 *  - Auto-injects `ngrok-skip-browser-warning` so the ngrok-free
 *    interstitial doesn't break API requests when the frontend is
 *    served via an ngrok HTTPS tunnel for MiniPay Developer Mode.
 *    The header is harmless outside ngrok (production / direct dev).
 *  - Lets callers pass paths without re-typing the API_URL prefix.
 *
 * Migration: existing libs used `${API_URL}${path}` with `path` like
 * `/products/...`. After refactor, callers pass just the path and the
 * wrapper handles concatenation.
 */

// Resolve the base URL. On the client, prefer the public env (which can
// be a relative `/api/v1` path so Next.js rewrites kick in for ngrok
// mode). On the server, we NEED an absolute URL — Node fetch can't do
// relative — so we promote NEXT_PUBLIC_API_URL only if it's already
// absolute, else fall back to INTERNAL_API_URL or localhost.
const API_URL: string = (() => {
  if (typeof window !== "undefined") {
    return process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";
  }
  const pub = process.env.NEXT_PUBLIC_API_URL;
  if (pub && pub.startsWith("http")) return pub;
  return (
    process.env.INTERNAL_API_URL ??
    "http://localhost:8000/api/v1"
  );
})();

function buildUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  const slashed = path.startsWith("/") ? path : `/${path}`;
  return `${API_URL}${slashed}`;
}

function withNgrokHeader(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers);
  if (!headers.has("ngrok-skip-browser-warning")) {
    headers.set("ngrok-skip-browser-warning", "any");
  }
  return { ...init, headers };
}

export async function fetchApi(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(buildUrl(path), withNgrokHeader(init));
}

// Variant for FormData uploads. Critical: do NOT set Content-Type
// manually — the browser injects `multipart/form-data; boundary=…`
// automatically when body is a FormData instance.
export async function fetchApiFormData(
  path: string,
  formData: FormData,
  init?: Omit<RequestInit, "body" | "method">,
): Promise<Response> {
  const merged = withNgrokHeader(init);
  return fetch(buildUrl(path), {
    ...merged,
    method: "POST",
    body: formData,
  });
}
