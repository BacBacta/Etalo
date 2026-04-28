# Sprint J10-V5 — Design System V5 Robinhood-target (mai-juin 2026)

## Objectif

Pivoter le design Etalo de V4 (earth-inspired sober minimalism) vers V5 (Robinhood-target bold dark-first premium 2026). Etablir foundations V5 + extension component library V4 → V5 + layout refactor + polish + Proof of Ship submission.

## Reference design

Robinhood post-2024 redesign : dark-first, bold typography, motion-rich, custom illustrations, tabular nums prominents, card-heavy layout.

**Voir aussi** : `docs/DESIGN_V5_PREVIEW.md` (spec complete) + `docs/DECISIONS.md` ADR-040 (pivot rationale).

## Decisions verrouillees Phase 1

- **Approche** : extension V4 component library → V5 (pas rewrite from scratch)
- **Cible quality** : 75-85% Robinhood-quality realistic (pas 90% comme initialement souhaite)
- **Effort estime** : 6-10 semaines wall-clock (avec buffer 30% solo dev)
- **Mainnet target** : Q2 2027 (avril-juin 2027) realistic
- **Budget** : ~$50-80 (Recraft.ai 1 mois + maybe Aeonik fallback)
- **Plan B grants Celo Sept 2026** : check-point 6 semaines, soumission V4 + V5 preview si pivot derape

## Toolkit verrouille

| Item | Cout | Phase usage |
|---|---|---|
| Switzer typeface (Indian Type Foundry, gratuit) | $0 | Phase 1 |
| Phosphor Icons (5 weights, MIT) | $0 | Phase 1 |
| Framer Motion ou Motion vanilla | $0 | Phase 2 |
| canvas-confetti | $0 | Phase 2 |
| recharts (deja installe J7) | $0 | Phase 3 |
| Lottie + LottieFiles | $0 | Phase 3 |
| Recraft.ai 1 mois | ~$12 | Phase 3 (illustrations) |
| Aeonik typeface optionnel fallback | ~$50 | Phase 1 si Switzer pas assez premium |

**Total : ~$50-80 max**

## Branche

`feat/design-system-v5` cree depuis `feat/design-vitrine-v4` HEAD = `35d12f2` (preserve Block 2 PublicHeader work qui restera relevant). Branche `feat/design-vitrine-v4` reste ouverte audit trail.

## 5 phases (sprints J10-V5 a J10-V5e ou splits selon validation Mike)

### Phase 1 — Foundations elevation (8-10j)

Goal : foundations V5 en place sans casser V4 baseline. Tokens + typography + iconography + dark mode + performance budget.

**Blocks** :

1. **Setup branche + ADR-040 commit + DESIGN_V5_PREVIEW.md commit** (0.5j) — chore(j10-v5): launch sprint J10-V5 + plan
2. **Switzer typeface swap** (1j) — replace Inter par Switzer dans tailwind.config.ts + layout.tsx + tous les `font-sans` references
3. **Dark mode tokens extension tailwind.config.ts** (1j) — palette celo-dark-bg/elevated/surface + variants celo-light dark adapted + status colors dark
4. **next-themes integration + ThemeProvider** (1j) — ThemeProvider component + persist user choice + default dark
5. **V4 components extension dark variants** (4-5j) — Button + Input + Card + Dialog + Sheet + Tabs + Badge + Toast → ajout `dark:` variants partout
6. **Phosphor Icons swap** (1j) — install @phosphor-icons/react + replace lucide-react references (estimation 50-100 occurrences)
7. **Performance budget setup** (1j) — webpack-bundle-analyzer + monitoring routes principales <300 KB First Load
8. **Closure Phase 1** (0.5j) — PR + tag intermediaire `v2.0.0-design-v5-foundations-sepolia` (optionnel selon strategie tags)

**Validation** : npm run build clean, vitest 93+ updated PASS, dark mode toggle fonctionne, Switzer rendu, Phosphor partout, bundle size mesure.

### Phase 1 — CLOSURE 2026-04-29 ✅ COMPLET 11/11 blocks

**Status** : 8/8 V4 components dark variants livrés + Switzer typeface +
next-themes + Phosphor Icons + perf budget setup. Foundations V5 prêtes
pour Phase 2 Motion.

