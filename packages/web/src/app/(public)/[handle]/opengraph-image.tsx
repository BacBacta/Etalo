import { ImageResponse } from "next/og";

import { fetchPublicBoutique } from "@/lib/api";
import { countryName } from "@/lib/country";

// next/og runs on the edge runtime by default — kept explicit so the
// constraint is visible to readers who add fetches later.
export const runtime = "edge";
export const alt = "Etalo Boutique";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function normalize(raw: string): string {
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // Fallback to raw on malformed input.
  }
  return decoded.toLowerCase().replace(/^@/, "");
}

interface Params {
  params: { handle: string };
}

export default async function BoutiqueOgImage({ params }: Params) {
  const handle = normalize(params.handle);
  const data = await fetchPublicBoutique(handle).catch(() => null);

  const shopName = data?.seller.shop_name ?? "Etalo Shop";
  const displayHandle = data?.seller.shop_handle ?? handle;
  const country = countryName(data?.seller.country ?? null);
  const logoUrl = data?.seller.logo_url ?? undefined;
  // next/og requires single child per <div>; pre-build strings.
  const subtitle = country ? `@${displayHandle} · ${country}` : `@${displayHandle}`;
  const tagline = "Your digital stall, open 24/7 · Etalo";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)",
          fontFamily: "sans-serif",
          padding: 80,
        }}
      >
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            width={160}
            height={160}
            alt=""
            style={{
              borderRadius: "50%",
              marginBottom: 32,
              objectFit: "cover",
            }}
          />
        ) : null}
        <div
          style={{
            fontSize: 72,
            fontWeight: 700,
            color: "#171717",
            textAlign: "center",
          }}
        >
          {shopName}
        </div>
        <div
          style={{
            fontSize: 36,
            color: "#525252",
            marginTop: 16,
          }}
        >
          {subtitle}
        </div>
        <div
          style={{
            fontSize: 28,
            color: "#737373",
            marginTop: 48,
            padding: "12px 32px",
            background: "white",
            borderRadius: 999,
          }}
        >
          {tagline}
        </div>
      </div>
    ),
    { ...size },
  );
}
