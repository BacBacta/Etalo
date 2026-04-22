import { z } from "zod";

import { parseUsdt } from "@/lib/usdt";

/**
 * Single Zod schema that covers all 3 onboarding steps. Each step only
 * validates a subset of these fields via `trigger([...])` in the form
 * handler — see pages/Onboarding.tsx.
 */
export const COUNTRIES = ["NG", "GH", "KE", "OTHER"] as const;
export const LANGUAGES = ["en", "fr", "sw"] as const;

export const OnboardingSchema = z.object({
  // Step 1 has no fields; it is the discovery carousel.

  // Step 2 — create the shop.
  shop_handle: z
    .string()
    .regex(
      /^[a-z0-9_]{3,30}$/,
      "Handle must be 3-30 characters, lowercase letters, numbers, or underscore.",
    ),
  shop_name: z.string().min(1).max(100),
  country: z.enum(COUNTRIES),
  language: z.enum(LANGUAGES).default("en"),
  logo_ipfs_hash: z.string().min(1, "Logo is required."),

  // Step 3 — the first product.
  product_title: z.string().min(3).max(200),
  product_description: z.string().max(500).optional().default(""),
  product_price_usdt: z
    .string()
    .min(1, "Price is required.")
    .refine((v) => {
      try {
        return parseUsdt(v) > 0n;
      } catch {
        return false;
      }
    }, "Enter a positive number."),
  product_stock: z.coerce.number().int().min(1).max(10_000),
  product_photos: z
    .array(z.string())
    .min(1, "Add at least one photo.")
    .max(5, "Up to 5 photos."),
});

export type OnboardingForm = z.infer<typeof OnboardingSchema>;

export const STEP_FIELDS = {
  1: [] as const,
  2: [
    "shop_handle",
    "shop_name",
    "country",
    "language",
    "logo_ipfs_hash",
  ] as const satisfies readonly (keyof OnboardingForm)[],
  3: [
    "product_title",
    "product_description",
    "product_price_usdt",
    "product_stock",
    "product_photos",
  ] as const satisfies readonly (keyof OnboardingForm)[],
} as const;

export const DEFAULT_VALUES: Partial<OnboardingForm> = {
  shop_handle: "",
  shop_name: "",
  country: "NG",
  language: "en",
  logo_ipfs_hash: "",
  product_title: "",
  product_description: "",
  product_price_usdt: "",
  product_stock: 1,
  product_photos: [],
};
