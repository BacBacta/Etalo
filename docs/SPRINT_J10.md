# Sprint J10 — Phase Vitrine (mai 2026)

**Sprint objective** : Migrer les **pages publiques** vers le design
system V4 livré en J9. Application complète des principes
`docs/DESIGN_V4_PREVIEW.md` (scope landing + extensions non-landing pour
public boutique et cart drawer).

**Approche** : drop-in replacement composants shadcn legacy → V4
(`<Button>` → `<ButtonV4>`, `<Card>` → `<CardV4>`, `<Sheet>` → `<SheetV4>`,
etc.). **Logique applicative préservée** (useState, fetchers, cart store,
routing, SEO tags, JSON-LD) — migration purement présentationnelle.

**Branche** : `feat/design-vitrine-v4` depuis `main` post-tag
`v2.0.0-design-system-sepolia` (HEAD = `9a0a745`, J9 merge commit).

**Source design** : `docs/DESIGN_V4_PREVIEW.md` (palette `celo`, typo
Instrument Serif + Inter, structure landing, principes pages non-landing).

**Component library** : `packages/web/src/components/ui/v4/*` (livrée J9,
8 composants, 37 exports).

**Estimation** : 6 blocks, ~5-7 jours total.

---

## Décisions verrouillées Phase 1

| # | Question | Décision |
|---|---|---|
| Q1 | Logo SVG | **V4 doc tel quel** — rectangle dark + cercle yellow + arc + 2 dots forest (ligne 71-80 DESIGN_V4_PREVIEW.md) |
| Q2 | Card "Next order" mock landing | **Animated subtle** — timeline progress (Paid checked / Waiting blinking / Auto-release ghost) + pulse dot sur "Live on Celo" badge |
| Q3 | Stats footer | **"7M+ users · 50+ countries · <$0.01 fee"** — platform numbers MiniPay/Celo ecosystem trust signal V1 baseline |
| Q4 | Tag closure J10 | **`v2.0.0-design-vitrine-sepolia`** |

---

## Blocks

