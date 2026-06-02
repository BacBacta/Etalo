# Plan de migration — redéploiement EtaloEscrow (ADR-057)

Plan opérationnel pour mettre en production les 4 correctifs ADR-057 sur
`EtaloEscrow`, contrat **mainnet non-upgradeable** détenant des USDT en
escrow. À exécuter par les signataires du Safe 2-of-3 après re-audit.

## 1. Contraintes structurelles (qui dictent la stratégie)

| Contrainte | Conséquence |
|---|---|
| **Non-upgradeable** (pas de proxy) | Nouveau contrat = **nouvelle adresse**. Le storage n'est pas réutilisable. |
| **Aucune fonction de sweep/rescue** owner | Les USDT escrow **ne peuvent sortir que** via release/refund/dispute liés à une commande. → On ne peut pas *transférer* les fonds vers le nouveau contrat. **On doit les *drainer*** en laissant les commandes se solder. |
| `EtaloDispute.escrow` = **pointeur unique** | Pendant la transition, Dispute ne peut viser qu'un seul escrow. C'est la **seule vraie contrainte d'overlap**. |
| `EtaloReputation` = **multi-caller** (`setAuthorizedCaller`) | Les deux escrows (ancien + nouveau) peuvent enregistrer la réputation **en parallèle** → continuité préservée. |
| `EtaloStake` gardé par `isCrossBorder` | **Dormant en V1 intra** (ADR-041) → le lien escrow↔stake n'intervient pas. Un de moins à gérer. |
| **Volume de lancement faible** | Le set de commandes en vol est petit ; le drain se fait en jours, pas semaines. |

**Décision clé : pas de migration d'état/fonds on-chain.** On ne
reconstruit pas les commandes dans le nouveau contrat et on n'écrit aucune
fonction de migration dans un contrat de custody (surface de risque
inutile). On **draine l'ancien** (les commandes en vol se soldent
naturellement vers acheteurs/vendeurs) puis on **bascule**. Le nouveau
contrat démarre vierge — `buyerActiveEscrow`, compteurs, `totalEscrowed`
partent de 0, ce qui est correct.

## 2. Pré-migration (J-0)

1. **Snapshot** off-chain de l'état ancien escrow : toutes les commandes
   `globalStatus ∈ {Funded, PartiallyShipped, AllShipped, PartiallyDelivered}`
   (les « en vol »), via `getOrderCount` + `getOrder`/`getOrderItems`.
   C'est la **liste de drain** à suivre jusqu'à 0.
2. **Déployer le nouveau EtaloEscrow** (code ADR-057) avec le même
   constructeur (`_usdt`). Vérifier le bytecode sur Celoscan.
