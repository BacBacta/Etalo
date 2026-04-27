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

- [ ] `docs/DESIGN_V4_PREVIEW.md` amendé avec ~30 lignes principes pages non-landing
- [ ] `tailwind.config.ts` avec design system tokens namespacés sous `celo`
- [ ] Component library V4 livrée (8+ composants atomiques)
- [ ] Storybook-light `/dev/components` affiche tous les composants V4
- [ ] **0 régression** : `npm run build` clean, vitest existants pass + nouveaux tests V4 components
- [ ] PR #6 + tag `v2.0.0-design-system-sepolia` posés

---

## Post-J9 (pages migration phase)

- **J10** — Vitrine pages (landing complète + boutique seller + product detail).
- **J11** — Transaction pages (checkout + payment status + dispute UI).
- **J12** — Ops pages (seller dashboard + marketing tab + admin).
- **J13** — Polish + Submission Proof of Ship.

Flag « épargne if good enough » appliqué case par case selon la maturité
visuelle de chaque page existante.