| # | Block | Durée | Livrable |
|---|---|---|---|
| 1 | Setup + audit visuel + plan migration | 0.5j | `docs/SPRINT_J10.md` audit section + inventaire shadcn legacy par surface |
| 2 | PublicHeader migration | 0.5j | Logo SVG inline + cart trigger V4 + switch mode + V4 tokens |
| 3 | Cart drawer migration | 1j | `SheetV4` right + `CartItemRow` V4 + `ButtonV4` checkout CTA |
| 4 | Landing page migration | 2j | Hero + Card "Next order" mock animated + Partners divider + Stats footer |
| 5 | Public boutique pages migration | 1.5j | `/[handle]` + `/[handle]/[slug]` avec `ProductCard` V4 + `BoutiqueHeader` V4 |
| 6 | Closure J10 (PR #7 + tag) | 0.5j | `docs/SPRINT_J10.md` final wrap-up + PR #7 + tag `v2.0.0-design-vitrine-sepolia` |

---

## Décisions techniques importantes

- **Drop-in remplacement** — composants legacy shadcn (`<Button>`, `<Card>`,
  `<Sheet>`) deviennent `<ButtonV4>`, `<CardV4>`, `<SheetV4>`. Conservation
  logique métier, replacement style + structure présentation.
- **Tokens migration** — `bg-neutral-*` / `bg-gray-*` / `text-gray-*` →
  `bg-celo-light` / `text-celo-dark` etc. (namespace `celo` strict, lessons
  J9).
- **Typography swap** — H1/H2/H3/H4 → `font-display` (Instrument Serif).
  Body → `font-sans` (Inter). Captions/labels → `text-overline` ou
  `text-caption`.
- **Conservation logique applicative** — `useState`, `useEffect`, fetchers,
  cart store, routing, SEO tags, JSON-LD : **INTACTS**. Migration purely
  présentationnelle.
- **Card "Next order" mock animated** — Block 4 implementation, timeline
  progress (étape Paid checked → Waiting blinking → Auto-release ghost) +
  pulse dot sur "Live on Celo" badge. Animations subtiles cohérentes avec
  `celo-pulse` existant `tailwind.config.ts`.
- **Mobile-first 360px strict** — tous les blocks valident mobile rendering
  avant desktop (CLAUDE.md rule).
- **Flag « épargne if good enough »** — SEO infra (sitemap, robots, OG
  images, JSON-LD Store/Product) reste **INTACTE**. ProductCard logique
  stock/price/link reste identique. Polish J6 Block 2-3 préservé.
- **Coexistence shadcn legacy + V4** — composants `packages/web/src/components/ui/*`
  shadcn legacy restent en place pendant J10-J11. Suppression globale
  programmée J12 closure cleanup (cohérent décision J9 Block 2).

---

## Critères de réussite J10

- [ ] 5 surfaces migrées vers V4 components (landing + PublicHeader + cart
  drawer + boutique + single product)
- [ ] Design cohérent avec `docs/DESIGN_V4_PREVIEW.md` (Mike valide
  visuellement chaque page)
- [ ] `npm run build` clean
- [ ] `vitest` 93 baseline + tests V4 components inchangés + nouveaux
  tests page-level éventuels (peut être 0 si juste migration visuelle)
- [ ] Mobile responsive validé (360px strict)
- [ ] Composants legacy `ui/*.tsx` (shadcn) toujours présents (pas de
  suppression V1, J12 cleanup)
- [ ] PR #7 + tag `v2.0.0-design-vitrine-sepolia` posés
- [ ] Memory checkpoint J10 closure

---

## Audit visuel (Block 1 — 2026-04-27)

Inventaire détaillé des 5 surfaces dans le scope J10. Pour chaque surface :
composants shadcn legacy utilisés, tokens `neutral-*` / `gray-*` à
remplacer (count estimé), typography classes à swap, logique applicative
à préserver, polish premium V4 à appliquer.

### Surface 1 — Landing (5 files)

**Files** : `app/page.tsx` + `components/HomeRouter.tsx` +
`components/HomeLanding.tsx` + `components/HomeMode.tsx` +
`components/FeaturedSellers.tsx`

- **shadcn legacy** : aucun (pure HTML + Tailwind raw)
- **Tokens neutral/gray à remplacer (~32)** :
  - `HomeLanding.tsx` ~16 : `text-neutral-700` × 5, `bg-neutral-50`,
    `bg-neutral-900`, `bg-black` × 2, `text-white` × 3, `bg-white` × 2,
    `text-neutral-900` × 2
  - `HomeMode.tsx` ~10 : `text-neutral-700`, `border-neutral-200` × 2,
    `bg-white` × 2, `border-neutral-900` × 2 (hover), `text-neutral-600` × 2,
    `text-neutral-500`
  - `FeaturedSellers.tsx` ~6 : `border-neutral-200`, `bg-white`,
    `border-neutral-400` (hover), `bg-neutral-100`, `text-neutral-400`,
    `text-neutral-600`
- **Typography classes à swap** : `text-3xl/4xl font-bold` (HomeLanding H1),
  `text-xl/lg font-semibold` (sections), `text-2xl/lg font-semibold`
  (HomeMode H1/H2), `text-sm/base` body. Cible : `font-display
  text-display-1/2/3` headings + `font-sans text-body-sm/body` content.
- **Logique INTACTE** : ISR 300, MiniPay detect useEffect,
  `fetchFeaturedSellers(6)`, mode preference localStorage,
  `router.replace` post-detection.
- **Polish premium V4** : Block 4 = **REWRITE complet**. Hero italique +
  badge "Live on Celo" pulse, Card "Next order" mock dark fond avec
  `shadow-celo-hero` + scan line `linear-gradient(90deg,…)` + glow
  radial `radial-gradient(circle, rgba(71,101,32,0.3),…)` + timeline
  animée (Paid checked / Waiting blinking / Auto-release ghost),
  Partners divider, Stats footer "7M+ users · 50+ countries · <$0.01
  fee". `CardV4 interactive` pour HomeMode buyer/seller cards et
  FeaturedSellers seller cards. Border-radius 36px container / 24px
  cards / 100px pills.

### Surface 2 — PublicHeader (1 file)

**File** : `components/PublicHeader.tsx`

- **shadcn legacy** : aucun
- **Tokens neutral/gray (~4)** : `border-neutral-200`, `bg-white/80`,
  `text-neutral-600`, `text-neutral-900` (hover)
- **Typography classes à swap** : `text-lg font-semibold` (logo
  wordmark), `text-sm` (Switch mode label). Cible : `font-display`
  (logo "Etalo" 22px) + `text-caption` (button).
- **Logique INTACTE** : sticky + backdrop blur, MiniPay detect
  useEffect, switch mode handler, `cartOpen` state, embedding
  `<CartDrawer>`.
- **Polish premium V4** : Logo SVG inline depuis DESIGN_V4_PREVIEW.md
  §63-80 (rectangle dark `#2E3338` + cercle yellow `#FBCC5C` au centre
  haut + arc jaune avec 2 dots forest aux extrémités) + wordmark
  "Etalo" Instrument Serif 22px à côté. `ButtonV4 variant="ghost"
  size="sm"` pour Switch mode. CartTrigger récupère son propre
  traitement Block 3.

### Surface 3 — Cart drawer (3 files)

**Files** : `components/CartDrawer.tsx` + `components/CartItemRow.tsx`
+ `components/CartTrigger.tsx`

- **shadcn legacy** :
  - `CartDrawer.tsx` : `Sheet`, `SheetContent`, `SheetFooter`,
    `SheetHeader`, `SheetTitle` (depuis `@/components/ui/sheet`),
    `Button` (depuis `@/components/ui/button`)
  - `CartTrigger.tsx` : `Badge` (depuis `@/components/ui/badge`)
- **Tokens neutral/gray (~20)** :
  - `CartDrawer.tsx` ~7 : `border-neutral-200` × 3, `text-neutral-700`,
    `text-neutral-500` × 2, `text-neutral-600`
  - `CartItemRow.tsx` ~11 : `bg-neutral-100`, `text-neutral-400`,
    `text-neutral-600`, `border-neutral-300` × 2,
    `hover:bg-neutral-50` × 2, `text-neutral-500` × 2,
    `hover:bg-neutral-100`, `text-neutral-900`
  - `CartTrigger.tsx` ~2 : `hover:bg-neutral-100`,
    `focus:ring-neutral-900`
- **Typography classes à swap** : `text-base/sm/lg` (text bodies +
  titles + labels). Cible : `text-body-sm` items, `text-caption` meta,
  `font-display text-display-4` SheetTitle. `text-base font-semibold`
  (Total label/amount) → `text-body font-medium`.
- **Logique INTACTE** : cart store `useMemo` derived (sellerGroups +
  totalUsdt + itemCount), `postCartToken` checkout handler,
  `CartValidationError` toast handling, `isCheckingOut` state, mounted
  gate hydration (lesson J6), `updateQty`/`removeItem` quantity
  controls, persist Zustand.
- **Polish premium V4** :
  - `<Sheet>` → `<SheetV4 side="right">` + auto-Portal/Overlay/Close
  - `<SheetTitle>` → `<SheetV4Title>` (font-display)
  - `<SheetFooter>` → `<SheetV4Footer>` (override flex-col gap-3 si
    spec différente du default justify-end)
  - `<Button>` checkout → `<ButtonV4 size="lg">` full-width
  - "Clear cart" raw button → `<ButtonV4 variant="ghost" size="sm">`
  - `<Badge>` count → `<BadgeV4 variant="forest">` avec wrapper
    `absolute -right-1 -top-1`
  - CartItemRow boutons +/− : `border-celo-dark/[16%]` + hover
    `bg-celo-forest-soft`
  - Image placeholder bg : `bg-celo-dark/[8%]`
  - Optionally swap `toast.error` → `toastV4.error` (identity-alias,
    no behaviour change)

### Surface 4 — Public boutique (5 files)

**Files** : `app/[handle]/page.tsx` + `components/BoutiqueHeader.tsx` +
`components/ProductGrid.tsx` + `components/ProductCard.tsx` +
`components/EmptyState.tsx`

- **shadcn legacy** : aucun
- **Tokens neutral/gray (~11)** :
  - `BoutiqueHeader.tsx` ~4 : `border-neutral-200`, `bg-neutral-200`,
    `text-neutral-700`, `text-neutral-600`
  - `ProductCard.tsx` ~5 : `bg-neutral-100`, `text-neutral-400`,
    `bg-black/60`, `text-white`, `focus:ring-neutral-900`
  - `EmptyState.tsx` ~2 : `text-neutral-600`, `text-neutral-500`
- **Typography classes à swap** : `text-xl font-semibold`
  (BoutiqueHeader shop name H1), `text-base font-medium/semibold`
  (ProductCard title + price), `text-sm` (handle/country, EmptyState).
  Cible : `font-display text-display-3` (shop name), `font-sans
  text-body-sm` (card title), `text-body font-medium` (price),
  `text-caption opacity-60` (meta).
- **Logique INTACTE** : SEO `generateMetadata` + JSON-LD Store,
  `normalize` handle, `fetchPublicBoutique`, `permanentRedirect` 308
  canonicalization, `notFound`, ProductGrid responsive grid layout
  (1/2/3/4 cols).
- **Polish premium V4** :
  - BoutiqueHeader logo placeholder (initial char) bg :
    `bg-celo-yellow-soft` (warmer, on-brand)
  - Border `border-celo-dark/[8%]`
  - ProductCard : recommandation **div semantic + tokens celo** (PAS
    `<CardV4>` wrapper — préserve max click area du Link et l'overlay
    AddToCartIcon positioning). Image bg `bg-celo-dark/[8%]`.
    Out-of-stock overlay `bg-celo-dark/60` + `text-celo-light`. Focus
    ring `ring-celo-forest`.
  - `border-radius` cards : `rounded-lg` (8px) actuel → `rounded-2xl`
    (16px) ou `rounded-3xl` (24px) pour parité ProductCard public
    boutique selon DESIGN_V4 §Marketplace cards. Décision pendant
    Block 5.
  - EmptyState : `text-celo-dark/60` muted

### Surface 5 — Single product (4 files)

**Files** : `app/[handle]/[slug]/page.tsx` +
`components/ShareButtons.tsx` + `components/ProductAddToCartButton.tsx`
+ `components/AddToCartIcon.tsx`

- **shadcn legacy** : `ProductAddToCartButton.tsx` utilise `Button`
  (depuis `@/components/ui/button`)
- **Tokens neutral/gray (~15)** :
  - `[slug]/page.tsx` ~7 : `bg-neutral-200`, `bg-neutral-100` × 2,
    `text-neutral-500` × 2, **`text-red-600`** (out-of-stock !),
    `text-neutral-700`
  - `ShareButtons.tsx` ~4 : `border-neutral-300`, `bg-white`,
    `hover:bg-neutral-50`, `text-neutral-500`
  - `ProductAddToCartButton.tsx` : 0 (juste size + height)
  - `AddToCartIcon.tsx` ~4 : `bg-neutral-900`, `text-white`,
    `hover:bg-neutral-800`, `focus:ring-neutral-900`
- **Typography classes à swap** : `text-2xl font-semibold` (H1 title +
  price), `text-sm font-semibold` (seller name header), `text-base`
  (description), `text-sm` (stock/share label/share footer). Cible :
  `font-display text-display-3` (H1 + price), `font-sans text-body`
  (description), `text-caption opacity-60` (meta), `text-overline
  opacity-60` ("Share" label).
- **Logique INTACTE** : SEO `generateMetadata` + JSON-LD Product,
  `normalizeHandle`/`normalizeSlug`, `fetchPublicProduct`,
  `permanentRedirect` canonicalization, `addItem` cart store +
  `inCartQty` derived, share `copy` clipboard + WhatsApp deep-link,
  image gallery primary fallback.
- **Polish premium V4** :
  - Header seller logo placeholder : `bg-celo-yellow-soft` (cohérent
    BoutiqueHeader Surface 4)
  - Image principal container `bg-celo-dark/[8%]` + `rounded-3xl`
    (24px cohérent V4)
  - H1 title + price : `font-display text-display-3 text-celo-dark`
  - Description : `font-sans text-body text-celo-dark`
  - `<Button>` (PAtCB) → `<ButtonV4 size="lg" className="w-full">`
  - ShareButtons OUTLINE constant → `<ButtonV4 variant="outline"
    size="md">` × 2 (WhatsApp + Copy)
  - AddToCartIcon overlay : `bg-celo-forest` + `text-celo-light` +
    `hover:bg-celo-forest-dark` + `shadow-celo-sm` +
    `focus:ring-celo-forest`
  - "Share" label : `text-overline opacity-60`
  - **Note arbitrage Block 5 — out-of-stock color** : à arbitrer
    pendant l'implementation entre `text-celo-red` (alarmant, signale
    immédiatement l'indisponibilité) et `text-celo-dark/60` (muted,
    statut neutre informationnel). Décision visuelle au moment du
    Block 5 implementation, à valider Mike sur rendu réel. Stock
    in-stock label : `text-celo-dark/60` muted dans tous les cas.

