# Sprint J9 — Design system V4 foundations (mai 2026)

**Sprint objective**: Établir le design system V4 (foundations + tokens
+ component library + storybook-light) qui servira d'ancrage visuel
pour la migration progressive des pages J10-J12 et le polish J13. La
landing actuelle (déjà alignée V4 source de vérité) sert de référence.

**Approche hybride** :

- Phase J9 (ici) : foundations — extension doc, tokens Tailwind, base
  components, page de démo `/dev/components`.
- Phase J10-J12 : pages migrées progressivement (vitrine J10, transaction
  J11, ops J12).
- Phase J13 : polish + Proof of Ship submission.

**Flag « épargne if good enough »** : actif. Les pages déjà polish
J6-J7 (seller dashboard, marketing tab) peuvent être alignées sur les
tokens V4 (palette + typo) sans full repaint structurel. Décision
au cas par cas pendant J10-J12.

**Branche** : `feat/design-system-v4` depuis `main` post-tag
`v2.0.0-pre-audit-sepolia` (HEAD = 1e7875b, J8 merge commit).

**Estimation** : 5 blocks, ~5-6 jours total.

**Source design** : `docs/DESIGN_V4_PREVIEW.md` (palette Celo, Instrument
Serif + Inter, premium minimalism Stripe / Mercury / Linear).

---

## Décisions verrouillées Phase 1

| # | Question | Décision |
|---|---|---|
| Q1 | Approche | **Hybride** — component library first + extrapolation guidée |
| Q2 | Scope J9 | **Foundations complet** (extension doc + tokens + components + storybook-light + closure) |
| Q3 | Flag épargne | **Actif** (pages déjà polish J6-J7 alignées sur tokens V4 sans full repaint) |

---

## Décisions techniques importantes

- **Coexistence shadcn legacy + V4** — pendant J9-J12, les composants V4
  vivent dans `packages/web/src/components/ui/v4/` séparés des shadcn
  legacy `packages/web/src/components/ui/`. Les pages migrent
  progressivement vers V4. Une fois J12 terminé, suppression des
  legacy shadcn.
- **Palette extension PAS override** — `tailwind.config.ts` garde les
  Tailwind defaults + ADD le namespace `celo` (e.g. `bg-celo-light`,
  `text-celo-forest`). Les composants V4 utilisent uniquement le
  namespace celo. Les pages legacy continuent d'utiliser `neutral-*` et
  `gray-*` jusqu'à leur migration. **Critique** pour éviter de casser
  toute l'app au Block 2.
- **Google Fonts via `next/font/google`** — Instrument Serif (display) +
  Inter (body). Loading optimisé au build, pas de FOUT.
- **Component library stockée dans `packages/web/src/components/ui/v4/`** —
  nouveau sous-dossier. Chaque composant a son `.tsx` + ses tests
  Vitest dans `__tests__/`.
- **Storybook-light = page Next.js** `/dev/components` — route protégée
  dev only via env var ou middleware, pas Storybook réel (overhead
  trop fort solo dev).

---

## Blocks

