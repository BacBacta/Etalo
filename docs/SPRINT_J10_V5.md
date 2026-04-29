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
   custom-styled palette V5 token-by-token. API simple : data array +
   dimensions + variant. (NOTE post-Block 4 : la mention initiale
   « recharts déjà installed J7 » était inexacte — package.json ne
   contenait pas de dep recharts. Installé Block 4 J10-V5 en
   `recharts ^3.8.1` avec lazy-load strict via next/dynamic — 0 KB
   delta routes prod, ~70 KB isolé dans chunk dynamic chargé
   on-demand uniquement quand ChartLineV5 ou SparklineV5 est rendu.)
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
- recharts custom-styled palette V5. (NOTE post-Block 4 : la mention
  initiale « déjà installed J7 — 0 KB additional » était inexacte —
  installé Block 4 J10-V5 en `recharts ^3.8.1` avec lazy-load strict
  via next/dynamic — 0 KB delta routes prod.)
- EmptyStateV5 standalone (illustration + title + desc + CTA props),
  compose CardV4 internally si shadow/border requis

### Phase 3 — CLOSURE 2026-04-29 ✅ COMPLET 7/7 blocks

**Status** : 4 composants V5 livres (SkeletonV5 / ChartLineV5 /
SparklineV5 / EmptyStateV5) + 8 illustrations Recraft.ai produites
(5 consommées : 4 empty states + landing hero ; 3 staged Phase 4 :
onboarding-welcome + 2 success). recharts ^3.8.1 installé avec
lazy-load strict via next/dynamic. 2 false-empty UX bugs fixés
(OrdersTab + OverviewTab). 1 alerte bundle caught + remédiée
pre-commit (Block 5b ButtonV4 motion injection).

**Stats** :
- 8 commits Phase 3 (Block 3a `c4fdca5` → Block 6 `ba4442e`) + closure
- +32 specs Vitest cumulés (134 → 166 PASS) — aucune régression
  sur 35 specs J7 baseline
- 4 composants V5 livres : SkeletonV5 (6 variants + shimmer),
  ChartLineV5 (recharts wrapper + 4 colors + tooltip V5),
  SparklineV5 (minimal trend + auto-color variant),
  EmptyStateV5 (default/compact + asset enum 4 illustrations +
  discriminated union action)
- 5 surfaces refactored skeleton screens (marketplace + Orders +
  Products + Overview + Marketing) + 4 surfaces refactored empty
  states (Orders + Products + Marketing + Stake)
- Bundle final `/seller/dashboard` 262 KB First Load — strict
  trigger 280 KB respecté (18 KB headroom)
- recharts ^3.8.1 ajouté avec 0 KB delta routes prod (lazy chunk
  isolé via next/dynamic ssr:false)

**Block timeline** (chronologique, commits hashes) :

| # | Block | Commit | Tests | Livrable |
|---|---|---|---|---|
| 1 | Setup illustrations specs | (docs) | — | Specs Recraft + brief 8 illustrations |
| 2 | Recraft.ai illustrations production | (SVGs+docs) | — | 8 SVG produits |
| 3a | SkeletonV5 component | `c4fdca5` | +5 → 139 | 6 variants + shimmer keyframe + /dev demo |
| 3b | 5 surfaces refactor | `c625e48` | +5 → 144 | marketplace + Orders/Products/Overview/Marketing tabs + 2 false-empty fixes |
| 4 | ChartLineV5 + SparklineV5 | `8969900` | +10 → 154 | recharts ^3.8.1 lazy-load + 2 components + /dev demo |
| 5a | EmptyStateV5 component | `b767aa2` | +5 → 159 | discriminated union action + 4 illustration assets enum |
| 5b | 4 surfaces refactor + bundle alert remediated | `91afc9c` | +7 → 166 | OrdersTab/ProductsTab/MarketingTab/StakeTab + ButtonV4 dep removed (motion injection avoided) |
| 6 | Page-level integrations | `ba4442e` | 0 → 166 | landing-hero integrated + 4 SVGs landed staged Phase 4 |
| 7 | Phase 3 closure docs (THIS) | `<closure>` | 0 → 166 | bilan + Phase 4 deferrals + recharts discrepancy fix + CLAUDE.md current sprint update |

**Bundle analysis** :
- Block 3a-3b : +1 KB `/seller/dashboard` (260 → 261) — SkeletonV5
  composant atomique reusable, refactor 5 surfaces critiques avec
  shimmer 1.5s linear infinite
- Block 4 : 0 KB delta routes prod (recharts lazy via next/dynamic
  ssr:false isole dans chunk dynamic), +1 KB `/dev/components` demo
- Block 5a : 0 KB delta routes prod (EmptyStateV5 lib-only),
  +1 KB `/dev/components` demo
- Block 5b : alerte +17 KB initial sur `/seller/dashboard` (ButtonV4
  → motion/react + Slot Radix injection inattendue) → fix
  EmptyStateV5 avec hand-rolled `<button>`/`<a>` styled match
  ButtonV4 primary, motion press-scale abandonné (faible-fréquence
  empty-state CTA). Final +1 KB (261 → 262)
