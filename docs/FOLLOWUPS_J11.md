# Follow-ups Sprint J11 (et après)

Tickets dérivés de l'incident response H-1 (mai 2026) — bundle
`fix/h1-dispute-funded-guard`. Ces items sont hors scope du bundle
de fix mais doivent rester sur le radar pour le sprint J11+.

---

## FU-J11-001 — Consolider test infra autour du real escrow

**Origine** : Incident response H-1 (Path B alternative non retenue).
**Estim** : 3-4h.
**Prio** : Medium.
**Owner** : Mike.

### Contexte

Le bundle H-1 a retenu Path A (étendre `MockEtaloEscrow.sol` pour modeler
`fundedAt` + adapter le fixture `deployDispute`) plutôt que Path B
(retirer le mock et router tous les tests EtaloDispute via le real
escrow). Path A a été choisi parce que :
- ROI immédiat (≈15 min effort vs 3-4h)
- Integration.v2 (15 scenarios real-contract) couvre déjà la couche
  rigoureuse
- Le mock joue un rôle légitime : isolation pure du dispute contract
  pour unit tests

Mais Path A laisse un **drift risk structurel** : si une future ADR
change l'invariant attendu sur `Order` (nouveau champ requis, nouvelle
status transition, nouvelle interaction), le mock peut diverger
silencieusement du real escrow et masquer une régression.

L'incident H-1 a illustré exactement ce risque : le mock n'avait
historiquement jamais besoin de `fundedAt`, donc l'invariant
"`fundedAt > 0` requis pour disputer" n'était pas testé en isolation
dispute. Path A le corrige pour cette ADR mais ne ferme pas la classe
de risque.

### Scope

- Retirer `packages/contracts/contracts/test/MockEtaloEscrow.sol`
- Migrer `test/EtaloDispute.test.ts` (16 tests) vers le fixture
  `deployIntegration` (real EtaloEscrow + chain wired)
- Chaque test doit setup un order funded en début de `it()` (helper
  `createFundedOrder(buyer, seller, itemPrice)` si répétitif)
- Vérifier perf : tests vont passer de mock instantané à real escrow
  ~80-150ms/test, acceptable

### Critère d'acceptation

- `MockEtaloEscrow.sol` supprimé
- `deployDispute` fixture supprimé OU réorienté vers integration
- 16 tests EtaloDispute passent toujours, sémantique identique
- Aucune référence résiduelle à `MockEtaloEscrow` dans le repo
- Test suite total reste sous le budget temps actuel (~30s
  enveloppe pour la full suite)

### Risque résiduel après FU-J11-001

Quasi nul sur le dispute path. Le pattern reste à appliquer si
d'autres mocks "lite" de contrats core émergent (MockEtaloDispute
existe déjà pour tester Voting, on peut faire le même check à
l'occasion).

---

## FU-J11-002 — Sepolia redeploy V2 post-merge

**Origine** : Incident response H-1 (Decision 3).
**Estim** : 1-2h ops.
**Prio** : High (bloquant pour reprise tests E2E sur Sepolia).
**Owner** : Mike.

### Contexte

Le déploiement V2 actuel sur Celo Sepolia contient le bug H-1 :

| Contract | Address (Sepolia, vulnerable) |
|---|---|
| EtaloDispute | `0x863F0bBc8d5873fE49F6429A8455236fE51A9aBE` |
| EtaloEscrow | `0x6caEBc6aDc5082f6B63282e86CaF51AEbd630bfb` |

Custody actuelle EtaloEscrow = **0 USDT** (vérifié 2026-05-05 par
`balanceOf` direct via JSON-RPC). Aucun fonds réel à risque, mais
le code on-chain est exploitable. À redéployer avant reprise
E2E ou démos publiques.

### Pré-requis

- Bundle `fix/h1-dispute-funded-guard` mergé sur main
- ABI freeze post-merge (récupération des nouveaux addresses)
- Deployer PK accessible (env var `DEPLOYER_PRIVATE_KEY` du keystore
  habituel — pas dans le repo)

### Scope opérationnel

1. Recompile contracts depuis main (post-merge HEAD).
2. Run `pnpm exec hardhat run scripts/deploy-v2.ts --network celoSepolia`
   (ou équivalent — vérifier le script existant).
3. Update `packages/contracts/deployments/celo-sepolia-v2.json` avec
   les nouveaux addresses.
4. Update `packages/web/src/lib/v2-addresses.ts` (ou équivalent
   frontend) pour pointer sur la nouvelle suite.
5. Update `packages/backend/.env.sepolia` (indexer config) pour les
   nouveaux contract addresses + start block.
6. Restart backend indexer en `from_block_v2 = <new_deploy_block>`.
7. Mint MockUSDT au deployer + au wallet MiniPay de Mike (10 000 +
   1 000 USDT, replicate la dernière config).
8. Re-stake Tier 1 pour les sellers de test.
9. Smoke test : un order intra créé/funded/disputé/résolu via N1
   amicable côté Sepolia, observer indexer mirror correctement
   peuplé.
10. Documenter le swap d'addresses dans CLAUDE.md (section "Key
    addresses Celo Sepolia testnet — V2 deploys").

### Anciens addresses

Garder en référence dans `docs/DEPLOYMENTS_HISTORY.md` (créer si
absent) avec la mention "vulnerable to H-1 — replaced by redeploy
post-bundle fix/h1-dispute-funded-guard".

### Critère d'acceptation

- Nouveaux addresses on-chain vérifiables via Celoscan Sepolia
- Smoke test E2E vert (create → fund → dispute → resolveN1 →
  refund visible dans wallet buyer)
- Indexer mirror tables peuplées avec les bons orders
- CLAUDE.md à jour
- Frontend pointe sur la nouvelle suite
- Anciens addresses laissés vivants on-chain (custody = 0,
  pas de drain défensif requis) mais documentés comme deprecated

---

## Notes générales

- Reprise Track B (audit Reputation scan-only + synthesis
  `docs/AUDIT_PRE_J11_SUMMARY.md`) reste séquencée APRÈS le merge
  du bundle H-1 et le redeploy Sepolia. Voir directive Mike Step I
  du bundle.
- Aucune communication externe sur H-1 jusqu'à validation Mike
  explicite (pas de tag public, pas de Discord, pas de Twitter,
  pas de forum). Les commits docs internes (ADR-042, audit demote,
  follow-ups) sont confidentiels jusqu'au merge.
