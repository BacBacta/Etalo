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

## Audit visuel (à compléter Block 1)

**À renseigner après audit Block 1** : inventaire par surface des
composants shadcn legacy utilisés, tokens neutral/gray à remplacer,
typography classes à swap, logique applicative à préserver.

5 surfaces dans le scope :

1. **Landing page** — `packages/web/src/app/page.tsx` + `components/HomeLanding.tsx`
   + `HomeMode.tsx` + `HomeRouter.tsx` + `FeaturedSellers.tsx`
2. **PublicHeader** — `packages/web/src/components/PublicHeader.tsx`
3. **Cart drawer** — `packages/web/src/components/CartDrawer.tsx` +
   `CartItemRow.tsx` + `CartTrigger.tsx`
4. **Public boutique** — `packages/web/src/app/[handle]/page.tsx` +
   `components/BoutiqueHeader.tsx` + `ProductGrid.tsx` + `ProductCard.tsx` +
   `EmptyState.tsx`
5. **Single product** — `packages/web/src/app/[handle]/[slug]/page.tsx` +
   `components/ShareButtons.tsx` + `ProductAddToCartButton.tsx` +
   `AddToCartIcon.tsx`

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
