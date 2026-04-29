# Etalo Design V5 — Direction Robinhood-target

**Date de validation** : 27 avril 2026
**Statut** : Direction creative validee, supercede DESIGN_V4_PREVIEW.md
**Reference design** : Robinhood (post-2024 redesign, dark-first, fintech-appropriate)
**Cible quality realiste** : 75-85% Robinhood-quality (solo dev + budget minimal $50-80)
**Voir aussi** : ADR-040 pivot rationale + SPRINT_J10_V5.md execution plan

## Principes

V5 = bold + dark-first + motion-rich + custom illustrations + premium typography + tabular nums prominents.

Different de V4 (earth-inspired sober minimalism Stripe/Linear/Mercury) qui restait trop modeste pour 2026 standards.

## Toolkit verrouille

- **Switzer** typeface (Indian Type Foundry, MIT-licensed, gratuit) — distinctive Capsule Sans-like
- **Phosphor Icons** (5 weights, MIT) — iconographie premium consistent
- **Framer Motion** ou **Motion vanilla** (selon bundle size impact mesure Phase 1)
- **canvas-confetti** — celebrate milestones
- **recharts** (deja installe J7) — sparklines + line charts
- **Lottie** + LottieFiles — loading animations
- **Recraft.ai 1 mois** (~$12) — illustrations vectorielles SVG
- **Aeonik** typeface optionnel ~$50 — fallback si Switzer pas assez premium

## Palette V5

### Light mode (alternative, Etalo Light)

| Role | Token | Hex | Usage |
|---|---|---|---|
| Background principal | `celo-light` | `#FCFBF7` | Off-white chaleureux |
| Background subtle | `celo-light-subtle` | `#F7F5EC` | Sections alternees |
| Surface card | `celo-light` | `#FCFBF7` | Cards default |
| Accent primaire | `celo-forest` | `#476520` | CTA, links, active |
| Accent primaire hover | `celo-forest-dark` | `#3A521A` | Hover/pressed |
| Accent primaire subtle | `celo-forest-soft` | `rgba(71,101,32,0.08)` | Backgrounds focus |
| Accent jaune | `celo-yellow` | `#FBCC5C` | Highlights, badges, dots |
| Accent jaune subtle | `celo-yellow-soft` | `#FDE3A2` | Hover yellow |
| Texte primaire | `celo-dark` | `#2E3338` | Texte principal |
| Texte secondaire | `celo-dark/60` | rgba(46,51,56,0.6) | Texte muted |
| Texte tertiaire | `celo-dark/40` | rgba(46,51,56,0.4) | Texte placeholder |
| Border subtle | `celo-dark/8` | rgba(46,51,56,0.08) | Borders, dividers |
| Surface neutre warm | `celo-sand` | `#EFE7D6` | Surfaces alternatives |
| Status error | `celo-red` | `#A8362F` | Errors |
| Status error subtle | `celo-red-soft` | rgba(168,54,47,0.08) | Error backgrounds |
| **NEW V5 — Status success** | `celo-green` | `#00C853` | Successes prominents (parite Robinhood green) |
| **NEW V5 — Success hover** | `celo-green-hover` | `#00B348` | Hover state vibrant CTA (used by ButtonV4 primary dark) |
| **NEW V5 — Status info** | `celo-blue` | `#1E88E5` | Info banners |

### Dark mode (DEFAULT V5, Etalo Dark) — **first-class, pas afterthought**

