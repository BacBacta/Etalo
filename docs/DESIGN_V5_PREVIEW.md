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
| Background subtle | `celo-light-2` | `#F7F5EC` | Sections alternees |
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
| **NEW V5 — Status success** | `celo-green-bright` | `#00C853` | Successes prominents (parite Robinhood green) |
| **NEW V5 — Status info** | `celo-blue` | `#1E88E5` | Info banners |

### Dark mode (DEFAULT V5, Etalo Dark) — **first-class, pas afterthought**

| Role | Token | Hex | Usage |
|---|---|---|---|
| Background principal | `celo-dark-bg` | `#0F1115` | Background dark almost-black |
| Background elevated | `celo-dark-elevated` | `#1A1D23` | Cards, modals |
| Surface card | `celo-dark-surface` | `#22262E` | Cards interactives |
| Accent primaire | `celo-forest-bright` | `#5C8B2D` | CTA dark mode (Forest plus lumineux) |
| Accent primaire hover | `celo-forest` | `#476520` | Hover dark mode |
| Accent primaire subtle | `rgba(92,139,45,0.15)` | — | Backgrounds focus dark |
| Accent jaune | `celo-yellow` | `#FBCC5C` | Highlights dark, badges |
| Accent jaune subtle | `rgba(251,204,92,0.15)` | — | Hover yellow dark |
| Texte primaire | `celo-light` | `#FCFBF7` | Texte principal dark mode |
| Texte secondaire | `celo-light/60` | rgba(252,251,247,0.6) | Texte muted dark |
| Texte tertiaire | `celo-light/40` | rgba(252,251,247,0.4) | Texte placeholder dark |
| Border subtle | `celo-light/8` | rgba(252,251,247,0.08) | Borders, dividers dark |
| Status error | `celo-red-bright` | `#FF5247` | Errors dark mode (plus lumineux) |
| Status success | `celo-green-bright` | `#00C853` | Successes dark mode |
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

1. **Button press feedback** : scale 0.98 sur press (toutes ButtonV4 instances)
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

## Components V4 → V5 extension

### Strategy

V4 component library J9 (`packages/web/src/components/ui/v4/`) reste base. Extension V5 = ajout dark variants + Motion props sur chaque composant.

### Components a etendre

| Component | Extension V5 | Effort |
|---|---|---|
| ButtonV4 | + dark variants 4 colors + Motion press scale | 0.5j |
| InputV4 | + dark variants + focus animation | 0.5j |
| CardV4 | + dark variants 4 variants + Motion hover lift | 0.5j |
| DialogV4 | + dark variants header dark + Motion enter | 0.5j |
| SheetV4 | + dark variants + Motion slide enhanced | 0.5j |
| TabsV4 | + dark variants + Motion sliding indicator animated | 0.5j |
| BadgeV4 | + dark variants + Motion pulse animated | 0.3j |
| ToastV4 | + dark variants + Motion slide-from-bottom | 0.3j |

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
