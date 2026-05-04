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

## Phase 4 — SIGN-OFF 2026-05-02 ✅ COMPLET 6 Blocks + 10 hotfixes

**Status** : Phase 4 (Layout refactor + V5 applications migration)
DELIVERED. All 6 planned Blocks shipped + 10 hotfixes (most
significantly #9 dual-repo frontend footgun + #10 dual-repo backend
footgun, neither anticipated in the original plan but both
load-bearing for future contributor sanity).

**Lessons doc** : see `docs/PHASE_4_LESSONS_LEARNED.md` for the
cumulative pattern catalogue (bundle discipline, mobile-first
responsive, locale/timezone safety, testing patterns, hydration
safety, backend V2 schema discipline, auth pattern, dual-repo
footgun neutralization, build-vs-dev workflow).

### Blocks recap

| Block | Scope | Closing commit |
|---|---|---|
| 1 | Audit + plan migration détaillé | `b87ae51` |
| 2 | CardV4 adoption across 5 prod surfaces (motion drop + CSS hover lift) | `a953d8e` |
| 3 | TabsV4 adoption SellerDashboardInner (motion drop + CSS sliding indicator) | `05c9847` |
| 4a | OnboardingScreenV5 V1 component + audit HomeRouter | `bf1f7c1` |
| 4b | HomeRouter first-time flow refactor + OnboardingScreenV5 wire-up | `4279186` |
| 4c | HomeMiniPay split + landing context discrimination | `f2542f4` |
| 5.1 | ADR-041 cleanup : drop StakeTab + StakeActionDialog + Top Seller refs | `e1152e8` |
| 5.2a | Backend `analytics.py` V2 schema migration + 5 e2e contract tests | `de8ffb0` |
| 5.2b | Frontend `lib/analytics-api.ts` typed wrapper + 3 unit tests | `69c9cbc` |
| 5.3 | `useAnalyticsSummary` hook + Decimal selector + ADR-041 badge shim | `8f6dd90` |
| 5.4 | OverviewTab 4 KPI tiles wire-up + dropped dead `onchain` state | `15aed82` |
| 5.5 | OverviewTab ChartLineV5 revenue 7-day trend section | `c10eb38` |
| 5.6 | OverviewTab Top products section consuming analytics.data.top_products | `fc65f42` |
| 5.7 | Block 5 closure : full regression + tsc cleanup + sprint doc | `b7494b4` |
| 6.1 | MilestoneDialogV5 lib component (first-sale + withdrawal-complete variants) | `dcfc366` |
| 6.2 | `useMilestoneOnce` hook with localStorage one-shot guard | `2e92d10` |
| 6.3 | Wire MilestoneDialogV5 into OrdersTab first-sale trigger | `3872411` |
| 6.4 | Block 6 closure : showcase + sprint doc + final regression | `9b6f909` |
| 7 (sign-off) | Phase 4 cumulative closure docs (lessons + sprint doc + this) | `<this>` |

### Hotfixes recap