| Role | Token | Hex | Usage |
|---|---|---|---|
| Background principal | `celo-dark-bg` | `#0F1115` | Background dark almost-black |
| Background elevated | `celo-dark-elevated` | `#1A1D23` | Cards, modals |
| Surface card | `celo-dark-surface` | `#22262E` | Cards interactives |
| Accent primaire | `celo-forest-bright` | `#5C8B2D` | CTA dark mode (Forest plus lumineux) |
| Accent primaire hover | `celo-forest` | `#476520` | Hover dark mode |
| Accent primaire subtle | `celo-forest-bright-soft` | `rgba(92,139,45,0.15)` | Backgrounds focus dark, hover ghost/outline dark |
| Accent jaune | `celo-yellow` | `#FBCC5C` | Highlights dark, badges |
| Accent jaune subtle | `rgba(251,204,92,0.15)` | — | Hover yellow dark |
| Texte primaire | `celo-light` | `#FCFBF7` | Texte principal dark mode |
| Texte secondaire | `celo-light/60` | rgba(252,251,247,0.6) | Texte muted dark |
| Texte tertiaire | `celo-light/40` | rgba(252,251,247,0.4) | Texte placeholder dark |
| Border subtle | `celo-light/8` | rgba(252,251,247,0.08) | Borders, dividers dark |
| Status error | `celo-red-bright` | `#FF5247` | Errors dark mode (plus lumineux) |
| Status success | `celo-green` | `#00C853` | Successes dark mode (meme token light, pas de variant -bright pour green) |
| Status info | `celo-blue-bright` | `#42A5F5` | Info dark mode |

**Strategie** : `dark:` Tailwind variants partout. next-themes integration. Default : dark (Robinhood-pattern). User toggle vers light optionnel via header button.

## Typography V5

### Family

- **Display + UI** : `Switzer` (gratuit Indian Type Foundry, weights 200-900) — distinctive, Capsule Sans-like
- **Mono / Tabular nums** : `Switzer` avec `font-feature-settings: "tnum"` — nums alignes pour amounts USDT
- Fallback Aeonik ~$50 si Switzer pas assez premium

### Hierarchie V5

```
display-hero  : 96px / -4px / 0.95   (landing hero ONLY — Robinhood-style massive)
display-1     : 64px / -2.5px / 0.98 (section titles, big numbers prominents)
display-2     : 44px / -1.8px / 1.05 (page titles)
display-3     : 32px / -1.4px / 1.1  (card titles)
display-4     : 22px / -0.8px / 1.2  (sub-section titles)
body-lg       : 18px / -0.18px / 1.55
body          : 16px / -0.15px / 1.6  (CLAUDE.md min)
body-sm       : 15px / -0.15px / 1.6  (landing-only annoté)
label         : 14px / 0 / 1.4 (font-weight 500)
caption       : 13px / 0.3px / 1.4
overline      : 11px / 0.8px / 1.3 (uppercase utility, font-weight 500)
tabular-num   : variant body avec font-feature-settings: "tnum" (USDT amounts)
```

**Nouveaute V5 vs V4** : ajout `display-hero` 96px pour landing massive numbers (parite Robinhood landing). Renforce le `tabular-nums` comme variant explicit.

## Iconography V5 — Phosphor Icons

Replace **lucide-react** (current) par **@phosphor-icons/react** :
- 1500+ icons en 5 weights (Thin, Light, Regular, Bold, Fill)
- MIT-licensed
- Tree-shakeable
- Plus refined que Lucide pour fintech aesthetic

**Convention** :
- Default weight : Regular (cohérence)
- Hover state : Bold (subtle weight shift micro-animation)
- Active state : Fill
- Tailles : 16px (small UI), 20px (default UI), 24px (CTA), 32px+ (illustrations)

## Motion principles V5

### Library decision (Phase 1)

Mesurer bundle size impact :
- Framer Motion : ~50 KB gzipped, ergonomie max
- Motion (vanilla) : ~10 KB gzipped, API similar
- @react-spring/web : ~30 KB gzipped, physics-based

Si bundle size critique (routes >300 KB First Load actuelles) → Motion vanilla. Sinon → Framer Motion.

### 10-15 micro-animations cles