- Block 6 : +1 KB `/` route (landing-hero integration markup),
  0 KB autres routes
- **Phase 3 final : +2 KB `/seller/dashboard`** (260 → 262 KB),
  trigger 280 KB largement respecté (18 KB headroom préservé pour
  Phase 4-5)

**Lessons critiques #72-#80** (9 nouveaux patterns persistés) :
- **#72** Recraft.ai brief intent prime over literal detail —
  illustration #3 (no-products) outline-only style intentionnel
  matche cohérence visuelle « vide » (Block 2 production lesson).
  Brief intent (« montrer absence ») > brief littéral
  (« 3 boîtes vides »).
- **#73** SkeletonV5 frugality cumulee — composant atomique reusable
  avec shimmer pseudo-element (`before:` gradient sweep) coûte +1 KB
  cumulee `/seller/dashboard` malgré 5 surfaces consumers (marketplace
  + Orders + Products + Overview + Marketing). Tailwind keyframe
  shimmer gratuit (CSS class).
- **#74** false-empty UX bug pattern — `data === null` (loading) vs
  `data === []` (empty) conflated dans plusieurs surfaces
  (OrdersTab + OverviewTab pre-Block 3b). Anti-flash regression-guard :
  test `loading state shows skeleton not empty state` avec
  `mockReturnValue(new Promise(() => {}))` pending promise pour
  bloquer la résolution. Pattern obligatoire toute surface
  fetch-then-render.
- **#75** recharts 3.x TypeScript `tick` prop strict —
  `fontVariantNumeric` rejeté inside `tick={{...}}` (typings
  SVGTextProps only). Workaround : CSS inline `font-variant-numeric:
  "tabular-nums"` sur le wrapper parent — propage aux SVG `<text>`
  ticks via inheritance. Documenté ChartLineV5Inner header.
- **#76** lazy import next/dynamic ssr:false — heavy libs (recharts
  ~70 KB tree-shaken) isolees dans chunk dynamique on-demand,
  0 KB delta routes prod. Pattern : `dynamic(() => import('./X'),
  { ssr: false, loading: () => <SkeletonV5 variant="card" /> })`.
  Inner component default-export pour résoudre via dynamic; tests
  ciblent l'Inner directement (jsdom ne résout pas next/dynamic).
- **#77** URL-safe SVG filename slug — Recraft.ai exports
  filenames avec espaces + em-dash (`Empty state — no orders.svg`)
  brisent paths URL. Rename systematique en slug matchant asset
  enum (`empty-no-orders.svg` matche `EmptyStateV5Asset` value
  `"no-orders"`). Convention `{prefix}-{slug}.svg`.
- **#78** discriminated union action props TS-safe —
  `{ label, onClick } | { label, href }` empêche au compile-time
  de passer les deux. Pattern : `'href' in action && action.href`
  type-narrows au branch correct. Préférable à
  `onClick?: ... ; href?: ...` qui autorise `{}`-vide ou les deux.