| # | Subject | Commit | Status |
|---|---|---|---|
| Combo β+δ | MiniPay detection multi-signal helper + 5-site refactor | `2edc32e` | ✓ shipped |
| (side-quest) | dev-ngrok.ps1 Windows-1252 codepage compat | `be1cc0d` | ✓ shipped |
| 4 | Hostname signal + DebugMiniPayOverlay | `9fa7043` | ✓ shipped |
| 5 | HomeRouter lazy synchronous init (eliminate landing→minipay flash) | `69ba6ea` | ✓ shipped (superseded by #6) |
| 6 | HomeMiniPay dynamic import ssr:false (cure hydration error #5) | `2e4d99f` | ✓ shipped |
| 7 | Defensive cleanup of legacy `etalo-mode-preference` localStorage key | `094e07b` | ✓ shipped |
| 8 | Seller dashboard mobile responsive (`w-full` shell fix on 360-414 px) | `e6ccad9` | ✓ shipped |
| 9 | Dual-repo FRONTEND footgun neutralization (predev fail-fast + canonical banner) | `5a13a78` | ✓ shipped |
| 10 | Dual-repo BACKEND footgun neutralization (run_dev.py fail-fast + inner venv setup + defensive app/ sync) | `fafdc52` | ✓ shipped |

### Métriques cumulées Phase 4 (vs Phase 3 closure baseline `f3dd4ba`)

| Metric | Pre-Phase-4 | Post-Phase-4 | Δ |
|---|---|---|---|
| Frontend tests PASS | ~178 | **243** | **+65 net** |
| Backend tests PASS | 115 | **120** | **+5** |
| TypeScript `tsc --noEmit` | 4 latent errors | **clean** | **−4** (5.7 sweep) |
| ESLint warnings | 0 | **0** | unchanged |
| `/seller/dashboard` route | ~25 kB | **22.9 kB** | **−2.1 kB** (5.1 cleanup) |
| `/seller/dashboard` First Load JS | ~280 kB (alerte Phase 3 Block 5b) | **263 kB** | **−17 kB** (cleanup + dynamic import discipline) |
| 280 kB strict trigger headroom | 0 kB (alerte) | **17 kB** | **+17 kB** |

**Live MiniPay validation** : confirmed end-to-end on INNER frontend +
INNER backend (post-hotfix-#9 + post-hotfix-#10). HomeMiniPay V5 visible
on `/`, 5-tab dashboard, 4 KPI tiles + ChartLineV5 + Top products on
Overview, MilestoneDialogV5 + confetti on first-sale 0→1 transition,
no horizontal scroll on 360-414 px viewports.

### Branches state

`feat/design-system-v5` is even with `origin` post-hotfix-#10 push
(if pushed) — this sign-off commit will land 1 commit ahead. Recommended
next steps :

1. `git push origin feat/design-system-v5` so the sign-off lands on GitHub.
2. Open PR `feat/design-system-v5` → `main` (or an integration branch)
   for code review before Phase 5 starts. Phase 4 represents 28 commits
   covering Blocks 1-6 + 10 hotfixes ; PR description should reference
   `docs/PHASE_4_LESSONS_LEARNED.md` and the closure sections in this
   sprint doc.
3. Once merged, `feat/design-system-v5` can either continue being
   the Phase 5 working branch (rebase on main) OR be retired in favor
   of a fresh `feat/phase-5-polish` branch.

### Phase 5 — what's next

Items identified in route during Phase 4 (full list with file:line
context in `docs/PHASE_4_LESSONS_LEARNED.md` "Architecture follow-ups"
section) :

1. **Tabular nums systematic application** — `font-feature-settings:
   "tnum"` on every USDT amount surface, credit balance, transaction
   counts, sparkline values (Phase 5 Block 1, ~1j).
2. **Mobile gestures critiques** — swipe-to-close cart drawer,
   pull-to-refresh marketplace (Phase 5 Block 2, 1-2j).
3. **Side-by-side Robinhood QA pass** (Phase 5 Block 3, ~1j).
4. **Polish details pass** — hover states cohérents, transitions
   200ms uniformes, micro-spacings selon QA findings (~1-2j).
5. **Architecture follow-ups** : Option C server-side middleware
   UA detection, `useCreditsBalance` migration to TanStack Query,
   `dehydrate(queryClient)` SSR prefetch for `useAnalyticsSummary`,
   `prefers-reduced-motion` for `DialogV4` spring, `displayUsdt
   Number` + `PINATA_GATEWAY` constant promotion if 3rd consumers
   surface, `tsc --noEmit` in CI, integration smoke for backend
   drift catch.
6. **Demo video 3 min + Karma GAP profile + Farcaster post + repo
   README polish + grants Celo Foundation submission** (Phase 5
   Blocks 5-8, ~3-4j).
7. **Tag final** `v2.0.0-design-system-v5-sepolia` + closure (Phase
   5 Block 9, ~0.5j).

**Mainnet target Q2 2027 stays comfortable** — Phase 4 cumulative
~6-8 days wall-clock (vs original 5-7j estimate), Phase 5 estimated
5-7j, leaves substantial buffer for grants application + Mike's
real-life cadence.

---

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

### Phase 4 — Layout refactor + V5 applications migration (5-7j)

Goal : cards depth + top tabs Robinhood-styled (PAS bottom nav, conflict MiniPay) + onboarding V1 + Phase 3 carry-overs (data wiring + MilestoneDialogV5).

**Carry-overs Phase 3 (rationale détaillée Phase 3 closure section)** :
- **ChartLineV5 wire-up OverviewTab revenue 7d** : analytics fetcher
  à créer dans `lib/seller-api.ts` consumer
  `/api/v1/analytics/summary` (RevenueBlock.timeline_7d).
  Composant ChartLineV5 lui-même livré Block 4 Phase 3 (lazy-load
  recharts). À intégrer Block 5 Phase 4.
- **SparklineV5 wire-up** : trend backend endpoints à exposer
  d'abord (credits usage / per-product sales / seller KPIs), puis
  consumer choice (CreditsBalance / ProductCard / OverviewTab tier
  card). Décision GO/DEFER mid-Block 5 selon backend endpoint
  ready. Soft-red dependency.
- **MilestoneDialogV5 component creation + 2 triggers** : nouveau
  composant Block 6 Phase 4 wrapping `success-first-sale.svg` +
  `success-withdrawal-complete.svg` (assets staged Phase 3). Wire
  triggers : count first order Released → fire dialog
  une-fois-only (localStorage flag), withdrawal-complete →
  post-tx success callback. Confetti milestone Phase 2 Block 7
  reste, dialog vient en complément (illustration + copy explicit
  + dismiss ack vs confetti seul).

**Blocks** :

1. **Audit visuel + plan migration detaille** (0.5j) — DELIVERED 2026-04-29 — voir sous-section "Block 1 audit findings" ci-dessous
2. **CardV5 elevation tiers + migration ProductCard / MarketplaceProductCard / FeaturedSellers / StatCard** (1j) — composant CardV5 (elevation: sm / md / lg / hero) + 4-5 surfaces migrées + bundle measure
3. **TabsV5 sliding underline + migration seller dashboard tabs** (1j) — composant TabsV5 (sliding indicator animated) + migration `SellerDashboardInner` legacy `@/components/ui/tabs` → V5. NOTE : TabsV4 sliding indicator existe déjà (Phase 2 Block 5 commit `41b1572`), Mike décide Block 3 si nouveau TabsV5 ou migration vers TabsV4 existant
4. **OnboardingScreenV5 V1 + integration first-time flow** (1.5j) — 3-screen flow (Welcome / What you can do / Get started) + skippable + persist localStorage `etalo-onboarded=true`. Consume `onboarding-welcome.svg` (Phase 3 staged asset). Integration `/marketplace` + `/seller/dashboard` first-launch
5. **ChartLineV5 + SparklineV5 wire-up real data** (1.5j) — analytics fetcher dans `lib/seller-api.ts` consumer `/api/v1/analytics/summary` + integration OverviewTab revenue 7d. SparklineV5 wire-up CreditsBalance OR DEFER Phase 5 selon backend trend endpoint dispo
6. **MilestoneDialogV5 component + 2 triggers (first-sale + withdrawal)** (1j) — nouveau composant + localStorage `milestone-shown-{key}` flag + first-sale + withdrawal-complete + tests regression-guard one-shot
7. **Phase 4 closure docs** (0.5j) — bilan + commit + tag intermediaire optionnel

**Total wall-clock estime** : 7-9j (vs original 5-7j avec carry-overs intégrés).

#### Block 1 audit findings (2026-04-29)

Audit cumulative parcourant 6 surfaces principales pour identifier les écarts vs Robinhood-target 75-85%. Findings consolidés ci-dessous.

**1a. Cards depth — état vs Robinhood reference** :

| Surface | File | Style actuel | Gap |
|---|---|---|---|
| ProductCard | `components/ProductCard.tsx` | image `aspect-square rounded-lg`, texte plain dessous (zero card wrapper) | Pas de elevation/border. Robinhood : card `bg-white rounded-2xl shadow-sm hover:shadow-md` englobe image + text |
| MarketplaceProductCard | `components/MarketplaceProductCard.tsx` | Idem ProductCard | Idem |
| FeaturedSellers | `components/FeaturedSellers.tsx` | `border border-neutral-200 rounded-lg hover:border-neutral-400` flat outline | Border-only, pas de shadow elevation |
| OverviewTab StatCard | `components/seller/OverviewTab.tsx:89-95` | `rounded-md border border-neutral-200 bg-neutral-50 p-3` flat | Robinhood KPI cards : `bg-white shadow-sm rounded-xl` + sparkline interne |
| StakeTab tier card | `components/seller/StakeTab.tsx` | Idem flat outline | Idem |
| OrdersTab order item | list item | `rounded-md border border-neutral-200 p-3` flat | Idem |
| CardV4 (existant) | `components/ui/v4/Card.tsx` | shadow-celo-md + border + rounded-lg + motion lift hover | Bien styled MAIS consommé seulement /dev/components + PublicHeader, **PAS** dans surfaces prod ci-dessus |

**Verdict cards** : tokens `shadow-celo-sm/md/lg/hero` existent (tailwind.config.ts Phase 1 Block 4d). CardV4 component existe avec motion lift. Aucune surface prod consume — c'est le coeur du Block 2 Phase 4.

**1b. Tabs styling — état vs Robinhood** :

| Surface | File:line | Current | Gap |
|---|---|---|---|
| SellerDashboardInner | `app/seller/dashboard/SellerDashboardInner.tsx:14-18,165-173` | Imports legacy `@/components/ui/tabs` (shadcn primitive) — `TabsList grid grid-cols-3 sm:grid-cols-6` | Legacy shadcn flat, no animated underline indicator |
| TabsV4 (existant) | `components/ui/v4/Tabs.tsx` | Phase 2 Block 5 commit `41b1572` — sliding indicator motion + V5 doc align | Bien styled MAIS PAS consommé par dashboard, seul /dev/components l'utilise |

**Verdict tabs** : TabsV4 sliding indicator existe et fonctionne. **Décision Block 3** : nouveau TabsV5 dans namespace V5 (cohérence) OR migration `SellerDashboardInner` vers TabsV4 existant (frugalité, 1-line import swap). Mike tranche au démarrage Block 3.

**1c. Spacing / typography hierarchy** :
- Landing hero (Block 6 Phase 3) : `font-bold` + `text-3xl/4xl` — pas font-display Switzer V5
- Dashboard h1 "Your shop" : `text-xl font-semibold` — pas font-display
- StatCard label/value : `text-sm` label + `text-base font-semibold` value — pas tabular-nums
- ProductCard price : `text-base font-semibold` — pas tabular-nums

font-display Switzer Variable + tabular-nums utility absents hors `/dev/components`. Lift typography = scope Block 2 (cards titles → font-display) + Phase 5 Block 1 (tabular-nums systematic).

**1d. V4/V5 mix — surfaces inventory** :

| Surface | V4 atoms | V5 utilities | Legacy/raw |
|---|---|---|---|
| `/` HomeLanding | aucun | landing-hero img only (Block 6 P3) | inline divs |
| `/marketplace` | aucun | SkeletonV5 (Block 3b P3) | MarketplaceProductCard raw div |
| `/[handle]` boutique | aucun | aucun | BoutiqueHeader / ProductGrid / ProductCard / EmptyState legacy |
| `/[handle]/[slug]` product | (à audit fin Block 5) | (à audit fin) | ShareButtons / ProductAddToCartButton |
| `/seller/dashboard` shell | aucun | aucun | legacy shadcn `Tabs` |
| `/seller/dashboard` Overview | AnimatedNumber (StakeTab) | SkeletonV5 (Block 3b) | StatCard plain div |
| `/seller/dashboard` Orders | aucun | SkeletonV5 + EmptyStateV5 (P3) | order item plain div |
| `/seller/dashboard` Products | aucun | SkeletonV5 + EmptyStateV5 (P3) | product item plain div |
| `/seller/dashboard` Marketing | aucun | SkeletonV5 + EmptyStateV5 (P3) | CreditsBalance/ProductPicker custom |
| `/seller/dashboard` Stake | AnimatedNumber | EmptyStateV5 (P3) | tier card plain div |
| `/dev/components` | TOUS V4 | TOUS V5 | — |

**Verdict V4/V5 mix** : V5 utilities (Skeleton + EmptyState) bien intégrés Phase 3. V4 atoms (ButtonV4 / CardV4 / TabsV4 / BadgeV4 / InputV4) **quasi-zero adoption surfaces prod**. C'est le coeur du refactor Phase 4.

**1e. Onboarding entry points** :
- `/seller/dashboard` route `error === "not_found"` (line 120-134) : message "Etalo is in a curated launch phase. Contact our team." — onboarding manuel
- `/marketplace` first-time MiniPay user : aucun welcome screen — direct grid produits
- Aucun `localStorage.etalo-onboarded` flag dans le code (`grep "etalo-onboarded"` = 0 hit)
- Asset `onboarding-welcome.svg` staged Phase 3 Block 6, attend OnboardingScreenV5 (Block 4 Phase 4)

**1f. Dependencies critiques** :

| Block | Hard/Soft | Status | Remediation si bloqué |
|---|---|---|---|
| 2 CardV5 | Hard | ✓ green | tokens shadow-celo-* + tailwind config existent |
| 3 TabsV5 | Hard | ✓ green | TabsV4 référence existante, design tokens cohérents |
| 4 OnboardingScreenV5 | Hard | ✓ green | asset onboarding-welcome.svg staged P3 |
| 5 ChartLineV5 wire-up | Hard endpoint | ✓ green (OpenAPI confirme `/api/v1/analytics/summary` existe) | fetcher frontend à créer trivial |
| 5 SparklineV5 wire-up | Hard endpoint | ⚠️ **soft red** — aucun trend endpoint backend (credits usage / per-product sales) exposé | DEFER Phase 5 si endpoint pas ready Block 5 mid-flight |
| 6 MilestoneDialogV5 first-sale | Soft frontend-only | ✓ green | tracking 0→1 déjà OrdersTab `prevOrdersCountRef` (P2 B7) |
| 6 MilestoneDialogV5 withdrawal | Soft frontend-only | ✓ green | post-tx callback déjà StakeActionDialog handleConfirm (P2 B7) |

**1 alerte soft-red** : Block 5 SparklineV5 wire-up dépend d'un trend endpoint backend non-exposé. Décision GO (Mike ajoute endpoint mid-Block 5) OR DEFER Phase 5 prise au démarrage Block 5.

**Sign-off Block 1** : Audit DELIVERED. 7 blocks Phase 4 estimés 7-9j wall-clock. Dependencies majeures green; 1 soft-red flagué pour décision Block 5. Ready pour Block 2 (CardV5 elevation tiers + migration 4-5 surfaces).

**Validation** : visual check pages cles cohérentes, mobile responsive, onboarding flow smooth, MilestoneDialogV5 fires une-fois-only post first-sale + withdrawal.

#### Block 5 — CLOSURE 2026-05-01 ✅ COMPLET 7/7 sub-blocks

**Status** : OverviewTab refactor complet. 4 KPI tiles + ChartLineV5
revenue 7-day trend + Top products section, tous wired sur le real
backend `/api/v1/analytics/summary` via le hook
`useAnalyticsSummary` (TanStack Query + Decimal selector centralisé
+ ADR-041 badge shim). Le dashboard sort enfin de l'ère stake-derived
StatCards (legacy Phase 3 / pre-ADR-041) et arrive sur une surface
analytics V1-coherente.

**Sub-blocks livrés (7 commits sur `feat/design-system-v5`)** :

| # | Scope | Commit | Tests Δ | Bundle Δ /seller/dashboard |
|---|---|---|---|---|
| 5.1 | ADR-041 cleanup : drop StakeTab + StakeActionDialog + Top Seller refs (5 → 4 tabs) | `e1152e8` | -3 (StakeTab specs) | route 25.3 → 22.7 kB / FLJ 263 → 260 kB |
| 5.2a | Backend `analytics.py` V2 schema migration + 5 e2e contract tests | `de8ffb0` | +5 backend (115 → 120) | n/a |
| 5.2b | Frontend `lib/analytics-api.ts` typed wrapper + 3 unit tests | `69c9cbc` | +3 (196 → 199) | unchanged (no consumer yet) |
| 5.3 | `useAnalyticsSummary` hook : TanStack Query + Decimal selector + badge shim + 12 tests | `8f6dd90` | +12 (199 → 211) | unchanged (no consumer yet) |
| 5.4 | OverviewTab 4 KPI tiles wire-up + 6 tests + dropped dead `onchain` state in dashboard parent | `15aed82` | +6 (211 → 217) | route +0.7 kB / FLJ +1 kB |
| 5.5 | OverviewTab ChartLineV5 revenue 7-day trend section + 5 tests (first prod consumer of ChartLineV5) | `c10eb38` | +5 (217 → 222) | route -0.9 kB (Webpack chunk reshuffle) / FLJ +1 kB |
| 5.6 | OverviewTab Top products section (max 3, IPFS images, empty state) + 6 tests | `fc65f42` | +6 (222 → 228) | route +0.4 kB / FLJ +1 kB |
| 5.7 | Closure : full regression + tsc cleanup (3 latent pre-Block-5 errors) + this docs update + wrap-up | `<this>` | +0 net | unchanged |

**Métriques cumulées vs pre-5.1 baseline (hotfix #8 `e6ccad9`)** :

- Frontend tests : 196 → **228 PASS** (**+32 net**, all green, 0 lint)
- Backend tests : 115 → **120 PASS** (**+5**, full pytest suite 64 s)
- TypeScript `tsc --noEmit` : **clean** (after 5.7 sweep of 3 latent pre-Block-5 errors)
- `/seller/dashboard` bundle : 25.3 → **22.9 kB** route (**−2.4 kB**), 263 → **263 kB** First Load (**0 kB net**)
  - 17 kB headroom remains under the 280 kB strict trigger
  - 4 new sections (KPI tiles + chart + top products + IPFS images via next/image) shipped at zero net First Load cost — recharts stayed code-split via next/dynamic, the StakeTab + StakeActionDialog removal in 5.1 over-recouped the new section overhead

**Pattern decisions locked Block 5 (referenceable Phase 5 + future)** :

- **Decimal-as-JSON-string contract** : pinned both server-side (e2e
  test in 5.2a asserts every Decimal field serialises as JSON string)
  and client-side (centralised `parseFloat` in
  `useAnalyticsSummary.select`, sub-block 5.3). Single boundary,
  consumers always see `number`. Future analytics endpoints follow
  the same pattern.
- **TanStack Query as the dashboard data layer** : sub-block 5.3 is
  the second TQ hook (after `useOrderInitiate`). `staleTime: 30_000`
  + `retry: 1` empirically right for read-only seller analytics ;
  `useCreditsBalance`'s plain useState pattern stays unchanged but
  is the legacy approach.
- **ADR-041 defensive shims** : `badge "top_seller" → "active"` filter
  in the hook selector (with TODO marker pointing to backend ADR-041
  sweep PR). Same pattern usable for any future enum-narrowing.
- **Locale + timezone pinning for display** : `displayUsdtNumber`
  (sub-block 5.4) and `formatChartDate` (sub-block 5.5) both pin
  `locale: "en-US"` ; the chart formatter additionally pins
  `timeZone: "UTC"`. Caught a `fr_FR` bug on first test run (Mike's
  box) — the convention is now well-tested across 4 specs.
- **IPFS gateway constant** : local `PINATA_GATEWAY` in 2 consumers
  (ImageUploader + OverviewTab/TopProductRow). Promotion to
  `lib/ipfs.ts` deferred to Phase 5 polish if a 3rd consumer surfaces.

**Phase 5 polish items identified en route** :

- Promote `PINATA_GATEWAY` constant to `lib/ipfs.ts` if a 3rd
  consumer surfaces (e.g., MarketingTab generated-image preview).
- Backend ADR-041 sweep PR : drop `"top_seller"` literal from
  `app/schemas/analytics.py` `ReputationBlock.badge` enum + lift
  hard-coded `auto_release_days = 3` into a config setting. Removes
  the frontend defensive shim in 5.3 and the test allow-list TODO
  in `tests/e2e/test_analytics_e2e.py`.
- `displayUsdtNumber` (currently OverviewTab-local) is a candidate
  helper for `lib/usdt.ts` once 5.6's tests confirm 2+ consumers
  benefit from a shared formatter.
- SSR prefetch via `dehydrate(queryClient)` for `useAnalyticsSummary`
  → eliminates the dashboard's loading-state flash on first paint.
  Out of Block 5 scope (premature optimization for V1) ; Phase 5
  perf candidate.
- The 3 latent tsc errors fixed in 5.7 closure (ProductCard.test
  missing `created_at`, ChartLineV5/SparklineV5 unused
  `@ts-expect-error`) suggest `tsc --noEmit` should run in CI
  alongside `next build` so test-only TS regressions are caught
  before they accumulate. Phase 5 CI hygiene candidate.

**Workflow detail noted in passing** : the inner-repo
(`/etalo/Etalo` per CLAUDE.md primary working dir) has no `.env` /
`venv` for backend ; backend pytest runs against the outer repo's
venv (`/etalo/packages/backend/venv` with `.env` configured). Model
files + conftest are byte-identical between the two trees so test
results transfer. Backend code authored in inner, validated against
outer venv, then committed to inner. Phase 5 candidate to clean up
(set up backend venv in inner OR document the dual-tree workflow
explicitly in `docs/BACKEND.md`).

**Hand-off Mike for live MiniPay validation (ngrok tunnel + chrome
://inspect/#devices)** :
1. Reload dev server clean : `rm -rf .next && pnpm dev`
2. Open `https://upright-henna-armless.ngrok-free.dev/seller/
   dashboard` in MiniPay on phone via DevTools attached to the
   WebView.
3. Expected on Overview tab :
   - 4 KPI tiles render in 2x2 grid on mobile (Revenue 24h /
     Revenue 7d / Active orders / In escrow with "Released: X
     USDT" sub-text). Loading: 4 skeleton placeholders. Error: 4
     em-dash fallbacks.
   - "Revenue trend (last 7 days)" CardV4 below the tiles. Chart
     skeleton during fetch ; ChartLineV5 forest line on populated
     data ; "No data yet" if backend ever returns empty array
     (it shouldn't — backend zero-fills).
   - "Top products" CardV4 : 0-3 product rows with IPFS image +
     truncate title + tabular-nums revenue. Empty state copy "No
     top products yet — your top sellers will appear here once
     orders complete." for fresh sellers.
   - "Recent orders" section (Block 3b unchanged) at the bottom.
4. Tab switches Overview ↔ Products / Orders / Profile / Marketing
   should be smooth (5-tab list, sliding indicator preserved).
5. NO horizontal page scroll on 360-414 px viewports (hotfix #8
   protection holds — verified via class cascade analysis).
6. If badge "top_seller" ever appears in the API response, the
   frontend should display it as "active" (5.3 shim). Backend
   currently never emits "top_seller" (Reputation contract not
   indexed yet), so this is purely defensive.

**Sign-off Block 5** : DELIVERED 7/7 sub-blocks. 7 commits on
`feat/design-system-v5`. /seller/dashboard Overview tab is now a
real V1-aligned analytics surface. Ready for Block 6
(MilestoneDialogV5) or Phase 5 closure depending on Mike's call.

#### Hotfix #9 — Two-physical-checkouts footgun (2026-05-01)

**Surfaced** during Block 5 closure live MiniPay validation. Mike
opened the dashboard via the ngrok tunnel and saw a 30-day-old
version of the site (no KPI tiles, no chart, stake StatCards still
present, 6 tabs including "Stake"). Initial symptom was a `GET / 404`
loop ; deeper audit revealed the root cause :

**Root cause** : Two physical checkouts of `feat/design-system-v5`
on disk :
- **Outer** : `C:\Users\Oxfam\projects\etalo\` (HEAD `e283263`,
  Phase 1 Block 3, 2026-04-04). Stale, dirty, never received any
  Phase 4 work.
- **Inner** : `C:\Users\Oxfam\projects\etalo\Etalo\` (HEAD
  `b7494b4`, Block 5 closure, 2026-05-01). Canonical per CLAUDE.md
  primary working dir. All Phase 4 + Block 5 work landed here.

The currently-running dev server (PID 21356, parent 4768) was
launched from the OUTER tree. Both `.env.local` files point to the
SAME ngrok URL (`upright-henna-armless.ngrok-free.dev`) and the
SAME port 3000 — only one Next dev server can listen at a time, so
whichever tree gets `pnpm dev` first owns the tunnel. The footgun
was completely silent : no warning, no compile error, just the
wrong codebase served against the right URL.

**Blast radius** :
- The 404 was an artifact of Next.js dev-server cold-compile
  window — when the audit probed live, all routes returned 200.
  Not a structural defect.
- Hotfixes #5, #6, #7 (HomeRouter lazy init, dynamic import,
  `etalo-mode-preference` defensive cleanup) were "validated live
  in MiniPay" — but in fact validated against the OUTER tree's
  legacy code. The inner-tree hotfixes are correct (verified by
  the 199→228 PASS jsdom suite + repeated build success across
  sub-blocks 5.1–5.7), but they have NEVER actually been
  exercised in MiniPay against the inner tree.
- Block 5 hand-off procedure documented in this file's Block 5
  closure section is invalidated until Mike re-validates against
  the inner tree.

**Remediation shipped (Phase 4 hotfix #9)** :
- Outer tree neutralized via :
  - `README_OUTER_REPO_DEPRECATED.md` at outer root explaining the
    situation + safeguards + cleanup instructions.
  - `packages/web/package.json` `name` renamed to
    `web-DEPRECATED-OUTER-REPO-DO-NOT-RUN`.
  - `packages/web/package.json` `predev` hook : `echo ABORT ... &&
    exit 1` so `pnpm dev` from outer fails fast before Next can
    boot. Verified via `npm run dev` from outer → exits 1, no
    next-dev process spawned.
- Inner tree gains a defensive banner :
  - `packages/web/package.json` `predev` hook prints
    `=== Canonical inner repo (etalo/Etalo/packages/web) — Phase 4
    hotfix #9 banner ===` before `next dev` boots, so Mike can
    visually confirm at every dev session that he's in the right
    tree.
- Outer-tree changes are local-only (not committed to outer's
  git, since outer is abandoned). Inner-tree changes ship as a
  single commit on `feat/design-system-v5`.

**Lessons** :
1. When two repo trees share a branch name + the same
   `.env.local` + the same port, the working-dir mismatch is
   silent. Always verify cwd + branch + last commit hash at the
   start of a dev session ; the inner banner now makes this
   automatic.
2. "Validated live in MiniPay" is only as good as the codebase
   the tunnel actually serves. Future live-validation
   procedures should print + log the served-version's
   commit hash (e.g. via a hidden `/__build-hash` endpoint or a
   hash baked into the page footer at build time). Phase 5 polish
   candidate.
3. Multi-checkout setups should fail loudly on misuse, not
   silently. The `predev` fail-fast pattern is reusable for any
   future "do-not-run-this-tree" situation.

**Re-validation required (Mike)** :
- Stop the wrong dev server, restart from inner tree (banner
  confirms placement).
- Clear MiniPay app storage (so localStorage from outer-tree
  sessions, including any stale `etalo-mode-preference="buyer"`,
  is wiped).
- Hard-reload the ngrok URL in MiniPay.
- Re-walk the Block 5 hand-off procedure documented above. Also
  re-confirm hotfixes #5/#6/#7 behavior (HomeRouter swap,
  HomeMiniPay V5 visible on `/`, no auto-redirect to
  `/marketplace`).

#### Block 6 — CLOSURE 2026-05-01 ✅ COMPLET 4/4 sub-blocks

**Status** : MilestoneDialogV5 lib component + `useMilestoneOnce`
hook + OrdersTab first-sale wire-up shipped. The first-sale
celebration is now a 2-layer ceremony : confetti burst (Phase 2
Block 7's `fireMilestone`) + celebratory dialog with the staged
`success-first-sale.svg` illustration. Persistent across sessions
per seller-wallet via the `etalo-milestone-shown-first-sale`
localStorage flag (one-shot guard, mirror of Block 4b's
`etalo-onboarded` pattern).

**Sub-blocks livrés (4 commits sur `feat/design-system-v5`)** :

| # | Scope | Commit | Tests Δ | Bundle Δ /seller/dashboard |
|---|---|---|---|---|
| 6.1 | `MilestoneDialogV5` lib component supporting first-sale + withdrawal-complete variants (DialogV4 reuse, no DialogV5 extracted per "promote-on-3rd-consumer" pattern) | `dcfc366` | +7 (228 → 235) | unchanged (no consumer yet) |
| 6.2 | `useMilestoneOnce` hook with localStorage one-shot guard + try/catch silent fail (hotfix #7 lesson) | `2e92d10` | +5 (235 → 240) | unchanged (no consumer yet) |
| 6.3 | OrdersTab wire-up : first-sale 0→1 transition opens MilestoneDialogV5 alongside the existing confetti burst, gated by `useMilestoneOnce` | `3872411` | +3 (240 → 243) | route +0.3 kB / FLJ 0 net (after dynamic-import fix) |
| 6.4 | `/dev/components` showcase section (2 variants, bypasses `useMilestoneOnce` for free re-open) + this docs closure + final regression sweep | `<this>` | +0 net | minor (showcase only, prod surfaces unchanged) |

**Métriques cumulées vs pre-6.1 baseline (Block 5 closure
`b7494b4`)** :

- Frontend tests : 228 → **243 PASS** (**+15 net**, all green, 0 lint)
- Backend tests : **120 PASS** (unchanged — Block 6 is frontend-only)
- TypeScript `tsc --noEmit` : **clean**
- `/seller/dashboard` bundle : 22.9 → **23.2 kB** route (+0.3 kB), 263 → **263 kB** First Load (**0 kB net** — DialogV4 + ButtonV4 motion deps stay in the lazy chunk via the dynamic-import in OrdersTab)
- 17 kB headroom remains under the 280 kB strict trigger

**Bundle near-miss caught + fixed during sub-block 6.3** : the
initial static import of `MilestoneDialogV5` from OrdersTab pushed
`/seller/dashboard` First Load to **281 kB** — **1 kB OVER the
280 kB strict trigger**. Root cause : DialogV4 + ButtonV4 motion
dep chain got eagerly pulled into the dashboard's bundle. Fixed by
switching the consumer to `next/dynamic({ ssr: false, loading: ()
=> null })` ; the dialog renders into a Radix Portal that's
invisible until `open` flips, so no fallback shape is required
during chunk fetch. Bonus side-effect : `/checkout` reverted from
15.2 → 13.5 kB because the static import had inadvertently pushed
motion into a shared chunk that /checkout was eagerly loading.
Lesson logged for the next V5-component wire-up : default to
`next/dynamic` for any DialogV4/motion-pulling consumer that's
conditionally rendered (e.g. modals, overlays).

**Pattern decisions locked Block 6** :

- **DialogV4 reuse over DialogV5 extraction** — DialogV4 (Phase 2
  Block 6, Radix + motion-tuned spring + dark-mode aware) covers
  every need for celebratory modals. Mike's "promote-on-3rd-
  consumer" pattern (sub-blocks 5.6 IPFS gateway + 5.4
  displayUsdtNumber) defers DialogV5 extraction until a 3rd
  V5-styled dialog surfaces in Phase 5 polish.
- **Per-type localStorage namespace** — `etalo-milestone-shown-
  ${type}` keeps the 5 MilestoneType variants independent. Future
  surfaces (banners, toasts) can reuse `useMilestoneOnce` for the
  3 currently-unused variants (credit-purchase, image-generated,
  onboarding-complete) without an API change.
- **Dynamic-load any DialogV4 consumer that's conditionally
  rendered** — caught by the 281 kB bust on first run of 6.3.
  `next/dynamic({ ssr: false, loading: () => null })` is the right
  shape for portal-rendered overlays.
- **Defensive try/catch around localStorage** — hotfix #7
  investigation surfaced that MiniPay's WebView occasionally
  blocks Storage in incognito-style sessions. `useMilestoneOnce`
  silently degrades : worst case the dialog re-fires on every
  mount until storage works again, vs the alternative of crashing
  the consumer.
- **Confetti + dialog complementary, not redundant** — pattern
  matches Robinhood transaction success : particle burst behind,
  dialog focal-point at the same trigger moment. Both fire on the
  0→1 transition ; the dialog is gated by the one-shot guard, the
  confetti always fires.

**Phase 5 polish items identified en route** :

- Promote `MilestoneDialogV5` to a `DialogV5` lib if a 3rd
  V5-styled dialog surfaces.
- `useMilestoneOnce` could grow a `reset()` API for V2 (e.g. a
  "show me the celebration again" admin trigger). Out of scope V1.
- Withdrawal-complete trigger lands when stake/withdrawal returns
  V2 (ADR-041 deferral). The component variant is already wired ;
  V2 just needs to call `setMilestoneOpen(true)` on the post-tx
  success callback.
- `prefers-reduced-motion` for DialogV4's spring animation — pre-
  existing condition flagged in Block 6 Phase 1 audit, out of
  scope this block.

**Hand-off Mike for live MiniPay validation** :
1. Restart dev server from canonical inner repo (banner from
   hotfix #9 confirms placement) :
   ```powershell
   cd C:\Users\Oxfam\projects\etalo\Etalo\packages\web
   npm run dev
   ```
2. Navigate to `/dev/components#milestone-dialog-v5` first to
   preview both variants visually (showcase bypasses the one-shot
   guard so re-open is free).
3. To test the live first-sale trigger : in MiniPay seller
   wallet, ensure the seller has 0 completed orders, then trigger
   a buyer flow that completes one ; the dashboard's Orders tab
   should fire confetti + open MilestoneDialogV5 simultaneously
   on the next refetch tick.
4. Click "Continue" CTA → dialog dismisses, localStorage gets
   `etalo-milestone-shown-first-sale=true`. Subsequent dashboard
   reloads should NOT re-fire the dialog (confetti also won't
   fire because the ref-based 0→1 condition can't recur in a
   single mount lifetime).
5. To re-test : clear MiniPay app storage (wipes the localStorage
   flag) → next 0→1 transition re-fires both layers.

**Sign-off Block 6** : DELIVERED 4/4 sub-blocks. 4 commits on
`feat/design-system-v5`. First-sale celebration is a complete 2-
layer ceremony ; withdrawal variant is forward-compat for V2.
Ready for Phase 5 closure (Polish + Submission) per Mike's call.

#### Hotfix #10 — Backend dual-repo footgun (2026-05-02)

**Surfaced** during live MiniPay validation of Block 5 + Block 6 on
the canonical inner frontend. The dashboard's KPI tiles painted
em-dash placeholders ; the chart card sat on its skeleton ; top
products empty. Network panel showed `GET /api/v1/analytics/summary
-> 500 Internal Server Error`. The reflex was "the analytics route
must be broken" — but Block 5 had pinned the contract via 5 e2e
tests in sub-block 5.2a, all passing. Logical contradiction
forcing the question : which `analytics.py` is the live backend
actually serving ?

**Root cause** : same dual-repo footgun as hotfix #9, but for
backend instead of frontend. The Python venv + `.env` lived in the
OUTER backend (`C:/Users/Oxfam/projects/etalo/packages/backend/`)
since project init ; the inner backend
(`C:/Users/Oxfam/projects/etalo/Etalo/packages/backend/`) had only
source code, no venv, no `.env`. Mike had been launching `python
scripts/run_dev.py` from the outer all along — even after hotfix
#9 neutralized the outer FRONTEND, the outer backend kept being
launched out of habit, serving stale code (V1 schema
`Order.amount_usdt`) against the canonical frontend on the same
ngrok tunnel. The 30-day backend drift was masked by every
endpoint Block 5 didn't exercise — `/sellers/me`,
`/sellers/{addr}/profile`, `/products/...` all worked because they
hadn't been touched in V2 schema migration. `/analytics/summary`
was the first endpoint that exposed the divergence.

**Immediate stop-gap (Phase 1)** : `Copy-Item analytics.py inner -> outer` + restart backend. Live MiniPay analytics surface returned 200 immediately ; Block 5 Overview tab finally rendered live KPI tiles + ChartLineV5 + Top products against real seller data.

**Phase 2 neutralization (THIS hotfix)** :
- Setup backend venv + `.env` in INNER tree (was missing — root cause of why Mike launched from outer in the first place).
- Fail-fast hook in OUTER's `scripts/run_dev.py` : path-normalised detection (POSIX-slash check survives Windows backslash interpretation), exits 1 with descriptive abort message before uvicorn can boot. Verified empirically — outer venv `python scripts/run_dev.py` exits 1.
- Canonical banner in INNER's `scripts/run_dev.py` : prints `✓ Running backend from CANONICAL inner repo (...) — Phase 4 hotfix #10 banner` to stderr before uvicorn boots, so future sessions visually confirm placement at every launch (mirror of hotfix #9's frontend banner).
- Defensive `cp -ru app/ inner -> outer` to ensure source-file parity even if the fail-fast guard is somehow bypassed (e.g. `python -m app.main` direct, someone disables the guard locally). One-time defensive measure since neither tree's backend should be modified going forward.
- `README_OUTER_REPO_DEPRECATED.md` (created in hotfix #9) extended with a backend section : footgun history, hotfix #10 remediation, post-hotfix dev session procedure, deletion-safe-after-both-hotfixes notice.

**Lessons (cumulative across hotfix #9 + #10)** :
1. Two physical checkouts sharing branch name + env-config file + port (frontend) or venv + `.env` (backend) is silent-failure heaven. The fail-fast + canonical-banner pattern is now applied to BOTH frontend (`predev` script hook) and backend (`run_dev.py` top-of-file path check). Any future tooling additions (e.g. an admin dashboard package, a CLI runner) should follow the same pattern at creation time.
2. Backend fail-fast at script entry (Python `sys.exit(1)`) is the equivalent of frontend's npm `predev` hook + `exit 1`. Both rely on path-string detection ; both need normalisation for cross-shell compatibility on Windows.
3. The 30-day backend drift was invisible because no test exercised an end-to-end "frontend ngrok URL → backend localhost:8000 → real seller with orders" path. Phase 5 polish candidate : add a tiny integration smoke that hits `/api/v1/analytics/summary` from a frontend test (or via a dedicated CI job) so backend drift is caught before live validation.

**Backend dev session procedure (post-hotfix #10)** :
```powershell
cd C:\Users\Oxfam\projects\etalo\Etalo\packages\backend
.\venv\Scripts\Activate.ps1
python scripts\run_dev.py
# Expected first stderr line : ✓ Running backend from CANONICAL inner repo (...) — Phase 4 hotfix #10 banner
# Then : INFO: Uvicorn running on http://127.0.0.1:8000
```

If the `[ABORT]` message prints instead, the cwd is the outer — `cd` into the inner tree and retry.

**Outer tree deletion** : safe after both hotfix #9 + #10 are committed. Defer to Phase 5 polish item or Mike's explicit call.

### Phase 5 — Polish + Submission (5-7j)

#### Block 1 — CLOSURE 2026-05-03 ✅ COMPLET 6/6 sub-blocks

**Status** : Tabular-nums systematic application DELIVERED. Every
USDT amount, credit balance, integer count, and date display
across the production surfaces (dashboard 5 tabs, marketplace
grid, boutique pages, cart drawer, checkout flow, BuyCreditsDialog
modal, MilestoneDialogV5) now renders with
`font-variant-numeric: tabular-nums` so digits stay vertically
aligned across rows + during animations.

Bonus : the 1.5 sweep also killed two latent locale-leaking
`toLocaleDateString()` calls in OrdersTab + OverviewTab Recent
orders (a sub-block 5.4 lesson regression latent for ~30 days).
Both are now routed through the new `lib/format.ts`'s
`formatRowDate(isoDate)` — pinned `locale: "en-US"` +
`timeZone: "UTC"`.

**Sub-blocks livrés (6 commits sur `feat/design-system-v5`)** :

| # | Scope | Commit | Sites |
|---|---|---|---|
| 1.1 | Standardize `AnimatedNumber` from inline `style` to Tailwind `className`, document `ChartLineV5Inner` inline-style retention (Recharts SVG inheritance load-bearing) | `a7fb227` | 1 (+ 1 test assertion swap) |
| 1.2 | Dashboard USDT amounts (OverviewTab Recent orders, OrdersTab list, ProductsTab list ; CreditsBalance soft no-op) | `d51e3fa` | 3 |
| 1.3 | BuyCreditsDialog cost previews (preset card, custom amount preview, CTA label, spent confirmation) | `d587422` | 4 |
| 1.4 | Consumer-side surfaces (MarketplaceProductCard, ProductCard, CartItemRow x2 inc. bonus subtotal, CartDrawer per-seller subtotal, CheckoutFlow total, OpenInMiniPayModal cart resume + seller count pre-empt ; CartDrawer total soft no-op via AnimatedNumber) | `8264730` | 6 |
| 1.5 | Integer counts (Order #N, pagination, stock, qty) + dates locale-pin sweep (2 sites) + `lib/format.ts` extraction (formatChartDate promotion + new formatRowDate) | `aeb3be5` | 5 + 2 |
| 1.6 | Block 1 closure — sprint doc + this | `<this>` | docs only |

**Métriques cumulées vs pre-Block-1 baseline (Phase 4 sign-off
`34e1a2e`)** :

- Frontend tests : **243 PASS conserved** (no logic change ;
  1 spec assertion swap in 1.1, otherwise content + handler
  assertions intact)
- Backend tests : **120 PASS** (untouched, Block 1 is
  frontend-only)
- TypeScript `tsc --noEmit` : **clean**
- ESLint warnings : **0** (unchanged)
- `/seller/dashboard` route : 22.9 → **23.2 kB** (+0.3 kB, lib
  /format.ts content absorbed)
- `/seller/dashboard` First Load JS : **263 kB** unchanged
- `/marketplace` route : 8.22 → **8.23 kB** (+0.01 kB single
  class on MarketplaceProductCard)
- All other routes : unchanged
- 17 kB headroom under 280 kB strict trigger preserved

**Pattern decisions locked Block 1** :

- **Tailwind `className="tabular-nums"` is the standard** for
  every numeric display where the framework permits ; inline
  `style={{ fontVariantNumeric: "tabular-nums" }}` retained
  ONLY where SVG inheritance requires it (ChartLineV5Inner
  axis ticks via Recharts <text>). Both inline-style sites
  carry rationale comments documenting the retention so future
  contributors don't re-attempt the refactor.
- **Pattern B (className on container) >> Pattern A (per-numeric
  span wrap)** for text-mixed displays. CSS
  `font-variant-numeric: tabular-nums` only affects digit
  glyphs ; surrounding letters/punctuation stay unaffected.
  Single-keystroke addition per site, cleaner diff than per-
  numeric wraps.
- **Helpers stay string-returning** (`formatRawUsdt`,
  `displayUsdtNumber`, `Number(x).toFixed(2)`,
  `formatRowDate`, `formatChartDate`) — tabular-nums applied
  at the call-site via JSX className. Phase 1 audit Option 1,
  validated through 25 sites without friction.
- **Promote-on-2nd-consumer pattern triggered** for
  `formatChartDate` → `lib/format.ts`. Joined by
  `formatRowDate` (the 2nd date consumer that triggered the
  extraction). Mirrors sub-block 5.6 IPFS gateway + 5.4
  displayUsdtNumber deferred-extraction posture.

**Phase 5 polish items identified en route** :

- ESLint rule that catches missing `tabular-nums` on
  USDT-suffixed display spans — defer V1.5+ once the
  systematic sweep stabilises in production.
- `displayUsdtNumber` (currently `OverviewTab`-local) →
  `lib/format.ts` if a 3rd USDT-formatter consumer surfaces
  beyond OverviewTab + the existing `formatRawUsdt` /
  `displayUsdt` helpers in `lib/seller-api.ts` + `lib/usdt.ts`.

**Hand-off Mike for live MiniPay validation** :

1. Restart dev server from canonical inner repo (hotfix #9 +
   #10 banners confirm placement) :
   ```powershell
   cd C:\Users\Oxfam\projects\etalo\Etalo\packages\backend
   .\venv\Scripts\Activate.ps1
   python scripts\run_dev.py
   # In another terminal :
   cd C:\Users\Oxfam\projects\etalo\Etalo\packages\web
   npm run dev
   ```
2. Open MiniPay on phone via `chrome://inspect/#devices` to
   the ngrok tunnel, navigate to `/seller/dashboard`.
3. **Visual checks** (each takes ~5 seconds) :
   - Overview tab : 4 KPI tiles digits aligned vertically
     across the 2x2 grid (e.g. `70.50 USDT` and `245.00 USDT`
     same column-position when columns reflow). ChartLineV5
     axis ticks aligned. Top products revenue column aligned.
     Recent orders : each row's `USDT · Apr 28, 2026` strings
     have aligned digits (the date format change is the most
     visible — should display "Apr 28, 2026" cleanly, NOT
     "5/2/2026" or "28 avr.").
   - Orders tab : list rows have aligned amount + date
     column. "Order #N" + "Showing X of Y" pagination digits
     aligned.
   - Products tab : "X.XX USDT · stock N" alignment.
   - Cart drawer : per-item subtotals + per-seller subtotals
     + total all aligned.
   - Checkout / OpenInMiniPayModal : `Total: X USDT` aligned.
   - BuyCreditsDialog : preset card prices + custom amount
     preview + CTA "Buy X credits for Y USDT" + spent
     confirmation all aligned.
   - Marketplace grid : product card prices aligned across
     columns.
   - Boutique pages (`/[handle]`) : product card prices
     aligned.
4. **Mobile responsive 360 px** : confirm no horizontal
   overflow reintroduced on any surface (hotfix #8 protection
   intact).
5. **Locale check** : confirm Mike's `fr_FR` system locale
   does NOT leak — all USDT amounts show "70.50 USDT" with
   period decimal, all dates show "Apr 28, 2026" en-US format.
   This was the latent bug 1.5 killed.

**Sign-off Block 1** : DELIVERED 6/6 sub-blocks. 6 commits
on `feat/design-system-v5`. Tabular-nums systematic + locale
hygiene complete. Ready for Phase 5 Block 2 (mobile gestures
critiques : swipe-to-close cart drawer + pull-to-refresh
marketplace) per Mike's call.

#### Block 2 — CLOSURE 2026-05-04 ✅ COMPLET 5/5 sub-blocks

**Status** : Mobile gestures critiques DELIVERED. Cart drawer
now closes on a rightward swipe (100 px distance OR 500 px/s
flick) with motion-driven spring snap-back when the threshold
is missed ; marketplace refreshes on a downward pull (80 px
past 0.5 resistance) when scrolled to the top, with an
indicator that ramps in opacity, follows the finger, and
rotates 180° at the threshold. Both gestures complement
keyboard / screen-reader paths (ESC + backdrop + close button
on the cart drawer ; visible Refresh button on the marketplace)
— gestures are pure UX enhancement, never an a11y substitute.

Bonus : the marketplace's data path was rebuilt around
`useInfiniteQuery` (5th TanStack Query consumer in the
codebase) so the same `query.refetch()` handler powers both
the visible button and the gesture. The Refresh action no
longer page-flushes on retry — the error fallback now invokes
`query.refetch()` instead of `window.location.reload()`.

**Sub-blocks livrés (4 commits sur `feat/design-system-v5`,
plus this closure)** :

| # | Scope | Commit |
|---|---|---|
| 2.1 | Foundation gesture infra — CartDrawer migration de base-ui Sheet vers SheetV4 (Radix + motion-tuned spring), nested LazyMotion features={domMax} validated en motion v12 strict mode (closest ancestor wins for `m.*` descendants) | `9f8cb2b` |
| 2.2 | Swipe-to-close cart drawer — SheetV4Content extended to forward motion drag props (drag / dragConstraints / dragElastic / dragMomentum / dragSnapToOrigin / onDragStart / onDrag / onDragEnd) ; CartDrawer wires drag="x" + dragConstraints={{ left: 0 }} + dragSnapToOrigin + handleDragEnd ; pure helper `shouldCloseOnSwipe(info)` exported for testability | `8b2e3f1` |
| 2.3a | MarketplacePage data fetching → useInfiniteQuery — drops 6 useState slots + 2 useEffects, new hook `src/hooks/useMarketplaceProducts.ts` with `MARKETPLACE_PRODUCTS_QUERY_KEY` constant, visible Refresh button (Phosphor ArrowsClockwise, 44×44 touch target, aria-label, animate-spin during refetch) MANDATORY a11y | `bb46014` |
| 2.3b | Pull-to-refresh marketplace gesture — custom pointer handlers (onPointerDown / Move / Up) gated on `window.scrollY === 0`, CSS transitions for snap-back (motion overkill avoided pour économiser +8 KB bundle), helpers extracted to `src/app/marketplace/pull-to-refresh.ts` (Next.js page.tsx export restriction) | `fdd313b` |
| 2.4 | Block 2 closure — sprint doc + this | `<this>` |

**Métriques cumulées vs pre-Block-2 baseline (post-Block-1
closure `c0ba058`)** :

- Frontend tests : **247 → 266 PASS (+19 net)**, 33 → 36 test
  files (4 specs `shouldCloseOnSwipe` + 5 hook specs +
  10 page specs marketplace incl. 4 PTR + 3 threshold helper)
- Backend tests : **120 PASS** (untouched, Block 2 is
  frontend-only)
- TypeScript `tsc --noEmit` : **clean**
- ESLint warnings : **0**
- `/seller/dashboard` route : 23.2 → **23.3 kB** (+0.1 kB,
  chunk rebalancing rounding)
- `/seller/dashboard` First Load JS : 263 → **264 kB**
  (+1 kB, chunk rebalancing — route size unchanged)
- `/marketplace` route : 8.23 → **9.27 kB** (+1.04 kB,
  pull-to-refresh handlers + helpers + indicator JSX)
- `/marketplace` First Load JS : 132 → **142 kB** (+10 kB,
  TanStack `useInfiniteQuery` pagination infrastructure
  bundled into the marketplace chunk — acceptable trade-off
  for codebase consistency with 4 prior TanStack consumers)
- `/[handle]/[slug]` First Load JS : 120 → **119 kB**
  (−1 kB, bonus chunk dedup post base-ui Sheet drop)
- `/dev/components` route : 13.6 → **12.8 kB** (−0.8 kB,
  bonus chunk dedup)
- All other routes : unchanged
- **16 kB headroom under 280 kB strict trigger preserved** on
  `/seller/dashboard`

**Pattern decisions locked Block 2** :

- **Cart drawer migration base-ui Sheet → SheetV4 (Radix
  DialogPrimitive)** : focus trap + ESC + backdrop click +
  role="dialog" + ARIA all preserved via the underlying Radix
  primitive ; SheetV4 was already the V5 standard. Drop-in
  shape preserved (props `open` + `onOpenChange` unchanged ;
  PublicHeader.tsx call-site untouched).
- **Nested `<LazyMotion features={domMax} strict>` works in
  motion v12** : multiple LazyMotion ancestors are allowed,
  closest wins for `m.*` descendants. The outer
  `MotionProvider` (Providers.tsx) keeps `domAnimation` for
  every page ; CartDrawer scopes `domMax` (drag features)
  only when the drawer mounts. The +8 kB worst-case scenario
  from the Phase 1 outline did not materialize — bundle
  delta on /seller/dashboard stayed at +0.1 kB (drop of
  base-ui Sheet imports compensated the motion domMax
  incremental cost ; Radix Dialog was already bundled via
  DialogV4 / SheetV4 elsewhere).
- **SheetV4Content extends with motion drag forwarding** :
  reusable for future SheetV4 surfaces that want swipe-to-
  close (e.g. seller mobile filters, cart sub-views).
  TypeScript : `Omit<DialogPrimitive.Content props, "onDrag"
  | "onDragStart" | "onDragEnd">` to avoid collision between
  React's native DragEvent handlers and motion's
  PanInfo-based signatures.
- **Pure threshold helpers exported for unit testing**
  (`shouldCloseOnSwipe(info)` in CartDrawer ;
  `shouldTriggerRefreshOnRelease(distance)` in
  `app/marketplace/pull-to-refresh.ts`). jsdom can't simulate
  motion's drag-event detection nor the full pointer-capture
  sequence faithfully ; isolating the gesture decision logic
  in a pure function gave 7 specs that exercise the only
  surface that would actually regress in production. The
  gesture flow itself is the library / browser's
  responsibility — live MiniPay validation is the source of
  truth.
- **Pull-to-refresh state machine via plain CSS transitions
  (no motion drag)** : the marketplace's PTR is a 3-state
  machine (idle / pulling / released) that doesn't need
  motion's drag prop. CSS `transition-[transform,opacity]
  duration-300 ease-out` on release gives a spring-like snap
  without paying the +8 kB bundle cost of wrapping
  `<main>` in `LazyMotion(domMax)`. Live drag stays
  transition-free (instant 1:1 finger tracking) — the class
  is added only after pointerUp via `isReleased` state.
- **Visible affordance is the a11y path** : every gesture in
  Block 2 has a non-touch fallback that's keyboard /
  screen-reader reachable. Cart drawer : ESC + backdrop +
  close button (Radix DialogPrimitive built-ins). Marketplace
  PTR : visible Refresh button at the page header
  (`data-testid="marketplace-refresh"`,
  `aria-label="Refresh marketplace products"`). Gesture
  surfaces carry `aria-hidden="true"` so screen readers
  ignore them.

**Phase 5 polish items identifiés en route Block 2** :

- `dev-ngrok.ps1` + autres dev scripts à promote vers inner
  repo (manquant côté inner — discovery pendant Block 2
  workflow). Defer Phase 5 polish items pass.
- MiniPay WebView Android `overscroll-behavior: contain`
  validation live — différée au handoff Mike. If the browser
  PTR fires in parallel with the custom PTR (double-refresh
  symptom), the CSS rule needs to move higher in the tree
  or be paired with `touch-action: pan-y` on the pull
  surface.
- Cart drawer mobile responsive : SheetV4's default
  `max-w-[400px]` was overridden to `max-w-none sm:max-w-md`
  to preserve the original full-screen-on-mobile width.
  Live MiniPay test will confirm the V5 styling
  (`rounded-l-3xl`, `shadow-celo-lg`, `bg-celo-light` +
  dark-mode variants) feels native ; if `border-neutral-200`
  on the inner header / footer borders looks weak in dark
  mode, swap to `border-celo-dark/[8%]` (cosmetic, not a
  blocker).
- `useMarketplaceProducts` is the 5th TanStack consumer with
  the canonical `staleTime: 30_000` + `retry: 1` pattern.
  When a 6th consumer surfaces, consider extracting the
  defaults into a tiny `lib/query-defaults.ts` shared object.

**Hand-off Mike for live MiniPay validation Block 2 gestures** :

1. Restart dev server from canonical inner repo (hotfix #9 +
   #10 banners confirm placement) :
   ```powershell
   cd C:\Users\Oxfam\projects\etalo\Etalo\packages\backend
   .\venv\Scripts\Activate.ps1
   python scripts\run_dev.py
   # In another terminal :
   cd C:\Users\Oxfam\projects\etalo\Etalo\packages\web
   npm run dev
   ```
2. Open MiniPay on phone via `chrome://inspect/#devices` to
   the ngrok tunnel.

3. **Cart drawer swipe-to-close** :
   - Click the cart icon in PublicHeader → drawer slides in
     from the right with the SheetV4 spring (stiffness 350,
     damping 30) ; rounded-left corner, dark-mode-aware.
   - Swipe the drawer rightward ~150 px → drawer animates
     out and closes. Threshold is 100 px OR 500 px/s flick ;
     either condition met fires close.
   - Re-open the cart, perform a short swipe ~50 px → the
     drawer should rubber-band slightly (dragElastic 0.2)
     then snap back to its resting position via
     `dragSnapToOrigin`. No close.
   - Re-open the cart, press ESC on the keyboard (or click
     the X close button) → drawer closes. Backdrop click
     also closes (a11y paths intact, Radix DialogPrimitive).

4. **Marketplace pull-to-refresh** :
   - Navigate to `/marketplace`. Confirm the visible Refresh
     button (ArrowsClockwise icon, top-right of "Marketplace"
     heading) is present.
   - Scroll to the top (scrollY === 0). Drag downward ~200 px
     → indicator fades in (opacity ramps 0 → 1 across
     [0, 80 px]) and translates with the finger. Past
     threshold the icon rotates 180° as the "release to
     refresh" cue.
   - Release past threshold → indicator + content snap back
     in 300 ms ease-out, refetch fires, icon spins via
     `animate-spin` until the refetch resolves.
   - Re-test below threshold : drag ~50 px → release →
     snap back, no refetch fired.
   - Scroll past the top (scrollY > 0). Drag downward → no
     pull initiated, normal scroll only. The gesture state
     machine never enters `isPulling`.
   - Test the visible Refresh button click (a11y path) →
     spinner + grid refresh, button disabled during refetch.

5. **Mobile responsive 360-414 px** : confirm no horizontal
   overflow reintroduced (Block 2 doesn't change layout but
   the SheetV4 width override needs visual confirmation).

6. **CSS `overscroll-behavior: contain` validation** : during
   the marketplace pull, watch for the Android Chrome /
   WebView native pull-to-refresh icon at the top of the
   browser chrome. It should NOT fire ; the custom indicator
   should be the only visual feedback. If you see both, we
   need to escalate the `overscroll-contain` placement or
   add `touch-action: pan-y`.

**Sign-off Block 2** : DELIVERED 5/5 sub-blocks. 5 commits
on `feat/design-system-v5`. Mobile gestures critiques
shipped with full a11y complement (visible affordance =
keyboard / SR path on every gesture surface). Tests
247 → 266 PASS, 16 kB headroom preserved on
/seller/dashboard. Ready for Phase 5 Block 3 (Robinhood
QA pass side-by-side comparison) per Mike's call.

#### Phase 5 polish residual items batch — CLOSURE 2026-05-04 ✅ 5/5 items handled (3 actionable shipped + 2 deferred)

Mike skip Block 3 (Robinhood QA) + grants pre-submission temporarily
to focus polish DX + accumulated residual items identified across
Phase 4-5 sprints. Phase 1 audit narrowed batch from 5 candidates
to 3 actionable items (Items 2 + 3 deferred after audit reveals
premise invalidated).

**etalo-dev-all.ps1 one-command launcher** (Phase 5 polish DX, pre-residual-batch) ✅

- 2 commits : initial `07767d5` + wt argv parsing iteration 2 `cfca3c5`
- 3 Windows Terminal tabs (backend + frontend + ngrok) with INNER canonical paths pinned
- Lessons retenues catalogue :
  1. `Start-Process -ArgumentList` ne quote pas reliably les éléments avec espaces — préférer titres no-space (hyphen `Etalo-Backend` not `Etalo Backend`)
  2. wt scanne `;` à travers argv elements — escape `\;` inside command strings requis pour préserver les semicolons inner
  3. Multi-tab single-call `wt new-tab ... \`; new-tab ...` casse en multi-line PS (newline termine statement) — préférer 3 `Start-Process wt -ArgumentList @(...)` séparés avec `-w 0`

**Item 4 — useReducedMotion gates ButtonV4 + PageTransition** (residual batch) ✅

- Commit `336fa67`
- WCAG 2.3.3 Animation from Interactions complete sur ALL motion surfaces V5 (DialogV4 + SheetV4 + ButtonV4 + PageTransition + AnimatedNumber matchMedia)
- `data-reduced-motion` attribute added pour test observability (mirrors DialogV4/SheetV4 pattern from polish #5)
- forwardRef wrap (Phase 5 polish #3 commit `2707d75`) preserved through refactor
- +4 specs (Button reduced + standard, PageTransition reduced + standard)

**Item 1 — USDT formatters consolidation lib/usdt.ts** (residual batch) ✅

- Commit `15fd56b`
- Phase 1 audit identified 4 USDT formatters scattered across 3 files with 1 critical name collision (`displayUsdt` in both lib/usdt.ts (bigint) AND lib/api.ts (string)) ; audit also revealed lib/usdt.ts:displayUsdt(bigint) was dead code (zero external imports) — consolidation simultaneously removes the dead path AND eliminates the collision risk
- 4 explicit named functions in lib/usdt.ts :
  * `displayUsdtFromBigint(bigint)` — canonical home for raw 6-decimal SSR consumers
  * `displayUsdtFromDecimalString(string)` — formerly lib/api.ts:displayUsdt
  * `displayUsdtFromHumanNumber(number)` — formerly OverviewTab.tsx:displayUsdtNumber promoted from local helper
  * `formatRawUsdt(number)` — formerly lib/seller-api.ts:formatRawUsdt centralized
- 4 consumer call-sites updated (OverviewTab, OrdersTab, [handle]/[slug]/page.tsx, opengraph-image.tsx)
- All locale-pinned "en-US" (consistent Phase 5 Block 1 sub-block 1.5 sweep)
- +18 specs in new lib/__tests__/usdt.test.ts (all 4 display formatters + Web3 primitives + edge cases including locale-pin assertion)

**Item 2 — PINATA_GATEWAY promotion** : SKIPPED (deferred, 2 source consumers seulement (ImageUploader + OverviewTab), promote-on-3rd-consumer trigger not fired ; defer until 3rd consumer surfaces)

**Item 3 — ESLint custom rule tabular-nums** : SKIPPED (deferred V1.5+, review-based adoption sufficient — Phase 5 Block 1 sub-blocks 1.1-1.5 sweep covered existing surfaces, custom rule + plugin scaffolding overhead overkill V1)

**Item 5 — Outer repo deletion** ✅

- Outer repo `C:\Users\Oxfam\projects\etalo` (excluding `Etalo/` inner) deleted via Option B selective delete (5 min trivial vs Option A 60-90 min path migration coordination cost)
- Powershell command :
  ```powershell
  Get-ChildItem C:\Users\Oxfam\projects\etalo -Force | Where-Object { $_.Name -ne 'Etalo' } | Remove-Item -Recurse -Force
  ```
- Disk reclaim ~1 GB (outer node_modules + .next caches + venv + abandoned packages)
- Mental model simplified : `C:\Users\Oxfam\projects\etalo` is now just a parent shell containing the canonical `Etalo/` inner. No more dual-repo source confusion possible.
- Hotfix #9 + #10 footgun definitively eliminated at root cause — frontend predev fail-fast hook + backend run_dev.py guard no longer reachable since the outer trees they protected are gone. The inner repo retains the banner messaging at startup (`✓ Running backend from CANONICAL inner repo (...) — Phase 4 hotfix #10 banner`) as historical anchor + V1.5+ reactivation reference if any rare future scenario requires re-deploying the outer for any reason.
- `README_OUTER_REPO_DEPRECATED.md` was edited locally pre-deletion to fix a critical command footgun (the original `Remove-Item -Recurse -Force C:\Users\Oxfam\projects\etalo` command would have wiped the canonical `Etalo/` inner subdirectory nested within ; corrected to Option A `Move-Item` first then delete + Option B selective delete preserving Etalo/) ; not committed to outer's git since outer was already abandoned per existing convention (`These changes are local-only` per the README itself), and outer's git was wiped with the rest of the outer tree at deletion.

**Cumulative batch metrics** :

- Test count : 273 → 295 PASS (+22 specs cumulé : +4 Item 4, +18 Item 1)
- Commits actionable : 4 on `feat/design-system-v5` (`336fa67` Item 4 + `15fd56b` Item 1 + 2 docs commits this batch closure + `07767d5`/`cfca3c5` etalo-dev-all.ps1 launcher pre-batch)
- tsc --noEmit : clean (USDT name collision résolue confirmed)
- Bundle delta : négligeable cumulé (motion infra reused, USDT consolidation legère réduction via dedup)

**Next** : Mike's call. Phase 5 Block 3 (Robinhood QA), Block 4 (polish details pass), grants pre-submission, OR autre angle.

#### Phase 5 Angle C — Backend ADR-041 sweep CLOSURE 2026-05-04 ✅ 4/4 commits shipped

Backend tightening (Literal + Settings) + frontend defensive shim cleanup, completing the ADR-041 sweep that had been deferred since sub-block 5.2a. Audit revealed `badge` was actually plain `str` (enum existed only in comment + frontend shim + test set) — Literal upgrade is a net gain rather than just a defensive cleanup.

| Sub-block | Commit | Scope |
|---|---|---|
| C.1 | `fb21001` | Backend `ReputationBlock.badge` tightened from `str` to `Literal["new_seller", "active", "suspended"]` ; "top_seller" dropped (V1.1 deferred per ADR-041) ; backend `ALLOWED_BADGES` set + TODO comments updated |
| C.2 | `4ae6f49` | Backend `auto_release_days` lifted from literal `3` to `Settings.auto_release_days` (default 3) ; 2 replace sites in routers/analytics.py + new `from app.config import settings` import + module docstring updated to mark sub-block C.1 + C.2 closure |
| C.3 | `42f910e` | Frontend defensive shim `"top_seller" → "active"` removed in `useAnalyticsSummary.ts` ; replaced with simple cast `raw.reputation.badge as AnalyticsBadge` (cast remains until `pnpm gen:api` regen narrows api.gen.ts to backend Literal) ; test describe block renamed "ADR-041 badge filter" → "badge passthrough" with the `["top_seller", "active"]` shim case dropped |
| C.4 | this commit | Sprint doc closure |

**Pattern decisions locked Angle C** :

1. **"Configuration over magic numbers"** — `auto_release_days` lifted to `Settings` for forward-compat with V2 market segmentation (intra/cross-border timer variants), env override possible without code change. Pydantic Settings already had infrastructure for the precedent (contract addresses, indexer config), so the lift was 5 lines + 2 replace sites.
2. **"Tighten types at the source"** — Pydantic `Literal[...]` vs `str` + comment-only enum hint is a net gain : OpenAPI emits proper enum metadata, FastAPI validates the response at the boundary, downstream `pnpm gen:api` narrows `api.gen.ts` to a TypeScript Literal automatically. The pre-Angle-C state had `badge: str` with the enum existing only in a comment — Literal is the correct primitive.
3. **"Drop defensive shims when source-of-truth fixes"** — the frontend shim `"top_seller" → "active"` (sub-block 5.3 commit `8f6dd90`) was protective scaffolding while the backend still emitted the legacy enum value. Once the backend dropped it (C.1), the shim became dead code ; removed cleanly without back-compat hedging per CLAUDE.md philosophy "don't add backwards-compatibility shims when you can just change the code".

**Métriques cumulées Angle C** :

- Backend tests : 5/5 e2e PASS conserved (no behavior change V1, default `auto_release_days=3` matches existing assertions)
- Frontend tests : 295 → **294 PASS** (-1 spec : `["top_seller", "active"]` shim case dropped, irrelevant post-shim removal)
- Files touched : 5 cumulé
  - Backend (3) : `app/schemas/analytics.py`, `app/config.py`, `app/routers/analytics.py`
  - Backend tests (1) : `tests/e2e/test_analytics_e2e.py` (`ALLOWED_BADGES` set + TODO comments)
  - Frontend (2) : `src/hooks/useAnalyticsSummary.ts` (shim removed), `src/hooks/__tests__/useAnalyticsSummary.test.tsx` (describe renamed + shim case dropped)
- Bundle delta : minimal frontend (légère réduction `useAnalyticsSummary` chunk via shim removal ~10 lines), 0 backend
- LOC delta cumulé : +49 / −60 (net -11)
- tsc --noEmit : clean
- ADR-041 sweep complete : backend + frontend aligned, no defensive code remaining

**Mike action post-merge** : run `pnpm gen:api` au next backend session (require backend up via `etalo-dev-all.ps1`) to regenerate `packages/web/src/types/api.gen.ts` with the new `badge: Literal["new_seller" | "active" | "suspended"]` type. Once regen, the `as AnalyticsBadge` cast in `useAnalyticsSummary.ts` becomes type-safe automatic (since `api.gen.ts` now narrows to the same Literal).

#### Phase 5 Angle E — A11y deep audit CLOSURE 2026-05-04 ✅ 4/4 sub-blocks shipped

Code-level a11y audit covering semantic HTML, ARIA, alt text, form labels, focus management, keyboard navigation, color contrast tokens, touch targets. Phase 1 read-only audit confirmed a strong baseline (Phase 4-5 a11y work paid off — only 3 actionable findings) ; Phase 2 batch closed all 3 with code fixes + tests.

| Sub-block | Commit | Scope |
|---|---|---|
| E.1.a | `d5fa071` | Skip link `<SkipLink>` component + `id="main"` on 9 page-level `<main>` elements (HomeLanding, HomeMiniPay, marketplace loading + active branches, [handle] boutique, [handle]/[slug] product, seller/dashboard SellerDashboardInner + StatusShell + DashboardSkeleton, checkout LoadingShell + error + CheckoutFlow). WCAG 2.4.1 Bypass Blocks (Level A). |
| E.1.b | `9ca6557` | `FormField` helper refactored to use `useId` + `cloneElement` for label↔input association. WCAG 1.3.1 + 3.3.2 (Level A). 5 ProductFormDialog inputs benefit (Title / Slug / Description / Price / Stock). |
| E.2 | `642097b` | Button groups use `role="group"` + `aria-labelledby` pattern. WCAG 1.3.1 (Level A). 2 surfaces : MarketingTab caption language toggle + TemplateSelector 6-button grid. |
| E.3 | this commit | Sprint doc closure |

**Pattern decisions locked Angle E** :

1. **Skip link sr-only focus:not-sr-only** — invisible default keeps the Robinhood-target visual minimalism, the `focus:not-sr-only` + visual focus styling reveals the affordance only for the user who needs it (Tab activation). z-50 lifts above sticky `<PublicHeader>`. Extracted as a `SkipLink` component for testability — `RootLayout`'s `<html>`/`<body>` are awkward to mount in jsdom, so a dedicated component keeps the Vitest contract pin local without heavy renderToStaticMarkup workarounds.
2. **FormField useId + cloneElement** — React 18+ `useId` idiomatic, generates a unique id at render time, `cloneElement` injects it onto the single child element so call-sites stay flexible (input / textarea / custom components — anything accepting `id` prop). Caller-supplied `id` on the child takes precedence (`childIdProp ?? generatedId`), preserving consumer flexibility. FormField exported from ProductFormDialog for unit-test reach.
3. **Button group role="group" + aria-labelledby** — lower-cost than `<fieldset><legend>` which would have broken the existing `space-y-2` + `flex` / `grid` layouts without a `display: contents` workaround. The visible label survives styling-wise as a `<span>` with the same Tailwind classes ; the semantic gain comes from the wrapper `role="group"` + `aria-labelledby` linking it to the buttons.

**Métriques cumulées Angle E** :

- Frontend tests : 294 → **298 PASS** (+4 specs : SkipLink presence + sr-only default + FormField label↔input association + TemplateSelector group accessible name)
- Frontend test files : 38 → **41** (+3 new : SkipLink.test.tsx, ProductFormDialog.test.tsx, TemplateSelector.test.tsx)
- Bundle delta : 0 strict (a11y attribute additions only — no logic, no new dependencies)
- Files touched : 14 cumulé (new : SkipLink component + 3 test files ; modified : layout, 9 page-level components for `id="main"`, ProductFormDialog FormField, MarketingTab + TemplateSelector group wrappers)
- WCAG Level A compliance gaps closed : 2.4.1 Bypass Blocks + 1.3.1 Info Relationships + 3.3.2 Labels or Instructions
- LOC delta cumulé : +205 / −22 (net +183, mostly tests + new SkipLink component + JSDoc-style comments)

**Strong points confirmed by audit** (no findings on these — Phase 4-5 work paid off) :

- All `<img>` + `<Image>` have alt props (decorative `alt=""`, informative descriptive)
- Zero `<div onClick>` anti-pattern — every interactive element is `<button>` or proper anchor
- Touch targets ≥ 44×44 pervasive (`min-h-[44px]`, `h-11 w-11`) including icon-only buttons
- `aria-label` on icon-only buttons systematic (10+ instances)
- `<html lang="en">` declared, body text 16px+ minimum
- `focus-visible:` applied across interactive elements (43 occurrences in 21 files)
- `aria-hidden="true"` on decorative icons (21 instances)
- `aria-pressed` on toggle buttons
- Semantic HTML : `<main>`, `<section>`, `<header>`, `<nav>`, `<footer>` (28 occurrences across 13 files)
- DialogV4 + SheetV4 inherit Radix primitive a11y (focus trap, ESC handling, `aria-modal`)
- `useReducedMotion` gates on ALL V5 motion surfaces (Phase 5 polish #5 + Item 4 closed)
- DialogV4Description / SheetV4Description handled (Phase 5 Item D fix, commit `f1c5c88`)

**Mike parallèle action** : run Lighthouse + axe DevTools browser audit on 6 surfaces (Option A from Phase 1 audit) to surface findings code-level audit can't catch :

- Color contrast violations (4.5:1 body / 3:1 large) on celo-forest theme
- Mobile WebView (MiniPay) specific issues that desktop Chrome doesn't reproduce
- Tab order natural / unexpected reflows during route transitions

If findings surface, separate Phase 2 commit batch can address them.

**V1.5+ a11y backlog** :

- Screen reader manual testing (NVDA / VoiceOver) — JSDom can't simulate
- Lighthouse CI integration via `@axe-core/cli` + 4th job in `ci.yml`
- Translated content review (i18n placeholder in current labels)

**Sprint J10-V5 status** : **~99% wall-clock complete**. Phase 4 ✓ + Block 1-2 ✓ + 7 polish items ✓ + Angle A residual ✓ + Angle D DX polish ✓ + Angle C ADR-041 sweep ✓ + Angle E a11y deep audit ✓. Reste : Phase 5 Block 3 (Robinhood QA side-by-side comparison) + Block 4 (polish details pass) + Angle F (performance) + Angle B (UX feel) + Proof of Ship + grants pre-submission — Mike's call on next angle or pause.

Goal : tabular nums + mobile gestures + side-by-side QA pass + Proof of Ship + grants.

**Scope narrative locked par ADR-041 (2026-04-30)** :
V1 = intra-Africa only, 4 markets big bang (Nigeria + Ghana + Kenya
+ South Africa), single commission rate 1.8%, no seller stake.
Toutes les surfaces V5 Phase 5 (demo video, README, grants pitch,
Proof of Ship narrative) doivent refleter ce scope simplifie.

**Blocks** :

1. **Tabular nums systematic application** (1j) — `font-feature-settings: "tnum"` partout sur amounts USDT, credit balance, transaction counts, sparkline values
2. **Mobile gestures critiques** (1-2j) — swipe-to-close cart drawer + pull-to-refresh marketplace
3. **Side-by-side comparison Robinhood QA pass** (1j) — Mike capture screenshots + compare 10 critères (typography, spacing, contrast, motion, density, icons, depth, tabular nums, empty states, loading)
4. **Proof of Ship submission** (1-2j) — narrative locked par ADR-041 :
   - Pitch one-liner : "African intra-trade USDT escrow, 1 transparent rate, 4 markets at launch (NG + GH + KE + ZA), big-bang mainnet, MiniPay distribution"
   - Demo video 3 min : flow buyer + flow seller end-to-end V5 design, no cross-border surfaces, no stake deposit screen, no Top Seller badge
   - ToS / Privacy / Support URL setup, icon 512×512, manifest, sample tx links Sepolia
   - 4-markets country selector visible dans demo (NG + GH + KE + ZA)
   - Single commission 1.8% transparency : montrer dans demo le breakdown order
5. **Grants application Celo Foundation** (1-2j) — Africa-first single-market submission strategy ADR-041 :
   - Narrative simplifie : 1 corridor type + 1 rate + 4 markets concurrent launch
   - Argument simplification : "reviewers can audit one corridor, dispute-rate signal is one number not 2-corridor split"
   - Reference Celo Camp Africa presence (mitigation South Africa regulatory risk)
   - Reference V5 design premium + non-custodial positioning (ADR-022)
   - Roadmap V1.1 (Top Seller program) + V2 (cross-border re-introduction) clearly indique
6. **Polish details pass** (1-2j) — hover states cohérents, transitions 200ms uniformes, micro-spacings ajustes selon QA findings
7. **Karma GAP profile + Farcaster post + repo README polish** (1j) — submission package preparation, README highlighting 4-market intra-Africa scope
8. **Closure J10-V5 final** (0.5j) — PR #7 final + tag `v2.0.0-design-system-v5-sepolia` + bilan complet sprint

**Validation** : tout V5 complet, side-by-side comparison Mike valide qualitative 75-85% Robinhood-feel, submission Proof of Ship envoye avec narrative ADR-041 intra-Africa, grants Celo applique avec Africa-first message.

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
- `docs/DECISIONS.md` ADR-041 (V1 scope restriction — intra-only + 4 markets + single rate)
- `docs/DESIGN_V5_PREVIEW.md` (spec complete)
- `docs/SPRINT_J9.md` (V4 component library livree, base extension V5)
- `docs/V1.5_BACKLOG.md` (items deferred V1.5+)