1. **Button press feedback** : scale 0.98 sur press + scale 1.01 sur hover (toutes ButtonV4 instances, spring stiffness=400 damping=17 ~200ms perceived). asChild=true bypasse motion (Slot wrap, link-as-button cas rare).
2. **Card hover lift** : translate-y-[-2px] + shadow-celo-lg sur cards interactive
3. **Page transitions** : fade-slide subtle entre routes Next.js
4. **Tab content swap** : fade + scale 0.98→1
5. **Dialog entry** : fade + zoom 0.95→1 (deja Radix builtin, juste polish)
6. **Sheet slide** : smooth ease-out 300ms (deja Radix builtin)
7. **Toast notifications** : slide-from-bottom + fade
8. **Badge pulse live** : pulse 1.5s ease-in-out infinite (animate-celo-pulse, existe deja)
9. **Chart line entry** : path drawing animation 800ms ease-out
10. **Confetti milestones** : canvas-confetti burst sur premier sale, withdrawal complete, etc.
11. **Pull-to-refresh** : translate + rotate spinner (mobile only)
12. **Skeleton screens shimmer** : gradient sweep loading states
13. **Number counter animations** : amounts USDT animate 200ms sur change (balance updates)
14. **Switch mode header transition** : crossfade buyer/seller mode UI
15. **Onboarding screen transitions** : slide-from-right entre etapes

### Timing principles

- **200ms** : button feedback, hover states
- **300ms** : page transitions, sheet/dialog entry
- **400ms** : chart entries, complex compositions
- **800ms** : path drawing, illustrative animations
- **1500ms** : pulse, skeleton shimmer
- Easing default : `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out smooth premium)

## Illustrations strategy V5 — Recraft.ai

Recraft.ai genere SVG vectoriel (pas raster Midjourney). $12/mois 1 mois suffit pour V1.

### 5-8 illustrations validées Mike

1. **Landing hero illustration** — abstract premium scene (~30-60 min Mike validation cycle)
2. **Empty state — no orders** — friendly "Your boutique is ready, share to get first order"
3. **Empty state — no products** — "Add your first product"
4. **Empty state — no marketing assets** — "Generate your first marketing image"
5. **Success — first sale** — celebration scene (avec confetti)
6. **Success — withdrawal complete** — premium "Your USDT is in your wallet"
7. **Error — insufficient credits** — friendly "Buy more credits to continue"
8. **Onboarding welcome** — premium hero pour first-launch experience

### Style guide illustrations

- **Palette** : Celo Light cream + Forest accent + Yellow accent + Dark + occasional bright green/red status
- **Style** : Abstract geometric premium, NO mascots, NO emoji-style, NO stock illustrations look
- **Inspirations** : Stripe illustrations + Linear empty states + Robinhood onboarding
- **Format** : SVG vectoriel, 5-20 KB par illustration, scalable

### Mike's validation time investment

~5-10h cumule pour les 5-8 illustrations validees (3-5 prompts cycles par illustration). Block dedie Phase 3 J11.

## Illustrations production specs (Phase 3 Block 1 ready-to-use)

8 illustrations spécifiées avec Recraft.ai prompts ready-to-use copy-paste.
Production planifiée Phase 3 Block 2 (post Mike souscription Recraft Pro $12/mois).

**Palette commune verrouillée** (toutes illustrations) :
- Warm cream background : `#FCFBF7` (celo-light)
- Primary forest : `#476520` (celo-forest)
- Mid-tone forest bright : `#5C8B2D` (celo-forest-bright)
- Warm accent : `#FBCC5C` (celo-yellow)
- Dark detail : `#0F1115` (celo-dark-bg)
- Vibrant green : `#00C853` (celo-green) — **CELEBRATION/SUCCESS only**
- Red : `#A8362F` (celo-red) — **ERRORS only** (pas dans les 8 specs ci-dessous)

3-4 colors max par illustration, pas full palette systématique.

**Style guide tightening** :
- ❌ Pas de characters humains, faces, mascots, emojis, stock-illustration look
- ❌ Pas de gradients excessifs (1-2 stops max si vraiment nécessaire)
- ❌ Pas de réalisme texturé (pas de feuilles, briques, tissus détaillés)
- ✅ Geometric shapes, lines, dots, abstract symbols
- ✅ Generous negative space (60%+ canvas)
- ✅ Clean confident lines (pas de hand-drawn feel)
- ✅ Reference visuelle : Stripe blog illustrations + Linear empty states + Robinhood onboarding screens

### #1 — Landing hero illustration

**Brief** : Abstract premium digital stall — non-custodial commerce promise, 24/7
always-on. Aspirational expansive horizontal hero, NO literal "African seller"
clichés.

