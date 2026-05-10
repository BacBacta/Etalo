# Etalo Pricing Model — Asset Generator Credits

**Version** : 2.0 (V1 launch pivot per ADR-049)
**Date** : 23 avril 2026 (v1.0) · 2026-05-10 (v2.0 pivot)
**Auteur** : Mike (Etalo)
**Statut** : Spécification économique — source de vérité pour le développement asset generator

> **v2.0 changes (ADR-049)** : Pivot V1 — 1 crédit ne génère plus un
> pack de 5 images marketing. Il finance maintenant **un enhancement
> de photo produit** dans le flow d'add-product. Welcome bonus passe
> de 10 à 3 crédits ; monthly free retiré. Le pack 5 templates +
> captions reste dans le code pour V1.5+.

---

## 1. Résumé exécutif

Etalo monétise son asset generator (amélioration AI des photos produits) via un système de crédits. Le modèle est **simple, prévisible, sans abonnement**, conçu pour les vendeurs africains avec des revenus irréguliers qui préfèrent le pay-as-you-go.

### 1.1 Principe de base

- 1 crédit = 1 photo produit transformée en photo studio pro
- Crédits welcome gratuits, le reste payant à la demande
- Pas de tiers, pas de subscription
- Transparence totale sur la consommation

### 1.2 Objectif économique

Atteindre la rentabilité à partir de **200 vendeurs actifs mensuels** convertissant en moyenne 2 enhancements payants par mois. Marge unitaire ~99 % (coût compute ~$0.001 par enhancement, revenu $0.075).

---

## 2. Définition d'un crédit

### 2.1 Ce qu'un crédit achète (V1)

Un crédit consommé déclenche, pour une photo produit uploadée :

- **Suppression du background** via fal.ai birefnet/v2 — préserve le produit pixel-near-perfect (texte, logos, couleurs intacts)
- **Composition propre** sur fond blanc studio carré 2048×2048
- **Pinning IPFS** de la photo enhanced
- **Remplacement automatique** de la photo originale dans le produit (avec tracé `Product.enhanced_at`)
- Idempotence : si la même photo est ré-soumise pour le même produit, pas de double charge

### 2.2 Ce qu'un crédit n'achète pas (V1)

Reporté V1.5+ :
- Pack 5 templates marketing (IG square / IG story / WA status / TikTok / FB feed)
- Captions multilingues (en, sw, pidgin, fr)
- Hashtags recommandés par pays
- Short links trackables avec analytics

Reporté V2 :
- Génération de vidéos / GIFs
- Contenu long-form (articles, emails)
- Planning / scheduling automatique
- Multi-product bulk processing

### 2.3 Limite par crédit

- Un crédit = un enhancement = une photo produit. Pour polir 10 produits, il faut 10 crédits.
- Re-enhancement de la même photo originale (même IPFS hash) sur le même produit = **gratuit** (idempotence backend).
- Re-enhancement avec une nouvelle photo originale = nouveau crédit consommé.

---

## 3. Modèle de crédits

### 3.1 Crédits gratuits mensuels

**V1 : aucun.** Le monthly free pack a été retiré (ADR-049) pour
simplifier le modèle et éviter de subventionner les vendeurs dormants.
Reviendra peut-être en V1.5+ si retention data le justifie.

### 3.2 Bonus bienvenue

- **3 crédits bonus** à l'inscription du seller (= 3 enhancements gratuits)
- Granté lazy à la première lecture de balance / première action credit-aware
- Idempotent : un seller ne peut pas re-recevoir le welcome bonus
- Pas d'expiration définie en V1

### 3.3 Crédits payants

