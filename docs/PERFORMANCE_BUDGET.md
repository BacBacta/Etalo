# Etalo — Performance budget (Phase 1 V5)

## Budget

- **Routes principales** (buyer + seller) : First Load JS **< 300 KB**
- **Routes dev** (e.g. `/dev/components`) : pas de budget hard, monitoring
  uniquement (gated par `NEXT_PUBLIC_DEV_ROUTES`, jamais en prod build)
- **Shared chunks** : < 100 KB

Cible MiniPay/Celo : démarrage rapide en 3G+ Afrique de l'Ouest. 300 KB est
calé sur le seuil au-delà duquel TTI > 3s sur les conditions cibles.

## Baseline post-Phase 1 (commit `648fd92`, 2026-04-29)

Mesuré via `npm run build` summary, post Phosphor swap (Block 5).

| Route | First Load JS | % budget | Verdict |
|---|---|---|---|
| `/` (home) | 105 kB | 35% | ✅ |
| `/[handle]` | 114 kB | 38% | ✅ |
| `/[handle]/[slug]` | 120 kB | 40% | ✅ |
| `/marketplace` | 131 kB | 44% | ✅ |
| `/dev/components` | 130 kB | 43% | ✅ (dev-only) |
| `/checkout` | 225 kB | 75% | ⚠️ flag-watch |
| `/seller/dashboard` | 256 kB | 85% | ⚠️ closest |
| Shared chunks | 87.5 kB | — | base |

**Marge restante avant violation** : ~44 KB sur le worst case.

## Tools

- `npm run build` : summary table per-route (CLI, fast)
- `npm run analyze` : `@next/bundle-analyzer` ouvre 3 reports HTML
  (client / edge / nodejs) dans le browser, treemap interactif des modules

`ANALYZE=true` est passé via `cross-env` pour cohérence Windows/Unix.

## Methodology

- Audit perf à la fin de chaque sprint (closure block) avant de mesurer
  l'impact de la phase suivante
- Mesurer le worst-case route en priorité (`/seller/dashboard`)
- Si une route s'approche du seuil dur 280 KB (93% du budget), trigger
  Block 6b cleanup avant d'ajouter de la fonctionnalité

## Trigger optimization

| Route size | Action |
|---|---|
| `< 250 KB` | OK, monitoring seulement |
| `250-280 KB` | ⚠️ Soft warning : audit visuel `npm run analyze` |
| `> 280 KB` | 🚨 Hard trigger : Block 6b cleanup (lazy load, code split, dependency prune) |
| `> 300 KB` | ❌ Budget violé : bloquant pour merge sur `main` |

## Optimization levers (Phase 5+, non actifs Block 6)

1. Suppression `lucide-react` du `package.json` (Phase 5 cleanup) → ~5-10 KB
2. Lazy load icons par route (dynamic import des sets phosphor heavy)
3. Code split route `/seller/dashboard` (les tabs Marketing peuvent être
   chargées on-demand)
4. Phosphor `/icons/lite` build (subset prebuilt) — V1.5+
5. Lighthouse CI integration — V1.5+ (gate auto sur PRs)
