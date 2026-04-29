"use client";

/**
 * Storybook-light V4 component reference (J9 Block 4).
 *
 * Visual demo page that lists every V4 atom with its variants and states.
 * Env-var gated (`NEXT_PUBLIC_DEV_ROUTES=true`); returns 404 otherwise so
 * the route never leaks in non-dev builds.
 *
 * Run locally:
 *   NEXT_PUBLIC_DEV_ROUTES=true npm run dev
 *   http://localhost:3000/dev/components
 *
 * Companion: docs/DESIGN_V4_PREVIEW.md (palette, typography, principles).
 */

import { notFound } from "next/navigation";
import { useState, type ReactNode } from "react";

import { BadgeV4 } from "@/components/ui/v4/Badge";
import { ButtonV4 } from "@/components/ui/v4/Button";
import {
  CardContentV4,
  CardDescriptionV4,
  CardFooterV4,
  CardHeaderV4,
  CardTitleV4,
  CardV4,
} from "@/components/ui/v4/Card";
import {
  DialogV4,
  DialogV4Close,
  DialogV4Content,
  DialogV4Description,
  DialogV4Footer,
  DialogV4Header,
  DialogV4Title,
  DialogV4Trigger,
} from "@/components/ui/v4/Dialog";
import {
  HelperTextV4,
  InputV4,
  LabelV4,
} from "@/components/ui/v4/Input";
import {
  SheetV4,
  SheetV4Content,
  SheetV4Description,
  SheetV4Header,
  SheetV4Title,
  SheetV4Trigger,
} from "@/components/ui/v4/Sheet";
import {
  TabsV4Content,
  TabsV4List,
  TabsV4Root,
  TabsV4Trigger,
} from "@/components/ui/v4/Tabs";
import { toastV4 } from "@/components/ui/v4/Toast";
import { AnimatedNumber } from "@/components/ui/v4/AnimatedNumber";
import { ChartLineV5 } from "@/components/ui/v5/ChartLineV5";
import { SkeletonV5 } from "@/components/ui/v5/Skeleton";
import { SparklineV5 } from "@/components/ui/v5/SparklineV5";
import { fireMilestone } from "@/lib/confetti/milestones";

const sections = [
  { id: "button", label: "Button" },
  { id: "input", label: "Input" },
  { id: "card", label: "Card" },
  { id: "dialog", label: "Dialog" },
  { id: "sheet", label: "Sheet" },
  { id: "tabs", label: "Tabs" },
  { id: "badge", label: "Badge" },
  { id: "toast", label: "Toast" },
  { id: "confetti", label: "Confetti" },
  { id: "animated-number", label: "AnimatedNumber" },
  { id: "skeleton-v5", label: "Skeleton (V5)" },
  { id: "chart-v5", label: "Chart (V5)" },
];

export default function DevComponentsPage() {
  if (process.env.NEXT_PUBLIC_DEV_ROUTES !== "true") {
    notFound();
  }

  return (
    <div className="bg-celo-light min-h-screen">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <header className="mb-12">
          <h1 className="font-display text-display-1 text-celo-dark">
            Etalo Design System V4
          </h1>
          <p className="mt-4 font-sans text-body opacity-60">
            Component reference · v4.0 (J9 Block 4)
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-12">
          <nav className="hidden md:block sticky top-12 self-start">
            <p className="text-overline text-celo-dark/60 mb-3">Components</p>
            <ul className="flex flex-col gap-1">
              {sections.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="block px-3 py-1.5 font-sans text-body-sm text-celo-dark/60 hover:text-celo-forest transition-colors duration-200"
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <main>
            <ButtonSection />
            <Separator />
            <InputSection />
            <Separator />
            <CardSection />
            <Separator />
            <DialogSection />
            <Separator />
            <SheetSection />
            <Separator />
            <TabsSection />
            <Separator />
            <BadgeSection />
            <Separator />
            <ToastSection />
            <Separator />
            <ConfettiSection />
            <Separator />
            <AnimatedNumberSection />
            <Separator />
            <SkeletonV5Section />
            <Separator />
            <ChartV5Section />
          </main>
        </div>

        <footer className="mt-24 pt-8 border-t border-celo-dark/[8%]">
          <p className="font-sans text-caption opacity-60">
            Generated J10-V5 Phase 3 Block 4 — see{" "}
            <code className="font-mono">docs/SPRINT_J10_V5.md</code>
          </p>
        </footer>
      </div>
    </div>
  );
}

// ============================================================
// Section helpers
// ============================================================

const Separator = () => (
  <div className="border-t border-celo-dark/[8%] my-12" aria-hidden="true" />
);

function Section({
  id,
  title,
  importPath,
  children,
}: {
  id: string;
  title: string;
  importPath: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-12">
      <h2 className="font-display text-display-3 text-celo-dark mb-2">
        {title}
      </h2>
      <p className="font-mono text-caption opacity-60 mb-6">
        import from &quot;{importPath}&quot;
      </p>
      <div className="space-y-6">{children}</div>
    </section>
  );
}

function ShowcaseRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <p className="text-overline text-celo-dark/60">{label}</p>
      <div className="flex flex-wrap items-start gap-3">{children}</div>
    </div>
  );
}

