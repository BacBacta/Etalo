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
  {
    key: "ig_square",
    label: "Instagram Square",
    dimensions: "1080×1080",
    vibe: "Feed posts",
    bgClass: "bg-amber-50 border-amber-200",
  },
  {
    key: "ig_story",
    label: "Instagram Story",
    dimensions: "1080×1920",
    vibe: "Vertical, warm",
    bgClass: "bg-orange-50 border-orange-200",
  },
  {
    key: "wa_status",
    label: "WhatsApp Status",
    dimensions: "1080×1920",
    vibe: "WhatsApp green",
    bgClass: "bg-green-50 border-green-200",
  },
  {
    key: "tiktok",
    label: "TikTok Cover",
    dimensions: "1080×1920",
    vibe: "Dark trending",
    bgClass: "bg-neutral-900 text-amber-400 border-neutral-700",
  },
  {
    key: "fb_feed",
    label: "Facebook Feed",
    dimensions: "1200×630",
    vibe: "Horizontal",
    bgClass: "bg-neutral-50 border-neutral-200",
  },
];

interface Props {
  selected: TemplateKey | null;
  onSelect: (template: TemplateKey) => void;
}

export function TemplateSelector({ selected, onSelect }: Props) {
  return (
    <div className="space-y-2">
      <label className="block text-base font-medium">Choose template</label>
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
                ? "border-neutral-900 ring-2 ring-neutral-900 ring-offset-2"
                : "border-transparent hover:border-neutral-300"
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