**Format** : 1600×900 horizontal SVG vector

**Use case** : Landing page hero above the fold (HomeLanding)

**Iteration target** : 4-6 cycles

**Recraft.ai prompt** :

> Abstract geometric premium vector illustration of a non-custodial digital storefront, expansive horizontal composition. Center-left: a stylized minimalist storefront silhouette as a clean abstract geometric form — flat-topped horizontal counter with simple vertical posts, abstract suggestion of a digital stall NOT a literal house with pitched roof, NOT a market booth with peaked awning. Think Stripe homepage illustrations or Linear marketing pages — abstract suggestion not literal depiction. Right two-thirds: open negative space with subtle sun-disc or upward-radiating geometric lines suggesting always-open, 24/7 availability and possibility. Floor or ground line clean and confident. Style: Stripe-meets-Linear-meets-Robinhood premium minimalism, clean lines, generous negative space, no characters, no faces, no mascots, no emoji, no stock illustration look, no realistic textures. Palette: warm cream `#FCFBF7` background, forest green `#476520` for primary architectural shapes, bright forest `#5C8B2D` for one mid-tone accent, yellow `#FBCC5C` for the sun-disc focal accent (single warm highlight), tiny dark `#0F1115` detail line for grounding. 1600×900 horizontal SVG vector, scalable, suitable for landing page hero above the fold.

### #2 — Empty state — no orders

**Brief** : Boutique is ready, waiting for first customer to land. Expectation +
share-to-get-first energy, not absence/failure.

**Format** : 1080×1080 square SVG vector

**Use case** : `OrdersTab` empty state via `EmptyStateV5`

**Iteration target** : 3-4 cycles

**Recraft.ai prompt** :

> Abstract geometric premium vector illustration of an empty digital storefront waiting for its first customer. Composition: a stylized storefront silhouette in the lower-third — friendly minimalist form (clean rectangles + flat horizontal roof line, NOT a triangular pitched roof, no realistic detail). Above the storefront: a subtle outward-radiating geometric pattern (3-5 thin lines or dots) suggesting share/broadcast/possibility. Style: Stripe-meets-Linear minimalist, clean lines, generous negative space (60%+ canvas), no characters, no faces, no mascots, no emoji, no stock illustration look. Palette: warm cream `#FCFBF7` background, forest green `#476520` for primary shop shapes, bright forest `#5C8B2D` for the radiating lines highlight, yellow `#FBCC5C` for one warm accent dot (small sun or door light). Premium SVG vector format, 1080×1080 square, suitable for empty state component card. CRITICAL: NOT a triangular pitched roof, NOT a folk-art house, NOT a children's book illustration. Use FLAT-TOPPED architectural elements only. Reference: Stripe blog illustrations + Linear empty states (abstract premium minimalist).

### #3 — Empty state — no products

**Brief** : Empty shelves, invitation to add first product. Capacity available,
not failure.

**Format** : 1080×1080 square SVG vector

**Use case** : `ProductsTab` empty state via `EmptyStateV5`

**Iteration target** : 3-4 cycles

**Recraft.ai prompt** :

> Abstract geometric premium vector illustration of an empty product shelf inviting the first item. Composition: a clean minimalist shelving structure in the center-bottom (3 horizontal lines as shelves, simple framing rectangle). One subtle plus-sign or upward arrow geometric mark in the center of the shelves indicating add-here. Style: Stripe-meets-Linear minimalist, clean lines, generous negative space, no characters, no faces, no mascots, no emoji, no stock illustration look, no realistic shelf textures. Palette: warm cream `#FCFBF7` background, forest green `#476520` for shelf structure, bright forest `#5C8B2D` for the plus/arrow indicator, yellow `#FBCC5C` for one corner accent dot. Premium SVG vector format, 1080×1080 square, suitable for empty state component card. CRITICAL: NOT a triangular pitched roof, NOT a folk-art house, NOT a children's book illustration. Use FLAT-TOPPED architectural elements only. Reference: Stripe blog illustrations + Linear empty states (abstract premium minimalist).

### #4 — Empty state — no marketing assets

**Brief** : Blank creative canvas, invitation to generate first image. Anticipation
of creative spark.