// ============================================================
// Component sections
// ============================================================

function ButtonSection() {
  return (
    <Section
      id="button"
      title="Button"
      importPath="@/components/ui/v4/Button"
    >
      <ShowcaseRow label="Variants">
        <ButtonV4 variant="primary">Primary</ButtonV4>
        <ButtonV4 variant="secondary">Secondary</ButtonV4>
        <ButtonV4 variant="ghost">Ghost</ButtonV4>
        <ButtonV4 variant="outline">Outline</ButtonV4>
      </ShowcaseRow>
      <ShowcaseRow label="Sizes">
        <ButtonV4 size="sm">Small</ButtonV4>
        <ButtonV4 size="md">Medium (default)</ButtonV4>
        <ButtonV4 size="lg">Large</ButtonV4>
      </ShowcaseRow>
      <ShowcaseRow label="States">
        <ButtonV4>Default</ButtonV4>
        <ButtonV4 disabled>Disabled</ButtonV4>
        <ButtonV4 loading>Loading</ButtonV4>
      </ShowcaseRow>
      <ShowcaseRow label="Rounded variants">
        <ButtonV4 rounded="pill">Pill (default)</ButtonV4>
        <ButtonV4 rounded="2xl">Rounded 2xl</ButtonV4>
      </ShowcaseRow>
    </Section>
  );
}

function InputSection() {
  return (
    <Section
      id="input"
      title="Input"
      importPath="@/components/ui/v4/Input"
    >
      <ShowcaseRow label="Default with Label and HelperText">
        <div className="w-full max-w-sm">
          <LabelV4 htmlFor="demo-email">Email</LabelV4>
          <InputV4
            id="demo-email"
            type="email"
            placeholder="you@example.com"
          />
          <HelperTextV4>We&apos;ll never share your email.</HelperTextV4>
        </div>
      </ShowcaseRow>
      <ShowcaseRow label="Error state">
        <div className="w-full max-w-sm">
          <LabelV4 htmlFor="demo-email-err">Email</LabelV4>
          <InputV4
            id="demo-email-err"
            type="email"
            defaultValue="not-an-email"
            error
          />
          <HelperTextV4 error>Invalid email format.</HelperTextV4>
        </div>
      </ShowcaseRow>
      <ShowcaseRow label="Disabled">
        <div className="w-full max-w-sm">
          <InputV4 disabled placeholder="Disabled input" />
        </div>
      </ShowcaseRow>
    </Section>
  );
}

function CardSection() {
  return (
    <Section
      id="card"
      title="Card"
      importPath="@/components/ui/v4/Card"
    >
      <ShowcaseRow label="Variants">
        <CardV4 className="w-full max-w-xs">
          <CardHeaderV4>
            <CardTitleV4>Default</CardTitleV4>
            <CardDescriptionV4>shadow-celo-md</CardDescriptionV4>
          </CardHeaderV4>
          <CardContentV4>Body content here.</CardContentV4>
        </CardV4>
        <CardV4 variant="elevated" className="w-full max-w-xs">
          <CardHeaderV4>
            <CardTitleV4>Elevated</CardTitleV4>
            <CardDescriptionV4>shadow-celo-lg</CardDescriptionV4>
          </CardHeaderV4>
          <CardContentV4>Body content here.</CardContentV4>
        </CardV4>
        <CardV4 variant="hero" className="w-full max-w-xs">
          <CardHeaderV4>
            <CardTitleV4>Hero</CardTitleV4>
            <CardDescriptionV4>shadow-celo-hero</CardDescriptionV4>
          </CardHeaderV4>
          <CardContentV4>Landing-style depth.</CardContentV4>
        </CardV4>
        <CardV4 variant="dark" className="w-full max-w-xs">
          <CardHeaderV4>
            <CardTitleV4>Dark</CardTitleV4>
            <CardDescriptionV4>Inverted contrast</CardDescriptionV4>
          </CardHeaderV4>
          <CardContentV4>opacity-60 inheritance keeps the description readable.</CardContentV4>
        </CardV4>
      </ShowcaseRow>
      <ShowcaseRow label="Interactive (hover)">
        <CardV4 interactive className="w-full max-w-sm">
          <CardHeaderV4>
            <CardTitleV4>Hover me</CardTitleV4>
            <CardDescriptionV4>cursor-pointer + lift on hover</CardDescriptionV4>
          </CardHeaderV4>
          <CardContentV4>Use for clickable cards in a marketplace grid.</CardContentV4>
        </CardV4>
      </ShowcaseRow>
      <ShowcaseRow label="With Footer (status row)">
        <CardV4 className="w-full max-w-sm">
          <CardHeaderV4>
            <CardTitleV4>Order #042</CardTitleV4>
            <CardDescriptionV4>Held safely in escrow</CardDescriptionV4>
          </CardHeaderV4>
          <CardContentV4>Amount: 45.00 USDT</CardContentV4>
          <CardFooterV4>
            <span className="font-sans text-caption opacity-60">Status</span>
            <BadgeV4 variant="forest" dot>
              Active
            </BadgeV4>
          </CardFooterV4>
        </CardV4>
      </ShowcaseRow>
    </Section>
  );
}