| # | Block | Durée | Livrable |
|---|---|---|---|
| 1 | Extend DESIGN_V4 doc — principes pages non-landing | 0.5j | `docs/DESIGN_V4_PREVIEW.md` amendé avec principes high-level marketplace + dashboard + checkout + dialogs + states |
| 2 | Setup `tailwind.config.ts` design system tokens | 1j | palette celo + typography scale + spacing + radii + shadows + animations + Google Fonts integration |
| 3 | Build base component library V4 | 3-4j | atomes restylés : Button Card Dialog Input Tabs Sheet Badge Toast (`packages/web/src/components/ui/v4/`) |
| 4 | Storybook-light `/dev/components` | 0.5j | page de démo avec tous les composants + variants visibles, accessible localement |
| 5 | Closure J9 (PR #6 + tag) | 0.5j | `docs/SPRINT_J9.md` final wrap-up + PR #6 + tag `v2.0.0-design-system-sepolia` |

---

## Block 1 — Extend DESIGN_V4 doc (à détailler à son démarrage)

Identifier les surfaces non-couvertes par le doc actuel (focus landing) :

- Marketplace cards (parité ProductCard boutique).
- Seller dashboard (tabs, body, dialogs).
- Checkout flow (status states, tx hashes en mono Inter).
- Dialogs (border-radius 24px, shadow `0 8px 32px rgba(46,51,56,0.12)`).
- Forms (input border-radius 12px, focus state forest 2px ring).
- Empty / Loading / Error states (illustrations subtiles + copy Inter).

Livrable : 1 commit `docs(design): extend DESIGN_V4_PREVIEW with non-landing principles` sur `feat/design-system-v4`. Pas de PR ni tag avant Block 5 closure.

---

## Blocks 2-5 (à détailler à leur démarrage)

Chaque block sera détaillé via un prompt Cowork dédié au moment de son
démarrage, sur le même modèle que Block 1.

- **Block 2** — `tailwind.config.ts` : namespace `celo` (Light, Forest,
  Sand, accent), typography scale (display Instrument Serif, body Inter),
  spacing scale 4/8/12/16/24/32/48/64, radii (8/12/16/24px), shadows
  (sm / md / lg / hero), animation tokens (durée + easing).
  Google Fonts via `next/font/google`. **Sans toucher aux pages legacy**.
- **Block 3** — Component library V4 atomes : `Button` (primary / secondary
  / ghost), `Card`, `Dialog`, `Input`, `Tabs`, `Sheet`, `Badge`, `Toast`.
  Chaque composant a son `.tsx` + tests Vitest. Localisé dans
  `packages/web/src/components/ui/v4/`.
- **Block 4** — Storybook-light : route `/dev/components` (Next.js page),
  protégée dev only. Affiche chaque composant avec tous ses variants
  visuels. Pas Storybook réel.
- **Block 5** — Closure : `docs/SPRINT_J9.md` final wrap-up (bilan +
  lessons), PR #6 vers `main`, tag `v2.0.0-design-system-sepolia`.

---

## Critères de réussite J9

- [x] `docs/DESIGN_V4_PREVIEW.md` amendé avec principes pages non-landing
- [x] `tailwind.config.ts` avec design system tokens namespacés sous `celo`
- [x] Component library V4 livrée — **8 composants, 37 exports**
- [x] Storybook-light `/dev/components` affiche tous les composants V4
- [x] **0 régression** : `npm run build` clean, vitest **93/93 PASS** (35 baseline + 58 V4 specs)
- [x] PR #6 + tag `v2.0.0-design-system-sepolia` posés

---

## Post-J9 (pages migration phase)

- **J10** — Vitrine pages (landing complète + boutique seller + product detail).
- **J11** — Transaction pages (checkout + payment status + dispute UI).
- **J12** — Ops pages (seller dashboard + marketing tab + admin).
- **J13** — Polish + Submission Proof of Ship.

Flag « épargne if good enough » appliqué case par case selon la maturité
visuelle de chaque page existante.

---

## Sprint J9 closure — bilan final (2026-04-27)

**Status**: COMPLET 5/5 blocks
**Branche**: `feat/design-system-v4`
**Tag**: `v2.0.0-design-system-sepolia` (sur le merge commit PR #6)
**PR**: #6 vers `main`

### Stats finales

- **13 commits** sur la branche (1 launch chore + Block 1 docs + Block 2
  feat + Block 3 split en 8 chunks atomiques + Block 4 dev page + Block 5
  closure docs)
- **Tests cumulés** : 35 baseline → **93 PASS** (+58 specs V4 nouveaux)
- **8 composants V4** livrés dans `packages/web/src/components/ui/v4/` :
  Button, Input, Card, Dialog, Sheet, Tabs, Badge, Toast
- **37 exports** au total (atomes + sub-parts)
- **Storybook-light** `/dev/components` 522 LoC reference visuelle
- **Lessons critiques #46-#52** (7 nouveaux patterns persistés) :
  - **#46** V4-local cn from `utils.ts` — `extendTailwindMerge` config
    pour reconnaître les V4 tokens custom (text-display-*, text-body-*,
    shadow-celo-*, rounded-pill)
  - **#47** `type` alias pour empty-prop sub-parts (évite ESLint
    `@typescript-eslint/no-empty-object-type`)
  - **#48** `opacity-60` inheritance pattern pour variants dark
    (CardDescription, DialogDescription, SheetDescription : la color
    s'adapte automatiquement au parent text-color via opacity)
  - **#49** Negative margin bleed dark headers (`-m-6 mb-4 p-6
    rounded-t-3xl` pour faire bleed le header dark jusqu'aux bords du
    Content tout en respectant le radius)
  - **#50** `userEvent` requis pour Radix interactive components
    (Tabs/Toggle/Menu/Select) — `fireEvent.click` n'envoie pas la
    séquence pointer complète
  - **#51** `bg-current` pour auto-inherit color (Badge dot adopte la
    couleur du text variant sans conditional logic)
  - **#52** Sonner `<ol>` mounting on-demand — la `<section
    aria-label="Notifications">` est toujours présente, mais l'`<ol>`
    avec `data-y-position` n'apparaît qu'avec un toast actif

### Block timeline (chronologique)

| # | Block | Commit | Livrable |
|---|---|---|---|
| Setup | `bdad6ae` | sprint plan |
| 1 | `5b87d02` | DESIGN_V4_PREVIEW.md extension non-landing |
| 2 | `e710075` | tailwind.config.ts tokens + Google Fonts |
| 3a | `ea1c765` | Button V4 (8 specs) |
| 3b | `5f3a3d7` | Input + Label + HelperText V4 (8 specs) |
| 3c | `f7343aa` | Card V4 + 5 sub-parts (7 specs) |
| 3d | `40f75e8` | Dialog V4 + 9 sub-parts (8 specs) |
| 3e | `6f27b0c` | Sheet V4 + 9 sub-parts (8 specs) |
| 3f | `ef13205` | Tabs V4 + 3 sub-parts (7 specs) |
| 3g | `4200988` | Badge V4 (6 specs) |
| 3h | `eca880d` | Toast V4 + ToasterV4 swap (6 specs) |
| 4 | `ea1cbb2` | Storybook-light /dev/components |
| 5 | TBD | J9 closure docs |
| **Merge** | TBD | PR #6 → main, tag `v2.0.0-design-system-sepolia` |

### Sign-off

Design system V4 foundations livrées : tokens en namespace `celo` (zéro
override shadcn legacy), 8 composants prêts-à-l-emploi avec leurs sub-parts,
37 exports, 58 vitest specs, page de référence visuelle.

Coexistence shadcn legacy + V4 garantie 0-régression sur les 13 commits
(tous les `npm run build` clean, tous les vitest verts incluant les 35
specs J7 baseline).

Pages legacy non touchées en J9 — **flag « épargne if good enough »** actif
pour J10-J12 (les pages déjà polish J6-J7 peuvent être alignées sur tokens
V4 sans full repaint structurel).

Prêt pour **J10 Phase Vitrine** (landing + public boutique + cart drawer
migration vers V4). Mainnet target reste **Q4 2026 — Q1 2027** per ADR-039
audit strategy V1 (freelance + AI-assisted).