---

## Ordre Block 2 → 5 + rationale

### Block 2 — PublicHeader (~0.5j) — foundational, premier impact V4

- Used **everywhere** (root layout monte `<PublicHeader>`)
- Logo SVG + Etalo wordmark Instrument Serif = **première identité
  visuelle V4** que l'utilisateur voit dès l'arrivée
- Premier `ButtonV4` en production (Switch mode)
- Quick win en 0.5j, sets the tone pour le reste du sprint
- **Ne dépend de rien** des autres surfaces

### Block 3 — Cart drawer (~1j) — foundational interaction

- **Triggered from PublicHeader** (cart icon overlay) → ordonné après
  Block 2
- Plus complexe en termes de **shadcn replacement** (Sheet + Button +
  Badge — 3 composants, plus de surface)
- Valide `<SheetV4 side="right">` en **production réelle** (pas juste
  storybook-light)
- Valide `<BadgeV4 variant="forest">` en **production réelle** (cart
  count overlay positioning)
- `toastV4` déjà actif (J9 Block 3h swap auto via ToasterV4)
- **Pas de dépendance Landing** — peut être validé indépendamment

### Block 4 — Landing page (~2j) — the big one, REWRITE

- **REWRITE complet** per DESIGN_V4_PREVIEW.md (pas drop-in) → bloc le
  plus long