**Format** : 1080×1080 square SVG vector

**Use case** : `MarketingTab` empty state (pre-first-generation) via `EmptyStateV5`

**Iteration target** : 3-4 cycles

**Recraft.ai prompt** :

> Abstract geometric premium vector illustration of a blank creative canvas inviting the first generation. Composition: a clean rectangular frame in the center (like a picture frame or canvas, simple geometric border). Inside the frame: one subtle abstract spark, sparkle, or burst pattern (3-5 short radiating lines from a center point) suggesting generation and creativity. Style: Stripe-meets-Linear minimalist, clean lines, generous negative space, no characters, no faces, no mascots, no emoji, no stock illustration look. Palette: warm cream `#FCFBF7` background, forest green `#476520` for the frame, bright forest `#5C8B2D` for the burst lines, yellow `#FBCC5C` for the central spark dot. Premium SVG vector format, 1080×1080 square, suitable for empty state component card. CRITICAL: NOT a triangular pitched roof, NOT a folk-art house, NOT a children's book illustration. Use FLAT-TOPPED architectural elements only. Reference: Stripe blog illustrations + Linear empty states (abstract premium minimalist).

### #5 — Empty state — no stake

**Brief** : Secure foundation needed for cross-border tier unlock. Trust-building,
not gating-frustration.

**Format** : 1080×1080 square SVG vector

**Use case** : `StakeTab` tier=None empty state via `EmptyStateV5`

**Iteration target** : 3-4 cycles

**Recraft.ai prompt** :

> Abstract geometric premium vector illustration of a foundation or anchor representing trust and security for cross-border commerce. Composition: a clean stylized geometric shield, anchor, or pillar shape in the center (simple symmetric form, NOT a literal heraldic shield with crest, NOT a literal naval anchor, NOT a vault or safe-deposit box, NOT a treasure chest — more like an upright rectangular monolith with a subtle base). One subtle padlock detail or small dot of structured stability inside the shape. Style: Stripe-meets-Linear minimalist, clean lines, generous negative space, no characters, no faces, no mascots, no emoji, no stock illustration look. Palette: warm cream `#FCFBF7` background, forest green `#476520` for the foundation shape (sober, trust-conveying), bright forest `#5C8B2D` for one mid-tone accent line, yellow `#FBCC5C` for a single small confidence dot. Premium SVG vector format, 1080×1080 square, suitable for empty state component card. CRITICAL: NOT a triangular pitched roof, NOT a folk-art house, NOT a children's book illustration. Use FLAT-TOPPED architectural elements only. Reference: Stripe blog illustrations + Linear empty states (abstract premium minimalist).

### #6 — Success — first sale celebration

**Brief** : Restrained elegance, NOT loud confetti chaos. Quiet confidence,
moment-of-pride. (Confetti dynamic burst already lives in canvas-confetti
Block 7 — illustration is the calm celebratory layer behind.)

**Format** : 1080×1080 square SVG vector

**Use case** : `OrdersTab` post-first-sale full-screen layer OR `EmptyStateV5`
success variant

**Iteration target** : 3-4 cycles

**Recraft.ai prompt** :

> Abstract geometric premium vector illustration celebrating a first sale — restrained elegance, not loud festivity. Composition: in the center, a simple geometric checkmark or upward arrow inside a clean circle (success motif, NOT a trophy, NOT a medal, NOT a literal champion icon, NOT a star burst). Around the circle in the upper third: 3-5 small celebratory dots or short radiating lines, asymmetric for organic feel but not chaotic. Lower third: clean negative space. Style: Stripe-meets-Linear-meets-Robinhood premium, restrained celebration, clean lines, generous negative space, no characters, no faces, no mascots, no emoji, no exploded confetti chaos, no stock illustration look. Palette: warm cream `#FCFBF7` background, forest green `#476520` for the success circle border, vibrant green `#00C853` (Robinhood signature) for the checkmark or arrow inside (celebration moment), yellow `#FBCC5C` for 2-3 of the celebratory dots, bright forest `#5C8B2D` for the remaining dots. Premium SVG vector format, 1080×1080 square, suitable for success state component card or post-first-sale layer. CRITICAL: NOT a triangular pitched roof, NOT a folk-art house, NOT a children's book illustration. Use FLAT-TOPPED architectural elements only. Reference: Stripe blog illustrations + Linear empty states (abstract premium minimalist).

