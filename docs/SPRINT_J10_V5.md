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

### Phase 2 — CLOSURE 2026-04-29 ✅ COMPLET 9/9 blocks

**Status** : 5 V4 components extension Motion (Button press, Card lift,
Tabs sliding indicator, Dialog fade+zoom, Sheet slide per side) + 3
nouvelles utilities (PageTransition App Router, fireMilestone 5
confetti presets, AnimatedNumber rAF tween). All animations smooth +
bundle budget respecté strict.

**Stats** :
- 10 commits Phase 2 (Block 1 `c6a0c64` → Block 8 v3 `280016b`) + closure
- +14 specs Vitest cumulés (120 → 134 PASS)
- 5 V4 components extension Motion
- 3 utilities/wrappers : PageTransition (Next.js App Router),
  fireMilestone (5 confetti presets palette V5 exact + a11y),
  AnimatedNumber (custom rAF tween easeOutCubic)
- Bundle final `/seller/dashboard` 260 KB First Load — strict trigger
  respect 280 KB après refactor v3 Block 8 (motion hooks abandonnés
  pour AnimatedNumber au profit rAF native)

**Block timeline** (chronologique, commits hashes) :

| Block | Item | Commit | Date |
|---|---|---|---|
| 1 | Motion library setup + LazyMotion scaffold | `c6a0c64` | 2026-04-29 |
| 2 | ButtonV4 motion press + hover + V5 doc align | `8980e72` | 2026-04-29 |
| 3 | CardV4 motion hover lift | `2a2692c` | 2026-04-29 |
| 4 | Page transitions Next.js App Router | `9d7df39` | 2026-04-29 |
| 5 | TabsV4 sliding indicator | `41b1572` | 2026-04-29 |
| 6 | DialogV4 + SheetV4 motion entry animations | `00b0d1c` | 2026-04-29 |
| 7 | canvas-confetti milestones (5 presets + 4 wired) | `6731a60` | 2026-04-29 |
| 8 v1 | AnimatedNumber animate() imperative (+28 KB alert) | `db820f8` | 2026-04-29 |
| 8 v2 | AnimatedNumber useSpring refactor (282 KB still over) | `34b985f` | 2026-04-29 |
| 8 v3 | AnimatedNumber custom rAF tween (0 KB delta restored) | `280016b` | 2026-04-29 |
| 9 | Phase 2 closure docs (THIS) | `<closure>` | 2026-04-29 |

