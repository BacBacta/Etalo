import { ImageResponse } from "next/og";

import { displayUsdt, fetchPublicProduct } from "@/lib/api";

export const runtime = "edge";
export const alt = "Etalo Product";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function normalize(raw: string): string {
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // ignore
  }
  return decoded.toLowerCase();
}

interface Params {
  params: { handle: string; slug: string };
}

export default async function ProductOgImage({ params }: Params) {
  const handle = normalize(params.handle).replace(/^@/, "");
  const slug = normalize(params.slug);
  const product = await fetchPublicProduct(handle, slug).catch(() => null);

  const title = product?.title ?? "Etalo Product";
  const price = product ? displayUsdt(product.price_usdt) : "";
  const shopName = product?.seller.shop_name ?? "Etalo";
  const displayHandle = product?.seller.shop_handle ?? handle;
  const productImage = product?.image_urls[0];
  // next/og requires single child per <div>; pre-build the shop line.
  const shopLine = `${shopName} · @${displayHandle}`;
  const tagline = "Your digital stall, open 24/7 · Etalo";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "row",
          background: "white",
          fontFamily: "sans-serif",
        }}
      >
        {/* Left: product image (or fallback gradient) */}
        <div
          style={{
            width: 560,
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: productImage
              ? "white"
              : "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)",
          }}
        >
          {productImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={productImage}
              width={560}
              height={630}
              alt=""
              style={{ width: 560, height: 630, objectFit: "cover" }}
            />
          ) : (
            <div style={{ fontSize: 96 }}>🛍️</div>
          )}
        </div>

        {/* Right: title + price + shop */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: 64,
          }}
        >
          <div
            style={{
              fontSize: 56,
              fontWeight: 700,
              color: "#171717",
              lineHeight: 1.1,
              maxWidth: 540,
            }}
          >
            {title}
          </div>
          {price ? (
            <div
              style={{
                fontSize: 64,
                fontWeight: 700,
                color: "#171717",
                marginTop: 32,
              }}
            >
              {price}
            </div>
          ) : null}
          <div
            style={{
              fontSize: 28,
              color: "#525252",
              marginTop: 48,
            }}
          >
            {shopLine}
          </div>
          <div
            style={{
              fontSize: 24,
              color: "#737373",
              marginTop: 16,
            }}
          >
            {tagline}
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