### #7 — Success — withdrawal complete

**Brief** : Calm completion — USDT in your wallet, money flowed safely. Serious
money moment, NOT festive (use vibrant green sparingly, no yellow accents to keep
the gravity).

**Format** : 1080×1080 square SVG vector

**Use case** : `StakeActionDialog` withdraw success layer (post withdrawal-complete
confetti milestone Block 7)

**Iteration target** : 3-4 cycles

**Recraft.ai prompt** :

> Abstract geometric premium vector illustration of completed withdrawal — USDT safely arrived. Composition: in the center, an abstract geometric containment shape (simple rounded rectangle with a subtle clasp line, suggestion of secure receptacle, NOT a literal leather wallet with realistic stitching, NOT a purse, NOT a money bag with dollar sign symbol, NOT a treasure chest). Above the receptacle: a single downward-flowing line or small dollar/coin disc symbol indicating arrival. Around the receptacle: a soft glow or 2-3 short radiating arc lines suggesting safety and confirmation, restrained. Style: Stripe-meets-Linear-meets-Robinhood premium, calm completion, clean lines, generous negative space, no characters, no faces, no mascots, no emoji, no stock illustration look. Palette: warm cream `#FCFBF7` background, forest green `#476520` for the receptacle structure, vibrant green `#00C853` (Robinhood signature) for the coin/arrival disc and confirmation glow, tiny dark `#0F1115` clasp detail. Yellow accent NOT used here (keep palette clean for serious money moment). Premium SVG vector format, 1080×1080 square, suitable for StakeActionDialog withdraw success layer. CRITICAL: NOT a triangular pitched roof, NOT a folk-art house, NOT a children's book illustration. Use FLAT-TOPPED architectural elements only. Reference: Stripe blog illustrations + Linear empty states (abstract premium minimalist).

### #8 — Onboarding welcome hero

**Brief** : Premium aspirational hero for first-launch experience. Journey
beginning, NOT grandiose. Echo of #1 landing hero but more intimate.

**Format** : 1200×800 horizontal SVG vector

**Use case** : `OnboardingScreenV5` screen 1 hero (Phase 4 Block 4)

**Iteration target** : 4-6 cycles

**Recraft.ai prompt** :

> Abstract geometric premium vector illustration of beginning a digital commerce journey — expansive horizontal composition for first-launch onboarding hero. Composition: lower-third grounded with a subtle horizon line or pathway leading rightward into open space. Center-right: a stylized small storefront silhouette (echoing the landing hero patch — flat-topped horizontal counter with simple vertical posts, NOT a triangular pitched roof, NOT a literal house with peaked awning — but smaller, more intimate). Upper-third: 3-5 small geometric dots or stars suggesting possibility and the journey ahead, asymmetric for organic feel. Style: Stripe-meets-Linear-meets-Robinhood premium, aspirational without being grandiose, clean lines, generous negative space, no characters, no faces, no mascots, no emoji, no stock illustration look. Palette: warm cream `#FCFBF7` background, forest green `#476520` for the storefront and horizon line, bright forest `#5C8B2D` for path/journey accents, yellow `#FBCC5C` for one warm welcome dot (sun or focal star), tiny dark `#0F1115` grounding detail. Premium SVG vector format, 1200×800 horizontal, suitable for onboarding screen 1 hero. CRITICAL: NOT a triangular pitched roof, NOT a folk-art house, NOT a children's book illustration. Use FLAT-TOPPED architectural elements only. Reference: Stripe blog illustrations + Linear empty states (abstract premium minimalist).

### Production budget recap

- 8 illustrations × 3-6 cycles = ~30-40 prompt iterations cumulés
- Mike validation time : ~5-10h (estimate sprint plan, cohérent)
- Recraft.ai Pro $12/mois : 1 mois suffit (cancel post Block 2)
- Output : 8 SVG vector files dans `packages/web/public/illustrations/v5/`
  (paths à confirmer Block 2)