function DialogSection() {
  return (
    <Section
      id="dialog"
      title="Dialog"
      importPath="@/components/ui/v4/Dialog"
    >
      <ShowcaseRow label="With dark hero header + footer actions">
        <DialogV4>
          <DialogV4Trigger asChild>
            <ButtonV4>Open dialog</ButtonV4>
          </DialogV4Trigger>
          <DialogV4Content>
            <DialogV4Header dark>
              <DialogV4Title>Confirm purchase</DialogV4Title>
              <DialogV4Description>
                You will be charged 1.5 USDT for 10 credits.
              </DialogV4Description>
            </DialogV4Header>
            <p className="font-sans text-body">
              After confirmation, the transaction is submitted to Celo Sepolia
              and credits are added to your balance once the indexer mirrors
              the on-chain event.
            </p>
            <DialogV4Footer>
              <DialogV4Close asChild>
                <ButtonV4 variant="ghost">Cancel</ButtonV4>
              </DialogV4Close>
              <ButtonV4>Confirm</ButtonV4>
            </DialogV4Footer>
          </DialogV4Content>
        </DialogV4>
      </ShowcaseRow>
    </Section>
  );
}

function SheetSection() {
  const sides = ["right", "left", "top", "bottom"] as const;
  return (
    <Section
      id="sheet"
      title="Sheet"
      importPath="@/components/ui/v4/Sheet"
    >
      <ShowcaseRow label="Side variants">
        {sides.map((side) => (
          <SheetV4 key={side}>
            <SheetV4Trigger asChild>
              <ButtonV4 variant="outline">From {side}</ButtonV4>
            </SheetV4Trigger>
            <SheetV4Content side={side}>
              <SheetV4Header>
                <SheetV4Title>Sheet ({side})</SheetV4Title>
                <SheetV4Description>
                  Slides in from the {side} edge of the viewport.
                </SheetV4Description>
              </SheetV4Header>
              <p className="font-sans text-body mt-4">
                Use sheets for side panels (cart drawer, filters, mobile nav).
              </p>
            </SheetV4Content>
          </SheetV4>
        ))}
      </ShowcaseRow>
    </Section>
  );
}

function TabsSection() {
  return (
    <Section
      id="tabs"
      title="Tabs"
      importPath="@/components/ui/v4/Tabs"
    >
      <TabsV4Root defaultValue="orders" className="w-full max-w-2xl">
        <TabsV4List>
          <TabsV4Trigger value="orders">Orders</TabsV4Trigger>
          <TabsV4Trigger value="products">Products</TabsV4Trigger>
          <TabsV4Trigger value="marketing">Marketing</TabsV4Trigger>
        </TabsV4List>
        <TabsV4Content value="orders">
          <p className="font-sans text-body">
            Orders panel — list of recent orders with status badges.
          </p>
        </TabsV4Content>
        <TabsV4Content value="products">
          <p className="font-sans text-body">
            Products panel — grid of products with quick edit actions.
          </p>
        </TabsV4Content>
        <TabsV4Content value="marketing">
          <p className="font-sans text-body">
            Marketing panel — credits balance, image generator, captions.
          </p>
        </TabsV4Content>
      </TabsV4Root>
    </Section>
  );
}