**Stats** :
- 16 commits Phase 1 (Setup → Block 7 closure)
- +27 specs Vitest (93 → 120 PASS)
- 8/8 V4 components dark variants
- 21 fichiers migrés lucide-react → Phosphor
- Worst-case bundle `/seller/dashboard` 256 KB (85% du budget 300 KB,
  marge 44 KB pour Phase 2-5)

**Block timeline** (chronologique, commits hashes) :

| Block | Item | Commit | Date |
|---|---|---|---|
| Setup | launch sprint J10-V5 + plan | `41a0470` | 2026-04-27 |
| Setup | complete setup ADR-040 + V4 deprecation | `6a2a702` | 2026-04-27 |
| 1 | Switzer typeface swap | `fad4445` | 2026-04-27 |
| 2 | Dark mode palette tokens | `3013452` | 2026-04-27 |
| 2 | docs align V5 doc Block 2 token rename | `adfc877` | 2026-04-27 |
| 3 | next-themes integration + dark mode toggle | `e283263` | 2026-04-27 |
| 4a | Dark mode foundations + V4 migration backport | `a488780` | 2026-04-28 |
| 4a-fix | aria-label hydration mismatch theme toggle | `a2f9522` | 2026-04-28 |
| 4b | ButtonV4 dark variants | `21b9f20` | 2026-04-28 |
| 4b | docs align V5 doc Block 4b primary CTA pattern | `b7bc339` | 2026-04-28 |
| 4c | InputV4 + CardV4 dark variants | `3a92e65` | 2026-04-28 |
| 4d | DialogV4 + SheetV4 dark variants | `1311c31` | 2026-04-28 |
| 4e | TabsV4 + BadgeV4 + ToastV4 dark variants (8/8 complete) | `566f7d2` | 2026-04-28 |
| 5 | Phosphor Icons swap (21 files) | `648fd92` | 2026-04-28 |
| 6 | Performance budget setup + baseline | `3b4c9e2` | 2026-04-29 |
| 7 | Phase 1 closure docs (THIS) | `<closure>` | 2026-04-29 |

**Tokens V5 ajoutés** :
- `celo-light-subtle` (Block 2)
- `celo-dark-bg` / `celo-dark-elevated` / `celo-dark-surface` (Block 2)
- `celo-forest-bright` / `celo-red-bright` / `celo-blue-bright` (Block 2)
- `celo-green` / `celo-blue` (Block 2)
- `celo-green-hover` (Block 4b)
- `celo-forest-bright-soft` (Block 4b)
- `celo-red-bright-soft` (Block 4e)

**Pas de tag intermédiaire** (Option A confirmée) — tag final
`v2.0.0-design-system-v5-sepolia` post Phase 5 closure J10-V5.

**Sign-off** : Phase 1 foundations COMPLETE. Ready pour Phase 2 (Motion +
interactions, 5-7j) — décision library Framer Motion vs Motion vanilla
post mesure bundle impact.

### Phase 2 — Motion + interactions (5-7j)

Goal : 10-15 micro-animations cles + page transitions + button feedback + confetti milestones.

**Blocks** :

1. **Plan Phase 2 + bundle size decision Framer Motion vs Motion vanilla** (0.5j) — mesurer impact, decider library
2. **Library install + setup** (0.5j) — Framer Motion ou Motion vanilla
3. **ButtonV4 extension Motion** (0.5j) — press scale 0.98 + hover smooth
4. **CardV4 extension Motion** (0.5j) — interactive hover lift translate-y-[-2px] + shadow shift
5. **Page transitions Next.js** (1-2j) — fade-slide subtle entre routes, AnimatePresence wrapper
6. **TabsV4 extension Motion** (0.5j) — sliding indicator animated entre tabs
7. **DialogV4 + SheetV4 polish Motion** (0.5j) — entry animations enhanced beyond Radix builtins
8. **canvas-confetti install + 5 milestones** (1j) — premier sale, withdrawal complete, credit purchase, image generated, onboarding complete
9. **Number counter animations** (1j) — amounts USDT animate sur change (balance updates)
10. **Closure Phase 2** (0.5j) — bilan + commit + tag intermediaire optionnel

