import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // shadcn legacy (HSL CSS vars from globals.css) — kept intact for
        // existing components/ui/* and legacy pages until V4 migration.
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // V5 design system — Celo earth-inspired palette extended with
        // first-class dark mode tokens (J10-V5 Block 2, voir ADR-040).
        // Namespaced under `celo-*` so it never collides with shadcn
        // legacy keys above. Light tokens consumed by V4 components in
        // packages/web/src/components/ui/v4/*; dark tokens reserved for
        // `dark:` Tailwind variants enabled Block 3+ via next-themes.
        // Convention `-bright` suffix = dark mode counterpart.
        celo: {
          // Light mode
          light: "#FCFBF7",
          "light-subtle": "#F7F5EC",
          forest: "#476520",
          "forest-dark": "#3A521A",
          "forest-soft": "rgba(71,101,32,0.08)",
          yellow: "#FBCC5C",
          "yellow-soft": "#FDE3A2",
          dark: "#2E3338",
          "dark-soft": "rgba(46,51,56,0.6)",
          sand: "#EFE7D6",
          red: "#A8362F",
          "red-soft": "rgba(168,54,47,0.08)",
          green: "#00C853",
          blue: "#1E88E5",
          // Dark mode
          "dark-bg": "#0F1115",
          "dark-elevated": "#1A1D23",
          "dark-surface": "#22262E",
          "forest-bright": "#5C8B2D",
          "red-bright": "#FF5247",
          "blue-bright": "#42A5F5",
        },
      },
      // V5 design system font — Switzer Variable (Indian Type Foundry,
      // Fontshare). Self-hosted woff2 in public/fonts/switzer/, loaded
      // via next/font/local in src/app/layout.tsx, exposed as CSS var.
      fontFamily: {
        display: ["var(--font-switzer)", "sans-serif"],
        sans: ["var(--font-switzer)", "system-ui", "sans-serif"],
        mono: ["var(--font-switzer)", "ui-monospace", "monospace"],
      },
      // V4 typography scale (DESIGN_V4_PREVIEW.md §Typography +
      // §Principes pages non-landing). `body-sm` 15px is reserved for
      // the landing-editorial surface only; non-landing surfaces use
      // `body` 16px per CLAUDE.md body-min rule.
      fontSize: {
        "display-1": ["52px", { letterSpacing: "-2.6px", lineHeight: "0.98", fontWeight: "400" }],
        "display-2": ["34px", { letterSpacing: "-1.5px", lineHeight: "1.05", fontWeight: "400" }],
        "display-3": ["28px", { letterSpacing: "-1.2px", lineHeight: "1.1", fontWeight: "400" }],
        "display-4": ["22px", { letterSpacing: "-0.8px", lineHeight: "1.2", fontWeight: "400" }],
        "body-lg": ["18px", { letterSpacing: "-0.18px", lineHeight: "1.55" }],
        body: ["16px", { letterSpacing: "-0.15px", lineHeight: "1.6" }],
        "body-sm": ["15px", { letterSpacing: "-0.15px", lineHeight: "1.6" }],
        label: ["14px", { letterSpacing: "0", lineHeight: "1.4", fontWeight: "500" }],
        caption: ["13px", { letterSpacing: "0.3px", lineHeight: "1.4" }],
        overline: ["11px", { letterSpacing: "0.8px", lineHeight: "1.3", fontWeight: "500" }],
      },
      // V4 spacing scale (4/8/12/16/24/32/48/64) is fully covered by
      // Tailwind defaults (p-1/p-2/p-3/p-4/p-6/p-8/p-12/p-16). No
      // override needed.
      borderRadius: {
        // shadcn legacy — DO NOT MODIFY (consumed by components/ui/*).
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        // V4 — pills (CTA, badges, status). 8/12/16/24px already
        // covered by rounded-lg/xl/2xl/3xl Tailwind defaults.
        pill: "100px",
      },
      boxShadow: {
        // V4 shadow tokens — DESIGN_V4_PREVIEW.md §Détails premium.
        "celo-sm": "0 1px 2px rgba(46,51,56,0.04)",
        "celo-md": "0 1px 2px rgba(46,51,56,0.04), 0 8px 32px rgba(46,51,56,0.06)",
        "celo-lg": "0 8px 32px rgba(46,51,56,0.12)",
        "celo-hero":
          "0 1px 2px rgba(46,51,56,0.04), 0 8px 32px rgba(46,51,56,0.06), 0 24px 64px rgba(46,51,56,0.08)",
      },
      keyframes: {
        // shadcn legacy Radix accordion — DO NOT MODIFY.
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        // V4 skeleton-screen pulse (1.5s, ease-in-out, infinite).
        "celo-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
      },
      animation: {
        // shadcn legacy Radix accordion — DO NOT MODIFY.
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        // V4 skeleton screens.
        "celo-pulse": "celo-pulse 1.5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