3. **Câbler le nouveau escrow** (setters, ne touche pas encore l'ancien) :
   `setCommissionTreasury / setCreditsTreasury / setCommunityFund` (mêmes
   adresses Safe, ADR-024), `setReputationContract`, `setStakeContract`,
   `setDisputeContract`. Transférer l'`owner` au Safe 2-of-3.
4. **Tests de fumée** sur le nouveau escrow (testnet d'abord, puis 1
   micro-commande intra réelle en mainnet : create → fund → ship →
   auto-release).

## 3. Fenêtre de drain — choisir une option

### Option A (recommandée, volume faible) — fenêtre de maintenance
1. **Geler la création de nouvelles commandes** côté off-chain : le
   frontend/backend cesse d'émettre des `createOrderWithItems` vers
   l'ancien escrow (bannière « maintenance commandes »). Les commandes
   déjà financées continuent leur cycle normalement (l'ancien escrow n'est
   **pas** mis en pause — `emergencyPause` bloquerait aussi les
   releases/refunds).
2. **Laisser drainer** : sur ~7-10 jours, les commandes en vol atteignent
   un état terminal — auto-release intra (3j), auto-refund inactivité
   (7j), résolution de litiges (N1/N2, N3 jusqu'à 14j). Suivre la liste
   de drain jusqu'à `totalEscrowedAmount == 0`.
3. **Traiter les traînards** (cf. §4) jusqu'à 0.
4. **Bascule** : re-pointer `EtaloDispute.setEscrow(newEscrow)` +
   `EtaloStake.setEscrowContract(newEscrow)` ; `Reputation.setAuthorizedCaller(newEscrow, true)`
   (laisser l'ancien autorisé tant que des reputations résiduelles
   tombent, puis le retirer). Repointer les **adresses off-chain** (§5).
5. **Reprendre l'intake** sur le nouveau escrow.

> Coût : pas de *nouvelles* commandes pendant ~1-2 semaines. Acceptable au
> stade lancement (faible trafic).

### Option B (zéro-downtime) — cluster parallèle
Si une fenêtre est inacceptable : déployer **un nouveau Dispute (+ Voting)**
visant le nouvel escrow, garder l'ancien Dispute pour les litiges des
anciennes commandes. Les deux clusters tournent en parallèle ; Reputation
(multi-caller) est partagé → **continuité réputation**. Stake étant dormant
en V1 intra, rien à dupliquer côté stake.

> Coût : 2 déploiements de plus (Dispute + Voting) et l'indexer doit suivre
> deux clusters. Plus de pièces mobiles → réservé si le downtime de
> l'option A est vraiment bloquant.

## 4. Traînards (commandes qui ne se soldent pas seules)

| Cas | Sortie |
|---|---|
| **Litige ouvert** (item Disputed) | Doit être résolu sur l'**ancien** Dispute avant la bascule (option A) ou continue sur l'ancien cluster (option B). Bloque l'auto-refund (ADR-031). |
| **Multi-item partiellement expédié puis abandonné** (items Pending) | L'auto-refund order-level est bloqué (statut ≠ Funded). Recours : l'acheteur **ouvre un litige** sur l'item Pending → résolution → remboursement (cf. lead audit). À déclencher proactivement pour vider le drain. |
| **Jamais confirmé / jamais expédié** | Auto-release (3j) ou auto-refund (7j) permissionless — un keeper appelle `triggerAutoReleaseForItem` / `triggerAutoRefundIfInactive`. |
| **Dernier recours** | `forceRefund` exige `dispute == address(0)` : ne peut servir **qu'après** avoir dé-câblé Dispute de l'ancien escrow (`setDisputeContract(0)`) + 90j + legal hold. À éviter ; seulement pour un blocage réel post-drain. |

## 5. Bascule off-chain (atomique côté config)

- **Frontend (Vercel)** : `NEXT_PUBLIC_ESCROW_ADDRESS` → nouvelle adresse.
  (Vérifier aussi `NEXT_PUBLIC_DISPUTE_ADDRESS` si Dispute redéployé en
  option B.)
- **Backend/indexer (Fly)** : indexer la **nouvelle** adresse escrow ;
  garder l'**ancienne** indexée en parallèle jusqu'à drain complet (les
  events de solde des anciennes commandes doivent continuer à être
  mirrorés). Mettre à jour `ESCROW_ADDRESS` / config indexer.
- **Docs** : mettre à jour `CLAUDE.md` (Key addresses), `docs/DEPLOYMENTS_HISTORY.md`,
  `packages/contracts/deployments/celo-*.json` (`previous_deployments[]`).

## 6. Vérification post-bascule

- [ ] `totalEscrowedAmount` ancien escrow == 0 (drain complet)
- [ ] Nouveau escrow : 1 cycle réel intra create→fund→ship→release OK
- [ ] `createOrderWithItems(..., true)` revert `Cross-border disabled` ✓
- [ ] Cap acheteur : 6ᵉ commande (>2 500) revert `Buyer escrow cap` ✓
- [ ] Litige sur nouvelle commande : openDispute→résolution OK (Dispute bien re-pointé)
- [ ] Indexer mirror le nouveau escrow ; soldes crédits/commandes corrects
- [ ] Treasuries (commission/credits/community) reçoivent bien sur le nouveau contrat

## 7. Rollback

Tant que l'intake n'a pas repris sur le nouveau escrow, le rollback est
trivial : ré-autoriser l'intake sur l'ancien (il n'a jamais été mis en
pause) et re-pointer Dispute/Stake vers l'ancien. Après reprise sur le
nouveau, un rollback impliquerait un nouveau drain → préférer corriger en
avant (le nouveau contrat reste owner-Safe, `emergencyPause` disponible).

## 8. Pré-requis bloquants (rappel ADR-057)

1. **Re-audit** des 4 fixes (accounting custody) avant tout déploiement.
2. Valider `MAX_BUYER_ESCROW = 2 500 USDT` (décision produit).
3. Exécution **owner = Safe 2-of-3** pour tous les setters de bascule.