**Validation** : visual check toutes animations smooth, no jank, bundle size respecte budget Phase 1.

### Phase 3 — Visuals premium (7-10j)

Goal : illustrations custom + skeleton screens + charts integration.

**Blocks** :

1. **Plan Phase 3 + Recraft.ai setup** (0.5j) — Mike subscribe ($12), familiarize tool
2. **Recraft.ai illustrations production session 1** (2-3j) — Mike + Cowork generate + validate 3-4 illustrations cles (landing hero + 2-3 empty states critiques). 5-10h Mike's time investment validation cycles.
3. **Recraft.ai illustrations production session 2** (2-3j) — generate + validate 3-4 illustrations restantes (success states + error states + onboarding)
4. **SkeletonV5 component creation** (0.5j) — `packages/web/src/components/ui/v5/Skeleton.tsx` avec variants text/circle/rectangle/card + shimmer animation
5. **Skeleton screens systematic refactor** (2-3j) — replace tous les spinners actuels par skeleton screens (marketplace, dashboard tabs, single product, asset generation page)
6. **EmptyStateV5 component creation** (0.5j) — wrapper avec illustration + copy + CTA proactive
7. **Empty states systematic refactor** (1-2j) — boutique vide, marketing tab no images, orders tab no orders, stake tab no stake (CTAs proactifs)
8. **ChartLineV5 + SparklineV5 components** (1j) — wrappers recharts custom-styled palette V5
9. **Sparklines integration credit balance + USDT prices** (1j) — embed dans CreditsBalance + ProductCard si applicable
10. **Closure Phase 3** (0.5j) — bilan + commit + tag intermediaire optionnel

**Validation** : illustrations rendues, skeleton screens partout, charts custom-styled, empty states engagement, Mike valide qualitativement.

**Mike's time investment** : ~5-10h cumule juste pour validation Recraft.ai illustrations cycles.

### Phase 4 — Layout refactor (5-7j)

Goal : cards depth + top tabs Robinhood-styled (PAS bottom nav, conflict MiniPay) + onboarding V1.

**Blocks** :

1. **Plan Phase 4 + competitive analysis Robinhood layout** (0.5j) — capture screenshots Robinhood marketplace + dashboard + onboarding pour reference
2. **Cards refactor depth + shadows tuning** (2-3j) — toutes les cards (ProductCard, MarketplaceProductCard, FeaturedSellers, dashboard cards) → depth Robinhood-style avec shadows celo-md/lg/hero plus tuned
3. **Top tabs Robinhood-styled SellerDashboardInner** (1-2j) — sliding indicator animated entre tabs + scroll-aware auto-hide (PAS bottom nav, conflict MiniPay)
4. **OnboardingScreenV5 component + 3-screen flow V1** (2-3j) — Welcome / What you can do / Get started + skippable + persist localStorage
5. **Migration applications V5 sur pages cles** (2j) — landing + marketplace + seller dashboard + checkout flow → utiliser tous les patterns V5 (cards depth, top tabs animated, illustrations)
6. **Closure Phase 4** (0.5j) — bilan + commit + tag intermediaire optionnel

**Validation** : visual check pages cles cohérentes, mobile responsive, onboarding flow smooth.

### Phase 5 — Polish + Submission (5-7j)

Goal : tabular nums + mobile gestures + side-by-side QA pass + Proof of Ship + grants.

**Blocks** :

1. **Tabular nums systematic application** (1j) — `font-feature-settings: "tnum"` partout sur amounts USDT, credit balance, transaction counts, sparkline values
2. **Mobile gestures critiques** (1-2j) — swipe-to-close cart drawer + pull-to-refresh marketplace
3. **Side-by-side comparison Robinhood QA pass** (1j) — Mike capture screenshots + compare 10 critères (typography, spacing, contrast, motion, density, icons, depth, tabular nums, empty states, loading)
4. **Polish details pass** (1-2j) — hover states cohérents, transitions 200ms uniformes, micro-spacings ajustes selon QA findings
5. **Demo video 3 min** (1j) — screen capture flow buyer + flow seller end-to-end avec V5 design
6. **Karma GAP profile + Farcaster post + repo README polish** (1j) — submission package preparation
7. **Submission package** (1-2j) — ToS draft, Privacy draft, Support URL setup, icon 512×512, manifest, sample tx links
8. **Grants application Celo Foundation** (1-2j) — formulaire complet + dossier + reference V5 design + tag preview
9. **Closure J10-V5 final** (0.5j) — PR #7 final + tag `v2.0.0-design-system-v5-sepolia` + bilan complet sprint