## Components V4 → V5 extension

### Strategy

V4 component library J9 (`packages/web/src/components/ui/v4/`) reste base. Extension V5 = ajout dark variants + Motion props sur chaque composant.

### Components a etendre

| Component | Extension V5 | Effort |
|---|---|---|
| ButtonV4 | + dark variants 4 colors + Motion press scale (voir note primary CTA pattern ci-dessous) | 0.5j |
| InputV4 | + dark variants + focus animation | 0.5j |
| CardV4 | + dark variants 4 variants + Motion hover lift | 0.5j |
| DialogV4 | + dark variants header dark + Motion enter | 0.5j |
| SheetV4 | + dark variants + Motion slide enhanced | 0.5j |
| TabsV4 | + dark variants + Motion sliding indicator animated | 0.5j |
| BadgeV4 | + dark variants + Motion pulse animated | 0.3j |
| ToastV4 | + dark variants + Motion slide-from-bottom | 0.3j |

**Note ButtonV4 — Primary CTA pattern light/dark intentional** : light mode = sober earth-tone forest (`celo-forest #476520` + `celo-light` text, **6.35:1** WCAG), dark mode = vibrant green Robinhood-style (`celo-green #00C853` + `celo-dark` text, **6.2:1** WCAG). Le flip de la couleur du texte light→dark est un design pattern intentionnel (Robinhood-aligned), pas une incohérence brand. Forest-bright `#5C8B2D` (initialement envisagé pour primary dark) ne donne que ~3.9:1 WCAG → rejeté Block 4b au profit de celo-green.

**Total V4 → V5 extension** : 4-5j (Phase 1).

### Nouveaux components V5

| Component | Usage | Effort |
|---|---|---|
| **SkeletonV5** | Skeleton screens systematic (replace spinners) | 0.5j |
| **ChartLineV5** | Wrapper recharts custom-styled | 1j |
| **SparklineV5** | Mini line chart inline (credit balance, prices) | 0.5j |
| **OnboardingScreenV5** | Scaffold pour onboarding flow V1 (3-4 ecrans) | 1j |
| **EmptyStateV5** | Wrapper empty states avec illustration + CTA | 0.5j |

**Total nouveaux V5** : 3.5j (Phase 2-3).

## Skeleton screens systematic V5

Pattern Robinhood : skeleton screens partout pendant data fetches, JAMAIS de spinner basique sur loading principal.

### Implementation

- Component `<SkeletonV5>` reutilisable avec variants (text, circle, rectangle, card)
- Animations shimmer subtle (gradient sweep 1.5s infinite)
- Replace tous les spinners actuels :
  - Marketplace loading
  - Seller dashboard tabs loading
  - Cart drawer items loading (rare)
  - Single product loading
  - Asset generation loading (REPLACE spinner par illustration generation animation)

**Effort** : 2-3j systematic refactor (Phase 3).

## Tabular nums prominents V5

USDT amounts, credit balance, transaction counts, etc., tous en tabular nums via `font-feature-settings: "tnum"`.

### Implementation

- Tailwind utility class custom : `font-tabular` qui applique `font-feature-settings: "tnum"`
- Apply systematique sur tous les amounts :
  - Cart total
  - Order amounts
  - Credit balance
  - USDT prices
  - Transaction history amounts
  - Stake amounts
  - Sparkline values

**Effort** : 1j systematic application (Phase 5).

## Onboarding flow V1

Robinhood premium pattern : 3-4 ecrans welcome au first-launch.

### Scope V1 (3 ecrans)

1. **Welcome screen** — illustration premium + "Welcome to Etalo, your digital boutique"
2. **What you can do screen** — 3 cards : Sell on Instagram/WhatsApp/TikTok / Get paid USDT secure / Boutique 24/7
3. **Get started screen** — 2 CTAs : "Open as buyer" + "Set up my boutique" (route vers /seller/dashboard ou /marketplace)

Skippable (pas obligatoire), persist localStorage `etalo-onboarded=true`.

**Effort** : 3-5j (Phase 4).