function BadgeSection() {
  return (
    <Section
      id="badge"
      title="Badge"
      importPath="@/components/ui/v4/Badge"
    >
      <ShowcaseRow label="Variants">
        <BadgeV4>Default</BadgeV4>
        <BadgeV4 variant="forest">Forest</BadgeV4>
        <BadgeV4 variant="yellow">Yellow</BadgeV4>
        <BadgeV4 variant="red">Red</BadgeV4>
      </ShowcaseRow>
      <ShowcaseRow label="With dot">
        <BadgeV4 dot>Default</BadgeV4>
        <BadgeV4 variant="forest" dot>
          Active
        </BadgeV4>
        <BadgeV4 variant="yellow" dot>
          Pending
        </BadgeV4>
        <BadgeV4 variant="red" dot>
          Failed
        </BadgeV4>
      </ShowcaseRow>
      <ShowcaseRow label="With dot + pulse (live indicators)">
        <BadgeV4 variant="forest" dot pulse>
          Live
        </BadgeV4>
        <BadgeV4 variant="red" dot pulse>
          Disputed
        </BadgeV4>
      </ShowcaseRow>
    </Section>
  );
}

function ToastSection() {
  return (
    <Section
      id="toast"
      title="Toast"
      importPath="@/components/ui/v4/Toast"
    >
      <p className="font-sans text-body-sm opacity-60">
        Click to fire a toast. <code>ToasterV4</code> is mounted in the root
        layout so toasts render at <code>position=&quot;bottom-center&quot;</code>.
      </p>
      <ShowcaseRow label="Types">
        <ButtonV4
          variant="ghost"
          onClick={() =>
            toastV4.success("Order confirmed", {
              description: "Your shop is now live on Celo Sepolia.",
            })
          }
        >
          Success
        </ButtonV4>
        <ButtonV4
          variant="ghost"
          onClick={() =>
            toastV4.error("Transaction failed", {
              description: "Insufficient USDT balance.",
            })
          }
        >
          Error
        </ButtonV4>
        <ButtonV4
          variant="ghost"
          onClick={() =>
            toastV4.warning("Stake low", {
              description: "Top up before your next cross-border sale.",
            })
          }
        >
          Warning
        </ButtonV4>
        <ButtonV4
          variant="ghost"
          onClick={() =>
            toastV4.info("Network fee", {
              description: "About 0.001 CELO will apply to this transaction.",
            })
          }
        >
          Info
        </ButtonV4>
        <ButtonV4
          variant="ghost"
          onClick={() => toastV4.loading("Confirming on-chain...")}
        >
          Loading
        </ButtonV4>
      </ShowcaseRow>
    </Section>
  );
}

function ConfettiSection() {
  return (
    <Section
      id="confetti"
      title="Confetti"
      importPath="@/lib/confetti/milestones"
    >
      <p className="font-sans text-body-sm opacity-60">
        Click to fire a milestone burst. Palette colors mirror V5 tokens
        (forest, forest-bright, yellow, light, green) exactly. Bursts
        respect <code>prefers-reduced-motion</code> — toggle in OS
        settings to verify the noop path.
      </p>
      <ShowcaseRow label="Milestones">
        <ButtonV4
          variant="ghost"
          onClick={() => fireMilestone("first-sale")}
        >
          First sale
        </ButtonV4>
        <ButtonV4
          variant="ghost"
          onClick={() => fireMilestone("withdrawal-complete")}
        >
          Withdrawal complete
        </ButtonV4>
        <ButtonV4
          variant="ghost"
          onClick={() => fireMilestone("credit-purchase")}
        >
          Credit purchase
        </ButtonV4>
        <ButtonV4
          variant="ghost"
          onClick={() => fireMilestone("image-generated")}
        >
          Image generated
        </ButtonV4>
        <ButtonV4
          variant="ghost"
          onClick={() => fireMilestone("onboarding-complete")}
        >
          Onboarding complete
        </ButtonV4>
      </ShowcaseRow>
    </Section>
  );
}

