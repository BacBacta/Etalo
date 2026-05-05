"use client";

export type TemplateKey =
  | "ig_square"
  | "ig_story"
  | "wa_status"
  | "tiktok"
  | "fb_feed";

const TEMPLATES: Array<{
  key: TemplateKey;
  label: string;
  dimensions: string;
  vibe: string;
  bgClass: string;
}> = [
  // J10-V5 Phase 5 Angle B Track 2 fix #1 — light-mode bgClass tints
  // (amber-50, orange-50, green-50, neutral-50) collapsed into the
  // dark page background and made the cards invisible. Each entry
  // now declares a `dark:` variant that keeps the brand hint with a
  // sufficient-contrast tone against celo-dark-bg. TikTok already had
  // a dark-friendly base (neutral-900) so its dark variant just adds
  // border tone alignment.
  {
    key: "ig_square",
    label: "Instagram Square",
    dimensions: "1080×1080",
    vibe: "Feed posts",
    bgClass:
      "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-700/40 dark:text-celo-light",
  },
  {
    key: "ig_story",
    label: "Instagram Story",
    dimensions: "1080×1920",
    vibe: "Vertical, warm",
    bgClass:
      "bg-orange-50 border-orange-200 dark:bg-orange-950/30 dark:border-orange-700/40 dark:text-celo-light",
  },
  {
    key: "wa_status",
    label: "WhatsApp Status",
    dimensions: "1080×1920",
    vibe: "WhatsApp green",
    bgClass:
      "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-700/40 dark:text-celo-light",
  },
  {
    key: "tiktok",
    label: "TikTok Cover",
    dimensions: "1080×1920",
    vibe: "Dark trending",
    bgClass:
      "bg-neutral-900 text-amber-400 border-neutral-700 dark:bg-celo-dark-elevated dark:border-celo-light/[12%]",
  },
  {
    key: "fb_feed",
    label: "Facebook Feed",
    dimensions: "1200×630",
    vibe: "Horizontal",
    bgClass:
      "bg-neutral-50 border-neutral-200 dark:bg-celo-dark-elevated dark:border-celo-light/[12%] dark:text-celo-light",
  },
];

interface Props {
  selected: TemplateKey | null;
  onSelect: (template: TemplateKey) => void;
}

export function TemplateSelector({ selected, onSelect }: Props) {
  return (
    // J10-V5 Phase 5 Angle E sub-block E.2 — WCAG 1.3.1 Info and
    // Relationships (Level A). role="group" + aria-labelledby exposes
    // "Choose template" as the group's accessible name without
    // breaking the existing grid layout (fieldset/legend would).
    <div
      role="group"
      aria-labelledby="template-select-label"
      className="space-y-2"
    >
      <span
        id="template-select-label"
        className="block text-base font-medium"
      >
        Choose template
      </span>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {TEMPLATES.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onSelect(t.key)}
            data-testid={`template-card-${t.key}`}
            aria-pressed={selected === t.key}
            className={`min-h-[88px] rounded-lg border-2 p-4 text-left transition-all ${
              selected === t.key
                ? "border-neutral-900 ring-2 ring-neutral-900 ring-offset-2 dark:border-celo-light dark:ring-celo-light dark:ring-offset-celo-dark-bg"
                : "border-transparent hover:border-neutral-300 dark:hover:border-celo-light/30"
            } ${t.bgClass}`}
          >
            <div className="font-medium">{t.label}</div>
            <div className="mt-1 text-sm opacity-75">{t.dimensions}</div>
            <div className="mt-1 text-xs opacity-60">{t.vibe}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