## Empty states comme engagement

Pattern Robinhood : empty states ne sont pas "pas de donnees" passive, mais opportunites d'engagement.

### Implementation

Chaque empty state inclut :
- Illustration premium (Recraft.ai)
- Copy friendly + actionable ("Your boutique is empty, add your first product")
- Primary CTA proactif ("Add product")
- Optional secondary education link ("How to add products")

### Surfaces

- Boutique vide (no products) → "Add first product"
- Marketing tab no images → "Generate first marketing image"
- Orders tab no orders → "Share your boutique link"
- Stake tab no stake → "Deposit stake to start selling cross-border"
- Cart vide (existing) → "Browse marketplace"

**Effort** : 1-2j systematic refactor (Phase 3).

## Side-by-side QA pass criteria

Sans designer humain, validation = side-by-side comparison Robinhood screenshots.

### A chaque end-of-phase

Mike capture 3-5 screenshots Etalo et 3-5 screenshots Robinhood equivalents. Compare :

1. **Typography hierarchy** — sizes, weights, letter-spacing match feel premium
2. **Spacing rhythm** — gaps, paddings, margins coherents
3. **Color contrast** — WCAG AA minimum, contrast premium feel
4. **Motion timing** — animations 200-400ms feel snappy
5. **Density** — tight enough premium, pas trop spacious
6. **Iconography consistency** — Phosphor uniforme, weights coherents
7. **Card depth** — shadows + borders give correct depth perception
8. **Tabular nums** — amounts alignes, lisibles
9. **Empty states quality** — illustrations + copy engaging
10. **Loading states** — skeleton screens (pas spinners)

### Performance budget

Routes principales < 300 KB First Load. Mesure systematic Phase 1, monitor a chaque sprint.

## Mobile gestures critiques

Premium mobile expectations 2026, focus 2 gestures critiques V1 :

1. **Swipe-to-close cart drawer** — touch events natifs, sheet ferme si swipe right >50px
2. **Pull-to-refresh marketplace** — touch events natifs, refresh sur pull >100px

Optional V1.5+ : long-press menus, swipe between cards, etc.

**Effort** : 1-2j (Phase 5).

## Performance budget

V5 cible MiniPay/Celo en 3G+ Afrique de l'Ouest. Budget First Load JS hard
**< 300 KB** sur toutes routes principales (buyer + seller). Baseline post
Phase 1 (Block 6) : worst case `/seller/dashboard` 256 KB (85% du budget,
marge ~44 KB pour Phase 2-5). Trigger optimisation Block 6b si une route
dépasse 280 KB (93%).

Outillage : `npm run build` (summary CLI), `npm run analyze`
(`@next/bundle-analyzer`, treemap browser).

Voir `docs/PERFORMANCE_BUDGET.md` pour budget détaillé, baseline complet,
methodology et levers d'optimisation Phase 5+.

## Documents impactes

- DESIGN_V4_PREVIEW.md → deprecated, pointer vers ce doc
- SPRINT_J10.md → deprecated, remplace par SPRINT_J10_V5.md
- CLAUDE.md "Current sprint" → flip vers J10-V5
- ADR-040 dans DECISIONS.md → documente ce pivot

## Branche strategy

- **Branche actuelle** `feat/design-vitrine-v4` reste ouverte (Block 2 PublicHeader work preserve, restera relevant moyennant Switzer swap + dark variants)
- **Nouvelle branche** `feat/design-system-v5` cree depuis `feat/design-vitrine-v4` HEAD = `35d12f2`
- Tag `v2.0.0-design-system-sepolia` reste reference audit trail "V4 baseline" pour rollback eventuel
- Phase 1 J10-V5 commence par renommer la branche OU cree fresh branch selon preference Mike

## Voir aussi

- `docs/DECISIONS.md` ADR-040 (rationale + impact)
- `docs/SPRINT_J10_V5.md` (execution plan 5 phases)
- `docs/SPRINT_J9.md` (V4 component library livree, base de l'extension V5)
- `docs/PERFORMANCE_BUDGET.md` (budget V5 + baseline Phase 1 + levers optimisation)