function AnimatedNumberSection() {
  const [credits, setCredits] = useState(10);
  const [usdt, setUsdt] = useState(0);
  return (
    <Section
      id="animated-number"
      title="AnimatedNumber"
      importPath="@/components/ui/v4/AnimatedNumber"
    >
      <p className="font-sans text-body-sm opacity-60">
        Counter that tweens between values on prop change. Tabular nums
        inline keep digit width fixed during the tween (no layout
        shift). Respects <code>prefers-reduced-motion</code>.
      </p>
      <ShowcaseRow label="Credits (integer)">
        <span
          className="font-display text-display-3"
          data-testid="dev-credits"
        >
          <AnimatedNumber value={credits} decimals={0} suffix=" credits" />
        </span>
        <ButtonV4 variant="ghost" onClick={() => setCredits((c) => c + 1)}>
          +1
        </ButtonV4>
        <ButtonV4 variant="ghost" onClick={() => setCredits((c) => c + 10)}>
          +10
        </ButtonV4>
        <ButtonV4 variant="ghost" onClick={() => setCredits(10)}>
          Reset
        </ButtonV4>
      </ShowcaseRow>
      <ShowcaseRow label="USDT (2 decimals)">
        <span
          className="font-display text-display-3"
          data-testid="dev-usdt"
        >
          <AnimatedNumber value={usdt} decimals={2} suffix=" USDT" />
        </span>
        <ButtonV4 variant="ghost" onClick={() => setUsdt((v) => v + 1.5)}>
          +1.50
        </ButtonV4>
        <ButtonV4 variant="ghost" onClick={() => setUsdt((v) => v + 12.34)}>
          +12.34
        </ButtonV4>
        <ButtonV4 variant="ghost" onClick={() => setUsdt(0)}>
          Reset
        </ButtonV4>
      </ShowcaseRow>
    </Section>
  );
}

function SkeletonV5Section() {
  return (
    <Section
      id="skeleton-v5"
      title="Skeleton (V5)"
      importPath="@/components/ui/v5/Skeleton"
    >
      <ShowcaseRow label="text — single line">
        <div className="w-full max-w-sm">
          <SkeletonV5 variant="text" />
        </div>
      </ShowcaseRow>
      <ShowcaseRow label="text-multi — 3 stacked rows">
        <div className="w-full max-w-sm">
          <SkeletonV5 variant="text-multi" />
        </div>
      </ShowcaseRow>
      <ShowcaseRow label="circle — sizes 32 / 48 / 64">
        <SkeletonV5 variant="circle" size={32} />
        <SkeletonV5 variant="circle" size={48} />
        <SkeletonV5 variant="circle" size={64} />
      </ShowcaseRow>
      <ShowcaseRow label="rectangle — image / banner placeholder">
        <SkeletonV5
          variant="rectangle"
          className="aspect-square w-full max-w-xs"
        />
      </ShowcaseRow>
      <ShowcaseRow label="card — full block">
        <div className="w-full max-w-xs">
          <SkeletonV5 variant="card" />
        </div>
      </ShowcaseRow>
      <ShowcaseRow label="row — list-item placeholder ×3">
        <div className="w-full max-w-sm flex flex-col gap-3">
          <SkeletonV5 variant="row" />
          <SkeletonV5 variant="row" />
          <SkeletonV5 variant="row" />
        </div>
      </ShowcaseRow>
    </Section>
  );
}

const REVENUE_7D = [
  { label: "Mon", value: 120 },
  { label: "Tue", value: 145 },
  { label: "Wed", value: 132 },
  { label: "Thu", value: 178 },
  { label: "Fri", value: 210 },
  { label: "Sat", value: 195 },
  { label: "Sun", value: 240 },
];

const SPARK_UP = [10, 14, 12, 18, 22, 25, 32];
const SPARK_DOWN = [32, 28, 25, 20, 15, 11, 9];
const SPARK_FLAT = [15, 15, 15, 15, 15, 15, 15];

function ChartV5Section() {
  return (
    <Section
      id="chart-v5"
      title="Chart (V5)"
      importPath="@/components/ui/v5/ChartLineV5 + SparklineV5"
    >
      <ShowcaseRow label="ChartLineV5 — revenue 7 days (forest, default)">
        <div className="w-full max-w-2xl">
          <ChartLineV5 data={REVENUE_7D} height={240} />
        </div>
      </ShowcaseRow>
      <ShowcaseRow label="ChartLineV5 — empty data fallback">
        <div className="w-full max-w-md">
          <ChartLineV5 data={[]} height={160} />
        </div>
      </ShowcaseRow>
      <ShowcaseRow label="SparklineV5 — default forest (ascending)">
        <SparklineV5 data={SPARK_UP} />
      </ShowcaseRow>
      <ShowcaseRow label="SparklineV5 — trend variant: ascending → forest">
        <SparklineV5 data={SPARK_UP} variant="trend" />
      </ShowcaseRow>
      <ShowcaseRow label="SparklineV5 — trend variant: descending → red">
        <SparklineV5 data={SPARK_DOWN} variant="trend" />
      </ShowcaseRow>
      <ShowcaseRow label="SparklineV5 — trend variant: flat → grey">
        <SparklineV5 data={SPARK_FLAT} variant="trend" />
      </ShowcaseRow>
    </Section>
  );
}
