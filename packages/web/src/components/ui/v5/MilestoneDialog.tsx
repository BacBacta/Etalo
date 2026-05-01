/**
 * MilestoneDialogV5 — celebratory dialog overlay for seller milestones
 * (J10-V5 Phase 4 Block 6 sub-block 6.1).
 *
 * Pattern : thin specialization of DialogV4 (Phase 2 Block 6 — Radix +
 * motion-tuned spring + dark-mode aware) wrapping a staged success
 * illustration + display title + body description + single primary
 * CTA. The confetti library (lib/confetti/milestones.ts, Phase 2
 * Block 7) keeps firing the particle burst at the same trigger ; the
 * dialog opens visually on top, two complementary celebrations.
 *
 * Two variants supported V1 :
 *   - "first-sale" — wired via OrdersTab in sub-block 6.3 (V1 LIVE)
 *   - "withdrawal-complete" — accepted as a forward-compat variant
 *     so V2 (when the stake/withdrawal flow returns per ADR-041
 *     deferral) only needs to wire the trigger, not refactor the
 *     component. The asset is staged Phase 3 Block 6.
 *
 * No new lib component (DialogV5) extracted — DialogV4 covers every
 * need here. Mike's "promote-on-3rd-consumer" pattern (sub-blocks
 * 5.6 IPFS gateway + 5.4 displayUsdtNumber) defers extraction until
 * a 3rd V5-styled dialog surfaces in Phase 5 polish.
 */
"use client";

import {
  DialogV4,
  DialogV4Content,
  DialogV4Description,
  DialogV4Footer,
  DialogV4Header,
  DialogV4Title,
} from "@/components/ui/v4/Dialog";
import { ButtonV4 } from "@/components/ui/v4/Button";

export type MilestoneVariant = "first-sale" | "withdrawal-complete";

interface IllustrationConfig {
  src: string;
  alt: string;
}

const ILLUSTRATIONS: Record<MilestoneVariant, IllustrationConfig> = {
  "first-sale": {
    src: "/illustrations/v5/success-first-sale.svg",
    alt: "Celebration illustration for the seller's first completed sale",
  },
  "withdrawal-complete": {
    src: "/illustrations/v5/success-withdrawal-complete.svg",
    alt: "Celebration illustration for a completed seller withdrawal",
  },
};

export interface MilestoneDialogV5Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant: MilestoneVariant;
  title: string;
  description: string;
  ctaLabel: string;
  /** Fired BEFORE the dialog closes — the component itself takes care
   * of the onOpenChange(false) flip. Caller can use this to mark the
   * milestone as shown (e.g. via useMilestoneOnce in sub-block 6.2). */
  onCtaClick?: () => void;
}

export function MilestoneDialogV5({
  open,
  onOpenChange,
  variant,
  title,
  description,
  ctaLabel,
  onCtaClick,
}: MilestoneDialogV5Props) {
  const illustration = ILLUSTRATIONS[variant];

  const handleCtaClick = () => {
    onCtaClick?.();
    onOpenChange(false);
  };

  return (
    <DialogV4 open={open} onOpenChange={onOpenChange}>
      <DialogV4Content
        data-testid="milestone-dialog"
        data-variant={variant}
      >
        <DialogV4Header>
          {/*
            Illustration sized to ~280 px max so it fits inside the
            DialogV4Content `max-w-[480px]` on every viewport from
            360 px up. Plain <img> over next/image because vector,
            no resizing variants needed (same rationale as
            OnboardingScreenV5 / HomeLanding hero).
          */}
          <div className="mb-2 flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={illustration.src}
              alt={illustration.alt}
              loading="lazy"
              data-testid="milestone-dialog-illustration"
              className="block h-auto w-full max-w-[280px]"
            />
          </div>
          <DialogV4Title className="text-center font-display text-display-3">
            {title}
          </DialogV4Title>
          <DialogV4Description className="text-center font-sans text-body opacity-70">
            {description}
          </DialogV4Description>
        </DialogV4Header>
        <DialogV4Footer className="justify-center">
          <ButtonV4
            type="button"
            variant="primary"
            size="lg"
            onClick={handleCtaClick}
            data-testid="milestone-dialog-cta"
            className="w-full"
          >
            {ctaLabel}
          </ButtonV4>
        </DialogV4Footer>
      </DialogV4Content>
    </DialogV4>
  );
}

export { ILLUSTRATIONS as MILESTONE_ILLUSTRATIONS };