- **0.15 USDT par crédit** (prix unitaire, immutable smart contract ADR-014)
- **Minimum 1 crédit par achat** (le smart contract n'impose pas de minimum, le frontend peut suggérer des packs)
- Crédits achetés **n'expirent jamais**
- Utilisables sans limite temporelle

### 3.4 Paliers d'achat recommandés (V1 pivot)

Pas de discount officiel en V1, mais paliers d'achat courants pour le nouveau modèle "1 crédit = 1 enhancement" :

| Quantité | Prix USDT | Usage typique |
|---|---|---|
| 5 crédits | 0.75 | Test étendu, 5 produits polis |
| 10 crédits | 1.50 | Un mois d'activité catalogue moyen |
| 25 crédits | 3.75 | Vendeur actif, mise à jour catalogue |
| 50 crédits | 7.50 | Vendeur pro, réserve 2-3 mois |

---

## 4. Règles de consommation

### 4.1 Ordre de priorité (V1 pivot)

V1 simplifié : **un seul ledger** (`SellerCreditsLedger`). Toute action `consume_credits()` débite la balance globale (somme de tous les `credits_delta`). Pas de buckets séparés ni d'ordre prioritaire — l'historique est rejouable depuis les rows ledger pour distinguer welcome/purchase/consumption a posteriori.

### 4.2 Exemple de consommation

Un vendeur tout frais inscrit (V1) :

- **t=0** : welcome bonus granté → balance = 3
- **t+1h** : ajoute Produit A, click "Enhance · 1 credit" → balance = 2
- **t+2h** : ajoute Produit B, click "Enhance · 1 credit" → balance = 1
- **t+3h** : ajoute Produit C, click "Enhance · 1 credit" → balance = 0
- **t+4h** : ajoute Produit D, click "Enhance" → 402 Insufficient credits → modal "Buy 5 credits for 0.75 USDT"

### 4.3 Tracking on-chain vs off-chain

**Off-chain (backend) :**
- Balance crédits gratuits mensuelle
- Balance crédits bonus avec date d'expiration
- Balance crédits achetés

**On-chain :**
- Transactions d'achat de crédits (via contrat `EtaloCredits`)
- Vérifiables publiquement sur CeloScan
- Balance achetée reconstructible depuis les events

---

## 5. Flow d'achat de crédits

### 5.1 Parcours utilisateur

1. **Vendeur arrive sur son dashboard** et voit sa balance : "Credits : 2 free, 12 paid"
2. **Clique "Buy credits"** depuis le bouton dans le dashboard ou au moment où il manque de crédits
3. **Sélectionne un palier** (5, 20, 50, 100 crédits) ou montant custom (min 5)
4. **Prix affiché** : 20 crédits = 3.00 USDT
5. **Clique "Pay with MiniPay"**
6. **MiniPay signature** : transfert USDT vers contrat `EtaloCredits`
7. **Confirmation on-chain** : balance mise à jour immédiatement
8. **Retour au dashboard** avec nouveau total affiché

### 5.2 Contrat `EtaloCredits`

```solidity
contract EtaloCredits {
    IERC20 public immutable usdt;
    address public creditsTreasury;
    
    uint256 public constant PRICE_PER_CREDIT = 150_000;  // 0.15 USDT (6 decimals)
    uint256 public constant MIN_PURCHASE = 5;
    
    mapping(address => uint256) public purchasedCredits;
    
    event CreditsPurchased(
        address indexed buyer,
        uint256 amount,
        uint256 totalCost,
        uint256 timestamp
    );
    
    function purchaseCredits(uint256 amount) external {
        require(amount >= MIN_PURCHASE, "Minimum 5 credits");
        uint256 cost = amount * PRICE_PER_CREDIT;
        usdt.transferFrom(msg.sender, creditsTreasury, cost);
        purchasedCredits[msg.sender] += amount;
        emit CreditsPurchased(msg.sender, amount, cost, block.timestamp);
    }
}
```

### 5.3 Consommation de crédits

La consommation elle-même est **off-chain** (backend) pour éviter les gas fees à chaque génération :

- Le backend vérifie les balances
- Pioche dans l'ordre de priorité (section 4.1)
- Déduit le crédit et lance la génération
- Audit trail dans la table `credit_usage`

**Pourquoi off-chain** : une génération coûte 0.15 USDT de revenue. Un gas fee Celo de 0.01 USDT mangerait déjà 6% de marge. Mieux vaut tracker off-chain et sync on-chain uniquement pour les achats.

---

## 6. Projections économiques

### 6.1 Hypothèses

**Coût de génération par crédit** (estimation) :
- API Claude / GPT : ~0.03 USDT
- Stockage IPFS : ~0.005 USDT
- Bandwidth et serveurs : ~0.002 USDT
- **Total coût direct** : ~0.037 USDT par crédit

**Prix de vente** : 0.15 USDT

**Marge brute par crédit payant** : 0.113 USDT (75% de marge)

**Marge sur crédits gratuits** : négative (-0.037 USDT par crédit consommé)

### 6.2 Break-even par vendeur

Un vendeur consomme en moyenne :
- 5 crédits gratuits/mois (coût pour Etalo : 0.185 USDT)
- X crédits achetés/mois

Pour qu'un vendeur soit rentable individuellement, il faut qu'il achète au moins :

```
0.185 USDT / 0.113 USDT par crédit payé = 1.64 crédits payés/mois minimum
```

**Un vendeur qui achète 2 crédits/mois (soit 0.30 USDT) est rentable.**

### 6.3 Scénarios de croissance

**Scénario minimal — 200 vendeurs actifs**

- Revenus : 200 × 2 crédits × 0.15 USDT = 60 USDT/mois
- Coûts gratuits : 200 × 5 × 0.037 USDT = 37 USDT/mois
- Coûts payants : 200 × 2 × 0.037 USDT = 14.8 USDT/mois
- **Marge nette** : 60 - 37 - 14.8 = 8.2 USDT/mois

**À 200 vendeurs avec 2 crédits payants moyens, Etalo fait à peine du break-even sur l'asset generator.**

**Scénario moyen — 500 vendeurs actifs**

- Revenus : 500 × 4 crédits × 0.15 USDT = 300 USDT/mois
- Coûts gratuits : 500 × 5 × 0.037 USDT = 92.5 USDT/mois
- Coûts payants : 500 × 4 × 0.037 USDT = 74 USDT/mois
- **Marge nette** : 300 - 92.5 - 74 = 133.5 USDT/mois

**Scénario optimiste — 2 000 vendeurs actifs**

- Revenus : 2000 × 6 crédits × 0.15 USDT = 1 800 USDT/mois
- Coûts gratuits : 2000 × 5 × 0.037 USDT = 370 USDT/mois
- Coûts payants : 2000 × 6 × 0.037 USDT = 444 USDT/mois
- **Marge nette** : 1800 - 370 - 444 = 986 USDT/mois

### 6.4 Sensibilité aux coûts

Si le coût par crédit passe de 0.037 USDT à 0.06 USDT (fluctuations API) :

- Marge par crédit payé : 0.09 USDT au lieu de 0.113
- Break-even passe à 2.1 crédits payés/mois par vendeur

Le modèle reste viable mais la rentabilité vient plus lentement.

---

## 7. Architecture treasury pour les crédits

### 7.1 Séparation des revenus

Les ventes de crédits vont dans un wallet **distinct** des commissions escrow :

- `commissionTreasury` : reçoit les 1.8%/2.7% des orders escrow
- `creditsTreasury` : reçoit les achats de crédits (0.15 USDT × quantité)

### 7.2 Raisons de la séparation

- **Clarté comptable** : revenus escrow vs revenus SaaS clairement distingués
- **Stratégie différente** : les commissions financent le développement escrow, les crédits financent l'asset generator et les coûts API
- **Reporting simplifié** : chaque source de revenus a son historique propre

### 7.3 Mise à jour d'adresse

Les deux treasuries ont leurs setters dédiés avec events :

```solidity
function setCreditsTreasury(address _new) external onlyOwner;
event CreditsTreasuryUpdated(address indexed old, address indexed new_);
```

Changement rare, mais possible pour migration vers multisig futur.

---

## 8. Logique d'expiration et de renouvellement

### 8.1 Crédits gratuits mensuels

- **Renouvellement** : 5 crédits déposés le 1er de chaque mois à 00:00 UTC
- **Expiration** : les crédits non utilisés expirent le dernier jour du mois à 23:59 UTC
- **Pas de report** : peu importe l'usage du mois précédent, on repart à 5

### 8.2 Crédits bonus bienvenue

- **Dépôt** : 10 crédits le jour de l'inscription
- **Expiration** : 6 mois après l'inscription si non consommés
- **Notification** : email/push à 5 mois et 5 mois 3 semaines si reste des crédits bonus

### 8.3 Crédits achetés

- **Pas d'expiration** : les crédits achetés sont permanents tant que le compte vendeur existe
- **En cas de suppression du compte** : les crédits sont perdus (communiqué clairement dans l'UI)

### 8.4 Récap visuel dans l'UI

```
┌────────────────────────────────────┐
│  Vos crédits asset generator       │
│                                    │
│  🆓 3/5 crédits gratuits (octobre) │
│     Expire le 31 octobre           │
│                                    │
│  🎁 7/10 crédits bonus             │
│     Expire le 15 avril 2027        │
│                                    │
│  💎 12 crédits achetés             │
│     Permanents                     │
│                                    │
│  ─────────────────────             │
│  Total disponible : 22 crédits     │
│                                    │
│  [Acheter plus de crédits]         │
└────────────────────────────────────┘
```

---

## 9. Cas limites et règles strictes

### 9.1 Comptes inactifs

- Vendeur inactif 3+ mois : notifications rappel
- Vendeur inactif 6+ mois : crédits gratuits mensuels suspendus
- Vendeur inactif 12+ mois : compte archivé, crédits achetés préservés mais demande de réactivation requise

### 9.2 Échec de génération

Si la génération échoue pour cause technique (API indisponible, timeout) :

- **Le crédit n'est PAS consommé**
- Message d'erreur clair au vendeur
- Retry automatique jusqu'à 3 tentatives
- Au-delà : remboursement du crédit et suggestion de réessayer plus tard

### 9.3 Contenu refusé par modération

Si un produit ne peut être généré à cause de modération (contenu inapproprié, nudité, etc.) :

- **Le crédit est consommé** (coût engagé côté API et temps serveur)
- Message explicite au vendeur avec raison du refus
- Guidelines communautaires clairement liées

### 9.4 Doublons

Deux générations pour le même produit le même jour :

- **2 crédits consommés** (chaque génération est indépendante)
- Le vendeur voit un warning avant la 2e génération : "You already generated assets for this product today. Continue?"
- Permet de refuser pour économiser

### 9.5 Crédits en cas de bannissement

Vendeur banni pour fraude :
- Crédits gratuits et bonus : confisqués
- Crédits achetés : **gelés** (pas remboursables, pas utilisables)
- Exception : erreur de bannissement confirmée, crédits achetés remboursés

---

## 10. Communication et transparence

### 10.1 Dashboard vendeur

- Balance totale visible en permanence
- Historique des générations (timestamp, produit, source du crédit)
- Historique des achats (lien transaction CeloScan)
- Alerte si < 3 crédits disponibles pour inciter l'achat

### 10.2 Pricing page publique

Page `/pricing` sur le site Etalo expliquant :
- Principes du modèle crédits
- Prix unitaire (0.15 USDT)
- Crédits gratuits et bonus
- FAQ sur les règles de consommation et d'expiration
- Paliers d'achat recommandés

### 10.3 Absence d'abonnement

Message explicite sur la landing et le dashboard :

> "Pas d'abonnement chez Etalo. Vous payez uniquement quand vous utilisez. Et si vous êtes occupé ce mois-ci, vos crédits achetés vous attendent. Pas de stress."

Ce positionnement différencie Etalo des plateformes comme Buffer, Hootsuite, ou Canva Pro qui facturent mensuellement même en cas d'inactivité.

---

## 11. Évolution future

### 11.1 V1.5 — Ajouts possibles (juillet-août 2026)

- Génération de vidéos courtes (1 crédit = 1 vidéo 15s) à 0.50 USDT/crédit
- Pack de 3 templates différents par produit (1 crédit unique, 3 variations)
- Génération de bannières web pour les boutiques Etalo

### 11.2 V2 — Évolutions post-traction (Q3 2026+)

- Scheduling et publication automatique (nouveau module monétisé séparément)
- Analytics sur performance des contenus générés
- API publique pour intégrations tierces (Canva, Figma)
- Tiers vendeurs pro avec discount volume (ex: 20% à partir de 500 crédits achetés)

### 11.3 Critères pour évoluer le pricing

Le modèle V1 sera réévalué si :
- Moins de 1.5 crédits payés en moyenne par vendeur actif (signal : prix trop élevé ou valeur insuffisante)
- Coût API qui monte au-dessus de 0.06 USDT par crédit (menace sur la marge)
- Concurrence avec des outils similaires à prix agressifs qui captent les early adopters

---

## 12. Documents liés

- `docs/VISION_V1_BOUTIQUE.md` : vision produit complète
- `docs/SPEC_SMART_CONTRACT_V2.md` : spec technique des contrats
- `docs/DECISIONS.md` : ADRs justifiant les choix
- `docs/ARCHITECTURE.md` : architecture technique globale

---

**Ce document est la référence pricing. Toute modification des montants ou règles doit être documentée dans un ADR dans `docs/DECISIONS.md`.**