- Animations subtle (timeline progress + pulse dot live) **nouvelles**
  vs structure actuelle
- HomeMode + FeaturedSellers : `CardV4 interactive` validé en
  production (premier usage cards interactives outside du
  dev/components)
- **Maximum visual impact** — c'est la page que les visiteurs externes
  voient (Proof of Ship demo target)
- Ne dépend de rien (Hero structure isolée, Card "Next order" mock
  isolé)
- Placé après Block 2-3 pour bénéficier des **patterns shadcn → V4
  déjà rodés** (Button, Sheet validés en prod) + `CardV4 interactive`
  joue ici son **premier rôle critique**

### Block 5 — Public boutique pages (~1.5j) — patterns établis

- **Bénéficie des patterns Block 4** (CardV4 interactive validé sur
  Landing)
- 2 pages `/[handle]` + `/[handle]/[slug]` similaires structurellement
- AddToCartIcon overlay `bg-celo-forest + shadow-celo-sm` = **dernier
  polish élément forest accent** sur les cards
- ProductCard pattern semantic div (recommandation contre wrapper
  CardV4 pour préserver max click area + AddToCartIcon overlay
  positioning) — différent du Landing, plus simple
- SEO JSON-LD + redirects critiques préservés à 100% (logique
  inchangée)
- Placé en dernier car bénéficie de **tous les patterns établis**
  (`<ButtonV4>` Block 2/3, `<CardV4 interactive>` Block 4)