**Tokens motion utilisés** :
- `motion@12.38.0` + `LazyMotion features={domAnimation} strict` (Block 1 scaffold)
- `m.div` / `m.span` / `m.button` declarative components
- `AnimatePresence` (mode="wait" PageTransition, default Dialog/Sheet/Tabs)
- `forceMount` + `asChild` Radix integration pattern (Block 6 — Lesson #71)
- `canvas-confetti@1.9.4` + V5 palette EXACT tailwind.config.ts tokens (Block 7)
- `requestAnimationFrame` + `easeOutCubic` custom (Block 8 v3 final — abandonne motion pour AnimatedNumber suite bundle alert Block 8 v1/v2)

**Bundle analysis** :
- Block 1-6 : 0 KB delta production routes (motion runtime baseline
  established Block 1, declarative `m.*` chargé via LazyMotion
  `domAnimation` features chunk shared)
- Block 7 : `canvas-confetti` +5 KB `/seller/dashboard` (3 consumers
  OrdersTab + StakeActionDialog + MarketingTab)
- Block 8 v1 : `animate()` imperative +28 KB → trigger 280 KB dépassé
- Block 8 v2 : useSpring -6 KB (282 KB still 2 KB over) — hooks
  motion/react main bundle pas tree-shakable depuis LazyMotion chunk
- Block 8 v3 : custom rAF -22 KB (260 KB restored strict)
- **Phase 2 final budget-neutral** vs Phase 1 closure baseline + Block 1
  motion setup

**Lessons critiques #65-#71** (7 nouveaux patterns persistés) :
- **#65** LazyMotion `features={domAnimation}` chunk vs hooks main
  bundle — `m.div`/`m.span` declarative bénéficient du lazy chunk,
  mais `useSpring`/`useTransform`/`animate()` hooks viennent du main
  bundle motion/react (pas tree-shakable côté hooks). Bundle savings
  via LazyMotion limité aux features visuelles drag/layout/gesture.
- **#66** canvas-confetti palette V5 EXACTE vs hex approximations —
  toujours utiliser tailwind.config.ts tokens directement (forest
  #476520, forest-bright #5C8B2D, yellow #FBCC5C, light #FCFBF7,
  green #00C853 Robinhood signature). Anti-approximation lock pour
  cohérence visuelle multi-surface.
- **#67** `MotionGlobalConfig.skipAnimations = true` test setup —
  sans ça, AnimatePresence exit garde child mounted pendant tick RAF
  JSDom → assertions sync `not.toBeInTheDocument()` cassent
  (DialogV4 / SheetV4 specs Block 6 Esc + close button tests).
- **#68** `vi.mock("canvas-confetti")` global test setup — JSDom
  canvas null `getContext("2d")` → `clearRect` crash dans RAF loop si
  tests adjacents (MarketingTab, BuyCreditsDialog) trigger success
  path qui fire confetti. Mock global au setup neutralise le crash.
- **#69** Bundle trigger respect via custom rAF tween standalone —
  motion hooks (useSpring/useTransform) coûtent ~22 KB First Load
  malgré LazyMotion déjà chargée pour les features. Pour composants
  animés simples (counter), custom rAF + easeOutCubic coûte 0 KB
  bundle et delivers identique perception visuelle (Block 8 v3).
- **#70** Spring tunings différenciés Dialog 350/28 (fade+zoom)
  vs Sheet 350/30 (translation pure) — translation pure feel plus
  lourd visuellement, damping plus haut évite overshoot bouncy.
  Adapter physics tuning per shape, pas one-size-fits-all.
- **#71** Radix `forceMount` + `asChild m.div` pattern AnimatePresence
  exit animations — pattern documenté Radix→Framer Motion.
  `DialogPrimitive.Portal/Overlay/Content forceMount` + `asChild`
  délègue mount/unmount à motion. Sans forceMount, Radix unmount
  immédiat kill l'exit animation. Wrapper Context lift open state
  pour que Content read open via context (API publique préservée
  100% pour consumers).

**Pas de tag intermédiaire** (Option A confirmée Phase 1) — tag final
`v2.0.0-design-system-v5-sepolia` post Phase 5 closure J10-V5.

**Sign-off** : Phase 2 motion + interactions COMPLETE. 9/9 blocks
livrés. Tests 134/134 PASS, bundle `/seller/dashboard` 260 KB First
Load (strict trigger respect 280 KB), 0 régression. Ready pour
Phase 3 (Visuals premium, 7-10j) — Recraft.ai illustrations +
skeleton screens + charts integration. Mike's time investment
Phase 3 : ~5-10h validation cycles Recraft.ai.

### Phase 3 — Visuals premium (7-10j)

Goal : illustrations custom + skeleton screens + charts integration.

**Plan refined Block 1 (2026-04-29)** : 7 blocks atomiques (vs 10 initial
trop granulaire, production sessions consolidées en 1 block, component
creation + refactor mergés par feature area).

**Blocks** :

1. **Setup + illustrations production specs** (0.5j) — docs Block 1 :
   8 Recraft.ai prompts ready-to-use + style guide tightening + Phase 3
   plan refined + top 5 surfaces skeleton identifiées + decisions
   verrouillées (Recraft Pro $12, recharts, EmptyStateV5 standalone)
2. **Recraft.ai subscription + illustrations production** (2-3j) — Mike
   souscrit Recraft Pro $12/mois, itère 8 illustrations (1 hero + 4
   empty + 2 success + 1 onboarding) avec ~5-10h validation cycles
   cumulés (3-6 cycles per illustration). Output : 8 SVG dans
   `packages/web/public/illustrations/v5/`. Cancel sub post-Block 2.
3. **SkeletonV5 component + systematic refactor** (1.5-2j) — création
   `packages/web/src/components/ui/v5/Skeleton.tsx` avec variants
   text/circle/rectangle/card + shimmer animation. Replace top 5
   surfaces critiques : marketplace + OrdersTab + ProductsTab +
   OverviewTab + MarketingTab GeneratedAssets.
4. **ChartLineV5 + SparklineV5 components** (1j) — wrappers recharts
   custom-styled palette V5 token-by-token (déjà installed J7, 0 KB
   additional). API simple : data array + dimensions + variant.
5. **EmptyStateV5 component + 3-4 empty states refactor** (1.5-2j) —
   création EmptyStateV5 standalone (illustration + title + desc + CTA
   props). Wire OrdersTab + ProductsTab + MarketingTab + StakeTab avec
   illustrations Block 2 + CTA proactives.
6. **Integration applications page-level** (0.5-1j) — landing hero
   illustration wired + sparklines CreditsBalance (si data over time
   disponible) + skeleton screens systematic.
7. **Closure Phase 3** (0.5j) — bilan + commit closure docs (pas de tag
   intermédiaire, Option A confirmée).

**Validation** : illustrations rendues, skeleton screens partout, charts
custom-styled, empty states engagement, Mike valide qualitativement.

**Mike's time investment** : ~5-10h cumule juste pour validation
Recraft.ai illustrations cycles Block 2.

**Decisions Block 1 verrouillées** :
- Recraft.ai Pro $12/mois (SVG vectoriel scalable, Midjourney raster
  rejeté, SD local qualité variable)
- recharts (déjà installed J7) custom-styled palette V5 — 0 KB additional
- EmptyStateV5 standalone (illustration + title + desc + CTA props),
  compose CardV4 internally si shadow/border requis

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