- **#79** decorative img + role=region — illustrations empty-state
  ont `alt="" aria-hidden="true"` (décoratives), le wrapper a
  `role="region" aria-label={title}` qui porte le sens via le
  heading. Conforme WCAG illustrations décoratives (le contenu
  textuel n'est pas dupliqué dans alt).
- **#80** transitive dep cost analysis avant import cross-tree —
  ButtonV4 → motion/react + @radix-ui/react-slot inject 17 KB
  unwanted dans `/seller/dashboard` tree (motion pas payé ailleurs
  car AnimatedNumber rAF custom Lesson #69). Composants V5 utility
  (EmptyStateV5, futurs Empty/Loading composables) doivent rester
  frugaux — préférer hand-rolled styled `<button>`/`<a>` matchant
  ButtonV4 visuel quand le component cible un bundle déjà tendu.
  Bundle alert pre-commit (delta > 5 KB) = blocker, investigate
  transitive deps.

**Tokens clés Phase 3** :
- `recharts@3.8.1` avec lazy-load strict next/dynamic ssr:false
  (Block 4 — Lesson #76)
- `keyframes.shimmer` translateX(-100% → 100%) + animation
  shimmer 1.5s linear infinite (Block 3a, coexiste celo-pulse V4)
- `EmptyStateV5Asset` enum (`no-orders` / `no-products` /
  `no-marketing` / `no-stake`) → `/illustrations/v5/empty-{key}.svg`
- 8 SVG Recraft.ai dans `packages/web/public/illustrations/v5/` :
  empty-no-orders, empty-no-products, empty-no-marketing,
  empty-no-stake, landing-hero, onboarding-welcome,
  success-first-sale, success-withdrawal-complete

**Carry-overs Phase 4** (deferrals scope-honest) :
- ChartLineV5 wire-up OverviewTab revenue 7d : `/api/v1/analytics/summary`
  endpoint existe dans OpenAPI (RevenueBlock.timeline_7d), MAIS
  aucun fetcher frontend wired. Real-data integration scope Phase 4
  « Migration applications V5 sur pages cles ». Mock data sur
  surface prod = anti-pattern.
- SparklineV5 wire-up : aucun endpoint trend exposé pour credits
  usage / per-product sales / seller KPIs. Phase 4 expose
  endpoints d'abord, puis consumer choice (CreditsBalance /
  ProductCard / OverviewTab tier card).
- MilestoneDialogV5 component creation + first-sale +
  withdrawal-complete triggers : nouveau composant Phase 4 +
  tracking logic count first order Released / post-tx withdrawal
  callback. Confetti milestone existe deja Phase 2 Block 7 ;
  Dialog modal créerait double-célébration sans ce nouveau
  composant.
- OnboardingScreenV5 V1 : consume `onboarding-welcome.svg` pour
  landing first-time user flow (Phase 4 plan Block 4 existing).

**Pas de tag intermédiaire** (Option A confirmée Phase 1) — tag
final `v2.0.0-design-system-v5-sepolia` post Phase 5 closure J10-V5.

**Sign-off** : Phase 3 visuals premium COMPLETE. 7/7 blocks livrés
(plus 1 closure docs). Tests 166/166 PASS, bundle
`/seller/dashboard` 262 KB First Load (trigger 280 KB respecté,
18 KB headroom), 2 false-empty UX bugs fixés au passage, 1 alerte
bundle caught + remédiée pre-commit. Discipline frugality preservée
via lazy-load + transitive dep audit. Ready pour Phase 4 (Layout
refactor + V5 applications migration, 5-7j) — wiring data fetcher
analytics + cards depth + top tabs Robinhood-styled +
OnboardingScreenV5 + MilestoneDialogV5.

### Phase 4 — Layout refactor (5-7j)

Goal : cards depth + top tabs Robinhood-styled (PAS bottom nav, conflict MiniPay) + onboarding V1 + Phase 3 carry-overs (data wiring + MilestoneDialogV5).

**Carry-overs Phase 3 (rationale détaillée Phase 3 closure section)** :
- **ChartLineV5 wire-up OverviewTab revenue 7d** : analytics fetcher
  à créer dans `lib/seller-api.ts` consumer
  `/api/v1/analytics/summary` (RevenueBlock.timeline_7d).
  Composant ChartLineV5 lui-même livré Block 4 Phase 3 (lazy-load
  recharts). À intégrer dans Block 5 Phase 4 (« Migration
  applications V5 sur pages cles »).
- **SparklineV5 wire-up** : trend backend endpoints à exposer
  d'abord (credits usage / per-product sales / seller KPIs), puis
  consumer choice (CreditsBalance / ProductCard / OverviewTab tier
  card). À ajouter Block 5 Phase 4 si endpoints prêts, sinon
  reporter Phase 5.
- **MilestoneDialogV5 component creation + 2 triggers** : nouveau
  composant Phase 4 wrapping `success-first-sale.svg` +
  `success-withdrawal-complete.svg` (assets staged Phase 3). Wire
  triggers : count first order Released → fire dialog
  une-fois-only (localStorage flag), withdrawal-complete →
  post-tx success callback. Confetti milestone Phase 2 Block 7
  reste, dialog vient en complément (illustration + copy explicit
  + dismiss ack vs confetti seul).

**Blocks** :

1. **Plan Phase 4 + competitive analysis Robinhood layout** (0.5j) — capture screenshots Robinhood marketplace + dashboard + onboarding pour reference
2. **Cards refactor depth + shadows tuning** (2-3j) — toutes les cards (ProductCard, MarketplaceProductCard, FeaturedSellers, dashboard cards) → depth Robinhood-style avec shadows celo-md/lg/hero plus tuned
3. **Top tabs Robinhood-styled SellerDashboardInner** (1-2j) — sliding indicator animated entre tabs + scroll-aware auto-hide (PAS bottom nav, conflict MiniPay)
4. **OnboardingScreenV5 component + 3-screen flow V1** (2-3j) — Welcome / What you can do / Get started + skippable + persist localStorage. Consume `onboarding-welcome.svg` (Phase 3 staged asset).
5. **Migration applications V5 sur pages cles** (2j) — landing + marketplace + seller dashboard + checkout flow → utiliser tous les patterns V5 (cards depth, top tabs animated, illustrations). Inclut **ChartLineV5 wire-up OverviewTab** + **SparklineV5 wire-up** si endpoints prêts (carry-overs Phase 3).
6. **MilestoneDialogV5 component + 2 triggers wired** (1-1.5j) — nouveau composant + first-sale + withdrawal-complete + tests regression-guard one-shot localStorage flag (carry-over Phase 3).
7. **Closure Phase 4** (0.5j) — bilan + commit + tag intermediaire optionnel

**Validation** : visual check pages cles cohérentes, mobile responsive, onboarding flow smooth, MilestoneDialogV5 fires une-fois-only post first-sale + withdrawal.

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