### Synthèse

```
Block 2 PublicHeader  →  Block 3 Cart      →  Block 4 Landing       →  Block 5 Boutique
(foundational,           (triggered by H,     (REWRITE, big visual,    (patterns établis,
 used everywhere,         validates Sheet+    validates Card           consolidates V4)
 logo identity V4)        Badge en prod)      interactive en prod)
```

Chaque block valide **1+ V4 components en production réelle** avant
le suivant. Aucun block ne dépend du suivant pour passer (chacun peut
être commit + revert indépendamment si problème).

---

## Post-J10 (pages migration phase suite)

- **J11** — Phase Transaction : marketplace + checkout + dialogs
  (StakeActionDialog, MarkGroupShippedDialog, BuyCreditsDialog,
  ProductFormDialog, DeleteProductDialog, etc.) (~5-7j)
- **J12** — Phase Ops : seller dashboard 6 tabs (Overview, Products,
  Orders, Marketing, Stake, Profile) + forms + closure cleanup legacy
  shadcn `ui/*` files (~7-10j)
- **J13** — Polish + Submission Proof of Ship + grants Celo Foundation
  (~5-7j)
- **J14** — Audit pratique freelance + AI-assisted per ADR-039 (~3-5j)
- **J15** — Mainnet + soft launch (~7-10j)

Mainnet target : **Q4 2026 — Q1 2027** per ADR-039 audit strategy.