**Validation** : tout V5 complet, side-by-side comparison Mike valide qualitative 75-85% Robinhood-feel, submission Proof of Ship envoye, grants Celo applique.

## Plan B grants Celo Sept 2026

Check-point a 6 semaines :

- Si Phase 1 + 2 + 3 done (foundations + motion + visuals) → continuer V5 puis submission grants avec V5 ready Phase 5
- Si seulement Phase 1 + 2 done → soumettre grants Celo Sept 2026 avec V4 + V5 demo preview (mockups Recraft.ai)
- Pas de risk de manquer le grants window absolu

## Plan B audit pratique ADR-039

Pas de conflict avec design pivot V5 :
- Audit V1 freelance + AI per ADR-039 = SMART CONTRACTS only
- Design pivot V5 = FRONTEND only
- Pas de chevauchement code → audit et pivot run en parallele

Audit pratique peut commencer Phase 1 ou Phase 2 V5 selon dispo freelance.

## Criteres reussite J10-V5 final

- DESIGN_V5_PREVIEW.md livre et valide Mike
- ADR-040 commit dans DECISIONS.md
- 5 phases executees end-to-end
- 8 V4 components etendus dark variants + Motion props
- 5 nouveaux V5 components livres (Skeleton, ChartLine, Sparkline, OnboardingScreen, EmptyState)
- 5-8 illustrations Recraft.ai validees Mike
- Skeleton screens systematic partout
- Top tabs Robinhood-styled (PAS bottom nav)
- Onboarding flow V1 livre
- Side-by-side comparison Robinhood : 75-85% quality validate Mike
- Mobile gestures critiques (swipe-to-close cart, pull-to-refresh marketplace)
- Performance budget respecte (<300 KB First Load routes principales)
- Demo video 3 min livree
- Karma GAP + Farcaster + README polish
- Submission Proof of Ship envoye
- Grants application Celo Foundation deposee
- PR #7 + tag `v2.0.0-design-system-v5-sepolia` poses
- Memory checkpoint J10-V5 closure

## Tags strategy

Option A (1 tag final) : `v2.0.0-design-system-v5-sepolia` au end-of-Phase-5 closure J10-V5.

Option B (tags intermediaires par phase) : `v2.0.0-design-v5-foundations-sepolia` (Phase 1) + `v2.0.0-design-v5-motion-sepolia` (Phase 2) + `v2.0.0-design-v5-visuals-sepolia` (Phase 3) + `v2.0.0-design-v5-layout-sepolia` (Phase 4) + `v2.0.0-design-system-v5-sepolia` (Phase 5).

**Recommandation** : Option A pour simplicite + coherence J4-J9 patterns (1 sprint = 1 tag). Mais possibilite Option B si grants timing critique force Phase 1+2 reference precoce.

## Roadmap restante post-J10-V5

| Sprint | Phase | Scope | Tag |
|---|---|---|---|
| J10-V5 | 5 phases | Pivot V5 Robinhood + Proof of Ship + grants | v2.0.0-design-system-v5-sepolia |
| J11 | Audit pratique | Freelance + AI per ADR-039 | — |
| J12 | Mainnet + soft launch | Deploy Celo mainnet + 10-20 sellers curated | v2.0.0-mainnet-v1 |
| J13+ | V1.5 backlog | Items deferred per docs/V1.5_BACKLOG.md | — |

**Mainnet target** : Q2 2027 (avril-juin 2027) realistic.

## Voir aussi

- `docs/DECISIONS.md` ADR-040 (pivot rationale)
- `docs/DESIGN_V5_PREVIEW.md` (spec complete)
- `docs/SPRINT_J9.md` (V4 component library livree, base extension V5)
- `docs/V1.5_BACKLOG.md` (items deferred V1.5+)
